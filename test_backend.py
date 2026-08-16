"""Safe local smoke test for the subscription payment endpoint.

This test never broadcasts a blockchain transaction and never invents a TXID.
Run it only while the local server is running on 127.0.0.1:8000.
"""

import requests


BASE_URL = "http://127.0.0.1:8000"


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
        test_subscription_payment_session()
    except requests.exceptions.ConnectionError:
        print("Start the local server first: http://127.0.0.1:8000")
