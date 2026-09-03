/* ============================================================================
   ANALYSIS.JS — the "kept separate from field operations" analysis section.

   Five sub-tabs:
     existing  — Standard Q-Learning on its own: how it works + its own live route
     proposed  — MODQL on its own: how it works + its own live route
     sop1      — SOP 1 (single-objective limitation): Existing vs Proposed
     sop2      — SOP 2 (overestimation bias): Existing vs Proposed
     sop3      — SOP 3 (limited state representation): Existing vs Proposed,
                 including the state-vector inspector and the hazard-response
                 evaluation the panel asked about.

   Existing/Proposed each compute and show their OWN full route, independent
   of the operational PLAN/PROGRESS in engine.js (which always reflects the
   dispatched, proposed-algorithm plan for today).
   ============================================================================ */

var analysisStd = null, analysisMod = null;

function computeAnalysisPlans(){
  analysisStd = planRouteStandard();
  analysisMod = planRoute();
}

function stopRowsHTML(plan){
  if(!plan.stops.length) return '<div class="k" style="padding:8px 0">No reachable communities under current conditions.</div>';
  return plan.stops.map(function(s,i){
    var n=N[s.id];
    return '<div class="stop"><div class="n">'+(i+1)+'</div><div style="flex:1;min-width:0">'+
      '<div class="nm">'+n.name+'</div>'+
      '<div class="mt"><span class="tag">'+n.learners+' learners</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span></div>'+
      '</div><div class="rt"><b>'+s.arrive+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div></div>';
  }).join("");
}

function deferredHTML(plan){
  if(!plan.deferred.length) return '<div class="k">None &mdash; every community reachable under current conditions.</div>';
  return plan.deferred.map(function(df){
    return '<div style="margin-bottom:6px"><b style="color:#ffabad">'+N[df.id].name+'</b> &mdash; '+df.reason+'</div>';
  }).join("");
}

function planKPIs(plan){
  var totalKm=0,totalMin=0,learners=0;
  plan.stops.forEach(function(s){totalKm+=s.p.km;totalMin+=s.p.min+serviceMin(N[s.id]);learners+=N[s.id].learners});
  if(plan.ret) totalKm+=plan.ret.km;
  var vis=[];NODES.forEach(function(n){if(n.kind==="node")vis.push(plan.visits[n.id])});
  return {learners:learners,served:plan.stops.length,totalKm:totalKm,totalMin:totalMin,J:jain(vis)};
}

/* ============================ EXISTING ALGORITHM TAB ============================ */
function renderExisting(){
  var k=planKPIs(analysisStd);
  document.getElementById("sub-existing").innerHTML =
    '<div class="algo-head std"><div class="ic">\u03A3</div><div><h2>Existing Algorithm &mdash; Standard Q-Learning</h2>'+
    '<p>Single value table, location-only state, travel-time-only reward</p></div></div>'+

    '<div class="card"><h3>How it works</h3>'+
    '<div class="k" style="margin-bottom:9px">State is just the current location: <span class="mono">S = L</span>. '+
    'Reward is a single scalar &mdash; travel efficiency only. One Q-table both <i>selects</i> the next move and '+
    '<i>evaluates</i> it, using the same max operator:</div>'+
    '<div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px">Q(s,a) &larr; Q(s,a) + &alpha;[ r + &gamma;&middot;max Q(s&prime;,a&prime;) &minus; Q(s,a) ]</div>'+
    '<div class="k" style="margin-top:9px">In this prototype the trained policy\u2019s greedy behaviour is replayed directly: at every '+
    'decision point the unit simply heads to whichever reachable community is <b>closest in travel time</b>. It has no notion of how '+
    'many learners are waiting (D) or how long it\u2019s been since a community was served (H) &mdash; it will happily serve the same '+
    'easy, nearby barangay every deployment while a farther, higher-need sitio waits indefinitely.</div></div>'+

    '<div class="g3">'+
      '<div class="kpi a" style="border-top:3px solid var(--vio)"><div class="lab">Learners reached</div><div class="v">'+k.learners+'</div><div class="d">'+k.served+' of '+(NODES.length-1)+' communities</div></div>'+
      '<div class="kpi" style="border-top:3px solid var(--vio)"><div class="lab">Route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">'+Math.floor(k.totalMin/60)+'h '+Math.round(k.totalMin%60)+'m</div></div>'+
      '<div class="kpi" style="border-top:3px solid var(--vio)"><div class="lab">Jain&rsquo;s J today</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">visit-frequency evenness</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="card"><h3>Route this algorithm would run right now</h3>'+stopRowsHTML(analysisStd)+'</div>'+
    '<div class="card"><h3>Deferred</h3>'+deferredHTML(analysisStd)+'</div>';
}

/* ============================ PROPOSED ALGORITHM TAB ============================ */
function renderProposed(){
  var k=planKPIs(analysisMod);
  document.getElementById("sub-proposed").innerHTML =
    '<div class="algo-head mod"><div class="ic">\u2318</div><div><h2>Proposed Algorithm &mdash; MODQL</h2>'+
    '<p>Multi-Objective Double Q-Learning &mdash; enriched state, decoupled value tables, multiplicative reward</p></div></div>'+

    '<div class="card"><h3>How it works</h3>'+
    '<div class="k" style="margin-bottom:9px">State is enriched with four extra terms &mdash; location, demand, remaining time, '+
    'visit history, and live road accessibility:</div>'+
    '<div class="k mono" style="background:var(--ink3);padding:10px 12px;border-radius:10px">S = &lang;L, D, T, H, A&rang; &nbsp;&nbsp; R(s,a) = C &times; J &times; (1 / Travel Cost)</div>'+
    '<div class="k" style="margin-top:9px">Two independent value tables, Q<sub>1</sub> and Q<sub>2</sub>, take turns choosing an action '+
    'and evaluating it (selection decoupled from evaluation via <span class="mono">U ~ Uniform(0,1)</span>), which is what suppresses the '+
    'single-table overestimation bias described under SOP 2. The final policy uses Q<sub>final</sub> = Q<sub>1</sub> + Q<sub>2</sub>.</div>'+
    '<div class="k" style="margin-top:9px">This prototype replays that <i>converged, greedy</i> policy directly: at each stop it picks the '+
    'reachable community that maximizes coverage &times; fairness &times; (1&nbsp;/&nbsp;travel&nbsp;cost) &mdash; so a farther, long-neglected, '+
    'high-demand community can out-score a nearer but recently-served one.</div></div>'+

    '<div class="g3">'+
      '<div class="kpi a"><div class="lab">Learners reached</div><div class="v">'+k.learners+'</div><div class="d">'+k.served+' of '+(NODES.length-1)+' communities</div></div>'+
      '<div class="kpi b"><div class="lab">Route length</div><div class="v">'+k.totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">'+Math.floor(k.totalMin/60)+'h '+Math.round(k.totalMin%60)+'m</div></div>'+
      '<div class="kpi c"><div class="lab">Jain&rsquo;s J today</div><div class="v">'+k.J.toFixed(3)+'</div><div class="d">visit-frequency evenness</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="card"><h3>Route this algorithm would run right now</h3>'+stopRowsHTML(analysisMod)+'</div>'+
    '<div class="card"><h3>Deferred</h3>'+deferredHTML(analysisMod)+'</div>'+
    '<div class="k" style="text-align:center;margin-top:10px">This is the route currently driving the Drive / Stops tabs.</div>';
}

/* ============================ SOP 1 — single-objective limitation ============================ */
function renderSOP1(){
  var ks=planKPIs(analysisStd), km=planKPIs(analysisMod);
  var served=function(plan,id){return plan.stops.some(function(s){return s.id===id})};
  var rows=NODES.filter(function(n){return n.kind==="node"}).map(function(n){
    return '<tr><td><b>'+n.name+'</b><div class="k">'+n.learners+' learners</div></td>'+
      '<td>'+(served(analysisStd,n.id)?'<span class="pill open">served</span>':'<span class="pill cls">missed</span>')+'</td>'+
      '<td>'+(served(analysisMod,n.id)?'<span class="pill open">served</span>':'<span class="pill cls">missed</span>')+'</td></tr>';
  }).join("");

  document.getElementById("sub-sop1").innerHTML =
    '<div class="sop-problem"><b>SOP 1 &mdash; Single-objective limitation</b> (Table 1.1 / 3.3). Standard Q-Learning optimizes one '+
    'metric &mdash; distance or time &mdash; with no direct mechanism for student coverage or service fairness.</div>'+

    '<div class="split2">'+
      '<div class="splitcol std"><h4>Existing &mdash; Standard Q-Learning</h4>'+
        '<div class="k">One metric: travel time. No fairness or coverage term in the reward at all.</div></div>'+
      '<div class="splitcol mod"><h4>Proposed &mdash; MODQL</h4>'+
        '<div class="k">R = C &times; J &times; (1/Cost) &mdash; multiplicative, so a route can\u2019t buy a good score on distance while letting coverage or fairness collapse to near zero.</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="g3">'+
      '<div class="kpi" style="border-top:3px solid var(--vio)"><div class="lab">Standard &mdash; Jain&rsquo;s J</div><div class="v" style="color:#b7aef0">'+ks.J.toFixed(3)+'</div><div class="d">'+ks.served+' communities served</div></div>'+
      '<div class="kpi" style="border-top:3px solid var(--go)"><div class="lab">MODQL &mdash; Jain&rsquo;s J</div><div class="v" style="color:#8ef0cf">'+km.J.toFixed(3)+'</div><div class="d">'+km.served+' communities served</div></div>'+
      '<div class="kpi"><div class="lab">Difference</div><div class="v">'+(ks.J>0?(((km.J-ks.J)/ks.J)*100).toFixed(0):"\u2014")+'%</div><div class="d">fairness, this run</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="card"><h3>Composite reward per episode (Chapter 4 training curve)</h3>'+
    '<div class="k" style="margin-bottom:8px">Illustrative &mdash; see note on the Existing/Proposed formulas above; replace with real logged training values before the defense.</div>'+
    svgLine([{d:SIM.mq,c:"#25d07a"},{d:SIM.sq,c:"#8b7dff"}],{xs:SIM.ep,dp:2,h:200})+
    '<div class="lg"><span><i style="background:#25d07a"></i> MODQL (proposed)</span><span><i style="background:#8b7dff"></i> Standard Q-learning (control)</span></div></div>'+

    '<div class="card"><h3>Who gets served, this run</h3><table><thead><tr><th>Community</th><th>Standard</th><th>MODQL</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

/* ============================ SOP 2 — overestimation bias ============================ */
function renderSOP2(){
  document.getElementById("sub-sop2").innerHTML =
    '<div class="sop-problem"><b>SOP 2 &mdash; Overestimation bias</b> (Table 1.2 / 3.4). A single Q-table both selects and evaluates '+
    'the next action with the same max operator, which systematically inflates value estimates and can trap the policy on a route that '+
    'only looked good once by chance.</div>'+

    '<div class="split2">'+
      '<div class="splitcol std"><h4>Existing &mdash; single table</h4>'+
        '<div class="k mono" style="background:var(--ink3);padding:9px 10px;border-radius:9px;margin-bottom:8px">Q(s,a) &larr; Q(s,a) + &alpha;[r + &gamma;&middot;max Q(s&prime;,a&prime;) &minus; Q(s,a)]</div>'+
        '<div class="k">The same table proposes the best next move <i>and</i> scores how good that move turns out to be &mdash; nothing checks its own optimism.</div></div>'+
      '<div class="splitcol mod"><h4>Proposed &mdash; decoupled Q1 / Q2</h4>'+
        '<div class="k mono" style="background:var(--ink3);padding:9px 10px;border-radius:9px;margin-bottom:8px">U~Unif(0,1): update Q1 using Q2&rsquo;s evaluation, or Q2 using Q1&rsquo;s &mdash; chosen at random each step</div>'+
        '<div class="k">One table picks the action, the <i>other, independently-updated</i> table scores it. Final policy uses Q1 + Q2.</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="card"><h3>Value stability &mdash; decoupled estimator spread</h3>'+
    '<div class="k" style="margin-bottom:8px"><b>Illustrative values</b> &mdash; produced by this prototype\u2019s demonstration curve generator, not a real training log. '+
    'Replace with your Chapter 4 |Q1&minus;Q2| logs from the 500&ndash;2,000-episode runs before using this for the actual defense.</div>'+
    svgLine([{d:SIM.sp,c:"#ffb020"},{d:SIM.dr,c:"#ff4d4f"}],{xs:SIM.ep,dp:2,min:0,max:1,h:200})+
    '<div class="lg"><span><i style="background:#ffb020"></i> mean |Q1 &minus; Q2| (MODQL)</span><span><i style="background:#ff4d4f"></i> single-table drift (Standard)</span></div>'+
    '<div class="kpi" style="margin-top:12px;max-width:260px"><div class="lab">Q-value spread at convergence</div><div class="v" style="color:#8b7dff">'+SIM.sp[SIM.sp.length-1].toFixed(3)+'</div><div class="d">overestimation proxy &mdash; illustrative</div></div></div>';
}

/* ============================ SOP 3 — limited state representation ============================ */
function renderSOP3(){
  var e0=EDGES[0];
  var html =
    '<div class="sop-problem"><b>SOP 3 &mdash; Limited state representation</b> (Table 1.3 / 3.5). A location-only state can\u2019t tell an '+
    'urgent, long-unserved barangay from one just visited, or a passable road from a washed-out one. This is also the direct answer to '+
    '<b>the panel\u2019s question</b>: how does the system know a road is unavailable due to a hazard or disaster?</div>'+

    '<div class="split2">'+
      '<div class="splitcol std"><h4>Existing &mdash; S = L</h4><div class="k">Only knows where it is. It still can\u2019t drive through a closed '+
      'road (that mask is enforced by the shared road-search layer, not the algorithm itself) &mdash; but it has no reason to prefer a road in good '+
      'condition over one that\u2019s merely still technically open, and no memory of who it\u2019s neglecting.</div></div>'+
      '<div class="splitcol mod"><h4>Proposed &mdash; S = &lang;L,D,T,H,A&rang;</h4><div class="k">A (road accessibility) and H (visit history) are '+
      'first-class parts of the state the policy was trained on, so its scoring naturally favours safer, more-open corridors and long-neglected communities.</div></div>'+
    '</div><div style="height:12px"></div>'+

    '<div class="card"><h3>How A (road accessibility) is computed</h3>'+
    '<div class="k" style="margin-bottom:10px">A = surface baseline &times; weather factor &times; report factor, clamped to [0, 1]. The band A falls '+
    'into decides whether the segment stays in the action set at all &mdash; for <b>both</b> algorithms equally.</div>'+
    '<table><thead><tr><th>Signal</th><th>Where it comes from</th><th>Effect on A</th></tr></thead><tbody>'+
      '<tr><td><b>Surface baseline</b></td><td>OpenStreetMap road class</td><td>Sets the ceiling: 1.00 / 0.85 / 0.65 / 0.50</td></tr>'+
      '<tr><td><b>Weather telemetry</b></td><td>Rainfall &amp; seasonal pattern feed</td><td>Scales unpaved segments hardest</td></tr>'+
      '<tr><td><b>Field / community report</b></td><td>Driver or barangay REPORT button</td><td>Pulls A toward the severity floor, weighted by confidence</td></tr>'+
      '<tr><td><b>Official advisory</b></td><td>LGU / DPWH / MDRRMO closure notice</td><td>Hard override: A = 0 until lifted</td></tr>'+
      '<tr><td><b>Unit telemetry</b></td><td>Mobile unit turns back or stalls mid-route</td><td>Auto-raises a low-confidence suspected-blockage report</td></tr>'+
    '</tbody></table></div>'+

    '<div class="card"><h3>Hazard-response evaluation (panel question)</h3>'+
    '<div class="k">Metrics to report in Chapter 4 for the disaster / road-closure scenario, measured by injecting closures during greedy evaluation (Phase 3):</div>'+
    '<table style="margin-top:9px"><tbody>'+
      '<tr><td><b>Detection-to-reroute latency</b></td><td>Epochs between a closure entering the state and the policy selecting an alternative action.</td></tr>'+
      '<tr><td><b>Entrapment rate</b></td><td>Episodes where the unit commits to a segment with A &lt; 0.20. Target: 0 under hard masking &mdash; applies to both algorithms since masking is shared.</td></tr>'+
      '<tr><td><b>Deferred-community recovery</b></td><td>Deployments until a community deferred by a closure is served, driven by the H-priority boost (MODQL only &mdash; Standard has no H term).</td></tr>'+
      '<tr><td><b>Fairness under disruption</b></td><td>Jain&rsquo;s J with closures active vs. clear conditions &mdash; measures whether hazards re-create the neglect pattern.</td></tr>'+
      '<tr><td><b>Cost of safety</b></td><td>Added travel time from A-weighted detours vs. distance-only routing.</td></tr>'+
    '</tbody></table></div>'+

    '<div class="card"><h3>State vector inspector</h3>'+
    '<div class="k" style="margin-bottom:11px">Live read of S = &lang;L, D, T, H, A&rang; for a selected community &mdash; the same values the operational view consumes.</div>'+
    '<select id="svNode"></select><div id="svBody" style="margin-top:12px"></div></div>';

  document.getElementById("sub-sop3").innerHTML = html;
  renderSV();
}

function renderSV(){
  var sel=document.getElementById("svNode");
  if(!sel) return;
  if(!sel.options.length){
    NODES.filter(function(n){return n.kind==="node"}).forEach(function(n){
      var o=document.createElement("option");o.value=n.id;o.textContent=n.name;sel.appendChild(o)});
    sel.onchange=renderSV;
  }
  var n=N[sel.value||sel.options[0].value];
  var p=path("hub",n.id);
  var worst=1;if(p)p.legs.forEach(function(e){worst=Math.min(worst,accA(e))});
  var used=0;PLAN.stops.slice(0,PROGRESS).forEach(function(st){used+=st.p.min+serviceMin(N[st.id])});
  var b=band(worst);
  var maxL=Math.max.apply(null,NODES.filter(function(x){return x.kind==="node"}).map(function(x){return x.learners}));
  document.getElementById("svBody").innerHTML=
   sv("L","Location","current node index in the OSM-digitised graph",n.name+" ("+n.lat.toFixed(4)+", "+n.lng.toFixed(4)+")","#31c8ff")+
   sv("D","Student demand","ALS learners registered at the node",n.learners+" learners ("+(n.learners/maxL).toFixed(2)+" normalised)","#25d07a")+
   sv("T","Time budget remaining","minutes left in the 480-min deployment shift",Math.round(SHIFT_MIN-used)+" min","#ffb020")+
   sv("H","Historical visit index","days since last service &middot; visits in last 30 days",n.days+" days &middot; "+n.visits30+" visits","#8b7dff")+
   sv("A","Road accessibility","worst segment on the best open approach from the hub",
      (p?worst.toFixed(2)+" &mdash; "+b.lab:"no open approach &mdash; masked"),b.col);
}
function sv(sym,nm,desc,val,col){
  return '<div class="sv"><div class="sym" style="color:'+col+'">'+sym+'</div>'+
   '<div class="nm"><b>'+nm+'</b>'+desc+'</div><div class="vv" style="color:'+col+'">'+val+'</div></div>';
}

/* ============================ dispatcher + sub-tab wiring ============================ */
function renderAnalysis(){
  computeAnalysisPlans();
  renderExisting();
  renderProposed();
  renderSOP1();
  renderSOP2();
  renderSOP3();
}

document.querySelectorAll(".rn-group button[data-sub]").forEach(function(b){
  b.onclick=function(){
    document.querySelectorAll(".rn-group button[data-sub]").forEach(function(x){x.classList.remove("on")});
    b.classList.add("on");
    document.querySelectorAll(".subview").forEach(function(v){v.classList.remove("active")});
    document.getElementById("sub-"+b.getAttribute("data-sub")).classList.add("active");
  };
});
