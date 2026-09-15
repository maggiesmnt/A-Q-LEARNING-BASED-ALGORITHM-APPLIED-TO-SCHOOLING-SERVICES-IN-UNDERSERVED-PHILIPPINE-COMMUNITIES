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

var DRIVE_ROUTE_FLOW_CLASS="drive-route-flow";
(function installDriveRouteFlowStyle(){
  if(document.getElementById("driveRouteFlowStyle")) return;
  var style=document.createElement("style");
  style.id="driveRouteFlowStyle";
  style.textContent="@keyframes driveRouteFlow{to{stroke-dashoffset:-34;}}"+
    ".leaflet-overlay-pane path."+DRIVE_ROUTE_FLOW_CLASS+"{animation:driveRouteFlow 3.8s linear infinite;}"+
    "@media (prefers-reduced-motion:reduce){.leaflet-overlay-pane path."+DRIVE_ROUTE_FLOW_CLASS+"{animation:none;}}";
  document.head.appendChild(style);
})();

function drawRoads(){
  gRoads.clearLayers();
  EDGES.forEach(function(e){
    var A=accA(e), b=band(A);
    var isQa=e.graph_status==="qa_connector";
    var line=L.polyline(edgeGeom(e),{
      color:b.col,
      weight:isQa?3:(A<0.20?6:5),
      opacity:isQa?0.42:(A<0.20?0.95:0.72),
      dashArray:isQa?"5 8":e.surf==="dirt"?"9 7":e.surf==="ford"?"3 8":null,
      lineCap:"round"
    }).addTo(gRoads);
    line.bindPopup("<b>"+N[e.a].name+" &harr; "+N[e.b].name+"</b><br>"+SURF[e.surf].lab+
      "<br>"+e.km.toFixed(1)+" km &middot; ~"+Math.round(edgeMin(e))+" min"+
      "<br>Road condition: <b>"+b.lab.charAt(0)+b.lab.slice(1).toLowerCase()+"</b>"+
      (e.note?"<br><span>Local context:</span> "+e.note:"")+
      "<br><span>Road graph basis:</span> <b>"+(e.graph_status==="stakeholder_supported"?"Stakeholder-supported (provisional)":"QA-only connector")+"</b>"+
      "<br><span>Source:</span> "+(e.source||"System QA assumption")+
      "<br><span>Verification:</span> "+(e.verification||"provisional"));
    if(A<0.20){
      var g=edgeGeom(e),mid=g[Math.floor(g.length/2)];
      L.marker(mid,{icon:L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,15],
        html:"<div style='width:30px;height:30px;border-radius:50%;background:#A24D42;border:2.5px solid #F4EAD8;box-shadow:0 3px 10px rgba(0,0,0,.5);display:grid;place-items:center;font-size:15px;color:#fff;font-weight:900'>&times;</div>"})}).addTo(gRoads);
    }
    if(A<0.75){
      var pts=edgeGeom(e),p=pts[Math.floor(pts.length/2)],reason=roadIssueReason(e,A);
      var marker=L.marker([p[0]-0.0026,p[1]+0.0024],{icon:L.divIcon({className:"restriction-marker",iconSize:[28,28],iconAnchor:[14,14],
        html:"<div class='rm "+b.k+"'>!</div>"})}).addTo(gRoads);
      marker.bindPopup("<b>"+b.lab+" road segment</b><br>"+N[e.a].name+" &harr; "+N[e.b].name+
        "<br>"+reason+"<br>Road condition: <b>"+b.lab.charAt(0)+b.lab.slice(1).toLowerCase()+"</b>");
      marker.on("mouseover",function(){this.openPopup()});
      marker.on("mouseout",function(){this.closePopup()});
    }
  });
}
function roadIssueReason(e,A){
  var advisory=ADVISORIES.filter(function(a){return a.edge===e.key})[0];
  if(advisory) return advisory.note||"official closure advisory";
  var active=REPORTS.filter(function(r){return r.edge===e.key&&!r.cleared&&confidence(r)>=0.06})
    .sort(function(a,b){return confidence(b)-confidence(a)})[0];
  if(active) return active.type.toLowerCase()+" report: "+active.note;
  if(wxFactor(e.surf)<0.9) return "rain slowed this "+SURF[e.surf].lab;
  return "road conditions changed";
}
function routeLegGeom(p,i,e){
  var g=edgeGeom(e);
  if(!p||!p.seq||!p.seq[i]) return g;
  return e.a===p.seq[i]?g:g.slice().reverse();
}
function drawNodes(){
  gNodes.clearLayers();
  NODES.forEach(function(n){
    if(n.kind==="depot"){
      L.marker([n.lat,n.lng],{icon:L.divIcon({className:"",iconSize:[34,34],iconAnchor:[17,17],
        html:"<div style='width:34px;height:34px;border-radius:11px;background:#333D1C;border:2.5px solid #B9AB6B;display:grid;place-items:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.5)'>\uD83C\uDFEB</div>"})})
        .addTo(gNodes).bindPopup("<b>"+n.name+"</b><br><span>Role:</span> Deployment origin / motor pool<br><span>Area:</span> "+n.sitios);
      return;
    }
    var idx=-1;PLAN.stops.forEach(function(s,i){if(s.id===n.id)idx=i});
    var def=PLAN.deferred.some(function(d){return d.id===n.id});
    var col=def?"#A24D42":idx<0?"#6F7353":idx<PROGRESS?"#5E6828":"#919B3E";
    var lbl=def?"!":idx<0?"\u2013":String(idx+1);
    var r=13+Math.round(n.learners/9);
    L.circleMarker([n.lat,n.lng],{radius:r,color:col,weight:2,fillColor:col,fillOpacity:.16}).addTo(gNodes);
    L.marker([n.lat,n.lng],{icon:L.divIcon({className:"",iconSize:[26,26],iconAnchor:[13,13],
      html:"<div style='width:26px;height:26px;border-radius:50%;background:"+col+";color:#1F2612;display:grid;place-items:center;font-size:12px;font-weight:800;border:2px solid rgba(255,255,255,.85);box-shadow:0 3px 9px rgba(0,0,0,.45)'>"+lbl+"</div>"})})
      .addTo(gNodes).bindPopup("<b>"+n.name+"</b><br><span>Community:</span> "+n.sitios+
        "<br><span>Learners to Serve:</span> <b>"+n.learners+"</b>"+
        "<br><span>Demand Source:</span> <b>"+(n.dataSource||"Simulated QA learner allocation")+"</b>"+
        "<br><span>Coordinate Status:</span> "+(n.coordinate_status==="dummy_for_qa"?"Dummy coordinate for QA":n.coordinate_status==="public_area_reference_unverified"?"Public area reference - unverified":"Public reference - unverified")+
        "<br><span>Last Served:</span> <b>"+n.days+" days ago</b>"+
        "<br><span>Visits This Month:</span> "+n.visits30+
        (def?"<br><span>Status:</span> <b style='color:#A24D42'>Deferred today</b>":idx>=0?"<br><span>Stop Order:</span> <b>#"+(idx+1)+"</b><br><span>Estimated Arrival:</span> <b>"+formatOperationalTime(PLAN.stops[idx].arrive)+"</b>":"<br><span>Status:</span> Not scheduled today"));
  });
}
function drawRoute(){
  gRoute.clearLayers();

  /* Route visual hierarchy for the Drive tab:
     - completed legs: faded
     - current leg to the next destination: dashed/highlighted
     - later planned legs: thinner and less prominent
     - return-to-hub: hidden until all scheduled stops are completed */
  PLAN.stops.forEach(function(s,i){
    var style;
    if(i<PROGRESS){
      style={color:"#5E6828",weight:5,opacity:.38,lineCap:"round",dashArray:null};
    }else if(i===PROGRESS){
      style={color:"#DCC9AF",weight:4,opacity:.96,lineCap:"round",dashArray:"10 7",className:DRIVE_ROUTE_FLOW_CLASS};
    }else{
      style={color:"#8E8655",weight:4,opacity:.34,lineCap:"round",dashArray:null};
    }

    s.p.legs.forEach(function(e,j){
      L.polyline(i===PROGRESS?routeLegGeom(s.p,j,e):edgeGeom(e),style).addTo(gRoute);
    });
  });

  /* The brown dashed line is specifically the return route to Laiban ALS Hub.
     Show it only when there is no next service stop, so it cannot be confused
     with the active navigation route. */
  var hasNextStop=!!PLAN.stops[PROGRESS];
  if(!hasNextStop&&PLAN.ret){
    PLAN.ret.legs.forEach(function(e,j){
      L.polyline(routeLegGeom(PLAN.ret,j,e),{color:"#7B753B",weight:4,opacity:.75,dashArray:"10 7",lineCap:"round",className:DRIVE_ROUTE_FLOW_CLASS}).addTo(gRoute);
    });
  }
}
function drawHaz(){
  gHaz.clearLayers();
  REPORTS.forEach(function(r){
    if(r.cleared||confidence(r)<0.06) return;
    var e=EK[r.edge]; if(!e) return;
    var g=edgeGeom(e),p=g[Math.max(0,Math.floor(g.length/2)-0)];
    var off=[p[0]+0.0035,p[1]+0.0035];
    var hz=L.marker(off,{icon:L.divIcon({className:"",iconSize:[32,32],iconAnchor:[16,32],
      html:"<div style='width:32px;height:32px;border-radius:11px 11px 11px 3px;background:#8A633F;border:2px solid #F4EAD8;display:grid;place-items:center;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.5)'>"+r.em+"</div>"})})
      .addTo(gHaz).bindPopup("<b>"+r.type+"</b><br>"+N[e.a].name+" &harr; "+N[e.b].name+
        "<br>"+r.who+" &middot; "+(r.ago<1?Math.round(r.ago*60)+" min":r.ago.toFixed(1)+" h")+" ago"+
        "<br>Report confidence <b>"+(confidence(r)*100).toFixed(0)+"%</b>"+
        "<br><i>"+r.note+"</i>");
    hz.on("mouseover",function(){this.openPopup()});
    hz.on("mouseout",function(){this.closePopup()});
  });
}
var unit=L.marker([0,0],{icon:L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,15],
  html:"<div style='width:30px;height:30px;border-radius:50%;background:#B9AB6B;border:3px solid #F4EAD8;box-shadow:0 0 0 8px rgba(185,171,107,.24),0 4px 12px rgba(0,0,0,.5)'></div>"})}).addTo(map);
function placeUnit(){
  var s=PLAN.stops[PROGRESS-1];
  var at = s? N[s.id] : N.hub;
  unit.setLatLng([at.lat,at.lng]);
}
