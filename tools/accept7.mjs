// Phase 7 acceptance demonstration (docs/COMBAT_SPEC.md §28, the assignment's §17 scenarios A–E):
// EX Combo recipes performed through the interface only — taps on hero buttons, cards, queue chips,
// FINISH, the menu and the Museum — then the Combo Journal, a reload and a new run.
//
//   node tools/accept7.mjs [lang = en] [width = 844] [height = 390] [outDir = accept7-out]
//
// Disclosed fixture (initialisation only): the profile is a returning player's — the Phase 6 lessons
// already learned, no EX Combo discovered; the run's first battle is against two Rush Hounds (an Act I
// formation) with three times their HP, so every scenario fits in one fight; and the run's deck is the
// starter deck plus two Scrap Feeds in a fixed order, so the six-card hand and the draw pile bring the
// cards each scenario needs in a known sequence. After that every card, hero choice, Relay, cancel,
// FINISH and menu action is a tap; the rest of the battle is played by the ordinary bot policy (taps).
// Recipe history is never written: the checks read what the engine and the interface recorded.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { uiDecision, uiPerform } from './lib/uibot.mjs';
import { RU } from '../src/i18n/ru.js';
import { LESSON_KEYS } from '../src/ui/lessons.js';
import { RECIPES } from '../src/data/recipes.js';
const { chromium } = createRequire(import.meta.url)('playwright');

const [LANG = 'en', W = 844, H = 390, outDir = 'accept7-out'] = process.argv.slice(2);
const L = (s) => (LANG === 'ru' && RU.ui[s] !== undefined ? RU.ui[s] : s);
const NAME = (id) => (LANG === 'ru' ? RU.recipes[id].name : RECIPES.find((r) => r.id === id).name);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${s}`);
const check = (step, name, ok, detail = '') => { results.push({ step, name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${step}. ${name}${detail ? ' — ' + detail : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: true });
// a returning player: every Phase 6 lesson learned except the Phase 7 one, no EX Combo discovered yet
await ctx.addInitScript(([l, keys]) => {
  if (localStorage.getItem('signalbreak.meta.v1')) return;
  localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l }));
  const tut = Object.fromEntries(keys.filter((k) => k !== 'exCombo').map((k) => [k, true]));
  localStorage.setItem('signalbreak.meta.v1', JSON.stringify({ version: 1, totalRuns: 1, defeats: 1, tutorialDone: true, lessonsMigrated: true, tut, runs: [{ result: 'defeat', act: 1, floors: 6, score: 300, seed: 1 }] }));
}, [LANG, LESSON_KEYS]);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const shot = (name) => p.screenshot({ path: `${outDir}/${LANG}-${W}-${name}.png` });
const wait = (ms) => p.waitForTimeout(ms);

// ── read-only views ──
const S = () => p.evaluate(() => {
  const bs = window.__sb && window.__sb.battle;
  const c = bs && bs.combat;
  if (!c) return null;
  return {
    trait: c.trait, t: c.t, phase: c.phase, lesson: bs.lessonOpen, ended: bs.ended, mom: c.momentum, momMax: c.momentumMax(), reserved: c.reserved, churn: c.churn.charges, churnMax: c.churnMax(), hp: c.hp,
    combo: c.combo ? { hero: c.combo.hero, rank: c.combo.rank, cards: c.combo.cards.length, ids: c.combo.cards.map((e) => e.id), vars: c.combo.cards.map((e) => e.variant), relays: c.combo.relays, owners: c.combo.owners.slice(), flow: c.flowLeft(), deadline: c.combo.deadline, cap: c.flowCap(), grace: c.combo.graceUntil - c.t, ex: [...c.combo.ex] } : null,
    hand: c.hand.map((u) => (u ? c.def(u).id : null)), queue: c.queue.map((q) => ({ id: q.id, type: q.type, card: q.uid ? c.def(q.uid).id : null })), exec: c.executing ? c.executing.cmd.type : null,
    history: c.history.map((x) => ({ type: x.type, heroes: x.heroes, len: x.len, ex: x.ex || [] })),
    states: Object.fromEntries(['V', 'C', 'S'].map((id) => [id, c.heroState(id)])), selected: c.selected,
    enemies: c.enemies.map((e) => ({ id: e.id, alive: e.alive, hp: e.hp })),
    stats: { exActivations: c.stats.exActivations, exByRecipe: { ...c.stats.exByRecipe }, exRelay: c.stats.exRelay, exOverlaps: c.stats.exOverlaps, relays: c.stats.relays },
    exLog: bs.exLog.slice(), zones: c.verifyZones().ok,
  };
});
const meta = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__sb.meta.combos)));
const screen = () => p.evaluate(() => {
  if (document.querySelector('.dialog-layer')) return 'dialog';
  if (document.querySelector('.modal')) return 'modal';
  const s = document.querySelector('.layer-screen > div');
  return s ? s.className.split(' ')[0] : 'none';
});
const center = (sel) => p.evaluate((q) => { const el = document.querySelector(q); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
const tapSel = async (sel) => { const at = await center(sel); if (!at) return false; await p.touchscreen.tap(at[0], at[1]); await wait(60); return true; };
const uidOf = (id) => p.evaluate((cid) => { const c = window.__sb.battle.combat; return c.hand.find((u) => u && c.def(u).id === cid) || null; }, id);
const clickText = async (text) => { const el = p.getByRole('button', { name: L(text), exact: true }).first(); if (await el.count()) { await el.click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
const lessons = [];
async function dismissLesson(s) {
  lessons.push({ key: s.lesson, t: s.t, ex: s.exLog.length });
  await wait(480);
  await shot(`lesson-${s.lesson}`);
  await tapSel('.tut-layer:not([hidden]) .btn.primary');
  await wait(80);
}
async function until(pred, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await S();
    if (!s) return null;
    if (s.lesson) { await dismissLesson(s); continue; }
    if (pred(s)) return s;
    await wait(30);
  }
  return null;
}
const settled = (ms) => until((x) => !x.exec && !x.queue.length, ms);
// taps a card and confirms it left the hand (committed); a tap that landed while the hand was still being
// dealt is repeated, as a player would tap again
const tapCard = async (id) => {
  const u = await uidOf(id);
  if (!u) return false;
  for (let k = 0; k < 3; k++) {
    await tapSel(`.hand .card[data-uid="${u}"]`);
    for (let i = 0; i < 15; i++) { if (!(await p.evaluate((x) => window.__sb.battle.combat.hand.includes(x), u))) return true; await wait(40); }
  }
  return false;
};
const tapHero = (id) => tapSel(`.hero-btn[data-hero="${id}"]`);
async function play(...ids) {
  for (const id of ids) {
    const ok = await tapCard(id);
    if (!ok) { log(`  (no ${id} in hand)`); return false; }
    await settled(5000);
  }
  return true;
}
const bannerText = () => p.evaluate(() => [...document.querySelectorAll('.banner.tone-ex')].map((b) => ({ ex: b.dataset.ex, text: b.textContent, why: b.querySelectorAll('.banner-why .seq-chip').length, rect: b.getBoundingClientRect().toJSON() })));
const integrity = (s) => s && s.zones && s.mom >= 0 && s.mom <= s.momMax && s.reserved >= 0 && s.reserved <= s.mom;
async function finishChain() {
  await settled(4000);
  await tapSel('.ctl.cash');
  return until((x) => !x.combo && !x.exec && !x.queue.length, 6000);
}
async function heroReady(id, ms = 12000) { return until((x) => x.states[id] === 'READY' && !x.combo && x.phase !== 'RECOVER', ms); }

// ── a new run up to its first battle, with the disclosed fixture ──
const DECK = ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'thermal_lance', 'hotwire', // the hand
  'scrapline', 'scrapline', 'scrap_feed', 'bolt_volley', 'scrapline', 'piston_strike', 'scrapline', 'rivet_jab', 'piston_strike', 'scrap_feed', // the draw pile, in order
  'mend_circuit', 'salvage', 'rivet_jab', 'hotwire', 'scrapline', 'piston_strike'];
async function startRun() {
  for (let i = 0; i < 40 && (await screen()) === 'dialog'; i++) { await tapSel('.dlg-skip'); await wait(150); }
  for (let i = 0; i < 20 && (await screen()) !== 'map'; i++) { if ((await screen()) === 'dialog') await tapSel('.dlg-skip'); else await clickText('Continue'); await wait(200); }
  await p.evaluate((spec) => {
    const r = window.__sb.run;
    r.d.deck = spec.map((id, i) => ({ uid: `fx${i}`, id, up: false }));
    const enter = r.enterNode.bind(r);
    r.enterNode = (id) => { const out = enter(id); if (r.d.pending && r.d.pending.type === 'battle') r.d.pending.enemies = ['rush_hound', 'rush_hound']; return out; };
  }, DECK);
  // a battle node whose trait does not change suits (Wild Signal) or Lock cards (Static): either would
  // legitimately change the scripted sequence
  const node = await p.evaluate(() => {
    const r = window.__sb.run;
    const av = r.availableNodes().filter((id) => r.node(id).type === 'battle');
    return av.find((id) => !r.node(id).trait) || av.find((id) => !['WILD_SIGNAL', 'STATIC'].includes(r.node(id).trait)) || av[0] || r.availableNodes()[0];
  });
  await tapSel(`.map-node[data-node="${node}"]`);
  await wait(150);
  await clickText('Travel');
  await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
  await p.evaluate(() => {
    const c = window.__sb.battle.combat;
    c.hand = ['fx0', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'];
    c.draw = Array.from({ length: 16 }, (_, i) => `fx${i + 6}`);
    c.discard = [];
    for (const e of c.enemies) { e.hp = e.maxHp = e.maxHp * 3; }
    window.__sb.battle.updateHud(true);
  });
  return S();
}

await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
const m0 = await meta();
await shot('00-title');
await clickText('New Run');
await wait(300);
await clickText('Begin');
await wait(500);
let s = await startRun();
check(1, 'A valid encounter starts (Act I, two Rush Hounds)', s && s.enemies.length === 2 && s.phase !== 'END' && Object.keys(m0).length === 0 && !['WILD_SIGNAL', 'STATIC'].includes(s.trait), `${s.enemies.map((e) => e.id).join(' + ')}, node trait ${s.trait || 'none'}; Journal empty before: ${Object.keys(m0).length === 0}`);
check(2, 'The real six-card hand', s.hand.filter(Boolean).length === 6, s.hand.join(', '));

// ════════════ Scenario A — Straight Circuit (Hessa: Weak, Medium, Strong, then her arte) ════════════
await tapHero('V');
s = await S();
check(3, 'Hessa selected with her hero button', s.selected === 'V', `selected ${s.selected}`);
await play('scrapline', 'rivet_jab', 'piston_strike');
s = await S();
check(4, 'Basic attacks executed in ascending order (Weak 1 → Medium 2 → Strong 3)', s.combo && s.combo.rank === 3 && s.combo.ids.join() === 'scrapline,rivet_jab,piston_strike', s.combo && s.combo.ids.join(' → '));
check(5, 'Enough Momentum for the arte', s.mom >= 2, `Momentum ${s.mom}`);
const noExYet = s.exLog.length === 0;
const momBefore = s.mom;
const hpBefore = s.enemies.reduce((a, e) => a + e.hp, 0);
await tapCard('scrapfall');
let banner = null;
for (let i = 0; i < 80 && !banner; i++) { const bt = await bannerText(); banner = bt.find((x) => x.ex.includes('straight_circuit')) || null; if (!banner) await wait(25); }
await shot('A-banner');
s = await settled(5000);
const a = s.exLog.find((e) => e.id === 'straight_circuit');
check(6, 'The qualifying arte executed', s.combo && s.combo.ids[3] === 'scrapfall', s.combo && s.combo.ids.join(' → '));
check(7, 'Straight Circuit activates on the arte — not before', noExYet && a && a.len === 4, a ? `nothing after three basics; activated with ${a.len} cards in the chain` : 'not activated');
check(8, 'Its mechanical effect: a strike and +1 Momentum', a && a.sum.dmg >= 5 && a.sum.momentum === 1 && s.mom === momBefore - 2 + 1, a ? `strike ${a.sum.dmg} (enemy HP ${hpBefore} → ${s.enemies.reduce((x, e) => x + e.hp, 0)}), Momentum ${momBefore} − 2 + 1 = ${s.mom}` : '');
check(9, 'A distinct EX presentation: the EX banner with its name, sequence and effect', banner && banner.text.includes(NAME('straight_circuit')) && banner.why >= 4, banner ? `"${banner.text.slice(0, 90)}"; ${banner.why} sequence chips; ${Math.round(banner.rect.width)}×${Math.round(banner.rect.height)}px` : 'no banner');
const m1 = await meta();
check(10, 'A first discovery: recorded in the Museum at once, marked NEW', a && a.fresh && m1.straight_circuit && m1.straight_circuit.count === 1 && banner && banner.text.includes(L('NEW EX COMBO DISCOVERED')), JSON.stringify(m1));
s = await finishChain();
check(11, 'The chain finishes normally (FINISH: a Perfect)', s && s.history.length === 1 && s.history[0].type === 'perfect' && s.history[0].ex.includes('straight_circuit'), s ? JSON.stringify(s.history[0]) : '');
check(12, 'Card zones and Momentum intact', integrity(s), `zones ${s && s.zones}, Momentum ${s && s.mom}/${s && s.momMax}, reserved ${s && s.reserved}`);
const exLesson = lessons.find((l) => l.key === 'exCombo');
check('12a', 'The first-EX lesson explains it once, after the discovery', exLesson && exLesson.ex >= 1 && lessons.filter((l) => l.key === 'exCombo').length === 1, exLesson ? `shown after ${exLesson.ex} activation(s)` : `lessons: ${lessons.map((l) => l.key).join(', ') || 'none'}`);

// ════════════ Scenario B — Tandem Signal (Corvin's arte, Relay, Hessa's arte of the same suit) ════════════
await until((x) => x.states.C === 'READY' && !x.combo && x.phase !== 'RECOVER', 8000);
await tapHero('C');
await play('scrapline');
s = await S();
check(13, 'Another qualifying sequence starts: Corvin\'s combo', s.combo && s.combo.hero === 'C', s.combo && `combo by ${s.combo.hero}`);
await play('thermal_lance');
s = await until((x) => x.states.V === 'READY', 6000);
const flowAtRelay = s && s.combo ? s.combo.flow : 0;
await tapHero('V');
s = await until((x) => x.combo && x.combo.hero === 'V' && !x.exec && !x.queue.length, 5000);
check(14, 'A real Relay: the hero button hands the chain to Hessa', s && s.combo.relays === 1 && s.combo.owners.join() === 'C,V', s && s.combo ? `owners ${s.combo.owners.join(' → ')}, Flow ${flowAtRelay.toFixed(1)}s at the Relay` : '');
const recC = s && s.states.C;
await play('scrapline');
s = await S();
const graceAfterFirst = s.combo ? s.combo.grace : 0;
check(15, 'The incoming hero\'s part continues: Hessa opens with a basic attack', s.combo && s.combo.hero === 'V' && s.combo.rank === 1 && s.combo.cards === 3, s.combo && `${s.combo.ids.join(' → ')}`);
const exB0 = s.exLog.length;
await tapCard('scrap_feed');
s = await settled(5000);
const tb = s.exLog.find((e) => e.id === 'tandem_signal');
check(16, 'Tandem Signal\'s conditions met: an arte, a Relay, the incoming hero\'s arte of the same suit', tb && s.exLog.length === exB0 + 1, (tb ? `activated with ${tb.len} cards, ${tb.heroes} heroes` : `log ${JSON.stringify(s.exLog.map((e) => e.id))}`) + ` · suits ${s.combo && s.combo.vars.join(',')} · trait ${s.trait}`);
check(17, 'The EX effect occurs: Corvin\'s arte Echoes', tb && tb.sum.echo && tb.sum.dmg > 0, tb ? `Echo for ${tb.sum.dmg}` : '');
check(18, 'The party-level chain stays one chain', s.combo && s.combo.cards === 4 && s.combo.owners.length === 2 && s.combo.relays === 1, s.combo && `${s.combo.cards} cards, owners ${s.combo.owners.join(', ')}`);
check(19, 'The outgoing hero\'s Recovery still applies', recC === 'RECOVERING', `Corvin after the Relay: ${recC}`);
check(20, 'Normal Flow and decision timing', s.combo && s.combo.deadline <= s.combo.cap + 1e-6 && s.combo.flow > 0 && graceAfterFirst > 0, s.combo ? `Flow ${s.combo.flow.toFixed(1)}s left, within the cap; read window after Hessa's first card ${graceAfterFirst.toFixed(2)}s` : '');
await shot('B-tandem');
s = await finishChain();
const hb = s && s.history[s.history.length - 1];
check(21, 'Chain completed; statistics record the Relay recipe', hb && hb.type === 'perfect' && hb.heroes.join() === 'C,V' && hb.ex.includes('tandem_signal') && s.stats.exRelay === 1 && s.stats.exByRecipe.tandem_signal === 1, hb ? `${JSON.stringify(hb)}; EX ${s.stats.exActivations}, Relay recipes ${s.stats.exRelay}` : '');

// ════════════ Scenario C — Straight Circuit + Cross Current on Pin's arte ════════════
await until((x) => x.states.S === 'READY' && !x.combo && x.phase !== 'RECOVER', 8000);
await tapHero('S');
await play('scrapline', 'hotwire', 'piston_strike');
s = await S();
const exC0 = s.exLog.length, churn0 = s.churn;
await tapCard('bolt_volley');
let bc = null;
for (let i = 0; i < 80 && !bc; i++) { const bt = await bannerText(); bc = bt.find((x) => x.ex.includes('cross_current')) || null; if (!bc) await wait(25); }
await shot('C-overlap');
s = await settled(5000);
const cl = s.exLog.slice(exC0);
check(22, 'A valid executed sequence completes two recipes on one command', s.combo && s.combo.ids.join() === 'scrapline,hotwire,piston_strike,bolt_volley' && cl.length === 2 && cl[0].group === cl[1].group, `${s.combo && s.combo.ids.join(' → ')}: ${cl.map((e) => e.id).join(' + ')}`);
check(23, 'Both activate and are shown together', cl.some((e) => e.id === 'straight_circuit') && cl.some((e) => e.id === 'cross_current') && bc && bc.ex === 'straight_circuit,cross_current', bc ? `banner "${bc.text.slice(0, 80)}"` : 'no banner');
check(24, 'In priority order: Straight Circuit (10) before Cross Current (30)', cl[0] && cl[0].id === 'straight_circuit' && cl[0].order === 0 && cl[1].order === 1, cl.map((e) => `${e.order}:${e.id}`).join(' '));
check(25, 'Neither activates twice in the chain', s.combo && s.combo.ex.length === 2 && s.combo.ex.filter((x) => x === 'straight_circuit').length === 1, s.combo && s.combo.ex.join(', '));
const cc = cl.find((e) => e.id === 'cross_current');
check(26, 'Combined effects respect the caps', integrity(s) && s.churn <= s.churnMax && s.mom <= s.momMax && (churn0 < s.churnMax || cc.sum.churn === 0), `Momentum ${s.mom}/${s.momMax}; Churn ${churn0} → ${s.churn} (max ${s.churnMax}, Cross Current gave ${cc ? cc.sum.churn : '?'})`);
s = await finishChain();
const m2 = await meta();
check('26a', 'A repeated recipe is not a new discovery; a new one is', m2.straight_circuit.count === 2 && m2.cross_current && m2.cross_current.count === 1 && !cl[0].fresh && cl[1].fresh, JSON.stringify(m2));

// ════════════ Scenario D — cancel a queued arte, then recommit it ════════════
await heroReady('V');
await tapHero('V');
await play('scrapline');
// while the Medium attack executes, commit the Strong one and the arte: both wait in the queue
await tapCard('rivet_jab');
await tapCard('piston_strike');
await tapCard('scrap_feed');
s = await S();
const waiting = s.queue.find((q) => q.card === 'scrap_feed');
check(27, 'The arte the recipe needs is queued behind the executing card', !!waiting, waiting ? `queue: ${s.queue.map((q) => q.card).join(', ')} behind ${s.exec}` : `queue ${JSON.stringify(s.queue)}`);
await shot('D-queued');
if (waiting) await tapSel(`.chip.q.wait[data-cmd="${waiting.id}"]`);
s = await S();
const back = s.hand.includes('scrap_feed') && !s.queue.some((q) => q.card === 'scrap_feed');
check(28, 'Cancelled before execution: the card is back in the hand', back, `hand ${s.hand.join(', ')}`);
s = await settled(5000);
const exD0 = s.exLog.length;
await wait(600);
s = await S();
check(29, 'The recipe does not activate (three basics executed, the arte did not)', s.exLog.length === exD0 && s.combo && s.combo.cards === 3 && !s.combo.ex.length, `chain ${s.combo && s.combo.ids.join(' → ')}, EX this chain: ${s.combo ? s.combo.ex.length : '?'}`);
await tapCard('scrap_feed');
s = await settled(5000);
const dl = s.exLog.slice(exD0);
check(30, 'Recommitted and executed', s.combo && s.combo.ids[3] === 'scrap_feed', s.combo && s.combo.ids.join(' → '));
check(31, 'The recipe activates only now, once', dl.length === 1 && dl[0].id === 'straight_circuit' && dl[0].len === 4, dl.map((e) => `${e.id}@${e.len}`).join(', '));
s = await finishChain();

// ════════════ Scenario E — the Museum Combo Journal ════════════
let zonesOk = true;
for (let i = 0; i < 2500; i++) {
  s = await S();
  if (!s || s.ended) break;
  zonesOk = zonesOk && s.zones;
  if (s.lesson) { await dismissLesson(s); continue; }
  const act = await uiDecision(p, 'regular');
  await uiPerform(p, act, { touch: true });
  await wait(110);
}
await wait(2500);
const won = await p.evaluate(() => window.__sb.run && window.__sb.run.d.battleCount === 1 && window.__sb.run.d.hp > 0);
const runEx = await p.evaluate(() => ({ found: window.__sb.run.d.exFound.slice(), n: window.__sb.run.d.stats.exActivations }));
check(32, 'The encounter is won normally (ordinary play by taps), zones intact throughout', won && zonesOk, `run EX: ${runEx.n} activations, recipes ${runEx.found.join(', ')}`);
for (let i = 0; i < 30 && (await screen()) !== 'map'; i++) {
  const sc = await screen();
  if (sc === 'dialog') await tapSel('.dlg-skip');
  else if (sc === 'modal') await tapSel('.modal .btn.primary');
  else await clickText('Continue');
  await wait(200);
}
await tapSel('.rh-btns .btn.icon');
await wait(250);
await clickText('Save & quit to title');
await wait(400);
await clickText('Museum');
await wait(300);
check(33, 'The Museum opens from the title screen', !!(await p.$('.modal .museum')), await screen());
await tapSel('.museum [data-tab="Journal"]');
await wait(250);
const journal = () => p.evaluate(() => ({ found: [...document.querySelectorAll('.jr-card.found')].map((e) => ({ id: e.dataset.recipe, text: e.textContent })), locked: [...document.querySelectorAll('.jr-card.locked')].map((e) => ({ id: e.dataset.recipe, text: e.textContent })), head: (document.querySelector('.jr-head') || {}).textContent || '' }));
let j = await journal();
await shot('E-journal');
check(34, 'The Combo Journal tab opens', j.found.length + j.locked.length === RECIPES.length, j.head);
const want = ['straight_circuit', 'tandem_signal', 'cross_current'];
check(35, 'The newly discovered recipes are shown in full (name, sequence, count)', want.every((id) => j.found.some((f) => f.id === id && f.text.includes(NAME(id)))), j.found.map((f) => f.id).join(', '));
const leak = j.locked.filter((l) => l.text.includes(NAME(l.id)));
check(36, 'Undiscovered recipes stay hidden: ??? and a hint, never the name', j.locked.length > 0 && leak.length === 0 && j.locked.every((l) => l.text.includes('???')), `${j.locked.length} hidden; name leaks: ${leak.map((l) => l.id).join(', ') || 'none'}`);
// filters work by touch
await tapSel('.journal [data-filter="relay"]');
await wait(150);
const relayOnly = await p.evaluate(() => [...document.querySelectorAll('.jr-card')].map((e) => e.dataset.recipe));
await tapSel('.journal [data-filter="all"]');
check('36a', 'Journal filters (by touch): Relay recipes only', relayOnly.length > 0 && relayOnly.every((id) => ['tandem_signal', 'three_way_circuit', 'final_harmonic'].includes(id)), relayOnly.join(', '));
const before = await meta();
await p.reload();
await p.waitForFunction(() => window.__sb);
await wait(400);
const after = await meta();
check(37, 'Save and reload', JSON.stringify(after) === JSON.stringify(before), `${Object.keys(after).length} discoveries before and after`);
await clickText('Museum');
await wait(300);
await tapSel('.museum [data-tab="Journal"]');
await wait(250);
j = await journal();
check(38, 'The discoveries persist after the reload', want.every((id) => j.found.some((f) => f.id === id)), j.head);
await clickText('Close');
await wait(200);
await clickText('New Run');
await wait(300);
await clickText('Abandon & start new');
await wait(300);
await clickText('Begin');
await wait(500);
s = await startRun();
const m3 = await meta();
check(39, 'A new run starts', s && s.history.length === 0 && (await p.evaluate(() => window.__sb.run.d.battleCount)) === 0, s && s.enemies.map((e) => e.id).join(' + '));
check(40, 'Previously discovered recipes remain recorded', want.every((id) => m3[id] && m3[id].count >= 1), JSON.stringify(m3));
const count0 = m3.straight_circuit.count;
await tapHero('V');
await play('scrapline', 'rivet_jab', 'piston_strike');
await tapCard('scrapfall');
let be = null;
for (let i = 0; i < 80 && !be; i++) { const bt = await bannerText(); be = bt.find((x) => x.ex.includes('straight_circuit')) || null; if (!be) await wait(25); }
await shot('E-repeat');
s = await settled(5000);
const e41 = s.exLog.find((e) => e.id === 'straight_circuit');
check(41, 'A previously discovered recipe triggers again in the new run', e41 && e41.len === 4 && e41.sum.momentum === 1, e41 ? `activated with ${e41.len} cards` : `no — chain ${JSON.stringify(s.combo)} history ${JSON.stringify(s.history)} hand ${s.hand.join(',')} log ${JSON.stringify(s.exLog)}`);
const m4 = await meta();
check(42, 'It activates normally, without counting as a new discovery', e41 && !e41.fresh && m4.straight_circuit.count === count0 + 1 && Object.keys(m4).length === Object.keys(m3).length && be && !be.text.includes(L('NEW EX COMBO DISCOVERED')) && !lessons.slice(1).some((l) => l.key === 'exCombo'), `count ${count0} → ${m4.straight_circuit.count}; banner "${be ? be.text.slice(0, 60) : ''}"`);
// the discovery policy across a restarted encounter: recorded at activation, kept
await finishChain();
await tapSel('.pause-btn');
await wait(250);
await clickText('Restart encounter');
await wait(250);
await clickText('Restart');
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat && window.__sb.battle.combat.history.length === 0, null, { timeout: 8000 });
const m5 = await meta();
const runAfter = await p.evaluate(() => ({ found: window.__sb.run.d.exFound.slice(), n: window.__sb.run.d.stats.exActivations }));
check('42a', 'Restarting the encounter keeps the Journal record; the run counts only finished battles', JSON.stringify(m5) === JSON.stringify(m4) && runAfter.n === 0 && runAfter.found.length === 0, `Journal unchanged: ${JSON.stringify(m5) === JSON.stringify(m4)}; run EX after the restart ${runAfter.n}`);
check('—', 'No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${outDir}/${LANG}-${W}-results.json`, JSON.stringify({ lang: LANG, viewport: [+W, +H], results, lessons, errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${LANG}, ${W}×${H})${failed.length ? ' — FAILED: ' + failed.map((f) => f.step).join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
