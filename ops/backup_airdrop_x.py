#!/usr/bin/env python3
"""Create a consistent, root-only backup of AIRDROP-X production data.

The application uses SQLite in WAL mode.  Copying the database file directly
can produce an inconsistent snapshot, so this script uses SQLite's backup API
before adding it to an archive.  The archive also contains the production
environment file, which is needed for a genuine recovery and therefore stays
root-readable only.
"""

from __future__ import annotations

import json
import os
import sqlite3
import tarfile
import tempfile
import time
from pathlib import Path


APP_DIR = Path("/srv/airdrop-x")
DATABASE_FILE = APP_DIR / "airdrop_x.db"
ENV_FILE = APP_DIR / ".env"
BACKUP_DIR = Path("/var/backups/airdrop-x")
KEEP_DAYS = 21


def prune_old_backups() -> None:
    cutoff = time.time() - (KEEP_DAYS * 24 * 60 * 60)
    for archive in BACKUP_DIR.glob("airdrop-x-*.tar.gz"):
        if archive.stat().st_mtime < cutoff:
            archive.unlink()


def main() -> None:
    if not DATABASE_FILE.is_file() or not ENV_FILE.is_file():
        raise SystemExit("AIRDROP-X database or environment file is missing")

    BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(BACKUP_DIR, 0o700)
    timestamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    archive = BACKUP_DIR / f"airdrop-x-{timestamp}.tar.gz"

    with tempfile.TemporaryDirectory(prefix="airdrop-x-backup-") as temporary_dir:
        temp_path = Path(temporary_dir)
        database_snapshot = temp_path / "airdrop_x.db"
        source = sqlite3.connect(f"file:{DATABASE_FILE}?mode=ro", uri=True)
        destination = sqlite3.connect(database_snapshot)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()

        manifest = temp_path / "manifest.json"
        manifest.write_text(json.dumps({
            "created_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "database": "airdrop_x.db",
            "contains": ["database", "environment"],
            "restore_note": "Restore only on a trusted host; archive contains production secrets.",
        }, indent=2) + "\n", encoding="utf-8")
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(database_snapshot, arcname="data/airdrop_x.db")
            tar.add(ENV_FILE, arcname="config/.env")
            tar.add(manifest, arcname="manifest.json")

    os.chmod(archive, 0o600)
    prune_old_backups()
    print(f"AIRDROP-X backup created: {archive.name}")


if __name__ == "__main__":
    main()
