/* ============================================================================
   ENGINE.JS
   Environment (nodes/roads), the road-accessibility/hazard model, and the
   two route planners:
     - planRouteStandard()  "Basic Routing" / Standard Q-Learning (existing)
     - planRoute()          "Smart Routing"  / MODQL (proposed)

   Both planners search the SAME road graph with the SAME hazard-masking
   rule (see accA/neighbors/path below) — a road that's closed is closed
   for both algorithms equally. What differs is the SCORE each uses to pick
   its next stop: Standard only minimizes travel time; MODQL maximizes
   coverage x fairness x (1/cost). That one-line difference is Objective 1
   of the underlying research (Chapter 1 / Section 3.2.1).

   Node coordinates, learner counts and road geometry are simulation
   placeholders standing in for the OSM road-network extraction and DepEd
   ALS enrollment data described in Section 3.1 — not survey data.
   ============================================================================ */

/* ---------- deterministic PRNG so figures are stable across reloads ---------- */
function rng(seed){var s=seed;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff}}

/* ---------- environment: Laiban, Tanay, Rizal (simulated nodes) ---------- */
var NODES=[
 {id:"hub", name:"Laiban ALS Hub",      kind:"depot", lat:14.5762, lng:121.3828, learners:0,  days:0,  visits30:0, sitios:"Deployment origin / motor pool"},
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

/* surface: concrete | gravel | dirt | ford  -> baseline ceiling for A */
var SURF={concrete:{a:1.00,lab:"concrete provincial road"},gravel:{a:0.85,lab:"gravel barangay road"},
          dirt:{a:0.65,lab:"unimproved mountain path"},ford:{a:0.50,lab:"river crossing / ford"}};

var EDGES=[
 {a:"hub",b:"inz",surf:"concrete",bend:[[14.5651,121.3712]]},
 {a:"inz",b:"cay",surf:"concrete",bend:[[14.5402,121.3455]]},
 {a:"hub",b:"amp",surf:"gravel",  bend:[[14.5885,121.3665]]},
 {a:"hub",b:"mah",surf:"gravel",  bend:[[14.5828,121.3931]]},
 {a:"amp",b:"dar",surf:"dirt",    bend:[[14.6082,121.3915]]},
 {a:"mah",b:"dar",surf:"gravel",  bend:[[14.6015,121.4198]]},
 {a:"dar",b:"tin",surf:"ford",    bend:[[14.6168,121.4372]]},
 {a:"mah",b:"kab",surf:"dirt",    bend:[[14.5748,121.4102]]},
 {a:"kab",b:"pun",surf:"dirt",    bend:[[14.5518,121.4225]]},
 {a:"inz",b:"kab",surf:"dirt",    bend:[[14.5548,121.3862],[14.5572,121.4005]]},
 {a:"cay",b:"pun",surf:"dirt",    bend:[[14.5325,121.3820],[14.5372,121.4090]]}
];

/* ---------- live conditions ---------- */
var WX={mm:38};                     /* rainfall mm / 24h */
var CLOCK={h:8,m:48};               /* start of shift readout */
var SHIFT_MIN=480;

/* seeded field reports; ts = hours ago */
var REPORTS=[
 {id:1,edge:"kab|pun",type:"Landslide",em:"\u26F0",sev:"impassable",src:"community",reporters:3,ago:1.5,cleared:false,
  who:"3 residents of Sitio Pungo",note:"Slope collapse across the path after last night's rain. No vehicle clearance."},
 {id:2,edge:"kab|mah",type:"Mud / washout",em:"\uD83D\uDCA6",sev:"major",src:"driver",reporters:1,ago:3.0,cleared:false,
  who:"Mobile unit driver",note:"Deep mud on the climb; 4x2 truck slipping but able to pass slowly."},
 {id:3,edge:"dar|tin",type:"River rising",em:"\uD83C\uDF0A",sev:"minor",src:"community",reporters:2,ago:7.0,cleared:false,
  who:"2 barangay tanod",note:"Ford water level up to knee height. Passable now, monitor."}
];
var ADVISORIES=[];   /* {edge, note} -> hard A = 0 */
var nextRepId=4;

/* ---------- helpers ---------- */
function ek(a,b){return [a,b].sort().join("|")}
function hav(p,q){var R=6371,t=Math.PI/180,dLa=(q.lat-p.lat)*t,dLo=(q.lng-p.lng)*t,
 x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(p.lat*t)*Math.cos(q.lat*t)*Math.sin(dLo/2)*Math.sin(dLo/2);
 return 2*R*Math.asin(Math.sqrt(x))}
function edgeGeom(e){var pts=[[N[e.a].lat,N[e.a].lng]];(e.bend||[]).forEach(function(p){pts.push(p)});pts.push([N[e.b].lat,N[e.b].lng]);return pts}
function edgeKm(e){var g=edgeGeom(e),d=0;for(var i=1;i<g.length;i++)d+=hav({lat:g[i-1][0],lng:g[i-1][1]},{lat:g[i][0],lng:g[i][1]});return d}
EDGES.forEach(function(e){e.key=ek(e.a,e.b);e.km=edgeKm(e)});
var EK={};EDGES.forEach(function(e){EK[e.key]=e});

/* ---------- A: live road accessibility (this is the panel's hazard question) ----------
   A = surface baseline x weather factor x report factor, clamped to [0,1].
   A road is masked out of BOTH algorithms' action set once A < 0.20 — see
   neighbors() below. This is a hard, algorithm-agnostic safety constraint,
   not something either algorithm "decides." See view-hazards in index.html
   for the full plain-language explanation the panel can read. */
function wxFactor(surf){
  var mm=WX.mm, paved=(surf==="concrete");
  var band = mm<10?0:mm<30?1:mm<60?2:3;
  if(paved) return [1,1,0.95,0.85][band];
  if(surf==="ford") return [1,0.85,0.45,0.15][band];
  return [1,0.85,0.60,0.35][band];
}
function sevFloor(s){return s==="impassable"?0.05:s==="major"?0.40:0.72}
function confidence(r){
  if(r.cleared) return 0.10;
  var base = r.src==="advisory"?1.0 : r.src==="driver"?0.55 : 0.45;
  base += (r.reporters-1)*0.20;
  if(r.src==="telemetry") base=0.35;
  base = Math.min(1,base);
  return base*Math.pow(0.5, r.ago/6);            /* 6-hour half-life */
}
function reportFactor(key){
  var f=1;
  REPORTS.forEach(function(r){
    if(r.edge!==key) return;
    var c=confidence(r), fl=sevFloor(r.sev);
    f=Math.min(f, fl + (1-c)*(1-fl));
  });
  return f;
}
function accA(e){
  for(var i=0;i<ADVISORIES.length;i++) if(ADVISORIES[i].edge===e.key) return 0;
  var v=SURF[e.surf].a*wxFactor(e.surf)*reportFactor(e.key);
  return Math.max(0,Math.min(1,v));
}
function band(A){return A>=0.75?{k:"open",lab:"OPEN",col:"#25d07a"}:A>=0.45?{k:"caut",lab:"CAUTION",col:"#ffb020"}:
  A>=0.20?{k:"rest",lab:"RESTRICTED",col:"#ff8a3d"}:{k:"cls",lab:"CLOSED",col:"#ff4d4f"}}
function speed(surf){return surf==="concrete"?38:surf==="gravel"?24:surf==="ford"?12:16}
function edgeMin(e){var A=accA(e);return (e.km/speed(e.surf))*60/Math.max(A,0.08)}
function serviceMin(n){return 25+Math.round(n.learners/3)}
function jain(v){var s=0,q=0;v.forEach(function(x){s+=x;q+=x*x});return q===0?1:(s*s)/(v.length*q)}
function hhmm(h,m){m=Math.round(m);h+=Math.floor(m/60);m=m%60;return (h%24<10?"0":"")+(h%24)+":"+(m<10?"0":"")+m}

/* ---------- graph search with A masking (shared by BOTH algorithms) ---------- */
function neighbors(id){var out=[];EDGES.forEach(function(e){
  var A=accA(e); if(A<0.20) return;                     /* hard mask: closed, for either algorithm */
  if(e.a===id) out.push({to:e.b,e:e}); if(e.b===id) out.push({to:e.a,e:e});});return out}

function path(from,to){
  var dist={},prev={},seen={},q=[from];dist[from]=0;
  while(q.length){
    q.sort(function(a,b){return dist[a]-dist[b]});
    var cur=q.shift(); if(seen[cur])continue; seen[cur]=1; if(cur===to)break;
    neighbors(cur).forEach(function(nb){
      var d=dist[cur]+edgeMin(nb.e);
      if(dist[nb.to]===undefined||d<dist[nb.to]){dist[nb.to]=d;prev[nb.to]={n:cur,e:nb.e};q.push(nb.to)}});
  }
  if(dist[to]===undefined) return null;
  var seq=[],legs=[],c=to;
  while(c!==from){seq.unshift(c);legs.unshift(prev[c].e);c=prev[c].n}
  seq.unshift(from);
  var km=0;legs.forEach(function(e){km+=e.km});
  return {min:dist[to],km:km,legs:legs,seq:seq};
}

/* ======================================================================
   PROPOSED ALGORITHM — MODQL, greedy policy replay
   Score = Coverage x Jain's Fairness x (1 / Travel Cost).  Replays the
   trained policy's decision rule at each stop: R = C x J x (1/TravelCost),
   over the SAME A-masked action set every planner uses.
   ====================================================================== */
function planRoute(){
  var pending=NODES.filter(function(n){return n.kind==="node"}).map(function(n){return n.id});
  var visits={};pending.forEach(function(id){visits[id]=N[id].visits30});
  var maxL=Math.max.apply(null,pending.map(function(id){return N[id].learners}));
  var cur="hub",left=SHIFT_MIN,stops=[],deferred=[],hh=CLOCK.h,mm=CLOCK.m;

  while(pending.length){
    var best=null;
    pending.forEach(function(id){
      var p=path(cur,id); if(!p) return;
      var need=p.min+serviceMin(N[id]);
      if(need>left) return;
      var cov=N[id].learners/maxL;
      var trial=pending.concat([]).map(function(x){return visits[x]+(x===id?1:0)});
      NODES.forEach(function(n){if(n.kind==="node"&&pending.indexOf(n.id)<0)trial.push(visits[n.id])});
      var J=jain(trial);
      var score=cov*J*(1/(p.min/60));      /* R = C x J x (1 / Travel Cost) */
      if(!best||score>best.score) best={id:id,p:p,score:score,J:J,cov:cov};
    });
    if(!best) break;
    var t0=hhmm(hh,mm+best.p.min);
    stops.push({id:best.id,p:best.p,arrive:t0,score:best.score,J:best.J});
    var adv=best.p.min+serviceMin(N[best.id]);
    mm+=adv; left-=adv; visits[best.id]++; cur=best.id;
    pending.splice(pending.indexOf(best.id),1);
  }
  pending.forEach(function(id){
    var p=path("hub",id);
    deferred.push({id:id,reason:p?"outside remaining time budget":"no open corridor \u2014 all approaches masked (A < 0.20)"});
  });
  var back=path(cur,"hub");
  return {stops:stops,deferred:deferred,ret:back,visits:visits};
}

/* ======================================================================
   EXISTING ALGORITHM — Standard Q-Learning, greedy policy replay
   Score = travel time only. No demand (D), no fairness/history (H) term.
   Uses the exact same A-masked path()/neighbors() as the proposed
   algorithm, so a closed or hazardous road is avoided by BOTH — the
   difference below is purely which reachable community gets picked next.
   ====================================================================== */
function planRouteStandard(){
  var pending=NODES.filter(function(n){return n.kind==="node"}).map(function(n){return n.id});
  var visits={};pending.forEach(function(id){visits[id]=N[id].visits30});
  var cur="hub",left=SHIFT_MIN,stops=[],deferred=[],hh=CLOCK.h,mm=CLOCK.m;

  while(pending.length){
    var best=null;
    pending.forEach(function(id){
      var p=path(cur,id); if(!p) return;
      var need=p.min+serviceMin(N[id]);
      if(need>left) return;
      var score=-p.min;                    /* single objective: minimize travel time only */
      if(!best||score>best.score) best={id:id,p:p,score:score};
    });
    if(!best) break;
    var t0=hhmm(hh,mm+best.p.min);
    stops.push({id:best.id,p:best.p,arrive:t0});
    var adv=best.p.min+serviceMin(N[best.id]);
    mm+=adv; left-=adv; visits[best.id]++; cur=best.id;
    pending.splice(pending.indexOf(best.id),1);
  }
  pending.forEach(function(id){
    var p=path("hub",id);
    deferred.push({id:id,reason:p?"outside remaining time budget":"no open corridor \u2014 all approaches masked (A < 0.20)"});
  });
  var back=path(cur,"hub");
  return {stops:stops,deferred:deferred,ret:back,visits:visits};
}

/* PLAN drives the operational Drive/Stops/Hazards views — always the
   proposed algorithm's route, since that's the one actually recommended
   for dispatch. The Existing/Proposed/SOP analysis tabs compute their own
   fresh copies of both plans independently (see analysis.js). */
var PLAN=planRoute(), PROGRESS=1;    /* stops already completed */
