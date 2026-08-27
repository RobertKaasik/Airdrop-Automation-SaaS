"""Provider outage regression tests with no external network or transactions.

Run with::

    python -m unittest -v test_provider_outages.py
"""

from __future__ import annotations

import asyncio
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import requests
from fastapi import HTTPException

import server


WALLET = "0x00000000000000000000000000000000000000a1"
TOKEN = {
    "address": server.LIFI_NATIVE_TOKEN_ADDRESS,
    "symbol": "ETH",
    "name": "Ether",
    "decimals": 18,
    "price_usd": 2000.0,
    "is_core": True,
}
TARGET_TOKEN = {
    "address": "0x00000000000000000000000000000000000000b2",
    "symbol": "USDC",
    "name": "USD Coin",
    "decimals": 6,
    "price_usd": 1.0,
    "is_core": True,
}
PAYMENT_CONFIG = {
    "rpc_url": "https://rpc.invalid.example",
    "chain_id": 8453,
    "usdc_contract": "0x00000000000000000000000000000000000000c3",
    "receiver": "0x00000000000000000000000000000000000000d4",
}


class StubResponse:
    def __init__(self, status_code: int, payload=None, *, json_error: bool = False):
        self.status_code = status_code
        self._payload = payload
        self._json_error = json_error

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 400

    def json(self):
        if self._json_error:
            raise ValueError("malformed provider JSON")
        return self._payload


class ProviderOutageTests(unittest.TestCase):
    def setUp(self) -> None:
        server.LIFI_TOKEN_CATALOG_CACHE.clear()
        server.swap_quote_sessions.clear()
        server.swap_submission_sessions.clear()

    def tearDown(self) -> None:
        server.LIFI_TOKEN_CATALOG_CACHE.clear()
        server.swap_quote_sessions.clear()
        server.swap_submission_sessions.clear()

    @staticmethod
    def await_result(awaitable):
        return asyncio.run(awaitable)

    @staticmethod
    def assert_http_error(testcase, status_code: int, function, *args, **kwargs):
        with testcase.assertRaises(HTTPException) as caught:
            function(*args, **kwargs)
        testcase.assertEqual(caught.exception.status_code, status_code)
        testcase.assertIsInstance(caught.exception.detail, str)
        testcase.assertTrue(caught.exception.detail)
        return caught.exception

    def test_shared_parser_maps_rate_limit_and_5xx_to_503(self):
        for status_code in (429, 500, 503):
            with self.subTest(status_code=status_code):
                self.assert_http_error(
                    self,
                    503,
                    server.parse_provider_json_response,
                    StubResponse(status_code, {"error": "not reflected"}),
                    provider="Mock provider",
                    unavailable_detail="Provider is temporarily unavailable",
                    rejected_detail="Provider rejected the request",
                    invalid_detail="Provider returned invalid data",
                )

    def test_shared_parser_rejects_malformed_and_non_object_json(self):
        for response in (
            StubResponse(200, json_error=True),
            StubResponse(200, ["unexpected", "array"]),
        ):
            with self.subTest(payload=response._payload):
                self.assert_http_error(
                    self,
                    502,
                    server.parse_provider_json_response,
                    response,
                    provider="Mock provider",
                    unavailable_detail="Provider is temporarily unavailable",
                    rejected_detail="Provider rejected the request",
                    invalid_detail="Provider returned invalid data",
                )

    def test_lifi_catalog_timeout_and_invalid_schema_are_controlled(self):
        with patch.object(server.requests, "get", side_effect=requests.Timeout("offline")):
            self.assert_http_error(self, 503, server.get_lifi_tokens, "Base")

        with patch.object(server.requests, "get", return_value=StubResponse(200, {"tokens": "bad"})):
            self.assert_http_error(self, 502, server.get_lifi_tokens, "Base")

    def test_lifi_quote_rate_limit_and_invalid_json_are_controlled(self):
        payload = server.UniversalBridgeQuoteRequest(
            wallet_address=WALLET,
            from_network="Base",
            to_network="Arbitrum",
            from_token_address=TOKEN["address"],
            to_token_address=TARGET_TOKEN["address"],
            amount="0.01",
        )
        user = SimpleNamespace(username="provider-test")

        for response, expected_status in (
            (StubResponse(429, {}), 503),
            (StubResponse(502, {}), 503),
            (StubResponse(200, json_error=True), 502),
            (StubResponse(200, {"estimate": {}}), 502),
        ):
            with self.subTest(expected_status=expected_status, response_status=response.status_code), \
                    patch.object(server, "get_saved_base_wallet", return_value=WALLET), \
                    patch.object(server, "get_lifi_token", side_effect=[TOKEN, TARGET_TOKEN]), \
                    patch.object(server.requests, "get", return_value=response):
                self.assert_http_error(
                    self,
                    expected_status,
                    self.await_result,
                    server.get_universal_bridge_quote(payload, db=MagicMock(), current_user=user),
                )

    def test_lifi_status_rejects_rate_limit_and_invalid_schema(self):
        user = SimpleNamespace(username="provider-test")
        for response, expected_status in (
            (StubResponse(429, {}), 503),
            (StubResponse(200, {"substatus": "PENDING"}), 502),
            (StubResponse(200, {"status": "PENDING", "substatus": []}), 502),
        ):
            with self.subTest(expected_status=expected_status), patch.object(
                server.requests, "get", return_value=response
            ):
                self.assert_http_error(
                    self,
                    expected_status,
                    self.await_result,
                    server.get_universal_bridge_status(
                        "0x" + "1" * 64,
                        "Base",
                        "Arbitrum",
                        current_user=user,
                    ),
                )

    def test_uniswap_quote_timeout_rate_limit_and_invalid_schema_are_controlled(self):
        payload = server.BaseSwapQuoteRequest(wallet_address=WALLET, amount="0.01", slippage=0.5)
        user = SimpleNamespace(username="provider-test")
        provider_results = (
            (requests.Timeout("offline"), None, 503),
            (None, StubResponse(429, {}), 503),
            (None, StubResponse(500, {}), 503),
            (None, StubResponse(200, json_error=True), 502),
            (None, StubResponse(200, {"quote": {"output": {"amount": "bad"}}}), 502),
        )
        for request_error, response, expected_status in provider_results:
            request_mock = MagicMock(side_effect=request_error) if request_error else MagicMock(return_value=response)
            with self.subTest(expected_status=expected_status), \
                    patch.object(server, "get_saved_base_wallet", return_value=WALLET), \
                    patch.object(server, "uniswap_headers", return_value={}), \
                    patch.object(server.requests, "post", request_mock):
                self.assert_http_error(
                    self,
                    expected_status,
                    self.await_result,
                    server.get_base_swap_quote(payload, db=MagicMock(), current_user=user),
                )

    def test_uniswap_build_5xx_and_invalid_schema_are_controlled(self):
        user = SimpleNamespace(username="provider-test")
        for response, expected_status in (
            (StubResponse(503, {}), 503),
            (StubResponse(200, {"swap": "not-an-object"}), 502),
        ):
            server.swap_quote_sessions["quote"] = {
                "username": user.username,
                "wallet_address": WALLET.lower(),
                "quote": {"output": {"amount": "1000000"}},
                "amount_in": "0.01",
                "amount_out": "1000000",
                "created_at": int(time.time()),
            }
            with self.subTest(expected_status=expected_status), \
                    patch.object(server, "uniswap_headers", return_value={}), \
                    patch.object(server.requests, "post", return_value=response):
                self.assert_http_error(
                    self,
                    expected_status,
                    self.await_result,
                    server.build_base_swap_transaction(
                        server.BaseSwapBuildRequest(quote_id="quote"),
                        current_user=user,
                    ),
                )

    def test_aave_rpc_timeout_is_a_controlled_503(self):
        fake_web3 = MagicMock()
        fake_web3.HTTPProvider.return_value = object()
        fake_web3.return_value.is_connected.side_effect = requests.Timeout("offline")
        with patch.object(server, "Web3", fake_web3), patch.object(server.time, "sleep"):
            self.assert_http_error(
                self,
                503,
                server.get_aave_v3_base_usdc_supply_quote,
                WALLET,
                "1",
            )

    def test_aave_positions_disconnected_rpc_is_a_controlled_503(self):
        fake_web3 = MagicMock()
        fake_web3.HTTPProvider.return_value = object()
        fake_web3.return_value.is_connected.return_value = False
        server.defi_positions_cache.clear()
        with patch.object(server, "Web3", fake_web3):
            self.assert_http_error(self, 503, server.get_aave_v3_base_positions, WALLET, True)

    def test_payment_rpc_outage_is_not_reported_as_invalid_or_unconfirmed(self):
        fake_web3 = MagicMock()
        fake_web3.HTTPProvider.return_value = object()
        fake_web3.return_value.is_connected.return_value = False
        with patch.object(server, "Web3", fake_web3):
            state = server.get_usdc_payment_verification_state(
                "0x" + "2" * 64,
                PAYMENT_CONFIG,
                1_000_000,
            )
        self.assertEqual(state, "unavailable")

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        with patch.object(server, "get_usdc_payment_verification_state", return_value="unavailable"):
            error = self.assert_http_error(
                self,
                503,
                server.reserve_verified_usdc_payment,
                db,
                "0x" + "2" * 64,
                PAYMENT_CONFIG,
                1_000_000,
                "test",
            )
        self.assertIn("temporarily unavailable", error.detail)


if __name__ == "__main__":
    unittest.main()
