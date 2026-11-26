// Phase 5 acceptance demonstration (docs/COMBAT_SPEC.md §7, §9, §10, §13, §16), through the interface
// only: taps on cards, hero buttons, queue chips and FINISH; the bot policy (tools/lib/uibot.mjs)
// finishes the encounter with taps too. The engine is read for the checks, never driven.
//
// Fixture (disclosed): a fresh run (seed 1) whose first battle is set up deterministically before it
// starts — the encounter is one Foundry Warden (normal-tier HP, so the long chain does not end the
// fight at once) and the deck is stacked so the opening hand holds Hessa's Weak A1 → Medium B2 →
// Scrapfall, Corvin's Thermal Lance, Pin's Bolt Volley and a Strong basic attack, with Salvage and
// Mend Circuit next in the draw pile. Every battle action after that is a tap.
//
//  1 all heroes Ready · 2 select Hessa · 3 commit Weak · 4 it enters the execution pipeline ·
//  5 queue Medium while Weak executes · 6 ordered execution, Momentum · 7 Hessa's arte · 8 no
//  premature ending · 9 Relay to Corvin · 10 a distinct Relay command · 11 Hessa recovers ·
//  12 Corvin active · 13 Corvin's basic · 14 Corvin's arte · 15 Relay to Pin · 16 Corvin recovers ·
//  17 Pin's basic · 18 Pin's arte · 19 Perfect · 20 history: three heroes, two Relays · 21 Momentum ·
//  22 execution did not cost decision time · 23 the queue was visible and controllable · 24 support
//  and its performer's Recovery · 25 cancel a waiting command, reservation returned · 26 enemy ATB
//  runs while a hero recovers · 27 the breather freezes it · 28 win by ordinary play · 29 reward ·
//  30 save, reload, Continue · 31 the next encounter starts clean
//
// Usage: node tools/accept5.mjs [outDir] [lang=en] [WxH=844x390]   (needs npm run serve on port 8123)
import { SAVE_VERSION } from '../src/engine/run.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { RU } from '../src/i18n/ru.js';
import { uiDecision, uiPerform } from './lib/uibot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] || 'accept5-out';
const LANG = process.argv[3] || 'en';
const [W, H] = (process.argv[4] || '844x390').split('x').map(Number);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(out, { recursive: true });
const L = (k) => (LANG === 'ru' && RU.ui[k]) || k;
const results = [];
const check = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + info : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true });
await ctx.addInitScript((l) => { if (!localStorage.getItem('signalbreak.settings.v1')) localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l, hints: false })); }, LANG);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const shot = (name) => p.screenshot({ path: `${out}/${LANG}-${W}-${name}.png` });
const wait = (ms) => p.waitForTimeout(ms);

await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.saveMeta(); a.startFixtureRun('beta_badge', 1); });
await wait(400);
for (let i = 0; i < 20 && (await p.$('.dlg-skip')); i++) { await p.click('.dlg-skip').catch(() => {}); await wait(150); }
// fixture: the stacked deck and the encounter (see the header)
await p.evaluate(() => {
  const app = window.__sb;
  const r = app.run;
  const spec = [['scrapline', 'A'], ['rivet_jab', 'B'], ['scrapfall'], ['thermal_lance'], ['bolt_volley'], ['piston_strike', 'A'],
    ['scrapline', 'B'], ['salvage'], ['mend_circuit'], ['rivet_jab', 'A'], ['scrapline', 'A'], ['hotwire', 'B'], ['piston_strike', 'B']];
  r.d.deck = spec.map(([id, variant], i) => ({ uid: `fx${i}`, id, up: false, ...(variant ? { variant } : {}) }));
  r.enterNode('n1_0');
  r.d.pending.enemies = ['foundry_warden'];
  app.route();
});
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat);
await p.evaluate(() => {
  const c = window.__sb.battle.combat;
  c.hand = ['fx0', 'fx1', 'fx2', 'fx3', 'fx4', 'fx5'];
  c.draw = ['fx6', 'fx7', 'fx8', 'fx9', 'fx10', 'fx11', 'fx12'];
  c.discard = [];
  window.__sb.battle.updateHud(true);
});
await wait(500);

// read-only views of the engine
const S = () => p.evaluate(() => {
  const c = window.__sb.battle && window.__sb.battle.combat;
  if (!c) return null;
  return {
    phase: c.phase, t: c.t, selected: c.selected, momentum: c.momentum, reserved: c.reserved, available: c.available(),
    heroes: Object.fromEntries(['V', 'C', 'S'].map((h) => [h, c.heroState(h)])), recover: Object.fromEntries(['V', 'C', 'S'].map((h) => [h, c.recoverLeft(h)])),
    queue: c.queue.map((q) => ({ id: q.id, type: q.type, uid: q.uid || null, hero: q.hero, to: q.to || null, cost: q.cost })),
    exec: c.executing ? { type: c.executing.cmd.type, uid: c.executing.cmd.uid || null, resolved: c.executing.resolved, hero: c.executing.cmd.hero, to: c.executing.cmd.to || null } : null,
    combo: c.combo ? { hero: c.combo.hero, rank: c.combo.rank, relays: c.combo.relays, owners: c.combo.owners.slice(), cards: c.combo.cards.map((e) => e.id), graceUsed: c.combo.graceUsed, last: c.combo.lastCmd } : null,
    flowLeft: c.flowLeft(), canFinish: c.canFinish(), hand: c.hand.slice(), held: [...c.heldSlots],
    history: c.history.map((h) => ({ type: h.type, relays: h.relays, heroes: h.heroes, len: h.len, segments: h.segments })),
    enemy: c.enemies.filter((e) => e.alive).map((e) => ({ hp: e.hp, atb: e.atb })), stats: { relays: c.stats.relays, cancelled: c.stats.cancelled, finishers: c.stats.finishers, relayMomentum: c.stats.relayMomentum },
    zones: c.verifyZones().ok, result: c.result, starter: c.starter(),
  };
});
const idOf = (u) => p.evaluate((x) => window.__sb.battle.combat.def(x).id, u);
const uidById = (id, variant) => p.evaluate(([i, v]) => { const c = window.__sb.battle.combat; return [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === i && (!v || c.effVariant(u) === v)) || null; }, [id, variant]);
const tapSel = async (sel) => {
  const at = await p.evaluate((q) => { const el = document.querySelector(q); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
  if (at) await p.touchscreen.tap(at[0], at[1]);
  return !!at;
};
const tapCard = (uid) => tapSel(`.hand .card[data-uid="${uid}"], .reserve .res-card[data-uid="${uid}"]`);
const idle = async (ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await S(); if (!s || (!s.exec && !s.queue.length)) return s; await wait(50); } return S(); };
const until = async (pred, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await S(); if (!s || pred(s)) return s; await wait(50); } return S(); };
// Momentum changes as the engine reports them
await p.evaluate(() => { window.__mlog = []; const c = window.__sb.battle.combat; const orig = c.emit.bind(c); c.emit = (ev) => { if (ev.type === 'momentum') window.__mlog.push([ev.delta, ev.why]); orig(ev); }; });

// 1. all heroes Ready
let s = await S();
check('1. the encounter starts with all three heroes Ready', Object.values(s.heroes).every((x) => x === 'READY'), JSON.stringify(s.heroes));
await shot('01-start');

// 2. select Hessa
await tapSel('.hero-btn[data-hero="C"]');
await wait(120);
await tapSel('.hero-btn[data-hero="V"]');
await wait(120);
s = await S();
check('2. Hessa selected with her hero button', s.selected === 'V' && s.starter === 'V');

// 3-5. Weak, then Medium while Weak executes
const weak = await uidById('scrapline', 'A');
const medium = await uidById('rivet_jab', 'B');
const hp0 = (await S()).enemy[0].hp;
const m0 = (await S()).momentum;
await tapCard(weak);
s = await S();
check('3. a neutral Weak attack is committed for Hessa', s.exec && s.exec.uid === weak && s.exec.hero === 'V');
const dom4 = await p.evaluate(() => ({ held: !!document.querySelector('.slot.held'), execChip: !!document.querySelector('.chip.exec, .chip.q.exec') }));
check('4. it entered the execution pipeline instead of resolving: slot held, chip executing, no damage or Momentum yet',
  dom4.held && dom4.execChip && s.enemy[0].hp === hp0 && s.momentum === m0 && s.held.length === 1, JSON.stringify(dom4));
await tapCard(medium);
s = await S();
const dom5 = await p.evaluate(() => ({ wait: document.querySelectorAll('.chip.q.wait').length, ghost: [...document.querySelectorAll('.slot.held .g-s')].map((x) => x.textContent) }));
check('5. Medium queued while Weak still executes', s.queue.length === 1 && s.queue[0].uid === medium && s.exec && s.exec.uid === weak, JSON.stringify(dom5));
await shot('05-queued');
s = await idle();
check('6. executed in order with Momentum on resolution (Weak +1, Medium +1, Cross +1)', JSON.stringify(s.combo.cards) === JSON.stringify(['scrapline', 'rivet_jab']) && s.momentum === m0 + 3, `${s.combo.cards} M ${m0} → ${s.momentum}`);

// 7-8. Hessa's arte; the chain stays open
const scrapfall = await uidById('scrapfall');
const L7 = (await S()).flowLeft;
await tapCard(scrapfall);
s = await idle();
const L7b = s.flowLeft;
check('7. Hessa\'s arte executed', s.combo && s.combo.cards.at(-1) === 'scrapfall');
const relayCls = await p.evaluate(() => document.querySelector('.hero-btn[data-hero="C"]').classList.contains('relay'));
check('8. the chain did not end: FINISH available and Corvin offered as a Relay target', s.combo && s.canFinish && relayCls);
check('22. execution time was not taken from the decision window (Flow before and after the arte, refund aside)', Math.abs(L7b - (L7 + 1.0)) < 0.25, `${L7.toFixed(2)}s → ${L7b.toFixed(2)}s`);
await shot('08-arte');

// 9-12. Relay to Corvin
await tapSel('.hero-btn[data-hero="C"]');
s = await S();
const relayCmd = (s.exec && s.exec.type === 'relay') || s.queue.some((q) => q.type === 'relay');
const dom10 = await p.evaluate(() => !!document.querySelector('.chip.q-relay'));
check('9. Relay to Corvin requested with his hero button', relayCmd);
check('10. it is a distinct Relay command in the queue strip', relayCmd && dom10);
await shot('10-relay');
s = await idle();
check('11. Hessa went into Recovery', s.heroes.V === 'RECOVERING', `${s.recover.V.toFixed(2)}s`);
check('12. Corvin is the active performer (rank back to 0)', s.combo.hero === 'C' && s.heroes.C === 'ACTIVE' && s.combo.rank === 0);

// 13-14. Corvin: a basic, then his arte
const strongA = await uidById('piston_strike', 'A');
await tapCard(strongA);
await wait(150);
const lance = await uidById('thermal_lance');
let s13 = await S();
await tapCard(lance); // queued behind the Strong if affordable; otherwise tapped again below
await wait(100);
s = await idle();
if (!s.combo.cards.includes('thermal_lance')) { await tapCard(lance); s = await idle(); }
check('13. Corvin opened his segment with a basic attack', s.combo.cards.includes('piston_strike') && s13.combo.hero === 'C');
check('14. Corvin\'s arte executed', s.combo.cards.at(-1) === 'thermal_lance');

// 15-16. Relay to Pin
await tapSel('.hero-btn[data-hero="S"]');
s = await idle();
check('15. second Relay, to Pin', s.combo && s.combo.relays === 2 && s.combo.hero === 'S');
check('16. Corvin went into Recovery', s.heroes.C === 'RECOVERING');
await shot('16-pin');

// 17-19. Pin: a basic, his arte, Perfect
const pinBasic = await p.evaluate(() => { const c = window.__sb.battle.combat; return c.hand.filter((u) => u && c.categoryOf(u) === 'basic' && c.check(u).ok).sort((a, b) => c.effRank(a) - c.effRank(b))[0]; });
await tapCard(pinBasic);
s = await idle();
check('17. Pin opened his segment with a basic attack', s.combo && s.combo.hero === 'S' && s.combo.cards.length === 6 && s.combo.cards.at(-1) !== 'thermal_lance');
const volley = await uidById('bolt_volley');
const atbBeforeEnd = (await S()).enemy[0].atb;
await tapCard(volley);
s = await until((x) => !x.combo || (!x.exec && !x.queue.length));
let finishedBy = 'itself (every hero has joined, nothing higher)';
if (s.combo && s.canFinish) { await tapSel('.ctl.cash'); finishedBy = 'FINISH'; }
s = await until((x) => !x.combo);
check('18. Pin\'s arte executed', s.history.length && s.history[0].segments.at(-1).hero === 'S' && s.history[0].segments.at(-1).cards === 2 && s.history[0].len === 7);
check('19. the party chain ended as a Perfect', s.history[0] && s.history[0].type === 'perfect', `finished by ${finishedBy}`);
check('20. its history holds all three heroes and two Relays', JSON.stringify(s.history[0].heroes) === '["V","C","S"]' && s.history[0].relays === 2, JSON.stringify(s.history[0].segments.map((g) => `${g.hero}:${g.cards}`)));
const mlog = await p.evaluate(() => window.__mlog);
const sumWhy = (w) => mlog.filter((x) => x[1] === w).reduce((a, x) => a + x[0], 0);
const net = mlog.reduce((a, x) => a + x[0], 0);
s = await S();
check('21. Momentum: costs, gains and Relay rewards add up', sumWhy('Relay') === 2 && sumWhy('Perfect') === 2 && m0 + net === s.momentum,
  `Relay +${sumWhy('Relay')}, Perfect +${sumWhy('Perfect')}, basics +${sumWhy('Basic')}, Crosses +${sumWhy('Cross')}, artes ${mlog.filter((x) => x[0] < 0 && !['Dropped', 'Siphon'].includes(x[1])).reduce((a, x) => a + x[0], 0)} → ${s.momentum}`);
await shot('19-perfect');

// 27. the breather freezes enemy ATB
s = await S();
const inBreather = s.phase === 'RECOVER';
const atbA = s.enemy[0] ? s.enemy[0].atb : 0;
await wait(400);
s = await S();
check('27. the post-chain breather froze enemy ATB', inBreather && s.phase === 'RECOVER' && s.enemy[0].atb === atbA, `ATB ${atbA.toFixed(3)} → ${s.enemy[0].atb.toFixed(3)}`);
void atbBeforeEnd;

// 26. after the breather, ATB runs while heroes recover
s = await until((x) => x.phase !== 'RECOVER', 3000);
const recovering = Object.values(s.heroes).filter((x) => x === 'RECOVERING').length;
const atbB = s.enemy[0].atb;
await wait(350);
const s26 = await S();
check('26. enemy ATB keeps filling while heroes recover (no breather)', recovering >= 1 && s26.enemy[0].atb > atbB, `${recovering} recovering, ATB ${atbB.toFixed(3)} → ${s26.enemy[0].atb.toFixed(3)}`);

// 24. a support action and its performer's Recovery
s = await until((x) => x.heroes.V === 'READY', 6000);
const salvage = await uidById('salvage');
await tapCard(salvage);
s = await S();
const supCmd = (s.exec && s.exec.uid === salvage) || s.queue.some((q) => q.uid === salvage);
s = await idle();
check('24. Hessa performed a support card and then recovered for 2s', supCmd && s.heroes.V === 'RECOVERING' && s.recover.V > 1.5 && !s.combo, `${s.recover.V.toFixed(2)}s`);
await shot('24-support');

// 25. cancel a waiting command: Pin starts a chain, Corvin's heal waits behind it, tap it away
s = await until((x) => x.heroes.S === 'READY' && x.heroes.C === 'READY', 6000);
await tapSel('.hero-btn[data-hero="S"]');
await wait(100);
const b25 = await p.evaluate(() => { const c = window.__sb.battle.combat; return c.hand.filter((u) => u && c.categoryOf(u) === 'basic' && c.check(u).ok)[0]; });
await tapCard(b25);
const heal = await uidById('mend_circuit');
const m25 = (await S()).momentum;
await tapCard(heal);
s = await S();
const healCmd = s.queue.find((q) => q.uid === heal);
const reservedWhileQueued = s.reserved;
const dom23 = await p.evaluate((id) => !!document.querySelector(`.chip.q.wait[data-cmd="${id}"]`), healCmd ? healCmd.id : -1);
check('23. the queue was visible and controllable (waiting chip, held placeholder)', dom23 && dom5.wait >= 1 && dom5.ghost.length >= 1, JSON.stringify(dom5.ghost));
await shot('25-waiting');
if (healCmd) await tapSel(`.chip.q.wait[data-cmd="${healCmd.id}"]`);
await wait(100);
s = await S();
check('25. tapping the waiting heal cancelled it: its 2 Momentum reservation was returned, the card is back',
  !!healCmd && reservedWhileQueued === 2 && s.reserved === 0 && s.momentum >= m25 && s.hand.includes(heal) && !s.queue.some((q) => q.uid === heal), `reserved ${reservedWhileQueued} → ${s.reserved}`);

// 28. win by ordinary play
const end28 = Date.now() + 240000;
while (Date.now() < end28) {
  s = await S();
  if (!s || s.phase === 'END') break;
  const a = await uiDecision(p, 'regular');
  if (a && a.type !== 'wait') await uiPerform(p, a, { touch: true });
  await wait(300);
}
s = await p.evaluate(() => { const c = window.__sb.battle && window.__sb.battle.combat; return c ? { result: c.result, zones: c.verifyZones().ok, stats: c.stats, queue: c.queue.length, exec: !!c.executing } : null; });
check('28. the encounter was won by ordinary play', s && s.result && s.result.victory, s && JSON.stringify({ chains: s.stats.combos, relays: s.stats.relays, perfect: s.stats.perfect, cashouts: s.stats.cashouts, dropped: s.stats.forced, supports: s.stats.supports, cancelled: s.stats.cancelled }));
check('28b. nothing left queued or executing; card zones intact', s && s.zones && s.queue === 0 && !s.exec);

// 29. reward
await p.waitForFunction(() => document.querySelector('.reward-cards .card'), null, { timeout: 15000 });
await wait(400);
const deck0 = await p.evaluate(() => window.__sb.run.d.deck.length);
await (await p.$('.reward-cards .card')).click();
await wait(150);
await p.getByRole('button', { name: L('Take card'), exact: true }).click();
await wait(300);
const got = await p.evaluate(async () => { const { CARDS } = await import('/src/data/cards.js'); const d = window.__sb.run.d.deck; const c = d[d.length - 1]; return { n: d.length, id: c.id, p4: CARDS[c.id].p4 }; });
check('29. a reward card joined the deck', got.n === deck0 + 1 && got.p4 === 'converted', got.id);
await shot('29-reward');
await p.getByRole('button', { name: L('Continue'), exact: true }).click().catch(() => {});
await wait(500);

// 30. save, reload, Continue
const snap = () => p.evaluate(() => { const d = window.__sb.run.d; return JSON.stringify({ v: d.version, deck: d.deck, hp: d.hp, maxHp: d.maxHp, scrap: d.scrap, relics: d.relics, path: d.path, pending: d.pending }); });
const before30 = await snap();
await p.reload();
await p.waitForFunction(() => window.__sb);
await wait(600);
await p.getByRole('button', { name: L('Continue'), exact: true }).click();
await wait(700);
const after30 = await snap();
check('30. after reload, Continue restores the run exactly (the current save version)', after30 === before30 && JSON.parse(after30).v === SAVE_VERSION, `${JSON.parse(after30).deck.length} cards, HP ${JSON.parse(after30).hp}`);

// 31. the next encounter starts clean (walk the map until a battle opens; other rooms are left at once)
for (let hop = 0; hop < 5; hop++) {
  const next = await p.evaluate(() => { const r = window.__sb.run; return r.availableNodes().find((id) => ['battle', 'elite'].includes(r.node(id).type)) || r.availableNodes()[0]; });
  if (!next) break;
  await p.tap(`.map-node[data-node="${next}"]`);
  await wait(200);
  await p.getByRole('button', { name: L('Travel'), exact: true }).click().catch(() => {});
  await wait(900);
  for (let i = 0; i < 10 && (await p.$('.dlg-skip')); i++) { await p.click('.dlg-skip').catch(() => {}); await wait(150); }
  if (await p.evaluate(() => !!(window.__sb.battle && window.__sb.battle.combat))) break;
  // not a battle: take the first option and leave
  for (let k = 0; k < 4; k++) {
    const ch = await p.$('.event-choices .choice:not([disabled]), .rest-opt');
    if (ch) { await ch.click().catch(() => {}); await wait(300); }
    if (await p.$('.modal .deck-grid.select')) { await p.click('.modal .deck-grid .card:not(.disabled)').catch(() => {}); await p.click('.modal .select-foot .btn.primary').catch(() => {}); await wait(300); }
    for (const name of ['Continue', 'Leave', 'Leave (take Scrap only)']) await p.getByRole('button', { name: L(name), exact: true }).first().click({ timeout: 400 }).catch(() => {});
    await wait(300);
    if (await p.$('.map-node.avail')) break;
  }
}
await wait(400);
const s31 = await p.evaluate(() => { const c = window.__sb.battle && window.__sb.battle.combat; return c ? { heroes: ['V', 'C', 'S'].map((h) => c.heroState(h)), queue: c.queue.length, exec: !!c.executing, reserved: c.reserved, combo: !!c.combo, zones: c.verifyZones().ok } : null; });
check('31. the next encounter begins with every hero Ready and no stale commands', s31 && s31.heroes.every((x) => x === 'READY') && !s31.queue && !s31.exec && !s31.reserved && !s31.combo && s31.zones, JSON.stringify(s31));
await shot('31-next');

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
