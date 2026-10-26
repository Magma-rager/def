// Starts a specific battle through the live app and captures interference/boss visuals.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [w = 1194, h = 834, tag = 'ipad', act = '1', boss = 'clockwork_regent'] = process.argv.slice(2);
const OUT = '/tmp/claude-0/shots';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(300);
await p.evaluate(([act, boss]) => {
  const a = window.__sb;
  a.meta.tutorialDone = true;
  a.meta.tut = { start: 1, opened: 1, closer: 1, afterCombo: 1, lock: 1, scramble: 1, jam: 1, glitch: 1, latch: 1 };
  a.startRun('beta_badge');
  const r = a.run;
  r.d.act = +act;
  r.generateMap(+act);
  r.d.bosses[+act] = boss;
  const bn = r.d.map.nodes.find((n) => n.type === 'boss');
  r.d.position = r.d.map.nodes.find((n) => n.edges.includes(bn.id)).id;
  r.d.pending = { type: 'bossprep', nodeId: bn.id, bossId: boss, introShown: true, ...r.bossAnalysis() };
  r.chooseBossPrep('prepared', 'brace');
  a.route();
}, [act, boss]);
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-0.png` });
const tapLegal = async (pref) => {
  const slots = await p.$$('.slot');
  for (const s of slots) {
    const c = await s.$('.card.legal' + (pref || ''));
    if (c) { const bb = await s.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; }
  }
  return false;
};
for (let round = 0; round < 6; round++) {
  await tapLegal('.role-open');
  await p.waitForTimeout(200);
  await tapLegal('.role-conv');
  await p.waitForTimeout(200);
  if (round === 1) await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-combo.png` });
  if (!(await tapLegal('.role-close'))) await p.click('.ctl.cash', { timeout: 300 }).catch(() => {});
  await p.waitForTimeout(round === 2 ? 120 : 900);
  if (round === 2) await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-hit.png` });
}
// force interference visuals via the engine
await p.evaluate(() => { const c = window.__sb.battle.combat; const e = c.enemies[0]; c.lockCards(e, 2); c.scrambleCards(e, 1, 'suit'); c.jamSlot(e, 4); c.stash(c.hand.find((u) => u && !c.isLocked(u))); });
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-interfere.png` });
// phase change
await p.evaluate(() => { const c = window.__sb.battle.combat; const e = c.enemies[0]; c.dealDamage(e, Math.ceil(e.hp - e.maxHp * 0.45), { src: 'V', closer: true, pierce: true }); });
await p.waitForTimeout(350);
await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-phase.png` });
// finisher cut-in
await p.evaluate(() => { const v = window.__sb.battle; v.cutin({ owners: ['V', 'C', 'S'], len: 6, damage: 88 }); v.banner('FINISHER', '6 cards · 88 dmg', 'good'); });
await p.waitForTimeout(450);
await p.screenshot({ path: `${OUT}/${tag}-b-${boss}-cutin.png` });
console.log(errs.join('\n') || 'no errors');
await b.close();
