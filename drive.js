/* ============================================================================
   DRIVE.JS - the turn-by-turn drive card and live refresh/replan behavior.

   Multi-day simulation controls are intentionally contained in the Drive tab.
   They carry visit history forward so the route can update with the latest
   service records, weather, and road conditions.
   ============================================================================ */

/* ---------- Drive-only multi-day simulation state ---------- */
var DRIVE_INITIAL_NODES=NODES.map(function(n){return Object.assign({},n)});
var DRIVE_INITIAL_REPORTS=REPORTS.map(function(r){return Object.assign({},r)});
var DRIVE_INITIAL_ADVISORIES=ADVISORIES.map(function(a){return Object.assign({},a)});
var DRIVE_INITIAL_WX_MM=WX.mm;
var SIM_START_DATE=new Date(Date.now());
SIM_START_DATE.setHours(0,0,0,0);
var SIM_DATE=new Date(SIM_START_DATE);
var CURRENT_LOCATION="hub";
var COMPLETED_STOPS=[];
var DRIVE_USED_MIN=0;
var DRIVE_WEATHER_SEQUENCE=[38,12,78,24];

function isSimulationDay1(){
  return SIM_DATE.getFullYear()===SIM_START_DATE.getFullYear() &&
    SIM_DATE.getMonth()===SIM_START_DATE.getMonth() &&
    SIM_DATE.getDate()===SIM_START_DATE.getDate();
}

function formatOperationalTime(value){
  var m=String(value||"").match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return value||"";
  var h=parseInt(m[1],10), min=m[2], suffix=h>=12?"PM":"AM";
  h=h%12;
  if(h===0) h=12;
  return h+":"+min+" "+suffix;
}

function weatherLabel(){
  if(WX.mm<10) return "Clear";
  if(WX.mm<30) return "Light Rain";
  if(WX.mm<60) return "Heavy Rain";
  return "Severe Rain";
}

function formatTimeRemaining(mins){
  mins=Math.max(0,Math.round(mins));
  var h=Math.floor(mins/60), m=mins%60, parts=[];
  if(h) parts.push(h+" hour"+(h===1?"":"s"));
  if(m) parts.push(m+" minute"+(m===1?"":"s"));
  return parts.join(" ")||"0 minutes";
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
  makeButton("resetDayBtn","Reset to Day 1","reset");
  var obsoleteBack=document.getElementById("backDayBtn");
  if(obsoleteBack) obsoleteBack.remove();

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
  var rd=document.getElementById("resetDayBtn");
  var label=document.getElementById("dayLabel");

  if(label) label.textContent=SIM_DATE.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  if(!s){
    document.getElementById("stopName").textContent="Return to Laiban ALS Hub";
    document.getElementById("stopTags").innerHTML='<span class="tag eq">all stops completed</span>';
    document.getElementById("etaMin").textContent=PLAN.ret?Math.round(PLAN.ret.min):0;
    document.getElementById("etaClock").textContent="min to hub";
    document.getElementById("turnText").textContent="All scheduled stops served";
    document.getElementById("turnSub").textContent="Good work. Return to the hub, or start the next day when ready.";
    cb.style.display="none";
    if(nd) nd.style.display="block";
    if(rd) rd.style.display="block";
  }else{
    var n=N[s.id], leg=s.p.legs[0], A=accA(leg), b=band(A);
    document.getElementById("stopName").textContent=n.name;
    document.getElementById("stopTags").innerHTML=
      '<span class="tag">'+n.learners+' learners</span>'+
      '<span class="tag'+(n.days>=20?' hot':'')+'">last served '+n.days+'d ago</span>'+
      '<span class="tag eq">'+s.p.km.toFixed(1)+' km</span>';
    document.getElementById("etaMin").textContent=Math.round(s.p.min);
    document.getElementById("etaClock").textContent="min - arrive "+formatOperationalTime(s.arrive);
    document.getElementById("turnText").textContent="Continue on "+N[leg.a].name.replace("Sitio ","")+"\u2013"+N[leg.b].name.replace("Sitio ","")+" road";
    document.getElementById("turnSub").innerHTML=leg.km.toFixed(1)+" km &middot; "+SURF[leg.surf].lab+
      ' &middot; <b style="color:'+b.col+'">Road condition: '+b.lab.charAt(0)+b.lab.slice(1).toLowerCase()+"</b>";
    cb.textContent="Mark \u201c"+n.name+"\u201d as completed";
    cb.disabled=false;
    cb.style.display="block";
    if(nd) nd.style.display="none";
    if(rd) rd.style.display="none";
  }

  var strip=document.getElementById("routeStrip");
  if(strip){
    strip.innerHTML="";
    PLAN.stops.forEach(function(st,i){
      var d=document.createElement("div");
      d.className="s "+(i<PROGRESS?"done":i===PROGRESS?"now":"");
      d.innerHTML="<b>"+(i+1)+". "+N[st.id].name.replace("Sitio ","")+"</b>"+formatOperationalTime(st.arrive)+" &middot; "+N[st.id].learners+" learners";
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
  var used=DRIVE_USED_MIN;
  var left=Math.max(0,SHIFT_MIN-used);
  document.getElementById("shiftLeft").textContent=formatTimeRemaining(left);
  document.getElementById("wxStatus").textContent=weatherLabel();
  document.getElementById("wxChip").className="chip"+(WX.mm>=30?" rain":"");
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
   visits30/days, then replans/repaints the operational views. */
document.getElementById("completeBtn").onclick=function(){
  var s=nextStop();
  if(!s) return;
  var n=N[s.id];

  /* Preserve the completed leg before generating a new remaining route. */
  COMPLETED_STOPS.push(s);
  CURRENT_LOCATION=s.id;
  DRIVE_USED_MIN+=s.p.min+serviceMin(n);
  n.visits30+=1;
  n.days=0;
  PROGRESS=COMPLETED_STOPS.length;

  refresh({t:"Stop completed",b:n.name+" has been marked as served. The remaining stops were updated from your current location."});
};

/* Start a fresh deployment day without resetting the learned policy. Visit
   history and hazard confidence carry forward, while weather and live
   conditions are sampled again for the new route. */
document.getElementById("nextDayBtn").onclick=function(){
  SIM_DATE.setDate(SIM_DATE.getDate()+1);
  CURRENT_LOCATION="hub";
  COMPLETED_STOPS=[];
  DRIVE_USED_MIN=0;
  PROGRESS=0;
  NODES.forEach(function(n){if(n.kind==="node") n.days+=1;});
  syncHistoryDays();
  REPORTS.forEach(function(r){r.ago+=24;});

  /* Deterministic weather sequence makes repeated thesis demonstrations
     reproducible while still showing changing road accessibility by day. */
  var dayIndex=Math.round((SIM_DATE-SIM_START_DATE)/86400000);
  WX.mm=DRIVE_WEATHER_SEQUENCE[dayIndex%DRIVE_WEATHER_SEQUENCE.length];

  refresh({t:"New deployment day started",b:"Today's route was updated from Laiban ALS Hub using the latest service history, road reports, and weather for the day."});
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
  CURRENT_LOCATION="hub";
  COMPLETED_STOPS=[];
  DRIVE_USED_MIN=0;
  PROGRESS=0;
  syncHistoryDays();
  refresh({t:"Day 1 restored",b:"The route demo is back to Day 1 with no completed stops and the original road, weather, and service records."});
};

/* replan + repaint everything (operational views + analysis tabs) */
function refresh(msg){
  syncHistoryDays();
  var before=PLAN.stops.slice(PROGRESS).map(function(s){return s.id}).join(",");
  var beforeDef=PLAN.deferred.length;
  var servedIds=COMPLETED_STOPS.map(function(s){return s.id});
  var remainingPlan=planRoute(CURRENT_LOCATION,servedIds,Math.max(0,SHIFT_MIN-DRIVE_USED_MIN),DRIVE_USED_MIN);

  /* Keep completed legs fixed for map/history display. Only the unserved
     suffix is replaced by the newly recommended route. */
  PLAN={
    stops:COMPLETED_STOPS.concat(remainingPlan.stops),
    deferred:remainingPlan.deferred,
    ret:remainingPlan.ret,
    visits:remainingPlan.visits,
    methodology:remainingPlan.methodology,
    start:CURRENT_LOCATION,
    remaining:remainingPlan.remaining
  };
  PROGRESS=COMPLETED_STOPS.length;

  drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();
  if(typeof renderHistory==="function") renderHistory();
  if(typeof renderAnalysis==="function") renderAnalysis();
  var after=PLAN.stops.slice(PROGRESS).map(function(s){return s.id}).join(",");
  if(msg){
    var extra = (after!==before)?" Stop order updated from "+N[CURRENT_LOCATION].name+".":"";
    if(PLAN.deferred.length>beforeDef) extra+=" "+N[PLAN.deferred[PLAN.deferred.length-1].id].name+" was moved to a later service day.";
    alertShow(msg.t,msg.b+extra);
  }
}

