/* ============================================================================
   ENGINE.JS — methodology-aligned runtime routing

   Existing/control:
     Standard Q-Learning
     State:  S = L
     Reward during training: 1 / Travel Cost
     Runtime: replay the learned Standard policy for the current location.

   Proposed/experimental:
     Multi-Objective Double Q-Learning (MODQL)
     State:  S = <L,D,T,H,A>
     Reward during training: Coverage * JainFairness * (1 / Travel Cost)
     Runtime: replay the learned policy derived from Q1(s,a)+Q2(s,a).

   Both algorithms use the same road graph and the same hard feasibility rules.
   Roads with A < 0.20 are unavailable to both. The Operational PLAN is the
   Proposed MODQL route.

   TEMPORARY DATA TEST (Sep 2026):
   Official DepEd ALS SY 2025-2026 learner demand is overlaid only where a
   conservative CLC/community match is available. Road geometry, most locations,
   visit history, and hazards remain simulated until the pending datasets arrive.
   ============================================================================ */

function rng(seed){var s=seed;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff}}

/* ---------- canonical Laiban sitio registry ----------
   Step 1 of the real-data migration. These are the nine sitios confirmed by
   the Barangay Laiban SK through local stakeholder communication. They are
   locked here as the canonical real-world location names for the study.

   IMPORTANT: this registry is NOT yet the active routing graph. The prototype
   NODES/EDGES below remain unchanged until sitio coordinates and the real road
   network are verified, so no legacy coordinates/distances are falsely assigned
   to these sitios. */
var LAIBAN_SITIO_REGISTRY=[
 {id:"maysawa",name:"Maysawa",lat:14.59780,lng:121.35114,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"OpenStreetMap/Mapcarta public reference",coordinate_status:"public_reference_unverified",routing_status:"not yet in active routing graph"},
 {id:"toyang",name:"Toyang",lat:14.61080,lng:121.38180,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"ibucao",name:"Ibucao",lat:14.60220,lng:121.38480,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"kilabuwan",name:"Kilabuwan",lat:14.62260,lng:121.40360,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"banatas",name:"Banatas",lat:14.60940,lng:121.39940,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"iwi_iw",name:"Iwi-Iw",lat:14.62800,lng:121.39170,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"old_laiban",name:"Old Laiban",lat:14.61880,lng:121.39700,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"},
 {id:"manggahan",name:"Manggahan",lat:14.62679,lng:121.41616,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"Magata-Manggahan Elementary School OSM/Mapcarta area reference",coordinate_status:"public_area_reference_unverified",routing_status:"not yet in active routing graph"},
 {id:"magata",name:"Magata",lat:14.63140,lng:121.42020,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement near Magata-Manggahan reference area",coordinate_status:"dummy_for_qa",routing_status:"not yet in active routing graph"}
];

var NODES=[
 {id:"hub",name:"Laiban Proper / ALS Hub",kind:"depot",lat:14.61785,lng:121.38961,learners:0,days:0,visits30:0,sitios:"Deployment origin / Laiban Proper",coordinate_status:"public_reference_unverified"},
 {id:"maysawa",name:"Sitio Maysawa",kind:"node",lat:14.59780,lng:121.35114,learners:42,days:12,visits30:1,sitios:"Barangay Laiban",coordinate_status:"public_reference_unverified",dataSource:"Simulated QA learner allocation"},
 {id:"toyang",name:"Sitio Toyang",kind:"node",lat:14.61080,lng:121.38180,learners:35,days:18,visits30:1,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"ibucao",name:"Sitio Ibucao",kind:"node",lat:14.60220,lng:121.38480,learners:51,days:24,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"kilabuwan",name:"Sitio Kilabuwan",kind:"node",lat:14.62260,lng:121.40360,learners:39,days:27,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"banatas",name:"Sitio Banatas",kind:"node",lat:14.60940,lng:121.39940,learners:33,days:16,visits30:1,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"iwi_iw",name:"Sitio Iwi-Iw",kind:"node",lat:14.62800,lng:121.39170,learners:28,days:21,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"old_laiban",name:"Sitio Old Laiban",kind:"node",lat:14.61880,lng:121.39700,learners:44,days:9,visits30:2,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"},
 {id:"manggahan",name:"Sitio Manggahan",kind:"node",lat:14.62679,lng:121.41616,learners:47,days:30,visits30:0,sitios:"Barangay Laiban",coordinate_status:"public_area_reference_unverified",dataSource:"Simulated QA learner allocation"},
 {id:"magata",name:"Sitio Magata",kind:"node",lat:14.63140,lng:121.42020,learners:31,days:26,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated QA learner allocation"}
];
var N={};NODES.forEach(function(n){N[n.id]=n});
var SERVICE_IDS=NODES.filter(function(n){return n.kind==="node"}).map(function(n){return n.id});

/* The policy bundled in trained_policy.js was trained on the previous prototype
   graph. Until retraining is completed for the Laiban sitio graph, use a fresh
   bit index and let both planners use their methodology-consistent fallback
   objectives instead of replaying incompatible actions. */
function trainedPolicyMatchesCurrentGraph(){
 if(typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.node_bit_index) return false;
 var ids=Object.keys(TRAINED_POLICY.node_bit_index);
 return ids.length===SERVICE_IDS.length&&SERVICE_IDS.every(function(id){return ids.indexOf(id)>=0});
}
var POLICY_MATCHES_GRAPH=trainedPolicyMatchesCurrentGraph();
var BITIDX=(function(){var x={};SERVICE_IDS.forEach(function(id,i){x[id]=i});return x})();

var SURF={
 concrete:{a:1.00,lab:"concrete provincial road"},
 gravel:{a:0.85,lab:"gravel barangay road"},
 dirt:{a:0.65,lab:"unimproved mountain path"},
 ford:{a:0.50,lab:"river crossing / ford"}
};

var ROAD_GRAPH_META={
 version:"laiban-step3-provisional-v1",
 status:"provisional_for_qa",
 location_scope:"Barangay Laiban, Tanay, Rizal",
 stakeholder_source:"Barangay Laiban SK local stakeholder information",
 verification_note:"Exact road geometry, road class, distances, and unsupported connections remain pending official/field verification."
};

var EDGES=[
 /* Step 3 road graph.
    - stakeholder_supported: connection/path direction is supported by the SK account.
    - qa_connector: temporary connection added only to keep all nine sitios reachable
      during system QA; it must not be cited as an official road connection.
    All bend geometry and calculated distances remain provisional until verified. */
 {a:"hub",b:"ibucao",surf:"ford",bend:[[14.6128,121.3872],[14.6074,121.3858]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Ibucao approach toward Laiban Proper; landslide-prone, mountainous approach, and multiple river crossings reported."},
 {a:"hub",b:"toyang",surf:"concrete",bend:[[14.6145,121.3858]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."},
 {a:"hub",b:"old_laiban",surf:"concrete",bend:[[14.6183,121.3932]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Laiban Proper to Old Laiban corridor used as the entry to the reported Old Laiban–Kilabuwan–Manggahan sequence."},
 {a:"hub",b:"banatas",surf:"ford",bend:[[14.6136,121.3950]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Travel to Banatas requires crossing a creek."},
 {a:"hub",b:"iwi_iw",surf:"gravel",bend:[[14.6231,121.3904]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."},
 {a:"toyang",b:"maysawa",surf:"gravel",bend:[[14.6045,121.3680]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."},
 {a:"ibucao",b:"maysawa",surf:"dirt",bend:[[14.6001,121.3690]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."},
 {a:"old_laiban",b:"kilabuwan",surf:"ford",bend:[[14.6202,121.4001]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Several river crossings were reported from Old Laiban toward Kilabuwan."},
 {a:"kilabuwan",b:"manggahan",surf:"ford",bend:[[14.6249,121.4095]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Several river crossings were reported along the Kilabuwan toward Manggahan route."},
 {a:"manggahan",b:"magata",surf:"ford",bend:[[14.6290,121.4183]],graph_status:"stakeholder_supported",source:"Barangay Laiban SK",verification:"provisional",note:"Manggahan and Magata were reported to have a possible boat alternative when conditions permit; exact landing points are unverified."},
 {a:"banatas",b:"old_laiban",surf:"gravel",bend:[[14.6147,121.3982]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."},
 {a:"iwi_iw",b:"old_laiban",surf:"gravel",bend:[[14.6236,121.3950]],graph_status:"qa_connector",source:"System QA assumption",verification:"dummy",note:"Temporary connector for QA; exact road connection pending verification."}
];

var WX={mm:38};
var CLOCK={h:8,m:48};
var SHIFT_MIN=480;
var TRAINED_TIME_BUCKETS=6;

var REPORTS=[
 {id:1,edge:"hub|ibucao",type:"Landslide / river exposure",em:"\u26F0",sev:"major",src:"community",reporters:1,ago:1.5,cleared:false,who:"Barangay Laiban stakeholder input",note:"Ibucao approach is landslide-prone and follows river crossings; heavy rain can make travel unsafe."},
 {id:2,edge:"kilabuwan|old_laiban",type:"River level risk",em:"\uD83C\uDF0A",sev:"major",src:"community",reporters:1,ago:3.0,cleared:false,who:"Barangay Laiban stakeholder input",note:"Old Laiban toward Kilabuwan includes river crossings that may become dangerous during rain."},
 {id:3,edge:"banatas|hub",type:"Creek crossing",em:"\uD83D\uDCA7",sev:"minor",src:"community",reporters:1,ago:7.0,cleared:false,who:"Barangay Laiban stakeholder input",note:"Travel to Banatas requires a creek crossing; accessibility is sensitive to rainfall."}
];
var ADVISORIES=[];
var nextRepId=4;

function ek(a,b){return [a,b].sort().join("|")}
function hav(p,q){var R=6371,t=Math.PI/180,dLa=(q.lat-p.lat)*t,dLo=(q.lng-p.lng)*t,x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(p.lat*t)*Math.cos(q.lat*t)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(x))}
function edgeGeom(e){var pts=[[N[e.a].lat,N[e.a].lng]];(e.bend||[]).forEach(function(p){pts.push(p)});pts.push([N[e.b].lat,N[e.b].lng]);return pts}
function edgeKm(e){var g=edgeGeom(e),d=0;for(var i=1;i<g.length;i++)d+=hav({lat:g[i-1][0],lng:g[i-1][1]},{lat:g[i][0],lng:g[i][1]});return d}
EDGES.forEach(function(e){e.key=ek(e.a,e.b);e.km=edgeKm(e)});
var EK={};EDGES.forEach(function(e){EK[e.key]=e});
var ROAD_GRAPH_COUNTS={
 stakeholder_supported:EDGES.filter(function(e){return e.graph_status==="stakeholder_supported"}).length,
 qa_connector:EDGES.filter(function(e){return e.graph_status==="qa_connector"}).length
};

function wxFactor(surf){
 var mm=WX.mm,paved=surf==="concrete",b=mm<10?0:mm<30?1:mm<60?2:3;
 if(paved)return [1,1,.95,.85][b];
 if(surf==="ford")return [1,.85,.45,.15][b];
 return [1,.85,.60,.35][b];
}
function sevFloor(s){return s==="impassable"?.05:s==="major"?.40:.72}
function confidence(r){if(r.cleared)return .10;var b=r.src==="advisory"?1:r.src==="driver"?.55:.45;b+=(r.reporters-1)*.20;if(r.src==="telemetry")b=.35;b=Math.min(1,b);return b*Math.pow(.5,r.ago/6)}
function reportFactor(k){var f=1;REPORTS.forEach(function(r){if(r.edge!==k)return;var c=confidence(r),fl=sevFloor(r.sev);f=Math.min(f,fl+(1-c)*(1-fl))});return f}
function accA(e){for(var i=0;i<ADVISORIES.length;i++)if(ADVISORIES[i].edge===e.key)return 0;var v=SURF[e.surf].a*wxFactor(e.surf)*reportFactor(e.key);return Math.max(0,Math.min(1,v))}
function band(A){return A>=.75?{k:"open",lab:"OPEN",col:"#7B753B"}:A>=.45?{k:"caut",lab:"CAUTION",col:"#A77A2D"}:A>=.20?{k:"rest",lab:"RESTRICTED",col:"#9A633B"}:{k:"cls",lab:"CLOSED",col:"#A24D42"}}
function speed(s){return s==="concrete"?38:s==="gravel"?24:s==="ford"?12:16}
function edgeMin(e){var A=accA(e);return (e.km/speed(e.surf))*60/Math.max(A,.08)}
function serviceMin(n){return 25+Math.round(n.learners/3)}
function jain(v){var s=0,q=0;v.forEach(function(x){s+=x;q+=x*x});return q===0?1:(s*s)/(v.length*q)}
function hhmm(h,m){m=Math.round(m);h+=Math.floor(m/60);m%=60;return (h%24<10?"0":"")+(h%24)+":"+(m<10?"0":"")+m}

function neighbors(id){var out=[];EDGES.forEach(function(e){if(accA(e)<.20)return;if(e.a===id)out.push({to:e.b,e:e});if(e.b===id)out.push({to:e.a,e:e})});return out}
function path(from,to){
 var dist={},prev={},seen={},q=[from];dist[from]=0;
 while(q.length){q.sort(function(a,b){return dist[a]-dist[b]});var cur=q.shift();if(seen[cur])continue;seen[cur]=1;if(cur===to)break;neighbors(cur).forEach(function(nb){var d=dist[cur]+edgeMin(nb.e);if(dist[nb.to]===undefined||d<dist[nb.to]){dist[nb.to]=d;prev[nb.to]={n:cur,e:nb.e};q.push(nb.to)}})}
 if(dist[to]===undefined)return null;var seq=[],legs=[],c=to;while(c!==from){seq.unshift(c);legs.unshift(prev[c].e);c=prev[c].n}seq.unshift(from);var km=0;legs.forEach(function(e){km+=e.km});return {min:dist[to],km:km,legs:legs,seq:seq}
}

/* ----- exact Chapter 3 state encoding mirrored from train_q_learning.py ----- */
function timeBucket(rem){var b=Math.floor((Math.max(0,Math.min(1,rem/SHIFT_MIN)))*TRAINED_TIME_BUCKETS);return Math.min(TRAINED_TIME_BUCKETS-1,Math.max(0,b))}
function accessBucket(x){return x<.20?0:x<.45?1:x<.75?2:3}
function proposedStateKey(cur,mask,remaining,visits){
 var candidates=[];
 SERVICE_IDS.forEach(function(id){if(mask&(1<<BITIDX[id]))return;if(path(cur,id))candidates.push(id)});
 var maxDemand=Math.max.apply(null,SERVICE_IDS.map(function(id){return N[id].learners}));
 var pressure=0;candidates.forEach(function(id){pressure=Math.max(pressure,N[id].learners/maxDemand)});
 var D=pressure===0?0:pressure<.45?1:pressure<.75?2:3;
 var vals=SERVICE_IDS.map(function(id){return visits[id]||0}),J=jain(vals);
 var H=J<.55?0:J<.70?1:J<.85?2:3;
 var local=[];EDGES.forEach(function(e){if(e.a===cur||e.b===cur)local.push(accA(e))});
 var meanA=local.length?local.reduce(function(a,b){return a+b},0)/local.length:0;
 var A=accessBucket(meanA);
 return "L="+cur+"|D="+D+"|T="+timeBucket(remaining)+"|H="+H+"|A="+A;
}

function learnedStandardAction(cur){
 if(!POLICY_MATCHES_GRAPH||typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.standard_policy)return null;
 var a=TRAINED_POLICY.standard_policy[cur]||null;
 return SERVICE_IDS.indexOf(a)>=0?a:null;
}
function learnedMODQLAction(stateKey){
 if(!POLICY_MATCHES_GRAPH||typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.modql_policy)return null;
 var a=TRAINED_POLICY.modql_policy[stateKey]||null;
 return SERVICE_IDS.indexOf(a)>=0?a:null;
}

/* Proposed MODQL operational route. The learned deployment policy is derived
   from argmax_a[Q1(s,a)+Q2(s,a)] after training. If the exact discretized live
   state was not visited during training, the methodology-consistent reward is
   used only as a transparent fallback for that decision. */
function planRoute(startId,servedIds,remainingMinutes,elapsedMinutes){
 /* Optional runtime context is used by the Drive tab when replanning mid-day.
    Calls with no arguments preserve the full-day behavior used by Analysis. */
 startId=startId||"hub";
 servedIds=Array.isArray(servedIds)?servedIds.slice():[];
 var servedSet={};servedIds.forEach(function(id){servedSet[id]=true});
 var pending=SERVICE_IDS.filter(function(id){return !servedSet[id]});
 var visits={};SERVICE_IDS.forEach(function(id){visits[id]=N[id].visits30});
 var maxL=Math.max.apply(null,SERVICE_IDS.map(function(id){return N[id].learners}));
 var cur=startId,left=(remainingMinutes==null?SHIFT_MIN:Math.max(0,remainingMinutes));
 var elapsed=Math.max(0,elapsedMinutes||0),stops=[],deferred=[],hh=CLOCK.h,mm=CLOCK.m+elapsed,mask=0;
 servedIds.forEach(function(id){if(BITIDX[id]!==undefined)mask|=(1<<BITIDX[id])});
 while(pending.length){
  var feasible=[];
  pending.forEach(function(id){var p=path(cur,id);if(!p)return;var need=p.min+serviceMin(N[id]);if(need<=left)feasible.push({id:id,p:p})});
  if(!feasible.length)break;
  var sk=proposedStateKey(cur,mask,left,visits),learned=learnedMODQLAction(sk),best=null;
  feasible.forEach(function(c){
   var trial=SERVICE_IDS.map(function(id){return (visits[id]||0)+(id===c.id?1:0)});
   var J=jain(trial),cov=N[c.id].learners/maxL,fallback=cov*J*(1/Math.max(c.p.min/60,1e-6));
   var fromPolicy=learned===c.id,score=fromPolicy?Number.MAX_SAFE_INTEGER:fallback;
   if(!best||score>best.score)best={id:c.id,p:c.p,score:score,J:J,cov:cov,usedPolicy:fromPolicy,stateKey:sk};
  });
  var t0=hhmm(hh,mm+best.p.min);
  stops.push({id:best.id,p:best.p,arrive:t0,score:best.score,J:best.J,usedPolicy:best.usedPolicy,stateKey:best.stateKey});
  var adv=best.p.min+serviceMin(N[best.id]);mm+=adv;left-=adv;visits[best.id]++;cur=best.id;mask|=(1<<BITIDX[best.id]);pending.splice(pending.indexOf(best.id),1);
 }
 pending.forEach(function(id){var p=path(cur,id);deferred.push({id:id,reason:p?"outside remaining time budget":"no open corridor — all approaches masked (A < 0.20)"})});
 return {stops:stops,deferred:deferred,ret:path(cur,"hub"),visits:visits,methodology:"MODQL <L,D,T,H,A>",start:startId,remaining:left};
}

/* Existing/control route. Runtime replays the policy learned by Standard
   single-table Q-Learning with S=L. For a learned action that is currently
   infeasible because of time/hazard constraints, the 1/TravelCost objective
   selects the best feasible action as the safety-compatible fallback. */
function planRouteStandard(){
 var pending=SERVICE_IDS.slice(),visits={};pending.forEach(function(id){visits[id]=N[id].visits30});
 var cur="hub",left=SHIFT_MIN,stops=[],deferred=[],hh=CLOCK.h,mm=CLOCK.m;
 while(pending.length){
  var feasible=[];pending.forEach(function(id){var p=path(cur,id);if(!p)return;var need=p.min+serviceMin(N[id]);if(need<=left)feasible.push({id:id,p:p})});
  if(!feasible.length)break;
  var learned=learnedStandardAction(cur),best=null;
  feasible.forEach(function(c){var fromPolicy=learned===c.id,score=fromPolicy?Number.MAX_SAFE_INTEGER:(1/Math.max(c.p.min/60,1e-6));if(!best||score>best.score)best={id:c.id,p:c.p,score:score,usedPolicy:fromPolicy}});
  var t0=hhmm(hh,mm+best.p.min);stops.push({id:best.id,p:best.p,arrive:t0,usedPolicy:best.usedPolicy});
  var adv=best.p.min+serviceMin(N[best.id]);mm+=adv;left-=adv;visits[best.id]++;cur=best.id;pending.splice(pending.indexOf(best.id),1);
 }
 pending.forEach(function(id){var p=path("hub",id);deferred.push({id:id,reason:p?"outside remaining time budget":"no open corridor — all approaches masked (A < 0.20)"})});
 return {stops:stops,deferred:deferred,ret:path(cur,"hub"),visits:visits,methodology:"Standard Q-Learning S=L"};
}

/* Operational views always display the Proposed MODQL recommendation. */
var PLAN=planRoute(), PROGRESS=0;
