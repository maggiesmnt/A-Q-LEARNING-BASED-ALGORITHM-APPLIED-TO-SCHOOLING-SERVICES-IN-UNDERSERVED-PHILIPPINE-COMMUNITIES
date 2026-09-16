# Training - Barangay Laiban Q-Learning Experiment

This folder contains the aligned comparison between Standard Q-Learning and MODQL.

## Experiment setup

- Standard state: S = L
- Standard reward: 1 / Travel Cost
- MODQL state: S = <L,D,T,H,A>
- MODQL reward: Coverage x Jain Fairness x (1 / Travel Cost)
- Training episodes: 2000
- Held-out evaluation scenarios: 200
- Shift length: 480 minutes
- Service duration: 60 minutes per sitio

Both algorithms use the same nine Barangay Laiban sitios, road graph, accessibility conditions, demand scenarios, historical-service initialization, time budget, and scenario seeds.

## Data status

The official Barangay Laiban CY 2026 OSY total of 284 is the learner-demand basis.
Because there is no official sitio-level OSY breakdown, the sitio allocation is controlled simulated data.
Historical service H, operational time T, and unresolved road details are controlled or explicitly marked simulation inputs.

## Run

From the repository root:

py .\training\train_q_learning.py

The trainer updates trained_policy.js and writes aligned outputs under training/outputs_aligned/.

Authoritative current outputs are the files under training/outputs_aligned/ and the root trained_policy.js. Older root-level training artifacts in this folder are retained only as legacy references and are not used by the live browser system.
