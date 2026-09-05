/* ============================================================================
   Research & Analysis — Chapter 3 aligned comparison.

   Important distinction:
   - Route cards below use the live prototype environment in engine.js.
   - Training evidence uses the aligned Standard-Q vs MODQL experiment.
   - The Maze Demo is a controlled visualization, not Chapter 4 evidence.
   ============================================================================ */

var analysisStd=null, analysisMod=null;
var TRAINING_RESULT=(typeof ALIGNED_RESULTS!=="undefined")?ALIGNED_RESULTS:{
  episodes_trained:1200,evaluation_scenarios:100,
  standard:{travel_min:175.5502432642442,fairness:0.7604047786295903,stops:6.12,deferred:1.88,coverage:354.44},
  modql:{travel_min:188.59253217210298,fairness:0.7403991585483726,stops:5.77,deferred:2.23,coverage:336.05},
  note:"Placeholder Laiban/Tanay node and road data; not final Chapter 4 evidence."
};

function computeAnalysisPlans(){analysisStd=planRouteStandard();analysisMod=planRoute()}
function stopRowsHTML(plan){
  if(!plan.stops.length)return '<div class="k" style="padding:8px 0">No reachable communities under current conditions.</div>';
  return plan.stops.map(function(s,i){var n=N[s.id];return '<div class="stop"><div class="n">'+(i+1)+'</div><div style="flex:1;min-width:0"><div class="nm">'+n.name+'</div><div class="mt"><span class="tag">'+n.learners+' learners</span><span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span></div></div><div class="rt"><b>'+s.arrive+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div></div>'}).join('')
}
function deferredHTML(plan){
  if(!plan.deferred.length)return '<div class="k">None &mdash; every community reachable under current conditions.</div>';
  return plan.deferred.map(function(df){return '<div style="margin-bottom:6px"><b style="color:#ffabad">'+N[df.id].name+'</b> &mdash; '+df.reason+'</div>'}).join('')
}
function planKPIs(plan){
  var km=0,min=0,learners=0;plan.stops.forEach(function(s){km+=s.p.km;min+=s.p.min+serviceMin(N[s.id]);learners+=N[s.id].learners});if(plan.ret)km+=plan.ret.km;
  var v=[];NODES.forEach(function(n){if(n.kind==='node')v.push(plan.visits[n.id])});return{learners:learners,served:plan.stops.length,totalKm:km,totalMin:min,J:jain(v)}
}
function resultCard(title,r,label){return '<div class="card"><h3>'+title+'</h3><div class="g3"><div class="kpi"><div class="lab">Avg learner coverage</div><div class="v">'+r.coverage.toFixed(1)+'</div><div class="d">'+label+'</div></div><div class="kpi"><div class="lab">Avg Jain&rsquo;s J</div><div class="v">'+r.fairness.toFixed(3)+'</div><div class="d">100 held-out scenarios</div></div><div class="kpi"><div class="lab">Avg travel time</div><div class="v">'+r.travel_min.toFixed(1)+'<span style="font-size:13px"> min</span></div><div class="d">simulation rollout</div></div></div></div>'}
function evidenceNote(){return '<div class="note"><b>Validation status.</b> These training numbers come from the corrected 1,200-episode experiment using placeholder Laiban/Tanay data. They are useful for implementation verification, but they are <b>not final Chapter 4 evidence</b> until the official datasets are inserted and the experiment is re-run.</div>'}

function renderExisting(){
  var k=planKPIs(analysisStd),r=TRAINING_RESULT.standard;
  document.getElementById('sub-existing').innerHTML=
    '<div class="algo-head std"><div class="ic">Q</div><div><h2>Existing Algorithm &mdash; Standard Q-Learning</h2><p>Control model from Chapter 3: one Q-table, location-only state, single-objective reward</p></div></div>'+
    '<div class="card"><h3>Research definition</h3><div class="k">The control uses <span class="mono">S = L</span>. Its reward is travel efficiency only, <span class="mono">R = 1 / Travel Cost</span>. The same Q-table selects and evaluates actions:</div><div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px;margin-top:9px">Q(s,a) &larr; Q(s,a) + &alpha;[r + &gamma; max Q(s&prime;,a&prime;) &minus; Q(s,a)]</div><div class="k" style="margin-top:9px">The corrected Python experiment now trains this baseline independently. The live route card below is only the current prototype route replay under today&rsquo;s simulated hazards.</div></div>'+
    resultCard('Aligned training result &mdash; control',r,'Standard Q-Learning')+evidenceNote()+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">prototype route today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">same hazard map</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>Current prototype route</h3>'+stopRowsHTML(analysisStd)+'</div><div class="card"><h3>Deferred</h3>'+deferredHTML(analysisStd)+'</div>'
}

function renderProposed(){
  var k=planKPIs(analysisMod),r=TRAINING_RESULT.modql;
  document.getElementById('sub-proposed').innerHTML=
    '<div class="algo-head mod"><div class="ic">Q2</div><div><h2>Proposed Algorithm &mdash; MODQL</h2><p>Multi-Objective Double Q-Learning with enriched state and non-linear reward</p></div></div>'+
    '<div class="card"><h3>Research definition</h3><div class="k">The proposed state is explicitly represented in the corrected trainer as <span class="mono">S = &lang;L,D,T,H,A&rang;</span>. Continuous/context variables are discretized into finite buckets so a tabular implementation remains feasible.</div><div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px;margin-top:9px">R(s,a) = Coverage &times; Jain&rsquo;s Fairness &times; (1 / Travel Cost)</div><div class="k" style="margin-top:9px">Two independent tables Q<sub>1</sub> and Q<sub>2</sub> decouple action selection from evaluation. The final greedy policy evaluates actions using the combined learned values rather than claiming that the reward formula alone is the trained policy.</div></div>'+
    '<div class="card"><h3>How the five state dimensions are encoded</h3><table><thead><tr><th>Term</th><th>Implementation</th></tr></thead><tbody><tr><td><b>L</b> &mdash; Location</td><td>Current graph node</td></tr><tr><td><b>D</b> &mdash; Demand</td><td>Demand-pressure bucket from currently unserved reachable communities</td></tr><tr><td><b>T</b> &mdash; Time</td><td>Remaining 480-minute shift discretized into time buckets</td></tr><tr><td><b>H</b> &mdash; History</td><td>Visit-frequency/fairness state derived from the current service-history vector</td></tr><tr><td><b>A</b> &mdash; Accessibility</td><td>Local road-accessibility bucket computed from available road segments</td></tr></tbody></table></div>'+
    resultCard('Aligned training result &mdash; proposed',r,'MODQL')+evidenceNote()+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">prototype route today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">same hazard map</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>Current prototype route</h3>'+stopRowsHTML(analysisMod)+'</div><div class="card"><h3>Deferred</h3>'+deferredHTML(analysisMod)+'</div>'
}

function renderSOP1(){
  var s=TRAINING_RESULT.standard,m=TRAINING_RESULT.modql;
  document.getElementById('sub-sop1').innerHTML=
    '<div class="sop-problem"><b>SOP 1 &mdash; Single-objective limitation.</b> The experiment changes the reward architecture while keeping the same routing environment.</div>'+
    '<div class="split2"><div class="splitcol std"><h4>Standard Q-Learning</h4><div class="k"><span class="mono">R = 1 / Travel Cost</span><br>No direct coverage or fairness term.</div></div><div class="splitcol mod"><h4>MODQL</h4><div class="k"><span class="mono">R = C &times; J &times; (1/Cost)</span><br>Coverage, fairness, and efficiency all affect the reward.</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>Current aligned simulation result</h3><table><thead><tr><th>Metric</th><th>Standard</th><th>MODQL</th></tr></thead><tbody><tr><td>Avg learner coverage</td><td>'+s.coverage.toFixed(2)+'</td><td>'+m.coverage.toFixed(2)+'</td></tr><tr><td>Avg Jain&rsquo;s fairness</td><td>'+s.fairness.toFixed(3)+'</td><td>'+m.fairness.toFixed(3)+'</td></tr><tr><td>Avg travel time</td><td>'+s.travel_min.toFixed(1)+' min</td><td>'+m.travel_min.toFixed(1)+' min</td></tr></tbody></table><div class="k" style="margin-top:10px"><b>Do not interpret this as proof that MODQL is better yet.</b> On the current placeholder dataset, the control is actually higher on coverage and fairness. This is a validation finding, not something the interface hides.</div></div>'+evidenceNote()
}

function renderSOP2(){
  document.getElementById('sub-sop2').innerHTML=
    '<div class="sop-problem"><b>SOP 2 &mdash; Overestimation bias.</b> The implementation difference is structural, not cosmetic.</div>'+
    '<div class="split2"><div class="splitcol std"><h4>Standard &mdash; one estimator</h4><div class="k mono" style="background:var(--ink3);padding:9px;border-radius:9px">Q(s,a) &larr; Q(s,a)+&alpha;[r+&gamma;max Q(s&prime;,a&prime;)&minus;Q(s,a)]</div><div class="k" style="margin-top:8px">The same table identifies the maximum action and supplies its target value.</div></div><div class="splitcol mod"><h4>MODQL &mdash; decoupled estimators</h4><div class="k mono" style="background:var(--ink3);padding:9px;border-radius:9px">50%: choose with Q1, evaluate with Q2<br>50%: choose with Q2, evaluate with Q1</div><div class="k" style="margin-top:8px">Q1 and Q2 are independently updated; the chooser is not allowed to validate its own estimate.</div></div></div><div style="height:12px"></div>'+
    '<div class="card"><h3>What the corrected trainer records</h3><div class="k">The aligned training log contains episode reward for both algorithms plus mean <span class="mono">|Q1 &minus; Q2|</span> for MODQL. That spread is a diagnostic of estimator disagreement; it should not be mislabeled as direct proof of overestimation without a proper reference/ground-truth estimate.</div></div>'+evidenceNote()
}

function renderSOP3(){
  var html='<div class="sop-problem"><b>SOP 3 &mdash; Limited state representation.</b> This is the largest code correction made during the audit.</div>'+
  '<div class="split2"><div class="splitcol std"><h4>Standard state</h4><div class="k mono">S = L</div><div class="k">The same location maps to the same state even when demand, remaining time, history, or road conditions differ.</div></div><div class="splitcol mod"><h4>Proposed state</h4><div class="k mono">S = &lang;L,D,T,H,A&rang;</div><div class="k">The corrected trainer directly observes all five dimensions and discretizes D/T/H/A for a finite tabular state space.</div></div></div><div style="height:12px"></div>'+
  '<div class="card"><h3>Live state-vector inspector</h3><div class="k" style="margin-bottom:9px">Select a simulated community to inspect the real values that correspond to the five terms.</div><select id="svSelect" style="width:100%;padding:9px;border-radius:8px;background:var(--ink3);color:var(--text);border:1px solid var(--line)">';
  NODES.filter(function(n){return n.kind==='node'}).forEach(function(n){html+='<option value="'+n.id+'">'+n.name+'</option>'});
  html+='</select><div id="svBody" style="margin-top:10px"></div></div>'+evidenceNote();
  document.getElementById('sub-sop3').innerHTML=html;
  var sel=document.getElementById('svSelect');sel.onchange=function(){updateSV(sel.value)};updateSV(sel.value)
}
function updateSV(id){
  var n=N[id],p=path('hub',id),worst=1;if(p)p.legs.forEach(function(e){worst=Math.min(worst,accA(e))});
  var used=0;PLAN.stops.slice(0,PROGRESS).forEach(function(st){used+=st.p.min+serviceMin(N[st.id])});var b=band(worst),maxL=Math.max.apply(null,NODES.filter(function(x){return x.kind==='node'}).map(function(x){return x.learners}));
  document.getElementById('svBody').innerHTML=sv('L','Location','current graph node',n.name+' ('+n.lat.toFixed(4)+', '+n.lng.toFixed(4)+')','#31c8ff')+sv('D','Student demand','current simulated learner demand',n.learners+' learners ('+(n.learners/maxL).toFixed(2)+' normalized)','#25d07a')+sv('T','Remaining time','time left in the 480-minute shift',Math.max(0,Math.round(SHIFT_MIN-used))+' min','#ffb020')+sv('H','Visit history','days since last service and visits in 30 days',n.days+' days; '+n.visits30+' visits','#8b7dff')+sv('A','Road accessibility','worst accessibility on the current best open approach',p?worst.toFixed(2)+' &mdash; '+b.lab:'no open approach',b.col)
}
function sv(sym,nm,desc,val,col){return '<div class="sv"><div class="sym" style="color:'+col+'">'+sym+'</div><div class="nm"><b>'+nm+'</b>'+desc+'</div><div class="vv" style="color:'+col+'">'+val+'</div></div>'}

function renderAnalysis(){computeAnalysisPlans();renderExisting();renderProposed();renderSOP1();renderSOP2();renderSOP3()}
document.querySelectorAll('.rn-group button[data-sub]').forEach(function(b){b.onclick=function(){document.querySelectorAll('.rn-group button[data-sub]').forEach(function(x){x.classList.remove('on')});b.classList.add('on');document.querySelectorAll('.subview').forEach(function(v){v.classList.remove('active')});var target=document.getElementById('sub-'+b.getAttribute('data-sub'));if(target)target.classList.add('active')}})
