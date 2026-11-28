// Phase 9 interface acceptance against the running game.
// Usage: node tools/accept9.mjs ui|historical|layout|loadouts|recovery en|ru WIDTH HEIGHT OUTPUT
// "ui" starts on a fresh profile. The deterministic fixture prepares a Warden fight with stacked
// cards, then exposes a reward, removal service and trade. Every card, payout, purchase/selection,
// abandon confirmation, reload and starter choice is enacted through the interface. Enemy HP is
// controlled to make the focused fight long enough, then the normal enemy action causes defeat.
// A separate Mirror Array fixture begins just above its split threshold; a normal attack summons it.
// "historical" loads the captured Phase 8 profile and a separate active v6 run. "layout" uses earned
// and locked fixtures and renders the actual screens at a caller-selected size.
// "loadouts" seeds earned achievements for selector coverage. "recovery" injects one failed
// active-run deletion after the profile write, using a captured pending Phase 8 victory.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { RU } from '../src/i18n/ru.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { STARTER_OPTIONS } from '../src/data/relics.js';
import { STARTER_DECK } from '../src/data/cards.js';
import { findIssues } from './lib/text-issues.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const [mode = 'ui', lang = 'en', width = '844', height = '390', out = 'accept9-out'] = process.argv.slice(2);
const viewport = { width: +width, height: +height };
const url = process.env.SB_URL || 'http://localhost:8123/index.html';
const translate = (label, l = lang) => l === 'ru' ? RU.ui[label] || label : label;
const state = { checks: [], errors: [], mode, lang, viewport };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport, hasTouch: true, locale: lang === 'ru' ? 'ru-RU' : 'en-US' });
const page = await context.newPage();
page.setDefaultTimeout(6500);
page.on('pageerror', (e) => state.errors.push(e.message));
const ev = (fn, arg) => page.evaluate(fn, arg);
const loc = (selector) => page.locator(selector).first();
const title = () => loc('.title-menu').waitFor();
const touch = async (selector) => loc(selector).tap();
const button = (label, area = page, l = lang) => area.getByRole('button', { name: translate(label, l), exact: true }).first();
const tap = async (label, area, l) => button(label, area, l).tap();
const wait = (n) => page.waitForTimeout(n);
const shot = async (label) => {
  await wait(200); // Capture the settled panel, after its entry animation.
  await page.screenshot({ path: `${out}/${mode}-${lang}-${width}-${label}.png` });
};
const verify = (label, condition, detail) => {
  state.checks.push({ label, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`);
};
const readMeta = () => ev(() => structuredClone(window.__sb.meta));
const museum = async (tab) => {
  await tap('Museum');
  if (tab) await touch(`.museum [data-tab="${tab}"]`);
};
const close = () => tap('Close', page.locator('.museum'));
const dismissStory = async () => {
  for (let i = 0; i < 6; i++) {
    if (!await loc('.dlg-skip').isVisible()) return;
    await touch('.dlg-skip');
    await wait(180);
  }
};
const clickNew = async (starter = 'beta_badge', replacing = false) => {
  await tap('New Run');
  if (replacing) await tap('Abandon & start new');
  await touch(`.starter-panel [data-relic="${starter}"]`);
  await tap('Begin');
  await dismissStory();
};

async function readStarterLayout(name) {
  await tap('New Run');
  const info = await ev(() => {
    const panel = document.querySelector('.starter-panel');
    const list = panel.querySelector('.starter-list');
    const foot = panel.querySelector('.row-btns').getBoundingClientRect();
    return { count: list.children.length, scrolls: list.scrollHeight > list.clientHeight, footerVisible: foot.top >= 0 && foot.bottom <= innerHeight };
  });
  verify(name, info.count === STARTER_OPTIONS.length && info.footerVisible, info);
  await shot(name);
}

async function layout() {
  await title();
  await page.evaluate(() => document.fonts.ready);
  await readStarterLayout('fresh-starter-layout');
  await tap('Cancel');
  await museum('Achievements');
  verify('All achievements have rendered conditions', await page.locator('.achievement-tile p').count() >= ACHIEVEMENTS.length);
  for (const filter of ['earned', 'incomplete', 'campaign', 'combat', 'collection', 'mastery']) {
    await loc('.achievement-filter').selectOption(filter);
    const issues = await ev(findIssues);
    verify(`Filter ${filter} fits`, issues.length === 0, issues);
  }
  await shot('achievements');
  await close();
  await ev((definitions) => {
    const app = window.__sb;
    for (const a of definitions) app.meta.progress.earned[a.id] = { at: 1234 };
  }, ACHIEVEMENTS);
  await readStarterLayout('unlocked-roster-layout');
  verify('All unlocked rows enabled and selectable', await page.locator('.starter-panel .starter-opt:disabled').count() === 0);
  await loc('.starter-panel [data-relic="twin_dials"]').focus();
  await page.keyboard.press('Enter');
  verify('Keyboard selects an enabled starting relic', await loc('.starter-panel .starter-opt.sel').getAttribute('data-relic') === 'twin_dials');
  await tap('Cancel');
  await museum('Starters');
  verify('Museum exposes the entire starter roster', await page.locator('.museum-starters .starter-opt').count() === STARTER_OPTIONS.length);
  await close();
}

async function historical() {
  const before = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/meta-v2-phase8.json', import.meta.url)));
  const run = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/save-v6-0.2.8-act2.json', import.meta.url)));
  await ev(({ meta, run, lang }) => {
    localStorage.setItem('signalbreak.meta.v1', JSON.stringify(meta));
    localStorage.setItem('signalbreak.run.v3', JSON.stringify(run));
    localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang }));
  }, { meta: before, run, lang });
  await page.reload();
  await title();
  const m = await readMeta();
  verify('Historical counters and Journal survive', m.totalRuns === before.totalRuns && m.wins === before.wins &&
    JSON.stringify(m.combos) === JSON.stringify(before.combos));
  verify('Recorded victory migrated, undocumented mastery stays absent',
    m.progress.earned.victory?.historical && m.progress.earned.victory.at === null && !m.progress.earned.build_victory);
  await museum('Starters');
  const options = await page.locator('.museum-starters .starter-opt .good').count();
  verify('Historical starting options survive', options >= 3, options);
  await close();
  await tap('Continue');
  const loaded = await ev(() => ({ version: window.__sb.run.d.version, seed: window.__sb.run.d.seed, act: window.__sb.run.d.act,
    deck: window.__sb.run.d.deck, id: window.__sb.run.d.progress.id }));
  verify('Historical active run continues with deck and identity', loaded.version === 7 && loaded.seed === run.seed &&
    loaded.act === run.act && loaded.id > 0 && JSON.stringify(loaded.deck) === JSON.stringify(run.deck));
  await clickAbandon();
  await page.reload();
  await title();
  const after = await readMeta();
  verify('Newly finalized history and historical history both survive', after.progress.abandoned === 1 &&
    after.totalRuns === before.totalRuns + 1 && after.runs[1].seed === before.runs[0].seed);
}

async function clickAbandon() {
  await dismissStory();
  for (let i = 0; i < 4 && await loc('.tut-layer:not([hidden])').isVisible(); i++) {
    await loc('.tut-layer .btn.primary').tap();
    await wait(200);
  }
  await touch('.pause-btn, .rh-btns button:last-child');
  await tap('Abandon run');
  await tap('Abandon');
  await title();
}

async function loadouts() {
  await title();
  await ev(async (defs) => {
    const { Save } = await import('/src/engine/save.js');
    const app = window.__sb;
    app.meta.tutorialDone = true;
    for (const { id, reward } of defs) if (reward) app.meta.progress.earned[id] = { at: 1234 };
    Save.saveMeta(app.meta);
  }, ACHIEVEMENTS);
  const baseline = STARTER_DECK.map((card) => card.id);
  for (const { id } of STARTER_OPTIONS) {
    await clickNew(id);
    const d = await ev(() => window.__sb.run.serialize());
    verify(`${id} applies alone without changing starting resources`, d.relics.join() === id && d.hp === 130 &&
      d.maxHp === 130 && d.scrap === 80 && JSON.stringify(d.deck.map((card) => card.id)) === JSON.stringify(baseline));
    await clickAbandon();
  }
  const m = await readMeta();
  verify('Ten immediate abandons preserved discoveries and gave no qualifying finishes',
    m.progress.abandoned === 10 && (m.progress.finished || 0) === 0 && STARTER_OPTIONS.every(({ id }) => m.relicsFound.includes(id)),
    { abandoned: m.progress.abandoned, finished: m.progress.finished || 0 });
}

async function recovery() {
  await title();
  const run = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/save-v6-0.2.8-gameover.json', import.meta.url)));
  await ev((run) => localStorage.setItem('signalbreak.run.v3', JSON.stringify(run)), run);
  await page.reload();
  await title();
  await ev(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'signalbreak.run.v3') {
        Storage.prototype.removeItem = remove;
        throw Error('controlled failure clearing the active run');
      }
      return remove.call(this, key);
    };
  });
  await tap('Continue');
  await dismissStory();
  await button('Retry save').waitFor();
  verify('Failure surfaced after one profile commit and retained the pending save', await ev(() => {
    const meta = JSON.parse(localStorage.getItem('signalbreak.meta.v1'));
    const run = JSON.parse(localStorage.getItem('signalbreak.run.v3'));
    return meta.totalRuns === 1 && run.pending.finalize.result === 'victory' && meta.runs[0].runId === run.progress.id;
  }));
  await shot('retry');
  await page.reload();
  await title();
  await tap('Continue');
  await tap('Continue', page.locator('.credits'));
  verify('Reload completes the interrupted victory once and keeps the award', await ev(() => {
    const { meta } = window.__sb;
    return !localStorage.getItem('signalbreak.run.v3') && meta.totalRuns === 1 && meta.wins === 1 &&
      meta.runs.length === 1 && !!meta.progress.earned.victory;
  }));
}

async function playCard(id) {
  const uid = await ev((id) => {
    const c = window.__sb.battle.combat;
    return c.hand.find((u) => u && c.def(u).id === id && c.check(u).ok);
  }, id);
  if (!uid) throw Error(`No legal card ${id}`);
  await touch(`.hand .card[data-uid="${uid}"]`);
  await page.waitForFunction((uid) => window.__sb.battle?.combat.combo?.cards.some((e) => e.uid === uid), uid);
  await page.waitForFunction(() => window.__sb.battle.combat.queue.length === 0 && !window.__sb.battle.combat.executing);
}

async function ui() {
  await title();
  const fresh = await readMeta();
  verify('Fresh profile is empty', fresh.totalRuns === 0 && fresh.cardsSeen.length === 0 && fresh.relicsFound.length === 0);
  await museum('Records');
  const recordText = await loc('.museum-body').innerText();
  verify('Accurate fresh collection denominators', ['0/82', '0/41', '0/28', '0/17', '0/6', '1/10'].every((x) => recordText.includes(x)), recordText);
  await close();
  await readStarterLayout('fresh-starter');
  const locked = loc('.starter-opt[data-relic="riveted_ledger"]');
  verify('Locked options show conditions and progress', await locked.isDisabled() && (await locked.innerText()).includes('0'));
  await locked.evaluate((el) => el.click());
  verify('Locked click cannot change the selected choice', await loc('.starter-opt.sel').getAttribute('data-relic') === 'beta_badge');
  verify('Application rejects locked, unknown and multiple starters',
    await ev(() => ['riveted_ledger', 'unknown', ['beta_badge']].every((id) => window.__sb.startRun(id) === false)));
  await tap('Begin');
  const readBase = () => ev(() => { const d = window.__sb.run.d;
    return { deck: d.deck.map((c) => c.id), hp: d.hp, maxHp: d.maxHp, scrap: d.scrap, relics: d.relics.slice() }; });
  const before = await readBase();
  verify('First run has the Phase 8 baseline and one default relic', before.hp === 130 && before.maxHp === 130 && before.scrap === 80 &&
    JSON.stringify(before.deck) === JSON.stringify(STARTER_DECK.map((c) => c.id)) && before.relics.join() === 'beta_badge');
  await dismissStory();
  // Controlled starting hand, one enemy and a normal map node. The game still routes through Travel.
  const node = await ev(() => {
    const a = window.__sb;
    const r = a.run;
    a.settings.hints = false;
    a.saveSettings();
    r.d.tutorial = false;
    const id = r.availableNodes().find((id) => r.node(id).type === 'battle');
    r.d.deck = [];
    for (let i = 0; i < 8; i++) for (const [id, variant] of [['scrapline', 'A'], ['rivet_jab', 'B']]) r.addCard({ id, variant });
    r.addCard({ id: 'piston_strike', variant: 'A' });
    a.save();
    return id;
  });
  await touch(`.map-node[data-node="${node}"]`);
  await tap('Travel');
  await loc('.hand .card').waitFor();
  await ev(() => {
    const c = window.__sb.battle.combat;
    for (const enemy of c.enemies) { enemy.hp = enemy.maxHp = 2000; enemy.atb = -100; }
    const strong = [...c.cards.keys()].find((uid) => c.def(uid).id === 'piston_strike');
    if (!c.hand.includes(strong)) {
      c.draw[c.draw.indexOf(strong)] = c.hand[0];
      c.hand[0] = strong;
      window.__sb.battle.updateHud(true);
    }
  });
  for (let i = 0; i < 4; i++) {
    await page.waitForFunction(() => window.__sb.battle.combat.phase === 'PRE');
    await playCard('scrapline');
    await playCard('rivet_jab');
    if (i === 0) await playCard('piston_strike');
    await touch('.ctl.cash');
    await page.waitForFunction((count) => window.__sb.battle.combat.progress.cashouts === count, i + 1);
  }
  verify('Four executed payouts still await the encounter outcome', !(await readMeta()).progress.earned.cash_out);
  verify('A legal Quick Settlement activation went straight into the Journal', (await readMeta()).combos.quick_settlement?.count === 1);
  // Enemy damage resolves under the normal engine. The low HP and filled enemy ATB are fixtures.
  await ev(() => {
    const c = window.__sb.battle.combat;
    c.hp = 1;
    c.guard = 0;
    for (const enemy of c.enemies) enemy.atb = 1;
  });
  await loc('.results-body').waitFor({ timeout: 20000 });
  const loss = await readMeta();
  verify('Defeat records the achievement and unlock on results', loss.runs[0].result === 'defeat' &&
    loss.runs[0].progress.unlocked.includes('riveted_ledger') && loss.progress.earned.cash_out);
  verify('Safe-screen notification and progression panel are visible', await loc('.progress-toast').isVisible() && await loc('.results-body .run-progress').isVisible());
  await dismissStory();
  await shot('defeat-progress');
  await page.reload();
  await title();
  await museum('Achievements');
  await loc('.achievement-filter').selectOption('earned');
  verify('Earned achievement survives reload', await loc('[data-achievement="cash_out"][data-earned="true"]').isVisible());
  await close();
  await museum('Starters');
  verify('Ledger is available in Museum; unlock alone does not discover it', await loc('.museum-starters [data-relic="riveted_ledger"] .good').isVisible() &&
    !(await readMeta()).relicsFound.includes('riveted_ledger'));
  await close();
  await clickNew('riveted_ledger');
  const alternative = await readBase();
  verify('Alternative starts with exactly the selected relic and original base resources', alternative.relics.join() === 'riveted_ledger' &&
    alternative.hp === before.hp && alternative.maxHp === before.maxHp && alternative.scrap === before.scrap &&
    JSON.stringify(alternative.deck) === JSON.stringify(before.deck));
  verify('Selecting Ledger legitimately discovers it', (await readMeta()).relicsFound.includes('riveted_ledger'));
  const original = await ev(() => window.__sb.run.d.progress.id);
  await page.reload();
  await tap('Continue');
  await dismissStory();
  verify('Continue preserves the starter and run identity', await ev((orig) => window.__sb.run.d.relics.join() === 'riveted_ledger' && window.__sb.run.d.progress.id === orig, original));

  const acquired = await ev(() => {
    const a = window.__sb;
    const r = a.run;
    const node = r.node(r.availableNodes()[0]);
    r.d.pending = r.makeReward({ ...node, type: 'battle' }, 'battle', {});
    r.d.pending.cards[0] = { id: 'hidden_ace', up: false, graft: null };
    r.d.pending.relics = ['prism_lens'];
    a.save();
    a.route();
    return r.d.pending.cards[0].id;
  });
  await touch('.reward-cards .card');
  await tap('Take card');
  await touch('.reward-relics .relic-badge');
  const cardUid = await ev((id) => window.__sb.run.d.deck.find((c) => c.id === id).uid, acquired);
  await tap('Continue');
  await ev(() => {
    const a = window.__sb;
    const r = a.run;
    r.d.pending = { type: 'shop', nodeId: 'phase9-removal-fixture', stock: r.makeShop(r.rng('phase9-removal'), false) };
    a.route();
  });
  await touch('.shop-services .svc');
  await touch(`.modal .deck-grid .card[data-uid="${cardUid}"]`);
  await tap('Remove a card', page.locator('.modal'));
  await page.waitForFunction((uid) => !window.__sb.run.d.deck.some((c) => c.uid === uid), cardUid);
  verify('Removed card stays in the catalogue', (await readMeta()).cardsSeen.includes(acquired));
  await tap('Leave');
  await ev(() => {
    const a = window.__sb;
    a.run.d.pending = { type: 'event', nodeId: 'phase9-trade-fixture', eventId: 'recursive_merchant' };
    a.route();
  });
  await touch('.event-choices .choice');
  verify('Traded relic stays in the catalogue and starter remains equipped', await ev(() =>
    !window.__sb.run.d.relics.includes('prism_lens') && window.__sb.run.d.relics.includes('riveted_ledger') &&
    window.__sb.meta.relicsFound.includes('prism_lens')));
  await tap('Continue');
  await ev(() => {
    const app = window.__sb;
    const run = app.run;
    run.d.pending = { type: 'battle', kind: 'battle', nodeId: run.availableNodes()[0], enemies: ['mirror_array'] };
    app.route();
    const c = app.battle.combat;
    c.enemies[0].hp = Math.floor(c.enemies[0].maxHp / 2) + 1;
  });
  const basic = await ev(() => {
    const c = window.__sb.battle.combat;
    return c.hand.find((uid) => uid && c.categoryOf(uid) === 'basic' && c.check(uid).ok);
  });
  await touch(`.hand .card[data-uid="${basic}"]`);
  await page.waitForFunction(() => window.__sb.meta.enemiesSeen.mirror_shard === 1);
  verify('Two genuinely summoned Shards count as one run in the Bestiary', await ev(() =>
    window.__sb.battle.combat.enemies.filter((e) => e.id === 'mirror_shard').length === 2 && window.__sb.meta.enemiesSeen.mirror_shard === 1));
  await clickAbandon();
  verify('Abandon retains discovery and grants no finished-run credit', await ev((id) => {
    const m = window.__sb.meta;
    return m.progress.defeats === 1 && m.progress.abandoned === 1 && !m.progress.earned.finish_three &&
      m.cardsSeen.includes(id) && m.relicsFound.includes('prism_lens') && m.enemiesSeen.mirror_shard === 1 && m.combos.quick_settlement.count === 1;
  }, acquired));
  await clickNew();
  await page.reload();
  await tap('New Run');
  await tap('Abandon & start new');
  await tap('Cancel');
  verify('Cancel in starter selector leaves the existing save', await button('Continue').isVisible() && (await readMeta()).progress.abandoned === 1);
  const otherLang = lang === 'en' ? 'ru' : 'en';
  await page.getByRole('button', { name: otherLang === 'ru' ? 'Русский' : 'English', exact: true }).tap();
  await page.reload();
  await tap('Museum', undefined, otherLang);
  await touch('.museum [data-tab="Achievements"]');
  verify('Language switch and reload preserve a single award', await loc('[data-achievement="cash_out"][data-earned="true"]').isVisible() &&
    (await readMeta()).runs.filter((r) => r.progress?.achievements?.includes('cash_out')).length === 1);
  await shot('after-language-switch');
}

try {
  await page.goto(url);
  if (mode === 'layout') await layout();
  else if (mode === 'historical') await historical();
  else if (mode === 'loadouts') await loadouts();
  else if (mode === 'recovery') await recovery();
  else if (mode === 'ui') await ui();
  else throw Error('Choose ui, historical, layout, loadouts or recovery');
} catch (error) {
  state.error = error.stack;
  console.error(error);
  await shot('error').catch(() => {});
} finally {
  verify('No page errors', state.errors.length === 0, state.errors);
  await browser.close();
  fs.writeFileSync(`${out}/${mode}-${lang}-${width}.json`, JSON.stringify(state, null, 2) + '\n');
  console.log(`${state.checks.filter((c) => c.passed).length}/${state.checks.length} passed`);
  if (state.error || state.checks.some((c) => !c.passed)) process.exitCode = 1;
}
