/* Fixed Maze Comparison scenarios and centralized SOP wording. */
var MazeComparisonData = (function () {
  'use strict';
  var SOP = [
    {
      id: 1,
      title: 'Reward & Service Performance',
      question: 'How effectively does the algorithm serve communities?',
      objective: 'Objective wording pending',
      standard: 'Standard Q-Learning uses one scalar travel-time reward, so learner coverage and service fairness are not represented together in its objective.',
      modql: 'Enhanced MODQL combines normalized destination demand, projected Jain fairness, and travel-time efficiency in its reward.',
      metrics: ['learners', 'coveragePercent', 'fairness', 'travelMinutes', 'destinationsServed', 'deferredCommunities']
    },
    {
      id: 2,
      title: 'Decision Value & Stability',
      question: 'How reliable and consistent are the estimated decision values?',
      objective: 'Objective wording pending',
      standard: 'Standard Q-Learning selects and evaluates with the same Q-table and maximum next-action estimate, which can overestimate action values.',
      modql: 'Double Q-Learning separates action selection and evaluation across Q1 and Q2; their difference is reported as an agreement diagnostic, not proof of bias reduction.',
      metrics: ['qEstimate', 'q1Estimate', 'q2Estimate', 'estimatorDifference', 'estimateReturnGap']
    },
    {
      id: 3,
      title: 'Routing Awareness',
      question: 'What information is considered when choosing the next destination?',
      objective: 'Objective wording pending',
      standard: 'Standard Q-Learning encodes only the agent location. Demand, remaining time, visit history, and road accessibility remain environment-only values.',
      modql: 'Enhanced MODQL encodes location, demand, remaining service time, visit history, and two-level road accessibility (reachable or unreachable).',
      metrics: ['learners', 'coveragePercent', 'fairness', 'deferredCommunities', 'state']
    }
  ];

  function site(id, name, letter, position, demand, initialVisits, lastVisitDays) {
    return {
      id: id,
      name: name,
      letter: letter,
      position: position,
      demand: demand,
      initialVisits: initialVisits,
      lastVisitDays: lastVisitDays
    };
  }
  function basic(id, seed, name, obstacles, sites) {
    return {
      id: id,
      seed: seed,
      name: name,
      size: 10,
      start: [0, 0],
      sites: sites,
      obstacles: [],
      obstacleRatio: obstacles ? 0.24 : 0,
      ensureConnected: !!obstacles,
      budgetMinutes: 120,
      serviceMinutes: 10,
      maxSteps: 180,
      defaultCellMinutes: 1,
      dynamicFrequency: 0,
      dynamicKind: 'grid',
      description: obstacles ? 'Static obstacles; one service target.' : 'Plain grid; one service target.'
    };
  }
  function laiban() {
    if (typeof N === 'undefined' || typeof EDGES === 'undefined' ||
        typeof FIXED_MAZE_NODES === 'undefined' || typeof FIXED_MAZE_EDGES === 'undefined' ||
        typeof accA !== 'function' || typeof edgeMin !== 'function') {
      throw new Error('Laiban scenario data is unavailable; load engine.js and analysis.js first.');
    }
    var sites = [], cells = new Set(), overlayCandidates = [], minuteTotals = {}, minuteCounts = {};
    var closedRoads = [], nodeIds = SERVICE_IDS.slice();
    nodeIds.forEach(function (id, index) {
      var node = N[id], point = FIXED_MAZE_NODES[id];
      if (!node || !point) throw new Error('Missing saved Laiban node mapping for ' + id + '.');
      sites.push(site(id, node.name.replace(/^Sitio /, ''), String.fromCharCode(65 + index),
        point.slice(), node.learners, node.visits30, node.days));
      cells.add(point.join(','));
    });
    cells.add(FIXED_MAZE_NODES.hub.join(','));
    var previousRainfall = WX.mm;
    WX.mm = 38;
    try {
      EDGES.forEach(function (edge) {
        var path = FIXED_MAZE_EDGES[edge.key];
        if (!path) throw new Error('Missing schematic corridor for Laiban road ' + edge.key + '.');
        if (accA(edge) < 0.20) {
          closedRoads.push({
            id: edge.key,
            name: N[edge.a].name + ' – ' + N[edge.b].name,
            reason: typeof accessibilityReason === 'function' ? accessibilityReason(edge) : 'Closed at the saved accessibility threshold'
          });
          return;
        }
        var ordered = path.map(function (point) { return point.slice(); });
        var start = FIXED_MAZE_NODES[edge.a];
        if (ordered[0].join(',') !== start.join(',')) ordered.reverse();
        var perCellMinutes = edgeMin(edge) / Math.max(ordered.length - 1, 1);
        ordered.forEach(function (point, index) {
          var cell = point.join(',');
          cells.add(cell);
          if (index) {
            minuteTotals[cell] = (minuteTotals[cell] || 0) + perCellMinutes;
            minuteCounts[cell] = (minuteCounts[cell] || 0) + 1;
          }
        });
      });
    } finally {
      WX.mm = previousRainfall;
    }
    var cellMinutes = {};
    Object.keys(minuteTotals).forEach(function (cell) {
      cellMinutes[cell] = minuteTotals[cell] / minuteCounts[cell];
    });
    cells.forEach(function (cell) {
      var point = cell.split(',').map(Number);
      if (cell !== FIXED_MAZE_NODES.hub.join(',') &&
          !sites.some(function (target) { return target.position.join(',') === cell; })) {
        overlayCandidates.push(point);
      }
    });
    return {
      id: 'tab-4',
      seed: 404,
      name: 'Laiban Case',
      size: 10,
      start: FIXED_MAZE_NODES.hub.slice(),
      sites: sites,
      openCells: Array.from(cells).map(function (cell) { return cell.split(',').map(Number); }),
      cellMinutes: cellMinutes,
      defaultCellMinutes: 5,
      budgetMinutes: SHIFT_MIN,
      serviceMinutes: SERVICE_MIN_PER_STOP,
      maxSteps: 1000,
      dynamicFrequency: 20,
      dynamicKind: 'laiban',
      overlayCandidates: overlayCandidates,
      closedRoads: closedRoads,
      rainfallMm: 38,
      simulated: true,
      description: 'Saved Laiban node values and road closures; temporary obstacles are simulated overlays.'
    };
  }
  function getScenarios() {
    return [
      basic('tab-1', 101, 'Basic Grid', false, [
        site('goal', 'Target', 'T', [9, 9], 40, 0, 30)
      ]),
      basic('tab-2', 202, 'Obstacles', true, [
        site('goal', 'Target', 'T', [9, 9], 40, 0, 30)
      ]),
      Object.assign(basic('tab-3', 303, 'Multi-Target', true, [
        site('a', 'Community A', 'A', [1, 8], 18, 0, 30),
        site('b', 'Community B', 'B', [3, 2], 30, 1, 21),
        site('c', 'Community C', 'C', [5, 8], 22, 0, 25),
        site('d', 'Community D', 'D', [7, 1], 28, 1, 16),
        site('e', 'Community E', 'E', [8, 8], 16, 0, 30),
        site('f', 'Community F', 'F', [2, 5], 24, 0, 19)
      ]), {dynamicFrequency: 20, description: 'Multiple service targets; obstacles change every 20 shared ticks.'}),
      laiban()
    ];
  }
  return {
    sops: SOP,
    scenarios: getScenarios
  };
})();
