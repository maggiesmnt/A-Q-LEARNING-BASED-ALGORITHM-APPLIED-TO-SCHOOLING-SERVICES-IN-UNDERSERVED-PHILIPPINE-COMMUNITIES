/* ============================================================================
   APP.JS - page chrome, map controls, theme switch, and boot sequence.
   ============================================================================ */

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

setTheme(getInitialTheme());
var themeSwitch = document.getElementById("themeSwitch");
if(themeSwitch){
  themeSwitch.onclick=function(){
    setTheme(document.body.getAttribute("data-theme")==="dark" ? "light" : "dark");
  };
}

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
  var wxChip=document.getElementById("wxChip");
  if(wxChip) wxChip.className="chip"+(WX.mm>=30?" rain":"");
  refresh({t:"Weather telemetry updated",b:"Rainfall now <b>"+WX.mm+" mm/24h</b>. Accessibility coefficients rescaled &mdash; unpaved mountain paths and the river ford degrade first."});
};

/* boot */
drawRoads();drawRoute();drawNodes();drawHaz();placeUnit();renderDrive();renderStops();renderHazards();renderHistory();renderAnalysis();
map.fitBounds(L.latLngBounds(NODES.map(function(n){return [n.lat,n.lng]})).pad(0.12));
