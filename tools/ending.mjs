// Verifies the victory path in the real UI: final boss win -> ending story -> victory results -> Museum.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(300);
await p.evaluate(() => {
  const a = window.__sb;
  a.meta.tutorialDone = true;
  a.meta.tut = { start: 1, opened: 1, closer: 1, afterCombo: 1, lock: 1, scramble: 1, jam: 1, glitch: 1, latch: 1 };
  a.startRun('beta_badge');
  const r = a.run;
  r.d.act = 3; r.generateMap(3);
  const bn = r.d.map.nodes.find((n) => n.type === 'boss');
  r.d.position = r.d.map.nodes.find((n) => n.edges.includes(bn.id)).id;
  r.d.pending = { type: 'bossprep', nodeId: bn.id, bossId: r.d.bosses[3], introShown: true, ...r.bossAnalysis() };
  r.chooseBossPrep('volatile');
  a.route();
});
await p.waitForTimeout(700);
await p.evaluate(() => { const c = window.__sb.battle.combat; for (const e of c.enemies) c.dealDamage(e, 99999, { src: 'V', pierce: true, closer: true }); });
await p.waitForTimeout(2600);
const dialog1 = await p.locator('.dialog-layer').count();
await p.screenshot({ path: '/tmp/claude-0/shots/ending-dialog.png' });
// advance through every ending line by tapping
for (let i = 0; i < 30 && (await p.locator('.dialog-layer').count()); i++) { await p.click('.dlg-box'); await p.waitForTimeout(60); await p.click('.dlg-box').catch(() => {}); await p.waitForTimeout(40); }
await p.waitForTimeout(500);
const title = await p.locator('.results-body h1').textContent();
await p.screenshot({ path: '/tmp/claude-0/shots/ending-results.png' });
const meta = await p.evaluate(() => ({ wins: window.__sb.meta.wins, endings: window.__sb.meta.endings, saved: !!localStorage.getItem('signalbreak.run.v3') }));
console.log(JSON.stringify({ endingDialogShown: dialog1 > 0, resultsTitle: title, meta, errs }));
await b.close();
