/* ============================================================================
   Research & Analysis — Chapter 3 aligned comparison.

   Important distinction:
   - Route cards below use the active Laiban simulation environment in engine.js.
   - Training evidence uses the aligned Standard-Q vs MODQL experiment.
   - The Maze Demo is a controlled visualization, not Chapter 4 evidence.
   ============================================================================ */

var analysisStd=null, analysisMod=null;
var EVALUATION_DEMO_RAIN_MM=12;
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
var TRAINING_LOG_STATS={
  rows:2000,
  mean_q1_q2_spread_avg:0.228775796740194,
  mean_q1_q2_spread_min:0.000459586305545656,
  mean_q1_q2_spread_max:2.39512773500819,
  mean_q1_q2_spread_last:0.332895747132863
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
function evaluationGraphHTML(id,title,plan,color){
  var minLat=Math.min.apply(null,NODES.map(function(n){return n.lat})),maxLat=Math.max.apply(null,NODES.map(function(n){return n.lat}));
  var minLng=Math.min.apply(null,NODES.map(function(n){return n.lng})),maxLng=Math.max.apply(null,NODES.map(function(n){return n.lng}));
  function xy(n){return {x:18+(n.lng-minLng)/(maxLng-minLng||1)*264,y:18+(maxLat-n.lat)/(maxLat-minLat||1)*184}}
  var lines=EDGES.map(function(e){var a=xy(N[e.a]),b=xy(N[e.b]),bandName=band(accA(e)).k;return '<line class="eg-edge eg-'+bandName+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>'}).join("");
  var route=plan.stops.map(function(s){return s.p.seq?s.p.seq.join(","):s.id}).join(" &rarr; ");
  var nodes=NODES.map(function(n){var p=xy(n),idx=-1;plan.stops.forEach(function(s,i){if(s.id===n.id)idx=i});return '<g class="eg-node" data-step="'+(idx+1)+'"><circle cx="'+p.x+'" cy="'+p.y+'" r="'+(n.kind==="depot"?8:6)+'"/><text x="'+(p.x+8)+'" y="'+(p.y+3)+'">'+(idx>=0?idx+1:"")+'</text><title>'+n.name+'</title></g>'}).join("");
  return '<div class="card eg-card"><h3>'+title+'</h3><div class="k">Same live scenario; numbered circles show stop order.</div><svg id="'+id+'" class="eval-graph" viewBox="0 0 300 220" role="img" aria-label="'+title+'">'+lines+nodes+'</svg><div class="eg-legend"><span><i class="eg-open"></i>Open</span><span><i class="eg-caution"></i>Caution</span><span><i class="eg-rest"></i>Restricted</span></div><div class="k">Route: '+(route||"No reachable stops")+'</div><button class="btn g eg-step" data-graph="'+id+'">Play route step-through</button><span class="k eg-status" id="'+id+'-status">Step 0 / '+plan.stops.length+'</span></div>';
}
var PROPOSED_GRAPH_SCENARIOS=[
  {title:"Simulation 1 — Close stops",note:"Stop 1 is close to the Hub, so MODQL can serve the nearby stop first before continuing through the open roads.",nodes:[
    {id:"hub",label:"Hub",x:85,y:190,hub:true},{id:"stop1",label:"Stop 1",x:270,y:75},{id:"stop2",label:"Stop 2",x:490,y:275},{id:"stop3",label:"Stop 3",x:705,y:105}
  ],edges:[{a:"hub",b:"stop1",min:14,kind:"open"},{a:"hub",b:"stop2",min:22,kind:"caution"},{a:"hub",b:"stop3",min:30,kind:"open"},{a:"stop1",b:"stop2",min:10,kind:"open"},{a:"stop2",b:"stop3",min:12,kind:"open"}],route:["hub","stop1","stop2","stop3","hub"],returnMin:30},
  {title:"Simulation 2 — Far stop",note:"Stop 1 is the closest first choice at 12 minutes. MODQL serves it first, then connects to the far Stop 3 before returning through Stop 2.",nodes:[
    {id:"hub",label:"Hub",x:85,y:180,hub:true},{id:"stop1",label:"Stop 1",x:230,y:75},{id:"stop2",label:"Stop 2",x:470,y:275},{id:"stop3",label:"Stop 3",x:735,y:75}
  ],edges:[{a:"hub",b:"stop1",min:12,kind:"open"},{a:"hub",b:"stop2",min:20,kind:"open"},{a:"hub",b:"stop3",min:28,kind:"caution"},{a:"stop1",b:"stop2",min:11,kind:"open"},{a:"stop1",b:"stop3",min:18,kind:"open"},{a:"stop2",b:"stop3",min:13,kind:"open"}],route:["hub","stop1","stop3","stop2","hub"],returnMin:20},
  {title:"Simulation 3 — Hazard on the closest road",note:"Stop 1 is close, but its direct road has a hazard delay. MODQL selects the safer route through the other stops.",nodes:[
    {id:"hub",label:"Hub",x:85,y:180,hub:true},{id:"stop1",label:"Stop 1",x:245,y:70},{id:"stop2",label:"Stop 2",x:480,y:275},{id:"stop3",label:"Stop 3",x:700,y:105}
  ],edges:[{a:"hub",b:"stop1",min:14,kind:"hazard"},{a:"hub",b:"stop2",min:24,kind:"open"},{a:"stop2",b:"stop3",min:12,kind:"open"},{a:"stop1",b:"stop3",min:10,kind:"closed"}],route:["hub","stop2","stop3","hub"],returnMin:36}
];
function proposedGraphHTML(){
  return '<div class="card eg-card"><h3>Proposed Algorithm — MODQL simulations</h3><div class="k">Three separate made-up node graphs demonstrate how MODQL can respond to distance, stop order, and road accessibility. These are illustrative simulations, not Laiban locations.</div><div id="proposed-sim-title" class="k" style="font-weight:800;margin-top:8px"></div><svg id="proposed-sim-svg" class="eval-graph compact-graph" viewBox="0 0 780 360" role="img" aria-label="Proposed Algorithm abstract simulation"></svg><div class="eg-legend"><span><i class="eg-selected"></i>Selected route</span><span><i class="eg-hazard"></i>Hazard / delay</span><span><i class="eg-open"></i>Open road</span><span><i class="eg-closed"></i>Closed / deferred</span></div><div class="eg-line-help"><div><b>Solid green line:</b> MODQL&rsquo;s selected route.</div><div><b>Thin light-green line:</b> an available connection that was not selected for this route.</div><div><b>Broken yellow line:</b> a hazard or delay on the road.</div><div><b>Broken red line:</b> a closed or deferred road that is not available.</div></div><div id="proposed-sim-note" class="k"></div><div id="proposed-sim-status" class="k">Ready at Hub</div><div class="eg-controls"><button class="btn g" id="proposed-sim-play">Play Route</button><button class="btn k" id="proposed-sim-reset">Reset Simulation</button><button class="btn p" id="proposed-sim-next">Next Simulation</button></div></div>';
}
function wireProposedGraph(){
  var index=0,step=0,timer=null;
  function render(){
    var s=PROPOSED_GRAPH_SCENARIOS[index],by={};s.nodes.forEach(function(n){by[n.id]=n});
    var isRouteEdge=function(e){for(var i=0;i<s.route.length-1;i++){if((e.a===s.route[i]&&e.b===s.route[i+1])||(e.b===s.route[i]&&e.a===s.route[i+1]))return true}return false};
    var lines=s.edges.filter(function(e){return !isRouteEdge(e)}).map(function(e){var a=by[e.a],b=by[e.b],cls=e.kind==="hazard"?"eg-hazard":e.kind==="closed"?"eg-closed":"eg-base-edge";return '<line class="'+cls+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/><text class="eg-time" x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2-7)+'">'+e.min+' min</text>'}).join("");
    var routeLines=[];for(var i=0;i<s.route.length-1;i++){var a=by[s.route[i]],b=by[s.route[i+1]],e=s.edges.filter(function(x){return (x.a===a.id&&x.b===b.id)||(x.a===b.id&&x.b===a.id)})[0],min=e?e.min:s.returnMin;routeLines.push('<line class="eg-route" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/><text class="eg-time" x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2+13)+'">'+min+' min</text>')}
    var nodes=s.nodes.map(function(n){var visit=s.route.indexOf(n.id);return '<g class="eg-node proposed-sim-node" data-visit="'+(visit>0?visit:0)+'"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+(n.hub?11:9)+'"/><text x="'+(n.x-35)+'" y="'+(n.y+32)+'">'+n.label+'</text></g>'}).join("");
    document.getElementById("proposed-sim-title").textContent=s.title+" ("+(index+1)+" of "+PROPOSED_GRAPH_SCENARIOS.length+")";
    document.getElementById("proposed-sim-note").textContent=s.note;
    document.getElementById("proposed-sim-svg").innerHTML=lines+routeLines.join("")+nodes;
    document.getElementById("proposed-sim-status").textContent="Ready at Hub — MODQL multi-objective selection";
    step=0;
  }
  function advance(){var nodes=document.querySelectorAll("#proposed-sim-svg .proposed-sim-node"),max=nodes.length-1;step++;if(step>max){clearInterval(timer);timer=null;document.getElementById("proposed-sim-play").textContent="Play Route";step=0}nodes.forEach(function(n){var v=Number(n.getAttribute("data-visit"));n.classList.toggle("eg-active",v>0&&v<=step)});document.getElementById("proposed-sim-status").textContent=step===0?"Returned to Hub — simulation complete":"MODQL reached Stop "+Math.min(step,max)+" of "+max}
  render();
  document.getElementById("proposed-sim-play").onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent="Play Route"}else{advance();timer=setInterval(advance,900);this.textContent="Pause Route"}};
  document.getElementById("proposed-sim-reset").onclick=function(){if(timer)clearInterval(timer);timer=null;document.getElementById("proposed-sim-play").textContent="Play Route";render()};
  document.getElementById("proposed-sim-next").onclick=function(){if(timer)clearInterval(timer);timer=null;document.getElementById("proposed-sim-play").textContent="Play Route";index=(index+1)%PROPOSED_GRAPH_SCENARIOS.length;render()};
}
function wireEvaluationGraphs(){
  document.querySelectorAll(".eg-step").forEach(function(btn){
    var svg=document.getElementById(btn.getAttribute("data-graph")),status=document.getElementById(btn.getAttribute("data-graph")+"-status"),step=0,timer=null,nodes=svg.querySelectorAll(".eg-node");
    var maxStep=0;nodes.forEach(function(node){maxStep=Math.max(maxStep,Number(node.getAttribute("data-step"))||0)});
    function advance(){step++;if(step>maxStep)step=0;nodes.forEach(function(node){var n=Number(node.getAttribute("data-step"))||0;node.classList.toggle("eg-active",n>0&&n<=step)});status.textContent="Step "+step+" / "+maxStep}
    btn.onclick=function(){if(timer){clearInterval(timer);timer=null;btn.textContent="Play route step-through"}else{advance();timer=setInterval(advance,700);btn.textContent="Pause route step-through"}};
  });
}
function renderEvaluation(){
  var std=evaluationKPIs(analysisStd),mod=evaluationKPIs(analysisMod),rStd=TRAINING_RESULT.standard,rMod=TRAINING_RESULT.modql;
  function num(v,d){return Number(v||0).toFixed(d)}
  function metricTile(label,value,detail){
    return '<div class="eval-metric-tile"><div class="lab">'+label+'</div><div class="v">'+value+'</div><div class="d">'+detail+'</div></div>'
  }
  function algorithmSummaryCard(kind,title,r){
    return '<div class="eval-algo-card '+kind+'"><h4>'+title+'</h4><div class="eval-metric-grid">'+
      metricTile("Avg travel time",num(r.travel_min,1)+'<span> min</span>',"200-scenario average")+
      metricTile("Avg Jain&rsquo;s Fairness",num(r.fairness,3),"Jain index")+
      metricTile("Avg stops served",num(r.stops,2),"communities")+
      metricTile("Avg deferred",num(r.deferred,2),"communities")+
      metricTile("Avg learner coverage",num(r.coverage,2),"learners")+
    '</div></div>'
  }
  function compareMetricCard(label,stdVal,modVal,detail){
    return '<div class="eval-compare-card"><div class="lab">'+label+'</div><div class="eval-pair"><div><b>'+stdVal+'</b><span>Standard</span></div><div><b>'+modVal+'</b><span>MODQL</span></div></div><div class="d">'+detail+'</div></div>'
  }
  function routeMetricGrid(){
    return '<div class="eval-compare-grid">'+
      compareMetricCard("Total travel distance",std.distance.toFixed(1)+" km",mod.distance.toFixed(1)+" km","current route")+
      compareMetricCard("Total travel time",Math.round(std.travelMin)+" min",Math.round(mod.travelMin)+" min","current route")+
      compareMetricCard("Communities served",std.served+" of "+(NODES.length-1),mod.served+" of "+(NODES.length-1),"current route")+
      compareMetricCard("Communities deferred",std.deferred,mod.deferred,"current route")+
      compareMetricCard("Jain&rsquo;s Fairness Index",std.fairness.toFixed(3),mod.fairness.toFixed(3),"current route")+
      compareMetricCard("Learners reached",std.learners,mod.learners,"current route")+
    '</div>'
  }
  function sopMetricList(r){
    return '<div class="sop-metrics">'+
      metricTile("Coverage",num(r.coverage,2),"learners")+
      metricTile("Fairness",num(r.fairness,3),"Jain index")+
      metricTile("Travel time",num(r.travel_min,1)+'<span> min</span>',"average")+
      metricTile("Stops",num(r.stops,2),"served")+
      metricTile("Deferred",num(r.deferred,2),"communities")+
    '</div>'
  }
  var sitioRows=NODES.filter(function(n){return n.kind==="node"}).map(function(n){
    var p=path("hub",n.id),worst=1,risk="No open approach in current graph";
    if(p){p.legs.forEach(function(e){worst=Math.min(worst,accA(e));risk=accessibilityReason(e)||risk})}
    return '<tr><td>'+n.name+'</td><td>'+n.learners+' learners</td><td>'+n.days+' days</td><td>'+(p?worst.toFixed(2):'n/a')+'</td><td>'+risk+'</td></tr>'
  }).join("");
  var rewardChart=SIM.mq&&SIM.sq&&SIM.mq.length>1&&SIM.sq.length>1
    ? svgLine([{d:SIM.mq,c:"#0f9d58"},{d:SIM.sq,c:"#5b4fc7"}],{xs:SIM.ep,dp:2,h:190})+
      '<div class="lg"><span><i style="background:#0f9d58"></i> MODQL reward</span><span><i style="background:#5b4fc7"></i> Standard Q-Learning reward</span></div>'
    : '<div class="k">Training reward curve unavailable in the loaded policy bundle.</div>';
  document.getElementById("sub-evaluation").innerHTML=
    '<div class="algo-head mod"><div class="ic">&Delta;</div><div><h2>Algorithm Evaluation Dashboard</h2><p>Research &amp; Analysis results aligned with the paper SOPs and methodology</p></div></div>'+
    '<div class="sop-problem"><b>Evaluation setup.</b> Both algorithms were evaluated using the same Barangay Laiban environment, the same training/evaluation setup, and identical held-out scenarios. The values below are read from <span class="mono">TRAINED_POLICY.evaluation_summary</span> and are reported as measured, including trade-offs.</div>'+
    '<div class="card eval-summary-card"><h3>Overall Experimental Results</h3><div class="k" style="margin-bottom:12px">Authoritative 200-scenario averages from <span class="mono">TRAINED_POLICY.evaluation_summary</span>. The same Laiban environment, training/evaluation setup, and held-out scenarios were used for both algorithms.</div><div class="eval-summary-grid">'+algorithmSummaryCard("std","Standard Q-Learning",rStd)+algorithmSummaryCard("mod","MODQL",rMod)+'</div><div class="k eval-summary-note">These stored results should not be read as MODQL being superior in every metric. In this run, Standard Q-Learning records lower average travel time, slightly higher fairness, slightly more stops, and fewer deferred communities; MODQL records slightly higher learner coverage.</div></div>'+
    '<div class="card"><h3>Route Behavior Comparison</h3><div class="split2 original-algorithm-split"><div class="splitcol std"><h3>Existing Algorithm</h3><div id="comparison-existing-host"><h3 style="margin:18px 0 8px">Reference implementation — the external baseline Q-learning system this study&rsquo;s control algorithm is based on.</h3></div></div><div class="splitcol mod">'+proposedGraphHTML()+'</div></div></div>'+
    '<div class="card eval-card compact-route-metrics"><h3>Current Route Metrics</h3><div class="k" style="margin-bottom:12px">Descriptive route outputs from the same Laiban scenario shown above. These are not replacement values for the 200-scenario averages.</div>'+routeMetricGrid()+'</div>'+ 
    '<div class="card"><h3>SOP 1 &mdash; Single-Objective vs Multi-Objective</h3><div class="k" style="margin-bottom:12px">SOP 1 evaluates whether the multi-objective reward changes routing behavior and performance compared with the travel-cost-only baseline.</div><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard Q-Learning</h4><div class="k mono sop-formula">S = L<br>R = 1 / Travel Cost</div><div class="k sop-copy">The baseline evaluates routing from the current location and a travel-cost-only reward.</div>'+sopMetricList(rStd)+'</div><div class="splitcol mod"><h4>MODQL</h4><div class="k mono sop-formula">S = &lang;L,D,T,H,A&rang;<br>R = Coverage &times; Jain&rsquo;s Fairness &times; (1 / Travel Cost)</div><div class="k sop-copy">The proposed reward combines learner coverage, fairness, and travel efficiency.</div>'+sopMetricList(rMod)+'</div></div></div>'+ 
    '<div class="card"><h3>SOP 2 &mdash; Overestimation Bias</h3><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard Q-Learning</h4><div class="k mono sop-formula">Q(s,a) &larr; Q(s,a)+&alpha;[r+&gamma;max<sub>a&prime;</sub>Q(s&prime;,a&prime;)&minus;Q(s,a)]</div><div class="k sop-copy">One Q-table is used. The same estimator is involved in selecting the max-valued action and evaluating its target.</div></div><div class="splitcol mod"><h4>MODQL</h4><div class="k mono sop-formula">Q1(s,a) &larr; Q1(s,a)+&alpha;[R+&gamma;Q2(s&prime;,argmax<sub>a&prime;</sub>Q1(s&prime;,a&prime;))&minus;Q1(s,a)]<br>Q2(s,a) &larr; Q2(s,a)+&alpha;[R+&gamma;Q1(s&prime;,argmax<sub>a&prime;</sub>Q2(s&prime;,a&prime;))&minus;Q2(s,a)]</div><div class="k sop-copy">If Q1 selects, Q2 evaluates. If Q2 selects, Q1 evaluates.</div></div></div><div class="note" style="margin-top:12px"><b>Training-log evidence.</b> <span class="mono">training/outputs_aligned/training_log.csv</span> records <span class="mono">mean_q1_q2_spread</span> across '+TRAINING_LOG_STATS.rows+' episodes. The observed average spread is '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_avg,3)+', with a final value of '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_last,3)+' and a maximum of '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_max,3)+'. This is evidence of estimator disagreement during training. Double Q-Learning is designed to reduce overestimation bias through decoupled action selection and evaluation; this log alone does not prove that overestimation bias was fully eliminated.</div></div>'+ 
    '<div class="card"><h3>SOP 3 &mdash; State Representation</h3><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard State</h4><div class="k mono sop-formula">S = L</div><div class="k sop-copy">L = location. Demand, remaining time, service recency, and accessibility changes are not represented as separate state dimensions, so location-equivalent situations are treated the same.</div></div><div class="splitcol mod"><h4>MODQL State</h4><div class="k mono sop-formula">S = &lang;L,D,T,H,A&rang;</div><div class="k sop-copy">L = location; D = learner demand; T = remaining service time; H = historical visit/service recency; A = road accessibility. The richer state allows MODQL to distinguish situations Standard Q-Learning treats as the same location state.</div></div></div><div class="k" style="margin-top:12px">Road/accessibility behavior follows the Laiban environment and stakeholder-provided road-risk information, supported by public mapping references.</div><div class="eval-table-wrap"><table><thead><tr><th>Sitio</th><th>D input</th><th>H input</th><th>A from hub</th><th>Road/accessibility example</th></tr></thead><tbody>'+sitioRows+'</tbody></table></div></div>'+
    '<div class="card"><h3>Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">both algorithms</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">identical evaluation scenarios</div></div><div class="kpi"><div class="lab">Environment and seeds</div><div class="v" style="font-size:18px;line-height:1.2">same Laiban setup</div><div class="d">same environment and seeds</div></div></div><h3 style="margin-top:14px">Training Reward Across 2,000 Episodes</h3>'+rewardChart+'</div>';
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
  var k=planKPIs(analysisStd);
  var hp=TRAINING_RESULT.hyperparameters||{};
  function fmt(v,d){return Number(v||0).toFixed(d)}
  var trainingEvidence=SIM.sq&&SIM.sq.length>1
    ? svgLine([{d:SIM.sq,c:"#5b4fc7"}],{xs:SIM.ep,dp:2,h:150})+'<div class="lg"><span><i style="background:#5b4fc7"></i> Standard Q-Learning reward</span></div>'
    : '';
  document.getElementById('sub-existing').innerHTML=
    '<div class="algo-head std"><div class="ic">Q</div><div><h2>Existing Algorithm &mdash; Standard Q-Learning</h2><p>Baseline/control algorithm used in the study</p></div></div>'+ 
    '<div class="split2">'+
      '<div class="card"><h3>Existing Algorithm Overview</h3><div class="k">Standard Q-Learning is the study&rsquo;s baseline/control algorithm for learning routing decisions through repeated interaction with the simulated environment. The agent updates one Q-table until it learns which next location/action has the highest expected long-term value. The single Q-table stores the learned value of each state-action pair.</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">Algorithm</div><div class="v" style="font-size:19px">Standard Q-Learning</div><div class="d">baseline/control</div></div><div class="kpi"><div class="lab">Q-tables</div><div class="v">1</div><div class="d">single estimator</div></div><div class="kpi"><div class="lab">Training action choice</div><div class="v" style="font-size:19px">&epsilon;-greedy</div><div class="d">explore and exploit</div></div></div></div>'+
      '<div class="card"><h3>State &amp; Reward</h3><div class="split2"><div class="splitcol std"><h4>State</h4><div class="k mono" style="font-size:18px">S = L</div><div class="k">L = current location</div></div><div class="splitcol std"><h4>Reward</h4><div class="k mono" style="font-size:18px">1 / Travel Cost</div><div class="k">Lower travel cost produces a larger reward, so the baseline is directly driven by travel efficiency.</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>How the Learning Cycle Works</h3><div class="qflow"><div class="qstep"><b>1</b>Initialize Q-values</div><div class="qstep"><b>2</b>Observe current location</div><div class="qstep"><b>3</b>Select action using &epsilon;-greedy</div><div class="qstep end-row turn"><b>4</b>Travel to selected sitio</div><div class="qstep"><b>5</b>Receive reward</div><div class="qstep"><b>6</b>Observe next state</div><div class="qstep"><b>7</b>Update Q-value</div><div class="qstep end-row"><b>8</b>Repeat</div></div><div class="k" style="margin-top:14px">Exploration means trying other actions during training; exploitation means choosing the currently highest-valued action.</div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Q-Learning Update</h3><div class="k mono" style="background:var(--ink3);padding:12px;border-radius:10px;font-size:13px">Q(s,a) &larr; Q(s,a) + &alpha;[r + &gamma; max Q(s&prime;,a&prime;) &minus; Q(s,a)]</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">&alpha;</div><div class="v">'+fmt(hp.alpha,2)+'</div><div class="d">learning rate</div></div><div class="kpi"><div class="lab">&gamma;</div><div class="v">'+fmt(hp.gamma,2)+'</div><div class="d">discount factor</div></div><div class="kpi"><div class="lab">&epsilon;</div><div class="v" style="font-size:18px">'+fmt(hp.epsilon_start,2)+' &rarr; '+fmt(hp.epsilon_min,2)+'</div><div class="d">decay '+fmt(hp.epsilon_decay,3)+'</div></div></div></div>'+
      '<div class="card"><h3>Symbol Guide</h3><div class="symbol-grid"><div class="symbol-card"><div class="sym">s</div><div class="desc">current state/location</div></div><div class="symbol-card"><div class="sym">a</div><div class="desc">selected action</div></div><div class="symbol-card"><div class="sym">r</div><div class="desc">immediate reward</div></div><div class="symbol-card"><div class="sym">&alpha; = '+fmt(hp.alpha,2)+'</div><div class="desc">learning rate</div></div><div class="symbol-card"><div class="sym">&gamma; = '+fmt(hp.gamma,2)+'</div><div class="desc">discount factor</div></div><div class="symbol-card"><div class="sym">max Q(s&prime;,a&prime;)</div><div class="desc">highest estimated next-state action value</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>Why Enhancement Was Needed</h3><div class="split2"><div class="splitcol std"><h4>Single-objective reward</h4><div class="k">The reward directly focuses on travel cost.</div></div><div class="splitcol std"><h4>Overestimation Bias</h4><div class="k">Using the maximum estimated next-state Q-value can lead to overestimation of action values.</div></div><div class="splitcol std"><h4>Limited state representation</h4><div class="k">The baseline state is centered on current location only.</div></div></div><div class="k" style="margin-top:10px">Standard Q-Learning remains the valid baseline that the proposed method enhances.</div></div>'+
    '<div class="card"><h3>Actual Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">existing experiment</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">evaluation rollout</div></div><div class="kpi"><div class="lab">Comparison setup</div><div class="v" style="font-size:18px;line-height:1.2">same seeds</div><div class="d">same environment</div></div></div><div style="height:12px"></div>'+trainingEvidence+'</div>'+
    '<div class="card"><h3>Current Live Baseline Route</h3><div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">Laiban simulation today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">shared Laiban environment</div></div><div class="kpi"><div class="lab">Live travel time</div><div class="v">'+Math.round(k.totalMin)+'<span style="font-size:13px"> min</span></div><div class="d">travel plus service time</div></div></div><div style="height:12px"></div>'+stopRowsHTML(analysisStd)+'</div>'
}

function renderProposed(){
  var k=planKPIs(analysisMod),r=TRAINING_RESULT.modql;
  var hp=TRAINING_RESULT.hyperparameters||{};
  function fmt(v,d){return Number(v||0).toFixed(d)}
  var trainingEvidence=SIM.mq&&SIM.mq.length>1
    ? svgLine([{d:SIM.mq,c:"#0f9d58"}],{xs:SIM.ep,dp:2,h:150})+'<div class="lg"><span><i style="background:#0f9d58"></i> MODQL reward</span></div>'
    : '';
  document.getElementById('sub-proposed').innerHTML=
    '<div class="algo-head mod"><div class="ic">Q2</div><div><h2>Proposed Algorithm &mdash; MODQL</h2><p>Multi-Objective Double Q-Learning used by the study implementation</p></div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Proposed Algorithm Overview</h3><div class="k">Multi-Objective Double Q-Learning (MODQL) is the study&rsquo;s proposed algorithm for learning routing decisions through repeated interaction with the simulated environment. It extends Standard Q-Learning by using richer state information, a multi-objective reward, and Double Q-Learning with two Q-tables.</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">Algorithm</div><div class="v" style="font-size:19px">MODQL</div><div class="d">proposed method</div></div><div class="kpi"><div class="lab">Q-tables</div><div class="v">2</div><div class="d">Q1 and Q2</div></div><div class="kpi"><div class="lab">Training action choice</div><div class="v" style="font-size:19px">&epsilon;-greedy</div><div class="d">explore and exploit</div></div></div></div>'+
      '<div class="card"><h3>State &amp; Reward</h3><div class="split2"><div class="splitcol mod"><h4>State</h4><div class="k mono" style="font-size:18px">S = &lang;L,D,T,H,A&rang;</div><div class="k">L = current location; D = localized learner demand; T = remaining operational time; H = historical visit/recency; A = route accessibility.</div></div><div class="splitcol mod"><h4>Reward</h4><div class="k mono" style="font-size:18px">Coverage &times; Jain&rsquo;s Fairness &times; (1 / Travel Cost)</div><div class="k">The product reward makes coverage, fairness, and travel efficiency matter at the same time.</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>How MODQL Works</h3><div class="qflow"><div class="qstep"><b>1</b>Observe S=&lang;L,D,T,H,A&rang;</div><div class="qstep"><b>2</b>Select action using &epsilon;-greedy</div><div class="qstep"><b>3</b>Execute route</div><div class="qstep end-row turn"><b>4</b>Receive multi-objective reward</div><div class="qstep"><b>5</b>Update Q1 or Q2</div><div class="qstep"><b>6</b>Observe next state</div><div class="qstep"><b>7</b>Use decoupled evaluation</div><div class="qstep end-row"><b>8</b>Repeat</div></div><div class="k" style="margin-top:14px">During the update, the table that selects the best next action is not the same table used to evaluate that selected action.</div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Double Q-Learning Update</h3><div class="k mono" style="background:var(--ink3);padding:12px;border-radius:10px;font-size:12px;line-height:1.65">Q1(s,a) &larr; Q1(s,a) + &alpha;[R + &gamma; Q2(s&prime;, argmax<sub>a&prime;</sub> Q1(s&prime;,a&prime;)) &minus; Q1(s,a)]<br>Q2(s,a) &larr; Q2(s,a) + &alpha;[R + &gamma; Q1(s&prime;, argmax<sub>a&prime;</sub> Q2(s&prime;,a&prime;)) &minus; Q2(s,a)]</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">&alpha;</div><div class="v">'+fmt(hp.alpha,2)+'</div><div class="d">learning rate</div></div><div class="kpi"><div class="lab">&gamma;</div><div class="v">'+fmt(hp.gamma,2)+'</div><div class="d">discount factor</div></div><div class="kpi"><div class="lab">&epsilon;</div><div class="v" style="font-size:18px">'+fmt(hp.epsilon_start,2)+' &rarr; '+fmt(hp.epsilon_min,2)+'</div><div class="d">decay '+fmt(hp.epsilon_decay,3)+'</div></div></div></div>'+
      '<div class="card"><h3>Symbol Guide</h3><div class="symbol-grid"><div class="symbol-card"><div class="sym">s</div><div class="desc">current MODQL state</div></div><div class="symbol-card"><div class="sym">a</div><div class="desc">selected action</div></div><div class="symbol-card"><div class="sym">R</div><div class="desc">multi-objective reward</div></div><div class="symbol-card"><div class="sym">Q1 selects</div><div class="desc">Q2 evaluates when Q1 is updated</div></div><div class="symbol-card"><div class="sym">Q2 selects</div><div class="desc">Q1 evaluates when Q2 is updated</div></div><div class="symbol-card"><div class="sym">s&prime;</div><div class="desc">next enriched state after the action</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>Why It Is the Enhancement</h3><div class="g3"><div class="splitcol mod"><h4>Multi-objective reward</h4><div class="k">Addresses the single-objective limitation by using Coverage &times; Jain&rsquo;s Fairness &times; (1 / Travel Cost).</div></div><div class="splitcol mod"><h4>Double Q-Learning</h4><div class="k">Addresses overestimation bias by using Q1 and Q2 with decoupled selection and evaluation.</div></div><div class="splitcol mod"><h4>Richer state representation</h4><div class="k">Addresses limited state representation by using <span class="mono">S = &lang;L,D,T,H,A&rang;</span>.</div></div></div><div class="k" style="margin-top:10px">MODQL is presented as the proposed structural enhancement; its current stored results are reported as measured, without adding claims beyond the training output.</div></div>'+
    '<div class="card"><h3>Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">current stored run</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">evaluation rollout</div></div><div class="kpi"><div class="lab">Avg learner coverage</div><div class="v">'+fmt(r.coverage,1)+'</div><div class="d">stored MODQL evaluation</div></div></div><div style="height:12px"></div>'+trainingEvidence+'</div>'+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">Laiban simulation today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">shared Laiban environment</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="split2 eg-grid proposed-route-row">'+evaluationGraphHTML("proposed-modql-live-route","Current Laiban Simulation Route",analysisMod,"#0f9d58").replace("card eg-card","card eg-card proposed-route-visual")+'<div class="card proposed-route-stops"><h3>System-generated MODQL stops</h3>'+stopRowsHTML(analysisMod)+'</div></div><div class="card proposed-route-deferred"><h3>Deferred</h3>'+deferredHTML(analysisMod)+'</div>'
}

function renderAnalysis(){
  computeAnalysisPlans();
  renderExisting();
  renderProposed();
  renderEvaluation();
  setTimeout(function(){
    var maze=document.getElementById("sub-maze"),host=document.getElementById("comparison-existing-host");
    if(maze&&host){
      maze.classList.remove("subview","active");
      maze.classList.add("evaluation-maze");
      host.appendChild(maze);
      var note=document.createElement("div");
      note.className="note";
      note.textContent="This reference implementation uses a grid environment with a single goal. The controlled comparison against the proposed algorithm is performed on the shared Laiban road network under Algorithm Evaluation.";
      host.appendChild(note);
    }
    if(document.getElementById("proposed-sim-svg"))wireProposedGraph();
  },0);
}
document.querySelectorAll('.rn-group button[data-sub]').forEach(function(b){b.onclick=function(){document.querySelectorAll('.rn-group button[data-sub]').forEach(function(x){x.classList.remove('on')});b.classList.add('on');document.querySelectorAll('.subview').forEach(function(v){v.classList.remove('active')});var target=document.getElementById('sub-'+b.getAttribute('data-sub'));if(target)target.classList.add('active')}})
