"""Isolated Telegram and wallet-boundary regression tests.

The suite uses an in-memory SQLite database. Telegram delivery, RPC calls,
wallet extensions, and transaction signing are never contacted.

Run with::

    python -m unittest -v test_telegram_wallet_backend.py
"""

from __future__ import annotations

import asyncio
import datetime as datetime_module
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from aiogram.enums import ChatType
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import server
import tg_bot
from telegram_locales import get_text


REAL_DATETIME = datetime_module.datetime


class FixedDateTime(REAL_DATETIME):
    current = REAL_DATETIME(2026, 8, 24, 12, 0, 30)

    @classmethod
    def now(cls, tz=None):
        if tz is None:
            return cls.current
        return cls.current.replace(tzinfo=datetime_module.timezone.utc).astimezone(tz)


def address(number: int) -> str:
    return "0x" + format(number, "040x")


class FakeTelegramMessage:
    def __init__(
        self,
        text: str,
        chat_id: int,
        *,
        language: str = "en",
        chat_type: ChatType = ChatType.PRIVATE,
    ) -> None:
        self.text = text
        self.chat = SimpleNamespace(id=chat_id, type=chat_type)
        self.from_user = SimpleNamespace(language_code=language, first_name="Tester")
        self.answers: list[tuple[str, dict]] = []

    async def answer(self, text: str, **kwargs) -> None:
        self.answers.append((text, kwargs))


class TelegramWalletBackendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        server.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )
        self.db = self.Session()
        now_ts = int(time.time())
        self.owner = server.User(
            username="telegram_owner",
            email="telegram-owner@example.invalid",
            password_hash="test-only",
            subscription_plan="Standard",
            subscription_activated_at=now_ts,
        )
        self.other = server.User(
            username="telegram_other",
            email="telegram-other@example.invalid",
            password_hash="test-only",
            subscription_plan="Standard",
            subscription_activated_at=now_ts,
        )
        self.db.add_all((self.owner, self.other))
        self.db.flush()
        self.owner_wallet = server.Wallet(
            username=self.owner.username,
            wallet_address=address(1),
            label="Owner wallet",
            proxy="socks5://user:pass@203.0.113.10:1080",
        )
        self.other_wallet = server.Wallet(
            username=self.other.username,
            wallet_address=address(2),
            label="Other wallet",
            proxy="socks5://user:pass@203.0.113.11:1080",
        )
        self.db.add_all((self.owner_wallet, self.other_wallet))
        self.db.commit()

    def tearDown(self) -> None:
        server.USER_SETTINGS_DB.pop(self.owner.username, None)
        server.USER_SETTINGS_DB.pop(self.other.username, None)
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def await_result(awaitable):
        return asyncio.run(awaitable)

    def assert_http_error(self, status_code: int, callback) -> HTTPException:
        with self.assertRaises(HTTPException) as caught:
            callback()
        self.assertEqual(caught.exception.status_code, status_code)
        return caught.exception

    def create_link(self, user: server.User, language: str = "en") -> dict:
        with (
            patch.object(server, "TELEGRAM_BOT_TOKEN", "test-token-never-used"),
            patch.object(server, "TELEGRAM_BOT_USERNAME", "airdrop_x_test_bot"),
        ):
            return server.create_telegram_link_code(
                server.TelegramLinkRequest(language=language),
                user,
                self.db,
            )

    def run_start(self, raw_code: str, chat_id: int, language: str = "en") -> FakeTelegramMessage:
        message = FakeTelegramMessage(f"/start {raw_code}", chat_id, language=language)
        with patch.object(tg_bot, "SessionLocal", self.Session):
            self.await_result(tg_bot.command_start_handler(message))
        return message

    def test_link_tokens_are_hashed_one_time_and_owner_bound(self) -> None:
        response = self.create_link(self.owner, "zh")
        raw_code = response["code"]
        self.assertIn(raw_code, response["bot_link"])

        row = self.db.query(server.TelegramLinkCode).one()
        self.assertNotEqual(row.code, raw_code)
        self.assertEqual(row.code, server.hash_secret(raw_code))
        self.assertEqual(row.username, self.owner.username)

        linked = self.run_start(raw_code, 700001, "ru")
        self.assertEqual(linked.answers[-1][0], get_text("zh", "linked", name="Tester"))
        self.db.expire_all()
        subscription = self.db.get(server.TelegramSubscription, self.owner.username)
        self.assertIsNotNone(subscription)
        self.assertEqual(subscription.chat_id, "700001")
        self.assertEqual(subscription.language, "zh")
        self.assertTrue(self.db.query(server.TelegramLinkCode).one().used)

        reused = self.run_start(raw_code, 700002)
        self.assertEqual(reused.answers[-1][0], get_text("en", "invalid_link"))
        self.db.expire_all()
        self.assertEqual(
            self.db.get(server.TelegramSubscription, self.owner.username).chat_id,
            "700001",
        )

    def test_new_code_revokes_previous_owner_code_without_touching_other_user(self) -> None:
        first = self.create_link(self.owner)
        other = self.create_link(self.other)
        replacement = self.create_link(self.owner)

        stored = {
            row.username: row.code
            for row in self.db.query(server.TelegramLinkCode).all()
        }
        self.assertEqual(stored[self.owner.username], server.hash_secret(replacement["code"]))
        self.assertEqual(stored[self.other.username], server.hash_secret(other["code"]))
        self.assertNotIn(server.hash_secret(first["code"]), stored.values())

    def test_expired_or_foreign_occupied_chat_cannot_be_linked(self) -> None:
        expired_raw = "expired-link-token"
        self.db.add(
            server.TelegramLinkCode(
                code=server.hash_secret(expired_raw),
                username=self.owner.username,
                language="en",
                expires_at=int(time.time()) - 1,
                used=False,
                created_at=int(time.time()) - 100,
            )
        )
        self.db.add(
            server.TelegramSubscription(
                username=self.other.username,
                chat_id="700003",
                language="en",
                linked_at=int(time.time()),
                updated_at=int(time.time()),
            )
        )
        self.db.commit()

        expired = self.run_start(expired_raw, 700004)
        self.assertEqual(expired.answers[-1][0], get_text("en", "invalid_link"))

        owner_link = self.create_link(self.owner)
        occupied = self.run_start(owner_link["code"], 700003)
        self.assertEqual(occupied.answers[-1][0], get_text("en", "chat_taken"))
        self.db.expire_all()
        code_row = self.db.get(server.TelegramLinkCode, server.hash_secret(owner_link["code"]))
        self.assertFalse(code_row.used)
        self.assertIsNone(self.db.get(server.TelegramSubscription, self.owner.username))

    def test_expired_account_cannot_finish_a_pending_link(self) -> None:
        response = self.create_link(self.owner)
        self.owner.subscription_activated_at = (
            int(time.time())
            - server.SUBSCRIPTION_DURATION_SECONDS
            - server.SUBSCRIPTION_GRACE_PERIOD_SECONDS
            - 60
        )
        self.db.commit()

        message = self.run_start(response["code"], 700005)
        self.assertEqual(message.answers[-1][0], get_text("en", "invalid_link"))
        self.db.expire_all()
        self.assertIsNone(self.db.get(server.TelegramSubscription, self.owner.username))
        self.assertTrue(
            self.db.get(server.TelegramLinkCode, server.hash_secret(response["code"])).used
        )

    def test_test_message_cooldown_applies_to_success_and_delivery_failure(self) -> None:
        now_ts = int(time.time())
        subscription = server.TelegramSubscription(
            username=self.owner.username,
            chat_id="700006",
            language="en",
            linked_at=now_ts,
            updated_at=now_ts,
        )
        self.db.add(subscription)
        self.db.commit()

        with patch.object(server, "send_telegram_notification", return_value=False) as sender:
            self.assert_http_error(
                502,
                lambda: server.send_telegram_test(self.owner, self.db),
            )
            self.assertEqual(sender.call_count, 1)

        self.db.expire_all()
        self.assertIsNotNone(
            self.db.get(server.TelegramSubscription, self.owner.username).last_test_at
        )
        with patch.object(server, "send_telegram_notification", return_value=True) as sender:
            self.assert_http_error(
                429,
                lambda: server.send_telegram_test(self.owner, self.db),
            )
            sender.assert_not_called()

        subscription = self.db.get(server.TelegramSubscription, self.owner.username)
        subscription.last_test_at = int(time.time()) - server.TELEGRAM_TEST_COOLDOWN_SECONDS - 1
        self.db.commit()
        with patch.object(server, "send_telegram_notification", return_value=True) as sender:
            self.assertEqual(server.send_telegram_test(self.owner, self.db), {"status": "success"})
            sender.assert_called_once()

    def test_settings_update_exact_notification_preferences_without_exposing_chat_id(self) -> None:
        now_ts = int(time.time())
        self.db.add(
            server.TelegramSubscription(
                username=self.owner.username,
                chat_id="700009",
                language="ru",
                linked_at=now_ts,
                updated_at=now_ts,
            )
        )
        self.db.commit()
        payload = server.ProfileSettingsRequest(
            username=self.owner.username,
            schedulerEnabled=False,
            days=[],
            schedule={},
            gwei=10,
            language="zh",
            notifyTransactionSubmitted=True,
            notifyTransactionFinal=False,
            notifyReminders=False,
            notifyErrors=True,
            notifyDefiSupplySubmitted=True,
            notifyDefiWithdrawSubmitted=True,
            notifyDefiFinal=True,
            notifyDefiErrors=False,
        )
        result = self.await_result(server.save_user_settings(payload, self.owner, self.db))
        self.assertEqual(result["status"], "success")

        status = server.telegram_status(self.owner, self.db)
        self.assertEqual(status["linked"], True)
        self.assertNotIn("chat_id", status)
        self.assertEqual(
            status["filters"],
            {
                "transactionSubmitted": True,
                "transactionFinal": False,
                "reminders": False,
                "errors": True,
                "defiSupplySubmitted": True,
                "defiWithdrawSubmitted": True,
                "defiFinal": True,
                "defiErrors": False,
            },
        )
        self.assertEqual(
            self.db.get(server.TelegramSubscription, self.owner.username).language,
            "zh",
        )

        foreign_payload = payload.model_copy(update={"username": self.other.username})
        self.assert_http_error(
            403,
            lambda: self.await_result(
                server.save_user_settings(foreign_payload, self.owner, self.db)
            ),
        )

    def test_group_chat_cannot_consume_link_and_unlink_is_chat_scoped(self) -> None:
        response = self.create_link(self.owner)
        group_message = FakeTelegramMessage(
            f"/start {response['code']}",
            700010,
            chat_type=ChatType.SUPERGROUP,
        )
        with patch.object(tg_bot, "SessionLocal", self.Session):
            self.await_result(tg_bot.command_start_handler(group_message))
        self.assertEqual(group_message.answers[-1][0], get_text("en", "private_only"))
        self.db.expire_all()
        self.assertFalse(
            self.db.get(server.TelegramLinkCode, server.hash_secret(response["code"])).used
        )

        self.run_start(response["code"], 700011)
        unlink = FakeTelegramMessage("/unlink", 700011)
        with patch.object(tg_bot, "SessionLocal", self.Session):
            self.await_result(tg_bot.unlink_handler(unlink))
        self.assertEqual(unlink.answers[-1][0], get_text("en", "unlinked"))
        self.db.expire_all()
        self.assertIsNone(self.db.get(server.TelegramSubscription, self.owner.username))

    def test_notification_preferences_gate_every_notification_family(self) -> None:
        now_ts = int(time.time())
        subscription = server.TelegramSubscription(
            username=self.owner.username,
            chat_id="700007",
            language="en",
            linked_at=now_ts,
            updated_at=now_ts,
            notify_transaction_submitted=False,
            notify_transaction_final=False,
            notify_errors=False,
            notify_defi_final=False,
            notify_defi_errors=False,
        )
        swap = server.BaseSwapRecord(
            username=self.owner.username,
            wallet_address=self.owner_wallet.wallet_address,
            amount_in="0.01",
            amount_out="20000000",
            tx_hash="0x" + "1" * 64,
            status="completed",
            created_at=now_ts,
        )
        defi = server.DefiOperationRecord(
            username=self.owner.username,
            wallet_address=self.owner_wallet.wallet_address,
            operation_type="supply",
            protocol="Aave V3",
            network="Base",
            asset_symbol="USDC",
            amount="10",
            tx_hash="0x" + "2" * 64,
            status="completed",
            created_at=now_ts,
        )
        bridge = server.UniversalBridgeRecord(
            username=self.owner.username,
            wallet_address=self.owner_wallet.wallet_address,
            from_network="Base",
            to_network="Arbitrum",
            from_symbol="ETH`unsafe",
            to_symbol="USDC",
            amount_in="0.01",
            amount_out="20",
            amount_out_min="19",
            provider="LI.FI",
            bridge="relay",
            tx_hash="0x" + "3" * 64,
            status="completed",
            provider_status="DONE`unsafe",
            created_at=now_ts,
            updated_at=now_ts,
        )

        with patch.object(server, "send_telegram_notification", return_value=True) as sender:
            self.assertFalse(server.notify_base_operation_status(subscription, swap))
            self.assertFalse(server.notify_defi_operation_status(subscription, defi))
            self.assertFalse(server.notify_universal_bridge_status(subscription, bridge))
            sender.assert_not_called()

            subscription.notify_transaction_final = True
            subscription.notify_defi_final = True
            self.assertTrue(server.notify_base_operation_status(subscription, swap))
            self.assertTrue(server.notify_defi_operation_status(subscription, defi))
            self.assertTrue(server.notify_universal_bridge_status(subscription, bridge))
            self.assertEqual(sender.call_count, 3)
            bridge_message = sender.call_args.args[1]
            self.assertIn(r"ETH\`unsafe", bridge_message)
            self.assertIn(r"DONE\`unsafe", bridge_message)

    def test_scheduler_retries_failed_deliveries_and_deduplicates_success(self) -> None:
        now_ts = int(time.time())
        self.db.add(
            server.TelegramSubscription(
                username=self.owner.username,
                chat_id="700008",
                language="en",
                linked_at=now_ts,
                updated_at=now_ts,
                notify_reminders=True,
            )
        )
        self.db.add(
            server.ActionReminder(
                username=self.owner.username,
                network="Base",
                day_of_week="Mon",
                time_of_day="12:00",
                enabled=True,
                telegram_enabled=True,
                updated_at=now_ts,
            )
        )
        self.db.add(
            server.WalletActionSchedule(
                username=self.owner.username,
                wallet_id=self.owner_wallet.id,
                action_type="dex",
                day_of_week="Mon",
                time_of_day="12:00",
                timezone="UTC",
                enabled=True,
                telegram_enabled=True,
                acknowledgement=True,
                schedule_mode="fixed",
                weekly_min=3,
                weekly_max=4,
                window_start="10:00",
                window_end="21:00",
                created_at=now_ts,
                updated_at=now_ts,
            )
        )
        self.db.commit()

        FixedDateTime.current = REAL_DATETIME(2026, 8, 24, 12, 0, 30)
        with (
            patch.object(server.datetime, "datetime", FixedDateTime),
            patch.object(server, "SessionLocal", self.Session),
            patch.object(server, "send_telegram_notification", return_value=False) as sender,
        ):
            self.await_result(server.run_scheduled_action_reminder_job())
            self.assertEqual(sender.call_count, 2)

        self.db.expire_all()
        reminder = self.db.query(server.ActionReminder).one()
        schedule = self.db.query(server.WalletActionSchedule).one()
        self.assertIsNone(reminder.last_sent_slot)
        self.assertIsNone(schedule.last_sent_slot)

        FixedDateTime.current = REAL_DATETIME(2026, 8, 24, 12, 1, 30)
        with (
            patch.object(server.datetime, "datetime", FixedDateTime),
            patch.object(server, "SessionLocal", self.Session),
            patch.object(server, "send_telegram_notification", return_value=True) as sender,
        ):
            self.await_result(server.run_scheduled_action_reminder_job())
            self.assertEqual(sender.call_count, 2)

        self.db.expire_all()
        reminder = self.db.query(server.ActionReminder).one()
        schedule = self.db.query(server.WalletActionSchedule).one()
        self.assertEqual(reminder.last_sent_slot, "2026-08-24 12:00")
        self.assertEqual(schedule.last_sent_slot, "2026-08-24 12:00|UTC")

        # A successful slot is idempotent even while it remains in the retry
        # window, so the next scheduler tick cannot duplicate the messages.
        FixedDateTime.current = REAL_DATETIME(2026, 8, 24, 12, 2, 30)
        with (
            patch.object(server.datetime, "datetime", FixedDateTime),
            patch.object(server, "SessionLocal", self.Session),
            patch.object(server, "send_telegram_notification", return_value=True) as sender,
        ):
            self.await_result(server.run_scheduled_action_reminder_job())
            sender.assert_not_called()

    def test_wallet_ownership_and_public_responses_do_not_expose_signing_authority(self) -> None:
        self.assert_http_error(
            403,
            lambda: self.await_result(
                server.get_wallets(self.other.username, self.db, self.owner)
            ),
        )
        self.assert_http_error(
            404,
            lambda: self.await_result(
                server.update_wallet(
                    self.other_wallet.id,
                    server.WalletUpdateRequest(label="stolen"),
                    self.db,
                    self.owner,
                )
            ),
        )
        self.assert_http_error(
            404,
            lambda: self.await_result(
                server.get_wallet_action_schedules(
                    self.other_wallet.id,
                    self.db,
                    self.owner,
                )
            ),
        )

        response = self.await_result(
            server.get_wallets(self.owner.username, self.db, self.owner)
        )
        wallet_payload = response["wallets"][0]
        self.assertEqual(wallet_payload["wallet_address"], self.owner_wallet.wallet_address)
        self.assertNotIn("proxy", wallet_payload)
        for forbidden in ("private_key", "seed", "mnemonic", "signature"):
            self.assertNotIn(forbidden, wallet_payload)

        error = self.assert_http_error(
            503,
            lambda: self.await_result(
                server.start_farming(
                    server.StartFarmReq(username=self.owner.username),
                    self.db,
                    self.owner,
                )
            ),
        )
        self.assertIn("sign", str(error.detail).lower())

        with patch.object(server, "WALLETCONNECT_PROJECT_ID", "public-project-id"):
            config = server.walletconnect_config(self.owner)
        self.assertEqual(config, {"project_id": "public-project-id", "chain_id": 8453})

        stored_columns = {
            column.name
            for model in (server.Wallet, server.TelegramLinkCode, server.TelegramSubscription)
            for column in model.__table__.columns
        }
        self.assertTrue(
            {"private_key", "seed", "mnemonic", "signature"}.isdisjoint(stored_columns)
        )

    def test_markdown_helpers_escape_untrusted_status_and_wallet_labels(self) -> None:
        self.assertEqual(
            server.escape_telegram_markdown_text(r"bad_*[`\name"),
            r"bad\_\*\[\`\\name",
        )
        self.assertEqual(
            server.escape_telegram_markdown_code(r"WAIT`_\NOW"),
            r"WAIT\`_\\NOW",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
