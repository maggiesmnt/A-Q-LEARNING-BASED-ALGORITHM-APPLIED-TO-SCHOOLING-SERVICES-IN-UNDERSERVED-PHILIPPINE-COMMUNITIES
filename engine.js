/* ============================================================================
   ENGINE.JS — methodology-aligned runtime routing

   Existing/control:
     Standard Q-Learning
     State: S = L
     Reward during training: 1 / Travel Cost

   Proposed/experimental:
     Multi-Objective Double Q-Learning (MODQL)
     State: S = <L,D,T,H,A>
     Reward during training: Coverage * JainFairness * (1 / Travel Cost)

   Both algorithms use the same active Barangay Laiban road graph, the same
   feasibility rules, and the same operational constraints.

   CURRENT DATA STATUS (Sep 2026):
   - Active locations are the nine Barangay Laiban sitios confirmed through
     local stakeholder communication.
   - Barangay-wide learner demand is based on the official CY 2026 OSY total
     of 284, with a controlled simulated sitio allocation.
   - H and T remain controlled simulation inputs.
   - Road topology and accessibility combine stakeholder information, public
     references, and clearly marked QA assumptions where exact sitio-level
     road data remain unavailable.
   ============================================================================ */

function rng(seed){var s=seed;return function(){s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff}}

/* ---------- canonical Laiban sitio registry ----------
   These are the nine sitios confirmed by the Barangay Laiban SK through local
   stakeholder communication.

   The same sitio identities are used by the active routing graph. Coordinate
   verification status remains explicit because several sitio coordinates are
   still provisional or QA placements.
*/
var LAIBAN_SITIO_REGISTRY=[
 {id:"maysawa",name:"Maysawa",lat:14.59780,lng:121.35114,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"OpenStreetMap/Mapcarta public reference",coordinate_status:"public_reference_unverified",routing_status:"active routing node"},
 {id:"toyang",name:"Toyang",lat:14.61080,lng:121.38180,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"ibucao",name:"Ibucao",lat:14.60220,lng:121.38480,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"kilabuwan",name:"Kilabuwan",lat:14.62260,lng:121.40360,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"banatas",name:"Banatas",lat:14.60940,lng:121.39940,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"iwi_iw",name:"Iwi-Iw",lat:14.62800,lng:121.39170,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"old_laiban",name:"Old Laiban",lat:14.61880,lng:121.39700,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement only",coordinate_status:"dummy_for_qa",routing_status:"active routing node"},
 {id:"manggahan",name:"Manggahan",lat:14.62679,lng:121.41616,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"Magata-Manggahan Elementary School OSM/Mapcarta area reference",coordinate_status:"public_area_reference_unverified",routing_status:"active routing node"},
 {id:"magata",name:"Magata",lat:14.63140,lng:121.42020,source:"Barangay Laiban SK / local stakeholder",coordinate_source:"QA placement near Magata-Manggahan reference area",coordinate_status:"dummy_for_qa",routing_status:"active routing node"}
];

var NODES=[
 {id:"hub",name:"Laiban Proper / ALS Hub",kind:"depot",lat:14.61785,lng:121.38961,learners:0,days:0,visits30:0,sitios:"Deployment origin / Laiban Proper",coordinate_status:"public_reference_unverified"},
 {id:"maysawa",name:"Sitio Maysawa",kind:"node",lat:14.59780,lng:121.35114,learners:28,days:12,visits30:1,sitios:"Barangay Laiban",coordinate_status:"public_reference_unverified",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"toyang",name:"Sitio Toyang",kind:"node",lat:14.61080,lng:121.38180,learners:34,days:18,visits30:1,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"ibucao",name:"Sitio Ibucao",kind:"node",lat:14.60220,lng:121.38480,learners:38,days:24,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"kilabuwan",name:"Sitio Kilabuwan",kind:"node",lat:14.62260,lng:121.40360,learners:29,days:27,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"banatas",name:"Sitio Banatas",kind:"node",lat:14.60940,lng:121.39940,learners:27,days:16,visits30:1,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"iwi_iw",name:"Sitio Iwi-Iw",kind:"node",lat:14.62800,lng:121.39170,learners:31,days:21,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"old_laiban",name:"Sitio Old Laiban",kind:"node",lat:14.61880,lng:121.39700,learners:30,days:9,visits30:2,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"manggahan",name:"Sitio Manggahan",kind:"node",lat:14.62679,lng:121.41616,learners:35,days:30,visits30:0,sitios:"Barangay Laiban",coordinate_status:"public_area_reference_unverified",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"},
 {id:"magata",name:"Sitio Magata",kind:"node",lat:14.63140,lng:121.42020,learners:32,days:26,visits30:0,sitios:"Barangay Laiban",coordinate_status:"dummy_for_qa",dataSource:"Simulated sitio allocation from official Barangay Laiban CY 2026 OSY total"}
];
var DEMAND_DATA_META={
 source:"Barangay Laiban Sex Disaggregated Data CY 2026",
 official_barangay_osy_total:284,
 allocation_level:"sitio",
 allocation_status:"simulated_from_official_barangay_total",
 note:"The SK-provided record contains a Barangay Laiban-wide OSY total only and has no sitio-level breakdown. Sitio demand values are controlled simulated allocations whose sum equals the official total of 284 OSY."
};
var HISTORY_DATA_META={
 source:"Controlled simulation",
 variable:"H",
 status:"simulated",
 period:"previous 30 days",
 note:"No historical mobile-schooling deployment record was available. Initial visit history is simulated to create unequal service exposure among the nine sitios for fairness testing. The same initial history is provided to Standard Q-Learning and MODQL."
};
var N={};NODES.forEach(function(n){N[n.id]=n});
var SERVICE_IDS=NODES.filter(function(n){return n.kind==="node"}).map(function(n){return n.id});

/* Only use a bundled policy when its node index matches the active Laiban
   graph. This protects the runtime from replaying an incompatible policy. */
function trainedPolicyMatchesCurrentGraph(){
 if(typeof TRAINED_POLICY==="undefined"||!TRAINED_POLICY.node_bit_index) return false;
 if(TRAINED_POLICY.version!=="laiban-methodology-state-v2") return false;
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

var ROAD_GRAPH_SOURCES={
 barangay_sk:{
   label:"Barangay Laiban SK local stakeholder account (Sep 2026)",
   type:"local stakeholder / key informant",
   supports:["Ibucao landslide and river exposure","Banatas creek crossing","Old Laiban-Kilabuwan-Manggahan river crossings","Manggahan-Magata conditional boat access"]
 },
 trail_route:{
   label:"Conquer Trail Adventure route notes (public route description)",
   type:"public route reference",
   supports:["Sitio Tuyang to Barangay Laiban rough/downhill dirt road","nine Laiban/Malinaw river crossings","trail near Barangay Hall toward Sitio Maysawa"]
 },
 old_laiban_road:{
   label:"Provincial Government of Rizal - Concreting of Old Laiban Road (2021)",
   type:"official public works record",
   supports:["existence of Old Laiban Road"]
 },
 osm_refs:{
   label:"OpenStreetMap-derived public references",
   type:"public map reference",
   supports:["Laiban Barangay Hall anchor","Maysawa reference point","Magata-Manggahan area reference"]
 }
};

var ROAD_GRAPH_META={
 version:"laiban-step3-provisional-v1",
 status:"provisional_for_qa",
 location_scope:"Barangay Laiban, Tanay, Rizal",
 stakeholder_source:"Barangay Laiban SK local stakeholder information",
 verification_note:"Exact road geometry, road class, distances, and unsupported connections remain pending official/field verification."
};

var EDGES=[
 /* Step 3 completed best-supported road graph.
    The topology below prioritizes links supported by SK/local evidence,
    public route descriptions, and an official Old Laiban road record.
    Only Iwi-Iw remains attached by an explicitly QA-only connector because
    no reliable public/topological source was found for its exact road link. */

 /* Public route notes + SK both support the western approach into Laiban. */
 {a:"hub",b:"toyang",surf:"ford",bend:[[14.6148,121.3857],[14.6117,121.3834]],graph_status:"best_supported",source_keys:["trail_route"],verification:"provisional_topology",access_profile:"multi_river",note:"Public trail notes describe Sitio Tuyang as the junction to Barangay Laiban via a rough/downhill dirt road with nine river crossings."},
 {a:"hub",b:"ibucao",surf:"ford",bend:[[14.6128,121.3872],[14.6074,121.3858]],graph_status:"best_supported",source_keys:["barangay_sk"],verification:"provisional_topology",access_profile:"landslide_river",note:"SK reports the Ibucao-Laiban approach as landslide-prone, mountainous, and involving multiple river crossings."},

 /* Public route notes explicitly describe a trail near the Barangay Hall to Maysawa. */
 {a:"hub",b:"maysawa",surf:"dirt",bend:[[14.6118,121.3820],[14.6048,121.3695]],graph_status:"best_supported",source_keys:["trail_route","osm_refs"],verification:"provisional_topology",access_profile:"mountain_path",note:"Public route description places a trail toward Sitio Maysawa just before the Laiban Barangay Hall; exact geometry remains unverified."},

 /* Old Laiban has an official provincial road-concreting record. */
 {a:"hub",b:"old_laiban",surf:"concrete",bend:[[14.6183,121.3932]],graph_status:"best_supported",source_keys:["old_laiban_road","barangay_sk"],verification:"provisional_topology",access_profile:"normal_road",note:"Official provincial record confirms Old Laiban Road; SK route account links Old Laiban onward toward Kilabuwan."},

 /* Banatas creek condition is directly from the SK account. */
 {a:"hub",b:"banatas",surf:"ford",bend:[[14.6136,121.3950]],graph_status:"best_supported",source_keys:["barangay_sk"],verification:"provisional_topology",access_profile:"creek_crossing",note:"SK reports that reaching Banatas requires crossing a creek."},

 /* Exact Iwi-Iw road topology remains unresolved. */
 {a:"hub",b:"iwi_iw",surf:"gravel",bend:[[14.6231,121.3904]],graph_status:"qa_connector",source_keys:[],verification:"dummy",access_profile:"unknown_qa",note:"Temporary QA-only connector. Exact Iwi-Iw road connection remains unresolved."},

 /* SK describes the Old Laiban -> Kilabuwan -> Manggahan sequence. */
 {a:"old_laiban",b:"kilabuwan",surf:"ford",bend:[[14.6202,121.4001]],graph_status:"best_supported",source_keys:["barangay_sk"],verification:"provisional_topology",access_profile:"multi_river",note:"SK reports several river crossings from Old Laiban toward Kilabuwan."},
 {a:"kilabuwan",b:"manggahan",surf:"ford",bend:[[14.6249,121.4095]],graph_status:"best_supported",source_keys:["barangay_sk","osm_refs"],verification:"provisional_topology",access_profile:"multi_river",note:"SK reports several river crossings along Kilabuwan toward Manggahan; Manggahan is also supported by the public Magata-Manggahan area reference."},

 /* Manggahan-Magata locality pair is supported by the SK account and school/locality references. */
 {a:"manggahan",b:"magata",surf:"ford",bend:[[14.6290,121.4183]],graph_status:"best_supported",source_keys:["barangay_sk","osm_refs"],verification:"provisional_topology",access_profile:"boat_river",note:"SK reports a possible boat alternative between/for the Manggahan-Magata area when conditions permit; exact landing and road geometry are unverified."},

 /* Keep limited local redundancy for routing QA, but mark it explicitly as inferred rather than official. */
 {a:"banatas",b:"old_laiban",surf:"gravel",bend:[[14.6147,121.3982]],graph_status:"inferred_connector",source_keys:["barangay_sk"],verification:"inferred_for_qa",access_profile:"unknown_qa",note:"Inferred local connector used for QA continuity; the SK account supports both areas but did not explicitly state this direct road."}
];

var WX={mm:38};
var CLOCK={h:8,m:48};
var SHIFT_MIN=480;
var TIME_DATA_META={
 source:"Controlled simulation",
 variable:"T",
 status:"simulated operational constraint",
 shift_minutes:480,
 shift_hours:8,
 note:"Each simulated deployment day begins with an 8-hour service window. Travel and on-site service consume the remaining time. The same time budget is provided to both algorithms."
};
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
 best_supported:EDGES.filter(function(e){return e.graph_status==="best_supported"}).length,
 inferred_connector:EDGES.filter(function(e){return e.graph_status==="inferred_connector"}).length,
 qa_connector:EDGES.filter(function(e){return e.graph_status==="qa_connector"}).length
};

function rainBand(mm){return mm<10?0:mm<30?1:mm<60?2:3}
function wxFactor(surf){
 var b=rainBand(WX.mm),paved=surf==="concrete";
 if(paved)return [1,1,.95,.85][b];
 if(surf==="ford")return [1,.85,.45,.15][b];
 return [1,.85,.60,.35][b];
}

/* Step 4: stakeholder-informed accessibility profile.
   This profile is applied inside accA(), so Standard Q-Learning and MODQL
   always receive the exact same road condition for a given scenario. */
function localRiskFactor(e){
 var b=rainBand(WX.mm),p=e.access_profile||"normal_road";
 if(p==="normal_road") return [1.00,1.00,.95,.85][b];
 if(p==="mountain_path") return [1.00,.90,.65,.30][b];
 if(p==="creek_crossing") return [1.00,.80,.45,.05][b];
 if(p==="multi_river") return [1.00,.75,.35,.05][b];
 if(p==="landslide_river") return [1.00,.70,.25,.00][b];
 if(p==="boat_river"){
   /* SK notes boats may be an alternative in this area, but severe rain can
      still make access impossible. Moderate rain keeps a reduced connection. */
   return [1.00,.85,.55,.00][b];
 }
 if(p==="unknown_qa") return [1.00,.85,.60,.35][b];
 return 1;
}
function accessibilityReason(e){
 var p=e.access_profile||"normal_road",b=rainBand(WX.mm);
 if(p==="landslide_river") return b>=3?"severe rain: landslide/river route closed":b>=2?"heavy rain: high landslide and river-crossing risk":"landslide-prone, river-sensitive route";
 if(p==="multi_river") return b>=3?"severe rain/flooding: river crossings closed":b>=2?"heavy rain: multiple river crossings strongly restricted":"multiple river crossings";
 if(p==="creek_crossing") return b>=3?"severe rain: creek crossing closed":b>=2?"heavy rain: creek crossing restricted":"creek crossing";
 if(p==="boat_river") return b>=3?"severe rain: road/boat access unavailable":b>=2?"heavy rain: conditional boat/river access only":"conditional boat alternative where safe";
 if(p==="mountain_path") return b>=3?"severe rain: mountain path highly unsafe":b>=2?"heavy rain: slippery mountain path":"mountain/unimproved path";
 if(p==="unknown_qa") return "QA-only accessibility assumption";
 return "normal road accessibility";
}
function sevFloor(s){return s==="impassable"?.05:s==="major"?.40:.72}
function confidence(r){if(r.cleared)return .10;var b=r.src==="advisory"?1:r.src==="driver"?.55:.45;b+=(r.reporters-1)*.20;if(r.src==="telemetry")b=.35;b=Math.min(1,b);return b*Math.pow(.5,r.ago/6)}
function reportFactor(k){var f=1;REPORTS.forEach(function(r){if(r.edge!==k)return;var c=confidence(r),fl=sevFloor(r.sev);f=Math.min(f,fl+(1-c)*(1-fl))});return f}
function accA(e){
 for(var i=0;i<ADVISORIES.length;i++) if(ADVISORIES[i].edge===e.key) return 0;
 var v=SURF[e.surf].a*wxFactor(e.surf)*localRiskFactor(e)*reportFactor(e.key);
 return Math.max(0,Math.min(1,v));
}
function band(A){return A>=.75?{k:"open",lab:"OPEN",col:"#7B753B"}:A>=.45?{k:"caut",lab:"CAUTION",col:"#A77A2D"}:A>=.20?{k:"rest",lab:"RESTRICTED",col:"#9A633B"}:{k:"cls",lab:"CLOSED",col:"#A24D42"}}
function speed(s){return s==="concrete"?38:s==="gravel"?24:s==="ford"?12:16}
function edgeMin(e){var A=accA(e);return (e.km/speed(e.surf))*60/Math.max(A,.08)}
var SERVICE_MIN_PER_STOP=60;
function serviceMin(n){
 return SERVICE_MIN_PER_STOP;
}
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
function demandBucket(value,maxDemand){\n var r=value/Math.max(maxDemand,1);\n return r<.45?1:r<.75?2:3;\n}\nfunction historyBucket(days){\n return days<=7?0:days<=14?1:days<=21?2:3;\n}\nfunction routeAccessibility(p){\n if(!p||!p.legs||!p.legs.length)return 0;\n var worst=1;\n p.legs.forEach(function(edge){worst=Math.min(worst,accA(edge))});\n return worst;\n}\nfunction proposedStateKey(cur,mask,remaining,visits,historyDays){\n var maxDemand=Math.max.apply(null,SERVICE_IDS.map(function(id){return N[id].learners}));\n var d=[],h=[],a=[];\n SERVICE_IDS.forEach(function(id){\n  var served=!!(mask&(1<<BITIDX[id]));\n  var p=served?null:path(cur,id);\n  if(served||!p){d.push(0);a.push(0)}else{d.push(demandBucket(N[id].learners,maxDemand));a.push(accessBucket(routeAccessibility(p)))}\n  h.push(historyBucket(historyDays[id]||0));\n });\n return "L="+cur+"|D="+d.join("")+"|T="+timeBucket(remaining)+"|H="+h.join("")+"|A="+a.join("");\n}\n\nfunction learnedStandardAction(cur){
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
  var sk=proposedStateKey(cur,mask,left,visits,historyDays),learned=learnedMODQLAction(sk),best=null;
  feasible.forEach(function(c){
   var trial=SERVICE_IDS.map(function(id){return (visits[id]||0)+(id===c.id?1:0)});
   var J=jain(trial),cov=N[c.id].learners/maxL,fallback=cov*J*(1/Math.max(c.p.min/60,1e-6));
   var fromPolicy=learned===c.id,score=fromPolicy?Number.MAX_SAFE_INTEGER:fallback;
   if(!best||score>best.score)best={id:c.id,p:c.p,score:score,J:J,cov:cov,usedPolicy:fromPolicy,stateKey:sk};
  });
  var t0=hhmm(hh,mm+best.p.min);
  stops.push({id:best.id,p:best.p,arrive:t0,score:best.score,J:best.J,usedPolicy:best.usedPolicy,stateKey:best.stateKey});
  var adv=best.p.min+serviceMin(N[best.id]);mm+=adv;left-=adv;visits[best.id]++;historyDays[best.id]=0;cur=best.id;mask|=(1<<BITIDX[best.id]);pending.splice(pending.indexOf(best.id),1);
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
