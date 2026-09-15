/* ============================================================================
   APP.JS - chrome: the Operational/Research mode toggle, the operational
   bottom tab bar, map layer toggle, and boot sequence.
   ============================================================================ */

var MODE = "operational";
var lastOperationalView = "drive";
var THEME_KEY = "als-mobile-hub-theme";

function getInitialTheme(){
  try{
    var saved = localStorage.getItem(THEME_KEY);
    if(saved==="light" || saved==="dark") return saved;
  }catch(e){}
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function setTheme(theme){
  var next = theme==="light" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  var btn = document.getElementById("themeSwitch");
  if(btn){
    btn.classList.toggle("is-light", next==="light");
    btn.classList.toggle("is-dark", next==="dark");
    btn.setAttribute("aria-pressed", String(next==="dark"));
    btn.setAttribute("aria-label", next==="dark" ? "Switch to light mode" : "Switch to dark mode");
    btn.title = next==="dark" ? "Switch to light mode" : "Switch to dark mode";
  }
}

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

setTheme(getInitialTheme());
var themeSwitch = document.getElementById("themeSwitch");
if(themeSwitch){
  themeSwitch.onclick=function(){
    setTheme(document.body.getAttribute("data-theme")==="dark" ? "light" : "dark");
  };
}

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

/* boot */
drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();renderHistory();renderAnalysis();
map.fitBounds(L.latLngBounds(NODES.map(function(n){return [n.lat,n.lng]})).pad(0.12));

