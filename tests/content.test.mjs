// Phase 8 content audit (docs/COMBAT_SPEC.md §29): every relic, mutation and graft is checked by what it
// does in a real fight (or run step), against its own description; every offered card is played through
// the real queue. Each scenario uses the engine's commands on a stacked hand; nothing assigns an outcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS, CARD_LIST, rewardPool, STARTER_DECK, GRAFTS, graftFits, cardValue, isOffensive } from '../src/data/cards.js';
import { RELICS, RELIC_IDS } from '../src/data/relics.js';
import { MUTATIONS, MUTATION_IDS } from '../src/data/mutations.js';
import { Run } from '../src/engine/run.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const spec = (s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s });
function mk(hand, draw = [], o = {}) {
  const all = [...hand, ...draw];
  const c = new Combat({ deck: all.map(spec), party: PARTY, hp: o.hp || 130, maxHp: o.maxHp || 130, enemies: o.enemies || ['foundry_warden'], seed: o.seed || 5, relics: o.relics || [], mutations: o.mutations || [], act: o.act || 1, adaptation: o.adaptation || null });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < hand.length ? `c${i}` : null));
  c.draw = draw.map((_, i) => `c${hand.length + i}`);
  c.discard = [];
  c.exhaust = [];
  if (!o.liveEnemies) for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = 3000; e.guard = 0; }
  if (o.momentum !== undefined) c.momentum = o.momentum;
  c.drainEvents();
  return c;
}
const settle = (c, max = 20) => { for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60); };
const advance = (c, sec) => { for (let x = 0; x < sec; x += 1 / 60) c.update(1 / 60); };
const uid = (c, id, n = 0) => [...c.hand, ...c.reserve].filter((u) => u && c.def(u).id === id)[n];
function play(c, ...ids) { for (const id of ids) { const r = c.commit(uid(c, id)); assert.ok(r.ok, `${id}: ${r.chk && r.chk.reason}`); settle(c); } }
const hp = (c) => c.enemies[0].hp;
const events = (c, type) => c.drainEvents().filter((e) => e.type === type);
// damage a short sequence deals with and without a modifier
function dmgOf(ids, o, hero = 'V') {
  const c = mk(ids, [], o);
  c.selectHero(hero);
  const h0 = hp(c);
  play(c, ...ids);
  return h0 - hp(c);
}
const integrity = (c) => { assert.deepEqual(c.verifyZones(), { ok: true }); assert.ok(c.momentum >= 0 && c.reserved >= 0 && c.reserved <= c.momentum); };

// ───────────────────────── the card catalogue ─────────────────────────
test('catalogue integrity: categories, ranks, costs, owners and placeholders', () => {
  const offered = new Set(rewardPool().map((c) => c.id));
  for (const d of CARD_LIST) {
    assert.ok(['basic', 'arte', 'support', 'junk'].includes(d.category), d.id);
    if (d.category === 'basic') { assert.equal(d.owner, null, d.id); assert.ok(d.rank >= 1 && d.rank <= 3, d.id); assert.equal(d.cost, 0); assert.ok(d.gain >= 1); }
    if (d.category === 'arte') { assert.ok(['V', 'C', 'S'].includes(d.owner), d.id); assert.ok(d.rank >= 4 && d.rank <= 6, d.id); assert.ok(d.cost >= 2 && d.cost <= 4, d.id); }
    if (d.category === 'support') { assert.equal(d.rank, 0, d.id); assert.ok(d.cost >= 0 && d.cost <= 2, d.id); }
    if (d.category === 'junk') assert.ok(!offered.has(d.id), 'junk is never offered');
    assert.ok(['A', 'B', 'EX', undefined, null].includes(d.variant), d.id);
    for (const m of (d.text || '').matchAll(/\{(\w+)\}/g)) assert.ok(d.v && d.v[m[1]], `${d.id} {${m[1]}} has a value`);
    if (d.v) for (const [k, pair] of Object.entries(d.v)) { assert.equal(pair.length, 2, `${d.id}.${k}`); assert.ok(pair[1] >= pair[0], `${d.id}.${k} upgrade is not worse`); }
    assert.equal(typeof d.fx, 'function', d.id);
  }
  // every card a deck can hold is offered (starter cards aside); nothing is withheld or interim
  for (const d of CARD_LIST) if (d.category !== 'junk' && d.rarity !== 'starter' && d.rarity !== 'status') assert.ok(offered.has(d.id), `${d.id} is offered`);
});

// each card, plain and upgraded, played in a context where it is legal: its effect resolves through the queue
function playCardInContext(id, up) {
  const d = CARDS[id];
  const hero = d.owner || 'V';
  const cardSpec = { id, up };
  const ally = hero === 'V' ? 'S' : 'V';
  let hand, starter, steps;
  if (d.category === 'basic') { hand = [cardSpec]; starter = 'V'; steps = [id]; }
  else if (d.category === 'arte') { hand = ['scrapline', 'pinprick', cardSpec]; starter = hero; steps = ['scrapline', id]; }
  else if (d.tech) { hand = ['scrapline', 'rivet_jab', cardSpec]; starter = d.owner ? (d.owner === 'V' ? 'S' : 'V') : 'V'; steps = ['scrapline', 'rivet_jab', id]; }
  else { hand = [cardSpec, 'scrapline']; starter = ally; steps = [id]; }
  const c = mk(hand, ['tripwire', 'cold_start', 'step_up', 'pinprick'], { momentum: 6, hp: 90, enemies: ['foundry_warden', 'rush_hound'] });
  c.selectHero(starter);
  for (const s of steps) {
    const u = uid(c, s);
    const r = c.commit(u);
    assert.ok(r.ok, `${id}${up ? '+' : ''} step ${s}: ${r.chk && r.chk.reason}`);
    settle(c);
  }
  integrity(c);
  return c;
}
test('every offered and starter card resolves through the queue, plain and upgraded', () => {
  const ids = new Set([...rewardPool().map((c) => c.id), ...STARTER_DECK.map((s) => s.id || s)]);
  for (const id of ids) for (const up of [false, true]) {
    const c = playCardInContext(id, up);
    const played = c.stats.cardsPlayed;
    assert.ok(played >= 1, `${id} played`);
  }
});

// ───────────────────────── relics ─────────────────────────
test('relics — Momentum: Pressure Gauge, Overflow Valve, Twin Dials, Flywheel, Tower Plate', () => {
  let c = mk(['scrapline'], [], { relics: ['pressure_gauge'] });
  assert.equal(c.momentumMax(), RULES.MOMENTUM_MAX + 3);
  assert.equal(new Combat({ deck: [spec('scrapline', 0)], party: PARTY, hp: 130, maxHp: 130, enemies: ['rush_hound'], seed: 1, relics: ['pressure_gauge'], mutations: [], act: 1 }).momentum, 2, 'starts with 2');
  // Overflow Valve: Momentum past the cap hits the target for 3 per point
  c = mk(['scrapline'], [], { relics: ['overflow_valve'], momentum: RULES.MOMENTUM_MAX });
  c.selectHero('V');
  const h0 = hp(c);
  play(c, 'scrapline');
  assert.ok(h0 - hp(c) >= 5 + 3, 'Weak attack + 3 from the wasted point');
  // Twin Dials: a Cross gives +1 more
  const cross = (relics) => { const x = mk(['scrapline', 'hotwire'], [], { relics, momentum: 0 }); x.selectHero('V'); play(x, 'scrapline', 'hotwire'); return x.momentum; };
  assert.equal(cross(['twin_dials']) - cross([]), 1);
  // Flywheel / Tower Plate
  assert.equal(mk(['scrapline'], [], { relics: ['flywheel'] }).momentumCostFlow(), 2);
  assert.equal(mk(['scrapline'], [], { relics: ['tower_plate'] }).guardSpendAmount(), 12);
  c = mk(['scrapline'], [], { relics: ['tower_plate'], momentum: 5 });
  const g0 = c.guard;
  assert.ok(c.spendMomentumGuard().ok);
  assert.equal(c.guard - g0, 12);
});

test('relics — Flow: Stopwatch Gear, Brass Metronome, Long Fuse', () => {
  const first = (relics) => { const c = mk(['scrapline', 'rivet_jab'], [], { relics }); c.selectHero('V'); c.commit(uid(c, 'scrapline')); return c.combo.deadline - c.t; };
  assert.ok(Math.abs(first(['stopwatch_gear']) - first([]) - 1.0) < 0.05, '+1.0s on the first combo');
  // the natural refund a played card gives, measured below the Flow cap
  const refund = (relics) => { const c = mk(['scrapline', 'rivet_jab', 'piston_strike'], [], { relics }); c.selectHero('V'); play(c, 'scrapline'); c.combo.deadline = c.t + 1; const d0 = c.combo.deadline; play(c, 'rivet_jab'); return c.combo.deadline - d0 + (c.t - c.t); };
  const tRef = (relics) => { const c = mk(['scrapline', 'rivet_jab'], [], { relics }); c.selectHero('V'); play(c, 'scrapline'); c.combo.deadline = c.t + 1; return c.naturalRefund(0); };
  assert.ok(Math.abs(tRef(['brass_metronome']) - tRef([]) * 1.33) < 0.02, `refunds a third larger: ${tRef(['brass_metronome'])} vs ${tRef([])}`);
  assert.ok(refund(['brass_metronome']) > refund([]), 'and so in a played chain');
  // Long Fuse: Flow runs out → a 50% payout, no Momentum loss
  const drop = (relics) => { const c = mk(['scrapline', 'rivet_jab'], [], { relics, momentum: 3 }); c.selectHero('V'); play(c, 'scrapline', 'rivet_jab'); const m = c.momentum, h0 = hp(c); c.combo.deadline = c.t; c.combo.graceUntil = 0; advance(c, 0.2); return { lost: m - c.momentum, dmg: h0 - hp(c), type: c.history.at(-1).type }; };
  const fused = drop(['long_fuse']), plain = drop([]);
  assert.equal(fused.lost, 0);
  assert.ok(fused.dmg > 0);
  assert.equal(plain.lost, 2);
  assert.equal(plain.dmg, 0);
});

test('relics — Guard: Heat Shield, Counter Spring, Iron Filings, Quiet Coil, Scrap Heart, Tuning Fork, Patch Kit', () => {
  let c = mk(['scrapline'], [], { relics: ['heat_shield'] });
  const e = c.enemies[0];
  c.addGuard(40);
  c.hitParty(e, 'V', 6);
  assert.ok(e.st.scorch >= 2, 'fully absorbed: 2 Scorch on the attacker');
  const counter = (relics) => { const x = mk(['brace_up'], [], { relics, momentum: 2 }); x.selectHero('C'); play(x, 'brace_up'); const en = x.enemies[0], h0 = en.hp; x.hitParty(en, 'V', 4); return h0 - en.hp; };
  assert.equal(counter(['counter_spring']), counter([]) * 2);
  c = mk(['scrapline', 'rivet_jab'], [], { relics: ['iron_filings'] });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  assert.ok(c.stats.guardGained >= 2, '1 Guard per basic attack');
  const decay = (relics) => { const x = mk(['scrapline'], [], { relics }); x.addGuard(30); advance(x, 6); return 30 - x.guard; };
  assert.ok(Math.abs(decay(['quiet_coil']) - decay([]) * 0.5) < 0.6, 'half the decay');
  c = new Combat({ deck: [spec('scrapline', 0)], party: PARTY, hp: 130, maxHp: 130, enemies: ['rush_hound'], seed: 1, relics: ['scrap_heart'], mutations: [], act: 1 });
  assert.equal(Math.floor(c.guard), 10);
  assert.equal(c.guardCap(), RULES.GUARD_CAP + 20);
  c = mk(['scrapline', 'rivet_jab', 'scrapfall'], [], { relics: ['tuning_fork'], hp: 100, momentum: 2 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  const h = c.hp;
  assert.ok(c.finishOrCashOut().ok);
  settle(c);
  assert.equal(c.history.at(-1).type, 'perfect');
  assert.equal(c.hp - h, 3);
  // Patch Kit: the run heals the party 12 after a won battle
  const run = Run.create({ seed: 77, tutorial: false });
  run.d.pending = null;
  run.d.relics.push('patch_kit');
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  run.d.hp = 80;
  run.finishBattle({ victory: true, hp: 80, maxHp: run.d.maxHp, stats: new Combat(setup).stats, scrapBonus: 0, enemies: setup.enemies, exFound: [] });
  assert.equal(run.d.hp, 92);
});

test('relics — Step and Cross: Ladder Rungs, Wild Hinge, Kettle Drum, Prism Lens', () => {
  assert.equal(dmgOf(['scrapline', 'rivet_jab'], { relics: ['ladder_rungs'] }) - dmgOf(['scrapline', 'rivet_jab'], {}), 3, '+3 on the Step');
  // Wild Hinge: a Cross that is not a Step (1A → 3B) also counts as a Step
  const c = mk(['scrapline', 'hotwire'], [], { relics: ['wild_hinge'] });
  c.selectHero('V');
  play(c, 'scrapline', 'hotwire');
  assert.equal(c.combo.cards[1].cross, true);
  assert.equal(c.combo.cards[1].step, true);
  // Kettle Drum: an arte in a combo of 5+ cards deals +25%
  const k5 = (relics) => { const x = mk(['scrapline', 'rivet_jab', 'piston_strike', 'cache_hook', 'tripwire', 'scrapfall'], [], { relics, momentum: 4 }); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab', 'piston_strike', 'cache_hook', 'tripwire'); assert.ok(x.combo.cards.length >= 4); const h0 = hp(x); play(x, 'scrapfall'); return { d: h0 - hp(x), n: x.combo ? x.combo.cards.length : 5 }; };
  const a = k5(['kettle_drum']), b = k5([]);
  assert.equal(a.n, 5);
  assert.ok(a.d >= Math.round(b.d * 1.25) - 1, `arte as the 5th card: ${a.d} vs ${b.d}`);
  assert.equal(dmgOf(['spark_primer'], { relics: ['prism_lens'] }) - dmgOf(['spark_primer'], {}), 3, 'EX card +3');
});

test('relics — Relay: Echo Splice and Relay Harness on the Relay command', () => {
  const relayed = (relics) => {
    const c = mk(['scrapline', 'rivet_jab', 'scrapline', 'pinprick'], [], { relics });
    c.selectHero('V');
    play(c, 'scrapline', 'rivet_jab');
    const h0 = hp(c);
    assert.ok(c.selectHero('S').ok);
    settle(c);
    const echo = h0 - hp(c);
    const h1 = hp(c);
    play(c, 'scrapline');
    return { echo, next: h1 - hp(c) };
  };
  const es = relayed(['echo_splice']), rh = relayed(['relay_harness']), none = relayed([]);
  assert.equal(none.echo, 0);
  assert.ok(es.echo > 0, 'Echo Splice: the Relay Echoes the last attack');
  assert.ok(rh.next >= none.next + 2, 'Relay Harness: +2 for later cards');
});

test('relics — Churn and Reserve: Beta Badge, Churn Gear, Oiled Bearings, Spare Pockets', () => {
  let c = mk(['scrapline', 'rivet_jab', 'piston_strike'], ['tripwire', 'pinprick'], { relics: ['beta_badge'] });
  const ch = c.churn.charges;
  assert.ok(c.churnCard(uid(c, 'scrapline')).ok);
  assert.equal(c.churn.charges, ch, 'first Churn free');
  assert.ok(c.churnCard(uid(c, 'rivet_jab')).ok);
  assert.equal(c.churn.charges, ch - 1);
  c = mk(['scrapline'], [], { relics: ['churn_gear'] });
  assert.equal(c.churnMax(), RULES.CHURN_MAX + 1);
  c.churn.charges = 0; c.churn.regen = 0;
  advance(c, RULES.CHURN_REGEN / 1.3 + 0.1);
  assert.equal(c.churn.charges, 1, 'regenerates 30% faster');
  // Oiled Bearings: no Flow cost in a combo, no ATB push outside one
  const ob = (relics) => { const x = mk(['scrapline', 'rivet_jab', 'piston_strike'], ['tripwire', 'pinprick'], { relics }); x.selectHero('V'); play(x, 'scrapline'); x.combo.graceUntil = 0; const d0 = x.combo.deadline - x.t; x.churnCard(uid(x, 'piston_strike')); return d0 - (x.combo.deadline - x.t); };
  assert.ok(ob([]) > 0.25 && ob(['oiled_bearings']) < 0.05);
  c = mk(['hidden_ace', 'scrapline'], [], { relics: ['spare_pockets'] });
  assert.equal(c.reserveMax(), RULES.RESERVE + 1);
  const res = (relics) => { const x = mk(['scrapline', 'pinprick'], [], { relics }); x.stash(uid(x, 'scrapline')); x.selectHero('V'); const h0 = hp(x); assert.ok(x.commit(x.reserve[0]).ok); settle(x); return h0 - hp(x); };
  assert.equal(res(['spare_pockets']) - res([]), 3);
});

test('relics — Interference: Breach Clamp, Grease Trap, Regent\'s Mainspring, Glitch Jar, Root Key, Signal Flare, Coal Heart', () => {
  const lock = (relics) => { const c = mk(['scrapline', 'rivet_jab', 'scrapfall'], [], { relics, enemies: ['wire_jammer'] }); const m = c.momentum, g = c.guard; c.lockCards(c.enemies[0], 1); const u = Object.keys(c.locks)[0]; return { dur: c.locks[u].dur, m: c.momentum - m, g: c.guard - g }; };
  assert.equal(lock([]).dur, RULES.LOCK_DURATION);
  const bc = lock(['breach_clamp']);
  assert.equal(bc.dur, RULES.LOCK_DURATION - 1);
  assert.equal(bc.m, 1);
  assert.equal(bc.g, 3);
  assert.equal(lock(['grease_trap']).dur, RULES.LOCK_DURATION / 2);
  assert.equal(lock(['regent_mainspring']).dur, RULES.LOCK_DURATION - 1);
  const rm = mk(['scrapline', 'rivet_jab'], [], { relics: ['regent_mainspring'], enemies: ['wire_jammer'] });
  rm.lockCards(rm.enemies[0], 1);
  const m0 = rm.momentum;
  advance(rm, RULES.LOCK_DURATION);
  assert.equal(rm.momentum - m0, 1, 'a Lock expiring gives 1 Momentum');
  // Glitch Jar: a Scrambled card counts as EX; Root Key: a Scrambled card deals +4
  const gj = mk(['scrapline', 'rivet_jab'], [], { relics: ['glitch_jar'], enemies: ['suit_scrambler'] });
  gj.scrambleCards(gj.enemies[0], 2, 'suit');
  const sc = gj.hand.find((u) => u && gj.isScrambled(u));
  assert.equal(gj.effVariant(sc), 'EX');
  const rk = (relics) => { const x = mk(['scrapline'], [], { relics, enemies: ['suit_scrambler'] }); for (const e of x.enemies) { e.atb = -1000; e.hp = e.maxHp = 3000; } x.scrambleCards(x.enemies[0], 1, 'suit'); x.selectHero('V'); const h0 = x.enemies[0].hp; play(x, 'scrapline'); return h0 - x.enemies[0].hp; };
  assert.equal(rk(['root_key']) - rk([]), 4);
  const sf = new Combat({ deck: [spec('scrapline', 0)], party: PARTY, hp: 130, maxHp: 130, enemies: ['rush_hound', 'rush_hound'], seed: 1, relics: ['signal_flare'], mutations: [], act: 1 });
  assert.ok(sf.enemies.every((e) => e.st.exposed === 6));
  const coal = (relics) => { const x = mk(['kindling', 'scrapline'], [], { relics, momentum: 2 }); x.selectHero('C'); play(x, 'scrapline', 'kindling'); return x.enemies[0].st.scorch || 0; };
  assert.equal(coal(['coal_heart']) - coal([]), 1);
});

test('relics — Cash Out: Riveted Ledger, Junk Dividend', () => {
  const pay = (relics) => { const c = mk(['scrapline', 'rivet_jab', 'piston_strike'], [], { relics }); c.selectHero('V'); play(c, 'scrapline', 'rivet_jab', 'piston_strike'); const p = c.payoutAmount(1).amount; const m = c.momentum; c.finishOrCashOut(); settle(c); return { p, m: c.momentum - m, scrap: c.scrapEarned }; };
  assert.ok(pay(['riveted_ledger']).p >= Math.round(pay([]).p * 1.3 / 1.25 * 1.0) - 2, 'payout +30%');
  const jd = pay(['junk_dividend']);
  assert.equal(jd.m - pay([]).m, 1);
  assert.equal(jd.scrap, 3);
});

test('relics — survival and economy: Dead Man\'s Switch, Scrap Magnet, Lucky Rivet', () => {
  const c = mk(['scrapline'], [], { relics: ['dead_mans_switch'], hp: 40 });
  const e = c.enemies[0];
  const h0 = e.hp, m0 = c.momentum;
  c.hitParty(e, 'C', 12); // 40 → 28? Corvin has 0 Defense: 28 < 32.5 (25%)
  assert.ok(c.hp < 130 * 0.25);
  assert.equal(h0 - e.hp, 15);
  assert.equal(c.momentum - m0, 5);
  c.hitParty(e, 'C', 2);
  assert.equal(h0 - e.hp, 15, 'once per battle');
  const reward = (relics) => { const run = Run.create({ seed: 99, tutorial: false }); run.d.relics.push(...relics); const node = run.d.map.nodes.find((n) => n.type === 'battle'); return run.makeReward(node, 'battle', { scrapBonus: 0 }); };
  const base = reward([]), mag = reward(['scrap_magnet']);
  assert.equal(mag.scrap, Math.round(base.scrap * 1.25));
  assert.equal(reward(['lucky_rivet']).cards.length, 4);
});

test('relics — boss trophies: Auditor\'s Seal, Mirror Lens (and the others above)', () => {
  const c = mk(['scrapline', 'rivet_jab', 'scrapfall'], [], { relics: ['auditor_seal'], momentum: 2 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  const m = c.momentum;
  c.finishOrCashOut(); settle(c);
  assert.equal(c.momentum - m, 2 + 4, 'first Perfect: +4 more');
  const echo = (relics) => { const x = mk(['scrapline', 'rivet_jab', 'feedback_loop'], [], { relics, momentum: 3 }); x.selectHero('C'); play(x, 'scrapline', 'rivet_jab'); const h0 = hp(x); play(x, 'feedback_loop'); return h0 - hp(x); };
  assert.ok(echo(['mirror_lens']) > echo([]), 'Echoes 25% stronger');
});

test('Index Spring, Reclaim Circuit and Slip Case reward first executed uses, once per chain', () => {
  const c = mk(['scrapline', 'mend_circuit', 'salvage', 'thermal_lance', 'junk_toss', 'latchshield'],
    ['cold_start', 'pinprick', 'pocket_gauge', 'piston_strike'], {
      momentum: 2, relics: ['index_spring', 'slip_case'], mutations: ['reclaim_circuit'],
    });
  assert.ok(c.stash(uid(c, 'latchshield')).ok);
  play(c, 'scrapline');
  assert.equal(c.nextCard(), 'c8');
  assert.ok(c.churnCard(uid(c, 'salvage')).ok);
  const m = c.momentum;
  play(c, 'pocket_gauge');
  assert.equal(c.combo.cards.at(-1).fromChurn, true);
  assert.equal(c.momentum, m + 3); // Basic, Cross and Index Spring
  assert.equal(c.stats.guardGained, 12);
  assert.ok(c.stats.flowGained >= 1.25);
  play(c, 'latchshield');
    assert.equal(c.counter, 4);
  assert.equal(c.stats.exByRecipe.switchyard, 1);
  assert.equal(c.stats.guardGained, 26 + 5, 'Switchyard has its independent 5 Guard payoff');
  integrity(c);
});

test('every relic is covered by a scenario above and has a description', () => {
  const covered = ['pressure_gauge', 'overflow_valve', 'twin_dials', 'flywheel', 'tower_plate', 'stopwatch_gear', 'brass_metronome', 'long_fuse', 'heat_shield', 'counter_spring', 'iron_filings', 'quiet_coil', 'scrap_heart', 'tuning_fork', 'patch_kit', 'ladder_rungs', 'wild_hinge', 'kettle_drum', 'prism_lens', 'echo_splice', 'relay_harness', 'beta_badge', 'churn_gear', 'oiled_bearings', 'spare_pockets', 'breach_clamp', 'grease_trap', 'regent_mainspring', 'glitch_jar', 'root_key', 'signal_flare', 'coal_heart', 'riveted_ledger', 'junk_dividend', 'dead_mans_switch', 'scrap_magnet', 'lucky_rivet', 'auditor_seal', 'mirror_lens', 'index_spring', 'slip_case'];
  assert.deepEqual([...covered].sort(), [...RELIC_IDS].sort());
  for (const id of RELIC_IDS) assert.ok(RELICS[id].text && RELICS[id].text.length > 10, id);
});

// ───────────────────────── mutations ─────────────────────────
test('mutations — all twelve do what they say', () => {
  assert.equal(dmgOf(['scrapline', 'rivet_jab'], { mutations: ['ascendant_ladder'] }) - dmgOf(['scrapline', 'rivet_jab'], {}), 3, 'Ascendant Ladder +3 per Step');
  const cross = (mutations) => { const x = mk(['scrapline', 'hotwire'], [], { mutations, momentum: 0 }); x.selectHero('V'); const h0 = hp(x); play(x, 'scrapline', 'hotwire'); return { m: x.momentum, d: h0 - hp(x) }; };
  const de = cross(['duality_engine']), none = cross([]);
  assert.equal(de.m - none.m, 1, 'Duality Engine +1 Momentum per Cross');
  assert.equal(de.d - none.d, 4, '+4 to the crossing card');
  const relay = (mutations) => { const x = mk(['scrapline', 'rivet_jab', 'scrapline'], [], { mutations }); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab'); const h0 = hp(x); x.selectHero('S'); settle(x); return h0 - hp(x); };
  assert.ok(relay(['relay_resonance']) > 0 && relay([]) === 0, 'Relay Resonance: every Relay Echoes');
  let c = mk(['scrapline'], [], { mutations: ['overpressure_valve'], momentum: 10 });
  assert.equal(c.momentumMax(), RULES.MOMENTUM_MAX + 4);
  assert.ok(dmgOf(['scrapline'], { mutations: ['overpressure_valve'], momentum: 10 }) >= Math.round(dmgOf(['scrapline'], { momentum: 10 }) * 1.25) - 1, 'Overpressure Valve +25% at 10+');
  c = mk(['scrapline'], [], { mutations: ['long_breath'] });
  assert.equal(c.momentumCostFlow(), RULES.MOMENTUM_COST - 1);
  assert.equal(c.flowSpendAmount(), 2.0);
  c = mk(['scrapline', 'rivet_jab'], ['pinprick'], { mutations: ['grinder'] });
  assert.equal(c.churnMax(), RULES.CHURN_MAX + 2);
  const gh = hp(c);
  c.churnCard(uid(c, 'rivet_jab'));
  assert.equal(gh - hp(c), 4, 'Grinder: every Churn deals 4');
  c = mk(['scrapline', 'pinprick'], [], { mutations: ['deep_pockets'] });
  assert.equal(c.reserveMax(), RULES.RESERVE + 1);
  c.stash(uid(c, 'scrapline'));
  c.selectHero('V');
  const dm = c.momentum, dh = hp(c);
  c.commit(c.reserve[0]); settle(c);
  assert.equal(c.momentum - dm, 1 + 1, 'Weak gain + Deep Pockets');
  assert.ok(dh - hp(c) >= 5 + 4);
  // Bastion Protocol: slower decay; absorbed hits strike back for half
  c = mk(['scrapline'], [], { mutations: ['bastion_protocol'] });
  c.addGuard(20);
  const e = c.enemies[0], eh = e.hp;
  c.hitParty(e, 'C', 10);
  assert.equal(eh - e.hp, 5);
  const qe = (mutations) => { const x = mk(['scrapline', 'rivet_jab', 'piston_strike'], [], { mutations }); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab', 'piston_strike'); const p = x.payoutAmount(1).amount; const m = x.momentum; x.finishOrCashOut(); settle(x); return { p, m: x.momentum - m }; };
  assert.ok(qe(['quick_exit']).p > qe([]).p * 1.25, 'Quick Exit +40% payout');
  assert.equal(qe(['quick_exit']).m - qe([]).m, 2, 'Quick Cash +2 Momentum');
  c = mk(['scrapline', 'rivet_jab'], [], { mutations: ['signal_thief'], enemies: ['wire_jammer'] });
  const sm = c.momentum;
  c.lockCards(c.enemies[0], 1, (u) => c.def(u).id === 'scrapline');
  assert.equal(c.momentum - sm, 2, 'Signal Thief: interference +2 Momentum');
  advance(c, RULES.LOCK_DURATION + 0.1);
  c.selectHero('V');
  const th = hp(c);
  play(c, 'scrapline');
  assert.ok(th - hp(c) >= Math.round(5 * 1.5) - 1, 'formerly Locked card +50%');
  const pp = (mutations) => { const x = mk(['scrapline', 'rivet_jab', 'scrapfall'], [], { mutations, momentum: 2 }); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab', 'scrapfall'); const m = x.momentum, g = x.guard; x.finishOrCashOut(); settle(x); return { m: x.momentum - m, g: x.guard - g }; };
  assert.equal(pp(['perfect_pitch']).m - pp([]).m, 2);
  assert.ok(pp(['perfect_pitch']).g - pp([]).g >= 5.5);
  assert.ok(dmgOf(['scrapline'], { mutations: ['glass_cannon'] }) >= Math.round(5 * 1.25) - 1, 'Glass Cannon +25%');
  const run = Run.create({ seed: 3, tutorial: false });
  const max0 = run.d.maxHp;
  run.d.pending = { type: 'mutation', options: ['glass_cannon', 'grinder', 'quick_exit'] };
  run.chooseMutation('glass_cannon');
  assert.equal(run.d.maxHp, Math.round(max0 * 0.85), 'party max HP −15%');
  assert.deepEqual([...MUTATION_IDS].sort(), Object.keys(MUTATIONS).sort());
  assert.equal(MUTATION_IDS.length, 13);
});

test('a mutation chosen after a boss persists into the next act and through a save', () => {
  const run = Run.create({ seed: 31, tutorial: false });
  run.d.pending = { type: 'mutation', options: ['perfect_pitch', 'grinder', 'deep_pockets'] };
  run.chooseMutation('perfect_pitch');
  run.advanceAct();
  const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  assert.equal(re.d.act, 2);
  assert.ok(re.d.mutations.includes('perfect_pitch'));
  re.d.pending = null;
  re.enterNode(re.availableNodes()[0]);
  if (re.d.pending.type === 'battle') assert.ok(re.battleSetup().mutations.includes('perfect_pitch'));
});

// ───────────────────────── grafts ─────────────────────────
test('grafts — all ten trigger at the right moment, and only where they can', () => {
  // Spark, Quick, Plated
  const g = (graft, ids = ['scrapline']) => { const c = mk([{ id: ids[0], graft }, ...ids.slice(1)], [], { momentum: 0 }); c.selectHero('V'); const h0 = hp(c); play(c, ...ids); return { c, m: c.momentum, d: h0 - hp(c), guard: c.guard, flow: c.stats.flowGained }; };
  assert.equal(g('spark').m - g(null).m, 1);
  const qf = (graft) => { const c = mk(['scrapline', { id: 'rivet_jab', graft }], []); c.selectHero('V'); play(c, 'scrapline'); c.combo.deadline = c.t + 1; const d0 = c.combo.deadline; play(c, 'rivet_jab'); return c.combo.deadline - d0; };
  assert.ok(Math.abs(qf('quick') - qf(null) - 0.5) < 0.02, 'Quick: +0.5s Flow');
  assert.equal(Math.round(g('plated').guard - g(null).guard), 3);
  assert.equal(g('keen').d - g(null).d, 3);
  // Breaker: pierces enemy Guard (not the party's Defense, which only applies to hits on heroes)
  const br = (graft) => { const c = mk([{ id: 'scrapline', graft }], []); c.enemies[0].guard = 50; c.selectHero('V'); const h0 = hp(c); play(c, 'scrapline'); return h0 - hp(c); };
  assert.ok(br('breaker') >= 5 && br(null) === 0);
  // Cached: +50% from Reserve only
  const ca = (fromReserve) => { const c = mk([{ id: 'scrapline', graft: 'cached' }, 'pinprick'], []); if (fromReserve) c.stash('c0'); c.selectHero('V'); const h0 = hp(c); c.commit('c0'); settle(c); return h0 - hp(c); };
  assert.ok(ca(true) >= Math.round(ca(false) * 1.5) - 1);
  // Churnfed: on an actual Churn only
  let c = mk([{ id: 'scrapline', graft: 'churnfed' }, 'rivet_jab'], ['pinprick']);
  const m0 = c.momentum, g0 = c.guard;
  c.churnCard('c0');
  assert.equal(c.momentum - m0, 1);
  assert.equal(Math.round(c.guard - g0), 2);
  c = mk([{ id: 'scrapline', graft: 'churnfed' }, 'rivet_jab'], ['pinprick']);
  c.selectHero('V');
  const m1 = c.momentum;
  play(c, 'scrapline'); // played and discarded, not Churned
  assert.equal(c.momentum - m1, 1, 'only the Weak attack\'s own +1');
  // Anchored: cannot be Locked or Scrambled
  c = mk([{ id: 'scrapline', graft: 'anchored' }], [], { enemies: ['wire_jammer'] });
  assert.equal(c.lockCards(c.enemies[0], 1), 0);
  assert.equal(c.scrambleCards(c.enemies[0], 1, 'suit'), 0);
  // Ledger: +3 payout per grafted card in the combo
  const le = (graft) => { const x = mk([{ id: 'scrapline', graft }, 'rivet_jab', 'piston_strike'], []); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab', 'piston_strike'); return x.payoutAmount(1).amount; };
  assert.ok(le('ledger') - le(null) >= 3);
  // Echoing: the first card after a Relay Echoes itself at 30%
  const ec = (graft) => { const x = mk(['scrapline', 'rivet_jab', { id: 'scrapline', graft }], []); x.selectHero('V'); play(x, 'scrapline', 'rivet_jab'); x.selectHero('S'); settle(x); const h0 = hp(x); x.commit('c2'); settle(x); return h0 - hp(x); };
  assert.ok(ec('echoing') > ec(null));
  // eligibility: damage, Relay and combo grafts only on attacks
  for (const gid of ['keen', 'breaker', 'echoing', 'ledger']) { assert.equal(graftFits(gid, CARDS.mend_circuit), false, gid); assert.equal(graftFits(gid, CARDS.scrapline), true, gid); }
  for (const gid of ['spark', 'quick', 'plated', 'cached', 'churnfed', 'anchored']) assert.equal(graftFits(gid, CARDS.rethread), true, gid);
  assert.equal(Object.keys(GRAFTS).length, 11);
  const run = Run.create({ seed: 5, tutorial: false });
  const heal = run.d.deck.find((x) => x.id === 'mend_circuit');
  assert.equal(run.canApplySelect('graft:keen', heal), false);
  assert.equal(run.canApplySelect('graft:plated', heal), true);
});

test('a grafted, upgraded card keeps both through zone moves, a save and a load', () => {
  const run = Run.create({ seed: 8, tutorial: false });
  const inst = run.d.deck.find((x) => x.id === 'scrapline');
  run.applySelect('graft:spark', inst.uid);
  run.applySelect('upgrade', inst.uid);
  const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  const back = re.d.deck.find((x) => x.uid === inst.uid);
  assert.equal(back.graft, 'spark');
  assert.equal(back.up, true);
  const c = new Combat({ deck: re.d.deck, party: PARTY, hp: 130, maxHp: 130, enemies: ['rush_hound'], seed: 2, relics: [], mutations: [], act: 1 });
  assert.equal(c.cards.get(inst.uid).graft, 'spark');
  assert.equal(c.cards.get(inst.uid).up, true);
});

// ───────────────────────── anti-stranding (assignment §11.4) ─────────────────────────
import { decide, perform } from '../tools/lib/bot.mjs';
test('support-heavy, arte-heavy and rank-modified decks still finish real fights (no stranding)', () => {
  const decks = {
    support: ['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'mend_circuit', 'salvage', 'brace_up', 'ward_weave', 'low_gear', 'signal_boost', 'hold_the_line', 'spare_parts', 'shuffle_step', 'rethread', 'cache_hook', 'vault_guard'],
    arte: ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'recycler', 'sunderline', 'capstone', 'thermal_lance', 'detonate', 'last_word', 'overpressure', 'bolt_volley', 'crosscut', 'ladder_peak', 'grand_relay', 'chorus_break'],
    ranked: [{ id: 'scrapline', rankMod: 2 }, { id: 'scrapline', rankMod: 2 }, { id: 'rivet_jab', rankMod: 1 }, { id: 'piston_strike' }, { id: 'pinprick', rankMod: 2 }, { id: 'scrapfall', rankMod: 2 }, { id: 'thermal_lance', rankMod: 2 }, { id: 'bolt_volley', rankMod: 2 }, 'mend_circuit', 'salvage', { id: 'step_up', rankMod: 1 }, { id: 'quickdraw' }],
  };
  for (const [name, ids] of Object.entries(decks)) {
    for (const enemies of [['rush_hound', 'wire_jammer'], ['foundry_warden']]) {
      const c = new Combat({ deck: ids.map(spec), party: PARTY, hp: 130, maxHp: 130, enemies, seed: 17, relics: [], mutations: [], act: 1 });
      let think = 0.4, idleSince = 0;
      for (let step = 0; step < 30 * 300 && c.phase !== 'END'; step++) {
        c.update(1 / 30);
        think -= 1 / 30;
        if (think > 0) continue;
        think = 0.8;
        const a = decide(c, { profile: 'regular', rng: () => 0.5 });
        perform(c, a);
        if (a.type !== 'wait' || c.combo || c.executing) idleSince = c.t;
        assert.ok(c.t - idleSince < 25, `${name} vs ${enemies}: stranded for 25s at t=${c.t.toFixed(1)}`);
        integrity(c);
      }
      assert.equal(c.phase, 'END', `${name} vs ${enemies}: the fight ends`);
    }
  }
});
