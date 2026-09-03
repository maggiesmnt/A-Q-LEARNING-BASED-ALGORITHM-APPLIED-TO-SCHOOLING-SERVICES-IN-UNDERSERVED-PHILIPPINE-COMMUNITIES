/* ============================================================================
   MAP.JS — Leaflet map, road/node/route/hazard layers.
   ============================================================================ */

var map=L.map("map",{zoomControl:false,attributionControl:true}).setView([14.578,121.393],12);
var street=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {maxZoom:18,attribution:'&copy; OpenStreetMap contributors'});
var terrain=L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {maxZoom:17,subdomains:"abc",attribution:'&copy; OpenStreetMap contributors, SRTM &middot; OpenTopoMap (CC-BY-SA)'});
terrain.addTo(map);
var layerTerrain=true;
L.control.scale({imperial:false,position:"bottomright"}).addTo(map);

var gRoads=L.layerGroup().addTo(map), gRoute=L.layerGroup().addTo(map),
    gNodes=L.layerGroup().addTo(map), gHaz=L.layerGroup().addTo(map);

function drawRoads(){
  gRoads.clearLayers();
  EDGES.forEach(function(e){
    var A=accA(e), b=band(A);
    var line=L.polyline(edgeGeom(e),{color:b.col,weight:A<0.20?6:5,opacity:A<0.20?0.95:0.72,
      dashArray:e.surf==="dirt"?"9 7":e.surf==="ford"?"3 8":null,lineCap:"round"}).addTo(gRoads);
    line.bindPopup("<b>"+N[e.a].name+" &harr; "+N[e.b].name+"</b><br>"+SURF[e.surf].lab+
      "<br>"+e.km.toFixed(1)+" km &middot; ~"+Math.round(edgeMin(e))+" min"+
      "<br>A = <b>"+A.toFixed(2)+"</b> &mdash; "+b.lab+
      "<br><span style='font-size:11px;color:#888'>surface "+SURF[e.surf].a.toFixed(2)+
      " &times; weather "+wxFactor(e.surf).toFixed(2)+" &times; reports "+reportFactor(e.key).toFixed(2)+"</span>");
    if(A<0.20){
      var g=edgeGeom(e),mid=g[Math.floor(g.length/2)];
      L.marker(mid,{icon:L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,15],
        html:"<div style='width:30px;height:30px;border-radius:50%;background:#ff4d4f;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5);display:grid;place-items:center;font-size:15px;color:#fff;font-weight:900'>&times;</div>"})}).addTo(gRoads);
    }
  });
}
function drawNodes(){
  gNodes.clearLayers();
  NODES.forEach(function(n){
    if(n.kind==="depot"){
      L.marker([n.lat,n.lng],{icon:L.divIcon({className:"",iconSize:[34,34],iconAnchor:[17,17],
        html:"<div style='width:34px;height:34px;border-radius:11px;background:#141d2e;border:2.5px solid #31c8ff;display:grid;place-items:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.5)'>\uD83C\uDFEB</div>"})})
        .addTo(gNodes).bindPopup("<b>"+n.name+"</b><br>"+n.sitios);
      return;
    }
    var idx=-1;PLAN.stops.forEach(function(s,i){if(s.id===n.id)idx=i});
    var def=PLAN.deferred.some(function(d){return d.id===n.id});
    var col=def?"#ff4d4f":idx<0?"#6b7b98":idx<PROGRESS?"#0f7a45":"#25d07a";
    var lbl=def?"!":idx<0?"\u2013":String(idx+1);
    var r=13+Math.round(n.learners/9);
    L.circleMarker([n.lat,n.lng],{radius:r,color:col,weight:2,fillColor:col,fillOpacity:.16}).addTo(gNodes);
    L.marker([n.lat,n.lng],{icon:L.divIcon({className:"",iconSize:[26,26],iconAnchor:[13,13],
      html:"<div style='width:26px;height:26px;border-radius:50%;background:"+col+";color:#04140b;display:grid;place-items:center;font-size:12px;font-weight:800;border:2px solid rgba(255,255,255,.85);box-shadow:0 3px 9px rgba(0,0,0,.45)'>"+lbl+"</div>"})})
      .addTo(gNodes).bindPopup("<b>"+n.name+"</b><br>"+n.sitios+
        "<br>D (learners): <b>"+n.learners+"</b><br>H (last served): <b>"+n.days+" days ago</b>"+
        "<br>Visits, last 30 days: "+n.visits30+
        (def?"<br><span style='color:#c0392b'><b>Deferred today</b></span>":idx>=0?"<br>Stop #"+(idx+1)+" &middot; ETA "+PLAN.stops[idx].arrive:"<br>Not scheduled today"));
  });
}
function drawRoute(){
  gRoute.clearLayers();
  var cur="hub";
  PLAN.stops.forEach(function(s,i){
    s.p.legs.forEach(function(e){
      L.polyline(edgeGeom(e),{color:i<PROGRESS?"#0f7a45":"#31c8ff",weight:i<PROGRESS?7:8,opacity:i<PROGRESS?.55:.9,
        lineCap:"round",dashArray:i<PROGRESS?"2 9":null}).addTo(gRoute);
    });
    cur=s.id;
  });
  if(PLAN.ret) PLAN.ret.legs.forEach(function(e){
    L.polyline(edgeGeom(e),{color:"#8b7dff",weight:4,opacity:.5,dashArray:"6 8"}).addTo(gRoute);});
}
function drawHaz(){
  gHaz.clearLayers();
  REPORTS.forEach(function(r){
    if(r.cleared||confidence(r)<0.06) return;
    var e=EK[r.edge]; if(!e) return;
    var g=edgeGeom(e),p=g[Math.max(0,Math.floor(g.length/2)-0)];
    var off=[p[0]+0.0035,p[1]+0.0035];
    L.marker(off,{icon:L.divIcon({className:"",iconSize:[32,32],iconAnchor:[16,32],
      html:"<div style='width:32px;height:32px;border-radius:11px 11px 11px 3px;background:#f8722c;border:2px solid #fff;display:grid;place-items:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.5)'>"+r.em+"</div>"})})
      .addTo(gHaz).bindPopup("<b>"+r.type+"</b><br>"+N[e.a].name+" &harr; "+N[e.b].name+
        "<br>"+r.who+" &middot; "+(r.ago<1?Math.round(r.ago*60)+" min":r.ago.toFixed(1)+" h")+" ago"+
        "<br>Confidence <b>"+(confidence(r)*100).toFixed(0)+"%</b> &rarr; A = "+accA(e).toFixed(2)+
        "<br><i>"+r.note+"</i>");
  });
}
var unit=L.marker([0,0],{icon:L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,15],
  html:"<div style='width:30px;height:30px;border-radius:50%;background:#31c8ff;border:3px solid #fff;box-shadow:0 0 0 8px rgba(49,200,255,.22),0 4px 12px rgba(0,0,0,.5)'></div>"})}).addTo(map);
function placeUnit(){
  var s=PLAN.stops[PROGRESS-1];
  var at = s? N[s.id] : N.hub;
  unit.setLatLng([at.lat,at.lng]);
}
