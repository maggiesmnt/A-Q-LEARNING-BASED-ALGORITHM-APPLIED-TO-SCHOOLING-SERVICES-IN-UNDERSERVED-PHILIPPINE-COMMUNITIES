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
  var LAIBAN_GRID_TILES = [
    '.........o',
    '.o...###..',
    '.r..oxxr..',
    'or....or..',
    'r..#......',
    '#..#o...ox',
    '#..#r.#r##',
    '#orrrx#.r#',
    '.r..xxx.rx',
    '####x.xor.'
  ];
  var LAIBAN_SITE_CELLS = {
    A: [1, 9],
    B: [6, 5],
    C: [8, 1],
    D: [4, 9],
    E: [9, 5],
    F: [5, 1],
    G: [3, 3],
    H: [7, 7],
    I: [9, 9]
  };

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
  function fixedTabTwoLayout() {
    return [
      '........#.',
      '#......##.',
      '..#..#..#.',
      '.#.##.....',
      '#...#.##..',
      '#.#....#.#',
      '....##.#..',
      '##...##.##',
      '.#.#.....#',
      '....##....'
    ];
  }
  function fixedTabTwoObstacles() {
    var obstacles = [];
    fixedTabTwoLayout().forEach(function (row, rowIndex) {
      Array.from(row).forEach(function (cell, columnIndex) {
        if (cell === '#') obstacles.push([rowIndex, columnIndex]);
      });
    });
    return obstacles;
  }
  function fixedTabThreeObstacles() {
    return [
      [0, 2], [1, 5], [2, 0], [3, 0], [3, 5], [3, 6], [3, 7], [3, 9],
      [4, 3], [4, 4], [4, 8], [4, 9], [5, 0], [5, 1], [5, 6], [6, 0],
      [6, 1], [6, 5], [6, 8], [7, 6], [7, 9], [9, 3], [9, 4], [9, 6]
    ];
  }
  function tabTwoStartCells(config) {
    var blocked = new Set((config.obstacles || []).map(function (point) { return point.join(','); }));
    var targets = new Set(config.sites.map(function (target) { return target.position.join(','); }));
    var cells = [];
    for (var row = 0; row < config.size; row++) {
      for (var column = 0; column < config.size; column++) {
        var cell = row + ',' + column;
        if (!blocked.has(cell) && !targets.has(cell)) cells.push([row, column]);
      }
    }
    return cells;
  }
  function trainingStart(config, random) {
    if (config.id !== 'tab-2') return config.start.slice();
    var cells = tabTwoStartCells(config);
    if (!cells.length) throw new Error('No open non-target Tab 2 training starts are available.');
    return cells[Math.floor(random() * cells.length)].slice();
  }
  function laiban() {
    if (typeof N === 'undefined' || typeof EDGES === 'undefined' ||
        typeof COMPARISON_GRID_ROAD_WAYPOINTS === 'undefined' ||
        typeof COMPARISON_GRID_HAZARD_POINTS === 'undefined' ||
        typeof accA !== 'function' || typeof edgeMin !== 'function') {
      throw new Error('Laiban scenario data is unavailable; load engine.js and analysis.js first.');
    }
    var sites = [], overlayCandidates = [], minuteTotals = {}, minuteCounts = {};
    var openCells = [], obstacles = [], roadTiles = {}, hazardTiles = {}, nodeIds = SERVICE_IDS.slice();
    nodeIds.forEach(function (id, index) {
      var node = N[id], letter = String.fromCharCode(65 + index);
      var point = LAIBAN_SITE_CELLS[letter];
      if (!node || !point) throw new Error('Missing Laiban grid position for sitio ' + letter + '.');
      sites.push(site(id, node.name.replace(/^Sitio /, ''), String.fromCharCode(65 + index),
        point.slice(), node.learners, node.visits30, node.days));
    });
    var hub = [0, 0];
    var previousRainfall = WX.mm;
    WX.mm = 38;
    try {
      EDGES.forEach(function (edge) {
        var roadKey = ek(edge.a, edge.b);
        var waypoints = COMPARISON_GRID_ROAD_WAYPOINTS[roadKey];
        if (!waypoints) throw new Error('Missing saved schematic corridor for Laiban road ' + roadKey + '.');
        var path = [[waypoints[0][1], waypoints[0][0]]];
        for (var pointIndex = 1; pointIndex < waypoints.length; pointIndex++) {
          var from = waypoints[pointIndex - 1], to = waypoints[pointIndex];
          var x = from[0], y = from[1];
          while (x !== to[0]) {
            x += x < to[0] ? 1 : -1;
            path.push([y, x]);
          }
          while (y !== to[1]) {
            y += y < to[1] ? 1 : -1;
            path.push([y, x]);
          }
        }
        var access = accA(edge), status = band(access).k;
        var perCellMinutes = edgeMin(edge) / Math.max(path.length - 1, 1);
        path.forEach(function (point, index) {
          var cell = point.join(',');
          if (index) {
            if (access >= 0.20) {
              minuteTotals[cell] = (minuteTotals[cell] || 0) + perCellMinutes;
              minuteCounts[cell] = (minuteCounts[cell] || 0) + 1;
            }
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
    LAIBAN_GRID_TILES.forEach(function (row, rowIndex) {
      Array.from(row).forEach(function (tile, colIndex) {
        var cell = rowIndex + ',' + colIndex, point = [rowIndex, colIndex];
        var status = tile === '.' ? 'open' : tile === 'r' || tile === 'o' ? 'rest' :
          tile === 'x' ? 'cls' : null;
        if (status) roadTiles[cell] = {status: status};
        if (tile === 'o') hazardTiles[cell] = 'rest';
        if (tile === '.' || tile === 'r' || tile === 'o') openCells.push(point);
        else obstacles.push(point);
        if (tile === '.' || tile === 'r') overlayCandidates.push(point);
      });
    });
    overlayCandidates = overlayCandidates.filter(function (point) {
      var cell = point.join(',');
      return cell !== hub.join(',') && !sites.some(function (target) {
        return target.position.join(',') === cell;
      });
    });
    return {
      id: 'tab-4',
      seed: 404,
      name: 'Laiban Case',
      size: 10,
      start: hub,
      sites: sites,
      gridTiles: LAIBAN_GRID_TILES.slice(),
      openCells: openCells,
      obstacles: obstacles,
      cellMinutes: cellMinutes,
      roadTiles: roadTiles,
      hazardTiles: hazardTiles,
      defaultCellMinutes: 5,
      budgetMinutes: SHIFT_MIN,
      serviceMinutes: SERVICE_MIN_PER_STOP,
      maxSteps: 1000,
      dynamicFrequency: 20,
      dynamicKind: 'laiban',
      overlayCandidates: overlayCandidates,
      closedRoads: [],
      rainfallMm: 38,
      simulated: true,
      description: 'Fixed 10×10 Laiban schematic grid with simulated learner allocations and temporary obstacles.'
    };
  }
  function getScenarios() {
    var tabThree = basic('tab-3', 303, 'Multi-Target', true, [
      site('a', 'Community A', 'A', [1, 8], 18, 0, 30),
      site('b', 'Community B', 'B', [3, 2], 30, 1, 21),
      site('c', 'Community C', 'C', [5, 8], 22, 0, 25),
      site('d', 'Community D', 'D', [7, 1], 28, 1, 16),
      site('e', 'Community E', 'E', [8, 8], 16, 0, 30),
      site('f', 'Community F', 'F', [2, 5], 24, 0, 19)
    ]);
    tabThree.obstacles = fixedTabThreeObstacles();
    tabThree.obstacleRatio = 0;
    tabThree.dynamicFrequency = 0;
    tabThree.description = 'Fixed seed-303 obstacle layout shared by training and evaluation.';
    return [
      basic('tab-1', 101, 'Basic Grid', false, [
        site('goal', 'Target', 'T', [9, 9], 40, 0, 30)
      ]),
      Object.assign(basic('tab-2', 202, 'Obstacles', false, [
        site('goal', 'Target', 'T', [9, 9], 40, 0, 30)
      ]), {
        obstacles: fixedTabTwoObstacles(),
        description: 'Fixed randomly placed obstacle blocks with multiple routes to one target.'
      }),
      tabThree,
      laiban()
    ];
  }
  return {
    sops: SOP,
    scenarios: getScenarios,
    tabTwoStartCells: tabTwoStartCells,
    trainingStart: trainingStart
  };
})();
