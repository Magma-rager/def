import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES, seqCheck } from '../src/engine/combat.js';
import { CARDS, STARTER_DECK, CARD_LIST, BASIC_GAIN, ARTE_COST, rewardPool, MIGRATE_CARDS } from '../src/data/cards.js';
import { RNG } from '../src/core/rng.js';

// deck specs: card ids or { id, variant, up, graft, rankMod }
function deck(specs = STARTER_DECK) {
  return specs.map((s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s }));
}
const PARTY = [
  { id: 'V', hp: 46, maxHp: 46 },
  { id: 'C', hp: 34, maxHp: 34 },
  { id: 'S', hp: 38, maxHp: 38 },
];
function mk(extra = {}) {
  return new Combat({ deck: deck(extra.ids), party: PARTY.map((p) => ({ ...p })), enemies: extra.enemies || ['iron_maw'], seed: extra.seed || 7, relics: extra.relics || [], mutations: extra.mutations || [], act: 1, ...extra.opts });
}
function advance(c, sec) {
  for (let x = 0; x < sec; x += 0.05) c.update(Math.min(0.05, sec - x));
}
function legal(c) {
  return [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok);
}
// A battle whose hand and draw pile are exactly these cards (hand slot order, then the draw pile
// from the top). Enemies are held back so only the player acts.
function fixed(handSpecs, drawSpecs = [], extra = {}) {
  const specs = [...handSpecs, ...drawSpecs];
  const c = new Combat({ deck: deck(specs), party: PARTY.map((p) => ({ ...p })), enemies: extra.enemies || ['iron_maw'], seed: 5, relics: extra.relics || [], mutations: extra.mutations || [], act: 1, ...extra.opts });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < handSpecs.length ? `c${i}` : null));
  c.draw = drawSpecs.map((_, i) => `c${handSpecs.length + i}`);
  c.discard = [];
  c.exhaust = [];
  for (const e of c.enemies) e.atb = -100;
  if (extra.momentum !== undefined) c.momentum = extra.momentum;
  c.drainEvents();
  return c;
}
const slot = (c, i) => c.hand[i];
// Phase 5: a committed card executes over time; run the clock until nothing is queued or executing
function settle(c, max = 20) {
  for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60);
}
function play(c, uid, o) {
  const r = c.playCard(uid, o);
  settle(c);
  return r;
}

test('card library: every card has a category and the Phase 4 shape', () => {
  const real = CARD_LIST.filter((c) => c.category !== 'junk');
  const by = (k) => real.filter((c) => c.category === k && c.p4 !== 'withheld');
  assert.ok(real.length >= 60, `cards ${real.length}`);
  assert.ok(by('basic').length >= 15 && by('arte').length >= 25 && by('support').length >= 10, `${by('basic').length}/${by('arte').length}/${by('support').length}`);
  for (const c of real) {
    assert.ok(['basic', 'arte', 'support'].includes(c.category), c.id);
    assert.ok(['A', 'B', 'EX'].includes(c.variant), c.id);
    if (c.category === 'basic') { assert.equal(c.owner, null, c.id); assert.ok([1, 2, 3].includes(c.rank), c.id); assert.equal(c.cost, 0); assert.equal(c.gain, BASIC_GAIN[c.rank]); }
    if (c.category === 'arte') { assert.ok(['V', 'C', 'S'].includes(c.owner), c.id); assert.ok([4, 5, 6].includes(c.rank), c.id); assert.equal(c.cost, ARTE_COST[c.rank], c.id); }
    if (c.category === 'support') { assert.equal(c.rank, 0, c.id); assert.ok(c.cost >= 0 && c.cost <= 3, c.id); }
    for (const m of c.text.matchAll(/\{(\w+)\}/g)) assert.ok(c.v[m[1]], `${c.id} missing value ${m[1]}`);
  }
  // each hero has artes at every cost
  for (const o of ['V', 'C', 'S']) for (const r of [4, 5, 6]) assert.ok(by('arte').some((c) => c.owner === o && c.rank === r), `${o} rank ${r}`);
  // the representative support set (docs/COMBAT_SPEC.md §10)
  for (const id of ['mend_circuit', 'salvage', 'hold_the_line', 'spare_parts', 'shuffle_step']) assert.equal(CARDS[id].category, 'support', id);
  // no reward can hand out a withheld or compatibility-only card
  for (const c of rewardPool()) assert.equal(c.p4, 'converted', c.id);
  for (const [from, to] of Object.entries(MIGRATE_CARDS)) { assert.equal(CARDS[to].p4, 'converted', from); assert.equal(CARDS[to].owner, CARDS[from].owner, `${from} → ${to} keeps the hero`); }
});

test('starter deck: 3 Weak, 3 Medium, 2 Strong with mixed suits, one rank-4 arte per hero, a heal and a Guard support', () => {
  const d = STARTER_DECK.map((s) => ({ ...CARDS[s.id], suit: s.variant || CARDS[s.id].variant }));
  const basics = d.filter((c) => c.category === 'basic');
  assert.deepEqual([1, 2, 3].map((r) => basics.filter((c) => c.rank === r).length), [3, 3, 2]);
  assert.ok(new Set(basics.map((c) => c.suit)).size >= 2, 'mixed suits');
  assert.deepEqual(d.filter((c) => c.category === 'arte').map((c) => `${c.owner}${c.rank}`).sort(), ['C4', 'S4', 'V4']);
  assert.ok(d.some((c) => c.id === 'mend_circuit') && d.some((c) => c.id === 'salvage'));
});

// ── legality (docs/COMBAT_SPEC.md §8.2) ──
test('sequence rule: ranks strictly ascend, skipping is legal, suits only give Step/Cross bonuses', () => {
  assert.deepEqual([seqCheck(1, 'A', 2, 'A').step, seqCheck(1, 'A', 2, 'A').cross], [true, false]);
  assert.deepEqual([seqCheck(1, 'A', 2, 'B').step, seqCheck(1, 'A', 2, 'B').cross], [true, true], 'a card can be a Step and a Cross');
  assert.deepEqual([seqCheck(1, 'A', 3, 'B').ok, seqCheck(1, 'A', 3, 'B').cross], [true, true], 'a suit change may skip ranks');
  assert.equal(seqCheck(1, 'A', 4, 'A').kind, 'climb');
  assert.equal(seqCheck(2, 'A', 2, 'A').ok, false, 'repeated rank');
  assert.equal(seqCheck(3, 'B', 2, 'A').ok, false, 'descending rank');
  assert.equal(seqCheck(1, 'EX', 2, 'A').cross, true, 'EX differs from A');
  assert.equal(seqCheck(1, 'EX', 2, 'EX').cross, false);
  assert.equal(seqCheck(1, 'A', 3, 'B', true).step, true, 'Wild Hinge: a Cross counts as a Step');
});

test('neutral basic attacks: any hero performs them, and the combo records who', () => {
  for (const hero of ['V', 'C', 'S']) {
    const c = fixed(['scrapline', 'rivet_jab']);
    assert.ok(c.selectHero(hero).ok);
    const res = play(c, slot(c, 0));
    assert.ok(res.ok);
    assert.equal(c.combo.hero, hero);
    assert.equal(c.combo.cards[0].owner, hero, 'damage and animation are attributed to the hero');
    const act = c.drainEvents().find((e) => e.type === 'act');
    assert.equal(act.who, hero);
    assert.equal(act.anim, { V: 'melee', C: 'cast', S: 'shoot' }[hero]);
    assert.equal(c.stats.byHero[hero], 1);
  }
});

test('artes: owner, a basic attack first, a higher rank and enough Momentum; each refusal names its reason', () => {
  const c = fixed(['scrapfall', 'thermal_lance', 'scrapline', 'rivet_jab', 'piston_strike', 'sunderline'], [], { momentum: 0 });
  c.selectHero('V');
  assert.equal(c.check(slot(c, 0)).reason, 'needbasic', 'an arte cannot start a combo');
  play(c, slot(c, 2)); // Weak 1 (+1)
  assert.equal(c.check(slot(c, 1)).reason, 'owner', "Corvin's arte in Hessa's combo");
  assert.equal(c.check(slot(c, 0)).reason, 'momentum', 'rank-4 arte needs 2 Momentum, 1 available');
  assert.deepEqual(c.check(slot(c, 0)).text, { k: 'Needs {n} Momentum', p: { n: 2 } });
  play(c, slot(c, 3)); // Medium 2 (+1): 2 Momentum
  assert.equal(c.momentum, 2);
  assert.equal(c.check(slot(c, 0)).ok, true, 'Weak → Medium → arte 4');
  play(c, slot(c, 0));
  assert.ok(c.combo, 'no higher arte, but Corvin and Pin can still take a Relay: the chain stays open');
  assert.ok(c.canFinish());
  assert.ok(c.finishOrCashOut().ok);
  assert.equal(c.history[0].type, 'perfect');
  assert.equal(c.momentum, 2, 'the arte cost 2, the Perfect paid 2');
  assert.equal(c.stats.artes, 1);
});

test('an arte needs one basic attack, not a full Weak → Medium → Strong ladder; higher artes may follow', () => {
  const c = fixed(['piston_strike', 'scrapfall', 'sunderline', 'scrapline'], [], { momentum: 6 });
  c.selectHero('V');
  play(c, slot(c, 0)); // Strong 3 (+2) → 8
  assert.ok(c.check(slot(c, 1)).ok, 'Strong 3 → arte 4');
  play(c, slot(c, 1)); // arte 4 (−2) → 6
  assert.ok(c.combo, 'a higher affordable arte keeps the combo open');
  assert.equal(c.check(slot(c, 3)).reason, 'rank', 'basic attacks cannot follow an arte');
  assert.ok(c.check(slot(c, 2)).ok, 'arte 4 → arte 6');
  play(c, slot(c, 2));
  assert.ok(c.combo, 'still open: a Relay is possible');
  c.finishChain();
  assert.equal(c.combo, null);
  assert.equal(c.history[0].type, 'perfect');
  assert.equal(c.history[0].closerId, 'sunderline');
});

test('rank skips are legal, repeated and descending ranks are not, and suits never block an ascending card', () => {
  const c = fixed([{ id: 'scrapline', variant: 'A' }, { id: 'piston_strike', variant: 'B' }, { id: 'rivet_jab', variant: 'A' }, { id: 'scrapline', variant: 'B' }]);
  play(c, slot(c, 0));
  assert.ok(c.check(slot(c, 1)).ok, 'Weak A 1 → Strong B 3 (the old rule refused this Cross)');
  play(c, slot(c, 1));
  assert.equal(c.check(slot(c, 2)).reason, 'rank', 'Medium 2 after Strong 3');
  assert.deepEqual(c.check(slot(c, 2)).text, { k: 'Needs rank {n}+', p: { n: 4 } });
  assert.equal(c.check(slot(c, 3)).reason, 'rank', 'Weak 1 after Strong 3');
});

test('Steps and Crosses are counted and pay Momentum on resolution (Weak +1, Medium +1, Strong +2, Cross +1)', () => {
  const c = fixed([{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'piston_strike', variant: 'B' }], [], { momentum: 0 });
  play(c, slot(c, 0));
  assert.equal(c.momentum, 1, 'Weak +1, no Cross on the first card');
  play(c, slot(c, 1));
  assert.equal(c.momentum, 3, 'Medium +1, Cross +1');
  assert.deepEqual([c.combo.steps, c.combo.crosses], [1, 1], 'A1 → B2 is both a Step and a Cross');
  play(c, slot(c, 2));
  assert.equal(c.momentum, 5, 'Strong +2, same suit: no Cross');
  assert.deepEqual([c.combo.steps, c.combo.crosses], [2, 1]);
});

test('support is independent: playable before, during and outside combos; never starts, extends or ends one; its performer recovers', () => {
  const c = fixed(['salvage', 'mend_circuit', 'scrapline', 'rivet_jab', 'spare_parts', 'hold_the_line'], ['pinprick', 'tripwire', 'cold_start', 'junk_toss'], { momentum: 2 });
  c.hp = 60;
  assert.ok(c.check(slot(c, 0)).ok, 'free support with no chain');
  play(c, slot(c, 0)); // Hessa's Salvage
  assert.equal(c.phase, 'PRE');
  assert.equal(c.combo, null);
  assert.ok(c.guard >= 5);
  assert.equal(c.heroState('V'), 'RECOVERING', 'support costs the performer its action');
  assert.ok(Math.abs(c.recoverLeft('V') - RULES.RECOVER_SUPPORT) < 0.05, `Recovery ${c.recoverLeft('V')}`);
  c.selectHero('S');
  play(c, slot(c, 2)); // Pin starts a chain
  const { rank, cards } = { rank: c.combo.rank, cards: c.combo.cards.length };
  const left = c.flowLeft();
  assert.ok(c.check(slot(c, 1)).ok, "Corvin's support during Pin's chain");
  play(c, slot(c, 1)); // Mend Circuit, cost 2
  assert.ok(c.combo, 'the combo goes on');
  assert.deepEqual([c.combo.rank, c.combo.cards.length], [rank, cards], 'rank and cards unchanged');
  assert.ok(Math.abs(c.flowLeft() - left) < 0.02, 'the decision window held while the support executed');
  assert.equal(c.hp, 74, 'healed the pool by 14');
  assert.equal(c.stats.supports, 2);
  assert.equal(c.heroState('C'), 'RECOVERING');
  assert.equal(c.heroState('S'), 'ACTIVE');
});

test('Glitch is unplayable, never starts a combo, and Churn deletes it for free', () => {
  const c = fixed(['scrapline', 'rivet_jab']);
  c.addGlitch(null, 1);
  const g = c.draw[c.draw.findIndex((u) => c.categoryOf(u) === 'junk')];
  c.draw.splice(c.draw.indexOf(g), 1);
  c.hand[2] = g;
  assert.equal(c.check(g).reason, 'junk');
  assert.equal(c.playCard(g).ok, false);
  assert.equal(c.combo, null);
  const charges = c.churn.charges;
  assert.ok(c.churnCard(g).ok);
  assert.equal(c.churn.charges, charges);
  assert.ok(c.exhaust.includes(g));
  assert.deepEqual(c.verifyZones(), { ok: true });
});

// ── Momentum accounting (docs/COMBAT_SPEC.md §11) ──
test('a committed card reserves its cost: the same Momentum cannot be spent twice; cancel releases it and gains nothing', () => {
  const c = fixed(['piston_strike', 'scrapfall', 'sunderline', 'scrapline'], ['rivet_jab', 'pinprick'], { momentum: 3 });
  c.selectHero('V');
  const s = c.commit(slot(c, 0)); // Strong starts executing at once
  assert.equal(c.executing.cmd.uid, s.cmd.uid);
  const a = c.commit(slot(c, 1)); // Scrapfall waits behind it
  assert.ok(a.ok);
  assert.deepEqual([c.momentum, c.reserved, c.available()], [3, 2, 1], 'reserved, not yet spent');
  assert.equal(c.zoneOf(a.cmd.uid), 'queue');
  assert.equal(c.hand[1], null, 'the slot holds a placeholder');
  assert.deepEqual(c.verifyZones(), { ok: true });
  const b = c.commit(slot(c, 2)); // Sunderline costs 4
  assert.equal(b.ok, false, 'refused: only 1 Momentum is unreserved (future gains do not count)');
  assert.equal(b.chk.reason, 'momentum');
  assert.equal(c.momentum, 3, 'no Stumble while gains are still on their way');
  const gainedBefore = c.stats.momentumGained;
  assert.ok(c.cancel(a.cmd));
  assert.deepEqual([c.momentum, c.reserved, c.available()], [3, 0, 3], 'the reservation is back');
  assert.equal(c.hand[1], a.cmd.uid, 'the card is back in its slot');
  assert.equal(c.stats.momentumGained, gainedBefore, 'a cancelled command gains nothing');
  assert.equal(c.cancel(s.cmd), false, 'an executing command cannot be cancelled');
  settle(c);
  assert.equal(c.stats.artes, 0, 'and the cancelled arte had no effect');
  assert.equal(c.momentum, 5, 'Strong +2 on resolution');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('a cancelled basic attack never starts a combo or generates Momentum', () => {
  const c = fixed(['salvage', 'piston_strike'], ['scrapline'], { momentum: 0 });
  c.commit(slot(c, 0)); // Hessa's Salvage executes
  const r = c.commit(slot(c, 1)); // a basic attack waits behind it (Corvin, the first Ready hero)
  assert.ok(r.ok);
  assert.equal(r.cmd.hero, 'C');
  assert.ok(c.cancel(r.cmd));
  assert.deepEqual([c.phase, c.combo, c.momentum, c.stats.basics], ['PRE', null, 0, 0]);
  assert.equal(c.hand[1], r.cmd.uid);
  settle(c);
  assert.equal(c.stats.basics, 0);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('the Momentum cap holds; Overflow Valve turns the excess into damage', () => {
  const c = fixed(['piston_strike', 'rivet_jab'], [], { momentum: 9 });
  play(c, slot(c, 0));
  assert.equal(c.momentum, RULES.MOMENTUM_MAX);
  const v = fixed(['piston_strike'], [], { momentum: 9, relics: ['overflow_valve'], enemies: ['foundry_warden'] });
  const hp = v.enemies[0].hp + v.enemies[0].guard;
  play(v, slot(v, 0));
  const hits = v.drainEvents().filter((e) => e.type === 'hit' && e.tag === 'overflow');
  assert.equal(hits.length, 1);
  assert.ok(v.enemies[0].hp + v.enemies[0].guard < hp - 10);
});

test('Momentum drains take only unreserved Momentum and never go negative', () => {
  const c = fixed(['piston_strike', 'scrapfall'], ['scrapline', 'rivet_jab'], { momentum: 3, enemies: ['scrap_tyrant'], opts: { adaptation: { id: 'momentum_drain', need: 12 } } });
  c.selectHero('V');
  c.commit(slot(c, 0)); // Strong executing
  c.commit(slot(c, 1)); // Scrapfall queued: 2 reserved
  const boss = c.enemies[0];
  boss.intent = { key: 'rubble', kind: 'aoe', name: 'x', dmg: 1, target: null };
  c.enemyAct(boss); // drains min(2, available 1)
  assert.deepEqual([c.momentum, c.reserved], [2, 2], 'only the unreserved point was drained');
  settle(c);
  assert.ok(c.momentum >= 0);
  assert.equal(c.reserved, 0);
  assert.equal(c.stats.artes, 1, 'the reserved arte still executed');
});

test('Flywheel, Long Breath and Pressure Gauge still change Momentum costs and caps', () => {
  const c = fixed(['scrapline'], [], { relics: ['flywheel', 'pressure_gauge'], mutations: ['long_breath'] });
  assert.equal(c.momentumCostFlow(), 1);
  assert.equal(c.momentumMax(), 13);
});

// ── the persistent hand (docs/COMBAT_SPEC.md §6) ──
test('the hand stays mixed: a played card\'s slot refills only after it resolves, from the card the preview showed', () => {
  const c = fixed(['scrapline', 'scrapfall', 'mend_circuit', 'rivet_jab', 'salvage', 'bolt_volley'], ['piston_strike', 'tripwire', 'pinprick']);
  const before = c.hand.slice();
  const next = c.nextCard();
  assert.equal(CARDS[c.cards.get(next).id].id, 'piston_strike');
  c.playCard(slot(c, 0));
  assert.equal(c.hand[0], null, 'held while the card executes');
  assert.equal(c.nextCard(), next, 'nothing drawn yet');
  settle(c);
  assert.equal(c.hand[0], next, 'the slot got the previewed card');
  for (let i = 1; i < 6; i++) assert.equal(c.hand[i], before[i], `slot ${i} untouched when the combo started`);
  assert.equal(c.nextCard(), c.draw[0]);
  advance(c, RULES.FLOW_READ_GRACE + RULES.FLOW_INITIAL + RULES.RECOVER.forced + 0.5); // the combo ends
  for (let i = 1; i < 6; i++) assert.equal(c.hand[i], before[i], `slot ${i} untouched when the combo ended`);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('the preview never draws or reshuffles; an empty draw pile shows nothing until a draw reshuffles the discard', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'pinprick', 'tripwire', 'cold_start', 'junk_toss'], []);
  c.discard.push(...c.hand.splice(2, 4, null, null, null, null));
  c.hand.length = RULES.HAND;
  for (let i = 0; i < 4; i++) c.hand[2 + i] = null;
  assert.equal(c.nextCard(), null);
  const d = c.discard.length;
  c.nextCard();
  assert.equal(c.discard.length, d, 'looking does not reshuffle');
  play(c, slot(c, 0));
  assert.ok(c.drainEvents().some((e) => e.type === 'reshuffle'), 'the draw reshuffled the discard');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('Churn replaces exactly one card with the previewed one; outside a combo it pushes enemy ATB', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'salvage', 'pinprick', 'tripwire'], ['piston_strike', 'cold_start']);
  c.enemies[0].atb = 0.2;
  const before = c.hand.slice();
  const next = c.nextCard();
  assert.ok(c.churnCard(slot(c, 2)).ok);
  assert.equal(c.hand[2], next);
  for (const i of [0, 1, 3, 4, 5]) assert.equal(c.hand[i], before[i]);
  assert.ok(c.discard.includes(before[2]));
  assert.ok(c.drainEvents().some((e) => e.type === 'atbPush'));
  assert.equal(c.churnCard(before[2]).ok, false, 'the same card cannot be Churned twice');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('Reserve: bounded, and Reserve cards obey the same legality, costs and arte rules as the hand', () => {
  const c = fixed(['scrapfall', 'scrapline', 'rivet_jab', 'pinprick', 'mend_circuit', 'tripwire'], ['cold_start', 'junk_toss', 'piston_strike'], { momentum: 0 });
  c.selectHero('V');
  const arte = slot(c, 0), heal = slot(c, 4);
  assert.ok(c.stash(arte).ok);
  assert.ok(c.stash(heal).ok);
  assert.equal(c.stash(slot(c, 1)).ok, false, 'Reserve holds 2');
  assert.equal(c.check(arte).reason, 'needbasic', 'no shortcut from Reserve');
  assert.equal(c.check(heal).reason, 'momentum', 'support cost applies in Reserve');
  play(c, slot(c, 1)); // Weak +1
  play(c, slot(c, 2)); // Medium +1 → 2
  assert.ok(c.check(arte).ok);
  c.playCard(arte);
  assert.ok(!c.reserve.includes(arte));
  assert.equal(c.stash(slot(c, 3)).ok, false, 'a Reserve card that is executing keeps its Reserve place until it resolves');
  settle(c);
  assert.equal(c.stats.reservePlays, 1);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('card modifiers (upgrade, graft, rank modifier, suit) travel with the instance through every zone', () => {
  const c = fixed([{ id: 'scrapline', up: true, graft: 'spark', rankMod: 1, variant: 'B' }, 'rivet_jab'], ['pinprick', 'tripwire', 'cold_start', 'junk_toss', 'tinder_toss']);
  const u = slot(c, 0);
  assert.equal(c.effRank(u), 2);
  assert.equal(c.effVariant(u), 'B');
  c.stash(u);
  assert.equal(c.hand[0], c.cards.get(c.hand[0]).uid, 'the stashed card\'s slot refilled');
  const r = c.commit(u);
  assert.equal(r.cmd.rank, 2, 'rank frozen into the command');
  assert.equal(c.zoneOf(u), null, 'executing (not in any pile)');
  assert.deepEqual(c.verifyZones(), { ok: true });
  settle(c);
  assert.ok(c.discard.includes(u));
  assert.deepEqual(c.cards.get(u), { uid: u, id: 'scrapline', up: true, graft: 'spark', rankMod: 1, variant: 'B' });
  assert.equal(c.momentum, 2, 'Weak +1 and Spark +1');
});

test('playing another hero\'s card never changes the performer: only the Relay command hands a chain over', () => {
  const c = fixed(['scrapline', 'bolt_volley', 'rivet_jab'], ['pinprick']);
  c.selectHero('V');
  play(c, slot(c, 0));
  assert.equal(c.check(slot(c, 1)).reason, 'owner', "Pin's arte in Hessa's chain");
  play(c, slot(c, 2));
  assert.deepEqual([c.combo.hero, c.combo.relays, c.stats.relays, c.combo.owners], ['V', 0, 0, ['V']]);
  assert.equal(c.drainEvents().filter((e) => e.type === 'relay').length, 0);
});

// ── endings (docs/COMBAT_SPEC.md §12) ──
test('Cash Out needs 2+ cards ending on a basic attack; after an arte the button is FINISH (a Perfect)', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'sunderline'], [], { momentum: 5, enemies: ['foundry_warden'] });
  c.selectHero('V');
  play(c, slot(c, 0));
  assert.equal(c.canCashOut(), false, 'one card');
  play(c, slot(c, 1));
  assert.equal(c.canCashOut(), true);
  play(c, slot(c, 2));
  assert.ok(c.combo);
  assert.equal(c.canCashOut(), false);
  assert.equal(c.canFinish(), true);
  assert.equal(c.cashOut().ok, false);
  assert.ok(c.finishOrCashOut().ok);
  assert.equal(c.history[0].type, 'perfect');
  assert.equal(c.phase, 'RECOVER');
});

test('Cash Out pays out and differs from a Perfect', () => {
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick'], { enemies: ['foundry_warden'] });
  play(c, slot(c, 0));
  play(c, slot(c, 1));
  const hp = c.enemies[0].hp + c.enemies[0].guard;
  assert.ok(c.finishOrCashOut().ok);
  assert.equal(c.history[0].type, 'cashout');
  assert.ok(c.enemies[0].hp + c.enemies[0].guard < hp);
  assert.equal(c.phase, 'RECOVER');
});

test('when Flow runs out the combo drops after a basic attack, but counts as a Perfect after an arte', () => {
  const a = fixed(['scrapline', 'rivet_jab'], [], { momentum: 4 });
  play(a, slot(a, 0));
  advance(a, RULES.FLOW_READ_GRACE + RULES.FLOW_INITIAL + 0.2);
  assert.equal(a.history[0].type, 'forced');
  assert.equal(a.momentum, 3, 'Weak +1, Dropped −2');
  const b = fixed(['piston_strike', 'scrapfall', 'sunderline'], [], { momentum: 4 });
  b.selectHero('V');
  play(b, slot(b, 0));
  play(b, slot(b, 1));
  assert.ok(b.combo, 'Sunderline is still affordable');
  advance(b, RULES.FLOW_INITIAL + RULES.FLOW_READ_GRACE + RULES.FLOW_REFUND + 1);
  assert.equal(b.history[0].type, 'perfect');
});

test('illegal taps during a combo stumble with a bounded penalty; the third ends it', () => {
  const c = fixed(['piston_strike', 'scrapline', 'rivet_jab'], ['pinprick'], { momentum: 3 });
  play(c, slot(c, 0));
  const bad = slot(c, 1);
  assert.equal(c.check(bad).reason, 'rank');
  const d0 = c.combo.deadline;
  c.playCard(bad);
  assert.ok(c.combo.deadline <= d0 - RULES.STUMBLE_FLOW + 1e-9);
  c.playCard(bad);
  c.playCard(bad);
  assert.equal(c.combo, null);
  assert.equal(c.history[0].type, 'forced');
  assert.ok(c.momentum >= 0);
});

test('Clean Exit ends the combo as a Cash Out and pays it out', () => {
  const c = fixed(['piston_strike', 'clean_exit'], [], { momentum: 2, enemies: ['foundry_warden'] });
  c.selectHero('V');
  play(c, slot(c, 0));
  const hp = c.enemies[0].hp + c.enemies[0].guard;
  play(c, slot(c, 1));
  assert.equal(c.history[0].type, 'cashout');
  assert.ok(c.drainEvents().some((e) => e.type === 'cashout'), 'the payout happened');
  assert.ok(c.enemies[0].hp + c.enemies[0].guard < hp - 10);
});

test('a Perfect pays +2 Momentum and a Churn charge, and the breather holds the enemies', () => {
  const c = fixed(['piston_strike', 'scrapfall'], ['scrapline'], { momentum: 0, enemies: ['rush_hound'] });
  c.selectHero('V');
  c.churn.charges = 1;
  play(c, slot(c, 0)); // +2
  play(c, slot(c, 1)); // −2
  assert.ok(c.finishChain().ok);
  assert.equal(c.history[0].type, 'perfect');
  assert.equal(c.momentum, 2);
  assert.equal(c.churn.charges, 2);
  c.enemies[0].atb = 0.3;
  advance(c, RULES.RECOVER.perfect * 0.8);
  assert.equal(c.enemies[0].atb, 0.3, 'enemies wait during the breather');
  advance(c, RULES.RECOVER.perfect * 0.2 + 0.3);
  assert.equal(c.phase, 'PRE');
  assert.ok(c.enemies[0].atb > 0.3);
});

// ── interference with the new hand ──
test('locks expire on combat time and freeze while paused; a locked arte cannot be played', () => {
  const c = mk({ enemies: ['wire_jammer'] });
  const e = c.enemies[0];
  e.atb = -100;
  c.lockCards(e, 1);
  const locked = c.hand.find((u) => u && c.isLocked(u));
  assert.ok(locked);
  assert.equal(c.check(locked).reason, 'locked');
  advance(c, 1.5);
  assert.ok(c.isLocked(locked));
  advance(c, 1.6);
  assert.ok(!c.isLocked(locked), 'lock expired after 3s of combat time');
});

test('Redact locks every arte in hand', () => {
  const c = fixed(['scrapfall', 'bolt_volley', 'scrapline', 'salvage'], [], { enemies: ['archive_censor'] });
  const e = c.enemies[0];
  e.intent = { key: 'redact', kind: 'lock', name: 'Redact', dmg: 0 };
  c.enemyAct(e);
  assert.deepEqual(c.hand.filter((u) => u && c.isLocked(u)).map((u) => c.def(u).id).sort(), ['bolt_volley', 'scrapfall']);
});

test('scramble shifts attack ranks and suits only (never support) and expires', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'salvage', 'mend_circuit'], [], { enemies: ['suit_scrambler'] });
  c.scrambleCards(c.enemies[0], 4, 'both');
  for (const u of Object.keys(c.temp)) assert.ok(['basic', 'arte'].includes(c.categoryOf(u)));
  advance(c, 5.1);
  assert.equal(Object.keys(c.temp).length, 0);
});

test('jammed slot refills from the draw pile after it expires', () => {
  const c = mk({ enemies: ['interference_mite'] });
  c.enemies[0].atb = -100;
  c.jamSlot(c.enemies[0], 4);
  const s = Number(Object.keys(c.jams)[0]);
  assert.equal(c.hand[s], null);
  advance(c, 4.1);
  assert.notEqual(c.hand[s], null);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('echo restriction: echoes repeat damage only', () => {
  const c = fixed(['scrapline'], [], { enemies: ['foundry_warden'] });
  play(c, slot(c, 0));
  const m = c.momentum;
  const rank = c.combo.rank;
  c.echo(0, 1.0);
  assert.equal(c.combo.rank, rank);
  assert.equal(c.momentum, m);
});

test('Shuffle Step replaces exactly the hand cards that cannot be played now', () => {
  const c = fixed(['shuffle_step', 'scrapfall', 'scrapline', 'rivet_jab', 'bolt_volley', 'salvage'], ['pinprick', 'tripwire', 'cold_start', 'junk_toss']);
  const keep = [slot(c, 2), slot(c, 3), slot(c, 5)];
  play(c, slot(c, 0));
  for (const u of keep) assert.ok(c.hand.includes(u), 'playable cards stay');
  assert.ok(!c.hand.some((u) => u && ['scrapfall', 'bolt_volley'].includes(c.def(u).id)), 'the artes (unplayable before a basic) were replaced');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

// ── shared party HP and individual Defense ──
const quiet = (extra) => { const c = mk(extra); for (const e of c.enemies) e.atb = -100; c.drainEvents(); return c; };

test('the party shares one HP pool: the sum of the three heroes, no knockouts', () => {
  const c = quiet();
  assert.equal(c.maxHp, 118);
  assert.equal(c.hp, 118);
  assert.equal(c.koMember, undefined, 'no knockout API');
  const e = c.enemies[0];
  c.hitParty(e, 'C', 30);
  c.hitParty(e, 'C', 30);
  assert.equal(c.hp, 58, 'Corvin has no Defense: two 30-damage hits cost 60 from the pool');
  for (const u of c.hand) if (u) assert.notEqual(c.check(u).reason, 'ko');
  assert.equal(c.phase !== 'END', true, 'a hero taking more than its old HP does not end anything');
});

test('Defense reduces a hit on that hero before Guard; minimum 1 damage', () => {
  const c = quiet();
  const e = c.enemies[0];
  const lose = (pid, n) => { const before = c.hp; c.hitParty(e, pid, n); return before - c.hp; };
  assert.equal(lose('V', 10), 7, 'Hessa 30%');
  assert.equal(lose('S', 20), 17, 'Pin 15%');
  assert.equal(lose('C', 10), 10, 'Corvin 0%');
  assert.equal(lose('V', 1), 1, 'minimum 1');
  c.guard = 5;
  assert.equal(lose('V', 10), 2, 'Defense first (10 → 7), then Guard 5');
  assert.equal(c.guard, 0);
  const evs = c.drainEvents().filter((x) => x.type === 'partyHit');
  assert.deepEqual(evs.map((x) => x.who), ['V', 'S', 'C', 'V', 'V']);
  const last = evs.at(-1);
  assert.deepEqual([last.who, last.amount, last.blocked, last.src], ['V', 2, 5, e.uid]);
});

test('an area attack applies each hero\'s Defense once and Guard once to the total', () => {
  const c = quiet();
  const e = c.enemies[0];
  c.hitAll(e, 10);
  assert.equal(c.hp, 118 - (7 + 9 + 10));
  c.guard = 20;
  const absorbed = c.stats.guardAbsorbed;
  c.hitAll(e, 10);
  assert.equal(c.hp, 118 - 26 - 6, 'Guard 20 absorbs 20 of the 26 once');
  assert.equal(c.guard, 0);
  assert.equal(c.stats.guardAbsorbed - absorbed, 20);
  const hits = c.drainEvents().filter((x) => x.type === 'partyHit');
  assert.equal(hits.length, 6, 'one partyHit per hero per area attack');
  assert.equal(hits.slice(3).reduce((a, x) => a + x.amount + x.blocked, 0), 26, 'parts add up, nothing counted twice');
});

test('Cover: Hessa\'s Guard card redirects single-target hits to her; area attacks are not redirected', () => {
  const c = new Combat({ deck: deck(Array(14).fill('salvage')), party: PARTY.map((p) => ({ ...p })), enemies: ['iron_maw'], seed: 3, act: 1 });
  for (const e of c.enemies) e.atb = -100;
  assert.equal(c.coverActive(), false);
  play(c, legal(c)[0]);
  assert.equal(c.combo, null, 'a support card does not start a combo');
  assert.equal(c.coverActive(), true, 'a resolved Hessa Guard card starts Cover');
  assert.ok(c.drainEvents().some((x) => x.type === 'cover'));
  c.guard = 0;
  const e = c.enemies[0];
  let before = c.hp;
  c.hitParty(e, 'C', 10);
  assert.equal(before - c.hp, 7, 'the hit aimed at Corvin lands on Hessa and uses her 30%');
  const evs = c.drainEvents();
  assert.ok(evs.some((x) => x.type === 'covered' && x.who === 'V' && x.from === 'C'));
  assert.equal(evs.find((x) => x.type === 'partyHit').who, 'V');
  before = c.hp;
  c.hitAll(e, 10);
  assert.equal(before - c.hp, 26, 'area attack: each hero still takes their own share');
  c.t = c.coverUntil + 0.01;
  before = c.hp;
  c.hitParty(e, 'C', 10);
  assert.equal(before - c.hp, 10, 'Cover expires');
});

test('pierce ignores Guard but not Defense; reflected and self damage ignore both', () => {
  const c = quiet();
  const e = c.enemies[0];
  c.guard = 50;
  let before = c.hp;
  c.hitParty(e, 'V', 10, { pierce: true });
  assert.equal(before - c.hp, 7);
  assert.equal(c.guard, 50);
  before = c.hp;
  c.hitParty(e, 'V', 10, { reflect: true, pierce: true });
  assert.equal(before - c.hp, 10);
});

test('enemies that went for the most hurt hero now pick the lowest Defense; others favour Hessa', () => {
  const c = quiet({ enemies: ['predator_needle', 'iron_maw'] });
  const [needle, maw] = c.enemies;
  for (let i = 0; i < 20; i++) assert.equal(c.pickTargetMember(needle).id, 'C');
  const n = { V: 0, C: 0, S: 0 };
  for (let i = 0; i < 400; i++) n[c.pickTargetMember(maw).id]++;
  assert.ok(n.V > n.C && n.V > n.S, JSON.stringify(n));
});

test('healing restores the pool up to max HP; Tuning Fork heals the party on a Perfect', () => {
  const c = quiet();
  c.hp = 50;
  c.healParty(30);
  assert.equal(c.hp, 80);
  c.healParty(500);
  assert.equal(c.hp, 118);
  const h = c.drainEvents().filter((x) => x.type === 'heal');
  assert.deepEqual(h.map((x) => [x.who, x.amount]), [['party', 30], ['party', 38]]);
});

test("Dead Man's Switch fires once, when party HP first falls below 25%", () => {
  const c = quiet({ relics: ['dead_mans_switch'] });
  const e = c.enemies[0];
  const ehp = e.hp + e.guard;
  c.hp = 40;
  c.hitParty(e, 'C', 5);
  assert.equal(c.momentum, 0, 'still above 25%');
  c.hitParty(e, 'C', 10);
  assert.equal(c.hp, 25);
  assert.ok(e.hp + e.guard <= ehp - 15, '15 to all enemies');
  assert.equal(c.momentum, 5);
  c.hitParty(e, 'C', 5);
  assert.equal(c.momentum, 5, 'only once per battle');
});

test('defeat when the pool reaches 0; the outcome reports the pool', () => {
  const c = quiet();
  c.hp = 5;
  c.hitParty(c.enemies[0], 'V', 40);
  assert.equal(c.phase, 'END');
  assert.equal(c.result.victory, false);
  assert.deepEqual([c.outcome().hp, c.outcome().maxHp], [0, 118]);
  assert.equal(c.outcome().party, undefined);
});

// ── Phase 4 support with Phase 3 survival ──
test('Braced: +20% Defense on the hero an enemy is aiming at (by default), visible in the damage, capped, and it expires', () => {
  const c = fixed(['hold_the_line', 'scrapline'], ['pinprick'], { momentum: 1 });
  const e = c.enemies[0];
  e.intent = { ...e.intent, kind: 'atk', dmg: 10, target: 'C' };
  e.atb = 0.5;
  play(c, slot(c, 0));
  e.atb = -100;
  assert.ok(c.member('C').st.braced > c.t, 'Corvin, the one aimed at, is Braced');
  assert.ok(c.drainEvents().some((x) => x.type === 'partyStatus' && x.kind === 'braced' && x.who === 'C'));
  assert.equal(c.defenseOf(c.member('C')), 0.2);
  let before = c.hp;
  c.hitParty(e, 'C', 10);
  assert.equal(before - c.hp, 8, 'Corvin 0% + 20%: 10 → 8');
  c.member('V').st.braced = c.t + 5;
  assert.equal(c.defenseOf(c.member('V')), 0.5, 'Hessa 30% + 20%');
  c.member('V').def = 0.5;
  assert.equal(c.defenseOf(c.member('V')), RULES.DEFENSE_CAP, 'capped at 60%');
  c.member('V').def = 0.3;
  advance(c, 10);
  assert.equal(c.defenseOf(c.member('C')), 0, 'expired on combat time');
  before = c.hp;
  c.hitParty(e, 'C', 10);
  assert.equal(before - c.hp, 10);
});

test("Hessa's Guard support grants Guard and starts Cover; Corvin's heal fills the pool, never above max", () => {
  const c = fixed(['salvage', 'mend_circuit', 'scrapline'], ['pinprick', 'tripwire'], { momentum: 2 });
  c.hp = 120;
  play(c, slot(c, 0));
  assert.ok(c.guard >= 5);
  assert.ok(c.coverActive());
  play(c, slot(c, 1));
  assert.equal(c.hp, c.maxHp);
});

// ── beta-feedback pacing under the Phase 5 decision window ──
test('Flow holds while the first card executes and for the read hold after it, without shortening the combo', () => {
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick']);
  c.playCard(slot(c, 0));
  const start = c.combo.start;
  assert.ok(Math.abs(c.flowLeft() - RULES.FLOW_INITIAL) < 1e-9);
  settle(c); // executing: held
  assert.ok(Math.abs(c.flowLeft() - RULES.FLOW_INITIAL) < 0.02, `held during execution: ${c.flowLeft()}`);
  const left0 = c.flowLeft();
  assert.ok(c.flowHeld(), 'the read hold follows the first card');
  advance(c, RULES.FLOW_READ_GRACE * 0.8);
  assert.ok(Math.abs(c.flowLeft() - left0) < 0.02, `held: ${left0} -> ${c.flowLeft()}`);
  advance(c, RULES.FLOW_READ_GRACE * 0.2 + 1);
  assert.ok(!c.flowHeld());
  assert.ok(c.flowLeft() < left0 - 0.9, 'drains after the hold');
  assert.ok(Math.abs(c.flowCap() - (start + RULES.ACTION_TIME + RULES.FLOW_READ_GRACE + RULES.FLOW_ABS_MAX)) < 0.05, 'the cap moves with every hold');
});

test('natural refunds are capped per combo and the combo never exceeds its cap', () => {
  const c = fixed(['scrapline'], [], { relics: ['brass_metronome'] });
  play(c, slot(c, 0));
  const combo = c.combo;
  for (let i = 0; i < 20; i++) c.naturalRefund(1);
  assert.ok(combo.refundUsed <= RULES.FLOW_REFUND_MAX + 1e-9);
  c.momentum = 30;
  for (let i = 0; i < 10; i++) c.spendMomentumFlow();
  c.addFlow(10);
  assert.ok(combo.deadline <= c.flowCap() + 1e-9);
});

test('the Flow rules give a learning player time for a five-card combo', () => {
  const c = fixed(['scrapline'], []);
  play(c, slot(c, 0));
  advance(c, RULES.FLOW_READ_GRACE);
  for (let i = 0; i < 4; i++) {
    advance(c, 1.3);
    assert.ok(c.combo, `combo still running before card ${i + 2}`);
    c.naturalRefund(c.combo.cards.length);
  }
  assert.ok(c.flowLeft() > 1.5, `Flow left after five cards: ${c.flowLeft().toFixed(2)}s`);
});

test('Flow holds while a command executes (its real duration), but not after a wrong card', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapline', 'piston_strike'], ['pinprick', 'tripwire']);
  play(c, slot(c, 0));
  advance(c, RULES.FLOW_READ_GRACE + 0.5);
  c.playCard(slot(c, 1));
  assert.ok(c.flowHeld(), 'held while the card executes');
  const left = c.flowLeft();
  advance(c, RULES.ACTION_TIME * 0.8);
  assert.ok(Math.abs(c.flowLeft() - (left + RULES.FLOW_REFUND)) < 0.02, 'nothing counted down; the refund arrived when the card resolved');
  advance(c, RULES.ACTION_TIME * 0.2 + 0.3);
  assert.ok(!c.flowHeld());
  assert.ok(c.flowLeft() < left + RULES.FLOW_REFUND - 0.2, 'counting down again after the execution');
  c.playCard(slot(c, 2)); // Weak 1 after Medium 2: a stumble
  assert.ok(!c.flowHeld(), 'a stumble does not hold Flow');
});

test('enemies never act within ENEMY_SPACING of each other', () => {
  const c = mk({ enemies: ['rush_hound', 'rush_hound', 'interference_mite'] });
  for (const e of c.enemies) e.atb = 0.99;
  const acts = [];
  for (let i = 0; i < 600; i++) { c.update(1 / 60); for (const ev of c.drainEvents()) if (ev.type === 'enemyAct') acts.push(ev.t); }
  assert.ok(acts.length >= 3, `${acts.length} actions`);
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i] - acts[i - 1] >= RULES.ENEMY_SPACING - 1e-6, `gap ${acts[i] - acts[i - 1]}`);
});

test('enemies advance before a combo and wait during the breather after one', () => {
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick'], { enemies: ['rush_hound'] });
  c.enemies[0].atb = 0;
  advance(c, 1.0);
  assert.ok(c.enemies[0].atb > 0, 'ATB advances in PRE');
  play(c, slot(c, 0));
  advance(c, RULES.FLOW_READ_GRACE + RULES.FLOW_INITIAL + 0.1); // the combo drops
  assert.equal(c.phase, 'RECOVER');
  const atb = c.enemies[0].atb;
  advance(c, RULES.RECOVER.forced * 0.8);
  assert.equal(c.enemies[0].atb, atb);
  advance(c, RULES.RECOVER.forced * 0.2 + 0.5);
  assert.equal(c.phase, 'PRE');
  assert.ok(c.enemies[0].atb > atb);
});

test('enemy pace is set per act and keeps fast and slow enemies apart', () => {
  const rate = (act, id) => { const c = mk({ enemies: [id], opts: { act } }); const e = c.enemies[0]; return c.enemySpeed(e) / e.actTime; };
  assert.ok(rate(1, 'rush_hound') < rate(3, 'rush_hound'));
  assert.ok(rate(1, 'rush_hound') > rate(1, 'iron_maw'));
});

test('a stranded hand (nothing playable before a combo) Churns for free until something is playable', () => {
  const c = fixed(['scrapfall', 'thermal_lance', 'bolt_volley', 'sunderline', 'last_word', 'ladder_peak'], ['scrapline', 'rivet_jab'], { momentum: 0 });
  c.churn.charges = 0;
  assert.equal(c.stranded(), true, 'six artes and no basic attack');
  const r = c.churnCard(slot(c, 0));
  assert.ok(r.ok, 'Churn works without charges');
  assert.equal(c.churn.charges, 0);
  assert.equal(c.stats.strandedChurns, 1);
  assert.equal(c.categoryOf(slot(c, 0)), 'basic', 'the previewed basic attack arrived');
  assert.equal(c.stranded(), false, 'a basic attack is playable again');
  assert.equal(c.churnCard(slot(c, 1)).ok, false, 'normal Churn costs apply again');
});
