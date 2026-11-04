SHARED MAZE COMPARISON

Open index.html in a modern browser. No dependencies or build step are needed.
Research & Analysis now has a Maze Demo tab, registered by maze-demo.js without
changing index.html or its script order. Both canvases render ONE shared maze;
each agent keeps its own position, trail, metrics, and learning tables.

Controls (one row for both agents):
- Start Comparison / Pause Comparison: one timer, 200 ms per shared tick.
- Reset Comparison: new displayed seed, new maze, both learning agents cleared.
- Advance One Step: pause, then advance both unfinished agents once.
- Next Episode: new shared maze from the continuing seeded stream; retain Q
  tables and decayed exploration. Episode numbering has no artificial limit.
Finished agents wait while the other agent continues, up to 100 steps each.

Reproducibility:
Open index.html?mazeSeed=123 to replay a seed from episode one. For an identical
run, use the same Next Episode / step sequence. Playback timing does not affect
RNG draws. One makeRng factory derives separate environment, Standard, and MODQL
streams from the displayed seed. Exploration, ties, and Double-Q estimator
selection are seeded. No Math.random calls are used in the maze comparison.

Environment:
SIZE=10, OBSTACLE_RATIO=0.25 (before safety repairs), CHANGE_FREQUENCY=20,
MAX_STEPS=100, STEP_MS=200. Preserve STEP_PENALTY=-0.1,
COLLISION_PENALTY=-1.0, GOAL_REWARD=10.0 as environment shaping diagnostics;
the learning agents use the exact SOP objective rewards instead of shaping.
Each shared tick updates obstacles if due and repairs paths once, then reads
both actions before resolving Standard followed by MODQL. Neither agent can
mutate maze walls. Updates protect both current positions and the shared goal.
Collisions count toward the step limit and the shared obstacle-update schedule.

Algorithms and live metrics:
- Standard: one Q table, S=L, reward=1/(step travel time in hours).
- Full MODQL: Double Q-Learning, S=<L,D,T,H,A>, reward=
  normalized new demand * jain(service counts) * 1/(1+step travel hours).
- The existing engine.js jain() is reused. No second fairness implementation.
- Both panels show episode, steps, status, goal, latest move, epsilon, episode
  travel minutes, cumulative reward, and distinct cells visited.
- MODQL also shows each reward factor, the combined reward, and live mean
  absolute Q1/Q2 spread over the union of stored state/action pairs (zeros for
  missing entries). Spread is a stability diagnostic; this alone does not prove
  overestimation bias was eliminated. The UI identifies the paper's reported
  average 0.016 across 5,000 episodes separately from the live measurement.

Simulation definitions (also visible in the demo):
Cell demand is seeded 1-30 units, cell traversal time is seeded 1-5 minutes,
and initial service history is seeded 0-4 visits per quadrant. Both agents
receive the same fields/history. An attempted move consumes destination-cell
time; a collision consumes current-cell time. D is newly served demand divided
by total demand across all 100 cells, including currently blocked cells. Each
agent serves a cell once per episode; collisions/revisits yield zero new demand.
J is computed across the four quadrant service counts, including that agent's
new service visits. Coverage counts distinct visited cells including the start;
the starting cell receives no service until a successful return to it.
MODQL encodes L=current cell, D=remaining demand field (served cells set to 0),
T=elapsed minutes, H=quadrant service counts, and
A=four-direction accessibility mask. These are simulated maze analogues.
Reward totals have different scales and are not a performance ranking.

Evidence and integration:
This is a behavioural demonstration of SOP 1 and SOP 3 plus the SOP 2 update;
it does not reproduce Chapter 4 results. Compare Algorithms keeps the Laiban
route visualization and shows the stored shared-Laiban quantitative results
from TRAINED_POLICY via TRAINING_RESULT. Its former maze-mounting entry point
is retained as a no-op so rerenders cannot move the new demo into one column.
analysis.js therefore has a small required integration change in addition to
maze-demo.js, minimal scoped styles.css additions, and this README.
simple_maze_demo.py remains an independent legacy pygame reference; it is not
the implementation of the new two-agent comparison.

Deferred scope:
The four-configuration component ablation (Reward-Only, Double-Q-Only,
State-Only) is a separate phase. This revision implements only Standard
Q-Learning versus Full MODQL.

Implementation summary:
- Added makeRng, SharedDynamicMazeEnv (generateMaze, bfs, reset,
  ensureAgentNotTrapped, ensurePathExists, updateEnvironment, beginStep, step).
- Added StandardQLearningAgent and MODQLAgent (encodeState, selectAction,
  learn, and the MODQL spread diagnostic).
- Added resetComparison, stepBoth, shared startTimer/stopTimer/nextEpisode,
  panel/row builders, and aligned live render/draw functions.
- Replaced DynamicMazeEnvBrowser, BaselineConfidenceAgentBrowser, stepOnce,
  startEpisode/endEpisode UI lifecycle, and private mzPlay/mzStep/mzReset/mzNext
  buttons. Preserved the environment constants; removed MAX_EPISODES=5.
- analysis.js renderEvaluation now separates stored Laiban evidence from the
  independent maze tab; mountOriginalStandardMaze retains its global name.
- index.html, training code, and other global API names are unchanged.

Verification: node --test tests/maze-demo.test.js
Optional browser verification: node tests/maze-demo.browser.js (Node 22+ and
installed Chrome; set CHROME_PATH if Chrome is in a different location).
