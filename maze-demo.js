/* Live, paired comparison of Standard Q-Learning and Enhanced MODQL. */
(function () {
  'use strict';
  var EPISODES = MazeRouting.parameters.episodes;
  var BATCH_SIZE = MazeRouting.parameters.heldOutScenarios;
  var METRICS = [
    {key: 'learners', label: 'Learners served', better: 'higher'},
    {key: 'coveragePercent', label: 'Learner coverage', better: 'higher', percent: true},
    {key: 'fairness', label: "Jain's Fairness Index", better: 'higher', decimals: 4},
    {key: 'travelMinutes', label: 'Travel time', better: 'lower', time: true},
    {key: 'movementSteps', label: 'Movement steps', better: 'lower'},
    {key: 'destinationsServed', label: 'Destinations served', better: 'higher', destinations: true},
    {key: 'deferredCommunities', label: 'Deferred communities', better: 'lower'},
    {key: 'completionStatus', label: 'Completion status', status: true},
    {key: 'qEstimate', label: 'Selected action Q estimate', diagnostic: true},
    {key: 'q1Estimate', label: 'Q1 estimate', diagnostic: true},
    {key: 'q2Estimate', label: 'Q2 estimate', diagnostic: true},
    {key: 'estimatorDifference', label: 'Absolute Q1–Q2 difference', diagnostic: true},
    {key: 'estimateReturnGap', label: 'Estimate–observed return gap', diagnostic: true},
    {key: 'state', label: 'State fields at last decision', diagnostic: true}
  ];
  var BATCH_METRICS = [
    {key: 'learners', label: 'Learners served', decimals: 2},
    {key: 'coveragePercent', label: 'Learner coverage (%)', decimals: 2},
    {key: 'fairness', label: "Jain's Fairness Index", decimals: 4},
    {key: 'travelMinutes', label: 'Travel time (minutes)', decimals: 2},
    {key: 'movementSteps', label: 'Movement steps', decimals: 2},
    {key: 'destinationsServed', label: 'Destinations served', decimals: 2},
    {key: 'deferredCommunities', label: 'Deferred communities', decimals: 2},
    {key: 'completed', label: 'Completion rate (%)', decimals: 2, percent: true},
    {key: 'loopDetected', label: 'Loop rate (%)', decimals: 2, percent: true}
  ];
  var root, scenarioSelector, states = [], activeIndex = 0, selectedTravelUnit = 'minutes';
  var timer = null, speed = 200, batchSequence = 0;

  function byId(id) { return document.getElementById(id); }
  function setText(node, value) { if (node) node.textContent = value; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char];
    });
  }
  function cloneConfig(config) { return JSON.parse(JSON.stringify(config)); }
  function seedFor(config, offset) { return (config.seed + offset) >>> 0; }
  function activeState() { return states[activeIndex]; }
  function isDynamic(state) { return state.config.dynamicFrequency > 0; }

  function createState(config, index) {
    var state = {
      index: index,
      config: cloneConfig(config),
      models: null,
      policyMetadata: null,
      trainingLog: null,
      loading: false,
      loadError: null,
      training: false,
      trainingProgress: 0,
      trainingToken: 0,
      worker: null,
      env: null,
      pair: null,
      sop: 1,
      batch: {running: false, progress: 0, result: null, token: 0}
    };
    resetEvaluation(state);
    return state;
  }
  function resetEvaluation(state) {
    state.env = new MazeRouting.World(state.config, state.config.seed);
    state.pair = state.models ? new MazeRouting.Pair(state.env, state.models, false) : null;
  }
  function beginEvaluation(state) {
    state.env = new MazeRouting.World(state.config, state.config.seed);
    state.pair = new MazeRouting.Pair(state.env, state.models, false);
    renderState(state);
  }
  function ensurePolicy(state) {
    if (state.models || state.loading) return;
    state.loading = true;
    state.loadError = null;
    renderState(state);
    fetch('policies/' + encodeURIComponent(state.config.id) + '.json')
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' loading the trained policy.');
        return response.json();
      })
      .then(function (policy) {
        state.models = MazeRouting.modelsFromPolicy(policy, state.config.id, state.config.seed);
        state.policyMetadata = policy;
        state.trainingLog = policy.trainingLog;
        state.loading = false;
        resetEvaluation(state);
        renderState(state);
      })
      .catch(function (error) {
        state.loading = false;
        state.loadError = error.message;
        renderState(state);
        setStatus(state, 'Trained policy could not be loaded: ' + error.message, true);
      });
  }

  function stopTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }
  function allDone(state) { return !!state.pair && state.pair.done(); }
  function stepState(state) {
    if (!state.pair || state.training || allDone(state)) return;
    state.pair.step();
    renderState(state);
    if (allDone(state) && state === activeState()) {
      stopTimer();
      renderState(state);
    }
  }
  function startTimer() {
    if (timer !== null) return;
    timer = window.setInterval(function () { stepState(activeState()); }, speed);
    renderState(activeState());
  }
  function startComparison(state) {
    if (state.training || !state.models) return;
    if (!state.pair || allDone(state)) beginEvaluation(state);
    if (state === activeState()) startTimer();
  }
  function advanceOneStep(state) {
    if (state.training || !state.models) return;
    if (!state.pair || allDone(state)) beginEvaluation(state);
    stepState(state);
  }
  function resetComparison(state) {
    if (state === activeState()) stopTimer();
    state.trainingToken++;
    if (state.worker) state.worker.terminate();
    state.worker = null;
    state.training = false;
    state.trainingProgress = 0;
    resetEvaluation(state);
    renderState(state);
  }

  function trainPolicies(state) {
    if (state.training || state.loading) return;
    if (state === activeState()) stopTimer();
    state.training = true;
    state.trainingProgress = 0;
    state.trainingToken++;
    var token = state.trainingToken;
    var previousModels = state.models;
    var previousMetadata = state.policyMetadata;
    var previousLog = state.trainingLog;
    resetEvaluation(state);
    state.batch.result = null;
    renderState(state);
    if (typeof Worker === 'undefined') {
      state.training = false;
      state.models = previousModels;
      state.policyMetadata = previousMetadata;
      state.trainingLog = previousLog;
      renderState(state);
      setStatus(state, 'Retraining failed: Web Workers are unavailable in this browser.', true);
      return;
    }
    var worker;
    try {
      worker = new Worker('maze-training-worker.js');
      state.worker = worker;
      worker.onmessage = function (event) {
        if (token !== state.trainingToken || !state.training) return;
        var message = event.data;
        if (message.type === 'progress') {
          state.trainingProgress = message.episodes;
          renderTrainingProgress(state);
          return;
        }
        if (message.type === 'error') {
          failTraining(new Error(message.message));
          return;
        }
        if (message.type === 'complete') {
          try {
            state.models = MazeRouting.modelsFromPolicy(message.policy, state.config.id, state.config.seed);
            state.policyMetadata = message.policy;
            state.trainingLog = message.policy.trainingLog;
            state.training = false;
            state.worker = null;
            worker.terminate();
            resetEvaluation(state);
            renderState(state);
            setStatus(state, 'Retraining complete. New policy loaded; evaluation results remain unavailable until a run starts.', false);
          } catch (error) {
            failTraining(error);
          }
        }
      };
      worker.onerror = function (event) {
        event.preventDefault();
        failTraining(new Error(event.message || 'The training worker failed.'));
      };
      worker.postMessage({config: state.config});
    } catch (error) {
      failTraining(error);
    }

    function failTraining(error) {
      if (state.worker) state.worker.terminate();
      state.worker = null;
      state.training = false;
      state.models = previousModels;
      state.policyMetadata = previousMetadata;
      state.trainingLog = previousLog;
      resetEvaluation(state);
      renderState(state);
      setStatus(state, 'Retraining failed: ' + error.message, true);
    }
  }

  function readMetrics(state, id) {
    if (!state.pair) return null;
    return MazeRouting.metrics(state.pair.runs[id], state.env);
  }
  function number(value, digits) {
    return Number.isFinite(value) ? value.toFixed(digits === undefined ? 1 : digits) : '—';
  }
  function formatTime(minutes) {
    return selectedTravelUnit === 'hours'
      ? number(minutes / 60, 2) + ' hr'
      : number(minutes, 1).replace(/\.0$/, '') + ' min';
  }
  function formatMetric(metric, record, state, id) {
    if (!record) return 'Not run yet';
    var value = record[metric.key];
    if (metric.key === 'completionStatus') return value || 'In progress';
    if (metric.key === 'state') {
      if (value === null) return 'Not available';
      return id === 'standard' ? 'Location only: ' + value : value;
    }
    if (metric.key === 'q1Estimate' || metric.key === 'q2Estimate' || metric.key === 'estimatorDifference') {
      if (id === 'standard') return 'Not applicable';
      if (value === null) return 'Not sampled';
    }
    if (metric.key === 'estimateReturnGap' && value === null) {
      return record.completed || record.completionStatus !== 'In progress' ? 'Not available' : 'Available after completion';
    }
    if (metric.diagnostic && value === null) return 'Not sampled';
    if (metric.key === 'qEstimate' || metric.diagnostic) return number(value, 4);
    if (metric.time) return formatTime(value);
    if (metric.percent) return number(value, 1) + '%';
    if (metric.destinations) return value + ' / ' + state.config.sites.length;
    return metric.decimals !== undefined ? number(value, metric.decimals) : String(value);
  }
  function comparisonText(metric, standard, modql) {
    if (!standard || !modql) return 'Not run yet';
    if (metric.diagnostic) return 'Diagnostic only; not ranked';
    if (metric.status) {
      if (standard.completionStatus === 'In progress' || modql.completionStatus === 'In progress') {
        return standard.completionStatus === modql.completionStatus ? 'In progress' : 'One run in progress';
      }
      if (standard.completed === modql.completed) return standard.completed ? 'Both completed' : 'Neither completed';
      return standard.completed ? 'Standard completed; MODQL did not' : 'MODQL completed; Standard did not';
    }
    var a = standard[metric.key], b = modql[metric.key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Not available';
    if (Math.abs(a - b) < 1e-9) return 'Tie';
    var favored = metric.better === 'higher' ? (a > b ? 'Standard' : 'MODQL') : (a < b ? 'Standard' : 'MODQL');
    return 'Favors ' + favored;
  }
  function setStatus(state, message, error) {
    var panel = panelFor(state);
    var node = panel && panel.querySelector('.maze-status-message');
    if (node) {
      node.textContent = message;
      node.setAttribute('data-error', error ? 'true' : 'false');
    }
  }
  function panelFor(state) { return root.querySelector('[data-scenario-panel="' + state.index + '"]'); }

  function trainingLabel(state, id) {
    if (state.training) return 'Training... ' + state.trainingProgress + ' / ' + EPISODES + ' episodes';
    if (state.loading) return 'Loading trained policy...';
    if (!state.models) return state.loadError ? 'Policy unavailable' : 'Trained policy pending';
    return 'Trained: ' + state.policyMetadata.episodes.toLocaleString('en-US') + ' episodes, seed ' + state.policyMetadata.seed +
      ', ' + state.policyMetadata.trainedAt;
  }
  function renderTrainingProgress(state) {
    var panel = panelFor(state);
    if (!panel) return;
    ['standard', 'modql'].forEach(function (id) {
      var badge = panel.querySelector('[data-training="' + id + '"]');
      var detail = panel.querySelector('[data-training-detail="' + id + '"]');
      if (badge) badge.textContent = 'Training...';
      if (detail) detail.textContent = trainingLabel(state, id);
    });
    var progress = panel.querySelector('[data-training-progress]');
    if (progress) {
      progress.hidden = false;
      progress.value = state.trainingProgress;
    }
    var runButton = panel.querySelector('[data-action="run"]');
    if (runButton) runButton.disabled = true;
    panel.querySelector('[data-action="step"]').disabled = true;
    panel.querySelector('[data-action="train"]').disabled = true;
    setStatus(state, 'Retraining both policies in a background worker; no evaluation is running.', false);
  }
  function buildMetricRows() {
    return METRICS.map(function (metric) {
      return '<tr data-metric="' + metric.key + '"><th scope="row">' + escapeHtml(metric.label) +
        '<span class="shared-maze-direction">' + (metric.better ? 'Prefer ' + metric.better : 'Report only') +
        '</span></th><td data-result="standard" data-key="' + metric.key + '">Not run yet</td>' +
        '<td data-result="modql" data-key="' + metric.key + '">Not run yet</td>' +
        '<td data-assessment="' + metric.key + '">Not run yet</td></tr>';
    }).join('');
  }
  function buildTab(state) {
    var config = state.config;
    var scope = config.id;
    var dynamicCounters = isDynamic(state)
      ? '<span class="maze-dynamic-counters">Shared tick <b data-dynamic="tick">0</b> · obstacle updates <b data-dynamic="updates">0</b></span>'
      : '';
    var roadDisclaimer = config.simulated
      ? '<p class="maze-disclaimer">Simulated, not verified field data. Rainfall, allocated sitio demand and visit history are scenario inputs; the temporary-obstacle overlay is simulated and does not change saved road closures.</p>'
      : '';
    var batchProtocolNote = config.id === 'tab-2'
      ? '<p>Obstacles batch protocol: same fixed obstacle layout; start cycles row-major through the 75 open non-target cells. Both policies share each start.</p>'
      : '';
    var closed = config.closedRoads && config.closedRoads.length
      ? '<details class="maze-closed-roads"><summary>Saved closed roads (' + config.closedRoads.length + ')</summary><ul>' +
        config.closedRoads.map(function (road) { return '<li>' + escapeHtml(road.name) + ': ' + escapeHtml(road.reason) + '</li>'; }).join('') +
        '</ul></details>'
      : '';
    var sopButtons = MazeComparisonData.sops.map(function (sop) {
      return '<button type="button" class="btn g" data-sop="' + sop.id + '" aria-pressed="' +
        (sop.id === state.sop ? 'true' : 'false') + '">SOP ' + sop.id + '</button>';
    }).join('');
    return '<section class="maze-scenario-panel" data-scenario-panel="' + state.index + '" ' +
      (state.index === activeIndex ? '' : 'hidden') + '>' +
      '<div class="maze-scenario-overview"><div><h2>' + escapeHtml(config.name) + '</h2><p>' +
      escapeHtml(config.description) + '</p></div><div class="maze-seed-meta"><span>Fixed seed</span><b>' +
      config.seed + '</b></div></div>' +
      '<details class="shared-maze-setup-shell"><summary>Scenario &amp; policy preparation' +
      '<span>Seed ' + config.seed + ' · Equal training budgets</span></summary><div class="maze-training-info">' +
      '<b>5,000 training episodes each, equal budget</b><span>Alpha 0.10 · Gamma 0.90 · Epsilon 1.00 → 0.05 (0.995 decay)</span>' +
      '<span>Same scenario, start, targets, obstacles and seed for both policies.</span></div></details>' +
      '<div class="shared-maze-controls">' +
      '<button type="button" class="btn p" data-action="run">Start Comparison</button>' +
      '<button type="button" class="btn g" data-action="reset">Reset</button>' +
      '<button type="button" class="btn g" data-action="step">Advance One Step</button>' +
      '<button type="button" class="btn g" data-action="train">Retrain from scratch</button>' +
      '<label>Simulation speed <select data-action="speed"><option value="800">0.25×</option><option value="400">0.5×</option><option value="200" selected>1×</option><option value="100">2×</option><option value="50">4×</option></select></label>' +
      '<label>Travel time units <select data-action="unit"><option value="minutes" selected>Minutes</option><option value="hours">Hours</option></select></label>' +
      dynamicCounters + '</div>' +
      '<progress class="maze-training-progress" data-training-progress max="' + EPISODES + '" value="0" hidden></progress>' +
      '<p class="maze-status-message" role="status">Results are not available until a run starts.</p>' +
      (config.rainfallMm !== undefined ? '<p class="maze-laiban-inputs">Rainfall: ' + config.rainfallMm +
        ' mm/24h · Service window: ' + config.budgetMinutes + ' minutes · Service stop: ' + config.serviceMinutes +
        ' minutes · Start: ALS Hub</p>' : '') + roadDisclaimer + closed +
      '<div class="shared-maze-legend"><span><i class="legend-route standard"></i>Standard route</span>' +
      '<span><i class="legend-route modql"></i>MODQL route</span><span><i class="legend-wall"></i>Obstacle / closed road</span>' +
      '<span><i class="legend-goal"></i>Service target</span></div>' +
      '<div class="shared-maze-panels">' + ['standard', 'modql'].map(function (id) {
        var title = id === 'standard' ? 'Standard Q-Learning' : 'Enhanced MODQL';
        var name = id === 'standard' ? 'Standard' : 'MODQL';
        return '<section class="shared-maze-panel" data-agent="' + id + '"><header class="shared-maze-panel-header">' +
          '<div><span class="shared-maze-eyebrow">' + (id === 'standard' ? 'Existing algorithm' : 'Proposed algorithm') +
          '</span><h3>' + title + '</h3></div><span class="shared-maze-panel-badge" data-training="' + id + '">' +
          'Not trained</span></header><div class="maze-training-indicator" data-training-detail="' + id + '">' +
          trainingLabel(state, id) + '</div>' +
          (id === 'standard' ? '<p class="maze-agent-description">Standard Q-Learning explores randomly during training; evaluation follows the learned policy (epsilon = 0).</p>' : '') +
          '<div class="maze-agent-status" data-status="' + id + '">Not run yet</div>' +
          '<span class="maze-loop-status" data-loop-status="' + id + '" hidden>Loop detected: learned policy repeats the same moves.</span>' +
          '<div class="shared-maze-board"><canvas width="500" height="500" data-canvas="' + id +
          '" role="img" aria-label="' + title + ' route in the ' + escapeHtml(config.name) + ' scenario"></canvas></div>' +
          '<details class="maze-policy-inputs"><summary>Policy inputs</summary><div data-environment="' + id +
          '"></div><p class="maze-state-encoding">' + (id === 'standard'
            ? 'State encoding: current grid location only (L).'
            : 'Research state encoding: location (L), two-level demand buckets (D), remaining-time bucket (T), visit-history buckets (H), and two-level road accessibility (A: reachable or unreachable).') +
          '</p></details><div class="maze-training-curve"><span>Training log · steps per episode</span>' +
          '<canvas width="320" height="72" data-curve="' + id + '" role="img" aria-label="' + title +
          ' training log, steps per episode"></canvas></div>' +
          '<p class="maze-agent-live" data-live="' + id + '">Results: Not run yet</p></section>';
      }).join('') + '</div>' +
      '<section class="shared-maze-summary"><header><div><span class="shared-maze-eyebrow">Computed from this run</span>' +
      '<h2>Comparative Performance Results</h2></div><span class="shared-maze-summary-note">No pre-filled results</span></header>' +
      '<div class="shared-maze-table-scroll"><table><thead><tr><th>Metric</th><th>Standard Q-Learning</th>' +
      '<th>Enhanced MODQL</th><th>Metric-by-metric assessment</th></tr></thead><tbody>' + buildMetricRows() +
      '</tbody></table></div><div class="maze-assessment" data-assessment-summary>Not run yet</div></section>' +
      '<section class="maze-sop-section"><div class="maze-sop-header"><div><span class="shared-maze-eyebrow">Research objective alignment</span>' +
      '<h2>Statement of the Problem</h2></div><div class="maze-sop-buttons" role="group" aria-label="Select SOP">' +
      sopButtons + '</div></div><div data-sop-content></div></section>' +
      '<details class="maze-batch-panel"><summary>Batch evaluation · ' + escapeHtml(config.name) + ' · 200 held-out scenarios</summary>' +
      '<p>Paired scenarios are separate from the single-run view. Policies stay frozen; mean and population standard deviation are computed live for each metric. Batch numbers use this prototype&rsquo;s held-out protocol and are not comparable to Chapter 4 results.</p>' +
      batchProtocolNote +
      '<p>Basic Grid fairness is trivial because there is only one destination.</p>' +
      '<button type="button" class="btn g" data-action="batch">Run 200 Held-Out ' + escapeHtml(config.name) + ' Scenarios</button>' +
      '<p class="maze-batch-status" role="status" data-batch-status>Batch evaluation has not run.</p>' +
      '<div data-batch-results><p>Not run yet</p></div></details>' +
      '<details class="maze-limits"><summary>Simulation limits</summary><p>The 10×10 route grid is a schematic simplification of the road network. MODQL retains the thesis&rsquo;s two-level accessibility encoding (reachable or unreachable); it does not distinguish granular open, caution, or restricted road bands. Roads and temporary hazards are simulated, and Tab 4 includes unverified data disclaimers.</p></details></section>';
  }

  function renderSop(state, panel) {
    var sop = MazeComparisonData.sops[state.sop - 1];
    var content = panel.querySelector('[data-sop-content]');
    if (!content) return;
    var metricLabels = sop.metrics.map(function (key) {
      var metric = METRICS.filter(function (candidate) { return candidate.key === key; })[0];
      return metric ? metric.label : key;
    });
    content.innerHTML = '<div class="maze-sop-question"><b>SOP ' + sop.id + ': ' + escapeHtml(sop.title) +
      '</b><p>' + escapeHtml(sop.question) + '</p></div><p class="maze-sop-objective"><b>Objective:</b> ' +
      escapeHtml(sop.objective) + '</p><div class="maze-sop-comparison"><section><h3>Existing · Standard Q-Learning</h3><p>' +
      escapeHtml(sop.standard) + '</p></section><section><h3>Proposed · Enhanced MODQL</h3><p>' +
      escapeHtml(sop.modql) + '</p></section></div><p class="maze-sop-metrics"><b>Metrics that address this SOP:</b> ' +
      metricLabels.map(escapeHtml).join(' · ') + '</p>';
    panel.querySelectorAll('[data-sop]').forEach(function (button) {
      button.setAttribute('aria-pressed', Number(button.getAttribute('data-sop')) === state.sop ? 'true' : 'false');
    });
    panel.querySelectorAll('[data-metric]').forEach(function (row) {
      row.classList.toggle('maze-sop-highlight', sop.metrics.indexOf(row.getAttribute('data-metric')) >= 0);
    });
  }

  function renderAssessment(state, panel, standard, modql) {
    var summary = panel.querySelector('[data-assessment-summary]');
    if (!standard || !modql) {
      summary.textContent = state.training ? 'Training policies; no evaluation results are available.' : 'Not run yet';
      return;
    }
    var completed = allDone(state);
    summary.textContent = completed
      ? 'Metric-by-metric comparison for this simulated scenario only. No overall score or result beyond this scenario is claimed.'
      : 'Run in progress. Metric differences are descriptive only; no overall score is calculated.';
  }

  function renderResults(state, panel) {
    var standard = readMetrics(state, 'standard'), modql = readMetrics(state, 'modql');
    var started = !!state.pair && ['standard', 'modql'].some(function (id) {
      return state.pair.runs[id].didRun;
    });
    panel.querySelectorAll('tbody tr[data-metric]').forEach(function (row) {
      var metric = METRICS.filter(function (candidate) {
        return candidate.key === row.getAttribute('data-metric');
      })[0];
      var left = row.querySelector('[data-result="standard"]');
      var right = row.querySelector('[data-result="modql"]');
      var assessment = row.querySelector('[data-assessment]');
      left.textContent = started ? formatMetric(metric, standard, state, 'standard') : 'Not run yet';
      right.textContent = started ? formatMetric(metric, modql, state, 'modql') : 'Not run yet';
      assessment.textContent = started ? comparisonText(metric, standard, modql) : 'Not run yet';
      row.classList.toggle('has-difference', started && left.textContent !== right.textContent);
    });
    renderAssessment(state, panel, started ? standard : null, started ? modql : null);
    ['standard', 'modql'].forEach(function (id) {
      var run = state.pair && state.pair.runs[id];
      var live = panel.querySelector('[data-live="' + id + '"]');
      var status = panel.querySelector('[data-status="' + id + '"]');
      if (!run || !run.didRun) {
        var loopStatus = panel.querySelector('[data-loop-status="' + id + '"]');
        if (loopStatus) loopStatus.hidden = true;
        live.textContent = 'Results: Not run yet';
        status.textContent = state.training ? 'Training...' : 'Not run yet';
        return;
      }
      var metric = MazeRouting.metrics(run, state.env);
      var loopStatus = panel.querySelector('[data-loop-status="' + id + '"]');
      if (loopStatus) loopStatus.hidden = !metric.loopDetected;
      var served = metric.destinationsServed + ' / ' + metric.destinationTotal + ' destinations';
      status.textContent = run.done ? run.status : 'Running';
      live.textContent = metric.learners + ' learners (' + number(metric.coveragePercent, 1) +
        '%) · ' + served + ' · ' + number(metric.travelMinutes, 1) + ' travel minutes';
    });
  }

  function renderEnvironmentInfo(state, panel, id) {
    var node = panel.querySelector('[data-environment="' + id + '"]');
    if (!node) return;
    var run = state.pair && state.pair.runs[id];
    var remaining = run ? run.remainingMinutes : state.env.budgetMinutes;
    var reachable = state.env.reachableFrom(state.env.positions[id]);
    var label = id === 'standard'
      ? 'Environment-only values; not part of Standard state or Q updates.'
      : 'Shared inputs represented in MODQL state with the configured buckets.';
    var entries = state.env.sites.map(function (site) {
      var availability = run && run.served[site.id]
        ? 'served'
        : reachable.has(MazeRouting.key(site.position)) ? 'reachable' : 'currently blocked';
      return '<span><b>' + escapeHtml(site.letter) + '</b> ' + site.demand + ' learners · last visit ' +
        site.lastVisitDays + ' days · prior visits ' + site.initialVisits + ' · ' + availability + '</span>';
    }).join('');
    node.innerHTML = '<b>' + label + '</b><span>Remaining service time: ' +
      number(remaining, 1) + ' minutes</span><div>' + entries + '</div>';
  }

  function drawTrainingCurve(state, id) {
    var panel = panelFor(state);
    var canvas = panel && panel.querySelector('[data-curve="' + id + '"]');
    var log = state.trainingLog;
    if (!canvas || !log || !state.policyMetadata) return;
    var stamp = state.policyMetadata.trainedAt;
    if (canvas.getAttribute('data-trained-at') === stamp) return;
    canvas.setAttribute('data-trained-at', stamp);
    var values = log[id + 'Steps'];
    if (!Array.isArray(values) || !values.length) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var width = canvas.width, height = canvas.height, pad = 5;
    var minimum = Math.min.apply(null, values), maximum = Math.max.apply(null, values);
    var span = Math.max(maximum - minimum, 1);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#b7b3a5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.stroke();
    ctx.strokeStyle = id === 'standard' ? '#d88140' : '#408b5d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach(function (value, index) {
      var x = pad + index * (width - pad * 2) / Math.max(values.length - 1, 1);
      var y = height - pad - (value - minimum) * (height - pad * 2) / span;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function draw(state, id) {
    var panel = panelFor(state);
    var canvas = panel && panel.querySelector('[data-canvas="' + id + '"]');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var world = state.env, run = state.pair && state.pair.runs[id];
    var size = world.size, cell = canvas.width / size;
    var obstacles = new Set(world.obstacleCells().map(MazeRouting.key));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var rowIndex = 0; rowIndex < size; rowIndex++) {
      for (var colIndex = 0; colIndex < size; colIndex++) {
        var point = [rowIndex, colIndex], key = MazeRouting.key(point);
        ctx.fillStyle = obstacles.has(key) ? '#273129' : '#f5f2e8';
        ctx.fillRect(colIndex * cell, rowIndex * cell, cell, cell);
        ctx.strokeStyle = '#c9c4b4';
        ctx.lineWidth = 1;
        ctx.strokeRect(colIndex * cell, rowIndex * cell, cell, cell);
      }
    }
    world.sites.forEach(function (target) {
      var x = (target.position[1] + 0.5) * cell, y = (target.position[0] + 0.5) * cell;
      ctx.beginPath();
      ctx.fillStyle = run && run.served[target.id] ? '#8a8b76' : '#db9558';
      ctx.arc(x, y, cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffaf0';
      ctx.font = 'bold ' + Math.max(10, cell * 0.32) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(target.letter, x, y - cell * 0.09);
      ctx.font = 'bold ' + Math.max(7, cell * 0.15) + 'px sans-serif';
      ctx.fillText(String(target.demand), x, y + cell * 0.16);
    });
    if (run && run.trail.length) {
      ctx.beginPath();
      ctx.strokeStyle = id === 'standard' ? '#d88140' : '#408b5d';
      ctx.lineWidth = Math.max(3, cell * 0.11);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      run.trail.forEach(function (point, index) {
        var x = (point[1] + 0.5) * cell, y = (point[0] + 0.5) * cell;
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    drawTrainingCurve(state, id);
    var position = world.positions[id];
    ctx.beginPath();
    ctx.fillStyle = id === 'standard' ? '#c3652d' : '#21673d';
    ctx.arc((position[1] + 0.5) * cell, (position[0] + 0.5) * cell, cell * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function renderBatch(state, panel) {
    var resultContainer = panel.querySelector('[data-batch-results]');
    var status = panel.querySelector('[data-batch-status]');
    if (state.batch.running) {
      status.textContent = 'Evaluating paired scenarios: ' + state.batch.progress + ' / ' + BATCH_SIZE;
      return;
    }
    if (!state.batch.result) {
      status.textContent = state.models ? 'Trained policies loaded; batch evaluation has not run.' : 'Batch evaluation has not run.';
      return;
    }
    status.textContent = 'Completed live evaluation on ' + BATCH_SIZE + ' held-out paired scenarios.';
    var summary = state.batch.result;
    resultContainer.innerHTML = '<div class="shared-maze-table-scroll"><table><thead><tr><th>Metric</th>' +
      '<th>Standard mean</th><th>Standard SD</th><th>MODQL mean</th><th>MODQL SD</th></tr></thead><tbody>' +
      BATCH_METRICS.map(function (metric) {
        var a = summary.standard[metric.key], b = summary.modql[metric.key];
        var scale = metric.percent ? 100 : 1;
        return '<tr><th scope="row">' + escapeHtml(metric.label) + '</th><td>' +
          number(a.mean * scale, metric.decimals) + '</td><td>' + number(a.sd * scale, metric.decimals) +
          '</td><td>' + number(b.mean * scale, metric.decimals) + '</td><td>' +
          number(b.sd * scale, metric.decimals) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderState(state) {
    var panel = panelFor(state);
    if (!panel) return;
    var overall = root.querySelector('[data-overall]');
    if (state === activeState() && overall) {
      var hasStarted = !!state.pair && ['standard', 'modql'].some(function (id) {
        return state.pair.runs[id].didRun;
      });
      var overallStatus = state.training ? 'Training' : timer !== null ? 'Running' :
        allDone(state) && hasStarted ? 'Completed' : hasStarted ? 'Paused' : 'Not run yet';
      overall.textContent = overallStatus;
      overall.setAttribute('data-status', overallStatus.toLowerCase().replace(/ /g, '-'));
    }
    ['standard', 'modql'].forEach(function (id) {
      var badge = panel.querySelector('[data-training="' + id + '"]');
      var detail = panel.querySelector('[data-training-detail="' + id + '"]');
      var label = trainingLabel(state, id);
      if (badge) badge.textContent = state.training ? 'Training...' : state.models ? 'Trained' :
        state.loading ? 'Loading...' : 'Not loaded';
      if (detail) detail.textContent = label;
    });
    var tick = panel.querySelector('[data-dynamic="tick"]');
    var updates = panel.querySelector('[data-dynamic="updates"]');
    var speedControl = panel.querySelector('[data-action="speed"]');
    var unitControl = panel.querySelector('[data-action="unit"]');
    if (tick) tick.textContent = String(state.env.tick);
    if (updates) updates.textContent = String(state.env.obstacleUpdates);
    if (speedControl) speedControl.value = String(speed);
    if (unitControl) unitControl.value = selectedTravelUnit;
    var runButton = panel.querySelector('[data-action="run"]');
    if (runButton) {
      runButton.textContent = timer !== null && state === activeState() ? 'Pause Comparison' :
        allDone(state) && state.pair ? 'Run Again' : 'Start Comparison';
      runButton.disabled = state.training || !state.models;
    }
    panel.querySelector('[data-action="step"]').disabled = state.training || !state.models;
    panel.querySelector('[data-action="train"]').disabled = state.training || state.loading;
    panel.querySelector('[data-action="batch"]').disabled = state.batch.running || state.training || !state.models;
    var progress = panel.querySelector('[data-training-progress]');
    if (progress) {
      progress.hidden = !state.training;
      progress.value = state.trainingProgress;
    }
    renderResults(state, panel);
    renderSop(state, panel);
    renderBatch(state, panel);
    renderEnvironmentInfo(state, panel, 'standard');
    renderEnvironmentInfo(state, panel, 'modql');
    draw(state, 'standard');
    draw(state, 'modql');
  }

  function setActive(index) {
    if (index === activeIndex) return;
    stopTimer();
    activeIndex = index;
    scenarioSelector.querySelectorAll('[data-scenario-tab]').forEach(function (button, buttonIndex) {
      var selected = buttonIndex === activeIndex;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.tabIndex = 0;
    });
    states.forEach(function (state) {
      var panel = panelFor(state);
      panel.hidden = state.index !== activeIndex;
      renderState(state);
    });
    document.title = activeState().config.name + ' — Maze Comparison — Philippine Mobile Hub';
    ensurePolicy(activeState());
  }

  function summarizeBatch(records) {
    var output = {};
    BATCH_METRICS.forEach(function (metric) {
      var values = records.map(function (record) {
        return metric.key === 'completed' ? (record.completed ? 1 : 0) :
          metric.key === 'loopDetected' ? (record.loopDetected ? 1 : 0) : record[metric.key];
      });
      var mean = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
      var variance = values.reduce(function (sum, value) { return sum + Math.pow(value - mean, 2); }, 0) / values.length;
      output[metric.key] = {mean: mean, sd: Math.sqrt(variance)};
    });
    return output;
  }
  function beginBatch(state) {
    if (!state.models || state.training || state.batch.running) return;
    state.batch.running = true;
    state.batch.progress = 0;
    state.batch.result = null;
    state.batch.token = ++batchSequence;
    var token = state.batch.token, collected = {standard: [], modql: []};
    renderState(state);
    function runChunk() {
      if (!state.batch.running || state.batch.token !== token) return;
      try {
        var batchCount = 0;
        while (batchCount++ < 1 && state.batch.progress < BATCH_SIZE) {
          var index = state.batch.progress;
          var batchConfig = cloneConfig(state.config);
          if (batchConfig.id === 'tab-2') {
            var blocked = new Set(batchConfig.obstacles.map(MazeRouting.key));
            var target = MazeRouting.key(batchConfig.sites[0].position);
            var starts = [];
            for (var rowIndex = 0; rowIndex < batchConfig.size; rowIndex++) {
              for (var colIndex = 0; colIndex < batchConfig.size; colIndex++) {
                var cellKey = rowIndex + ',' + colIndex;
                if (!blocked.has(cellKey) && cellKey !== target) starts.push([rowIndex, colIndex]);
              }
            }
            if (!starts.length) throw new Error('No open start positions are available for the Tab 2 batch.');
            batchConfig.start = starts[index % starts.length];
          }
          var world = new MazeRouting.World(batchConfig, seedFor(state.config, 100000 + index * 7919));
          var pair = new MazeRouting.Pair(world, state.models, false);
          var guard = 0;
          while (!pair.done() && guard++ < world.maxSteps + 2) pair.step();
          ['standard', 'modql'].forEach(function (id) {
            var measurement = MazeRouting.metrics(pair.runs[id], world);
            if (!measurement) throw new Error('Held-out scenario produced no run metrics for ' + id + '.');
            collected[id].push(measurement);
          });
          state.batch.progress++;
        }
        renderState(state);
        if (state.batch.progress < BATCH_SIZE) {
          window.setTimeout(runChunk, 0);
          return;
        }
        state.batch.result = {
          standard: summarizeBatch(collected.standard),
          modql: summarizeBatch(collected.modql)
        };
        state.batch.running = false;
        renderState(state);
      } catch (error) {
        state.batch.running = false;
        renderState(state);
        setStatus(state, 'Batch evaluation failed: ' + error.message, true);
      }
    }
    window.setTimeout(runChunk, 0);
  }
  function requestBatch(state) {
    if (state.training || state.batch.running || !state.models) return;
    beginBatch(state);
  }

  function buildUI() {
    root = byId('sub-maze');
    scenarioSelector = byId('mazeScenarioSelector');
    if (!root || !scenarioSelector) return;
    var configs = MazeComparisonData.scenarios();
    states = configs.map(createState);
    scenarioSelector.innerHTML = states.map(function (state) {
      return '<button type="button" data-scenario-tab="' + state.index + '" aria-pressed="' +
        (state.index === activeIndex ? 'true' : 'false') + '" tabindex="0" aria-label="' +
        escapeHtml(state.config.name) + '">' + escapeHtml(state.config.name) + '</button>';
    }).join('');
    root.innerHTML = '<div class="shared-maze-demo">' + states.map(buildTab).join('') + '</div>';
    states.forEach(function (state) {
      var panel = panelFor(state);
      panel.id = 'maze-scenario-' + state.index;
      panel.querySelectorAll('[data-action]').forEach(function (control) {
        var action = control.getAttribute('data-action');
        if (action === 'run') control.addEventListener('click', function () {
          if (timer !== null && state === activeState()) { stopTimer(); renderState(state); }
          else startComparison(state);
        });
        else if (action === 'reset') control.addEventListener('click', function () { resetComparison(state); });
        else if (action === 'step') control.addEventListener('click', function () { advanceOneStep(state); });
        else if (action === 'train') control.addEventListener('click', function () { trainPolicies(state); });
        else if (action === 'batch') control.addEventListener('click', function () { requestBatch(state); });
        else if (action === 'speed') control.addEventListener('change', function () {
          var wasRunning = timer !== null;
          stopTimer();
          speed = Number(control.value);
          if (wasRunning) startTimer();
        });
        else if (action === 'unit') control.addEventListener('change', function () {
          selectedTravelUnit = control.value;
          states.forEach(renderState);
        });
      });
      panel.querySelectorAll('[data-sop]').forEach(function (button) {
        button.addEventListener('click', function () {
          state.sop = Number(button.getAttribute('data-sop'));
          renderState(state);
        });
      });
      renderState(state);
    });
    scenarioSelector.querySelectorAll('[data-scenario-tab]').forEach(function (button) {
      button.addEventListener('click', function () { setActive(Number(button.getAttribute('data-scenario-tab'))); });
    });
    document.title = activeState().config.name + ' — Maze Comparison — Philippine Mobile Hub';
    ensurePolicy(activeState());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI);
  else buildUI();
})();
