/* ============================================================================
   STOPS.JS — "Today's deployment" list view.
   ============================================================================ */

function renderStops(){
  var totalKm=0,totalMin=0,learners=0;
  var servedMin=0,remainingServiceMin=0;
  PLAN.stops.forEach(function(s){totalKm+=s.p.km;totalMin+=s.p.min+serviceMin(N[s.id]);learners+=N[s.id].learners});
  PLAN.stops.forEach(function(s,i){
    var svc=serviceMin(N[s.id]);
    if(i<PROGRESS) servedMin+=svc;
    else remainingServiceMin+=svc;
  });
  if(PLAN.ret)totalKm+=PLAN.ret.km;
  var vis=[];NODES.forEach(function(n){if(n.kind==="node")vis.push(PLAN.visits[n.id])});
  document.getElementById("dayKpis").innerHTML=
    '<div class="kpi a"><div class="lab">Learners reached</div><div class="v">'+learners+'</div><div class="d">'+PLAN.stops.length+' of '+(NODES.length-1)+' communities</div></div>'+
    '<div class="kpi b"><div class="lab">Route length</div><div class="v">'+totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">'+Math.floor(totalMin/60)+'h '+Math.round(totalMin%60)+'m incl. service time</div></div>'+
    '<div class="kpi c"><div class="lab">Visit balance</div><div class="v">'+jain(vis).toFixed(3)+'</div><div class="d">how evenly visits are shared</div></div>';

  var weekly=document.getElementById("weeklySequence");
  if(weekly){
    weekly.innerHTML=PLAN.stops.map(function(s,i){
      var status=i<PROGRESS?"completed":i===PROGRESS?"next":"scheduled";
      return '<span class="tag '+(i<PROGRESS?'eq':i===PROGRESS?'hot':'')+'">Stop '+(i+1)+': '+N[s.id].name.replace("Sitio ","")+' &middot; '+status+' &middot; '+formatOperationalTime(s.arrive)+'</span>';
    }).join(" ") || "No reachable communities in the current plan.";
  }
  var remaining=document.getElementById("remainingService");
  if(remaining){
    var remainingTravel=0;
    PLAN.stops.slice(PROGRESS).forEach(function(s){remainingTravel+=s.p.min});
    if(PLAN.ret) remainingTravel+=PLAN.ret.min;
    remaining.innerHTML='<b>'+Math.floor(remainingServiceMin/60)+'h '+Math.round(remainingServiceMin%60)+'m</b> learner service time remains, plus about <b>'+
      Math.round(remainingTravel)+' min</b> travel under current road accessibility. Completed service time: '+servedMin+' min.';
  }

  var L2=document.getElementById("stopsList");L2.innerHTML="";
  PLAN.stops.forEach(function(s,i){
    var n=N[s.id],cls=i<PROGRESS?"done":i===PROGRESS?"now":"";
    var worst=1,wl=null;
    s.p.legs.forEach(function(e){var A=accA(e);if(A<worst){worst=A;wl=e}});
    var b=band(worst);
    var roadLabel=b.lab.charAt(0)+b.lab.slice(1).toLowerCase();
    var d=document.createElement("div");d.className="stop "+cls;
    d.innerHTML='<div class="n">'+(i<PROGRESS?"\u2713":(i+1))+'</div><div style="flex:1;min-width:0">'+
      '<div class="nm">'+n.name+'</div>'+
      '<div class="mt"><span class="tag">'+n.learners+' learners</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span>'+
      '<span class="tag" style="color:'+b.col+'">road condition: '+roadLabel+'</span>'+
      '<span class="tag">'+(s.usedPolicy?(PLAN.methodology.indexOf("MODQL")>=0?'trained Q1+Q2':'trained Q'):'fallback formula')+'</span>'+
      '<span class="tag">'+serviceMin(n)+' min on site</span>'+
      '</div>'+
      '<div class="k" style="margin-top:7px">via '+s.p.seq.map(function(x){return N[x].name.replace("Sitio ","")}).join(" \u2192 ")+'</div>'+
      '</div><div class="rt"><b>'+formatOperationalTime(s.arrive)+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div>';
    L2.appendChild(d);
  });
  var dl=document.getElementById("deferList");
  if(!PLAN.deferred.length){dl.innerHTML="None &mdash; every scheduled community is reachable under current conditions.";}
  else{dl.innerHTML=PLAN.deferred.map(function(df){
    return '<div style="margin-bottom:8px"><b style="color:var(--bad)">'+N[df.id].name+'</b> &mdash; '+friendlyDeferredReason(df.reason)+
      '<br><span style="color:var(--dim2)">'+N[df.id].learners+' learners &middot; last served '+N[df.id].days+
      ' days ago &middot; moved to a later service day</span></div>'}).join("");}
}

function friendlyDeferredReason(reason){
  if(!reason) return "not reachable under current conditions";
  if(reason.indexOf("outside remaining time budget")>=0) return "not enough time left today";
  if(reason.indexOf("no open corridor")>=0||reason.indexOf("masked")>=0) return "no passable route right now";
  return reason;
}

function renderHistory(){
  var box=document.getElementById("historyList");
  if(!box) return;
  var completed=PLAN.stops.slice(0,PROGRESS);
  var currentRoute=PLAN.stops.map(function(s){return N[s.id].name.replace("Sitio ","")}).join(" → ");
  if(PLAN.ret) currentRoute+=(currentRoute?" → ":"")+"Laiban ALS Hub";
  var travel=0,served=0;
  completed.forEach(function(s){travel+=s.p.min;served+=N[s.id].learners});
  var deferred=PLAN.deferred.map(function(df){return N[df.id].name.replace("Sitio ","")+" ("+df.reason+")"});
  var records=[
    {
      week:"Week of Sep 6, 2026",
      date:"Current deployment",
      communities:completed.map(function(s){return N[s.id].name.replace("Sitio ","")}),
      learners:served,
      route:currentRoute||"No completed route yet",
      travel:Math.round(travel)+" min completed travel",
      missed:deferred
    },
    {
      week:"QA reference history",
      date:"Simulated",
      communities:["Maysawa","Toyang","Old Laiban","Banatas"],
      learners:154,
      route:"Laiban Proper / ALS Hub → Toyang → Maysawa → Banatas → Old Laiban → Laiban Proper / ALS Hub",
      travel:"simulated QA travel record",
      missed:["Ibucao (weather/accessibility constraint)","Manggahan (outside remaining time budget)"]
    }
  ];
  box.innerHTML=records.map(function(r){
    return '<div class="card">'+
      '<h3>'+r.week+' <span class="pill open">'+r.date+'</span></h3>'+
      '<div class="k"><b>Communities visited:</b> '+(r.communities.length?r.communities.join(", "):"None completed yet")+'</div>'+
      '<div class="k"><b>Learners served:</b> '+r.learners+'</div>'+
      '<div class="k history-route"><b>Route taken:</b> '+r.route+'</div>'+
      '<div class="k"><b>Travel time:</b> '+r.travel+'</div>'+
      '<div class="k"><b>Missed/deferred:</b> '+(r.missed.length?r.missed.join("; "):"None")+'</div>'+
      '<div class="k history-h"><b>H update fields:</b> date/week, visited IDs, learners served, completed route, travel minutes, and deferred IDs are separated for the next planning cycle.</div>'+
    '</div>';
  }).join("");
}
