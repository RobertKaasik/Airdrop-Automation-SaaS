"""Regression tests for the server-side login abuse guard.

These tests exercise only the in-memory limiter; they do not access accounts,
wallets, email, or external services.
"""

import unittest

from fastapi import HTTPException

import server


class LoginRateLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        server.request_rate_limits.clear()

    def tearDown(self) -> None:
        server.request_rate_limits.clear()

    def test_limit_returns_retry_after_without_disclosing_account_data(self) -> None:
        server.enforce_request_rate_limit("login-account", "127.0.0.1:admin", 1, 60)

        with self.assertRaises(HTTPException) as caught:
            server.enforce_request_rate_limit("login-account", "127.0.0.1:admin", 1, 60)

        error = caught.exception
        self.assertEqual(error.status_code, 429)
        self.assertEqual(error.detail, "Too many requests. Please wait and try again")
        self.assertIn("Retry-After", error.headers)
        self.assertGreaterEqual(int(error.headers["Retry-After"]), 1)


if __name__ == "__main__":
    unittest.main()
