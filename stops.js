/* ============================================================================
   STOPS.JS — "Today's deployment" list view (the operational MODQL route).
   ============================================================================ */

function renderStops(){
  var totalKm=0,totalMin=0,learners=0;
  PLAN.stops.forEach(function(s){totalKm+=s.p.km;totalMin+=s.p.min+serviceMin(N[s.id]);learners+=N[s.id].learners});
  if(PLAN.ret)totalKm+=PLAN.ret.km;
  var vis=[];NODES.forEach(function(n){if(n.kind==="node")vis.push(PLAN.visits[n.id])});
  document.getElementById("dayKpis").innerHTML=
    '<div class="kpi a"><div class="lab">Learners reached</div><div class="v">'+learners+'</div><div class="d">'+PLAN.stops.length+' of '+(NODES.length-1)+' communities</div></div>'+
    '<div class="kpi b"><div class="lab">Route length</div><div class="v">'+totalKm.toFixed(1)+'<span style="font-size:13px"> km</span></div><div class="d">'+Math.floor(totalMin/60)+'h '+Math.round(totalMin%60)+'m incl. service time</div></div>'+
    '<div class="kpi c"><div class="lab">Jain&rsquo;s J after today</div><div class="v">'+jain(vis).toFixed(3)+'</div><div class="d">visit-frequency evenness</div></div>';

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
      '<span class="tag">'+serviceMin(n)+' min on site</span></div>'+
      '<div class="k" style="margin-top:7px">via '+s.p.seq.map(function(x){return N[x].name.replace("Sitio ","")}).join(" \u2192 ")+'</div>'+
      '</div><div class="rt"><b>'+s.arrive+'</b>'+s.p.km.toFixed(1)+' km &middot; '+Math.round(s.p.min)+' min</div>';
    L2.appendChild(d);
  });
  var dl=document.getElementById("deferList");
  if(!PLAN.deferred.length){dl.innerHTML="None &mdash; every scheduled community is reachable under current conditions.";}
  else{dl.innerHTML=PLAN.deferred.map(function(df){
    return '<div style="margin-bottom:8px"><b style="color:#ffabad">'+N[df.id].name+'</b> &mdash; '+df.reason+
      '<br><span style="color:var(--dim2)">'+N[df.id].learners+' learners &middot; last served '+N[df.id].days+
      ' days ago &middot; H-priority boost applied to next deployment</span></div>'}).join("");}
}
