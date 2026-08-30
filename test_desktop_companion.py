"""Safety tests for the keyless AIRDROP-X Desktop Companion contract."""

from __future__ import annotations

import asyncio
import time
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import server


def request(path: str) -> Request:
    return Request({
        "type": "http", "http_version": "1.1", "method": "POST", "scheme": "http",
        "path": path, "raw_path": path.encode("ascii"), "query_string": b"", "headers": [],
        "client": ("127.0.0.88", 51088), "server": ("127.0.0.1", 8000),
    })


class DesktopCompanionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        server.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        server.request_rate_limits.clear()
        now = int(time.time())
        self.user = server.User(
            username="companion_owner", email="companion-owner@example.invalid", password_hash="test-only",
            subscription_plan="Pro", subscription_activated_at=now,
        )
        self.wallet = server.Wallet(
            username=self.user.username, label="Main wallet", wallet_address="0x1234567890abcdef1234567890abcdef12345678", proxy="",
        )
        self.db.add_all((self.user, self.wallet))
        self.db.commit()
        self.schedule = server.WalletActionSchedule(
            username=self.user.username, wallet_id=self.wallet.id, action_type="bridge", day_of_week="Mon",
            time_of_day="18:00", timezone="Europe/Moscow", enabled=True, telegram_enabled=True,
            acknowledgement=True, schedule_mode="fixed", weekly_min=3, weekly_max=4,
            window_start="10:00", window_end="21:00", generated_week=None, generated_slots=None,
            custom_slots=None, last_sent_slot=None, created_at=now, updated_at=now,
        )
        self.db.add(self.schedule)
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        server.request_rate_limits.clear()

    @staticmethod
    def await_result(awaitable):
        return asyncio.run(awaitable)

    def test_pairing_is_one_time_and_schedule_feed_has_no_full_address_or_signing_data(self) -> None:
        code_response = self.await_result(server.create_desktop_companion_pairing_code(
            request("/api/companion/pairing-code"), self.db, self.user,
        ))
        self.assertEqual(code_response["status"], "success")
        paired = self.await_result(server.pair_desktop_companion(
            server.DesktopCompanionPairRequest(code=code_response["code"]),
            request("/api/companion/pair"), self.db,
        ))
        token = paired["companion_token"]
        self.assertTrue(token.startswith("axc_"))
        self.assertIn("schedule_read", paired["capabilities"])
        self.assertNotIn("sign", " ".join(paired["capabilities"]))

        with self.assertRaises(HTTPException) as reused:
            self.await_result(server.pair_desktop_companion(
                server.DesktopCompanionPairRequest(code=code_response["code"]),
                request("/api/companion/pair"), self.db,
            ))
        self.assertEqual(reused.exception.status_code, 400)

        companion_user = server.get_desktop_companion_user(token, self.db)
        feed = self.await_result(server.get_desktop_companion_tasks(self.db, companion_user))
        self.assertEqual(len(feed["tasks"]), 1)
        self.assertEqual(feed["subscription"]["plan"], "Pro")
        self.assertEqual(feed["subscription"]["status"], "active")
        task = feed["tasks"][0]
        self.assertEqual(task["wallet_address"], "0x123456…345678")
        self.assertNotIn("private_key", task)
        self.assertNotIn("signature", task)
        self.assertNotIn("calldata", task)

        self.await_result(server.unpair_desktop_companion(token, self.db, companion_user))
        with self.assertRaises(HTTPException) as unpaired:
            server.get_desktop_companion_user(token, self.db)
        self.assertEqual(unpaired.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
