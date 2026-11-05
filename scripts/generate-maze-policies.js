'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({});
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

vm.runInContext(read('engine.js'), context);
const analysis = read('analysis.js');
const fixedDataStart = analysis.indexOf('var FIXED_MAZE_NODES=');
const fixedDataEnd = analysis.indexOf('function fixedMazeKey', fixedDataStart);
if (fixedDataStart < 0 || fixedDataEnd <= fixedDataStart) {
  throw new Error('Saved Laiban grid data could not be located in analysis.js.');
}
vm.runInContext(analysis.slice(fixedDataStart, fixedDataEnd), context);
vm.runInContext(read('maze-routing.js'), context);
vm.runInContext(read('maze-scenarios.js'), context);

const api = context.MazeRouting;
const outputDirectory = path.join(root, 'policies');
fs.mkdirSync(outputDirectory, {recursive: true});

for (const config of context.MazeComparisonData.scenarios()) {
  const models = api.modelsFor(config.seed);
  const trainingLog = {
    standardSteps: [],
    modqlSteps: [],
    standardReward: [],
    modqlReward: []
  };
  const startedAt = Date.now();
  for (let episode = 0; episode < api.parameters.episodes; episode++) {
    const seed = (config.seed + 1000 + episode * 7919) >>> 0;
    const pair = api.trainEpisode(new api.World(config, seed), models);
    trainingLog.standardSteps.push(pair.runs.standard.steps);
    trainingLog.modqlSteps.push(pair.runs.modql.steps);
    trainingLog.standardReward.push(pair.runs.standard.reward);
    trainingLog.modqlReward.push(pair.runs.modql.reward);
  }
  const policy = api.policyFor(models, {
    scenarioId: config.id,
    seed: config.seed,
    trainedAt: new Date().toISOString(),
    episodes: api.parameters.episodes
  }, trainingLog);
  const output = path.join(outputDirectory, config.id + '.json');
  fs.writeFileSync(output, JSON.stringify(policy));
  console.log(config.name + ': generated ' + path.relative(root, output) +
    ' in ' + ((Date.now() - startedAt) / 1000).toFixed(1) + 's');
}
