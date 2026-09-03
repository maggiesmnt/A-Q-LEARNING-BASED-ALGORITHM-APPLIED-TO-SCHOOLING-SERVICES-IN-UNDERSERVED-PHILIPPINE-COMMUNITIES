# Enhanced Double Q-Learning -- training run (placeholder data)

Actual training run of the algorithm in Section 3.2.1 of the thesis, on
the same placeholder node/edge data already used in the GitHub
prototype's `engine.js`. Fills the gap the prototype's own code
comments flag: `engine.js` only replays a fixed greedy formula, it
never runs Q1/Q2 through real episodes.

**Still not final-defense data.** DepEd registry data and the real
road network have been requested but not released yet. Swap `NODES` /
`EDGES` in `train_q_learning.py` for the real data when it arrives and
re-run both scripts below -- nothing else needs to change.

## Files in this folder

| File | What it is |
|---|---|
| `train_q_learning.py` | Trains MODQL (Double Q) and the Standard Q baseline, 1,200 episodes each |
| `make_sim_js.py` | Converts `training_log.csv` into a paste-ready `SIM` block for `charts.js` |
| `training_log.csv` | Reward, `\|Q1-Q2\|` drift, and fairness, logged every episode, both algorithms |
| `sim_block.js` | **Paste this over the `var SIM = ...` block in charts.js** |
| `convergence_chart.png` | Chapter-4-style training curve, for the writeup/defense slides |
| `final_policy_modql.json` | Trained Q1/Q2 tables + node bit-index |
| `comparison_summary.json` | Headline metrics from a 50-simulated-day rollout of both trained policies |

## Reading the results honestly

1. **The reward curves aren't on the same scale.** MODQL's reward is
   `coverage x fairness / cost`; the baseline's is `1 / cost` only.
   The baseline sitting higher on the chart does **not** mean it's
   "better" -- compare policies on the rollout metrics in
   `comparison_summary.json`, not on raw reward magnitude.
2. **The fairness gap is small on this placeholder map** (9 nodes,
   `visits30` already dominates the Jain's Index baseline before an
   episode starts). Expect a clearer gap once real DepEd node counts
   and enrollment spread go in.

## Re-running

```bash
python3 train_q_learning.py   # writes training_log.csv, convergence_chart.png, etc.
python3 make_sim_js.py        # reads training_log.csv, writes sim_block.js
```

No arguments needed -- hyperparameters, episode count, and random
seeds are all set at the top of `train_q_learning.py`.
