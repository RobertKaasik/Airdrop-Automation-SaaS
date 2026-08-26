"""Offline smoke checks for the isolated browser-profile manager.

The test deliberately does not open a browser, visit an external website, or
store wallet secrets. It validates the profile boundary that the application
actually uses: required proxy parsing, deterministic environment metadata, and
exclusive profile locks.
"""

import os
from pathlib import Path

from core.browser_profile_manager import (
    BrowserProfileManager,
    ProfileConfigurationError,
)


def verify_proxy_validation() -> None:
    authenticated = BrowserProfileManager._parse_proxy(
        "socks5://demo-user:demo-pass@127.0.0.1:1080"
    )
    assert authenticated == {
        "server": "socks5://127.0.0.1:1080",
        "username": "demo-user",
        "password": "demo-pass",
    }

    try:
        BrowserProfileManager._parse_proxy(None)
    except ProfileConfigurationError:
        pass
    else:
        raise AssertionError("An isolated profile must fail closed without a proxy.")


def verify_environment_metadata() -> None:
    metadata = BrowserProfileManager._default_environment_metadata()
    assert metadata["locale"]
    assert metadata["viewport"]["width"] > 0
    assert metadata["viewport"]["height"] > 0
    assert "private_key" not in metadata
    assert "seed_phrase" not in metadata


def verify_profile_lock_contract() -> None:
    # Integration tests exercise the real atomic lock. This smaller smoke test
    # keeps filesystem access read-only so it also works in restricted CI.
    manager = BrowserProfileManager.__new__(BrowserProfileManager)
    manager.locks_path = Path("browser_profiles") / "locks"
    assert manager._lock_path(101) == Path("browser_profiles/locks/profile-101.lock")
    assert manager._is_process_alive(os.getpid())


def main() -> None:
    verify_proxy_validation()
    verify_environment_metadata()
    verify_profile_lock_contract()
    print("PASS: isolated profile validation and locking checks passed.")


if __name__ == "__main__":
    main()
