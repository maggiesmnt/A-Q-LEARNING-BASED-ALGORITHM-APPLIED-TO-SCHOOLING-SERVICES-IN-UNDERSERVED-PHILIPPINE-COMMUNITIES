/* ============================================================================
   HAZARDS.JS — "Road & hazard status" view: the plain-language answer to
   "how do we know a road is unavailable due to hazard/disaster" plus the
   live, editable list of active reports feeding the A coefficient.
   ============================================================================ */

function renderHazards(){
  var closed=0,caut=0;
  EDGES.forEach(function(e){var A=accA(e);if(A<0.20)closed++;else if(A<0.75)caut++});
  document.getElementById("hzSummary").innerHTML=
    '<div class="kpi"><div class="lab">Segments closed (A &lt; 0.20)</div><div class="v" style="color:#ff4d4f">'+closed+'</div><div class="d">masked out of the action set</div></div>'+
    '<div class="kpi"><div class="lab">Degraded segments</div><div class="v" style="color:#ffb020">'+caut+'</div><div class="d">travel cost penalised by 1/A</div></div>';

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
      '<div class="meter"><i style="width:'+(c*100).toFixed(0)+'%;background:'+(c>0.6?"#ff4d4f":c>0.3?"#ffb020":"#6b7b98")+'"></i></div>'+
      '<div class="k">Confidence <b>'+(c*100).toFixed(0)+'%</b> ('+r.reporters+' reporter'+(r.reporters>1?'s':'')+
      ', '+r.src+', 6 h half-life) &rarr; resulting <b class="mono">A = '+A.toFixed(2)+'</b>'+
      ' <span style="color:var(--dim2)">= surface '+SURF[e.surf].a.toFixed(2)+' &times; weather '+wxFactor(e.surf).toFixed(2)+' &times; reports '+reportFactor(e.key).toFixed(2)+'</span></div>'+
      '<div class="btnrow" style="margin-top:12px">'+
      '<button class="btn g" data-still="'+r.id+'" style="padding:10px;font-size:12.5px">Still there</button>'+
      '<button class="btn '+(r.cleared?'g':'k')+'" data-clear="'+r.id+'" style="padding:10px;font-size:12.5px">'+(r.cleared?'Cleared \u2713':'Mark cleared')+'</button></div>';
    box.appendChild(d);
  });
  box.querySelectorAll("[data-still]").forEach(function(btn){
    btn.onclick=function(){var r=REPORTS.filter(function(x){return x.id==btn.getAttribute("data-still")})[0];
      r.reporters++;r.ago=0;r.cleared=false;
      refresh({t:"Hazard re-confirmed",b:r.type+" corroborated by another reporter. Confidence raised, accessibility recomputed."});};
  });
  box.querySelectorAll("[data-clear]").forEach(function(btn){
    btn.onclick=function(){var r=REPORTS.filter(function(x){return x.id==btn.getAttribute("data-clear")})[0];
      r.cleared=!r.cleared;
      refresh({t:r.cleared?"Hazard marked cleared":"Hazard re-opened",b:r.type+" \u2014 confidence dropped to 10%, the segment returns to the action set as soon as A rises above 0.20."});};
  });
}
