/* Run with node --test tests/maze-demo.test.js. No packages or public debug API. */
var test = require('node:test'), assert = require('node:assert/strict');
var fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'maze-demo.js'), 'utf8');
var core = fs.readFileSync(path.join(root, 'maze-routing.js'), 'utf8');
var engine = fs.readFileSync(path.join(root, 'engine.js'), 'utf8');
var helpers = engine.match(/^function jain\(v\).*$/m)[0] + '\n' +
  engine.match(/^function demandBucket[\s\S]*?^}/m)[0] + '\n' +
  engine.match(/^function historyBucket[\s\S]*?^}/m)[0];
function harness(seed) {
  var nodes = {}, intervals = new Map(), timeouts = [], sequence = 0;
  var ctx = vm.createContext({
    document: {getElementById: function (id) {
      if (/-canvas$/.test(id)) return null;
      return nodes[id] || (nodes[id] = {value:'20',setAttribute:function () {}});
    }, addEventListener:function () {}},
    Date:Date,
    setInterval:function (fn, ms) { intervals.set(++sequence, {fn:fn, ms:ms}); return sequence; },
    clearInterval:function (id) { intervals.delete(id); },
    setTimeout:function (fn) { timeouts.push(fn); }
  });
  var exposed = source.replace("  document.addEventListener('DOMContentLoaded', buildUI);", [
    '  globalThis.demo={reset:resetComparison, step:stepBoth, start:startTimer, stop:stopTimer, speed:changeSpeed,',
    '    trainAsync:trainPolicies, allDone:allDone, world:function(){return env}, runs:function(){return runs},',
    '    models:function(){return models}, factory:makeWorld, modelFactory:newModels, rng:makeRng,',
    '    unit:setTravelUnit, formatSelected:formatTravelTime, paint:paintOriginalMaze, formatTravel:travelHours, motionPoint:motionPoint, select:selectSop, explain:metricExplanation, assess:assessPerformance, pair:function(){return pair}, train:function(n){ models=newModels(seed);',
    '      for(var i=0;i<n;i++)MazeRouting.trainEpisode(makeWorld(seed),models);startEpisode();}};'
  ].join('\n'));
  vm.runInContext(helpers + '\n' + core + '\n' + exposed, ctx);
  ctx.demo.reset(seed);
  return {demo:ctx.demo, api:ctx.MazeRouting, nodes:nodes, intervals:intervals, timeouts:timeouts, context:ctx};
}
function weights(models) {
  return JSON.stringify(['standard','modql'].map(function (id) {
    var m=models[id]; return {q:Array.from(m.q),q1:Array.from(m.q1),q2:Array.from(m.q2),samples:Array.from(m.samples),updates:m.updates,epsilon:m.epsilon};
  }));
}
function runToEnd(demo) { for(var i=0;i<110&&!demo.allDone();i++)demo.step(); assert.ok(demo.allDone()); }
function metrics(demo) { return JSON.stringify({maze:demo.world().maze,runs:demo.runs()}); }

test('same seeded configuration and equal training budgets reproduce learned evaluation', function () {
  var a=harness(123).demo,b=harness(123).demo,c=harness(124).demo;
  assert.notEqual(JSON.stringify(a.world().sites),JSON.stringify(c.world().sites));
  a.train(30);b.train(30);
  assert.equal(a.models().standard.episodes,30); assert.equal(a.models().modql.episodes,30);
  assert.equal(weights(a.models()),weights(b.models()));
  runToEnd(a);runToEnd(b);assert.equal(metrics(a),metrics(b));
  var before=metrics(a);a.reset();runToEnd(a);assert.equal(metrics(a),before);
});

test('evaluation never explores, inserts Q rows, trains, or deletes models on reset', function () {
  var h=harness(55),d=h.demo;d.train(25);
  var model=d.models(),before=weights(model),initial=JSON.stringify(d.world().maze);
  ['standard','modql'].forEach(function(id){
    model[id].rng=function(){throw new Error('evaluation drew training randomness')};
  });
  runToEnd(d); assert.equal(weights(model),before);
  d.reset(); assert.equal(d.models(),model);assert.equal(JSON.stringify(d.world().maze),initial);
  assert.equal(d.runs().standard.steps,0);assert.equal(d.runs().modql.reward,0);
  assert.equal(weights(model),before);
});

test('single shared frame and movement constraints; common metrics match completed services', function () {
  var h=harness(987),d=h.demo;d.train(10);
  var world=d.world(),repairs=0,updates=0,order=[];
  var repair=world.ensurePathExists,update=world.updateEnvironment,step=world.step;
  world.ensurePathExists=function(){repairs++;return repair.call(this)};
  world.updateEnvironment=function(){updates++;return update.call(this)};
  world.step=function(id,action){
    order.push(id);
    var before=JSON.stringify(this.maze),p=this.currentPos[id].slice(),result=step.call(this,id,action);
    assert.equal(JSON.stringify(this.maze),before);
    assert.ok(this.isOpen(result.state));
    assert.equal(Math.abs(p[0]-result.state[0])+Math.abs(p[1]-result.state[1]),1);
    return result;
  };
  while(!d.allDone()){
    order=[];d.step();
    assert.equal(repairs,world.steps);assert.equal(updates,Math.floor(world.steps/20));
    if(order.length===2)assert.deepEqual(order,['standard','modql']);
    ['standard','modql'].forEach(function(id){
      var r=d.runs()[id];
      var expected=world.sites.reduce(function(sum,s){return sum+(r.served[s.id]?s.demand:0)},0);
      assert.equal(r.learners,expected);
      assert.equal(r.fairness,vm.runInContext('jain',h.context)(r.service));
      assert.equal(r.history.length,r.steps+1);
      assert.ok(r.remaining>=0);assert.ok(r.steps<=100);
      assert.equal(r.serviceMinutes,Object.keys(r.served).length*h.api.serviceMinutes);
      assert.ok(Math.abs(r.remaining-(120-r.minutes-r.serviceMinutes))<1e-9);
    });
    assert.ok(world.steps<=105);
  }
  ['standard','modql'].forEach(function(id){
    var r=d.runs()[id];
    assert.equal(r.deferred.length,6-Object.keys(r.served).length);
    assert.ok(r.done);assert.ok(r.decisions.length>0);
    assert.ok(r.decisions.every(function(x){return Number.isFinite(x.realizedReturn)}));
  });
  assert.notEqual(d.runs().standard.history,d.runs().modql.history);
});

test('destination selection is Q-based, not shortest-path or reward-ranking animation', function () {
  var h=harness(4),api=h.api,d=h.demo,w=d.world(),m=d.modelFactory(4);
  var pair=new api.Pair(w,m,false),r=pair.runs.standard;
  var options=api.choices(w,r,w.currentPos.standard);
  assert.ok(options.length>1);
  var selected=options[options.length-1].index,sk=api.state(w,r,w.currentPos.standard,'standard');
  var q=[0,0,0,0,0,0];q[selected]=123;m.standard.q.set(sk,q);
  var samples=[0,0,0,0,0,0];samples[selected]=1;m.standard.samples.set(sk,samples);
  pair.step();
  assert.equal(r.action.split(' ')[0],w.sites[selected].id);
  assert.equal(r.q,123);assert.equal(r.known,true);
  var unseen=new api.Model('standard',function(){throw new Error('unseen eval must be deterministic')});
  assert.equal(unseen.choose('unknown',options,false),options[0].index);
  assert.equal(unseen.q.size,0);
});

test('Double Q selects with one estimator and evaluates with the other; terminal has zero bootstrap', function () {
  var api=harness(1).api;
  [0.25,0.75].forEach(function(coin){
    var m=new api.Model('modql',function(){return coin});
    var select=coin<0.5?m.q1:m.q2,evaluate=coin<0.5?m.q2:m.q1;
    select.set('next',[0,9,0,0,0,0]);evaluate.set('next',[100,2,100,100,100,100]);
    m.learn('s',0,1,'next',[{index:0},{index:1},{index:2}]);
    assert.ok(Math.abs(select.get('s')[0]-0.28)<1e-12);
    assert.equal(evaluate.has('s'),false);
    m.learn('terminal',0,1,'next',[]);assert.equal(select.get('terminal')[0],0.1);
    m.learn('failed',0,0,'next',[]);assert.equal(select.get('failed')[0],0);
    assert.equal(m.known('failed',0),true,'zero-valued learned failures still have training provenance');
    assert.ok(Number.isFinite(m.spread()));
  });
});

test('service reward mirrors research normalization and bounded efficiency; Standard remains inverse time', function () {
  var h=harness(71),d=h.demo;d.train(8);
  var last={standard:0,modql:0};
  while(!d.allDone()){
    d.step();
    ['standard','modql'].forEach(function(id){
      var r=d.runs()[id];
      if(Object.keys(r.served).length===last[id])return;
      last[id]=Object.keys(r.served).length;
      var latest=r.decisions[r.decisions.length-1];
      var target=d.world().sites.find(function(s){return s.id===r.location});
      var max=Math.max.apply(null,d.world().sites.map(function(s){return s.demand}));
      assert.equal(r.demand,target.demand/max);
      var expected=id==='standard'?60/(60*(1/r.travelTerm-1)):r.demand*r.fairness*r.travelTerm;
      assert.ok(Math.abs(latest.reward-expected)<1e-9);
    });
  }
  assert.ok(last.standard>0&&last.modql>0);
});

test('SOP3 uses live remaining time and localized D/H/A; Standard uses location only', function () {
  var h=harness(44),d=h.demo,w=d.world(),r=d.runs().modql,pos=w.currentPos.modql;
  var standard=h.api.state(w,r,pos,'standard'),rich=h.api.state(w,r,pos,'modql');
  r.remaining=10;assert.notEqual(h.api.state(w,r,pos,'modql'),rich);
  rich=h.api.state(w,r,pos,'modql');r.historyDays[0]=r.historyDays[0]>14?0:30;
  assert.notEqual(h.api.state(w,r,pos,'modql'),rich);
  rich=h.api.state(w,r,pos,'modql');r.served[w.sites[0].id]=true;
  assert.notEqual(h.api.state(w,r,pos,'modql'),rich);
  assert.equal(h.api.state(w,r,pos,'standard'),standard);
});

test('completed estimate-return gaps use actual discounted rewards and exclude unseen decisions', function () {
  var h=harness(8),d=h.demo,r=d.runs().modql;
  r.decisions=[{reward:1,estimate:5,known:true},{reward:2,estimate:0,known:false},{reward:3,estimate:4,known:true}];
  d.pair().finish('modql','Goal reached',true);
  assert.ok(Math.abs(r.decisions[0].realizedReturn-(1+0.9*2+0.81*3))<1e-12);
  assert.ok(Math.abs(r.returnError-((5-5.23)+(4-3))/2)<1e-12);
});

test('shared pause/resume/speed cannot duplicate timers; earlier terminal agent stops', function () {
  var h=harness(13),d=h.demo;
  d.start();assert.equal(h.intervals.size,0,'untrained playback disabled');
  d.train(5);d.start();d.start();assert.equal(h.intervals.size,1);
  assert.equal(Array.from(h.intervals.values())[0].ms,200);
  d.speed(50);assert.equal(h.intervals.size,1);assert.equal(Array.from(h.intervals.values())[0].ms,50);
  Array.from(h.intervals.values())[0].fn();
  d.stop();assert.equal(h.intervals.size,0);
  var r=d.runs().standard;r.remaining=0;
  d.step();assert.equal(r.done,true);
  var count=r.steps;
  runToEnd(d);assert.equal(r.steps,count);
  assert.equal(h.intervals.size,0);
});

test('asynchronous training cancellation cannot overwrite a new scenario', function () {
  var h=harness(12),d=h.demo;
  d.trainAsync();assert.equal(h.timeouts.length,1);
  d.reset(13);h.timeouts.shift()();
  assert.equal(d.models(),null);assert.equal(h.nodes.mzSeed.textContent,13);
  d.train(5);var existing=d.models(),before=weights(existing);
  d.trainAsync();d.reset();h.timeouts.shift()();
  assert.equal(d.models(),existing);assert.equal(weights(existing),before,'cancelled retraining preserves existing weights');
});

test('original baseline source retains original environment, replay learning and controls', function () {
  var original=require('node:child_process').execFileSync('git',['show','7d63c82:maze-demo.js'],{cwd:root,encoding:'utf8'});
  original=original.replace(/sub-maze/g,'sub-maze-legacy').replace(/data-sub="maze"/g,'data-sub="maze-legacy"');
  var restored=fs.readFileSync(path.join(root,'maze-legacy.js'),'utf8');
  assert.equal(restored.replace(/\r\n/g,'\n').trimEnd(),original.replace(/\r\n/g,'\n').trimEnd());
});

test('performance assessment requires five-metric dominance and reports trade-offs without reward/step ranking', function () {
  var assess=harness(8).demo.assess;
  function record(learners,fairness,minutes,count){
    var served={};for(var i=0;i<count;i++)served[i]=true;
    return {learners:learners,fairness:fairness,minutes:minutes,served:served,deferred:Array(6-count).fill({reason:'budget'}),done:true,success:true,reward:0,steps:50};
  }
  var standard=record(60,0.6,70,3),modql=record(80,0.8,60,4);
  var before=JSON.stringify([standard,modql]);
  assert.equal(assess(standard,modql,6,true).kind,'modql');
  assert.equal(assess(modql,standard,6,true).kind,'standard');
  assert.equal(JSON.stringify([standard,modql]),before,'assessment is read-only');
  modql.minutes=90;
  var mixed=assess(standard,modql,6,true);
  assert.equal(mixed.kind,'mixed');assert.match(mixed.reason,/travel time/);assert.match(mixed.reason,/learner coverage/);
  var tied=record(60,0.6,70,3);tied.reward=99999;tied.steps=1;
  assert.equal(assess(standard,tied,6,true).kind,'insufficient','raw rewards and steps cannot create a winner');
  assert.equal(assess(standard,modql,6,false).kind,'insufficient');
  modql.done=false;assert.equal(assess(standard,modql,6,true).kind,'insufficient');
  modql.done=true;modql.success=false;assert.equal(assess(standard,modql,6,true).kind,'insufficient');
  modql.success=true;modql.fairness=NaN;assert.equal(assess(standard,modql,6,true).kind,'insufficient');
  assert.equal(assess(null,null,6,true).kind,'insufficient');
});

test('one centralized SOP selection keeps both panels synchronized without changing rollout or models', function () {
  var h=harness(123),d=h.demo;d.train(3);d.step();
  var before=metrics(d),tables=weights(d.models());
  [1,2,2,3,1].forEach(function(number){
    d.select(number);
    ['standard','modql'].forEach(function(id){
      [1,2,3].forEach(function(n){assert.equal(h.nodes['mz-'+id+'-sop'+n].hidden,n!==number)});
    });
    assert.equal(metrics(d),before);assert.equal(weights(d.models()),tables);
  });
});

test('optional explanations use live coverage, visits, budget and estimator records', function () {
  var h=harness(123),d=h.demo;d.train(12);runToEnd(d);
  var before=metrics(d),tables=weights(d.models());
  ['standard','modql'].forEach(function(id){
    var r=d.runs()[id],world=d.world();
    assert.ok(d.explain(id,'coverage').includes(r.learners+' ÷ '+world.totalLearners));
    assert.ok(d.explain(id,'fairness').includes(r.service.join(', ')));
    assert.ok(d.explain(id,'fairness').includes(r.fairness.toFixed(4)));
    assert.ok(d.explain(id,'remaining').includes(r.remaining.toFixed(1)+' minutes left'));
    if(id==='standard')assert.match(d.explain(id,'q1'),/Not applicable/);
    if(r.serviceMinutes)assert.ok(d.explain(id,'demand').includes(r.demand.toFixed(4)));
    ['coverage','fairness','minutes','destinations','deferred','combined','reward','travel','demand','q','q1','q2','difference','spread','returnError','update','known','location','remaining','rawDemand','history','access'].forEach(function(name){
      assert.doesNotMatch(d.explain(id,name),/undefined|NaN/);
    });
  });
  assert.equal(metrics(d),before);assert.equal(weights(d.models()),tables,'explanations are read-only');
});

test('travel hour formatting and Canvas interpolation are presentation-only', function () {
  var d=harness(123).demo;
  [[55,'0.92 hr'],[50,'0.83 hr'],[60,'1.00 hr'],[67,'1.12 hr'],[70,'1.17 hr']].forEach(function(pair){assert.equal(d.formatTravel(pair[0]),pair[1])});
  var before=metrics(d),m={from:[1,2],target:[1,3],start:0,duration:200};
  var halfway=d.motionPoint(m,100);
  assert.equal(halfway.pos[0],1);assert.equal(halfway.pos[1],2.5);assert.equal(halfway.moving,true);
  assert.equal(d.motionPoint(m,300).pos[1],3);assert.equal(d.motionPoint(m,300).moving,false);
  assert.equal(metrics(d),before);
});

test('unit switching updates presentation and explanations without changing data or learned tables',function(){
  var h=harness(123),d=h.demo;d.train(3);runToEnd(d);
  var before=metrics(d),tables=weights(d.models()),r=d.runs().standard;
  d.unit('minutes');assert.equal(d.formatSelected(59),'59 min');assert.equal(d.formatSelected(59.5),'59.5 min');
  assert.equal(h.nodes['mz-standard-minutes'].textContent,d.formatSelected(r.minutes));
  assert.ok(d.explain('standard','minutes').includes(d.formatSelected(r.minutes)));
  d.unit('hours');assert.equal(d.formatSelected(59),'0.98 hr');
  assert.ok(d.explain('standard','minutes').includes(d.formatSelected(r.minutes)));
  assert.equal(metrics(d),before);assert.equal(weights(d.models()),tables);
});

test('shared maze painter reproduces the original baseline Canvas paint operations',function(){
  var h=harness(2),world=h.demo.world(),trail=[[1,1],[1,2],[1,1],[2,1]];
  var colors={wall:'#7d6e4a',cell:'#273229',grid:'rgba(255,255,255,.07)',trail:'rgba(217,139,78,.22)',goal:'#3fae7a',agent:'#d98b4e'};
  function recording(){
    var ops=[],arc=null;
    return {ops:ops,clearRect:function(){ops.push(['clear'].concat(Array.from(arguments)))},fillRect:function(){ops.push(['cell',this.fillStyle].concat(Array.from(arguments)))},strokeRect:function(){ops.push(['grid',this.strokeStyle,this.lineWidth].concat(Array.from(arguments)))},beginPath:function(){arc=null},arc:function(){arc=Array.from(arguments)},fill:function(){ops.push(['circle',this.fillStyle].concat(arc))}};
  }
  var adapted=recording(),original=recording();
  h.demo.paint(adapted,100,100,world.maze,trail,world.goalPos,trail[3],colors);
  var names={'--maze-wall':'wall','--maze-cell':'cell','--maze-grid':'grid','--maze-trail':'trail','--maze-goal':'goal','--maze-agent':'agent'};
  var canvas={width:100,height:100,getBoundingClientRect:function(){return {width:100,height:100}},getContext:function(){return original}};
  var context=vm.createContext({window:{devicePixelRatio:1},document:{body:{},getElementById:function(){return canvas},addEventListener:function(){}},getComputedStyle:function(){return {getPropertyValue:function(name){return colors[names[name]]||''}}}});
  var legacy=fs.readFileSync(path.join(root,'maze-legacy.js'),'utf8').replace("document.addEventListener('DOMContentLoaded',()=>{buildUI();wireTab();});","globalThis.originalPaint=function(world,trail){env=world;history=trail;draw();};");
  vm.runInContext(legacy,context);
  context.originalPaint({maze:world.maze,goalPos:world.goalPos,currentPos:trail[3]},trail);
  assert.equal(JSON.stringify(adapted.ops),JSON.stringify(original.ops),'Same grid cells, lines, repeated history dots, circle sizes, colors, and paint order');
});

test('comparison markers and dots render actual scenario data without mutating it',function(){
  var h=harness(123),world=h.demo.world(),start=world.currentPos.standard.slice();
  var trail=[start,start,start],served={};served[world.sites[0].id]=true;
  var before=JSON.stringify({world:world,trail:trail,served:served});
  var labels=[],circles=[],squares=[];
  var ctx={globalAlpha:1,clearRect:function(){},fillRect:function(){},
    strokeRect:function(x,y,w,height){if(w===4.4)squares.push([x,y,w,height]);},
    beginPath:function(){},arc:function(x,y,r){circles.push({x:x,y:y,r:r,alpha:this.globalAlpha});},
    fill:function(){},stroke:function(){},fillText:function(text,x,y){labels.push([text,x,y]);}};
  h.demo.paint(ctx,100,100,world.maze,trail,world.goalPos,start,
    {wall:'tan',cell:'green',grid:'gray',trail:'amber',goal:'mint',agent:'amber',text:'white',served:'green'},
    {start:start,sites:world.sites,served:served});
  assert.equal(squares.length,1,'One small start square');
  world.sites.forEach(function(site){assert.ok(labels.some(function(label){return label[0]===site.id&&label[1]===(site.pos[1]+0.5)*10&&label[2]===(site.pos[0]+0.5)*10;}));});
  assert.ok(labels.some(function(label){return label[0]==='G'&&label[1]===(world.goalPos[1]+0.5)*10;}));
  assert.equal(circles.filter(function(circle){return circle.alpha===0.55;}).length,1,'Repeated visited cells retain one separated history dot');
  assert.equal(JSON.stringify({world:world,trail:trail,served:served}),before,'Rendering cannot change environment, route or service results');
});
