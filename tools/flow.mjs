// Drives the real UI in Chromium: new run -> story -> map -> first battle, with screenshots.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [w = 1194, h = 834, tag = 'ipad'] = process.argv.slice(2);
const OUT = '/tmp/claude-0/shots';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + e.stack));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html');
await p.waitForTimeout(500);
await p.getByRole('button', { name: 'New Run' }).click();
await p.getByRole('button', { name: 'Begin' }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/${tag}-1-story.png` });
await p.getByRole('button', { name: 'Skip' }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/${tag}-2-map.png` });
await p.getByRole('button', { name: 'Travel' }).click();
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/${tag}-3-battle-tut.png` });
// dismiss tutorial
const got = p.getByRole('button', { name: 'Got it' });
if (await got.count()) await got.click();
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/${tag}-4-battle.png` });
// play first legal card via tap on its slot
const tapLegal = async () => {
  const slots = await p.$$('.slot');
  for (const s of slots) {
    const c = await s.$('.card.legal');
    if (c) { const bb = await s.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); return true; }
  }
  return false;
};
await tapLegal();
await p.waitForTimeout(250);
if (await got.count()) { await p.screenshot({ path: `${OUT}/${tag}-5-tut2.png` }); await got.click(); }
await p.waitForTimeout(150);
await tapLegal();
await p.waitForTimeout(120);
await p.screenshot({ path: `${OUT}/${tag}-6-combo.png` });
for (let i = 0; i < 3; i++) { if (await got.count()) await got.click(); await tapLegal(); await p.waitForTimeout(150); }
await p.waitForTimeout(200);
await p.screenshot({ path: `${OUT}/${tag}-7-after.png` });
console.log(errs.join('\n') || 'no errors');
await b.close();
