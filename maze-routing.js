/* Shared-grid Q-learning environment and tabular agents for Maze Comparison. */
var MazeRouting = (function () {
  'use strict';
  var ACTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var ACTION_NAMES = ['Up', 'Down', 'Left', 'Right'];
  var IDS = ['standard', 'modql'];
  var PARAMETERS = Object.freeze({
    episodes: 5000,
    alpha: 0.10,
    gamma: 0.90,
    epsilonStart: 1.00,
    epsilonMin: 0.05,
    epsilonDecay: 0.995,
    heldOutScenarios: 200
  });

  function key(point) { return point[0] + ',' + point[1]; }
  function copy(point) { return point.slice(); }
  function QTable() {
    this.indexByKey = new Map();
    this.keys = [];
    this.data = new Float64Array(64);
  }
  QTable.prototype.index = function (stateKey, create) {
    var index = this.indexByKey.get(stateKey);
    if (index !== undefined || !create) return index;
    index = this.keys.length;
    this.indexByKey.set(stateKey, index);
    this.keys.push(stateKey);
    if ((index + 1) * 4 > this.data.length) {
      var expanded = new Float64Array(this.data.length * 2);
      expanded.set(this.data);
      this.data = expanded;
    }
    return index;
  };
  QTable.prototype.get = function (stateKey) {
    var index = this.index(stateKey, false);
    return index === undefined ? undefined : this.data.subarray(index * 4, index * 4 + 4);
  };
  QTable.prototype.set = function (stateKey, values) {
    var index = this.index(stateKey, true);
    this.data.set(values, index * 4);
    return this;
  };
  QTable.prototype.has = function (stateKey) {
    return this.indexByKey.has(stateKey);
  };
  QTable.prototype.entries = function () {
    var entries = [];
    for (var index = 0; index < this.keys.length; index++) {
      entries.push([this.keys[index], Array.from(this.data.subarray(index * 4, index * 4 + 4))]);
    }
    return entries;
  };
  QTable.prototype.forEach = function (callback, thisArg) {
    for (var index = 0; index < this.keys.length; index++) {
      callback.call(thisArg, this.data.subarray(index * 4, index * 4 + 4), this.keys[index], this);
    }
  };
  Object.defineProperty(QTable.prototype, 'size', {
    get: function () { return this.keys.length; }
  });
  function seededRandom(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }
  function emptyRow() { return new Float64Array(4); }
  function row(table, state) { return table.get(state) || emptyRow(); }
  function fairness(values) {
    var sum = 0, squares = 0;
    values.forEach(function (value) { sum += value; squares += value * value; });
    return squares ? sum * sum / (values.length * squares) : 1;
  }
  function demandBucket(value, maximum) {
    return value / Math.max(maximum, 1) < 0.65 ? 1 : 2;
  }
  function historyBucket(days) { return days <= 14 ? 0 : 1; }
  function inBounds(point, size) {
    return point[0] >= 0 && point[1] >= 0 && point[0] < size && point[1] < size;
  }

  function World(config, seed) {
    this.id = config.id;
    this.size = config.size || 10;
    this.start = copy(config.start);
    this.sites = config.sites.map(function (site) {
      return {
        id: site.id,
        name: site.name || site.id,
        letter: site.letter || site.id,
        position: copy(site.position),
        demand: Number(site.demand) || 0,
        initialVisits: Number(site.initialVisits) || 0,
        lastVisitDays: Number(site.lastVisitDays) || 0
      };
    });
    this.totalDemand = this.sites.reduce(function (sum, site) { return sum + site.demand; }, 0);
    this.maximumDemand = Math.max.apply(null, this.sites.map(function (site) { return site.demand; }));
    this.sites.forEach(function (site) {
      site.stateDemandBucket = demandBucket(site.demand, this.maximumDemand);
      site.stateHistoryBucket = historyBucket(site.lastVisitDays);
    }, this);
    this.budgetMinutes = config.budgetMinutes;
    this.serviceMinutes = config.serviceMinutes;
    this.maxSteps = config.maxSteps || 1000;
    this.dynamicFrequency = config.dynamicFrequency || 0;
    this.dynamicKind = config.dynamicKind || 'grid';
    this.rng = seededRandom(seed);
    this.tick = 0;
    this.obstacleUpdates = 0;
    this.obstacleChanges = 0;
    this.allowedCells = config.openCells ? new Set(config.openCells.map(key)) : null;
    this.obstacles = new Set((config.obstacles || []).map(key));
    this.overlay = new Set();
    this.overlayCandidates = (config.overlayCandidates || []).map(copy);
    this.costs = config.cellMinutes || {};
    this.defaultCellMinutes = config.defaultCellMinutes || 1;
    this.positions = {standard: copy(this.start), modql: copy(this.start)};
    this.protected = new Set([key(this.start)]);
    this.sites.forEach(function (site) { this.protected.add(key(site.position)); }, this);

    if (config.obstacleRatio) this.generateObstacles(config.obstacleRatio);
    if (config.ensureConnected) this.ensureInitialPaths();
    this.topologyVersion = 0;
    this.reachabilityCache = new Map();
    this.travelCache = new Map();
    if (this.dynamicKind === 'laiban') {
      this.overlayCandidates = this.overlayCandidates.filter(function (point) {
        return this.allowedCells && this.allowedCells.has(key(point)) && !this.protected.has(key(point));
      }, this);
    }
  }
  World.prototype.generateObstacles = function (ratio) {
    var candidates = [];
    for (var rowIndex = 0; rowIndex < this.size; rowIndex++) {
      for (var colIndex = 0; colIndex < this.size; colIndex++) {
        var point = [rowIndex, colIndex];
        if (this.protected.has(key(point)) && this.protected.size) continue;
        if (this.allowedCells && !this.allowedCells.has(key(point))) continue;
        candidates.push(point);
      }
    }
    var wanted = Math.floor(this.size * this.size * ratio);
    while (wanted > 0 && candidates.length) {
      var index = Math.floor(this.rng() * candidates.length);
      this.obstacles.add(key(candidates.splice(index, 1)[0]));
      wanted--;
    }
  };
  World.prototype.isOpen = function (point) {
    var cellKey = key(point);
    return inBounds(point, this.size) &&
      (!this.allowedCells || this.allowedCells.has(cellKey)) &&
      !this.obstacles.has(cellKey) && !this.overlay.has(cellKey);
  };
  World.prototype.cellMinutes = function (point) {
    var value = this.costs[key(point)];
    return Number.isFinite(value) && value > 0 ? value : this.defaultCellMinutes;
  };
  World.prototype.legalActions = function (id) {
    var point = this.positions[id], actions = [];
    for (var action = 0; action < ACTIONS.length; action++) {
      var delta = ACTIONS[action];
      var next = [point[0] + delta[0], point[1] + delta[1]];
      if (this.isOpen(next)) actions.push(action);
    }
    return actions;
  };
  World.prototype.reachableFrom = function (start) {
    var startKey = key(start);
    var cacheKey = this.topologyVersion + '|' + startKey;
    if (this.reachabilityCache && this.reachabilityCache.has(cacheKey)) {
      return this.reachabilityCache.get(cacheKey);
    }
    var queue = [], seen = new Set();
    if (!this.isOpen(start)) return seen;
    queue.push(copy(start));
    seen.add(startKey);
    for (var head = 0; head < queue.length; head++) {
      var point = queue[head];
      ACTIONS.forEach(function (delta) {
        var next = [point[0] + delta[0], point[1] + delta[1]], nextKey = key(next);
        if (this.isOpen(next) && !seen.has(nextKey)) {
          seen.add(nextKey);
          queue.push(next);
        }
      }, this);
    }
    if (this.reachabilityCache) this.reachabilityCache.set(cacheKey, seen);
    return seen;
  };
  World.prototype.pathExists = function (start, goal) {
    return this.isOpen(goal) && this.reachableFrom(start).has(key(goal));
  };
  World.prototype.ensureInitialPaths = function () {
    var self = this;
    this.sites.forEach(function (site) {
      if (self.pathExists(self.start, site.position)) return;
      var point = copy(self.start);
      while (point[0] !== site.position[0]) {
        point[0] += point[0] < site.position[0] ? 1 : -1;
        self.obstacles.delete(key(point));
      }
      while (point[1] !== site.position[1]) {
        point[1] += point[1] < site.position[1] ? 1 : -1;
        self.obstacles.delete(key(point));
      }
    });
  };
  World.prototype.accessible = function (start, goal) { return this.pathExists(start, goal); };
  World.prototype.estimatedTravelMinutes = function (start, goal) {
    if (!this.isOpen(start) || !this.isOpen(goal)) return null;
    var startKey = key(start), cacheKey = this.topologyVersion + '|' + startKey;
    var distances = this.travelCache && this.travelCache.get(cacheKey);
    if (!distances) {
      var count = this.size * this.size, visited = new Uint8Array(count);
      distances = new Float64Array(count);
      distances.fill(Infinity);
      distances[start[0] * this.size + start[1]] = 0;
      for (var step = 0; step < count; step++) {
        var current = -1, best = Infinity;
        for (var index = 0; index < count; index++) {
          if (!visited[index] && distances[index] < best) {
            current = index;
            best = distances[index];
          }
        }
        if (current < 0) break;
        visited[current] = 1;
        var currentPoint = [Math.floor(current / this.size), current % this.size];
        for (var action = 0; action < ACTIONS.length; action++) {
          var delta = ACTIONS[action], next = [currentPoint[0] + delta[0], currentPoint[1] + delta[1]];
          if (!this.isOpen(next)) continue;
          var nextIndex = next[0] * this.size + next[1];
          if (visited[nextIndex]) continue;
          var distance = best + this.cellMinutes(next);
          if (distance < distances[nextIndex]) distances[nextIndex] = distance;
        }
      }
      if (this.travelCache) this.travelCache.set(cacheKey, distances);
    }
    var goalDistance = distances[goal[0] * this.size + goal[1]];
    return Number.isFinite(goalDistance) ? goalDistance : null;
  };
  World.prototype.beginTick = function () {
    this.tick++;
    if (!this.dynamicFrequency || this.tick % this.dynamicFrequency) return;
    this.obstacleUpdates++;
    this.topologyVersion++;
    this.reachabilityCache.clear();
    this.travelCache.clear();
    if (this.dynamicKind === 'laiban') {
      this.overlay.clear();
      var candidates = this.overlayCandidates.filter(function (point) {
        return !this.protected.has(key(point)) &&
          key(point) !== key(this.positions.standard) &&
          key(point) !== key(this.positions.modql);
      }, this);
      if (candidates.length) {
        this.overlay.add(key(candidates[Math.floor(this.rng() * candidates.length)]));
        this.obstacleChanges++;
      }
      return;
    }
    var candidates = [];
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var point = [r, c], cellKey = key(point);
        if (this.protected.has(cellKey) || cellKey === key(this.positions.standard) ||
            cellKey === key(this.positions.modql) || (this.allowedCells && !this.allowedCells.has(cellKey))) continue;
        candidates.push(point);
      }
    }
    var changes = Math.min(1 + Math.floor(this.rng() * 3), candidates.length);
    while (changes--) {
      var index = Math.floor(this.rng() * candidates.length), cell = candidates.splice(index, 1)[0], k = key(cell);
      if (this.obstacles.has(k)) this.obstacles.delete(k);
      else this.obstacles.add(k);
      this.obstacleChanges++;
    }
  };
  World.prototype.move = function (id, action, remainingMinutes) {
    var current = this.positions[id], delta = ACTIONS[action];
    if (!delta) throw new Error('Invalid movement action: ' + action);
    var next = [current[0] + delta[0], current[1] + delta[1]];
    if (!this.isOpen(next)) return {moved: false, point: copy(current), minutes: 0, collision: true};
    var minutes = this.cellMinutes(next);
    if (minutes > remainingMinutes) return {moved: false, point: copy(current), minutes: 0, exhausted: true};
    this.positions[id] = next;
    return {moved: true, point: copy(next), minutes: minutes, collision: false};
  };
  World.prototype.siteAt = function (point) {
    var pointKey = key(point);
    for (var index = 0; index < this.sites.length; index++) {
      if (key(this.sites[index].position) === pointKey) return this.sites[index];
    }
    return null;
  };
  World.prototype.obstacleCells = function () {
    var cells = new Set(this.obstacles);
    this.overlay.forEach(function (cellKey) { cells.add(cellKey); });
    if (this.allowedCells) {
      for (var rowIndex = 0; rowIndex < this.size; rowIndex++) {
        for (var colIndex = 0; colIndex < this.size; colIndex++) {
          var cellKey = rowIndex + ',' + colIndex;
          if (!this.allowedCells.has(cellKey)) cells.add(cellKey);
        }
      }
    }
    return Array.from(cells).map(function (cellKey) { return cellKey.split(',').map(Number); });
  };
  World.prototype.isOverlayObstacle = function (point) { return this.overlay.has(key(point)); };

  function state(world, run, point, kind) {
    if (kind === 'standard') return key(point);
    var timeBucket = run.remainingMinutes < world.budgetMinutes / 2 ? 0 : 1;
    var stateCacheKey = world.topologyVersion + '|' + (point[0] * world.size + point[1]) +
      '|' + run.servedMask + '|' + timeBucket;
    var cachedState = run.stateCache.get(stateCacheKey);
    if (cachedState) return cachedState;
    var demand = '', history = '', access = '', reachable = world.reachableFrom(point);
    for (var index = 0; index < world.sites.length; index++) {
      var site = world.sites[index];
      var served = !!(run.servedMask & (1 << index));
      demand += served ? '0' : String(site.stateDemandBucket);
      history += served ? '0' : String(site.stateHistoryBucket);
      access += !served && reachable.has(key(site.position)) ? '1' : '0';
    }
    var encoded = 'L=' + key(point) +
      '|D=' + demand +
      '|T=' + timeBucket +
      '|H=' + history +
      '|A=' + access;
    run.stateCache.set(stateCacheKey, encoded);
    return encoded;
  }
  function Model(kind, rng) {
    this.kind = kind;
    this.rng = rng;
    this.q = new QTable();
    this.q1 = new QTable();
    this.q2 = new QTable();
    this.samples = new QTable();
    this.alpha = PARAMETERS.alpha;
    this.gamma = PARAMETERS.gamma;
    this.epsilon = PARAMETERS.epsilonStart;
    this.episodes = 0;
    this.updates = 0;
    this.lastUpdate = null;
    this.trackUpdates = true;
  }
  Model.prototype.values = function (stateKey) {
    if (this.kind === 'standard') return row(this.q, stateKey).slice();
    var first = row(this.q1, stateKey), second = row(this.q2, stateKey);
    var values = new Float64Array(ACTIONS.length);
    for (var index = 0; index < ACTIONS.length; index++) values[index] = first[index] + second[index];
    return values;
  };
  Model.prototype.known = function (stateKey, action) {
    return row(this.samples, stateKey)[action] > 0;
  };
  Model.prototype.choose = function (stateKey, legalActions, training) {
    if (!legalActions.length) return null;
    if (training && this.rng() < this.epsilon) {
      return legalActions[Math.floor(this.rng() * legalActions.length)];
    }
    var values = this.values(stateKey), best = -Infinity, ties = [];
    legalActions.forEach(function (action) {
      if (values[action] > best) { best = values[action]; ties = []; }
      if (values[action] === best) ties.push(action);
    });
    return training ? ties[Math.floor(this.rng() * ties.length)] : ties[0];
  };
  Model.prototype.learn = function (stateKey, action, reward, nextState, nextActions, done) {
    var single = this.kind === 'standard';
    var first = single || this.rng() < 0.5;
    var selecting = single ? this.q : first ? this.q1 : this.q2;
    var evaluating = single ? this.q : first ? this.q2 : this.q1;
    var bestAction = null, bestValue = -Infinity;
    if (!done) {
      var nextValues = row(selecting, nextState);
      for (var index = 0; index < nextActions.length; index++) {
        var candidate = nextActions[index], value = nextValues[candidate];
        if (value > bestValue) { bestValue = value; bestAction = candidate; }
      }
    }
    var bootstrap = bestAction === null ? 0 : row(evaluating, nextState)[bestAction];
    var values = row(selecting, stateKey).slice(), before = values[action];
    var target = reward + this.gamma * bootstrap;
    values[action] += this.alpha * (target - before);
    selecting.set(stateKey, values);
    var samples = row(this.samples, stateKey).slice();
    samples[action]++;
    this.samples.set(stateKey, samples);
    this.updates++;
    if (this.trackUpdates) {
      this.lastUpdate = {
        table: single ? 'Q' : first ? 'Q1' : 'Q2',
        before: before,
        after: values[action],
        target: target
      };
    }
  };
  Model.prototype.spread = function () {
    if (this.kind !== 'modql') return null;
    var stateKeys = new Set(), total = 0;
    this.q1.forEach(function (_, stateKey) { stateKeys.add(stateKey); });
    this.q2.forEach(function (_, stateKey) { stateKeys.add(stateKey); });
    stateKeys.forEach(function (stateKey) {
      var a = row(this.q1, stateKey), b = row(this.q2, stateKey);
      for (var i = 0; i < ACTIONS.length; i++) total += Math.abs(a[i] - b[i]);
    }, this);
    return stateKeys.size ? total / (stateKeys.size * ACTIONS.length) : 0;
  };
  function modelsFor(seed) {
    var random = seededRandom(seed);
    var standard = new Model('standard', seededRandom((seed ^ 0xA341316C) >>> 0));
    var modql = new Model('modql', seededRandom((seed ^ 0xC8013EA4) >>> 0));
    return {standard: standard, modql: modql, scenarioRandom: random};
  }
  function policyFor(models, metadata, trainingLog) {
    return {
      version: 1,
      scenarioId: metadata.scenarioId,
      seed: metadata.seed,
      trainedAt: metadata.trainedAt,
      episodes: metadata.episodes,
      alpha: PARAMETERS.alpha,
      gamma: PARAMETERS.gamma,
      epsilonStart: PARAMETERS.epsilonStart,
      epsilonMin: PARAMETERS.epsilonMin,
      epsilonDecay: PARAMETERS.epsilonDecay,
      qTables: {
        standard: models.standard.q.entries(),
        modqlQ1: models.modql.q1.entries(),
        modqlQ2: models.modql.q2.entries()
      },
      trainingLog: trainingLog
    };
  }
  function modelsFromPolicy(policy, expectedScenarioId, expectedSeed) {
    if (!policy || policy.version !== 1 || policy.scenarioId !== expectedScenarioId ||
        policy.seed !== expectedSeed || policy.episodes !== PARAMETERS.episodes ||
        policy.alpha !== PARAMETERS.alpha || policy.gamma !== PARAMETERS.gamma ||
        policy.epsilonStart !== PARAMETERS.epsilonStart || policy.epsilonMin !== PARAMETERS.epsilonMin ||
        policy.epsilonDecay !== PARAMETERS.epsilonDecay || !policy.qTables ||
        !Array.isArray(policy.qTables.standard) || !Array.isArray(policy.qTables.modqlQ1) ||
        !Array.isArray(policy.qTables.modqlQ2)) {
      throw new Error('The saved policy does not match this scenario and training configuration.');
    }
    var models = modelsFor(policy.seed);
    policy.qTables.standard.forEach(function (entry) { models.standard.q.set(entry[0], entry[1]); });
    policy.qTables.modqlQ1.forEach(function (entry) { models.modql.q1.set(entry[0], entry[1]); });
    policy.qTables.modqlQ2.forEach(function (entry) { models.modql.q2.set(entry[0], entry[1]); });
    models.standard.episodes = models.modql.episodes = policy.episodes;
    models.standard.epsilon = models.modql.epsilon = PARAMETERS.epsilonMin;
    return models;
  }
  function makeRun(world) {
    return {
      didRun: false, done: false, success: false, status: 'Not run yet',
      steps: 0, attempts: 0, minutes: 0, remainingMinutes: world.budgetMinutes,
      serviceMinutes: 0, segmentMinutes: 0, learners: 0, served: {},
      servedMask: 0, stateCache: new Map(),
      visits: world.sites.map(function (site) { return site.initialVisits; }),
      historyDays: world.sites.map(function (site) { return site.lastVisitDays; }),
      fairness: null, reward: 0, latestReward: null, currentState: null,
      currentAction: null, q: null, q1: null, q2: null, known: null,
      valueSamples: [], deferred: null, reason: null
    };
  }
  function finishRun(run, world, status, success, model) {
    if (run.done) return;
    run.done = true;
    run.success = !!success;
    run.status = status;
    run.reason = status;
    run.deferred = world.sites.filter(function (site) { return !run.served[site.id]; }).map(function (site) { return site.id; });
    var actual = 0, errors = [];
    for (var i = run.valueSamples.length - 1; i >= 0; i--) {
      actual = run.valueSamples[i].reward + model.gamma * actual;
      if (run.valueSamples[i].known) errors.push(run.valueSamples[i].estimate - actual);
    }
    run.returnGap = errors.length ? errors.reduce(function (sum, value) { return sum + value; }, 0) / errors.length : null;
  }
  function Pair(world, models, training) {
    this.world = world;
    this.models = models;
    this.training = !!training;
    this.runs = {};
    IDS.forEach(function (id) {
      this.runs[id] = makeRun(world);
      this.runs[id].trail = this.training ? [] : [copy(world.start)];
    }, this);
  }
  Pair.prototype.done = function () {
    return IDS.every(function (id) { return this.runs[id].done; }, this);
  };
  Pair.prototype.step = function () {
    if (this.done()) return;
    var world = this.world, decisions = {}, self = this;
    world.beginTick();
    IDS.forEach(function (id) {
      var run = self.runs[id];
      if (run.done) return;
      var point = world.positions[id], legal = world.legalActions(id);
      if (!legal.length) {
        finishRun(run, world, 'No legal move available', false, self.models[id]);
        return;
      }
      if (id === 'modql' && run.segmentMinutes === 0) {
        run.estimatedTravelMinutes = {};
        world.sites.forEach(function (site) {
          if (!run.served[site.id]) {
            run.estimatedTravelMinutes[site.id] = world.estimatedTravelMinutes(point, site.position);
          }
        });
      }
      var stateKey = state(world, run, point, id), model = self.models[id];
      var action = model.choose(stateKey, legal, self.training);
      run.didRun = true;
      run.status = 'Running';
      if (!self.training) {
        run.currentState = stateKey;
        run.currentAction = ACTION_NAMES[action];
        run.q = model.values(stateKey)[action];
        run.q1 = id === 'modql' ? row(model.q1, stateKey)[action] : null;
        run.q2 = id === 'modql' ? row(model.q2, stateKey)[action] : null;
        run.known = model.known(stateKey, action);
      }
      decisions[id] = {state: stateKey, action: action,
        estimate: self.training ? null : run.q, known: self.training ? false : run.known};
    });
    IDS.forEach(function (id) {
      var decision = decisions[id], run = self.runs[id], model = self.models[id];
      if (!decision || run.done) return;
      var movement = world.move(id, decision.action, run.remainingMinutes), reward = 0;
      run.attempts++;
      if (movement.exhausted) {
        finishRun(run, world, 'Travel-time budget exhausted', false, model);
      } else if (movement.moved) {
        run.steps++;
        if (!self.training) run.trail.push(copy(movement.point));
        run.minutes += movement.minutes;
        run.remainingMinutes -= movement.minutes;
        run.segmentMinutes += movement.minutes;
        var site = world.siteAt(movement.point);
        if (site && !run.served[site.id]) {
          var siteIndex = world.sites.indexOf(site);
          if (run.remainingMinutes < world.serviceMinutes) {
            finishRun(run, world, 'Not enough time to complete service', false, model);
          } else {
            run.remainingMinutes -= world.serviceMinutes;
            run.serviceMinutes += world.serviceMinutes;
            run.served[site.id] = true;
            run.servedMask |= 1 << siteIndex;
            run.visits[siteIndex]++;
            run.historyDays[siteIndex] = 0;
            run.learners += site.demand;
            run.fairness = fairness(run.visits);
            var candidateTravel = id === 'modql' &&
              run.estimatedTravelMinutes[site.id] !== null &&
              run.estimatedTravelMinutes[site.id] !== undefined
              ? run.estimatedTravelMinutes[site.id]
              : run.segmentMinutes;
            var travelHours = Math.max(candidateTravel / 60, 0.000001);
            var efficiency = 1 / (1 + travelHours);
            reward = id === 'standard'
              ? 1 / travelHours
              : (site.demand / Math.max(world.maximumDemand, 1)) * run.fairness * efficiency;
            run.latestReward = reward;
            run.reward += reward;
            run.segmentMinutes = 0;
            run.estimatedTravelMinutes = null;
            if (Object.keys(run.served).length === world.sites.length) {
              finishRun(run, world, 'All destinations served', true, model);
            }
          }
        }
        if (!run.done && run.steps >= world.maxSteps) {
          finishRun(run, world, 'Movement-step limit reached', false, model);
        } else if (!run.done && run.remainingMinutes <= 0) {
          finishRun(run, world, 'Service-time budget exhausted', false, model);
        }
      }
      if (!self.training) {
        run.valueSamples.push({estimate: decision.estimate, known: decision.known, reward: reward});
      }
      var updateAllowed = id !== 'standard' || !run.done ||
        run.status === 'All destinations served' ||
        run.status === 'No legal move available';
      if (self.training && updateAllowed) {
        var nextPoint = world.positions[id], nextActions = run.done ? [] : world.legalActions(id);
        model.learn(decision.state, decision.action, reward,
          state(world, run, nextPoint, id), nextActions, run.done);
      }
    });
  };
  function trainEpisode(world, models) {
    models.standard.trackUpdates = false;
    models.modql.trackUpdates = false;
    var pair = new Pair(world, models, true), guard = 0;
    while (!pair.done() && guard++ < world.maxSteps + 2) pair.step();
    if (!pair.done()) {
      IDS.forEach(function (id) {
        finishRun(pair.runs[id], world, 'Training episode step limit reached', false, models[id]);
      });
    }
    IDS.forEach(function (id) {
      var model = models[id];
      model.episodes++;
      model.epsilon = Math.max(PARAMETERS.epsilonMin, model.epsilon * PARAMETERS.epsilonDecay);
    });
    return pair;
  }
  function metrics(run, world) {
    if (!run.didRun && !run.done) return null;
    var served = Object.keys(run.served).length;
    return {
      learners: run.learners,
      totalLearners: world.totalDemand,
      coveragePercent: world.totalDemand ? 100 * run.learners / world.totalDemand : 0,
      fairness: run.fairness === null ? fairness(run.visits) : run.fairness,
      travelMinutes: run.minutes,
      movementSteps: run.steps,
      destinationsServed: served,
      destinationTotal: world.sites.length,
      deferredCommunities: run.done ? run.deferred.length : world.sites.length - served,
      completionStatus: run.done ? run.status : 'In progress',
      completed: run.done && run.success,
      qEstimate: run.didRun ? run.q : null,
      q1Estimate: run.didRun ? run.q1 : null,
      q2Estimate: run.didRun ? run.q2 : null,
      estimatorDifference: run.q1 === null || run.q2 === null ? null : Math.abs(run.q1 - run.q2),
      estimateReturnGap: run.done ? run.returnGap : null,
      state: run.didRun ? run.currentState : null
    };
  }
  return {
    actions: ACTIONS,
    actionNames: ACTION_NAMES,
    ids: IDS,
    parameters: PARAMETERS,
    QTable: QTable,
    key: key,
    random: seededRandom,
    World: World,
    Model: Model,
    Pair: Pair,
    modelsFor: modelsFor,
    policyFor: policyFor,
    modelsFromPolicy: modelsFromPolicy,
    state: state,
    metrics: metrics,
    fairness: fairness,
    trainEpisode: trainEpisode
  };
})();
