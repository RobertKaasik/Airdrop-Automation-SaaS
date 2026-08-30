"""Schedule field mapping shared by TaskGenerator.

Website billing/schedules use:
- Python weekday(): Mon=0 ... Sun=6
- action_type: dex | bridge | lending
"""

from typing import Optional

# Must match datetime.weekday() and server.py SCHEDULE_DAY_CODES / day_indexes
WEEKDAY_MAP = {
    "Mon": 0,
    "Tue": 1,
    "Wed": 2,
    "Thu": 3,
    "Fri": 4,
    "Sat": 5,
    "Sun": 6,
}

# Canonical agent actions after alias collapse
ACTION_DEX = "dex"
ACTION_BRIDGE = "bridge"
ACTION_LENDING = "lending"
ACTION_LENDING_WITHDRAW = "lending_withdraw"

ACTION_ALIASES = {
    "dex": ACTION_DEX,
    "swap": ACTION_DEX,
    "base_swap": ACTION_DEX,
    "bridge": ACTION_BRIDGE,
    "universal_bridge": ACTION_BRIDGE,
    "lending": ACTION_LENDING,
    "defi": ACTION_LENDING,
    "aave_supply": ACTION_LENDING,
    "lending_supply": ACTION_LENDING,
    "aave_withdraw": ACTION_LENDING_WITHDRAW,
    "lending_withdraw": ACTION_LENDING_WITHDRAW,
}

PROTOCOL_BY_ACTION = {
    ACTION_DEX: "uniswap_v3",
    ACTION_BRIDGE: "lifi",
    ACTION_LENDING: "aave_v3",
    ACTION_LENDING_WITHDRAW: "aave_v3",
}


def normalize_action_type(action_type: Optional[str]) -> str:
    return ACTION_ALIASES.get((action_type or "").lower().strip(), "")


def protocol_for_action(canonical_action: str) -> str:
    return PROTOCOL_BY_ACTION.get(canonical_action, "unknown")
