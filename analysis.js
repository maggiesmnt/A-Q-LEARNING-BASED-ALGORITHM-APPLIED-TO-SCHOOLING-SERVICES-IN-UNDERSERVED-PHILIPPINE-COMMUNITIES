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

      component_reward:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},
      component_doubleq:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},
      component_state:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},
      pair_reward_doubleq:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},
      pair_reward_state:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},
      pair_doubleq_state:{travel_min:0,fairness:0,stops:0,deferred:0,coverage:0},

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
  rows:5000,
  mean_q1_q2_spread_avg:0.016485958269752146,
  mean_q1_q2_spread_min:0.0000005514284960317362,
  mean_q1_q2_spread_max:0.17154173027681194,
  mean_q1_q2_spread_last:0.009224951715146978
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
  return '<div class="card eg-card"><h3>'+title+'</h3><div class="k">Numbered circles show the planned stop order for the same live scenario.</div><svg id="'+id+'" class="eval-graph" viewBox="0 0 300 220" role="img" aria-label="'+title+'">'+lines+nodes+'</svg><div class="eg-legend"><span><i class="eg-open"></i>Open</span><span><i class="eg-caution"></i>Caution</span><span><i class="eg-rest"></i>Restricted</span></div><div class="k"><b>Route:</b> '+(route||"No reachable stops")+'</div><button class="btn g eg-step" data-graph="'+id+'">Play Route Sequence</button><span class="k eg-status" id="'+id+'-status">Step 0 / '+plan.stops.length+'</span></div>';
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
function proposedGraphHTML(prefix){
  return '<div class="card eg-card"><h3>MODQL Route Decision Simulation</h3><div class="k">The hub and stops are locations and possible actions. Edge labels show travel time, road styles show accessibility, and the solid route shows the selected sequence. These abstract scenarios explain MODQL behavior; they are not Laiban evaluation results.</div><div id="'+prefix+'-title" class="k" style="font-weight:800;margin-top:8px"></div><svg id="'+prefix+'-svg" class="eval-graph compact-graph" viewBox="0 0 780 360" role="img" aria-label="MODQL route decision simulation"></svg><div class="eg-legend"><span><i class="eg-selected"></i>Selected route</span><span><i class="eg-hazard"></i>Hazard / delay</span><span><i class="eg-open"></i>Open road</span><span><i class="eg-closed"></i>Closed / deferred</span></div><div class="eg-line-help"><div><b>Solid green:</b> selected route</div><div><b>Thin green:</b> available, not selected</div><div><b>Broken amber:</b> hazard or delay</div><div><b>Broken red:</b> closed or deferred</div></div><div id="'+prefix+'-note" class="k"></div><div id="'+prefix+'-status" class="k">Ready at Hub</div><div class="eg-controls"><button class="btn p" id="'+prefix+'-play">Start Route Animation</button><button class="btn g" id="'+prefix+'-reset">Reset Scenario</button><button class="btn g" id="'+prefix+'-next">Next Scenario</button></div></div>';
}
function wireProposedGraph(prefix){
  var index=0,step=0,timer=null;
  function render(){
    var s=PROPOSED_GRAPH_SCENARIOS[index],by={};s.nodes.forEach(function(n){by[n.id]=n});
    var isRouteEdge=function(e){for(var i=0;i<s.route.length-1;i++){if((e.a===s.route[i]&&e.b===s.route[i+1])||(e.b===s.route[i]&&e.a===s.route[i+1]))return true}return false};
    var lines=s.edges.filter(function(e){return !isRouteEdge(e)}).map(function(e){var a=by[e.a],b=by[e.b],cls=e.kind==="hazard"?"eg-hazard":e.kind==="closed"?"eg-closed":"eg-base-edge";return '<line class="'+cls+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/><text class="eg-time" x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2-7)+'">'+e.min+' min</text>'}).join("");
    var routeLines=[];for(var i=0;i<s.route.length-1;i++){var a=by[s.route[i]],b=by[s.route[i+1]],e=s.edges.filter(function(x){return (x.a===a.id&&x.b===b.id)||(x.a===b.id&&x.b===a.id)})[0],min=e?e.min:s.returnMin;routeLines.push('<line class="eg-route" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/><text class="eg-time" x="'+((a.x+b.x)/2)+'" y="'+((a.y+b.y)/2+13)+'">'+min+' min</text>')}
    var nodes=s.nodes.map(function(n){var visit=s.route.indexOf(n.id);return '<g class="eg-node proposed-sim-node" data-visit="'+(visit>0?visit:0)+'"><circle cx="'+n.x+'" cy="'+n.y+'" r="'+(n.hub?11:9)+'"/><text x="'+(n.x-35)+'" y="'+(n.y+32)+'">'+n.label+'</text></g>'}).join("");
    document.getElementById(prefix+"-title").textContent=s.title+" ("+(index+1)+" of "+PROPOSED_GRAPH_SCENARIOS.length+")";
    document.getElementById(prefix+"-note").textContent=s.note;
    document.getElementById(prefix+"-svg").innerHTML=lines+routeLines.join("")+nodes;
    document.getElementById(prefix+"-status").textContent="Ready at Hub — MODQL multi-objective selection";
    step=0;
  }
  function advance(){var nodes=document.querySelectorAll("#"+prefix+"-svg .proposed-sim-node"),max=nodes.length-1;step++;if(step>max){clearInterval(timer);timer=null;document.getElementById(prefix+"-play").textContent="Start Route Animation";step=0}nodes.forEach(function(n){var v=Number(n.getAttribute("data-visit"));n.classList.toggle("eg-active",v>0&&v<=step)});document.getElementById(prefix+"-status").textContent=step===0?"Returned to Hub — simulation complete":"MODQL reached Stop "+Math.min(step,max)+" of "+max}
  render();
  document.getElementById(prefix+"-play").onclick=function(){if(timer){clearInterval(timer);timer=null;this.textContent="Start Route Animation"}else{advance();timer=setInterval(advance,900);this.textContent="Pause Animation"}};
  document.getElementById(prefix+"-reset").onclick=function(){if(timer)clearInterval(timer);timer=null;document.getElementById(prefix+"-play").textContent="Start Route Animation";render()};
  document.getElementById(prefix+"-next").onclick=function(){if(timer)clearInterval(timer);timer=null;document.getElementById(prefix+"-play").textContent="Start Route Animation";index=(index+1)%PROPOSED_GRAPH_SCENARIOS.length;render()};
}
function wireEvaluationGraphs(){
  document.querySelectorAll(".eg-step").forEach(function(btn){
    var svg=document.getElementById(btn.getAttribute("data-graph")),status=document.getElementById(btn.getAttribute("data-graph")+"-status"),step=0,timer=null,nodes=svg.querySelectorAll(".eg-node");
    var maxStep=0;nodes.forEach(function(node){maxStep=Math.max(maxStep,Number(node.getAttribute("data-step"))||0)});
    function advance(){step++;if(step>maxStep)step=0;nodes.forEach(function(node){var n=Number(node.getAttribute("data-step"))||0;node.classList.toggle("eg-active",n>0&&n<=step)});status.textContent="Step "+step+" / "+maxStep}
    btn.onclick=function(){if(timer){clearInterval(timer);timer=null;btn.textContent="Play Route Sequence"}else{advance();timer=setInterval(advance,700);btn.textContent="Pause Route Sequence"}};
  });
}
function renderEvaluation(){
  var std=evaluationKPIs(analysisStd),mod=evaluationKPIs(analysisMod),rStd=TRAINING_RESULT.standard,rMod=TRAINING_RESULT.modql;
  var rReward=TRAINING_RESULT.component_reward,rDouble=TRAINING_RESULT.component_doubleq,rState=TRAINING_RESULT.component_state;
  var rRewardDouble=TRAINING_RESULT.pair_reward_doubleq,rRewardState=TRAINING_RESULT.pair_reward_state,rDoubleState=TRAINING_RESULT.pair_doubleq_state;
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
      compareMetricCard("Learner Coverage",std.learners,mod.learners,"learners reached on current route")+
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
  function ablationTable(rows){
    return '<div class="eval-table-wrap"><table><thead><tr><th>Configuration</th><th title="Average travel time in minutes">Travel Time</th><th title="Jain&rsquo;s Fairness Index">Fairness</th><th>Stops Served</th><th>Deferred</th><th title="Average learners served">Learner Coverage</th></tr></thead><tbody>'+rows.map(function(row){var r=row[1];return '<tr><th>'+row[0]+'</th><td>'+num(r.travel_min,2)+' min</td><td>'+num(r.fairness,3)+'</td><td>'+num(r.stops,3)+'</td><td>'+num(r.deferred,3)+'</td><td>'+num(r.coverage,3)+'</td></tr>'}).join('')+'</tbody></table></div>'
  }
  var sitioRows=NODES.filter(function(n){return n.kind==="node"}).map(function(n){
    var p=path("hub",n.id),worst=1,risk="No open approach in current graph";
    if(p){p.legs.forEach(function(e){worst=Math.min(worst,accA(e));risk=accessibilityReason(e)||risk})}
    return '<tr><td>'+n.name+'</td><td>'+n.learners+' learners</td><td>'+n.days+' days</td><td>'+(p?worst.toFixed(2):'n/a')+'</td><td>'+risk+'</td></tr>'
  }).join("");
  var rewardChart=SIM.mq&&SIM.sq&&SIM.mq.length>1&&SIM.sq.length>1
    ? svgLine([{d:SIM.mq,c:"#DB9558"},{d:SIM.sq,c:"#97A87A"}],{xs:SIM.ep,dp:2,h:190})+
      '<div class="lg"><span><i style="background:#DB9558"></i> MODQL reward</span><span><i style="background:#97A87A"></i> Standard Q-Learning reward</span></div>'
    : '<div class="k">Training reward curve unavailable in the loaded policy bundle.</div>';
  var spreadChart=SIM.sp&&SIM.sp.length>1
    ? '<div style="margin-top:14px"><h4>Q1&ndash;Q2 Estimator Spread Across Training</h4><div style="display:grid;grid-template-columns:24px minmax(0,1fr);align-items:center"><div class="k" style="writing-mode:vertical-rl;transform:rotate(180deg);text-align:center">Mean Q1&ndash;Q2 Spread</div><div>'+svgLine([{d:SIM.sp,c:"#DB9558"}],{xs:SIM.ep,dp:3,h:180})+'</div></div><div class="k" style="text-align:center;margin-top:4px">Training Episode</div></div>'
    : '<div class="k" style="margin-top:14px">Q1&ndash;Q2 estimator-spread curve unavailable in the loaded policy bundle.</div>';
  document.getElementById("sub-evaluation").innerHTML=
    '<div class="algo-head mod"><div class="ic">&Delta;</div><div><h2>Algorithm Comparison</h2><p>Results for Standard Q-Learning, component tests, and enhanced MODQL</p></div></div>'+
    '<div class="sop-problem"><b>Evaluation setup.</b> All experimental configurations used the same Barangay Laiban environment, training and evaluation seeds, and held-out scenarios. Values below come directly from <span class="mono">TRAINED_POLICY.evaluation_summary</span> and are reported as measured.</div>'+
    '<div class="card eval-summary-card"><h3>Overall Experimental Results</h3><div class="k" style="margin-bottom:12px">Authoritative 200-scenario averages for the baseline and Full MODQL control.</div><div class="eval-summary-grid">'+algorithmSummaryCard("std","Standard Q-Learning",rStd)+algorithmSummaryCard("mod","Full MODQL",rMod)+'</div><div class="k eval-summary-note">In this run, Standard Q-Learning records lower average travel time, slightly higher fairness, more stops, fewer deferred communities, and higher learner coverage than Full MODQL. These results describe this experiment and do not establish universal superiority for either method.</div></div>'+
    '<div class="card route-comparison-card"><h3>Route Behavior Comparison</h3><div class="split2 original-algorithm-split"><div class="splitcol std"><h3 class="comparison-panel-title">Standard Q-Learning</h3><div id="comparison-existing-host"><div class="comparison-panel-subtitle">Baseline route-learning behavior used as the control.</div><div id="comparison-reference-note" class="comparison-note-slot"></div></div></div><div class="splitcol mod"><h3 class="comparison-panel-title">Enhanced MODQL</h3>'+proposedGraphHTML("evaluation-proposed-sim")+'</div></div></div>'+
    '<div class="card eval-card compact-route-metrics"><h3>Current Route Metrics &mdash; Illustrative Single Scenario</h3><div class="k" style="margin-bottom:12px">These descriptive route outputs come from the currently displayed Laiban scenario. They are not the 200-scenario experimental averages.</div>'+routeMetricGrid()+'</div>'+
    '<div class="card"><h3>SOP 1 &mdash; Reward Function</h3><div class="k" style="margin-bottom:12px">Primary comparison: Standard versus Reward only. Learning remains single-table Standard Q-Learning and the state remains <span class="mono">S = L</span>; only the reward changes.</div><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard</h4><div class="k mono sop-formula">R<sub>standard</sub> = 1 / T<sub>hours</sub></div>'+sopMetricList(rStd)+'</div><div class="splitcol mod"><h4>Reward only</h4><div class="k mono sop-formula">R<sub>MODQL</sub> = C &times; J &times; E<sub>T</sub><br>C = normalized learner demand<br>J = Jain&rsquo;s Fairness Index<br>E<sub>T</sub> = 1 / (1 + T<sub>hours</sub>)</div>'+sopMetricList(rReward)+'</div></div><div class="k" style="margin-top:12px">Full MODQL remains overall context, but the controlled Reward-only result isolates SOP 1 evidence.</div></div>'+
    '<div class="card"><h3>SOP 2 &mdash; Double Q-Learning</h3><div class="k" style="margin-bottom:12px">Primary comparison: Standard versus Double Q only. Both use the location-only state and standard inverse-travel-time reward; only the learning update changes.</div><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard</h4><div class="k mono sop-formula">One Q-table<br>R<sub>standard</sub> = 1 / T<sub>hours</sub></div>'+sopMetricList(rStd)+'</div><div class="splitcol mod"><h4>Double Q only</h4><div class="k mono sop-formula">Q1 selects, Q2 evaluates<br>Q2 selects, Q1 evaluates</div>'+sopMetricList(rDouble)+'</div></div>'+spreadChart+'<div class="note" style="margin-top:12px"><b>Training-log summary.</b> Average spread = '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_avg,3)+'; final spread = '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_last,3)+'; maximum spread = '+num(TRAINING_LOG_STATS.mean_q1_q2_spread_max,3)+'.<br>Lower spread indicates closer agreement between the two estimators. The spread is used as a stability diagnostic and does not by itself prove elimination of overestimation bias.</div></div>'+
    '<div class="card"><h3>SOP 3 &mdash; State Representation</h3><div class="k" style="margin-bottom:12px">Primary comparison: Standard versus State only. Both use one Q-table and the standard reward; only the state representation changes.</div><div class="split2 aligned-algo-grid"><div class="splitcol std"><h4>Standard</h4><div class="k mono sop-formula">S = L</div>'+sopMetricList(rStd)+'</div><div class="splitcol mod"><h4>State only</h4><div class="k mono sop-formula">S = &lang;L,D,T,H,A&rang;</div><div class="k sop-copy">D = learner demand; T = remaining time; H = service recency; A = route accessibility.</div>'+sopMetricList(rState)+'</div></div><div class="k" style="margin-top:12px">Full MODQL remains overall context. Road/accessibility behavior follows the shared Laiban environment.</div><div class="eval-table-wrap"><table><thead><tr><th>Community</th><th title="Learner demand (D)">Learner Demand</th><th title="Days since last service (H)">Service History</th><th title="Road accessibility (A) from the hub">Accessibility</th><th>Road Condition Example</th></tr></thead><tbody>'+sitioRows+'</tbody></table></div></div>'+
    '<div class="card"><h3>Component / Ablation Analysis</h3><div class="k" style="margin-bottom:12px">Controlled 5,000-episode results using identical training and evaluation seeds.</div>'+ablationTable([["Standard",rStd],["Reward only",rReward],["Double Q only",rDouble],["State only",rState],["Full MODQL",rMod]])+'<h4 style="margin-top:16px">Pairwise diagnostics</h4>'+ablationTable([["Reward + Double Q",rRewardDouble],["Reward + State",rRewardState],["Double Q + State",rDoubleState]])+'<div class="note" style="margin-top:12px">The diagnostic analysis found the strongest weak-performance interaction in Reward + State. Under the current configuration, the <span class="mono">L+D+A</span> diagnostic reproduced the Full MODQL result. These observations are specific to the stored experiment and do not establish a general ranking.</div></div>'+
    '<div class="card"><h3>Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">current experiment</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">identical evaluation scenarios</div></div><div class="kpi"><div class="lab">Environment and seeds</div><div class="v" style="font-size:18px;line-height:1.2">same Laiban setup</div><div class="d">same environment and seeds</div></div></div><h3 style="margin-top:14px">Training Reward Across '+TRAINING_RESULT.episodes_trained+' Episodes</h3>'+rewardChart+'</div>';
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
    TRAINING_RESULT.evaluation_scenarios+' identical held-out evaluation scenarios for all compared configurations. '+
    'The official Barangay Laiban CY 2026 OSY total is used as the learner-demand basis. '+
    'Sitio-level demand allocation, historical service values, and operational time remain controlled simulation inputs where official sitio-level records were unavailable.</div>';
}

function renderExisting(){
  var k=planKPIs(analysisStd);
  var hp=TRAINING_RESULT.hyperparameters||{};
  function fmt(v,d){return Number(v||0).toFixed(d)}
  var trainingEvidence=SIM.sq&&SIM.sq.length>1
    ? svgLine([{d:SIM.sq,c:"#97A87A"}],{xs:SIM.ep,dp:2,h:150})+'<div class="lg"><span><i style="background:#97A87A"></i> Standard Q-Learning reward</span></div>'
    : '';
  document.getElementById('sub-existing').innerHTML=
    '<div class="algo-head std"><div class="ic">Q</div><div><h2>Standard Q-Learning</h2><p>Baseline algorithm used for comparison</p></div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Baseline Overview</h3><div class="k">Standard Q-Learning learns the next location from one Q-table. It is the control used to measure the effect of the proposed enhancements.</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">Algorithm</div><div class="v" style="font-size:19px">Standard Q-Learning</div><div class="d">baseline/control</div></div><div class="kpi"><div class="lab">Q-tables</div><div class="v">1</div><div class="d">single estimator</div></div><div class="kpi"><div class="lab">Training action choice</div><div class="v" style="font-size:19px">&epsilon;-greedy</div><div class="d">balances exploration and exploitation</div></div></div></div>'+
      '<div class="card"><h3>State &amp; Reward</h3><div class="split2"><div class="splitcol std"><h4>State</h4><div class="k mono" style="font-size:18px">S = L</div><div class="k">L = current location</div></div><div class="splitcol std"><h4>Reward</h4><div class="k mono" style="font-size:18px">R<sub>standard</sub> = 1 / T<sub>hours</sub></div><div class="k">Reward wording: 1 / Travel Time (hours). Lower travel time produces a larger reward.</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>How the Learning Cycle Works</h3><div class="qflow"><div class="qstep"><b>1</b>Initialize Q-values</div><div class="qstep"><b>2</b>Observe current location</div><div class="qstep"><b>3</b>Select action using &epsilon;-greedy</div><div class="qstep end-row turn"><b>4</b>Travel to selected sitio</div><div class="qstep"><b>5</b>Receive reward</div><div class="qstep"><b>6</b>Observe next state</div><div class="qstep"><b>7</b>Update Q-value</div><div class="qstep end-row"><b>8</b>Repeat</div></div><div class="k" style="margin-top:14px">Exploration means trying other actions during training; exploitation means choosing the currently highest-valued action.</div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Q-Learning Update</h3><div class="k mono" style="background:var(--ink3);padding:12px;border-radius:10px;font-size:13px">Q(s,a) &larr; Q(s,a) + &alpha;[r + &gamma; max Q(s&prime;,a&prime;) &minus; Q(s,a)]</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">&alpha;</div><div class="v">'+fmt(hp.alpha,2)+'</div><div class="d">learning rate</div></div><div class="kpi"><div class="lab">&gamma;</div><div class="v">'+fmt(hp.gamma,2)+'</div><div class="d">discount factor</div></div><div class="kpi"><div class="lab">&epsilon;</div><div class="v" style="font-size:18px">'+fmt(hp.epsilon_start,2)+' &rarr; '+fmt(hp.epsilon_min,2)+'</div><div class="d">decay '+fmt(hp.epsilon_decay,3)+'</div></div></div></div>'+
      '<div class="card"><h3>Symbol Guide</h3><div class="symbol-grid"><div class="symbol-card"><div class="sym">s</div><div class="desc">current state/location</div></div><div class="symbol-card"><div class="sym">a</div><div class="desc">selected action</div></div><div class="symbol-card"><div class="sym">r</div><div class="desc">immediate reward</div></div><div class="symbol-card"><div class="sym">&alpha; = '+fmt(hp.alpha,2)+'</div><div class="desc">learning rate</div></div><div class="symbol-card"><div class="sym">&gamma; = '+fmt(hp.gamma,2)+'</div><div class="desc">discount factor</div></div><div class="symbol-card"><div class="sym">max Q(s&prime;,a&prime;)</div><div class="desc">highest estimated next-state action value</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>Why Enhancement Was Needed</h3><div class="split2"><div class="splitcol std"><h4>Single-objective reward</h4><div class="k">The reward directly focuses on travel time.</div></div><div class="splitcol std"><h4>Overestimation Bias</h4><div class="k">Using the maximum estimated next-state Q-value can lead to overestimation of action values.</div></div><div class="splitcol std"><h4>Limited state representation</h4><div class="k">The baseline state is centered on current location only.</div></div></div><div class="k" style="margin-top:10px">Standard Q-Learning remains the valid baseline that the proposed method enhances.</div></div>'+
    '<div class="card"><h3>Actual Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">existing experiment</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">evaluation rollout</div></div><div class="kpi"><div class="lab">Comparison setup</div><div class="v" style="font-size:18px;line-height:1.2">same seeds</div><div class="d">same environment</div></div></div><div style="height:12px"></div>'+trainingEvidence+'</div>'+
    '<div class="card"><h3>Current Standard Q-Learning Route</h3><div class="g3"><div class="kpi"><div class="lab">Learner Coverage</div><div class="v">'+k.learners+'</div><div class="d">current Laiban scenario</div></div><div class="kpi"><div class="lab">Route Distance</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">current Laiban scenario</div></div><div class="kpi"><div class="lab">Travel + Service Time</div><div class="v">'+Math.round(k.totalMin)+'<span style="font-size:13px"> min</span></div><div class="d">current route total</div></div></div><div style="height:12px"></div>'+stopRowsHTML(analysisStd)+'</div>'
}

function renderProposed(){
  var k=planKPIs(analysisMod),r=TRAINING_RESULT.modql;
  var hp=TRAINING_RESULT.hyperparameters||{};
  function fmt(v,d){return Number(v||0).toFixed(d)}
  var trainingEvidence=SIM.mq&&SIM.mq.length>1
    ? svgLine([{d:SIM.mq,c:"#DB9558"}],{xs:SIM.ep,dp:2,h:150})+'<div class="lg"><span><i style="background:#DB9558"></i> MODQL reward</span></div>'
    : '';
  document.getElementById('sub-proposed').innerHTML=
    '<div class="algo-head mod"><div class="ic">Q2</div><div><h2>Enhanced MODQL</h2><p>Multi-Objective Double Q-Learning proposed by the study</p></div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Enhanced Algorithm Overview</h3><div class="k">MODQL adds a richer state, a multi-objective reward, and two Q-tables to Standard Q-Learning.</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">Algorithm</div><div class="v" style="font-size:19px">MODQL</div><div class="d">proposed method</div></div><div class="kpi"><div class="lab">Q-tables</div><div class="v">2</div><div class="d">Q1 and Q2</div></div><div class="kpi"><div class="lab">Training action choice</div><div class="v" style="font-size:19px">&epsilon;-greedy</div><div class="d">balances exploration and exploitation</div></div></div></div>'+
      '<div class="card"><h3>State &amp; Reward</h3><div class="split2"><div class="splitcol mod"><h4>State</h4><div class="k mono" style="font-size:18px">S = &lang;L,D,T,H,A&rang;</div><div class="k">L = current location; D = localized learner demand; T = remaining operational time; H = historical visit/recency; A = route accessibility.</div></div><div class="splitcol mod"><h4>Reward</h4><div class="k mono" style="font-size:18px">R<sub>MODQL</sub> = C &times; J &times; E<sub>T</sub></div><div class="k">C = Normalized Learner Demand<br>J = Jain&rsquo;s Fairness Index<br>E<sub>T</sub> = 1 / (1 + T<sub>hours</sub>)</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>How MODQL Works</h3><div class="qflow"><div class="qstep"><b>1</b>Observe S=&lang;L,D,T,H,A&rang;</div><div class="qstep"><b>2</b>Select action using &epsilon;-greedy</div><div class="qstep"><b>3</b>Execute route</div><div class="qstep end-row turn"><b>4</b>Receive multi-objective reward</div><div class="qstep"><b>5</b>Update Q1 or Q2</div><div class="qstep"><b>6</b>Observe next state</div><div class="qstep"><b>7</b>Use decoupled evaluation</div><div class="qstep end-row"><b>8</b>Repeat</div></div><div class="k" style="margin-top:14px">During the update, the table that selects the best next action is not the same table used to evaluate that selected action.</div></div>'+
    '<div class="split2">'+
      '<div class="card"><h3>Double Q-Learning Update</h3><div class="k mono" style="background:var(--ink3);padding:12px;border-radius:10px;font-size:12px;line-height:1.65">Q1(s,a) &larr; Q1(s,a) + &alpha;[R + &gamma; Q2(s&prime;, argmax<sub>a&prime;</sub> Q1(s&prime;,a&prime;)) &minus; Q1(s,a)]<br>Q2(s,a) &larr; Q2(s,a) + &alpha;[R + &gamma; Q1(s&prime;, argmax<sub>a&prime;</sub> Q2(s&prime;,a&prime;)) &minus; Q2(s,a)]</div><div class="existing-mini-grid" style="margin-top:12px"><div class="kpi"><div class="lab">&alpha;</div><div class="v">'+fmt(hp.alpha,2)+'</div><div class="d">learning rate</div></div><div class="kpi"><div class="lab">&gamma;</div><div class="v">'+fmt(hp.gamma,2)+'</div><div class="d">discount factor</div></div><div class="kpi"><div class="lab">&epsilon;</div><div class="v" style="font-size:18px">'+fmt(hp.epsilon_start,2)+' &rarr; '+fmt(hp.epsilon_min,2)+'</div><div class="d">decay '+fmt(hp.epsilon_decay,3)+'</div></div></div></div>'+
      '<div class="card"><h3>Symbol Guide</h3><div class="symbol-grid"><div class="symbol-card"><div class="sym">s</div><div class="desc">current MODQL state</div></div><div class="symbol-card"><div class="sym">a</div><div class="desc">selected action</div></div><div class="symbol-card"><div class="sym">R</div><div class="desc">multi-objective reward</div></div><div class="symbol-card"><div class="sym">Q1 selects</div><div class="desc">Q2 evaluates when Q1 is updated</div></div><div class="symbol-card"><div class="sym">Q2 selects</div><div class="desc">Q1 evaluates when Q2 is updated</div></div><div class="symbol-card"><div class="sym">s&prime;</div><div class="desc">next enriched state after the action</div></div></div></div>'+
    '</div>'+
    '<div class="card"><h3>Why It Is the Enhancement</h3><div class="g3"><div class="splitcol mod"><h4>Multi-objective reward</h4><div class="k">Uses <span class="mono">R<sub>MODQL</sub> = C &times; J &times; E<sub>T</sub></span> to combine normalized learner demand, Jain fairness, and bounded travel efficiency.</div></div><div class="splitcol mod"><h4>Double Q-Learning</h4><div class="k">Addresses overestimation bias by using Q1 and Q2 with decoupled selection and evaluation.</div></div><div class="splitcol mod"><h4>Richer state representation</h4><div class="k">Addresses limited state representation by using <span class="mono">S = &lang;L,D,T,H,A&rang;</span>.</div></div></div><div class="k" style="margin-top:10px">MODQL is the proposed structural enhancement. Its current stored results are reported neutrally and do not show superiority across all metrics.</div></div>'+
    '<div class="card"><h3>Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">current stored run</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">evaluation rollout</div></div><div class="kpi"><div class="lab">Avg learner coverage</div><div class="v">'+fmt(r.coverage,1)+'</div><div class="d">stored MODQL evaluation</div></div></div><div style="height:12px"></div>'+trainingEvidence+'</div>'+
    '<div class="g3"><div class="kpi"><div class="lab">Live learners reached</div><div class="v">'+k.learners+'</div><div class="d">Laiban simulation today</div></div><div class="kpi"><div class="lab">Live route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">shared Laiban environment</div></div><div class="kpi"><div class="lab">Live Jain&rsquo;s J</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">descriptive only</div></div></div><div style="height:12px"></div>'+
    '<div class="split2 eg-grid proposed-route-row">'+proposedGraphHTML("tab-proposed-sim").replace("card eg-card","card eg-card proposed-route-visual")+'<div class="card proposed-route-stops"><h3>Current MODQL Stop Plan</h3>'+stopRowsHTML(analysisMod)+'</div></div><div class="card proposed-route-deferred"><h3>Deferred Communities</h3>'+deferredHTML(analysisMod)+'</div>'
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
      var implementationNote=maze.querySelector(".note");
      var implementationTarget=document.getElementById("comparison-implementation-note");
      if(implementationNote&&implementationTarget)implementationTarget.appendChild(implementationNote);
      var note=document.createElement("div");
      note.className="note";
      note.textContent="This reference implementation uses a grid environment with a single goal. The controlled comparison against the proposed algorithm is performed on the shared Laiban road network under Algorithm Evaluation.";
      var referenceTarget=document.getElementById("comparison-reference-note");
      if(referenceTarget)referenceTarget.appendChild(note);
    }
    if(document.getElementById("tab-proposed-sim-svg"))wireProposedGraph("tab-proposed-sim");
    if(document.getElementById("evaluation-proposed-sim-svg"))wireProposedGraph("evaluation-proposed-sim");
  },0);
}
document.querySelectorAll('.rn-group button[data-sub]').forEach(function(b){b.onclick=function(){document.querySelectorAll('.rn-group button[data-sub]').forEach(function(x){x.classList.remove('on')});b.classList.add('on');document.querySelectorAll('.subview').forEach(function(v){v.classList.remove('active')});var target=document.getElementById('sub-'+b.getAttribute('data-sub'));if(target)target.classList.add('active')}})
