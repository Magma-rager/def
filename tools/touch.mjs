// Verifies touch input: tap plays a card, swipe-down churns exactly once, swipe-up stashes.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(300);
await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.meta.tut = { start: 1, opened: 1, closer: 1, afterCombo: 1, lock: 1, scramble: 1, jam: 1, glitch: 1, latch: 1 }; a.startRun('beta_badge'); });
await p.waitForTimeout(200);
await p.evaluate(() => document.querySelector('.dlg-skip')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => { const r = window.__sb.run; r.enterNode(r.availableNodes()[0]); window.__sb.route(); window.__sb.battle.combat.enemies.forEach((e) => (e.atb = -100)); });
await p.waitForTimeout(600);
const cdp = await ctx.newCDPSession(p);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const slotBox = async (i) => (await p.$$('.slot'))[i].boundingBox();
const state = () => p.evaluate(() => { const c = window.__sb.battle.combat; return { phase: c.phase, churns: c.stats.churns, reserve: c.reserve.length, played: c.stats.cardsPlayed, zones: c.verifyZones().ok }; });
const s0 = await state();
// swipe down on slot 2 (churn)
let bb = await slotBox(2);
await touch('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
for (let i = 1; i <= 10; i++) { await touch('touchMove', bb.x + bb.width / 2, bb.y + bb.height / 2 + i * 8); await p.waitForTimeout(10); }
await touch('touchEnd');
await p.waitForTimeout(150);
const s1 = await state();
// swipe up on slot 4 (stash)
bb = await slotBox(4);
await touch('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
for (let i = 1; i <= 10; i++) { await touch('touchMove', bb.x + bb.width / 2, bb.y + bb.height / 2 - i * 8); await p.waitForTimeout(10); }
await touch('touchEnd');
await p.waitForTimeout(150);
const s2 = await state();
// tap slot 0 (play opener)
bb = await slotBox(0);
await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForTimeout(150);
const s3 = await state();
// tap a target enemy on the canvas
const tgt = await p.evaluate(() => { const v = window.__sb.battle.view; const a = [...v.enemyActors.values()].pop(); const [x, y, sc, b] = v.enemyPos(a); const r = v.canvas.getBoundingClientRect(); return { uid: a.uid, x: r.left + x + (b[0] + b[2]) / 2 * sc, y: r.top + y + b[1] * sc * 0.5 }; });
await p.touchscreen.tap(tgt.x, tgt.y);
await p.waitForTimeout(100);
const target = await p.evaluate(() => window.__sb.battle.combat.target);
console.log(JSON.stringify({ start: s0, afterSwipeDown: s1, afterSwipeUp: s2, afterTap: s3, targetSet: target === tgt.uid, errs }));
await b.close();
