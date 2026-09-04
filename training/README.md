# /training -- real Q-learning training run

See the root README.md for the overall project. This folder contains
the ACTUAL training run of the Enhanced Double Q-Learning algorithm
(Section 3.2.1) -- what `engine.js`'s `planRoute()` now uses via
`trained_policy.js` in the project root.

| File | What it is |
|---|---|
| `train_q_learning.py` | Trains MODQL (Double Q) + Standard Q baseline, 1,200 episodes each |
| `make_sim_js.py` | Regenerates the root `charts.js` SIM block from a fresh training run |
| `training_log.csv` | Reward / drift / fairness logged every episode, both algorithms |
| `convergence_chart.png` | Training curve for the writeup/defense slides |
| `final_policy_modql.json` | Trained Q1/Q2 tables (also copied to `/trained_policy.js` in the project root) |
| `comparison_summary.json` | Headline metrics from a 50-simulated-day rollout of both trained policies |

**Still placeholder data.** DepEd registry data and the real road
network have been requested but not released yet. When they arrive,
replace `NODES`/`EDGES` at the top of `train_q_learning.py`, then:

```bash
python3 train_q_learning.py
python3 make_sim_js.py
```

...and copy the new `outputs/sim_block.js` over the `SIM` block in
`../charts.js`, and the new `outputs/final_policy_modql.json` into
`../trained_policy.js` (keep the `var TRAINED_POLICY = ...;` wrapper).
