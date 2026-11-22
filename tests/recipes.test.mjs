// Phase 7 EX Combos (docs/COMBAT_SPEC.md §12.4, §28). Every recipe is assembled by legal engine actions —
// commit, Relay, support, Churn, Reserve, +FLOW, FINISH / CASH OUT — on a stacked hand; nothing writes
// the chain history directly. Each test checks when the recipe triggers (on the command that completes
// it, not before), what its effect actually changed, and the cases that must not trigger it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { RECIPES, RECIPE_MAP, RECIPE_IDS, normalizeCombos, knownDiscoveries } from '../src/data/recipes.js';
import { CARDS, rewardPool, STARTER_DECK } from '../src/data/cards.js';
import { normalizeMeta, recordCombo, defaultMeta, Save } from '../src/engine/save.js';
import { Run } from '../src/engine/run.js';
import { RNG } from '../src/core/rng.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const spec = (s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s });
// hand slots then draw pile; enemies held back and given plenty of HP unless told otherwise
function fixed(hand, draw = [], o = {}) {
  const all = [...hand, ...draw];
  const c = new Combat({ deck: all.map(spec), party: PARTY, hp: o.hp || 130, maxHp: 130, enemies: o.enemies || ['foundry_warden'], seed: 5, relics: o.relics || [], mutations: [], act: 1 });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < hand.length ? `c${i}` : null));
  c.draw = draw.map((_, i) => `c${hand.length + i}`);
  c.discard = [];
  c.exhaust = [];
  for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = o.enemyHp || 3000; e.guard = 0; }
  c.momentum = o.momentum || 0;
  c.drainEvents();
  c.ex = []; // EX events seen, in order
  return c;
}
const settle = (c, max = 20) => { for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60); collect(c); };
const advance = (c, sec) => { for (let x = 0; x < sec; x += 1 / 60) c.update(1 / 60); collect(c); };
function collect(c) { for (const ev of c.drainEvents()) if (ev.type === 'exCombo') c.ex.push(ev); }
const uid = (c, id, n = 0) => { const list = [...c.hand, ...c.reserve].filter((u) => u && c.def(u).id === id); return list[n]; };
// play cards (ids, in order), each settled before the next unless `queued`
function play(c, ...ids) {
  for (const id of ids) {
    const u = uid(c, id);
    assert.ok(u, `${id} in hand or Reserve`);
    const r = c.commit(u);
    assert.ok(r.ok, `${id} is legal (${r.chk && r.chk.reason})`);
    settle(c);
  }
}
const relay = (c, to) => { const r = c.selectHero(to); assert.ok(r.ok && r.cmd, `Relay to ${to}`); settle(c); };
const exIds = (c) => c.ex.map((e) => e.id);
const integrity = (c) => { assert.deepEqual(c.verifyZones(), { ok: true }); assert.ok(c.momentum >= 0 && c.reserved >= 0 && c.reserved <= c.momentum); };

// ── the catalogue ──
test('the catalogue: 15 recipes with stable unique ids, explicit priorities, texts, tags and a sequence', () => {
  assert.equal(RECIPES.length, 15);
  assert.equal(new Set(RECIPE_IDS).size, RECIPES.length);
  const prios = RECIPES.map((r) => r.priority);
  assert.deepEqual(prios, [...prios].sort((a, b) => a - b), 'sorted by priority');
  assert.equal(new Set(prios).size, prios.length, 'no two recipes share a priority (the order is total)');
  const arch = new Set();
  for (const r of RECIPES) {
    for (const f of ['name', 'how', 'effect', 'hint', 'purpose']) assert.ok(typeof r[f] === 'string' && r[f].length > 3, `${r.id}.${f}`);
    assert.ok(['accessible', 'intermediate', 'advanced'].includes(r.tier));
    assert.ok(['card', 'end'].includes(r.on));
    assert.ok(Array.isArray(r.seq) && r.seq.length >= 2);
    r.tags.forEach((t) => arch.add(t));
  }
  assert.deepEqual([...arch].sort(), ['cashout', 'churn', 'flow', 'guard', 'interference', 'ladder', 'momentum', 'relay', 'reserve', 'variant'], 'all ten build archetypes have at least one recipe');
  assert.ok(RECIPES.filter((r) => r.tier === 'accessible').length >= 4);
});

// ── each recipe through legal play ──
test('Straight Circuit: Weak, Medium, Strong, then an arte by one hero — on the arte, not before', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'thermal_lance', 'bolt_volley']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  assert.deepEqual(exIds(c), [], 'nothing before the arte');
  const hp = c.enemies[0].hp, m = c.momentum;
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit']);
  const ev = c.ex[0];
  assert.equal(ev.applied, true);
  assert.ok(ev.sum.dmg >= 5, 'a strike for 30% of the combo damage (at least 5)');
  assert.equal(ev.sum.momentum, 1);
  assert.equal(c.momentum, m - 2 + 1, 'arte cost 2, +1 Momentum');
  assert.ok(hp - c.enemies[0].hp >= ev.sum.dmg);
  integrity(c);
});

test('Straight Circuit does not trigger on a wrong order, a missing Strong, or an arte by the next hero', () => {
  // W, M, arte (no Strong)
  let c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'piston_strike']);
  c.selectHero('V'); play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  assert.ok(!exIds(c).includes('straight_circuit'));
  // M, S, arte (the segment does not open with a Weak)
  c = fixed(['rivet_jab', 'piston_strike', 'scrapfall'], [], { momentum: 0 });
  c.selectHero('V'); play(c, 'rivet_jab', 'piston_strike', 'scrapfall');
  assert.ok(!exIds(c).includes('straight_circuit'));
  // W, M, S by Hessa, Relay, then Pin's basic and arte: the arte is in another hero's part
  c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'bolt_volley', 'scrapline'], ['rivet_jab']);
  c.selectHero('V'); play(c, 'scrapline', 'rivet_jab', 'piston_strike'); relay(c, 'S'); play(c, 'scrapline', 'bolt_volley');
  assert.ok(!exIds(c).includes('straight_circuit'));
  // a Strong that cannot follow is illegal (ranks ascend): the engine refuses it, nothing triggers
  c = fixed(['scrapline', 'piston_strike', 'rivet_jab', 'scrapfall']);
  c.selectHero('V'); play(c, 'scrapline', 'piston_strike');
  assert.equal(c.commit(uid(c, 'rivet_jab')).ok, false, 'Medium after Strong is not legal');
});

test('Salvage Circuit: Churn mid-combo, play the card it brought in, land an arte; other Churns do not count', () => {
  // the Churn brings in the arte itself
  let c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'thermal_lance', 'mend_circuit', 'bolt_volley'], ['pinprick', 'scrapfall', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline'); // its slot draws Pinprick
  assert.ok(c.churnCard(uid(c, 'mend_circuit')).ok, 'Churn mid-combo');
  assert.equal(c.def(c.hand[4]).id, 'scrapfall', 'the Churn drew Hessa\'s arte into the slot');
  play(c, 'rivet_jab');
  assert.deepEqual(exIds(c), []);
  const ch = c.churn.charges;
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['salvage_circuit']);
  assert.equal(c.ex[0].sum.churn, Math.min(1, c.churnMax() - ch));
  assert.equal(c.ex[0].sum.momentum, 1);
  // the Churn brings in a basic attack, which is played before the arte
  c = fixed(['scrapline', 'piston_strike', 'scrapfall', 'thermal_lance', 'mend_circuit', 'bolt_volley'], ['pinprick', 'rivet_jab', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline');
  c.churnCard(uid(c, 'mend_circuit'));
  play(c, 'rivet_jab', 'scrapfall');
  assert.deepEqual(exIds(c), ['salvage_circuit']);
  // the card it brought in is not played: nothing
  c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'thermal_lance', 'mend_circuit', 'piston_strike'], ['pinprick', 'tripwire', 'cold_start']);
  c.selectHero('V');
  play(c, 'scrapline');
  c.churnCard(uid(c, 'mend_circuit'));
  play(c, 'rivet_jab', 'scrapfall');
  assert.ok(!exIds(c).includes('salvage_circuit'), 'Tripwire came in and stayed in the hand');
  // a Churn before the combo: nothing, even if its card is played
  c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'thermal_lance', 'mend_circuit', 'bolt_volley'], ['scrapfall', 'pinprick']);
  assert.ok(c.churnCard(uid(c, 'mend_circuit')).ok, 'Churn before the combo');
  c.selectHero('V'); play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  assert.ok(!exIds(c).includes('salvage_circuit'));
});

test('Stored Strike: a basic attack from Reserve opens the way to an arte in the same part', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'thermal_lance', 'bolt_volley', 'mend_circuit'], ['pinprick']);
  assert.ok(c.stash(uid(c, 'scrapline')).ok);
  c.selectHero('V');
  const r = c.commit(c.reserve[0]);
  assert.ok(r.ok); settle(c);
  play(c, 'rivet_jab');
  assert.deepEqual(exIds(c), []);
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['stored_strike']);
  integrity(c);
  // the same chain without the Reserve card: no trigger
  const d = fixed(['scrapline', 'rivet_jab', 'scrapfall']);
  d.selectHero('V'); play(d, 'scrapline', 'rivet_jab', 'scrapfall');
  assert.ok(!exIds(d).includes('stored_strike'));
});

test('High Climb: three Steps ending with a rank-5 arte; ending at rank 4 is not enough', () => {
  const c = fixed(['rivet_jab', 'piston_strike', 'scrapfall', 'recycler', 'thermal_lance'], [], { momentum: 2 });
  c.selectHero('V');
  play(c, 'rivet_jab', 'piston_strike', 'scrapfall');
  assert.ok(!exIds(c).includes('high_climb'), 'three Steps but only rank 4 so far');
  play(c, 'recycler');
  assert.ok(exIds(c).includes('high_climb'));
  const ev = c.ex.find((e) => e.id === 'high_climb');
  assert.equal(ev.sum.exposed, 5);
  assert.ok(c.enemies[0].st.exposed > 3.5, 'Exposed for 5s (it has been ticking since the impact)');
  assert.equal(ev.sum.momentum, 2);
});

test('Second Wind: +FLOW during the combo, then 6 cards; without the Flow extension nothing', () => {
  const hand = ['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'rivet_jab', 'mend_circuit'];
  const c = fixed(hand, ['pinprick', 'tripwire'], { momentum: 3 });
  c.selectHero('V');
  play(c, 'scrapline');
  assert.ok(c.spendMomentumFlow().ok, '+FLOW bought');
  play(c, 'rivet_jab', 'piston_strike');
  relay(c, 'C');
  play(c, 'scrapline', 'rivet_jab');
  assert.deepEqual(exIds(c), [], 'five cards');
  const g = c.guard;
  play(c, 'tripwire');
  assert.deepEqual(exIds(c), ['second_wind'], 'on the sixth card');
  assert.ok(c.guard >= g + 5);
  assert.ok(c.ex[0].sum.flow > 0 && c.ex[0].sum.flow <= 1.5);
  const d = fixed(hand, ['pinprick', 'tripwire']);
  d.selectHero('V'); play(d, 'scrapline', 'rivet_jab', 'piston_strike'); relay(d, 'C'); play(d, 'scrapline', 'rivet_jab', 'tripwire');
  assert.ok(!exIds(d).includes('second_wind'));
});

test('Prism Sequence (with Cross Current on the same arte): suits EX, B and A, then the arte', () => {
  const c = fixed(['spark_primer', 'hotwire', 'piston_strike', 'scrapfall']);
  c.selectHero('V');
  play(c, 'spark_primer', 'hotwire', 'piston_strike', 'scrapfall');
  // EX r1, B r2, A r3 is also a W-M-S ladder: three recipes complete on the one arte, in priority order
  assert.deepEqual(exIds(c), ['straight_circuit', 'prism_sequence', 'cross_current']);
  assert.equal(new Set(c.ex.map((e) => e.group)).size, 1, 'one group: shown together');
  assert.deepEqual(c.ex.map((e) => e.order), [0, 1, 2]);
  assert.ok(c.ex[1].sum.dmg >= 6, '3 damage per Cross to every enemy (2 Crosses)');
  // two suits only: no Prism
  const d = fixed(['scrapline', 'hotwire', 'piston_strike', 'scrapfall']);
  d.selectHero('V'); play(d, 'scrapline', 'hotwire', 'piston_strike', 'scrapfall');
  assert.ok(!exIds(d).includes('prism_sequence'));
});

test('Cross Current: two suit changes in one part, then the arte; one change is not enough', () => {
  const c = fixed(['scrapline', 'hotwire', 'scrapfall', 'rivet_jab']);
  c.selectHero('V');
  play(c, 'scrapline', 'hotwire', 'scrapfall');
  assert.deepEqual(exIds(c), ['cross_current']);
  const d = fixed(['scrapline', 'hotwire', 'bolt_volley']);
  d.selectHero('S'); play(d, 'scrapline', 'hotwire', 'bolt_volley');
  assert.deepEqual(exIds(d), [], 'A→B, then B: one Cross');
});

test('Pressure Release: 8 Momentum spent on artes in one combo, on the arte that reaches it', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'recycler', 'sunderline'], [], { momentum: 7 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall', 'recycler');
  assert.ok(!exIds(c).includes('pressure_release'), '2 + 3 = 5 spent');
  const g = Math.floor(c.guard);
  play(c, 'sunderline');
  assert.ok(exIds(c).includes('pressure_release'), '2 + 3 + 4 = 9');
  const ev = c.ex.find((e) => e.id === 'pressure_release');
  assert.equal(ev.sum.guard, 8);
  assert.equal(ev.sum.momentum, 2);
  assert.ok(Math.floor(c.guard) >= g + 8);
  integrity(c);
});

test('Tandem Signal: an arte, a Relay, the incoming hero\'s arte of the same suit — the handed-over arte Echoes', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'bolt_volley', 'scrapline', 'thermal_lance'], ['pinprick', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall'); // Hessa's arte, suit A
  relay(c, 'C');
  play(c, 'scrapline');
  assert.ok(!exIds(c).includes('tandem_signal'));
  play(c, 'thermal_lance'); // Corvin's arte, suit A
  assert.ok(exIds(c).includes('tandem_signal'));
  const ev = c.ex.find((e) => e.id === 'tandem_signal');
  assert.equal(ev.sum.echo, true);
  assert.ok(ev.sum.dmg > 0, 'the Echo dealt damage');
  assert.equal(c.heroState('V'), 'RECOVERING', 'the outgoing hero still recovers');
});

test('Tandem Signal does not trigger for artes of different suits, or with a basic attack before the Relay', () => {
  // Hessa's arte is A, Pin's Bolt Volley is B
  let c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'bolt_volley', 'scrapline', 'thermal_lance'], ['pinprick', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  relay(c, 'S');
  play(c, 'scrapline', 'bolt_volley');
  assert.ok(!exIds(c).includes('tandem_signal'));
  // Hessa's part ends with a basic attack, not her arte
  c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'thermal_lance', 'scrapfall'], ['pinprick', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  relay(c, 'C');
  play(c, 'scrapline', 'thermal_lance');
  assert.ok(!exIds(c).includes('tandem_signal'));
});

test('Tandem Signal needs the Relay to execute: a cancelled Relay contributes nothing', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'bolt_volley', 'scrapline', 'thermal_lance'], ['pinprick', 'tripwire']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  c.commit(uid(c, 'scrapfall')); // executing
  const r = c.selectHero('C'); // queued behind it
  assert.ok(r.ok && r.cmd);
  assert.ok(c.cancelCmd(r.cmd.id), 'the Relay is taken back before it starts');
  settle(c);
  assert.equal(c.combo && c.combo.relays, 0);
  assert.equal(c.combo.owners.length, 1, 'Corvin never joined');
  assert.ok(!exIds(c).includes('tandem_signal'));
});

test('Healing Cadence: another hero\'s heal during the combo, then the next card; not from outside the combo, not at full HP', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'mend_circuit', 'piston_strike', 'scrapfall'], ['pinprick'], { hp: 90, momentum: 2 });
  c.selectHero('V');
  play(c, 'scrapline');
  const hp = c.hp;
  play(c, 'mend_circuit');
  assert.ok(c.hp > hp, 'Corvin healed during Hessa\'s combo');
  assert.deepEqual(exIds(c), [], 'a support completes nothing on its own');
  play(c, 'rivet_jab');
  assert.deepEqual(exIds(c), ['healing_cadence']);
  assert.ok(c.ex[0].sum.heal > 0 && c.ex[0].sum.heal <= 4);
  // healed before the chain: nothing
  let d = fixed(['scrapline', 'rivet_jab', 'mend_circuit', 'piston_strike'], ['pinprick'], { hp: 90, momentum: 2 });
  play(d, 'mend_circuit');
  d.selectHero('V'); play(d, 'scrapline', 'rivet_jab');
  assert.ok(!exIds(d).includes('healing_cadence'), 'support outside the chain is not part of it');
  // at full HP the support heals nothing: nothing
  d = fixed(['scrapline', 'rivet_jab', 'mend_circuit', 'piston_strike'], ['pinprick'], { hp: 130, momentum: 2 });
  d.selectHero('V'); play(d, 'scrapline', 'mend_circuit', 'rivet_jab');
  assert.ok(!exIds(d).includes('healing_cadence'), 'the heal must actually restore HP');
});

test('Iron Harmony: Hessa\'s Cover during Corvin\'s combo, then his arte under Cover; Cover expired — nothing', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'salvage', 'thermal_lance', 'piston_strike'], ['pinprick']);
  c.selectHero('C');
  play(c, 'scrapline', 'salvage');
  assert.ok(c.coverActive(), 'Hessa covers the party');
  play(c, 'rivet_jab');
  const cover = c.coverUntil;
  play(c, 'thermal_lance');
  assert.ok(exIds(c).includes('iron_harmony'));
  const ev = c.ex.find((e) => e.id === 'iron_harmony');
  assert.equal(ev.sum.counter, 6);
  assert.equal(c.coverUntil, cover + 2);
  // Cover runs out before the arte
  const d = fixed(['scrapline', 'rivet_jab', 'salvage', 'thermal_lance', 'piston_strike'], ['pinprick']);
  d.selectHero('C');
  play(d, 'scrapline', 'salvage', 'rivet_jab');
  d.combo.deadline += 10; // keep the combo alive while Cover lapses
  advance(d, RULES.COVER_SECONDS + 0.5);
  assert.ok(!d.coverActive());
  play(d, 'thermal_lance');
  assert.ok(!exIds(d).includes('iron_harmony'));
});

test('Three-Way Circuit, Pressure Release and Tandem Signal in one three-hero combo, each once', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'recycler', 'thermal_lance', 'momentum_lance', 'scrapline'], ['scrapline', 'pinprick', 'tripwire', 'cold_start'], { momentum: 3 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'recycler'); // 3 Momentum, suit A
  relay(c, 'C');
  play(c, 'scrapline', 'thermal_lance'); // 2 Momentum, suit A: Tandem Signal
  assert.deepEqual(exIds(c), ['tandem_signal']);
  relay(c, 'S');
  play(c, 'scrapline');
  assert.deepEqual(exIds(c), ['tandem_signal']);
  play(c, 'momentum_lance'); // 3 Momentum: 8 spent, and all three heroes have landed an arte
  assert.deepEqual(exIds(c), ['tandem_signal', 'pressure_release', 'three_way_circuit'], 'Tandem once; then Pressure Release (35) before Three-Way (50) on the same arte');
  const last = c.ex.filter((e) => e.group === c.ex[1].group);
  assert.equal(last.length, 2);
  assert.deepEqual(last.map((e) => e.order), [0, 1]);
  assert.equal(c.stats.exOverlaps, 1);
  integrity(c);
});

test('Three-Way Circuit needs an arte from each hero, not just three heroes in the combo', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'bolt_volley', 'scrapline'], ['pinprick', 'tripwire', 'cold_start']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  relay(c, 'C');
  play(c, 'scrapline'); // Corvin joins with a basic attack only
  relay(c, 'S');
  play(c, 'scrapline');
  assert.equal(c.combo.owners.length, 3, 'three heroes in the combo');
  play(c, 'bolt_volley');
  assert.ok(c.history.length || c.combo, 'Pin\'s arte executed');
  assert.ok(!exIds(c).includes('three_way_circuit'), 'only two of them landed an arte');
});

test('Interference Reversal: a card an enemy Locked is played later, then an arte', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'piston_strike'], ['pinprick'], { enemies: ['wire_jammer'] });
  // the jammer Locks Hessa's Medium (the lock picks by priority: arte first, then the highest basic)
  c.lockCards(c.enemies[0], 1, (u) => c.def(u).id === 'rivet_jab');
  assert.ok(c.isLocked(uid(c, 'rivet_jab')));
  advance(c, RULES.LOCK_DURATION + 0.1);
  assert.ok(!c.isLocked(uid(c, 'rivet_jab')), 'the Lock ran out');
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  assert.deepEqual(exIds(c), []);
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['interference_reversal']);
  // no interference: no trigger
  const d = fixed(['scrapline', 'rivet_jab', 'scrapfall']);
  d.selectHero('V'); play(d, 'scrapline', 'rivet_jab', 'scrapfall');
  assert.ok(!exIds(d).includes('interference_reversal'));
});

test('Interference Reversal lifts every Lock still on the hand', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'piston_strike', 'thermal_lance'], ['pinprick'], { enemies: ['wire_jammer'] });
  c.lockCards(c.enemies[0], 1, (u) => c.def(u).id === 'rivet_jab');
  advance(c, RULES.LOCK_DURATION + 0.1);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  c.lockCards(c.enemies[0], 1, (u) => c.def(u).id === 'thermal_lance');
  assert.ok(c.isLocked(uid(c, 'thermal_lance')));
  play(c, 'scrapfall');
  assert.ok(!c.isLocked(uid(c, 'thermal_lance')));
  assert.equal(c.ex[0].sum.unlocked, 1);
});

test('Quick Settlement: a Cross, then a Quick Cash Out of 3+ cards; no Cross, two cards or a slow Cash Out do not count', () => {
  const c = fixed(['scrapline', 'hotwire', 'piston_strike', 'scrapfall']);
  c.selectHero('V');
  play(c, 'scrapline', 'hotwire', 'piston_strike'); // A, B, A: two Crosses
  assert.ok(c.flowLeft() >= RULES.QUICK_CASH_LEFT);
  assert.ok(c.finishOrCashOut().ok);
  settle(c);
  assert.deepEqual(exIds(c), ['quick_settlement']);
  const ev = c.ex[0];
  assert.ok(ev.sum.dmg > 0, '25% of the payout as extra damage');
  assert.equal(c.history[c.history.length - 1].type, 'cashout');
  assert.deepEqual(c.history[c.history.length - 1].ex, ['quick_settlement']);
  let d = fixed(['scrapline', 'rivet_jab', 'piston_strike']);
  d.selectHero('V'); play(d, 'scrapline', 'rivet_jab', 'piston_strike'); d.finishOrCashOut(); settle(d);
  assert.deepEqual(exIds(d), [], 'one suit throughout');
  d = fixed(['scrapline', 'hotwire', 'scrapfall']);
  d.selectHero('V'); play(d, 'scrapline', 'hotwire'); d.finishOrCashOut(); settle(d);
  assert.deepEqual(exIds(d), [], 'two cards');
  d = fixed(['scrapline', 'hotwire', 'piston_strike']);
  d.selectHero('V'); play(d, 'scrapline', 'hotwire', 'piston_strike');
  d.combo.deadline = d.t + 1.0; d.combo.graceUntil = 0;
  d.finishOrCashOut(); settle(d);
  assert.deepEqual(exIds(d), [], 'not a Quick Cash');
});

test('Final Harmonic: three heroes, 6 cards, a rank-6 arte — with Three-Way and Pressure Release on the same command', () => {
  const c = fixed(['scrapline', 'scrapfall', 'thermal_lance', 'grand_relay', 'scrapline', 'scrapline'], ['pinprick', 'tripwire', 'cold_start'], { momentum: 6 });
  c.selectHero('V');
  play(c, 'scrapline', 'scrapfall');
  relay(c, 'C');
  play(c, 'scrapline', 'thermal_lance');
  relay(c, 'S');
  play(c, 'scrapline');
  const before = exIds(c).length;
  play(c, 'grand_relay');
  const now = exIds(c).slice(before);
  assert.deepEqual(now, ['pressure_release', 'three_way_circuit', 'final_harmonic'], 'priority 35, 50, 70');
  const g = c.ex.find((e) => e.id === 'final_harmonic');
  assert.ok(g.sum.dmg >= 12 && g.sum.guard === 10);
  integrity(c);
});

// ── once per chain, again next chain ──
test('a recipe triggers once per chain, and again in the next chain', () => {
  const c = fixed(['scrapline', 'hotwire', 'scrapfall', 'recycler'], ['pinprick'], { momentum: 3 });
  c.selectHero('V');
  play(c, 'scrapline', 'hotwire', 'scrapfall');
  assert.deepEqual(exIds(c), ['cross_current']);
  play(c, 'recycler'); // a further arte in the same part still sees 2 Crosses: no second trigger
  assert.deepEqual(exIds(c), ['cross_current'], 'once per chain');
  assert.equal(c.combo.ex.size, 1);
  const d = fixed(['scrapline', 'hotwire', 'scrapfall', 'scrapline', 'hotwire', 'scrapfall'], ['pinprick', 'tripwire'], { momentum: 0 });
  d.selectHero('V'); play(d, 'scrapline', 'hotwire', 'scrapfall'); d.finishOrCashOut(); settle(d); advance(d, 4);
  d.selectHero('V'); play(d, 'scrapline', 'hotwire', 'scrapfall');
  assert.deepEqual(exIds(d), ['cross_current', 'cross_current'], 'once in each chain');
  assert.equal(d.stats.exByRecipe.cross_current, 2);
});

// ── queue and execution ──
test('queued cards trigger nothing until they execute; a cancelled arte contributes nothing', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'thermal_lance'], ['pinprick'], { momentum: 2 });
  c.selectHero('V');
  for (const id of ['scrapline', 'rivet_jab', 'piston_strike']) assert.ok(c.commit(uid(c, id)).ok);
  const r = c.commit(uid(c, 'scrapfall')); // projected legal with Momentum 2 already there
  assert.ok(r.ok, r.chk && r.chk.reason);
  collect(c);
  assert.deepEqual(exIds(c), [], 'four commands queued: nothing has executed yet');
  assert.ok(c.cancelCmd(r.cmd.id), 'the arte is taken back');
  settle(c);
  assert.deepEqual(exIds(c), [], 'the basics executed, the arte did not');
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit'], 'recommitted and executed: now it triggers');
  integrity(c);
});

test('a lethal arte completing a recipe: the activation is recorded, the effect is not applied after the battle', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall'], [], { enemyHp: 3000 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  c.enemies[0].hp = 1; // the arte will finish it
  const m = c.momentum;
  play(c, 'scrapfall');
  assert.equal(c.phase, 'END');
  assert.ok(c.result.victory);
  assert.deepEqual(exIds(c), ['straight_circuit'], 'recognised on its final command');
  assert.equal(c.ex[0].applied, false);
  assert.equal(c.ex[0].sum.momentum, 0, 'no Momentum after the battle ended');
  assert.equal(c.momentum, m - 2);
  assert.deepEqual(c.outcome().exFound, ['straight_circuit'], 'the battle reports it (for the run and the Journal)');
  assert.equal(c.stats.exUnapplied, 1);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('a winning Quick Cash Out still records Quick Settlement', () => {
  const c = fixed(['scrapline', 'hotwire', 'piston_strike']);
  c.selectHero('V');
  play(c, 'scrapline', 'hotwire', 'piston_strike');
  c.enemies[0].hp = 1;
  c.finishOrCashOut(); settle(c);
  assert.equal(c.phase, 'END');
  assert.deepEqual(exIds(c), ['quick_settlement']);
  assert.equal(c.ex[0].applied, false);
});

test('EX effects respect caps and never chain into further recipes', () => {
  // Momentum at the cap: +Momentum effects add nothing
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall'], [], { momentum: 10 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  c.momentum = c.momentumMax();
  play(c, 'scrapfall');
  assert.ok(c.momentum <= c.momentumMax());
  // Flow from EX effects is not a Flow extension (Second Wind can only come from the player's Flow)
  const d = fixed(['scrapline', 'rivet_jab', 'mend_circuit', 'piston_strike', 'scrapline', 'rivet_jab'], ['tripwire', 'pinprick'], { hp: 90, momentum: 2 });
  d.selectHero('V');
  play(d, 'scrapline', 'mend_circuit', 'rivet_jab'); // Healing Cadence gives +1s of Flow
  assert.ok(exIds(d).includes('healing_cadence'));
  assert.ok(d.combo.deadline <= d.flowCap() + 0.01, 'EX Flow stays inside the combo cap');
  play(d, 'piston_strike'); relay(d, 'S'); play(d, 'scrapline', 'rivet_jab', 'tripwire');
  assert.equal(d.combo.cards.length, 6, 'six cards (Corvin\'s support is not a chain card)');
  assert.ok(!exIds(d).includes('second_wind'), 'EX Flow does not count as the player extending Flow');
  assert.ok(d.combo.deadline <= d.flowCap() + 0.01);
});

test('a randomized soak: EX recipes never break zones, Momentum or the queue', () => {
  const rng = new RNG(77);
  const pool = ['scrapline', 'rivet_jab', 'hotwire', 'piston_strike', 'scrapfall', 'thermal_lance', 'bolt_volley', 'recycler', 'sunderline', 'grand_relay', 'spark_primer', 'salvage', 'mend_circuit', 'pinprick', 'tripwire'];
  for (let n = 0; n < 25; n++) {
    const deck = Array.from({ length: 18 }, () => pool[Math.floor(rng.next() * pool.length)]);
    const c = new Combat({ deck: deck.map(spec), party: PARTY, hp: 130, maxHp: 130, enemies: ['wire_jammer', 'rush_hound'], seed: 100 + n, relics: [], mutations: [], act: 1 });
    for (const e of c.enemies) { e.hp = e.maxHp = 600; }
    for (let i = 0; i < 2400 && c.phase !== 'END'; i++) {
      c.update(1 / 30);
      if (i % 5) continue;
      const roll = rng.next();
      const legal = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok);
      if (roll < 0.6 && legal.length) c.commit(legal[Math.floor(rng.next() * legal.length)]);
      else if (roll < 0.7) { for (const h of ['V', 'C', 'S']) if (c.relayCheck(h).ok) { c.selectHero(h); break; } }
      else if (roll < 0.75 && c.queue.length) c.cancelCmd(c.queue[c.queue.length - 1].id);
      else if (roll < 0.8) { const u = c.hand.find((x) => x); if (u) c.churnCard(u); }
      else if (roll < 0.83) { const u = c.hand.find((x) => x && c.canStash(x)); if (u) c.stash(u); }
      else if (roll < 0.88 && c.combo) c.finishOrCashOut();
      else if (roll < 0.9 && c.combo) c.spendMomentumFlow();
      const z = c.verifyZones();
      assert.ok(z.ok, z.error);
      assert.ok(c.momentum >= 0 && c.reserved <= c.momentum);
      assert.ok(c.queue.length <= RULES.QUEUE_AHEAD);
      for (const ev of c.drainEvents()) if (ev.type === 'exCombo') assert.ok(RECIPE_MAP[ev.id]);
      if (c.combo) assert.ok(c.combo.ex.size <= RECIPES.length);
    }
  }
});

// ── feasibility: the cards each recipe needs can be obtained ──
test('every recipe can be assembled from obtainable cards; four from the starter deck alone', () => {
  const starter = new Set(STARTER_DECK.map((s) => s.id || s));
  const pool = new Set(rewardPool().map((c) => c.id || c));
  const obtainable = (id) => starter.has(id) || pool.has(id);
  for (const id of ['recycler', 'sunderline', 'spark_primer', 'grand_relay']) assert.ok(obtainable(id), `${id} is offered by rewards or shops`);
  for (const id of ['scrapline', 'rivet_jab', 'hotwire', 'piston_strike', 'scrapfall', 'thermal_lance', 'bolt_volley', 'salvage', 'mend_circuit']) assert.ok(starter.has(id), `${id} is in the starter deck`);
});

// ── discovery and the Museum record ──
test('the Combo Journal record: first discovery, repeats, unknown and damaged ids, idempotent normalisation', () => {
  const m = defaultMeta();
  assert.deepEqual(m.combos, {});
  assert.equal(recordCombo(m, 'straight_circuit', 1000), true, 'first activation is a discovery');
  assert.equal(recordCombo(m, 'straight_circuit', 2000), false, 'a repeat is not');
  assert.equal(recordCombo(m, 'tandem_signal', 3000), true);
  assert.deepEqual(m.combos.straight_circuit, { at: 1000, count: 2 });
  assert.deepEqual(knownDiscoveries(m.combos), ['straight_circuit', 'tandem_signal']);
  // an older Museum record (no combos) loads with an empty Journal and keeps everything else
  const old = { version: 1, runs: [{ result: 'victory' }], totalRuns: 3, wins: 1, bossesDefeated: { scrap_tyrant: 1 }, enemiesSeen: { rush_hound: 2 }, relicsFound: ['beta_badge'], cardsSeen: ['scrapline'], bestCombo: 7, maxHit: 40, bestScore: 900, endings: [], archetypes: { ladder: 2 }, tutorialDone: true, defeats: 2, devTrust: 1, tut: { attack: true }, lessonsMigrated: true };
  const n = normalizeMeta(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(n.combos, {});
  assert.equal(n.version, 2);
  for (const k of Object.keys(old)) if (k !== 'version') assert.deepEqual(n[k], old[k], `kept ${k}`);
  assert.deepEqual(normalizeMeta(JSON.parse(JSON.stringify(n))), n, 'normalising twice changes nothing');
  // damaged and unknown entries
  const bad = normalizeMeta({ ...old, combos: { straight_circuit: { at: 'x', count: -3 }, 'bad id!': { at: 1 }, from_the_future: { at: 5, count: 2 }, tandem_signal: null } });
  assert.deepEqual(bad.combos.straight_circuit, { at: 0, count: 1 });
  assert.ok(!('bad id!' in bad.combos));
  assert.ok(bad.combos.from_the_future, 'an id this build does not know is kept');
  assert.deepEqual(knownDiscoveries(bad.combos), ['straight_circuit', 'tandem_signal'], 'but never shown or counted');
  assert.deepEqual(normalizeMeta({ ...old, combos: [1, 2] }).combos, {});
  assert.deepEqual(normalizeMeta(null).combos, {});
  assert.deepEqual(normalizeMeta('garbage').runs, []);
  assert.deepEqual(normalizeCombos({ x: { at: 1, count: 2 } }), { x: { at: 1, count: 2 } });
});

test('Journal discoveries survive saving and loading the Museum record', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    const m = Save.loadMeta();
    recordCombo(m, 'quick_settlement', 42);
    Save.saveMeta(m);
    const back = Save.loadMeta();
    assert.deepEqual(back.combos, { quick_settlement: { at: 42, count: 1 } });
    recordCombo(back, 'quick_settlement', 99);
    Save.saveMeta(back);
    assert.equal(Save.loadMeta().combos.quick_settlement.count, 2);
  } finally { delete global.localStorage; }
});

test('a finished battle\'s EX Combos count for the run; the run summary carries them', () => {
  const run = Run.create({ seed: 5150, tutorial: false });
  run.d.pending = null;
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  const out = { victory: true, hp: run.d.hp, maxHp: run.d.maxHp, stats: { ...new Combat(setup).stats, exActivations: 3, exByRecipe: { straight_circuit: 2, tandem_signal: 1 }, exOverlaps: 1, exDamage: 20 }, scrapBonus: 0, enemies: setup.enemies, exFound: ['straight_circuit', 'tandem_signal'] };
  run.finishBattle(out);
  assert.equal(run.d.stats.exActivations, 3);
  assert.deepEqual(run.d.stats.exByRecipe, { straight_circuit: 2, tandem_signal: 1 });
  assert.deepEqual(run.d.exFound, ['straight_circuit', 'tandem_signal']);
  const sum = run.summary('defeat');
  assert.equal(sum.ex, 3);
  assert.deepEqual(sum.exRecipes, ['straight_circuit', 'tandem_signal']);
  const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  assert.deepEqual(re.d.exFound, ['straight_circuit', 'tandem_signal'], 'kept through a save');
});

test('a battle that ends during a command\'s follow-through leaves nothing executing', () => {
  const c = fixed(['salvage', 'scrapline', 'rivet_jab']);
  assert.ok(c.commit(uid(c, 'salvage')).ok);
  for (let i = 0; i < 600 && !(c.executing && c.executing.resolved); i++) c.update(1 / 60);
  assert.ok(c.executing && c.executing.resolved && c.t < c.executing.endAt, 'the support has landed and is still animating');
  const e = c.enemies[0];
  c.dealDamage(e, e.hp + e.guard + 50, { src: 'S', tag: 'test' }); // e.g. a Counter or another enemy's death finishes the fight here
  assert.equal(c.phase, 'END');
  assert.equal(c.executing, null);
  assert.equal(c.queue.length, 0);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('a lethal Slipstream (damage, then "refunds double Flow") ends the battle cleanly', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'slipstream']);
  c.selectHero('S');
  play(c, 'scrapline', 'rivet_jab');
  c.enemies[0].hp = 3;
  play(c, 'slipstream');
  assert.equal(c.phase, 'END');
  assert.ok(c.result.victory);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

// ── EX damage follows the ordinary rules (assignment §20 R4, §21): target at execution, Guard, adaptations ──
test('EX strikes hit the current target at execution; area effects hit every living enemy', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall'], [], { enemies: ['rush_hound', 'rush_hound'] });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  const e2 = c.enemies[1];
  c.setTarget(e2.uid); // the player moves the target before the arte resolves
  const hits = [];
  const deal = c.dealDamage.bind(c);
  c.dealDamage = (e, n, o = {}) => { if (o.tag === 'ex') hits.push(e.uid); return deal(e, n, o); };
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit']);
  assert.deepEqual(hits, [e2.uid], 'the strike went to the target chosen when it resolved');
});

test('EX damage is blocked by enemy Guard like any hit (no pierce)', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall']);
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  const e = c.enemies[0];
  e.guard = 500; // a wall of Guard before the arte
  const hp = e.hp;
  const opts = [];
  const deal = c.dealDamage.bind(c);
  c.dealDamage = (t, n, o = {}) => { if (o.tag === 'ex') opts.push({ ...o }); return deal(t, n, o); };
  play(c, 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit']);
  assert.equal(opts.length, 1);
  assert.ok(!opts[0].pierce, 'not piercing');
  assert.equal(e.hp, hp, 'the arte and the strike both went into Guard');
  assert.ok(c.ex[0].sum.dmg >= 5);
  assert.ok(Math.abs(500 - e.guard - (c.combo.cards[3].dmg + c.ex[0].sum.dmg)) <= 1, 'Guard took the arte\'s damage and the strike\'s (Guard is fractional)');
});

test('EX damage carries the completing card\'s suit into the boss Suit Filter; it never advances arte-only adaptations', () => {
  // the damage pipeline: a Suit Filter A cuts A-suit EX damage like A-suit card damage
  const mk = (adaptation) => { const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall'], [], { enemies: ['scrap_tyrant'] }); c.adapt = adaptation ? { ...adaptation, progress: 0, broken: false } : null; return c; };
  let c = mk({ id: 'suit_filter_A', need: 8 });
  const boss = c.enemies[0];
  boss.guard = 0;
  const h0 = boss.hp;
  c.dealDamage(boss, 10, { src: 'V', tag: 'ex', suit: 'A' });
  assert.equal(h0 - boss.hp, 7, 'A-suit EX damage: 30% less');
  const h1 = boss.hp;
  c.dealDamage(boss, 10, { src: 'V', tag: 'ex', suit: 'B' });
  assert.equal(h1 - boss.hp, 10, 'B-suit EX damage: unaffected');
  // through play: the strike that Hessa's A-suit arte completes is passed as suit A
  c = mk({ id: 'suit_filter_A', need: 8 });
  const seen = [];
  const deal = c.dealDamage.bind(c);
  c.dealDamage = (t, n, o = {}) => { if (o.tag === 'ex') seen.push(o.suit); return deal(t, n, o); };
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike', 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit']);
  assert.deepEqual(seen, ['A']);
  // Guard Piercer breaks on arte damage only: the EX strike does not count towards it
  c = mk({ id: 'guard_pierce', need: 999 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike', 'scrapfall');
  assert.deepEqual(exIds(c), ['straight_circuit']);
  const arte = c.combo.cards[3];
  assert.equal(c.adapt.progress, arte.dmg, `progress ${c.adapt.progress} = the arte's own damage ${arte.dmg}, not the strike's ${c.ex[0].sum.dmg}`);
});
