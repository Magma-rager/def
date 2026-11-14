// Ordinary post-tutorial encounters in the real game, measured. A slow, deliberate player taps cards
// on the touchscreen (it reads a new hand for ~2s and plays a card about every 1.5s); the page is
// instrumented to record, per combat state, how much combat time passes and how far enemy ATB
// advances, when each enemy acts, and what the player could do at that moment.
//
// Usage: node tools/encounter.mjs [outDir] [lang=en] [WxH=844x390]   (needs npm run serve, port 8123)
// The first fight is entered through the map like a player would; the others set up a specific
// Act I formation (state injection) so the same encounters can be compared before and after a change.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const [out = 'encounter-out', LANG = 'en', VP = '844x390'] = process.argv.slice(2);
const [W, H] = VP.split('x').map(Number);
fs.mkdirSync(out, { recursive: true });
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
const READ = +(process.env.SB_READ || 2.0);
const CARD = +(process.env.SB_CARD || 1.5);

const FIGHTS = [
  { name: 'first map fight (natural)', natural: true },
  { name: 'd0 2 hounds', enemies: ['rush_hound', 'rush_hound'], depth: 0 },
  { name: 'd0 hound + mite', enemies: ['rush_hound', 'interference_mite'], depth: 0 },
  { name: 'd1 jammer + hound', enemies: ['wire_jammer', 'rush_hound'], depth: 1 },
  { name: 'd1 iron maw', enemies: ['iron_maw'], depth: 1 },
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true });
await ctx.addInitScript((l) => localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l, hints: false })), LANG);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.meta.totalRuns = 1; a.startRun('beta_badge'); });
await p.waitForTimeout(500);
for (let i = 0; i < 12; i++) { const s = await p.$('.dlg-skip'); if (!s) break; await s.click().catch(() => {}); await p.waitForTimeout(250); }

// instrumentation, installed on every new battle
const instrument = () => p.evaluate(() => {
  const bs = window.__sb.battle;
  const c = bs.combat;
  if (c.__probe) return;
  const P = (c.__probe = { states: {}, acts: [], plays: [], combos: [], t0: performance.now(), hpStart: c.party.reduce((a, x) => a + x.hp, 0), dmg: { atk: 0, aoe: 0 }, interference: 0 });
  const state = () => (c.hold > 0 ? 'finisher' : c.phase === 'ACTIVE' ? (c.flowHeld() ? 'hold' : 'active') : c.phase === 'PRE' ? 'pre' : c.phase === 'RECOVER' ? 'recover' : c.phase);
  const upd = c.update.bind(c);
  c.update = (dt) => {
    const s = state();
    const t0 = c.t;
    const atb = c.enemies.map((e) => (e.alive ? e.atb : null));
    const acts0 = P.acts.length;
    upd(dt);
    const st = (P.states[s] = P.states[s] || { real: 0, combat: 0, atb: 0, enemyActs: 0 });
    st.real += Math.min(dt, 0.25);
    st.combat += c.t - t0;
    c.enemies.forEach((e, i) => { if (atb[i] !== null && e.alive && e.atb >= atb[i]) st.atb += e.atb - atb[i]; });
    st.enemyActs += P.acts.length - acts0;
  };
  const em = c.emit.bind(c);
  c.emit = (ev) => {
    em(ev);
    if (ev.type === 'enemyAct') {
      const e = c.enemies.find((x) => x.uid === ev.uid);
      const legal = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok).length;
      P.acts.push({ t: c.t, id: ev.id, kind: ev.kind, state: state(), legal });
      if (['lock', 'scramble', 'jam', 'snare', 'latch', 'drain', 'glitch'].includes(ev.kind)) P.interference++;
      void e;
    }
    if (ev.type === 'partyHit') P.dmg.atk += ev.amount || 0;
    if (ev.type === 'comboEnd') P.combos.push({ kind: ev.kind, len: ev.len });
  };
});

async function enterFight(f) {
  if (f.natural) {
    await p.evaluate(() => window.__sb.route());
    await p.waitForTimeout(500);
    const node = await p.$('.map-node.avail.t-battle') || await p.$('.map-node.avail');
    await node.click();
    await p.waitForTimeout(150);
    await p.getByRole('button', { name: LANG === 'ru' ? 'В путь' : 'Travel' }).first().click().catch(async () => { await p.locator('.map-side .btn.primary').first().click(); });
  } else {
    await p.evaluate((x) => {
      const app = window.__sb;
      const r = app.run;
      r.d.party.forEach((m) => { m.hp = m.maxHp; });
      const node = r.d.map.nodes.find((n) => n.depth === x.depth && n.type === 'battle') || r.d.map.nodes.find((n) => n.depth === x.depth);
      r.d.pending = { type: 'battle', kind: 'battle', nodeId: node.id, enemies: x.enemies };
      app.route();
    }, f);
  }
  await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 8000 });
  await instrument();
}

async function tapCard(uid) {
  const box = await p.evaluate((u) => {
    const el = document.querySelector(`.hand .card[data-uid="${u}"], .reserve .res-card[data-uid="${u}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, uid);
  if (box) await p.touchscreen.tap(box[0], box[1]);
  return !!box;
}

async function playFight(f) {
  await enterFight(f);
  const enemies = await p.evaluate(() => window.__sb.battle.combat.enemies.map((e) => e.id));
  let lastHand = '';
  let wait = READ;
  let shot = false;
  for (let tick = 0; tick < 2400; tick++) {
    await p.waitForTimeout(100);
    const st = await p.evaluate(() => {
      const c = window.__sb.battle && window.__sb.battle.combat;
      if (!c) return { gone: true };
      const legal = [...c.hand].filter((u) => u && c.check(u).ok).map((u) => ({ u, role: c.roleOf(u), rank: c.effRank(u) }));
      return { phase: c.phase, hand: c.hand.join(','), legal, len: c.combo ? c.combo.cards.length : 0, canCash: c.canCashOut(), flow: c.flowLeft(), end: c.phase === 'END' };
    });
    if (st.gone || st.end) break;
    if (st.hand !== lastHand) {
      const changed = st.hand.split(',').filter((u, k) => u !== lastHand.split(',')[k]).length;
      if (changed >= 3) wait = Math.max(wait, READ);
      lastHand = st.hand;
    }
    wait -= 0.1;
    if (wait > 0) continue;
    wait = CARD;
    if (st.phase === 'PRE' && st.legal.length) {
      st.legal.sort((a, c) => a.rank - c.rank);
      await tapCard(st.legal[0].u);
    } else if (st.phase === 'ACTIVE') {
      const conv = st.legal.filter((x) => x.role === 'conv').sort((a, c) => a.rank - c.rank);
      const close = st.legal.filter((x) => x.role === 'close').sort((a, c) => c.rank - a.rank);
      if (conv.length && (st.len < 4 || !close.length)) await tapCard(conv[0].u);
      else if (close.length) await tapCard(close[0].u);
      else if (st.canCash) await p.tap('.ctl.cash').catch(() => {});
      if (!shot && st.len >= 2) { shot = true; await p.screenshot({ path: `${out}/${LANG}-${W}-${f.name.replace(/\W+/g, '_')}.png` }); }
    }
  }
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const c = window.__sb.battle ? window.__sb.battle.combat : null;
    const P = c && c.__probe;
    if (!P) return null;
    return { states: P.states, acts: P.acts, combos: P.combos, t: c.t, result: c.result, hpLost: P.hpStart - c.party.reduce((a, x) => a + Math.max(0, x.hp), 0), hpStart: P.hpStart, dmg: P.dmg, interference: P.interference, ko: c.party.filter((x) => x.ko).length };
  });
  return { fight: f.name, enemies, ...r };
}

const results = [];
for (const f of FIGHTS) {
  const r = await playFight(f);
  results.push(r);
  // leave the battle: victory goes to the reward screen; make sure the next fight starts clean
  await p.waitForTimeout(2500);
  const scr = await p.evaluate(() => (document.querySelector('.layer-screen > div') || {}).className || '');
  r.after = scr.split(' ')[0];
}

const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const lines = [];
for (const r of results) {
  if (!r || !r.states) { lines.push(`${r && r.fight}: no data`); continue; }
  const gaps = [];
  for (let i = 1; i < r.acts.length; i++) gaps.push(r.acts[i].t - r.acts[i - 1].t);
  const per = {};
  for (const id of new Set(r.acts.map((a) => a.id))) {
    const ts = r.acts.filter((a) => a.id === id).map((a) => a.t);
    per[id] = ts.length;
  }
  const rate = (s) => (r.states[s] && r.states[s].combat > 0 ? (r.states[s].atb / r.states[s].combat).toFixed(3) : '-');
  const time = (s) => (r.states[s] ? r.states[s].combat.toFixed(1) : '0.0');
  const actsIn = (s) => (r.states[s] ? r.states[s].enemyActs : 0);
  const noLegal = r.acts.filter((a) => a.state === 'pre' && a.legal === 0).length;
  lines.push(`${r.fight} [${r.enemies.join('+')}] → ${r.result && r.result.victory ? 'victory' : 'defeat'} in ${r.t.toFixed(0)}s, then ${r.after}; HP lost ${r.hpLost}/${r.hpStart}, heroes down ${r.ko}`);
  lines.push(`  first enemy action ${r.acts[0] ? r.acts[0].t.toFixed(1) + 's' : '-'}; enemy actions ${r.acts.length} (${Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', ')}); gaps median ${med(gaps) ? med(gaps).toFixed(2) : '-'}s, min ${gaps.length ? Math.min(...gaps).toFixed(2) : '-'}s`);
  lines.push(`  combat time by state: deciding (pre) ${time('pre')}s, Flow held ${time('hold')}s, combo ${time('active')}s, breather ${time('recover')}s, finisher ${time('finisher')}s`);
  lines.push(`  ATB per enemy-second by state: pre ${rate('pre')}, held ${rate('hold')}, combo ${rate('active')}, breather ${rate('recover')}, finisher ${rate('finisher')}`);
  lines.push(`  enemy actions by state: pre ${actsIn('pre')}, held ${actsIn('hold')}, combo ${actsIn('active')}, breather ${actsIn('recover')}, finisher ${actsIn('finisher')}; while no card was playable: ${noLegal}; interference actions ${r.interference}`);
  lines.push(`  combos: ${r.combos.map((c) => `${c.kind}:${c.len}`).join(' ')}`);
}
lines.push(`page errors: ${errors.length}`);
console.log(lines.join('\n'));
fs.writeFileSync(`${out}/encounter-${LANG}-${W}.json`, JSON.stringify(results, null, 1));
await b.close();
