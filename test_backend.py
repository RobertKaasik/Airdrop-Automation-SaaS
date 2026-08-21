"""Safe local smoke tests for the AIRDROP-X MVP.

The checks never create accounts, broadcast a blockchain transaction, or
invent a TXID. They only verify that the public application shell is ready and
that subscription processing remains safe by default.
Run it only while the local server is running on 127.0.0.1:8000.
"""

import os

import requests


BASE_URL = os.getenv("AIRDROP_X_TEST_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def test_mvp_health():
    health_response = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert health_response.status_code == 200, health_response.text
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


if __name__ == "__main__":
    try:
        test_mvp_health()
        test_subscription_payment_session()
    except requests.exceptions.ConnectionError:
        print("Start the local server first: http://127.0.0.1:8000")
