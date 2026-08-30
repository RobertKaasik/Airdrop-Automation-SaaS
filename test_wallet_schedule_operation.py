"""Persist, validate, and PATCH wallet schedule operation parameters."""

from __future__ import annotations

import asyncio
import time
import unittest
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import server


READY = {
    "readiness_status": "ready",
    "checked_at": 1_700_000_000,
    "fingerprint": "readyfingerprint0000000000000001",
    "amount_mode": "fixed",
    "amount_for_balance": "0.02",
    "amount_for_quote": "0.02",
    "quote_preview": {"provider": "test", "amount_out": "1"},
    "blockers": [],
}


class WalletScheduleOperationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        server.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        now = int(time.time())
        self.user = server.User(
            username="schedule_owner",
            email="schedule-owner@example.invalid",
            password_hash="test-only",
            subscription_plan="Pro",
            subscription_activated_at=now,
        )
        self.wallet = server.Wallet(
            username=self.user.username,
            label="Main wallet",
            wallet_address="0x1234567890abcdef1234567890abcdef12345678",
            proxy="http://127.0.0.1:8080",
        )
        self.db.add_all((self.user, self.wallet))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def await_result(awaitable):
        return asyncio.run(awaitable)

    def payload(self, **overrides):
        data = {
            "action_type": "bridge",
            "day_of_week": "Mon",
            "time_of_day": "18:00",
            "timezone": "UTC",
            "enabled": True,
            "acknowledgement": True,
            "schedule_mode": "flexible",
            "weekly_min": 3,
            "weekly_max": 4,
            "window_start": "10:00",
            "window_end": "21:00",
        }
        data.update(overrides)
        return server.WalletActionScheduleRequest(**data)

    def test_draft_without_amount_can_be_saved_disabled(self) -> None:
        created = self.await_result(server.create_wallet_action_schedule(
            self.wallet.id,
            self.payload(enabled=False, acknowledgement=False),
            self.db,
            self.user,
        ))
        schedule = created["schedule"]
        self.assertEqual(schedule["amount_mode"], "fixed")
        self.assertFalse(schedule["enabled"])
        self.assertEqual(schedule["readiness_status"], "unknown")
        self.assertEqual(schedule["protocol"], "lifi")

    def test_enabled_save_requires_ready_amount(self) -> None:
        with self.assertRaises(HTTPException) as blocked:
            self.await_result(server.create_wallet_action_schedule(
                self.wallet.id,
                self.payload(),
                self.db,
                self.user,
            ))
        self.assertEqual(blocked.exception.status_code, 422)
        self.assertIn("amount", str(blocked.exception.detail).lower())

    @patch.object(server, "evaluate_schedule_readiness", return_value=READY)
    def test_create_and_patch_persist_amount_and_networks(self, _readiness) -> None:
        created = self.await_result(server.create_wallet_action_schedule(
            self.wallet.id,
            self.payload(
                amount_mode="random",
                amount_min="0.01",
                amount_max="0.03",
                from_network="Base",
                to_network="Arbitrum",
                from_token="0x0000000000000000000000000000000000000000",
            ),
            self.db,
            self.user,
        ))
        schedule = created["schedule"]
        self.assertEqual(schedule["amount_mode"], "random")
        self.assertEqual(schedule["amount_min"], "0.01")
        self.assertEqual(schedule["amount_max"], "0.03")
        self.assertIsNone(schedule["amount_fixed"])
        self.assertEqual(schedule["from_network"], "Base")
        self.assertEqual(schedule["to_network"], "Arbitrum")
        self.assertEqual(schedule["from_token"], server.LIFI_NATIVE_TOKEN_ADDRESS)
        self.assertEqual(schedule["protocol"], "lifi")
        self.assertEqual(schedule["readiness_status"], "ready")
        self.assertEqual(schedule["last_quote_fingerprint"], READY["fingerprint"])

        updated = self.await_result(server.update_wallet_action_schedule(
            self.wallet.id,
            schedule["id"],
            self.payload(
                action_type="dex",
                amount_mode="fixed",
                amount_fixed="0.02",
                from_network="Base",
                to_network="Base",
            ),
            self.db,
            self.user,
        ))
        patched = updated["schedule"]
        self.assertEqual(patched["action_type"], "dex")
        self.assertEqual(patched["amount_mode"], "fixed")
        self.assertEqual(patched["amount_fixed"], "0.02")
        self.assertIsNone(patched["amount_min"])
        self.assertIsNone(patched["amount_max"])
        self.assertEqual(patched["protocol"], "uniswap")
        self.assertEqual(patched["readiness_status"], "ready")

        listed = self.await_result(
            server.get_wallet_action_schedules(self.wallet.id, self.db, self.user)
        )
        self.assertEqual(listed["schedules"][0]["amount_fixed"], "0.02")

    def test_random_amount_requires_ordered_range(self) -> None:
        with self.assertRaises(HTTPException) as missing:
            self.await_result(server.create_wallet_action_schedule(
                self.wallet.id,
                self.payload(amount_mode="random"),
                self.db,
                self.user,
            ))
        self.assertEqual(missing.exception.status_code, 422)

        with self.assertRaises(HTTPException) as inverted:
            self.await_result(server.create_wallet_action_schedule(
                self.wallet.id,
                self.payload(amount_mode="random", amount_min="0.05", amount_max="0.01"),
                self.db,
                self.user,
            ))
        self.assertEqual(inverted.exception.status_code, 422)

    def test_bridge_rejects_identical_networks(self) -> None:
        schedule = server.WalletActionSchedule(
            username=self.user.username,
            wallet_id=self.wallet.id,
            action_type="bridge",
            day_of_week="Mon",
            time_of_day="18:00",
            timezone="UTC",
            enabled=False,
            telegram_enabled=True,
            acknowledgement=False,
            schedule_mode="flexible",
            weekly_min=3,
            weekly_max=4,
            window_start="10:00",
            window_end="21:00",
            created_at=int(time.time()),
            updated_at=int(time.time()),
        )
        with self.assertRaises(HTTPException) as same_network:
            server.apply_schedule_operation_fields(
                schedule,
                self.payload(
                    amount_mode="fixed",
                    amount_fixed="0.01",
                    from_network="Base",
                    to_network="Base",
                    enabled=False,
                    acknowledgement=False,
                ),
            )
        self.assertEqual(same_network.exception.status_code, 422)

    def test_sample_random_amount_stays_in_range(self) -> None:
        schedule = server.WalletActionSchedule(
            amount_mode="random",
            amount_min="1",
            amount_max="2",
        )
        samples = [Decimal(server.sample_schedule_amount(schedule)) for _ in range(20)]
        self.assertTrue(all(Decimal("1") <= value <= Decimal("2") for value in samples))
        self.assertEqual(server.sample_schedule_amount(
            server.WalletActionSchedule(amount_mode="fixed", amount_fixed="0.4")
        ), "0.4")

    def test_random_balance_uses_max_and_quote_uses_min(self) -> None:
        payload = self.payload(amount_mode="random", amount_min="0.01", amount_max="0.05")
        balance_amount, quote_amount, mode = server.schedule_amount_for_checks(payload)
        self.assertEqual(mode, "random")
        self.assertEqual(balance_amount, "0.05")
        self.assertEqual(quote_amount, "0.01")

    def test_evaluate_requires_amount_without_network_calls(self) -> None:
        readiness = server.evaluate_schedule_readiness(self.wallet, self.payload())
        self.assertEqual(readiness["readiness_status"], "unknown")
        self.assertEqual(readiness["blockers"][0]["code"], "amount_required")

    def test_validate_endpoint_returns_readiness_payload(self) -> None:
        result = self.await_result(server.validate_wallet_action_schedule(
            self.wallet.id,
            self.payload(enabled=False, acknowledgement=False),
            self.db,
            self.user,
        ))
        self.assertFalse(result["ready"])
        self.assertEqual(result["readiness_status"], "unknown")
        self.assertEqual(result["blockers"][0]["code"], "amount_required")

    def test_schedules_overview_lists_week_slots(self) -> None:
        now = int(time.time())
        schedule = server.WalletActionSchedule(
            username=self.user.username,
            wallet_id=self.wallet.id,
            action_type="dex",
            day_of_week="Wed",
            time_of_day="15:30",
            timezone="UTC",
            enabled=True,
            telegram_enabled=True,
            acknowledgement=True,
            schedule_mode="fixed",
            weekly_min=3,
            weekly_max=4,
            window_start="10:00",
            window_end="21:00",
            amount_mode="fixed",
            amount_fixed="0.01",
            from_network="Base",
            protocol="uniswap",
            readiness_status="ready",
            created_at=now,
            updated_at=now,
        )
        self.db.add(schedule)
        self.db.commit()

        overview = self.await_result(server.get_schedules_overview(self.db, self.user))
        self.assertEqual(len(overview["days"]), 7)
        self.assertTrue(overview["week_start"])
        self.assertTrue(overview["events"])
        event = overview["events"][0]
        self.assertEqual(event["action_type"], "dex")
        self.assertEqual(event["wallet_id"], self.wallet.id)
        self.assertEqual(event["schedule_id"], schedule.id)
        self.assertEqual(event["amount_summary"], "0.01")
        self.assertEqual(event["day"], "Wed")
        self.assertEqual(event["time"], "15:30")
        self.assertNotIn("calldata", event)
        self.assertNotIn("private_key", event)

    def test_slots_for_custom_schedule_map_to_week_dates(self) -> None:
        schedule = server.WalletActionSchedule(
            schedule_mode="custom",
            custom_slots='[{"day":"Fri","time":"19:00"}]',
            day_of_week="Mon",
            time_of_day="18:00",
            timezone="UTC",
        )
        local_now = __import__("datetime").datetime(2026, 8, 26, 12, 0, tzinfo=__import__("datetime").timezone.utc)
        slots = server.slots_for_schedule_overview(schedule, local_now)
        self.assertEqual(len(slots), 1)
        self.assertEqual(slots[0]["day"], "Fri")
        self.assertEqual(slots[0]["time"], "19:00")
        self.assertEqual(slots[0]["date"], "2026-08-28")


if __name__ == "__main__":
    unittest.main()
