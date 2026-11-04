/* Grid graph adapter for the destination-action algorithms in
   training/train_q_learning.py. Does not load Laiban policy keys onto grid cells. */
var MazeRouting = (function () {
  'use strict';
  var COUNT = 6, BUDGET = 120, SERVICE_MIN = 10, LIMIT = 100;
  var DELTAS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var IDS = ['standard', 'modql'];
  function key(p) { return p.join(','); }
  function row(table, state) { return table.get(state) || [0, 0, 0, 0, 0, 0]; }
  function copy(p) { return p.slice(); }

  // Shared movement executor only: Q policies choose service destinations.
  // Dijkstra finds legal, minimum-time grid edges to the chosen destination;
  // it never ranks destinations or substitutes a policy action.
  function routes(world, start) {
    var cacheKey = world.episodeData.environmentUpdates + ':' + key(start);
    if (!world.routeCache) world.routeCache = {};
    if (world.routeCache[cacheKey]) return world.routeCache[cacheKey];
    var queue = [copy(start)], dist = {}, previous = {}, paths = {};
    dist[key(start)] = 0;
    while (queue.length) {
      queue.sort(function (a, b) { return dist[key(a)] - dist[key(b)] || key(a).localeCompare(key(b)); });
      var p = queue.shift(), pk = key(p);
      if (paths[pk]) continue;
      paths[pk] = true;
      DELTAS.forEach(function (d) {
        var n = [p[0] + d[0], p[1] + d[1]], nk = key(n);
        if (!world.isOpen(n)) return;
        var cost = dist[pk] + world.minutes[n[0]][n[1]];
        if (dist[nk] === undefined || cost < dist[nk]) {
          dist[nk] = cost; previous[nk] = p; queue.push(n);
        }
      });
    }
    var lookup = function (target) {
      if (dist[key(target)] === undefined) return null;
      var cells = [], current = copy(target);
      while (key(current) !== key(start)) { cells.unshift(copy(current)); current = previous[key(current)]; }
      return {minutes: dist[key(target)], cells: cells};
    };
    world.routeCache[cacheKey] = lookup;
    return lookup;
  }
  function configure(world) {
    var lookup = routes(world, world.currentPos.standard), candidates = [];
    for (var r = 0; r < world.size; r++) for (var c = 0; c < world.size; c++) {
      var p = [r, c];
      if (world.isOpen(p) && key(p) !== key(world.goalPos) && key(p) !== key(world.currentPos.standard) && lookup(p)) candidates.push(p);
    }
    if (candidates.length < COUNT) throw new Error('Scenario has insufficient reachable service cells.');
    world.sites = [];
    for (var i = 0; i < COUNT; i++) {
      var index = Math.floor(world.rng() * candidates.length), pos = candidates.splice(index, 1)[0];
      world.sites.push({id: String.fromCharCode(65 + i), pos: pos,
        demand: world.demand[pos[0]][pos[1]], visits: Math.floor(world.rng() * 5), days: 1 + Math.floor(world.rng() * 30)});
    }
    world.totalLearners = world.sites.reduce(function (sum, s) { return sum + s.demand; }, 0);
    return world;
  }
  function Model(kind, rng) {
    this.kind = kind; this.rng = rng; this.q = new Map(); this.q1 = new Map(); this.q2 = new Map(); this.samples = new Map();
    this.alpha = 0.1; this.gamma = 0.9; this.epsilon = 1; this.episodes = 0; this.updates = 0; this.lastUpdate = null;
  }
  Model.prototype.values = function (state) {
    if (this.kind === 'standard') return row(this.q, state).slice();
    var a = row(this.q1, state), b = row(this.q2, state);
    return a.map(function (v, i) { return (v + b[i]) / 2; });
  };
  Model.prototype.known = function (state, action) {
    // A sampled terminal failure can legitimately leave Q=0. Provenance is
    // measured by update counts, never inferred from a nonzero estimate.
    return row(this.samples, state)[action] > 0;
  };
  Model.prototype.choose = function (state, choices, training) {
    if (training && this.rng() < this.epsilon) return choices[Math.floor(this.rng() * choices.length)].index;
    var values = this.values(state), best = -Infinity, ties = [];
    choices.forEach(function (c) {
      if (values[c.index] > best) { best = values[c.index]; ties = []; }
      if (values[c.index] === best) ties.push(c.index);
    });
    // Stable evaluation ties: no exploration RNG or table insertion in playback.
    return training ? ties[Math.floor(this.rng() * ties.length)] : ties[0];
  };
  Model.prototype.learn = function (state, action, reward, next, choices) {
    // Section 1.3 SOP 2 / Section 1.4.2 Objective 2: genuine decoupled update.
    var single = this.kind === 'standard', first = single || this.rng() < 0.5;
    var select = single ? this.q : first ? this.q1 : this.q2;
    var evaluate = single ? this.q : first ? this.q2 : this.q1;
    var values = row(select, next), best = null;
    choices.forEach(function (c) { if (best === null || values[c.index] > values[best]) best = c.index; });
    var bootstrap = best === null ? 0 : row(evaluate, next)[best];
    var current = row(select, state).slice(), before = current[action];
    current[action] += this.alpha * (reward + this.gamma * bootstrap - before);
    select.set(state, current); this.updates++;
    var samples = row(this.samples, state).slice(); samples[action]++; this.samples.set(state, samples);
    this.lastUpdate = {table: single ? 'Q' : first ? 'Q1' : 'Q2', before: before, after: current[action], target: reward + this.gamma * bootstrap};
  };
  Model.prototype.spread = function () {
    var self = this, states = new Set(), sum = 0;
    this.q1.forEach(function (v, k) { states.add(k); }); this.q2.forEach(function (v, k) { states.add(k); });
    states.forEach(function (k) {
      var a = row(self.q1, k), b = row(self.q2, k);
      for (var i = 0; i < COUNT; i++) sum += Math.abs(a[i] - b[i]);
    });
    return states.size ? sum / (COUNT * states.size) : 0;
  };
  function initialRun(world) {
    return {location: 'Start', steps: 0, minutes: 0, serviceMinutes: 0, remaining: BUDGET, reward: 0, latestReward: 0,
      served: {}, service: world.sites.map(function (s) { return s.visits; }), historyDays: world.sites.map(function (s) { return s.days; }),
      history: [], learners: 0, fairness: jain(world.sites.map(function (s) { return s.visits; })), done: false, success: false,
      status: 'Ready', action: 'None', pending: null, exiting: false, demand: 0, travelTerm: 1,
      q: null, q1: null, q2: null, known: null, decisions: [], state: null, deferred: [], returnError: null};
  }
  function choices(world, run, pos) {
    var lookup = routes(world, pos), result = [];
    world.sites.forEach(function (site, index) {
      if (run.served[site.id]) return;
      var route = lookup(site.pos);
      if (!route || !route.cells.length) return;
      var exit = routes(world, site.pos)(world.goalPos);
      // Common safety constraint: reserve travel to the shared exit/goal.
      if (exit && route.minutes + SERVICE_MIN + exit.minutes <= run.remaining && route.cells.length + run.steps <= LIMIT) {
        result.push({index: index, route: route});
      }
    });
    return result;
  }
  function state(world, run, pos, kind) {
    if (kind === 'standard') return key(pos);
    var lookup = routes(world, pos), max = Math.max.apply(null, world.sites.map(function (s) { return s.demand; }));
    var d = [], h = [], a = [];
    world.sites.forEach(function (s, i) {
      var available = !run.served[s.id] && !!lookup(s.pos);
      d.push(available ? demandBucket(s.demand, max) : 0);
      h.push(historyBucket(run.historyDays[i])); a.push(available ? 1 : 0);
    });
    // Section 1.3 SOP 3 / Section 1.4.2 Objective 3. Same two-level vector
    // encoding as proposed_state(), with binary grid access and a maze budget.
    return 'L=' + key(pos) + '|D=' + d.join('') + '|T=' + (run.remaining < BUDGET / 2 ? 0 : 1) + '|H=' + h.join('') + '|A=' + a.join('');
  }
  function Pair(world, models, training) {
    this.world = world; this.models = models; this.training = !!training; this.runs = {};
    var self = this;
    IDS.forEach(function (id) {
      self.runs[id] = initialRun(world);
      self.runs[id].history = [copy(world.currentPos[id])];
    });
  }
  Pair.prototype.done = function () { var self = this; return IDS.every(function (id) { return self.runs[id].done; }); };
  Pair.prototype.finish = function (id, status, success) {
    var run = this.runs[id], world = this.world;
    run.done = true; run.success = !!success; run.status = status;
    var lookup = routes(world, world.currentPos[id]);
    run.deferred = world.sites.filter(function (s) { return !run.served[s.id]; }).map(function (s) {
      var route = lookup(s.pos), exit = routes(world, s.pos)(world.goalPos);
      return {id: s.id, reason: !route || !exit ? 'No open service/exit path' :
        route.minutes + SERVICE_MIN + exit.minutes > run.remaining ? 'Outside remaining service/exit budget' : status};
    });
    var actual = 0, errors = [];
    for (var i = run.decisions.length - 1; i >= 0; i--) {
      actual = run.decisions[i].reward + this.models[id].gamma * actual;
      run.decisions[i].realizedReturn = actual;
      if (run.decisions[i].known) errors.push(run.decisions[i].estimate - actual);
    }
    run.returnError = errors.length ? errors.reduce(function (a, b) { return a + b; }, 0) / errors.length : null;
  };
  Pair.prototype.step = function () {
    if (this.done()) return;
    var self = this, world = this.world;
    world.beginStep(); // Exactly once; both policies observe this same frame.
    // Decisions precede movement. No private maze or sequential action advantage.
    IDS.forEach(function (id) {
      var run = self.runs[id], model = self.models[id], pos = world.currentPos[id];
      if (run.done || run.pending || run.exiting) return;
      var feasible = choices(world, run, pos);
      if (!feasible.length) { run.exiting = true; run.action = 'Exit G (executor)'; return; }
      var sk = state(world, run, pos, id), action = model.choose(sk, feasible, self.training);
      run.state = sk; run.known = model.known(sk, action);
      run.q = model.values(sk)[action]; run.q1 = row(model.q1, sk)[action]; run.q2 = row(model.q2, sk)[action];
      run.pending = {index: action, state: sk, minutes: 0, estimate: run.q, known: run.known};
      run.action = world.sites[action].id + (run.known ? ' (learned)' : ' (unseen Q tie)');
    });
    // Fixed movement order: Standard, MODQL. env.step never changes walls.
    IDS.forEach(function (id) {
      var run = self.runs[id], model = self.models[id];
      if (run.done) return;
      var target = run.pending ? world.sites[run.pending.index].pos : world.goalPos;
      var path = routes(world, world.currentPos[id])(target);
      if (!path) { self.abort(id, 'No open path'); return; }
      if (path.cells.length) {
        var next = path.cells[0], previous = world.currentPos[id];
        var move = DELTAS.findIndex(function (d) { return previous[0] + d[0] === next[0] && previous[1] + d[1] === next[1]; });
        var cost = world.minutes[next[0]][next[1]];
        if (cost > run.remaining || run.steps >= LIMIT) { self.abort(id, 'Time or step budget exhausted'); return; }
        var result = world.step(id, move);
        run.steps++; run.minutes += cost; run.remaining -= cost; run.history.push(copy(result.state));
        if (run.pending) run.pending.minutes += cost;
      }
      if (key(world.currentPos[id]) === key(target)) {
        if (run.exiting) { self.finish(id, 'Goal reached', true); return; }
        var decision = run.pending, site = world.sites[decision.index];
        if (run.remaining < SERVICE_MIN) { self.abort(id, 'Insufficient service time'); return; }
        run.remaining -= SERVICE_MIN; run.serviceMinutes += SERVICE_MIN;
        run.served[site.id] = true; run.service[decision.index]++; run.historyDays[decision.index] = 0;
        run.learners += site.demand; run.fairness = jain(run.service); run.location = site.id;
        // Section 1.3 SOP 1 / Section 1.4.2 Objective 1: mirrors
        // reward_standard()/reward_modql(), including max-demand normalization.
        run.demand = site.demand / Math.max.apply(null, world.sites.map(function (s) { return s.demand; }));
        run.travelTerm = 1 / (1 + decision.minutes / 60);
        run.latestReward = id === 'standard' ? 60 / Math.max(decision.minutes, 0.00006) : run.demand * run.fairness * run.travelTerm;
        run.reward += run.latestReward;
        run.decisions.push({reward: run.latestReward, estimate: decision.estimate, known: decision.known});
        run.pending = null;
        if (self.training) model.learn(decision.state, decision.index, run.latestReward, state(world, run, target, id), choices(world, run, target));
      }
      if (run.steps >= LIMIT) self.abort(id, 'Step limit reached');
    });
  };
  Pair.prototype.abort = function (id, status) {
    var run = this.runs[id];
    if (run.pending) {
      var p = run.pending;
      // Failed service decisions earn zero, with a terminal TD update in training.
      run.latestReward = 0; run.decisions.push({reward: 0, estimate: p.estimate, known: p.known});
      if (this.training) this.models[id].learn(p.state, p.index, 0, p.state, []);
      run.pending = null;
    }
    this.finish(id, status, false);
  };
  function trainEpisode(world, models) {
    var pair = new Pair(world, models, true), guard = 0;
    while (!pair.done() && guard++ < LIMIT + 5) pair.step();
    if (!pair.done()) throw new Error('Training rollout exceeded its bounded tick budget.');
    IDS.forEach(function (id) {
      models[id].episodes++; models[id].epsilon = Math.max(0.05, models[id].epsilon * 0.995);
    });
    return pair;
  }
  return {Model: Model, Pair: Pair, configure: configure, routes: routes, choices: choices, state: state,
    trainEpisode: trainEpisode, budget: BUDGET, serviceMinutes: SERVICE_MIN, count: COUNT};
})();
