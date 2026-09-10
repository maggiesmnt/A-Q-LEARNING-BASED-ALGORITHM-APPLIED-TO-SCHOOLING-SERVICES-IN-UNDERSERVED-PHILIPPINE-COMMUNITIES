/* ============================================================
   Maze Demo — browser port of simple_maze_demo.py
   -----------------------------------------------------------
   Renders maze-navigation visualizations inside both algorithm panels
   in the "Research & Analysis" view.

   IMPORTANT — placeholder policy:
   dynamic_maze_env.py, baseline_confidence_agent.py and
   reflection_agent.py (imported by simple_maze_demo.py) were not
   available, so the maze generation / movement below is a
   lightweight stand-in (BFS shortest path) that reproduces the
   same *visual* demo — a ball navigating a 10x10 grid from start
   to goal, red = agent, green = goal, yellow = walls, with the
   maze mutating every CHANGE_FREQUENCY steps like the original
   DynamicMazeEnv. Once those three files are added to the repo,
   replace stepOnce()/makeMaze() below with real calls into the
   trained Q-table / policy so this shows actual learned behavior
   instead of a placeholder path search.
   ============================================================ */
(function () {
  const SIZE = 10;
  const OBSTACLE_RATIO = 0.25;
  const CHANGE_FREQUENCY = 20; // matches change_frequency=20 in the original env
  const MAX_STEPS = 100;
  const STEP_MS = 220;

  let maze, start, goal, agentPos, path, pathIdx, steps, episode, timer, running, history;

  function el(id) { return document.getElementById(id); }

  function bfsPath(m, s, g) {
    const key = (p) => p[0] + ',' + p[1];
    const q = [s];
    const prev = { [key(s)]: null };
    const seen = new Set([key(s)]);
    while (q.length) {
      const cur = q.shift();
      if (cur[0] === g[0] && cur[1] === g[1]) {
        const out = [];
        let k = key(cur);
        while (k !== null) {
          const [r, c] = k.split(',').map(Number);
          out.unshift([r, c]);
          k = prev[k];
        }
        return out;
      }
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = cur[0] + dr, nc = cur[1] + dc;
        if (nr < 0 || nc < 0 || nr >= SIZE || nc >= SIZE) continue;
        if (m[nr][nc] === 1) continue;
        const nk = nr + ',' + nc;
        if (seen.has(nk)) continue;
        seen.add(nk);
        prev[nk] = key(cur);
        q.push([nr, nc]);
      }
    }
    return null;
  }

  function makeMaze() {
    let m, s, g, ok = false, tries = 0;
    s = [0, 0];
    g = [SIZE - 1, SIZE - 1];
    while (!ok && tries < 50) {
      tries++;
      m = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE; j++) {
          if (Math.random() < OBSTACLE_RATIO) m[i][j] = 1;
        }
      }
      m[s[0]][s[1]] = 0;
      m[g[0]][g[1]] = 0;
      ok = bfsPath(m, s, g) !== null;
    }
    return { maze: m, start: s, goal: g };
  }

  function mutateMaze() {
    // Flips a few non-critical cells mid-episode, mirroring the
    // "dynamic" behavior of DynamicMazeEnv without needing its source.
    for (let n = 0; n < 3; n++) {
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      const isEndpoint =
        (r === start[0] && c === start[1]) ||
        (r === goal[0] && c === goal[1]) ||
        (r === agentPos[0] && c === agentPos[1]);
      if (!isEndpoint) maze[r][c] = maze[r][c] ? 0 : 1;
    }
  }

  function resetEpisode() {
    const built = makeMaze();
    maze = built.maze;
    start = built.start;
    goal = built.goal;
    agentPos = [...start];
    path = bfsPath(maze, agentPos, goal) || [agentPos];
    pathIdx = 0;
    steps = 0;
    history = [];
    if (el('mzStatus')) el('mzStatus').textContent = 'In progress…';
    if (el('mzSteps')) el('mzSteps').textContent = '0 / ' + MAX_STEPS;
    draw();
  }

  function finish(success) {
    stopTimer();
    if (el('mzStatus')) el('mzStatus').textContent = success ? 'Goal reached' : 'Timed out';
    episode++;
    if (el('mzEpisode')) el('mzEpisode').textContent = episode;
  }

  function stepOnce() {
    if (pathIdx >= path.length - 1) {
      finish(agentPos[0] === goal[0] && agentPos[1] === goal[1]);
      return;
    }
    if (steps > 0 && steps % CHANGE_FREQUENCY === 0) {
      mutateMaze();
      const replan = bfsPath(maze, agentPos, goal);
      if (replan) {
        path = replan;
        pathIdx = 0;
      }
    }
    pathIdx++;
    agentPos = path[pathIdx];
    history.push([...agentPos]);
    steps++;
    if (el('mzSteps')) el('mzSteps').textContent = steps + ' / ' + MAX_STEPS;
    draw();
    if (agentPos[0] === goal[0] && agentPos[1] === goal[1]) {
      finish(true);
      return;
    }
    if (steps >= MAX_STEPS) finish(false);
  }

  function draw() {
    const canvas = el('mzCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        ctx.fillStyle = maze[i][j] ? '#ffb020' : '#0f1720';
        ctx.fillRect(j * cell, i * cell, cell, cell);
        ctx.strokeStyle = 'rgba(255,255,255,.08)';
        ctx.strokeRect(j * cell, i * cell, cell, cell);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    history.slice(0, -1).forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#25d07a';
    ctx.beginPath();
    ctx.arc(goal[1] * cell + cell / 2, goal[0] * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4d4f';
    ctx.beginPath();
    ctx.arc(agentPos[1] * cell + cell / 2, agentPos[0] * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function startTimer() {
    if (running) return;
    running = true;
    if (el('mzPlay')) el('mzPlay').textContent = 'Pause';
    timer = setInterval(() => {
      stepOnce();
    }, STEP_MS);
  }

  function stopTimer() {
    running = false;
    if (timer) clearInterval(timer);
    if (el('mzPlay')) el('mzPlay').textContent = 'Play';
  }

  function buildUI() {
    const host = el('sub-maze');
    if (!host) return;
    host.innerHTML =
      '<div class="card">' +
      '<h3>Maze Demo &mdash; Agent Navigation</h3>' +
      '<p class="k" style="margin-bottom:10px">' +
      'Ported from <span class="mono">simple_maze_demo.py</span>. Red = agent, green = goal, ' +
      'yellow = blocked cell, faint dots = path history. The maze mutates every ' + CHANGE_FREQUENCY +
      ' steps, matching <span class="mono">change_frequency</span> in the original ' +
      '<span class="mono">DynamicMazeEnv</span>.</p>' +
      '<canvas id="mzCanvas" width="360" height="360" ' +
      'style="width:100%;max-width:360px;border-radius:8px;display:block;margin:0 auto 14px"></canvas>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">' +
      '<button class="btn p" id="mzPlay">Play</button>' +
      '<button class="btn g" id="mzStep">Step</button>' +
      '<button class="btn g" id="mzNew">New Episode</button>' +
      '</div>' +
      '<div class="g3" style="text-align:center">' +
      '<div><div class="k">Episode</div><b id="mzEpisode">1</b></div>' +
      '<div><div class="k">Steps</div><b id="mzSteps">0 / ' + MAX_STEPS + '</b></div>' +
      '<div><div class="k">Status</div><b id="mzStatus">Press Play</b></div>' +
      '</div></div>' +
      '<div class="badge-sim" style="margin-top:12px">SIMULATED DATA &mdash; FOR SYSTEM DEMONSTRATION</div>' +
      '<div class="note"><b>Placeholder policy.</b> <span class="mono">dynamic_maze_env.py</span>, ' +
      '<span class="mono">baseline_confidence_agent.py</span> and <span class="mono">reflection_agent.py</span> ' +
      "weren't available when this tab was built, so movement here uses a shortest-path search rather " +
      'than the trained agent. Add those three files to the project and swap them into ' +
      '<span class="mono">maze-demo.js</span> to show the real learned policy instead of this placeholder.</div>';

    episode = 1;
    el('mzPlay').addEventListener('click', () => (running ? stopTimer() : startTimer()));
    el('mzStep').addEventListener('click', () => { stopTimer(); stepOnce(); });
    el('mzNew').addEventListener('click', () => { stopTimer(); resetEpisode(); });
    resetEpisode();
  }

  function wireTab() {
    const btn = document.querySelector('#researchNav button[data-sub="maze"]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#researchNav button').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      document.querySelectorAll('.subview').forEach((s) => s.classList.remove('active'));
      const target = el('sub-maze');
      if (target) target.classList.add('active');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildUI();
    wireTab();
  });
})();

/* The original maze behavior is instantiated once inside each algorithm panel,
   using prefixed IDs so both demos remain independent. */
function buildEmbeddedMazes() {
  ['existing', 'proposed'].forEach(function (kind) {
    var host = document.getElementById('maze-' + kind);
    if (!host || host.getAttribute('data-ready') === 'true') return;
    host.setAttribute('data-ready', 'true');
    var p = 'mz-' + kind;
    host.innerHTML =
      '<div class="card maze-card"><h3>Maze Demo &mdash; ' +
      (kind === 'existing' ? 'Existing Algorithm' : 'Proposed Algorithm') + '</h3>' +
      '<p class="k" style="margin-bottom:10px">Ported from <span class="mono">simple_maze_demo.py</span>. ' +
      'Red = agent, green = goal, yellow = blocked cell, faint dots = path history. The maze mutates every ' +
      '20 steps, matching <span class="mono">DynamicMazeEnv</span>.</p>' +
      '<canvas id="' + p + '-canvas" width="360" height="360" style="width:100%;max-width:360px;border-radius:8px;display:block;margin:0 auto 14px"></canvas>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">' +
      '<button class="btn p" id="' + p + '-play">Play</button>' +
      '<button class="btn g" id="' + p + '-step">Step</button>' +
      '<button class="btn g" id="' + p + '-new">New Episode</button></div>' +
      '<div class="g3" style="text-align:center"><div><div class="k">Episode</div><b id="' + p + '-episode">1</b></div>' +
      '<div><div class="k">Steps</div><b id="' + p + '-steps">0 / 100</b></div>' +
      '<div><div class="k">Status</div><b id="' + p + '-status">Press Play</b></div></div></div>';
    createEmbeddedMaze(p);
  });
}

function createEmbeddedMaze(prefix) {
  var size = 10, maze, start, goal, agent, path, pathIndex, steps, episode = 1, timer = null, history = [];
  var get = function (suffix) { return document.getElementById(prefix + suffix); };
  var key = function (pos) { return pos[0] + ',' + pos[1]; };
  function findPath(m, start, finish) {
    var queue = [start], previous = {}; previous[key(start)] = null;
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi], curKey = key(cur);
      if (cur[0] === finish[0] && cur[1] === finish[1]) {
        var result = [], cursor = curKey;
        while (cursor !== null) { result.unshift(cursor.split(',').map(Number)); cursor = previous[cursor]; }
        return result;
      }
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(function (d) {
        var row = cur[0] + d[0], col = cur[1] + d[1], next = [row, col], nextKey = key(next);
        if (row >= 0 && col >= 0 && row < size && col < size && !m[row][col] && !(nextKey in previous)) {
          previous[nextKey] = curKey; queue.push(next);
        }
      });
    }
    return null;
  }
  function reset() {
    var built, tries = 0;
    do {
      maze = Array.from({length:size}, function () {
        return Array.from({length:size}, function () { return Math.random() < .25 ? 1 : 0; });
      });
      start = [0,0]; goal = [size-1,size-1]; maze[0][0] = maze[9][9] = 0;
      path = findPath(maze, start, goal);
      tries++;
    } while (!path && tries < 50);
    agent = start.slice(); pathIndex = 0; steps = 0; history = [];
    get('-status').textContent = 'In progress'; get('-steps').textContent = '0 / 100'; draw();
  }
  function mutateMaze() {
    for (var n = 0; n < 3; n++) {
      var row = Math.floor(Math.random() * size), col = Math.floor(Math.random() * size);
      var endpoint = (row === start[0] && col === start[1]) ||
        (row === goal[0] && col === goal[1]) ||
        (row === agent[0] && col === agent[1]);
      if (!endpoint) maze[row][col] = maze[row][col] ? 0 : 1;
    }
  }
  function draw() {
    var canvas = get('-canvas'), ctx = canvas.getContext('2d'), cell = canvas.width / size;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (var r=0;r<size;r++) for (var c=0;c<size;c++) {
      ctx.fillStyle = maze[r][c] ? '#ffb020' : '#0f1720'; ctx.fillRect(c*cell,r*cell,cell,cell);
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.strokeRect(c*cell,r*cell,cell,cell);
    }
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    history.slice(0, -1).forEach(function (pos) {
      ctx.beginPath(); ctx.arc(pos[1]*cell+cell/2,pos[0]*cell+cell/2,cell*.12,0,Math.PI*2); ctx.fill();
    });
    ctx.fillStyle='#25d07a'; ctx.beginPath(); ctx.arc(9.5*cell,9.5*cell,cell*.3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ff4d4f'; ctx.beginPath(); ctx.arc((agent[1]+.5)*cell,(agent[0]+.5)*cell,cell*.3,0,Math.PI*2); ctx.fill();
  }
  function step() {
    if (pathIndex >= path.length - 1) { stop(); get('-status').textContent = 'Goal reached'; return; }
    if (steps > 0 && steps % 20 === 0) {
      mutateMaze();
      path = findPath(maze, agent, goal);
      if (path) { pathIndex = 0; } else { stop(); get('-status').textContent = 'No path'; return; }
    }
    pathIndex++; agent = path[pathIndex]; history.push(agent.slice()); steps++;
    get('-steps').textContent = steps + ' / 100'; draw();
    if (agent[0] === goal[0] && agent[1] === goal[1]) { stop(); get('-status').textContent = 'Goal reached'; }
    if (steps >= 100) { stop(); get('-status').textContent = 'Timed out'; }
  }
  function stop() { if (timer) clearInterval(timer); timer = null; get('-play').textContent = 'Play'; }
  get('-play').onclick = function () { if (timer) stop(); else { get('-play').textContent='Pause'; timer=setInterval(step,220); } };
  get('-step').onclick = function () { stop(); step(); };
  get('-new').onclick = function () { stop(); episode++; get('-episode').textContent=episode; reset(); };
  reset();
}

document.addEventListener('DOMContentLoaded', buildEmbeddedMazes);
