/* ============================================================
   Maze Demo — browser adaptation of iboasay/sys baseline maze.

   Source adapted from:
   - System - THESIS/dynamic_maze_env.py
   - System - THESIS/baseline_confidence_agent.py
   - System - THESIS/simple_maze_demo_baseline.py

   UI intentionally preserves the current thesis system Maze Demo look.
   ============================================================ */
(function () {
  'use strict';

  const SIZE = 10;
  const OBSTACLE_RATIO = 0.25;
  const CHANGE_FREQUENCY = 20;
  const MAX_STEPS = 100;
  const MAX_EPISODES = 5;
  const STEP_MS = 200;
  const ACTIONS = [[-1,0],[1,0],[0,-1],[0,1]];
  const ACTION_NAMES = ['Up','Down','Left','Right'];

  const key = (p) => p[0] + ',' + p[1];
  const clone = (p) => [p[0], p[1]];
  const same = (a,b) => a[0] === b[0] && a[1] === b[1];
  const randInt = (n) => Math.floor(Math.random() * n);
  const manhattan = (a,b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
  const zeros4 = () => [0,0,0,0];

  class DynamicMazeEnvBrowser {
    constructor(size = SIZE, obstacleRatio = OBSTACLE_RATIO, changeFrequency = CHANGE_FREQUENCY) {
      this.size = size;
      this.obstacleRatio = obstacleRatio;
      this.changeFrequency = changeFrequency;
      this.maxSteps = MAX_STEPS;
      this.STEP_PENALTY = -0.1;
      this.COLLISION_PENALTY = -1.0;
      this.GOAL_REWARD = 10.0;
      this.steps = 0;
      this.previousPos = [0,0];
      this.currentPos = [0,0];
      this.goalPos = [size-1,size-1];
      this.maze = [];
      this.episodeData = {environmentUpdates:0,goalChanges:0,obstacleChanges:0};
      this.reset();
    }

    generateMaze() {
      const maze = Array.from({length:this.size}, () => Array(this.size).fill(0));
      const target = Math.floor(this.size * this.size * this.obstacleRatio);
      const used = new Set();
      while (used.size < target) {
        const idx = randInt(this.size * this.size);
        if (used.has(idx)) continue;
        used.add(idx);
        maze[Math.floor(idx / this.size)][idx % this.size] = 1;
      }
      return maze;
    }

    findEmptyPosition() {
      while (true) {
        const p = [randInt(this.size), randInt(this.size)];
        if (this.maze[p[0]][p[1]] === 0) return p;
      }
    }

    bfs(start, goal) {
      if (same(start, goal)) return {exists:true,path:[clone(start)]};
      const q = [[clone(start), [clone(start)]]];
      const seen = new Set([key(start)]);
      while (q.length) {
        const [cur,path] = q.shift();
        for (const d of ACTIONS) {
          const n = [cur[0]+d[0], cur[1]+d[1]];
          if (n[0] < 0 || n[1] < 0 || n[0] >= this.size || n[1] >= this.size) continue;
          if (this.maze[n[0]][n[1]] === 1 || seen.has(key(n))) continue;
          const np = path.concat([clone(n)]);
          if (same(n, goal)) return {exists:true,path:np};
          seen.add(key(n));
          q.push([n,np]);
        }
      }
      return {exists:false,path:[]};
    }

    ensureAgentNotTrapped() {
      for (const d of ACTIONS) {
        const n = [this.currentPos[0]+d[0], this.currentPos[1]+d[1]];
        if (n[0] >= 0 && n[1] >= 0 && n[0] < this.size && n[1] < this.size && this.maze[n[0]][n[1]] === 0) return;
      }
      for (const idx of [1,3,0,2]) {
        const d = ACTIONS[idx];
        const n = [this.currentPos[0]+d[0], this.currentPos[1]+d[1]];
        if (n[0] >= 0 && n[1] >= 0 && n[0] < this.size && n[1] < this.size) {
          this.maze[n[0]][n[1]] = 0;
          return;
        }
      }
    }

    ensurePathExists() {
      let r = this.bfs(this.currentPos, this.goalPos);
      let guard = 0;
      while (!r.exists && guard++ < 100) {
        const obs = [];
        for (let i=0;i<this.size;i++) for (let j=0;j<this.size;j++) if (this.maze[i][j] === 1) obs.push([i,j]);
        if (!obs.length) break;
        const p = obs[randInt(obs.length)];
        if (!same(p,this.currentPos) && !same(p,this.goalPos)) this.maze[p[0]][p[1]] = 0;
        r = this.bfs(this.currentPos, this.goalPos);
      }
    }

    reset() {
      this.maze = this.generateMaze();
      this.currentPos = this.findEmptyPosition();
      while (this.currentPos[0] > Math.floor(this.size/3) || this.currentPos[1] > Math.floor(this.size/3)) this.currentPos = this.findEmptyPosition();
      this.ensureAgentNotTrapped();
      this.goalPos = this.findEmptyPosition();
      while (this.goalPos[0] < Math.floor(2*this.size/3) || this.goalPos[1] < Math.floor(2*this.size/3) || manhattan(this.goalPos,this.currentPos) < this.size) this.goalPos = this.findEmptyPosition();
      this.steps = 0;
      this.previousPos = clone(this.currentPos);
      this.ensurePathExists();
      return clone(this.currentPos);
    }

    updateEnvironment() {
      const numChanges = 1 + randInt(3);
      let actualChanges = 0;
      for (let i=0;i<numChanges;i++) {
        const p = [randInt(this.size), randInt(this.size)];
        if (same(p,this.currentPos) || same(p,this.goalPos)) continue;
        this.maze[p[0]][p[1]] = this.maze[p[0]][p[1]] ? 0 : 1;
        actualChanges++;
      }
      this.ensurePathExists();
      this.ensureAgentNotTrapped();
      this.episodeData.environmentUpdates++;
      this.episodeData.obstacleChanges += actualChanges;
    }

    getOptimalPathLength() {
      const r = this.bfs(this.currentPos, this.goalPos);
      return r.exists ? Math.max(0, r.path.length - 1) : Infinity;
    }

    step(action) {
      this.steps++;
      const d = ACTIONS[action];
      const next = [this.currentPos[0]+d[0], this.currentPos[1]+d[1]];
      if (next[0] < 0 || next[1] < 0 || next[0] >= this.size || next[1] >= this.size) return {state:clone(this.currentPos),reward:this.COLLISION_PENALTY,done:false};
      if (this.maze[next[0]][next[1]] === 1) return {state:clone(this.currentPos),reward:this.COLLISION_PENALTY,done:false};
      this.currentPos = next;
      const reachedGoal = same(this.currentPos,this.goalPos);
      const done = reachedGoal || this.steps >= this.maxSteps;
      const oldDistance = manhattan(this.previousPos,this.goalPos);
      const newDistance = manhattan(this.currentPos,this.goalPos);
      const reward = reachedGoal ? this.GOAL_REWARD : this.STEP_PENALTY + (oldDistance - newDistance);
      if (this.steps % this.changeFrequency === 0) this.updateEnvironment();
      this.previousPos = clone(this.currentPos);
      return {state:clone(this.currentPos),reward,done};
    }
  }

  class BaselineConfidenceAgentBrowser {
    constructor() {
      this.qTable = new Map();
      this.defaultQ = zeros4();
      this.epsilon = 0.3;
      this.alpha = 0.1;
      this.gamma = 0.9;
      this.epsilonDecay = 0.995;
      this.minEpsilon = 0.1;
      this.historySize = 8;
      this.rewardHistory = [];
      this.stepHistory = [];
      this.successHistory = [];
      this.visitedStates = new Set();
      this.experienceBuffer = [];
      this.experienceMax = 1000;
    }

    getQ(stateKey) {
      if (!this.qTable.has(stateKey)) this.qTable.set(stateKey, this.defaultQ.slice());
      return this.qTable.get(stateKey);
    }

    selectAction(state) {
      if (Math.random() < this.epsilon) return randInt(4);
      const q = this.qTable.has(key(state)) ? this.qTable.get(key(state)) : this.defaultQ;
      const max = Math.max(...q);
      const choices = [];
      q.forEach((v,i) => { if (v === max) choices.push(i); });
      return choices[randInt(choices.length)];
    }

    updateQ(state, action, reward, nextState, done) {
      const q = this.getQ(key(state));
      const nq = this.getQ(key(nextState));
      const nextMax = Math.max(...nq);
      const old = q[action];
      q[action] = (1-this.alpha)*old + this.alpha*(reward + (done ? 0 : this.gamma*nextMax));
    }

    learn(state, action, reward, nextState, done, steps) {
      this.experienceBuffer.push([clone(state),action,reward,clone(nextState),done]);
      if (this.experienceBuffer.length > this.experienceMax) this.experienceBuffer.shift();
      if (this.experienceBuffer.length >= 32) {
        for (let i=0;i<32;i++) {
          const e = this.experienceBuffer[randInt(this.experienceBuffer.length)];
          this.updateQ(e[0],e[1],e[2],e[3],e[4]);
        }
      }
      if (done) this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.epsilonDecay);
      this.visitedStates.add(key(nextState));
      this.rewardHistory.push(reward);
      if (this.rewardHistory.length > this.historySize) this.rewardHistory.shift();
      if (done) {
        this.stepHistory.push(steps);
        if (this.stepHistory.length > this.historySize) this.stepHistory.shift();
        this.successHistory.push(reward > 0 ? 1 : 0);
        if (this.successHistory.length > 150) this.successHistory.shift();
      }
    }
  }

  let env = null, agent = null, episode = 1, stepsTaken = 0, lastAction = 'None', goalStatus = 'In Progress...', statusText = 'Ready for Episode 1', history = [], timer = null, running = false, finished = false;

  function el(id){ return document.getElementById(id); }
  function themeColor(name,fallback){ const v=getComputedStyle(document.body).getPropertyValue(name).trim(); return v||fallback; }

  function startEpisode(resetAgent=false){
    if (!env) env = new DynamicMazeEnvBrowser();
    const state = env.reset();
    if (!agent || resetAgent) agent = new BaselineConfidenceAgentBrowser();
    stepsTaken=0; lastAction='None'; goalStatus='In Progress...'; statusText='Episode '+episode+' running'; history=[clone(state)]; finished=false; updateStats(); draw();
  }

  function endEpisode(success){
    stopTimer(); finished=true;
    goalStatus = success ? 'Goal Achieved!' : 'Goal Not Achieved';
    statusText = success ? 'Goal Achieved' : 'Timeout';
    updateStats(); draw();
  }

  function stepOnce(){
    if (finished) return;
    const state = clone(env.currentPos);
    const action = agent.selectAction(state);
    const result = env.step(action);
    lastAction = ACTION_NAMES[action];
    agent.learn(state, action, result.reward, result.state, result.done, stepsTaken);
    stepsTaken++;
    history.push(clone(result.state));
    updateStats(); draw();
    if (result.done && same(result.state,env.goalPos)) endEpisode(true);
    else if (stepsTaken >= MAX_STEPS || result.done) endEpisode(false);
  }

  function updateStats(){
    if (el('mzEpisode')) el('mzEpisode').textContent = episode+' / '+MAX_EPISODES;
    if (el('mzSteps')) el('mzSteps').textContent = stepsTaken+' / '+MAX_STEPS;
    if (el('mzStatus')) el('mzStatus').textContent = statusText;
    if (el('mzGoal')) el('mzGoal').textContent = goalStatus;
    if (el('mzAction')) el('mzAction').textContent = lastAction;
    if (el('mzEpsilon')) el('mzEpsilon').textContent = agent ? agent.epsilon.toFixed(3) : '—';
  }

  function draw(){
    const canvas=el('mzCanvas'); if(!canvas||!env) return;
    const ctx=canvas.getContext('2d'), cell=canvas.width/SIZE;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      ctx.fillStyle=env.maze[r][c]?themeColor('--maze-wall','#B9AB6B'):themeColor('--maze-cell','#F7F0E2');
      ctx.fillRect(c*cell,r*cell,cell,cell);
      ctx.strokeStyle=themeColor('--maze-grid','#C9B99B'); ctx.lineWidth=1; ctx.strokeRect(c*cell,r*cell,cell,cell);
    }
    ctx.fillStyle=themeColor('--maze-trail','rgba(94,104,40,.28)');
    history.slice(0,-1).forEach(([r,c])=>{ctx.beginPath();ctx.arc(c*cell+cell/2,r*cell+cell/2,cell*.10,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle=themeColor('--maze-goal','#5E6828'); ctx.beginPath(); ctx.arc(env.goalPos[1]*cell+cell/2,env.goalPos[0]*cell+cell/2,cell*.30,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=themeColor('--maze-agent','#8A633F'); ctx.beginPath(); ctx.arc(env.currentPos[1]*cell+cell/2,env.currentPos[0]*cell+cell/2,cell*.30,0,Math.PI*2); ctx.fill();
  }

  function startTimer(){ if(running||finished)return; running=true; if(el('mzPlay'))el('mzPlay').textContent='Pause'; timer=setInterval(stepOnce,STEP_MS); }
  function stopTimer(){ running=false; if(timer)clearInterval(timer); timer=null; if(el('mzPlay'))el('mzPlay').textContent='Play'; }
  function nextEpisode(){ stopTimer(); if(episode>=MAX_EPISODES){episode=1;agent=new BaselineConfidenceAgentBrowser();}else episode++; startEpisode(false); }

  function buildUI(){
    const host=el('sub-maze'); if(!host)return;
    host.innerHTML=`
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 style="font-size:16px;margin-bottom:4px">Maze Demonstration — Baseline Confidence Agent</h3>
            <div class="k">Browser adaptation of the <span class="mono">iboasay/sys</span> maze demo, using its dynamic environment and baseline Q-learning agent behavior while preserving this system's existing Maze Demo interface.</div>
          </div>
          <span class="pill open">SYS REPOSITORY LOGIC</span>
        </div>
        <div style="display:grid;grid-template-columns:minmax(210px,300px) minmax(300px,500px);gap:18px;align-items:start" class="maze-layout">
          <div style="background:var(--maze-panel);border:1px solid var(--line);border-radius:12px;padding:14px;color:var(--txt);min-height:420px">
            <div style="font-weight:800;margin-bottom:12px">Maze Demonstration - Ball Moving in Maze</div>
            <div style="font-size:13px;line-height:1.9">
              <div>Episode: <b id="mzEpisode">1 / 5</b></div>
              <div>Status: <b id="mzStatus">Ready</b></div>
              <div>Goal Result: <b id="mzGoal">In Progress...</b></div>
              <div>Steps Taken: <b id="mzSteps">0 / 100</b></div>
              <div>Last Action: <b id="mzAction">None</b></div>
              <div>Exploration ε: <b id="mzEpsilon">0.300</b></div>
              <hr style="border:0;border-top:1px solid var(--line);margin:10px 0">
              <div><span style="color:var(--maze-agent)">●</span> Red Ball: Baseline Agent</div>
              <div><span style="color:var(--maze-goal)">●</span> Green Circle: Goal</div>
              <div><span style="color:var(--maze-wall)">■</span> Yellow Blocks: Walls</div>
              <div style="margin-top:10px;color:var(--dim)">Maze changes every 20 environment steps.</div>
            </div>
          </div>
          <div><canvas id="mzCanvas" width="500" height="500" style="display:block;width:100%;max-width:500px;aspect-ratio:1/1;background:var(--maze-cell);border:1px solid var(--line);border-radius:10px;margin:0 auto"></canvas></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn p" id="mzPlay" style="flex:0 0 110px">Play</button>
          <button class="btn g" id="mzStep" style="flex:0 0 110px">Step</button>
          <button class="btn g" id="mzReset" style="flex:0 0 140px">Restart Episode</button>
          <button class="btn k" id="mzNext" style="flex:0 0 140px">Next Episode</button>
        </div>
      </div>
      <div class="note"><b>Implementation note.</b> The old ReflectionAgent/simple_maze_demo browser port has been replaced. This tab now mirrors the dynamic maze and BaselineConfidenceAgent behavior from the <span class="mono">iboasay/sys</span> repository in JavaScript so it can run directly inside the thesis web system without pygame.</div>
      <style>@media (max-width:820px){.maze-layout{grid-template-columns:1fr!important}}</style>`;
    el('mzPlay').addEventListener('click',()=>running?stopTimer():startTimer());
    el('mzStep').addEventListener('click',()=>{stopTimer();stepOnce();});
    el('mzReset').addEventListener('click',()=>{stopTimer();startEpisode(false);});
    el('mzNext').addEventListener('click',nextEpisode);
    episode=1; env=new DynamicMazeEnvBrowser(); agent=new BaselineConfidenceAgentBrowser(); startEpisode(false);
  }

  function wireTab(){
    const btn=document.querySelector('#researchNav button[data-sub="maze"]'); if(!btn)return;
    btn.addEventListener('click',()=>{document.querySelectorAll('#researchNav button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');document.querySelectorAll('.subview').forEach(s=>s.classList.remove('active'));const target=el('sub-maze');if(target)target.classList.add('active');draw();});
  }

  document.addEventListener('DOMContentLoaded',()=>{buildUI();wireTab();});
})();