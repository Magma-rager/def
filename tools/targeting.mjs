// Targeting check through touch input, in English and Russian at phone and tablet sizes: tap an
// enemy to target it, see the TARGET label and the ⌖ chip follow; the target dies and the next enemy
// is picked and labeled; an enemy winding up an attack marks the hero it will hit.
// Usage: node tools/targeting.mjs [outDir]   (needs npm run serve on port 8123)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] || 'targeting-out';
fs.mkdirSync(out, { recursive: true });
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };

const b = await chromium.launch();
for (const [lang, w, h] of [['en', 844, 390], ['ru', 1194, 834], ['ru', 667, 375], ['en', 732, 510]]) {
  const tag = `${lang} ${w}×${h}`;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: false });
  await ctx.addInitScript((l) => localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang: l, hints: false })), lang);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => { const a = window.__sb; a.meta.tutorialDone = true; a.startRun('beta_badge'); });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = document.querySelector('.dlg-skip'); if (s) s.click(); });
  await p.evaluate(() => { const r = window.__sb.run; r.d.pending = { type: 'battle', kind: 'battle', nodeId: r.availableNodes()[0], enemies: ['rush_hound', 'interference_mite', 'rush_hound'] }; window.__sb.route(); });
  await p.waitForTimeout(1200);
  const state = () => p.evaluate(() => {
    const bs = window.__sb.battle;
    const c = bs.combat;
    return { target: c.target, alive: c.aliveEnemies().map((e) => e.uid), chip: document.querySelector('.target-chip .tc-name').textContent, fx: bs.view.targetFx || null };
  });
  const tapEnemy = async (i) => {
    const pos = await p.evaluate((k) => {
      const v = window.__sb.battle.view;
      const a = [...v.enemyActors.values()][k];
      const [x, y, sc, bb] = v.enemyPos(a);
      const r = v.canvas.getBoundingClientRect();
      return [r.left + x + ((bb[0] + bb[2]) / 2) * sc, r.top + y + (bb[1] * sc) / 2];
    }, i);
    await p.touchscreen.tap(pos[0], pos[1]);
    await p.waitForTimeout(150);
  };
  // 1. tap the second and third enemies
  const s0 = await state();
  await tapEnemy(1);
  const s1 = await state();
  check(`${tag}: tapping an enemy targets it`, s1.target === s1.alive[1] && s1.target !== s0.target, `${s0.target} → ${s1.target}`);
  const names = await p.evaluate(() => window.__sb.battle.combat.aliveEnemies().map((e) => e.id));
  const expect = await p.evaluate((id) => import('/src/i18n/index.js').then((I) => I.enemyName(id)), names[1]);
  check(`${tag}: the ⌖ chip names the target`, s1.chip === expect, s1.chip);
  await p.screenshot({ path: `${out}/${lang}-${w}-1-tapped.png` });
  await tapEnemy(2);
  const s2 = await state();
  check(`${tag}: tapping another enemy moves the target`, s2.target === s2.alive[2], s2.target);
  // 1b. an attack lands on the tapped enemy (a single-target Opener, tapped like a player would)
  const hit = await p.evaluate(() => {
    const bs = window.__sb.battle;
    const c = bs.combat;
    for (const e of c.enemies) e.atb = 0; // no enemy action in between
    const uid = c.hand.find((u) => u && c.check(u).ok && ['scrapline', 'rivet_jab', 'pinprick'].includes(c.def(u).id));
    const el = uid && document.querySelector(`.hand .card[data-uid="${uid}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { uid, x: r.left + r.width / 2, y: r.top + r.height / 2, hp: c.enemies.map((e) => [e.uid, e.hp + e.guard]) };
  });
  if (hit) {
    await p.touchscreen.tap(hit.x, hit.y);
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => window.__sb.battle.combat.enemies.map((e) => [e.uid, e.hp + e.guard]));
    const tgt = (await state()).target;
    const hurt = after.filter(([u, v], k) => v < hit.hp[k][1]).map(([u]) => u);
    check(`${tag}: the attack hits the tapped enemy and no other`, hurt.length === 1 && hurt[0] === tgt, `target ${tgt}, damaged ${hurt.join(',') || 'none'}`);
    await p.evaluate(() => { const c = window.__sb.battle.combat; if (c.combo) c.finishCombo('forced'); });
    await p.waitForTimeout(1600);
  } else check(`${tag}: the attack hits the tapped enemy and no other`, false, 'no single-target Opener in hand');
  // 2. the ⌖ chip cycles targets
  await p.tap('.target-chip');
  await p.waitForTimeout(150);
  const s3 = await state();
  check(`${tag}: the ⌖ chip switches to the next enemy`, s3.target !== s2.target && s3.alive.includes(s3.target), `${s2.target} → ${s3.target}`);
  // 3. the target dies: the next enemy is picked and labeled
  await p.evaluate(() => { const c = window.__sb.battle.combat; c.dealDamage(c.enemies.find((x) => x.uid === c.target), 999, { src: 'S', tag: 'test' }); });
  await p.waitForTimeout(700);
  const s4 = await state();
  check(`${tag}: when the target dies another enemy is targeted and labeled NEW TARGET`, s4.alive.includes(s4.target) && s4.target !== s3.target && !!(s4.fx && s4.fx.auto && s4.fx.uid === s4.target), `${s3.target} → ${s4.target}`);
  await p.screenshot({ path: `${out}/${lang}-${w}-2-retarget.png` });
  // 4. an enemy winding up an attack marks the hero it will hit
  const inc = await p.evaluate(() => {
    const bs = window.__sb.battle;
    const c = bs.combat;
    const e = c.aliveEnemies()[0];
    e.intent = { ...e.intent, kind: 'atk', dmg: 7, target: 'C' };
    e.atb = 0.9;
    bs.view.draw();
    return bs.view.incoming || {};
  });
  check(`${tag}: the hero an enemy is about to hit is marked`, !!(inc.C && inc.C.dmg >= 7), JSON.stringify(inc));
  await p.screenshot({ path: `${out}/${lang}-${w}-3-incoming.png` });
  check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await b.close();
const failed = results.filter((r) => !r).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
