/* ============================================================================
   CHARTS.JS — small dependency-free SVG line-chart renderer, plus the
   illustrative multi-episode training curves used on the SOP 2 tab.

   IMPORTANT: SIM below is a hand-authored illustrative curve, not a real
   training log — this prototype computes live routes via greedy policy
   replay (engine.js) rather than running full episodic RL training in the
   browser. It stands in for the Chapter 4 multi-episode results and is
   labeled as such everywhere it's shown. Replace SIM with real logged
   values from the Python/Colab training run (500-2,000 episodes) before
   using this for the actual defense.
   ============================================================================ */

function svgLine(series,opts){
  var W=680,H=opts.h||210,P={l:44,r:12,t:12,b:26};
  var xs=series[0].d.length;
  var lo=opts.min!==undefined?opts.min:Math.min.apply(null,series.map(function(s){return Math.min.apply(null,s.d)}));
  var hi=opts.max!==undefined?opts.max:Math.max.apply(null,series.map(function(s){return Math.max.apply(null,s.d)}));
  var pad=(hi-lo)*0.08||1;lo-=pad;hi+=pad;
  function X(i){return P.l+(W-P.l-P.r)*i/(xs-1)}
  function Y(v){return P.t+(H-P.t-P.b)*(1-(v-lo)/(hi-lo))}
  var s='<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">';
  for(var g=0;g<=4;g++){var y=P.t+(H-P.t-P.b)*g/4,val=hi-(hi-lo)*g/4;
    s+='<line x1="'+P.l+'" y1="'+y+'" x2="'+(W-P.r)+'" y2="'+y+'" stroke="#26334d" stroke-width="1"/>';
    s+='<text x="'+(P.l-7)+'" y="'+(y+3.5)+'" fill="#6b7b98" font-size="9.5" text-anchor="end">'+val.toFixed(opts.dp||2)+'</text>';}
  [0,0.25,0.5,0.75,1].forEach(function(f){var i=Math.round(f*(xs-1));
    s+='<text x="'+X(i)+'" y="'+(H-8)+'" fill="#6b7b98" font-size="9.5" text-anchor="middle">'+(opts.xs?opts.xs[i]:i)+'</text>';});
  series.forEach(function(se){
    var p="";se.d.forEach(function(v,i){p+=(i?" L":"M")+X(i).toFixed(1)+" "+Y(v).toFixed(1)});
    s+='<path d="'+p+'" fill="none" stroke="'+se.c+'" stroke-width="'+(se.w||2.2)+'" stroke-linejoin="round"'+(se.dash?' stroke-dasharray="5 5"':'')+'/>';
  });
  s+='<text x="'+(W/2)+'" y="'+(H-8)+'" fill="#6b7b98" font-size="9.5" text-anchor="middle" opacity="0">.</text>';
  s+='</svg>';
  return s;
}

/* illustrative only — see file header */
var SIM=(function(){
  var r=rng(20260909),n=60,ep=[],mq=[],sq=[],fj=[],fs=[],sp=[],dr=[];
  for(var i=0;i<n;i++){
    var t=i/(n-1), e=Math.round(500+t*1500); ep.push(e);
    mq.push(0.18+0.62*(1-Math.exp(-3.1*t))+(r()-0.5)*0.045);
    sq.push(0.17+0.34*(1-Math.exp(-3.6*t))+(r()-0.5)*0.075);
    fj.push(0.52+0.42*(1-Math.exp(-2.7*t))+(r()-0.5)*0.03);
    fs.push(0.50+0.19*(1-Math.exp(-3.3*t))+(r()-0.5)*0.055);
    sp.push(0.92*Math.exp(-2.9*t)+0.04+(r()-0.5)*0.03);
    dr.push(0.30+0.55*(1-Math.exp(-1.6*t))+(r()-0.5)*0.06);
  }
  return {ep:ep,mq:mq,sq:sq,fj:fj,fs:fs,sp:sp,dr:dr};
})();
