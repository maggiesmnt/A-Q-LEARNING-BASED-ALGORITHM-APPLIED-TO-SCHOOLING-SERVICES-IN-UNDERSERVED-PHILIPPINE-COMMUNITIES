# Chapter 4 Results Summary

Generated 2026-11-06 from the four saved browser policies and the live Maze
Comparison evaluation implementation. This report does not change policies,
algorithms, or UI.

## Evaluation protocol and interpretation

- Each batch contains 200 paired held-out scenarios. Standard and MODQL use
  their current saved policies and share each scenario's world and seed.
- The batch seeds follow the live UI protocol:
  `scenario seed + 100000 + scenario index * 7919`, with index 0–199.
- Cells below are mean ± population standard deviation. Counts and percentages
  are computed per run before summarizing. Completion and loop rates are
  percentages; their SDs are percentage points. A zero SD means identical
  results over all 200 scenarios (floating-point noise in the UI's variance
  calculation is treated as zero in that case).
- Coverage percentage uses total scenario learners. Site counts are shown as
  `served / total sites` and `reachable sites served / reachable sites`.
  Laiban deferred counts use all nine table-backed sitios. Completion means
  the run's completion flag: all destinations for the small tabs and all
  initially reachable sitios for Laiban. Loop rate is the fraction flagged by
  the live repeated-two-cell-loop detector; it is a diagnostic, not a stop
  condition.
- Travel is the route's actual movement time in minutes, excluding service
  time. Batch results are from `MazeDemo.summarizeBatch` and
  `MazeRouting.metrics` in `maze-demo.js` and `maze-routing.js`.

## Batch results: Multi-Target and Laiban Case

| Scenario | Algorithm | Learners reached (count) | Learners reached (%) | Jain fairness | Travel (min) | Sites served / total | Reachable served / reachable | Deferred sites | Completed reachable sites (%) | Loop rate (%) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Multi-Target | Standard | 30 ± 0 | 21.73913043478261 ± 0 | 0.3 ± 0 | 110 ± 0 | 1 ± 0 / 6 | 1 ± 0 / 6 | 5 ± 0 | 0 ± 0 | 100 ± 0 |
| Multi-Target | MODQL | 138 ± 0 | 100 ± 0 | 0.8888888888888888 ± 0 | 49 ± 0 | 6 ± 0 / 6 | 6 ± 0 / 6 | 0 ± 0 | 100 ± 0 | 0 ± 0 |
| Laiban Case | Standard | 0 ± 0 | 0 ± 0 | 0.3968253968253968 ± 0 | 480 ± 0 | 0 ± 0 / 9 | 0 ± 0 / 5 | 9 ± 0 | 0 ± 0 | 100 ± 0 |
| Laiban Case | MODQL | 122.525 ± 7.163056261122057 | 43.14260563380273 ± 2.5222029088457965 | 0.5254600301659138 ± 0.01828476539467751 | 239.07071739759016 ± 12.637837685844305 | 3.95 ± 0.23979157616563604 / 9 | 3.95 ± 0.23979157616563604 / 5 | 5.05 ± 0.23979157616563604 | 0 ± 0 | 81.5 ± 38.82975663070779 |

### Basic Grid and Obstacles (short summaries)

- **Basic Grid:** Both algorithms: 40 ± 0 of 40 learners (100 ± 0%), fairness
  1 ± 0, travel 18 ± 0 min, 1 ± 0 of 1 site served, 0 deferred, 100 ± 0%
  completed, and 0 ± 0% loop rate.
- **Obstacles:** Both algorithms: 40 ± 0 of 40 learners (100 ± 0%), fairness
  1 ± 0, 1 ± 0 of 1 site served, 0 deferred, 100 ± 0% completed, and 0 ± 0%
  loop rate. Standard travel was 14.665 ± 6.3547442906855025 min; MODQL travel
  was 14.575 ± 6.11836375185392 min.

## MODQL Q1–Q2 difference during training

The policy JSON files do not save a per-episode Q1–Q2 spread curve. To provide
this diagnostic without changing saved policies, the deterministic 5,000
episode training procedure was replayed in memory with the existing scenario
seeds and live training functions. After each episode,
`Model.prototype.spread` computes the mean absolute Q1–Q2 difference across
the union of Q-table states and all four action entries. The final replayed
Q1/Q2 tables matched the corresponding saved policy tables exactly for every
scenario. Values are the mean, final-episode value, and maximum of those 5,000
episode-level spreads.

| Scenario | Mean absolute Q1–Q2 difference | Final episode | Maximum over 5,000 episodes |
|---|---:|---:|---:|
| Basic Grid | 0.004479702536828633 | 0.004239473358833614 | 0.005547540228541775 |
| Obstacles | 0.0038395863933062906 | 0.003744921958002411 | 0.0045583859231970916 |
| Multi-Target | 0.002679883767867322 | 0.002646710357822794 | 0.0032372753077753538 |
| Laiban Case | 0.001263292068448191 | 0.001186287947473835 | 0.001565426822251382 |

These are table-wide Q1/Q2 estimator differences, not the selected-action
estimate difference in a particular evaluation state and not a direct measure
of overestimation bias.

## Training success and distinct states

The last-500 success rates below use `run.success` for each training episode.
For Laiban, success means all initially reachable sitios were served; it does
not mean all nine sites were served. Distinct states are the unique populated
Q-table state keys; MODQL counts the union of Q1 and Q2 keys.

Current policy logs retain completion flags for Obstacles and Laiban. Basic
Grid and Multi-Target policy logs do not retain those flags, so their rates
were recovered by deterministic in-memory replay. The exact final Q-table
match noted above verifies that the replay reproduces the saved policies.

| Scenario | Standard success, last 500 | MODQL success, last 500 | Standard distinct states | MODQL distinct states |
|---|---:|---:|---:|---:|
| Basic Grid | 500 / 500 (100%) | 500 / 500 (100%) | 99 | 198 |
| Obstacles | 493 / 500 (98.6%) | 500 / 500 (100%) | 67 | 134 |
| Multi-Target | 0 / 500 (0%) | 498 / 500 (99.6%) | 73 | 734 |
| Laiban Case | 0 / 500 (0%) | 0 / 500 (0%) | 42 | 566 |

## Default demonstration run

These are single default-start runs loaded from each saved policy, not batch
averages. The demonstration uses the scenario's configured seed and start;
travel is in minutes. Laiban's service and total time use the live shift
accounting (60 minutes per served stop, 480-minute budget).

| Scenario | Algorithm | Learners (of total; %) | Jain fairness | Travel (min) | Sites served / total (reachable served / reachable) | Deferred | Completion status | Loop flagged |
|---|---|---:|---:|---:|---:|---:|---|---|
| Basic Grid | Standard | 40 / 40 (100%) | 1 | 18 | 1 / 1 (1 / 1) | 0 | All destinations served | No |
| Basic Grid | MODQL | 40 / 40 (100%) | 1 | 18 | 1 / 1 (1 / 1) | 0 | All destinations served | No |
| Obstacles | Standard | 40 / 40 (100%) | 1 | 24 | 1 / 1 (1 / 1) | 0 | All destinations served | No |
| Obstacles | MODQL | 40 / 40 (100%) | 1 | 24 | 1 / 1 (1 / 1) | 0 | All destinations served | No |
| Multi-Target | Standard | 30 / 138 (21.73913043478261%) | 0.3 | 110 | 1 / 6 (1 / 6) | 5 | Service-time budget exhausted | Yes |
| Multi-Target | MODQL | 138 / 138 (100%) | 0.8888888888888888 | 49 | 6 / 6 (6 / 6) | 0 | All destinations served | No |
| Laiban Case | Standard | 0 / 284 (0%) | 0.3968253968253968 | 480 | 0 / 9 (0 / 5) | 9 | Service-time budget exhausted | Yes |
| Laiban Case | MODQL | 124 / 284 (43.66197183098591%) | 0.5294117647058824 | 236.28063413453313 | 4 / 9 (4 / 5) | 5 | Travel-time budget exhausted | Yes |

For the Laiban default run, Standard's service time is 0 min and total is
480 min of 480 min. MODQL's service time is 240 min and total is
476.28063413453313 min of 480 min (shown in the UI rounded to whole minutes).

## Scenario variation and policy currency

| Scenario | What varies between training/evaluation runs | Saved policy status |
|---|---|---|
| Basic Grid | Fixed open grid and start `(0,0)`; scenario seed varies, but no obstacles or dynamic overlay are used. | Policy is for seed 101 and the saved Basic Grid scenario. |
| Obstacles | Fixed obstacle map. Training samples start cells from the 67 open, non-target cells. The held-out batch cycles through those starts; its scenario seed also varies. The default demonstration starts at `(0,0)`. | Policy is for seed 202 and the fixed obstacle map; it was updated with the obstacle comparison setup. |
| Multi-Target | Fixed seed-303 obstacle map and start `(0,0)`; held-out scenario seeds vary. No dynamic overlay is used. | Policy was regenerated with the fixed Multi-Target map in commit `f806ecd`. |
| Laiban Case | Fixed 10×10 layout and start `(0,0)`. Held-out seeds vary; the temporary obstacle is reselected from eligible open roads every 20 ticks during a run. The two agents share each evaluation world. | Policy was regenerated after the Laiban passability/layout update in commit `8441bef`; its training timestamp is 2026-11-05 21:55:17 UTC, before the 2026-11-06 06:02 +0800 commit. |

The scenario-specific policy metadata and commit history show that the saved
policies were regenerated for the corresponding current fixed layouts:
Basic Grid in `f61cf64`, Obstacles in `b9c5cb1`, Multi-Target in `f806ecd`,
and Laiban Case in `8441bef`. The current uncommitted scenario-file change
only enables the Laiban time-breakdown display; it does not change the map or
policy behavior.

## Fairness when a run serves no destination

`MazeRouting.metrics` uses the run's updated fairness value if a service has
occurred; otherwise it calculates `MazeRouting.fairness(run.visits)`.
`makeRun` initializes that visit vector from each site's stored
`initialVisits`, so zero destinations served in the current run does not mean
the fairness input is nine zeros. For Laiban the initial visit counts are
`[1, 1, 0, 0, 1, 0, 2, 0, 0]`. Jain's index is
`(sum(x)^2) / (n * sum(x^2))`, yielding `25 / 63 =
0.3968253968253968`, displayed as `0.3968` for Standard in the default
demonstration.

## Source files

- `policies/tab-1.json` through `policies/tab-4.json`: current saved Q tables,
  scenario metadata, and training logs.
- `maze-demo.js`: paired batch seed/start protocol and population mean/SD.
- `maze-routing.js`: policy loading, training/evaluation, metrics, fairness,
  completion, loop detection, and Q1–Q2 spread.
- `maze-training-worker.js`: seeded 5,000-episode training procedure and
  per-episode logs.
- `maze-scenarios.js`: scenario starts, maps, site sets, budgets, and dynamic
  Laiban overlay settings.
- `engine.js`: Laiban service-site visit initialization and 480-minute /
  60-minute service constants.
