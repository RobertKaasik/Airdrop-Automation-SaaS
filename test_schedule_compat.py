"""Mapping checks for schedule -> agent task conversion."""

from datetime import datetime

from agent_backend.models.task import AgentTask
from agent_backend.services.schedule_compat import (
    WEEKDAY_MAP,
    normalize_action_type,
    protocol_for_action,
)


def test_weekday_matches_python():
    assert WEEKDAY_MAP["Mon"] == 0
    assert WEEKDAY_MAP["Sun"] == 6
    # 2026-08-30 is Sunday
    assert datetime(2026, 8, 30).weekday() == WEEKDAY_MAP["Sun"]
    assert datetime(2026, 8, 31).weekday() == WEEKDAY_MAP["Mon"]


def test_website_action_types_map():
    assert normalize_action_type("dex") == "dex"
    assert normalize_action_type("bridge") == "bridge"
    assert normalize_action_type("lending") == "lending"
    assert normalize_action_type("swap") == "dex"
    assert protocol_for_action(normalize_action_type("dex")) == "uniswap_v3"
    assert protocol_for_action(normalize_action_type("bridge")) == "lifi"
    assert protocol_for_action(normalize_action_type("lending")) == "aave_v3"


def test_agent_task_requires_wallet_id_and_protocol():
    sample = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
    task = AgentTask(
        task_id="t1",
        wallet_id=7,
        schedule_id=42,
        chain_id=8453,
        to_address=sample,
        calldata="0x1234",
        max_fee_per_gas="1",
        max_priority_fee_per_gas="1",
        execution_window_start_utc=1,
        execution_window_end_utc=2,
        protocol="uniswap_v3",
        wallet_address=sample,
    )
    assert task.wallet_id == 7
    assert task.protocol == "uniswap_v3"


if __name__ == "__main__":
    test_weekday_matches_python()
    test_website_action_types_map()
    test_agent_task_requires_wallet_id_and_protocol()
    print("schedule mapping OK")
