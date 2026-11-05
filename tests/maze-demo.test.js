/* Run with node --test tests/maze-demo.test.js. */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');
var root = path.join(__dirname, '..');
var engineSource = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
var analysisSource = fs.readFileSync(path.join(root, 'analysis.js'), 'utf8');
var routingSource = fs.readFileSync(path.join(root, 'maze-routing.js'), 'utf8');
var scenarioSource = fs.readFileSync(path.join(root, 'maze-scenarios.js'), 'utf8');
var demoSource = fs.readFileSync(path.join(root, 'maze-demo.js'), 'utf8');

function harness() {
  var context = vm.createContext({});
  vm.runInContext(engineSource, context);
  var fixedDataStart = analysisSource.indexOf('var FIXED_MAZE_NODES=');
  var fixedDataEnd = analysisSource.indexOf('function fixedMazeKey', fixedDataStart);
  assert.ok(fixedDataStart >= 0 && fixedDataEnd > fixedDataStart, 'saved Laiban schematic data should exist');
  vm.runInContext(analysisSource.slice(fixedDataStart, fixedDataEnd), context);
  vm.runInContext(routingSource, context);
  vm.runInContext(scenarioSource, context);
  return context;
}
function makeWorld(api, config, seed) { return new api.World(config, seed === undefined ? config.seed : seed); }
function driveToEnd(pair, limit) {
  var steps = 0;
  while (!pair.done() && steps++ < limit) pair.step();
  assert.ok(pair.done(), 'paired run should terminate within its step limit');
}
function snapshot(models) {
  return JSON.stringify(['standard', 'modql'].map(function (id) {
    var model = models[id];
    return {
      q: Array.from(model.q.entries()),
      q1: Array.from(model.q1.entries()),
      q2: Array.from(model.q2.entries()),
      updates: model.updates,
      episodes: model.episodes,
      epsilon: model.epsilon
    };
  }));
}

test('four fixed scenarios use the saved Laiban values and requested shared budget', function () {
  var context = harness();
  var scenarios = context.MazeComparisonData.scenarios();
  assert.equal(scenarios.length, 4);
  assert.equal(scenarios[0].sites.length, 1);
  assert.equal(scenarios[0].obstacleRatio, 0);
  assert.equal(scenarios[0].dynamicFrequency, 0);
  assert.equal(scenarios[1].sites.length, 1);
  assert.equal(scenarios[1].obstacleRatio, 0);
  assert.equal(scenarios[1].obstacles.length, 24);
  var obstacleMaps = [202, 1202, 100202].map(function (seed) {
    return Array.from(makeWorld(context.MazeRouting, scenarios[1], seed).obstacles).sort().join(';');
  });
  assert.equal(new Set(obstacleMaps).size, 1, 'Tab 2 keeps its same fixed map for training and evaluation');
  assert.ok(makeWorld(context.MazeRouting, scenarios[1]).pathExists(scenarios[1].start, scenarios[1].sites[0].position));
  assert.equal(scenarios[1].dynamicFrequency, 0);
  assert.ok(scenarios[2].sites.length > 1);
  assert.equal(scenarios[2].dynamicFrequency, 20);
  assert.equal(scenarios[3].sites.length, 9);
  assert.equal(scenarios[3].rainfallMm, 38);
  assert.equal(scenarios[3].budgetMinutes, 480);
  assert.equal(scenarios[3].serviceMinutes, 60);
  assert.equal(scenarios[3].start.join(','), '5,5');
  assert.deepEqual(Array.from(scenarios, function (scenario) { return scenario.name; }),
    ['Basic Grid', 'Obstacles', 'Multi-Target', 'Laiban Case']);
  assert.ok(scenarios[3].closedRoads.length > 0);
  assert.deepEqual(Array.from(scenarios[3].sites, function (site) { return site.letter; }),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  assert.equal(context.MazeRouting.parameters.episodes, 5000);
  assert.equal(context.MazeRouting.parameters.heldOutScenarios, 200);
});

test('Standard policy state is location only and cannot read run or environment details', function () {
  var api = harness().MazeRouting;
  var guardedRun = new Proxy({}, {get: function () { throw new Error('Standard read run information'); }});
  var guardedWorld = new Proxy({}, {get: function () { throw new Error('Standard read environment information'); }});
  assert.equal(api.state(guardedWorld, guardedRun, [3, 7], 'standard'), '3,7');
});

test('both policies share each paired environment, start and scenario seed', function () {
  var context = harness(), api = context.MazeRouting, configs = context.MazeComparisonData.scenarios();
  configs.forEach(function (config) {
    var world = makeWorld(api, config);
    var models = api.modelsFor(config.seed);
    var pair = new api.Pair(world, models, false);
    assert.deepEqual(Array.from(pair.world.positions.standard), Array.from(pair.world.positions.modql));
    assert.deepEqual(Array.from(pair.world.start), Array.from(config.start));
    assert.equal(pair.world.sites.length, config.sites.length);
    assert.equal(pair.runs.standard.didRun, false);
    assert.equal(pair.runs.modql.didRun, false);
    assert.equal(api.metrics(pair.runs.standard, world), null);
    assert.equal(api.metrics(pair.runs.modql, world), null);
  });
});

test('pretrained policy files load Q tables and training logs without retraining or results', function () {
  var context = harness(), api = context.MazeRouting, scenarios = context.MazeComparisonData.scenarios();
  scenarios.forEach(function (scenario) {
    var file = path.join(root, 'policies', scenario.id + '.json');
    assert.ok(fs.existsSync(file), 'generated policy exists for ' + scenario.name);
    var policy = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(policy.scenarioId, scenario.id);
    assert.equal(policy.seed, scenario.seed);
    assert.equal(policy.episodes, 5000);
    assert.ok(policy.trainedAt);
    assert.equal(policy.trainingLog.standardSteps.length, 5000);
    assert.equal(policy.trainingLog.modqlSteps.length, 5000);
    assert.equal(policy.trainingLog.standardReward.length, 5000);
    assert.equal(policy.trainingLog.modqlReward.length, 5000);
    assert.deepEqual(Object.keys(policy).sort(),
      ['alpha', 'episodes', 'epsilonDecay', 'epsilonMin', 'epsilonStart', 'gamma', 'qTables', 'scenarioId', 'seed', 'trainedAt', 'trainingLog', 'version'].sort());
    assert.ok(policy.qTables.standard.length > 0);
    assert.ok(policy.qTables.modqlQ1.length > 0);
    assert.ok(policy.qTables.modqlQ2.length > 0);
    var originalTrain = api.trainEpisode;
    api.trainEpisode = function () { throw new Error('loading a saved policy must not retrain'); };
    var models = api.modelsFromPolicy(policy, scenario.id, scenario.seed);
    api.trainEpisode = originalTrain;
    var pair = new api.Pair(makeWorld(api, scenario), models, false);
    assert.equal(pair.runs.standard.didRun, false);
    assert.equal(pair.runs.modql.didRun, false);
    assert.equal(api.metrics(pair.runs.standard, pair.world), null);
    assert.equal(api.metrics(pair.runs.modql, pair.world), null);
  });
});

test('fixed-map Tab 2 policy training succeeds and frozen evaluation does not update Q tables', function () {
  var context = harness(), api = context.MazeRouting, config = context.MazeComparisonData.scenarios()[1];
  var policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'tab-2.json'), 'utf8'));
  ['standard', 'modql'].forEach(function (id) {
    var successes = policy.trainingLog[id + 'Reward'].slice(-500).filter(function (reward) { return reward > 0; }).length;
    assert.equal(successes, 500, id + ' reached the target in all final 500 training episodes');
  });
  var models = api.modelsFromPolicy(policy, config.id, config.seed);
  var before = snapshot(models);
  var world = makeWorld(api, config), pair = new api.Pair(world, models, false);
  driveToEnd(pair, 190);
  assert.equal(pair.runs.standard.success, true);
  assert.equal(pair.runs.modql.success, true);
  assert.equal(api.metrics(pair.runs.standard, world).loopDetected, false);
  assert.equal(api.metrics(pair.runs.modql, world).loopDetected, false);
  assert.equal(snapshot(models), before, 'frozen evaluation must not update either policy');
});

test('Tab 2 held-out batch varies only paired starts on its fixed map and counts loops', function () {
  var context = harness(), api = context.MazeRouting, config = context.MazeComparisonData.scenarios()[1];
  var policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'tab-2.json'), 'utf8'));
  var models = api.modelsFromPolicy(policy, config.id, config.seed);
  var blocked = new Set(config.obstacles.map(api.key));
  var target = api.key(config.sites[0].position), starts = [];
  for (var row = 0; row < config.size; row++) {
    for (var col = 0; col < config.size; col++) {
      var cell = row + ',' + col;
      if (!blocked.has(cell) && cell !== target) starts.push([row, col]);
    }
  }
  assert.equal(starts.length, 75);
  var outcomes = {standard: [], modql: []}, distinctStarts = new Set();
  for (var index = 0; index < 200; index++) {
    var batchConfig = JSON.parse(JSON.stringify(config));
    batchConfig.start = starts[index % starts.length];
    distinctStarts.add(batchConfig.start.join(','));
    var world = makeWorld(api, batchConfig, config.seed + index);
    var pair = new api.Pair(world, models, false);
    driveToEnd(pair, 190);
    assert.deepEqual(Array.from(world.start), Array.from(pair.world.start));
    ['standard', 'modql'].forEach(function (id) {
      outcomes[id].push(api.metrics(pair.runs[id], world));
    });
  }
  assert.equal(distinctStarts.size, 75);
  assert.equal(outcomes.standard.filter(function (result) { return result.completed; }).length, 191);
  assert.equal(outcomes.modql.filter(function (result) { return result.completed; }).length, 153);
  assert.equal(outcomes.standard.filter(function (result) { return result.loopDetected; }).length, 6);
  assert.equal(outcomes.modql.filter(function (result) { return result.loopDetected; }).length, 50);
  assert.equal(outcomes.standard.filter(function (result) { return !result.completed && !result.loopDetected; }).length, 3);
  assert.equal(outcomes.modql.filter(function (result) { return !result.completed && !result.loopDetected; }).length, 3);
});

test('Q rows use typed arrays and background training does not render grids', function () {
  var api = harness().MazeRouting;
  var table = new api.QTable();
  assert.equal(Object.prototype.toString.call(table.data), '[object Float64Array]');
  table.set('state', [1, 2, 3, 4]);
  assert.equal(Object.prototype.toString.call(table.get('state')), '[object Float64Array]');
  var worker = fs.readFileSync(path.join(root, 'maze-training-worker.js'), 'utf8');
  assert.match(worker, /importScripts\('maze-routing\.js'\)/);
  assert.match(worker, /postMessage\(\{type: 'progress'/);
  assert.doesNotMatch(worker, /canvas|renderState|draw\(/);
});

test('frozen greedy ties use the first legal action for both unseen policies', function () {
  var api = harness().MazeRouting;
  ['standard', 'modql'].forEach(function (kind) {
    var model = new api.Model(kind, function () { throw new Error('frozen tie-breaking must not use randomness'); });
    var values = model.values('unseen-location');
    assert.deepEqual(Array.from(values), [0, 0, 0, 0]);
    assert.equal(model.choose('unseen-location', [0, 1, 2, 3], false), 0);
    assert.equal(model.choose('another-unseen-location', [1, 3], false), 1);
  });
});

test('display-only loop detector requires four two-cell cycles without service', function () {
  var api = harness().MazeRouting;
  var loop = [[2, 1], [2, 2], [2, 1], [2, 2], [2, 1], [2, 2], [2, 1], [2, 2], [2, 1]];
  assert.equal(api.hasRepeatedTwoCellLoop(loop, []), true);
  assert.equal(api.hasRepeatedTwoCellLoop(loop.slice(0, 8), []), false);
  assert.equal(api.hasRepeatedTwoCellLoop(loop, [5]), false);
});

test('movement constraints are shared and both agents use four-direction actions', function () {
  var api = harness().MazeRouting;
  var config = {
    id: 'test', size: 4, start: [0, 0], sites: [{id: 'target', position: [3, 3], demand: 10}],
    obstacles: [[0, 1]], obstacleRatio: 0, budgetMinutes: 20, serviceMinutes: 1, maxSteps: 30
  };
  var world = makeWorld(api, config, 1);
  assert.deepEqual(Array.from(world.legalActions('standard')), [1]);
  assert.deepEqual(Array.from(world.legalActions('modql')), [1]);
  var pair = new api.Pair(world, api.modelsFor(2), false);
  pair.step();
  assert.deepEqual(Array.from(world.positions.standard), Array.from(world.positions.modql));
  assert.equal(pair.runs.standard.trail.length, 2);
  assert.equal(pair.runs.modql.trail.length, 2);
});

test('Standard and MODQL rewards are calculated from a live service event', function () {
  var api = harness().MazeRouting;
  var config = {
    id: 'reward-test', size: 2, start: [0, 0],
    sites: [{id: 'target', position: [0, 1], demand: 10, initialVisits: 0}],
    budgetMinutes: 20, serviceMinutes: 1, defaultCellMinutes: 1, maxSteps: 5
  };
  var world = makeWorld(api, config, 4);
  var models = api.modelsFor(4);
  models.standard.epsilon = 0;
  models.modql.epsilon = 0;
  models.standard.q.set('0,0', [0, 0, 0, 1]);
  models.modql.q1.set('L=0,0|D=2|T=1|H=0|A=1', [0, 0, 0, 1]);
  models.modql.q2.set('L=0,0|D=2|T=1|H=0|A=1', [0, 0, 0, 1]);
  var pair = new api.Pair(world, models, false);
  pair.training = true;
  pair.step();
  var standardReward = pair.runs.standard.reward;
  var modqlReward = pair.runs.modql.reward;
  assert.ok(Math.abs(standardReward - 60) < 1e-12);
  assert.ok(Math.abs(modqlReward - 1 / (1 + 1 / 60)) < 1e-12);
  assert.equal(pair.runs.standard.learners, 10);
  assert.equal(pair.runs.modql.learners, 10);
});

test('Standard time exhaustion does not enter its Q update', function () {
  var api = harness().MazeRouting;
  var config = {
    id: 'time-mask-test', size: 2, start: [0, 0],
    sites: [{id: 'target', position: [0, 1], demand: 10}],
    budgetMinutes: 1, serviceMinutes: 1, defaultCellMinutes: 2, maxSteps: 5
  };
  var models = api.modelsFor(9);
  models.standard.epsilon = models.modql.epsilon = 0;
  models.standard.q.set('0,0', [0, 0, 0, 1]);
  models.modql.q1.set('L=0,0|D=2|T=1|H=1|A=1', [0, 0, 0, 1]);
  models.modql.q2.set('L=0,0|D=2|T=1|H=1|A=1', [0, 0, 0, 1]);
  var pair = new api.Pair(makeWorld(api, config, 9), models, true);
  pair.step();
  assert.equal(pair.runs.standard.status, 'Travel-time budget exhausted');
  assert.equal(models.standard.updates, 0, 'remaining time must not alter Standard Q values');
  assert.equal(models.modql.updates, 1);
});

test('Double Q update selects on one table and evaluates on the other', function () {
  var api = harness().MazeRouting;
  [0.25, 0.75].forEach(function (coin) {
    var model = new api.Model('modql', function () { return coin; });
    var selected = coin < 0.5 ? model.q1 : model.q2;
    var evaluated = coin < 0.5 ? model.q2 : model.q1;
    selected.set('next', [0, 9, 0, 0]);
    evaluated.set('next', [100, 2, 100, 100]);
    model.learn('current', 0, 1, 'next', [0, 1, 2, 3], false);
    assert.ok(Math.abs(selected.get('current')[0] - 0.28) < 1e-12);
    assert.equal(evaluated.has('current'), false);
    model.learn('terminal', 0, 1, 'next', [], true);
    assert.equal(selected.get('terminal')[0], 0.1);
  });
});

test('Standard policy uses epsilon-greedy exploration rather than a random-only action rule', function () {
  var api = harness().MazeRouting;
  var draws = [0.9, 0.99, 0.1, 0.99];
  var model = new api.Model('standard', function () { return draws.shift(); });
  model.q.set('state', [10, 0, 0, 0]);
  model.epsilon = 0.5;
  assert.equal(model.choose('state', [0, 1], true), 0, 'non-exploration selects the greedy action');
  assert.equal(model.choose('state', [0, 1], true), 1, 'epsilon exploration can select another legal action');
});

test('frozen evaluation uses greedy selection and performs no Q updates', function () {
  var context = harness(), api = context.MazeRouting;
  var config = {
    id: 'freeze-test', size: 4, start: [0, 0],
    sites: [{id: 'target', position: [3, 3], demand: 20}],
    obstacleRatio: 0.1, ensureConnected: true, budgetMinutes: 30, serviceMinutes: 1, maxSteps: 30
  };
  var models = api.modelsFor(55);
  for (var episode = 0; episode < 15; episode++) {
    api.trainEpisode(makeWorld(api, config, 100 + episode), models);
  }
  var before = snapshot(models);
  models.standard.rng = function () { throw new Error('frozen Standard evaluation used policy randomness'); };
  models.modql.rng = function () { throw new Error('frozen MODQL evaluation used policy randomness'); };
  var world = makeWorld(api, config, 999), pair = new api.Pair(world, models, false);
  driveToEnd(pair, 40);
  assert.equal(snapshot(models), before);
  assert.ok(pair.runs.standard.didRun);
  assert.ok(pair.runs.modql.didRun);
});

test('every configured training run uses the fixed equal budget and prescribed parameters', function () {
  var api = harness().MazeRouting;
  assert.deepEqual(JSON.parse(JSON.stringify(api.parameters)), {
    episodes: 5000, alpha: 0.1, gamma: 0.9,
    epsilonStart: 1, epsilonMin: 0.05, epsilonDecay: 0.995, heldOutScenarios: 200
  });
  var models = api.modelsFor(1);
  assert.equal(models.standard.alpha, models.modql.alpha);
  assert.equal(models.standard.gamma, models.modql.gamma);
  assert.equal(models.standard.epsilon, models.modql.epsilon);
  api.trainEpisode(makeWorld(api, {
    id: 'budget-test', size: 2, start: [0, 0],
    sites: [{id: 'target', position: [0, 1], demand: 1}],
    budgetMinutes: 5, serviceMinutes: 1, maxSteps: 4
  }, 1), models);
  assert.equal(models.standard.episodes, 1);
  assert.equal(models.modql.episodes, 1);
  assert.equal(models.standard.epsilon, models.modql.epsilon);
});

test('UI exposes four fixed tabs, per-tab SOP selection, live results and separate 200-scenario batch', function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /maze-scenarios\.js/);
  assert.match(html, /id="mazeScenarioSelector"/);
  assert.match(demoSource, /scenarioSelector\.innerHTML = states\.map/);
  assert.doesNotMatch(demoSource, /class="maze-scenario-tabs"/);
  assert.match(demoSource, /Retrain from scratch/);
  assert.match(demoSource, /new Worker\('maze-training-worker\.js'\)/);
  assert.match(demoSource, /Standard Q-Learning explores randomly during training; evaluation follows the learned policy \(epsilon = 0\)\./);
  assert.match(demoSource, /Basic Grid fairness is trivial because there is only one destination/);
  assert.match(demoSource, /not comparable to Chapter 4 results/);
  assert.match(demoSource, /two-level road accessibility/);
  assert.match(demoSource, /Loop rate \(%\)/);
  assert.match(demoSource, /Loop detected: learned policy repeats the same moves/);
  assert.match(fs.readFileSync(path.join(root, 'styles.css'), 'utf8'), /\.maze-loop-status\[hidden\]\s*\{\s*display:none;/);
  assert.match(demoSource, /batchConfig\.start = starts\[index % starts\.length\]/);
  assert.match(demoSource, /Obstacles batch protocol: same fixed obstacle layout/);
  assert.match(routingSource, /serviceSteps/);
  assert.match(demoSource, /5,000 training episodes each, equal budget/);
  assert.match(demoSource, /Not run yet/);
  assert.match(demoSource, /200 Held-Out/);
  assert.match(demoSource, /data-action="step"/);
  assert.match(demoSource, /data-action="reset"/);
  assert.match(demoSource, /data-dynamic="tick"/);
  assert.match(demoSource, /Environment-only values; not part of Standard state or Q updates/);
  assert.doesNotMatch(demoSource, /Scenario seed\s*<input|Load Scenario|Episodes per algorithm/);
  var scenarios = harness().MazeComparisonData.scenarios();
  assert.deepEqual(Array.from(scenarios, function (scenario) { return scenario.seed; }), [101, 202, 303, 404]);
});

test('SOP question and objective wording are centralized and retain the established questions', function () {
  var sops = harness().MazeComparisonData.sops;
  assert.deepEqual(Array.from(sops, function (sop) { return sop.question; }), [
    'How effectively does the algorithm serve communities?',
    'How reliable and consistent are the estimated decision values?',
    'What information is considered when choosing the next destination?'
  ]);
  assert.ok(Array.from(sops).every(function (sop) { return sop.objective === 'Objective wording pending'; }));
  assert.ok(Array.from(sops).every(function (sop) { return sop.standard && sop.modql && sop.metrics.length; }));
});

test('the separate browser baseline remains the original maze implementation', function () {
  var childProcess = require('node:child_process');
  var original = childProcess.execFileSync('git', ['show', '7d63c82:maze-demo.js'], {
    cwd: root,
    encoding: 'utf8'
  });
  original = original.replace(/sub-maze/g, 'sub-maze-legacy').replace(/data-sub="maze"/g, 'data-sub="maze-legacy"');
  var legacy = fs.readFileSync(path.join(root, 'maze-legacy.js'), 'utf8');
  assert.equal(legacy.replace(/\r\n/g, '\n').trimEnd(), original.replace(/\r\n/g, '\n').trimEnd());
});
