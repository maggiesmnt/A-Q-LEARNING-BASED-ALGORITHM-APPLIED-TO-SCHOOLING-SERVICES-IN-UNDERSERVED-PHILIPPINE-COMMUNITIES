#!/usr/bin/env python3
"""
Trace the trained MODQL policy on an exact held-out evaluation scenario.

This is a diagnostic only. It does not retrain or change either algorithm.

Usage from repository root:
    py .\training\trace_modql.py
    py .\training\trace_modql.py 3

The optional number is the 1-based held-out scenario index. Scenario 3 is a
useful moderate-rain example from the current 200-scenario evaluation set.
"""

import json
import random
import sys
from pathlib import Path

import train_q_learning as tq


HERE = Path(__file__).resolve().parent
POLICY_PATH = HERE / "outputs_aligned" / "modql_policy.json"


def qget(table, state, action):
    return table.get(state, {}).get(action, 0.0)


def scenario_seed(index):
    rng = random.Random(tq.EVAL_SEED)
    seeds = [
        rng.randrange(1, 10**9)
        for _ in range(tq.EVALUATION_SCENARIOS)
    ]
    return seeds[index - 1]


def trace(index=3):
    if not 1 <= index <= tq.EVALUATION_SCENARIOS:
        raise ValueError(
            f"Scenario index must be 1..{tq.EVALUATION_SCENARIOS}"
        )

    raw = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    q1 = raw["q1"]
    q2 = raw["q2"]

    seed = scenario_seed(index)
    scenario = tq.Scenario(seed)

    current = "hub"
    mask = 0
    remaining = tq.SHIFT_MIN
    visits = {
        node_id: tq.NODES[node_id]["visits30"]
        for node_id in tq.SERVICE
    }

    rows = []
    step = 1

    while True:
        choices = tq.reachable(
            scenario,
            current,
            mask,
            remaining,
        )

        if not choices:
            break

        state = tq.proposed_state(
            scenario,
            current,
            mask,
            remaining,
            visits,
        )

        candidates = []

        for action, travel in choices:
            q1_value = qget(q1, state, action)
            q2_value = qget(q2, state, action)

            reward, projected_fairness = tq.reward_modql(
                scenario,
                action,
                travel,
                visits,
            )

            max_demand = max(scenario.demand.values())
            coverage = scenario.demand[action] / max_demand

            candidates.append(
                {
                    "action": action,
                    "travel_min": travel,
                    "coverage_factor": coverage,
                    "projected_fairness": projected_fairness,
                    "immediate_reward": reward,
                    "q1": q1_value,
                    "q2": q2_value,
                    "q_sum": q1_value + q2_value,
                }
            )

        candidates.sort(
            key=lambda item: (
                item["q_sum"],
                -item["travel_min"],
            ),
            reverse=True,
        )

        chosen = candidates[0]

        rows.append(
            {
                "step": step,
                "state": state,
                "remaining_before": remaining,
                "chosen": chosen["action"],
                "candidates": candidates,
            }
        )

        action = chosen["action"]
        travel = dict(choices)[action]

        remaining -= travel + tq.SERVICE_MIN_PER_STOP
        visits[action] += 1
        mask |= 1 << tq.IDX[action]
        current = action
        step += 1

    result = {
        "scenario_index": index,
        "scenario_seed": seed,
        "rain_mm": scenario.rain,
        "demand": scenario.demand,
        "trace": rows,
        "final_fairness": tq.jain(visits.values()),
        "remaining_minutes": remaining,
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    requested = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    trace(requested)
