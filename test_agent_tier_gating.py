"""Unit checks for subscription tier gating used by Desktop Agent Mode."""

from agent_backend.config.tiers import (
    AGENT_MODE_MIN_LEVEL,
    get_tier_info,
    is_agent_mode_allowed,
)


def test_premium_unlocks_agent_mode():
    assert get_tier_info("Premium")["level"] == 3
    assert get_tier_info("premium")["level"] == 3
    assert get_tier_info("Premium VIP")["level"] == 3
    assert is_agent_mode_allowed("Premium") is True
    assert is_agent_mode_allowed("premium") is True


def test_standard_and_pro_are_locked():
    assert get_tier_info("Standard")["level"] == 1
    assert get_tier_info("Pro")["level"] == 2
    assert is_agent_mode_allowed("Standard") is False
    assert is_agent_mode_allowed("Pro") is False


def test_whale_and_enterprise_allowed():
    assert get_tier_info("Whale")["level"] >= AGENT_MODE_MIN_LEVEL
    assert get_tier_info("Enterprise")["level"] >= AGENT_MODE_MIN_LEVEL
    assert is_agent_mode_allowed("Whale") is True
    assert is_agent_mode_allowed("Enterprise") is True


def test_unknown_tier_fail_closed():
    assert get_tier_info("something-else")["level"] == 0
    assert is_agent_mode_allowed("something-else") is False


if __name__ == "__main__":
    test_premium_unlocks_agent_mode()
    test_standard_and_pro_are_locked()
    test_whale_and_enterprise_allowed()
    test_unknown_tier_fail_closed()
    print("tier gating OK")
