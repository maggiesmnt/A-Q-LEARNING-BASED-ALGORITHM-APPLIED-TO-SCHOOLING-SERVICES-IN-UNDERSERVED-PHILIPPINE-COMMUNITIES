/* ============================================================================
   HAZARDS.JS — "Road & hazard status" view: the plain-language answer to
   "how do we know a road is unavailable due to hazard/disaster" plus the
   live list of active reports from external or official sources.
   ============================================================================ */

function renderHazards(){
  var closed=0,caut=0;
  EDGES.forEach(function(e){var A=accA(e);if(A<0.20)closed++;else if(A<0.75)caut++});
  document.getElementById("hzSummary").innerHTML=
    '<div class="kpi"><div class="lab">Closed roads</div><div class="v" style="color:var(--bad)">'+closed+'</div><div class="d">not passable right now</div></div>'+
    '<div class="kpi"><div class="lab">Roads needing caution</div><div class="v" style="color:var(--warn)">'+caut+'</div><div class="d">still passable, but slower</div></div>';

  var box=document.getElementById("hazardList");box.innerHTML="";
  var all=REPORTS.slice().sort(function(a,b){return a.ago-b.ago});
  all.forEach(function(r){
    var e=EK[r.edge];if(!e)return;
    var c=confidence(r),A=accA(e),b=band(A);
    var d=document.createElement("div");
    d.className="card hzcard"+(r.cleared?" cleared":A<0.20?" closed":"");
    d.innerHTML='<div class="row"><div style="font-size:22px">'+r.em+'</div><div style="flex:1">'+
      '<h3>'+r.type+' <span class="pill '+b.k+'">'+b.lab+'</span></h3>'+
      '<div class="k">'+N[e.a].name+' &harr; '+N[e.b].name+' &middot; '+SURF[e.surf].lab+'</div></div>'+
      '<div class="k" style="text-align:right">'+(r.ago<1?Math.round(r.ago*60)+' min':r.ago.toFixed(1)+' h')+' ago<br>'+r.who+'</div></div>'+
      '<div class="k" style="margin-top:9px">&ldquo;'+r.note+'&rdquo;</div>'+
      '<div class="meter"><i style="width:'+(c*100).toFixed(0)+'%;background:'+(c>0.6?"var(--bad)":c>0.3?"var(--warn)":"var(--dim2)")+'"></i></div>'+
      '<div class="k">Source: official or external road data &middot; confidence <b>'+(c*100).toFixed(0)+'%</b></div>';
    box.appendChild(d);
  });
}
