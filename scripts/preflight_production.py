"""Secret-safe AIRDROP-X production readiness check.

The script reads `.env` but never prints values.  It is intentionally a
configuration check only: it does not start the server, contact a chain, send
mail, call Telegram, or create payment sessions.

Usage:
    python scripts/preflight_production.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"
EVM_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}$")
TRUE_VALUES = {"1", "true", "yes", "on"}


def is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in TRUE_VALUES


def is_https_origin(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc) and not parsed.path.rstrip("/")


def main() -> int:
    if not ENV_PATH.exists():
        print("ERROR  .env is missing. Copy .env.example and configure the deployment environment.")
        return 1

    config = {key: value or "" for key, value in dotenv_values(ENV_PATH).items()}
    # Real process variables take precedence when the deployment platform
    # injects them rather than storing them in a file.
    config.update({key: value for key, value in os.environ.items() if key in config or key.startswith("APP_") or key.startswith("SUBSCRIPTION_")})

    errors: list[str] = []
    warnings: list[str] = []

    if config.get("APP_ENV", "").strip().lower() != "production":
        errors.append("APP_ENV must be production.")
    if is_true(config.get("APP_RELOAD")):
        errors.append("APP_RELOAD must be false in production.")

    origins = [item.strip() for item in config.get("APP_ALLOWED_ORIGINS", "").split(",") if item.strip()]
    if not origins:
        errors.append("APP_ALLOWED_ORIGINS must contain the exact public HTTPS origin.")
    elif any(not is_https_origin(origin) for origin in origins):
        errors.append("APP_ALLOWED_ORIGINS may contain only exact HTTPS origins (no localhost, wildcard, or path).")

    if is_true(config.get("APP_TRUST_PROXY_HEADERS")):
        warnings.append("Proxy headers are trusted. Enable this only behind a reverse proxy you control.")

    walletconnect = config.get("WALLETCONNECT_PROJECT_ID", "").strip()
    if not walletconnect:
        warnings.append("WalletConnect is not configured; QR wallet connections will be unavailable.")

    smtp_password = config.get("SMTP_PASSWORD", "").strip()
    if not smtp_password:
        warnings.append("SMTP_PASSWORD is empty; email verification and password recovery cannot send mail.")

    telegram_token = config.get("TELEGRAM_BOT_TOKEN", "").strip()
    telegram_username = config.get("TELEGRAM_BOT_USERNAME", "").strip()
    if bool(telegram_token) != bool(telegram_username):
        errors.append("Set both TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME, or leave both empty.")
    elif not telegram_token:
        warnings.append("Telegram notifications are not configured.")

    payments_enabled = is_true(config.get("SUBSCRIPTION_PAYMENTS_ENABLED"))
    payment_mode = config.get("SUBSCRIPTION_PAYMENT_MODE", "").strip().lower()
    receiver = config.get("SUBSCRIPTION_PAYMENT_RECEIVER", "").strip()
    if payments_enabled:
        if payment_mode not in {"mainnet", "base-mainnet"}:
            errors.append("Production payments may be enabled only with SUBSCRIPTION_PAYMENT_MODE=mainnet or base-mainnet.")
        if not EVM_ADDRESS.fullmatch(receiver):
            errors.append("SUBSCRIPTION_PAYMENT_RECEIVER must be a valid public EVM address before payments are enabled.")
        warnings.append("Payments are enabled: run the independent manual settlement test before opening sales.")
    else:
        warnings.append("Subscription payments remain disabled (safe default).")

    print("AIRDROP-X production preflight (no secrets are displayed)\n")
    for message in errors:
        print(f"ERROR  {message}")
    for message in warnings:
        print(f"WARN   {message}")

    if errors:
        print(f"\nFAILED: {len(errors)} blocking item(s) must be fixed before production.")
        return 1

    print("\nPASSED: no blocking configuration issues found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
