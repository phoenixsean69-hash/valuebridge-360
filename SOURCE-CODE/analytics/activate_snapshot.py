"""Validate and reactivate one retained dashboard snapshot by its identifier."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from snapshot_store import atomic_write_pointer, pointer_path_for, validate_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_id")
    args = parser.parse_args()
    project_root = Path(__file__).resolve().parents[1]
    data_root = project_root / "analytics-data"
    snapshot_root = data_root / "snapshots"
    target = snapshot_root / args.snapshot_id
    if not target.is_dir():
        raise FileNotFoundError(f"Snapshot not found: {args.snapshot_id}")
    validate_snapshot(target, project_root)
    pointer = pointer_path_for(data_root, project_root)
    atomic_write_pointer(pointer, args.snapshot_id)
    print(f"Activated validated snapshot {args.snapshot_id}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"SNAPSHOT ACTIVATION FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
