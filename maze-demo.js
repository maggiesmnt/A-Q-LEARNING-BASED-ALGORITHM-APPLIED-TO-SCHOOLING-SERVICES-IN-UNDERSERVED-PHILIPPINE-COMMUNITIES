/* Controlled, simulated maze demonstration; not Chapter 4 evaluation evidence. */
(function () {
  'use strict';

  var SIZE = 10, OBSTACLE_RATIO = 0.25, CHANGE_FREQUENCY = 20;
  var MAX_STEPS = 100, STEP_MS = 200;
  var STEP_PENALTY = -0.1, COLLISION_PENALTY = -1.0, GOAL_REWARD = 10.0;
  var ACTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var IDS = ['standard', 'modql'];
  var env, runs, seed, timer = null, observer, themeObserver;

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

  var models = null, pair = null, speed = STEP_MS, training = false, trainingToken = 0, trainingProgress = 0;
  var TRAIN_EPISODES = 200;
  function makeWorld(value) {
    var world = new SharedDynamicMazeEnv(makeRng(value));
    world.reset();
    return MazeRouting.configure(world);
  }
  function newModels(value) {
    return {standard: new MazeRouting.Model('standard', makeRng(value ^ 0xA341316C)),
      modql: new MazeRouting.Model('modql', makeRng(value ^ 0xC8013EA4))};
  }
  function startEpisode() {
    env = makeWorld(seed);
    pair = new MazeRouting.Pair(env, models || newModels(seed), false);
    runs = pair.runs;
    render();
  }
  // Reset replays the original evaluation scenario and never deletes learned tables.
  function resetComparison(value) {
    stopTimer();
    if (training) { trainingToken++; training = false; trainingProgress = 0; }
    if (value !== undefined && (value >>> 0) !== seed) {
      trainingToken++; training = false; trainingProgress = 0; models = null; seed = value >>> 0;
    }
    startEpisode();
  }
  function trainPolicies() {
    if (training) return;
    stopTimer();
    training = true; trainingProgress = 0;
    var token = ++trainingToken, trained = newModels(seed), scenarioSeed = seed;
    TRAIN_EPISODES = Number(el('mzTrainingBudget').value);
    render();
    function chunk() {
      if (token !== trainingToken) return;
      try {
        for (var n = 0; n < 5 && trainingProgress < TRAIN_EPISODES; n++) {
          MazeRouting.trainEpisode(makeWorld(scenarioSeed), trained);
          trainingProgress++;
        }
        setText('mzTrainingStatus', 'Training both policies: ' + trainingProgress + ' / ' + TRAIN_EPISODES + ' episodes each');
        if (trainingProgress < TRAIN_EPISODES) setTimeout(chunk, 0);
        else {
          models = trained; training = false; el('mzSetup').open = false; startEpisode();
        }
      } catch (error) {
        training = false; models = null; render();
        setText('mzTrainingStatus', 'Training failed: ' + error.message);
      }
    }
    setTimeout(chunk, 0);
  }
  function allDone() { return pair.done(); }
  function stepBoth() {
    if (!models || training || pair.done()) return;
    visualTickRunning = timer !== null;
    pair.step();
    if (pair.done()) stopTimer();
    render();
    visualTickRunning = false;
  }
  function stopTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  function startTimer() {
    if (timer !== null || training || !models || pair.done()) return;
    timer = setInterval(stepBoth, speed);
    render();
  }
  function changeSpeed(value) {
    var active = timer !== null;
    stopTimer(); speed = Number(value);
    if (active) startTimer(); else render();
  }
  function setText(id, value) { var node = el(id); if (node) node.textContent = value; }
  function fixed(value) { return value === null || value === undefined ? 'Not sampled' : Number(value).toFixed(4); }
  function travelHours(minutes) { return (minutes / 60).toFixed(2) + ' hr'; }
  var travelUnit = 'hours';
  function formatTravelTime(minutes) {
    return travelUnit === 'hours' ? travelHours(minutes) : minutes.toFixed(1).replace(/\.0$/, '') + ' min';
  }
  function setTravelUnit(unit) {
    if (unit !== 'minutes' && unit !== 'hours') return;
    travelUnit = unit;
    render(); // Presentation only: no reset, training, policy draw or timer change.
  }
  function status(run) {
    return run.done ? run.status + ' (' + Object.keys(run.served).length + '/' + MazeRouting.count + ' served)' :
      training ? 'Training separate policies' : !models ? 'Awaiting training' : timer !== null ? 'Running' : run.steps ? 'Paused' : 'Ready';
  }
  function render() {
    if (!env || !pair) return;
    setText('mzSeed', seed);
    var overall = training ? 'Training' : allDone() ? 'Completed' : timer !== null ? 'Running' : runs.standard.steps || runs.modql.steps ? 'Paused' : 'Ready';
    setText('mzOverallStatus', overall);
    if (el('mzOverallStatus')) el('mzOverallStatus').setAttribute('data-status', overall.toLowerCase());
    setText('mzSchedule', 'Shared tick ' + env.steps + ' | obstacle updates ' + env.episodeData.environmentUpdates);
    setText('mzTrainingStatus', training ? 'Training both policies: ' + trainingProgress + ' / ' + TRAIN_EPISODES + ' episodes each' :
      models ? 'Frozen evaluation | ' + models.standard.episodes + ' training episodes each | epsilon = 0 | no playback Q updates' : 'Train both policies before evaluation.');
    var paintTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    IDS.forEach(function (id) {
      var run = runs[id], prefix = 'mz-' + id + '-', model = models && models[id], pos = env.currentPos[id];
      var unserved = env.sites.filter(function (s) { return !run.served[s.id]; });
      var lookup = MazeRouting.routes(env, pos);
      var values = {episode: 'Evaluation replay', steps: run.steps + ' / ' + MAX_STEPS, status: status(run),
        goal: '[' + env.goalPos.join(', ') + ']', action: run.action, epsilon: '0 (frozen evaluation)',
        minutes: formatTravelTime(run.minutes), reward: fixed(run.reward), coverage: run.learners + ' / ' + env.totalLearners + ' (' + (100 * run.learners / env.totalLearners).toFixed(1) + '%)',
        demand: run.serviceMinutes ? fixed(run.demand) : 'N/A', fairness: run.fairness.toFixed(3),
        travel: run.serviceMinutes ? run.travelTerm.toFixed(3) : 'N/A', combined: run.decisions.length ? fixed(run.latestReward) : 'N/A',
        destinations: Object.keys(run.served).length + ' / ' + env.sites.length,
        deferred: run.done ? run.deferred.length + ' final deferred' : unserved.length + ' pending',
        location: 'Row ' + (pos[0] + 1) + ', column ' + (pos[1] + 1), remaining: run.remaining.toFixed(1) + ' min',
        q: fixed(run.q), q1: id === 'modql' ? fixed(run.q1) : 'Not applicable',
        q2: id === 'modql' ? fixed(run.q2) : 'Not applicable',
        difference: id === 'modql' && run.q1 !== null ? fixed(Math.abs(run.q1 - run.q2)) : 'Not applicable',
        spread: id === 'modql' && model ? fixed(model.spread()) : 'Not applicable',
        update: model && model.lastUpdate ? 'Training: ' + model.lastUpdate.table + ' ' + fixed(model.lastUpdate.before) + ' -> ' + fixed(model.lastUpdate.after) + ' | ' + model.updates + ' updates' : 'No training updates yet',
        state: id === 'standard' ? 'S = L; location only' : MazeRouting.state(env, run, pos, id),
        rawDemand: env.sites.map(function (s) { return s.id + ': ' + (run.served[s.id] ? 0 : s.demand); }).join(' · '),
        history: env.sites.map(function (s, i) { return s.id + ': ' + run.historyDays[i] + ' days'; }).join(' · '),
        access: env.sites.map(function (s) { return s.id + ': ' + (run.served[s.id] ? 'served' : lookup(s.pos) ? 'open' : 'blocked'); }).join(' · '),
        returnError: run.done ? fixed(run.returnError) : 'Available after completion',
        known: run.known === null ? 'No decision yet' : run.known ? 'Trained state/action' : 'Unseen action: zero-Q deterministic tie'};
      Object.keys(values).forEach(function (k) { setText(prefix + k, values[k]); });
      ['coverage','fairness','minutes','destinations','deferred','combined','reward','travel','demand','q','q1','q2','difference','spread','returnError','update','known','location','remaining','rawDemand','history','access'].forEach(function (name) {
        setText(prefix + name + '-explain', metricExplanation(id, name));
      });
      var progress = el(prefix + 'coverageProgress');
      if (progress) { progress.value = 100 * run.learners / env.totalLearners; progress.setAttribute('aria-valuetext', values.coverage); }
      setText(prefix + 'badge', run.done ? (run.success ? 'Goal reached' : 'Stopped') : training ? 'Training' : timer !== null ? 'Running' : run.steps ? 'Paused' : 'Ready');
      draw(id, paintTime);
    });
    renderSummary();
    refreshMetricPopover();
    el('mzComparisonPlay').textContent = allDone() ? 'Comparison Complete' : timer !== null ? 'Pause Comparison' : runs.standard.steps || runs.modql.steps ? 'Resume Comparison' : 'Start Comparison';
    el('mzComparisonPlay').disabled = !models || training || allDone();
    el('mzComparisonStep').disabled = !models || training || allDone();
    el('mzTrain').disabled = training;
    el('mzTrainingBudget').disabled = training;
  }
  function renderSummary() {
    var definitions = [
      ['Learners served / coverage', 'Higher', function (r) { return r.learners + ' / ' + env.totalLearners + ' (' + (100 * r.learners / env.totalLearners).toFixed(1) + '%)'; }],
      ["Jain's Fairness Index", 'Higher', function (r) { return fixed(r.fairness); }],
      ['Travel Time', 'Lower for comparable service · ' + travelUnit, function (r) { return formatTravelTime(r.minutes); }],
      ['Movement Steps', 'Lower for comparable service', function (r) { return r.steps; }],
      ['Destinations served', 'Higher', function (r) { return Object.keys(r.served).length + ' / ' + env.sites.length; }],
      ['Deferred communities', 'Lower at completion', function (r) { return r.done ? r.deferred.length : 'Pending: ' + (env.sites.length - Object.keys(r.served).length); }],
      ['Completion status', 'Context', status]
    ];
    el('mzSummaryBody').innerHTML = definitions.map(function (d) {
      var standard = d[2](runs.standard), modql = d[2](runs.modql);
      return '<tr data-metric="' + d[0].toLowerCase().replace(/ /g, '-') + '"' + (standard !== modql ? ' class="has-difference"' : '') + '><th scope="row">' + d[0] + '<span class="shared-maze-direction">' + d[1] + '</span></th><td>' + standard + '</td><td>' + modql + '</td></tr>';
    }).join('');
    var assessment = assessPerformance(runs.standard, runs.modql, env.sites.length, !!models && !training);
    setText('mzAssessmentOutcome', assessment.outcome);
    setText('mzAssessmentReason', assessment.reason);
    el('mzAssessment').setAttribute('data-outcome', assessment.kind);
  }
  // Read-only presentation assessment. Dominance requires no worse result in
  // all five common metrics and at least one strict improvement. No score,
  // reward comparison, step-based winner, or statistical inference is used.
  function assessPerformance(standard, modql, totalSites, eligible) {
    function insufficient(reason) { return {kind: 'insufficient', outcome: 'Insufficient Evidence', reason: reason}; }
    if (!standard || !modql || !standard.served || !modql.served || !Array.isArray(standard.deferred) || !Array.isArray(modql.deferred)) return insufficient('Complete comparable metric records are unavailable.');
    if (!eligible || !standard.done || !modql.done) return insufficient('Complete both frozen evaluation runs before assessing this scenario.');
    if (!standard.success || !modql.success) return insufficient('At least one run did not reach the shared exit. Review its failure status and the available metrics; no overall outperformance claim is made.');
    var a = [standard.learners, standard.fairness, standard.minutes, Object.keys(standard.served).length, standard.deferred.length];
    var b = [modql.learners, modql.fairness, modql.minutes, Object.keys(modql.served).length, modql.deferred.length];
    if (a.concat(b).some(function (v) { return typeof v !== 'number' || !Number.isFinite(v) || v < 0; }) ||
        a[1] > 1 || b[1] > 1 || !Number.isInteger(totalSites) || totalSites <= 0 ||
        a[3] + a[4] !== totalSites || b[3] + b[4] !== totalSites) return insufficient('Comparable, complete metric records are unavailable or invalid.');
    var names = ['learner coverage', 'Jain fairness', 'travel time', 'destinations served', 'deferred communities'];
    var higher = [true, true, false, true, false], std = [], mod = [], tied = [];
    a.forEach(function (value, i) {
      var delta = b[i] - value;
      // Floating-point tolerance only; not a practical/significance threshold.
      if (Math.abs(delta) <= 1e-9) tied.push(names[i]);
      else if (higher[i] ? delta > 0 : delta < 0) mod.push(names[i]);
      else std.push(names[i]);
    });
    var explanation = [];
    if (mod.length) explanation.push('Metrics favoring Enhanced MODQL: ' + mod.join(', ') + '.');
    if (std.length) explanation.push('Metrics favoring Standard Q-Learning: ' + std.join(', ') + '.');
    if (tied.length) explanation.push('Tied: ' + tied.join(', ') + '.');
    if (!std.length && !mod.length) return insufficient('All five assessed metrics are tied in this completed scenario; neither algorithm outperformed the other.');
    return {kind: std.length && mod.length ? 'mixed' : mod.length ? 'modql' : 'standard',
      outcome: std.length && mod.length ? 'Mixed Results / Trade-offs' : mod.length ? 'Enhanced MODQL Outperformed Standard Q-Learning' : 'Standard Q-Learning Outperformed Enhanced MODQL',
      reason: explanation.join(' ')};
  }
  function themeColor(name, fallback) { return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback; }
  var visualMotion = {}, visualFrame = null, visualTickRunning = false;
  function motionPoint(motion, now) {
    var fraction = motion.duration ? Math.max(0, Math.min(1, (now - motion.start) / motion.duration)) : 1;
    return {pos: [motion.from[0] + (motion.target[0] - motion.from[0]) * fraction,
      motion.from[1] + (motion.target[1] - motion.from[1]) * fraction], moving: fraction < 1};
  }
  function agentPose(id, now) {
    var target = env.currentPos[id], motion = visualMotion[id];
    if (!motion || motion.world !== env) {
      motion = {world: env, from: clone(target), target: clone(target), start: now, duration: 0, speed: speed};
      visualMotion[id] = motion;
    } else if (!same(motion.target, target)) {
      // Interpolate only the actual adjacent transition provided by Pair.step.
      // Reset/new worlds never animate across unrelated maze positions.
      var adjacent = distance(motion.target, target) === 1 && env.isOpen(motion.target);
      motion.from = adjacent ? clone(motion.target) : clone(target);
      motion.target = clone(target); motion.start = now; motion.speed = speed;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      motion.duration = adjacent && visualTickRunning && !reduced ? Math.min(320, speed * 0.85) : 0;
    } else if (motion.speed !== speed) {
      var previous = motionPoint(motion, now);
      motion.from = previous.pos; motion.start = now;
      motion.duration = previous.moving ? Math.min(motion.duration, speed * 0.75) : 0;
      motion.speed = speed;
    }
    return motionPoint(motion, now);
  }
  function scheduleMazeFrame() {
    if (visualFrame !== null) return;
    visualFrame = window.requestAnimationFrame(function (now) {
      visualFrame = null;
      IDS.forEach(function (id) { draw(id, now); });
    });
  }
  // Direct adaptation of the original baseline draw() paint operations from
  // 7d63c82 / maze-legacy.js. Only data and interpolated agent pose are injected.
  // The comparison adds its live service markers and lighter, separated dots.
  function paintOriginalMaze(ctx, width, height, maze, history, goal, agent, colors, markers) {
    var cell = width / SIZE;
    ctx.clearRect(0, 0, width, height);
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      ctx.fillStyle = maze[r][c] ? colors.wall : colors.cell;
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
      ctx.strokeRect(c * cell, r * cell, cell, cell);
    }
    ctx.fillStyle = colors.trail;
    var visitedDots = {};
    if (markers) ctx.globalAlpha = 0.55;
    history.slice(0, -1).forEach(function (p) {
      if (markers && (visitedDots[key(p)] || maze[p[0]][p[1]])) return;
      visitedDots[key(p)] = true;
      ctx.beginPath(); ctx.arc((p[1] + 0.5) * cell, (p[0] + 0.5) * cell, cell * (markers ? 0.085 : 0.10), 0, Math.PI * 2); ctx.fill();
    });
    if (markers) {
      ctx.globalAlpha = 1;
      var start = markers.start;
      ctx.strokeStyle = colors.text; ctx.lineWidth = Math.max(1, cell * 0.02);
      ctx.strokeRect((start[1] + 0.28) * cell, (start[0] + 0.28) * cell, cell * 0.44, cell * 0.44);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + Math.max(10, cell * 0.34) + 'px sans-serif';
      markers.sites.forEach(function (site) {
        var x = (site.pos[1] + 0.5) * cell, y = (site.pos[0] + 0.5) * cell;
        ctx.fillStyle = maze[site.pos[0]][site.pos[1]] ? colors.wall : markers.served[site.id] ? colors.served : colors.cell;
        ctx.strokeStyle = colors.agent; ctx.lineWidth = Math.max(1, cell * 0.02);
        ctx.beginPath(); ctx.arc(x, y, cell * 0.30, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colors.text; ctx.fillText(site.id, x, y);
        if (markers.served[site.id]) {
          ctx.fillStyle = colors.agent; ctx.beginPath();
          ctx.arc(x + cell * 0.23, y + cell * 0.23, cell * 0.075, 0, Math.PI * 2); ctx.fill();
        }
      });
    }
    ctx.fillStyle = colors.goal; ctx.beginPath();
    ctx.arc((goal[1] + 0.5) * cell, (goal[0] + 0.5) * cell, cell * (markers ? 0.28 : 0.30), 0, Math.PI * 2); ctx.fill();
    if (markers) {
      ctx.fillStyle = colors.text;
      ctx.fillText('G', (goal[1] + 0.5) * cell, (goal[0] + 0.1) * cell);
    }
    ctx.fillStyle = colors.agent; ctx.beginPath();
    ctx.arc((agent[1] + 0.5) * cell, (agent[0] + 0.5) * cell, cell * 0.30, 0, Math.PI * 2); ctx.fill();
    if (markers) markers.sites.forEach(function (site) {
      if (!same(agent, site.pos)) return;
      ctx.fillStyle = colors.text;
      ctx.fillText(site.id, (site.pos[1] + 0.5) * cell, (site.pos[0] + 0.5) * cell);
    });
  }
  function draw(id, frameTime) {
    var canvas = el('mz-' + id + '-canvas');
    if (!canvas || !env) return;
    var bounds = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (bounds.width > 0) {
      var side = Math.round(bounds.width * dpr);
      if (canvas.width !== side) canvas.width = side;
      if (canvas.height !== side) canvas.height = side;
    }
    var now = frameTime === undefined ? performance.now() : frameTime;
    var pose = agentPose(id, now), style = getComputedStyle(canvas);
    function color(name, fallback) { return style.getPropertyValue(name).trim() || fallback; }
    var ctx = canvas.getContext('2d');
    var floor = themeColor('--maze-cell', '#273229'), wall = themeColor('--maze-wall', '#7d6e4a');
    var route = color('--comparison-route', themeColor('--maze-agent', '#d98b4e'));
    paintOriginalMaze(ctx, canvas.width, canvas.height, env.maze, runs[id].history, env.goalPos, pose.pos, {
      wall: 'color-mix(in srgb,' + wall + ' 85%,' + floor + ')', cell: floor,
      grid: themeColor('--maze-grid', 'rgba(255,255,255,.07)'),
      trail: route, text: themeColor('--txt', '#e8efe9'), served: color('--comparison-served', floor),
      goal: themeColor('--maze-goal', '#3fae7a'), agent: route
    }, {start: runs[id].history[0], sites: env.sites, served: runs[id].served});
    canvas.dataset.agentRow = pose.pos[0]; canvas.dataset.agentColumn = pose.pos[1];
    canvas.dataset.targetRow = env.currentPos[id][0]; canvas.dataset.targetColumn = env.currentPos[id][1];
    if (pose.moving) scheduleMazeFrame();
  }
  function row(id, label) { return '<div><span>' + label + '</span><b id="' + id + '"></b></div>'; }
  function rows(prefix, definitions) {
    return definitions.map(function (d) { return row(prefix + d[0], d[1]); }).join('');
  }
  // One shared selection, independent of playback and learned model state.
  var activeSop = 1;
  function selectSop(number) {
    if ([1, 2, 3].indexOf(number) < 0) return;
    if (number !== activeSop) closeMetricPopover(false);
    activeSop = number;
    [1, 2, 3].forEach(function (n) {
      IDS.forEach(function (id) { el('mz-' + id + '-sop' + n).hidden = n !== activeSop; });
      var tab = el('mzSop' + n);
      tab.setAttribute('aria-selected', String(n === activeSop));
      tab.tabIndex = n === activeSop ? 0 : -1;
    });
  }
  function metric(prefix, name, label, description, extra) {
    return '<div class="shared-maze-metric"><button type="button" class="shared-maze-metric-title" id="' + prefix + name + '-title" data-agent="' + prefix.slice(3, -1) + '" data-metric="' + name + '" aria-haspopup="dialog" aria-controls="mzMetricPopover" aria-expanded="false">' + label + '</button><b id="' + prefix + name + '"></b>' +
      (extra || '') + (description ? '<small>' + description + '</small>' : '') +
      '<p id="' + prefix + name + '-explain" hidden></p></div>';
  }
  var openMetric = null;
  function closeMetricPopover(restoreFocus) {
    if (!openMetric) return;
    var trigger = openMetric.trigger;
    trigger.setAttribute('aria-expanded', 'false');
    openMetric = null;
    var popover = el('mzMetricPopover');
    if (popover) popover.hidden = true;
    if (restoreFocus && trigger.isConnected && trigger.getClientRects().length) trigger.focus();
  }
  function positionMetricPopover() {
    if (!openMetric) return;
    var trigger = openMetric.trigger, popover = el('mzMetricPopover');
    if (!trigger.getClientRects().length) { closeMetricPopover(false); return; }
    var rect = trigger.getBoundingClientRect(), sidebar = trigger.closest('.shared-maze-status').getBoundingClientRect();
    var viewportHeight = window.innerHeight, viewportWidth = window.innerWidth;
    if (rect.bottom <= 0 || rect.top >= viewportHeight) { closeMetricPopover(false); return; }
    var toolbar = document.querySelector('.shared-maze-toolbar').getBoundingClientRect();
    var minimumTop = Math.max(12, toolbar.bottom + 8);
    var below = viewportHeight - rect.bottom - 20, above = rect.top - minimumTop - 8;
    var placeBelow = below >= 180 || below >= above;
    var availableHeight = placeBelow ? below : above;
    if (availableHeight < 80) { closeMetricPopover(false); return; }
    // Keep the panel inside the SOP column, below playback controls. Long
    // explanations scroll inside this one overlay, never resize the dashboard.
    var left = Math.max(12, sidebar.left), right = Math.min(viewportWidth - 12, sidebar.right);
    popover.style.width = Math.min(360, right - left) + 'px';
    popover.style.maxHeight = Math.min(360, availableHeight) + 'px';
    popover.style.left = left + 'px';
    var height = popover.getBoundingClientRect().height;
    popover.style.top = (placeBelow ? rect.bottom + 8 : rect.top - height - 8) + 'px';
  }
  function refreshMetricPopover() {
    if (!openMetric) return;
    setText('mzMetricPopoverHeading', openMetric.trigger.textContent);
    setText('mzMetricPopoverBody', metricExplanation(openMetric.agent, openMetric.name));
    positionMetricPopover();
  }
  function toggleMetricPopover(trigger) {
    if (openMetric && openMetric.trigger === trigger) { closeMetricPopover(true); return; }
    closeMetricPopover(false);
    openMetric = {trigger: trigger, agent: trigger.getAttribute('data-agent'), name: trigger.getAttribute('data-metric')};
    trigger.setAttribute('aria-expanded', 'true');
    el('mzMetricPopover').hidden = false;
    refreshMetricPopover();
    el('mzMetricPopover').focus({preventScroll: true});
  }
  function wireMetricTitles(host) {
    var popover = document.createElement('section');
    popover.id = 'mzMetricPopover'; popover.className = 'shared-maze-metric-popover';
    popover.hidden = true; popover.tabIndex = -1;
    popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-modal', 'false');
    popover.setAttribute('aria-labelledby', 'mzMetricPopoverHeading');
    popover.setAttribute('aria-describedby', 'mzMetricPopoverBody');
    popover.innerHTML = '<div class="shared-maze-popover-heading"><h2 id="mzMetricPopoverHeading"></h2><button type="button" id="mzMetricPopoverClose" aria-label="Close metric explanation">&times;</button></div><p id="mzMetricPopoverBody"></p>';
    document.body.appendChild(popover);
    host.addEventListener('click', function (event) {
      var trigger = event.target.closest('.shared-maze-metric-title');
      if (trigger) toggleMetricPopover(trigger);
    });
    el('mzMetricPopoverClose').addEventListener('click', function () { closeMetricPopover(true); });
    document.addEventListener('click', function (event) {
      if (openMetric && !popover.contains(event.target) && !openMetric.trigger.contains(event.target)) closeMetricPopover(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && openMetric) { event.preventDefault(); closeMetricPopover(true); }
    });
    window.addEventListener('resize', positionMetricPopover, {passive: true});
    window.addEventListener('scroll', positionMetricPopover, {capture: true, passive: true});
  }
  function metrics(prefix, definitions) {
    return definitions.map(function (d) { return metric(prefix, d[0], d[1], d[2] || ''); }).join('');
  }
  function sopHeader(number, title, subtitle) {
    return '<h5><span>SOP ' + number + '</span>' + title + '</h5><p class="shared-maze-sop-intro">' + subtitle + '</p>';
  }
  function panel(id, title) {
    var prefix = 'mz-' + id + '-', mod = id === 'modql';
    var formula = mod ? 'Demand / max demand × Jain fairness × 1/(1 + travel hours)' : '1 / route travel hours';
    var observations = mod ? 'Policy inputs: location, learner demand, remaining time, visit history and accessibility.' :
      'Location-only policy. The other values below are environmental measurements for comparison, not inputs to the Standard Q-Learning state.';
    return '<section class="shared-maze-panel" data-algorithm="' + id + '" aria-labelledby="' + prefix + 'title">' +
      '<header class="shared-maze-panel-header"><span class="shared-maze-monogram" aria-hidden="true">' + (mod ? 'M' : 'Q') + '</span><div><span class="shared-maze-eyebrow">' + (mod ? 'Proposed algorithm' : 'Existing algorithm') + '</span><h3 id="' + prefix + 'title">' + title + '</h3></div><span class="shared-maze-panel-badge" id="' + prefix + 'badge">Ready</span></header>' +
      '<div class="shared-maze-body"><aside class="shared-maze-status" aria-label="' + title + ' research objective dashboard">' +
      '<section class="shared-maze-sop" id="' + prefix + 'sop1" role="tabpanel" aria-labelledby="mzSop1 ' + prefix + 'title" tabindex="0">' +
      sopHeader(1, 'Reward &amp; Service Performance', 'How effectively does the algorithm serve communities?') +
      '<div class="maze-status-grid">' +
      metric(prefix, 'coverage', 'Learners Reached', 'Learners reached out of the total in this simulation.', '<progress id="' + prefix + 'coverageProgress" max="100" value="0" aria-label="' + title + ' learner coverage"></progress>') +
      metrics(prefix, [['fairness','Service Fairness','Jain index: closer to 1 means more evenly distributed visits.'],['minutes','Travel Time','Time spent traveling, including the exit journey.'],['destinations','Communities Served','Communities where service was completed.'],['deferred','Communities Remaining','Pending during the run; final deferrals after completion.']]) +
      '</div><details class="shared-maze-technical"><summary>Reward calculation &amp; research details</summary><div class="shared-maze-objective"><span>Reward function</span><b>' + formula + '</b></div><div class="maze-status-grid">' +
      metrics(prefix, [['combined','Current Reward','Reward from the last service decision.'],['reward','Cumulative Reward','Sum in this algorithm’s own reward scale.'],['travel','Travel Efficiency','Travel term for the last successful service.'],['demand','Normalized Demand','Demand factor for the last successful service.']]) +
      '</div><p class="shared-maze-help">Rewards use different formulas and are not directly ranked across algorithms.</p></details></section>' +
      '<section class="shared-maze-sop" id="' + prefix + 'sop2" role="tabpanel" aria-labelledby="mzSop2 ' + prefix + 'title" tabindex="0" hidden>' +
      sopHeader(2, 'Decision Value &amp; Stability', 'How reliable and consistent are the estimated decision values?') +
      '<p class="shared-maze-awareness">' + (mod ? 'Two estimators assess the same destination decision. Agreement is different from accuracy.' : 'One Q-table estimates decision values. Two-estimator diagnostics do not apply.') + '</p><div class="maze-status-grid">' +
      metrics(prefix, [['q','Estimated Decision Value','Expected future reward in this algorithm’s own units.'],['q1','Q1 Estimate',mod ? 'The first learned value estimator.' : 'N/A — Standard uses one Q-table.'],['q2','Q2 Estimate',mod ? 'The second learned value estimator.' : 'N/A — Standard uses one Q-table.'],['difference','Estimator Difference','Agreement at the last selected decision, not proof of accuracy.'],['spread','Overall Estimator Difference','Average disagreement across stored values.'],['returnError','Estimate vs Observed Return','Descriptive gap from this completed rollout, when sampled.']]) +
      '</div><details class="shared-maze-technical"><summary>Training &amp; decision verification</summary><div class="maze-status-grid">' +
      metrics(prefix, [['update','Last Training Update'],['known','Decision Source']]) +
      '</div></details><p class="shared-maze-help">Values are sampled at the last destination decision. A small Q1–Q2 difference does not prove overestimation bias was eliminated. No stability percentage or unvalidated reliability rating is assigned.</p></section>' +
      '<section class="shared-maze-sop" id="' + prefix + 'sop3" role="tabpanel" aria-labelledby="mzSop3 ' + prefix + 'title" tabindex="0" hidden>' +
      sopHeader(3, 'Routing Awareness', 'What information is considered when choosing the next destination?') +
      '<p class="shared-maze-awareness">' + observations + '</p><div class="maze-status-grid">' +
      metrics(prefix, [['location','Current Location','Position in the shared grid.'],['remaining','Remaining Service Time',mod ? 'Time left for travel and service.' : 'Environment only — not part of the policy state.'],['rawDemand','Learner Demand',mod ? 'Learners at each unserved community.' : 'Environment only — not a policy input.'],['history','Visit History',mod ? 'Days since each community was served.' : 'Environment only — not a policy input.'],['access','Road Accessibility',mod ? 'Current open routes to unserved communities.' : 'Environment only; common movement constraints still apply.']]) +
      '</div><details class="shared-maze-technical"><summary>Research state encoding</summary><p>' + (mod ? 'S = &lt;L, D, T, H, A&gt;. The tabular model groups demand, time, history and accessibility into research-defined buckets.' : 'S = L. Only location identifies rows in the Standard Q-table.') + '</p><b class="shared-maze-state-code" id="' + prefix + 'state"></b></details></section></aside>' +
      '<div class="shared-maze-visual"><div class="shared-maze-board"><canvas id="mz-' + id + '-canvas" width="500" height="500" role="img" aria-label="' + title + ': actual visited-cell trail, agent and shared goal"></canvas></div></div></div>' +
      '</section>';
  }
  // All explanations derive from the same records rendered above. These
  // read-only arithmetic examples do not change research metric definitions.
  function metricExplanation(id, name) {
    var run = runs[id], model = models && models[id], mod = id === 'modql';
    var sites = env.sites, count = sites.length, total = env.totalLearners;
    var served = Object.keys(run.served).length, last = run.decisions[run.decisions.length - 1];
    var source = ' Inputs are seeded simulation data, not measured Laiban field records.';
    function fmt(v) { return Number(v).toFixed(4); }
    var minutes = run.serviceMinutes ? 60 * (1 / run.travelTerm - 1) : null;
    switch (name) {
      case 'coverage':
        return 'How many learners were reached? Demand is counted once for each completed community service. ' + run.learners + ' ÷ ' + total + ' × 100 = ' + (100 * run.learners / total).toFixed(1) + '%.' + source;
      case 'fairness':
        var sum = run.service.reduce(function (a,b) { return a+b; },0);
        var squares = run.service.reduce(function (a,b) { return a+b*b; },0);
        return 'How evenly are visits distributed? Closer to 1 means more even visits; it does not measure total learners reached. Counts [' + run.service.join(', ') + '] include each community’s seeded previous visits plus this agent’s completed visits. ' +
          (squares ? 'J = (sum of visits)² / (community count × sum of squared visits) = ' + sum + '² / (' + count + ' × ' + squares + ') = ' + fmt(run.fairness) + '.' : 'All counts are zero; the existing jain() helper returns 1 by convention.') + source;
      case 'minutes':
        return 'Time spent entering grid cells, including travel to the shared exit; service time is excluded. Travel Time = ' + formatTravelTime(run.minutes) + '. ' + (travelUnit === 'hours' ? 'Hours = internal minutes ÷ 60: ' + run.minutes.toFixed(1) + ' min ÷ 60 = ' + formatTravelTime(run.minutes) + '.' : 'Stored minutes are displayed directly, with at most one decimal place.') + ' The display unit and rounding never change calculations. Cell times are seeded 1–5 minutes.' + source;
      case 'destinations':
        return 'A community counts only after arrival and completion of its service. ' + served + ' of ' + count + ' communities served. Each service uses ' + MazeRouting.serviceMinutes + ' simulated minutes; crossing a cell alone does not count.';
      case 'deferred':
        return count + ' communities − ' + served + ' completed services = ' + (count-served) + ' unserved. ' +
          (run.done ? 'These are final deferred communities: ' + (run.deferred.map(function (d) { return d.id + ' (' + d.reason + ')'; }).join('; ') || 'none') + '.' : 'These communities are still pending, not final deferrals.');
      case 'combined':
        if (!last) return 'No service decision has completed yet, so there is no current reward sample.';
        if (last.reward === 0) return 'The last service decision failed to complete service and earned zero. Factors shown for a previous successful service are not a decomposition of this failure.';
        return mod ? 'Reward combines demand, fairness and travel efficiency. (' + fmt(run.demand) + ') × (' + fmt(run.fairness) + ') × (' + fmt(run.travelTerm) + ') ≈ ' + fmt(run.latestReward) + '. Demand is destination demand / maximum destination demand; Jain fairness uses updated visit counts. Shown factors are rounded. Source: maze-routing.js Pair.step.' :
          'Standard rewards inverse route travel time only. Using the stored travel term, route hours = 1 / E − 1, giving ' + formatTravelTime(minutes) + ' for the last successful service journey. Reward = 1 / max(unrounded route hours, 0.000001) ≈ ' + fmt(run.latestReward) + '. Source: maze-routing.js Pair.step; the selected time display is not used in the reward calculation.';
      case 'reward':
        return 'Sum of completed and aborted service-decision rewards: [' + run.decisions.map(function (d) { return fmt(d.reward); }).join(' + ') + '] = ' + fmt(run.reward) + '. ' + (mod ? 'MODQL uses its nonlinear multi-objective reward.' : 'Standard uses inverse route travel hours.') + ' These scales differ and are not directly comparable.';
      case 'travel':
        return minutes === null ? 'No successful service journey has completed; a last-service efficiency sample is unavailable.' :
          'Last successful service travel term E = 1/(1 + route hours). The stored term is ' + fmt(run.travelTerm) + '; route time = 1/E − 1 hours, displayed as ' + formatTravelTime(minutes) + '. Larger E means less travel for that service. Exit transit is included in total travel, not this last-service reward factor. Calculations use unrounded time.';
      case 'demand':
        if (!run.serviceMinutes) return 'No successful service has completed, so there is no last normalized demand sample.';
        var site = sites.filter(function (s) { return s.id === run.location; })[0], max = Math.max.apply(null,sites.map(function (s) { return s.demand; }));
        return site ? 'For the last successfully served community ' + site.id + ': ' + site.demand + ' learners ÷ maximum demand ' + max + ' = ' + fmt(run.demand) + '. ' + (mod ? 'This factor contributes to MODQL reward.' : 'This is an external measurement, not a factor in Standard reward.') + source : 'A verified last-service demand record is unavailable.';
      case 'q':
        if (run.q === null) return 'No destination decision has been sampled yet. A Q-value is an estimate of discounted future rewards, not a confidence percentage.';
        return (mod ? 'Mean of the sampled Q1 and Q2 estimates: (' + fmt(run.q1) + ' + ' + fmt(run.q2) + ') / 2 = ' + fmt(run.q) + '.' : 'The single learned Q-table estimated ' + fmt(run.q) + ' for the last selected destination action.') + ' This is expected discounted reward in this algorithm’s own units, not a confidence percentage. ' + (run.known ? 'The state/action was sampled during training.' : 'This action has no training samples and uses its initialized zero estimate.') + ' Source: Model.values() and Pair.step().';
      case 'q1': case 'q2':
        return !mod ? 'Not applicable: Standard uses a single Q-table.' : run.q === null ? 'No destination decision has been sampled yet.' :
          name.toUpperCase() + ' estimates ' + fmt(run[name]) + ' for the last selected state/action. During training one table selects the next action while the other evaluates it. Frozen playback does not update either table; zero can be an initialized entry.';
      case 'difference':
        return !mod ? 'Not applicable to a single-table agent.' : run.q === null ? 'No paired estimator sample is available yet.' :
          '|Q1 − Q2| = |' + fmt(run.q1) + ' − ' + fmt(run.q2) + '| = ' + fmt(Math.abs(run.q1-run.q2)) + '. A smaller gap indicates agreement only. Both estimators can agree and still be inaccurate.';
      case 'spread':
        return !mod ? 'Not applicable to a single-table agent.' : !model ? 'Train the policies to obtain estimator diagnostics.' :
          'Mean absolute Q1−Q2 difference over all stored state/action pairs, treating missing entries as zero: ' + fmt(model.spread()) + '. Source: Model.spread(). This describes estimator disagreement, not measured bias reduction or a stability percentage.';
      case 'returnError':
        return !run.done ? 'Available after the rollout finishes: compare sampled estimates with actual discounted rewards from frozen playback.' :
          run.returnError === null ? 'No trained-action estimate/return pairs were available for this rollout.' :
          'Mean estimated value minus realized discounted return = ' + fmt(run.returnError) + ', over ' + run.decisions.filter(function (d) { return d.known; }).length + ' trained-action samples. Returns use G = reward + 0.9 × next return per destination decision. Positive gaps mean estimates exceeded this one observed return. This is descriptive, not a statistical bias-reduction finding. Source: Pair.finish().';
      case 'update':
        if (!model || !model.lastUpdate) return 'No completed training update is available.';
        var u=model.lastUpdate;
        return 'Most recent actual training update (' + u.table + '): old + alpha × (target − old) = ' + fmt(u.before) + ' + ' + model.alpha + ' × (' + fmt(u.target) + ' − ' + fmt(u.before) + ') ≈ ' + fmt(u.after) + '. Source: Model.learn(). Playback is frozen; no update occurs while animating.';
      case 'known':
        return run.known === null ? 'No decision sampled yet.' : run.known ? 'The selected state/action has at least one actual training update. This is provenance, not proof the decision is optimal.' : 'The selected state/action had no training updates. The initialized zero-Q tie is resolved deterministically; no shortest-path or reward-ranking substitute chooses the destination.';
      case 'location':
        var pos=env.currentPos[id];
        return 'Actual current position: row ' + (pos[0]+1) + ', column ' + (pos[1]+1) + ' in the 10×10 grid. Research keys use zero-based [' + pos.join(', ') + ']. ' + (mod ? 'Location is L in the enriched state.' : 'This is the only variable encoded in the Standard state.');
      case 'remaining':
        return 'Budget accounting remains in minutes: ' + MazeRouting.budget + ' − ' + run.minutes.toFixed(1) + ' travel − ' + run.serviceMinutes.toFixed(1) + ' service = ' + run.remaining.toFixed(1) + ' minutes left. Travel Time is displayed separately as ' + formatTravelTime(run.minutes) + '; its rounding is not fed back into this calculation. ' + (mod ? 'The state buckets remaining time below half the budget as 0, otherwise 1.' : 'Displayed for evaluation; not encoded in the location-only Q-table state.');
      case 'rawDemand':
        return sites.map(function(s){return 'Community '+s.id+' at ['+s.pos.join(', ')+']: '+(run.served[s.id]?0:s.demand)+' unserved learners';}).join('; ') + '. ' + (mod ? 'Unserved reachable demand is bucket 1 below 65% of maximum demand, otherwise 2; served or unreachable destinations have bucket 0.' : 'Environmental information only, not an input to Standard’s state.') + source;
      case 'history':
        return sites.map(function(s,i){return s.id+': '+run.historyDays[i]+' days, '+run.service[i]+' total visits';}).join('; ') + '. Recency starts from the scenario and resets to zero after a completed service. ' + (mod ? 'The state uses bucket 0 for up to 14 days, otherwise 1.' : 'History is not encoded in the Standard state.') + source;
      case 'access':
        return 'Open means a legal route currently exists from this agent to the unserved community; blocked means no such route. Served destinations are marked separately. ' + (mod ? 'The grid uses binary accessibility in A, not a measured real-world road-risk score.' : 'Reachability is shown externally, not encoded in Standard’s state; both agents still obey the same feasible-action constraints.') + ' Source: MazeRouting.routes() on the shared live maze.';
    }
    return 'A verified explanation is not available for this metric.';
  }
  function buildUI() {
    var host = el('sub-maze'); if (!host) return;
    host.innerHTML = '<div class="shared-maze-demo"><header class="shared-maze-heading"><div><h1>Maze Comparison</h1><p>Standard Q-Learning <span>vs</span> Enhanced MODQL</p></div><span class="shared-maze-overall-status" id="mzOverallStatus" role="status">Ready</span></header>' +
      '<section class="shared-maze-toolbar" aria-label="Simulation controls"><details class="shared-maze-setup-shell" id="mzSetup" open><summary>Scenario &amp; policy preparation<span>Seed <b id="mzSeed"></b> &middot; Equal training budgets</span></summary><div class="shared-maze-setup"><label>Scenario seed <input id="mzSeedInput" type="number" min="0" max="4294967295" step="1"></label><button type="button" class="btn g" id="mzApplySeed">Load Scenario</button><label>Episodes per algorithm <select id="mzTrainingBudget"><option>100</option><option selected>200</option><option>500</option><option>1000</option></select></label><button type="button" class="btn g" id="mzTrain">Train Both Policies</button></div></details>' +
      '<div class="shared-maze-controls"><button type="button" class="btn p" id="mzComparisonPlay">Start Comparison</button><button type="button" class="btn g" id="mzComparisonReset">Reset Comparison</button><button type="button" class="btn g" id="mzComparisonStep">Advance One Step</button><label>Simulation speed <select id="mzSpeed"><option value="800">0.25x</option><option value="400">0.5x</option><option value="200" selected>1x</option><option value="100">2x</option><option value="50">4x</option></select></label><label>Travel time units <select id="mzTravelUnit"><option value="hours" selected>Hours</option><option value="minutes">Minutes</option></select></label><span class="shared-maze-schedule" id="mzSchedule"></span></div><p class="shared-maze-training-status" id="mzTrainingStatus" role="status"></p><div class="shared-maze-sop-controls" role="tablist" aria-label="Research objective for both algorithms"><span>Select research objective</span><button type="button" class="btn g" id="mzSop1" role="tab" aria-controls="mz-standard-sop1 mz-modql-sop1" aria-selected="true" tabindex="0">SOP 1</button><button type="button" class="btn g" id="mzSop2" role="tab" aria-controls="mz-standard-sop2 mz-modql-sop2" aria-selected="false" tabindex="-1">SOP 2</button><button type="button" class="btn g" id="mzSop3" role="tab" aria-controls="mz-standard-sop3 mz-modql-sop3" aria-selected="false" tabindex="-1">SOP 3</button></div></section>' +
      '<div class="shared-maze-legend" aria-label="Maze legend"><span><i class="legend-route standard"></i>Standard route</span><span><i class="legend-route modql"></i>MODQL route</span><span><i class="legend-wall"></i>Obstacle</span><span><i class="legend-goal"></i>Goal</span></div>' +
      '<div class="shared-maze-panels">' + panel('standard', 'Standard Q-Learning') + panel('modql', 'Enhanced MODQL') + '</div>' +
      '<section class="shared-maze-summary" aria-labelledby="mzResultsTitle"><header><div><span class="shared-maze-eyebrow">Shared scenario &middot; Live results</span><h2 id="mzResultsTitle">Comparative Performance Results</h2></div><span class="shared-maze-summary-note">Common evaluation definitions</span></header><div class="shared-maze-table-scroll"><table><thead><tr><th scope="col">Metric</th><th scope="col">Standard Q-Learning</th><th scope="col">Enhanced MODQL</th></tr></thead><tbody id="mzSummaryBody"></tbody></table></div><p class="shared-maze-help">Travel and step counts should be interpreted alongside service delivered. Rewards use different scales; the assessment below reports metric dominance or trade-offs without an overall score.</p><section class="shared-maze-assessment" id="mzAssessment" aria-labelledby="mzAssessmentHeading"><h3 id="mzAssessmentHeading">Algorithm Performance Assessment</h3><p class="shared-maze-assessment-outcome" id="mzAssessmentOutcome" role="status">Insufficient Evidence</p><p id="mzAssessmentReason"></p><p class="shared-maze-help">Current simulated scenario only. Higher coverage, fairness and destinations served are desirable; lower travel time and deferrals are desirable. Outperformance requires no worse result on all five metrics and a strict improvement on at least one. Raw rewards and movement steps are excluded. No aggregate statistical conclusion is established by this assessment.</p></section></section>' +
      '<details class="shared-maze-diagnostics"><summary>Scenario definitions, training protocol, and limits</summary><p>Six reachable seeded open cells are service destinations. Demand is seeded 1-30 learners; traversal time is seeded 1-5 minutes per entered cell; prior visits are seeded 0-4 and service recency 1-30 days per destination. Each service takes 10 simulated minutes. Both agents have 120 minutes and at most 100 movement steps, reserving travel to the common exit. Demand is counted once per served destination. Fairness uses the same initial six visit counts plus each agent\'s completed service visits via engine.js jain(). Unserved destinations become deferrals only when that agent finishes.</p><p>Training uses equal scenario-specific episode budgets, alpha 0.1, gamma 0.9, epsilon 1 decaying by 0.995 to 0.05, and independent seeded policy streams. Evaluation restores that scenario, sets epsilon to zero and freezes models. Repeated evaluation of a training scenario is not a held-out generalization experiment. A previously untrained state/action uses a labeled deterministic zero-Q tie; there is no reward-ranking fallback. Reset replays the same scenario without deleting models. Loading a different seed requires training new maze models.</p><p>The adapter maps open cells to graph nodes and legal cardinal moves to edges. Policies choose service destinations; the common shortest-time movement executor merely realizes a chosen action and replans its path when walls change every 20 ticks. This executor does not choose destinations. Time advances once per entered cell; service time is charged on arrival. Goal transit has no learning reward. Training reward and two-bucket state rules mirror train_q_learning.py. Maze policies are trained here; the bundled Laiban policy is incompatible with grid cells and is never relabeled as a maze model. Existing component experiments and Laiban training outputs are unchanged.</p></details></div>';
    var match = /(?:[?&])mazeSeed=(\d+)(?:&|$)/.exec(window.location.search);
    seed = match ? Number(match[1]) >>> 0 : Date.now() >>> 0;
    el('mzSeedInput').value = seed;
    el('mzComparisonPlay').addEventListener('click', function () { if (timer === null) startTimer(); else { stopTimer(); render(); } });
    el('mzComparisonReset').addEventListener('click', function () { resetComparison(); });
    el('mzComparisonStep').addEventListener('click', function () { stopTimer(); stepBoth(); });
    el('mzSpeed').addEventListener('change', function () { changeSpeed(this.value); });
    el('mzTravelUnit').addEventListener('change', function () { setTravelUnit(this.value); });
    el('mzTrain').addEventListener('click', trainPolicies);
    el('mzApplySeed').addEventListener('click', function () {
      var value = Number(el('mzSeedInput').value);
      if (!Number.isInteger(value) || value < 0 || value > 4294967295) { el('mzSeedInput').reportValidity(); return; }
      resetComparison(value);
    });
    wireMetricTitles(host);
    startEpisode();
    selectSop(1);
    [1, 2, 3].forEach(function (number) {
      el('mzSop' + number).addEventListener('click', function () { selectSop(number); });
      el('mzSop' + number).addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight') next = activeSop % 3 + 1;
        else if (event.key === 'ArrowLeft') next = (activeSop + 1) % 3 + 1;
        else if (event.key === 'Home') next = 1;
        else if (event.key === 'End') next = 3;
        else return;
        event.preventDefault(); selectSop(next); el('mzSop' + next).focus();
      });
    });
    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(function () { IDS.forEach(function (id) { draw(id); }); });
      IDS.forEach(function (id) { observer.observe(el('mz-' + id + '-canvas')); });
    }
    window.addEventListener('resize', function () { IDS.forEach(function (id) { draw(id); }); }, {passive: true});
    if ('MutationObserver' in window) {
      themeObserver = new MutationObserver(function () { IDS.forEach(function (id) { draw(id); }); });
      themeObserver.observe(document.body, {attributes: true, attributeFilter: ['data-theme']});
    }
    var nav = el('researchNav');
    if (nav) nav.addEventListener('click', function () {
      if (!host.classList.contains('active')) { stopTimer(); render(); }
    });
    if (nav) nav.addEventListener('keydown', function () {
      if (!host.classList.contains('active')) { stopTimer(); render(); }
    });
  }
  document.addEventListener('DOMContentLoaded', buildUI);
})();
