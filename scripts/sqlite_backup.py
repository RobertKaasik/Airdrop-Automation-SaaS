"""Create and verify a consistent SQLite backup without replacing files.

This helper uses SQLite's online backup API, so committed WAL data is included
in a consistent snapshot.  It refuses to overwrite an existing destination and
never deletes the source, destination, WAL, or SHM files.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


ALLOWED_SUFFIXES = {".db", ".sqlite", ".sqlite3"}


def validated_database_path(raw_path: str, *, must_exist: bool) -> Path:
    path = Path(raw_path).expanduser().resolve()
    if path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise ValueError("SQLite path must end in .db, .sqlite, or .sqlite3")
    if must_exist:
        if not path.exists():
            raise ValueError(f"SQLite database does not exist: {path}")
        if not path.is_file():
            raise ValueError(f"SQLite database is not a file: {path}")
    return path


def open_read_only(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True, timeout=30)


def verify_connection(connection: sqlite3.Connection) -> None:
    rows = connection.execute("PRAGMA integrity_check").fetchall()
    results = [str(row[0]) for row in rows]
    if results != ["ok"]:
        summary = "; ".join(results[:10]) or "no integrity_check result"
        raise RuntimeError(f"SQLite integrity_check failed: {summary}")


def verify_database(path: Path) -> None:
    connection = open_read_only(path)
    try:
        verify_connection(connection)
    finally:
        connection.close()


def create_backup(source: Path, destination: Path) -> None:
    if source == destination:
        raise ValueError("Backup destination must differ from the source database")
    if destination.exists():
        raise ValueError(f"Backup destination already exists: {destination}")
    if not destination.parent.exists() or not destination.parent.is_dir():
        raise ValueError(f"Backup destination directory does not exist: {destination.parent}")

    source_connection = open_read_only(source)
    try:
        verify_connection(source_connection)
        destination_connection = sqlite3.connect(str(destination), timeout=30)
        try:
            source_connection.backup(destination_connection, pages=256, sleep=0.05)
            destination_connection.commit()
            verify_connection(destination_connection)
        finally:
            destination_connection.close()
    finally:
        source_connection.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--source", help="Existing SQLite database to back up")
    mode.add_argument("--check-only", help="Existing SQLite database to verify read-only")
    parser.add_argument("--destination", help="New backup path; existing files are never overwritten")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.check_only:
            if args.destination:
                raise ValueError("--destination is not valid with --check-only")
            database = validated_database_path(args.check_only, must_exist=True)
            verify_database(database)
            print(json.dumps({"status": "ok", "checked": str(database)}))
            return 0

        if not args.destination:
            raise ValueError("--destination is required with --source")
        source = validated_database_path(args.source, must_exist=True)
        destination = validated_database_path(args.destination, must_exist=False)
        create_backup(source, destination)
        print(json.dumps({"status": "ok", "source": str(source), "backup": str(destination)}))
        return 0
    except (OSError, sqlite3.Error, RuntimeError, ValueError) as error:
        print(f"SQLite backup error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
