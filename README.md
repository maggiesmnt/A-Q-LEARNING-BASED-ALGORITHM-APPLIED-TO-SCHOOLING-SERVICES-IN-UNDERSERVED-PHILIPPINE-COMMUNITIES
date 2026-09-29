# Python prototype (offline, pygame)

`simple_maze_demo.py` is the original standalone maze-navigation demo.
It is **not** part of the live ALS Mobile Hub web app (that's pure
HTML/CSS/JS — see the repo root). It's kept here for reference and for
running the real trained agent locally, outside the browser.

## Status

The live app has a **Maze Demo** tab (Research & Analysis → Algorithms →
Maze Demo), built in `maze-demo.js` at the project root. It adapts the
dynamic environment and baseline confidence-agent behavior for the browser,
including a 10x10 grid, changing obstacles, and moving goals. The demo runs
directly in Canvas without Python or pygame.

## Missing pieces

This script imports three modules that were not included with it and
do not exist anywhere else in this repository:

- `dynamic_maze_env.py` (`DynamicMazeEnv`)
- `baseline_confidence_agent.py` (`BaselineConfidenceAgent`)
- `reflection_agent.py` (`ReflectionAgent`)

Without them, the standalone Python script cannot run as-is. The browser demo
is a separate JavaScript adaptation and does not import these Python modules.

Add those three files here to:

1. Run this pygame script locally against the real trained policy.
2. Compare the standalone implementation against the browser adaptation.

## Running locally

```bash
pip install pygame numpy
python simple_maze_demo.py
```
