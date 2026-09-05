# /training — Chapter 3 aligned Q-learning experiment

This folder contains the research experiment used to compare the Chapter 3 control and proposed algorithms.

| File | Purpose |
|---|---|
| `train_q_learning.py` | Trains Standard Q-Learning and MODQL for 1,200 episodes under the same simulated environment |
| `comparison_summary.json` | Current validation summary from 100 held-out simulated scenarios |
| `outputs_aligned/standard_policy.json` | Trained single-table Standard Q-Learning control policy |
| `outputs_aligned/comparison_summary.json` | Copy of the aligned validation summary |
| `training_log.csv` / legacy outputs | Previous experiment artifacts retained for traceability |

## Research alignment

**Existing / control — Standard Q-Learning**

- State: `S = L` (current location only)
- One Q-table
- Reward: `1 / Travel Cost`
- Standard max-based Q update

**Proposed / experimental — MODQL**

- State: `S = <L,D,T,H,A>`
- `D`, `T`, `H`, and `A` are explicitly observed and discretized so the state remains finite for tabular learning
- Two independently updated tables, `Q1` and `Q2`
- Reward: `Coverage × Jain's Fairness × (1 / Travel Cost)`
- Action selection and evaluation are decoupled during the Double Q update

## Data status

The current Laiban/Tanay nodes, learner counts, and road network are **simulation placeholders**. The current results are for implementation validation only and must not be presented as final Chapter 4 evidence. Once the official DepEd/OSM/weather datasets are available, replace the environment data and re-run:

```bash
python train_q_learning.py
```

The current placeholder run does **not** establish that MODQL is superior to Standard Q-Learning on all metrics. That is a valid experimental finding and should remain visible until the real-data experiment is completed.
