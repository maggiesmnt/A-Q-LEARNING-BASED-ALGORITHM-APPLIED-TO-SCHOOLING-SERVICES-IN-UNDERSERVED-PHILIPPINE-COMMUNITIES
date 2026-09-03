/* ============================================================================
   APP.JS — chrome: the Operational/Research mode toggle, the operational
   bottom tab bar (Drive/Stops/Hazards), map layer toggle, weather toggle,
   and the boot sequence.
   ============================================================================ */

var MODE = "operational";
var lastOperationalView = "drive";

function setMode(m){
  MODE = m;
  document.querySelectorAll("#modeToggle button").forEach(function(b){
    b.classList.toggle("on", b.getAttribute("data-mode")===m);
  });
  document.getElementById("tabs").style.display = (m==="operational") ? "flex" : "none";
  document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});
  if(m==="operational"){
    document.getElementById("view-"+lastOperationalView).classList.add("active");
    if(lastOperationalView==="drive") setTimeout(function(){map.invalidateSize()},60);
  }else{
    document.getElementById("view-analysis").classList.add("active");
  }
}
document.querySelectorAll("#modeToggle button").forEach(function(b){
  b.onclick=function(){ setMode(b.getAttribute("data-mode")); };
});

document.querySelectorAll("#tabs button").forEach(function(b){
  b.onclick=function(){
    document.querySelectorAll("#tabs button").forEach(function(x){x.classList.remove("on")});
    b.classList.add("on");
    lastOperationalView=b.getAttribute("data-view");
    document.querySelectorAll(".view").forEach(function(v){v.classList.remove("active")});
    document.getElementById("view-"+lastOperationalView).classList.add("active");
    if(lastOperationalView==="drive") setTimeout(function(){map.invalidateSize()},60);
  };
});
document.getElementById("btnLayer").onclick=function(){
  layerTerrain=!layerTerrain;
  map.removeLayer(layerTerrain?street:terrain);
  (layerTerrain?terrain:street).addTo(map);
  this.classList.toggle("on",layerTerrain);
};
document.getElementById("btnLayer").classList.add("on");
document.getElementById("btnCenter").onclick=function(){map.setView(unit.getLatLng(),13)};
document.getElementById("btnRain").onclick=function(){
  WX.mm = WX.mm>=60?12:WX.mm<30?38:78;
  this.classList.toggle("on",WX.mm>=60);
  document.getElementById("wxChip").className="chip"+(WX.mm>=30?" rain":"");
  refresh({t:"Weather telemetry updated",b:"Rainfall now <b>"+WX.mm+" mm/24h</b>. Accessibility coefficients rescaled &mdash; unpaved mountain paths and the river ford degrade first."});
};

/* boot */
drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();renderAnalysis();
map.fitBounds(L.latLngBounds(NODES.map(function(n){return [n.lat,n.lng]})).pad(0.12));
setTimeout(function(){
  var e=EK["kab|pun"];
  alertShow("Path closed &mdash; Kabayunan \u2192 Pungo",
    "Landslide confirmed by 3 residents. <b>A = "+accA(e).toFixed(2)+"</b>, below the 0.20 threshold, so the segment is masked out of the action set. "+
    "Sitio Pungo is reachable only via Cayabu &mdash; the route was re-sequenced.");
},900);
