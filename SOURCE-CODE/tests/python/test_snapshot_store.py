from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "analytics"))
from snapshot_store import CONTRACT_FILES, atomic_write_pointer, pointer_path_for, publication_lock, recover_pointer, resolve_current_snapshot
import export_dashboard


def make_snapshot(root: Path, snapshot_id: str) -> Path:
    directory = root / snapshot_id
    directory.mkdir(parents=True)
    for filename in CONTRACT_FILES:
        value = {"schema_version": "1.0.0"}
        if filename == "manifest.json": value.update({"snapshot_id": snapshot_id, "validation_status": "PASS"})
        (directory / filename).write_text(json.dumps(value), encoding="utf-8")
    return directory


class SnapshotStoreTests(unittest.TestCase):
    def test_pointer_switch_and_previous_pointer_recovery(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); snapshots = root / "snapshots"; snapshots.mkdir()
            pointer = root / "analytics" / "current-snapshot.json"
            make_snapshot(snapshots, "snapshot-a"); make_snapshot(snapshots, "snapshot-b")
            atomic_write_pointer(pointer, "snapshot-a", preserve_previous=False)
            atomic_write_pointer(pointer, "snapshot-b")
            pointer.write_text('{broken', encoding="utf-8")
            snapshot_id, directory, used_previous = resolve_current_snapshot(snapshots, pointer)
            self.assertEqual(snapshot_id, "snapshot-a")
            self.assertTrue(directory.is_dir())
            self.assertTrue(used_previous)
            self.assertEqual(recover_pointer(snapshots, pointer), "snapshot-a")
            self.assertEqual(json.loads(pointer.read_text(encoding="utf-8"))["snapshot_id"], "snapshot-a")

    def test_rejects_pointer_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(ValueError):
                atomic_write_pointer(Path(temporary) / "current.json", "../outside")

    def test_exclusive_publisher_lock_rejects_second_publisher(self):
        with tempfile.TemporaryDirectory() as temporary:
            with publication_lock(Path(temporary) / "publisher.lock"):
                with self.assertRaises(RuntimeError):
                    with publication_lock(Path(temporary) / "publisher.lock"):
                        pass

    def test_validation_failure_keeps_previous_snapshot_active(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); output = root / "analytics-data"; snapshots = output / "snapshots"
            snapshots.mkdir(parents=True); old_id = "known-good"
            make_snapshot(snapshots, old_id)
            project_root = Path(export_dashboard.__file__).resolve().parents[1]
            pointer = pointer_path_for(output, project_root)
            atomic_write_pointer(pointer, old_id, preserve_previous=False)
            (output / "staff_action_queue.json").write_text('{"schema_version":"1.0.0","data_source":"synthetic","actions":[]}', encoding="utf-8")
            with mock.patch.object(export_dashboard, "prepare_transactions", return_value=object()), \
                 mock.patch.object(export_dashboard, "_build_documents", return_value=({"dashboard_summary.json": {}}, {})), \
                 mock.patch.object(export_dashboard, "validate_snapshot", side_effect=RuntimeError("injected validation failure")):
                with self.assertRaisesRegex(RuntimeError, "injected validation failure"):
                    export_dashboard.export(root / "unused.csv", output, 100, 10)
            active_id, _, _ = resolve_current_snapshot(snapshots, pointer)
            self.assertEqual(active_id, old_id)
            self.assertFalse(any(path.name.startswith(".staging-") for path in snapshots.iterdir()))


if __name__ == "__main__": unittest.main()
