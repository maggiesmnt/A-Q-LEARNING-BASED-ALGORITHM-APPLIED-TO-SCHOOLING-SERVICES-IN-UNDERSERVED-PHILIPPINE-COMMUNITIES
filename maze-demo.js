/* Controlled, simulated maze demonstration; not Chapter 4 evaluation evidence. */
(function () {
  'use strict';

  var SIZE = 10, OBSTACLE_RATIO = 0.25, CHANGE_FREQUENCY = 20;
  var MAX_STEPS = 100, STEP_MS = 200;
  var STEP_PENALTY = -0.1, COLLISION_PENALTY = -1.0, GOAL_REWARD = 10.0;
  var ACTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var ACTION_NAMES = ['Up', 'Down', 'Left', 'Right'];
  var IDS = ['standard', 'modql'];
  var env, agents, runs, seed, episode = 1, timer = null, observer, themeObserver;

  // Mulberry32. One seed derives independent environment/policy streams so
  // exploration and Double-Q coin flips cannot shift the obstacle RNG schedule.
  function makeRng(value) {
    var state = value >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(rng, n) { return Math.floor(rng() * n); }
  function key(p) { return p[0] + ',' + p[1]; }
  function clone(p) { return p.slice(); }
  function same(a, b) { return key(a) === key(b); }
  function distance(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
  function zeros4() { return [0, 0, 0, 0]; }
  function el(id) { return document.getElementById(id); }
  function quadrant(p) { return (p[0] >= SIZE / 2 ? 2 : 0) + (p[1] >= SIZE / 2 ? 1 : 0); }
  function argmax(values, rng) {
    var best = Math.max.apply(null, values), ties = [];
    values.forEach(function (v, i) { if (v === best) ties.push(i); });
    return ties[randInt(rng, ties.length)];
  }

  function SharedDynamicMazeEnv(rng) {
    this.rng = rng;
    this.size = SIZE;
    this.obstacleRatio = OBSTACLE_RATIO;
    this.changeFrequency = CHANGE_FREQUENCY;
    this.maxSteps = MAX_STEPS;
    this.STEP_PENALTY = STEP_PENALTY;
    this.COLLISION_PENALTY = COLLISION_PENALTY;
    this.GOAL_REWARD = GOAL_REWARD;
  }
  SharedDynamicMazeEnv.prototype.isOpen = function (p) {
    return p[0] >= 0 && p[1] >= 0 && p[0] < SIZE && p[1] < SIZE && !this.maze[p[0]][p[1]];
  };
  SharedDynamicMazeEnv.prototype.generateMaze = function () {
    var maze = [], used = {}, count = 0;
    for (var r = 0; r < SIZE; r++) {
      maze[r] = [];
      for (var c = 0; c < SIZE; c++) maze[r][c] = 0;
    }
    while (count < Math.floor(SIZE * SIZE * OBSTACLE_RATIO)) {
      var idx = randInt(this.rng, SIZE * SIZE);
      if (used[idx]) continue;
      used[idx] = true;
      maze[Math.floor(idx / SIZE)][idx % SIZE] = 1;
      count++;
    }
    return maze;
  };
  SharedDynamicMazeEnv.prototype.bfs = function (start, goal) {
    var queue = [clone(start)], seen = {}, head = 0;
    seen[key(start)] = true;
    while (head < queue.length) {
      var p = queue[head++];
      if (same(p, goal)) return true;
      for (var i = 0; i < ACTIONS.length; i++) {
        var n = [p[0] + ACTIONS[i][0], p[1] + ACTIONS[i][1]];
        if (this.isOpen(n) && !seen[key(n)]) { seen[key(n)] = true; queue.push(n); }
      }
    }
    return false;
  };
  SharedDynamicMazeEnv.prototype.ensureAgentNotTrapped = function () {
    var self = this;
    IDS.forEach(function (id) {
      var p = self.currentPos[id];
      self.maze[p[0]][p[1]] = 0;
      if (ACTIONS.some(function (d) { return self.isOpen([p[0] + d[0], p[1] + d[1]]); })) return;
      [1, 3, 0, 2].some(function (i) {
        var n = [p[0] + ACTIONS[i][0], p[1] + ACTIONS[i][1]];
        if (n[0] < 0 || n[1] < 0 || n[0] >= SIZE || n[1] >= SIZE) return false;
        self.maze[n[0]][n[1]] = 0;
        return true;
      });
    });
  };
  SharedDynamicMazeEnv.prototype.ensurePathExists = function () {
    var self = this;
    // Called once per tick; repairs paths for BOTH occupants of this one maze.
    IDS.forEach(function (id) {
      while (!self.bfs(self.currentPos[id], self.goalPos)) {
        var walls = [];
        for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
          if (self.maze[r][c]) walls.push([r, c]);
        }
        if (!walls.length) break;
        var p = walls[randInt(self.rng, walls.length)];
        self.maze[p[0]][p[1]] = 0;
      }
    });
  };
  SharedDynamicMazeEnv.prototype.reset = function () {
    this.maze = this.generateMaze();
    // Bounded candidate lists avoid rejection loops when a corner is blocked.
    var starts = [], goals = [];
    for (var r = 0; r <= Math.floor(SIZE / 3); r++) for (var c = 0; c <= Math.floor(SIZE / 3); c++) starts.push([r, c]);
    var start = starts[randInt(this.rng, starts.length)];
    for (r = Math.floor(2 * SIZE / 3); r < SIZE; r++) for (c = Math.floor(2 * SIZE / 3); c < SIZE; c++) {
      if (distance(start, [r, c]) >= SIZE) goals.push([r, c]);
    }
    this.goalPos = goals[randInt(this.rng, goals.length)];
    this.currentPos = {standard: clone(start), modql: clone(start)};
    this.maze[start[0]][start[1]] = this.maze[this.goalPos[0]][this.goalPos[1]] = 0;
    this.steps = 0;
    this.agentSteps = {standard: 0, modql: 0};
    this.episodeData = {environmentUpdates: 0, obstacleChanges: 0, goalChanges: 0};
    this.ensureAgentNotTrapped();
    this.ensurePathExists();
    // Seeded synthetic cell demand, traversal minutes, and quadrant service history.
    this.demand = []; this.minutes = []; this.initialService = []; this.totalDemand = 0;
    for (r = 0; r < SIZE; r++) {
      this.demand[r] = []; this.minutes[r] = [];
      for (c = 0; c < SIZE; c++) {
        this.demand[r][c] = 1 + randInt(this.rng, 30);
        this.minutes[r][c] = 1 + randInt(this.rng, 5);
        this.totalDemand += this.demand[r][c];
      }
    }
    for (r = 0; r < 4; r++) this.initialService.push(randInt(this.rng, 5));
  };
  SharedDynamicMazeEnv.prototype.updateEnvironment = function () {
    var count = 1 + randInt(this.rng, 3);
    for (var i = 0; i < count; i++) {
      var p = [randInt(this.rng, SIZE), randInt(this.rng, SIZE)];
      if (same(p, this.goalPos) || same(p, this.currentPos.standard) || same(p, this.currentPos.modql)) continue;
      this.maze[p[0]][p[1]] = this.maze[p[0]][p[1]] ? 0 : 1;
      this.episodeData.obstacleChanges++;
    }
    this.episodeData.environmentUpdates++;
  };
  SharedDynamicMazeEnv.prototype.beginStep = function () {
    this.steps++;
    // Schedule includes collision ticks and is independent of either agent's step().
    if (this.steps % CHANGE_FREQUENCY === 0) this.updateEnvironment();
    this.ensureAgentNotTrapped();
    this.ensurePathExists();
  };
  SharedDynamicMazeEnv.prototype.step = function (id, action) {
    var previous = this.currentPos[id], d = ACTIONS[action];
    var next = [previous[0] + d[0], previous[1] + d[1]], collision = !this.isOpen(next);
    if (collision) next = clone(previous);
    this.currentPos[id] = next;
    this.agentSteps[id]++;
    var success = same(next, this.goalPos);
    return {
      state: clone(next), collision: collision, success: success,
      done: success || this.agentSteps[id] >= MAX_STEPS,
      minutes: this.minutes[next[0]][next[1]],
      // Preserve original environment shaping as a diagnostic. Agents explicitly
      // learn their SOP objectives below, rather than this distance-shaped reward.
      reward: collision ? COLLISION_PENALTY : success ? GOAL_REWARD : STEP_PENALTY + distance(previous, this.goalPos) - distance(next, this.goalPos)
    };
  };

  function StandardQLearningAgent(rng) {
    this.rng = rng; this.qTable = new Map();
    this.epsilon = 0.3; this.alpha = 0.1; this.gamma = 0.9;
  }
  StandardQLearningAgent.prototype.getQ = function (table, state) {
    if (!table.has(state)) table.set(state, zeros4());
    return table.get(state);
  };
  StandardQLearningAgent.prototype.encodeState = function (world, run, pos) {
    // §1.3 SOP 3 / §1.4.2 Objective 3 control: location-only state.
    return key(pos);
  };
  StandardQLearningAgent.prototype.values = function (state) { return this.getQ(this.qTable, state); };
  StandardQLearningAgent.prototype.selectAction = function (state) {
    if (this.rng() < this.epsilon) return randInt(this.rng, 4);
    return argmax(this.values(state), this.rng);
  };
  StandardQLearningAgent.prototype.learn = function (state, action, reward, next, done) {
    var q = this.getQ(this.qTable, state), nq = this.getQ(this.qTable, next);
    q[action] += this.alpha * (reward + (done ? 0 : this.gamma * Math.max.apply(null, nq)) - q[action]);
    if (done) this.epsilon = Math.max(0.1, this.epsilon * 0.995);
  };

  function MODQLAgent(rng) {
    StandardQLearningAgent.call(this, rng);
    this.q1 = new Map(); this.q2 = new Map();
  }
  MODQLAgent.prototype = Object.create(StandardQLearningAgent.prototype);
  MODQLAgent.prototype.constructor = MODQLAgent;
  MODQLAgent.prototype.encodeState = function (world, run, pos) {
    // §1.3 SOP 3 / §1.4.2 Objective 3: simulated S=<L,D,T,H,A>.
    // D encodes the remaining demand field; T elapsed minutes;
    // H quadrant service counts; A immediate directional accessibility mask.
    var access = ACTIONS.map(function (d) { return world.isOpen([pos[0] + d[0], pos[1] + d[1]]) ? 1 : 0; });
    var demand = world.demand.map(function (row, r) {
      return row.map(function (value, c) { return run.served[key([r, c])] ? 0 : value; }).join(',');
    }).join(';');
    return [key(pos), demand, run.minutes, run.service.join(','), access.join('')].join('|');
  };
  MODQLAgent.prototype.values = function (state) {
    var a = this.getQ(this.q1, state), b = this.getQ(this.q2, state);
    return a.map(function (v, i) { return (v + b[i]) / 2; });
  };
  MODQLAgent.prototype.learn = function (state, action, reward, next, done) {
    // §1.3 SOP 2 / §1.4.2 Objective 2: one estimator selects, the other evaluates.
    var first = this.rng() < 0.5, select = first ? this.q1 : this.q2, evaluate = first ? this.q2 : this.q1;
    var q = this.getQ(select, state), bootstrap = 0;
    if (!done) bootstrap = this.getQ(evaluate, next)[argmax(this.getQ(select, next), this.rng)];
    q[action] += this.alpha * (reward + this.gamma * bootstrap - q[action]);
    if (done) this.epsilon = Math.max(0.1, this.epsilon * 0.995);
  };
  MODQLAgent.prototype.spread = function () {
    var self = this, states = new Set(), total = 0;
    this.q1.forEach(function (v, k) { states.add(k); });
    this.q2.forEach(function (v, k) { states.add(k); });
    states.forEach(function (k) {
      var a = self.q1.get(k) || zeros4(), b = self.q2.get(k) || zeros4();
      for (var i = 0; i < 4; i++) total += Math.abs(a[i] - b[i]);
    });
    return states.size ? total / (4 * states.size) : 0;
  };

  function startEpisode() {
    env.reset();
    runs = {};
    IDS.forEach(function (id) {
      var pos = env.currentPos[id], visited = {};
      visited[key(pos)] = true;
      runs[id] = {steps: 0, minutes: 0, reward: 0, visited: visited, served: {},
        service: env.initialService.slice(), history: [clone(pos)], done: false,
        success: false, action: 'None', demand: 0, fairness: jain(env.initialService), travelTerm: 1, latestReward: 0};
    });
    render();
  }
  function resetComparison(value) {
    stopTimer();
    var nextSeed = value === undefined ? (Date.now() >>> 0) : (value >>> 0);
    if (value === undefined && nextSeed === seed) nextSeed = (nextSeed + 1) >>> 0;
    seed = nextSeed; episode = 1;
    env = new SharedDynamicMazeEnv(makeRng(seed));
    agents = {standard: new StandardQLearningAgent(makeRng(seed ^ 0xA341316C)), modql: new MODQLAgent(makeRng(seed ^ 0xC8013EA4))};
    startEpisode();
  }
  function allDone() { return IDS.every(function (id) { return runs[id].done; }); }
  function stepBoth() {
    if (allDone()) return;
    env.beginStep();
    var states = {}, actions = {};
    // Both decisions read the SAME pre-transition env.currentPos map and maze.
    // Positions are independent occupants, initially equal, never private mazes.
    IDS.forEach(function (id) {
      if (runs[id].done) return;
      states[id] = agents[id].encodeState(env, runs[id], env.currentPos[id]);
      actions[id] = agents[id].selectAction(states[id]);
    });
    // Fixed resolution order: Standard, then MODQL. step() never changes walls,
    // goal, RNG, or the other occupant. Finished agents wait until Next Episode.
    IDS.forEach(function (id) {
      var run = runs[id], agent = agents[id];
      if (run.done) return;
      var result = env.step(id, actions[id]), p = result.state, k = key(p);
      run.steps++; run.minutes += result.minutes;
      run.visited[k] = true;
      run.demand = 0;
      if (!result.collision && !run.served[k]) {
        run.served[k] = true;
        run.demand = env.demand[p[0]][p[1]] / env.totalDemand;
        run.service[quadrant(p)]++;
      }
      run.fairness = jain(run.service); // Existing engine.js helper only.
      var hours = result.minutes / 60;
      run.travelTerm = 1 / (1 + hours);
      // §1.3 SOP 1 / §1.4.2 Objective 1: exact objective rewards, no
      // distance shaping or goal bonus. Collisions cost time but serve no demand.
      run.latestReward = id === 'standard' ? 1 / hours : run.demand * run.fairness * run.travelTerm;
      run.reward += run.latestReward;
      run.done = result.done; run.success = result.success;
      run.action = ACTION_NAMES[actions[id]] + (result.collision ? ' (collision)' : '');
      run.history.push(clone(p));
      agent.learn(states[id], actions[id], run.latestReward, agent.encodeState(env, run, p), result.done);
    });
    if (allDone()) stopTimer();
    render();
  }
  function stopTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (el('mzComparisonPlay')) el('mzComparisonPlay').textContent = 'Start Comparison';
  }
  function startTimer() {
    if (timer !== null || allDone()) return;
    timer = setInterval(stepBoth, STEP_MS);
    render();
  }
  function nextEpisode() { stopTimer(); episode++; startEpisode(); }
  function setText(id, value) { var node = el(id); if (node) node.textContent = value; }
  function render() {
    setText('mzSeed', seed);
    setText('mzSchedule', 'Shared tick ' + env.steps + ' · obstacle updates ' + env.episodeData.environmentUpdates);
    IDS.forEach(function (id) {
      var run = runs[id], prefix = 'mz-' + id + '-';
      var status = run.done ? (run.success ? 'Goal achieved' : 'Timeout') : timer !== null ? 'Running' : run.steps ? 'Paused' : 'Ready';
      var values = {episode: episode, steps: run.steps + ' / ' + MAX_STEPS, status: status,
        goal: '[' + env.goalPos.join(', ') + '] · ' + (run.success ? 'Achieved' : run.done ? 'Not achieved' : 'In progress'),
        action: run.action, epsilon: agents[id].epsilon.toFixed(3), minutes: run.minutes.toFixed(1),
        reward: run.reward.toFixed(6), coverage: Object.keys(run.visited).length,
        demand: run.demand.toFixed(6), fairness: run.fairness.toFixed(6), travel: run.travelTerm.toFixed(6),
        combined: run.latestReward.toFixed(6), spread: id === 'modql' ? agents.modql.spread().toFixed(6) : 'Not applicable (one Q-table)'};
      Object.keys(values).forEach(function (k) { setText(prefix + k, values[k]); });
      draw(id);
    });
    el('mzComparisonPlay').textContent = timer !== null ? 'Pause Comparison' : 'Start Comparison';
    el('mzComparisonPlay').disabled = allDone();
    el('mzComparisonStep').disabled = allDone();
  }
  function themeColor(name, fallback) { return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback; }
  function draw(id) {
    var canvas = el('mz-' + id + '-canvas');
    if (!canvas || !env) return;
    var bounds = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (bounds.width > 0) {
      var side = Math.round(bounds.width * dpr);
      if (canvas.width !== side) canvas.width = side;
      if (canvas.height !== side) canvas.height = side;
    }
    var ctx = canvas.getContext('2d'), cell = canvas.width / SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      ctx.fillStyle = env.maze[r][c] ? themeColor('--maze-wall', '#B9AB6B') : themeColor('--maze-cell', '#F7F0E2');
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.strokeStyle = themeColor('--maze-grid', '#C9B99B'); ctx.lineWidth = 1;
      ctx.strokeRect(c * cell, r * cell, cell, cell);
    }
    function dot(p, radius, color) {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.arc((p[1] + 0.5) * cell, (p[0] + 0.5) * cell, cell * radius, 0, Math.PI * 2); ctx.fill();
    }
    runs[id].history.slice(0, -1).forEach(function (p) { dot(p, 0.1, themeColor('--maze-trail', '#78896e')); });
    dot(env.goalPos, 0.32, themeColor('--maze-goal', '#5E6828'));
    dot(env.currentPos[id], 0.22, themeColor('--maze-agent', '#8A633F'));
    // Letter marks distinguish agent from goal, including when their cells overlap.
    ctx.fillStyle = themeColor('--txt', '#222'); ctx.font = Math.max(10, cell * 0.3) + 'px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('G', (env.goalPos[1] + 0.5) * cell, (env.goalPos[0] + 0.2) * cell);
    ctx.fillText(id === 'standard' ? 'Q' : 'M', (env.currentPos[id][1] + 0.5) * cell, (env.currentPos[id][0] + 0.62) * cell);
  }
  function row(id, label) { return '<div><span>' + label + '</span><b id="' + id + '"></b></div>'; }
  function panel(id, title) {
    var prefix = 'mz-' + id + '-', mod = id === 'modql';
    var html = '<section class="shared-maze-panel"><h3>' + title + '</h3><div class="shared-maze-status"><h4>Maze Status</h4><div class="maze-status-grid">';
    [['episode', 'Episode'], ['steps', 'Steps'], ['status', 'Status'], ['goal', 'Goal'], ['action', 'Latest Move'], ['epsilon', 'Exploration Rate (ε)']].forEach(function (r) { html += row(prefix + r[0], r[1]); });
    html += '</div><div class="shared-maze-state">STATE: ' + (mod ? 'S = &lt;L, D, T, H, A&gt;' : 'S = L') + '</div>';
    html += '<p class="shared-maze-objective">Objective in use: ' + (mod ? 'normalized demand × Jain fairness × 1 / (1 + travel time hours)' : '1 / Travel time (hours)') + '</p><div class="maze-status-grid">';
    [['minutes', 'Travel time this episode (min)'], ['reward', 'Cumulative episode reward'], ['coverage', 'Coverage (distinct cells visited)']].forEach(function (r) { html += row(prefix + r[0], r[1]); });
    html += mod ? row(prefix + 'demand', 'Normalized demand (D)') : '<div><span>Normalized demand (D)</span><b>Not in objective</b></div>';
    html += mod ? row(prefix + 'fairness', 'Jain fairness index J') : '<div><span>Jain fairness</span><b>Not in objective</b></div>';
    html += mod ? row(prefix + 'travel', 'Travel-time term 1/(1+T)') : '<div><span>Travel-time term</span><b>Inverse step hours</b></div>';
    html += row(prefix + 'combined', mod ? 'Combined reward (this step)' : 'Latest reward: 1 / T');
    html += row(prefix + 'spread', 'Q1/Q2 estimator spread (stability diagnostic)') + '</div></div>';
    html += '<canvas id="mz-' + id + '-canvas" width="500" height="500" role="img" aria-label="' + title + ' in the shared simulated maze"></canvas>';
    html += '<p class="maze-status-note">' + (mod ? 'SOP 2: Double Q-Learning update to mitigate overestimation bias; SOP 3: enriched state &lt;L,D,T,H,A&gt;.' : 'SOP 1: single-objective reward — optimizes travel time only; SOP 3: state is location-only.') + '</p>';
    if (mod) html += '<p class="maze-status-note">Spread is the live mean |Q1 − Q2| over stored state/action pairs (missing entries = 0). This alone does not prove overestimation bias was eliminated. The paper reports an average spread of 0.016 across 5,000 episodes; that is a reported paper result, not a measurement from this demo.</p>';
    return html + '</section>';
  }
  function buildUI() {
    var host = el('sub-maze'); if (!host) return;
    host.innerHTML = '<div class="card shared-maze-demo"><h2>Maze Demo — Standard Q-Learning vs Full MODQL</h2>' +
      '<p>Controlled head-to-head: both agents run in the same maze, same seed, same goal, same obstacle schedule.</p>' +
      '<p class="k">Simulated / for demonstration. This behavioural demonstration of SOP 1 vs SOP 3 also illustrates the SOP 2 Double-Q update. It does not reproduce Chapter 4 results. The controlled Laiban evaluation in Compare Algorithms remains the authoritative quantitative result.</p>' +
      '<p>Seed: <b id="mzSeed"></b> · <span id="mzSchedule"></span></p>' +
      '<div class="shared-maze-controls"><button type="button" class="btn p" id="mzComparisonPlay">Start Comparison</button><button type="button" class="btn g" id="mzComparisonReset">Reset Comparison</button><button type="button" class="btn g" id="mzComparisonStep">Advance One Step</button><button type="button" class="btn k" id="mzComparisonNext">Next Episode</button></div>' +
      '<div class="shared-maze-panels">' + panel('standard', 'Standard Q-Learning') + panel('modql', 'Full MODQL') + '</div>' +
      '<p class="maze-status-note">Q / M = agent; G = shared goal; shaded blocks = walls; dots = own trail. Obstacles update every 20 shared ticks, including collision ticks. Finished agents wait while the other continues.</p>' +
      '<p class="maze-status-note">Simulation definitions: cell demand = seeded 1–30 units; attempted moves take the destination cell’s seeded 1–5 minutes (collisions take the current cell’s time). T in rewards is this step’s time in hours. D is newly served cell demand / total grid demand; revisits and collisions serve zero new demand. J uses initial seeded service counts plus this agent’s unique served cells across four quadrants. Coverage includes the starting cell. Agents have independent service histories. Rewards use their stated objectives without distance shaping or goal bonuses; reward totals have different scales.</p>' +
      '<p class="maze-status-note">MODQL state: L = cell; D = remaining demand field (served cells = 0); T = elapsed minutes; H = quadrant service counts; A = four-direction accessibility. Next Episode preserves learning and advances the seeded environment stream; Reset Comparison creates a new seed and clears both agents.</p></div>';
    el('mzComparisonPlay').addEventListener('click', function () { if (timer === null) startTimer(); else { stopTimer(); render(); } });
    el('mzComparisonReset').addEventListener('click', function () { resetComparison(); });
    el('mzComparisonStep').addEventListener('click', function () { stopTimer(); stepBoth(); });
    el('mzComparisonNext').addEventListener('click', nextEpisode);
    // Optional ?mazeSeed=123 reproduces the entire comparison from episode one.
    var match = /(?:[?&])mazeSeed=(\d+)(?:&|$)/.exec(window.location.search);
    resetComparison(match ? Number(match[1]) : undefined);
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(function () { IDS.forEach(draw); });
      IDS.forEach(function (id) { observer.observe(el('mz-' + id + '-canvas')); });
    }
    window.addEventListener('resize', function () { IDS.forEach(draw); }, {passive: true});
    if ('MutationObserver' in window) {
      themeObserver = new MutationObserver(function () { IDS.forEach(draw); });
      themeObserver.observe(document.body, {attributes: true, attributeFilter: ['data-theme']});
    }
    // index.html stays unchanged. Register the missing tab with existing accessible
    // navigation, which normally captures a static list before DOMContentLoaded.
    var nav = el('researchNav');
    if (nav && !el('tab-maze')) {
      var tab = document.createElement('button');
      tab.id = 'tab-maze'; tab.type = 'button'; tab.textContent = 'Maze Demo';
      tab.setAttribute('role', 'tab'); tab.setAttribute('data-sub', 'maze');
      tab.setAttribute('aria-controls', 'sub-maze'); tab.setAttribute('aria-selected', 'false'); tab.tabIndex = -1;
      nav.appendChild(tab);
      host.setAttribute('role', 'tabpanel'); host.setAttribute('aria-labelledby', 'tab-maze'); host.tabIndex = 0;
      if (typeof researchTabs !== 'undefined' && typeof activateResearchTab === 'function') {
        researchTabs.push(tab);
        tab.addEventListener('click', function () { activateResearchTab(tab, false); IDS.forEach(draw); });
        tab.addEventListener('keydown', function (event) {
          var tabs = researchTabs.filter(function (item) { return getComputedStyle(item).display !== 'none'; });
          var index = tabs.indexOf(tab), next;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault(); activateResearchTab(tabs[next], true);
        });
      }
    }
    if (nav) nav.addEventListener('click', function () {
      if (!host.classList.contains('active')) { stopTimer(); render(); }
    });
  }
  document.addEventListener('DOMContentLoaded', buildUI);
})();
