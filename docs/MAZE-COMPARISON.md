# Maze Comparison

Maze Comparison is a live, paired simulation of Standard Q-Learning and the
Enhanced Multi-Objective Double Q-Learning (MODQL) policy. The outputs are
computed from simulation runs; the page does not preload comparison metrics.
The simulation is not field evidence and does not establish an overall winning
algorithm.

## Scenarios and controls

The page has four fixed-seed tabs:

1. One agent and one target on a plain grid.
2. One agent and one target with static obstacles.
3. One agent and multiple targets with obstacles that may change every 20
   shared ticks.
4. The Laiban application, using the saved ALS Hub and nine-sitio schematic,
   learner allocation, previous-visit counts, visit recency, closed roads,
   simulated 38 mm/24h rainfall, a 480-minute shift and 60-minute service stops.

Both policies share a single environment, start location, destinations,
obstacles, seed, and training episode for each paired rollout. Tab 4's saved
road closures are preserved. Its additional temporary obstacle is explicitly
a simulated overlay and is applied only to open road cells. The sitio-level
learner allocation and visit history remain labeled simulated, not verified
field data.

Training is fixed at 5,000 episodes per policy, with alpha 0.10, gamma 0.90,
epsilon starting at 1.00, a 0.995 per-episode decay, and a 0.05 minimum. There
is no episode-count or seed control. Training runs asynchronously in short
chunks. Starting a comparison automatically trains policies if needed, then
begins a frozen evaluation. Reset clears only the displayed run and preserves a
completed trained policy. Advance One Step and the speed and travel-time-unit
selectors operate on the active tab. Shared-tick and obstacle-update counts
appear only for dynamic-obstacle scenarios.

## Policy and environment behavior

Both policies act using the same four cardinal movement actions. Walls,
obstacles, closed cells, and grid boundaries are the only movement constraints.
The Standard agent's Q-table key is its current grid location only. It does not
use demand, remaining time, visit history, accessibility, a goal position,
shared route planner, or shortest-path helper for action selection or learning.
Those quantities may still be displayed as environment measurements. Standard
uses epsilon-greedy exploration while training and a greedy, frozen policy
during evaluation. Time-budget and movement-limit terminations truncate
Standard training episodes without creating a time-dependent Q update.
Both side panels display demand, visit history, remaining time and current
reachability as environmental measurements. The Standard panel explicitly
labels them as display-only; they are not encoded in its Q state or update.

MODQL maintains Q1 and Q2. A random estimator is used for action selection in
each Double-Q update, and the other estimator evaluates that action. Its state
includes location, per-sitio demand buckets, remaining-time bucket, visit
history buckets, and current route accessibility. The final evaluation policy
is greedy on the combined Q1 and Q2 values.

MODQL's service reward is calculated from the selected site's demand relative
to the maximum site demand, Jain fairness after the candidate service is
projected, and travel-time efficiency. Its travel-time term uses the weighted
grid travel-time estimate to the candidate computed at the start of that
service leg. Standard receives one scalar travel-time reward. The reward
scales are different and are not compared as performance scores.

Every evaluation result is computed from its actual rollout: learners served
and coverage, Jain fairness, travel minutes, movement steps, destinations
served, deferred communities, completion state, and Q diagnostics. Before a
run starts, results display “Not run yet.” The assessment describes metric
differences and trade-offs; it does not produce an overall score or claims
beyond the selected simulated scenario.

The separate batch panel evaluates both frozen policies over 200 paired,
held-out seeded scenarios and calculates a mean and population standard
deviation for each reported outcome metric. These results remain separate from
the single-run table.

## SOP selector

The SOP questions and titles reuse the established Maze Comparison wording.
Objective statements are centralized in `maze-scenarios.js` and remain marked
“Objective wording pending”; no new thesis objectives are invented. The
selector presents the existing limitation, MODQL's corresponding approach,
and highlights the applicable result rows. Q-estimator differences and
estimated-return gaps are diagnostics only, not proof that overestimation bias
was reduced.

## Python baseline compatibility

The repository's `simple_maze_demo.py` imports `dynamic_maze_env.py`,
`baseline_confidence_agent.py`, and `reflection_agent.py`; those dependencies
are not present in the repository. The plain-grid tab implements the requested
single-agent, single-target Standard-Q baseline conditions in the browser, but
the exact Python program could not be executed or verified against this
simulation. The separate `maze-legacy.js` browser baseline is not substituted
for those missing Python sources.
