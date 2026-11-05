'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({});
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

vm.runInContext(read('engine.js'), context);
const analysis = read('analysis.js');
const gridDataStart = analysis.indexOf('var COMPARISON_GRID_POSITIONS=');
const gridDataEnd = analysis.indexOf('function comparisonGridKey', gridDataStart);
if (gridDataStart < 0 || gridDataEnd <= gridDataStart) {
  throw new Error('Saved Laiban comparison grid data could not be located in analysis.js.');
}
vm.runInContext(analysis.slice(gridDataStart, gridDataEnd), context);
vm.runInContext(read('maze-routing.js'), context);
vm.runInContext(read('maze-scenarios.js'), context);

const api = context.MazeRouting;
const data = context.MazeComparisonData;
const scenarioConfigs = data.scenarios();
const requestedMaps = 5;
const evaluationRuns = 200;
const definitions = [
  {id: 'tab-2', ratio: 0.32, firstSeed: 2203, requiredObstacles: 32},
  {id: 'tab-3', ratio: 0.24, firstSeed: 3304, requiredObstacles: 24}
];
const metricKeys = [
  'completionPercent',
  'loopPercent',
  'targetsServed',
  'coveragePercent',
  'jainFairness',
  'travelMinutes'
];

function mapSignature(obstacles) {
  return obstacles.map(api.key).sort().join(';');
}

function candidateMap(base, definition, seed) {
  const generationConfig = Object.assign({}, base, {
    seed,
    obstacles: [],
    obstacleRatio: definition.ratio,
    ensureConnected: base.id === 'tab-3',
    dynamicFrequency: 0
  });
  const generated = new api.World(generationConfig, seed);
  const obstacles = Array.from(generated.obstacles, point => point.split(',').map(Number));
  if (obstacles.length !== definition.requiredObstacles) return null;

  const config = Object.assign({}, base, {
    seed,
    obstacles,
    obstacleRatio: 0,
    ensureConnected: false,
    dynamicFrequency: 0
  });
  const world = new api.World(config, seed);
  if (base.id === 'tab-2') {
    const starts = data.tabTwoStartCells(config);
    if (starts.length !== 67 ||
        starts.some(start => !world.pathExists(start, base.sites[0].position))) return null;
  } else if (world.reachableSiteIds.length !== base.sites.length) {
    return null;
  }
  return config;
}

function fixedMaps(base, definition) {
  const maps = [], seen = new Set();
  for (let seed = definition.firstSeed;
       maps.length < requestedMaps && seed < definition.firstSeed + 10000;
       seed++) {
    const config = candidateMap(base, definition, seed);
    if (!config) continue;
    const signature = mapSignature(config.obstacles);
    if (seen.has(signature)) continue;
    seen.add(signature);
    maps.push(config);
  }
  if (maps.length !== requestedMaps) throw new Error('Unable to find enough reachable maps for ' + definition.id + '.');
  return maps;
}

function train(config) {
  const models = api.modelsFor(config.seed);
  for (let episode = 0; episode < api.parameters.episodes; episode++) {
    const trainingConfig = Object.assign({}, config, {
      start: data.trainingStart(config, models.scenarioRandom)
    });
    const seed = (config.seed + 1000 + episode * 7919) >>> 0;
    api.trainEpisode(new api.World(trainingConfig, seed), models);
  }
  return models;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => Math.pow(value - average, 2))));
}

function evaluate(config, models) {
  const starts = config.id === 'tab-2' ? data.tabTwoStartCells(config) : null;
  const perAgent = {standard: [], modql: []};
  for (let index = 0; index < evaluationRuns; index++) {
    const start = starts ? starts[index % starts.length] : config.start;
    const batchConfig = Object.assign({}, config, {start});
    const seed = (config.seed + 100000 + index * 7919) >>> 0;
    const world = new api.World(batchConfig, seed);
    const pair = new api.Pair(world, models, false);
    let guard = 0;
    while (!pair.done() && guard++ < world.maxSteps + 2) pair.step();
    if (!pair.done()) throw new Error(config.id + ' evaluation did not terminate for run ' + index + '.');
    ['standard', 'modql'].forEach(id => {
      perAgent[id].push(api.metrics(pair.runs[id], world));
    });
  }

  const summary = {};
  ['standard', 'modql'].forEach(id => {
    const runs = perAgent[id];
    summary[id] = {
      completionPercent: 100 * mean(runs.map(result => result.completed ? 1 : 0)),
      completionRuns: runs.filter(result => result.completed).length,
      loopPercent: 100 * mean(runs.map(result => result.loopDetected ? 1 : 0)),
      loopRuns: runs.filter(result => result.loopDetected).length,
      targetsServed: mean(runs.map(result => result.destinationsServed)),
      coveragePercent: mean(runs.map(result => result.coveragePercent)),
      jainFairness: mean(runs.map(result => result.fairness)),
      travelMinutes: mean(runs.map(result => result.travelMinutes))
    };
  });
  return summary;
}

function aggregate(mapSummaries) {
  const overall = {};
  ['standard', 'modql'].forEach(id => {
    overall[id] = {};
    metricKeys.forEach(metric => {
      const values = mapSummaries.map(map => map.results[id][metric]);
      overall[id][metric] = {
        mean: mean(values),
        populationSdAcrossMaps: standardDeviation(values)
      };
    });
  });
  return overall;
}

const reports = definitions.map(definition => {
  const base = scenarioConfigs.find(config => config.id === definition.id);
  if (!base) throw new Error('Missing scenario ' + definition.id + '.');
  const maps = fixedMaps(base, definition).map(config => {
    const models = train(config);
    return {
      seed: config.seed,
      obstacleCount: config.obstacles.length,
      startProtocol: config.id === 'tab-2'
        ? 'seeded random starts across 67 open non-target cells; evaluation cycles the cells in row-major order'
        : 'fixed start at (0,0) for training and evaluation',
      results: evaluate(config, models)
    };
  });
  return {
    scenario: definition.id,
    episodesPerMapAndAlgorithm: api.parameters.episodes,
    evaluationRunsPerMap: evaluationRuns,
    obstacleRatio: definition.ratio,
    maps,
    overallAcrossMaps: aggregate(maps)
  };
});

console.log(JSON.stringify({
  analysis: 'Offline map-sensitivity analysis; does not change live scenarios or policy files.',
  parameters: api.parameters,
  mapsPerScenario: requestedMaps,
  reports
}, null, 2));
