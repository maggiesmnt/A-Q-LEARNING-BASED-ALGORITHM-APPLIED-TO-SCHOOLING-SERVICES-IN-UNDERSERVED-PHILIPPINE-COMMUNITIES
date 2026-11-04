SHARED MAZE POLICY COMPARISON

Open index.html in a modern browser. No build step or packages are required.

1. Open index.html. Maze Comparison is the main page; no tab selection is needed.
2. Choose a scenario seed and Load Scenario, or keep the displayed seed.
3. Choose an equal episode budget and click Train Both Policies.
4. After training completes, Start Comparison runs frozen greedy policies.
5. Pause / Resume, Advance One Step, and Simulation Speed control both agents.
6. Reset Comparison replays the SAME scenario and PRESERVES trained tables.
   Reset during training cancels pending work and retains any previous model.
7. To change the environment, load a different seed and train new maze policies.

Use index.html?mazeSeed=123 to reproduce a scenario. Match the training episode
budget as well as the seed to reproduce the policies and evaluation. Playback
speed, pauses, and resets do not consume policy RNG or change frozen weights.
Models live in memory for this page session and are not persisted on reload.

The retained original baseline source restores the pre-comparison random maze
and BaselineConfidenceAgentBrowser from commit 7d63c82, including its original
replay-buffer learning, reward shaping, episode controls, and five-episode cycle.
Only DOM host/tab selectors were changed in the restored source.
The top navigation and original-baseline menu button are removed; the main
interface shows only the maze comparison and retains the theme toggle.

The shared comparison uses the actual destination-action structure of the
research algorithms through maze-routing.js:
- Standard: single Q table, S=L, R=1/route travel hours.
- Enhanced MODQL: Q1/Q2 with decoupled selection/evaluation; S=<L,D,T,H,A>;
  R=(destination demand/max demand)*JainFairness/(1+route travel hours).
- Policies choose a service destination. A common shortest-time grid executor
  realizes that choice along legal cardinal edges. It never ranks destinations.
- Two-bucket D/T/H/A definitions mirror training/train_q_learning.py, with
  binary grid accessibility and a maze-specific operational time budget.
- The bundled Laiban policy is NEVER relabeled or replayed as a grid policy.

Scenario: one 10x10 maze, initial obstacle ratio 0.25 before safety repairs,
same start/exit, six seeded service destinations, seeded demand 1-30 learners,
traversal time 1-5 minutes, initial visits 0-4, and recency 1-30 days.
Both agents have 120 minutes, 10-minute service stops, and 100 movement steps.
Obstacles update once every 20 shared ticks; path/trap repairs run once per
tick and protect both occupants. Both panels render the same live maze object.
The environment can block a service site; that produces a real deferral.
Arrival charges service time; exit transit has no reward.
Training uses alpha=0.1, gamma=0.9, epsilon=1 decaying by 0.995 to 0.05.
Evaluation uses epsilon zero and performs no Q-table writes or RNG draws.

Metric definitions, sources, test details, file responsibilities, and scientific
limitations are documented in docs/MAZE-COMPARISON.md and in the UI.

Research preservation:
- Compare Algorithms retains the existing Laiban route and stored results.
- engine.js, analysis.js, trained_policy.js, and all training scripts/outputs
  are unchanged by this revision.
- Standard, Reward Only, Double Q Only, State Only, Full MODQL, and existing
  additional component experiments retain their original definitions.
- Grid outcomes are behavioural demonstrations, not Chapter 4 evidence.
- Scenario-specific training followed by replay is not held-out evaluation.
- A completed-run assessment reports five-metric dominance or trade-offs for
  the current scenario only. It does not establish aggregate/statistical
  superiority, fabricate bias reduction, or assign an overall score.

Files:
maze-demo.js        Shared environment, centralized controller, canvases/status.
maze-routing.js     Grid adapter, destination policies, training/evaluation.
maze-legacy.js      Original baseline source with isolated DOM selectors.
styles.css         Scoped comparison/status/results layout.
index.html         One legacy host and two extra scripts; existing order retained.
README-INSTALL.txt  Usage and verification.
docs/MAZE-COMPARISON.md  Architecture, metric sources, limitations.
tests/maze-demo.test.js  Dependency-free model/controller regression tests.
tests/maze-demo.browser.js  Chrome integration and visual-layout checks.

Verification:
node --test tests/maze-demo.test.js
node tests/maze-demo.browser.js

Browser checks require Node 22+ and installed Chrome. Set CHROME_PATH if needed.
The browser integration loads the normal page, including existing external
Leaflet/font assets. No dependencies were installed for this revision.
