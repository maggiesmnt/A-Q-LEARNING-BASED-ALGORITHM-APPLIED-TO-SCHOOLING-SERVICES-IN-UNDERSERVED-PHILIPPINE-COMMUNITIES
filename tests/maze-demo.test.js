/* No dependencies: exercise the real IIFE without publishing debug globals. */
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');
var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'maze-demo.js'), 'utf8');
// Load the existing fairness helper, rather than a second implementation.
var fairness = fs.readFileSync(path.join(root, 'engine.js'), 'utf8').match(/^function jain\(v\).*$/m)[0];

function harness(seed) {
  var nodes = {}, intervals = new Map(), intervalId = 0;
  var context = vm.createContext({
    document: {getElementById: function (id) {
      if (/-canvas$/.test(id)) return null;
      return nodes[id] || (nodes[id] = {});
    }, addEventListener: function () {}},
    Date: Date, setInterval: function (fn, ms) {
      assert.equal(ms, 200); intervals.set(++intervalId, fn); return intervalId;
    }, clearInterval: function (id) { intervals.delete(id); }
  });
  var exposed = source.replace("  document.addEventListener('DOMContentLoaded', buildUI);", [
    '  globalThis.demo = {reset:resetComparison, step:stepBoth, next:nextEpisode,',
    '    start:startTimer, stop:stopTimer, allDone:allDone,',
    '    world:function(){return env}, agents:function(){return agents}, runs:function(){return runs},',
    '    Standard:StandardQLearningAgent, MODQL:MODQLAgent, rng:makeRng};'
  ].join('\n'));
  vm.runInContext(fairness + '\n' + exposed, context);
  context.demo.reset(seed);
  return {demo:context.demo, nodes:nodes, intervals:intervals};
}
function snapshot(demo) {
  return JSON.stringify({world:demo.world(), runs:demo.runs(),
    q:Array.from(demo.agents().standard.qTable),
    q1:Array.from(demo.agents().modql.q1), q2:Array.from(demo.agents().modql.q2)});
}

test('identical seeds and controls reproduce five full episodes, different seeds diverge', function () {
  var a = harness(123).demo, b = harness(123).demo, c = harness(124).demo;
  assert.notEqual(snapshot(a), snapshot(c));
  for (var ep = 0; ep < 5; ep++) {
    assert.equal(snapshot(a), snapshot(b));
    while (!a.allDone()) {
      a.step(); b.step();
      assert.equal(snapshot(a), snapshot(b));
    }
    a.next(); b.next();
  }
});

test('one shared tick, fixed order, one wall update schedule, separate histories and live objectives', function () {
  var demo = harness(987).demo, world = demo.world();
  var repairs = 0, updates = 0, order = [], originalRepair = world.ensurePathExists;
  var originalUpdate = world.updateEnvironment, originalStep = world.step;
  world.ensurePathExists = function () { repairs++; return originalRepair.call(this); };
  world.updateEnvironment = function () { updates++; return originalUpdate.call(this); };
  world.step = function (id, action) {
    order.push(id);
    var maze = JSON.stringify(this.maze), result = originalStep.call(this, id, action);
    assert.equal(JSON.stringify(this.maze), maze, 'agent transition must never mutate walls');
    return result;
  };
  for (var tick = 1; tick <= 100; tick++) {
    order = [];
    var active = ['standard', 'modql'].filter(function (id) { return !demo.runs()[id].done; });
    if (!active.length) break;
    demo.step();
    assert.deepEqual(order, active);
    assert.equal(world.steps, tick);
    assert.equal(repairs, tick);
    assert.equal(updates, Math.floor(tick / 20));
    ['standard', 'modql'].forEach(function (id) {
      var run = demo.runs()[id];
      assert.equal(run.history.length, run.steps + 1);
      assert.ok(run.steps <= 100);
      assert.ok(world.isOpen(world.currentPos[id]));
      assert.ok(world.bfs(world.currentPos[id], world.goalPos));
      if (active.indexOf(id) < 0) return;
      var stepMin = world.minutes[world.currentPos[id][0]][world.currentPos[id][1]];
      var expected = id === 'standard' ? 60 / stepMin : run.demand * run.fairness / (1 + stepMin / 60);
      assert.ok(Math.abs(run.latestReward - expected) < 1e-12);
      assert.ok(Number.isFinite(run.reward));
      assert.ok(run.fairness >= 0 && run.fairness <= 1);
    });
    assert.notEqual(demo.runs().standard.history, demo.runs().modql.history);
    assert.notEqual(demo.runs().standard.service, demo.runs().modql.service);
  }
  assert.ok(demo.allDone());
});

test('collisions terminate at the step limit and do not bypass shared obstacle changes', function () {
  var demo = harness(8).demo, world = demo.world();
  world.currentPos.standard = [0, 0]; world.currentPos.modql = [0, 0]; world.maze[0][0] = 0;
  demo.agents().standard.selectAction = demo.agents().modql.selectAction = function () { return 0; };
  for (var i = 0; i < 100; i++) demo.step();
  assert.ok(demo.allDone());
  assert.equal(world.episodeData.environmentUpdates, 5);
  assert.equal(demo.runs().standard.steps, 100);
  assert.equal(demo.runs().modql.demand, 0);
  assert.equal(demo.runs().modql.reward, 0);
  assert.equal(demo.runs().modql.history.length, 101);
});

test('shared timer cannot duplicate, next episode retains learning, reset clears both agents', function () {
  var h = harness(13), demo = h.demo;
  demo.start(); demo.start();
  assert.equal(h.intervals.size, 1);
  h.intervals.forEach(function (fn) { fn(); });
  assert.equal(demo.runs().standard.steps, 1);
  assert.equal(demo.runs().modql.steps, 1);
  var before = demo.agents();
  demo.next();
  assert.equal(h.intervals.size, 0);
  assert.equal(demo.agents(), before);
  assert.ok(before.standard.qTable.size > 0);
  assert.equal(demo.runs().standard.steps, 0);
  demo.reset(13);
  assert.notEqual(demo.agents(), before);
  assert.equal(demo.agents().standard.qTable.size, 0);
  assert.equal(demo.agents().modql.q1.size, 0);
  assert.equal(demo.agents().modql.q2.size, 0);
});

test('Double Q selects with one estimator and evaluates with the other; terminal updates do not bootstrap', function () {
  var demo = harness(1).demo;
  [0.25, 0.75].forEach(function (coin) {
    var agent = new demo.MODQL(function () { return coin; });
    var select = coin < 0.5 ? agent.q1 : agent.q2;
    var evaluate = coin < 0.5 ? agent.q2 : agent.q1;
    select.set('next', [0, 9, 0, 0]); evaluate.set('next', [100, 2, 100, 100]);
    agent.learn('s', 0, 1, 'next', false);
    assert.ok(Math.abs(select.get('s')[0] - 0.28) < 1e-12);
    assert.equal(evaluate.has('s'), false);
    agent.learn('terminal', 0, 1, 'next', true);
    assert.equal(select.get('terminal')[0], 0.1);
    assert.ok(Number.isFinite(agent.spread()));
  });
});

test('Standard state ignores context while MODQL state changes with D, T, H, and A', function () {
  var demo = harness(44).demo, world = demo.world(), run = demo.runs().modql;
  var pos = world.currentPos.modql, std = demo.agents().standard, mod = demo.agents().modql;
  var baseline = std.encodeState(world, run, pos), rich = mod.encodeState(world, run, pos);
  run.minutes++;
  assert.notEqual(mod.encodeState(world, run, pos), rich);
  rich = mod.encodeState(world, run, pos); run.service[0]++;
  assert.notEqual(mod.encodeState(world, run, pos), rich);
  rich = mod.encodeState(world, run, pos); run.served['9,9'] = true;
  assert.notEqual(mod.encodeState(world, run, pos), rich);
  rich = mod.encodeState(world, run, pos);
  var row = pos[0] + 1; world.maze[row][pos[1]] ^= 1;
  assert.notEqual(mod.encodeState(world, run, pos), rich);
  assert.equal(std.encodeState(world, run, pos), baseline);
});
