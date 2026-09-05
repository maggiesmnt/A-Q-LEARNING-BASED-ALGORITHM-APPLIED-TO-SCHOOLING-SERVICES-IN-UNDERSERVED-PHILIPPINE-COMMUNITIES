# Python prototype (offline, pygame)

`simple_maze_demo.py` is the original standalone maze-navigation demo.
It is **not** part of the live ALS Mobile Hub web app (that's pure
HTML/CSS/JS — see the repo root). It's kept here for reference and for
running the real trained agent locally, outside the browser.

## Status

The live app now has its own **Maze Demo** tab (Research & Analysis →
Algorithms → Maze Demo), built in `maze-demo.js` at the project root.
It reproduces the same visual — a ball moving through a 10x10 grid
from start to goal, walls, a dynamically-mutating maze — directly in
the browser with plain Canvas, no Python/pygame required.

## Missing pieces

This script imports three modules that were not included with it and
do not exist anywhere else in this repository:

- `dynamic_maze_env.py` (`DynamicMazeEnv`)
- `baseline_confidence_agent.py` (`BaselineConfidenceAgent`)
- `reflection_agent.py` (`ReflectionAgent`)

Without them, this script cannot run as-is, and the in-browser tab
currently substitutes a simple shortest-path search in their place
(labeled "SIMULATED DATA" in the UI, consistent with the placeholder
labeling already used elsewhere in the Analysis tab).

Add those three files here to:

1. Run this pygame script locally against the real trained policy.
2. Port the same policy logic into `maze-demo.js` so the in-app tab
   shows actual learned behavior instead of the placeholder.

## Running locally

```bash
pip install pygame numpy
python simple_maze_demo.py
```
