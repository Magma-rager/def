// Packaged interaction, presentation and profiling checks. See docs/PHASE12.md for fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [mode='performance', out='beta-out', url='http://localhost:8128/index.html'] = process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const b = await chromium.launch({args:['--enable-precise-memory-info']});
const context = await b.newContext({viewport:{width:740,height:360},hasTouch:true,deviceScaleFactor:2});
const p = await context.newPage();
const errors=[];
p.on('pageerror', e=>errors.push(e.stack));
const load = async () => {
  await p.goto(url);
  await p.locator('.title-menu').waitFor();
  return p.evaluate(async()=>{
    await document.fonts.ready;
    return { ready:performance.now(), lang:document.documentElement.lang };
  });
};
async function fixture(act,enemies,kind='battle') {
  await p.evaluate(([act,enemies,kind])=>{
    const app=window.__sb;
    app.toTitle();
    app.settings.hints=false;
    app.meta.tutorialDone=true;
    app.startFixtureRun('beta_badge',120212);
    document.querySelector('.dlg-skip')?.click();
    const r=app.run;
    r.d.act=act;
    r.generateMap(act);
    const n=r.d.map.nodes.find(n=>n.type===kind);
    r.d.position=n.id;
    r.d.pending={type:'battle',nodeId:n.id,kind,enemies,introShown:true,
      ...(kind==='boss'?{adaptation:{id:'relay_jam',need:2}}:{})};
    app.route();
    const bs=app.battle;
    for(const e of bs.combat.enemies)e.atb=-1;
    bs.updateHud(true);
  },[act,enemies,kind]);
}
async function performanceSample() {
  const first=await load();
  const warm=[];
  for(let i=0;i<3;i++) warm.push((await load()).ready);
  const cdp=await context.newCDPSession(p);
  await cdp.send('Performance.enable');
  const heap=async()=>{
    await cdp.send('HeapProfiler.collectGarbage');
    return p.evaluate(()=>performance.memory?.usedJSHeapSize??null);
  };
  const simple=['rush_hound','rush_hound'];
  const busy=['vector_winch','bulwark_signal','interference_mite'];
  await fixture(1,simple);
  const startHeap=await heap();
  async function timing(paused) {
    return p.evaluate(async paused=>{
      const app=window.__sb, bs=app.battle, view=bs.view;
      app.paused=paused;
      const draw=view.draw.bind(view);
      const marks=[]; const frames=[];
      let previous=0;
      view.draw=()=>{const t=performance.now();draw();marks.push(performance.now()-t);};
      await new Promise(resolve=>{const start=performance.now();const sample=(now)=>{
        if(previous)frames.push(now-previous);
        previous=now;
        if(now-start>=1800) resolve(); else requestAnimationFrame(sample);
      };requestAnimationFrame(sample);});
      view.draw=draw;
      const percentile=(xs,p)=>xs.length ? xs.sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)] : null;
      return {paused,draws:marks.length,drawMedian:percentile(marks,.5),drawP95:percentile(marks,.95),frameP95:percentile(frames,.95),field:[view.w,view.h]};
    },paused);
  }
  const opening=await timing(false);
  const start=await cdp.send('Performance.getMetrics');
  const frozen=await timing(true);
  const stop=await cdp.send('Performance.getMetrics');
  const cpu=(list)=>list.metrics.find(m=>m.name==='TaskDuration').value;
  await fixture(3,busy);
  const crowded=await timing(false);
  const input=await p.evaluate(()=>{
    const bs=window.__sb.battle;
    const uid=bs.combat.hand.find(u=>u&&bs.combat.check(u).ok);
    const emit=bs.combat.emit.bind(bs.combat);
    const rect=bs.slots.find(s=>s.uid===uid).el.getBoundingClientRect();
    document.addEventListener('pointerdown',()=>{window.inputAt=performance.now();},{once:true,capture:true});
    bs.combat.emit=ev=>{if(ev.type==='execStart'&&window.inputAt)window.inputDelay=performance.now()-window.inputAt;emit(ev);};
    return [rect.x+rect.width/2,rect.y+rect.height/2];
  });
  await p.touchscreen.tap(...input);
  await p.waitForFunction(()=>window.inputDelay!==undefined);
  const inputDelay=await p.evaluate(()=>window.inputDelay);
  const saves=await p.evaluate(()=>{
    const app=window.__sb;
    const a=[];
    for(let i=0;i<20;i++){const t=performance.now();if(!app.save())throw Error('save failed');a.push(performance.now()-t);}
    return a.sort((p,q)=>p-q)[18];
  });
  const remounts=[];
  for(let i=0;i<8;i++){
    const t=performance.now();await fixture(i%2===0?1:3,i%2===0?simple:busy);remounts.push(performance.now()-t);
  }
  const endHeap=await heap();
  const report={first,warm,opening,frozen,crowded,inputDelay,saveP95:saves,remounts,pausedTaskMs:1000*(cpu(stop)-cpu(start)),startHeap,endHeap};
  fs.writeFileSync(`${out}/performance.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
async function defeat() {
  await load();
  const btn=(name)=>p.getByRole('button',{name,exact:true}).first();
  await btn('New Run').tap(); await btn('Begin').tap();
  const wait=await p.evaluate(()=>window.__sb.run.d.seed);
  const clear=async()=>{
    if(await p.locator('.dlg-skip').count()) await p.locator('.dlg-skip').first().tap();
  };
  for(let i=0;i<24;i++){
    await clear();
    if(await p.locator('.map-node').count() && !(await p.locator('.dialog-layer').count())) break;
    await p.waitForTimeout(130);
  }
  await p.locator('.map-node:not([disabled])').first().tap(); await btn('Travel').tap();
  const end=Date.now()+210000;
  while(Date.now()<end && !(await p.locator('.results-body').count())) {
    await clear();
    const lesson=p.locator('.tut-layer:not([hidden]) .btn.primary');
    if(await lesson.count()) {await p.waitForTimeout(500); await lesson.first().tap({timeout:1000}).catch(()=>{});}
    await p.waitForTimeout(400);
  }
  await clear();
  const result=await p.evaluate(()=>window.__sb.meta.runs[0]);
  assert.ok(result?.result==='defeat' && result.seed===wait,'a real defeat was recorded');
  await p.screenshot({path:`${out}/ordinary-defeat.png`});
  const defeats=await p.evaluate(()=>window.__sb.meta.defeats);
  await p.reload(); await p.locator('.title-menu').waitFor();
  assert.equal(await p.evaluate(()=>window.__sb.meta.defeats),defeats);
  assert.equal(await p.evaluate(()=>window.__sb.hasSave()),false);
  await btn('New Run').tap(); await btn('Begin').tap();
  assert.equal(await p.evaluate(()=>window.__sb.run.d.hp),130);
  fs.writeFileSync(`${out}/defeat.json`,JSON.stringify({seed:wait,result,defeats,reloaded:true,nextRun:true},null,2));
  console.log('Ordinary defeat, exactly-once record, reload and new start passed.');
}
async function compact() {
  await p.addInitScript(()=>localStorage.setItem('signalbreak.settings.v1',JSON.stringify({lang:'ru',hints:false,muted:true})));
  await load();
  const cases=[[2,['mirror_array'],'boss'],[3,['vector_winch','bulwark_signal','interference_mite'],'battle']];
  for(const [act,enemies,kind] of cases){
    await fixture(act,enemies,kind);
    await p.evaluate(()=>{
      const app=window.__sb,bs=app.battle;
      app.paused=true;
      const mirror=bs.combat.enemies.find(e=>e.id==='mirror_array');
      if(mirror){
        bs.combat.dealDamage(mirror,Math.ceil(mirror.maxHp*.55),{src:'C',pierce:true});
        bs.consumeEvents(bs.combat.drainEvents());
        for(let i=0;i<20;i++)bs.view.update(1/60);
      }
      const ids=['switchyard','safety_interlock','cross_current'];
      bs.onExCombo(ids.map((id,order)=>({id,order,applied:true,group:1,sum:{dmg:18,guard:5},len:4,heroes:1})));
      bs.updateHud(true);
    });
    await p.waitForTimeout(3100);
    const evidence=await p.evaluate(()=>{
      const bs=window.__sb.battle;
      const field=bs.view.h;
      return {field,chart:bs.view.partyBarRect(),pips:[...bs.view.enemyActors.values()].map(actor=>{
        const [x,y]=bs.view.enemyPos(actor);
        return {x,y,hit:bs.view.hitTest(x,y-8)===actor.uid};
      }),minText:Math.min(...[...document.querySelectorAll('.hand .card-text')].map(n=>parseFloat(getComputedStyle(n).fontSize)))};
    });
    assert.ok(evidence.minText>=12);
    assert.ok(evidence.pips.every(p=>p.hit),'each living enemy is individually targetable');
    await p.screenshot({path:`${out}/compact-${act}.png`});
    console.log(act,JSON.stringify(evidence));
  }
}
async function cardFit() {
  await p.addInitScript(() => localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: 'ru', hints: false, muted: true })));
  await load();
  await fixture(1, ['rush_hound', 'wire_jammer']);
  const cards = ['dead_drop', 'mirror_wire', 'pressure_splice'];
  const installed = await p.evaluate((ids) => {
    const app = window.__sb;
    const bs = app.battle;
    app.paused = true;
    for (const [i, id] of ids.entries()) {
      for (const [j, up] of [false, true].entries()) {
        const pos = i * 2 + j;
        const uid = `fit${pos}`;
        if (bs.combat.hand[pos]) bs.combat.discard.push(bs.combat.hand[pos]);
        bs.combat.cards.set(uid, { uid, id, up });
        bs.combat.hand[pos] = uid;
      }
    }
    bs.updateHud(true);
    return bs.combat.verifyZones().ok;
  }, cards);
  assert.ok(installed);
  await p.waitForTimeout(350);
  const report = await p.locator('.hand .card-frame').evaluateAll((frames) => frames.map((f) => ({
    name: f.querySelector('.card-name').textContent.trim(),
    size: parseFloat(getComputedStyle(f.querySelector('.card-text')).fontSize),
    overflow: f.scrollHeight - f.clientHeight,
  })));
  await p.screenshot({ path: `${out}/card-fit.png` });
  console.log(report);
  assert.equal(report.length, 6);
  assert.ok(report.every((f) => f.size >= 12 && f.overflow <= 2));
}
async function clock() {
  await load();
  await fixture(1,['rush_hound','rush_hound']);
  const sample = await p.evaluate(()=>{
    const app=window.__sb;
    const before=app.battle.combat.t;
    app.loop(app.last-750); // Controlled stale rAF timestamp after a scene transition.
    return {before,after:app.battle.combat.t,viewTime:app.battle.view.time};
  });
  assert.equal(sample.before,sample.after);
  assert.ok(sample.viewTime>=0);
  console.log(sample);
}
async function audioControls() {
  await load();
  const btn=(name)=>p.getByRole('button',{name,exact:true}).first();
  await btn('Settings').tap();
  await p.waitForFunction(()=>window.__sb.audio.ctx?.state==='running');
  const mute=p.locator('#set-muted');
  await mute.check();
  await p.waitForFunction(()=>window.__sb.audio.master.gain.value<.001);
  const step=await p.evaluate(()=>window.__sb.audio.step);
  await p.waitForTimeout(470);
  assert.equal(await p.evaluate(()=>window.__sb.audio.step),step,'muted score creates no new scheduled steps');
  await mute.uncheck();
  await p.waitForFunction(s=>window.__sb.audio.step>s,step);
  await btn('Done').tap();
  await p.evaluate(()=>window.__sb.audio.ctx.suspend()); // Simulated audio interruption.
  await p.waitForFunction(()=>window.__sb.audio.ctx.state==='suspended');
  await btn('Settings').tap(); // Gesture must restore audio.
  await p.waitForFunction(()=>window.__sb.audio.ctx.state==='running');
  await btn('Done').tap();
  await fixture(3,['signalbreak_core'],'boss');
  await p.locator('.pause-btn').tap();
  await p.waitForFunction(()=>window.__sb.paused&&window.__sb.audio.duck===.35);
  const time=await p.evaluate(()=>window.__sb.battle.combat.t);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>window.__sb.battle.combat.t),time);
  await btn('Resume').tap();
  await p.waitForFunction(t=>!window.__sb.paused&&window.__sb.battle.combat.t>t&&window.__sb.audio.duck===1,time);
  const status=await p.evaluate(()=>({state:window.__sb.audio.ctx.state,track:window.__sb.audio.track,duck:window.__sb.audio.duck}));
  console.log(status);
  fs.writeFileSync(`${out}/audio-controls.json`,JSON.stringify(status,null,2)+'\n');
}
try {
  if(mode==='performance') await performanceSample();
  else if(mode==='defeat') await defeat();
  else if(mode==='compact') await compact();
  else if(mode==='card-fit') await cardFit();
  else if(mode==='clock') await clock();
  else if(mode==='audio') await audioControls();
  else throw Error('Expected performance, compact, card-fit, clock, audio or defeat');
  assert.deepEqual(errors,[]);
} finally { await b.close(); }
