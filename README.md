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

## Running this in VS Code (no GitHub, no build step needed)

This is a plain HTML/CSS/JS app -- there's nothing to compile or install.
Two ways to run it:

**Option A -- Live Server extension (recommended)**
1. In VS Code, install the "Live Server" extension (by Ritwick Dey) from the Extensions tab.
2. Open this folder in VS Code (`File > Open Folder...`).
3. Right-click `index.html` in the file explorer > "Open with Live Server".
4. It opens in your browser and auto-reloads whenever you save a file.

**Option B -- Python's built-in server (no extension needed)**
1. Open a terminal in this folder (VS Code: `Terminal > New Terminal`).
2. Run: `python3 -m http.server 8000`
3. Open `http://localhost:8000` in your browser.

(Opening `index.html` directly by double-clicking it, with a `file://` URL,
will NOT work reliably -- the browser blocks some of the script loading.
Use one of the two options above.)

## New in this build: "Mark stop as completed"

The Drive tab now has a **Mark stop as completed** button under the
current-stop card. Clicking it:
- advances the deployment to the next stop (`PROGRESS++`)
- records that visit against the node's `visits30`/`days`, so the
  **next replan's fairness (Jain's Index) calculation reflects what was
  actually served today** -- not just the static seed data
- triggers the same `refresh()` repaint a hazard report does (map,
  stop list, progress bar, analysis tabs all update)
- disables itself and shows "Deployment complete" once every stop is done
