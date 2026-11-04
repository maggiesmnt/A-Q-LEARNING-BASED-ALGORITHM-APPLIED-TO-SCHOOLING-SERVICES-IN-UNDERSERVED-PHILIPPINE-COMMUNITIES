/* Optional integration check: Node 22+ and locally installed Chrome, no packages. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-maze-check-'));
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'};
  try { res.setHeader('Content-Type', types[path.extname(target)] || 'text/plain'); res.end(fs.readFileSync(target)); }
  catch (_) { res.writeHead(404).end(); }
});
let chrome, socket;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], {windowsHide:true, stdio:'ignore'});
  let port;
  for (let n = 0; n < 100; n++) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch (_) {}
    await delay(100);
  }
  assert.ok(port, 'Chrome debugging port must start');
  const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list', {signal:AbortSignal.timeout(10000)})).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
  let seq = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const callback = pending.get(message.id); pending.delete(message.id); callback(message); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  function cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, message => { clearTimeout(timeout); message.error ? reject(message.error) : resolve(message.result); });
      socket.send(JSON.stringify({id, method, params}));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function steps(agent) {
    return evaluate(`document.querySelector('#mzSummaryBody [data-metric="movement-steps"] td:nth-of-type(${agent==='standard'?1:2})').textContent`);
  }
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {width:1440, height:1100, deviceScaleFactor:1, mobile:false});
  await cdp('Page.navigate', {url:'http://127.0.0.1:' + server.address().port + '/index.html?mazeSeed=123'});
  for (let i = 0; i < 200; i++) {
    if (await evaluate('!!document.getElementById("mzComparisonPlay")')) break;
    await delay(100);
  }
  assert.ok(await evaluate('!!document.getElementById("mzComparisonPlay")'), 'Maze main page initialized');
  assert.equal(await evaluate('document.querySelectorAll("#researchNav [role=tab], #researchNav .rn-brand").length'), 0, 'No redundant navigation');
  assert.equal(await evaluate('!!document.getElementById("tab-maze") || !!document.getElementById("tab-maze-legacy") || !!document.getElementById("tab-evaluation")'), false);
  assert.equal(await evaluate('document.querySelector(".subview.active").id'), 'sub-maze');
  assert.equal(await evaluate('document.querySelector(".shared-maze-heading h1").textContent'), 'Maze Comparison');
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-summary thead th").length'), 3);
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-deferrals").length'),0,'Redundant deferral dropdown removed');
  assert.equal(await evaluate('document.getElementById("mzAssessmentOutcome").textContent'),'Insufficient Evidence');
  assert.equal(await evaluate('document.getElementById("mzSeed").textContent'), '123');
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-controls button").length'), 3);
  assert.equal(await evaluate('document.querySelectorAll("#sub-maze canvas").length'), 2);
  assert.equal(await evaluate(`document.querySelectorAll('#sub-maze .shared-maze-agent, #sub-maze .shared-maze-run-details, #sub-maze [id$="-goal"], #sub-maze [id$="-action"]').length`),0,'No DOM agent, Run Details, exit coordinates or decision row');
  assert.equal(await evaluate('document.querySelectorAll("details.shared-maze-run-details, details.shared-maze-sop, .shared-maze-panel-footer").length'), 0, 'No local dropdowns or redundant footer');
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-run-details").length'),0,'Run Details is removed');
  function sopCheck(number) {
    return evaluate("Array.from(document.querySelectorAll('.shared-maze-panel')).every(p=>{const visible=Array.from(p.querySelectorAll('.shared-maze-sop')).filter(e=>!e.hidden);return visible.length===1&&visible[0].id.endsWith('-sop"+number+"')})");
  }
  assert.equal(await sopCheck(1),true,'SOP 1 is the only default section');
  for (const number of [2,3,1]) {
    await evaluate("document.getElementById('mzSop"+number+"').click()");
    assert.equal(await sopCheck(number),true,'Selection is exclusive and synchronized');
    assert.equal(await evaluate("document.getElementById('mzSop"+number+"').getAttribute('aria-selected')"),'true');
    await evaluate("document.getElementById('mzSop"+number+"').click()");
    assert.equal(await sopCheck(number),true,'Reselecting a tab never hides all sections');
  }
  await evaluate("document.getElementById('mzSop1').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await sopCheck(2),true,'Keyboard tab selection is synchronized');
  await evaluate("document.getElementById('mzSop1').click()");
  assert.equal(await evaluate('!!document.getElementById("mzSopExpand") || !!document.getElementById("mzSopCollapse")'),false);
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-sop-controls [role=tab]").length'),3);
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-run-details").length'),0,'Run Details is removed');
  await evaluate(`
    window.__mazeDots=[];window.__mazeLabels=[];window.__mazeStarts=[];
    const originalArc=CanvasRenderingContext2D.prototype.arc;
    const originalText=CanvasRenderingContext2D.prototype.fillText;
    const originalRect=CanvasRenderingContext2D.prototype.strokeRect;
    CanvasRenderingContext2D.prototype.arc=function(x,y,r){
      const cell=this.canvas.width/10;
      if(/^mz-(standard|modql)-canvas$/.test(this.canvas.id)&&this.globalAlpha<0.6&&r<=cell*0.101)window.__mazeDots.push({x:x/cell,y:y/cell,r:r/cell});
      return originalArc.apply(this,arguments);
    };
    CanvasRenderingContext2D.prototype.fillText=function(text){
      if(/^mz-(standard|modql)-canvas$/.test(this.canvas.id))window.__mazeLabels.push({id:this.canvas.id,text});
      return originalText.apply(this,arguments);
    };
    CanvasRenderingContext2D.prototype.strokeRect=function(x,y,w,h){
      const cell=this.canvas.width/10;
      if(/^mz-(standard|modql)-canvas$/.test(this.canvas.id)&&Math.abs(w/cell-0.44)<1e-8&&Math.abs(h/cell-0.44)<1e-8)window.__mazeStarts.push(this.canvas.id);
      return originalRect.apply(this,arguments);
    };
  `);
  assert.equal(await evaluate('document.getElementById("mzComparisonPlay").disabled'), true, 'Untrained evaluation is disabled');
  await evaluate('document.getElementById("mzTrain").click()');
  for (let i = 0; i < 400; i++) {
    if (await evaluate('!document.getElementById("mzComparisonPlay").disabled')) break;
    await delay(50);
  }
  assert.equal(await evaluate('document.getElementById("mzComparisonPlay").disabled'), false, 'Both policies trained');
  assert.match(await evaluate('document.getElementById("mzTrainingStatus").textContent'), /200 training episodes each/);
  let previousCanvas;
  for (const theme of ['light', 'dark']) {
    await evaluate('setTheme(' + JSON.stringify(theme) + ')');
    await delay(250);
    const pixels = await evaluate('document.getElementById("mz-standard-canvas").toDataURL()');
    if (previousCanvas) assert.notEqual(pixels, previousCanvas, 'Paused canvas redraws for theme changes');
    previousCanvas = pixels;
    const geometry = await evaluate(`(() => {
      const boxes = Array.from(document.querySelectorAll('.shared-maze-status')).map(e => e.getBoundingClientRect());
      const rows = ['minutes','reward','coverage','combined'].map(k =>
        ['standard','modql'].map(id => document.getElementById('mz-'+id+'-'+k).parentElement.getBoundingClientRect().top));
      return {tops:boxes.map(r=>r.top),lefts:boxes.map(r=>r.left),rows,
        overflow:document.documentElement.scrollWidth > innerWidth};
    })()`);
    assert.equal(geometry.tops[0], geometry.tops[1], theme + ' status panels align');
    assert.ok(geometry.lefts[1] > geometry.lefts[0], theme + ' panels are side by side');
    geometry.rows.forEach((pair, i) => assert.ok(Math.abs(pair[0]-pair[1]) < 1, theme + ' metric row ' + i + ' aligns: ' + pair));
    assert.equal(geometry.overflow, false);
    if(theme==='dark') {
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".shared-maze-metric-title")).color'),'rgb(255, 255, 255)','Primary metric titles are white');
      assert.equal(await evaluate('Array.from(document.querySelectorAll(".shared-maze-summary thead th")).every(e=>getComputedStyle(e).color==="rgb(255, 255, 255)")'),true,'All comparative table headers are white');
    }
  }
  for (const [width,height] of [[1366,768],[1920,1080]]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await delay(100);
    const layout=await evaluate(`(() => {
      const panels=Array.from(document.querySelectorAll('.shared-maze-panel')).map(e=>e.getBoundingClientRect());
      const boards=Array.from(document.querySelectorAll('.shared-maze-board')).map(e=>e.getBoundingClientRect());
      const sidebars=Array.from(document.querySelectorAll('.shared-maze-status')).map(e=>({box:e.getBoundingClientRect().toJSON(),scroll:e.scrollHeight,client:e.clientHeight,overflow:getComputedStyle(e).overflowY}));

      return {panels:panels.map(e=>e.toJSON()),boards:boards.map(e=>e.toJSON()),sidebars,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.ok(Math.abs(layout.panels[0].top-layout.panels[1].top)<1,'Desktop panels align at '+width);
    assert.ok(Math.abs(layout.boards[0].width-layout.boards[1].width)<1,'Equal canvas cells at '+width);
    assert.ok(layout.boards[0].width>300,'Maze remains large at '+width);
    layout.sidebars.forEach((s,i)=>{
      assert.ok(s.box.right<=layout.boards[i].left,'Sidebar stays left of maze');
      assert.equal(s.overflow,'visible','No internal sidebar scrolling');
      assert.ok(s.scroll<=s.client+2,'Sidebar grows to fit normal content');
      assert.ok(s.box.width/layout.boards[i].width<0.65,'Visualization gets priority');


    });
    assert.equal(layout.overflow,false,'No desktop overflow');
    assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".shared-maze-summary td")).fontSize)>=14'),'Presentation-sized result values');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".shared-maze-metric-title")).fontSize===getComputedStyle(document.querySelector(".shared-maze-sop h5")).fontSize'),true,'Primary metric title matches SOP heading size');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".shared-maze-metric-title")).fontWeight===getComputedStyle(document.querySelector(".shared-maze-sop h5")).fontWeight'),true,'Primary metric title matches SOP heading weight');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".shared-maze-summary tbody th")).fontSize===getComputedStyle(document.querySelector(".shared-maze-summary tbody td")).fontSize'),true,'Metric and value columns have consistent type size');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('window.__mazeDots.length'),0,'No route is prepainted before either agent moves');
  const markerBefore=await evaluate("['standard','modql'].map(id=>{const m=document.getElementById('mz-'+id+'-canvas');return [Number(m.dataset.agentRow),Number(m.dataset.agentColumn)]})");
  await evaluate('document.getElementById("mzComparisonStep").click()');
  assert.equal(await steps('standard'),'1');
  assert.equal(await steps('modql'),'1');
  const markerAfter=await evaluate("['standard','modql'].map(id=>{const m=document.getElementById('mz-'+id+'-canvas');return [Number(m.dataset.agentRow),Number(m.dataset.agentColumn)]})");
  markerAfter.forEach((p,i)=>assert.equal(Math.abs(p[0]-markerBefore[i][0])+Math.abs(p[1]-markerBefore[i][1]),1,'Each marker advances one actual grid cell'));
  for(const id of ['standard','modql']) {
    assert.equal(await evaluate(JSON.stringify(['A','B','C','D','E','F','G'])+'.every(text=>window.__mazeLabels.some(label=>label.id==="mz-'+id+'-canvas"&&label.text===text))'),true,'Live A–F service labels and G remain visible in '+id);
    assert.equal(await evaluate('window.__mazeStarts.includes("mz-'+id+'-canvas")'),true,'Small square start marker in '+id);
  }
  assert.equal(await evaluate('window.__mazeDots.length>0&&window.__mazeDots.every(d=>Math.abs(d.x%1-0.5)<1e-8&&Math.abs(d.y%1-0.5)<1e-8&&d.r<=0.101)'),true,'Trail uses soft dots at actual visited cell centers');
  assert.equal(await evaluate('document.getElementById("mz-standard-canvas").getContext("2d").getLineDash().length'),0,'Non-route outlines remain solid');
  await evaluate('document.getElementById("mzComparisonPlay").click()');
  await evaluate('document.getElementById("mzSop2").click();document.getElementById("mzSop3").click();document.getElementById("mzSop1").click()');
  const smooth=await evaluate(`new Promise(resolve=>{
    const deadline=performance.now()+1500;
    function sample(){
      const poses=['standard','modql'].map(id=>{const d=document.getElementById('mz-'+id+'-canvas').dataset;return {r:Number(d.agentRow),c:Number(d.agentColumn),tr:Number(d.targetRow),tc:Number(d.targetColumn)}});
      if(poses.every(p=>(!Number.isInteger(p.r)||!Number.isInteger(p.c))&&Math.abs(p.r-p.tr)+Math.abs(p.c-p.tc)<=1))return resolve(poses);
      if(performance.now()>deadline)return resolve(null);
      requestAnimationFrame(sample);
    }sample();
  })`);
  assert.ok(smooth,'Canvas agent is rendered between actual adjacent cell centers during playback');
  await delay(450);
  await evaluate('document.getElementById("mzComparisonPlay").click()');
  const paused = await steps('standard');
  await delay(300);
  assert.equal(await steps('standard'),paused);
  assert.equal(await evaluate('document.getElementById("mzComparisonPlay").textContent'), 'Resume Comparison');
  await evaluate('document.getElementById("mzComparisonPlay").click();document.getElementById("mzSpeed").value="50";document.getElementById("mzSpeed").dispatchEvent(new Event("change"))');
  await delay(130);
  await evaluate('document.getElementById("mzComparisonPlay").click()');
  assert.ok(parseInt(await steps('standard'),10)>parseInt(paused,10),'Resume and speed apply during playback');
  await evaluate('document.getElementById("mzSop2").click();document.getElementById("mzComparisonReset").click()');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[id$="-sop2"]')).every(e=>!e.hidden)`),true,'Reset preserves shared SOP presentation state');
  await evaluate('document.getElementById("mzSop1").click()');
  assert.equal(await evaluate('document.getElementById("mzSeed").textContent'), '123');
  assert.match(await evaluate('document.getElementById("mzTrainingStatus").textContent'), /200 training episodes each/);
  assert.equal(await steps('standard'),'0');
  const completed = await evaluate(`(() => {
    for(let n=0;n<110;n++)document.getElementById('mzComparisonStep').click();
    return {done:document.getElementById('mzComparisonPlay').disabled,metrics:document.getElementById('mzSummaryBody').innerText};
  })()`);
  assert.equal(completed.done, true);
  assert.equal(await evaluate('document.getElementById("mz-standard-minutes").textContent'),'1.30 hr');
  assert.equal(await evaluate('document.querySelector("#mzSummaryBody [data-metric=travel-time] td").textContent'),'1.30 hr');
  await evaluate("document.getElementById('mz-standard-minutes-title').scrollIntoView({block:'center'});document.getElementById('mz-standard-minutes-title').click()");
  await evaluate("document.getElementById('mzTravelUnit').value='minutes';document.getElementById('mzTravelUnit').dispatchEvent(new Event('change'))");
  assert.equal(await evaluate('document.getElementById("mz-standard-minutes").textContent'),'78 min');
  assert.equal(await evaluate('document.getElementById("mz-modql-minutes").textContent'),'78 min');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("#mzSummaryBody [data-metric=travel-time] td")).every(e=>e.textContent==="78 min")'),true);
  assert.match(await evaluate('document.getElementById("mzMetricPopoverBody").textContent'),/Travel Time = 78 min/,'Open explanation updates with selected unit');
  await evaluate("document.getElementById('mzTravelUnit').value='hours';document.getElementById('mzTravelUnit').dispatchEvent(new Event('change'))");
  assert.match(await evaluate('document.getElementById("mzMetricPopoverBody").textContent'),/1\.30 hr/);
  await evaluate("document.getElementById('mzMetricPopoverClose').click()");
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-explain").length'),0,'No repeated Explain links');
  const cardHeight=await evaluate('document.querySelector(".shared-maze-panel").getBoundingClientRect().height');
  await evaluate("document.getElementById('mz-standard-coverage-title').scrollIntoView({block:'center'});document.getElementById('mz-standard-coverage-title').click()");
  const explanation=await evaluate(`(() => {
    const pop=document.getElementById('mzMetricPopover'),r=pop.getBoundingClientRect();
    const trigger=document.getElementById('mz-standard-coverage-title'),t=trigger.getBoundingClientRect();
    const sidebar=trigger.closest('.shared-maze-status').getBoundingClientRect();
    return {hidden:pop.hidden,help:document.getElementById('mzMetricPopoverBody').textContent,
      progress:document.getElementById('mz-standard-coverageProgress').value,
      fits:r.left>=sidebar.left-1&&r.right<=sidebar.right+1&&r.top>=0&&r.bottom<=innerHeight,
      avoidsTitle:r.bottom<=t.top||r.top>=t.bottom};
  })()`);
  assert.equal(explanation.hidden,false);
  assert.match(explanation.help,/83 ÷ 108 × 100 = 76\.9%/,'Popover retains verified live math');
  assert.ok(Math.abs(explanation.progress-100*83/108)<1e-9);
  assert.equal(explanation.fits,true,'Popover stays in SOP column and viewport');
  assert.equal(explanation.avoidsTitle,true,'Popover leaves its title clickable');
  assert.equal(await evaluate('document.querySelector(".shared-maze-panel").getBoundingClientRect().height'),cardHeight,'Popover does not expand the layout');
  await evaluate("document.getElementById('mz-standard-coverage-title').click()");
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),true,'Same title closes');
  await evaluate("document.getElementById('mz-standard-coverage-title').click();document.querySelector('.shared-maze-heading').click()");
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),true,'Outside click closes');
  await evaluate("document.getElementById('mz-standard-coverage-title').scrollIntoView({block:'center'});document.getElementById('mz-standard-coverage-title').focus({preventScroll:true})");
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),false,'Enter opens metric title');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),true,'Escape closes');
  assert.equal(await evaluate('document.activeElement.id'),'mz-standard-coverage-title','Focus returns to title');
  for (const [sop,metric] of [[1,'fairness'],[2,'q'],[3,'location']]) {
    await evaluate("document.getElementById('mzSop"+sop+"').click();document.getElementById('mz-standard-"+metric+"-title').scrollIntoView({block:'center'});document.getElementById('mz-standard-"+metric+"-title').click()");
    assert.equal(await evaluate('document.querySelectorAll(".shared-maze-metric-popover:not([hidden])").length'),1,'Only one explanation across panels');
    assert.ok((await evaluate('document.getElementById("mzMetricPopoverBody").textContent')).length>20);
  }
  await evaluate("document.getElementById('mzSop1').click()");
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),true,'Changing SOP closes old explanation');
  assert.equal(await evaluate('document.getElementById("mzAssessmentOutcome").textContent'),'Standard Q-Learning Outperformed Enhanced MODQL','Seed 123 assessment follows computed results, not MODQL preference');
  await evaluate('document.getElementById("mzComparisonReset").click()');
  const replay = await evaluate(`(() => {
    for(let n=0;n<110;n++)document.getElementById('mzComparisonStep').click();
    return document.getElementById('mzSummaryBody').innerText;
  })()`);
  assert.equal(replay, completed.metrics, 'Frozen policy results replay exactly');
  if (process.argv.includes('--screenshot')) {
    await cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await evaluate('document.getElementById("mzComparisonReset").click();for(let n=0;n<24;n++)document.getElementById("mzComparisonStep").click()');
    await delay(100);
    const directory=path.join(root,'artifacts','maze-visual-restoration');
    fs.mkdirSync(directory,{recursive:true});
    for(const id of ['standard','modql']) {
      const clip=await evaluate('(() => {const e=document.getElementById("mz-'+id+'-canvas");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()');
      const board=await cdp('Page.captureScreenshot',{format:'png',clip});
      const destination=path.join(directory,id+'.png');
      fs.writeFileSync(destination,Buffer.from(board.data,'base64'));console.log('Maze screenshot: '+destination);
    }
    const repeated=await evaluate('(() => {for(let n=0;n<110;n++)document.getElementById("mzComparisonStep").click();return document.getElementById("mzSummaryBody").innerText})()');
    assert.equal(repeated,completed.metrics,'Capturing the visual reference preserves frozen evaluation results');
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    const layout=await cdp('Page.getLayoutMetrics');
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1440,height:layout.cssContentSize.height,scale:1}});
    const output=path.join(os.tmpdir(),'maze-comparison-review.png');
    fs.writeFileSync(output,Buffer.from(shot.data,'base64'));console.log('Screenshot: '+output);
  }
  await evaluate('document.getElementById("mzStep").click()');
  assert.equal(await evaluate('document.getElementById("mzSteps").textContent'), '1 / 100');
  await cdp('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await delay(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'mobile has no horizontal overflow');
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
  const touch=await evaluate("(() => {const b=document.getElementById('mz-standard-coverage-title');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(80);
  assert.equal(await evaluate('document.getElementById("mzMetricPopover").hidden'),false,'Touch tap opens the title explanation');
  await evaluate('document.getElementById("mzMetricPopoverClose").click()');
  await evaluate('renderAnalysis()');
  await delay(100);
  assert.equal(await evaluate('document.getElementById("sub-maze").parentNode.id'), '');
  assert.equal(await evaluate('document.querySelectorAll("#sub-evaluation .shared-maze-demo").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll("#sub-evaluation table tbody tr").length > 2'), true);
  assert.ok(await evaluate('!!document.getElementById("comparison-modql-grid")'), 'Laiban route preserved');
  assert.equal(await evaluate('document.querySelector(".subview.active").id'), 'sub-maze', 'Research rerender preserves the maze main page');
  assert.deepEqual(errors, [], 'No page JavaScript exceptions');
  console.log('Browser checks passed: progressive Canvas dots and interpolated circles, hour-formatted travel, larger metric titles, Run Details removed, frozen replay, keyboard/touch popovers, desktop/mobile layouts and retained calculations.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (socket) socket.close();
  if (chrome) chrome.kill();
  server.close();
  await delay(300);
  // This unique, verified temporary profile is the only directory removed.
  if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('shared-maze-check-')) {
    fs.rmSync(profile, {recursive:true, force:true, maxRetries:5, retryDelay:200});
  }
});
