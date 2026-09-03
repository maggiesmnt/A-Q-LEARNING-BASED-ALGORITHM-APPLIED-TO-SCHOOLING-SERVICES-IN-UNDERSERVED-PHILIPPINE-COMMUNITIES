/* ============================================================================
   DRIVE.JS — the turn-by-turn drive card, live refresh/replan, and the
   "Report road condition" bottom sheet (this is the field-facing half of
   the hazard-reporting answer to the panel's question).
   ============================================================================ */

function nextStop(){return PLAN.stops[PROGRESS]||null}
function renderDrive(){
  var s=nextStop();
  if(!s){
    document.getElementById("stopName").textContent="Return to Laiban ALS Hub";
    document.getElementById("stopTags").innerHTML='<span class="tag eq">deployment complete</span>';
    document.getElementById("etaMin").textContent=PLAN.ret?Math.round(PLAN.ret.min):0;
    document.getElementById("etaClock").textContent="min to hub";
    document.getElementById("turnText").textContent="All scheduled stops served";
    document.getElementById("turnSub").textContent="Head back via the returning corridor";
  }else{
    var n=N[s.id], leg=s.p.legs[0], A=accA(leg), b=band(A);
    document.getElementById("stopName").textContent=n.name;
    document.getElementById("stopTags").innerHTML=
      '<span class="tag">'+n.learners+' learners (D)</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago (H)</span>'+
      '<span class="tag eq">'+s.p.km.toFixed(1)+' km</span>';
    document.getElementById("etaMin").textContent=Math.round(s.p.min);
    document.getElementById("etaClock").textContent="min &middot; arrive "+s.arrive;
    document.getElementById("turnText").textContent="Continue on "+N[leg.a].name.replace("Sitio ","")+"\u2013"+N[leg.b].name.replace("Sitio ","")+" road";
    document.getElementById("turnSub").innerHTML=leg.km.toFixed(1)+" km &middot; "+SURF[leg.surf].lab+
      ' &middot; <b style="color:'+b.col+'">A '+A.toFixed(2)+" "+b.lab+"</b>";
  }
  var strip=document.getElementById("routeStrip");strip.innerHTML="";
  PLAN.stops.forEach(function(st,i){
    var d=document.createElement("div");
    d.className="s "+(i<PROGRESS?"done":i===PROGRESS?"now":"");
    d.innerHTML="<b>"+(i+1)+". "+N[st.id].name.replace("Sitio ","")+"</b>"+st.arrive+" &middot; "+N[st.id].learners+" learners";
    strip.appendChild(d);
  });
  PLAN.deferred.forEach(function(df){
    var d=document.createElement("div");d.className="s skip";
    d.innerHTML="<b>\u2298 "+N[df.id].name.replace("Sitio ","")+"</b>deferred";
    strip.appendChild(d);
  });
  document.getElementById("pbar").style.width=(100*PROGRESS/Math.max(1,PLAN.stops.length))+"%";
  var used=0;PLAN.stops.slice(0,PROGRESS).forEach(function(st){used+=st.p.min+serviceMin(N[st.id])});
  var left=Math.max(0,SHIFT_MIN-used);
  document.getElementById("shiftLeft").textContent=Math.floor(left/60)+"h "+Math.round(left%60)+"m";
  document.getElementById("wxMm").textContent=WX.mm+" mm";
  var live=REPORTS.filter(function(r){return !r.cleared&&confidence(r)>=0.15}).length+ADVISORIES.length;
  document.getElementById("hzCount").textContent=live;
  document.getElementById("tabBdg").textContent=live;
  document.getElementById("tabBdg").style.display=live?"block":"none";
}

function alertShow(title,text){
  document.getElementById("alertTitle").textContent=title;
  document.getElementById("alertText").innerHTML=text;
  document.getElementById("alertBar").classList.add("show");
}
document.getElementById("alertClose").onclick=function(){document.getElementById("alertBar").classList.remove("show")};

/* replan + repaint everything (operational views + analysis tabs) */
function refresh(msg){
  var before=PLAN.stops.map(function(s){return s.id}).join(",");
  var beforeDef=PLAN.deferred.length;
  PLAN=planRoute();
  if(PROGRESS>PLAN.stops.length)PROGRESS=PLAN.stops.length;
  drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();
  if(typeof renderAnalysis==="function") renderAnalysis();
  var after=PLAN.stops.map(function(s){return s.id}).join(",");
  if(msg){
    var extra = (after!==before)?" Stop order updated.":"";
    if(PLAN.deferred.length>beforeDef) extra+=" "+N[PLAN.deferred[PLAN.deferred.length-1].id].name+" deferred to the next deployment with an H-priority boost.";
    alertShow(msg.t,msg.b+extra);
  }
}

/* ============================ REPORT SHEET ============================ */
var HZTYPES=[{t:"Landslide",em:"\u26F0"},{t:"Flooding",em:"\uD83D\uDCA6"},{t:"Washout",em:"\uD83D\uDD73"},{t:"Fallen tree",em:"\uD83C\uDF32"},
             {t:"Mud / slippery",em:"\uD83D\uDFEB"},{t:"Bridge damage",em:"\uD83C\uDF09"},{t:"River rising",em:"\uD83C\uDF0A"},{t:"Impassable",em:"\u26D4"}];
var pickType=0,pickSev="major";
(function(){
  var g=document.getElementById("hzGrid");
  HZTYPES.forEach(function(h,i){
    var b=document.createElement("button");b.className="hz"+(i===0?" on":"");
    b.innerHTML='<span class="em">'+h.em+'</span>'+h.t;
    b.onclick=function(){pickType=i;g.querySelectorAll(".hz").forEach(function(x){x.classList.remove("on")});b.classList.add("on")};
    g.appendChild(b);
  });
  document.querySelectorAll("#sevSegs button").forEach(function(b){
    b.onclick=function(){pickSev=b.getAttribute("data-sev");
      document.querySelectorAll("#sevSegs button").forEach(function(x){x.classList.remove("on")});b.classList.add("on")};
  });
})();
function openSheet(){
  var s=nextStop(),leg=s?s.p.legs[0]:EDGES[0];
  window.__seg=leg.key;
  document.getElementById("sheetSeg").innerHTML="Segment ahead: <b>"+N[leg.a].name+" &harr; "+N[leg.b].name+"</b> &middot; "+SURF[leg.surf].lab;
  document.getElementById("veil").classList.add("show");
  document.getElementById("sheetReport").classList.add("show");
}
function closeSheet(){document.getElementById("veil").classList.remove("show");document.getElementById("sheetReport").classList.remove("show")}
document.getElementById("fab").onclick=openSheet;
document.getElementById("veil").onclick=closeSheet;
document.getElementById("repCancel").onclick=closeSheet;
document.getElementById("repSend").onclick=function(){
  var h=HZTYPES[pickType];
  REPORTS.push({id:nextRepId++,edge:window.__seg,type:h.t,em:h.em,sev:pickSev,src:"driver",reporters:1,ago:0,cleared:false,
    who:"You (mobile unit)",note:"Reported from the field just now."});
  closeSheet();
  var e=EK[window.__seg];
  refresh({t:h.t+" reported",b:"Logged on "+N[e.a].name+" &harr; "+N[e.b].name+". Accessibility A recomputed to <b>"+accA(e).toFixed(2)+"</b>."});
};
