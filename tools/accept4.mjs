// Phase 4 acceptance demonstration, through the interface only (taps on cards and buttons, swipes
// for Churn and Reserve). A fresh run with a fixed seed (1) whose first battle opens with a mixed
// hand: Hessa's arte, basic attacks, a support card and the other heroes' artes. The engine is only
// read (for the checks); every action is a real tap or swipe.
//
//  1 mixed hand · 2 select Hessa · 3 Weak attack · 4 higher basic · 5 Momentum · 6 Hessa's arte ·
//  7 combo complete · 8 Perfect rewards and breather · 9 support without a combo · 10 Churn one card ·
//  11 Reserve a card, play it later · 12 next-card preview = next draw · 13 Corvin or Pin starts a combo ·
//  14 that hero's arte · 15 win · 16 compatible reward · 17 save, reload, Continue
//
// Usage: node tools/accept4.mjs [outDir] [lang=en] [WxH=844x390]   (needs npm run serve on port 8123)
import { SAVE_VERSION } from '../src/engine/run.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { RU } from '../src/i18n/ru.js';
import { uiDecision, uiPerform } from './lib/uibot.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] || 'accept4-out';
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
await p.tap('.map-node[data-node="n1_0"]');
await wait(200);
await p.getByRole('button', { name: L('Travel'), exact: true }).click();
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat);
await wait(800);

// read-only views of the engine
const S = () => p.evaluate(() => {
  const c = window.__sb.battle && window.__sb.battle.combat;
  if (!c) return null;
  const card = (u) => (u ? { uid: u, id: c.def(u).id, cat: c.def(u).category, owner: c.def(u).owner, rank: c.effRank(u), variant: c.effVariant(u), cost: c.def(u).cost, ok: c.check(u).ok } : null);
  return {
    phase: c.phase, t: c.t, selected: c.selected, momentum: c.momentum, available: c.available(), guard: Math.floor(c.guard), cover: c.coverActive(),
    hand: c.hand.map(card), reserve: c.reserve.map(card), next: c.nextCard(),
    combo: c.combo ? { hero: c.combo.hero, rank: c.combo.rank, variant: c.combo.variant, cards: c.combo.cards.map((e) => ({ id: e.id, owner: e.owner, cat: e.category, rank: e.rank })) } : null,
    history: c.history.map((h) => h.type), closers: c.history.map((h) => (h.closerId ? c.constructor.name && h.closerId : null)), stats: { exMomentum: c.stats.exMomentum, basics: c.stats.basics, artes: c.stats.artes, supports: c.stats.supports, churns: c.stats.churns, reservePlays: c.stats.reservePlays }, churn: c.churn.charges,
    enemiesAtb: c.enemies.filter((e) => e.alive).map((e) => e.atb), result: c.result, zones: c.verifyZones().ok,
  };
});
// A card input commits before it resolves. Sample the resolved state, independent of
// frame rate, rather than reading at a fixed wall-clock delay from pointer-up.
const tapCard = async (uid) => {
  const played = await p.evaluate(() => window.__sb.battle.combat.stats.cardsPlayed);
  await p.locator(`.hand .slot .card[data-uid="${uid}"]:not(.leaving), .reserve .res-card[data-uid="${uid}"]`).tap();
  await p.waitForFunction((n) => {
    const c = window.__sb.battle?.combat;
    return c && c.stats.cardsPlayed > n && !c.executing;
  }, played, { timeout: 5000 });
};
const finishArte = async (count) => {
  const before = await S();
  if (before.history.length === count) await p.tap('.ctl.cash:not([disabled])');
  await p.waitForFunction((n) => window.__sb.battle.combat.history.length > n, count, { timeout: 5000 });
  return S();
};
const swipe = async (uid, dy) => {
  const at = await p.evaluate((u) => { const el = document.querySelector(`.hand .card[data-uid="${u}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, uid);
  await p.mouse.move(at[0], at[1]);
  await p.mouse.down();
  for (let k = 1; k <= 6; k++) await p.mouse.move(at[0], at[1] + (dy * k) / 6);
  await p.mouse.up();
  await wait(300);
};
const untilPhase = async (phase, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await S(); if (!s || s.phase === phase || s.phase === 'END') return s; await wait(100); } return S(); };

// 1. mixed hand
let s = await S();
const cats = new Set(s.hand.filter(Boolean).map((x) => x.cat));
check('1. the opening hand mixes basic attacks, artes and support', cats.has('basic') && cats.has('arte') && cats.has('support'), s.hand.map((x) => x && `${x.id}(${x.cat})`).join(' '));
await shot('01-hand');

// 2. select Hessa (first Corvin, to show the selection moves)
await p.tap('.hero-btn[data-hero="C"]');
await wait(150);
await p.tap('.hero-btn[data-hero="V"]');
await wait(150);
s = await S();
const selClass = await p.evaluate(() => document.querySelector('.hero-btn[data-hero="V"]').classList.contains('sel'));
check('2. Hessa selected with the hero button', s.selected === 'V' && selClass);

// 3. a neutral Weak attack, performed by Hessa
const weak = s.hand.find((x) => x && x.cat === 'basic' && x.rank === 1);
const m0 = s.momentum;
await tapCard(weak.uid);
s = await S();
check('3. a neutral Weak attack starts Hessa\'s combo', s.combo && s.combo.hero === 'V' && s.combo.cards[0].id === weak.id && s.combo.cards[0].owner === 'V' && s.combo.cards[0].rank === 1, JSON.stringify(s.combo && s.combo.cards[0]));
await shot('03-weak');

// 4. a higher basic attack
const higher = s.hand.find((x) => x && x.cat === 'basic' && x.ok && x.rank > 1);
await tapCard(higher.uid);
s = await S();
check('4. a higher-ranked basic attack continues it', s.combo && s.combo.cards.length === 2 && s.combo.cards[1].rank > 1, `${weak.id} → ${higher.id}`);

// 5. Momentum
check('5. the basic attacks generated Momentum', s.momentum >= m0 + 2, `${m0} → ${s.momentum}`);
await shot('05-momentum');

// 6. Hessa's arte
const arte = [...s.hand, ...s.reserve].find((x) => x && x.cat === 'arte' && x.owner === 'V');
check('6a. Hessa\'s arte is playable now (and only hers)', arte && arte.ok && s.hand.filter((x) => x && x.cat === 'arte' && x.owner !== 'V').every((x) => !x.ok), arte && arte.id);
const artesBefore = s.stats.artes, previousEndings = s.history.length;
const m6 = s.momentum, ex6 = s.stats.exMomentum, cross6 = arte.variant !== s.combo.variant ? 1 : 0;
await tapCard(arte.uid);
// 7. Execute the explicit finish when Relay remains an option.
s = await finishArte(previousEndings);
check('6b. the arte executed for Hessa', s.stats.artes === artesBefore + 1);
check('7. the combo completed as a Perfect', s.history[s.history.length - 1] === 'perfect', s.history.join(','));
// 8. rewards and breather
const ex8 = s.stats.exMomentum - ex6;
check('8a. Exact Momentum after the arte, Perfect, Cross and resolved EX effects', s.phase === 'RECOVER' && s.momentum === m6 - arte.cost + 2 + cross6 + ex8, `${m6} − ${arte.cost} + 2 + ${cross6} Cross + ${ex8} EX = ${s.momentum}`);
const atb0 = s.enemiesAtb;
await wait(400);
const s8 = await S();
check('8b. the breather holds the enemies', s8.phase === 'RECOVER' && JSON.stringify(s8.enemiesAtb) === JSON.stringify(atb0), `${s8.phase}: ${atb0.map((x) => x.toFixed(2))} → ${s8.enemiesAtb.map((x) => x.toFixed(2))}`);
await shot('08-breather');
s = await untilPhase('PRE');

// 9. a support card with no combo
const sup = s.hand.find((x) => x && x.cat === 'support' && x.ok);
const sup0 = s.stats.supports, g0 = s.guard;
await tapCard(sup.uid);
s = await S();
check('9. a support card plays on its own: no combo starts', s.stats.supports === sup0 + 1 && !s.combo && s.phase === 'PRE', `${sup.id}: Guard ${g0} → ${s.guard}${s.cover ? ', Cover' : ''}`);
await shot('09-support');

// 10 + 12. Churn exactly one card; the slot gets the previewed card
const before10 = s.hand.map((x) => x && x.uid);
const victimIdx = s.hand.findIndex((x) => x && x.cat === 'arte' && !x.ok) >= 0 ? s.hand.findIndex((x) => x && x.cat === 'arte' && !x.ok) : s.hand.findIndex(Boolean);
const preview10 = s.next;
await swipe(before10[victimIdx], 60);
s = await S();
const changed10 = s.hand.map((x, i) => (x && x.uid) !== before10[i]);
check('10. Churn replaced exactly one hand card', changed10.filter(Boolean).length === 1 && changed10[victimIdx], `slot ${victimIdx}`);
check('12a. the replacement is the card the preview showed', s.hand[victimIdx] && s.hand[victimIdx].uid === preview10);

// 11 + 12. stash a basic attack into Reserve; its slot refills with the previewed card
const basicIdx = s.hand.findIndex((x) => x && x.cat === 'basic');
const stashed = s.hand[basicIdx];
const preview11 = s.next;
await swipe(stashed.uid, -60);
s = await S();
check('11a. a card swiped up went to Reserve', s.reserve.some((x) => x.uid === stashed.uid), stashed.id);
check('12b. its slot refilled from the preview', s.hand[basicIdx] && s.hand[basicIdx].uid === preview11);
await shot('11-reserve');

// 13. Corvin or Pin starts a combo (with the Reserve card when it fits)
const other = ['C', 'S'].find((id) => [...s.hand, ...s.reserve].some((x) => x && x.cat === 'arte' && x.owner === id));
await p.waitForFunction((id) => window.__sb.battle.combat.heroReady(id), other);
await p.tap(`.hero-btn[data-hero="${other}"]`);
await wait(150);
s = await S();
const starter = s.reserve.find((x) => x.uid === stashed.uid && x.ok) || s.hand.find((x) => x && x.cat === 'basic' && x.ok);
await tapCard(starter.uid);
s = await S();
check(`13. ${other === 'C' ? 'Corvin' : 'Pin'} starts a new combo`, s.combo && s.combo.hero === other, `${starter.id}${s.stats.reservePlays ? ' from Reserve' : ''}`);
check('11b. the stashed card was played later from Reserve', s.stats.reservePlays >= 1 && !s.reserve.some((x) => x.uid === stashed.uid), `${stashed.id}, Reserve plays ${s.stats.reservePlays}`);

// 14. that hero's arte: basic attacks until it is affordable, then the arte
for (let i = 0; i < 6 && s.combo; i++) {
  const a = [...s.hand, ...s.reserve].find((x) => x && x.cat === 'arte' && x.owner === other && x.ok);
  if (a) { const history = s.history.length; await tapCard(a.uid); s = await finishArte(history); break; }
  const bsc = [...s.hand, ...s.reserve].filter((x) => x && x.cat === 'basic' && x.ok).sort((x, y) => x.rank - y.rank)[0];
  if (!bsc) break;
  await tapCard(bsc.uid);
  s = await S();
}
const owner14 = await p.evaluate(async (o) => { const { CARDS } = await import('/src/data/cards.js'); const h = window.__sb.battle.combat.history; const last = h[h.length - 1]; return last && last.closerId ? CARDS[last.closerId].owner : null; }, other);
check(`14. ${other === 'C' ? 'Corvin' : 'Pin'}'s arte executed and finished the combo`, s.stats.artes >= artesBefore + 2 && owner14 === other, `artes ${s.stats.artes}, endings ${s.history.join(',')}, finisher owner ${owner14}`);
await shot('14-other-arte');

// 15. win by ordinary play (the shared player policy, performed with taps)
const end15 = Date.now() + 240000;
while (Date.now() < end15) {
  s = await S();
  if (!s || s.phase === 'END') break;
  const a = await uiDecision(p, 'regular');
  if (a && a.type !== 'wait') await uiPerform(p, a, { touch: true });
  await wait(450);
}
s = await p.evaluate(() => { const c = window.__sb.battle && window.__sb.battle.combat; return c ? { result: c.result, zones: c.verifyZones().ok, stats: c.stats } : null; });
check('15. the battle was won by ordinary play', s && s.result && s.result.victory, s && JSON.stringify({ basics: s.stats.basics, artes: s.stats.artes, supports: s.stats.supports, perfect: s.stats.perfect, cashouts: s.stats.cashouts, dropped: s.stats.forced, illegal: s.stats.rejected }));
check('15b. card zones stayed intact', s && s.zones);

// 16. a compatible reward
await p.waitForFunction(() => document.querySelector('.reward-cards .card'), null, { timeout: 15000 });
await wait(400);
await shot('16-reward');
const deck0 = await p.evaluate(() => window.__sb.run.d.deck.length);
const firstReward = await p.$('.reward-cards .card');
await firstReward.click();
await wait(150);
await p.getByRole('button', { name: L('Take card'), exact: true }).click();
await wait(300);
const got = await p.evaluate(async () => { const { CARDS } = await import('/src/data/cards.js'); const d = window.__sb.run.d.deck; const c = d[d.length - 1]; return { n: d.length, id: c.id, p4: CARDS[c.id].p4, cat: CARDS[c.id].category }; });
check('16. a reward card joined the deck, from the converted catalogue', got.n === deck0 + 1 && got.p4 === 'converted', `${got.id} (${got.cat})`);
await p.getByRole('button', { name: L('Continue'), exact: true }).click().catch(() => {});
await wait(500);

// 17. save, reload, Continue
const snap = () => p.evaluate(() => { const d = window.__sb.run.d; return JSON.stringify({ v: d.version, deck: d.deck, hp: d.hp, maxHp: d.maxHp, scrap: d.scrap, relics: d.relics, path: d.path, pending: d.pending, map: d.map }); });
const before17 = await snap();
await p.reload();
await p.waitForFunction(() => window.__sb);
await wait(600);
await p.getByRole('button', { name: L('Continue'), exact: true }).click();
await wait(700);
const after17 = await snap();
check('17. after reload, Continue restores the run exactly (the current save version)', after17 === before17 && JSON.parse(after17).v === SAVE_VERSION, `${JSON.parse(after17).deck.length} cards, HP ${JSON.parse(after17).hp}`);
await shot('17-continued');

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
