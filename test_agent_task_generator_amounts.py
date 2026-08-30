"""Agent task_generator must read amounts/networks from wallet schedules."""

from __future__ import annotations

import unittest
from decimal import Decimal
from types import SimpleNamespace

from agent_backend.services.task_generator import (
    DEFAULT_SWAP_AMOUNT_ETH,
    resolve_schedule_execution_amount,
    schedule_network_pair,
)
import server


class AgentTaskGeneratorAmountTests(unittest.TestCase):
    def test_fixed_amount_from_schedule(self) -> None:
        schedule = server.WalletActionSchedule(
            amount_mode="fixed",
            amount_fixed="0.42",
        )
        self.assertEqual(resolve_schedule_execution_amount(schedule), "0.42")
        self.assertEqual(
            resolve_schedule_execution_amount(schedule, default=DEFAULT_SWAP_AMOUNT_ETH),
            "0.42",
        )

    def test_random_amount_stays_within_bounds(self) -> None:
        schedule = server.WalletActionSchedule(
            amount_mode="random",
            amount_min="0.01",
            amount_max="0.05",
        )
        samples = [
            Decimal(resolve_schedule_execution_amount(schedule) or "0")
            for _ in range(30)
        ]
        self.assertTrue(all(Decimal("0.01") <= value <= Decimal("0.05") for value in samples))
        self.assertGreater(len({str(value) for value in samples}), 1)

    def test_missing_amount_falls_back_to_default(self) -> None:
        schedule = server.WalletActionSchedule(amount_mode="fixed", amount_fixed=None)
        self.assertIsNone(resolve_schedule_execution_amount(schedule))
        self.assertEqual(
            resolve_schedule_execution_amount(schedule, default="0.01"),
            "0.01",
        )

    def test_network_pair_prefers_schedule_fields(self) -> None:
        schedule = SimpleNamespace(from_network="Optimism", to_network="Base")
        self.assertEqual(schedule_network_pair(schedule), ("Optimism", "Base"))
        empty = SimpleNamespace(from_network=None, to_network=None)
        self.assertEqual(
            schedule_network_pair(empty, default_from="Base", default_to="Arbitrum"),
            ("Base", "Arbitrum"),
        )


if __name__ == "__main__":
    unittest.main()
