/* ============================================================
   Maze Demo — browser implementation of the uploaded
   simple_maze_demo.py + cathydou/reflection-agent-maze logic.

   Goal: show the same maze demonstration inside the existing
   Research & Analysis > Maze Demo tab without opening pygame.

   Source behavior mirrored here:
   - DynamicMazeEnv(size=10, obstacle_ratio=0.25, change_frequency=20)
   - env.max_steps = 100
   - ReflectionAgent(action_space)
   - confidence_threshold = 0.25
   - adaptation_threshold = 0.45
   - 5 episodes
   - actions: Up / Down / Left / Right
   ============================================================ */
(function () {
  'use strict';

  const SIZE = 10;
  const OBSTACLE_RATIO = 0.25;
  const CHANGE_FREQUENCY = 20;
  const MAX_STEPS = 100;
  const MAX_EPISODES = 5;
  const STEP_MS = 200;
  const ACTIONS = [
    [-1, 0], // Up
    [1, 0],  // Down
    [0, -1], // Left
    [0, 1]   // Right
  ];
  const ACTION_NAMES = ['Up', 'Down', 'Left', 'Right'];

  const key = (p) => p[0] + ',' + p[1];
  const clone = (p) => [p[0], p[1]];
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const randInt = (n) => Math.floor(Math.random() * n);
  const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const zeros4 = () => [0, 0, 0, 0];

  class DynamicMazeEnvBrowser {
    constructor(size = SIZE, obstacleRatio = OBSTACLE_RATIO, changeFrequency = CHANGE_FREQUENCY) {
      this.size = size;
      this.obstacleRatio = obstacleRatio;
      this.changeFrequency = changeFrequency;
      this.maxSteps = MAX_STEPS;
      this.STEP_PENALTY = -0.1;
      this.COLLISION_PENALTY = -1.0;
      this.GOAL_REWARD = 10.0;
      this.steps = 0;
      this.previousPos = [0, 0];
      this.currentPos = [0, 0];
      this.goalPos = [size - 1, size - 1];
      this.maze = [];
      this.episodeData = { environmentUpdates: 0, goalChanges: 0, obstacleChanges: 0 };
      this.reset();
    }

    generateMaze() {
      const maze = Array.from({ length: this.size }, () => Array(this.size).fill(0));
      const total = this.size * this.size;
      const target = Math.floor(total * this.obstacleRatio);
      const used = new Set();
      while (used.size < target) {
        const idx = randInt(total);
        if (used.has(idx)) continue;
        used.add(idx);
        maze[Math.floor(idx / this.size)][idx % this.size] = 1;
      }
      return maze;
    }

    findEmptyPosition() {
      while (true) {
        const p = [randInt(this.size), randInt(this.size)];
        if (this.maze[p[0]][p[1]] === 0) return p;
      }
    }

    bfs(start, goal, maze = this.maze) {
      if (same(start, goal)) return { exists: true, path: [clone(start)] };
      const q = [[clone(start), [clone(start)]]];
      const seen = new Set([key(start)]);
      while (q.length) {
        const [cur, path] = q.shift();
        for (const d of ACTIONS) {
          const next = [cur[0] + d[0], cur[1] + d[1]];
          if (next[0] < 0 || next[1] < 0 || next[0] >= this.size || next[1] >= this.size) continue;
          if (maze[next[0]][next[1]] === 1 || seen.has(key(next))) continue;
          const nextPath = path.concat([clone(next)]);
          if (same(next, goal)) return { exists: true, path: nextPath };
          seen.add(key(next));
          q.push([next, nextPath]);
        }
      }
      return { exists: false, path: [] };
    }

    ensureAgentNotTrapped() {
      for (const d of ACTIONS) {
        const n = [this.currentPos[0] + d[0], this.currentPos[1] + d[1]];
        if (n[0] >= 0 && n[1] >= 0 && n[0] < this.size && n[1] < this.size && this.maze[n[0]][n[1]] === 0) return;
      }
      for (const idx of [1, 3, 0, 2]) {
        const d = ACTIONS[idx];
        const n = [this.currentPos[0] + d[0], this.currentPos[1] + d[1]];
        if (n[0] >= 0 && n[1] >= 0 && n[0] < this.size && n[1] < this.size) {
          this.maze[n[0]][n[1]] = 0;
          return;
        }
      }
    }

    ensurePathExists() {
      let result = this.bfs(this.currentPos, this.goalPos);
      let guard = 0;
      while (!result.exists && guard++ < 100) {
        const obstacles = [];
        for (let r = 0; r < this.size; r++) {
          for (let c = 0; c < this.size; c++) if (this.maze[r][c] === 1) obstacles.push([r, c]);
        }
        if (!obstacles.length) break;
        const p = obstacles[randInt(obstacles.length)];
        if (!same(p, this.currentPos) && !same(p, this.goalPos)) this.maze[p[0]][p[1]] = 0;
        result = this.bfs(this.currentPos, this.goalPos);
      }
    }

    reset() {
      this.maze = this.generateMaze();

      this.currentPos = this.findEmptyPosition();
      while (this.currentPos[0] > Math.floor(this.size / 3) || this.currentPos[1] > Math.floor(this.size / 3)) {
        this.currentPos = this.findEmptyPosition();
      }
      this.ensureAgentNotTrapped();

      this.goalPos = this.findEmptyPosition();
      while (
        this.goalPos[0] < Math.floor((2 * this.size) / 3) ||
        this.goalPos[1] < Math.floor((2 * this.size) / 3) ||
        manhattan(this.goalPos, this.currentPos) < this.size
      ) {
        this.goalPos = this.findEmptyPosition();
      }

      this.steps = 0;
      this.previousPos = clone(this.currentPos);
      this.ensurePathExists();
      return clone(this.currentPos);
    }

    updateEnvironment() {
      const oldGoal = clone(this.goalPos);
      const numChanges = 1 + randInt(3);
      let actualChanges = 0;
      for (let i = 0; i < numChanges; i++) {
        const p = [randInt(this.size), randInt(this.size)];
        if (same(p, this.currentPos) || same(p, this.goalPos)) continue;
        this.maze[p[0]][p[1]] = this.maze[p[0]][p[1]] ? 0 : 1;
        actualChanges++;
      }
      this.ensurePathExists();
      this.ensureAgentNotTrapped();
      if (!same(oldGoal, this.goalPos)) this.episodeData.goalChanges++;
      this.episodeData.environmentUpdates++;
      this.episodeData.obstacleChanges += actualChanges;
    }

    getOptimalPathLength() {
      const result = this.bfs(this.currentPos, this.goalPos);
      return result.exists ? Math.max(0, result.path.length - 1) : Infinity;
    }

    step(action) {
      this.steps++;
      const d = ACTIONS[action];
      const next = [this.currentPos[0] + d[0], this.currentPos[1] + d[1]];

      if (next[0] < 0 || next[1] < 0 || next[0] >= this.size || next[1] >= this.size) {
        return { state: clone(this.currentPos), reward: this.COLLISION_PENALTY, done: false, collision: true };
      }
      if (this.maze[next[0]][next[1]] === 1) {
        return { state: clone(this.currentPos), reward: this.COLLISION_PENALTY, done: false, collision: true };
      }

      this.currentPos = next;
      const reachedGoal = same(this.currentPos, this.goalPos);
      const done = reachedGoal || this.steps >= this.maxSteps;
      const oldDistance = manhattan(this.previousPos, this.goalPos);
      const newDistance = manhattan(this.currentPos, this.goalPos);
      const reward = reachedGoal ? this.GOAL_REWARD : this.STEP_PENALTY + (oldDistance - newDistance);

      if (this.steps % this.changeFrequency === 0) this.updateEnvironment();
      this.previousPos = clone(this.currentPos);
      return { state: clone(this.currentPos), reward, done, collision: false };
    }
  }

  class ReflectionAgentBrowser {
    constructor() {
      this.qShort = new Map();
      this.qLong = new Map();
      this.memoryBalance = 0.5;
      this.epsilon = 0.9;
      this.epsilonMin = 0.3;
      this.epsilonDecay = 0.999;
      this.alpha = 0.5;
      this.gamma = 0.9;
      this.confidenceThreshold = 0.25;
      this.adaptationThreshold = 0.45;
      this.visitCounts = new Map();
      this.goalPos = null;
      this.wallMemory = new Map();
      this.stepsCount = 0;
      this.environmentStability = 1.0;
      this.stateActionResults = new Map();
      this.recentRewards = [];
      this.recentConfidences = [];
    }

    setGoalPosition(pos) { this.goalPos = clone(pos); }
    getQ(map, stateKey) {
      if (!map.has(stateKey)) map.set(stateKey, zeros4());
      return map.get(stateKey);
    }

    selectAction(state) {
      const sk = key(state);
      this.visitCounts.set(sk, (this.visitCounts.get(sk) || 0) + 1);
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);

      const dr = this.goalPos[0] - state[0];
      const dc = this.goalPos[1] - state[1];
      const vd = Math.abs(dr), hd = Math.abs(dc);
      let possible = [];
      if (vd >= hd) possible.push(dr > 0 ? 1 : 0);
      if (hd >= vd) possible.push(dc > 0 ? 3 : 2);

      const walls = this.wallMemory.get(sk);
      if (walls) possible = possible.filter(a => !walls.has(a));
      if (!possible.length) return randInt(4);

      if (Math.random() < this.epsilon) {
        if (Math.random() < 0.7) return possible[randInt(possible.length)];
        return randInt(4);
      }

      const qS = this.getQ(this.qShort, sk);
      const qL = this.getQ(this.qLong, sk);
      const targetBalance = Math.max(0.3, Math.min(0.7, 1.0 - this.environmentStability));
      this.memoryBalance = 0.9 * this.memoryBalance + 0.1 * targetBalance;
      const combined = qS.map((v, i) => this.memoryBalance * v + (1 - this.memoryBalance) * qL[i]);
      let best = 0;
      for (let i = 1; i < 4; i++) if (combined[i] > combined[best]) best = i;
      return best;
    }

    calculateConfidence(steps, shortestPath) {
      if (!Number.isFinite(shortestPath) || shortestPath === 0) return 0;
      return Math.max(0, 1 - (steps - shortestPath) / shortestPath);
    }

    learn(state, action, reward, nextState, done, steps, shortestPath) {
      const sk = key(state), nk = key(nextState);
      const confidence = this.calculateConfidence(steps, shortestPath);
      this.recentConfidences.push(confidence);
      this.recentRewards.push(reward);
      if (this.recentConfidences.length > 10) this.recentConfidences.shift();
      if (this.recentRewards.length > 10) this.recentRewards.shift();

      const qS = this.getQ(this.qShort, sk);
      const qSn = this.getQ(this.qShort, nk);
      const qL = this.getQ(this.qLong, sk);
      const qLn = this.getQ(this.qLong, nk);

      const nextShort = Math.max(...qSn);
      const shortAlpha = Math.min(0.8, this.alpha * 1.5);
      qS[action] = (1 - shortAlpha) * qS[action] + shortAlpha * (reward + this.gamma * nextShort * (done ? 0 : 1));

      const nextLong = Math.max(...qLn);
      const longAlpha = Math.max(0.1, this.alpha * 0.7);
      qL[action] = (1 - longAlpha) * qL[action] + longAlpha * (reward + this.gamma * nextLong * (done ? 0 : 1));

      const resultKey = sk + '|' + action;
      const currentResult = nk + '|' + reward.toFixed(2);
      const previous = this.stateActionResults.get(resultKey);
      if (previous && previous !== currentResult) this.environmentStability = Math.max(0.5, this.environmentStability * 0.8);
      else this.environmentStability = Math.min(1.0, this.environmentStability * 1.02);
      this.stateActionResults.set(resultKey, currentResult);

      if (reward <= -1) {
        if (!this.wallMemory.has(sk)) this.wallMemory.set(sk, new Set());
        this.wallMemory.get(sk).add(action);
      }
      this.stepsCount++;
      if (this.stepsCount % 20 === 0 && this.environmentStability < this.adaptationThreshold) {
        this.wallMemory.clear();
      }
    }
  }

  let env = null;
  let agent = null;
  let episode = 1;
  let stepsTaken = 0;
  let lastAction = 'None';
  let goalStatus = 'In Progress...';
  let statusText = 'Ready for Episode 1';
  let history = [];
  let timer = null;
  let running = false;
  let finished = false;

  function el(id) { return document.getElementById(id); }

  function startEpisode(resetAgent = false) {
    if (!env) env = new DynamicMazeEnvBrowser();
    const state = env.reset();
    if (!agent || resetAgent) agent = new ReflectionAgentBrowser();
    agent.confidenceThreshold = 0.25;
    agent.adaptationThreshold = 0.45;
    agent.setGoalPosition(env.goalPos);
    stepsTaken = 0;
    lastAction = 'None';
    goalStatus = 'In Progress...';
    statusText = 'Episode ' + episode + ' running';
    history = [clone(state)];
    finished = false;
    updateStats();
    draw();
  }

  function endEpisode(success) {
    stopTimer();
    finished = true;
    if (success) {
      goalStatus = 'Goal Achieved!';
      statusText = 'Goal Achieved';
    } else {
      goalStatus = 'Goal Not Achieved';
      statusText = 'Timeout';
    }
    updateStats();
    draw();
  }

  function stepOnce() {
    if (finished) return;
    const state = clone(env.currentPos);
    const action = agent.selectAction(state);
    const result = env.step(action);
    lastAction = ACTION_NAMES[action];
    const shortest = env.getOptimalPathLength();
    agent.learn(state, action, result.reward, result.state, result.done, stepsTaken, shortest);
    stepsTaken++;
    history.push(clone(result.state));
    updateStats();
    draw();

    if (result.done && same(result.state, env.goalPos)) endEpisode(true);
    else if (stepsTaken >= MAX_STEPS || result.done) endEpisode(false);
  }

  function updateStats() {
    if (el('mzEpisode')) el('mzEpisode').textContent = episode + ' / ' + MAX_EPISODES;
    if (el('mzSteps')) el('mzSteps').textContent = stepsTaken + ' / ' + MAX_STEPS;
    if (el('mzStatus')) el('mzStatus').textContent = statusText;
    if (el('mzGoal')) el('mzGoal').textContent = goalStatus;
    if (el('mzAction')) el('mzAction').textContent = lastAction;
    if (el('mzEpsilon')) el('mzEpsilon').textContent = agent ? agent.epsilon.toFixed(3) : '—';
  }

  function draw() {
    const canvas = el('mzCanvas');
    if (!canvas || !env) return;
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        ctx.fillStyle = env.maze[r][c] ? '#f4d03f' : '#ffffff';
        ctx.fillRect(c * cell, r * cell, cell, cell);
        ctx.strokeStyle = '#808080';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * cell, r * cell, cell, cell);
      }
    }

    ctx.fillStyle = 'rgba(70,70,70,.28)';
    history.slice(0, -1).forEach(([r, c]) => {
      ctx.beginPath();
      ctx.arc(c * cell + cell / 2, r * cell + cell / 2, cell * 0.10, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = '#00c853';
    ctx.beginPath();
    ctx.arc(env.goalPos[1] * cell + cell / 2, env.goalPos[0] * cell + cell / 2, cell * 0.30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f44336';
    ctx.beginPath();
    ctx.arc(env.currentPos[1] * cell + cell / 2, env.currentPos[0] * cell + cell / 2, cell * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }

  function startTimer() {
    if (running || finished) return;
    running = true;
    if (el('mzPlay')) el('mzPlay').textContent = 'Pause';
    timer = setInterval(stepOnce, STEP_MS);
  }

  function stopTimer() {
    running = false;
    if (timer) clearInterval(timer);
    timer = null;
    if (el('mzPlay')) el('mzPlay').textContent = 'Play';
  }

  function nextEpisode() {
    stopTimer();
    if (episode >= MAX_EPISODES) {
      episode = 1;
      agent = new ReflectionAgentBrowser();
    } else {
      episode++;
    }
    startEpisode(false);
  }

  function buildUI() {
    const host = el('sub-maze');
    if (!host) return;
    host.innerHTML = `
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 style="font-size:16px;margin-bottom:4px">Maze Demonstration — Reflection Agent</h3>
            <div class="k">Browser visualization of the uploaded <span class="mono">simple_maze_demo.py</span>. The maze logic and agent behavior are mirrored from <span class="mono">reflection-agent-maze</span>.</div>
          </div>
          <span class="pill open">ACTUAL AGENT LOGIC</span>
        </div>

        <div style="display:grid;grid-template-columns:minmax(210px,300px) minmax(300px,500px);gap:18px;align-items:start" class="maze-layout">
          <div style="background:#f7f7f7;border-radius:12px;padding:14px;color:#111;min-height:420px">
            <div style="font-weight:800;margin-bottom:12px">Maze Demonstration - Ball Moving in Maze</div>
            <div style="font-size:13px;line-height:1.9">
              <div>Episode: <b id="mzEpisode">1 / 5</b></div>
              <div>Status: <b id="mzStatus">Ready</b></div>
              <div>Goal Result: <b id="mzGoal">In Progress...</b></div>
              <div>Steps Taken: <b id="mzSteps">0 / 100</b></div>
              <div>Last Action: <b id="mzAction">None</b></div>
              <div>Exploration ε: <b id="mzEpsilon">0.900</b></div>
              <hr style="border:0;border-top:1px solid #ddd;margin:10px 0">
              <div><span style="color:#f44336">●</span> Red Ball: Reflection Agent</div>
              <div><span style="color:#00c853">●</span> Green Circle: Goal</div>
              <div><span style="color:#d4ac0d">■</span> Yellow Blocks: Walls</div>
              <div style="margin-top:10px;color:#555">Maze changes every 20 environment steps.</div>
            </div>
          </div>
          <div>
            <canvas id="mzCanvas" width="500" height="500" style="display:block;width:100%;max-width:500px;aspect-ratio:1/1;background:#fff;border-radius:10px;margin:0 auto"></canvas>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn p" id="mzPlay" style="flex:0 0 110px">Play</button>
          <button class="btn g" id="mzStep" style="flex:0 0 110px">Step</button>
          <button class="btn g" id="mzReset" style="flex:0 0 140px">Restart Episode</button>
          <button class="btn k" id="mzNext" style="flex:0 0 140px">Next Episode</button>
        </div>
      </div>

      <div class="note">
        <b>Implementation note.</b> The standalone Python version is preserved in the repository as <span class="mono">simple_maze_demo.py</span>. Because pygame cannot render directly inside a normal browser page, this tab mirrors the same environment and ReflectionAgent decision/learning behavior in JavaScript so the demonstration stays inside the existing system.
      </div>
      <style>
        @media (max-width: 820px){ .maze-layout{grid-template-columns:1fr!important} }
      </style>`;

    el('mzPlay').addEventListener('click', () => running ? stopTimer() : startTimer());
    el('mzStep').addEventListener('click', () => { stopTimer(); stepOnce(); });
    el('mzReset').addEventListener('click', () => { stopTimer(); startEpisode(false); });
    el('mzNext').addEventListener('click', nextEpisode);
    episode = 1;
    env = new DynamicMazeEnvBrowser();
    agent = new ReflectionAgentBrowser();
    startEpisode(false);
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
      draw();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildUI();
    wireTab();
  });
})();
