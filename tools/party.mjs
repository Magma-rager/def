// Shared party HP on the battle screen (revised roadmap Phase 3), through touch input: a tapped Hessa
// Guard card says "Cover." and starts Cover; the red ring and the hit move to Hessa and use her
// Defense; healing fills the pool; with the pool nearly empty a real enemy attack loses the battle and
// the run-over screen follows.
// Usage: node tools/party.mjs [outPrefix] [lang=en] [size=844x390]   (needs npm run serve on port 8123)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'party-out/party';
const [lang = 'en', size = '844x390'] = process.argv.slice(3);
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(path.dirname(out), { recursive: true });
const [w, h] = size.split('x').map(Number);
const res = [];
const check = (n, ok, info = '') => { res.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${info ? ' — ' + info : ''}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true });
await ctx.addInitScript((l) => localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l, hints: false })), lang);
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(URL);
await p.waitForFunction(() => window.__sb);
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.startRun('beta_badge'); });
await p.waitForTimeout(300);
await p.evaluate(() => { const s = document.querySelector('.dlg-skip'); if (s) s.click(); });
await p.evaluate(() => { const r = window.__sb.run; r.d.pending = { type: 'battle', kind: 'battle', nodeId: r.availableNodes()[0], enemies: ['rush_hound', 'interference_mite'] }; window.__sb.route(); });
await p.waitForTimeout(1200);
// 1. tap Salvage (Hessa's Guard Opener) like a player
const s = await p.evaluate(() => {
  const c = window.__sb.battle.combat;
  let uid = c.hand.find((u) => u && c.def(u).id === 'salvage' && c.check(u).ok);
  if (!uid) { // put a Salvage from the deck into slot 0 (deck order only)
    const all = [...c.cards.values()].find((x) => x.id === 'salvage'); uid = all.uid;
    for (const z of ['draw', 'discard']) { const i = c[z].indexOf(uid); if (i >= 0) c[z].splice(i, 1); }
    const j = c.hand.indexOf(uid); if (j < 0) { const old = c.hand[0]; c.hand[0] = uid; if (old) c.draw.push(old); }
    window.__sb.battle.updateHud(true);
  }
  const el = document.querySelector(`.hand .card[data-uid="${uid}"]`);
  const r = el.getBoundingClientRect();
  return { uid, x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.querySelector('.card-text').textContent };
});
check('Hessa\'s Guard card says it starts Cover', /Cover\.|Прикрытие\./.test(s.text), s.text);
await p.touchscreen.tap(s.x, s.y);
await p.waitForTimeout(250);
const cov = await p.evaluate(() => { const c = window.__sb.battle.combat; return { active: c.coverActive(), left: c.coverUntil - c.t, guard: c.guard }; });
check('tapping it starts Cover', cov.active && cov.left > 3, JSON.stringify(cov));
await p.screenshot({ path: `${out}-${lang}-1-cover.png` });
// 2. an enemy aimed at Corvin: the ring and the hit go to Hessa
const hit = await p.evaluate(() => {
  const bs = window.__sb.battle; const c = bs.combat;
  const e = c.aliveEnemies()[0];
  e.intent = { ...e.intent, kind: 'atk', dmg: 10, target: 'C' };
  e.atb = 0.92; bs.view.draw();
  const ring = Object.keys(bs.view.incoming || {});
  const before = c.hp; c.guard = 0;
  c.hitParty(e, 'C', 10);
  return { ring, lost: before - c.hp };
});
check('under Cover the red ring moves to Hessa', hit.ring.length === 1 && hit.ring[0] === 'V', hit.ring.join(','));
check('the hit aimed at Corvin costs Hessa\'s reduced damage (10 → 7)', hit.lost === 7, String(hit.lost));
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}-${lang}-2-covered.png` });
// 3. healing goes to the pool and shows on the bar
const heal = await p.evaluate(() => { const c = window.__sb.battle.combat; const b = c.hp; c.healParty(9); return c.hp - b; });
check('healing restores the pool', heal === 9, String(heal));
// 4. let the enemies win: pool at 3, no Guard, wait for a real enemy attack
await p.evaluate(() => { const c = window.__sb.battle.combat; c.hp = 3; c.guard = 0; c.coverUntil = 0; if (c.combo) c.finishCombo('forced'); });
await p.waitForFunction(() => { const c = window.__sb.battle && window.__sb.battle.combat; return !c || c.phase === 'END'; }, null, { timeout: 30000 }).catch(() => {});
const end = await p.evaluate(() => { const c = window.__sb.battle && window.__sb.battle.combat; return c ? { phase: c.phase, result: c.result, hp: c.hp } : { gone: true }; });
check('the battle is lost when the pool reaches 0', end.phase === 'END' && end.result && end.result.victory === false, JSON.stringify(end));
await p.waitForTimeout(900);
await p.screenshot({ path: `${out}-${lang}-3-defeat.png` });
await p.waitForTimeout(3500);
const after = await p.evaluate(() => ({ screen: document.querySelector('#app') && document.querySelector('#app').dataset.screen, pending: window.__sb.run && window.__sb.run.d.pending && window.__sb.run.d.pending.type, text: document.body.innerText.slice(0, 200) }));
check('defeat leads to the run-over screen', /RUN ENDED|ЗАБЕГ ОКОНЧЕН|gameover/.test(JSON.stringify(after)), JSON.stringify(after).slice(0, 200));
await p.screenshot({ path: `${out}-${lang}-4-after.png` });
check('no page errors', errs.length === 0, errs.join(' | '));
await b.close();
const failed = res.filter((x) => !x).length;
console.log(`${res.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
