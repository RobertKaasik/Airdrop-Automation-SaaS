"""Safe local smoke tests for the AIRDROP-X MVP.

The checks never create accounts, broadcast a blockchain transaction, or
invent a TXID. They only verify that the public application shell is ready and
that subscription processing remains safe by default.
Run it only while the local server is running on 127.0.0.1:8000.
"""

import os
import time

import requests


BASE_URL = os.getenv("AIRDROP_X_TEST_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def test_mvp_health():
    health_response = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert health_response.status_code == 200, health_response.text
    assert health_response.headers.get("Cache-Control") == "no-store"
    health = health_response.json()
    assert health["status"] == "ok", health
    assert health["database"] == "ok", health
    assert health["scheduler"] == "running", health
    assert set(health["capabilities"]) == {
        "walletconnect_configured",
        "telegram_configured",
        "subscription_payments_enabled",
    }

    stats_response = requests.get(f"{BASE_URL}/api/stats", timeout=10)
    assert stats_response.status_code == 200, stats_response.text
    stats = stats_response.json()
    assert 0 <= stats["current_slots"] <= stats["max_slots"] == 300, stats

    page_response = requests.get(f"{BASE_URL}/", timeout=10)
    assert page_response.status_code == 200, page_response.text
    assert "AIRDROP-X" in page_response.text
    print("MVP health, database, scheduler, stats, and landing page are ready.")


def test_subscription_payment_session():
    response = requests.post(
        f"{BASE_URL}/api/payment/create-session",
        json={
            "plan": "Standard",
            "amount": 999999,  # The server must ignore client-provided pricing.
            "client_session_id": "sess_local_smoke_test_123456",
            "onboarding": False,
        },
        timeout=10,
    )
    payload = response.json()

    if response.status_code == 503:
        print("Subscription payment is safely disabled (expected by default).")
        return

    assert response.status_code == 200, payload
    payment = payload["payment"]
    assert payment["asset"] == "USDC"
    assert payment["decimals"] == 6
    expected_amount = "1.00" if payment["network"] == "Base Sepolia" else "29.00"
    assert payment["amount"] == expected_amount
    assert payment["network"] in {"Base Sepolia", "Base"}
    print(f"USDC payment session is ready for {payment['network']}: {payment['amount']} USDC")
    print("No transaction was sent by this test.")


def test_auth_boundaries():
    """Verify public endpoints reject unsafe or unauthenticated requests."""
    invalid_login = requests.post(
        f"{BASE_URL}/api/login",
        json={
            "username": "qa_unknown_user",
            "password": "not-a-real-password",
            "fingerprint": "qa-local-device-fingerprint-00000001",
        },
        timeout=10,
    )
    assert invalid_login.status_code == 401, invalid_login.text

    anonymous_security = requests.get(f"{BASE_URL}/api/security/overview", timeout=10)
    assert anonymous_security.status_code == 401, anonymous_security.text

    anonymous_profile = requests.post(f"{BASE_URL}/api/profiles/999999/launch", timeout=10)
    assert anonymous_profile.status_code == 401, anonymous_profile.text

    invalid_payment_session = requests.post(
        f"{BASE_URL}/api/payment/create-session",
        json={
            "plan": "Standard",
            "amount": 29,
            "client_session_id": "too-short",
            "onboarding": False,
        },
        timeout=10,
    )
    assert invalid_payment_session.status_code == 422, invalid_payment_session.text

    unknown_email = f"qa-{int(time.time())}@invalid.example"
    password_reset = requests.post(
        f"{BASE_URL}/api/password-reset/request",
        json={"email": unknown_email},
        timeout=10,
    )
    assert password_reset.status_code == 200, password_reset.text
    assert password_reset.json()["message"] == "If an account exists, a reset code was sent"
    print("Authentication boundaries reject anonymous and malformed requests safely.")


def test_public_surface_security():
    """Keep the public static surface and browser security headers constrained."""
    page_response = requests.get(f"{BASE_URL}/", timeout=10)
    assert page_response.status_code == 200, page_response.text
    assert page_response.headers.get("X-Content-Type-Options") == "nosniff"
    assert page_response.headers.get("X-Frame-Options") == "DENY"
    assert page_response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in page_response.headers.get("Permissions-Policy", "")

    # The mounted static directory must never expose source, environment, or
    # local database files even when a visitor guesses their names.
    for private_path in (".env", "server.py", "airdrop_x.db", "core/models.py"):
        response = requests.get(f"{BASE_URL}/{private_path}", timeout=10)
        assert response.status_code == 404, f"{private_path}: {response.status_code}"

    # Files that form the public app shell must still be reachable.
    assert requests.get(f"{BASE_URL}/locales/ru.js", timeout=10).status_code == 200
    assert requests.get(f"{BASE_URL}/wallet-session-state.js", timeout=10).status_code == 200
    assert requests.get(f"{BASE_URL}/favicon.svg", timeout=10).status_code == 200
    print("Public files and browser security headers are constrained safely.")


if __name__ == "__main__":
    try:
        test_mvp_health()
        test_subscription_payment_session()
        test_auth_boundaries()
        test_public_surface_security()
    except requests.exceptions.ConnectionError:
        print("Start the local server first: http://127.0.0.1:8000")
