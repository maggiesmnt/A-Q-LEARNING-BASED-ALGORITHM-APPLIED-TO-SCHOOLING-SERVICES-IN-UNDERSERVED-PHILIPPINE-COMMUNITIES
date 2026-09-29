# Training - Barangay Laiban Q-Learning Experiment

This folder contains the aligned baseline, component-ablation, pairwise-ablation,
and Full MODQL experiments.

## Experiment setup

- Standard state: S = L
- Standard reward: 1 / Travel Time (hours)
- MODQL state: S = <L,D,T,H,A>
  - D = localized per-sitio demand using 2 buckets
  - T = remaining 480-minute service-time budget using 2 buckets
  - H = per-sitio Historical Visit Index using 2 recency buckets
  - A = per-sitio route-accessibility using 2 buckets
- MODQL reward: Normalized Learner Demand x Jain Fairness x
  (1 / (1 + Travel Time Hours))
- Training episodes: 5000
- Held-out evaluation scenarios: 200
- Shift length: 480 minutes
- Service duration: 60 minutes per sitio

All configurations use the same nine Barangay Laiban sitios, road graph,
accessibility conditions, demand scenarios, historical-service initialization,
time budget, and scenario seeds.

## Data status

The official Barangay Laiban CY 2026 OSY total of 284 is the learner-demand basis.
Because there is no official sitio-level OSY breakdown, the sitio allocation is controlled simulated data.
Historical service H, operational time T, and unresolved road details are controlled or explicitly marked simulation inputs.

## Run

From the repository root:

`py .\training\train_q_learning.py`

The trainer updates `trained_policy.js` and writes aligned outputs under `training/outputs_aligned/`.

## Authoritative outputs

The current authoritative experiment artifacts are regenerated from policy version `laiban-methodology-state-v2`:

- `training/outputs_aligned/comparison_summary.json`
- `training/outputs_aligned/standard_policy.json`
- `training/outputs_aligned/modql_policy.json`
- `training/outputs_aligned/training_log.csv`
- `training/outputs_aligned/reward_state_evaluation_diagnostic.json`
- `training/outputs_aligned/reward_state_gamma_sensitivity.json`
- `training/outputs_aligned/reward_state_bucket_sensitivity.json`
- `training/outputs_aligned/reward_state_component_ablation.json`
- `training/outputs_aligned/reward_state_demand_interaction.json`
- root `trained_policy.js`

`charts.js` reads the embedded `TRAINED_POLICY.training_curves` data directly. `make_sim_js.py` is an optional aligned export helper only.
