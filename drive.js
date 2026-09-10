/* ============================================================================
   DRIVE.JS — the turn-by-turn drive card, live refresh/replan, and the
   "Report road condition" bottom sheet (this is the field-facing half of
   the hazard-reporting answer to the panel's question).

   Multi-day simulation controls are intentionally contained in the Drive tab.
   They carry visit history forward so the Proposed MODQL route can replan with
   updated fairness/history, weather, and road-accessibility conditions.
   ============================================================================ */

/* ---------- Drive-only multi-day simulation state ---------- */
var DRIVE_INITIAL_NODES=NODES.map(function(n){return Object.assign({},n)});
var DRIVE_INITIAL_REPORTS=REPORTS.map(function(r){return Object.assign({},r)});
var DRIVE_INITIAL_ADVISORIES=ADVISORIES.map(function(a){return Object.assign({},a)});
var DRIVE_INITIAL_WX_MM=WX.mm;
var SIM_START_DATE=new Date(Date.now());
SIM_START_DATE.setHours(0,0,0,0);
var SIM_DATE=new Date(SIM_START_DATE);

function isSimulationDay1(){
  return SIM_DATE.getFullYear()===SIM_START_DATE.getFullYear() &&
    SIM_DATE.getMonth()===SIM_START_DATE.getMonth() &&
    SIM_DATE.getDate()===SIM_START_DATE.getDate();
}

/* Keep the new controls inside Driver's Navigation so no other tab/layout
   needs to be modified. */
function ensureDriveDayControls(){
  var complete=document.getElementById("completeBtn");
  if(!complete) return;
  var wrap=complete.parentElement;

  function makeButton(id,text,cls){
    var b=document.getElementById(id);
    if(b) return b;
    b=document.createElement("button");
    b.id=id;
    b.className="btn "+cls;
    b.textContent=text;
    b.style.width="100%";
    b.style.display="none";
    b.style.marginTop="8px";
    wrap.appendChild(b);
    return b;
  }

  makeButton("nextDayBtn","Start Next Day","p");
  makeButton("backDayBtn","Back One Day","g");
  makeButton("resetDayBtn","Reset to Day 1","reset");

  if(!document.getElementById("dayLabel")){
    var label=document.createElement("div");
    label.id="dayLabel";
    label.style.padding="10px 15px 13px";
    label.style.textAlign="center";
    label.style.fontSize="12px";
    label.style.fontWeight="700";
    label.style.opacity=".78";
    label.style.borderTop="1px solid rgba(255,255,255,.08)";
    document.getElementById("navCard").appendChild(label);
  }
}

ensureDriveDayControls();

function nextStop(){return PLAN.stops[PROGRESS]||null}
function renderDrive(){
  ensureDriveDayControls();
  var s=nextStop();
  var cb=document.getElementById("completeBtn");
  var nd=document.getElementById("nextDayBtn");
  var bd=document.getElementById("backDayBtn");
  var rd=document.getElementById("resetDayBtn");
  var label=document.getElementById("dayLabel");

  if(label) label.textContent=SIM_DATE.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  if(bd) bd.disabled=isSimulationDay1();

  if(!s){
    document.getElementById("stopName").textContent="Return to Laiban ALS Hub";
    document.getElementById("stopTags").innerHTML='<span class="tag eq">deployment complete</span>';
    document.getElementById("etaMin").textContent=PLAN.ret?Math.round(PLAN.ret.min):0;
    document.getElementById("etaClock").textContent="min to hub";
    document.getElementById("turnText").textContent="All scheduled stops served";
    document.getElementById("turnSub").textContent="Great, today's done. Come back tomorrow (or click 'Start Next Day')";
    cb.style.display="none";
    if(nd) nd.style.display="block";
    if(bd) bd.style.display="block";
    if(rd) rd.style.display="block";
  }else{
    var n=N[s.id], leg=s.p.legs[0], A=accA(leg), b=band(A);
    document.getElementById("stopName").textContent=n.name;
    document.getElementById("stopTags").innerHTML=
      '<span class="tag">'+n.learners+' learners</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span>'+
      '<span class="tag eq">'+s.p.km.toFixed(1)+' km</span>';
    document.getElementById("etaMin").textContent=Math.round(s.p.min);
    document.getElementById("etaClock").textContent="min &middot; arrive "+s.arrive;
    document.getElementById("turnText").textContent="Continue on "+N[leg.a].name.replace("Sitio ","")+"\u2013"+N[leg.b].name.replace("Sitio ","")+" road";
    document.getElementById("turnSub").innerHTML=leg.km.toFixed(1)+" km &middot; "+SURF[leg.surf].lab+
      ' &middot; <b style="color:'+b.col+'">A '+A.toFixed(2)+" "+b.lab+"</b>";
    cb.textContent="Mark \u201c"+n.name+"\u201d as completed";
    cb.disabled=false;
    cb.style.display="block";
    if(nd) nd.style.display="none";
    if(bd) bd.style.display="none";
    if(rd) rd.style.display="none";
  }

  var strip=document.getElementById("routeStrip");
  if(strip){
    strip.innerHTML="";
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
  }
  var pbar=document.getElementById("pbar");
  if(pbar) pbar.style.width=(100*PROGRESS/Math.max(1,PLAN.stops.length))+"%";
  var used=0;PLAN.stops.slice(0,PROGRESS).forEach(function(st){used+=st.p.min+serviceMin(N[st.id])});
  var left=Math.max(0,SHIFT_MIN-used);
  document.getElementById("shiftLeft").textContent=Math.floor(left/60)+"h "+Math.round(left%60)+"m";
  document.getElementById("wxMm").textContent=WX.mm+" mm";
  var live=REPORTS.filter(function(r){return !r.cleared&&confidence(r)>=0.15}).length+ADVISORIES.length;
  document.getElementById("hzCount").textContent=live;
  var tabBdg=document.getElementById("tabBdg");
  if(tabBdg){
    tabBdg.textContent=live;
    tabBdg.style.display=live?"block":"none";
  }
}

function alertShow(title,text){
  document.getElementById("alertTitle").textContent=title;
  document.getElementById("alertText").innerHTML=text;
  document.getElementById("alertBar").classList.add("show");
}
document.getElementById("alertClose").onclick=function(){document.getElementById("alertBar").classList.remove("show")};

/* ============================ MARK STOP AS COMPLETED ============================
   Advances PROGRESS by one, records the visit against that node's
   visits30/days (so the NEXT replan's Jain's-fairness term reflects what
   actually got served today, not just the static seed data), then
   replans/repaints everything the same way a hazard report does. */
document.getElementById("completeBtn").onclick=function(){
  var s=nextStop();
  if(!s) return;
  var n=N[s.id];
  n.visits30+=1;
  n.days=0;
  PROGRESS++;
  refresh({t:"Stop completed",b:n.name+" marked as served. Visit history and fairness metrics updated for the next replan."});
};

/* Start a fresh deployment day without resetting the learned policy. Visit
   history and hazard confidence carry forward, while weather and live
   conditions are sampled again for the new route. */
document.getElementById("nextDayBtn").onclick=function(){
  SIM_DATE.setDate(SIM_DATE.getDate()+1);
  PROGRESS=0;
  NODES.forEach(function(n){if(n.kind==="node") n.days+=1;});
  REPORTS.forEach(function(r){r.ago+=24;});
  WX.mm=[12,38,78][Math.floor(Math.random()*3)];
  refresh({t:"New deployment day started",b:"The Proposed MODQL route was replanned using the new day's carried-forward visit history, weather, hazards, and road accessibility."});
};

document.getElementById("backDayBtn").onclick=function(){
  if(isSimulationDay1()){
    this.disabled=true;
    return;
  }
  SIM_DATE.setDate(SIM_DATE.getDate()-1);
  PROGRESS=0;
  refresh({t:"Previous deployment day",b:"The deployment date moved back one calendar day and the route was replanned for the current simulated conditions."});
};

document.getElementById("resetDayBtn").onclick=function(){
  NODES.forEach(function(n,i){Object.assign(n,DRIVE_INITIAL_NODES[i])});
  REPORTS.length=0;
  DRIVE_INITIAL_REPORTS.forEach(function(r){REPORTS.push(Object.assign({},r))});
  ADVISORIES.length=0;
  DRIVE_INITIAL_ADVISORIES.forEach(function(a){ADVISORIES.push(Object.assign({},a))});
  nextRepId=4;
  WX.mm=DRIVE_INITIAL_WX_MM;
  SIM_DATE=new Date(SIM_START_DATE);
  PROGRESS=1;
  refresh({t:"Simulation reset",b:"The Drive simulation date, hazard reports, weather, and visit history were restored to their Day 1 starting values."});
};

/* replan + repaint everything (operational views + analysis tabs) */
function refresh(msg){
  var before=PLAN.stops.map(function(s){return s.id}).join(",");
  var beforeDef=PLAN.deferred.length;
  PLAN=planRoute();
  if(PROGRESS>PLAN.stops.length)PROGRESS=PLAN.stops.length;
  drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();
  if(typeof renderHistory==="function") renderHistory();
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
