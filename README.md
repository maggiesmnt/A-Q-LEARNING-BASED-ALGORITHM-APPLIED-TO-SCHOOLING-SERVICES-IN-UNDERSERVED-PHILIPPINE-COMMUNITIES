# ALS Mobile Hub — Laiban Ops

Mobile schooling route optimization prototype for the thesis
*"Enhancing a Q-Learning Based Algorithm Applied to Schooling Services in
Underserved Philippine Communities."*

No build step, no npm install. Pure HTML/CSS/JS + Leaflet (loaded via CDN).

## Open in VS Code

1. Open this folder in VS Code (`File → Open Folder…`).
2. Install the **Live Server** extension, then right-click `index.html` →
   **Open with Live Server**. (Or just double-click `index.html` — it also
   works opened directly in a browser.)
3. If you have GitHub Copilot in VS Code, it will automatically read
   [`.github/copilot-instructions.md`](.github/copilot-instructions.md) as
   workspace context for every Copilot Chat / edit session in this repo —
   that file is the project spec. Update it if the requirements change;
   Copilot will pick up the new version on the next request.

## Project structure

```
index.html              shell: header, 4 views, bottom tab bar, report sheet
styles.css               all styling
engine.js                  environment, road-accessibility/hazard model,
                            planRoute() [MODQL] and planRouteStandard() [baseline]
map.js                      Leaflet map + drawing
drive.js                     turn-by-turn card, refresh/replan, report sheet
stops.js                      "today's deployment" list
hazards.js                     road & hazard status view
charts.js                       SVG chart helper + illustrative training curves
analysis.js                      Existing Algorithm / Proposed Algorithm / SOP 1-3 tabs
app.js                            tab bar wiring + boot sequence
.github/copilot-instructions.md    project spec for GitHub Copilot
```

## Views

- **Drive** — the live map: vehicle position, route, next stop, ETA.
- **Stops** — today's full deployment list + deferred communities.
- **Hazards** — road accessibility status and the field hazard-report feed.
- **Analysis** — kept separate from the operational views:
  - *Existing Algorithm* / *Proposed Algorithm* — each shown on its own
  - *SOP 1 / SOP 2 / SOP 3* — Statement-of-the-Problem-aligned comparisons
