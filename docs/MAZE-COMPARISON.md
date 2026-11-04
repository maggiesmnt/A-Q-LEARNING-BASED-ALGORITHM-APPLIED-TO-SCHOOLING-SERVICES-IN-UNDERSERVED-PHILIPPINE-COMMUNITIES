# Shared maze comparison

This revision on `copyNgKayLindsay` extends the existing comparison incrementally.
The maze is an explicitly simulated behavioural demonstration. It does not
replace the Barangay Laiban experiment or establish an overall winning algorithm.

## Architecture and preserved behaviour

`maze-demo.js` retains `makeRng` and `SharedDynamicMazeEnv`. One environment
contains the walls, start, exit, six destinations, cell travel times and demand.
Both occupants have separate positions, trails, visited destinations and service
histories. The environment advances once per shared tick. Both policies choose
before movements resolve in the documented Standard-then-MODQL order. Movement
does not modify walls; only environment updates and safety repairs do so.

`maze-routing.js` is a grid graph adapter for the destination-action structure
in `training/train_q_learning.py`. Open cells are vertices, legal cardinal moves
are directed edges weighted by the entered cell's traversal minutes, and six
seeded service cells are destination actions. Each policy ranks feasible
destinations by its learned Q values. The common Dijkstra executor only supplies
the cells needed to realize that chosen action, replanning when obstacles change.
It does not choose a destination or replace a learned decision with shortest-path
or immediate-reward ranking. Untrained state/action ties are deterministic and
explicitly labeled. The two policies are free to select different destinations.

Standard uses one Q table, a location-only state, inverse travel-hour rewards,
and the standard maximum bootstrap. MODQL preserves nonlinear reward
multiplication, two Q estimators, and decoupled action selection/evaluation.
Its D/H/A vectors retain destination identity in stable A-F order, using the
research two-bucket rules; T represents remaining operational time.
`demandBucket`, `historyBucket`, and `jain` reuse the existing engine helpers.
The grid-specific binary accessibility and 120-minute budget are documented
adaptations, not Laiban observations or an assertion of numerical equivalence.

`maze-legacy.js` restores the original pre-comparison browser maze from commit
`7d63c82`. Only its host/tab selectors change. The retained baseline code
preserves its original random environment, reward shaping, single-table
agent, experience replay and controls. An automated source comparison checks this.

`index.html` adds one legacy host plus two script tags before `maze-demo.js`.
The relative order of all existing scripts is retained. Existing global APIs are
not renamed. Maze Comparison is now the default main page. The research brand,
research tab controls, and original baseline menu entry are removed from the
header; the theme toggle remains. Other research content is retained internally.
`engine.js`, `analysis.js`, `trained_policy.js`, `training/` and the component
experiments are unchanged by this revision.

## Training, evaluation and controller

Training is explicit and separate from playback. Both agents receive the same
scenario and number of training episodes (100, 200, 500 or 1,000). Learning uses
alpha 0.1, gamma 0.9, epsilon 1 with decay 0.995 and minimum 0.05. Independent
seed-derived RNG streams govern each policy's training exploration/ties and
MODQL estimator coin flips. The environment has its own seed-derived stream.
The scenario is regenerated identically for each paired training rollout.

The displayed evaluation restores the scenario and uses frozen greedy tables.
Evaluation selection never draws exploration randomness, inserts Q rows or
updates models. Previously unseen actions retain their algorithmic zero
initialization; a stable destination-order tie is labeled as unseen rather than
presented as a trained recommendation. The UI reports the equal training budget.

One timer controls both agents: Start, Pause, Resume, step and speed changes.
Changing speed replaces the existing timer rather than adding another. A
finished agent remains still while the other continues. Reset restores the same
environment and clears rollout status while retaining models; it also cancels
pending training without discarding any prior completed models. Loading a new
seed invalidates incompatible models. Training work runs in bounded batches;
cancellation tokens prevent stale batches from overwriting a new scenario.
Leaving the comparison with pointer or keyboard navigation pauses playback.

Both algorithms have 120 minutes, 100 movement steps and 10-minute services.
Feasible actions reserve travel to the shared exit. Obstacles change every 20
shared ticks, including while an agent is traveling. Agents replan physical
paths, and may terminate with a genuine path/time/step failure. Returning to the
exit is a common non-learning operation without a goal reward. A service is
counted only after arrival and charging service time. Each destination is served
at most once per agent.

## Metrics and sources

All synthetic inputs are generated once for the scenario and shared. They are
not claimed to be measured community data. Demand is 1-30 learners per selected
destination; cell traversal time is 1-5 minutes; prior visits are 0-4 per
destination and recency is 1-30 days. Both policies receive identical initial
values. Individual service records evolve independently.

| SOP / metric | Source and definition |
| --- | --- |
| SOP 1: current reward | Most recently completed destination decision. Standard: `1 / travelHours`; MODQL: `(destinationDemand / maximumDestinationDemand) * J * 1/(1+travelHours)`. An aborted service decision earns zero. |
| Cumulative reward | Sum of that agent's decision rewards. Algorithm-specific units; deliberately not ranked. |
| Learners / coverage | Sum of demand at uniquely served destinations; denominator is total demand of the same six destinations. |
| Jain fairness | Existing `engine.js` `jain()` applied to the six initial visit counts plus that agent's completed visits. Initial fairness can therefore be nonzero before new service. |
| Travel time | Sum of actual entered-cell traversal times, including exit transit; service time is charged separately to the common budget. Records remain in minutes. A shared selector displays minutes (`78 min`, at most one decimal) or hours (`1.30 hr`, two decimals, the default). Both panels, table and live explanations follow that selector; rounding is never fed back into calculations. |
| Travel efficiency | `1/(1+routeTravelHours)` for the last completed service decision. Measured externally for Standard; part of MODQL reward. |
| Destinations | Number of unique completed services, not the number of cells crossed. |
| Deferrals | Initially pending/unserved; finalized only at termination. Reasons distinguish blocked service/exit paths, insufficient remaining time and other terminal failures. |
| Steps | Actual legal cardinal cell transitions. Both obey the same walls and movement constraints. |
| Completion | Whether the exit was reached, with served count shown separately. Reaching the exit does not imply every destination was served. |
| SOP 2: Q / Q1 / Q2 | Estimates sampled at the last selected destination action. Standard's single Q; MODQL's Q1, Q2 and their mean. No evaluation update occurs. |
| Estimator difference | Absolute Q1-Q2 difference at the sampled state/action. |
| Estimator spread | Mean absolute Q1-Q2 difference over all stored state/action pairs, treating absent entries as zero. Stability diagnostic only. |
| Training update | Most recent actual training table, before/after values and total update count. Labeled as training, never as a playback update. |
| Estimate-return gap | At completion, mean of sampled trained-action estimates minus realized discounted returns measured in the frozen rollout. Unknown actions are excluded. Discount is 0.9 per destination decision, not per grid cell. |
| SOP 3: L | Current cell from the shared environment's independent occupant position. |
| D | Actual remaining learner demand in A-F order; served destinations are zero. Enriched state buckets demand relative to maximum demand; inaccessible destinations have zero D/A buckets, matching the research encoder. |
| T | Remaining operational minutes, minus travel and service, encoded into two time buckets. |
| H | Per-destination days since service, reset to zero after service; encoded into recent/neglected buckets using `historyBucket`. |
| A | Current route reachability from the occupant's cell to each unserved destination; binary grid access, not a fabricated Laiban road-condition score. |

Standard observes only L. Its displayed coverage, fairness, demand and time are
external evaluator measurements. Feasible-action masking enforces the same
physical constraints for both policies without enriching Standard's Q-table
state. The comparative table uses common definitions and direction labels;
lower travel/steps must be interpreted alongside the service delivered. Q
diagnostics and state information remain separate from the outcome comparison.

## Verification and limits

The current UI omits the redundant Run Details strip. Completion is shown beside
each algorithm name and in Comparative Performance Results; Movement Steps
remains in that table. Shared exit coordinates and the latest-decision row are
not displayed, while underlying positions, actions and histories remain intact.
SOP sections use a balanced metric grid and grow with the card, without an internal
scrollbar. A single `activeSop` selection drives both panels: SOP 1 is the default,
selecting another tab hides the other two sections, and reselecting the active
tab keeps it displayed. Arrow keys/Home/End support keyboard selection. These
controls do not render a new rollout, touch learned tables or alter playback.
Deferred counts remain in the results table; the redundant detail dropdown is
removed while the underlying deferral records remain intact.

SOP 1 prioritizes learner coverage (including a live progress bar), Jain fairness,
travel hours, communities served and pending/final unserved counts. Reward
verification remains in a secondary disclosure. SOP 2 explains decision values
and estimator disagreement without assigning an invented reliability rating.
SOP 3 displays actual environmental values in both panels while explicitly
distinguishing Standard's location-only policy from MODQL's enriched inputs.
The technical state encoding remains available in a disclosure.
Primary metric titles and comparative table headers are white in dark mode;
secondary descriptions retain muted contrast. Light mode retains readable dark
text. Travel display selection persists across resets within the page session,
does not change the timer or policies, and refreshes an open explanation.

Each metric title is a semantic button with a restrained information cue.
Click/tap or Enter opens its explanation in one shared nonmodal popover. Clicking
the same title, clicking outside, using the close button, Escape, or changing SOP
closes it. Escape/close restores focus to the originating title. The popover stays
inside the SOP column and below visible simulation controls, is repositioned on
scroll/resize, and never expands the card or covers the maze. Long explanations
scroll within the compact overlay. It is refreshed from live records using
`textContent`, preserving the current explanation as the run progresses. Worked examples
verify coverage, Jain's existing visit-count formula, remaining time, reward
factors, estimator differences and the last actual TD update. Last-service route
time is reconstructed from the stored travel efficiency term and identified as
such; an aborted decision's zero reward is not attributed to stale service
factors. Missing samples and single-table-inapplicable diagnostics are identified.
Explanations cite the local implementation and distinguish seeded data from field
records. They do not change stored metrics or value updates.

The maze rendering adapts `maze-legacy.js`: the same cell-centered Canvas grid,
small circular history dots (radius 0.10 cell), filled goal/agent circles and 200 ms default clock
are retained. The comparison omits extra labels and outlined destination markers
to match the original screenshot; community data remains in Routing Awareness.
`paintOriginalMaze` directly adapts the original paint sequence from commit
`7d63c82`: exact theme tokens, one-pixel grid strokes, all previous history dots
(including repeated visits), and 0.30-cell goal/agent circles. Standard uses the
original trail token; MODQL adapts its hue with the same transparency. An
automated test executes both painters against the same scenario and checks the
complete sequence of raster operations, colors, positions and circle sizes.
The original baseline redraws immediately at each tick. The comparison now uses
that Canvas arc approach for the agent as well, replacing the DOM/CSS marker.
One shared requestAnimationFrame loop interpolates each actual adjacent-cell
transition for both panels, independently of the unchanged 200 ms physics clock.
This smooth interpolation is an adaptation, not an animation mechanism claimed
to exist in the original baseline. Reset changes the visual world immediately;
speed changes shorten visual transitions without changing a route. The shared executor
already advances at most one legal cardinal cell per tick toward each policy's
chosen destination. No final route is prepainted and no substitute route is made
up for presentation. Reduced-motion preferences disable visual transitions.

Algorithm Performance Assessment reads the completed frozen rollout records.
Both runs must reach the shared exit and provide finite, consistent metrics.
Outperformance requires no worse result on learner coverage, Jain fairness,
travel minutes, destinations served and final deferrals, with at least one
strict improvement. Higher coverage/fairness/destinations and lower travel/
deferrals are desirable. Conflicting metrics produce Mixed Results / Trade-offs;
ties, incomplete runs, failures and invalid records produce Insufficient
Evidence with an explanation. Rewards and step counts never determine this
assessment. It is descriptive of this one scenario, not an aggregate or
statistical superiority finding. The assessment does not mutate either model
or rollout record.

Run `node --test tests/maze-demo.test.js` for deterministic training/replay,
frozen-table checks, movement/order invariants, budget accounting, actual Q-based
destination selection, Double-Q target calculations, exact reward factors,
live state encoding, shared timers/speed, training cancellation and restored
baseline source preservation.

Run `node tests/maze-demo.browser.js` with Node 22+ and Chrome (or `CHROME_PATH`)
for actual page integration: training, evaluated replay, pause/resume/reset/speed,
aligned light/dark metrics, responsive layout, original baseline controls and
preserved Laiban rendering. No new package dependency is needed.

Limitations:

- These models are trained for the selected maze, then evaluated on that same
  scenario. This is a transparent behaviour replay, not held-out generalization
  evidence or a replacement for the stored Laiban evaluation.
- Finite training can leave unseen state/actions. The UI labels these; it never
  silently substitutes the operational engine's immediate-reward fallback.
- Q1/Q2 disagreement and a single estimate-return gap do not demonstrate
  overestimation-bias reduction. The gap is descriptive and shares a trained
  state/action sampling limitation; multiple independent held-out rollouts and
  uncertainty estimates would be needed for an inferential bias claim.
- Models are held in memory and are lost on reload. Reset within a session
  preserves models; explicit retraining or loading a different seed replaces them.
- Environment safety repair is shared and can depend on both occupants'
  positions. It is a joint dynamic scenario, not independent per-agent mazes.
- Seeded synthetic demand/history/travel and binary grid accessibility are
  documented simulation assumptions, not observed Barangay Laiban data.

All existing Standard, Reward Only, Double Q Only, State Only and Full MODQL
research configurations retain their original code, datasets and outputs.
