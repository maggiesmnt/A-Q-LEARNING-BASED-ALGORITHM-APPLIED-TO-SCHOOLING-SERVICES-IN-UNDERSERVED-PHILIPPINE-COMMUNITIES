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
   Proposed MODQL route. Data values remain simulation placeholders.
   ============================================================================ */

function rng(seed){var s=seed;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff}}

var NODES=[
 {id:"hub", name:"Laiban ALS Hub",       kind:"depot", lat:14.5762, lng:121.3828, learners:0,  days:0,  visits30:0, sitios:"Deployment origin / motor pool"},
 {id:"mah", name:"Sitio Mahabang Lalim",kind:"node",  lat:14.5921, lng:121.4026, learners:48, days:9,  visits30:2, sitios:"Riverside cluster"},
 {id:"kab", name:"Sitio Kabayunan",     kind:"node",  lat:14.5606, lng:121.4131, learners:63, days:21, visits30:1, sitios:"Upland cluster"},
 {id:"dar", name:"Daraitan Proper",     kind:"node",  lat:14.6108, lng:121.4315, learners:87, days:6,  visits30:3, sitios:"Barangay center"},
 {id:"tin", name:"Sitio Tinipak",       kind:"node",  lat:14.6204, lng:121.4402, learners:41, days:27, visits30:0, sitios:"River crossing required"},
 {id:"inz", name:"Sta. Inez",           kind:"node",  lat:14.5512, lng:121.3562, learners:72, days:11, visits30:2, sitios:"Barangay center"},
 {id:"cay", name:"Cayabu",              kind:"node",  lat:14.5292, lng:121.3396, learners:56, days:14, visits30:2, sitios:"Barangay center"},
 {id:"pun", name:"Sitio Pungo",         kind:"node",  lat:14.5446, lng:121.4288, learners:34, days:33, visits30:0, sitios:"Most isolated node"},
 {id:"amp", name:"Sitio Mag-Ampon",     kind:"node",  lat:14.6018, lng:121.3548, learners:29, days:18, visits30:1, sitios:"Ridge cluster"}
];
var N={};NODES.forEach(function(n){N[n.id]=n});
var SERVICE_IDS=NODES.filter(function(n){return n.kind==="node"}).map(function(n){return n.id});
var BITIDX=(typeof TRAINED_POLICY!=="undefined"&&TRAINED_POLICY.node_bit_index)?TRAINED_POLICY.node_bit_index:(function(){var x={};SERVICE_IDS.forEach(function(id,i){x[id]=i});return x})();

var SURF={
 concrete:{a:1.00,lab:"concrete provincial road"},
 gravel:{a:0.85,lab:"gravel barangay road"},
 dirt:{a:0.65,lab:"unimproved mountain path"},
 ford:{a:0.50,lab:"river crossing / ford"}
};

var EDGES=[
 {a:"hub",b:"inz",surf:"concrete",bend:[[14.5651,121.3712]]},
 {a:"inz",b:"cay",surf:"concrete",bend:[[14.5402,121.3455]]},
 {a:"hub",b:"amp",surf:"gravel",bend:[[14.5885,121.3665]]},
 {a:"hub",b:"mah",surf:"gravel",bend:[[14.5828,121.3931]]},
 {a:"amp",b:"dar",surf:"dirt",bend:[[14.6082,121.3915]]},
 {a:"mah",b:"dar",surf:"gravel",bend:[[14.6015,121.4198]]},
 {a:"dar",b:"tin",surf:"ford",bend:[[14.6168,121.4372]]},
 {a:"mah",b:"kab",surf:"dirt",bend:[[14.5748,121.4102]]},
 {a:"kab",b:"pun",surf:"dirt",bend:[[14.5518,121.4225]]},
 {a:"inz",b:"kab",surf:"dirt",bend:[[14.5548,121.3862],[14.5572,121.4005]]},
 {a:"cay",b:"pun",surf:"dirt",bend:[[14.5325,121.3820],[14.5372,121.4090]]}
];

var WX={mm:38};
var CLOCK={h:8,m:48};
var SHIFT_MIN=480;
var TRAINED_TIME_BUCKETS=6;

var REPORTS=[
 {id:1,edge:"kab|pun",type:"Landslide",em:"\u26F0",sev:"impassable",src:"community",reporters:3,ago:1.5,cleared:false,who:"3 residents of Sitio Pungo",note:"Slope collapse across the path after last night's rain. No vehicle clearance."},
 {id:2,edge:"kab|mah",type:"Mud / washout",em:"\uD83D\uDCA6",sev:"major",src:"driver",reporters:1,ago:3.0,cleared:false,who:"Mobile unit driver",note:"Deep mud on the climb; 4x2 truck slipping but able to pass slowly."},
 {id:3,edge:"dar|tin",type:"River rising",em:"\uD83C\uDF0A",sev:"minor",src:"community",reporters:2,ago:7.0,cleared:false,who:"2 barangay tanod",note:"Ford water level up to knee height. Passable now, monitor."}
];
var ADVISORIES=[];
var nextRepId=4;

function ek(a,b){return [a,b].sort().join("|")}
function hav(p,q){var R=6371,t=Math.PI/180,dLa=(q.lat-p.lat)*t,dLo=(q.lng-p.lng)*t,x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(p.lat*t)*Math.cos(q.lat*t)*Math.sin(dLo/2)*Math.sin(dLo/2);return 2*R*Math.asin(Math.sqrt(x))}
function edgeGeom(e){var pts=[[N[e.a].lat,N[e.a].lng]];(e.bend||[]).forEach(function(p){pts.push(p)});pts.push([N[e.b].lat,N[e.b].lng]);return pts}
function edgeKm(e){var g=edgeGeom(e),d=0;for(var i=1;i<g.length;i++)d+=hav({lat:g[i-1][0],lng:g[i-1][1]},{lat:g[i][0],lng:g[i][1]});return d}
EDGES.forEach(function(e){e.key=ek(e.a,e.b);e.km=edgeKm(e)});
var EK={};EDGES.forEach(function(e){EK[e.key]=e});

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
 if(typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.standard_policy)return null;
 return TRAINED_POLICY.standard_policy[cur]||null;
}
function learnedMODQLAction(stateKey){
 if(typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.modql_policy)return null;
 return TRAINED_POLICY.modql_policy[stateKey]||null;
}

/* Proposed MODQL operational route. The learned deployment policy is derived
   from argmax_a[Q1(s,a)+Q2(s,a)] after training. If the exact discretized live
   state was not visited during training, the methodology-consistent reward is
   used only as a transparent fallback for that decision. */
function planRoute(){
 var pending=SERVICE_IDS.slice(),visits={};pending.forEach(function(id){visits[id]=N[id].visits30});
 var maxL=Math.max.apply(null,pending.map(function(id){return N[id].learners}));
 var cur="hub",left=SHIFT_MIN,stops=[],deferred=[],hh=CLOCK.h,mm=CLOCK.m,mask=0;
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
 pending.forEach(function(id){var p=path("hub",id);deferred.push({id:id,reason:p?"outside remaining time budget":"no open corridor — all approaches masked (A < 0.20)"})});
 return {stops:stops,deferred:deferred,ret:path(cur,"hub"),visits:visits,methodology:"MODQL <L,D,T,H,A>"};
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
var PLAN=planRoute(), PROGRESS=1;
