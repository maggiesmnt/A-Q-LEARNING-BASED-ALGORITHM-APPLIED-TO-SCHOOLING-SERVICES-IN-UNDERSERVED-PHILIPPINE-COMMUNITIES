/* ============================================================================
   MAZE DEMO — thesis comparison using the original full-size maze presentation
   Standard Q-Learning vs Proposed MODQL

   The UI intentionally keeps the earlier Maze Demo look: one large 10x10 maze,
   information panel, red agent, green goal, yellow walls, and Play/Step/New
   Episode controls. Use the algorithm switch to view each algorithm separately.

   This is a controlled visualization of algorithm behaviour. It is not a
   substitute for the Chapter 4 routing experiment on the Laiban road graph.
   ============================================================================ */
(function(){
'use strict';

var SIZE=10, OBSTACLE_RATIO=.25, CHANGE_FREQUENCY=20, MAX_STEPS=100, STEP_MS=200;
var ACTIONS=[[-1,0],[1,0],[0,-1],[0,1]], ACTION_NAMES=['Up','Down','Left','Right'];
function k(p){return p[0]+','+p[1]} function cp(p){return [p[0],p[1]]}
function same(a,b){return a[0]===b[0]&&a[1]===b[1]}
function ri(n){return Math.floor(Math.random()*n)}
function man(a,b){return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function zeros(){return[0,0,0,0]}
function argmax(arr){var best=0;for(var i=1;i<arr.length;i++)if(arr[i]>arr[best])best=i;return best}
function jain(vals){var s=0,q=0;vals.forEach(function(x){s+=x;q+=x*x});return q===0?1:(s*s)/(vals.length*q)}

function MazeEnv(template){
  this.size=SIZE;this.changeFrequency=CHANGE_FREQUENCY;this.maxSteps=MAX_STEPS;
  this.steps=0;this.environmentUpdates=0;
  if(template){this.maze=template.maze.map(function(r){return r.slice()});this.currentPos=cp(template.start);this.goalPos=cp(template.goal)}
  else this.generate();
}
MazeEnv.prototype.generate=function(){
  var guard=0;
  while(guard++<300){
    var maze=Array.from({length:SIZE},function(){return Array(SIZE).fill(0)}), target=Math.floor(SIZE*SIZE*OBSTACLE_RATIO),used={};
    while(Object.keys(used).length<target){var idx=ri(SIZE*SIZE),r=Math.floor(idx/SIZE),c=idx%SIZE,key=r+','+c;if(used[key])continue;used[key]=1;maze[r][c]=1}
    var start=[ri(3),ri(3)],goal=[SIZE-1-ri(3),SIZE-1-ri(3)];maze[start[0]][start[1]]=0;maze[goal[0]][goal[1]]=0;
    this.maze=maze;this.currentPos=start;this.goalPos=goal;
    if(this.bfs(start,goal).length){this.steps=0;return}
  }
  this.maze=Array.from({length:SIZE},function(){return Array(SIZE).fill(0)});this.currentPos=[0,0];this.goalPos=[9,9];
};
MazeEnv.prototype.snapshot=function(){return{maze:this.maze.map(function(r){return r.slice()}),start:cp(this.currentPos),goal:cp(this.goalPos)}};
MazeEnv.prototype.bfs=function(start,goal){
  var q=[[cp(start),[cp(start)]]],seen={};seen[k(start)]=1;
  while(q.length){var z=q.shift(),p=z[0],path=z[1];if(same(p,goal))return path;for(var a=0;a<4;a++){var n=[p[0]+ACTIONS[a][0],p[1]+ACTIONS[a][1]],nk=k(n);if(n[0]<0||n[1]<0||n[0]>=SIZE||n[1]>=SIZE||this.maze[n[0]][n[1]]||seen[nk])continue;seen[nk]=1;q.push([n,path.concat([cp(n)])])}}
  return[];
};
MazeEnv.prototype.localAccessibility=function(pos){var valid=0,free=0;for(var a=0;a<4;a++){var n=[pos[0]+ACTIONS[a][0],pos[1]+ACTIONS[a][1]];if(n[0]<0||n[1]<0||n[0]>=SIZE||n[1]>=SIZE)continue;valid++;if(!this.maze[n[0]][n[1]])free++}return valid?free/valid:0};
MazeEnv.prototype.ensurePath=function(){
  var guard=0;while(!this.bfs(this.currentPos,this.goalPos).length&&guard++<100){var obs=[];for(var r=0;r<SIZE;r++)for(var c=0;c<SIZE;c++)if(this.maze[r][c])obs.push([r,c]);if(!obs.length)break;var p=obs[ri(obs.length)];if(!same(p,this.currentPos)&&!same(p,this.goalPos))this.maze[p[0]][p[1]]=0}
};
MazeEnv.prototype.mutate=function(){
  var changes=1+ri(3);for(var i=0;i<changes;i++){var p=[ri(SIZE),ri(SIZE)];if(same(p,this.currentPos)||same(p,this.goalPos))continue;this.maze[p[0]][p[1]]=this.maze[p[0]][p[1]]?0:1}this.ensurePath();this.environmentUpdates++;
};
MazeEnv.prototype.step=function(action){
  this.steps++;var old=cp(this.currentPos),d=ACTIONS[action],n=[old[0]+d[0],old[1]+d[1]],collision=false;
  if(n[0]<0||n[1]<0||n[0]>=SIZE||n[1]>=SIZE||this.maze[n[0]][n[1]]){n=old;collision=true}else this.currentPos=n;
  var goal=same(this.currentPos,this.goalPos),done=goal||this.steps>=this.maxSteps;
  if(this.steps%this.changeFrequency===0&&!done)this.mutate();
  return{old:old,state:cp(this.currentPos),goal:goal,done:done,collision:collision};
};

function StandardAgent(){this.Q=new Map();this.alpha=.5;this.gamma=.9;this.epsilon=.85;this.epsilonMin=.15;this.epsilonDecay=.992}
StandardAgent.prototype.q=function(s){if(!this.Q.has(s))this.Q.set(s,zeros());return this.Q.get(s)};
StandardAgent.prototype.select=function(pos){this.epsilon=Math.max(this.epsilonMin,this.epsilon*this.epsilonDecay);if(Math.random()<this.epsilon)return ri(4);return argmax(this.q(k(pos)))};
StandardAgent.prototype.reward=function(env,tr){if(tr.goal)return 10;if(tr.collision)return-1;return-.1};
StandardAgent.prototype.learn=function(prev,a,r,next,done){var q=this.q(k(prev)),nq=this.q(k(next)),target=r+(done?0:this.gamma*Math.max.apply(null,nq));q[a]+=this.alpha*(target-q[a])};

function MODQLAgent(){
  this.Q1=new Map();this.Q2=new Map();this.alpha=.5;this.gamma=.9;this.epsilon=.72;this.epsilonMin=.08;this.epsilonDecay=.989;
  this.visits=new Map();this.wallMemory=new Map();this.goal=null;
}
MODQLAgent.prototype.setGoal=function(p){this.goal=cp(p)};
MODQLAgent.prototype.q=function(T,s){if(!T.has(s))T.set(s,zeros());return T.get(s)};
MODQLAgent.prototype.state=function(env,pos,steps){
  var L=k(pos),dist=man(pos,env.goalPos),maxDist=(SIZE-1)*2,D=dist/maxDist<.25?0:dist/maxDist<.5?1:dist/maxDist<.75?2:3;
  var remaining=(MAX_STEPS-steps)/MAX_STEPS,T=remaining<.25?0:remaining<.5?1:remaining<.75?2:3;
  var count=this.visits.get(L)||0,H=count===0?0:count===1?1:count<=3?2:3;
  var acc=env.localAccessibility(pos),A=acc<.25?0:acc<.5?1:acc<.75?2:3;
  return'L='+L+'|D='+D+'|T='+T+'|H='+H+'|A='+A;
};
MODQLAgent.prototype.select=function(env,pos,steps){
  var sk=this.state(env,pos,steps),walls=this.wallMemory.get(k(pos))||{},q1=this.q(this.Q1,sk),q2=this.q(this.Q2,sk),combo=q1.map(function(v,i){return v+q2[i]});
  this.epsilon=Math.max(this.epsilonMin,this.epsilon*this.epsilonDecay);
  var preferred=[];for(var a=0;a<4;a++){if(walls[a])continue;var n=[pos[0]+ACTIONS[a][0],pos[1]+ACTIONS[a][1]];if(n[0]<0||n[1]<0||n[0]>=SIZE||n[1]>=SIZE||env.maze[n[0]][n[1]])continue;preferred.push(a)}
  if(!preferred.length)return ri(4);
  if(Math.random()<this.epsilon){
    var improving=preferred.filter(function(a){var n=[pos[0]+ACTIONS[a][0],pos[1]+ACTIONS[a][1]];return man(n,env.goalPos)<man(pos,env.goalPos)});
    if(improving.length&&Math.random()<.72)return improving[ri(improving.length)];return preferred[ri(preferred.length)];
  }
  var best=preferred[0];preferred.forEach(function(a){if(combo[a]>combo[best])best=a});return best;
};
MODQLAgent.prototype.reward=function(env,tr,steps){
  if(tr.goal)return 10;if(tr.collision)return-1;
  var oldD=man(tr.old,env.goalPos),newD=man(tr.state,env.goalPos),coverage=clamp((oldD-newD+1)/2,.05,1),fairness=1/(1+(this.visits.get(k(tr.state))||0)),travelCost=1;
  return coverage*fairness*(1/travelCost)-.05;
};
MODQLAgent.prototype.learn=function(env,prev,a,r,next,done,steps,collision){
  var pk=k(prev);this.visits.set(k(next),(this.visits.get(k(next))||0)+1);if(collision){var w=this.wallMemory.get(pk)||{};w[a]=1;this.wallMemory.set(pk,w)}
  var s=this.state(env,prev,Math.max(0,steps-1)),ns=this.state(env,next,steps),first=Math.random()<.5,X=first?this.Q1:this.Q2,Y=first?this.Q2:this.Q1,qx=this.q(X,s),nx=this.q(X,ns),ny=this.q(Y,ns),astar=argmax(nx),target=r+(done?0:this.gamma*ny[astar]);qx[a]+=this.alpha*(target-qx[a]);
};

var modes={standard:null,modql:null},active='standard',episode=1,timer=null,template=null;
function makeRun(kind,keepAgent){
  if(!template){var base=new MazeEnv();template=base.snapshot()}
  var old=modes[kind],agent=keepAgent&&old?old.agent:(kind==='standard'?new StandardAgent():new MODQLAgent()),env=new MazeEnv(template);if(kind==='modql')agent.setGoal(env.goalPos);
  modes[kind]={kind:kind,env:env,agent:agent,steps:0,last:'None',status:'Ready',goalResult:'In Progress...',history:[cp(env.currentPos)],reward:0,finished:false,collisions:0,environmentUpdates:0};
}
function newEpisode(){stop();episode++;template=null;makeRun('standard',true);makeRun('modql',true);render()}
function resetAll(){stop();episode=1;template=null;makeRun('standard',false);makeRun('modql',false);render()}
function run(){return modes[active]}
function stepOnce(){
  var s=run();if(!s||s.finished)return;var prev=cp(s.env.currentPos),a=s.agent.select?s.agent.select(s.env,prev,s.steps):0;
  if(active==='standard')a=s.agent.select(prev);
  var tr=s.env.step(a),r=s.agent.reward(s.env,tr,s.steps+1);s.steps++;s.reward+=r;s.last=ACTION_NAMES[a];if(tr.collision)s.collisions++;
  if(active==='standard')s.agent.learn(prev,a,r,tr.state,tr.done);else s.agent.learn(s.env,prev,a,r,tr.state,tr.done,s.steps,tr.collision);
  s.history.push(cp(tr.state));s.environmentUpdates=s.env.environmentUpdates;
  if(tr.done){s.finished=true;s.goalResult=tr.goal?'Goal Achieved!':'Goal Not Achieved';s.status=tr.goal?'Goal Achieved':'Timeout';stop()}else s.status='Episode '+episode+' running';render();
}
function play(){if(timer){stop();return}timer=setInterval(stepOnce,STEP_MS);render()}
function stop(){if(timer){clearInterval(timer);timer=null}render()}
function switchMode(kind){stop();active=kind;render()}

function draw(){
  var cv=document.getElementById('mazeCanvas'),s=run();if(!cv||!s)return;var x=cv.getContext('2d'),W=cv.width,H=cv.height,pad=18,cell=Math.floor((Math.min(W,H)-pad*2)/SIZE),ox=Math.floor((W-cell*SIZE)/2),oy=Math.floor((H-cell*SIZE)/2);x.clearRect(0,0,W,H);x.fillStyle='#fff';x.fillRect(0,0,W,H);
  for(var r=0;r<SIZE;r++)for(var c=0;c<SIZE;c++){x.fillStyle=s.env.maze[r][c]?'#f4c542':'#ffffff';x.fillRect(ox+c*cell,oy+r*cell,cell,cell);x.strokeStyle='#d0d4da';x.lineWidth=1;x.strokeRect(ox+c*cell,oy+r*cell,cell,cell)}
  if(s.history.length>1){x.beginPath();s.history.forEach(function(p,i){var px=ox+p[1]*cell+cell/2,py=oy+p[0]*cell+cell/2;i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=active==='standard'?'rgba(210,55,55,.28)':'rgba(46,103,209,.30)';x.lineWidth=3;x.stroke()}
  var g=s.env.goalPos,gx=ox+g[1]*cell+cell/2,gy=oy+g[0]*cell+cell/2;x.beginPath();x.fillStyle='#2eb85c';x.arc(gx,gy,cell*.28,0,Math.PI*2);x.fill();
  var p=s.env.currentPos,px=ox+p[1]*cell+cell/2,py=oy+p[0]*cell+cell/2;x.beginPath();x.fillStyle='#e23d3d';x.arc(px,py,cell*.27,0,Math.PI*2);x.fill();x.strokeStyle='#9e2020';x.lineWidth=2;x.stroke();
}
function stat(label,val){return'<div style="margin-bottom:14px"><div class="k" style="font-size:11px;text-transform:uppercase;letter-spacing:.6px">'+label+'</div><div style="font-size:17px;font-weight:800;margin-top:3px">'+val+'</div></div>'}
function lastSummary(kind){var s=modes[kind];if(!s)return'—';return(s.finished?s.goalResult:'In progress')+' · '+s.steps+' steps · '+s.collisions+' collisions'}
function render(){
  var root=document.getElementById('sub-maze'),s=run();if(!root||!s)return;
  var algo=active==='standard'?'Standard Q-Learning':'Proposed MODQL',desc=active==='standard'?'Single Q-table · location-only state · standard scalar reward':'Double Q-learning · enriched L,D,T,H,A state · multi-objective reward';
  root.innerHTML='<div class="algo-head '+(active==='standard'?'std':'mod')+'"><div class="ic">'+(active==='standard'?'Σ':'⌘')+'</div><div><h2>Maze Demo — '+algo+'</h2><p>'+desc+'</p></div></div>'+
  '<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button id="modeStd" class="btn '+(active==='standard'?'p':'g')+'">Standard Q-Learning</button><button id="modeMod" class="btn '+(active==='modql'?'p':'g')+'">Proposed MODQL</button><span class="tag">Episode '+episode+'</span></div><div class="k" style="margin-top:9px">Same original Maze Demo presentation. Switch algorithms to compare how each agent learns and reacts in the maze.</div></div>'+
  '<div class="card" style="padding:18px"><div style="display:grid;grid-template-columns:minmax(210px,290px) minmax(360px,1fr);gap:24px;align-items:start" id="mazeOldLayout">'+
    '<div><h3 style="margin-bottom:16px">Simulation Information</h3>'+stat('Episode',episode+' / 5')+stat('Status',s.status)+stat('Goal Result',s.goalResult)+stat('Steps Taken',s.steps+' / '+MAX_STEPS)+stat('Last Action',s.last)+stat('Cumulative Reward',s.reward.toFixed(3))+stat('Collisions',s.collisions)+stat('Environment Updates',s.environmentUpdates)+
    '<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)"><div class="k" style="font-weight:700;margin-bottom:8px">Legend</div><div class="k" style="line-height:2"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e23d3d;margin-right:7px"></span>Agent<br><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2eb85c;margin-right:7px"></span>Goal<br><span style="display:inline-block;width:10px;height:10px;background:#f4c542;margin-right:7px"></span>Wall</div></div></div>'+
    '<div><canvas id="mazeCanvas" width="520" height="520" style="width:100%;max-width:520px;background:#fff;border-radius:10px;display:block;margin:auto"></canvas><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px"><button id="mazePlay" class="btn p">'+(timer?'Pause':'Play')+'</button><button id="mazeStep" class="btn g">Step</button><button id="mazeNew" class="btn g">New Episode</button><button id="mazeReset" class="btn g">Reset Learning</button></div></div></div></div>'+
  '<div class="card"><h3>Quick comparison — current learning session</h3><table><thead><tr><th>Algorithm</th><th>State / estimator</th><th>Last result</th></tr></thead><tbody><tr><td><b>Standard Q-Learning</b></td><td>Location only · single Q-table</td><td>'+lastSummary('standard')+'</td></tr><tr><td><b>Proposed MODQL</b></td><td>L,D,T,H,A · Q1/Q2</td><td>'+lastSummary('modql')+'</td></tr></tbody></table><div class="k" style="margin-top:10px"><b>Note:</b> This maze is a visual learning sandbox. Thesis performance claims must still come from the controlled Laiban routing experiments and official/validated datasets.</div></div>';
  document.getElementById('modeStd').onclick=function(){switchMode('standard')};document.getElementById('modeMod').onclick=function(){switchMode('modql')};document.getElementById('mazePlay').onclick=play;document.getElementById('mazeStep').onclick=stepOnce;document.getElementById('mazeNew').onclick=newEpisode;document.getElementById('mazeReset').onclick=resetAll;
  var lay=document.getElementById('mazeOldLayout');if(window.innerWidth<850)lay.style.gridTemplateColumns='1fr';draw();
}
function init(){if(!document.getElementById('sub-maze'))return;makeRun('standard',false);makeRun('modql',false);render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
