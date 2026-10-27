// Layout check for a translated interface. Opens every screen and modal in the given language at
// several viewports and reports text that is clipped by its container, truncated with an ellipsis,
// or pushed off screen. Screens are reached by setting run state directly (this checks layout, not
// natural reachability; tools/milestone.mjs covers that).
//
// Usage: node tools/i18n-layout.mjs [outDir] [lang] [viewports]   e.g. out ru 844x390,1194x834
// Needs the dev server (npm run serve) on port 8123. Writes report.json and screenshots of each
// screen with issues plus a fixed set of key screens.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { findIssues } from './lib/text-issues.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const [outDir = 'layout-out', LANG = 'ru', vpArg = '667x375,844x390,900x500,1024x768,1194x834,1920x1080'] = process.argv.slice(2);
const VIEWPORTS = vpArg.split(',').map((v) => v.split('x').map(Number));
const URL = process.env.SB_URL || 'http://localhost:8123/index.html';
fs.mkdirSync(outDir, { recursive: true });

const b = await chromium.launch();
const report = { lang: LANG, viewports: vpArg, screens: 0, issues: [] };
const seen = new Set();

for (const [W, H] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true });
  await ctx.addInitScript((lang) => {
    try {
      localStorage.setItem('signalbreak.settings.v1', JSON.stringify({ lang, hints: true }));
    } catch (e) { /* ignore */ }
  }, LANG);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL);
  await p.waitForFunction(() => window.__sb);
  await p.evaluate(() => document.fonts.ready);
  const vp = `${W}x${H}`;

  const check = async (name, shot = false) => {
    await p.waitForTimeout(name.startsWith('battle') || name.startsWith('banner') || name.startsWith('tutorial') ? 900 : 160);
    const issues = await p.evaluate(findIssues);
    report.screens++;
    for (const i of issues) {
      const key = `${vp}|${name}|${i.kind}|${i.where}|${i.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      report.issues.push({ viewport: vp, screen: name, ...i });
    }
    if (shot || issues.length) await p.screenshot({ path: `${outDir}/${vp}-${name.replace(/[^\w-]+/g, '_')}.png` });
    return issues;
  };
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const closeModals = () => ev(() => window.__sb.closeAllModals());

  // ── title and menus ──
  await check('title', true);
  await ev(() => window.__sb.newRunFlow()); await check('new-run', true); await closeModals();
  await ev(() => window.__sb.openSettings()); await check('settings', true); await closeModals();
  await ev(() => window.__sb.howToPlay()); await check('how-to-play', true); await closeModals();

  // Museum with every entry discovered
  await ev(async () => {
    const app = window.__sb;
    const { RELIC_IDS } = await import('/src/data/relics.js');
    const { CARD_LIST } = await import('/src/data/cards.js');
    const { ENEMIES } = await import('/src/data/enemies.js');
    const m = app.meta;
    m.totalRuns = 7; m.wins = 2; m.defeats = 5; m.bestCombo = 7; m.devTrust = 3; m.endings = ['core_stabilized'];
    m.relicsFound = [...RELIC_IDS]; m.cardsSeen = CARD_LIST.map((c) => c.id);
    for (const id of Object.keys(ENEMIES)) m.enemiesSeen[id] = 3;
    m.bossesDefeated = { clockwork_regent: 2, the_corruptor: 1 };
    m.archetypes = { momentum: 3, 'Relay Echo': 2, balanced: 1, interference: 1 };
    m.runs = [{ result: 'victory', act: 3, floors: 27, archetype: 'interference', score: 1370, date: Date.now(), bosses: ['clockwork_regent', 'mirror_array', 'the_corruptor'], longest: 7, mutations: ['overpressure_valve', 'signal_thief'], decisions: [] },
      { result: 'abandoned', act: 1, floors: 3, archetype: 'Momentum Burst', score: 30, date: Date.now(), bosses: [], longest: 3, mutations: [], decisions: [] }];
    app.openMuseum();
  });
  for (const tab of [0, 1, 2, 3, 4]) {
    await ev((i) => document.querySelectorAll('.museum .tab')[i].click(), tab);
    await check(`museum-${tab}`, tab === 0);
  }
  await closeModals();

  // ── a run ──
  await ev(() => { window.__sb.meta.tutorialDone = true; window.__sb.startRun('beta_badge'); });
  await p.waitForTimeout(300);
  await check('story-dialog', true);
  await ev(() => document.querySelector('.dlg-skip').click());
  await check('map', true);
  const nodeCount = await ev(() => document.querySelectorAll('.map-node').length);
  for (let i = 0; i < nodeCount; i++) { await ev((k) => document.querySelectorAll('.map-node')[k].click(), i); await check(`map-node-${i}`); }

  // deck with every card, plain and upgraded with a graft
  await ev(async () => {
    const app = window.__sb;
    const { CARD_LIST, GRAFTS } = await import('/src/data/cards.js');
    const grafts = Object.keys(GRAFTS);
    app.run.d.deck = CARD_LIST.flatMap((c, i) => [{ uid: `a${i}`, id: c.id, up: false, graft: null, rankMod: 0, variant: null }, { uid: `b${i}`, id: c.id, up: true, graft: grafts[i % grafts.length], rankMod: i % 3 === 0 ? 1 : 0, variant: i % 5 === 0 ? 'EX' : null }]);
    app.viewDeck();
  });
  await check('deck-all-cards', true);
  // scroll through the whole grid so every card is checked
  for (let page = 1; page < 40; page++) {
    const more = await ev(() => { const m = document.querySelector('.modal .panel'); const before = m.scrollTop; m.scrollTop += m.clientHeight * 0.9; return m.scrollTop > before; });
    if (!more) break;
    await check(`deck-all-cards-p${page}`);
  }
  await closeModals();
  // card selection (events, rest, surgery): grid, then a picked card with its "after" preview
  await ev(async () => { const I = await import('/src/i18n/index.js'); window.__sb.selectCard({ title: I.t('Upgrade a card'), filter: (c) => !c.up, confirm: I.t('Upgrade'), preview: true }); });
  await check('select-card', true);
  await ev(() => document.querySelector('.modal .deck-grid .card:not(.disabled)').click());
  await check('select-card-picked', true);
  for (let page = 1; page < 40; page++) {
    const more = await ev(() => { const m = document.querySelector('.modal .panel'); const before = m.scrollTop; m.scrollTop += m.clientHeight * 0.8; return m.scrollTop > before; });
    if (!more) break;
    await check(`select-card-p${page}`);
  }
  await closeModals();
  await ev(() => { const app = window.__sb; app.cardDetail(app.run.d.deck.find((c) => c.id === 'final_notice' && c.up)); });
  await check('card-detail', true);
  await closeModals();

  // run screens
  const route = (setup, arg) => ev(setup, arg).then(() => p.waitForTimeout(250));
  await route(() => { const r = window.__sb.run; r.d.pending = r.makeReward(r.d.map.nodes.find((n) => n.type === 'battle') || r.d.map.nodes[0], 'elite', {}); window.__sb.route(); });
  await check('reward', true);
  await route(() => { const r = window.__sb.run; r.d.scrap = 400; r.d.pending = { type: 'shop', nodeId: r.d.map.nodes[0].id, stock: r.makeShop(r.rng('shopcheck'), true) }; window.__sb.route(); });
  await check('shop', true);
  for (const quiet of [false, true]) {
    await route((q) => { const r = window.__sb.run; r.d.pending = { type: 'rest', nodeId: r.d.map.nodes[0].id, done: false, quiet: q }; window.__sb.route(); }, quiet);
    await check(`rest-${quiet ? 'quiet' : 'plain'}`, !quiet);
    await ev(() => document.querySelector('.rest-opt:nth-child(3)').click());
    await check(`rest-done-${quiet ? 'quiet' : 'plain'}`);
  }
  for (const g of [['spark', 'quick', 'plated'], ['echoing', 'keen', 'cached'], ['churnfed', 'breaker', 'anchored'], ['ledger', 'spark', 'keen']]) {
    await route((gs) => { const r = window.__sb.run; r.d.pending = { type: 'surgery', nodeId: r.d.map.nodes[0].id, ops: 1, grafts: gs, select: null }; window.__sb.route(); }, g);
    await check(`surgery-${g[0]}`, g[0] === 'spark');
  }
  const relicIds = await ev(async () => Object.keys((await import('/src/data/relics.js')).RELICS));
  for (let i = 0; i < relicIds.length; i += 2) {
    await route((pair) => { const r = window.__sb.run; r.d.pending = { type: 'treasure', nodeId: r.d.map.nodes[0].id, relics: pair, taken: false, scrap: 20 }; window.__sb.route(); }, relicIds.slice(i, i + 2).length === 2 ? relicIds.slice(i, i + 2) : [relicIds[i], relicIds[0]]);
    await check(`treasure-${relicIds[i]}`, i === 0);
  }
  const mutIds = await ev(async () => Object.keys((await import('/src/data/mutations.js')).MUTATIONS));
  for (let i = 0; i < mutIds.length; i += 3) {
    await route((opts) => { const r = window.__sb.run; r.d.pending = { type: 'mutation', options: opts }; window.__sb.route(); }, mutIds.slice(i, i + 3));
    await check(`mutation-${mutIds[i]}`, i === 0);
  }
  // boss preparation: every boss, every adaptation, every evidence line
  const bossPlan = await ev(async () => {
    const { BOSSES } = await import('/src/data/enemies.js');
    const { ADAPTATIONS } = await import('/src/data/adaptations.js');
    const bosses = Object.values(BOSSES).flat();
    const arch = Object.keys(ADAPTATIONS);
    return Array.from({ length: Math.max(bosses.length, arch.length) }, (_, i) => [bosses[i % bosses.length], arch[i % arch.length]]);
  });
  for (const [bossId, arch] of bossPlan) {
    await route(async ([bid, a]) => {
      const { ADAPTATIONS } = await import('/src/data/adaptations.js');
      const r = window.__sb.run;
      const ev = [{ k: '{a} of {b} combos ran 5+ cards', p: { a: 12, b: 40 } }, { k: '{a}% of suited cards played were {s}', p: { a: 74, s: 'A' } }, { k: '{a} interference-payoff cards played', p: { a: 14 } }];
      r.d.pending = { type: 'bossprep', nodeId: r.d.map.nodes[0].id, bossId: bid, profile: ev.map((e, i) => ({ arch: a, score: 3 - i, evidence: e })), arch: a, adaptation: { ...ADAPTATIONS[a] }, volatileId: 'wildcard', choice: null, introShown: true };
      window.__sb.route();
    }, [bossId, arch]);
    await check(`bossprep-${bossId}-${arch}`, bossId === 'clockwork_regent');
  }
  // every event: choices, then every outcome
  const events = await ev(async () => (await import('/src/data/events.js')).EVENTS.map((e) => [e.id, e.choices.length]));
  for (const [id, n] of events) {
    await route((eid) => { const r = window.__sb.run; r.d.scrap = 300; r.d.pending = { type: 'event', nodeId: r.d.map.nodes[0].id, eventId: eid, result: null, select: null }; window.__sb.route(); }, id);
    await check(`event-${id}`, id === 'dev_door');
    for (let i = 0; i < n; i++) {
      await route(([eid, k]) => {
        const r = window.__sb.run;
        r.d.scrap = 300;
        r.d.pending = { type: 'event', nodeId: r.d.map.nodes[0].id, eventId: eid, result: null, select: null };
        r.eventChoose(k);
        r.d.pending.select = null;
        window.__sb.route();
      }, [id, i]);
      await check(`event-${id}-${i}`);
    }
  }
  // results, victory and defeat (the defeat screen opens with the defeat dialogue)
  for (const win of [true, false]) {
    await route(async (w) => {
      const S = await import('/src/ui/screens.js');
      const s = { result: w ? 'victory' : 'defeat', act: w ? 3 : 2, floors: 27, bosses: w ? ['scrap_tyrant', 'protocol_auditor', 'signalbreak_core'] : ['clockwork_regent'], elites: 2, deckSize: 31, relics: [], mutations: [], archetype: 'interference', longest: 7, maxHit: 88, damage: 4000, combos: 120, perfect: 99, cashouts: 9, finishers: 8, score: 1500, decisions: [
        { act: 1, boss: 'scrap_tyrant', prep: 'prepared', planId: 'scout', adapt: 'interference', result: 'victory', mutation: 'bastion_protocol' },
        { act: 2, boss: 'protocol_auditor', prep: 'volatile', planId: 'wildcard', rareCard: 'final_notice', adapt: 'variantA', result: 'victory', mutation: 'duality_engine' },
        { act: 3, boss: 'signalbreak_core', prep: 'prepared', planId: 'tuned', adapt: 'momentum', result: w ? 'victory' : null }] };
      window.__sb.show(S.resultsScreen, s);
      if (!w) S.storyDialog(window.__sb, S.defeatLines(window.__sb), () => {});
    }, win);
    await check(`results-${win ? 'victory' : 'defeat'}`, true);
    await ev(() => { const s = document.querySelector('.dlg-skip'); if (s) s.click(); });
  }

  // ── battle: boss with adaptation, every tutorial card, banners, pause menu ──
  await route(async () => {
    const app = window.__sb;
    const { ADAPTATIONS } = await import('/src/data/adaptations.js');
    const r = app.run;
    r.d.deck = []; r.d.nextUid = 1;
    for (const id of ['scrapline', 'hotwire', 'salvage', 'rivet_jab', 'spark_primer', 'gauge_read', 'rethread', 'step_up', 'gear_swap', 'dead_drop', 'relay_baton', 'shuffle_step', 'scrapfall', 'last_word', 'final_notice', 'grand_relay']) r.addCard({ id });
    // the widest Churn panel: 6 charges (relic + mutation) plus the FREE badge
    if (!r.d.relics.includes('churn_gear')) r.d.relics.push('churn_gear');
    if (!r.d.mutations.includes('grinder')) r.d.mutations.push('grinder');
    // the shortest Reserve slots: 4 of them (relic + mutation)
    if (!r.d.relics.includes('spare_pockets')) r.d.relics.push('spare_pockets');
    if (!r.d.mutations.includes('deep_pockets')) r.d.mutations.push('deep_pockets');
    const boss = r.d.map.nodes.find((n) => n.type === 'boss');
    r.d.pending = { type: 'battle', kind: 'boss', nodeId: boss.id, bossId: r.d.bosses[1], arch: 'interference', adaptation: { ...ADAPTATIONS.interference }, prep: {}, profile: [] };
    app.meta.tut = {};
    app.route();
  });
  await p.waitForTimeout(1200);
  await check('battle-boss', true);
  for (const key of ['start', 'opened', 'closer', 'afterCombo', 'lock', 'scramble', 'jam', 'glitch', 'latch']) {
    await ev((k) => { const bs = window.__sb.battle; window.__sb.meta.tut[k] = false; bs.tutorial(k); }, key);
    await check(`tutorial-${key}`, key === 'opened');
    await ev(() => { const btn = document.querySelector('.tut-layer:not([hidden]) .btn'); if (btn) btn.click(); });
  }
  // play into a combo so the "next" hint, flow text and cash-out sub-labels show
  await ev(() => {
    const bs = window.__sb.battle;
    const c = bs.combat;
    c.momentum = 9;
    const u = c.hand.find((x) => x && c.check(x).ok);
    if (u) bs.doPlay(u);
    const r = c.hand.find((x) => x && !c.check(x).ok && c.roleOf(x) !== 'junk');
    if (r) bs.doStash(r);
  });
  await check('battle-combo', true);
  // every card name in the Reserve mini-cards, four at a time
  const resGroups = await ev(async () => {
    const { CARD_LIST } = await import('/src/data/cards.js');
    const ids = CARD_LIST.map((c) => c.id);
    const out = [];
    for (let i = 0; i < ids.length; i += 4) out.push(ids.slice(i, i + 4));
    return out;
  });
  const savedReserve = await ev(() => [...window.__sb.battle.combat.reserve]);
  for (const g of resGroups) {
    await ev((ids) => {
      const bs = window.__sb.battle;
      const c = bs.combat;
      c.reserve.length = 0;
      for (const id of ids) {
        let inst = [...c.cards.values()].find((x) => x.id === id && !c.reserve.includes(x.uid));
        if (!inst) { inst = { uid: `lay_${id}`, id, up: false }; c.cards.set(inst.uid, inst); }
        c.reserve.push(inst.uid);
      }
      bs.updateHud(true);
    }, g);
    await p.waitForTimeout(60);
    const issues = (await p.evaluate(findIssues)).filter((i) => /res-/.test(i.where));
    report.screens++;
    for (const i of issues) report.issues.push({ viewport: vp, screen: `reserve-${g.join(',')}`, ...i });
  }
  await ev((r) => { const bs = window.__sb.battle; bs.combat.reserve.splice(0, Infinity, ...r); bs.updateHud(true); }, savedReserve);
  const banners = await ev(async () => {
    const { ENEMIES } = await import('/src/data/enemies.js');
    const { TRAITS } = await import('/src/data/traits.js');
    const out = [];
    for (const [id, e] of Object.entries(ENEMIES)) (e.phases || []).forEach((_, i) => out.push(['phase', id, i]));
    for (const t of Object.keys(TRAITS)) out.push(['trait', t]);
    return out;
  });
  for (const bn of banners) {
    await ev(async (x) => {
      const I = await import('/src/i18n/index.js');
      const bs = window.__sb.battle;
      bs.bannerEl.innerHTML = '';
      if (x[0] === 'phase') bs.banner(I.phaseName(x[1], x[2]), I.phaseText(x[1], x[2]), 'bad');
      else bs.banner(I.traitName(x[1]).toUpperCase(), I.traitText(x[1]), 'info');
    }, bn);
    await check(`banner-${bn.slice(1).join('-')}`, bn[1] === 'signalbreak_core' && bn[2] === 1);
  }
  await ev(() => window.__sb.pause()); await check('pause', true); await closeModals();
  await ev(async () => {
    const I = await import('/src/i18n/index.js');
    window.__sb.toast(I.remark('tripleRelay', 0), 'dev');
    window.__sb.toast(I.t('Relic acquired: {r}', { r: I.relicName('dead_mans_switch') }));
  });
  await check('toasts', true);

  if (errors.length) report.issues.push(...errors.map((e) => ({ viewport: vp, screen: 'pageerror', kind: 'error', text: e })));
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
const byKind = report.issues.reduce((a, i) => ((a[i.kind] = (a[i.kind] || 0) + 1), a), {});
console.log(`${report.screens} screens checked, ${report.issues.length} issues`, byKind);
for (const i of report.issues.slice(0, 80)) console.log(`${i.viewport} ${i.screen} [${i.kind}] "${i.text}" @ ${i.where}${i.by ? ' clipped by ' + i.by : ''}`);
