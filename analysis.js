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
var LAIBAN_GRID_POSITIONS={
  maysawa:[0,0],toyang:[1,0],hub:[2,0],iwi_iw:[3,0],magata:[4,0],
  ibucao:[0,1],banatas:[1,1],old_laiban:[2,1],kilabuwan:[3,1],manggahan:[4,1]
};
var LAIBAN_GRID_TIMERS={};
function laibanGridPoint(id){
  var p=LAIBAN_GRID_POSITIONS[id];
  return {x:130+p[0]*230,y:155+p[1]*270};
}
function laibanGridEscape(value){
  return String(value).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]});
}
function laibanGridRoute(plan){
  var sequence=["hub"];
  (plan.stops||[]).forEach(function(stop){
    if(stop.p&&stop.p.seq)sequence=sequence.concat(stop.p.seq.slice(1));
  });
  if(plan.ret&&plan.ret.seq)sequence=sequence.concat(plan.ret.seq.slice(1));
  return sequence.filter(function(id,index){return index===0||id!==sequence[index-1]});
}
function laibanGridRoadControl(start,end,edge){
  var dx=end.x-start.x,dy=end.y-start.y,length=Math.sqrt(dx*dx+dy*dy)||1;
  var nx=-dy/length,ny=dx/length,candidates=[-180,180,-216,216,-144,144,-108,108,-72,72,-36,36,0],best=null,bestHits=Infinity;
  candidates.forEach(function(offset){
    var control={x:(start.x+end.x)/2+nx*offset,y:(start.y+end.y)/2+ny*offset},hits=0;
    for(var step=1;step<10;step++){
      var t=step/10,u=1-t,x=u*u*start.x+2*u*t*control.x+t*t*end.x,y=u*u*start.y+2*u*t*control.y+t*t*end.y;
      NODES.forEach(function(node){
        if(node.id===edge.a||node.id===edge.b)return;
        var point=laibanGridPoint(node.id);
        if(Math.abs(x-point.x)<96&&Math.abs(y-point.y)<64)hits++;
      });
    }
    if(hits<bestHits){best=control;bestHits=hits}
    if(hits===0)return;
  });
  return best;
}
function laibanGridPanelHTML(id,title,plan,comparison){
  var stops={};(plan.stops||[]).forEach(function(stop,index){stops[stop.id]=index+1});
  var edgeMarkup=EDGES.map(function(edge){
    var start=laibanGridPoint(edge.a),end=laibanGridPoint(edge.b),control=laibanGridRoadControl(start,end,edge);
    var cx=control.x,cy=control.y,labelX=.25*start.x+.5*cx+.25*end.x,labelY=.25*start.y+.5*cy+.25*end.y;
    var access=accA(edge),status=band(access),color=roadDisplayColor(status.k),travel=Math.round(edgeMin(edge));
    var dash=edge.graph_status==="qa_connector"?"5 7":edge.graph_status==="inferred_connector"?"8 6":status.k==="caut"?"7 5":status.k==="rest"?"4 5":status.k==="cls"?"3 5":"";
    return '<g class="laiban-grid-road '+status.k+'" data-edge="'+ek(edge.a,edge.b)+'"><title>'+laibanGridEscape(N[edge.a].name+' ↔ '+N[edge.b].name+' · '+travel+' min · '+status.lab+' · A='+access.toFixed(2))+'</title><path d="M '+start.x+' '+start.y+' Q '+cx+' '+cy+' '+end.x+' '+end.y+'" fill="none" stroke="'+color+'" stroke-width="'+(edge.graph_status==="qa_connector"?3.5:5)+'" stroke-linecap="round" stroke-dasharray="'+dash+'" opacity="'+(edge.graph_status==="qa_connector"?.55:.92)+'"/><rect class="laiban-grid-time-bg" x="'+(labelX-40)+'" y="'+(labelY-15)+'" width="80" height="30" rx="15"/><text class="laiban-grid-time" x="'+labelX+'" y="'+labelY+'">'+travel+' min</text></g>';
  }).join("");
  var nodeMarkup=NODES.map(function(node){
    var point=laibanGridPoint(node.id),order=stops[node.id],hub=node.kind==="depot",fullName=laibanGridEscape(node.name),name=laibanGridEscape(hub?"Laiban Hub":node.name.replace(/^Sitio /,"")),detail=hub?"Deployment hub":node.learners+" learners";
    return '<g class="laiban-grid-node'+(hub?" hub":"")+'" transform="translate('+point.x+' '+point.y+')" data-node="'+node.id+'"><title>'+fullName+'</title><rect x="-82" y="-50" width="164" height="100" rx="13"/><circle class="laiban-grid-node-icon" cx="-62" cy="-31" r="13"/><text class="laiban-grid-node-mark" x="-62" y="-31">'+(hub?"H":String.fromCharCode(65+SERVICE_IDS.indexOf(node.id)))+'</text><text class="laiban-grid-node-name" x="0" y="7">'+name+'</text><text class="laiban-grid-node-detail" x="0" y="29">'+detail+'</text>'+(order?'<circle class="laiban-grid-order" cx="65" cy="-35" r="13"/><text class="laiban-grid-order-text" x="65" y="-35">'+order+'</text>':'')+'</g>';
  }).join("");
  var routeNodes=laibanGridRoute(plan).map(function(nodeId,index){
    return (index?'<span class="laiban-grid-route-arrow" aria-hidden="true">→</span>':'')+'<span class="laiban-grid-route-chip">'+laibanGridEscape(N[nodeId].name)+'</span>';
  }).join("");
  var hubPoint=laibanGridPoint("hub");
  return '<section class="card laiban-grid-card'+(comparison?" laiban-grid-comparison":"")+'"><h3>'+title+'</h3><p class="k laiban-grid-description">Schematic grid of the active Laiban road network. Each tile is the actual hub or one of the nine sitios; road colors use the current accessibility bands. Tile placement is schematic, not geographic. The existing Drive map remains available.</p><div class="laiban-grid-scroll"><svg id="'+id+'-svg" class="laiban-grid-svg" viewBox="25 70 1110 455" role="img" aria-label="Schematic grid of the Laiban hub, nine sitios, and road accessibility"><rect class="laiban-grid-board" x="30" y="75" width="1100" height="445" rx="18"/>'+edgeMarkup+'<g id="'+id+'-route-trail"></g>'+nodeMarkup+'<g id="'+id+'-van" class="laiban-grid-van" transform="translate('+(hubPoint.x+62)+' '+(hubPoint.y-34)+')"><rect x="-16" y="-11" width="32" height="20" rx="6"/><path d="M-8 -11l5 -7h11l7 7"/><circle cx="-8" cy="11" r="4"/><circle cx="9" cy="11" r="4"/></g></svg></div><div class="laiban-grid-legend"><span><i class="open"></i>Open</span><span><i class="caut"></i>Caution</span><span><i class="rest"></i>Restricted</span><span><i class="cls"></i>Closed</span><span><i class="route"></i>Planned route / vehicle</span></div><div class="laiban-grid-route-summary"><b>Current MODQL route:</b><div class="laiban-grid-route-chips">'+(routeNodes||'<span class="laiban-grid-route-chip">No planned route</span>')+'</div></div><div class="laiban-grid-status" id="'+id+'-status" aria-live="polite">Ready at Laiban Proper / ALS Hub</div><div class="laiban-grid-controls"><button class="btn p" id="'+id+'-play" type="button">Play Route</button><button class="btn g" id="'+id+'-step" type="button">Step</button><button class="btn g" id="'+id+'-reset" type="button">Reset</button></div></section>';
}
function wireLaibanGrid(id,plan){
  if(LAIBAN_GRID_TIMERS[id])clearInterval(LAIBAN_GRID_TIMERS[id]);
  LAIBAN_GRID_TIMERS[id]=null;
  var svg=document.getElementById(id+"-svg"),van=document.getElementById(id+"-van"),status=document.getElementById(id+"-status"),play=document.getElementById(id+"-play"),step=document.getElementById(id+"-step"),reset=document.getElementById(id+"-reset");
  if(!svg||!van||!status||!play||!step||!reset)return;
  var sequence=laibanGridRoute(plan),position=0,trail=document.getElementById(id+"-route-trail");
  function draw(){
    var point=laibanGridPoint(sequence[position]),isHub=sequence[position]==="hub";
    if(isHub){point.x+=62;point.y-=34}
    van.setAttribute("transform","translate("+point.x+" "+point.y+")");
    trail.innerHTML="";
    for(var i=1;i<=position;i++){
      var from=laibanGridPoint(sequence[i-1]),to=laibanGridPoint(sequence[i]);
      trail.innerHTML+='<path class="laiban-grid-trail" d="M '+from.x+' '+from.y+' L '+to.x+' '+to.y+'"/>';
    }
    var current=N[sequence[position]],next=position<sequence.length-1?N[sequence[position+1]]:null;
    status.textContent=(current?current.name:"Laiban Proper / ALS Hub")+" · "+position+" / "+(sequence.length-1)+" road steps"+(next?" · next: "+next.name:" · route complete");
  }
  function advance(){
    if(position>=sequence.length-1){if(LAIBAN_GRID_TIMERS[id])clearInterval(LAIBAN_GRID_TIMERS[id]);LAIBAN_GRID_TIMERS[id]=null;play.textContent="Play Route";return false}
    position++;draw();
    if(position>=sequence.length-1){if(LAIBAN_GRID_TIMERS[id])clearInterval(LAIBAN_GRID_TIMERS[id]);LAIBAN_GRID_TIMERS[id]=null;play.textContent="Play Route";return false}
    return true;
  }
  play.onclick=function(){
    if(LAIBAN_GRID_TIMERS[id]){clearInterval(LAIBAN_GRID_TIMERS[id]);LAIBAN_GRID_TIMERS[id]=null;play.textContent="Play Route";return}
    if(position>=sequence.length-1){position=0;draw()}
    play.textContent="Pause";
    LAIBAN_GRID_TIMERS[id]=setInterval(function(){if(!advance()){play.textContent="Play Route"}},850);
    advance();
  };
  step.onclick=function(){if(LAIBAN_GRID_TIMERS[id]){clearInterval(LAIBAN_GRID_TIMERS[id]);LAIBAN_GRID_TIMERS[id]=null;play.textContent="Play Route"}advance()};
  reset.onclick=function(){if(LAIBAN_GRID_TIMERS[id])clearInterval(LAIBAN_GRID_TIMERS[id]);LAIBAN_GRID_TIMERS[id]=null;position=0;play.textContent="Play Route";draw()};
  draw();
}
var COMPARISON_GRID_POSITIONS={
  maysawa:[1,1],toyang:[4,1],ibucao:[7,1],hub:[4,4],iwi_iw:[8,4],
  banatas:[1,6],old_laiban:[4,6],kilabuwan:[4,8],manggahan:[6,8],magata:[8,8]
};
var COMPARISON_GRID_ROAD_WAYPOINTS={
  "hub|toyang":[[4,4],[4,1]],
  "hub|ibucao":[[4,4],[5,4],[5,2],[7,2],[7,1]],
  "hub|maysawa":[[4,4],[1,4],[1,1]],
  "hub|old_laiban":[[4,4],[4,6]],
  "banatas|hub":[[1,6],[1,5],[4,5],[4,4]],
  "hub|iwi_iw":[[4,4],[4,5],[8,5],[8,4]],
  "kilabuwan|old_laiban":[[4,8],[4,6]],
  "kilabuwan|manggahan":[[4,8],[6,8]],
  "magata|manggahan":[[8,8],[6,8]],
  "banatas|old_laiban":[[1,6],[4,6]]
};
var COMPARISON_GRID_ROUTE_WAYPOINTS={
  "hub|maysawa":[[4,4],[4,3],[1,3],[1,1]],
  "hub|iwi_iw":[[4,4],[5,4],[5,3],[8,3],[8,4]],
  "banatas|old_laiban":[[4,6],[3,6],[3,7],[1,7],[1,6]]
};
var COMPARISON_GRID_HAZARD_POINTS={
  "hub|toyang":[[4,2]],
  "hub|ibucao":[[6,2]],
  "hub|maysawa":[[2,4]],
  "banatas|hub":[[2,5]],
  "hub|iwi_iw":[[6,5]],
  "kilabuwan|old_laiban":[[4,7]],
  "kilabuwan|manggahan":[[5,8]],
  "magata|manggahan":[[7,8]],
  "banatas|old_laiban":[[2,6]]
};
var COMPARISON_GRID_COLUMNS=10,COMPARISON_GRID_ROWS=10,COMPARISON_GRID_CELL=50;
function comparisonGridKey(point){return point[0]+","+point[1]}
function comparisonGridPath(points){
  var cells=[points[0].slice()];
  for(var i=1;i<points.length;i++){
    var from=points[i-1],to=points[i],x=from[0],y=from[1];
    while(x!==to[0]){x+=x<to[0]?1:-1;cells.push([x,y])}
    while(y!==to[1]){y+=y<to[1]?1:-1;cells.push([x,y])}
  }
  return cells;
}
function comparisonGridPathForEdge(edge,waypoints){
  var cells=comparisonGridPath(waypoints);
  if(comparisonGridKey(cells[0])!==comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.a])||
     comparisonGridKey(cells[cells.length-1])!==comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.b])){
    cells.reverse();
  }
  if(comparisonGridKey(cells[0])!==comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.a])||
     comparisonGridKey(cells[cells.length-1])!==comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.b])){
    throw new Error("MODQL comparison grid corridor endpoints mismatch for "+edge.key);
  }
  cells.forEach(function(cell){
    if(cell[0]<0||cell[0]>=COMPARISON_GRID_COLUMNS||cell[1]<0||cell[1]>=COMPARISON_GRID_ROWS){
      throw new Error("MODQL comparison grid corridor leaves the grid for "+edge.key);
    }
  });
  return cells;
}
function comparisonGridTargetData(plan){
  var servedOrder={};(plan.stops||[]).forEach(function(stop,index){servedOrder[stop.id]=index+1});
  var deferred={};(plan.deferred||[]).forEach(function(site){deferred[site.id]=site.reason||""});
  return NODES.map(function(node){
    var isHub=node.kind==="depot";
    var reason=deferred[node.id]||"";
    var order=servedOrder[node.id]||null;
    var isUnreachable=!!reason&&reason.indexOf("no open corridor")>=0;
    var status=isHub?"Hub":order?"Stop "+order:isUnreachable?"Closed road":"Deferred";
    return {
      id:node.id,
      name:node.name,
      letter:isHub?"Hub":String.fromCharCode(65+SERVICE_IDS.indexOf(node.id)),
      position:COMPARISON_GRID_POSITIONS[node.id],
      order:order,
      deferred:!!reason,
      reason:reason||(!isHub&&!order?"Reason not recorded":""),
      status:status,
      tooltipStatus:isHub?"Hub (start / return)":order?"Stop "+order:isUnreachable?"Unreachable - closed road":"Deferred - not selected",
      learners:node.learners,
      days:node.days,
      isHub:isHub
    };
  });
}
function comparisonGridModel(plan){
  var edgePaths={},roadCells={},hazardCells={},hazardRoadKeys=[],steps=[],stopEvents=[],activeEdgeKeys={},stopOrder=(plan.stops||[]).map(function(stop){return stop.id});
  var deferredIds=(plan.deferred||[]).map(function(item){return item.id});
  plan.stops.forEach(function(stop){stop.p.legs.forEach(function(edge){activeEdgeKeys[edge.key]=true})});
  if(plan.ret)plan.ret.legs.forEach(function(edge){activeEdgeKeys[edge.key]=true});
  EDGES.forEach(function(edge){
    var key=ek(edge.a,edge.b),roadWaypoints=COMPARISON_GRID_ROAD_WAYPOINTS[key];
    if(!roadWaypoints)throw new Error("Missing MODQL comparison grid corridor for "+key);
    var status=band(accA(edge)).k,isHazard=status==="rest"||status==="cls";
    var roadPath=comparisonGridPathForEdge(edge,roadWaypoints);
    var routePath=activeEdgeKeys[key]&&COMPARISON_GRID_ROUTE_WAYPOINTS[key]
      ?comparisonGridPathForEdge(edge,COMPARISON_GRID_ROUTE_WAYPOINTS[key])
      :roadPath;
    edgePaths[key]=routePath;
    roadPath.forEach(function(cell){
      var cellKey=comparisonGridKey(cell),existing=roadCells[cellKey],active=!!activeEdgeKeys[key];
      if(!existing||(active&&!existing.active)){
        roadCells[cellKey]={status:status,edge:key,active:active,route:active&&routePath.some(function(routeCell){return comparisonGridKey(routeCell)===cellKey})};
      }
    });
    routePath.forEach(function(cell){
      var cellKey=comparisonGridKey(cell),existing=roadCells[cellKey];
      if(!existing||activeEdgeKeys[key]){
        roadCells[cellKey]={status:status,edge:key,active:!!activeEdgeKeys[key],route:!!activeEdgeKeys[key]};
      }
    });
    if(isHazard){
      var hazardWaypoints=COMPARISON_GRID_HAZARD_POINTS[key];
      if(!hazardWaypoints)throw new Error("Missing MODQL road hazard cell for "+key);
      var hazardPath=hazardWaypoints;
      hazardPath.forEach(function(cell){
        var cellKey=comparisonGridKey(cell);
        if(roadPath.every(function(roadCell){return comparisonGridKey(roadCell)!==cellKey})){
          throw new Error("MODQL road hazard is outside its corridor for "+key);
        }
        if(comparisonGridKey(cell)===comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.a])||
           comparisonGridKey(cell)===comparisonGridKey(COMPARISON_GRID_POSITIONS[edge.b])){
          throw new Error("MODQL road hazard overlaps a target for "+key);
        }
        hazardCells[cellKey]=hazardCells[cellKey]||[];
        if(hazardCells[cellKey].indexOf(key)<0)hazardCells[cellKey].push(key);
      });
      hazardRoadKeys.push(key);
    }
  });
  Object.keys(COMPARISON_GRID_HAZARD_POINTS).forEach(function(key){
    if(!EK[key])throw new Error("Unknown MODQL grid hazard road "+key);
  });
  var blockedKeys=Object.keys(hazardCells),targetKeys={};
  NODES.forEach(function(node){targetKeys[comparisonGridKey(COMPARISON_GRID_POSITIONS[node.id])]=true});
  var blockedTarget=blockedKeys.some(function(key){return !!targetKeys[key]});
  var travelMin=0;
  function appendSegment(pathData,targetId,completesStop){
    if(!pathData||!pathData.seq||!pathData.legs||pathData.seq.length!==pathData.legs.length+1){
      throw new Error("Incomplete MODQL route leg data for "+(targetId||"hub return"));
    }
    pathData.legs.forEach(function(edge,index){
      var fromId=pathData.seq[index],toId=pathData.seq[index+1],key=ek(fromId,toId),cells=edgePaths[key];
      if(!cells||!EK[key]||edge.key!==key)throw new Error("MODQL route is missing its grid corridor for "+key);
      if(accA(EK[key])<.20)throw new Error("MODQL route uses a closed grid corridor for "+key);
      var directed=cells.map(function(cell){return cell.slice()});
      if(EK[key].a!==fromId)directed.reverse();
      directed.forEach(function(cell){
        if(hazardCells[comparisonGridKey(cell)]){
          throw new Error("MODQL comparison route enters a blocked road hazard on "+key);
        }
      });
      travelMin+=edgeMin(EK[key]);
      for(var cellIndex=1;cellIndex<directed.length;cellIndex++){
        steps.push({
          cell:directed[cellIndex],
          from:directed[cellIndex-1],
          fromId:cellIndex===1?fromId:null,
          toId:cellIndex===directed.length-1?toId:null,
          targetId:targetId,
          completesStopId:completesStop&&cellIndex===directed.length-1?targetId:null
        });
      }
    });
    if(completesStop){
      if(!steps.length)throw new Error("MODQL stop has no grid movement: "+targetId);
      stopEvents.push({id:targetId,step:steps.length});
    }
  }
  (plan.stops||[]).forEach(function(stop){
    appendSegment(stop.p,stop.id,true);
  });
  if(plan.ret)appendSegment(plan.ret,"hub",false);
  return {
    edgePaths:edgePaths,
    roadCells:roadCells,
    hazardCells:hazardCells,
    hazardRoadKeys:hazardRoadKeys,
    blockedTarget:blockedTarget,
    steps:steps,
    stopEvents:stopEvents,
    stopOrder:stopOrder,
    deferredIds:deferredIds,
    travelMin:travelMin,
    targets:comparisonGridTargetData(plan)
  };
}
function comparisonGridAssertConsistency(plan,model){
  var expectedStops=(plan.stops||[]).map(function(stop){return stop.id});
  var renderedStops=model.stopEvents.map(function(stop){return stop.id});
  var expectedServed=expectedStops.slice().sort();
  var renderedServed=model.targets.filter(function(target){return target.order!==null}).map(function(target){return target.id}).sort();
  var expectedDeferred=(plan.deferred||[]).map(function(item){return item.id}).sort();
  var renderedDeferred=model.targets.filter(function(target){return target.deferred}).map(function(target){return target.id}).sort();
  var expectedHazards=EDGES.filter(function(edge){var status=band(accA(edge)).k;return status==="rest"||status==="cls"}).map(function(edge){return ek(edge.a,edge.b)}).sort();
  var renderedHazards=model.hazardRoadKeys.slice().sort();
  var expectedMinutes=(plan.stops||[]).reduce(function(total,stop){return total+stop.p.min},0)+(plan.ret?plan.ret.min:0);
  var expectedTravel=expectedStops.reduce(function(total,id,index){return total+plan.stops[index].p.min},0)+(plan.ret?plan.ret.min:0);
  var routesAvoidHazards=model.steps.every(function(step){return !model.hazardCells[comparisonGridKey(step.cell)]});
  var routeTargetCollision=model.steps.some(function(step){
    return model.targets.some(function(target){return comparisonGridKey(target.position)===comparisonGridKey(step.cell)&&step.toId!==target.id});
  });
  var expectedLetters=NODES.map(function(node){return node.kind==="depot"?"Hub":String.fromCharCode(65+SERVICE_IDS.indexOf(node.id))});
  var renderedLetters=model.targets.map(function(target){return target.letter});
  var expectedTargetIds=NODES.map(function(node){return node.id});
  var renderedTargetIds=model.targets.map(function(target){return target.id});
  var targetsMatchData=model.targets.every(function(target,index){
    var node=NODES[index],expectedReason=(plan.deferred||[]).filter(function(item){return item.id===node.id})[0];
    var reason=expectedReason?expectedReason.reason||"":"";
    var order=expectedStops.indexOf(node.id);
    var status=node.kind==="depot"?"Hub":order>=0?"Stop "+(order+1):reason.indexOf("no open corridor")>=0?"Closed road":"Deferred";
    return target.name===node.name&&target.learners===node.learners&&target.days===node.days&&
      target.order===(order>=0?order+1:null)&&target.deferred===!!expectedReason&&
      target.reason===(reason||(!target.isHub&&order<0?"Reason not recorded":""))&&target.status===status&&
      comparisonGridKey(target.position)===comparisonGridKey(COMPARISON_GRID_POSITIONS[node.id]);
  });
  var targetPositions=model.targets.map(function(target){return comparisonGridKey(target.position)});
  var result={
    stopCount:expectedStops.length===model.stopEvents.length,
    stopOrder:expectedStops.join("|")===renderedStops.join("|"),
    servedSitios:expectedServed.join("|")===renderedServed.join("|"),
    deferredSitios:expectedDeferred.join("|")===renderedDeferred.join("|"),
    hazardRoads:expectedHazards.join("|")===renderedHazards.join("|"),
    hazardCells:!model.blockedTarget&&expectedHazards.every(function(key){return Object.keys(model.hazardCells).some(function(cell){return model.hazardCells[cell].indexOf(key)>=0})})&&Object.keys(model.hazardCells).every(function(key){return model.hazardCells[key].every(function(roadKey){return expectedHazards.indexOf(roadKey)>=0})}),
    routesAvoidHazards:routesAvoidHazards,
    routeAvoidsUnplannedTargets:!routeTargetCollision,
    travelTime:Math.abs(expectedTravel-model.travelMin)<1e-8&&Math.abs(expectedMinutes-model.travelMin)<1e-8,
    targetData:expectedTargetIds.join("|")===renderedTargetIds.join("|")&&expectedLetters.join("|")===renderedLetters.join("|")&&targetsMatchData&&new Set(targetPositions).size===NODES.length&&new Set(renderedLetters).size===NODES.length
  };
  result.passed=result.stopCount&&result.stopOrder&&result.servedSitios&&result.deferredSitios&&result.hazardRoads&&result.hazardCells&&result.routesAvoidHazards&&result.travelTime&&result.targetData;
  var isDevelopment=location.protocol==="file:"||location.hostname==="localhost"||location.hostname==="127.0.0.1";
  if(isDevelopment){
    if(!result.passed)throw new Error("MODQL grid consistency check failed: "+JSON.stringify(result));
    window.__MODQL_GRID_CONSISTENCY__=result;
    console.assert(result.passed,"MODQL grid consistency check",result);
  }
  return result;
}
function comparisonGridAssertTableData(model){
  var isDevelopment=location.protocol==="file:"||location.hostname==="localhost"||location.hostname==="127.0.0.1";
  if(!isDevelopment)return true;
  var rows=document.querySelectorAll("#comparison-modql-grid .comparison-grid-table tbody tr"),byId={};
  rows.forEach(function(row){byId[row.getAttribute("data-site")]=row});
  var rowDataMatches=model.targets.every(function(target){
    var row=byId[target.id];
    if(!row)return false;
    var cells=row.querySelectorAll("td"),shortName=target.name.replace(/^Sitio /,"");
    return Number(row.getAttribute("data-learners"))===target.learners&&
      Number(row.getAttribute("data-last-visit"))===target.days&&
      Number(row.getAttribute("data-order")||0)===(target.order||0)&&
      (row.getAttribute("data-deferred")==="true")===target.deferred&&
      cells.length===4&&cells[0].querySelector(".comparison-grid-table-letter").textContent===target.letter&&
      cells[0].textContent.indexOf(shortName)>=0&&Number(cells[1].textContent)===target.learners&&
      cells[2].textContent===target.days+" d"&&cells[3].textContent===target.status&&
      cells[3].getAttribute("title")===(target.reason||target.status);
  });
  var result={rowCount:rows.length===model.targets.length,learnersAndVisitDays:rowDataMatches,stopOrder:model.targets.filter(function(target){return target.order!==null}).length===model.stopEvents.length,deferredSet:model.targets.filter(function(target){return target.deferred}).map(function(target){return target.id}).sort().join("|")===model.deferredIds.slice().sort().join("|")};
  result.passed=result.rowCount&&result.learnersAndVisitDays&&result.stopOrder&&result.deferredSet;
  if(!result.passed)throw new Error("MODQL grid table consistency check failed: "+JSON.stringify(result));
  window.__MODQL_GRID_TABLE_CONSISTENCY__=result;
  return result;
}
function comparisonGridPanelHTML(plan,model){
  var targets=model.targets.map(function(target){
    var x=target.position[0]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2;
    var y=target.position[1]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2;
    var label=target.isHub?"Laiban Proper / ALS Hub":target.name;
    var markerDescription=label+(target.isHub?"":" · "+target.learners+" learners · last visit "+target.days+" days ago · "+target.tooltipStatus+(target.reason?": "+target.reason:""));
    return '<g class="comparison-grid-target'+(target.isHub?" is-hub":"")+(target.deferred?" is-deferred":"")+'" data-target="'+target.id+'" transform="translate('+x+' '+y+')" tabindex="0" role="img" aria-label="'+laibanGridEscape(markerDescription)+'"><title>'+laibanGridEscape(markerDescription)+'</title><circle class="comparison-grid-marker" r="18"/>'+(target.isHub?'<path class="comparison-grid-hub-icon" d="M-10 0L0-9 10 0V9H-10ZM-3 9V2H3V9"/>':'<text class="comparison-grid-letter" y="1">'+target.letter+'</text>')+(target.order?'<circle class="comparison-grid-order" cx="14" cy="-14" r="8"/><text class="comparison-grid-order-text" x="14" y="-14">'+target.order+'</text>':'')+(!target.isHub?'<circle class="comparison-grid-learners" cx="14" cy="14" r="8"/><text class="comparison-grid-learners-text" x="14" y="14">'+target.learners+'</text>':'')+'</g>';
  }).join("");
  var cells=[];
  for(var row=0;row<COMPARISON_GRID_ROWS;row++)for(var col=0;col<COMPARISON_GRID_COLUMNS;col++){
    var key=col+","+row,road=model.roadCells[key],hazards=model.hazardCells[key]||[],status=road?road.status:"floor";
    var classes="comparison-grid-cell "+(hazards.length?"hazard "+(hazards.some(function(roadKey){return band(accA(EK[roadKey])).k==="cls"})?"closed":"restricted"):road?"road-"+status+(road.route?" planned-route":""):"floor");
    var title=hazards.length?'<title>Road hazard: '+hazards.map(function(roadKey){return laibanGridEscape(N[EK[roadKey].a].name+" ↔ "+N[EK[roadKey].b].name+" · "+band(accA(EK[roadKey])).lab)}).join("; ")+'</title>':road?'<title>'+laibanGridEscape(N[EK[road.edge].a].name+" ↔ "+N[EK[road.edge].b].name+" · "+band(accA(EK[road.edge])).lab)+'</title>':'';
    cells.push('<rect class="'+classes+'" data-cell="'+key+'" x="'+(col*COMPARISON_GRID_CELL+1)+'" y="'+(row*COMPARISON_GRID_CELL+1)+'" width="'+(COMPARISON_GRID_CELL-2)+'" height="'+(COMPARISON_GRID_CELL-2)+'" rx="3">'+title+'</rect>');
  }
  var tableTargets=model.targets.filter(function(target){return !target.isHub}).sort(function(a,b){
    return a.letter.localeCompare(b.letter);
  });
  tableTargets.push(model.targets.filter(function(target){return target.isHub})[0]);
  var tableRows=tableTargets.map(function(target){
    var rowStatus=target.status,tooltip=target.reason||rowStatus;
    var displayName=target.isHub?"Laiban Proper / ALS Hub":target.name.replace(/^Sitio /,"");
    return '<tr data-site="'+target.id+'" data-learners="'+target.learners+'" data-last-visit="'+target.days+'" data-order="'+(target.order||"")+'" data-deferred="'+(target.deferred?"true":"false")+'" tabindex="0" aria-label="'+laibanGridEscape(target.letter+" · "+target.name+" · "+rowStatus+(target.reason?" · "+target.reason:""))+'"><td><span class="comparison-grid-table-letter">'+target.letter+'</span>&nbsp;'+laibanGridEscape(displayName)+'</td><td>'+target.learners+'</td><td>'+target.days+' d</td><td title="'+laibanGridEscape(tooltip)+'" aria-label="'+laibanGridEscape(rowStatus+(target.reason?" · "+target.reason:""))+'"><span class="comparison-grid-row-status">'+laibanGridEscape(rowStatus)+'</span></td></tr>';
  }).join("");
  var hub=COMPARISON_GRID_POSITIONS.hub,vanX=hub[0]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2-14,vanY=hub[1]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2+14;
  return '<section class="comparison-grid-panel" id="comparison-modql-grid">'+
    '<h3 class="comparison-panel-title">Proposed System — MODQL</h3>'+
    '<div class="comparison-grid-header"><div class="comparison-grid-heading"><h4 class="comparison-grid-subtitle">Laiban Route Demonstration - MODQL Agent</h4><span class="pill open">MODQL ROUTE PLAN</span></div><p class="comparison-grid-description">The grid uses the existing MODQL route plan and real node data. Tile placement is schematic, not geographic.</p></div>'+
    '<div class="comparison-grid-layout">'+
      '<div class="comparison-grid-info"><section class="comparison-grid-status" aria-label="MODQL route status"><h4 class="comparison-grid-status-heading">MODQL Maze Status</h4><div class="comparison-grid-status-grid"><div><span>Animation step</span><b id="comparison-modql-grid-step-count">0 / '+model.steps.length+'</b></div><div><span>Current stop</span><b id="comparison-modql-grid-location">Laiban Proper / ALS Hub</b></div><div><span>Next destination</span><b id="comparison-modql-grid-destination">'+(plan.stops.length?laibanGridEscape(N[plan.stops[0].id].name):"No planned stop")+'</b></div><div><span>Stops completed</span><b id="comparison-modql-grid-completed">0 / '+plan.stops.length+'</b></div><div><span>Latest movement</span><b id="comparison-modql-grid-movement">At start</b></div><div><span>Total travel time</span><b id="comparison-modql-grid-time">'+model.travelMin.toFixed(1)+' min</b></div></div><div class="comparison-grid-decision" id="comparison-modql-grid-decision"></div></section><div class="comparison-grid-legend"><div class="comparison-grid-keys"><span><i class="floor"></i>Traversable road</span><span><i class="blocked"></i>Road hazard</span><span class="comparison-grid-hazard-outlines"><i class="rest"></i>Restricted <i class="cls"></i>Closed</span><span><i class="open"></i>Open</span><span><i class="caut"></i>Caution</span><span><i class="trail"></i>Route trail</span></div></div></div>'+
      '<div class="comparison-grid-visual"><div class="comparison-grid-scroll"><svg class="comparison-grid-svg" viewBox="0 0 500 500" role="img" aria-label="Ten by ten MODQL grid with the Laiban hub and nine sitios"><rect class="comparison-grid-board" x="0" y="0" width="500" height="500" rx="10"/>'+cells.join("")+'<g id="comparison-modql-grid-trail"></g>'+targets+'<g id="comparison-modql-grid-van" transform="translate('+vanX+' '+vanY+')"><circle class="comparison-grid-agent" r="9"/></g></svg></div>'+
      '<div class="comparison-grid-controls"><button class="btn p" id="comparison-modql-grid-play" type="button">Start Animation</button><button class="btn g" id="comparison-modql-grid-next" type="button">Advance One Step</button><button class="btn g" id="comparison-modql-grid-reset" type="button">Reset</button></div>'+
      '<section class="algorithm-summary-card"><h4>Proposed MODQL</h4><p>Two Q-tables (Q1/Q2) are used. One is chosen at random per update to select the action while the other evaluates it. The state includes location, demand, remaining service time, visit history, and accessibility. The reward multiplies learner coverage, service fairness (Jain\'s Fairness Index), and travel efficiency.</p></section>'+
      '</div>'+
    '</div>'+
    '<div class="comparison-grid-table-section"><h4 class="comparison-grid-sites-heading">Sitios</h4><div class="comparison-grid-table-scroll"><table class="comparison-grid-table"><thead><tr><th>Letter + Sitio</th><th>Learners</th><th>Last visit</th><th>Status</th></tr></thead><tbody>'+tableRows+'</tbody></table></div><p class="comparison-grid-footnote">Learner counts and visit history are simulated allocations, not verified sitio-level records.</p></div></section>';
}
var COMPARISON_GRID_TIMERS={};
function wireComparisonGrid(plan,model){
  var id="comparison-modql-grid",svg=document.querySelector("#"+id+" .comparison-grid-svg"),van=document.getElementById(id+"-van"),trail=document.getElementById(id+"-trail"),play=document.getElementById(id+"-play"),next=document.getElementById(id+"-next"),reset=document.getElementById(id+"-reset");
  if(!svg||!van||!trail||!play||!next||!reset)return;
  comparisonGridAssertTableData(model);
  if(COMPARISON_GRID_TIMERS[id])clearInterval(COMPARISON_GRID_TIMERS[id]);
  COMPARISON_GRID_TIMERS[id]=null;
  var current=0,completed={};
  var stepReadout=document.getElementById(id+"-step-count"),locationReadout=document.getElementById(id+"-location"),destinationReadout=document.getElementById(id+"-destination"),completedReadout=document.getElementById(id+"-completed"),movementReadout=document.getElementById(id+"-movement");
  var decisionReadout=document.getElementById(id+"-decision"),table=document.querySelector("#"+id+" .comparison-grid-table");
  var activeTargetId=null,pinnedTarget=false;
  function coord(cell){return {x:cell[0]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2,y:cell[1]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2}}
  function highlightLinkedTarget(nodeId,pin){
    if(pin){pinnedTarget=!(pinnedTarget&&activeTargetId===nodeId);activeTargetId=pinnedTarget?nodeId:null}
    svg.querySelectorAll(".comparison-grid-target").forEach(function(target){
      target.classList.toggle("is-linked-highlight",target.getAttribute("data-target")===activeTargetId);
    });
    if(table)table.querySelectorAll("tbody tr").forEach(function(row){
      row.classList.toggle("is-linked-highlight",row.getAttribute("data-site")===activeTargetId);
    });
  }
  function hoverLinkedTarget(nodeId){
    if(pinnedTarget)return;
    activeTargetId=nodeId;
    highlightLinkedTarget(nodeId,false);
  }
  function clearLinkedTarget(nodeId){
    if(pinnedTarget||activeTargetId!==nodeId)return;
    activeTargetId=null;
    highlightLinkedTarget(null,false);
  }
  function syncTableRows(currentId,nextId){
    if(!table)return;
    table.querySelectorAll("tbody tr").forEach(function(row){
      var nodeId=row.getAttribute("data-site");
      row.classList.toggle("is-done",!!completed[nodeId]);
      row.classList.toggle("is-current",nodeId===currentId);
      row.classList.toggle("is-next",nodeId===nextId);
    });
  }
  function updateDecision(nextStop){
    if(!decisionReadout)return;
    if(nextStop){
      var access=band(routeAccessibility(nextStop.p)).lab;
      decisionReadout.textContent="Next: "+N[nextStop.id].name+" - "+nextStop.p.min.toFixed(1)+" min, "+N[nextStop.id].learners+" learners, access "+access;
    }else if(plan.ret){
      decisionReadout.textContent="Next: Laiban Proper / ALS Hub - "+plan.ret.min.toFixed(1)+" min, 0 learners, access "+band(routeAccessibility(plan.ret)).lab;
    }else{
      decisionReadout.textContent="Next: No planned stop";
    }
  }
  function updateTargets(){
    svg.querySelectorAll(".comparison-grid-target").forEach(function(target){
      var nodeId=target.getAttribute("data-target");
      target.classList.toggle("is-served",!!completed[nodeId]);
      target.classList.toggle("is-next",plan.stops.some(function(stop,index){return stop.id===nodeId&&index===Object.keys(completed).length}));
    });
  }
  function draw(){
    var step=current?model.steps[current-1]:null,point=step?step.cell:COMPARISON_GRID_POSITIONS.hub,position=coord(point),nodeId=step?step.toId:"hub";
    if(nodeId&&comparisonGridKey(point)===comparisonGridKey(COMPARISON_GRID_POSITIONS[nodeId])){
      position.x-=14;
      position.y+=14;
    }
    van.setAttribute("transform","translate("+position.x+" "+position.y+")");
    var visited={};
    for(var i=0;i<current;i++)visited[comparisonGridKey(model.steps[i].cell)]=true;
    trail.innerHTML=Object.keys(visited).map(function(key){
      var cell=key.split(",").map(Number);
      return '<circle class="comparison-grid-trail-cell" cx="'+(cell[0]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2)+'" cy="'+(cell[1]*COMPARISON_GRID_CELL+COMPARISON_GRID_CELL/2)+'" r="8"/>';
    }).join("");
    for(var stepIndex=0;stepIndex<current;stepIndex++){
      var stopId=model.steps[stepIndex].completesStopId;
      if(stopId)completed[stopId]=true;
    }
    updateTargets();
    var locationId=current?(step.toId||null):"hub",currentStop=locationId?N[locationId]:null;
    var completedCount=Object.keys(completed).length,nextStop=plan.stops[completedCount];
    var latestNodeId="hub";
    for(var nodeStep=0;nodeStep<current;nodeStep++){
      if(model.steps[nodeStep].toId)latestNodeId=model.steps[nodeStep].toId;
    }
    stepReadout.textContent=current+" / "+model.steps.length;
    locationReadout.textContent=currentStop?currentStop.name:"Schematic road corridor";
    destinationReadout.textContent=nextStop?N[nextStop.id].name:(plan.ret?"Return to Laiban Proper / ALS Hub":"No planned stop");
    completedReadout.textContent=completedCount+" / "+plan.stops.length;
    movementReadout.textContent=step?step.cell[0]<step.from[0]?"Left":step.cell[0]>step.from[0]?"Right":step.cell[1]<step.from[1]?"Up":"Down":"At start";
    syncTableRows(locationId||latestNodeId,nextStop?nextStop.id:(plan.ret?"hub":null));
    updateDecision(nextStop);
  }
  function advance(){
    if(current>=model.steps.length)return false;
    current++;
    draw();
    if(current>=model.steps.length){
      if(COMPARISON_GRID_TIMERS[id])clearInterval(COMPARISON_GRID_TIMERS[id]);
      COMPARISON_GRID_TIMERS[id]=null;
      play.textContent="Start Animation";
      return false;
    }
    return true;
  }
  play.onclick=function(){
    if(COMPARISON_GRID_TIMERS[id]){
      clearInterval(COMPARISON_GRID_TIMERS[id]);COMPARISON_GRID_TIMERS[id]=null;play.textContent="Start Animation";return;
    }
    if(current>=model.steps.length){current=0;completed={};draw()}
    if(!model.steps.length)return;
    play.textContent="Pause Animation";
    COMPARISON_GRID_TIMERS[id]=setInterval(function(){if(!advance())play.textContent="Start Animation"},260);
    advance();
  };
  next.onclick=function(){
    if(COMPARISON_GRID_TIMERS[id]){clearInterval(COMPARISON_GRID_TIMERS[id]);COMPARISON_GRID_TIMERS[id]=null;play.textContent="Start Animation"}
    advance();
  };
  reset.onclick=function(){
    if(COMPARISON_GRID_TIMERS[id])clearInterval(COMPARISON_GRID_TIMERS[id]);
    COMPARISON_GRID_TIMERS[id]=null;current=0;completed={};play.textContent="Start Animation";draw();
  };
  svg.querySelectorAll(".comparison-grid-target").forEach(function(target){
    var nodeId=target.getAttribute("data-target");
    target.addEventListener("mouseenter",function(){hoverLinkedTarget(nodeId)});
    target.addEventListener("mouseleave",function(){clearLinkedTarget(nodeId)});
    target.addEventListener("focus",function(){hoverLinkedTarget(nodeId)});
    target.addEventListener("blur",function(){clearLinkedTarget(nodeId)});
    target.addEventListener("click",function(){highlightLinkedTarget(nodeId,true)});
    target.addEventListener("keydown",function(event){
      if(event.key==="Enter"||event.key===" "){event.preventDefault();highlightLinkedTarget(nodeId,true)}
    });
  });
  if(table){
    table.querySelectorAll("tbody tr").forEach(function(row){
      var nodeId=row.getAttribute("data-site");
      row.addEventListener("mouseenter",function(){hoverLinkedTarget(nodeId)});
      row.addEventListener("mouseleave",function(){clearLinkedTarget(nodeId)});
      row.addEventListener("focus",function(){hoverLinkedTarget(nodeId)});
      row.addEventListener("blur",function(){clearLinkedTarget(nodeId)});
      row.addEventListener("click",function(){highlightLinkedTarget(nodeId,true)});
      row.addEventListener("keydown",function(event){
        if(event.key==="Enter"||event.key===" "){event.preventDefault();highlightLinkedTarget(nodeId,true)}
      });
    });
  }
  var panel=document.getElementById(id);
  panel.addEventListener("click",function(event){
    if(!event.target.closest(".comparison-grid-table tr")&&!event.target.closest(".comparison-grid-target")){
      activeTargetId=null;pinnedTarget=false;highlightLinkedTarget(null,false);
    }
  });
  draw();
}
function renderEvaluation(){
  var comparisonGrid=comparisonGridModel(analysisMod);
  comparisonGridAssertConsistency(analysisMod,comparisonGrid);
  document.getElementById("sub-evaluation").innerHTML=
    '<header class="route-comparison-intro"><h2>Route Behavior Comparison</h2><p class="route-maze-note">The Standard panel is the original random-maze demonstration. The MODQL panel visualizes its actual Laiban service route. These are different environments and their displayed paths are not a controlled performance comparison; controlled results use the separate shared-Laiban evaluation.</p></header><div class="split2 original-algorithm-split">'+
      '<section class="splitcol std"><h3 class="comparison-panel-title">Standard Q-Learning</h3><div id="comparison-standard-maze-host"></div></section>'+
      comparisonGridPanelHTML(analysisMod,comparisonGrid)+
    '</div>';
  wireComparisonGrid(analysisMod,comparisonGrid);
}

// Coordinates are deterministic schematic cells, not geographic locations.
// Every edge maps to an orthogonal, exclusive corridor except the shared hub junction.
var FIXED_MAZE_NODES={hub:[5,5],toyang:[1,1],ibucao:[9,1],maysawa:[5,0],iwi_iw:[0,5],old_laiban:[5,8],banatas:[9,7],kilabuwan:[2,8],manggahan:[0,8],magata:[0,9]};
var FIXED_MAZE_EDGES={
  "hub|toyang":[[5,5],[4,5],[4,4],[3,4],[3,3],[3,2],[3,1],[2,1],[1,1]],
  "hub|ibucao":[[5,5],[6,5],[6,4],[7,4],[8,4],[9,4],[9,3],[9,2],[9,1]],
  "hub|maysawa":[[5,5],[5,4],[5,3],[5,2],[5,1],[5,0]],
  "hub|old_laiban":[[5,5],[5,6],[5,7],[5,8]],
  "banatas|hub":[[5,5],[6,5],[6,6],[7,6],[8,6],[9,6],[9,7]],
  "hub|iwi_iw":[[5,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,5]],
  "kilabuwan|old_laiban":[[5,8],[4,8],[3,8],[2,8]],
  "kilabuwan|manggahan":[[2,8],[1,8],[0,8]],
  "magata|manggahan":[[0,8],[0,9]],
  "banatas|old_laiban":[[9,7],[9,8],[8,8],[7,8],[6,8],[5,8]]
};
function fixedMazeKey(p){return p[0]+","+p[1]}
function buildFixedLaibanMaze(){
  var layout={size:10,nodes:{},edges:{},open:new Set(),junction:new Set(),errors:[]};
  Object.keys(FIXED_MAZE_NODES).forEach(function(id){layout.nodes[id]=FIXED_MAZE_NODES[id].slice();layout.open.add(fixedMazeKey(layout.nodes[id]))});
  NODES.forEach(function(n){if(!layout.nodes[n.id])layout.errors.push("No fixed cell mapped for "+n.id)});
  EDGES.forEach(function(e){var k=ek(e.a,e.b),path=FIXED_MAZE_EDGES[k];if(!path){layout.errors.push("No schematic corridor for "+k);return}
    if(fixedMazeKey(path[0])!==fixedMazeKey(layout.nodes[e.a])||fixedMazeKey(path[path.length-1])!==fixedMazeKey(layout.nodes[e.b]))layout.errors.push("Corridor endpoints mismatch: "+k);
    path.forEach(function(p,i){if(p[0]<0||p[0]>9||p[1]<0||p[1]>9)layout.errors.push("Cell outside grid: "+k);if(i&&Math.abs(p[0]-path[i-1][0])+Math.abs(p[1]-path[i-1][1])!==1)layout.errors.push("Non-adjacent corridor cells: "+k);if(!layout.junction.has(fixedMazeKey(p)))layout.open.add(fixedMazeKey(p))});
    layout.edges[k]=path.map(function(p){return p.slice()});
  });
  return layout;
}
function mapMazeRoute(plan,layout){
  var frames=[],errors=[],stops=plan&&plan.stops||[];
  function append(p,label){if(!p||!p.seq||!p.legs||p.seq.length!==p.legs.length+1){errors.push(label+": incomplete route leg data");return}
    p.legs.forEach(function(leg,i){var from=p.seq[i],to=p.seq[i+1],key=ek(from,to),edge=EK[key],cells=layout.edges[key];if(!edge||!leg||leg.key!==key||!cells){errors.push(label+": graph edge has no validated schematic path ("+key+")");return}if(accA(edge)<.20){errors.push(label+": actual route uses a currently blocked edge ("+key+")");return}cells=cells.map(function(cell){return cell.slice()});if(edge.a!==from)cells.reverse();frames.push({from:from,to:to,target:p.seq[p.seq.length-1],cells:cells,label:label})});
  }
  stops.forEach(function(s,i){append(s.p,"Stop "+(i+1))});if(plan&&plan.ret)append(plan.ret,"Return");
  return {frames:frames,errors:errors};
}
function fixedMazePanel(id,title,plan,mapped,cls,layout){
  var summary=[N[plan.start||"hub"].name].concat((plan.stops||[]).map(function(s){return N[s.id].name+" ("+Math.round(s.p.min)+" min)"}));if(plan.ret)summary.push("Hub return ("+Math.round(plan.ret.min)+" min)");
  var stops={};(plan.stops||[]).forEach(function(s,i){stops[s.id]=i+1});
  var legend=NODES.map(function(n){var idx=Object.keys(layout.nodes).filter(function(k){return k!=="hub"}).indexOf(n.id),mark=n.id==="hub"?"H":String.fromCharCode(65+idx);return "<span><b>"+mark+"</b> "+n.name+(stops[n.id]?" · stop "+stops[n.id]:"")+"</span>"}).join("");
  var errs=layout.errors.concat(mapped.errors);
  return '<section class="splitcol route-maze-column '+cls+'"><h3 class="comparison-panel-title">'+title+'</h3><div class="route-maze-map modql-maze-map"><div class="modql-maze-layout"><div class="route-maze-status-card modql-maze-status-card"><h4>MODQL Maze Status</h4><div><span>Status</span><b id="'+id+'-playback">Ready</b></div><div><span>Animation step</span><b id="'+id+'-steps">0 / 0</b></div><div><span>Current stop</span><b id="'+id+'-location">Laiban Proper / ALS Hub</b></div><div><span>Next destination</span><b id="'+id+'-destination">No planned stop</b></div><div><span>Stops completed</span><b id="'+id+'-completed">0 / '+(plan.stops||[]).length+'</b></div><div><span>Latest movement</span><b id="'+id+'-action">None</b></div><div class="modql-maze-key"><span><i class="maze-agent-key"></i> MODQL vehicle</span><span><i class="maze-goal-key"></i> Hub / community</span><span><i class="maze-wall-key"></i> Blocked cell</span></div></div><canvas id="'+id+'" width="500" height="500" class="route-maze-canvas" role="img" aria-label="'+title+' on a fixed 10 by 10 cell maze"></canvas></div><div class="route-maze-legend modql-route-legend"><span><i class="maze-cell-key"></i>Traversable road corridor</span><span><i class="route-maze-legend-wall"></i>Blocked cell</span><span><i class="maze-route-key '+cls+'"></i>Actual route trail</span><span>Access: <em style="color:#3D8A60">open</em> / <em style="color:#C28A2C">caution</em> / <em style="color:#B5683C">restricted</em></span></div><div class="route-maze-community-legend">'+legend+'</div><div class="route-maze-sequence"><b>Actual route:</b> '+summary.join(" &rarr; ")+'<br>Corridor cells are visualization-only; stop order and travel minutes come from the algorithm plan.</div>'+(errs.length?'<div class="route-maze-warning">Display limitation: '+errs.join("; ")+'. Unverified segments are not drawn.</div>':'')+'<div class="route-maze-controls modql-maze-controls"><button class="btn p" id="'+id+'-play" type="button">Start Route Animation</button><button class="btn g" id="'+id+'-step" type="button">Advance One Cell</button><button class="btn g" id="'+id+'-reset" type="button">Reset</button></div></div></section>';
}
var FIXED_MAZE_TIMERS={};
function wireFixedMaze(id,plan,mapped,layout,cls){
  if(FIXED_MAZE_TIMERS[id])clearInterval(FIXED_MAZE_TIMERS[id]);FIXED_MAZE_TIMERS[id]=null;
  var canvas=document.getElementById(id),play=document.getElementById(id+"-play"),next=document.getElementById(id+"-step"),reset=document.getElementById(id+"-reset");
  if(!canvas||!canvas.getContext)return;var ctx=canvas.getContext("2d"),steps=[],current=0,color=cls==="route-standard"?"#456B32":"#D47E35";
  function theme(name,fallback){var css=window.getComputedStyle(document.body).getPropertyValue(name).trim();return css||fallback}
  mapped.frames.forEach(function(f){f.cells.forEach(function(cell,i){if(i===0)return;steps.push({cell:cell,from:f.cells[i-1],frame:f})})});
  var stopMap={};(plan.stops||[]).forEach(function(s,i){stopMap[s.id]=i+1});
  var playback=document.getElementById(id+"-playback"),stepReadout=document.getElementById(id+"-steps"),locationReadout=document.getElementById(id+"-location"),destinationReadout=document.getElementById(id+"-destination"),completedReadout=document.getElementById(id+"-completed"),actionReadout=document.getElementById(id+"-action"),serviceByCell={};
  Object.keys(layout.nodes).forEach(function(nodeId){serviceByCell[fixedMazeKey(layout.nodes[nodeId])]=nodeId});
  function direction(from,to){var dr=to[0]-from[0],dc=to[1]-from[1];return dr<0?"Up":dr>0?"Down":dc<0?"Left":dc>0?"Right":"At location"}
  function updateStatus(state){if(!playback)return;stepReadout.textContent=current+" / "+steps.length;playback.textContent=state;var at=current?steps[current-1].cell:layout.nodes.hub,nodeId=serviceByCell[fixedMazeKey(at)],frame=current?steps[current-1].frame:null,nextFrame=frame||mapped.frames[0],target=nextFrame&&nextFrame.target;locationReadout.textContent=nodeId?N[nodeId].name:"Schematic corridor";destinationReadout.textContent=nodeId&&nodeId===target?"Reached · "+N[target].name:(target?N[target].name:"No planned stop");var completed=0;(plan.stops||[]).forEach(function(stop){if(stopMap[stop.id]&&steps.slice(0,current).some(function(s){return fixedMazeKey(s.cell)===fixedMazeKey(layout.nodes[stop.id])}))completed++});completedReadout.textContent=completed+" / "+(plan.stops||[]).length;actionReadout.textContent=current?direction(steps[current-1].from,at):"None"}
  function draw(){
    var size=50,wall=theme("--maze-wall","#B9AB6B"),cell=theme("--maze-cell","#F7F0E2"),grid=theme("--maze-grid","#C9B99B"),goal=theme("--maze-goal","#5E6828"),agent=theme("--maze-agent","#8A633F");ctx.clearRect(0,0,500,500);
    for(var r=0;r<10;r++)for(var c=0;c<10;c++){var key=r+","+c,open=layout.open.has(key),node=Object.keys(layout.nodes).filter(function(id){return fixedMazeKey(layout.nodes[id])===key})[0],closed=false,access=1;EDGES.forEach(function(e){if(layout.edges[e.key].some(function(p){return fixedMazeKey(p)===key})){var a=accA(e);if(a<.20)closed=true;else access=Math.min(access,a)}});ctx.fillStyle=closed||!open?wall:cell;ctx.fillRect(c*size,r*size,size,size);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.strokeRect(c*size+.5,r*size+.5,size,size);if(open&&!closed&&!node){ctx.beginPath();ctx.arc(c*size+size-7,r*size+7,3,0,Math.PI*2);ctx.fillStyle=access>=.75?"#3D8A60":access>=.45?"#C28A2C":"#B5683C";ctx.fill()}}
    for(var i=0;i<current;i++){var p=steps[i].cell;ctx.beginPath();ctx.arc(p[1]*size+25,p[0]*size+25,size*.10,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
    Object.keys(layout.nodes).filter(function(id){return id!=="hub"}).forEach(function(id){var p=layout.nodes[id],letter=String.fromCharCode(65+Object.keys(layout.nodes).filter(function(k){return k!=="hub"}).indexOf(id)),n=stopMap[id];ctx.beginPath();ctx.arc(p[1]*size+25,p[0]*size+25,13,0,Math.PI*2);ctx.fillStyle=cell;ctx.fill();ctx.strokeStyle=goal;ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=theme("--txt","#29351E");ctx.font="bold 13px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(letter,p[1]*size+25,p[0]*size+25);if(n){ctx.beginPath();ctx.arc(p[1]*size+40,p[0]*size+10,8,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 9px sans-serif";ctx.fillText(String(n),p[1]*size+40,p[0]*size+10)}});
    var h=layout.nodes.hub;ctx.beginPath();ctx.arc(h[1]*size+25,h[0]*size+25,14,0,Math.PI*2);ctx.fillStyle=goal;ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 13px sans-serif";ctx.fillText("H",h[1]*size+25,h[0]*size+25);
    if(current&&steps.length){var a=steps[Math.min(current-1,steps.length-1)].cell;ctx.beginPath();ctx.arc(a[1]*size+25,a[0]*size+25,8,0,Math.PI*2);ctx.fillStyle=agent;ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.stroke()}
  }
  function advance(){if(current>=steps.length)return;current++;draw();if(current===steps.length){if(FIXED_MAZE_TIMERS[id])clearInterval(FIXED_MAZE_TIMERS[id]);FIXED_MAZE_TIMERS[id]=null;play.textContent="Start Route Animation";updateStatus("Complete")}else updateStatus(FIXED_MAZE_TIMERS[id]?"Playing":"Paused")}
  play.onclick=function(){if(FIXED_MAZE_TIMERS[id]){clearInterval(FIXED_MAZE_TIMERS[id]);FIXED_MAZE_TIMERS[id]=null;play.textContent="Start Route Animation";updateStatus("Paused")}else{if(current>=steps.length)current=0;if(!steps.length){updateStatus("No route steps");return}advance();if(current<steps.length){FIXED_MAZE_TIMERS[id]=setInterval(advance,200);play.textContent="Pause Animation";updateStatus("Playing")}}};
  next.onclick=function(){if(FIXED_MAZE_TIMERS[id]){clearInterval(FIXED_MAZE_TIMERS[id]);FIXED_MAZE_TIMERS[id]=null;play.textContent="Start Route Animation"}if(current<steps.length)advance()};reset.onclick=function(){if(FIXED_MAZE_TIMERS[id])clearInterval(FIXED_MAZE_TIMERS[id]);FIXED_MAZE_TIMERS[id]=null;current=0;play.textContent="Start Route Animation";draw();updateStatus("Ready")};draw();updateStatus("Ready");
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
    ''
}

function renderProposed(){
  var r=TRAINING_RESULT.modql;
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
    laibanGridPanelHTML("proposed-laiban-route","Laiban Route Network — Grid View",analysisMod,false)+
    '<div class="card"><h3>Training Evidence</h3><div class="g3"><div class="kpi"><div class="lab">Training episodes</div><div class="v">'+TRAINING_RESULT.episodes_trained+'</div><div class="d">current stored run</div></div><div class="kpi"><div class="lab">Held-out scenarios</div><div class="v">'+TRAINING_RESULT.evaluation_scenarios+'</div><div class="d">evaluation rollout</div></div><div class="kpi"><div class="lab">Avg learner coverage</div><div class="v">'+fmt(r.coverage,1)+'</div><div class="d">stored MODQL evaluation</div></div></div><div style="height:12px"></div>'+trainingEvidence+'</div>'+
   '';
 wireLaibanGrid("proposed-laiban-route",analysisMod);
}

function renderAnalysis(){
  computeAnalysisPlans();
  renderExisting();
  renderProposed();
  renderEvaluation();
  setTimeout(function(){
    mountOriginalStandardMaze();
    alignComparisonGridBody();
    if(document.getElementById("tab-proposed-sim-svg"))wireProposedGraph("tab-proposed-sim");
  },0);
}
function alignComparisonGridBody(){
  var leftHeader=document.querySelector("#comparison-standard-maze-host .maze-demo-header");
  var rightPanel=document.getElementById("comparison-modql-grid");
  var rightHeader=rightPanel&&rightPanel.querySelector(".comparison-grid-header");
  var leftLayout=document.querySelector("#comparison-standard-maze-host .maze-layout");
  var rightLayout=rightPanel&&rightPanel.querySelector(".comparison-grid-layout");
  if(!leftHeader||!rightHeader||!leftLayout||!rightLayout)return;
  leftHeader.style.minHeight="";
  rightHeader.style.minHeight="";
  var headerHeight=Math.max(leftHeader.getBoundingClientRect().height,rightHeader.getBoundingClientRect().height);
  leftHeader.style.minHeight=headerHeight+"px";
  rightHeader.style.minHeight=headerHeight+"px";
  rightLayout.style.marginTop=getComputedStyle(leftLayout).marginTop;
}
window.addEventListener("resize",alignComparisonGridBody);
var ORIGINAL_STANDARD_MAZE=null;
function mountOriginalStandardMaze(){
  var maze=ORIGINAL_STANDARD_MAZE||document.getElementById("sub-maze"),host=document.getElementById("comparison-standard-maze-host");
  if(!maze||!host||!maze.children.length)return false;
  ORIGINAL_STANDARD_MAZE=maze;
  maze.classList.remove("subview","active");
  maze.classList.add("evaluation-maze");
  if(maze.parentNode!==host)host.appendChild(maze);
  var mazeLayout=maze.querySelector(".maze-layout"),canvas=maze.querySelector("#mzCanvas"),controls=maze.querySelector(".maze-demo-controls");
  if(mazeLayout&&canvas&&controls&&!mazeLayout.querySelector(".maze-visual-column")){
    var canvasColumn=canvas.parentNode,visualColumn=document.createElement("div"),status=mazeLayout.querySelector(".maze-status-panel");
    visualColumn.className="maze-visual-column";
    mazeLayout.insertBefore(visualColumn,status?status.nextSibling:null);
    visualColumn.appendChild(canvasColumn);
    visualColumn.appendChild(controls);
    window.dispatchEvent(new Event("resize"));
  }
  if(!maze.querySelector(".algorithm-summary-card")){
    var summary=document.createElement("section");
    summary.className="algorithm-summary-card";
    summary.innerHTML="<h4>Standard Q-Learning (baseline)</h4><p>One Q-table; state is location only; reward is based on inverse travel time. The same table selects and evaluates the next action.</p>";
    maze.appendChild(summary);
  }
  if(!host.querySelector(".standard-maze-context-note")){
    var note=document.createElement("div");note.className="note standard-maze-context-note";note.textContent="This original maze uses its own randomly generated single-goal environment. It does not depict Laiban roads or the MODQL service route.";host.appendChild(note);
  }
  return true;
}
// The maze demo builds on DOMContentLoaded. Defer this callback so its own
// listener can finish first, even if the initial comparison render ran earlier.
document.addEventListener("DOMContentLoaded",function(){setTimeout(mountOriginalStandardMaze,0)});
var researchTabs=Array.prototype.slice.call(document.querySelectorAll('#researchNav [role="tab"][data-sub]'));
function activateResearchTab(tab,moveFocus){
  researchTabs.forEach(function(item){
    var selected=item===tab;
    item.classList.toggle('on',selected);
    item.setAttribute('aria-selected',String(selected));
    item.tabIndex=selected?0:-1;
  });
  document.querySelectorAll('.subview').forEach(function(view){view.classList.remove('active')});
  var target=document.getElementById('sub-'+tab.getAttribute('data-sub'));
  if(target)target.classList.add('active');
  if(tab.getAttribute('data-sub')==="evaluation"){
    mountOriginalStandardMaze();
    requestAnimationFrame(alignComparisonGridBody);
  }
  if(moveFocus)tab.focus();
}
researchTabs.forEach(function(tab,index){
  tab.addEventListener('click',function(){activateResearchTab(tab,false)});
  tab.addEventListener('keydown',function(event){
    var next=index;
    if(event.key==="ArrowRight")next=(index+1)%researchTabs.length;
    else if(event.key==="ArrowLeft")next=(index+researchTabs.length-1)%researchTabs.length;
    else if(event.key==="Home")next=0;
    else if(event.key==="End")next=researchTabs.length-1;
    else return;
    event.preventDefault();
    activateResearchTab(researchTabs[next],true);
  });
});
