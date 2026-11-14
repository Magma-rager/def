// Card readability in the battle hand at the supported landscape sizes: the rendered font size of
// each piece of card information (after the text-fitting step), for every card in the game.
// Usage: node tools/readability.mjs [lang=en] [sizes]   (needs npm run serve on port 8123)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const [LANG = 'en', SIZES = '667x375,732x510,844x390,932x430,1024x768,1194x834,1366x1024'] = process.argv.slice(2);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
const PARTS = {
  rank: '.card-top .rank',
  suit: '.card-top .var',
  role: '.card-top .role-tag',
  hero: '.owner-chip',
  name: '.card-name',
  text: '.card-text',
  reason: '.reason',
};

const b = await chromium.launch();
const rows = [];
for (const vp of SIZES.split(',')) {
  const [w, h] = vp.split('x').map(Number);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  await ctx.addInitScript((l) => localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l, hints: false })), LANG);
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.startRun('beta_badge'); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.querySelector('.dlg-skip'); if (s) s.click(); });
  await p.evaluate(() => { const r = window.__sb.run; r.enterNode(r.availableNodes()[0]); window.__sb.route(); });
  await p.waitForTimeout(900);
  const sizes = await p.evaluate(async (parts) => {
    const { CARD_LIST } = await import('/src/data/cards.js');
    const bs = window.__sb.battle;
    const c = bs.combat;
    bs.app.paused = true;
    const ids = CARD_LIST.map((x) => x.id);
    const acc = {};
    for (const k of Object.keys(parts)) acc[k] = [];
    let cardW = 0;
    for (let i = 0; i < ids.length; i += 6) {
      ids.slice(i, i + 6).forEach((id, k) => { const uid = `rd_${id}`; if (!c.cards.has(uid)) c.cards.set(uid, { uid, id, up: false }); c.hand[k] = uid; });
      bs.updateHud(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const el of document.querySelectorAll('.hand .card')) {
        cardW = el.getBoundingClientRect().width;
        for (const [k, sel] of Object.entries(parts)) {
          const n = el.querySelector(sel);
          if (!n || !n.getClientRects().length) continue;
          if (k === 'reason' && !n.textContent.trim()) continue;
          acc[k].push(parseFloat(getComputedStyle(n).fontSize));
        }
      }
    }
    const legal = document.querySelector('.hand .card.legal .card-frame');
    return { acc, cardW, legalGlow: legal ? getComputedStyle(legal).boxShadow.slice(0, 60) : '' };
  }, PARTS);
  const stat = (a) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y); return `${s[0].toFixed(1)}/${s[Math.floor(s.length / 2)].toFixed(1)}`; };
  rows.push({ vp, cardW: Math.round(sizes.cardW), parts: Object.fromEntries(Object.entries(sizes.acc).map(([k, v]) => [k, stat(v)])) });
  await ctx.close();
}
await b.close();
console.log(`${LANG}: rendered font size in CSS px, smallest/median over all cards (hand)`);
console.log(`size        card  ${Object.keys(PARTS).map((k) => k.padEnd(10)).join('')}`);
for (const r of rows) console.log(`${r.vp.padEnd(11)} ${String(r.cardW).padStart(4)}  ${Object.keys(PARTS).map((k) => r.parts[k].padEnd(10)).join('')}`);
