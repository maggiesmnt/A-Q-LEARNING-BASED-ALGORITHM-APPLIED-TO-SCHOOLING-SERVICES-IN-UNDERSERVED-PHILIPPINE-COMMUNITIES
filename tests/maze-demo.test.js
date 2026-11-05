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
  var gridDataStart = analysisSource.indexOf('var COMPARISON_GRID_POSITIONS=');
  var gridDataEnd = analysisSource.indexOf('function comparisonGridKey', gridDataStart);
  assert.ok(gridDataStart >= 0 && gridDataEnd > gridDataStart, 'saved Laiban comparison grid data should exist');
  vm.runInContext(analysisSource.slice(gridDataStart, gridDataEnd), context);
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
  assert.equal(scenarios[1].obstacles.length, 32);
  var obstacleMaps = [202, 1202, 100202].map(function (seed) {
    return Array.from(makeWorld(context.MazeRouting, scenarios[1], seed).obstacles).sort().join(';');
  });
  assert.equal(new Set(obstacleMaps).size, 1, 'Tab 2 keeps its same fixed map for training and evaluation');
  var tabTwoStarts = context.MazeComparisonData.tabTwoStartCells(scenarios[1]);
  assert.equal(tabTwoStarts.length, 67);
  var tabTwoWorld = makeWorld(context.MazeRouting, scenarios[1]);
  tabTwoStarts.forEach(function (start) {
    assert.ok(tabTwoWorld.pathExists(start, scenarios[1].sites[0].position),
      'every batch/training start must reach the target: ' + start.join(','));
  });
  var startKey = context.MazeRouting.key(scenarios[1].start);
  var distanceQueue = [[scenarios[1].start, 0]], distanceByKey = new Map([[startKey, 0]]);
  var shortestPathCounts = new Map([[startKey, 1]]);
  var shortestPathLength = null, directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (var queueIndex = 0; queueIndex < distanceQueue.length; queueIndex++) {
    var entry = distanceQueue[queueIndex], point = entry[0], distance = entry[1];
    if (context.MazeRouting.key(point) === context.MazeRouting.key(scenarios[1].sites[0].position)) {
      shortestPathLength = distance;
      break;
    }
    directions.forEach(function (direction) {
      var next = [point[0] + direction[0], point[1] + direction[1]], nextKey = context.MazeRouting.key(next);
      if (tabTwoWorld.isOpen(next)) {
        if (!distanceByKey.has(nextKey)) {
          distanceByKey.set(nextKey, distance + 1);
          shortestPathCounts.set(nextKey, shortestPathCounts.get(context.MazeRouting.key(point)));
          distanceQueue.push([next, distance + 1]);
        } else if (distanceByKey.get(nextKey) === distance + 1) {
          shortestPathCounts.set(nextKey,
            shortestPathCounts.get(nextKey) + shortestPathCounts.get(context.MazeRouting.key(point)));
        }
      }
    });
  }
  assert.equal(shortestPathLength, 24);
  assert.ok(shortestPathCounts.get(context.MazeRouting.key(scenarios[1].sites[0].position)) > 1,
    'the maze allows multiple shortest routes, not one forced corridor');
  assert.ok(shortestPathLength >= 1.3 * 18, 'maze detour should exceed the 1.3x Manhattan threshold');
  var obstacleSet = new Set(scenarios[1].obstacles.map(function (point) { return point.join(','); }));
  var obstacleRows = Array.from({length: 10}, function (_, row) {
    return Array.from({length: 10}, function (_, column) {
      return obstacleSet.has(row + ',' + column) ? '#' : '.';
    }).join('');
  });
  assert.equal(new Set(obstacleRows).size, 10, 'obstacle rows are irregular, not a repeating corridor pattern');
  assert.ok(obstacleRows.every(function (row) { return (row.match(/#/g) || []).length <= 6; }),
    'the map has no full-width wall or forced single corridor');
  assert.equal(scenarios[1].dynamicFrequency, 0);
  assert.ok(scenarios[2].sites.length > 1);
  assert.equal(scenarios[2].dynamicFrequency, 0);
  assert.equal(scenarios[2].obstacleRatio, 0);
  assert.equal(scenarios[2].obstacles.length, 24);
  var tabThreeMaps = [303, 1303, 100303].map(function (seed) {
    return Array.from(makeWorld(context.MazeRouting, scenarios[2], seed).obstacles).sort().join(';');
  });
  assert.equal(new Set(tabThreeMaps).size, 1, 'Tab 3 training and evaluation share one fixed seed-303 map');
  var tabThreeWorld = makeWorld(context.MazeRouting, scenarios[2]);
  scenarios[2].sites.forEach(function (site) {
    assert.ok(tabThreeWorld.pathExists(scenarios[2].start, site.position),
      site.id + ' must remain reachable on the fixed Tab 3 map');
  });
  for (var tick = 0; tick < 60; tick++) tabThreeWorld.beginTick();
  assert.equal(tabThreeWorld.obstacleUpdates, 0, 'fixed Tab 3 obstacles do not update');
  assert.equal(scenarios[3].sites.length, 9);
  assert.equal(scenarios[3].rainfallMm, 38);
  assert.equal(scenarios[3].budgetMinutes, 480);
  assert.equal(scenarios[3].serviceMinutes, 60);
  assert.equal(scenarios[3].start.join(','), '4,4');
  assert.deepEqual(Array.from(scenarios, function (scenario) { return scenario.name; }),
    ['Basic Grid', 'Obstacles', 'Multi-Target', 'Laiban Case']);
  assert.ok(scenarios[3].closedRoads.length > 0);
  var laibanWorld = makeWorld(context.MazeRouting, scenarios[3]);
  assert.deepEqual(Array.from(laibanWorld.reachableSiteIds), ['maysawa', 'banatas', 'iwi_iw', 'old_laiban']);
  assert.deepEqual(Array.from(scenarios[3].sites, function (site) { return site.position.join(','); }),
    ['1,1', '1,4', '1,7', '8,4', '6,1', '4,8', '6,4', '8,6', '8,8']);
  assert.ok(scenarios[3].openCells.length > 0);
  assert.ok(Object.keys(scenarios[3].roadTiles).length > scenarios[3].openCells.length);
  assert.ok(Object.keys(scenarios[3].hazardTiles).length > 0);
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
    if (scenario.id === 'tab-2' || scenario.id === 'tab-4') {
      assert.equal(policy.trainingLog.standardCompleted.length, 5000);
      assert.equal(policy.trainingLog.modqlCompleted.length, 5000);
    }
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

test('Tab 2 training starts vary reproducibly across the 67 open cells without changing the demo start', function () {
  var context = harness(), data = context.MazeComparisonData;
  var config = data.scenarios()[1], firstModels = context.MazeRouting.modelsFor(config.seed);
  var secondModels = context.MazeRouting.modelsFor(config.seed);
  var starts = data.tabTwoStartCells(config);
  assert.equal(starts.length, 67);
  var firstSequence = [], secondSequence = [];
  for (var episode = 0; episode < 5000; episode++) {
    firstSequence.push(data.trainingStart(config, firstModels.scenarioRandom).join(','));
    secondSequence.push(data.trainingStart(config, secondModels.scenarioRandom).join(','));
  }
  assert.deepEqual(firstSequence, secondSequence, 'training start sequence is seeded and reproducible');
  assert.equal(new Set(firstSequence).size, 67, 'all open non-target cells are represented');
  assert.ok(firstSequence.every(function (start) {
    return starts.some(function (cell) { return cell.join(',') === start; });
  }));
  assert.deepEqual(Array.from(config.start), [0, 0], 'the default demo start remains unchanged');
  assert.deepEqual(Array.from(data.trainingStart(data.scenarios()[0], function () {
    throw new Error('non-Tab-2 training must not draw a random start');
  })), [0, 0]);
});

test('random-start Tab 2 policy training logs success and frozen evaluation does not update Q tables', function () {
  var context = harness(), api = context.MazeRouting, config = context.MazeComparisonData.scenarios()[1];
  var policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'tab-2.json'), 'utf8'));
  ['standard', 'modql'].forEach(function (id) {
    assert.equal(policy.trainingLog[id + 'Completed'].length, 5000);
    assert.equal(policy.trainingLog[id + 'Completed'].slice(-500).filter(Boolean).length,
      id === 'standard' ? 493 : 500, id + ' training success rate matches its recorded episode log');
  });
  assert.ok(policy.qTables.standard.length >= 67);
  assert.ok(policy.qTables.modqlQ1.length > 0);
  assert.ok(policy.qTables.modqlQ2.length > 0);
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
  var starts = context.MazeComparisonData.tabTwoStartCells(config);
  assert.equal(starts.length, 67);
  var outcomes = {standard: [], modql: []}, distinctStarts = new Set();
  for (var index = 0; index < 200; index++) {
    var batchConfig = JSON.parse(JSON.stringify(config));
    batchConfig.start = starts[index % starts.length];
    distinctStarts.add(batchConfig.start.join(','));
    var world = makeWorld(api, batchConfig, (config.seed + 100000 + index * 7919) >>> 0);
    var pair = new api.Pair(world, models, false);
    driveToEnd(pair, 190);
    assert.deepEqual(Array.from(world.start), Array.from(pair.world.start));
    ['standard', 'modql'].forEach(function (id) {
      outcomes[id].push(api.metrics(pair.runs[id], world));
    });
  }
  assert.equal(distinctStarts.size, 67);
  assert.equal(outcomes.standard.filter(function (result) { return result.completed; }).length, 200);
  assert.equal(outcomes.modql.filter(function (result) { return result.completed; }).length, 200);
  assert.equal(outcomes.standard.filter(function (result) { return result.loopDetected; }).length, 0);
  assert.equal(outcomes.modql.filter(function (result) { return result.loopDetected; }).length, 0);
  assert.equal(outcomes.standard.filter(function (result) { return !result.completed && !result.loopDetected; }).length, 0);
  assert.equal(outcomes.modql.filter(function (result) { return !result.completed && !result.loopDetected; }).length, 0);
  ['standard', 'modql'].forEach(function (id) {
    var steps = outcomes[id].map(function (result) { return result.movementSteps; });
    var mean = steps.reduce(function (sum, value) { return sum + value; }, 0) / steps.length;
    var variance = steps.reduce(function (sum, value) { return sum + Math.pow(value - mean, 2); }, 0) / steps.length;
    assert.ok(Math.abs(mean - (id === 'standard' ? 14.665 : 14.575)) < 1e-9, id + ' batch mean steps');
    assert.ok(Math.abs(Math.sqrt(variance) - (id === 'standard' ? 6.3547442906855025 : 6.11836375185392)) < 1e-9,
      id + ' batch population SD');
  });
});

test('Tab 3 fixed-map policy batch completes all MODQL routes and detects Standard loops', function () {
  var context = harness(), api = context.MazeRouting, config = context.MazeComparisonData.scenarios()[2];
  var policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'tab-3.json'), 'utf8'));
  var models = api.modelsFromPolicy(policy, config.id, config.seed), outcomes = {standard: [], modql: []};
  for (var index = 0; index < 200; index++) {
    var world = makeWorld(api, config, config.seed + 100000 + index * 7919);
    var pair = new api.Pair(world, models, false);
    driveToEnd(pair, 190);
    ['standard', 'modql'].forEach(function (id) {
      outcomes[id].push(api.metrics(pair.runs[id], world));
      var trail = pair.runs[id].trail;
      trail.forEach(function (point, trailIndex) {
        assert.ok(world.isOpen(point), id + ' route remains on traversable cells');
        if (trailIndex) {
          var previous = trail[trailIndex - 1];
          assert.equal(Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1]), 1,
            id + ' route renderer connects only adjacent movement cells');
        }
      });

      test('Laiban policy reports reachable completion, closures, live rollout counts and per-episode training success', function () {
        var context = harness(), api = context.MazeRouting, config = context.MazeComparisonData.scenarios()[3];
        var policy = JSON.parse(fs.readFileSync(path.join(root, 'policies', 'tab-4.json'), 'utf8'));
        var models = api.modelsFromPolicy(policy, config.id, config.seed);
        var worldTemplate = makeWorld(api, config);
        assert.deepEqual(Array.from(worldTemplate.reachableSiteIds), ['maysawa', 'banatas', 'iwi_iw', 'old_laiban']);
        var outcomes = {standard: [], modql: []};
        for (var index = 0; index < 200; index++) {
          var world = makeWorld(api, config, (config.seed + 100000 + index * 7919) >>> 0);
          var pair = new api.Pair(world, models, false);
          driveToEnd(pair, 1002);
          ['standard', 'modql'].forEach(function (id) {
            var run = pair.runs[id];
            run.trail.forEach(function (point, trailIndex) {
              assert.ok(world.allowedCells.has(api.key(point)), id + ' Laiban route stays on saved road cells');
              assert.ok(!world.obstacles.has(api.key(point)), id + ' Laiban route avoids fixed road closures');
              if (trailIndex) {
                var previous = run.trail[trailIndex - 1];
                assert.equal(Math.abs(point[0] - previous[0]) + Math.abs(point[1] - previous[1]), 1);
              }
            });
            outcomes[id].push(api.metrics(run, world));
          });
        }
        assert.equal(outcomes.standard.filter(function (result) { return result.completed; }).length, 0);
        assert.equal(outcomes.standard.filter(function (result) { return result.loopDetected; }).length, 200);
        assert.equal(outcomes.modql.filter(function (result) { return result.completed; }).length, 182);
        assert.equal(outcomes.modql.filter(function (result) { return result.loopDetected; }).length, 8);
        assert.equal(outcomes.modql.filter(function (result) { return !result.completed && !result.loopDetected; }).length, 10);
        assert.ok(outcomes.modql.every(function (result) {
          return result.reachableDestinationTotal === 4 && result.destinationsServed <= 4 &&
            result.deferredCommunities === 4 - result.reachableDestinationsServed;
        }));
        assert.equal(policy.trainingLog.standardCompleted.slice(-500).filter(Boolean).length, 0);
        assert.equal(policy.trainingLog.modqlCompleted.slice(-500).filter(Boolean).length, 381);
        assert.deepEqual(
          Array.from(config.sites.filter(function (site) {
            return worldTemplate.reachableSiteIds.indexOf(site.id) < 0;
          }), function (site) { return site.letter; }),
          ['B', 'C', 'D', 'H', 'I']
        );
      });
    });
  }
  assert.equal(outcomes.standard.filter(function (result) { return result.loopDetected; }).length, 200);
  assert.equal(outcomes.standard.filter(function (result) { return result.completed; }).length, 0);
  assert.equal(outcomes.modql.filter(function (result) { return result.loopDetected; }).length, 0);
  assert.equal(outcomes.modql.filter(function (result) { return result.completed; }).length, 200);
  assert.ok(outcomes.standard.every(function (result) {
    return result.destinationsServed === 1 && result.movementSteps === 110;
  }));
  assert.ok(outcomes.modql.every(function (result) {
    return result.destinationsServed === 6 && result.movementSteps === 49;
  }));
});

test('Q rows use typed arrays and background training does not render grids', function () {
  var api = harness().MazeRouting;
  var table = new api.QTable();
  assert.equal(Object.prototype.toString.call(table.data), '[object Float64Array]');
  table.set('state', [1, 2, 3, 4]);
  assert.equal(Object.prototype.toString.call(table.get('state')), '[object Float64Array]');
  var worker = fs.readFileSync(path.join(root, 'maze-training-worker.js'), 'utf8');
  assert.match(worker, /importScripts\('maze-routing\.js'\)/);
  assert.match(worker, /importScripts\('maze-scenarios\.js'\)/);
  assert.match(worker, /MazeComparisonData\.trainingStart\(config, models\.scenarioRandom\)/);
  assert.match(worker, /postMessage\(\{type: 'progress'/);
  assert.doesNotMatch(worker, /canvas|renderState|draw\(/);
  var generator = fs.readFileSync(path.join(root, 'scripts', 'generate-maze-policies.js'), 'utf8');
  assert.match(generator, /MazeComparisonData\.trainingStart\(config, models\.scenarioRandom\)/);
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

test('display-only loop detector flags only a current four-cycle two-cell oscillation and ignores corridor backtracking', function () {
  var api = harness().MazeRouting;
  var loop = [[2, 1], [2, 2], [2, 1], [2, 2], [2, 1], [2, 2], [2, 1], [2, 2], [2, 1]];
  assert.equal(api.hasRepeatedTwoCellLoop(loop, []), true);
  assert.equal(api.hasRepeatedTwoCellLoop(loop.slice(0, 8), []), false);
  assert.equal(api.hasRepeatedTwoCellLoop(loop.concat([[2, 3]]), []), false,
    'moving to a new cell clears the active-loop display');
  assert.equal(api.hasRepeatedTwoCellLoop(loop, [5]), false);
  assert.equal(api.hasRepeatedTwoCellLoop([[1, 1], [1, 2], [1, 3], [1, 2], [1, 3], [1, 4], [1, 5]], []), false);
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

test('MODQL chooses epsilon-greedily from the summed Q1 and Q2 values', function () {
  var api = harness().MazeRouting, draws = [0.9, 0.8, 0.1, 0.4];
  var model = new api.Model('modql', function () { return draws.shift(); });
  model.q1.set('state', [4, 0, 0, 0]);
  model.q2.set('state', [0, 5, 0, 0]);
  model.epsilon = 0.5;
  assert.equal(model.choose('state', [0, 1], true), 1,
    'greedy action is selected from Q1 + Q2, not either table alone');
  assert.equal(model.choose('state', [0, 1], true), 0,
    'epsilon exploration can choose another legal action');
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
  assert.match(demoSource, /Tab 2 batch evaluates 200 starts on a fixed obstacle map\. Training uses seeded random starts from the same 67 open non-target cells\./);
  assert.match(demoSource, /'Served ' \+ metric\.destinationsServed \+ ' of ' \+ metric\.destinationTotal \+\s*' sitios; served '/);
  assert.match(demoSource, /closed road/);
  assert.match(demoSource, /maze-laiban-sites/);
  assert.match(demoSource, /temporary obstacle moves only among open road cells/);
  var styleSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(styleSource, /\.maze-loop-status\[hidden\]\s*\{\s*display:none;/);
  assert.match(demoSource, /<div class="maze-agent-body">'\s*\+\s*buildCardResultsTable\(id, title\)\s*\+\s*'<div class="maze-agent-side">/);
  assert.match(demoSource, /<div class="maze-agent-side"><div class="maze-agent-grid">[\s\S]*?<div class="maze-agent-info">/);
  assert.match(demoSource, /maze-agent-status-line"><div class="maze-agent-status"[\s\S]*?maze-loop-status/);
  assert.match(styleSource, /grid-template-columns:minmax\(0,2fr\) minmax\(0,3fr\)/);
  assert.match(styleSource, /@media\(max-width:1099px\)/);
  assert.match(demoSource, /batchConfig\.start = starts\[index % starts\.length\]/);
  assert.match(routingSource, /serviceSteps/);
  assert.match(demoSource, /5,000 training episodes each, equal budget/);
  assert.match(demoSource, /Not run yet/);
  assert.match(demoSource, /200 Held-Out/);
  assert.match(demoSource, /data-action="step"/);
  assert.match(demoSource, /class="maze-control-item maze-control-run"/);
  assert.match(demoSource, /class="maze-control-label" aria-hidden="true"/);
  assert.match(demoSource, /class="maze-control-item maze-control-speed"><span class="maze-control-label">Simulation speed<\/span>/);
  assert.doesNotMatch(demoSource, /Travel time units|data-action="unit"/);
  assert.match(demoSource, /label: 'Travel time \(minutes\)'/);
  assert.match(demoSource, /label: 'Movement steps'.*unit: 'steps'/);
  assert.match(demoSource, /label: 'Movement steps', decimals: 2, unit: 'steps'/);
  assert.match(demoSource, /Travel time is reported in minutes; movement steps are reported separately\./);
  assert.match(demoSource, /function formatTime\(minutes\) \{\s*return number\(minutes, 1\)\.replace\(\/\\\.0\$\/, ''\) \+ ' min';/);
  assert.match(demoSource, /label: 'Travel time \(minutes\)', decimals: 2/);
  assert.match(demoSource, /data-action="reset"/);
  assert.match(demoSource, /data-dynamic="tick"/);
  assert.match(demoSource, /function buildCardResultsTable\(id, title\)/);
  assert.match(demoSource, /METRICS\.map\(function \(metric\)/);
  assert.match(demoSource, /data-result="' \+\s*id \+ '" data-key="' \+\s*metric\.key/);
  assert.match(demoSource, /<th scope="col">Metric<\/th><th scope="col">Result'\s*\+\s*'<\/th><th scope="col">Metric-by-metric assessment<\/th>/);
  assert.match(demoSource, /return 'Trained · ' \+ state\.policyMetadata\.episodes\.toLocaleString\('en-US'\) \+\s*' episodes · seed ' \+ state\.policyMetadata\.seed;/);
  assert.doesNotMatch(demoSource.slice(demoSource.indexOf('function trainingLabel'), demoSource.indexOf('function renderTrainingProgress')), /trainedAt/);
  assert.match(demoSource, /<td><span class="maze-result-value is-placeholder" data-result=/);
  assert.match(demoSource, /data-assessment-row="' \+ metric\.key \+ '"/);
  assert.match(demoSource, /data-assessment="' \+\s*metric\.key \+ '">Not run yet/);
  var metricDefinitions = demoSource.match(/var METRICS = \[([\s\S]*?)\n  \];/);
  assert.ok(metricDefinitions);
  assert.equal((metricDefinitions[1].match(/\{key: '/g) || []).length, 14, 'all 14 metrics are defined');
  assert.match(demoSource, /var records = \{\s*standard: readMetrics\(state, 'standard'\),\s*modql: readMetrics\(state, 'modql'\)/);
  assert.match(demoSource, /formatMetric\(metric, records\[id\], state, id\)/);
  assert.match(demoSource, /var metric = records\[id\]/);
  assert.match(demoSource, /querySelectorAll\('tr\[data-assessment-row\]'\)/);
  assert.match(demoSource, /assessment\.textContent = started\s*\? comparisonText\(metric, records\.standard, records\.modql\)/);
  assert.match(demoSource, /valueNode\.title = valueNode\.textContent/);
  assert.match(demoSource, /assessment\.title = assessment\.textContent/);
  assert.match(demoSource, /valueNode\.classList\.toggle\('is-placeholder', !sideStarted\)/);
  assert.match(demoSource, /assessment\.classList\.toggle\('is-placeholder', !started\)/);
  assert.doesNotMatch(demoSource, /Report-only diagnostics|buildAssessmentRows\(\)|<section class="shared-maze-summary"/);
  assert.match(demoSource, /Metric-by-metric assessment/);
  assert.doesNotMatch(demoSource, /<th>Standard Q-Learning<\/th>|<th>Enhanced MODQL<\/th>/);
  assert.match(styleSource, /\.maze-metrics-table thead th:nth-child\(2\)\{\s*text-align:right/);
  assert.match(styleSource, /\.maze-metrics-table \.maze-metric-column\{width:38%\}\s*\.maze-metrics-table \.maze-value-column\{width:25%\}\s*\.maze-metrics-table \.maze-assessment-column\{width:37%\}/);
  assert.match(styleSource, /\.maze-scenario-panel \.maze-metrics-table\{\s*display:table;\s*overflow:visible/);
  assert.match(styleSource, /\.maze-metrics-table thead th\{\s*padding:7px 4px;[\s\S]*?font-size:clamp\(7px,\.5vw,10px\)/);
  assert.match(styleSource, /\.maze-metrics-table \.maze-result-name\{[\s\S]*?font-size:clamp\(7\.5px,\.6vw,12px\)/);
  assert.match(styleSource, /white-space:nowrap;\s*\}/);
  assert.match(styleSource, /\.maze-metrics-table \.maze-result-value\.is-placeholder[\s\S]*?white-space:nowrap/);
  assert.match(styleSource, /\.maze-metrics-table \.maze-result-value\.is-live\{\s*display:-webkit-box;[\s\S]*?white-space:normal/);
  assert.match(styleSource, /height:36px;\s*padding:3px 4px/);
  assert.match(styleSource, /@media\(min-width:1500px\) and \(min-height:900px\)/);
  assert.match(styleSource, /\.maze-metrics-table tbody th,[\s\S]*?background:transparent!important/);
  assert.match(styleSource, /\.maze-metrics-table tbody tr\.maze-sop-highlight,[\s\S]*?background:transparent!important/);
  assert.match(styleSource, /\.maze-agent-body\{\s*flex:1;\s*grid-template-columns:minmax\(0,55fr\) minmax\(0,45fr\)/);
  assert.match(styleSource, /\.maze-agent-side\{\s*position:sticky;\s*top:12px/);
  assert.match(styleSource, /\.maze-scenario-panel \.shared-maze-panel\{\s*height:100%;\s*overflow:clip/);
  assert.match(styleSource, /height:90px/);
  assert.match(styleSource, /\.maze-agent-grid \.shared-maze-board\{\s*width:100%;\s*max-width:none/);
  assert.match(styleSource, /@media\(max-width:1099px\)\{\s*\.maze-agent-body\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(demoSource, /<section class="maze-assessment-note">[\s\S]*?data-assessment-summary/);
  assert.match(styleSource, /\.maze-scenario-panel \.shared-maze-controls\{\s*display:flex;\s*align-items:flex-end;\s*flex-wrap:nowrap/);
  assert.match(styleSource, /height:44px;\s*min-height:44px/);
  assert.match(styleSource, /@media\(max-width:999px\)/);
  assert.match(styleSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styleSource, /\.maze-control-run>\.btn\{width:166px\}/);
  assert.match(styleSource, /\.maze-control-speed>select\{min-width:122px\}/);
  var comparisonDocs = fs.readFileSync(path.join(root, 'docs', 'MAZE-COMPARISON.md'), 'utf8');
  assert.match(comparisonDocs, /travel time is always displayed in minutes and\s+movement steps are reported separately/);
  assert.match(comparisonDocs, /travel time \(minutes\), movement steps/);
  assert.match(comparisonDocs, /Each algorithm card contains the full 14-row results table/);
  assert.match(comparisonDocs, /that policy's value, and the live metric-by-metric\s+assessment/);
  assert.match(comparisonDocs, /No separate comparative-results\s+table is repeated below the cards/);
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
