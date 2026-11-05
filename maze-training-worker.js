'use strict';

importScripts('maze-routing.js');
importScripts('maze-scenarios.js');

self.onmessage = function (event) {
  var config = event.data.config;
  var models = MazeRouting.modelsFor(config.seed);
  var trainingLog = {
    standardSteps: [],
    modqlSteps: [],
    standardReward: [],
    modqlReward: [],
    standardCompleted: [],
    modqlCompleted: []
  };
  var episode = 0;

  function trainChunk() {
    try {
      var end = Math.min(episode + 50, MazeRouting.parameters.episodes);
      while (episode < end) {
        var trainingSeed = (config.seed + 1000 + episode * 7919) >>> 0;
        var trainingConfig = Object.assign({}, config, {
          start: MazeComparisonData.trainingStart(config, models.scenarioRandom)
        });
        var pair = MazeRouting.trainEpisode(new MazeRouting.World(trainingConfig, trainingSeed), models);
        trainingLog.standardSteps.push(pair.runs.standard.steps);
        trainingLog.modqlSteps.push(pair.runs.modql.steps);
        trainingLog.standardReward.push(pair.runs.standard.reward);
        trainingLog.modqlReward.push(pair.runs.modql.reward);
        trainingLog.standardCompleted.push(pair.runs.standard.success);
        trainingLog.modqlCompleted.push(pair.runs.modql.success);
        episode++;
      }
      self.postMessage({type: 'progress', episodes: episode});
      if (episode < MazeRouting.parameters.episodes) {
        setTimeout(trainChunk, 0);
        return;
      }
      self.postMessage({
        type: 'complete',
        policy: MazeRouting.policyFor(models, {
          scenarioId: config.id,
          seed: config.seed,
          trainedAt: new Date().toISOString(),
          episodes: episode
        }, trainingLog)
      });
    } catch (error) {
      self.postMessage({type: 'error', message: error.message});
    }
  }

  trainChunk();
};
