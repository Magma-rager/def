// UI-level integration test: plays the game ONLY through DOM interactions (taps/clicks/swipes)
// from the title screen until the run ends or the time budget runs out.
// Usage: node tools/uiplay.mjs [width] [height] [minutes] [targetAct]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [w = 1194, h = 834, minutes = 6, targetAct = 4] = process.argv.slice(2).map(Number);
const OUT = '/tmp/claude-0/shots';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(400);
// make the bot survive long enough to traverse acts: give it god-mode party HP through settings? No: play fair.
const log = [];
const seen = new Set();
const deadline = Date.now() + minutes * 60000;
let battles = 0, swipesTested = false, lastScreen = '';
const click = async (sel) => { const el = await p.$(sel); if (el) { await el.click({ timeout: 1000 }).catch(() => {}); return true; } return false; };
const clickText = async (text) => { const el = p.getByRole('button', { name: text }).first(); if (await el.count()) { await el.click({ timeout: 1000 }).catch(() => {}); return true; } return false; };

async function battleTick() {
  if (await click('.tut-layer:not([hidden]) .btn')) return;
  const state = await p.evaluate(() => {
    const c = window.__sb.battle && window.__sb.battle.combat;
    if (!c) return null;
    return { phase: c.phase, len: c.combo ? c.combo.cards.length : 0, left: c.flowLeft(), mom: c.momentum, guard: c.guard,
      danger: c.aliveEnemies().some((e) => e.atb > 0.8), churns: c.stats.churns };
  });
  if (!state || state.phase === 'END') return;
  const slots = await p.$$('.slot');
  const find = async (cls) => {
    for (const s of slots) { if (await s.$(`.card.legal${cls}:not(.leaving)`)) return s; }
    return null;
  };
  if (state.danger && state.guard < 6 && state.mom >= 3) { await click('.ctl.mom:nth-child(2)'); return; }
  let target = null;
  if (state.phase === 'PRE') target = await find('.role-open');
  else if (state.phase === 'ACTIVE') {
    const close = await find('.role-close');
    const conv = await find('.role-conv');
    target = close && (state.len >= 3 || !conv || state.left < 1.1) ? close : conv || null;
    if (!target) {
      const res = await p.$('.res-card.legal');
      if (res) { await res.click().catch(() => {}); return; }
      if (state.len >= 2) { await click('.ctl.cash'); return; }
    }
  }
  if (target) {
    const bb = await target.boundingBox();
    if (bb) await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    return;
  }
  // swipe-test once: churn the first card by dragging down, verify exactly one churn
  if (!swipesTested && state.phase === 'ACTIVE' && slots.length) {
    const bb = await slots[0].boundingBox();
    const before = state.churns;
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + i * 9);
    await p.screenshot({ path: `${OUT}/uiplay-swipe.png` });
    await p.mouse.up();
    await p.waitForTimeout(50);
    const after = await p.evaluate(() => window.__sb.battle.combat.stats.churns);
    log.push(`swipe-down churn test: churns ${before} -> ${after}`);
    swipesTested = true;
  }
}

while (Date.now() < deadline) {
  const screen = await p.evaluate(() => {
    if (document.querySelector('.dialog-layer')) return 'dialog';
    if (document.querySelector('.modal .deck-grid.select')) return 'select';
    if (document.querySelector('.modal')) return 'modal';
    const s = document.querySelector('.layer-screen > div');
    return s ? s.className.split(' ')[0] : 'none';
  });
  if (screen !== lastScreen) {
    const act = await p.evaluate(() => (window.__sb.run ? window.__sb.run.d.act : 0));
    log.push(`${new Date().toISOString().slice(14, 19)} act${act} ${screen}`);
    if (!seen.has(screen)) { seen.add(screen); await p.screenshot({ path: `${OUT}/uiplay-${screen}.png` }); }
    lastScreen = screen;
    if (act >= targetAct) break;
  }
  switch (screen) {
    case 'title': if (!(await clickText('New Run'))) await clickText('Continue'); await p.waitForTimeout(200); await clickText('Begin'); break;
    case 'dialog': await click('.dlg-skip'); break;
    case 'select': { const c = await p.$('.modal .deck-grid .card:not(.disabled)'); if (c) await c.click(); await p.waitForTimeout(60); const ok = p.locator('.modal .select-foot .btn.primary'); await ok.click({ timeout: 800 }).catch(() => {}); break; }
    case 'modal': if (!(await click('.modal .btn.primary'))) await click('.modal-bg'); break;
    case 'map': await click('.map-node.avail'); await p.waitForTimeout(60); await clickText('Travel'); break;
    case 'battle': await battleTick(); break;
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
      const it = await p.$('.shop-item:not(.sold)');
      if (it) await it.click();
      await clickText('Leave');
      break;
    }
    case 'rest': if (!(await click('.rest-opt'))) await clickText('Continue'); break;
    case 'surgery': await clickText('Leave'); break;
    case 'treasure': { const r = await p.$('.relic-badge:not(.faded)'); if (r) await r.click(); await clickText('Continue') || await clickText('Leave (take Scrap only)'); break; }
    case 'bossprep': await click('.prep-plans .choice'); break;
    case 'mutation': await click('.mut-card'); break;
    case 'results': log.push('RESULTS reached'); break;
    default: break;
  }
  if (screen === 'results') break;
  await p.waitForTimeout(screen === 'battle' ? 140 : 120);
}
await p.screenshot({ path: `${OUT}/uiplay-final.png` });
const summary = await p.evaluate(() => ({ meta: { runs: window.__sb.meta.totalRuns, best: window.__sb.meta.bestCombo }, run: window.__sb.run ? { act: window.__sb.run.d.act, floors: window.__sb.run.d.floors, deck: window.__sb.run.d.deck.length, relics: window.__sb.run.d.relics, mutations: window.__sb.run.d.mutations } : null }));
console.log(log.join('\n'));
console.log('screens seen:', [...seen].join(', '));
console.log('summary:', JSON.stringify(summary));
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
