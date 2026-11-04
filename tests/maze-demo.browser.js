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
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {width:1440, height:1100, deviceScaleFactor:1, mobile:false});
  await cdp('Page.navigate', {url:'http://127.0.0.1:' + server.address().port + '/index.html?mazeSeed=123'});
  for (let i = 0; i < 200; i++) {
    if (await evaluate('!!document.getElementById("tab-maze")')) break;
    await delay(100);
  }
  assert.ok(await evaluate('!!document.getElementById("tab-maze")'), 'Maze tab registered');
  await evaluate('document.getElementById("tab-maze").click()');
  assert.equal(await evaluate('document.querySelector(".subview.active").id'), 'sub-maze');
  assert.equal(await evaluate('document.getElementById("mzSeed").textContent'), '123');
  assert.equal(await evaluate('document.querySelectorAll(".shared-maze-controls button").length'), 4);
  assert.equal(await evaluate('document.querySelectorAll("#sub-maze canvas").length'), 2);
  let previousCanvas;
  for (const theme of ['light', 'dark']) {
    await evaluate('setTheme(' + JSON.stringify(theme) + ')');
    await delay(50);
    const pixels = await evaluate('document.getElementById("mz-standard-canvas").toDataURL()');
    if (previousCanvas) assert.notEqual(pixels, previousCanvas, 'Paused canvas redraws for theme changes');
    previousCanvas = pixels;
    const geometry = await evaluate(`(() => {
      const boxes = Array.from(document.querySelectorAll('.shared-maze-status')).map(e => e.getBoundingClientRect());
      const rows = ['episode','steps','status','goal','minutes','reward','coverage','combined','spread'].map(k =>
        ['standard','modql'].map(id => document.getElementById('mz-'+id+'-'+k).getBoundingClientRect().top));
      return {tops:boxes.map(r=>r.top),lefts:boxes.map(r=>r.left),rows,
        overflow:document.documentElement.scrollWidth > innerWidth};
    })()`);
    assert.equal(geometry.tops[0], geometry.tops[1], theme + ' status panels align');
    assert.ok(geometry.lefts[1] > geometry.lefts[0], theme + ' panels are side by side');
    geometry.rows.forEach((pair, i) => assert.ok(Math.abs(pair[0]-pair[1]) < 1, theme + ' metric row ' + i + ' aligns: ' + pair));
    assert.equal(geometry.overflow, false);
  }
  await evaluate('document.getElementById("mzComparisonStep").click()');
  assert.equal(await evaluate('document.getElementById("mz-standard-steps").textContent'), '1 / 100');
  assert.equal(await evaluate('document.getElementById("mz-modql-steps").textContent'), '1 / 100');
  await evaluate('document.getElementById("mzComparisonPlay").click()');
  await delay(450);
  await evaluate('document.getElementById("mzComparisonPlay").click()');
  const paused = await evaluate('document.getElementById("mz-standard-steps").textContent');
  await delay(300);
  assert.equal(await evaluate('document.getElementById("mz-standard-steps").textContent'), paused);
  await evaluate('document.getElementById("mzComparisonNext").click()');
  assert.equal(await evaluate('document.getElementById("mz-modql-episode").textContent'), '2');
  await evaluate('document.getElementById("mzComparisonReset").click()');
  assert.notEqual(await evaluate('document.getElementById("mzSeed").textContent'), '123');
  assert.equal(await evaluate('document.getElementById("mz-modql-episode").textContent'), '1');
  await cdp('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await delay(100);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'mobile has no horizontal overflow');
  await evaluate('document.getElementById("tab-evaluation").click();renderAnalysis()');
  await delay(100);
  assert.equal(await evaluate('document.getElementById("sub-maze").parentNode.id'), '');
  assert.equal(await evaluate('document.querySelectorAll("#sub-evaluation .shared-maze-demo").length'), 0);
  assert.equal(await evaluate('document.querySelectorAll("#sub-evaluation table tbody tr").length > 2'), true);
  assert.ok(await evaluate('!!document.getElementById("comparison-modql-grid")'), 'Laiban route preserved');
  assert.deepEqual(errors, [], 'No page JavaScript exceptions');
  console.log('Browser checks passed: controls, aligned light/dark metrics, mobile layout, Laiban tab and rerender.');
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
