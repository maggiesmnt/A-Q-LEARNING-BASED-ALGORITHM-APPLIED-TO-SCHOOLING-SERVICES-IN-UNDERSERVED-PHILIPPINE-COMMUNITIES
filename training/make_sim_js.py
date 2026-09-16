"""
make_sim_js.py
=============================================================================
Optional helper for exporting the CURRENT aligned training log to a small
standalone JavaScript chart block.

The live browser no longer depends on this helper: charts.js reads
TRAINED_POLICY.training_curves from trained_policy.js directly.

Reads:
    ./outputs_aligned/training_log.csv
Writes:
    ./outputs_aligned/sim_block.js

Current CSV columns:
    episode
    standard_reward
    modql_reward
    mean_q1_q2_spread
=============================================================================
"""

import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
IN_CSV = HERE / "outputs_aligned" / "training_log.csv"
OUT_JS = HERE / "outputs_aligned" / "sim_block.js"
N_POINTS = 60


def downsample(rows, points=N_POINTS):
    if len(rows) <= points:
        return rows
    indices = [
        round(i * (len(rows) - 1) / (points - 1))
        for i in range(points)
    ]
    return [rows[i] for i in indices]


def main():
    with IN_CSV.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    sample = downsample(rows)

    payload = {
        "ep": [int(r["episode"]) for r in sample],
        "sq": [float(r["standard_reward"]) for r in sample],
        "mq": [float(r["modql_reward"]) for r in sample],
        "sp": [float(r["mean_q1_q2_spread"]) for r in sample],
    }

    OUT_JS.write_text(
        "/* Optional aligned chart export; live charts use trained_policy.js. */\n"
        "var SIM_ALIGNED = "
        + json.dumps(payload, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    print(f"Wrote {OUT_JS}")
    print(f"{len(rows)} episodes -> {len(sample)} chart points")


if __name__ == "__main__":
    main()
