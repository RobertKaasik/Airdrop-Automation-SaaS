"""Isolated subscription lifecycle regression tests.

These tests use a private in-memory SQLite database and mocked blockchain
verification.  They never read or modify the project's real users, payment
sessions, or transaction table, and they never contact an RPC or send email.

Run with::

    python -m unittest -v test_subscription_lifecycle.py
"""

from __future__ import annotations

import asyncio
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

import server


PAYMENT_CONFIG = {
    "mode": "mainnet",
    "is_testnet": False,
    "network": "Base",
    "chain_id": 8453,
    "rpc_url": "https://invalid.example",
    "usdc_contract": "0x0000000000000000000000000000000000000001",
    "receiver": "0x0000000000000000000000000000000000000002",
}


def txid(number: int) -> str:
    return "0x" + format(number, "064x")


def request(path: str = "/api/subscription/confirm") -> Request:
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": [],
            "client": ("127.0.0.77", 51000),
            "server": ("127.0.0.1", 8001),
        }
    )


class SubscriptionLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        server.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        server.request_rate_limits.clear()
        now_ts = int(time.time())
        self.user = server.User(
            username="subscription_owner",
            email="subscription-owner@example.invalid",
            password_hash="test-only",
            subscription_plan="Standard",
            subscription_activated_at=now_ts - 10 * 24 * 60 * 60,
        )
        self.other = server.User(
            username="subscription_other",
            email="subscription-other@example.invalid",
            password_hash="test-only",
            subscription_plan="Standard",
            subscription_activated_at=now_ts,
        )
        self.db.add_all((self.user, self.other))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()
        server.request_rate_limits.clear()

    @staticmethod
    def await_result(awaitable):
        return asyncio.run(awaitable)

    def create_session(self, plan: str, client_id: str, amount: int = 999999) -> dict:
        with patch.object(server, "get_subscription_payment_config", return_value=PAYMENT_CONFIG):
            return self.await_result(
                server.create_account_subscription_session(
                    server.PaymentSessionCreateReq(
                        plan=plan,
                        amount=amount,
                        client_session_id=client_id,
                    ),
                    request("/api/subscription/create-session"),
                    self.db,
                    self.user,
                )
            )

    def confirm_session(self, session_id: str, client_id: str, payment_txid: str) -> dict:
        with (
            patch.object(server, "get_subscription_payment_config", return_value=PAYMENT_CONFIG),
            patch.object(server, "get_usdc_payment_verification_state", return_value="confirmed"),
            patch.object(server, "send_payment_receipt_email", return_value=True),
        ):
            return self.await_result(
                server.confirm_account_subscription_session(
                    server.PaymentSessionConfirmReq(
                        payment_session_id=session_id,
                        client_session_id=client_id,
                        txid=payment_txid,
                    ),
                    request(),
                    self.db,
                    self.user,
                )
            )

    def assert_http_error(self, status_code: int, callback) -> HTTPException:
        with self.assertRaises(HTTPException) as caught:
            callback()
        self.assertEqual(caught.exception.status_code, status_code)
        return caught.exception

    def test_exact_30_day_and_7_day_state_boundaries_and_402_gate(self) -> None:
        anchor = 1_700_000_000
        user = server.User(subscription_activated_at=anchor)
        duration = server.SUBSCRIPTION_DURATION_SECONDS
        grace = server.SUBSCRIPTION_GRACE_PERIOD_SECONDS

        self.assertEqual(server.get_subscription_state(user, anchor + duration - 1)["status"], "active")
        self.assertEqual(server.get_subscription_state(user, anchor + duration)["status"], "grace")
        self.assertEqual(
            server.get_subscription_state(user, anchor + duration + grace - 1)["status"],
            "grace",
        )
        self.assertEqual(server.get_subscription_state(user, anchor + duration + grace)["status"], "expired")

        now_ts = int(time.time())
        grace_user = server.User(subscription_activated_at=now_ts - duration - 60)
        expired_user = server.User(subscription_activated_at=now_ts - duration - grace - 60)
        self.assertIs(server.get_current_user(grace_user), grace_user)
        error = self.assert_http_error(402, lambda: server.get_current_user(expired_user))
        self.assertIn("Renew", str(error.detail))

    def test_legacy_account_gets_one_persistent_subscription_anchor(self) -> None:
        self.user.subscription_activated_at = None
        raw_token = "legacy-auth-session-token"
        now_ts = int(time.time())
        self.db.add(
            server.AuthSession(
                username=self.user.username,
                token_hash=server.hash_secret(raw_token),
                expires_at=now_ts + 3600,
                created_at=now_ts,
            )
        )
        self.db.commit()

        authenticated = server.get_authenticated_user(f"Bearer {raw_token}", self.db)
        first_anchor = authenticated.subscription_activated_at
        self.assertIsNotNone(first_anchor)
        self.db.expire_all()
        authenticated_again = server.get_authenticated_user(f"Bearer {raw_token}", self.db)
        self.assertEqual(authenticated_again.subscription_activated_at, first_anchor)

    def test_server_price_is_authoritative_and_active_upgrade_extends_term(self) -> None:
        client_id = "subscription_browser_session_0001"
        old_expiry = server.get_subscription_state(self.user)["expires_at"]
        checkout = self.create_session("Pro", client_id, amount=1)

        self.assertEqual(checkout["payment"]["amount"], "49.00")
        self.assertEqual(checkout["plan"], "Pro")
        result = self.confirm_session(checkout["payment_session_id"], client_id, txid(1))

        self.assertEqual(result["plan"], "Pro")
        self.assertEqual(result["status"], "active")
        self.assertEqual(result["expires_at"], old_expiry + server.SUBSCRIPTION_DURATION_SECONDS)
        processed = self.db.query(server.ProcessedBlockchainTransaction).one()
        self.assertEqual(processed.username, self.user.username)
        self.assertEqual(processed.purpose, "subscription_change")

    def test_repeat_renewal_adds_another_30_days(self) -> None:
        first_client = "subscription_browser_session_0002"
        first = self.create_session("Standard", first_client)
        first_result = self.confirm_session(first["payment_session_id"], first_client, txid(2))

        second_client = "subscription_browser_session_0003"
        second = self.create_session("Standard", second_client)
        second_result = self.confirm_session(second["payment_session_id"], second_client, txid(3))

        self.assertEqual(
            second_result["expires_at"],
            first_result["expires_at"] + server.SUBSCRIPTION_DURATION_SECONDS,
        )
        self.assertEqual(self.db.query(server.ProcessedBlockchainTransaction).count(), 2)

    def test_grace_and_expired_renewals_start_a_fresh_30_day_period(self) -> None:
        for index, age in enumerate(
            (
                server.SUBSCRIPTION_DURATION_SECONDS + 60,
                server.SUBSCRIPTION_DURATION_SECONDS + server.SUBSCRIPTION_GRACE_PERIOD_SECONDS + 60,
            ),
            start=10,
        ):
            before = int(time.time())
            self.user.subscription_activated_at = before - age
            self.db.commit()
            client_id = f"subscription_browser_session_{index:04d}"
            checkout = self.create_session("Standard", client_id)
            result = self.confirm_session(checkout["payment_session_id"], client_id, txid(index))
            after = int(time.time())

            self.assertEqual(result["status"], "active")
            self.assertGreaterEqual(result["activated_at"], before)
            self.assertLessEqual(result["activated_at"], after)
            self.assertEqual(
                result["expires_at"] - result["activated_at"],
                server.SUBSCRIPTION_DURATION_SECONDS,
            )

    def test_foreign_session_client_mismatch_duplicate_txid_and_stale_downgrade_are_blocked(self) -> None:
        client_id = "subscription_browser_session_0020"
        checkout = self.create_session("Pro", client_id)
        session_id = checkout["payment_session_id"]

        def foreign_account_attempt():
            with patch.object(server, "get_subscription_payment_config", return_value=PAYMENT_CONFIG):
                return self.await_result(
                    server.confirm_account_subscription_session(
                        server.PaymentSessionConfirmReq(
                            payment_session_id=session_id,
                            client_session_id=client_id,
                            txid=txid(20),
                        ),
                        request(),
                        self.db,
                        self.other,
                    )
                )

        self.assert_http_error(404, foreign_account_attempt)
        self.assert_http_error(
            403,
            lambda: self.confirm_session(
                session_id,
                "different_browser_session_0020",
                txid(20),
            ),
        )

        self.confirm_session(session_id, client_id, txid(20))
        another = self.create_session("Pro", "subscription_browser_session_0021")
        self.assert_http_error(
            409,
            lambda: self.confirm_session(
                another["payment_session_id"],
                "subscription_browser_session_0021",
                txid(20),
            ),
        )

        stale = self.create_session("Pro", "subscription_browser_session_0022")
        self.user.subscription_plan = "Premium"
        self.db.commit()
        self.assert_http_error(
            409,
            lambda: self.confirm_session(
                stale["payment_session_id"],
                "subscription_browser_session_0022",
                txid(22),
            ),
        )

    def test_applied_confirmation_is_idempotent_but_requires_the_original_txid(self) -> None:
        client_id = "subscription_browser_session_0030"
        checkout = self.create_session("Pro", client_id)
        first = self.confirm_session(checkout["payment_session_id"], client_id, txid(30))
        session = self.db.get(server.PaymentCheckoutSession, checkout["payment_session_id"])
        session.created_at -= server.PAYMENT_SESSION_TTL_SECONDS * 2
        self.db.commit()

        with patch.object(server, "get_subscription_payment_config", return_value=None):
            repeated = self.await_result(
                server.confirm_account_subscription_session(
                    server.PaymentSessionConfirmReq(
                        payment_session_id=checkout["payment_session_id"],
                        client_session_id=client_id,
                        txid=txid(30),
                    ),
                    request(),
                    self.db,
                    self.user,
                )
            )
        self.assertEqual(repeated["expires_at"], first["expires_at"])
        self.assertEqual(self.db.query(server.ProcessedBlockchainTransaction).count(), 1)
        self.assert_http_error(
            409,
            lambda: self.confirm_session(checkout["payment_session_id"], client_id, txid(31)),
        )

    def test_registration_confirmation_reserves_txid_atomically(self) -> None:
        client_id = "registration_browser_session_0040"
        checkout = server.PaymentCheckoutSession(
            id="registration-checkout-40",
            client_session_id=client_id,
            username=None,
            purpose="registration",
            plan="Standard",
            amount_usdc="29.00",
            amount_atomic="29000000",
            onboarding=False,
            payment_mode="mainnet",
            status="pending",
            created_at=int(time.time()),
        )
        self.db.add(checkout)
        self.db.commit()

        with (
            patch.object(server, "get_subscription_payment_config", return_value=PAYMENT_CONFIG),
            patch.object(server, "get_usdc_payment_verification_state", return_value="confirmed"),
            patch.object(self.db, "commit", side_effect=RuntimeError("simulated commit failure")),
        ):
            with self.assertRaisesRegex(RuntimeError, "simulated commit failure"):
                self.await_result(
                    server.confirm_payment_session(
                        server.PaymentSessionConfirmReq(
                            payment_session_id=checkout.id,
                            client_session_id=client_id,
                            txid=txid(40),
                        ),
                        request("/api/payment/confirm"),
                        self.db,
                    )
                )
        self.db.rollback()

        verification_db = self.Session()
        try:
            persisted = verification_db.get(server.PaymentCheckoutSession, checkout.id)
            self.assertEqual(persisted.status, "pending")
            self.assertIsNone(persisted.txid)
            self.assertEqual(verification_db.query(server.ProcessedBlockchainTransaction).count(), 0)
        finally:
            verification_db.close()

    def test_registration_resume_never_uses_an_account_subscription_session(self) -> None:
        client_id = "registration_browser_session_0050"
        self.db.add(
            server.PaymentCheckoutSession(
                id="account-session-50",
                client_session_id=client_id,
                username=self.user.username,
                purpose="subscription",
                plan="Premium",
                amount_usdc="89.00",
                amount_atomic="89000000",
                onboarding=False,
                payment_mode="mainnet",
                status="paid",
                txid=txid(50),
                created_at=int(time.time()),
                paid_at=int(time.time()),
            )
        )
        self.db.commit()

        self.assert_http_error(
            404,
            lambda: server.resume_paid_registration(
                server.PaymentRegistrationResumeRequest(client_session_id=client_id),
                request("/api/payment/resume-registration"),
                self.db,
            ),
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
