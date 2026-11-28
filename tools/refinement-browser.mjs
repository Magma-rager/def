// Packaged UI fixture. A mounted battle gets a fixed hand and injury so every assertion
// is repeatable. Play, select, cancel and finish use player input only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { RU } from '../src/i18n/ru.js';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'refinement-browser', url = 'http://localhost:8128/index.html'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
try {
  for (const [lang, width, height, hero, clip] of [
    ['ru', 740, 360, 'S', 'kitQuick'], ['en', 1194, 834, 'C', 'kitCircuit'], ['en', 667, 375, 'V', 'kitShield'],
  ]) {
    const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true });
    await ctx.addInitScript((l) => localStorage.setItem('signalbreak.settings.v1',
      JSON.stringify({ lang: l, hints: false, reducedMotion: l === 'ru', muted: true })), lang);
    const p = await ctx.newPage();
    await p.clock.install();
    const errors = [];
    p.on('pageerror', (err) => errors.push(err.message));
    await p.goto(url);
    await p.waitForFunction(() => window.__sb);
    await p.evaluate(() => document.fonts.ready);
    const text = (s) => (lang === 'ru' ? RU.ui[s] : null) || s;
    const button = (s) => p.getByRole('button', { name: text(s), exact: true }).first();
    await button('New Run').tap();
    await button('Begin').tap();
    while (await p.locator('.dlg-skip').count()) await p.locator('.dlg-skip').first().tap();
    await p.evaluate(() => {
      const app = window.__sb;
      const r = app.run;
      const cards = ['scrapline', 'rivet_jab', 'piston_strike_b', 'mend_circuit', 'index_slug', 'scrapfall'];
      r.d.deck = cards.map((id, i) => ({ id, uid: `fx${i}`, up: false }));
      r.d.hp = 92;
      r.enterNode(r.availableNodes()[0]);
      r.d.pending.enemies = ['iron_maw'];
      app.route();
      const bs = app.battle;
      const c = bs.combat;
      c.hand = cards.map((_, i) => `fx${i}`);
      c.draw = [];
      c.momentum = 4;
      c.enemies[0].atb = -6;
      c.enemies[0].hp = c.enemies[0].maxHp = 500;
      const emit = c.emit.bind(c);
      window.__kitEvents = [];
      window.__kitSignals = [];
      const signal = bs.view.signal.bind(bs.view);
      bs.view.signal = (cue, ...args) => {
        signal(cue, ...args);
        if (cue.shape === 'kit') window.__kitSignals.push({ t: c.t, notes: cue.notes });
      };
      c.emit = (ev) => {
        emit(ev);
        if (ev.type === 'execResolve' || ev.type === 'heal') {
          window.__kitEvents.push({ type: ev.type, t: c.t, amount: ev.amount, hero: ev.hero, card: ev.cue?.card,
            clip: ev.hero && bs.view.actors[ev.hero]?.clip });
        }
      };
      bs.updateHud(true);
    });
    const item = p.locator('.hand [data-kind="item"]');
    const heroButton = (id) => p.locator(`.hero-btn[data-hero="${id}"]`);
    const pick = p.locator('.pick-cancel');
    const live = () => p.evaluate(() => {
      const c = window.__sb.battle.combat;
      return { hp: c.hp, momentum: c.momentum, reserved: c.reserved, hpMax: c.maxHp, owner: c.combo?.hero };
    });
    await item.waitFor();
    assert.equal(await p.locator('.hand [data-kind="standard"]').count(), 3);
    assert.equal(await p.locator('.hand [data-kind="specialized"]').count(), 1);
    assert.match(await item.locator('.card-name').textContent(), lang === 'ru' ? /Ремкомплект/ : /Repair Kit/);
    const size = await p.locator('.hand .card-text').evaluateAll((nodes) => Math.min(...nodes.map((n) => parseFloat(getComputedStyle(n).fontSize))));
    assert.ok(size >= 12);
    let before = await live();
    await item.tap();
    await pick.waitFor();
    await item.tap();
    assert.deepEqual(await live(), before);
    assert.equal(await p.locator('.hero-btn.pick:enabled').count(), 3);
    await p.keyboard.press('Escape');
    await pick.waitFor({ state: 'hidden' });
    assert.deepEqual(await live(), before);
    if (hero !== 'V') {
      await p.locator('.hand [data-uid="fx0"]').tap();
      await p.waitForFunction(() => window.__sb.battle.combat.stats.basics === 1 && !window.__sb.battle.combat.executing);
      assert.equal((await live()).owner, 'V');
    }
    before = await live();
    await item.tap();
    if (hero !== 'V') assert.ok(await heroButton('V').isDisabled(), 'the attacking hero cannot use the kit');
    const tag = `${lang}-${width}-${hero}`;
    await p.screenshot({ path: `${out}/${tag}-choose.png` });
    // Advance a fixed capture window, so the compositor captures the passing contact cue.
    await p.clock.pauseAt(await p.evaluate(() => Date.now() + 180));
    await heroButton(hero).tap();
    await p.clock.runFor(500);
    const cues = await p.evaluate(() => window.__kitSignals);
    assert.equal(cues.length, 1);
    assert.equal(cues[0].notes.length, 3);
    await p.screenshot({ path: `${out}/${tag}-contact.png` });
    await p.clock.resume();
    await p.waitForFunction((who) => window.__sb.battle.combat.heroState(who) === 'RECOVERING', hero);
    const actual = await live();
    assert.equal(actual.hp, before.hp + 14);
    assert.equal(actual.momentum, before.momentum - 2);
    assert.equal(actual.owner, before.owner);
    const events = await p.evaluate(() => window.__kitEvents.filter((ev) => ev.card === 'mend_circuit'));
    assert.deepEqual(events.map((ev) => ev.type), ['execResolve', 'heal']);
    assert.equal(events[0].hero, hero);
    assert.equal(events[0].t, events[1].t);
    assert.equal(events[0].clip, clip);
    await p.screenshot({ path: `${out}/${tag}-restored.png` });
    assert.deepEqual(errors, []);
    results.push({ lang,width,height,hero,size,events,expectedClip:clip,cues });
    await ctx.close();
    console.log('PASS', tag, JSON.stringify({ size, events, cues }));
  }
} finally { await b.close(); }
fs.writeFileSync(`${out}/report.json`, JSON.stringify(results, null, 2)+'\n');
