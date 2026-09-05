# ALS Mobile Hub — Laiban Route Planning Prototype

This repository contains the web prototype and training code for the thesis **Enhancing a Q-Learning Based Algorithm Applied to Schooling Services in Underserved Philippine Communities**.

## Research algorithms

The Chapter 3 experiment compares:

- **Existing / control:** Standard Q-Learning — one Q-table, location-only state `S = L`, and a single-objective travel-efficiency reward.
- **Proposed / experimental:** **MODQL (Multi-Objective Double Q-Learning)** — two Q-tables (`Q1`, `Q2`), enriched state `S = <L,D,T,H,A>`, and the reward `Coverage × Jain's Fairness × (1 / Travel Cost)`.

The corrected experiment is in `training/train_q_learning.py`. Current results use placeholder Laiban/Tanay data and are for implementation validation only, not final Chapter 4 evidence.

## Maze Demo / Algorithm Comparison

Open **Research & Analysis → Algorithms → Maze Demo** in the web app.

The Maze Demo is now a controlled side-by-side comparison of:

- Standard Q-Learning
- Proposed MODQL

Both agents receive the **same 10×10 simulated environment**, community demand, and visit history. The demo is meant to make the algorithmic differences visible during the defense; it is not a substitute for the multi-episode statistical evaluation.

## Python maze prototype

`simple_maze_demo.py` is kept as the original standalone pygame prototype/reference. It is separate from the thesis-aligned Standard-Q vs MODQL comparison shown in the browser.

## Training

```bash
cd training
python train_q_learning.py
```

The aligned trainer runs 1,200 episodes for each algorithm and evaluates the trained policies on held-out simulated scenarios. See `training/README.md` for the exact state/reward mapping and data-status notes.

## Data status

The current node coordinates, learner counts, and road geometry are simulation placeholders pending the official datasets described in Chapter 3. Do not present the current placeholder metrics as proof that MODQL outperforms Standard Q-Learning; the real-data experiment must determine that.
