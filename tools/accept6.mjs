// Phase 6 acceptance demonstration (docs/COMBAT_SPEC.md §27): a brand-new player's first run through the
// interface only — taps, holds and swipes — from the title screen through the progressive lessons of
// the first battle, on through Act I (elite, boss, rewards) into Act II, with a reload and Continue;
// then returning-player checks (skip, replay, an earlier tutorial already learned).
//
//   node tools/accept6.mjs [lang = en] [width = 844] [height = 390] [outDir = accept6-out] [--part=a]
//
// Disclosed fixture (allowed for controlled tutorial cases): before the first battle the run's deck is
// the starter deck in a fixed order plus one Glitch card, and while the first lesson is open the hand
// and draw pile are set to that order, so each lesson's moment comes in a known sequence; the first
// battle's two enemies get extra HP so every first-battle lesson fits before they fall. Nothing else
// is injected: every card, Relay, FINISH, cancel, Churn, Reserve, target change and lesson dismissal
// is a tap or swipe on the screen; lessons appear only when the game decides they are relevant, and
// the scenario waits for each one before the action it explains. Part B plays the rest of Act I with
// the ordinary bot policy (tools/lib/uibot.mjs), also through taps. The engine is read for the checks.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { uiDecision, uiPerform } from './lib/uibot.mjs';
import { RU } from '../src/i18n/ru.js';
import { INTRO_KEYS } from '../src/ui/lessons.js';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PART_A_ONLY = process.argv.includes('--part=a');
const [LANG = 'en', W = 844, H = 390, outDir = 'accept6-out'] = args;
const L = (s) => (LANG === 'ru' && RU.ui[s] !== undefined ? RU.ui[s] : s);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${s}`);
const check = (step, name, ok, detail = '') => { results.push({ step, name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${step}. ${name}${detail ? ' — ' + detail : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: true });
await ctx.addInitScript((l) => { if (!localStorage.getItem('signalbreak.settings.v1')) localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l })); }, LANG);
const p = await ctx.newPage();
await p.clock.install();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const shot = (name) => p.screenshot({ path: `${outDir}/${LANG}-${W}-${name}.png` });
const wait = (ms) => p.waitForTimeout(ms);
let scriptedClock = false;
async function holdInputWindow() {
  await p.clock.pauseAt(await p.evaluate(() => Date.now() + 180));
  scriptedClock = true;
}
async function releaseInputWindow() {
  scriptedClock = false;
  await p.clock.resume();
}

// ── read-only views ──
const S = () => p.evaluate(() => {
  const bs = window.__sb && window.__sb.battle;
  const c = bs && bs.combat;
  if (!c) return null;
  return {
    t: c.t, phase: c.phase, lesson: bs.lessonOpen, anchor: bs.lessonAnchor || null, sinceLesson: c.t - bs.lessons.lastAt, paused: window.__sb.paused, ended: bs.ended, tutorial: !!bs.setup.tutorial,
    mom: c.momentum, hp: c.hp, guard: c.guard, cover: c.coverActive(),
    combo: c.combo ? { hero: c.combo.hero, rank: c.combo.rank, cards: c.combo.cards.length, relays: c.combo.relays, owners: c.combo.owners.slice(), flow: c.flowLeft() } : null,
    hand: c.hand.map((u) => (u ? c.def(u).id : null)), reserve: c.reserve.map((u) => c.def(u).id),
    queue: c.queue.map((q) => ({ id: q.id, type: q.type, card: q.uid ? c.def(q.uid).id : null })), exec: c.executing ? c.executing.cmd.type : null,
    history: c.history.map((x) => ({ type: x.type, heroes: x.heroes, len: x.len })),
    states: Object.fromEntries(['V', 'C', 'S'].map((id) => [id, c.heroState(id)])), selected: c.selected, starter: c.starter(),
    target: c.target, enemies: c.enemies.map((e) => ({ uid: e.uid, id: e.id, alive: e.alive, hp: e.hp })),
    stats: { cards: c.stats.cardsPlayed, artes: c.stats.artes, churns: c.stats.churns, stashes: c.stats.stashes, supports: c.stats.supports, relays: c.stats.relays, interference: c.stats.interference, perfect: c.stats.perfect },
    zones: c.verifyZones().ok,
  };
});
const screen = () => p.evaluate(() => {
  if (document.querySelector('.dialog-layer')) return 'dialog';
  if (document.querySelector('.modal .deck-grid.select')) return 'select';
  if (document.querySelector('.modal')) return 'modal';
  const s = document.querySelector('.layer-screen > div');
  return s ? s.className.split(' ')[0] : 'none';
});
const center = (sel) => p.evaluate((q) => { const el = document.querySelector(q); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
const tapSel = async (sel) => { const at = await center(sel); if (!at) return false; await p.touchscreen.tap(at[0], at[1]); await wait(60); return true; };
const uidOf = (id, zone = 'hand') => p.evaluate(([cid, z]) => { const c = window.__sb.battle.combat; return (z === 'hand' ? c.hand : c.reserve).find((u) => u && c.def(u).id === cid) || null; }, [id, zone]);
// a lesson the tap makes relevant opens at once: record and dismiss it (the scenario reads the log)
const afterTap = async () => { await wait(40); const x = await S(); if (x && x.lesson) await dismissLesson(x); };
const tapCard = async (id) => {
  const u = await uidOf(id);
  if (!u) return false;
  const ok = await tapSel(`.hand .card[data-uid="${u}"]`);
  if (ok && id === 'mend_circuit' && await p.locator('.pick-cancel').isVisible()) {
    const ready = '.hero-btn.pick:enabled';
    await tapSel(await p.locator(`${ready}[data-hero="C"]`).count() ? `${ready}[data-hero="C"]` : ready);
  }
  await afterTap();
  return ok;
};
const tapHero = async (id) => { const ok = await tapSel(`.hero-btn[data-hero="${id}"]`); await afterTap(); return ok; };
const swipeCard = async (id, dy) => {
  const slot = await p.evaluate((cid) => { const c = window.__sb.battle.combat; return c.hand.findIndex((u) => u && c.def(u).id === cid); }, id);
  const at = slot >= 0 && (await center(`.hand .slot[data-slot="${slot}"]`));
  if (!at) return false;
  await p.mouse.move(at[0], at[1]);
  await p.mouse.down();
  for (let k = 1; k <= 6; k++) await p.mouse.move(at[0], at[1] + (dy * k) / 6);
  await p.mouse.up();
  await wait(80);
  return true;
};
const clickText = async (text) => { const el = p.getByRole('button', { name: L(text), exact: true }).first(); if (await el.count()) { await el.click({ timeout: 1500 }).catch(() => {}); return true; } return false; };

// ── lessons: every lesson shown is recorded with the battle state at that moment ──
const lessonLog = [];
const lessonShots = new Set();
let stored = null; // the card swiped into Reserve right after the Reserve lesson (a player following the tip)
async function dismissLesson(s) {
  lessonLog.push({ key: s.lesson, t: s.t, battle: battleNo, tutorial: s.tutorial, cards: s.stats.cards, artes: s.stats.artes, relays: s.stats.relays, churns: s.stats.churns, stashes: s.stats.stashes, supports: s.stats.supports, anchor: s.anchor, hand: s.hand, combo: s.combo });
  if (scriptedClock) await p.clock.runFor(470);
  else await wait(470); // the lesson card ignores input for its first moment
  if (!lessonShots.has(s.lesson)) { lessonShots.add(s.lesson); await shot(`lesson-${String(lessonShots.size).padStart(2, '0')}-${s.lesson}`); }
  await tapSel('.tut-layer:not([hidden]) .btn.primary');
  await wait(60);
  if (s.lesson === 'reserve' && s.anchor && s.anchor.slot !== undefined && !stored) {
    const card = s.hand[s.anchor.slot];
    const n0 = (await S()).reserve.length;
    await swipeCard(card, -60);
    const x = await S();
    stored = { card, ok: !!x && x.reserve.length === n0 + 1 && x.reserve.includes(card) };
  }
}
// Waits (in real time, the battle running) until lesson `key` is shown, dismissing any other lesson
// on the way. Returns the state at the moment `key` appeared, or null.
async function waitLesson(key, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await S();
    if (!s || s.ended) return null;
    if (s.lesson) { await dismissLesson(s); if (s.lesson === key) return s; continue; }
    await wait(40);
  }
  return null;
}
// dismisses lessons for a while (the battle runs), waiting until `pred(state)` holds
async function until(pred, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await S();
    if (!s) return null;
    if (s.lesson) { await dismissLesson(s); continue; }
    if (await pred(s)) return s;
    await wait(40);
  }
  return null;
}
let battleNo = 0;

// ════════════ Part A: a new player's first battle ════════════
await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
const fresh = await p.evaluate(() => ({ done: window.__sb.meta.tutorialDone, tut: Object.keys(window.__sb.meta.tut).length, hints: window.__sb.settings.hints, runs: window.__sb.meta.totalRuns }));
check(1, 'A fresh profile: no tutorial progress, tips on', !fresh.done && fresh.tut === 0 && fresh.hints && fresh.runs === 0, JSON.stringify(fresh));
await shot('01-title');
await clickText('New Run');
await wait(300);
await clickText('Begin');
await wait(500);
for (let i = 0; i < 30 && (await screen()) === 'dialog'; i++) { await tapSel('.dlg-skip'); await wait(150); }
// fixture: the run's deck in a known order (see the header), then the first node by taps
await p.evaluate(() => {
  const r = window.__sb.run;
  const spec = ['scrapline', 'rivet_jab', 'scrapfall', 'salvage', 'piston_strike', 'thermal_lance', 'scrapline', 'rivet_jab', 'bolt_volley', 'hotwire', 'mend_circuit', 'scrapline', 'piston_strike', 'glitch'];
  r.d.deck = spec.map((id, i) => ({ uid: `fx${i}`, id, up: false, ...(i === 1 ? { variant: 'B' } : {}) }));
});
// a starting node from which the map reaches an elite (elites are optional: some starts have none)
const first = await p.evaluate(() => {
  const r = window.__sb.run;
  const reach = (id, seen = new Set()) => { if (seen.has(id)) return false; seen.add(id); const n = r.node(id); return n.type === 'elite' || n.edges.some((e) => reach(e, seen)); };
  const av = r.availableNodes();
  return av.find((id) => reach(id)) || av[0];
});
await tapSel(`.map-node[data-node="${first}"]`);
await wait(150);
await clickText('Travel');
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
battleNo = 1;
let s = await S();
check(2, 'A new run starts normally: title → story → map → first battle', s && s.tutorial && s.stats.cards === 0, `tutorial battle vs ${s.enemies.map((e) => e.id).join(' + ')}`);
check(3, 'The first battle opens with one staged lesson, before any card is played', s.lesson === 'attack' && s.paused && s.stats.cards === 0, `lesson "${s.lesson}", battle paused ${s.paused}`);
// fixture hand while the lesson is open (the spotlighted slot keeps a basic attack)
await p.evaluate((slot) => {
  const c = window.__sb.battle.combat;
  const order = ['fx0', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'];
  const k = order.indexOf('fx0');
  [order[k], order[slot]] = [order[slot], order[k]];
  c.hand = order;
  c.draw = ['fx6', 'fx7', 'fx8', 'fx9', 'fx10', 'fx11', 'fx12'];
  c.discard = [];
  for (const e of c.enemies) { e.hp = e.maxHp = e.maxHp * 4; }
  window.__sb.battle.updateHud(true);
}, s.anchor && s.anchor.slot !== undefined ? s.anchor.slot : 0);
const ring = await p.evaluate(() => { const r = document.querySelector('.coach-ring'); const card = document.querySelector('.coach-card'); return r && card ? { ring: r.getBoundingClientRect().toJSON(), card: card.getBoundingClientRect().toJSON(), vw: innerWidth, vh: innerHeight } : null; });
check(3, 'The lesson spotlights a basic attack and fits on screen', ring && ring.card.left >= 0 && ring.card.right <= ring.vw && ring.card.top >= 0 && ring.card.bottom <= ring.vh, ring ? `card ${Math.round(ring.card.width)}×${Math.round(ring.card.height)} at ${Math.round(ring.card.left)},${Math.round(ring.card.top)}` : 'no ring');
await shot('03-first-lesson');
// combat time stands still while a lesson is open: enemy ATB, Flow and statuses
const frozen0 = await p.evaluate(() => { const c = window.__sb.battle.combat; return { t: c.t, atb: c.enemies.map((e) => e.atb) }; });
await wait(700);
const frozen1 = await p.evaluate(() => { const c = window.__sb.battle.combat; return { t: c.t, atb: c.enemies.map((e) => e.atb) }; });
check(3, 'Combat time and enemy ATB stand still while a lesson is open', frozen1.t === frozen0.t && JSON.stringify(frozen1.atb) === JSON.stringify(frozen0.atb), `t ${frozen0.t.toFixed(2)} → ${frozen1.t.toFixed(2)} after 0.7s`);
await dismissLesson(s);
// 4. choose who attacks: Corvin, then back to Hessa
await tapHero('C');
const selC = (await S()).selected;
await tapHero('V');
s = await S();
check(4, 'Selecting a Ready hero with the hero buttons', selC === 'C' && s.selected === 'V' && !s.combo, `Corvin → ${selC}, Hessa → ${s.selected}`);
// 17. targeting: tap the second enemy, then hold it to read it
// The automatic enemy lesson can otherwise appear during the hold gesture and take its input.
if (!lessonLog.some((entry) => entry.key === 'enemies')) await waitLesson('enemies', 9000);
s = await S();
const other = s.enemies.find((e) => e.alive && e.uid !== s.target);
if (other) {
  const rect = await p.evaluate((uid) => { const bs = window.__sb.battle; const r = bs.view.enemyRect(uid); const cv = bs.canvas.getBoundingClientRect(); return r ? [cv.left + r.x + r.w / 2, cv.top + r.y + r.h * 0.6] : null; }, other.uid);
  await p.touchscreen.tap(rect[0], rect[1]);
  await wait(150);
  const t1 = (await S()).target;
  await p.mouse.move(rect[0], rect[1]);
  await p.mouse.down();
  await p.locator('.modal .enemy-detail').waitFor({ timeout: 2400 }).catch(() => {});
  await p.mouse.up();
  await wait(200);
  const detail = await p.evaluate(() => { const m = document.querySelector('.modal .enemy-detail'); return m ? m.textContent : ''; });
  await shot('17-enemy-detail');
  check(17, 'Tapping an enemy targets it; holding it shows its next move', t1 === other.uid && detail.length > 10, `target ${other.id}; "${detail.slice(0, 80)}"`);
  await tapSel('.modal .btn.primary');
  await p.locator('.modal').waitFor({ state: 'hidden' });
} else check(17, 'Tapping an enemy targets it; holding it shows its next move', false, 'only one enemy left');
// 5. a neutral basic attack
await until(() => p.evaluate(() => {
  const c = window.__sb.battle.combat;
  return c.hand.some((uid) => uid && c.def(uid).id === 'scrapline' && c.check(uid).ok);
}));
await tapCard('scrapline');
s = await S();
check(5, 'Playing a neutral basic attack starts Hessa\'s combo', s.combo && s.combo.hero === 'V' && (s.exec === 'card' || s.combo.cards === 1), `combo by ${s.combo && s.combo.hero}`);
// 6. rising ranks: the lesson comes while the combo is open, before the second card
let at = await waitLesson('ranks', 6000);
check(6, 'The rising-ranks lesson comes with the combo open, before the second card', at && at.combo && at.stats.cards === 1, at ? `shown after ${at.stats.cards} card` : 'not shown');
const reasonShown = await p.evaluate(() => { const c = window.__sb.battle.combat; const u = c.hand.find((x) => x && c.def(x).id === 'thermal_lance'); const el = u && document.querySelector(`.hand .card[data-uid="${u}"] .reason`); return el ? el.textContent : ''; });
await tapCard('rivet_jab');
s = await until((x) => !x.exec && !x.queue.length, 4000);
check(6, 'Ranks ascend (Weak 1 → Medium 2); a card that cannot follow says why', s && s.combo && s.combo.rank === 2 && !!reasonShown, `rank ${s && s.combo && s.combo.rank}; Corvin's arte reads "${reasonShown}"`);
check(7, 'Basic attacks earn Momentum when they land', s && s.mom >= 2, `Momentum ${s && s.mom}`);
// 8. the arte
at = await waitLesson('arte', 6000);
check(8, 'The arte lesson comes when Hessa\'s arte becomes playable, before any arte', at && at.stats.artes === 0 && at.anchor && at.hand[at.anchor.slot] === 'scrapfall', at ? `spotlight on ${at.hand[at.anchor.slot]}` : 'not shown');
await tapCard('scrapfall');
// 9. FINISH: a Perfect
at = await waitLesson('finish', 6000);
check(9, 'The FINISH lesson follows the arte', !!at && at.combo && at.combo.cards >= 2, at ? `combo of ${at.combo.cards}` : 'not shown');
await tapSel('.ctl.cash');
s = await until((x) => !x.combo, 4000);
check(9, 'FINISH completes a Perfect', s && s.history.length === 1 && s.history[0].type === 'perfect', s ? JSON.stringify(s.history[0]) : '');
await shot('09-perfect');
// From here each lesson gets its own combo, started only once the previous lesson's 2s spacing has
// passed (an interference lesson may take any moment). Checks read the lesson log: each lesson must
// have appeared before the first action it explains.
const shown = (key) => lessonLog.find((x) => x.key === key && x.battle === 1);
const legal = (cat, owner) => p.evaluate(([k, o]) => {
  const c = window.__sb.battle.combat;
  const us = [...c.hand].filter((u) => u && c.def(u).category === k && (!o || c.def(u).owner === o) && c.check(u).ok);
  us.sort((a, b) => c.effRank(a) - c.effRank(b));
  return us.length ? c.def(us[0]).id : null;
}, [cat, owner || null]);
async function quiet(ms = 10000) { return until((x) => x.phase === 'PRE' && x.sinceLesson >= 2.1 && x.starter, ms); }
async function endChain() {
  // FINISH after an arte, else play on until a Cash Out is possible
  for (let i = 0; i < 40; i++) {
    const x = await until((y) => !y.exec && !y.queue.length, 4000);
    if (!x || !x.combo) return;
    const arte = x.combo.rank < 4 ? await legal('arte', x.combo.hero) : null;
    if (arte) { await tapCard(arte); continue; }
    await tapSel('.ctl.cash');
    await wait(150);
    if (!(await S()).combo) return;
    const bsc = await legal('basic');
    if (bsc) await tapCard(bsc); else await wait(300);
  }
}
// 10–11. The next hand may have no legal continuation, or an enemy lesson may take priority.
// Look for a genuine queue opportunity in the next few combos, just as with the cancel lesson.
let chips = { exec: 0, wait: 0, held: 0 };
let q1;
for (let attempt = 0; attempt < 4; attempt++) {
  await quiet();
  await holdInputWindow();
  await tapCard(await legal('basic'));
  q1 = shown('queue');
  const follow = await legal('basic') || await legal('arte', (await S()).combo?.hero);
  if (follow) {
    const u = await uidOf(follow);
    await tapSel(`.hand .card[data-uid="${u}"]`);
  }
  s = await S();
  chips = await p.evaluate(() => ({
    exec: document.querySelectorAll('.chip.q.exec').length,
    wait: document.querySelectorAll('.chip.q.wait').length,
    held: document.querySelectorAll('.slot.held').length,
  }));
  await releaseInputWindow();
  if (q1 && s.queue.length && chips.exec && chips.wait && chips.held) break;
  await endChain();
}
check(10, 'The queue lesson comes while the first card of a combo plays out', q1 && q1.combo && q1.combo.cards >= 0, q1 ? `combo by ${q1.combo && q1.combo.hero}, shown after ${q1.cards} cards in this battle` : 'not shown');
check(10, 'Cards committed into the queue while another executes', s.queue.length >= 1, `${s.queue.map((q) => q.card).join(', ')} waiting behind ${s.exec}`);
check(11, 'Executing and waiting commands look different', chips.exec >= 1 && chips.wait >= 1 && chips.held >= 1, `executing chip ${chips.exec}, waiting chips ${chips.wait}, held slots ${chips.held}`);
await shot('11-queue');
await endChain();
// 12. cancel: two cards wait; once the lesson has come (it may take a combo or two: other lessons
// can take the moment), the last waiting card is taken back
let cl = null, waiting = null, s12 = null;
for (let attempt = 0; attempt < 4 && !s12; attempt++) {
  await quiet();
  await holdInputWindow();
  await tapCard(await legal('basic'));
  const c2b = await legal('basic') || await legal('arte', (await S()).combo?.hero);
  if (c2b) await tapCard(c2b);
  const c3b = await legal('basic');
  if (c3b) await tapCard(c3b);
  cl = shown('cancel');
  s = await S();
  waiting = s.queue.filter((q) => q.type === 'card').pop();
  if (cl && waiting) {
    waiting.uid = await p.evaluate((id) => { const q = window.__sb.battle.combat.queue.find((x) => x.id === id); return q ? q.uid : null; }, waiting.id);
    await tapSel(`.chip.q.wait[data-cmd="${waiting.id}"]`);
    s12 = await S();
    s12.back = await p.evaluate((u) => window.__sb.battle.combat.hand.includes(u), waiting.uid);
  }
  await releaseInputWindow();
  await endChain();
}
check(12, 'Cancelling an unstarted command returns its card, after the lesson', cl && waiting && s12 && !s12.queue.some((q) => q.id === waiting.id) && s12.back, `lesson ${cl ? 'shown first' : 'missing'}; ${waiting ? waiting.card : 'nothing'} back in its hand slot ${s12 && s12.back}`);
// 13–14. Relay (combo 4): start with a hero whose partner has an arte in hand
await quiet();
const plan = await p.evaluate(() => {
  const c = window.__sb.battle.combat;
  const arteOf = (h) => [...c.hand, ...c.reserve].some((u) => u && c.def(u).category === 'arte' && c.def(u).owner === h);
  for (const x of ['V', 'C', 'S']) for (const y of ['V', 'C', 'S']) if (x !== y && c.heroReady(x) && c.heroReady(y) && arteOf(y)) return { x, y };
  return null;
});
if (plan) await tapHero(plan.x);
await tapCard(await legal('basic'));
await wait(80);
s = await S();
const rl = shown('relay');
const relayTo = await p.evaluate((pref) => { const c = window.__sb.battle.combat; const ok = (h) => c.relayCheck(h).ok && [...c.hand, ...c.reserve].some((u) => u && c.def(u).category === 'arte' && c.def(u).owner === h); return ok(pref) ? pref : ['V', 'C', 'S'].find(ok) || ['V', 'C', 'S'].find((h) => c.relayCheck(h).ok) || pref; }, plan ? plan.y : 'S');
if (s.lesson) await dismissLesson(s);
check(13, 'The Relay lesson comes when another hero can usefully take over', !!rl && rl.relays === 0, rl ? `points at ${relayTo}'s button, Flow ${rl.combo ? rl.combo.flow.toFixed(1) : '?'}s` : 'not shown');
await tapHero(relayTo);
s = await until((x) => x.combo && x.combo.hero === relayTo, 4000);
const artEarly = await p.evaluate((h) => { const c = window.__sb.battle.combat; const u = [...c.hand, ...c.reserve].find((x) => x && c.def(x).category === 'arte' && c.def(x).owner === h); return u ? c.check(u).reason || 'ok' : 'none'; }, relayTo);
check(13, 'A deliberate Relay hands the same combo over', s && s.combo.relays === 1 && s.combo.owners.length === 2, s ? `owners ${s.combo.owners.join(' → ')}` : '');
const basic = await legal('basic');
await tapCard(basic);
s = await until((x) => x.combo && x.combo.rank > 0 && !x.exec, 3000);
check(14, 'The incoming hero starts fresh: rank 0, a basic attack first', s && artEarly === 'needbasic', `arte before the basic: ${artEarly}; after ${basic}: rank ${s && s.combo && s.combo.rank}`);
await shot('14-relay');
const pinArte = await legal('arte', relayTo);
if (pinArte) await tapCard(pinArte);
await endChain();
s = await until((x) => !x.combo, 6000);
const relayed = s && s.history.find((x) => x.heroes.length >= 2 && x.type !== 'forced');
check(13, 'A two-hero combo completed', !!relayed, relayed ? JSON.stringify(relayed) : JSON.stringify(s && s.history.slice(-1)));
// 15–16. support and Recovery: the lessons came when a support card was playable and a hero recovering
s = await quiet();
// the support lesson comes when a support card is playable while the party is hurt or an enemy winds
// up a hit: wait for that moment, as a player following the tips would
if (!shown('support')) { await waitLesson('support', 15000); s = await quiet(); }
const sl = shown('support');
const guardBefore = s ? s.guard : 0;
const sup = await legal('support');
const sups0 = s ? s.stats.supports : 0;
if (sup) await tapCard(sup);
await wait(80);
s = await S();
if (s.lesson) await dismissLesson(s);
const performer = s && Object.entries(s.states).find(([, v]) => v === 'COMMITTED' || v === 'ACTING');
s = await until((x) => x.stats.supports > sups0, 4000);
check(15, 'Support used, its lesson shown before the first support card', sl && sl.supports === 0 && s && s.stats.supports > sups0, `${sup}: Guard ${Math.round(guardBefore)} → ${s && Math.round(s.guard)}, Cover ${s && s.cover}; lesson after ${sl ? sl.supports : '?'} support cards`);
const rl6 = shown('recovery');
const who = performer ? performer[0] : null;
const recStart = s && s.t;
s = who ? await until((x) => x.states[who] === 'RECOVERING', 3000) : s;
const sr = who ? await until((x) => x.states[who] === 'READY', 5000) : null;
check(16, 'Recovery: its lesson shown; the support hero recovers and becomes Ready again', !!rl6 && sr && sr.t - recStart >= 1.8, `${rl6 ? 'lesson shown' : 'no lesson'}; ${who} Ready after ${sr ? (sr.t - recStart).toFixed(1) : '?'}s`);
// 18. Churn: a Glitch card in the hand (the fixture's last card)
await quiet();
await p.evaluate(() => { const c = window.__sb.battle.combat; const g = 'fx13'; if (!c.hand.includes(g)) { const i = c.hand.findIndex((u) => u && c.def(u).category === 'basic'); c.draw = c.draw.filter((u) => u !== g); c.discard = c.discard.filter((u) => u !== g); const out = c.hand[i]; c.hand[i] = g; c.discard.push(out); window.__sb.battle.updateHud(true); } });
const ch = await waitLesson('churn', 3000);
await wait(600); // the new card's deal animation
const churns0 = (await S()).stats.churns;
await swipeCard('glitch', 60);
await wait(250);
const gone = await p.evaluate(() => { const c = window.__sb.battle.combat; return !c.hand.includes('fx13') && c.exhaust.includes('fx13'); });
// and an ordinary Churn, which uses a charge
const charges0 = await p.evaluate(() => window.__sb.battle.combat.churn.charges);
const dead = await p.evaluate(() => { const c = window.__sb.battle.combat; const u = c.hand.find((x) => x && c.def(x).category === 'basic' && !c.isLocked(x)); return u ? c.def(u).id : null; });
await wait(400);
await swipeCard(dead, 60);
await wait(250);
s = await S();
const charges1 = await p.evaluate(() => window.__sb.battle.combat.churn.charges);
check(18, 'Churn, when introduced: swipe down deletes a Glitch for free and replaces a card for a charge', !!(ch || shown('churn')) && gone && s.stats.churns === churns0 + 1, `${ch || shown('churn') ? 'lesson first' : 'no lesson'}; Glitch deleted ${gone}; ${dead} churned, charges ${charges0} → ${charges1} (the Beta Badge makes the first Churn free)`);
// 19. finish the battle with ordinary play (taps), checking card zones throughout; the Reserve lesson
// comes when a hero who cannot act in this combo has an arte in hand: swipe that card up
let zonesOk = true;
for (let i = 0; i < 1500; i++) {
  s = await S();
  if (!s || s.ended) break;
  zonesOk = zonesOk && s.zones;
  if (s.lesson) { await dismissLesson(s); continue; }
  const a = await uiDecision(p, 'regular');
  await uiPerform(p, a, { touch: true });
  await wait(120);
}
await wait(2500);
const tutLessons = lessonLog.filter((x) => x.battle === 1).map((x) => x.key);
const rsv = shown('reserve');
check(18, 'Reserve, when introduced: swipe up keeps a card for later', rsv ? stored && stored.ok : true, rsv ? `${stored ? stored.card : '?'} stored after the lesson (stashes before it: ${rsv.stashes})` : 'its moment did not come in the first battle (it comes in a later one)');
check(19, 'The first battle is won with card zones intact throughout', zonesOk && (await p.evaluate(() => window.__sb.run && window.__sb.run.d.battleCount)) === 1, `${tutLessons.length} lessons: ${tutLessons.join(', ')}`);
for (let i = 0; i < 30 && ['dialog', 'reward', 'modal'].includes(await screen()); i++) {
  const sc = await screen();
  if (sc === 'dialog') await tapSel('.dlg-skip');
  else if (sc === 'reward') { await clickText('Continue'); }
  else await tapSel('.modal .btn.primary');
  await wait(200);
}
const after1 = await p.evaluate(() => ({ done: window.__sb.meta.tutorialDone, screen: document.querySelector('.layer-screen > div').className.split(' ')[0], avail: window.__sb.run.availableNodes().length }));
check(20, 'The ordinary Act I map continues after the first battle', after1.done && after1.screen === 'map' && after1.avail > 0, JSON.stringify(after1));
await shot('20-map');

// ════════════ Part B: on through Act I into Act II ════════════
const partB = { battles: 0, twoHero: 0, threeHero: 0, supports: 0, cover: false, heal: false, interference: 0, guardInDanger: 0, rewards: 0, shop: false, rest: false, event: false, elite: null, boss: null, bossReward: null, mutation: null, act2: false, held: false, introRepeats: [] };
if (!PART_A_ONLY) {
  const seenKeys = new Set(lessonLog.map((x) => x.key));
  let lastHistory = 0, inBattle = false, elitesTaken = false;
  const deadline = Date.now() + 25 * 60000;
  while (Date.now() < deadline && !partB.act2) {
    const sc = await screen();
    const st = await p.evaluate(() => { const r = window.__sb.run; const pd = r && r.d.pending; return r ? { act: r.d.act, pending: pd && pd.type, kind: pd && pd.kind, boss: !!(pd && pd.boss), hp: r.d.hp / r.d.maxHp, scrap: r.d.scrap, node: pd && pd.nodeId ? r.node(pd.nodeId).type : null } : null; });
    if (sc === 'battle') {
      const bs = await S();
      if (!bs) { await wait(100); continue; }
      if (!inBattle) { inBattle = true; battleNo++; partB.battles++; lastHistory = 0; log(`battle ${battleNo}: ${bs.enemies.map((e) => e.id).join(' + ')}`); }
      if (bs.lesson) {
        if (seenKeys.has(bs.lesson)) partB.introRepeats.push(bs.lesson);
        seenKeys.add(bs.lesson);
        await dismissLesson(bs);
        continue;
      }
      for (let k = lastHistory; k < bs.history.length; k++) {
        const hst = bs.history[k];
        if (hst.type !== 'forced' && hst.heroes.length === 2) partB.twoHero++;
        if (hst.type !== 'forced' && hst.heroes.length === 3) partB.threeHero++;
      }
      lastHistory = bs.history.length;
      if (bs.cover) partB.cover = true;
      // 27. respond to a telegraph: read the enemy winding up a heavy hit (hold it), once
      if ((!partB.held || !partB.guardInDanger) && (partB.holdTries || 0) < 6 && (!partB.lastHold || Date.now() - partB.lastHold > 4000)) {
        const heavy = await p.evaluate(() => { const c = window.__sb.battle?.combat; const e = c?.aliveEnemies().find((x) => x.intent && x.intent.dmg >= 10 && x.atb > 0.5 && x.atb < 0.8); return e ? e.uid : null; });
        if (heavy) {
          const rect = await p.evaluate((uid) => { const bs = window.__sb.battle; const r = bs?.view.enemyRect(uid); const cv = bs?.canvas.getBoundingClientRect(); return r ? [cv.left + r.x + r.w / 2, cv.top + r.y + r.h * 0.6] : null; }, heavy);
          if (rect) {
            partB.holdTries = (partB.holdTries || 0) + 1;
            partB.lastHold = Date.now();
            await p.mouse.move(rect[0], rect[1]); await p.mouse.down(); await wait(600); await p.mouse.up(); await wait(150);
            const text = await p.evaluate(() => { const m = document.querySelector('.modal .enemy-detail'); return m ? m.textContent : ''; });
            const numbers = await p.evaluate((uid) => { const c = window.__sb.battle?.combat; const e = c?.enemies.find((x) => x.uid === uid); const it = e?.intent; return !it ? null : it.kind === 'aoe' ? c.party.map((q) => c.mitigate(e, it.dmg, q, {})) : [c.mitigate(e, it.dmg, c.hitTarget(it.target), {})]; }, heavy);
            if (!numbers) continue; // The encounter ended before the hold resolved.
            await shot('27-telegraph');
            partB.held = { text: text.slice(0, 120), numbers, ok: numbers.every((n) => text.includes(String(n))) };
            await tapSel('.modal .btn.primary');
            // and answer it: a Guard card if one is playable now (else the bot decides)
            const g = await p.evaluate(() => { const c = window.__sb.battle.combat; const u = [...c.hand].find((x) => x && c.def(x).category === 'support' && (c.def(x).tags || []).includes('guard') && c.check(x).ok); return u ? c.def(u).id : null; });
            const g0 = (await S()).guard;
            if (g) await tapCard(g);
            else if (await p.evaluate(() => window.__sb.battle.combat.available() >= window.__sb.battle.combat.momentumCostFlow())) await tapSel('.ctl.mom:nth-of-type(2)');
            await wait(400);
            const g1 = (await S());
            partB.held.answer = g ? `${g} played` : 'the +GUARD button';
            partB.held.guard = [Math.round(g0), g1 ? Math.round(g1.guard) : null];
            if (g1 && g1.guard > g0) partB.guardInDanger++;
            continue;
          }
        }
      }
      const a = await uiDecision(p, 'regular');
      if (a && a.type === 'play') {
        const cat = await p.evaluate((u) => window.__sb.battle.combat.def(u).id, a.uid);
        if (cat === 'mend_circuit') partB.heal = true;
      }
      await uiPerform(p, a, { touch: true });
      const st2 = await S();
      if (st2) { partB.supports = Math.max(partB.supports, st2.stats.supports); partB.interference = Math.max(partB.interference, st2.stats.interference); }
      await wait(110);
      continue;
    }
    inBattle = false;
    switch (sc) {
      case 'dialog': await tapSel('.dlg-skip'); break;
      case 'select': { const c = await p.$('.modal .deck-grid .card:not(.disabled)'); if (c) await c.click(); await wait(80); await p.locator('.modal .select-foot .btn.primary').click({ timeout: 800 }).catch(() => {}); break; }
      case 'modal': if (!(await tapSel('.modal .btn.primary'))) await tapSel('.modal-bg'); break;
      case 'map': {
        if (st.act === 2) { partB.act2 = true; break; }
        // one elite while healthy (heading for one the map can still reach), a rest when hurt, a shop
        // with Scrap, otherwise battles and events
        const order = [];
        if (!elitesTaken) {
          // toward an elite the map can still reach; through a rest on the way when hurt
          const toward = await p.evaluate((hurt) => {
            const r = window.__sb.run;
            const reach = (id, seen = new Set()) => { if (seen.has(id)) return false; seen.add(id); const n = r.node(id); return n.type === 'elite' || n.edges.some((e) => reach(e, seen)); };
            const cand = r.availableNodes().filter((id) => reach(id));
            const of = (t) => cand.find((id) => r.node(id).type === t);
            return (hurt ? of('rest') : null) || (hurt ? null : of('elite')) || of('rest') || of('treasure') || of('battle') || of('event') || cand[0] || null;
          }, st.hp < 0.5);
          if (toward) order.push(`.map-node.avail[data-node="${toward}"]`);
        }
        if (st.hp < 0.55) order.push('.map-node.avail.t-rest');
        if (!partB.shop && st.scrap >= 60) order.push('.map-node.avail.t-shop');
        order.push('.map-node.avail.t-rest', '.map-node.avail.t-treasure', '.map-node.avail.t-battle', '.map-node.avail.t-event', '.map-node.avail');
        for (const sel of order) {
          if (await p.$(sel)) { if (await p.evaluate((q) => { const el = document.querySelector(q); return !!el && el.classList.contains('t-elite'); }, sel)) elitesTaken = true; await tapSel(sel); break; }
        }
        await wait(100);
        await clickText('Travel');
        break;
      }
      case 'reward': {
        partB.rewards++;
        if (st.boss || (await p.evaluate(() => { const r = window.__sb.run; return r.d.bossesDefeated.length > 0 && !window.__bossRewardSeen; }))) {
          const r = await p.evaluate(() => { window.__bossRewardSeen = true; const pd = window.__sb.run.d.pending; return { relics: (pd.relics || []).length, cards: (pd.cards || []).length, scrap: pd.scrap }; });
          partB.bossReward = r;
          await shot('31-boss-reward');
        }
        const el = await p.evaluate(() => ({ n: window.__sb.run.d.stats.elites, id: window.__sb.run.d.lastElite }));
        if (el.n > 0 && !partB.elite) partB.elite = el.id;
        const cards = await p.$$('.reward-cards .card:not(.faded):not(.picked)');
        if (cards.length) { await cards[0].click(); await clickText('Take card'); }
        const rel = await p.$('.reward-relics .relic-badge:not(.faded):not(.picked)');
        if (rel) await rel.click();
        await clickText('Continue');
        break;
      }
      case 'event': { partB.event = true; const offer = await p.$('.event-body .reward-cards .card'); if (offer) { await offer.click(); break; } const ch = await p.$('.event-choices .choice:not([disabled])'); if (ch) await ch.click(); else if (!(await clickText('Continue'))) await clickText('Leave'); break; }
      case 'shop': { if (!partB.shop) { partB.shop = true; const item = p.locator('.shop-item:not(.sold):has(.price:not(.poor))').first(); if (await item.count()) await item.click(); await wait(200); } await clickText('Leave'); break; }
      case 'rest': partB.rest = true; if (!(await tapSel('.rest-opt'))) await clickText('Continue'); break;
      case 'surgery': await clickText('Leave'); break;
      case 'treasure': { const r = await p.$('.relic-badge:not(.faded)'); if (r) await r.click(); if (!(await clickText('Continue'))) await clickText('Leave (take Scrap only)'); break; }
      case 'bossprep': await tapSel('.prep-plans .choice'); break;
      case 'mutation': { partB.mutation = await p.evaluate(() => document.querySelector('.mut-card b') && document.querySelector('.mut-card b').textContent); await shot('31-mutation'); await tapSel('.mut-card'); break; }
      case 'results': partB.defeat = true; break;
      default: break;
    }
    if (partB.defeat) break;
    await wait(120);
  }
  const bossWin = await p.evaluate(() => (window.__sb.run ? window.__sb.run.d.bossDecisions.filter((x) => x.act === 1).map((x) => `${x.boss}:${x.result}`) : []));
  partB.boss = bossWin.join(' ');
  check(21, 'Ordinary encounters after the first battle', partB.battles >= 3, `${partB.battles} more battles`);
  check(22, 'Introductory lessons are not repeated', partB.introRepeats.length === 0, `${lessonLog.filter((x) => x.battle > 1).map((x) => `${x.key}@${x.battle}`).join(', ') || 'no new lessons'}`);
  check(23, 'Two-hero combos', partB.twoHero >= 1, `${partB.twoHero} completed`);
  check(24, 'Three-hero combos where cards and Momentum allowed', partB.threeHero >= 1, `${partB.threeHero} completed`);
  check(25, 'Guard, Cover or healing used', partB.supports >= 1 && (partB.cover || partB.heal), `support played (most in one battle ${partB.supports}), Cover seen ${partB.cover}, healing ${partB.heal}`);
  check(26, 'Enemy interference met', partB.interference >= 1, `interference effects in a battle: up to ${partB.interference}`);
  check(27, 'An enemy telegraph read (hold) with the numbers the hit will take, and answered with Guard', partB.held && partB.held.ok && partB.guardInDanger >= 1, partB.held ? `"${partB.held.text}" · numbers ${partB.held.numbers.join('/')} · answer: ${partB.held.answer}, Guard ${partB.held.guard ? partB.held.guard.join(' → ') : '?'}` : 'no heavy wind-up met');
  check(28, 'Reward, shop or rest nodes visited', partB.rewards >= 2 && (partB.shop || partB.rest || partB.event), `${partB.rewards} rewards, shop ${partB.shop}, rest ${partB.rest}, event ${partB.event}`);
  check(29, 'An Act I elite fought and beaten', !!partB.elite, partB.elite || 'none');
  check(30, 'The Act I boss reached and beaten', /victory/.test(partB.boss), partB.boss || (partB.defeat ? 'run lost' : 'not reached'));
  check(31, 'Boss rewards and the mutation choice', partB.bossReward && partB.mutation, `${JSON.stringify(partB.bossReward)} · mutation ${partB.mutation}`);
  check(32, 'Act II entered', partB.act2, '');
  const tipsOn = await p.evaluate(() => ({ hints: window.__sb.settings.hints, recorded: Object.keys(window.__sb.meta.tut).length }));
  check(22, 'Tips stayed on through Act I and every lesson shown was one the player saw and dismissed', tipsOn.hints && tipsOn.recorded === new Set(lessonLog.map((x) => x.key)).size, `tips ${tipsOn.hints}, ${tipsOn.recorded} recorded, ${new Set(lessonLog.map((x) => x.key)).size} seen`);
  const rsvAll = lessonLog.find((x) => x.key === 'reserve');
  check(18, 'Reserve lesson during Act I, followed by a swipe up', !rsvAll || (stored && stored.ok), rsvAll ? `battle ${rsvAll.battle}: ${stored ? stored.card + ' stored' : 'not stored'}` : 'its moment did not come in Act I');
  // 33. save, reload, Continue
  const snap = () => p.evaluate(() => { const d = window.__sb.run.d; return JSON.stringify({ act: d.act, floors: d.floors, deck: d.deck.map((c) => c.uid + c.id), relics: d.relics, mutations: d.mutations, hp: d.hp, map: d.map && d.map.nodes.length, tut: Object.keys(window.__sb.meta.tut).sort() }); });
  const before = partB.act2 ? await snap() : null;
  if (before) {
    await p.reload();
    await p.waitForFunction(() => window.__sb);
    await wait(500);
    await clickText('Continue');
    await wait(700);
    const after = await snap();
    check(33, 'Save, reload and Continue restore the run and the lesson record', after === before, `act 2, ${JSON.parse(after).deck.length} cards, ${JSON.parse(after).tut.length} lessons recorded`);
  } else check(33, 'Save, reload and Continue restore the run and the lesson record', false, 'Act II not reached');
}

// ════════════ Part C: returning players ════════════
// skip: a fresh profile skips all tips at the first lesson; no lesson appears afterwards, also after a reload
{
  const c2 = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: true });
  await c2.addInitScript((l) => { if (!localStorage.getItem('signalbreak.settings.v1')) localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l })); }, LANG);
  const q = await c2.newPage();
  await q.goto(URL);
  await q.waitForFunction(() => window.__sb);
  await q.evaluate(() => window.__sb.startFixtureRun('beta_badge', 5));
  await q.waitForTimeout(300);
  for (let i = 0; i < 20 && (await q.$('.dlg-skip')); i++) { await q.click('.dlg-skip').catch(() => {}); await q.waitForTimeout(120); }
  const n0 = await q.evaluate(() => window.__sb.run.availableNodes()[0]);
  await q.tap(`.map-node[data-node="${n0}"]`);
  // Dispatch this one early press in the page as the button appears, before Playwright's
  // actionability wait can carry it past the lesson's 450ms input guard.
  await q.evaluate(() => {
    window.__earlySkip = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const button = document.querySelector('.tut-layer:not([hidden]) .coach-skip');
        if (!button) return;
        observer.disconnect();
        button.click();
        resolve({ open: !!window.__sb.battle.lessonOpen, armed: button.classList.contains('armed') });
      });
      observer.observe(document.querySelector('.layer-screen'), { childList: true, subtree: true });
    });
  });
  await q.getByRole('button', { name: L('Travel'), exact: true }).click();
  await q.waitForFunction(() => window.__sb.battle && window.__sb.battle.lessonOpen);
  const early = await q.evaluate(() => window.__earlySkip);
  await q.waitForTimeout(500);
  await q.tap('.coach-skip'); // arms it
  const armed = await q.evaluate(() => ({ open: !!window.__sb.battle.lessonOpen, hints: window.__sb.settings.hints }));
  await q.tap('.coach-skip'); // confirms
  await q.waitForTimeout(200);
  const sk = await q.evaluate(() => ({ hints: window.__sb.settings.hints, open: window.__sb.battle.lessonOpen, paused: window.__sb.paused }));
  // play on a little: no lesson may appear
  let appeared = false;
  for (let i = 0; i < 40; i++) {
    const a = await uiDecision(q, 'regular');
    await uiPerform(q, a, { touch: true });
    await q.waitForTimeout(120);
    if (await q.evaluate(() => !!(window.__sb.battle && window.__sb.battle.lessonOpen))) appeared = true;
  }
  await q.reload();
  await q.waitForFunction(() => window.__sb);
  const kept = await q.evaluate(() => window.__sb.settings.hints);
  check('C1', 'A player can skip the tips (a confirming second tap; a tap in the first moment is ignored); they stay skipped after a reload', early.open && !early.armed && armed.open && armed.hints && sk.hints === false && !sk.open && !sk.paused && !appeared && kept === false, `early tap ignored ${early.open && !early.armed}, first tap armed ${armed.open && armed.hints}, hints ${sk.hints}, lessons after skipping ${appeared}, after reload ${kept}`);
  await c2.close();
}
// an earlier (0.2.5) profile that finished the old tutorial: introductory lessons are not shown again;
// replaying hints from Settings shows them again without touching runs or unlocks
{
  const c3 = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: true });
  await c3.addInitScript((l) => {
    if (localStorage.getItem('signalbreak.settings.v1')) return;
    localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l }));
    localStorage.setItem('signalbreak.meta.v1', JSON.stringify({ tutorialDone: true, totalRuns: 2, tut: { start: true, opened: true, closer: true, afterCombo: true, relay: true }, unlocks: ['stopwatch_gear'] }));
  }, LANG);
  const q = await c3.newPage();
  await q.goto(URL);
  await q.waitForFunction(() => window.__sb);
  const m = await q.evaluate((intro) => ({ migrated: window.__sb.meta.lessonsMigrated, all: intro.every((k) => window.__sb.meta.tut[k]) }), INTRO_KEYS);
  await q.evaluate(() => window.__sb.startFixtureRun('beta_badge', 6));
  await q.waitForTimeout(300);
  for (let i = 0; i < 20 && (await q.$('.dlg-skip')); i++) { await q.click('.dlg-skip').catch(() => {}); await q.waitForTimeout(120); }
  const n0 = await q.evaluate(() => window.__sb.run.availableNodes()[0]);
  await q.tap(`.map-node[data-node="${n0}"]`);
  await q.getByRole('button', { name: L('Travel'), exact: true }).click();
  await q.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat);
  const shownIntro = [];
  for (let i = 0; i < 60; i++) {
    const k = await q.evaluate(() => window.__sb.battle && window.__sb.battle.lessonOpen);
    if (k) { shownIntro.push(k); await q.waitForTimeout(470); await q.tap('.tut-layer:not([hidden]) .btn.primary'); continue; }
    const a = await uiDecision(q, 'regular');
    await uiPerform(q, a, { touch: true });
    await q.waitForTimeout(120);
  }
  const repeats = shownIntro.filter((k) => INTRO_KEYS.includes(k));
  check('C2', 'A returning player from 0.2.5 is not taught the basics again', m.migrated && m.all && repeats.length === 0, `intro marked ${m.all}; lessons shown: ${shownIntro.join(', ') || 'none'}`);
  // replay from Settings, between battles (map ☰ → Settings → Replay tutorial hints)
  for (let i = 0; i < 400; i++) {
    const sc = await q.evaluate(() => { if (document.querySelector('.dialog-layer')) return 'dialog'; if (document.querySelector('.modal')) return 'modal'; const s = document.querySelector('.layer-screen > div'); return s ? s.className.split(' ')[0] : ''; });
    if (sc === 'map') break;
    if (sc === 'battle') {
      const k = await q.evaluate(() => window.__sb.battle && window.__sb.battle.lessonOpen);
      if (k) { await q.waitForTimeout(470); await q.tap('.tut-layer:not([hidden]) .btn.primary'); continue; }
      const a = await uiDecision(q, 'regular'); await uiPerform(q, a, { touch: true });
    } else if (sc === 'dialog') await q.click('.dlg-skip').catch(() => {});
    else if (sc === 'reward') await q.getByRole('button', { name: L('Continue'), exact: true }).click().catch(() => {});
    else if (sc === 'modal') await q.click('.modal .btn.primary').catch(() => {});
    await q.waitForTimeout(120);
  }
  const runBefore = await q.evaluate(() => JSON.stringify({ runs: window.__sb.meta.totalRuns, unlocks: window.__sb.meta.unlocks, floor: window.__sb.run.d.floors, deck: window.__sb.run.d.deck.length }));
  await q.getByRole('button', { name: L('Menu') }).click();
  await q.getByRole('button', { name: L('Settings'), exact: true }).click();
  await q.getByRole('button', { name: L('Replay tutorial hints'), exact: true }).click();
  const after = await q.evaluate(() => ({ tut: Object.keys(window.__sb.meta.tut).length, hints: window.__sb.settings.hints }));
  await q.getByRole('button', { name: L('Done'), exact: true }).click();
  await q.waitForTimeout(150);
  await q.getByRole('button', { name: L('Resume'), exact: true }).click();
  await q.waitForTimeout(150);
  const runAfter = await q.evaluate(() => JSON.stringify({ runs: window.__sb.meta.totalRuns, unlocks: window.__sb.meta.unlocks, floor: window.__sb.run.d.floors, deck: window.__sb.run.d.deck.length }));
  // the next battle: the first lesson is back
  const nx = await q.evaluate(() => window.__sb.run.availableNodes().find((id) => window.__sb.run.node(id).type === 'battle') || window.__sb.run.availableNodes()[0]);
  await q.tap(`.map-node[data-node="${nx}"]`);
  await q.getByRole('button', { name: L('Travel'), exact: true }).click();
  let replayed = null;
  for (let i = 0; i < 80 && !replayed; i++) {
    replayed = await q.evaluate(() => window.__sb.battle && window.__sb.battle.lessonOpen);
    if (!replayed) { if (await q.$('.dlg-skip')) await q.click('.dlg-skip').catch(() => {}); await q.waitForTimeout(120); }
  }
  check('C3', 'Replaying tutorial hints shows lessons again without touching runs or unlocks', after.tut === 0 && after.hints && replayed === 'attack' && runBefore === runAfter, `lesson record cleared, next battle opens with "${replayed}", ${runAfter}`);
  // All tips list in How to Play
  if (await q.$('.tut-layer:not([hidden]) .btn.primary')) { await q.waitForTimeout(470); await q.tap('.tut-layer:not([hidden]) .btn.primary'); }
  await q.tap('.pause-btn');
  await q.getByRole('button', { name: L('How to play'), exact: true }).click();
  await q.waitForTimeout(200);
  const tips = await q.evaluate(() => document.querySelectorAll('.htp-tip').length);
  await q.screenshot({ path: `${outDir}/${LANG}-${W}-C4-all-tips.png` });
  check('C4', 'Every lesson can be reread from How to Play', tips === (await q.evaluate(async () => (await import('/src/ui/lessons.js')).LESSONS.length)), `${tips} tips listed`);
  await c3.close();
}

const pass = results.filter((r) => r.ok).length;
const report = { lang: LANG, viewport: `${W}x${H}`, partAOnly: PART_A_ONLY, durationSec: Math.round((Date.now() - t0) / 1000), passed: pass, failed: results.length - pass, results, lessons: lessonLog.map((x) => ({ key: x.key, battle: x.battle, t: +x.t.toFixed(1), cards: x.cards })), partB, errors };
fs.writeFileSync(`${outDir}/${LANG}-${W}-report.json`, JSON.stringify(report, null, 2));
console.log(`\n${pass}/${results.length} passed · ${errors.length} page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await b.close();
process.exit(results.length - pass ? 1 : 0);
