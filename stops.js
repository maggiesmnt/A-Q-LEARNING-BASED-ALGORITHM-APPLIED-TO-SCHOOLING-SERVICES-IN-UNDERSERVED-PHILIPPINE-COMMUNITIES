/* ============================================================================
   STOPS.JS — "Today's deployment" list view (the operational MODQL route).
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
    '<div class="kpi c"><div class="lab">Jain&rsquo;s J after today</div><div class="v">'+jain(vis).toFixed(3)+'</div><div class="d">visit-frequency evenness</div></div>';

  var weekly=document.getElementById("weeklySequence");
  if(weekly){
    weekly.innerHTML=PLAN.stops.map(function(s,i){
      var status=i<PROGRESS?"completed":i===PROGRESS?"next":"scheduled";
      return '<span class="tag '+(i<PROGRESS?'eq':i===PROGRESS?'hot':'')+'">Week '+(i+1)+': '+N[s.id].name.replace("Sitio ","")+' · '+status+' · '+s.arrive+'</span>';
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
    var d=document.createElement("div");d.className="stop "+cls;
    d.innerHTML='<div class="n">'+(i<PROGRESS?"\u2713":(i+1))+'</div><div style="flex:1;min-width:0">'+
      '<div class="nm">'+n.name+'</div>'+
      '<div class="mt"><span class="tag">'+n.learners+' learners</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span>'+
      '<span class="tag" style="color:'+b.col+'">worst segment A '+worst.toFixed(2)+' &middot; '+b.lab+'</span>'+
      '<span class="tag">'+serviceMin(n)+' min on site</span>'+
      '<span class="tag" style="color:'+(s.usedPolicy?"var(--go)":"var(--dim2)")+'">'+(s.usedPolicy?"trained policy":"fallback formula")+'</span></div>'+
      '<div class="k" style="margin-top:7px">via '+s.p.seq.map(function(x){return N[x].name.replace("Sitio ","")}).join(" \u2192 ")+'</div>'+
      '</div><div class="rt"><b>'+s.arrive+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div>';
    L2.appendChild(d);
  });
  var dl=document.getElementById("deferList");
  if(!PLAN.deferred.length){dl.innerHTML="None &mdash; every scheduled community is reachable under current conditions.";}
  else{dl.innerHTML=PLAN.deferred.map(function(df){
    return '<div style="margin-bottom:8px"><b style="color:var(--bad)">'+N[df.id].name+'</b> &mdash; '+df.reason+
      '<br><span style="color:var(--dim2)">'+N[df.id].learners+' learners &middot; last served '+N[df.id].days+
      ' days ago &middot; H-priority boost applied to next deployment</span></div>'}).join("");}
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
      week:"Week of Aug 30, 2026",
      date:"Completed",
      communities:["Mahabang Lalim","Daraitan Proper","Sta. Inez","Cayabu"],
      learners:263,
      route:"Laiban ALS Hub → Mahabang Lalim → Daraitan Proper → Sta. Inez → Cayabu → Laiban ALS Hub",
      travel:"186 min travel",
      missed:["Tinipak (deferred by ford level)","Pungo (outside remaining time budget)"]
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
