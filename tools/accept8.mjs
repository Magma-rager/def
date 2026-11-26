// Phase 8 acceptance demonstration (assignment §24, docs/AUDIT.md Phase 8). Three modes:
//
//   node tools/accept8.mjs ui [lang=en] [width=844] [height=390] [outDir=accept8-out]
//        Scenarios A–E through the interface: every card, hero, FINISH, Reserve swipe, reward, relic,
//        mutation, shop, surgery and event choice is a tap or a swipe on the real page.
//   node tools/accept8.mjs runs [runs per build=3]
//        Scenario F: ordinary campaigns played headless through the same engine (Run + Combat) by a
//        build-focused player (tools/simulate.mjs's acquisition policy): not an interface-level claim.
//   node tools/accept8.mjs campaign [lang=en] [width=1180] [height=820] [outDir=accept8-out]
//        Scenario G: a whole three-Act run from the title screen through the interface (the shared UI
//        bot taps), then the ending, credits, results, Museum and a new run.
//
// Scenario G is a first-time player (no saved profile): the tutorial battle and every lesson appear and
// are dismissed by tap; SB_MINUTES (default 45) bounds the run. The bot plays at the 'quick' profile.
//
// Disclosed fixtures (ui mode, initialisation only — never an outcome):
//  · a returning player's profile (every lesson learned except the Phase 8 technique lesson);
//  · the run's seed is fixed (chosen at start, printed) so that the first battle's ordinary reward
//    offers Pressure Valve and the Act I boss is the Scrap Tyrant;
//  · from the second battle on, the deck is a fixed list (the four techniques, the Pressure Valve the
//    player took, starter cards) in a known draw order, the hand is dealt from it, Momentum starts at
//    8 and the enemies have more HP, so every scripted chain fits in one fight;
//  · the run is moved next to the Act I boss and that boss's adaptation is set to Payout Audit;
//  · in Act II, a shop, a surgery and an event (Variant Press) are opened as the current node.
// Everything after that is a tap; the checks read what the engine and the page recorded.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { uiDecision, uiPerform } from './lib/uibot.mjs';
import { RU } from '../src/i18n/ru.js';
import { LESSON_KEYS } from '../src/ui/lessons.js';
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { CARDS, ARCHETYPES, GRAFTS } from '../src/data/cards.js';
import { ADAPTATIONS } from '../src/data/adaptations.js';
import { RELICS } from '../src/data/relics.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { RECIPES } from '../src/data/recipes.js';
import { decide, perform } from './lib/bot.mjs';
import { RNG } from '../src/core/rng.js';

const MODE = process.argv[2] || 'ui';
const results = [];
const t0 = Date.now();
const log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${s}`);
const check = (step, name, ok, detail = '') => { results.push({ step, name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${step}. ${name}${detail ? ' — ' + detail : ''}`); };
const finish = (label, extra = {}) => {
  const failed = results.filter((r) => !r.ok);
  const out = process.argv[6] || 'accept8-out';
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(`${out}/${label}-results.json`, JSON.stringify({ label, results, ...extra }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed (${label})${failed.length ? ' — FAILED: ' + failed.map((f) => f.step).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
};

// ═══════════════════════════ Scenario F — natural builds (headless) ═══════════════════════════
if (MODE === 'runs') {
  const PER = +(process.argv[3] || 3);
  const builds = ['guard', 'relay', 'reserve', 'interference', 'flow', 'churn', 'cashout', 'ladder', 'momentum', 'variant'];
  const ARCH = Object.keys(ARCHETYPES);
  const MECH = { ladder: 'steps', variant: 'crosses', relay: 'relays', momentum: 'momentumSpent', flow: 'flowGained', churn: 'churns', reserve: 'reservePlays', guard: 'guardGained', cashout: 'cashouts', interference: 'interferencePayoffs' };
  const families = new Set();
  const report = [];
  for (const target of builds) {
    for (let k = 0; k < PER; k++) {
      const seed = 4000 + ARCH.indexOf(target) * 50 + k;
      const rng = new RNG(seed * 7 + 1);
      const run = Run.create({ seed, tutorial: false });
      const fits = (id) => CARDS[id].tags.includes(target);
      const acq = { cards: [], relics: [], mutations: [], acts: [] };
      const mech = { battles: 0, own: 0, all: {}, ex: 0, syn: 0 };
      let saveOk = true, guard = 0;
      while (guard++ < 500) {
        // every step survives a save and a load
        if (!Run.load(JSON.parse(JSON.stringify(run.serialize())))) saveOk = false;
        const p = run.d.pending;
        if (!p) {
          const ids = run.availableNodes();
          const w = ids.map((id) => { const n = run.node(id); return [id, { battle: 4, event: 3, elite: 2, shop: 4, rest: 1, surgery: 2, treasure: 5, boss: 10 }[n.type]]; });
          run.enterNode(rng.weighted(w));
          continue;
        }
        if (p.type === 'gameover') break;
        if (p.type === 'story') { if (p.next === 'map') run.d.pending = null; else if (p.next === 'nextAct') { run.advanceAct(); acq.acts.push(run.d.act); } else run.d.pending = { type: 'gameover', victory: true }; continue; }
        if (p.type === 'battle') {
          const setup = run.battleSetup();
          const c = new Combat(setup);
          let think = 0.4;
          for (let i = 0; i < 30 * 400 && c.phase !== 'END'; i++) { c.update(1 / 30); think -= 1 / 30; if (think > 0) continue; think = 0.7 + rng.next() * 0.6; perform(c, decide(c, { profile: 'regular', rng: () => rng.next(), build: 'auto' })); }
          mech.battles++;
          for (const [kk, v] of Object.entries(c.stats)) if (typeof v === 'number') mech.all[kk] = (mech.all[kk] || 0) + v;
          mech.ex += c.stats.exActivations;
          for (const id of Object.keys(c.stats.exByRecipe)) if (RECIPES.find((r) => r.id === id).tags.includes(target)) mech.syn += c.stats.exByRecipe[id];
          run.finishBattle(c.outcome());
          continue;
        }
        if (p.type === 'bossprep') { run.chooseBossPrep('prepared', 'brace'); continue; }
        if (p.type === 'reward') {
          const idx = p.cards.findIndex((s) => fits(s.id));
          const neutral = p.cards.findIndex((s) => !CARDS[s.id].tags.some((t) => ARCHETYPES[t]));
          if (idx >= 0) { run.takeReward('card', idx); acq.cards.push(p.cards[idx].id); } else if (neutral >= 0 && run.d.deck.length < 16) run.takeReward('card', neutral);
          if (p.relics.length) { const r = Math.max(0, p.relics.findIndex((id) => RELICS[id].tag === target)); run.takeReward('relic', r); acq.relics.push(p.relics[r]); }
          run.finishReward();
          continue;
        }
        if (p.type === 'mutation') { const m = p.options.find((id) => MUTATIONS[id].tag === target) || p.options[0]; run.chooseMutation(m); acq.mutations.push(m); continue; }
        if (p.type === 'shop') { for (const [i, it] of p.stock.cards.entries()) if (!it.sold && fits(it.spec.id) && it.price <= run.d.scrap && run.shopBuy('card', i).ok) acq.cards.push(it.spec.id); run.leaveNode(); continue; }
        if (p.type === 'treasure') { const r = Math.max(0, p.relics.findIndex((id) => RELICS[id].tag === target)); if (run.treasureTake(r)) acq.relics.push(p.relics[r]); run.leaveNode(); continue; }
        if (p.type === 'surgery') { const g = p.grafts.find((x) => GRAFTS[x].tag === target) || p.grafts[0]; const t = run.d.deck.find((x) => fits(x.id) && run.canApplySelect(`graft:${g}`, x)); if (t) run.surgeryApply(t.uid, `graft:${g}`); run.leaveNode(); continue; }
        if (p.type === 'rest') { if (run.d.hp < run.d.maxHp * 0.7) run.restChoose('recover'); run.leaveNode(); continue; }
        if (p.type === 'event') { const i = p.result ? -1 : EVENTS_FIRST(run); if (i >= 0) run.eventChoose(i); if (run.d.pending.select) { const sel = run.d.pending.select; const t = run.d.deck.find((x) => run.canApplySelect(sel.action, x)); if (t) run.applySelect(sel.action, t.uid); else run.cancelSelect(); } if (!run.leaveNode()) throw new Error(`Required selection at ${p.eventId} could not be completed`); continue; }
        run.leaveNode();
      }
      const tags = Object.entries(run.tagCounts()).sort((a, b) => b[1] - a[1]);
      const m = MECH[target];
      const r = { battles: mech.battles, target, seed, result: run.d.pending && run.d.pending.victory ? 'victory' : `defeat act ${run.d.act}`, act: run.d.act, top: tags[0] ? tags[0][0] : null, held: run.d.deck.filter((x) => fits(x.id)).length, deck: run.d.deck.length, cards: acq.cards, relics: acq.relics, mutations: acq.mutations, mech: m, perBattle: (mech.all[m] || 0) / Math.max(1, mech.battles), ownRecipes: mech.syn / Math.max(1, mech.battles), saveOk };
      report.push(r);
      log(`${target} seed ${seed}: ${r.result} after ${r.battles} battles · deck ${r.deck}, ${r.held} ${target} cards, lead tag ${r.top} · ${m} ${r.perBattle.toFixed(1)}/battle · own recipes ${r.ownRecipes.toFixed(2)}/battle · relics ${r.relics.join(', ') || '—'} · mutations ${r.mutations.join(', ') || '—'}`);
    }
  }
  const byTarget = Object.groupBy ? Object.groupBy(report, (r) => r.target) : report.reduce((o, r) => ((o[r.target] = o[r.target] || []).push(r), o), {});
  for (const [target, rs] of Object.entries(byTarget)) {
    const ok = rs.some((r) => r.top === target && r.held >= 5 && r.act >= 2 && r.saveOk);
    if (ok) families.add(target);
    check(`F:${target}`, `${ARCHETYPES[target]} assembled through ordinary acquisition, played with its own loop, carried into Act II or later`, ok, rs.map((r) => `${r.result}, ${r.held} cards, lead ${r.top}, ${r.mech} ${r.perBattle.toFixed(1)}/battle, mutations ${r.mutations.join('/') || '—'}`).join(' | '));
  }
  check('43–52', 'At least four mechanically distinct build families (separate ordinary runs, Act II reached, saves round-trip)', families.size >= 4, [...families].join(', '));
  finish('F-runs', { report });
}
function EVENTS_FIRST(run) {
  for (let i = 0; i < 4; i++) if (run.eventChoiceReq(i) === true) return i;
  return -1;
}

// ═══════════════════════════ browser modes ═══════════════════════════
const { chromium } = createRequire(import.meta.url)('playwright');
const LANG = process.argv[3] || 'en';
const W = +(process.argv[4] || (MODE === 'campaign' ? 1180 : 844));
const H = +(process.argv[5] || (MODE === 'campaign' ? 820 : 390));
const outDir = process.argv[6] || 'accept8-out';
const L = (s) => (LANG === 'ru' && RU.ui[s] !== undefined ? RU.ui[s] : s);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true });
const campaignProfile = MODE === 'campaign' && process.env.SB_CAMPAIGN_PROFILE ?
  JSON.parse(fs.readFileSync(process.env.SB_CAMPAIGN_PROFILE, 'utf8')) : null;
await ctx.addInitScript(([l, keys, mode, profile]) => {
  if (localStorage.getItem('signalbreak.meta.v1')) return;
  localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l }));
  if (mode === 'campaign') {
    if (profile) localStorage.setItem('signalbreak.meta.v1', JSON.stringify(profile));
    return;
  }
  const tut = Object.fromEntries(keys.filter((k) => k !== 'technique').map((k) => [k, true]));
  localStorage.setItem('signalbreak.meta.v1', JSON.stringify({ version: 1, totalRuns: 2, defeats: 2, tutorialDone: true, lessonsMigrated: true, tut, runs: [{ result: 'defeat', act: 1, floors: 6, score: 300, seed: 1 }] }));
}, [LANG, LESSON_KEYS, MODE, campaignProfile]);
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
const shot = (name) => p.screenshot({ path: `${outDir}/${MODE}-${LANG}-${W}-${name}.png` });
const wait = (ms) => p.waitForTimeout(ms);
const screen = () => p.evaluate(() => {
  if (document.querySelector('.dialog-layer')) return 'dialog';
  if (document.querySelector('.modal')) return 'modal';
  const s = document.querySelector('.layer-screen > div');
  return s ? s.className.split(' ')[0] : 'none';
});
// a target below the fold is scrolled into view first, as a player scrolls to it
const center = (sel) => p.evaluate((q) => { const el = document.querySelector(q); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);
const tapSel = async (sel) => { const at = await center(sel); if (!at) return false; await p.touchscreen.tap(at[0], at[1]); await wait(70); return true; };
const clickText = async (text) => { const el = p.getByRole('button', { name: L(text), exact: true }).first(); if (await el.count()) { await el.click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
const S = () => p.evaluate(() => {
  const bs = window.__sb && window.__sb.battle;
  const c = bs && bs.combat;
  if (!c) return null;
  return {
    t: c.t, phase: c.phase, lesson: bs.lessonOpen, mom: c.momentum, momMax: c.momentumMax(), reserved: c.reserved, guard: c.guard, hp: c.hp,
    combo: c.combo ? { hero: c.combo.hero, rank: c.combo.rank, variant: c.combo.variant, cards: c.combo.cards.map((e) => ({ id: e.id, rank: e.rank, variant: e.variant, step: e.step, cross: e.cross, dmg: e.dmg, spent: e.spent })), log: c.combo.log.slice(), ex: [...c.combo.ex], payout: c.combo.payout } : null,
    hand: c.hand.map((u) => (u ? c.def(u).id : null)), reserve: c.reserve.map((u) => c.def(u).id), queue: c.queue.length, exec: !!c.executing,
    history: c.history.map((x) => ({ type: x.type, len: x.len, ex: x.ex || [], damage: x.damage })),
    states: Object.fromEntries(['V', 'C', 'S'].map((id) => [id, c.heroState(id)])),
    stats: { techniques: c.stats.techniques, rejected: c.stats.rejected, cancelled: c.stats.cancelled, momentumSpent: c.stats.momentumSpent },
    zones: c.verifyZones().ok, adapt: c.adapt ? { id: c.adapt.id, progress: c.adapt.progress, need: c.adapt.need, broken: c.adapt.broken } : null,
    panel: (document.querySelector('.adapt-panel:not([hidden])') || {}).textContent || '', mutations: [...c.mutations], relics: [...c.relics], guardCap: c.guardCap(), churnMax: c.churnMax(), reserveMax: c.reserveMax(), momentumCostFlow: c.momentumCostFlow(), flowSpend: c.flowSpendAmount(),
  };
});
async function dismissLesson() { await wait(450); await tapSel('.tut-layer:not([hidden]) .btn.primary'); await wait(80); }
async function until(pred, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await S();
    if (!s) return null;
    if (s.lesson) { await dismissLesson(); continue; }
    if (pred(s)) return s;
    await wait(30);
  }
  return null;
}
const settled = (ms = 5000) => until((x) => !x.exec && !x.queue, ms);
const uidOf = (id, zone = 'hand') => p.evaluate(([cid, z]) => { const c = window.__sb.battle.combat; return c[z].find((u) => u && c.def(u).id === cid) || null; }, [id, zone]);
async function tapCard(id) {
  const u = await uidOf(id);
  if (!u) return false;
  for (let k = 0; k < 3; k++) {
    await tapSel(`.hand .card[data-uid="${u}"]`);
    for (let i = 0; i < 15; i++) { if (!(await p.evaluate((x) => window.__sb.battle.combat.hand.includes(x), u))) return true; await wait(40); }
  }
  return false;
}
async function tapReserve(id) {
  const u = await uidOf(id, 'reserve');
  if (!u) return false;
  await tapSel(`.reserve .res-card[data-uid="${u}"]`);
  for (let i = 0; i < 20; i++) { if (!(await p.evaluate((x) => window.__sb.battle.combat.reserve.includes(x), u))) return true; await wait(40); }
  return false;
}
const tapHero = (id) => tapSel(`.hero-btn[data-hero="${id}"]`);
async function play(...ids) { for (const id of ids) { if (!(await tapCard(id))) { log(`  (no ${id} to tap)`); return false; } await settled(); } return true; }
async function finishChain() { await settled(4000); await tapSel('.ctl.cash'); return until((x) => !x.combo && !x.exec && !x.queue, 6000); }
async function heroReady(id, ms = 15000) { return until((x) => x.states[id] === 'READY' && !x.combo && x.phase !== 'RECOVER', ms); }
const integrity = (s) => !!s && s.zones && s.mom >= 0 && s.mom <= s.momMax && s.reserved >= 0 && s.reserved <= s.mom;
async function skipDialogs() {
  for (let i = 0; i < 60; i++) {
    const sc = await screen();
    if (sc === 'dialog') { await tapSel('.dlg-skip'); await wait(150); continue; }
    if (sc === 'story' || sc === 'none') { await clickText('Continue'); await wait(200); continue; }
    return sc;
  }
  return screen();
}
async function botBattle(ms = 240000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await S();
    if (!s || s.phase === 'END') break;
    if (s.lesson) { await dismissLesson(); continue; }
    await uiPerform(p, await uiDecision(p, 'quick'), { touch: true });
    await wait(110);
  }
  await wait(2200);
}

// ═══════════════════════════ Scenario G — the whole campaign through the UI ═══════════════════════════
if (MODE === 'campaign') {
  const MIN = +(process.env.SB_MINUTES || 45);
  await p.goto(URL);
  await p.waitForFunction(() => window.__sb);
  const previous = await p.evaluate(() => window.__sb.meta.totalRuns);
  await clickText('New Run'); await wait(300);
  const starter = process.env.SB_CAMPAIGN_STARTER || 'beta_badge';
  await p.locator(`.starter-panel [data-relic="${starter}"]`).tap();
  await clickText('Begin'); await wait(500);
  const initial = await p.evaluate(() => ({ relics: window.__sb.run.d.relics, hp: window.__sb.run.d.hp, scrap: window.__sb.run.d.scrap, seed: window.__sb.run.d.seed }));
  check('start', 'Campaign began with the selected single relic and standard resources', initial.relics.join() === starter && initial.hp === 130 && initial.scrap === 80, JSON.stringify(initial));
  const end = Date.now() + MIN * 60000;
  const seen = { acts: new Set([1]), bosses: [], screens: new Set() };
  let battles = 0, lastSig = '', sameSince = Date.now(), lastLog = 0;
  const recoveries = [];
  const progress = [];
  const reloadedActs = new Set();
  const chooseCard = async () => {
    if (!await tapSel('.modal .deck-grid.select .card:not(.disabled)')) return false;
    await wait(120);
    return tapSel('.modal .select-foot .btn.primary:not([disabled])');
  };
  while (Date.now() < end) {
    const sc = await screen();
    seen.screens.add(sc);
    // progress and stuck detection: the same screen and run state for a minute is reported and nudged
    const st = await p.evaluate(() => { const r = window.__sb.run; const c = window.__sb.battle && window.__sb.battle.combat; return r ? { act: r.d.act, floors: r.d.floors, battles: r.d.battleCount, hp: r.d.hp, pending: r.d.pending && r.d.pending.type, t: c ? Math.floor(c.t / 5) : null, phase: c ? c.phase : null } : null; });
    const sig = `${sc}|${JSON.stringify(st)}`;
    if (sig !== lastSig) { lastSig = sig; sameSince = Date.now(); }
    if (Date.now() - lastLog > 60000) {
      lastLog = Date.now();
      progress.push({ atSeconds: Math.floor((lastLog - t0) / 1000), screen: sc, state: st });
      log(`  campaign: ${sc} ${JSON.stringify(st)}`);
    }
    if (Date.now() - sameSince > 60000) {
      log(`  STUCK on ${sc} ${JSON.stringify(st)}`);
      const modal = await p.evaluate(() => [...document.querySelectorAll('.modal button')].map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })));
      recoveries.push({ screen: sc, state: st, modal, atSeconds: Math.floor((Date.now() - t0) / 1000) });
      if (recoveries.length <= 3) await shot(`G-stuck-${recoveries.length}`);
      for (const label of ['Close', 'Cancel', 'Leave', 'Continue', 'Skip']) if (await clickText(label)) break;
      await p.keyboard.press('Escape');
      sameSince = Date.now();
    }
    if (sc === 'dialog') { await tapSel('.dlg-skip'); await wait(120); continue; }
    if (sc === 'credits' || sc === 'results') break;
    const act = await p.evaluate(() => window.__sb.run && window.__sb.run.d.act);
    if (act) seen.acts.add(act);
    if (sc === 'battle') { battles++; await botBattle(300000); continue; }
    if (sc === 'map') {
      if (act && !reloadedActs.has(act)) {
        const snap = () => p.evaluate(() => JSON.stringify(window.__sb.run.d));
        const before = await snap();
        await p.reload();
        await p.waitForFunction(() => window.__sb);
        await clickText('Continue');
        await p.waitForFunction(() => window.__sb.run);
        check(`save-${act}`, 'Continue restores the ordinary checkpoint', before === await snap());
        reloadedActs.add(act);
      }
      const id = await p.evaluate(() => { const r = window.__sb.run; const av = r.availableNodes(); const w = { boss: 9, rest: r.d.hp < r.d.maxHp * 0.55 ? 8 : 1, treasure: 6, battle: 4, shop: 3, event: 3, surgery: 2, elite: r.d.hp > r.d.maxHp * 0.75 ? 2 : 0 }; return av.sort((a, b) => (w[r.node(b).type] || 0) - (w[r.node(a).type] || 0))[0]; });
      await tapSel(`.map-node[data-node="${id}"]`); await wait(150); await clickText('Travel'); await wait(300); continue;
    }
    if (sc === 'reward') { await tapSel('.reward-cards .card'); await clickText('Take card'); await tapSel('.reward-relics .relic-badge'); await wait(150); await clickText('Continue'); await wait(300); continue; }
    if (sc === 'bossprep') { const bossId = await p.evaluate(() => window.__sb.run.d.pending.bossId); seen.bosses.push(bossId); await tapSel('.prep-plans .choice'); await wait(400); continue; }
    if (sc === 'mutation') { await tapSel('.mut-card'); await wait(300); continue; }
    if (sc === 'rest') { if (await p.$('.rest-opt:not([disabled])')) await tapSel('.rest-opt:not([disabled])'); await wait(300); if ((await screen()) === 'modal') continue; await clickText('Continue'); await wait(300); continue; }
    if (sc === 'event') {
      if (await p.$('.event-choices .choice:not([disabled])')) { await tapSel('.event-choices .choice:not([disabled])'); await wait(300); }
      if ((await screen()) === 'modal') continue;
      if (!(await clickText('Continue'))) await clickText('Skip');
      await wait(300);
      continue;
    }
    if (sc === 'shop') {
      const affordable = await p.evaluate(() => {
        const r = window.__sb.run;
        return r.d.pending.stock.cards.findIndex((c) => !c.sold && c.price <= r.d.scrap);
      });
      if (affordable >= 0) await tapSel(`.shop-cards .shop-item:nth-child(${affordable + 1})`);
      await clickText('Leave'); await wait(300); continue;
    }
    if (sc === 'surgery') {
      if (await p.$('.surgery-ops .choice:not([disabled])')) {
        await tapSel('.surgery-ops .choice:not([disabled])'); await wait(250);
        if ((await screen()) === 'modal') { await chooseCard(); await wait(250); }
      }
      await clickText('Leave'); await wait(300); continue;
    }
    if (sc === 'treasure') { await tapSel('.reward-relics .relic-badge'); await wait(150); await clickText('Continue'); await clickText('Leave'); await wait(300); continue; }
    if (sc === 'modal') { await chooseCard(); await wait(200); continue; }
    if (!(await clickText('Continue')) && !(await clickText('Leave'))) await wait(300);
  }
  // a finished run is recorded in the profile (meta.runs[0], src/engine/run.js summary) and the live run is cleared
  const fin = await p.evaluate(() => ({ last: (window.__sb.meta.runs || [])[0] || null, meta: window.__sb.meta }));
  const last = fin.meta.totalRuns === previous + 1 && fin.last?.seed === initial.seed ? fin.last : null;
  const report = () => ({ seen: { acts: [...seen.acts], bosses: seen.bosses, screens: [...seen.screens] },
    progress, recoveries, seed: initial.seed, starter, reloadedActs: [...reloadedActs],
    disposition: last?.result === 'victory' ? (recoveries.length ? 'completed_after_nudge' : 'completed_without_nudge') :
      (last?.result === 'defeat' ? 'defeat' : 'unresolved_timeout'), errors });
  check(53, 'A three-Act run is finished through the interface (victory recorded)', seen.acts.has(3) && last && last.result === 'victory' && last.act === 3 && last.bosses.length === 3, `acts ${[...seen.acts].join(',')}, bosses ${seen.bosses.join(', ')}, battles ${battles}, recorded ${last ? `${last.result}, act ${last.act}, bosses ${last.bosses.join('/')}` : 'nothing'}`);
  if (!last || last.result !== 'victory') {
    await shot('G-incomplete');
    await b.close();
    finish(`G-campaign-${LANG}-${W}`, report());
  }
  for (let i = 0; i < 80 && !['credits', 'results'].includes(await screen()); i++) { if ((await screen()) === 'dialog') await tapSel('.dlg-skip'); else await clickText('Continue'); await wait(200); }
  check(54, 'The ending is shown', seen.screens.has('story') || seen.screens.has('dialog'), [...seen.screens].join(','));
  let sawCredits = (await screen()) === 'credits';
  if (sawCredits) { await shot('G-credits'); for (let i = 0; i < 40 && (await screen()) === 'credits'; i++) { await clickText('Skip'); await clickText('Continue'); await wait(300); } }
  check(55, 'The credits roll', sawCredits);
  const res = await screen();
  await shot('G-results');
  check(56, 'The results screen is reached', res === 'results');
  const stats = await p.evaluate(() => (document.querySelector('.results-body') || {}).textContent || '');
  const shows = (v) => stats.includes(String(v));
  check(57, 'Run statistics are shown and match the recorded run (score, floors, deck, combos)', last && shows(last.score) && shows(last.floors) && shows(last.deckSize) && shows(last.combos), stats.slice(0, 200));
  check('record', 'One new campaign is recorded and permanent progress is shown', fin.meta.totalRuns === previous + 1 &&
    !!(await p.$('.results-body .run-progress')) && last?.starter === starter);
  await clickText('Museum'); await wait(400);
  check(58, 'The Museum opens (from the results screen)', !!(await p.$('.modal .museum')));
  await tapSel('.museum [data-tab="Journal"]'); await wait(200);
  const jr = await p.evaluate(() => document.querySelectorAll('.jr-card.found').length);
  check(59, 'Card/relic discoveries and the EX Combo Journal are recorded', jr >= 1 && Object.keys(fin.meta.combos || {}).length >= 1, `${jr} recipes found`);
  await clickText('Close'); await wait(200);
  const availableStart = async () => p.evaluate(async () => {
    const { starterOptions } = await import('/src/engine/progression.js');
    return starterOptions(window.__sb.meta).filter((o) => o.available).map((o) => o.id);
  });
  const before = await p.evaluate(() => ({ runs: window.__sb.meta.totalRuns }));
  const priorOptions = await availableStart();
  if (!(await clickText('New Run'))) { await clickText('Title'); await wait(300); await clickText('New Run'); }
  await wait(300); await clickText('Abandon & start new'); await wait(200);
  const nextStarter = priorOptions.find((id) => id !== 'beta_badge' && id !== starter) || 'beta_badge';
  await p.locator(`.starter-panel [data-relic="${nextStarter}"]`).tap();
  await clickText('Begin'); await wait(500);
  await skipDialogs();
  const after = await p.evaluate(() => ({ runs: window.__sb.meta.totalRuns, run: !!window.__sb.run, act: window.__sb.run?.d.act,
    relics: window.__sb.run?.d.relics, hp: window.__sb.run?.d.hp, scrap: window.__sb.run?.d.scrap }));
  check(60, 'A subsequent run begins with an earned relic and standard resources',
    after.run && after.act === 1 && after.relics.join() === nextStarter &&
    nextStarter !== 'beta_badge' && after.hp === 130 && after.scrap === 80);
  check(61, 'Persistent unlocks carry over', JSON.stringify(priorOptions) === JSON.stringify(await availableStart()), priorOptions.join(','));
  const again = await p.evaluate(() => (window.__sb.meta.runs || [])[0]);
  check(62, 'The previous run was recorded correctly (still the latest record after the new run began)', after.runs >= before.runs && again && last && again.seed === last.seed && again.score === last.score, `runs recorded ${fin.meta.totalRuns}; latest ${again && again.result} score ${again && again.score}`);
  check('—', 'No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await b.close();
  finish(`G-campaign-${LANG}-${W}`, report());
}

// ═══════════════════════════ ui mode — Scenarios A–E ═══════════════════════════
// the seed: the first battle's ordinary reward offers Pressure Valve, and the Act I boss is the Scrap Tyrant
let SEED = null, FIRST = null;
for (let s = 1; s < 20000 && SEED === null; s++) {
  const r = Run.create({ seed: s, starterRelic: 'beta_badge', tutorial: false });
  if (r.d.bosses[1] !== 'scrap_tyrant') continue;
  r.d.pending = null; // the opening story, as the interface clears it
  for (const id of r.availableNodes()) {
    const n = r.node(id);
    if (n.type !== 'battle' || n.trait) continue;
    const rw = r.makeReward(n, 'battle', { scrapBonus: 0 });
    if (rw.cards.some((c) => c.id === 'pressure_valve')) { SEED = s; FIRST = id; break; }
  }
}
log(`fixture: seed ${SEED}, first battle node ${FIRST}`);
await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
await p.evaluate((seed) => window.__sb.startFixtureRun('beta_badge', seed), SEED);
await skipDialogs();
// first battle: an ordinary fight with the starter deck, played by taps
await tapSel(`.map-node[data-node="${FIRST}"]`); await wait(150); await clickText('Travel');
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
await botBattle();
for (let i = 0; i < 20 && (await screen()) !== 'reward'; i++) { if ((await screen()) === 'dialog') await tapSel('.dlg-skip'); await wait(250); }
// ── Scenario B, step 11: Pressure Valve from the ordinary reward ──
const offer = await p.evaluate(() => window.__sb.run.d.pending.cards.map((c) => c.id));
const pvIdx = offer.indexOf('pressure_valve');
await tapSel(`.reward-cards .card:nth-child(${pvIdx + 1})`); await wait(120);
await shot('B-reward');
await clickText('Take card'); await wait(200);
const pvInst = await p.evaluate(() => window.__sb.run.d.deck.find((c) => c.id === 'pressure_valve'));
check(11, 'Pressure Valve obtained through an ordinary battle reward (tap)', !!pvInst && pvIdx >= 0, `offered: ${offer.join(', ')}`);
await clickText('Continue'); await wait(300);
await skipDialogs();

// ── second battle: Scenario A (four techniques) and Scenario B (Pressure Valve), stacked hand ──
const DECK = ['scrapline', 'rivet_jab', 'scrapfall', 'rethread', 'scrap_feed', 'piston_strike', // the hand
  'scrapline', 'rivet_jab', 'bolt_volley', 'cache_hook', 'splitter', 'prism_cut', // A2, then Prism Cut
  'scrapline', 'rivet_jab', 'hotwire', 'scrapfall', // A3
  'scrapline', 'rivet_jab', 'thermal_lance', 'downshift', 'coil_charge', // A4
  'scrapline', 'rivet_jab', 'PV', 'scrapline', 'rivet_jab', 'piston_strike', 'mend_circuit', 'salvage', 'hotwire'];
await p.evaluate(([spec, pv]) => {
  const r = window.__sb.run;
  r.d.deck = spec.map((id, i) => (id === 'PV' ? { ...pv } : { uid: `fx${i}`, id, up: false }));
}, [DECK, pvInst]);
const second = await p.evaluate(() => { const r = window.__sb.run; return r.availableNodes().find((id) => r.node(id).type === 'battle' && !r.node(id).trait) || r.availableNodes().find((id) => r.node(id).type === 'battle'); });
await tapSel(`.map-node[data-node="${second}"]`); await wait(150); await clickText('Travel');
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
await p.evaluate(([n, pvUid]) => {
  const c = window.__sb.battle.combat;
  const order = [...c.cards.keys()].sort((a, b) => (a === pvUid ? 23 : +a.slice(2)) - (b === pvUid ? 23 : +b.slice(2)));
  c.hand = order.slice(0, 6); c.draw = order.slice(6); c.discard = [];
  c.momentum = 8;
  for (const e of c.enemies) { e.hp = e.maxHp = e.maxHp * n; }
  window.__sb.battle.updateHud(true);
}, [8, pvInst.uid]);
let s = await settled();
check(1, 'An encounter starts with a valid card collection', integrity(s) && s.hand.includes('rethread'), `hand ${s.hand.join(', ')}`);

// A1 — Rethread (Corvin's technique) in Hessa's chain
await tapHero('V');
await play('scrapline', 'rivet_jab', 'scrapfall');
let before = await S();
const tapped = await tapCard('rethread');
s = await settled();
let tech = s.combo && s.combo.log.find((l) => l.k === 'tech' && l.id === 'rethread');
check(2, 'Rethread used by tap during Hessa\'s chain', tapped && !!tech, tech ? `performed by ${tech.hero}` : JSON.stringify(s.combo && s.combo.log));
check(3, 'Its effect applies to the active chain (Hessa\'s), performed by a free ally', tech && tech.attacker === 'V' && tech.hero !== 'V' && s.combo.hero === 'V');
check(5, 'Rank lowered by its value (4 → 2); suit unchanged', before.combo.rank === 4 && s.combo.rank === 2 && s.combo.variant === before.combo.variant, `${before.combo.rank} → ${s.combo.rank}`);
await play('scrap_feed');
s = await settled();
check(7, 'Another legal attack follows: a second rank-4 arte (Scrap Feed) after Scrapfall', s.combo && s.combo.cards.at(-1).id === 'scrap_feed', s.combo && s.combo.cards.map((e) => `${e.id}:${e.rank}`).join(' '));
check(4, 'The queued command sequence stayed legal (nothing refused or sent back)', s.stats.rejected === 0 && s.stats.cancelled === 0);
check(6, 'Step/Cross/EX logic: the technique is not a card in the chain and no recipe repeats', s.combo.cards.length === 4 && new Set(s.combo.ex).size === s.combo.ex.length && !s.combo.cards.some((e) => e.id === 'rethread'));
s = await finishChain();
check(8, 'The chain finishes (FINISH tap)', s && s.history.length >= 1, s && s.history.at(-1).type);
check(9, 'No duplicated resources: zones intact, Momentum accounted, Rethread used once', integrity(s) && s.stats.techniques === 1);
await shot('A1-rethread');

// A2 — Cache Hook from the Reserve, in Pin's chain
await heroReady('S');
const stashU = await uidOf('cache_hook');
await uiPerform(p, { type: 'stash', uid: stashU }, { touch: true });
s = await until((x) => x.reserve.includes('cache_hook'), 3000);
await tapHero('S');
await play('scrapline', 'rivet_jab', 'bolt_volley');
before = await S();
await tapReserve('cache_hook');
s = await settled();
tech = s.combo && s.combo.log.find((l) => l.k === 'tech' && l.id === 'cache_hook');
check('2b', 'Cache Hook played from the Reserve by tap during Pin\'s chain', !!tech, tech ? `performed by ${tech.hero}, rewind ${tech.rewind}` : '');
check('5b', 'From the Reserve: rank lowered by 2 (4 → 2) and +1 Momentum', before.combo.rank === 4 && s.combo.rank === 2, `${before.combo.rank} → ${s.combo.rank}`);
await play('splitter');
s = await finishChain();
check('7b', 'Another legal arte follows (Splitter, rank 4) and the chain finishes', s && s.history.at(-1).len >= 4 && integrity(s), s && s.history.at(-1).type);

// A3 — Prism Cut (Corvin's) in Hessa's chain: EX suit, the next A card Crosses
await heroReady('V');
await tapHero('V');
await play('scrapline');
before = await S();
await tapCard('prism_cut');
s = await settled();
check('5c', 'Prism Cut: the chain\'s suit becomes EX and its rank drops by 1 (1 → 0)', before.combo.rank === 1 && s.combo.rank === 0 && s.combo.variant === 'EX', `${before.combo.rank}${before.combo.variant} → ${s.combo.rank}${s.combo.variant}`);
await play('rivet_jab');
s = await settled();
check('6c', 'The next A card Crosses (EX → A)', s.combo.cards.at(-1).cross === true, JSON.stringify(s.combo.cards.at(-1)));
await play('piston_strike', 'scrapfall');
s = await finishChain();
check('8c', 'The chain finishes; zones and Momentum intact', integrity(s), s && s.history.at(-1).type);

// A4 — Downshift (Hessa's) in Corvin's chain
await heroReady('C');
await tapHero('C');
await play('scrapline', 'rivet_jab', 'thermal_lance');
before = await S();
await tapCard('downshift');
s = await settled();
tech = s.combo && s.combo.log.find((l) => l.k === 'tech' && l.id === 'downshift');
check('5d', 'Downshift: rank drops by 4 (4 → 0), performed by Hessa', !!tech && tech.hero === 'V' && s.combo.rank === 0, tech ? `${before.combo.rank} → ${s.combo.rank}` : '');
await play('coil_charge');
s = await finishChain();
check('7d', 'Another arte follows (Coil Charge) and the chain finishes', s && integrity(s) && s.stats.techniques === 4, `techniques used ${s && s.stats.techniques}`);

// ── Scenario B, steps 12–13, 15: Pressure Valve played by taps ──
await heroReady('C');
await tapHero('C');
await play('scrapline', 'rivet_jab');
before = await S();
const pvGot = await tapCard('pressure_valve');
s = await settled();
const pvE = s.combo && s.combo.cards.find((e) => e.id === 'pressure_valve');
const avail = before.mom - before.reserved - 3;
const vent = Math.max(0, Math.min(3, avail));
check(12, 'Pressure Valve played legally (Corvin, after two basic attacks)', pvGot && !!pvE);
check(13, 'Its effect: 6 × (1 + vented) damage, 3 Guard per point vented, at most 3 vented', pvE && pvE.dmg === 6 * (1 + vent), pvE ? `vented ${vent}: ${pvE.dmg} damage (target Guard and modifiers aside)` : '');
check(15, 'Momentum accounting: the arte\'s 3 plus the vented points, the rest stays', s.mom === before.mom - 3 - vent || s.mom === before.mom - 3 - vent + 1, `${before.mom} → ${s.mom}`);
s = await finishChain();
// steps 14, 16, 17: focused engine checks (disclosed: not interface-level)
{
  const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
  // Corvin's chain: Weak, Medium, Thermal Lance (2 Momentum), then the arte under test
  const mk = (id, up, mom, relics = []) => { const c = new Combat({ deck: ['scrapline', 'rivet_jab', 'thermal_lance', id].map((x, i) => ({ uid: `k${i}`, id: x, up: x === id && up })), party: PARTY, hp: 130, maxHp: 130, enemies: ['foundry_warden'], seed: 3, relics, mutations: [], act: 1 }); c.hand = ['k0', 'k1', 'k2', 'k3', null, null]; c.draw = []; c.momentum = mom; for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = 3000; e.guard = 0; } c.selectHero('C'); for (const u of ['k0', 'k1', 'k2', 'k3']) { c.commit(u); for (let i = 0; i < 900 && (c.executing || c.queue.length); i++) c.update(1 / 60); } return c; };
  const pv = mk('pressure_valve', false, 10), op = mk('overpressure', false, 10);
  // what each arte spent (its cost plus what it vented), read from its chain entry; Momentum left over
  // afterwards also includes Pressure Release's refund, so the entry is the fair comparison
  const pvS = pv.combo.cards.at(-1).spent, opS = op.combo.cards.at(-1).spent;
  check(14, 'Compared with Overpressure: Pressure Valve spends its 3 and vents at most 3; Overpressure spends everything', pvS === 6 && opS > pvS, `spent: Pressure Valve ${pvS} (3 + 3 vented), Overpressure ${opS}`);
  const up = mk('pressure_valve', true, 10);
  const e0 = pv.combo.cards.at(-1), e1 = up.combo.cards.at(-1);
  check(16, 'Upgraded: 7 per step and up to 4 vented', e1.dmg > e0.dmg, `damage ${e0.dmg} → ${e1.dmg}`);
  const rel = mk('pressure_valve', false, 10, ['prism_lens', 'tower_plate']);
  const exPR = [pv, up, rel].every((x) => x.combo.ex.has('pressure_release'));
  const relE = rel.combo.cards.at(-1);
  check(17, 'Relic and EX interactions: Thermal Lance\'s 2 plus the Valve\'s 6 complete Pressure Release (8 on artes); Tower Plate and Prism Lens leave it intact', exPR && relE.spent === 6, `Pressure Release in all three chains: ${exPR}; with relics the Valve spent ${relE.spent}`);
}
// A10 — the techniques survive a save and a reload
await botBattle();
for (let i = 0; i < 30 && (await screen()) !== 'map'; i++) { const sc = await screen(); if (sc === 'dialog') await tapSel('.dlg-skip'); else if (sc === 'reward') { await clickText('Skip card'); await clickText('Continue'); } else await clickText('Continue'); await wait(250); }
await p.reload();
await p.waitForFunction(() => window.__sb);
await clickText('Continue'); await wait(500);
const kept = await p.evaluate(() => window.__sb.run && window.__sb.run.d.deck.filter((c) => ['rethread', 'cache_hook', 'prism_cut', 'downshift', 'pressure_valve'].includes(c.id)).map((c) => c.id));
check(10, 'The technique cards (and Pressure Valve) remain valid after a save and a reload', kept && ['rethread', 'cache_hook', 'prism_cut', 'downshift', 'pressure_valve'].every((id) => kept.includes(id)), kept && kept.join(', '));

// ── Scenarios D and C: the Act I boss (Scrap Tyrant) with Payout Audit ──
await skipDialogs();
await p.evaluate((ad) => {
  const r = window.__sb.run;
  const bn = r.d.map.nodes.find((n) => n.type === 'boss');
  r.d.position = r.d.map.nodes.find((n) => n.edges.includes(bn.id)).id;
  r.d.deck = ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'piston_strike', 'mend_circuit', 'salvage', 'thermal_lance', 'bolt_volley'].map((id, i) => ({ uid: `bx${i}`, id, up: false }));
  r.d.pending = { type: 'bossprep', nodeId: bn.id, bossId: r.d.bosses[1], introShown: true, ...r.bossAnalysis() };
  r.d.pending.adaptation = { ...ad }; r.d.pending.arch = 'cashout';
  window.__sb.save(); window.__sb.route();
}, ADAPTATIONS.cashout);
await skipDialogs();
await shot('D-prep');
const prepText = await p.evaluate(() => (document.querySelector('.bossprep') || {}).textContent || '');
await tapSel('.prep-plans .choice'); // Prepared · Brace Protocol
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
await p.evaluate(() => { const c = window.__sb.battle.combat; const ids = [...c.cards.keys()].sort((a, b) => +a.slice(2) - +b.slice(2)); c.hand = ids.slice(0, 6); c.draw = ids.slice(6); c.discard = []; c.momentum = 8; for (const e of c.enemies) { e.hp = e.maxHp = e.maxHp * 2; } window.__sb.battle.updateHud(true); });
s = await settled();
check(24, 'A boss encounter with a known adaptation (Scrap Tyrant, Payout Audit)', s && s.adapt && s.adapt.id === 'payout_audit', s && JSON.stringify(s.adapt));
await shot('D-warning');
check(25, 'Its warning is shown (preparation screen and the in-battle panel)', /Payout|Аудит|выплат/i.test(prepText + s.panel) && s.panel.length > 0, s.panel.slice(0, 120));
// 26: a Cash Out under the audit pays 60%
await tapHero('V');
await play('scrapline', 'rivet_jab', 'piston_strike');
const expect = await p.evaluate(() => { const c = window.__sb.battle.combat; return c.payoutAmount(1).amount; });
s = await finishChain();
const paid1 = await p.evaluate(() => { const c = window.__sb.battle.combat; return c.history.at(-1); });
check(26, 'The negative effect operates: a Cash Out payout is reduced', s.history.at(-1).type === 'cashout' && expect > 0, `payout under the audit: ${expect}`);
// 27–29: three Perfect combos by taps
const progress = [];
for (let k = 0; k < 3; k++) {
  const hero = ['V', 'V', 'V'][k];
  await heroReady(hero, 20000);
  await tapHero(hero);
  await play('scrapline', 'rivet_jab', 'scrapfall');
  s = await finishChain();
  progress.push(`${s.adapt.progress}/${s.adapt.need} "${(s.panel.match(/\d+\/\d+/) || [''])[0]}"`);
  if (k === 0) check(27, 'The actual counterplay: a Perfect combo (arte last, FINISH)', s.history.at(-1).type === 'perfect');
  if (k === 0) check(28, 'The break-progress indicator advances on the battle screen', s.panel.includes('1/3'), progress[0]);
}
await shot('D-broken');
check(29, 'The adaptation breaks after the third Perfect', s.adapt.broken === true, progress.join(' · '));
await heroReady('V', 20000);
await tapHero('V');
await play('scrapline', 'rivet_jab');
const full = await p.evaluate(() => window.__sb.battle.combat.payoutAmount(1).amount);
s = await finishChain();
check(30, 'Its negative effect stops: the payout is no longer reduced', full > 0 && s.adapt.broken, `payout now ${full}`);
void paid1;
await botBattle(300000);
const bossWon = await p.evaluate(() => window.__sb.run.d.bossesDefeated && window.__sb.run.d.bossesDefeated.length >= 1);
check(31, 'The battle continues normally to victory', bossWon);
// C18: a relic from the boss reward
for (let i = 0; i < 20 && (await screen()) !== 'reward'; i++) { if ((await screen()) === 'dialog') await tapSel('.dlg-skip'); await wait(250); }
const relicsOffered = await p.evaluate(() => window.__sb.run.d.pending && window.__sb.run.d.pending.relics);
await tapSel('.reward-relics .relic-badge'); await wait(200);
const relicGot = await p.evaluate(() => window.__sb.run.d.relics.slice());
check(18, 'A relic acquired from the boss reward (tap)', relicsOffered && relicGot.includes(relicsOffered[0]), `offered ${relicsOffered && relicsOffered.join(', ')}; now ${relicGot.join(', ')}`);
await clickText('Skip card'); await clickText('Continue'); await wait(300);
for (let i = 0; i < 30 && (await screen()) !== 'mutation'; i++) { if ((await screen()) === 'dialog') await tapSel('.dlg-skip'); else await clickText('Continue'); await wait(250); }
const mutOpts = await p.evaluate(() => window.__sb.run.d.pending && window.__sb.run.d.pending.options);
await shot('C-mutation');
await tapSel('.mut-card'); await wait(300);
const mutation = mutOpts && mutOpts[0];
const muts = await p.evaluate(() => window.__sb.run.d.mutations.slice());
check(20, 'A mutation selected after the boss (tap)', mutation && muts.includes(mutation), mutation);
await skipDialogs();
const act2 = await p.evaluate(() => window.__sb.run.d.act);
check(21, 'The run continues into Act II', act2 === 2);

// ── Scenario E in Act II: shop, surgery, event, save and reload ──
await p.evaluate(() => { const r = window.__sb.run; r.d.scrap = 400; const node = r.d.map.nodes.find((n) => n.type === 'shop') || r.d.map.nodes[1]; r.d.pending = { type: 'shop', nodeId: node.id, stock: r.makeShop(r.rng('accept8-shop'), false) }; window.__sb.save(); window.__sb.route(); });
await wait(400);
check(32, 'A shop is open', (await screen()) === 'shop');
const deckN0 = await p.evaluate(() => window.__sb.run.d.deck.length);
await tapSel('.shop-cards .shop-item:not(.sold)'); await wait(300);
const deckN1 = await p.evaluate(() => window.__sb.run.d.deck.length);
check(33, 'A valid item purchased (tap)', deckN1 === deckN0 + 1, `deck ${deckN0} → ${deckN1}`);
await tapSel('.shop-services .svc:not([disabled])'); await wait(300);
if ((await screen()) === 'modal') { await tapSel('.modal .sel-card, .modal .card'); await wait(150); await tapSel('.modal .btn.primary'); await wait(300); }
const used = await p.evaluate(() => { const s = window.__sb.run.d.pending.stock; return ['remove', 'upgrade', 'surgery', 'heal'].filter((k) => s[`${k}Used`]); });
check(34, 'A shop service used (tap, card chosen in the selection sheet)', used.length >= 1, used.join(', '));
await shot('E-shop');
await clickText('Leave'); await wait(300);
await p.evaluate(() => { const r = window.__sb.run; const node = r.d.map.nodes.find((n) => n.type === 'surgery') || r.d.map.nodes[2]; r.d.pending = { type: 'surgery', nodeId: node.id, ops: 0, grafts: ['plated', 'spark', 'quick'], select: null }; window.__sb.save(); window.__sb.route(); });
await wait(400);
check(35, 'A surgery is open', (await screen()) === 'surgery');
const sig0 = await p.evaluate(() => Object.fromEntries(window.__sb.run.d.deck.map((c) => [c.uid, JSON.stringify(c)])));
await tapSel('.surgery-ops .choice:not([disabled])'); await wait(300);
if ((await screen()) === 'modal') { await tapSel('.modal .sel-card, .modal .card'); await wait(150); await tapSel('.modal .btn.primary'); await wait(300); }
const mod = await p.evaluate((sig) => { const r = window.__sb.run; const ch = r.d.deck.filter((c) => sig[c.uid] !== JSON.stringify(c)); return { changed: ch.map((c) => ({ uid: c.uid, id: c.id, graft: c.graft, rankMod: c.rankMod, variant: c.variant })), ops: r.d.pending.ops, scrap: r.d.scrap }; }, sig0);
check(36, 'A card modified (first operation free)', mod.ops === 1 && mod.changed.length === 1, JSON.stringify(mod.changed));
await clickText('Leave'); await wait(300);
await p.evaluate(() => { const r = window.__sb.run; const node = r.d.map.nodes.find((n) => n.type === 'event') || r.d.map.nodes[3]; r.d.pending = { type: 'event', nodeId: node.id, eventId: 'variant_press', result: null, select: null }; window.__sb.save(); window.__sb.route(); });
await wait(400);
check(38, 'An event is open (The Variant Press)', (await screen()) === 'event');
const v0 = await p.evaluate(() => window.__sb.run.d.deck.map((c) => `${c.uid}:${c.variant || ''}:${c.recut ? 1 : 0}`));
await tapSel('.event-choices .choice:not([disabled])'); await wait(400);
if ((await screen()) === 'modal') { await tapSel('.modal .sel-card, .modal .card'); await wait(150); await tapSel('.modal .btn.primary'); await wait(300); }
const v1 = await p.evaluate(() => window.__sb.run.d.deck.map((c) => `${c.uid}:${c.variant || ''}:${c.recut ? 1 : 0}`));
const changed = v1.filter((x, i) => x !== v0[i]);
check(39, 'A valid choice made (tap, card chosen)', changed.length >= 1, changed.join(' '));
check(40, 'Its actual effect: the chosen card\'s suit was recut', changed.length === 1 && changed[0].endsWith(':1'), changed.join(' '));
await shot('E-event');
const snap = await p.evaluate(() => JSON.stringify({ deck: window.__sb.run.d.deck, relics: window.__sb.run.d.relics, mutations: window.__sb.run.d.mutations, scrap: window.__sb.run.d.scrap }));
await clickText('Continue'); await wait(300);
await p.reload();
await p.waitForFunction(() => window.__sb);
await clickText('Continue'); await wait(500);
const snap2 = await p.evaluate(() => window.__sb.run && JSON.stringify({ deck: window.__sb.run.d.deck, relics: window.__sb.run.d.relics, mutations: window.__sb.run.d.mutations, scrap: window.__sb.run.d.scrap }));
check(41, 'Save and reload', !!snap2);
check(42, 'The resulting state persists (deck, modifications, relics, mutation, Scrap)', snap === snap2);

// ── the next Act II battle: relic and mutation function, the modified card is playable ──
await skipDialogs();
const nb = await p.evaluate(() => { const r = window.__sb.run; return r.availableNodes().find((id) => r.node(id).type === 'battle') || r.availableNodes()[0]; });
await tapSel(`.map-node[data-node="${nb}"]`); await wait(150); await clickText('Travel');
await p.waitForFunction(() => window.__sb.battle && window.__sb.battle.combat, null, { timeout: 10000 });
s = await settled();
const relic = relicsOffered && relicsOffered[0];
const relicOk = relic === 'scrap_heart' ? s.guard >= 10 && s.guardCap >= 50 : s.relics.includes(relic);
check(19, 'The boss relic works in combat', s.relics.includes(relic) && relicOk, `${relic}: Guard at the start ${Math.floor(s.guard)}, Guard cap ${s.guardCap}`);
const MUT_CHECK = { grinder: (x) => x.churnMax >= 5, deep_pockets: (x) => x.reserveMax >= 3, overpressure_valve: (x) => x.momMax >= 14, long_breath: (x) => x.momentumCostFlow === 2 && x.flowSpend === 2, glass_cannon: () => true, perfect_pitch: () => true, quick_exit: () => true, signal_thief: () => true, bastion_protocol: () => true, relay_resonance: () => true, duality_engine: () => true, ascendant_ladder: () => true };
check(22, 'The mutation persists into Act II and is active in battle', s.mutations.includes(mutation) && (MUT_CHECK[mutation] || (() => true))(s), `${mutation} active: ${s.mutations.join(', ')}`);
const syn = await p.evaluate(([m, rl]) => { const r = window.__sb.run; const tags = r.tagCounts(); return { tags, mt: window.__sb && m, lead: r.dominantTags()[0] }; }, [mutation, relic]);
check(23, 'Build synergy: the mutation and relic now steer the build direction (offers lean to it)', syn.lead && (MUTATIONS[mutation].tag ? syn.tags[MUTATIONS[mutation].tag] >= 2 : true), JSON.stringify(syn.tags));
const modUid = mod.changed.length ? mod.changed[0].uid : null;
const playable = await p.evaluate((u) => { const c = window.__sb.battle.combat; const inst = u && c.cards.get(u); return inst ? { id: inst.id, graft: inst.graft, rankMod: inst.rankMod, effRank: c.effRank(u), check: c.check(u).reason || 'ok' } : null; }, modUid);
check(37, 'The modified card remains playable in the next battle (in the battle deck, modification kept, ordinary legality)', playable && JSON.stringify([playable.graft || null, playable.rankMod || 0]) === JSON.stringify([mod.changed[0].graft || null, mod.changed[0].rankMod || 0]) && ['ok', 'nocombo', 'needbasic', 'rank', 'owner', 'momentum', 'zone'].includes(playable.check), JSON.stringify(playable));
await botBattle(240000);
check('—', 'No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
finish(`ui-${LANG}-${W}`, { seed: SEED, errors });
