// Phase 10 visual checks with explicit fixtures. Ordinary campaigns use tools/accept8.mjs campaign.
// node tools/presentation.mjs gallery|layout|motion|roster|audio|access OUTPUT   (npm run serve)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { CARD_LIST } from '../src/data/cards.js';
import { ENEMIES } from '../src/data/enemies.js';
import { RECIPES } from '../src/data/recipes.js';
import { EX_CUES, ENEMY_CUES, CARD_CUES } from '../src/render/choreography.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const [mode = 'layout', out = 'presentation-out'] = process.argv.slice(2);
const url = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const sizes = ['667x375','740x360','732x510','844x390','932x430','1024x768','1194x834','1366x1024'];

async function pageAt(lang, size, options = {}) {
  const [width,height] = size.split('x').map(Number);
  const p = await browser.newPage({ viewport: { width,height }, hasTouch: true, ...options });
  p.on('pageerror', (e) => errors.push(e.stack));
  await p.addInitScript((lang) => {
    if (!localStorage.getItem('signalbreak.settings.v1')) localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang,hints:false }));
  },lang);
  await p.goto(url);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(() => document.fonts.ready);
  return p;
}
async function fixture(p, act, enemies, kind = 'boss') {
  await p.evaluate(([act,enemies,kind]) => {
    const a = window.__sb;
    a.closeAllModals();
    a.meta.tutorialDone = true;
    a.startFixtureRun('beta_badge', 73);
    document.querySelector('.dlg-skip')?.click();
    const r = a.run;
    r.d.act = act;
    r.generateMap(act);
    const n = r.d.map.nodes.find((x) => x.type === kind);
    r.d.position = n.id;
    r.d.pending = { type:'battle',nodeId:n.id,kind,enemies,introShown:true,
      ...(kind === 'boss' ? { adaptation:{id:'relay_jam',need:2} } : {}) };
    a.route();
    const bs = a.battle;
    for (const e of bs.combat.enemies) e.atb = -.9;
    a.paused = true;
    bs.updateHud(true);
  },[act,enemies,kind]);
}
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

// This uses the Phase 9 battle and EX API as well, so SB_URL can point to the baseline checkout.
async function gallery() {
  for (const [lang,size] of [['ru','667x375'],['en','1194x834']]) {
    const p = await pageAt(lang,size);
    await shot(p,`${lang}-title`);
    for (const [act,enemies] of [[1,['rush_hound','wire_jammer']],[2,['mirror_array']],[3,['signalbreak_core']]]) {
      await fixture(p,act,enemies,act === 1 ? 'battle' : 'boss');
      await p.waitForTimeout(500);
      await shot(p,`${lang}-act${act}`);
      if (act !== 2) continue;
      await p.evaluate(() => window.__sb.battle.onExCombo(['straight_circuit','cross_current','healing_cadence'].map((id,order)=>({
        id,order,applied:true,group:1,sum:{dmg:18,guard:5,momentum:2,heal:4},len:4,heroes:1,
      }))));
      await p.waitForTimeout(250);
      await shot(p,`${lang}-overlap`);
    }
    await p.close();
  }
}

async function captureLayout() {
  const result = [];
  for (const lang of ['en','ru']) {
    for (const size of sizes) {
      const p = await pageAt(lang,size);
      await fixture(p,2,['mirror_array']);
      const record = await p.evaluate(async (ids) => {
        const bs = window.__sb.battle;
        const c = bs.combat;
        const issues = [];
        const minimum = { text:Infinity, name:Infinity, reason:Infinity };
        for (const up of [false,true]) for (let i=0;i<ids.length;i+=6) {
          c.hand = Array(6).fill(null);
          ids.slice(i,i+6).forEach((id,k) => {
            const uid = `read-${id}-${up}`;
            c.cards.set(uid,{uid,id,up,...(up ? {graft:'anchored'} : {})});
            c.hand[k]=uid;
          });
          bs.updateHud(true);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          for (const el of bs.slots.map((s) => s.el).filter(Boolean)) {
            const frame = el.querySelector('.card-frame').getBoundingClientRect();
            for (const [key, selector] of [['text','.card-text'],['name','.card-name'],['reason','.reason']]) {
              const n = el.querySelector(selector);
              if (!n.innerText || !n.getClientRects().length) continue;
              const range = document.createRange();
              const visible = key === 'name' ? n : [...n.children].find((e) => getComputedStyle(e).display !== 'none');
              range.selectNodeContents(visible || n);
              const rect = range.getBoundingClientRect();
              const box = n.getBoundingClientRect();
              const px = parseFloat(getComputedStyle(n).fontSize);
              minimum[key] = Math.min(minimum[key],px);
              if (rect.bottom > frame.bottom + 1.5 || rect.right > frame.right + 1.5 ||
                (getComputedStyle(n).overflow === 'hidden' && rect.bottom > box.bottom+2)) {
                issues.push({ key, card:el.dataset.uid, text:n.innerText.trim(), extra:Math.round(Math.max(rect.bottom-frame.bottom,rect.right-frame.right,rect.bottom-box.bottom)) });
              }
            }
          }
        }
        if (document.documentElement.classList.contains('compact')) {
          c.relics.add('spare_pockets');
          c.mutations.add('deep_pockets');
          for (let i=0;i<ids.length;i+=4) {
            c.reserve = ids.slice(i,i+4).map((id) => {
              const uid = `reserve-${id}`;
              c.cards.set(uid,{uid,id,up:false});
              return uid;
            });
            bs.updateHud(true);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            for (const [uid, el] of bs.resEls) {
              const name = el.querySelector('.rn');
              const range = document.createRange();
              range.selectNodeContents(name);
              const text = range.getBoundingClientRect();
              const frame = el.getBoundingClientRect();
              if (text.bottom > frame.bottom + 1 || text.top < frame.top - 1 || text.right > frame.right + 1) {
                issues.push({ key:'reserve', card:uid, text:name.textContent,
                  extra:Math.round(Math.max(text.bottom-frame.bottom,text.right-frame.right,frame.top-text.top)) });
              }
            }
          }
        }
        bs.onExCombo(['straight_circuit','cross_current','healing_cadence'].map((id,order)=>({
          id,order,applied:true,group:1,sum:{dmg:18,guard:5,momentum:2,heal:4,flow:1.5,churn:1,echo:true},len:4,heroes:1,
        })));
        const bounds = (q) => document.querySelector(q).getBoundingClientRect();
        const adapt = bounds('.adapt-panel'), ex = bounds('.tone-ex'), health = bs.view.partyBarRect();
        const summary = document.querySelector('.ex-rail .banner-sub:not(.banner-new)');
        const summaryFits = summary.scrollWidth <= summary.clientWidth + 1;
        const aboveTray = adapt.bottom <= ex.top && health.y+health.h <= adapt.top;
        const noCover = [...document.querySelectorAll('.controls button,.hand,.pause-btn')].every((n) => {
          const r=n.getBoundingClientRect();
          return r.top >= ex.bottom-.75 || r.bottom <= ex.top+.75;
        });
        return { minimum, issues, aboveTray, noCover, summaryFits, field:document.querySelector('.field').clientHeight };
      },CARD_LIST.filter((d) => d.p4 !== 'withheld').map((d) => d.id));
      console.log(lang,size,JSON.stringify({ ...record, issues:record.issues.length }));
      if (record.issues.length) console.log('clipping',JSON.stringify(record.issues));
      if (size === '667x375' || size === '1194x834') await shot(p,`layout-${size}-${lang}`);
      await p.close();
      result.push({ lang,size,...record });
    }
  }
  fs.writeFileSync(`${out}/layout.json`,JSON.stringify(result,null,2)+'\n');
  assert.ok(result.every((r)=>r.aboveTray && r.noCover && r.summaryFits && r.minimum.text >= 12 && r.minimum.reason >= 12),'readable text and geometrically separate combat regions');
  assert.ok(result.every((r)=>!r.issues.length),'all tested card text is visible');
}

async function motion() {
  const p = await pageAt('en','1024x768');
  const cases = [
    ['V','fortress_slam','clockwork_regent'],['V','sunderline','scrap_tyrant'],
    ['C','pressure_valve','protocol_auditor'],['C','suit_storm','mirror_array'],
    ['S','bolt_volley','the_corruptor'],['S','grand_relay','signalbreak_core'],
  ];
  const trace = [];
  for (const [hero,card,boss] of cases) {
    await fixture(p,ENEMIES[boss].act,[boss]);
    await p.evaluate(([hero,card]) => {
      const bs = window.__sb.battle, c = bs.combat;
      c.hand = ['motion-basic','motion-arte',null,null,null,null];
      c.cards.set('motion-basic',{ uid:'motion-basic',id:'scrapline',variant:'A' });
      c.cards.set('motion-arte',{ uid:'motion-arte',id:card,variant:'B' });
      c.draw = []; c.reserve = []; c.discard = [];
      c.enemies[0].hp = c.enemies[0].maxHp;
      c.selectHero(hero);
      c.momentum = 10;
      const frame = () => { bs.view.update(1/60); c.update(1/60); bs.consumeEvents(c.drainEvents()); bs.updateHud(true); };
      if (!c.commit('motion-basic').ok) throw Error('Opening basic refused');
      for (let i=0;i<44;i++) frame();
      bs.view.fx.length=0; bs.view.numbers.length=0;
      window.motion = { frame, events:[] };
      const original = c.emit.bind(c);
      c.emit = (ev) => { original(ev); if (['act','execResolve','hit','execEnd'].includes(ev.type)) window.motion.events.push(ev); };
      if (!c.commit('motion-arte').ok) throw Error('Arte refused: '+c.check('motion-arte').text);
      bs.consumeEvents(c.drainEvents()); bs.updateHud(true);
    },[hero,card]);
    for (let i=0;i<=8;i++) {
      if(i) await p.evaluate(()=>{for(let n=0;n<5;n++) window.motion.frame();});
      await shot(p,`${card}-${i.toString().padStart(2,'0')}`);
    }
    trace.push({card,boss,events:await p.evaluate(()=>window.motion.events)});
  }
  await p.close();
  fs.writeFileSync(`${out}/motion.json`,JSON.stringify(trace,null,2)+'\n');
  assert.ok(trace.every((r)=>r.events.some((e)=>e.type==='execResolve') && r.events.some((e)=>e.type==='hit')));
}

async function roster() {
  const p = await pageAt('en','932x430');
  const evidence = [];
  for (const [id, def] of Object.entries(ENEMIES)) {
    await fixture(p,def.act,[id],def.tier==='boss'?'boss':'battle');
    const result = await p.evaluate(() => {
      const bs = window.__sb.battle, c=bs.combat;
      const e=c.enemies[0];
      e.atb=.9;
      bs.view.update(1/60);
      return { name:e.id,intent:e.intent.key,phase:e.phase };
    });
    await shot(p,`${id}-windup`);
    await p.evaluate(() => {
      const bs=window.__sb.battle,c=bs.combat;
      c.enemyAct(c.enemies[0]);
      bs.consumeEvents(c.drainEvents());
      for(let i=0;i<5;i++) bs.view.update(1/60);
      bs.updateHud(true);
    });
    await shot(p,`${id}-contact`);
    if (def.tier==='boss') {
      const phase = await p.evaluate(() => {
        const bs=window.__sb.battle,c=bs.combat,e=c.enemies[0];
        e.guard=0; c.dealDamage(e,Math.round(e.maxHp*.65),{src:'C',pierce:true});
        bs.consumeEvents(c.drainEvents()); bs.updateHud(true);
        return e.phase;
      });
      result.phase=phase;
      await shot(p,`${id}-phase`);
    }
    evidence.push(result);
  }
  await fixture(p,3,['signalbreak_core']);
  for (const r of RECIPES) {
    await p.evaluate((id) => {
      const bs=window.__sb.battle;
      bs.view.fx.length=0;
      const ev={type:'exCombo',id,hero:'C',order:0,group:1,len:6,heroes:3,sum:{},applied:true};
      bs.consumeEvents([ev]);
      bs.view.update(.06);
    },r.id);
    await shot(p,`ex-${r.id}`);
  }
  fs.writeFileSync(`${out}/roster.json`,JSON.stringify(evidence,null,2)+'\n');
  await p.close();
}

function wave(samples, rate) {
  const dst=Buffer.alloc(44+2*samples.length);
  dst.write('RIFF'); dst.writeUInt32LE(dst.length-8,4); dst.write('WAVEfmt ',8);
  dst.writeUInt32LE(16,16); dst.writeUInt16LE(1,20); dst.writeUInt16LE(1,22);
  dst.writeUInt32LE(rate,24); dst.writeUInt32LE(2*rate,28); dst.writeUInt16LE(2,32);
  dst.writeUInt16LE(16,34); dst.write('data',36); dst.writeUInt32LE(dst.length-44,40);
  for(let i=0;i<samples.length;i++) dst.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return dst;
}
async function audio() {
  const p=await pageAt('en','844x390');
  await p.locator('.title-menu .btn').first().focus();
  await p.keyboard.press('Space'); // real gesture starts Web Audio
  await p.waitForFunction(()=>window.__sb.audio.ctx?.state==='running');
  const output=await p.evaluate(async ({ cards,enemies,recipes }) => {
    const { AudioEngine,scoreFor }=await import('/src/audio/audio.js');
    const clips=[];
    const rate=24000;
    const add=async(name,play,muted=false)=>{
      const c=new OfflineAudioContext(1,rate*2,rate);
      const a=new AudioEngine({master:.8,music:.55,sfx:.75,muted});
      a.connect(c); play(a);
      const sample=(await c.startRendering()).getChannelData(0);
      let peak=0, sq=0, shortSq=0, maxShort=0, clipped=0;
      const window=rate*.05;
      for(let i=0;i<sample.length;i++){
        const v=sample[i];
        peak=Math.max(peak,Math.abs(v)); sq+=v*v; shortSq+=v*v;
        if(Math.abs(v)>=.999)clipped++;
        if(i%window===window-1){maxShort=Math.max(maxShort,shortSq);shortSq=0;}
      }
      clips.push({ name,rate,peak,rms:Math.sqrt(sq/sample.length),activeRms:Math.sqrt(maxShort/window),clipped,sample:Array.from(sample) });
    };
    const arrange=(a,name)=>{a.track=name;const t=scoreFor(name);for(let i=0;i<9;i++)a.playStep(t,i,.05+i*.18,.18);};
    for(const name of ['title','battle1','battle2','battle3',...Object.keys(enemies).map((id)=>'boss:'+id)]) await add(name,a=>arrange(a,name));
    for(const [name,voice,cue] of cards) await add(name,a=>a.sfx('cue',{cue,voice,strong:true}));
    for(const [id,cue] of Object.entries(recipes)) await add(id,a=>a.sfx('recipe',{cue}));
    await add('stress-mix',a=>{
      arrange(a,'boss:signalbreak_core');
      for(const [i,cue] of Object.values(recipes).slice(0,5).entries()) a.sfx('recipe',{cue,order:i});
      a.sfx('contact',{strong:true,voice:'S'});
      a.sfx('foe-cue',{kind:'aoe',cue:enemies.signalbreak_core,strong:true});
      a.sfx('victory');
    });
    await add('muted',a=>{arrange(a,'battle3');a.sfx('victory');},true);
    return clips;
  },{cards:[['fortress_slam','V',CARD_CUES.fortress_slam],['pressure_valve','C',CARD_CUES.pressure_valve],['grand_relay','S',CARD_CUES.grand_relay]],
    enemies:Object.fromEntries(Object.entries(ENEMY_CUES).filter(([id]) => ENEMIES[id].tier==='boss')),recipes:EX_CUES});
  const metrics=[];
  for(const {sample,...clip} of output){
    fs.writeFileSync(`${out}/${clip.name.replace(':','-')}.wav`,wave(sample,clip.rate));
    metrics.push(clip);
    if(clip.name==='muted') assert.ok(clip.peak < .001,'muted output');
    else assert.ok(clip.activeRms>.002 && clip.clipped===0 && clip.peak<.94,JSON.stringify(clip));
  }
  fs.writeFileSync(`${out}/audio.json`,JSON.stringify(metrics,null,2)+'\n');
  await p.close();
}

async function access() {
  const p=await pageAt('en','667x375',{reducedMotion:'reduce'});
  await p.getByRole('button',{name:'Settings',exact:true}).click();
  await p.locator('#set-muted').check();
  await p.getByRole('button',{name:'Done',exact:true}).click();
  await fixture(p,2,['mirror_array','wire_jammer']);
  const measured=await p.evaluate(()=>{
    const app=window.__sb, bs=app.battle;
    bs.consumeEvents([
      {type:'phase', id:'mirror_array',uid:bs.combat.enemies[0].uid,idx:0},
      {type:'exCombo',id:'healing_cadence',hero:'C',order:0,group:1,len:5,heroes:2,sum:{heal:4},applied:true},
    ]);
    const m=bs.view;
    return {reduced:m.reducedMotion,paused:app.paused,particles:m.particles.length,screenFlash:m.flashScreen,
      local:m.fx.some((f)=>f.kind==='signal' && f.shape==='mend'),muted:app.settings.muted};
  });
  assert.deepEqual(measured,{reduced:true,paused:true,particles:0,screenFlash:0,local:true,muted:true});
  await p.evaluate(() => {
    window.__sb.paused = false;
    document.activeElement.blur();
  });
  const selectedTarget = () => p.evaluate(() => window.__sb.battle.combat.target);
  const initial = await selectedTarget();
  await p.keyboard.press('Tab');
  assert.ok(await p.evaluate(() => document.activeElement.matches('.battle button')),'Tab reaches the combat controls');
  await p.keyboard.press('KeyT');
  assert.notEqual(await selectedTarget(),initial,'T changes the selected enemy');
  await p.locator('.target-chip').focus();
  await p.keyboard.press('Enter');
  assert.equal(await selectedTarget(),initial,'Enter activates the focused target control');
  await p.getByRole('button',{name:'EX details',exact:true}).click();
  await p.locator('.ex-detail').getByText('Healing Cadence',{exact:true}).waitFor();
  await p.locator('.ex-detail').getByRole('button',{name:'Close',exact:true}).click();
  await p.setViewportSize({width:375,height:667});
  await p.locator('.rotate-hint').waitFor();
  const t=await p.evaluate(()=>window.__sb.battle.combat.t);
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>window.__sb.battle.combat.t),t);
  await p.setViewportSize({width:667,height:375});
  await p.locator('.rotate-hint').waitFor({state:'hidden'});
  await p.reload();
  await p.waitForFunction(()=>window.__sb.settings.muted);
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.waitForFunction(()=>window.__sb.battle?.view.reducedMotion);
  await shot(p,'reduced-muted-after-rotation');
  fs.writeFileSync(`${out}/access.json`,JSON.stringify({...measured,keyboard:true,rotation:true,details:true,reload:true},null,2)+'\n');
  await p.close();
}

try {
  if (mode==='gallery') await gallery();
  else if (mode==='layout') await captureLayout();
  else if(mode==='motion') await motion();
  else if(mode==='roster') await roster();
  else if(mode==='audio') await audio();
  else if(mode==='access') await access();
  else throw Error('Use gallery, layout, motion, roster, audio or access.');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
