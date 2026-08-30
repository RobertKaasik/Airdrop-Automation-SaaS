"""
Centralized tier configuration for agent mode gating.
Keys must match User.subscription_plan values used in billing
(Standard / Pro / Premium / Whale / Enterprise), plus aliases.
"""

SUBSCRIPTION_TIERS = {
    "free": {"level": 0, "name": "Free"},
    "standard": {"level": 1, "name": "Standard"},
    "pro": {"level": 2, "name": "Pro"},
    "pro farmer": {"level": 2, "name": "PRO Farmer"},
    "premium": {"level": 3, "name": "Premium"},
    "premium vip": {"level": 3, "name": "Premium VIP"},
    "vip ultimate": {"level": 4, "name": "VIP Ultimate"},
    "whale": {"level": 4, "name": "Whale"},
    "whale / syndicate": {"level": 4, "name": "Whale / Syndicate"},
    "enterprise": {"level": 5, "name": "Enterprise"},
}

AGENT_MODE_MIN_LEVEL = 3


def is_agent_mode_allowed(tier: str) -> bool:
    """Check if tier allows agent mode using level-based validation."""
    tier_info = get_tier_info(tier)
    return tier_info["level"] >= AGENT_MODE_MIN_LEVEL


def get_tier_info(tier: str) -> dict:
    """Get tier information including level and display name."""
    tier_key = (tier or "standard").lower().strip()
    return SUBSCRIPTION_TIERS.get(tier_key, {
        "level": 0,
        "name": "Unknown",
    })
