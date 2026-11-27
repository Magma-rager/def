import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Combat } from '../src/engine/combat.js';
import { Run, PARTY_MAX_HP } from '../src/engine/run.js';
import { createSave, defaultMeta, normalizeMeta } from '../src/engine/save.js';
import { addRunRecipe, applyCheckpoint, canStartWith, collections, settleRun, starterOptions } from '../src/engine/progression.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { CARDS, STARTER_DECK, rewardPool } from '../src/data/cards.js';
import { RELICS, STARTER_OPTIONS, relicPool } from '../src/data/relics.js';
import { BOSSES, ENEMIES } from '../src/data/enemies.js';
import { RECIPE_IDS } from '../src/data/recipes.js';
import { RNG } from '../src/core/rng.js';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const RUN_KEY = 'signalbreak.run.v3';
const META_KEY = 'signalbreak.meta.v1';
const earned = (meta, id) => assert.ok(meta.progress.earned[id], id);
const start = (seed = 1, starterRelic) => Run.create({ seed, starterRelic });
const saveCopy = (value) => JSON.parse(JSON.stringify(value));

function memory() {
  const data = new Map();
  const fail = { write: null, clear: false };
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => {
      if (fail.write === key) throw Error('quota');
      data.set(key, value);
    },
    removeItem: (key) => {
      if (fail.clear) throw Error('cannot remove');
      data.delete(key);
    },
  };
  return { save: createSave(storage), data, fail };
}

function nearBattle(run, { boss, act = 1 } = {}) {
  if (run.d.act !== act) { run.d.act = act; run.generateMap(act); }
  if (boss) {
    run.d.bosses[act] = boss;
    const node = run.d.map.nodes.find((n) => n.type === 'boss');
    run.d.position = run.d.map.nodes.find((n) => n.edges.includes(node.id)).id;
    run.d.pending = null;
    assert.ok(run.enterNode(node.id));
    run.chooseBossPrep('prepared', 'brace');
  } else {
    run.d.pending = null;
    run.d.position = null;
    assert.ok(run.enterNode(run.availableNodes()[0]));
  }
  return run.battleSetup();
}

function arranged(setup, hand = [], draw = []) {
  const deck = [...hand, ...draw].map((spec, i) => ({ uid: `f${i}`, ...(typeof spec === 'string' ? { id: spec } : spec) }));
  const c = new Combat({ ...setup, deck: deck.length ? deck : setup.deck, enemies: setup.enemies });
  if (deck.length) {
    c.hand = Array.from({ length: 6 }, (_, i) => i < hand.length ? `f${i}` : null);
    c.draw = deck.slice(hand.length).map((d) => d.uid);
    c.discard = [];
  }
  for (const e of c.enemies) { e.hp = e.maxHp = 1000; e.atb = -1000; e.guard = 0; }
  c.momentum = 10;
  c.drainEvents();
  return c;
}
function tick(c, n = 100) { for (let i = 0; i < n; i++) c.update(1 / 60); }
function action(c, id) {
  const uid = [...c.hand, ...c.reserve].find((x) => x && c.def(x).id === id);
  assert.ok(uid, id);
  const r = c.commit(uid);
  assert.ok(r.ok, `${id}: ${r.chk?.reason}`);
  tick(c, 39);
}
function useFinish(c, type = 'perfect') {
  const r = c.commitFinish(type);
  assert.ok(r.ok, r.text);
  tick(c, 94);
}
function commitBattle(run, c, win = true) {
  // Fixtures isolate the outcomes. The observations transferred are from the real executed actions above.
  if (win) for (const enemy of c.enemies) enemy.alive = false;
  else c.hp = 0;
  c.checkEnd();
  for (const [id, n] of Object.entries(c.outcome().stats.exByRecipe)) {
    for (let i = 0; i < n; i++) addRunRecipe(run, id, 1234);
  }
  assert.ok(run.finishBattle(c.outcome()));
}

test('ten loadouts use their ordinary relic definitions, with one relic and the same baseline', () => {
  const m = defaultMeta();
  assert.deepEqual(starterOptions(m).filter((o) => o.available).map((o) => o.id), ['beta_badge']);
  for (const id of ['__proto__', 'missing', ['beta_badge'], 'iron_filings']) assert.equal(canStartWith(m, id), false);
  for (const { id } of STARTER_OPTIONS) {
    assert.ok(RELICS[id].tag);
    const run = start(42, id);
    const setup = nearBattle(run);
    const combat = new Combat(setup);
    assert.deepEqual([...combat.relics], [id], id);
    assert.deepEqual(run.d.deck.map((c) => c.id), STARTER_DECK.map((c) => c.id));
    assert.equal(run.d.hp, PARTY_MAX_HP);
    assert.equal(run.d.scrap, 80);
    assert.equal(run.d.progress.starter, id);
    if (id !== 'beta_badge') assert.ok(relicPool().includes(id), 'ordinary acquisition');
    if (id === 'pressure_gauge') { assert.equal(combat.momentumMax(), 13); assert.equal(combat.momentum, 2); }
    if (id === 'spare_pockets') assert.equal(combat.reserveMax(), 3);
  }
});

test('starter relic effects change the matching legal actions from the same starting state', () => {
  const hand = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }];
  const build = (relic) => {
    const combat = arranged(nearBattle(start(42, relic)), hand, ['piston_strike']);
    combat.momentum = 4;
    return combat;
  };
  const paired = (relic) => [build('beta_badge'), build(relic)];
  let [base, chosen] = paired('stopwatch_gear');
  for (const c of [base, chosen]) action(c, 'scrapline');
  assert.ok(Math.abs(chosen.flowLeft() - base.flowLeft() - 1) < 0.001);

  [base, chosen] = paired('echo_splice');
  for (const c of [base, chosen]) {
    action(c, 'scrapline');
    assert.ok(c.commitRelay('C').ok);
    tick(c, 50);
  }
  assert.ok(chosen.combo.relayEchoUsed && chosen.enemies[0].hp < base.enemies[0].hp);

  for (const relic of ['ladder_rungs', 'twin_dials', 'riveted_ledger']) {
    [base, chosen] = paired(relic);
    for (const c of [base, chosen]) { action(c, 'scrapline'); action(c, 'rivet_jab'); }
    if (relic === 'ladder_rungs') assert.equal(chosen.stats.damage - base.stats.damage, 3);
    if (relic === 'twin_dials') assert.equal(chosen.momentum - base.momentum, 1);
    if (relic === 'riveted_ledger') {
      const normal = base.payoutAmount(1).amount;
      for (const c of [base, chosen]) useFinish(c, 'cashout');
      assert.ok(base.stats.damage < chosen.stats.damage && normal > 0);
    }
  }
  [base, chosen] = paired('spare_pockets');
  for (const c of [base, chosen]) { assert.ok(c.stash(c.hand[0]).ok); action(c, 'scrapline'); }
  assert.equal(chosen.stats.damage - base.stats.damage, 3);

  [base, chosen] = paired('tower_plate');
  for (const c of [base, chosen]) assert.ok(c.spendMomentumGuard().ok);
  assert.equal(chosen.guard - base.guard, 2);
  assert.equal(chosen.momentum, base.momentum);

  [base, chosen] = paired('breach_clamp');
  for (const c of [base, chosen]) assert.equal(c.lockCards(c.enemies[0], 1), 1);
  assert.equal(Object.values(base.locks)[0].dur - Object.values(chosen.locks)[0].dur, 1);
  assert.equal(chosen.momentum - base.momentum, 1);
  assert.equal(chosen.guard - base.guard, 3);

  for (const c of [base, chosen] = paired('tower_plate')) assert.ok(c.churnCard(c.hand[0]).ok);
  assert.equal(base.churn.charges - chosen.churn.charges, 1);
});

test('persistent combat achievements use real actions in committed encounters, not repeated checkpoints', () => {
  const meta = defaultMeta();
  const run = start();
  const hand = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'piston_strike', variant: 'A' },
    { id: 'scrapfall', variant: 'B' }, 'salvage', 'glitch'];
  for (let n = 0; n < 3; n++) {
    const c = arranged(nearBattle(run), hand);
    assert.ok(c.churnCard(c.hand[5]).ok);
    assert.ok(c.stash(c.hand[0]).ok);
    action(c, 'scrapline');
    action(c, 'rivet_jab');
    action(c, 'piston_strike');
    action(c, 'scrapfall');
    useFinish(c);
    c.addGuard(20);
    c.hitParty(c.enemies[0], 'C', 20);
    applyCheckpoint(meta, run);
    assert.equal(meta.progress.proofs.reserveBattles || 0, n, 'unfinished encounter has no credit');
    commitBattle(run, c, n !== 2);
    assert.equal(run.finishBattle(c.outcome()), null, 'duplicate callback stops at the Run boundary');
    applyCheckpoint(meta, run);
    applyCheckpoint(meta, run);
    assert.equal(meta.progress.proofs.reserveBattles, n + 1);
    assert.equal(meta.progress.proofs.crossChains, n + 1);
    assert.equal(meta.progress.proofs.responseBattles, n + 1);
    assert.equal(canStartWith(meta, 'spare_pockets'), n === 2);
    assert.equal(canStartWith(meta, 'breach_clamp'), n >= 1);
  }
  for (const id of ['ascending', 'switch_suits', 'reserve', 'guard', 'interference', 'first_recipe']) earned(meta, id);
  assert.ok(meta.combos.straight_circuit.count >= 1);
  assert.deepEqual(run.d.relics, ['beta_badge'], 'unlocks never change the active loadout');
  assert.ok(canStartWith(meta, 'ladder_rungs') && canStartWith(meta, 'twin_dials') && canStartWith(meta, 'tower_plate'));
});

test('queued and cancelled attacks and discarded encounter attempts give no completed-battle credit', () => {
  const run = start();
  const meta = defaultMeta();
  const setup = nearBattle(run);
  const c = arranged(setup, ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall']);
  assert.ok(c.commit(c.hand[0]).ok);
  const queued = c.commit(c.hand[1]);
  assert.ok(queued.ok);
  assert.ok(c.cancelCmd(queued.cmd.id));
  tick(c);
  applyCheckpoint(meta, run);
  const restarted = arranged(run.battleSetup(), ['scrapline']);
  commitBattle(run, restarted);
  applyCheckpoint(meta, run);
  assert.deepEqual(meta.progress.proofs, {});
  assert.equal(canStartWith(meta, 'ladder_rungs'), false);
});

test('cash out counts four legal payouts, including an encounter-ending payout', () => {
  const run = start();
  const meta = defaultMeta();
  for (let i = 0; i < 4; i++) {
    const c = arranged(nearBattle(run), ['scrapline', 'rivet_jab']);
    action(c, 'scrapline');
    action(c, 'rivet_jab');
    if (i === 3) for (const enemy of c.enemies) enemy.hp = 1;
    useFinish(c, 'cashout');
    commitBattle(run, c);
    applyCheckpoint(meta, run);
    assert.equal(meta.progress.proofs.cashouts, i + 1);
    assert.equal(canStartWith(meta, 'riveted_ledger'), i === 3);
  }
});

test('Relay, Churn, high-rank, Flow and Momentum evidence requires a successful executed chain', () => {
  const run = start();
  const meta = defaultMeta();
  let c = arranged(nearBattle(run), ['scrapline', 'rivet_jab', 'scrapfall', 'rivet_jab', 'thermal_lance']);
  action(c, 'scrapline');
  assert.ok(c.selectHero('C').ok);
  tick(c, 33);
  action(c, 'rivet_jab');
  action(c, 'thermal_lance');
  useFinish(c);
  commitBattle(run, c);
  applyCheckpoint(meta, run);
  earned(meta, 'relay_pair');

  c = arranged(nearBattle(run), ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'bolt_volley']);
  action(c, 'scrapline');
  assert.ok(c.selectHero('C').ok);
  tick(c, 33);
  action(c, 'rivet_jab');
  assert.ok(c.selectHero('S').ok);
  tick(c, 33);
  action(c, 'scrapline');
  action(c, 'bolt_volley');
  assert.equal(c.history.at(-1).type, 'perfect', 'the third segment finishes automatically');
  commitBattle(run, c);
  applyCheckpoint(meta, run);
  earned(meta, 'relay_trio');

  c = arranged(nearBattle(run), ['scrapline', 'pinprick', 'scrapfall', 'jam_breaker', 'capstone', 'mend_circuit'], ['salvage', 'rivet_jab']);
  action(c, 'scrapline');
  const churned = c.hand.find((id) => id && c.def(id).id === 'pinprick');
  assert.ok(c.churnCard(churned).ok);
  assert.ok(c.spendMomentumFlow().ok);
  action(c, 'rivet_jab');
  action(c, 'scrapfall');
  action(c, 'jam_breaker');
  action(c, 'capstone');
  useFinish(c);
  commitBattle(run, c);
  applyCheckpoint(meta, run);
  for (const id of ['rank_six', 'churn_payoff', 'flow_finish', 'momentum_burst']) earned(meta, id);
});

test('boss campaign milestones, encounters and Root Key reach the profile immediately; defeat never revokes them', () => {
  const meta = defaultMeta();
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = start(12 + attempt);
    for (const act of [1, 2, 3]) {
      const boss = BOSSES[act][attempt];
      const c = arranged(nearBattle(run, { boss, act }));
      commitBattle(run, c);
      applyCheckpoint(meta, run);
      applyCheckpoint(meta, run);
      assert.equal(meta.bossesDefeated[boss], 1);
      assert.equal(meta.enemiesSeen[boss], 1);
    }
    const final = attempt === 0 ? 'victory' : 'abandoned';
    settleRun(meta, run, final);
    settleRun(meta, run, final);
  }
  for (const id of ['act_one', 'act_two', 'victory', 'boss_sight', 'all_bosses']) earned(meta, id);
  assert.equal(meta.wins, 1);
  assert.equal(meta.progress.abandoned, 1);
  assert.ok(meta.relicsFound.includes('root_key'));
  assert.deepEqual(collections(meta).bosses, [6, 6]);
});

test('an adaptation break must be transferred from a completed boss encounter', () => {
  const meta = defaultMeta();
  const run = start();
  const setup = nearBattle(run, { boss: 'scrap_tyrant' });
  const c = arranged({ ...setup, adaptation: { id: 'reserve_seal', need: 1 } }, ['scrapline', 'rivet_jab']);
  assert.ok(c.stash(c.hand[0]).ok);
  action(c, 'scrapline');
  applyCheckpoint(meta, run);
  assert.equal(meta.progress.earned.adapt_break, undefined);
  assert.equal(c.adapt.broken, true);
  commitBattle(run, c);
  applyCheckpoint(meta, run);
  earned(meta, 'adapt_break');
});

test('acquired cards and traded relics persist, declined offers and unknowns stay out of totals', () => {
  const meta = defaultMeta();
  const run = start(5, 'spare_pockets');
  applyCheckpoint(meta, run);
  const starterCount = new Set(STARTER_DECK.map((s) => s.id)).size;
  assert.deepEqual(collections(meta).cards, [starterCount, 87]);
  assert.ok(meta.relicsFound.includes('spare_pockets'));
  const offer = rewardPool().filter((c) => !run.d.progress.cards.includes(c.id) && c.category === 'arte').slice(0, 2);
  run.d.pending = { type: 'reward', cards: offer, relics: ['twin_dials'] };
  applyCheckpoint(meta, run);
  assert.ok(!meta.cardsSeen.includes(offer[0].id));
  run.takeReward('card', 0);
  run.takeReward('relic', 0);
  const added = run.d.deck.at(-1);
  assert.ok(run.applySelect('transform', added.uid));
  assert.ok(run.removeCard(added.uid));
  run.d.pending = { type: 'event', nodeId: 'event_trade', eventId: 'recursive_merchant' };
  run.eventChoose(0);
  assert.ok(!run.d.relics.includes('twin_dials'));
  assert.ok(run.d.relics.includes('spare_pockets'), 'chosen starter is protected by the event promise');
  applyCheckpoint(meta, run);
  assert.ok(meta.cardsSeen.includes(offer[0].id));
  assert.ok(meta.cardsSeen.includes(added.id));
  assert.ok(meta.relicsFound.includes('twin_dials'));
  meta.cardsSeen.push('glitch', 'unavailable_card');
  meta.relicsFound.push('future_relic');
  meta.enemiesSeen.future_enemy = 1;
  meta.combos.future_recipe = { at: 0, count: 1 };
  const c = collections(meta);
  assert.equal(c.cards[0], new Set(meta.cardsSeen.filter((id) => CARDS[id] && id !== 'glitch')).size);
  assert.deepEqual(c.recipes, [0, 17]);
  assert.deepEqual(c.enemies, [0, 28]);
  assert.equal(c.relics[1], 41);
});

test('known encounter and EX discoveries persist after restart and abandonment; fresh lifetime thresholds use known IDs', () => {
  const m = defaultMeta();
  const run = start();
  const setup = nearBattle(run);
  const c = arranged(setup);
  c.summon('mirror_shard', c.enemies[0]);
  for (const e of c.enemies) run.discoverEnemy(e.id);
  applyCheckpoint(m, run);
  const first = { ...m.enemiesSeen };
  run.battleSetup();
  applyCheckpoint(m, run);
  assert.deepEqual(m.enemiesSeen, first);
  // Existing recipe tests play every one legally. Here the resolved recipe IDs enter the
  // same persistence boundary used by both the browser and seeded campaign tool.
  for (const id of RECIPE_IDS) addRunRecipe(run, id, 2000);
  applyCheckpoint(m, run);
  addRunRecipe(run, RECIPE_IDS[0], 3000);
  applyCheckpoint(m, run);
  applyCheckpoint(m, run);
  assert.deepEqual(m.combos[RECIPE_IDS[0]], { at: 2000, count: 2 });
  for (const id of Object.keys(ENEMIES).slice(0, 18)) run.discoverEnemy(id);
  for (const id of relicPool().slice(0, 20)) run.addRelic(id);
  settleRun(m, run, 'abandoned');
  for (const id of ['first_recipe', 'recipe_five', 'recipe_all', 'advanced_recipe', 'bestiary', 'relic_collection']) earned(m, id);
  assert.equal(m.wins, 0);
  assert.equal(m.defeats, 0);
  assert.equal(m.progress.abandoned, 1);
});

test('intentional build mastery needs a boss, a matching direction and executed-mechanic evidence', () => {
  const m = defaultMeta();
  const finishWith = (tagCard, proofs, result = 'defeat') => {
    const run = start();
    run.addCard({ id: tagCard }); run.addCard({ id: tagCard });
    run.d.bossesDefeated.push('scrap_tyrant');
    // Inputs to the mastery evaluator are fixtures, as opposed to Combat extraction tests above.
    Object.assign(run.d.progress.proofs, proofs);
    if (proofs.guardAbsorbed) run.d.stats.guardAbsorbed = proofs.guardAbsorbed;
    run.d.progress.acts = { 1: proofs, 2: proofs, 3: proofs };
    return settleRun(m, run, result);
  };
  finishWith('junk_toss', {});
  assert.deepEqual(m.progress.builds, []);
  finishWith('junk_toss', { churnPayoff: 3 });
  finishWith('hidden_ace', { reserveBattles: 5 });
  finishWith('hold_the_line', { guardAbsorbed: 200 }, 'victory');
  earned(m, 'build_explorer');
  earned(m, 'build_victory');
});

test('new abandonments do not farm Pressure Gauge, and bounded history retains settled identity', () => {
  const meta = defaultMeta();
  const first = start(9);
  settleRun(meta, first, 'abandoned');
  for (let i = 0; i < 34; i++) settleRun(meta, start(9), 'abandoned');
  assert.equal(meta.totalRuns, 35);
  assert.equal(meta.runs.length, 30);
  assert.equal(meta.progress.abandoned, 35);
  assert.equal(canStartWith(meta, 'pressure_gauge'), false);
  assert.equal(settleRun(meta, first, 'abandoned'), null, 'evicted run ID remains settled');
  for (let i = 1; i <= 3; i++) {
    settleRun(meta, start(9), 'defeat');
    assert.equal(canStartWith(meta, 'pressure_gauge'), i === 3);
  }
  earned(meta, 'finish_three');
  assert.equal(meta.progress.defeats, 3);
  assert.equal(meta.totalRuns, 38);
});

test('profile write failure leaves recoverable finalization, then interruption after a commit is exactly once', () => {
  const { save, data, fail } = memory();
  let run = start(90);
  let saved = save.checkpoint(run, save.loadMeta());
  assert.ok(saved.ok);
  let meta = saved.meta;
  run.d.bossesDefeated.push('scrap_tyrant');
  fail.write = META_KEY;
  assert.equal(save.finish(run, 'defeat', meta).ok, false);
  assert.equal(save.loadMeta().totalRuns, 0);
  assert.equal(save.loadRun().pending.finalize.result, 'defeat');
  const identity = save.loadRun().progress.id;
  run = Run.load(save.loadRun());
  fail.write = null;
  fail.clear = true;
  saved = save.finish(run, 'defeat', save.loadMeta());
  assert.equal(saved.ok, false);
  assert.equal(saved.meta.totalRuns, 1);
  assert.ok(data.has(RUN_KEY));
  assert.equal(save.loadMeta().bossesDefeated.scrap_tyrant, 1);
  fail.clear = false;
  saved = save.finish(Run.load(save.loadRun()), 'defeat', save.loadMeta());
  assert.ok(saved.ok);
  assert.equal(saved.summary.runId, identity);
  assert.equal(save.loadMeta().totalRuns, 1);
  assert.equal(save.loadRun(), null);
  const next = start(90);
  assert.ok(save.checkpoint(next, saved.meta).ok);
  assert.notEqual(next.d.progress.id, identity);
  assert.ok(save.finish(run, 'defeat', meta).ok, 'stale duplicate callback cannot clear a newer save');
  assert.equal(save.loadRun().progress.id, next.d.progress.id);
  assert.ok(save.finish(next, 'defeat', save.loadMeta()).ok);
  assert.equal(save.finish(run, 'defeat', meta).meta.totalRuns, 2, 'stale callback after clearing does not rewrite history');
});

test('run write failure does not advance metadata; saved encounter evidence replays a failed metadata write', () => {
  const { save, fail } = memory();
  const meta = defaultMeta();
  const run = start(71);
  fail.write = RUN_KEY;
  assert.equal(save.checkpoint(run, meta).ok, false);
  assert.equal(save.loadMeta().cardsSeen.length, 0);
  fail.write = META_KEY;
  addRunRecipe(run, 'straight_circuit');
  assert.equal(save.checkpoint(run, meta).ok, false);
  assert.equal(save.loadMeta().combos.straight_circuit, undefined);
  fail.write = null;
  assert.ok(save.checkpoint(Run.load(save.loadRun()), save.loadMeta()).ok);
  assert.equal(save.loadMeta().combos.straight_circuit.count, 1);
  assert.ok(save.checkpoint(Run.load(save.loadRun()), save.loadMeta()).ok);
  assert.equal(save.loadMeta().combos.straight_circuit.count, 1);
});

test('captured historical profiles and v6 run migrate idempotently without invented mastery or dates', () => {
  for (const name of ['meta-v1-phase5.json', 'meta-v2-phase8.json']) {
    const before = fixture(name);
    const after = normalizeMeta(before);
    assert.equal(after.version, 3);
    for (const k of Object.keys(before).filter((k) => k !== 'version')) assert.deepEqual(after[k], before[k], k);
    earned(after, 'act_one');
    assert.equal(after.progress.earned.act_one.at, null);
    assert.deepEqual(after.progress.builds, []);
    assert.equal(after.progress.earned.relay_pair, undefined);
    assert.deepEqual(normalizeMeta(saveCopy(after)), after);
  }
  const raw = fixture('save-v6-0.2.8-gameover.json');
  assert.equal(raw.version, 6);
  const r = Run.load(saveCopy(raw));
  assert.equal(r.d.version, 7);
  assert.deepEqual(r.d.deck, raw.deck);
  assert.deepEqual(r.d.pending, raw.pending);
  assert.deepEqual(r.d.progress.proofs, {});
  const old = normalizeMeta({ version: 2, totalRuns: 3, defeats: 3, runs: [{ result: 'abandoned' }] });
  assert.ok(canStartWith(old, 'pressure_gauge'));
  assert.equal(old.progress.defeats, 0);
  assert.equal(old.progress.unclassified, 2);
  assert.equal(old.progress.earned.finish_three, undefined);
});

test('partial corruption preserves known profile/settings data and safe unknown IDs', () => {
  const { save } = memory();
  assert.ok(save.saveSettings({ lang: 'ru', tactical: true, reducedMotion: true }));
  const damaged = normalizeMeta({ version: 3, totalRuns: -1, wins: 'bad',
    runs: [null, { result: 'victory', archetype: 'Guard & Counter' }], cardsSeen: ['scrapline', 'scrapline', 'future'],
    enemiesSeen: { rush_hound: 1, a: -5 }, combos: { future_recipe: { at: 2, count: 1 } },
    progress: { earned: { future_achievement: { at: 9 } }, active: { id: 2 }, abandoned: -1 } });
  assert.equal(damaged.wins, 1);
  assert.equal(damaged.totalRuns, 1);
  assert.deepEqual(damaged.cardsSeen, ['scrapline', 'future']);
  assert.ok(damaged.progress.earned.future_achievement);
  assert.ok(damaged.combos.future_recipe);
  assert.equal(damaged.runs[0].archetype, 'Guard & Counter');
  assert.deepEqual(normalizeMeta(saveCopy(damaged)), damaged);
  assert.deepEqual([save.loadSettings().lang, save.loadSettings().tactical, save.loadSettings().reducedMotion], ['ru', true, true]);
});

test('explicit rarity floor survives a build tag, Basic safeguard and nearest-tier fallback', () => {
  const run = start(78, 'spare_pockets');
  run.d.deck = Array.from({ length: 7 }, () => run.d.deck.find((c) => c.id === 'scrapfall'));
  for (let seed = 1; seed <= 40; seed++) {
    for (const [args, valid] of [[{ kind: 'boss' }, ['rare']], [{ minRarity: 'rare', tag: 'reserve' }, ['rare']],
      [{ minRarity: 'uncommon', tag: 'reserve' }, ['uncommon', 'rare']]]) {
      const offer = run.cardChoices(new RNG(seed), 3, args);
      assert.equal(offer.length, 3);
      assert.equal(CARDS[offer[0].id].category, 'basic');
      assert.ok(offer.every(({ id }) => valid.includes(CARDS[id].rarity)));
    }
    run.d.scrap = 80;
    run.d.pending = { type: 'event', nodeId: `merchant-${seed}`, eventId: 'recursive_merchant' };
    assert.ok(run.eventChoose(1).offer.every(({ id }) => CARDS[id].rarity !== 'common'));
  }
  const baseline = start(17);
  const reserve = start(17, 'spare_pockets');
  let defaultReserve = 0, wanted = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const a = baseline.cardChoices(new RNG(seed), 3);
    const b = reserve.cardChoices(new RNG(seed), 3);
    if (CARDS[a[0].id].tags.includes('reserve')) defaultReserve++;
    if (CARDS[b[0].id].tags.includes('reserve')) wanted++;
    assert.ok(!CARDS[b.at(-1).id].tags.includes('reserve'));
  }
  assert.ok(wanted > defaultReserve + 20, `${wanted} vs ${defaultReserve}`);
});

test('achievement catalogue has unique IDs, mechanically backed reward links and localized progress projections', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const { id, unlock } of STARTER_OPTIONS.filter((o) => o.unlock)) assert.equal(ACHIEVEMENTS.find((a) => a.id === unlock).reward, id);
});
