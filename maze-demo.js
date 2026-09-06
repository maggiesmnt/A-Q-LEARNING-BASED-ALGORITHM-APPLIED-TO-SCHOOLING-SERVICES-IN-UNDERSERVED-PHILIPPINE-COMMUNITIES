/* ============================================================
   Maze Demo — Standard Q-Learning vs Proposed MODQL

   Training Mode:
   - visible epsilon-greedy exploration/exploitation
   - Q-values are updated
   - epsilon decays after each completed episode

   Learned Policy Mode:
   - uses the Q-values learned in Training Mode
   - epsilon is forced to 0 (pure exploitation)
   - learning is frozen for clean evaluation
   ============================================================ */
(function(){
  'use strict';

  const SIZE=10, OBSTACLE_RATIO=.25, CHANGE_FREQUENCY=20, MAX_STEPS=100, MAX_EPISODES=20, STEP_MS=200;
  const TRAIN_EPS_START=1.0, TRAIN_EPS_MIN=.05, TRAIN_EPS_DECAY=.90;
  const ACTIONS=[[-1,0],[1,0],[0,-1],[0,1]], ACTION_NAMES=['Up','Down','Left','Right'];
  const key=p=>p[0]+','+p[1], clone=p=>[p[0],p[1]], same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  const randInt=n=>Math.floor(Math.random()*n), manhattan=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]), zeros4=()=>[0,0,0,0];
  const el=id=>document.getElementById(id);
  function themeColor(name,fallback){const v=getComputedStyle(document.body).getPropertyValue(name).trim();return v||fallback;}

  class DynamicMazeEnvBrowser{
    constructor(size=SIZE,obstacleRatio=OBSTACLE_RATIO,changeFrequency=CHANGE_FREQUENCY){
      this.size=size;this.obstacleRatio=obstacleRatio;this.changeFrequency=changeFrequency;this.maxSteps=MAX_STEPS;
      this.STEP_PENALTY=-.1;this.COLLISION_PENALTY=-1;this.GOAL_REWARD=10;this.steps=0;
      this.currentPos=[0,0];this.previousPos=[0,0];this.goalPos=[size-1,size-1];this.maze=[];this.reset();
    }
    generateMaze(){
      const maze=Array.from({length:this.size},()=>Array(this.size).fill(0)),target=Math.floor(this.size*this.size*this.obstacleRatio),used=new Set();
      while(used.size<target){const idx=randInt(this.size*this.size);if(used.has(idx))continue;used.add(idx);maze[Math.floor(idx/this.size)][idx%this.size]=1;}return maze;
    }
    findEmptyPosition(){while(true){const p=[randInt(this.size),randInt(this.size)];if(this.maze[p[0]][p[1]]===0)return p;}}
    bfs(start,goal){
      if(same(start,goal))return{exists:true,path:[clone(start)]};
      const q=[[clone(start),[clone(start)]]],seen=new Set([key(start)]);
      while(q.length){const [cur,path]=q.shift();for(const d of ACTIONS){const n=[cur[0]+d[0],cur[1]+d[1]];
        if(n[0]<0||n[1]<0||n[0]>=this.size||n[1]>=this.size||this.maze[n[0]][n[1]]===1||seen.has(key(n)))continue;
        const np=path.concat([clone(n)]);if(same(n,goal))return{exists:true,path:np};seen.add(key(n));q.push([n,np]);}}
      return{exists:false,path:[]};
    }
    ensureAgentNotTrapped(){
      for(const d of ACTIONS){const n=[this.currentPos[0]+d[0],this.currentPos[1]+d[1]];if(n[0]>=0&&n[1]>=0&&n[0]<this.size&&n[1]<this.size&&this.maze[n[0]][n[1]]===0)return;}
      for(const idx of [1,3,0,2]){const d=ACTIONS[idx],n=[this.currentPos[0]+d[0],this.currentPos[1]+d[1]];if(n[0]>=0&&n[1]>=0&&n[0]<this.size&&n[1]<this.size){this.maze[n[0]][n[1]]=0;return;}}
    }
    ensurePathExists(){let r=this.bfs(this.currentPos,this.goalPos),guard=0;while(!r.exists&&guard++<100){const obs=[];for(let i=0;i<this.size;i++)for(let j=0;j<this.size;j++)if(this.maze[i][j]===1)obs.push([i,j]);if(!obs.length)break;const p=obs[randInt(obs.length)];if(!same(p,this.currentPos)&&!same(p,this.goalPos))this.maze[p[0]][p[1]]=0;r=this.bfs(this.currentPos,this.goalPos);}}
    reset(){
      this.maze=this.generateMaze();this.currentPos=this.findEmptyPosition();
      while(this.currentPos[0]>Math.floor(this.size/3)||this.currentPos[1]>Math.floor(this.size/3))this.currentPos=this.findEmptyPosition();
      this.ensureAgentNotTrapped();this.goalPos=this.findEmptyPosition();
      while(this.goalPos[0]<Math.floor(2*this.size/3)||this.goalPos[1]<Math.floor(2*this.size/3)||manhattan(this.goalPos,this.currentPos)<this.size)this.goalPos=this.findEmptyPosition();
      this.steps=0;this.previousPos=clone(this.currentPos);this.ensurePathExists();return clone(this.currentPos);
    }
    cloneFrom(other){this.maze=other.maze.map(r=>r.slice());this.currentPos=clone(other.currentPos);this.previousPos=clone(other.previousPos);this.goalPos=clone(other.goalPos);this.steps=0;}
    updateEnvironment(){const num=1+randInt(3);for(let i=0;i<num;i++){const p=[randInt(this.size),randInt(this.size)];if(same(p,this.currentPos)||same(p,this.goalPos))continue;this.maze[p[0]][p[1]]=this.maze[p[0]][p[1]]?0:1;}this.ensurePathExists();this.ensureAgentNotTrapped();}
    localAccessibility(pos){let open=0,total=0;for(const d of ACTIONS){const n=[pos[0]+d[0],pos[1]+d[1]];if(n[0]<0||n[1]<0||n[0]>=this.size||n[1]>=this.size)continue;total++;if(this.maze[n[0]][n[1]]===0)open++;}return total?open/total:0;}
    step(action){
      this.steps++;const d=ACTIONS[action],next=[this.currentPos[0]+d[0],this.currentPos[1]+d[1]];
      if(next[0]<0||next[1]<0||next[0]>=this.size||next[1]>=this.size)return{state:clone(this.currentPos),reward:this.COLLISION_PENALTY,done:this.steps>=this.maxSteps,collision:true};
      if(this.maze[next[0]][next[1]]===1)return{state:clone(this.currentPos),reward:this.COLLISION_PENALTY,done:this.steps>=this.maxSteps,collision:true};
      this.currentPos=next;const reached=same(this.currentPos,this.goalPos),done=reached||this.steps>=this.maxSteps;
      const oldDist=manhattan(this.previousPos,this.goalPos),newDist=manhattan(this.currentPos,this.goalPos);
      const reward=reached?this.GOAL_REWARD:this.STEP_PENALTY+(oldDist-newDist);
      if(this.steps%this.changeFrequency===0&&!done)this.updateEnvironment();this.previousPos=clone(this.currentPos);
      return{state:clone(this.currentPos),reward,done,collision:false,oldDist,newDist};
    }
  }

  class BaselineConfidenceAgentBrowser{
    constructor(){this.qTable=new Map();this.defaultQ=zeros4();this.epsilon=TRAIN_EPS_START;this.alpha=.1;this.gamma=.9;}
    getQ(sk){if(!this.qTable.has(sk))this.qTable.set(sk,this.defaultQ.slice());return this.qTable.get(sk);}
    selectAction(state,forceGreedy=false){
      const explore=!forceGreedy&&Math.random()<this.epsilon;
      if(explore)return{action:randInt(4),decision:'EXPLORE'};
      const q=this.qTable.has(key(state))?this.qTable.get(key(state)):this.defaultQ,max=Math.max(...q),choices=[];q.forEach((v,i)=>{if(v===max)choices.push(i);});
      return{action:choices[randInt(choices.length)],decision:'EXPLOIT'};
    }
    updateQ(state,action,reward,nextState,done){const q=this.getQ(key(state)),nq=this.getQ(key(nextState)),nextMax=Math.max(...nq),old=q[action];q[action]=(1-this.alpha)*old+this.alpha*(reward+(done?0:this.gamma*nextMax));}
    decay(){this.epsilon=Math.max(TRAIN_EPS_MIN,this.epsilon*TRAIN_EPS_DECAY);}
  }

  class ProposedMODQLMazeAgent{
    constructor(){this.q1=new Map();this.q2=new Map();this.alpha=.1;this.gamma=.9;this.epsilon=TRAIN_EPS_START;this.visits=new Map();this.lastUpdated='—';}
    q(map,sk){if(!map.has(sk))map.set(sk,zeros4());return map.get(sk);}
    visitCount(p){return this.visits.get(key(p))||0;}
    resetEpisodeMemory(){this.visits=new Map();}
    fairness(){const vals=[...this.visits.values()];if(!vals.length)return 1;const s=vals.reduce((a,b)=>a+b,0),sq=vals.reduce((a,b)=>a+b*b,0);return sq===0?1:(s*s)/(vals.length*sq);}
    stateKey(env,pos,steps){
      const L=key(pos),maxDist=(SIZE-1)*2,dist=manhattan(pos,env.goalPos),progress=1-dist/maxDist;
      const D=progress<.25?0:progress<.5?1:progress<.75?2:3;
      const remaining=Math.max(0,MAX_STEPS-steps),T=Math.min(5,Math.max(0,Math.floor((remaining/MAX_STEPS)*6)));
      const count=this.visitCount(pos),H=count===0?3:count===1?2:count<=3?1:0;
      const a=env.localAccessibility(pos),A=a<.25?0:a<.5?1:a<.75?2:3;
      return `L=${L}|D=${D}|T=${T}|H=${H}|A=${A}`;
    }
    selectAction(env,state,steps,forceGreedy=false){
      const sk=this.stateKey(env,state,steps),explore=!forceGreedy&&Math.random()<this.epsilon;
      if(explore)return{action:randInt(4),decision:'EXPLORE',stateKey:sk};
      const a=this.q(this.q1,sk),b=this.q(this.q2,sk),combo=a.map((v,i)=>v+b[i]),max=Math.max(...combo),best=[];combo.forEach((v,i)=>{if(v===max)best.push(i);});
      return{action:best[randInt(best.length)],decision:'EXPLOIT',stateKey:sk};
    }
    reward(env,before,result){
      if(result.collision)return-1;
      const oldDist=manhattan(before,env.goalPos),newDist=manhattan(result.state,env.goalPos);
      const coverage=result.done&&same(result.state,env.goalPos)?1:Math.max(.05,(oldDist-newDist+1)/3);
      const fairness=Math.max(.2,this.fairness()),travelCost=1,base=coverage*fairness*(1/travelCost);
      return result.done&&same(result.state,env.goalPos)?10+base:base-.1;
    }
    learn(env,state,action,result,steps){
      const sk=this.stateKey(env,state,steps),nk=this.stateKey(env,result.state,steps+1),r=this.reward(env,state,result),done=result.done;
      if(Math.random()<.5){const q1=this.q(this.q1,sk),n1=this.q(this.q1,nk),n2=this.q(this.q2,nk),astar=n1.indexOf(Math.max(...n1)),target=r+(done?0:this.gamma*n2[astar]);q1[action]+=this.alpha*(target-q1[action]);this.lastUpdated='Q1';}
      else{const q2=this.q(this.q2,sk),n2=this.q(this.q2,nk),n1=this.q(this.q1,nk),astar=n2.indexOf(Math.max(...n2)),target=r+(done?0:this.gamma*n1[astar]);q2[action]+=this.alpha*(target-q2[action]);this.lastUpdated='Q2';}
      this.visits.set(key(result.state),this.visitCount(result.state)+1);return r;
    }
    decay(){this.epsilon=Math.max(TRAIN_EPS_MIN,this.epsilon*TRAIN_EPS_DECAY);}
  }

  let stdEnv=null,modEnv=null,stdAgent=null,modAgent=null,episode=1,timer=null,running=false,baseMaze=null,mode='training';
  const state={
    std:{steps:0,last:'None',decision:'—',goal:'In Progress...',status:'Ready',history:[],finished:false},
    mod:{steps:0,last:'None',decision:'—',updated:'—',stateKey:'—',goal:'In Progress...',status:'Ready',history:[],finished:false}
  };

  function newBaseMaze(){baseMaze=new DynamicMazeEnvBrowser();baseMaze.reset();}
  function resetAgents(){stdAgent=new BaselineConfidenceAgentBrowser();modAgent=new ProposedMODQLMazeAgent();}

  function resetPair(){
    if(!baseMaze)newBaseMaze();if(!stdAgent||!modAgent)resetAgents();
    stdEnv=new DynamicMazeEnvBrowser();modEnv=new DynamicMazeEnvBrowser();stdEnv.cloneFrom(baseMaze);modEnv.cloneFrom(baseMaze);modAgent.resetEpisodeMemory();
    for(const side of ['std','mod']){state[side].steps=0;state[side].last='None';state[side].decision='—';state[side].goal='In Progress...';state[side].finished=false;state[side].status=(mode==='training'?'Training ':'Learned Policy ')+episode;state[side].history=[];}
    state.mod.updated='—';state.mod.stateKey='—';state.std.history=[clone(stdEnv.currentPos)];state.mod.history=[clone(modEnv.currentPos)];updateStats();drawAll();
  }

  function finishSide(side,env,result){
    if(result.done&&same(result.state,env.goalPos)){state[side].goal='Goal Achieved!';state[side].status='Goal Achieved';state[side].finished=true;}
    else if(result.done||state[side].steps>=MAX_STEPS){state[side].goal='Goal Not Achieved';state[side].status='Timeout';state[side].finished=true;}
  }

  function stepStandard(){
    if(state.std.finished)return;const s=clone(stdEnv.currentPos),pick=stdAgent.selectAction(s,mode==='policy'),r=stdEnv.step(pick.action);
    if(mode==='training')stdAgent.updateQ(s,pick.action,r.reward,r.state,r.done);
    state.std.steps++;state.std.last=ACTION_NAMES[pick.action];state.std.decision=pick.decision;state.std.history.push(clone(r.state));finishSide('std',stdEnv,r);
  }

  function stepProposed(){
    if(state.mod.finished)return;const s=clone(modEnv.currentPos),pick=modAgent.selectAction(modEnv,s,state.mod.steps,mode==='policy'),r=modEnv.step(pick.action);
    if(mode==='training')modAgent.learn(modEnv,s,pick.action,r,state.mod.steps);
    state.mod.steps++;state.mod.last=ACTION_NAMES[pick.action];state.mod.decision=pick.decision;state.mod.stateKey=pick.stateKey;state.mod.updated=mode==='training'?modAgent.lastUpdated:'Frozen';state.mod.history.push(clone(r.state));finishSide('mod',modEnv,r);
  }

  function stepBoth(){stepStandard();stepProposed();updateStats();drawAll();if(state.std.finished&&state.mod.finished)stopTimer();}

  function drawMaze(canvasId,env,history){
    const canvas=el(canvasId);if(!canvas||!env)return;const ctx=canvas.getContext('2d'),cell=canvas.width/SIZE;ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){ctx.fillStyle=env.maze[r][c]?themeColor('--maze-wall','#B9AB6B'):themeColor('--maze-cell','#F7F0E2');ctx.fillRect(c*cell,r*cell,cell,cell);ctx.strokeStyle=themeColor('--maze-grid','#C9B99B');ctx.lineWidth=1;ctx.strokeRect(c*cell,r*cell,cell,cell);}
    ctx.fillStyle=themeColor('--maze-trail','rgba(94,104,40,.28)');history.slice(0,-1).forEach(([r,c])=>{ctx.beginPath();ctx.arc(c*cell+cell/2,r*cell+cell/2,cell*.10,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=themeColor('--maze-goal','#5E6828');ctx.beginPath();ctx.arc(env.goalPos[1]*cell+cell/2,env.goalPos[0]*cell+cell/2,cell*.30,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=themeColor('--maze-agent','#8A633F');ctx.beginPath();ctx.arc(env.currentPos[1]*cell+cell/2,env.currentPos[0]*cell+cell/2,cell*.30,0,Math.PI*2);ctx.fill();
  }
  function drawAll(){drawMaze('mzCanvasStd',stdEnv,state.std.history);drawMaze('mzCanvasMod',modEnv,state.mod.history);}

  function updateStats(){
    const stdEps=mode==='policy'?0:stdAgent.epsilon,modEps=mode==='policy'?0:modAgent.epsilon;
    const set=(id,val)=>{if(el(id))el(id).textContent=val;};
    set('stdEpisode',episode+' / '+MAX_EPISODES);set('stdSteps',state.std.steps+' / '+MAX_STEPS);set('stdStatus',state.std.status);set('stdGoal',state.std.goal);set('stdAction',state.std.last);set('stdDecision',state.std.decision);set('stdEpsilon',stdEps.toFixed(3));
    set('modEpisode',episode+' / '+MAX_EPISODES);set('modSteps',state.mod.steps+' / '+MAX_STEPS);set('modStatus',state.mod.status);set('modGoal',state.mod.goal);set('modAction',state.mod.last);set('modDecision',state.mod.decision);set('modEpsilon',modEps.toFixed(3));set('modUpdated',state.mod.updated);set('modStateKey',state.mod.stateKey);
    if(el('mzModeLabel'))el('mzModeLabel').textContent=mode==='training'?'Training Mode':'Learned Policy Mode';
  }

  function startTimer(){if(running)return;running=true;if(el('mzPlay'))el('mzPlay').textContent='Pause';timer=setInterval(stepBoth,STEP_MS);}
  function stopTimer(){running=false;if(timer)clearInterval(timer);timer=null;if(el('mzPlay'))el('mzPlay').textContent='Play';}

  function completeEpisodeAndAdvance(){
    stopTimer();
    if(mode==='training'){stdAgent.decay();modAgent.decay();}
    episode=episode>=MAX_EPISODES?1:episode+1;resetPair();
  }

  function switchMode(next){
    stopTimer();mode=next;episode=1;
    document.querySelectorAll('[data-maze-mode]').forEach(b=>b.classList.toggle('p',b.dataset.mazeMode===mode));
    resetPair();
  }

  function panel(title,badge,prefix,canvasId,description,logicNote,isProposed){return `
    <div class="card" style="padding:14px;margin:0">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px"><div><h3 style="font-size:15px;margin-bottom:3px">${title}</h3><div class="k">${description}</div></div><span class="pill open">${badge}</span></div>
      <div style="display:grid;grid-template-columns:minmax(180px,230px) minmax(250px,1fr);gap:12px;align-items:start" class="maze-side-layout">
        <div style="background:var(--maze-panel);border:1px solid var(--line);border-radius:12px;padding:12px;color:var(--txt);min-height:390px">
          <div style="font-weight:800;margin-bottom:10px">Maze Demonstration</div><div style="font-size:12px;line-height:1.85">
            <div>Episode: <b id="${prefix}Episode">1 / ${MAX_EPISODES}</b></div><div>Status: <b id="${prefix}Status">Ready</b></div><div>Goal Result: <b id="${prefix}Goal">In Progress...</b></div><div>Steps Taken: <b id="${prefix}Steps">0 / ${MAX_STEPS}</b></div><div>Last Action: <b id="${prefix}Action">None</b></div><div>Decision: <b id="${prefix}Decision">—</b></div><div>Exploration ε: <b id="${prefix}Epsilon">1.000</b></div>
            ${isProposed?'<div>Updated Table: <b id="modUpdated">—</b></div><div style="margin-top:4px">State: <b id="modStateKey" class="mono" style="font-size:10px;overflow-wrap:anywhere">—</b></div>':''}
            <hr style="border:0;border-top:1px solid var(--line);margin:9px 0"><div><span style="color:var(--maze-agent)">●</span> Agent</div><div><span style="color:var(--maze-goal)">●</span> Goal</div><div><span style="color:var(--maze-wall)">■</span> Walls</div><div style="margin-top:9px;color:var(--dim)">${logicNote}</div>
          </div>
        </div>
        <canvas id="${canvasId}" width="500" height="500" style="display:block;width:100%;max-width:500px;aspect-ratio:1/1;background:var(--maze-cell);border:1px solid var(--line);border-radius:10px;margin:0 auto"></canvas>
      </div>
    </div>`;}

  function buildUI(){
    const host=el('sub-maze');if(!host)return;host.innerHTML=`
      <div class="card" style="padding:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">
          <div><h3 style="font-size:16px;margin-bottom:4px">Maze Demo — Standard vs Proposed Algorithm</h3><div class="k">Same starting maze for direct comparison. Training Mode shows epsilon-greedy learning; Learned Policy Mode evaluates the learned Q-values without exploration or updates.</div></div>
          <div style="display:flex;gap:6px;align-items:center"><span class="k">Mode:</span><button class="btn p" data-maze-mode="training">Training</button><button class="btn g" data-maze-mode="policy">Learned Policy</button></div>
        </div>
        <div class="note" style="margin:0 0 12px"><b id="mzModeLabel">Training Mode</b> · <span id="mzModeHelp">Training visibly uses EXPLORE/EXPLOIT decisions and updates Q-values. Switch to Learned Policy after several episodes to evaluate what was learned.</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" class="maze-compare">
          ${panel('Standard Q-Learning','STANDARD','std','mzCanvasStd','Single-table baseline Q-learning.','Single Q-table · state S=L',false)}
          ${panel('Proposed MODQL','PROPOSED','mod','mzCanvasMod','Multi-Objective Double Q-Learning maze analogy.','Q1 + Q2 · enriched state <L,D,T,H,A> analogy',true)}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn p" id="mzPlay" style="flex:0 0 110px">Play</button><button class="btn g" id="mzStep" style="flex:0 0 110px">Step Both</button><button class="btn g" id="mzReset" style="flex:0 0 150px">Restart Episode</button><button class="btn k" id="mzNext" style="flex:0 0 140px">Next Episode</button><button class="btn g" id="mzNew" style="flex:0 0 170px">New Maze + Reset Learning</button></div>
      </div>
      <div class="note"><b>How to read the demo.</b> In Training Mode, <b>EXPLORE</b> means the epsilon-greedy rule selected a random action; <b>EXPLOIT</b> means the agent selected its best-known action. Epsilon decreases after each episode. Learned Policy Mode sets epsilon to 0 and freezes Q-table updates, so the movement reflects only the learned policy. The proposed maze remains a visual analogy, not Chapter 4 evidence.</div>
      <style>@media(max-width:1150px){.maze-compare{grid-template-columns:1fr!important}}@media(max-width:760px){.maze-side-layout{grid-template-columns:1fr!important}}</style>`;

    el('mzPlay').addEventListener('click',()=>running?stopTimer():startTimer());
    el('mzStep').addEventListener('click',()=>{stopTimer();stepBoth();});
    el('mzReset').addEventListener('click',()=>{stopTimer();resetPair();});
    el('mzNext').addEventListener('click',completeEpisodeAndAdvance);
    el('mzNew').addEventListener('click',()=>{stopTimer();episode=1;newBaseMaze();resetAgents();mode='training';document.querySelectorAll('[data-maze-mode]').forEach(b=>b.classList.toggle('p',b.dataset.mazeMode==='training'));resetPair();});
    document.querySelectorAll('[data-maze-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.mazeMode)));
    episode=1;newBaseMaze();resetAgents();resetPair();
  }

  function wireTab(){const btn=document.querySelector('#researchNav button[data-sub="maze"]');if(!btn)return;btn.addEventListener('click',()=>{document.querySelectorAll('#researchNav button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.subview').forEach(s=>s.classList.remove('active'));const target=el('sub-maze');if(target)target.classList.add('active');drawAll();});}
  document.addEventListener('DOMContentLoaded',()=>{buildUI();wireTab();});
})();