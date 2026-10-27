// Milestone proof: plays a fresh run ONLY through the UI (taps/clicks), with ordinary gameplay and no
// state injection, and at every major transition reloads the page, presses Continue and asserts the
// restored state matches. Engine state is read for decisions and assertions only, never written.
//
// Checkpoints: mid-battle restore, Act I boss fight restore, Act I boss reward, mutation choice,
// boss aftermath story, Act II map entry, Act III entry, final boss fight restore, ending scene restore,
// run end (no Continue afterwards), and the Museum unlock being usable in the next run. The route takes
// one elite per act (Acts I-II) while healthy, spends Scrap at one shop, and takes the Volatile
// preparation against the Act II boss, so those paths are exercised too.
//
// Usage: node tools/milestone.mjs [outDir] [minutes] [stopAtAct] [width] [height]
// SB_LANG=ru     plays in Russian: switches the language with the title-screen toggle, finds buttons by
//                their translated labels, and checks every screen (DOM and canvas text) for leftover
//                English and for clipped text.
// SB_FLOW=defeat after the first run, restarts a fight from the pause menu, loses the next run (the bot
//                stops acting at its Act I boss), and starts a third run up to its first victory.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { findIssues } from './lib/text-issues.mjs';
import { RU } from '../src/i18n/ru.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const LANG = process.env.SB_LANG || 'en';
const FLOW = process.env.SB_FLOW || 'full';
const L = (s) => (LANG === 'ru' && RU.ui[s] !== undefined ? RU.ui[s] : s);

const [outDir = 'milestone-out', minutes = 25, stopAtAct = 4, W = 1194, H = 834] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, hasTouch: true });
// Record canvas text so the battle field can be checked for untranslated words too.
await ctx.addInitScript(() => {
  window.__drawn = new Set();
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (txt, ...rest) { if (typeof txt === 'string' && txt.length > 1) window.__drawn.add(txt); return fill.call(this, txt, ...rest); };
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

const checks = [];
const events = [];
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
const log = (s) => { events.push(`${stamp()} ${s}`); console.log(`${stamp()} ${s}`); };
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const shot = (name) => p.screenshot({ path: `${outDir}/${name}.png` });

const click = async (sel) => { const el = await p.$(sel); if (el) { await el.click({ timeout: 1500 }).catch(() => {}); return true; } return false; };
const clickText = async (text) => { const el = p.getByRole('button', { name: L(text), exact: true }).first(); if (await el.count()) { await el.click({ timeout: 1500 }).catch(() => {}); return true; } return false; };

const screen = () => p.evaluate(() => {
  if (document.querySelector('.dialog-layer')) return 'dialog';
  if (document.querySelector('.modal .deck-grid.select')) return 'select';
  if (document.querySelector('.modal')) return 'modal';
  const s = document.querySelector('.layer-screen > div');
  return s ? s.className.split(' ')[0] : 'none';
});
// Read-only snapshot of saved run state (what Continue must restore).
const snap = () => p.evaluate(() => {
  const r = window.__sb.run;
  if (!r) return null;
  const d = r.d;
  return {
    act: d.act, floors: d.floors, scrap: d.scrap, seed: d.seed,
    deck: d.deck.map((c) => `${c.uid}:${c.id}${c.up ? '+' : ''}${c.graft ? '/' + c.graft : ''}${c.rankMod ? '/r' + c.rankMod : ''}${c.variant ? '/' + c.variant : ''}`),
    relics: d.relics.slice(), mutations: d.mutations.slice(), party: d.party.map((m) => `${m.id}:${m.hp}/${m.maxHp}`),
    path: d.path.slice(), pending: d.pending ? JSON.stringify(d.pending) : null,
    map: d.map ? d.map.nodes.map((n) => `${n.id}:${n.type}:${n.trait || ''}:${n.edges.join('|')}`).join(',') : null,
    bossDecisions: JSON.stringify(d.bossDecisions),
  };
});
// Words of 3+ Latin letters that may legitimately stay in Latin script in any language.
// Language names in the switch are written in their own language on purpose.
const LATIN_OK = /^(SIGNAL|BREAK|Signalbreak|EX|ATB|Mk\d*|Shift|Alt|Tab|Esc|JRPG|NPC|root|Root|give|rare|English)$/;
const leftovers = new Map();
const layoutIssues = new Map();
async function scanScreen(name) {
  if (LANG === 'en') return;
  const r = await p.evaluate(() => {
    const out = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const el = n.parentElement;
      if (!el || !el.getClientRects().length || el.closest('.dlg-text')) continue; // dialogue is typed out letter by letter
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) out.add(t);
    }
    for (const el of document.querySelectorAll('[aria-label],[title]')) for (const a of ['aria-label', 'title']) { const v = el.getAttribute(a); if (v) out.add(v); }
    const drawn = [...window.__drawn];
    window.__drawn.clear();
    return { dom: [...out], canvas: drawn };
  });
  for (const [src, list] of Object.entries(r)) {
    for (const text of list) {
      const bad = [...new Set((text.match(/[A-Za-z]{3,}/g) || []).filter((w) => !LATIN_OK.test(w)))];
      if (bad.length && !leftovers.has(`${src}|${text}`)) leftovers.set(`${src}|${text}`, { screen: name, src, text: text.slice(0, 90), words: bad });
    }
  }
  for (const i of await p.evaluate(findIssues)) {
    const key = `${i.kind}|${i.where}|${i.text}`;
    if (!layoutIssues.has(key)) layoutIssues.set(key, { screen: name, ...i });
  }
}

const same = (a, b, keys) => keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

async function reloadAndContinue(label) {
  const before = await snap();
  await p.reload();
  await p.waitForTimeout(700);
  const hasContinue = await p.getByRole('button', { name: L('Continue'), exact: true }).count();
  check(`${label}: Continue offered after reload`, hasContinue > 0);
  await clickText('Continue');
  await p.waitForTimeout(800);
  const after = await snap();
  const diff = after ? same(before, after, ['act', 'floors', 'scrap', 'deck', 'relics', 'mutations', 'party', 'path', 'map', 'bossDecisions', 'pending']) : ['run missing'];
  check(`${label}: state identical after reload`, diff.length === 0, diff.length ? `differs: ${diff.join(', ')}` : `act ${after.act}, floor ${after.floors}, deck ${after.deck.length}, relics ${after.relics.length}`);
  return { before, after };
}

// ── battle play: ordinary heuristics, actions only through taps ──
// Swipe a hand card down to Churn it.
async function swipeDown(i) {
  const slot = (await p.$$('.slot'))[i];
  const box = slot && (await slot.boundingBox());
  if (!box) return;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  for (let k = 1; k <= 6; k++) await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + k * 10);
  await p.mouse.up();
}

// Logs the state of a long fight every 30 s so stalls can be diagnosed from the report.
let fightStart = 0, fightLogAt = 0;
async function fightLog() {
  const now = Date.now();
  if (!fightStart) { fightStart = now; fightLogAt = now + 30000; return; }
  if (now < fightLogAt) return;
  fightLogAt = now + 30000;
  const f = await p.evaluate(() => {
    const c = window.__sb.battle && window.__sb.battle.combat;
    if (!c) return null;
    const roles = c.hand.map((u) => (u ? c.roleOf(u) : '-')).join(',');
    return `t=${c.t.toFixed(0)}s enemies ${c.enemies.filter((e) => e.alive).map((e) => `${e.id} ${Math.round(e.hp)}/${e.maxHp} g${Math.round(e.guard)}`).join(' ')} | party ${c.party.map((m) => (m.ko ? 'KO' : Math.round(m.hp))).join('/')} | ${c.phase} hand ${roles} | glitch in draw ${c.draw.filter((u) => c.roleOf(u) === 'junk').length} | churn ${c.churn.charges}`;
  });
  if (f) log(`fight ${f}`);
  await scanScreen('battle');
}

async function battleTick() {
  if (await click('.tut-layer:not([hidden]) .btn')) return;
  const st = await p.evaluate(() => {
    const bs = window.__sb.battle;
    const c = bs && bs.combat;
    if (!c || c.phase === 'END') return null;
    const legal = c.hand.map((u, i) => (u && c.check(u).ok ? { i, role: c.roleOf(u), rank: c.effRank(u) } : null)).filter(Boolean);
    const res = c.reserve.map((u, i) => (c.check(u).ok ? { i, role: c.roleOf(u), rank: c.effRank(u) } : null)).filter(Boolean);
    return {
      phase: c.phase, len: c.combo ? c.combo.cards.length : 0, left: c.flowLeft(), mom: c.momentum, guard: c.guard,
      danger: c.aliveEnemies().some((e) => e.atb > 0.8 && e.intent && (e.intent.kind === 'atk' || e.intent.kind === 'aoe')),
      canCash: c.canCashOut(), legal, res, flowCost: c.momentumCostFlow(),
      bad: c.hand.findIndex((u) => u && !c.check(u).ok && !c.isLocked(u)), charges: c.churn.charges,
      junk: c.hand.findIndex((u) => u && c.roleOf(u) === 'junk'),
    };
  });
  if (!st) return;
  // Glitch cards cost nothing to Churn: swipe them away whenever they show up
  if (st.junk >= 0) { await swipeDown(st.junk); return; }
  if (st.danger && st.guard < 6 && st.mom >= 3) { await p.click('.ctl.mom:nth-of-type(2)', { timeout: 300 }).catch(() => {}); return; }
  if (st.phase === 'ACTIVE' && st.mom >= 6 && st.left < 1 && st.len >= 2) { await p.click('.ctl.mom:nth-of-type(1)', { timeout: 300 }).catch(() => {}); }
  let pick = null;
  if (st.phase === 'PRE') {
    pick = st.legal.filter((x) => x.role === 'open').sort((a, b2) => a.rank - b2.rank)[0];
    if (!pick && st.bad >= 0 && st.charges > 0) { await swipeDown(st.bad); return; }
  }
  else if (st.phase === 'ACTIVE') {
    const closers = st.legal.filter((x) => x.role === 'close').sort((a, b2) => b2.rank - a.rank);
    const convs = st.legal.filter((x) => x.role === 'conv').sort((a, b2) => a.rank - b2.rank);
    if (closers.length && (st.len >= 3 || !convs.length || st.left < 1.1)) pick = closers[0];
    else if (convs.length && st.left > 0.25) pick = convs[0];
    else if (st.res.length) { await p.click(`.res-cell:nth-child(${st.res[0].i + 1}) .res-card`, { timeout: 300 }).catch(() => {}); return; }
    else if (st.canCash) { await p.click('.ctl.cash', { timeout: 300 }).catch(() => {}); return; }
    else if (st.bad >= 0 && st.charges > 0) { await swipeDown(st.bad); return; }
  }
  if (pick) {
    const box = await (await p.$$('.slot'))[pick.i].boundingBox();
    if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

await p.goto(URL);
await p.waitForFunction(() => window.__sb, null, { timeout: 15000 });
await p.waitForTimeout(300);
const titleState = () => p.evaluate(() => ({ lang: document.documentElement.lang, btn: document.querySelector('.title-menu .btn').textContent, tagline: document.querySelector('.tagline').textContent }));
if (LANG !== 'en') {
  await p.locator('.title .lang-switch .lang-opt[lang="' + LANG + '"]').click();
  await p.waitForTimeout(400);
  const a = await titleState();
  check('Language switched from the title screen', a.lang === LANG && a.btn === L('New Run'), `${a.lang}: ${a.btn} · ${a.tagline}`);
  await p.reload();
  await p.waitForFunction(() => window.__sb, null, { timeout: 15000 });
  await p.waitForTimeout(400);
  const b2 = await titleState();
  check('Language choice persists after reload', b2.lang === LANG && b2.btn === L('New Run'), `${b2.lang}: ${b2.btn}`);
  await shot('00-title');
}
const deadline = Date.now() + minutes * 60000;
let lastScreen = '';
const done = new Set();
let battleSeen = 0;
let firstRunSummary = null;
const elitesTaken = new Set();
let shopDone = false;
let elitesChecked = 0;
let runIndex = 1;
const seenModals = new Set();
let stallTicks = 0;
let sawDefeatDialog = '';

while (Date.now() < deadline) {
  const s = await screen();
  const st = await p.evaluate(() => { const r = window.__sb && window.__sb.run; const pd = r && r.d.pending; return r ? { act: r.d.act, pending: pd && pd.type, next: pd && pd.next, boss: !!(pd && pd.boss), bossFight: !!(pd && pd.type === 'battle' && pd.nodeId && r.node(pd.nodeId).type === 'boss'), floor: r.d.floors } : null; });
  if (s !== 'battle') fightStart = 0;
  if (s !== lastScreen) {
    log(`screen ${s}${st ? ` (act ${st.act}, floor ${st.floor}, pending ${st.pending})` : ''}`);
    lastScreen = s;
    await p.waitForTimeout(250);
    await scanScreen(s === 'dialog' || s === 'modal' ? `${s}@${st ? `act${st.act}-floor${st.floor}-${st.pending}` : 'no run'}` : s);
  }

  // ── SB_FLOW=defeat: runs 2 and 3 ──
  if (runIndex === 2 && s === 'battle' && st && !st.bossFight && !done.has('restart2')) {
    done.add('restart2');
    await p.waitForTimeout(2500);
    const before = await p.evaluate(() => ({ t: window.__sb.battle.combat.t, enemies: window.__sb.battle.combat.enemies.map((e) => e.id) }));
    await click('.pause-btn');
    await p.waitForTimeout(300);
    await shot('07-pause-menu');
    await clickText('Restart encounter');
    await p.waitForTimeout(300);
    await shot('08-restart-confirm');
    await p.locator('.modal .btn.danger', { hasText: L('Restart') }).click();
    await p.waitForTimeout(800);
    const after = await p.evaluate(() => ({ t: window.__sb.battle.combat.t, enemies: window.__sb.battle.combat.enemies.map((e) => e.id) }));
    check('Restart encounter from the pause menu restarts the fight', (await screen()) === 'battle' && after.t < before.t && JSON.stringify(after.enemies) === JSON.stringify(before.enemies), `t ${before.t.toFixed(1)}s -> ${after.t.toFixed(1)}s, ${after.enemies.join('+')}`);
    continue;
  }
  if (runIndex === 2 && s === 'dialog' && !st) {
    sawDefeatDialog = await p.evaluate(() => { const n = document.querySelector('.dlg-name b'); const tx = document.querySelector('.dlg-text'); return n ? `${n.textContent}: ${tx.textContent}` : ''; });
    await p.waitForTimeout(1200);
    sawDefeatDialog = await p.evaluate(() => { const n = document.querySelector('.dlg-name b'); const tx = document.querySelector('.dlg-text'); return n ? `${n.textContent}: ${tx.textContent}` : ''; });
    await shot('09-defeat-dialog');
  }
  if (runIndex === 2 && s === 'results' && !done.has('results2')) {
    done.add('results2');
    await shot('10-defeat-results');
    const r = await p.evaluate(() => ({ title: document.querySelector('.results-body h1').textContent, runs: window.__sb.meta.totalRuns, last: window.__sb.meta.runs[0].result }));
    check('Defeat ends the run on the results screen', r.title === L('RUN ENDED') && r.last === 'defeat' && r.runs === 2, `${r.title}, Museum runs ${r.runs}, last ${r.last}`);
    check('Defeat dialogue shown', !!sawDefeatDialog, sawDefeatDialog);
    await clickText('New Run');
    await p.waitForTimeout(400);
    await clickText('Begin');
    await p.waitForTimeout(600);
    runIndex = 3;
    check('New run starts after the defeat', await p.evaluate(() => !!window.__sb.run && window.__sb.run.d.floors === 0));
    continue;
  }
  if (runIndex === 3 && s === 'reward') {
    check('New run after the defeat reaches its first victory', true, await p.evaluate(() => `floor ${window.__sb.run.d.floors}`));
    await shot('11-run3-reward');
    break;
  }

  // ── checkpoints ──
  if (s === 'battle' && !done.has('midbattle') && st && st.act === 1 && st.floor >= 2) {
    await p.waitForTimeout(2500);
    const enemiesBefore = await p.evaluate(() => window.__sb.battle && window.__sb.battle.combat.enemies.map((e) => e.id));
    done.add('midbattle');
    await reloadAndContinue('Mid-battle (Act I)');
    const enemiesAfter = await p.evaluate(() => window.__sb.battle && window.__sb.battle.combat.enemies.map((e) => e.id));
    check('Mid-battle: Continue restarts the same encounter', JSON.stringify(enemiesBefore) === JSON.stringify(enemiesAfter), `${(enemiesAfter || []).join('+')}`);
    continue;
  }
  if (s === 'battle' && st && st.bossFight && (st.act === 1 || st.act === 3) && !done.has(`bossfight${st.act}`)) {
    done.add(`bossfight${st.act}`);
    await p.waitForTimeout(3000);
    const label = st.act === 1 ? 'Act I boss fight' : 'Final boss fight';
    const before = await p.evaluate(() => window.__sb.battle.combat.enemies.map((e) => e.id));
    await reloadAndContinue(label);
    const after = await p.evaluate(() => window.__sb.battle && window.__sb.battle.combat.enemies.map((e) => e.id));
    check(`${label}: Continue returns straight to the same boss`, (await screen()) === 'battle' && JSON.stringify(before) === JSON.stringify(after), (after || []).join('+'));
    continue;
  }
  if (s === 'dialog' && st && st.act === 3 && st.pending === 'story' && st.next === 'victory' && !done.has('ending')) {
    done.add('ending');
    await reloadAndContinue('Ending scene');
    check('Ending scene replays after Continue', (await screen()) === 'dialog');
    continue;
  }
  if (s === 'reward' && st && !st.boss) {
    const el = await p.evaluate(() => ({ n: window.__sb.run.d.stats.elites, id: window.__sb.run.d.lastElite }));
    if (el.n > elitesChecked) { elitesChecked = el.n; check('Elite defeated through normal play', true, `act ${st.act}: ${el.id}`); }
  }
  if (s === 'reward' && st && st.boss && st.act === 1 && !done.has('bossreward')) {
    done.add('bossreward');
    await shot('01-act1-boss-reward');
    const r = await reloadAndContinue('Act I boss reward');
    check('Act I boss defeated through normal play', JSON.parse(r.after.bossDecisions).some((x) => x.act === 1 && x.result === 'victory'), JSON.parse(r.after.bossDecisions).map((x) => `${x.boss}:${x.prep}:${x.result}`).join(' '));
    continue;
  }
  if (s === 'mutation' && st && st.act === 1 && !done.has('mutation')) {
    done.add('mutation');
    await shot('02-mutation-choice');
    await reloadAndContinue('Mutation choice');
    const opts = await p.$$eval('.mut-card b', (els) => els.map((e) => e.textContent));
    await click('.mut-card');
    await p.waitForTimeout(400);
    const after = await snap();
    check('Mutation recorded in run state', after.mutations.length === 1, `${opts[0]} -> ${after.mutations.join(',')}`);
    const r = await reloadAndContinue('Boss aftermath (post-mutation)');
    check('Mutation survives reload', r.after.mutations.length === 1, r.after.mutations.join(','));
    continue;
  }
  if (s === 'map' && st && st.act === 2 && !done.has('act2')) {
    done.add('act2');
    await shot('03-act2-map');
    const r = await reloadAndContinue('Act II entry');
    check('Entered Act II with an Act II map', r.after.act === 2 && r.after.map.includes('n2_'), `act ${r.after.act}`);
    if (+stopAtAct <= 2) break;
    continue;
  }
  if (s === 'battle' && st && st.act === 2 && !done.has('act2battle')) {
    done.add('act2battle');
    await p.waitForTimeout(2000);
    const enemiesBefore = await p.evaluate(() => window.__sb.battle && window.__sb.battle.combat.enemies.map((e) => e.id));
    await reloadAndContinue('Mid-battle (Act II)');
    const enemiesAfter = await p.evaluate(() => window.__sb.battle && window.__sb.battle.combat.enemies.map((e) => e.id));
    check('Act II mid-battle: same encounter restored', JSON.stringify(enemiesBefore) === JSON.stringify(enemiesAfter), `${(enemiesAfter || []).join('+')}`);
    continue;
  }
  if (s === 'map' && st && st.act === 3 && !done.has('act3')) {
    done.add('act3');
    await shot('04-act3-map');
    await reloadAndContinue('Act III entry');
    if (+stopAtAct <= 3) break;
    continue;
  }
  if (s === 'results' && !done.has('results')) {
    done.add('results');
    await shot('05-results');
    firstRunSummary = await p.evaluate(() => ({ title: document.querySelector('.results-body h1').textContent, runs: window.__sb.meta.totalRuns, bosses: Object.keys(window.__sb.meta.bossesDefeated), last: window.__sb.meta.runs[0] }));
    check('Run ended and was recorded in the Museum', firstRunSummary.runs === 1, `${firstRunSummary.title}, bosses ${firstRunSummary.bosses.join(',')}`);
    await p.reload();
    await p.waitForTimeout(700);
    check('Continue not offered after the run ended', (await p.getByRole('button', { name: L('Continue'), exact: true }).count()) === 0);
    check('Run recorded exactly once', (await p.evaluate(() => window.__sb.meta.totalRuns)) === 1);
    // next run: starter relic unlocked by the Act I boss kill must be selectable and applied
    await clickText('New Run');
    await p.waitForTimeout(400);
    const opt = p.locator('.starter-opt', { hasText: LANG === 'ru' ? RU.relics.stopwatch_gear.name : 'Stopwatch Gear' });
    const enabled = (await opt.count()) && !(await opt.isDisabled());
    check('Museum unlock (Stopwatch Gear) selectable in the next run', enabled);
    if (enabled) {
      await opt.click();
      await clickText('Begin');
      await p.waitForTimeout(500);
      const relics = await p.evaluate(() => window.__sb.run.d.relics);
      check('Unlocked starter relic applied to the new run', relics.includes('stopwatch_gear'), relics.join(','));
    }
    await shot('06-next-run');
    if (FLOW === 'defeat') { runIndex = 2; continue; }
    break;
  }

  // ── ordinary play ──
  switch (s) {
    case 'title': if (!(await clickText('New Run'))) await clickText('Continue'); await p.waitForTimeout(250); await clickText('Begin'); break;
    case 'dialog': await click('.dlg-skip'); break;
    case 'select': { const c = await p.$('.modal .deck-grid .card:not(.disabled)'); if (c) await c.click(); await p.waitForTimeout(80); await p.locator('.modal .select-foot .btn.primary').click({ timeout: 800 }).catch(() => {}); break; }
    case 'modal': {
      const title = await p.evaluate(() => { const m = [...document.querySelectorAll('.modal h2')].pop(); return m ? m.textContent : ''; });
      if (!seenModals.has(title)) { seenModals.add(title); log(`modal "${title}"`); await shot(`modal-${seenModals.size}`); }
      if (!(await click('.modal .btn.primary'))) await click('.modal-bg');
      break;
    }
    case 'map': {
      // prefer rests when hurt, avoid elites when hurt
      const { hp, scrap } = await p.evaluate(() => ({ hp: window.__sb.run.d.party.reduce((a, m) => a + m.hp / m.maxHp, 0) / 3, scrap: window.__sb.run.d.scrap }));
      const hurt = hp < 0.55;
      if (!hurt && hp >= 0.75 && st.act <= 2 && !elitesTaken.has(st.act) && (await click('.map-node.avail.t-elite'))) { elitesTaken.add(st.act); await p.waitForTimeout(80); await clickText('Travel'); break; }
      if (!shopDone && scrap >= 70 && (await click('.map-node.avail.t-shop'))) { await p.waitForTimeout(80); await clickText('Travel'); break; }
      const order = hurt ? ['.map-node.avail.t-rest', '.map-node.avail.t-treasure', '.map-node.avail.t-event', '.map-node.avail.t-shop', '.map-node.avail.t-battle', '.map-node.avail'] : ['.map-node.avail.t-treasure', '.map-node.avail.t-battle', '.map-node.avail.t-event', '.map-node.avail.t-rest', '.map-node.avail'];
      for (const sel of order) { if (await click(sel)) break; }
      await p.waitForTimeout(80);
      await clickText('Travel');
      break;
    }
    case 'battle': {
      // diagnostics: report why combat time stopped (tutorial card or modal left open)
      const stall = await p.evaluate(() => { const a = window.__sb; const c = a.battle && a.battle.combat; return c ? { paused: a.paused, tut: a.battle.tutEl.hidden ? '' : a.battle.tutEl.textContent.slice(0, 40), modals: a.modals.length } : null; });
      if (stall && stall.paused) { stallTicks++; if (stallTicks === 15) { log(`battle paused: tutorial "${stall.tut}", modals ${stall.modals}`); await shot(`stall-${Date.now() - t0}`); } } else stallTicks = 0;
    }
      battleSeen++;
      await fightLog();
      // SB_FLOW=defeat: in run 2 the bot stops acting at the Act I boss and loses the fight
      if (!(runIndex === 2 && st && st.bossFight)) await battleTick();
      break;
    case 'reward': {
      const cards = await p.$$('.reward-cards .card:not(.faded):not(.picked)');
      if (cards.length) { await cards[0].click(); await clickText('Take card'); }
      const rel = await p.$('.reward-relics .relic-badge:not(.faded):not(.picked)');
      if (rel) await rel.click();
      await clickText('Continue');
      break;
    }
    case 'event': {
      const offer = await p.$('.event-body .reward-cards .card');
      if (offer) { await offer.click(); break; }
      const ch = await p.$('.event-choices .choice:not([disabled])');
      if (ch) await ch.click(); else if (!(await clickText('Continue'))) await clickText('Leave');
      break;
    }
    case 'shop': {
      if (!shopDone) {
        shopDone = true;
        const before = await snap();
        const item = p.locator('.shop-item:not(.sold):has(.price:not(.poor))').first();
        if (await item.count()) {
          await item.click();
          await p.waitForTimeout(300);
          const after = await snap();
          check('Shop purchase applied', after.deck.length === before.deck.length + 1 && after.scrap < before.scrap, `scrap ${before.scrap} -> ${after.scrap}, deck ${before.deck.length} -> ${after.deck.length}`);
        }
      }
      await clickText('Leave');
      break;
    }
    case 'rest': if (!(await click('.rest-opt'))) await clickText('Continue'); break;
    case 'surgery': await clickText('Leave'); break;
    case 'treasure': { const r = await p.$('.relic-badge:not(.faded)'); if (r) await r.click(); if (!(await clickText('Continue'))) await clickText('Leave (take Scrap only)'); break; }
    case 'bossprep': {
      // Act II boss: take the Volatile gamble so both preparation paths get exercised
      if (st && st.act === 2 && !done.has('volatile')) {
        done.add('volatile');
        await click('.choice.volatile');
        await p.waitForTimeout(400);
        const dec = await p.evaluate(() => window.__sb.run.d.bossDecisions.at(-1));
        const shown = await p.$eval('.modal h2', (e) => e.textContent).catch(() => '');
        check('Volatile boss prep rolled and shown', dec && dec.prep === 'volatile' && shown.startsWith(L('Volatile: {v}').split('{')[0].trim()), `${shown}`);
        await click('.modal .btn.primary');
        await p.waitForTimeout(500);
        await reloadAndContinue('Volatile boss fight');
        check('Volatile outcome survives reload', (await p.evaluate(() => window.__sb.run.d.bossDecisions.at(-1).prep)) === 'volatile');
        break;
      }
      await click('.prep-plans .choice');
      break;
    }
    case 'mutation': await click('.mut-card'); break;
    default: break;
  }
  await p.waitForTimeout(s === 'battle' ? 120 : 120);
}

const report = { url: URL, lang: LANG, flow: FLOW, viewport: `${W}x${H}`, durationSec: Math.round((Date.now() - t0) / 1000), checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length, errors, leftovers: [...leftovers.values()], layoutIssues: [...layoutIssues.values()], firstRunSummary, events };
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
console.log(`\n${report.passed} passed, ${report.failed} failed, ${errors.length} page errors`);
if (LANG !== 'en') {
  console.log(`${report.leftovers.length} texts with Latin words, ${report.layoutIssues.length} layout issues`);
  for (const x of report.leftovers) console.log(`  [${x.src}] ${x.screen}: "${x.text}" (${x.words.join(', ')})`);
  for (const x of report.layoutIssues) console.log(`  [${x.kind}] ${x.screen}: "${x.text}" @ ${x.where}`);
}
await b.close();
