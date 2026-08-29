"""
Centralized tier configuration for agent mode gating.
Update this file when adding new premium tiers.
"""

SUBSCRIPTION_TIERS = {
    "free": {"level": 0, "name": "Free"},
    "standard": {"level": 1, "name": "Standard"},
    "pro farmer": {"level": 2, "name": "PRO Farmer"},
    "premium vip": {"level": 3, "name": "Premium VIP"},
    "vip ultimate": {"level": 4, "name": "VIP Ultimate"},
    "whale": {"level": 5, "name": "Whale / Syndicate"},
    "enterprise": {"level": 6, "name": "Enterprise"}
}

AGENT_MODE_MIN_LEVEL = 3


def is_agent_mode_allowed(tier: str) -> bool:
    """Check if tier allows agent mode using level-based validation."""
    tier_info = SUBSCRIPTION_TIERS.get(tier.lower().strip())
    if not tier_info:
        return False
    return tier_info["level"] >= AGENT_MODE_MIN_LEVEL


def get_tier_info(tier: str) -> dict:
    """Get tier information including level and display name."""
    tier_key = tier.lower().strip()
    return SUBSCRIPTION_TIERS.get(tier_key, {
        "level": 0,
        "name": "Unknown"
    })
