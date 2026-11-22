"""Immutable local analytics snapshots with an atomic, recoverable pointer."""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SNAPSHOT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
CONTRACT_FILES = (
    "manifest.json", "dashboard_summary.json", "customer_segments.json", "retention_risk.json",
    "product_opportunities.json", "opportunity_rankings.json", "segment_migration.json", "alerts.json",
    "model_performance.json", "staff_action_queue.json",
)


def pointer_path_for(output: Path, project_root: Path) -> Path:
    output = output.resolve()
    expected = (project_root / "analytics-data").resolve()
    return project_root / "analytics" / "current-snapshot.json" if output == expected else output.parent / f".{output.name}.current-snapshot.json"


def pointer_document(snapshot_id: str) -> dict:
    if not SNAPSHOT_ID.fullmatch(snapshot_id):
        raise ValueError("Snapshot ID contains unsupported characters")
    return {"schema_version": "1.0.0", "snapshot_id": snapshot_id}


def atomic_write_pointer(pointer: Path, snapshot_id: str, *, preserve_previous: bool = True) -> None:
    """Replace one small same-volume file; readers see the old or new complete pointer."""
    pointer.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(pointer_document(snapshot_id), separators=(",", ":")) + "\n").encode("utf-8")
    nonce = uuid.uuid4().hex
    temporary = pointer.with_name(f".{pointer.name}.{nonce}.tmp")
    previous = pointer.with_name("current-snapshot.previous.json")
    backup_temporary = pointer.with_name(f".{previous.name}.{nonce}.tmp")
    try:
        if preserve_previous and pointer.is_file():
            with pointer.open("rb") as source, backup_temporary.open("xb") as backup:
                shutil.copyfileobj(source, backup)
                backup.flush()
                os.fsync(backup.fileno())
            os.replace(backup_temporary, previous)
        with temporary.open("xb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, pointer)
    finally:
        temporary.unlink(missing_ok=True)
        backup_temporary.unlink(missing_ok=True)


def _valid_snapshot(snapshot_root: Path, snapshot_id: str) -> bool:
    if not SNAPSHOT_ID.fullmatch(snapshot_id):
        return False
    directory = (snapshot_root / snapshot_id).resolve()
    try:
        directory.relative_to(snapshot_root.resolve())
        if not all((directory / name).is_file() for name in CONTRACT_FILES):
            return False
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        return manifest.get("snapshot_id") == snapshot_id and manifest.get("validation_status") == "PASS"
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def resolve_current_snapshot(snapshot_root: Path, pointer: Path) -> tuple[str, Path, bool]:
    """Return (id, directory, used_previous_pointer), recovering from bad current pointers."""
    for candidate, is_previous in ((pointer, False), (pointer.with_name("current-snapshot.previous.json"), True)):
        try:
            value = json.loads(candidate.read_text(encoding="utf-8"))
            snapshot_id = value.get("snapshot_id", "")
            if _valid_snapshot(snapshot_root, snapshot_id):
                return snapshot_id, snapshot_root / snapshot_id, is_previous
        except (OSError, ValueError, json.JSONDecodeError):
            pass
    raise FileNotFoundError("No valid current or previous analytics snapshot is available")


@contextmanager
def publication_lock(lock_path: Path) -> Iterator[None]:
    """Exclusive OS file lock; the OS releases it automatically if the process exits."""
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    stream = lock_path.open("a+b")
    try:
        if lock_path.stat().st_size == 0:
            stream.write(b"\0")
            stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt
            try:
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise RuntimeError("Another analytics publisher is already running") from exc
        else:
            import fcntl
            try:
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as exc:
                raise RuntimeError("Another analytics publisher is already running") from exc
        try:
            stream.seek(0)
            stream.write(str(os.getpid()).encode("ascii").ljust(32, b" "))
            stream.flush()
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
    finally:
        stream.close()


def recover_pointer(snapshot_root: Path, pointer: Path) -> str:
    """Use previous pointer if current is corrupt or targets a missing snapshot."""
    try:
        snapshot_id, _, used_previous = resolve_current_snapshot(snapshot_root, pointer)
        if used_previous:
            atomic_write_pointer(pointer, snapshot_id, preserve_previous=False)
        return snapshot_id
    except FileNotFoundError:
        raise


def validate_snapshot(directory: Path, project_root: Path) -> None:
    import subprocess
    env = os.environ.copy()
    env["VALUEBRIDGE_DATA_DIR"] = str(directory.resolve())
    validator = project_root / "analytics" / "validate_outputs.py"
    subprocess.run([sys.executable, str(validator)], cwd=project_root, env=env, check=True)


def initialize_from_legacy(output: Path, snapshot_root: Path, pointer: Path, project_root: Path) -> str:
    """Migrate the existing flat ten-file directory once, without changing its seed file."""
    try:
        return recover_pointer(snapshot_root, pointer)
    except FileNotFoundError:
        pass
    legacy_manifest = output / "manifest.json"
    if not legacy_manifest.is_file():
        raise FileNotFoundError("No validated snapshot or legacy analytics-data directory exists")
    manifest = json.loads(legacy_manifest.read_text(encoding="utf-8"))
    snapshot_id = manifest.get("snapshot_id") or f"legacy-{uuid.uuid4().hex}"
    pointer_document(snapshot_id)
    snapshot_root.mkdir(parents=True, exist_ok=True)
    target = snapshot_root / snapshot_id
    if not target.exists():
        stage = snapshot_root / f".staging-legacy-{uuid.uuid4().hex}"
        stage.mkdir()
        try:
            for name in CONTRACT_FILES:
                shutil.copy2(output / name, stage / name)
            validate_snapshot(stage, project_root)
            stage.rename(target)
        except Exception:
            shutil.rmtree(stage, ignore_errors=True)
            raise
    if not _valid_snapshot(snapshot_root, snapshot_id):
        raise ValueError("Legacy snapshot did not pass snapshot integrity checks")
    atomic_write_pointer(pointer, snapshot_id, preserve_previous=False)
    return snapshot_id
