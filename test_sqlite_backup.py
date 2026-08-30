"""Tests the SQLite backup tools exclusively against temporary databases."""

from __future__ import annotations

import shutil
import sqlite3
import subprocess
import sys
import unittest
import uuid
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
BACKUP_SCRIPT = PROJECT_ROOT / "scripts" / "backup_sqlite.ps1"
HELPER_SCRIPT = PROJECT_ROOT / "scripts" / "sqlite_backup.py"
TEST_TEMP_ROOT = PROJECT_ROOT / ".integration-test-artifacts"


class SqliteBackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)

    def make_test_directory(self, prefix: str) -> Path:
        # pathlib keeps the workspace's inherited ACL on Windows. Python's
        # TemporaryDirectory applies a private ACL that is incompatible with
        # the managed Codex sandbox used by this project.
        root = TEST_TEMP_ROOT / f"{prefix}{uuid.uuid4().hex}"
        root.mkdir()
        self.addCleanup(shutil.rmtree, root, True)
        return root

    def test_python_helper_creates_verified_copy_and_refuses_overwrite(self):
        root = self.make_test_directory("airdrop-x-backup-test-")
        source = root / "source.db"
        backup = root / "backup.sqlite3"
        connection = sqlite3.connect(source)
        connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        connection.executemany("INSERT INTO sample(value) VALUES (?)", [("one",), ("two",)])
        connection.commit()
        connection.close()

        first = subprocess.run(
            [sys.executable, str(HELPER_SCRIPT), "--source", str(source), "--destination", str(backup)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(first.returncode, 0, first.stderr)
        with sqlite3.connect(backup) as restored:
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(restored.execute("SELECT COUNT(*) FROM sample").fetchone()[0], 2)

        second = subprocess.run(
            [sys.executable, str(HELPER_SCRIPT), "--source", str(source), "--destination", str(backup)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(second.returncode, 0)
        self.assertIn("already exists", second.stderr)

    def test_powershell_wrapper_captures_committed_wal_and_writes_hash(self):
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if not powershell:
            self.skipTest("PowerShell is unavailable")

        root = self.make_test_directory("airdrop-x-backup-ps-test-")
        source = root / "source.db"
        destination = root / "backups"
        connection = sqlite3.connect(source)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        connection.executemany(
            "INSERT INTO sample(value) VALUES (?)",
            [("one",), ("two",), ("committed-in-wal",)],
        )
        connection.commit()
        try:
            result = subprocess.run(
                [
                    powershell,
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(BACKUP_SCRIPT),
                    "-DatabasePath",
                    str(source),
                    "-DestinationDirectory",
                    str(destination),
                    "-PythonExecutable",
                    sys.executable,
                ],
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            connection.close()

        self.assertEqual(result.returncode, 0, result.stderr)
        backups = list(destination.glob("*.sqlite3"))
        self.assertEqual(len(backups), 1)
        self.assertTrue(Path(f"{backups[0]}.sha256").is_file())
        with sqlite3.connect(backups[0]) as restored:
            self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(restored.execute("SELECT COUNT(*) FROM sample").fetchone()[0], 3)

    def test_integrity_check_mode_is_read_only_and_rejects_non_sqlite_suffix(self):
        root = self.make_test_directory("airdrop-x-check-test-")
        source = root / "source.db"
        with sqlite3.connect(source) as connection:
            connection.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")

        checked = subprocess.run(
            [sys.executable, str(HELPER_SCRIPT), "--check-only", str(source)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(checked.returncode, 0, checked.stderr)

        invalid = root / "not-a-database.txt"
        invalid.write_text("not sqlite", encoding="utf-8")
        rejected = subprocess.run(
            [sys.executable, str(HELPER_SCRIPT), "--check-only", str(invalid)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("must end", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
