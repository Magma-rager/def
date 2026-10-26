// Measures frame times during an active 4-enemy battle (busy scene) at iPad resolution, DPR 2.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: +(process.argv[2] || 2) });
const p = await ctx.newPage();
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(300);
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.meta.tut = { start: 1, opened: 1, closer: 1, afterCombo: 1, lock: 1, scramble: 1, jam: 1, glitch: 1, latch: 1 }; a.startRun('beta_badge'); });
await p.waitForTimeout(200);
await p.evaluate(() => { document.querySelector('.dlg-skip')?.click(); const r = window.__sb.run; r.enterNode(r.availableNodes()[0]); r.d.pending.enemies = ['wire_jammer', 'rush_hound', 'interference_mite', 'iron_maw']; window.__sb.route(); });
await p.waitForTimeout(500);
const res = await p.evaluate(() => new Promise((resolve) => {
  const times = [];
  let last = performance.now();
  const c = window.__sb.battle.combat;
  for (const e of c.enemies) { e.hp = e.maxHp = 9999; }
  let n = 0;
  const auto = setInterval(() => { const l = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok); if (l.length) window.__sb.battle.doPlay(l[0]); }, 180);
  const bs = window.__sb.battle;
  const orig = bs.frame.bind(bs);
  const work = [];
  bs.frame = (dt) => { const t0 = performance.now(); orig(dt); work.push(performance.now() - t0); };
  const f = (now) => { times.push(now - last); last = now; if (++n < 300) requestAnimationFrame(f); else { clearInterval(auto); times.sort((a, b) => a - b); work.sort((a, b) => a - b); resolve({ frames: times.length, median: times[150].toFixed(1), p95: times[285].toFixed(1), worst: times[299].toFixed(1), workMedian: work[Math.floor(work.length / 2)].toFixed(2), workP95: work[Math.floor(work.length * 0.95)].toFixed(2) }); } };
  requestAnimationFrame(f);
}));
console.log(JSON.stringify(res));
await b.close();
