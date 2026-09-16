/* ============================================================================
   Research & Analysis — Chapter 3 aligned comparison.

   Important distinction:
   - Route cards below use the active Laiban simulation environment in engine.js.
   - Training evidence uses the aligned Standard-Q vs MODQL experiment.
   ============================================================================ */

var analysisStd=null, analysisMod=null;
var TRAINING_RESULT=(
  typeof TRAINED_POLICY!=="undefined" &&
  TRAINED_POLICY.evaluation_summary
)
  ? TRAINED_POLICY.evaluation_summary
  : {
      episodes_trained:0,
      evaluation_scenarios:0,

      standard:{
        travel_min:0,
        fairness:0,
        stops:0,
        deferred:0,
        coverage:0
      },

      modql:{
        travel_min:0,
        fairness:0,
        stops:0,
        deferred:0,
        coverage:0
      },

      data_note:
        "Training results are unavailable. Run training/train_q_learning.py."
    };

function computeAnalysisPlans(){analysisStd=planRouteStandard();analysisMod=planRoute()}
function stopRowsHTML(plan){
  if(!plan.stops.length)return '<div class="k" style="padding:8px 0">No reachable communities under current conditions.</div>';
  return plan.stops.map(function(s,i){var n=N[s.id];return '<div class="stop"><div class="n">'+(i+1)+'</div><div style="flex:1;min-width:0"><div class="nm">'+n.name+'</div><div class="mt"><span class="tag">'+n.learners+' learners</span><span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span></div></div><div class="rt"><b>'+s.arrive+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div></div>'}).join('')
}
function deferredHTML(plan){
  if(!plan.deferred.length)return '<div class="k">None &mdash; every community reachable under current conditions.</div>';
  return plan.deferred.map(function(df){return '<div style="margin-bottom:6px"><b style="color:var(--bad)">'+N[df.id].name+'</b> &mdash; '+df.reason+'</div>'}).join('')
}
function planKPIs(plan){
  var km=0,min=0,learners=0;plan.stops.forEach(function(s){km+=s.p.km;min+=s.p.min+serviceMin(N[s.id]);learners+=N[s.id].learners});if(plan.ret)km+=plan.ret.km;
  var v=[];NODES.forEach(function(n){if(n.kind==='node')v.push(plan.visits[n.id])});return{learners:learners,served:plan.stops.length,totalKm:km,totalMin:min,J:jain(v)}
}

function evaluationKPIs(plan){
  var distance=0,travelMin=0,learners=0;
  plan.stops.forEach(function(s){
    distance+=s.p.km;
    travelMin+=s.p.min;
    learners+=N[s.id].learners;
  });
  if(plan.ret){distance+=plan.ret.km;travelMin+=plan.ret.min;}
  var visits=[];NODES.forEach(function(n){if(n.kind==="node")visits.push(plan.visits[n.id])});
  return {distance:distance,travelMin:travelMin,served:plan.stops.length,deferred:plan.deferred.length,deferredReasons:plan.deferred,fairness:jain(visits),learners:learners};
}
function evaluationMetric(label,std,mod,format){return '<tr><th>'+label+'</th><td>'+format(std)+'</td><td>'+format(mod)+'</td></tr>'}
function evaluationSnapshot(){return {nodes:NODES.map(function(n){return Object.assign({},n)}),reports:REPORTS.map(function(r){return Object.assign({},r)}),advisories:ADVISORIES.map(function(a){return Object.assign({},a)}),weather:WX.mm}}
function restoreEvaluationSnapshot(s){
  NODES.forEach(function(n,i){Object.assign(n,s.nodes[i])});
  REPORTS.length=0;s.reports.forEach(function(r){REPORTS.push(Object.assign({},r))});
  ADVISORIES.length=0;s.advisories.forEach(function(a){ADVISORIES.push(Object.assign({},a))});
  WX.mm=s.weather;
}
function multiDayEvaluation(){
  var base=evaluationSnapshot(),days=7,weather=[];
  for(var i=0;i<days;i++)weather.push(i===0?base.weather:[12,38,78][i%3]);
  function run(planner){
    restoreEvaluationSnapshot(base);
    var fairness=[],cumulative=[],servedBy={},total=0;
    for(var d=0;d<days;d++){
      WX.mm=weather[d];
      REPORTS.forEach(function(r){r.ago=base.reports[r.id-1]?base.reports[r.id-1].ago+24*d:r.ago+24*d});
      if(d>0)NODES.forEach(function(n){if(n.kind==="node")n.days+=1});
      var plan=planner(),visits=[];
      NODES.forEach(function(n){if(n.kind==="node")visits.push(plan.visits[n.id])});
      fairness.push(jain(visits));
      plan.stops.forEach(function(s){if(!servedBy[s.id])servedBy[s.id]=[];servedBy[s.id].push(d+1);total++;N[s.id].visits30+=1;N[s.id].days=0});
      cumulative.push(total);
    }
    return {fairness:fairness,cumulative:cumulative,servedBy:servedBy};
  }
  var standard=run(planRouteStandard),modql=run(planRoute);
  restoreEvaluationSnapshot(base);
  return {days:days,standard:standard,modql:modql};
}
function renderEvaluation(){
  var std=evaluationKPIs(analysisStd),mod=evaluationKPIs(analysisMod),multi=multiDayEvaluation(),neverStandard=[],neverModql=[];
  NODES.filter(function(n){return n.kind==="node"}).forEach(function(n){
    if(!multi.standard.servedBy[n.id])neverStandard.push(n.name);
    if(!multi.modql.servedBy[n.id])neverModql.push(n.name);
  });
  function reasons(k){if(!k.deferredReasons.length)return '<span class="pill open">None</span>';return k.deferredReasons.map(function(d){return '<div class="k">'+N[d.id].name+' &mdash; '+d.reason+'</div>'}).join("")}
  document.getElementById("sub-evaluation").innerHTML=
    '<div class="algo-head mod"><div class="ic">&Delta;</div><div><h2>Algorithm Evaluation Dashboard</h2><p>Same simulated weather, hazards, Laiban network, and learner-demand inputs for both planners</p></div></div>'+
    '<div class="sop-problem"><b>Simulated environment.</b> This is a read-only comparison of the Standard Q-Learning and MODQL planners under the same current Laiban simulation conditions.</div>'+
    '<div class="card eval-card"><table><thead><tr><th>Metric</th><th class="std-head">Standard Q-Learning</th><th class="mod-head">MODQL</th></tr></thead><tbody>'+
    evaluationMetric("Total travel distance",std,mod,function(k){return k.distance.toFixed(1)+" km"})+
    evaluationMetric("Total travel time",std,mod,function(k){return Math.round(k.travelMin)+" min"})+
    evaluationMetric("Communities served",std,mod,function(k){return k.served+" of "+(NODES.length-1)})+
    evaluationMetric("Communities deferred",std,mod,function(k){return k.deferred})+
    evaluationMetric("Jain&rsquo;s Fairness Index",std,mod,function(k){return k.fairness.toFixed(3)})+
    evaluationMetric("Learners reached",std,mod,function(k){return k.learners})+
    '</tbody></table></div>'+
    '<div class="split2"><div class="splitcol std"><h4>Standard deferred reasons</h4>'+reasons(std)+'</div><div class="splitcol mod"><h4>MODQL deferred reasons</h4>'+reasons(mod)+'</div></div>'+
    '<div class="card"><h3>Training convergence</h3>'+
    '<div class="k" style="margin-bottom:8px">'+
    'Generated from the finalized '+TRAINING_RESULT.episodes_trained+
    '-episode Laiban training experiment. Both algorithms received the same sequence of training scenarios.'+
    '</div>'+
    svgLine([{d:SIM.mq,c:"#0f9d58"},{d:SIM.sq,c:"#5b4fc7"}],{xs:SIM.ep,dp:2,h:210})+
    '<div class="lg"><span><i style="background:#0f9d58"></i> MODQL reward</span><span><i style="background:#5b4fc7"></i> Standard Q-Learning reward</span></div></div>'+
    '<div class="card"><h3>Seven-day simulated comparison</h3><div class="k" style="margin-bottom:8px">Both algorithms replay the same seven weather/hazard days. This evaluation does not advance the Operational view.</div>'+
    '<h4>Jain&rsquo;s Fairness Index by day</h4>'+
    svgLine([{d:multi.standard.fairness,c:"#5b4fc7"},{d:multi.modql.fairness,c:"#0f9d58"}],{xs:[1,2,3,4,5,6,7],dp:3,h:190,min:0,max:1})+
    '<div class="lg"><span><i style="background:#0f9d58"></i> MODQL</span><span><i style="background:#5b4fc7"></i> Standard Q-Learning</span></div>'+
    '<h4 style="margin-top:16px">Cumulative communities served</h4>'+
    '<div class="k eval-discussion">Standard: '+multi.standard.cumulative.join(", ")+' &middot; MODQL: '+multi.modql.cumulative.join(", ")+'</div>'+
    svgLine([{d:multi.modql.cumulative,c:"#0f9d58"},{d:multi.standard.cumulative,c:"#5b4fc7",dash:true}],{xs:[1,2,3,4,5,6,7],dp:0,h:190,min:0})+
    '<div class="split2" style="margin-top:12px"><div class="splitcol std"><h4>Never served by Standard</h4><div class="k">'+(neverStandard.length?neverStandard.join("<br>"):"None")+'</div></div><div class="splitcol mod"><h4>Never served by MODQL</h4><div class="k">'+(neverModql.length?neverModql.join("<br>"):"None")+'</div></div></div></div>';
}

function resultCard(title,r,label){
  return '<div class="card">'+
    '<h3>'+title+'</h3>'+
    '<div class="g3">'+
      '<div class="kpi">'+
        '<div class="lab">Avg learner coverage</div>'+
        '<div class="v">'+r.coverage.toFixed(1)+'</div>'+
        '<div class="d">'+label+'</div>'+
      '</div>'+

      '<div class="kpi">'+
        '<div class="lab">Avg Jain&rsquo;s J</div>'+
        '<div class="v">'+r.fairness.toFixed(3)+'</div>'+
        '<div class="d">'+
          TRAINING_RESULT.evaluation_scenarios+
          ' held-out scenarios'+
        '</div>'+
      '</div>'+

      '<div class="kpi">'+
        '<div class="lab">Avg travel time</div>'+
        '<div class="v">'+
          r.travel_min.toFixed(1)+
          '<span style="font-size:13px"> min</span>'+
        '</div>'+
        '<div class="d">evaluation rollout</div>'+
      '</div>'+

    '</div>'+
  '</div>';
}
function evidenceNote(){
  return '<div class="note"><b>Experimental data status.</b> These results were generated from the finalized Barangay Laiban simulation environment using '+
    TRAINING_RESULT.episodes_trained+' training episodes and '+
    TRAINING_RESULT.evaluation_scenarios+' identical held-out evaluation scenarios for both algorithms. '+
    'The official Barangay Laiban CY 2026 OSY total is used as the learner-demand basis. '+
    'Sitio-level demand allocation, historical service values, and operational time remain controlled simulation inputs where official sitio-level records were unavailable.</div>';
}

function renderExisting(){
  var k=planKPIs(analysisStd),r=TRAINING_RESULT.standard;
  document.getElementById('sub-existing').innerHTML=
    '<div class="algo-head std"><div class="ic">Q</div><div><h2>Existing Algorithm &mdash; Standard Q-Learning</h2><p>Control model from Chapter 3: one Q-table, location-only state, single-objective reward</p></div></div>'+
    '<div class="card"><h3>Research definition</h3><div class="k">The control uses <span class="mono">S = L</span>. Its reward is travel efficiency only, <span class="mono">R = 1 / Travel Cost</span>. The same Q-table selects and evaluates actions:</div><div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px;margin-top:9px">Q(s,a) &larr; Q(s,a) + &alpha;[r + &gamma; max Q(s&prime;,a&prime;) &minus; Q(s,a)]</div><div class="k" style="margin-top:9px">The corrected Python experiment now trains this baseline independently. The live route card below is only the Current Laiban simulation route replay under today&rsquo;s simulated hazards.</div></div>'+
    resultCard('Aligned training result &mdash; control',r,'Standard Q-Learning')+evidenceNote()+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">Laiban simulation today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">shared Laiban environment</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>Current Laiban simulation route</h3>'+stopRowsHTML(analysisStd)+'</div><div class="card"><h3>Deferred</h3>'+deferredHTML(analysisStd)+'</div>'
}

function renderProposed(){
  var k=planKPIs(analysisMod),r=TRAINING_RESULT.modql;
  document.getElementById('sub-proposed').innerHTML=
    '<div class="algo-head mod"><div class="ic">Q2</div><div><h2>Proposed Algorithm &mdash; MODQL</h2><p>Multi-Objective Double Q-Learning with enriched state and non-linear reward</p></div></div>'+
    '<div class="card"><h3>Research definition</h3><div class="k">The proposed state is explicitly represented in the corrected trainer as <span class="mono">S = &lang;L,D,T,H,A&rang;</span>. Continuous/context variables are discretized into finite buckets so a tabular implementation remains feasible.</div><div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px;margin-top:9px">R(s,a) = Coverage &times; Jain&rsquo;s Fairness &times; (1 / Travel Cost)</div><div class="k" style="margin-top:9px">Two independent tables Q<sub>1</sub> and Q<sub>2</sub> decouple action selection from evaluation. The final greedy policy evaluates actions using the combined learned values rather than claiming that the reward formula alone is the trained policy.</div></div>'+
    '<div class="card"><h3>How the five state dimensions are encoded</h3><table><thead><tr><th>Term</th><th>Implementation</th></tr></thead><tbody><tr><td><b>L</b> &mdash; Location</td><td>Current graph node</td></tr><tr><td><b>D</b> &mdash; Demand</td><td>Localized per-sitio demand buckets for unserved reachable communities</td></tr><tr><td><b>T</b> &mdash; Time</td><td>Remaining 480-minute shift discretized into time buckets</td></tr><tr><td><b>H</b> &mdash; History</td><td>Per-sitio Historical Visit Index based on days since last service</td></tr><tr><td><b>A</b> &mdash; Accessibility</td><td>Per-sitio route-accessibility buckets using the weakest segment on the current open route</td></tr></tbody></table></div>'+
    resultCard('Aligned training result &mdash; proposed',r,'MODQL')+evidenceNote()+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">Laiban simulation today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">shared Laiban environment</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>Current Laiban simulation route</h3>'+stopRowsHTML(analysisMod)+'</div><div class="card"><h3>Deferred</h3>'+deferredHTML(analysisMod)+'</div>'
}

function renderSOP1(){
  var s=TRAINING_RESULT.standard,
      m=TRAINING_RESULT.modql;

  document.getElementById('sub-sop1').innerHTML=
    '<div class="sop-problem">'+
      '<b>SOP 1 &mdash; Single-objective limitation.</b> '+
      'The experiment changes the reward architecture while keeping the same routing environment.'+
    '</div>'+

    '<div class="split2">'+
      '<div class="splitcol std">'+
        '<h4>Standard Q-Learning</h4>'+
        '<div class="k">'+
          '<span class="mono">R = 1 / Travel Cost</span><br>'+
          'No direct coverage or fairness term.'+
        '</div>'+
      '</div>'+

      '<div class="splitcol mod">'+
        '<h4>MODQL</h4>'+
        '<div class="k">'+
          '<span class="mono">R = C &times; J &times; (1 / Cost)</span><br>'+
          'Coverage, fairness, and efficiency all affect the reward.'+
        '</div>'+
      '</div>'+
    '</div>'+

    '<div style="height:12px"></div>'+

    '<div class="card">'+
      '<h3>Current aligned simulation result</h3>'+

      '<table>'+
        '<thead>'+
          '<tr>'+
            '<th>Metric</th>'+
            '<th>Standard</th>'+
            '<th>MODQL</th>'+
          '</tr>'+
        '</thead>'+

        '<tbody>'+
          '<tr>'+
            '<td>Avg learner coverage</td>'+
            '<td>'+s.coverage.toFixed(2)+'</td>'+
            '<td>'+m.coverage.toFixed(2)+'</td>'+
          '</tr>'+

          '<tr>'+
            '<td>Avg Jain&rsquo;s fairness</td>'+
            '<td>'+s.fairness.toFixed(3)+'</td>'+
            '<td>'+m.fairness.toFixed(3)+'</td>'+
          '</tr>'+

          '<tr>'+
            '<td>Avg travel time</td>'+
            '<td>'+s.travel_min.toFixed(1)+' min</td>'+
            '<td>'+m.travel_min.toFixed(1)+' min</td>'+
          '</tr>'+
        '</tbody>'+
      '</table>'+

      '<div class="k" style="margin-top:10px">'+
        'The table reports the measured results of the finalized simulation experiment. '+
        'Coverage, fairness, and travel time should be interpreted separately rather than reduced to an overall winner.'+
      '</div>'+
    '</div>'+

    evidenceNote();
}

function renderSOP2(){
  document.getElementById('sub-sop2').innerHTML=
    '<div class="sop-problem"><b>SOP 2 &mdash; Overestimation bias.</b> The implementation difference is structural, not cosmetic.</div>'+
    '<div class="split2"><div class="splitcol std"><h4>Standard &mdash; one estimator</h4><div class="k mono" style="background:var(--ink3);padding:9px;border-radius:9px">Q(s,a) &larr; Q(s,a)+&alpha;[r+&gamma;max Q(s&prime;,a&prime;)&minus;Q(s,a)]</div><div class="k" style="margin-top:8px">The same table identifies the maximum action and supplies its target value.</div></div><div class="splitcol mod"><h4>MODQL &mdash; decoupled estimators</h4><div class="k mono" style="background:var(--ink3);padding:9px;border-radius:9px">50%: choose with Q1, evaluate with Q2<br>50%: choose with Q2, evaluate with Q1</div><div class="k" style="margin-top:8px">Q1 and Q2 are independently updated; the chooser is not allowed to validate its own estimate.</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>What the corrected trainer records</h3><div class="k">The aligned training log contains episode reward for both algorithms plus mean <span class="mono">|Q1 &minus; Q2|</span> for MODQL. That spread is a diagnostic of estimator disagreement; it should not be mislabeled as direct proof of overestimation without a proper reference/ground-truth estimate.</div></div>'+evidenceNote()
}

function renderSOP3(){
  var html='<div class="sop-problem"><b>SOP 3 &mdash; Limited state representation.</b> This is the largest code correction made during the audit.</div>'+
  '<div class="split2"><div class="splitcol std"><h4>Standard state</h4><div class="k mono">S = L</div><div class="k">The same location maps to the same state even when demand, remaining time, history, or road conditions differ.</div></div><div class="splitcol mod"><h4>Proposed state</h4><div class="k mono">S = &lang;L,D,T,H,A&rang;</div><div class="k">The corrected trainer directly observes all five dimensions. D, H, and A preserve localized per-sitio context while T is discretized for the finite tabular state space.</div></div></div><div style="height:12px"></div>'+
  '<div class="card"><h3>Live state-vector inspector</h3><div class="k" style="margin-bottom:9px">Select a simulated community to inspect the real values that correspond to the five terms.</div><select id="svSelect" style="width:100%;padding:9px;border-radius:8px;background:var(--ink3);color:var(--txt);border:1px solid var(--line)">';
  NODES.filter(function(n){return n.kind==='node'}).forEach(function(n){html+='<option value="'+n.id+'">'+n.name+'</option>'});
  html+='</select><div id="svBody" style="margin-top:10px"></div></div>'+evidenceNote();
  document.getElementById('sub-sop3').innerHTML=html;
  var sel=document.getElementById('svSelect');sel.onchange=function(){updateSV(sel.value)};updateSV(sel.value)
}
function updateSV(id){
  var n=N[id],p=path('hub',id),worst=1;if(p)p.legs.forEach(function(e){worst=Math.min(worst,accA(e))});
  var used=0;PLAN.stops.slice(0,PROGRESS).forEach(function(st){used+=st.p.min+serviceMin(N[st.id])});var b=band(worst),maxL=Math.max.apply(null,NODES.filter(function(x){return x.kind==='node'}).map(function(x){return x.learners}));
  document.getElementById('svBody').innerHTML=sv('L','Location','current graph node',n.name+' ('+n.lat.toFixed(4)+', '+n.lng.toFixed(4)+')','var(--cy)')+sv('D','Student demand','current simulated learner demand',n.learners+' learners ('+(n.learners/maxL).toFixed(2)+' normalized)','var(--go)')+sv('T','Remaining time','time left in the 480-minute shift',Math.max(0,Math.round(SHIFT_MIN-used))+' min','var(--warn)')+sv('H','Visit history','days since last service and visits in 30 days',n.days+' days; '+n.visits30+' visits','var(--vio)')+sv('A','Road accessibility','worst accessibility on the current best open approach',p?worst.toFixed(2)+' &mdash; '+b.lab:'no open approach',b.col)
}
function sv(sym,nm,desc,val,col){return '<div class="sv"><div class="sym" style="color:'+col+'">'+sym+'</div><div class="nm"><b>'+nm+'</b>'+desc+'</div><div class="vv" style="color:'+col+'">'+val+'</div></div>'}

function renderAnalysis(){computeAnalysisPlans();renderExisting();renderProposed();renderEvaluation();renderSOP1();renderSOP2();renderSOP3()}
document.querySelectorAll('.rn-group button[data-sub]').forEach(function(b){b.onclick=function(){document.querySelectorAll('.rn-group button[data-sub]').forEach(function(x){x.classList.remove('on')});b.classList.add('on');document.querySelectorAll('.subview').forEach(function(v){v.classList.remove('active')});var target=document.getElementById('sub-'+b.getAttribute('data-sub'));if(target)target.classList.add('active')}})
