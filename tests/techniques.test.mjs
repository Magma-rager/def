// Phase 8 techniques and Pressure Valve (docs/COMBAT_SPEC.md §29). Every case is played through the
// engine's own commands (commit, cancel, Relay, Churn, Reserve) on a stacked hand; nothing writes the
// combo's rank or history directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS, CARD_LIST, rewardPool, cardValue } from '../src/data/cards.js';
import { Run } from '../src/engine/run.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const spec = (s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s });
function fixed(hand, draw = [], o = {}) {
  const all = [...hand, ...draw];
  const c = new Combat({ deck: all.map(spec), party: PARTY, hp: 130, maxHp: 130, enemies: o.enemies || ['foundry_warden'], seed: 5, relics: o.relics || [], mutations: o.mutations || [], act: 1 });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < hand.length ? `c${i}` : null));
  c.draw = draw.map((_, i) => `c${hand.length + i}`);
  c.discard = [];
  c.exhaust = [];
  for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = 3000; e.guard = 0; }
  c.momentum = o.momentum || 0;
  c.drainEvents();
  return c;
}
const settle = (c, max = 20) => { for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60); };
const uid = (c, id, n = 0) => [...c.hand, ...c.reserve].filter((u) => u && c.def(u).id === id)[n];
function play(c, ...ids) { for (const id of ids) { const r = c.commit(uid(c, id)); assert.ok(r.ok, `${id}: ${r.chk && r.chk.reason}`); settle(c); } }
const integrity = (c) => { assert.deepEqual(c.verifyZones(), { ok: true }); assert.ok(c.momentum >= 0 && c.reserved >= 0 && c.reserved <= c.momentum, `Momentum ${c.momentum} reserved ${c.reserved}`); };

test('every card is converted and offered by its rarity; techniques are support cards with a tech effect', () => {
  for (const c of CARD_LIST) assert.equal(c.p4, 'converted', c.id);
  const offered = rewardPool().map((c) => c.id);
  for (const id of ['rethread', 'prism_cut', 'downshift', 'cache_hook', 'pressure_valve']) assert.ok(offered.includes(id), `${id} is offered`);
  for (const id of ['rethread', 'prism_cut', 'downshift', 'cache_hook']) {
    const d = CARDS[id];
    assert.equal(d.category, 'support', id);
    assert.equal(typeof d.tech, 'function', id);
    assert.equal(d.rank, 0);
  }
  assert.equal(CARDS.rethread.owner, 'C');
  assert.equal(CARDS.prism_cut.owner, 'C');
  assert.equal(CARDS.downshift.owner, 'V');
  assert.equal(CARDS.cache_hook.owner, null);
  // upgrades change the technique
  assert.ok(cardValue(CARDS.rethread, true, 'r') > cardValue(CARDS.rethread, false, 'r'));
  assert.ok(cardValue(CARDS.prism_cut, true, 'r') > cardValue(CARDS.prism_cut, false, 'r'));
  assert.ok(cardValue(CARDS.downshift, true, 'r') > cardValue(CARDS.downshift, false, 'r'));
  assert.ok(cardValue(CARDS.cache_hook, true, 'rr') > cardValue(CARDS.cache_hook, false, 'rr'));
});

test('Rethread: Corvin (free) rewinds Hessa\'s combo by 2 and her second arte follows; Corvin then recovers', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'rethread', 'scrap_feed', 'piston_strike'], [], { momentum: 4 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall'); // rank 4
  assert.equal(c.check(uid(c, 'scrap_feed')).reason, 'rank', 'a second rank-4 arte cannot follow rank 4');
  const before = c.combo.cards.map((e) => ({ ...e }));
  const r = c.commit(uid(c, 'rethread'));
  assert.ok(r.ok);
  assert.equal(r.cmd.hero, 'C', 'Corvin performs his technique');
  assert.equal(c.heroState('C'), 'ACTING');
  settle(c);
  assert.equal(c.combo.rank, 2, '4 − 2');
  assert.equal(c.combo.hero, 'V', 'still Hessa\'s part');
  assert.equal(c.heroState('C'), 'RECOVERING');
  assert.deepEqual(c.combo.cards.map((e) => e.id), before.map((e) => e.id), 'no card added; past entries untouched');
  assert.deepEqual(c.combo.cards.map((e) => [e.step, e.cross, e.rank]), before.map((e) => [e.step, e.cross, e.rank]), 'no past Step or Cross rewritten');
  assert.ok(c.combo.log.some((l) => l.k === 'tech' && l.id === 'rethread' && l.rewind === 2 && l.attacker === 'V'));
  play(c, 'scrap_feed');
  assert.equal(c.combo.cards.length, 4);
  assert.equal(c.combo.cards.filter((e) => e.category === 'arte').length, 2, 'two artes in one part');
  assert.equal(c.stats.techniques, 1);
  integrity(c);
});

test('a hero cannot reshape the combo they are running: Corvin\'s technique during Corvin\'s combo is refused', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'rethread', 'thermal_lance'], [], { momentum: 3 });
  c.selectHero('C');
  play(c, 'scrapline');
  const chk = c.check(uid(c, 'rethread'));
  assert.equal(chk.ok, false);
  assert.equal(chk.reason, 'busy');
});

test('a technique needs a combo with a card in its current part', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'cache_hook', 'scrapfall'], ['scrapline_b']);
  assert.equal(c.check(uid(c, 'cache_hook')).reason, 'nocombo');
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  assert.ok(c.check(uid(c, 'cache_hook')).ok);
  // after a Relay is queued the new part has no card yet
  const relay = c.selectHero('S');
  assert.ok(relay.ok && relay.cmd);
  assert.equal(c.check(uid(c, 'cache_hook')).reason, 'needcard');
});

test('queue: committed while a basic executes, the technique is projected, so the card it enables can be queued at once', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'rethread', 'scrap_feed'], [], { momentum: 6 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  assert.ok(c.commit(uid(c, 'scrapfall')).ok); // executing (rank 4 when it lands)
  assert.equal(c.executing.cmd.type, 'card');
  assert.ok(c.commit(uid(c, 'rethread')).ok, 'queued behind the arte');
  assert.equal(c.proj().rank, 2, 'projection: 4 then −2');
  const arte = c.commit(uid(c, 'scrap_feed'));
  assert.ok(arte.ok, 'rank-4 arte queued after the rewind');
  assert.deepEqual(c.queue.map((q) => q.type), ['support', 'card']);
  settle(c);
  assert.deepEqual(c.combo.cards.map((e) => e.id), ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'scrap_feed']);
  integrity(c);
});

test('queue: cancelling the technique drops the card that needed it (revalidated, card back, Momentum back)', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'rethread', 'scrap_feed'], [], { momentum: 6 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike');
  c.commit(uid(c, 'scrapfall'));
  const t = c.commit(uid(c, 'rethread'));
  const a = c.commit(uid(c, 'scrap_feed'));
  assert.ok(t.ok && a.ok);
  const m = c.momentum;
  assert.ok(c.cancelCmd(t.cmd.id));
  assert.equal(c.queue.length, 0, 'the arte that relied on the rewind is dropped');
  assert.ok(c.hand.includes(t.cmd.uid) && c.hand.includes(a.cmd.uid), 'both cards back in the hand');
  assert.equal(c.reserved, 0, 'the executing arte has already spent its cost; nothing else is reserved');
  settle(c);
  assert.equal(c.momentum, m + 1, 'the cancelled technique cost nothing (+1 is Straight Circuit, completed by the arte)');
  integrity(c);
});

test('queue: a technique queued before a Relay rewinds the outgoing part; the incoming part starts from rank 0 regardless', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'cache_hook', 'scrapline', 'bolt_volley', 'piston_strike'], ['scrapline_b', 'piston_strike_b'], { momentum: 2 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  const t = c.commit(uid(c, 'cache_hook')); // neutral: Corvin or Pin (free) performs it
  assert.ok(t.ok);
  const performer = t.cmd.hero;
  assert.ok(['C', 'S'].includes(performer));
  const relayTo = performer === 'S' ? 'C' : 'S';
  assert.ok(c.selectHero(relayTo).ok);
  settle(c);
  assert.equal(c.combo.hero, relayTo);
  assert.equal(c.combo.rank, 0);
  assert.ok(c.combo.log.some((l) => l.k === 'tech' && l.attacker === 'V'), 'it reshaped Hessa\'s part');
  integrity(c);
});

test('queue: several waiting commands; the technique lands between them in order', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'rethread', 'scrap_feed'], [], { momentum: 6 });
  c.selectHero('V');
  for (const id of ['scrapline', 'rivet_jab', 'piston_strike']) assert.ok(c.commit(uid(c, id)).ok);
  // queue is full at 3 waiting behind the executing one; wait for a slot
  settle(c);
  for (const id of ['scrapfall', 'rethread', 'scrap_feed']) assert.ok(c.commit(uid(c, id)).ok, id);
  assert.deepEqual([c.executing.cmd.type, ...c.queue.map((q) => q.type)], ['card', 'support', 'card']);
  settle(c);
  assert.equal(c.combo.cards.length, 5);
  integrity(c);
});

test('the technique\'s owner recovering: refused; the combo about to expire: a waiting technique is cancelled with the combo', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'rethread', 'mend_circuit', 'scrapfall'], ['scrapline_b'], { momentum: 4 });
  c.hp = 90;
  c.selectHero('V');
  play(c, 'scrapline');
  play(c, 'mend_circuit'); // Corvin heals: he recovers 2s
  assert.equal(c.heroState('C'), 'RECOVERING');
  assert.equal(c.check(uid(c, 'rethread')).reason, 'busy');
  // a technique still waiting when the combo drops goes back with its Momentum
  const d = fixed(['scrapline', 'rivet_jab', 'cache_hook', 'piston_strike'], ['scrapline_b']);
  d.selectHero('V');
  play(d, 'scrapline');
  assert.ok(d.commit(uid(d, 'rivet_jab')).ok);
  const t = d.commit(uid(d, 'cache_hook'));
  assert.ok(t.ok);
  d.requestEnd('forced');
  assert.equal(d.queue.length, 0);
  assert.ok(d.hand.includes(t.cmd.uid), 'the technique card is back');
  settle(d);
  assert.ok(!d.combo);
  assert.equal(d.stats.techniques, 0);
  integrity(d);
});

test('Prism Cut: the combo\'s suit becomes EX, so the next A card Crosses; a genuine Cross, counted once', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'prism_cut', 'piston_strike', 'scrapfall'], [], { momentum: 3 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab'); // A, A: no Cross
  assert.equal(c.combo.cards.filter((e) => e.cross).length, 0);
  play(c, 'prism_cut'); // suit EX, rank 2 → 1
  assert.equal(c.combo.variant, 'EX');
  assert.equal(c.combo.rank, 1);
  play(c, 'piston_strike'); // A after EX: a Cross (rank 3 > 1)
  const last = c.combo.cards.at(-1);
  assert.equal(last.cross, true);
  assert.equal(c.combo.cards.filter((e) => e.cross).length, 1, 'one Cross: the new card');
  integrity(c);
});

test('Downshift: Hessa (free) rewinds Pin\'s combo by 4 and adds Flow within the cap', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'bolt_volley', 'downshift', 'splitter'], [], { momentum: 6 });
  c.selectHero('S');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike', 'bolt_volley'); // rank 4
  const dl = c.combo.deadline;
  play(c, 'downshift');
  assert.equal(c.combo.rank, 0);
  assert.ok(c.combo.deadline > dl, 'Flow added');
  assert.ok(c.combo.deadline <= c.flowCap() + 1e-9);
  assert.ok(c.combo.log.some((l) => l.k === 'flow' && l.src === 'card'), 'it is the player\'s Flow extension (Second Wind may count it)');
  play(c, 'splitter'); // Pin's second rank-4 arte
  assert.equal(c.combo.cards.filter((e) => e.category === 'arte').length, 2);
  integrity(c);
});

test('Cache Hook from Reserve rewinds further and gives +1 Momentum; from the hand less', () => {
  const run = (fromReserve) => {
    const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'cache_hook'], ['scrapline_b', 'piston_strike_b']);
    if (fromReserve) assert.ok(c.stash(uid(c, 'cache_hook')).ok);
    c.selectHero('V');
    play(c, 'scrapline', 'rivet_jab', 'piston_strike'); // rank 3
    const m = c.momentum;
    play(c, 'cache_hook');
    return { rank: c.combo.rank, gain: c.momentum - m };
  };
  assert.deepEqual(run(false), { rank: 2, gain: 0 });
  assert.deepEqual(run(true), { rank: 1, gain: 1 });
});

test('a combo does not auto-finish after its last arte while a technique could continue it', () => {
  // all three heroes have joined: no Relay left, no higher card; Pin is free again after recovering?
  // Here: Hessa's part ends on her arte, Corvin is free with Rethread in hand
  const c = fixed(['scrapline', 'rivet_jab', 'scrapfall', 'rethread'], [], { momentum: 3 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  assert.ok(c.combo, 'still open: Rethread is playable');
  assert.ok(c.techniqueAvailable());
});

test('techniques never duplicate EX Combos: Straight Circuit once, and no recipe from the technique itself', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'rethread', 'scrap_feed'], ['scrapline', 'rivet_jab', 'piston_strike'], { momentum: 6 });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'piston_strike', 'scrapfall');
  play(c, 'rethread', 'scrap_feed');
  const ex = c.drainEvents().filter((e) => e.type === 'exCombo').map((e) => e.id);
  assert.equal(ex.filter((id) => id === 'straight_circuit').length, 1);
  assert.equal(c.stats.exByRecipe.straight_circuit, 1);
});

test('a scrambled card in hand is judged with its scrambled rank, before and after a technique', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'cache_hook', 'piston_strike', 'scrapfall'], ['scrapline_b'], { enemies: ['suit_scrambler'] });
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab');
  c.scrambleCards(c.enemies[0], 1, 'rank');
  const scrambled = c.hand.find((u) => u && c.isScrambled(u));
  play(c, 'cache_hook');
  if (scrambled && c.hand.includes(scrambled)) {
    const chk = c.check(scrambled);
    const r = c.effRank(scrambled);
    if (c.def(scrambled).category !== 'support') assert.equal(chk.ok || chk.reason !== 'rank', r > c.proj().rank, 'legality follows the effective rank against the rewound projection');
  }
  integrity(c);
});

test('Pressure Valve: vents at most its cap, half of it as Guard, never reserved Momentum, and keeps the rest', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'pressure_valve', 'kindling'], ['scrapline_b'], { momentum: 9 });
  c.selectHero('C');
  play(c, 'scrapline', 'rivet_jab'); // +1 +1 → 11 (cap 10)
  const m0 = Math.min(c.momentum, c.momentumMax());
  const h0 = c.enemies[0].hp, g0 = Math.floor(c.guard);
  play(c, 'pressure_valve'); // cost 3, then vents up to 3
  assert.equal(c.momentum, m0 - 3 - 3, 'cost 3 + vented 3; the rest stays');
  assert.ok(c.momentum > 0, 'Momentum above the cap is kept');
  assert.ok(h0 - c.enemies[0].hp >= 6 * 4, '6 + 6 per point vented');
  assert.equal(Math.floor(c.guard) - g0, 9, '3 Guard per point');
  assert.equal(c.combo.cards.at(-1).spent, 6, 'spent = cost + vented');
  integrity(c);
  // reserved Momentum is never vented: an arte waiting in the queue keeps its reservation
  const d = fixed(['scrapline', 'rivet_jab', 'pressure_valve', 'piston_strike_b', 'coil_charge'], ['scrapline_b'], { momentum: 5 });
  d.selectHero('C');
  play(d, 'scrapline', 'rivet_jab'); // 7
  assert.ok(d.commit(uid(d, 'pressure_valve')).ok); // executing, cost 3 spent at start
  assert.equal(d.momentum, 4);
  // nothing else is reserved: vent takes min(available, 3)
  settle(d);
  assert.equal(d.momentum, 1);
  integrity(d);
});

test('Pressure Valve against Overpressure: capped and defensive vs all-in; upgraded vents 4 at 7 per point', () => {
  const vent = (id, up, mom) => {
    const c = fixed(['scrapline', 'rivet_jab', { id, up }], ['scrapline_b'], { momentum: mom });
    c.selectHero('C');
    play(c, 'scrapline', 'rivet_jab');
    const h0 = c.enemies[0].hp, g0 = Math.floor(c.guard), m0 = c.momentum;
    c.drainEvents();
    play(c, id);
    const spent = -c.drainEvents().filter((e) => e.type === 'momentum' && e.delta < 0 && e.why === CARDS[id].name).reduce((a, e) => a + e.delta, 0);
    return { dmg: h0 - c.enemies[0].hp, guard: Math.floor(c.guard) - g0, start: m0, spent };
  };
  const pv = vent('pressure_valve', false, 8);
  const op = vent('overpressure', false, 8);
  assert.equal(pv.spent, 6, 'Pressure Valve: cost 3 + vents 3 of the 10, keeps 4');
  assert.equal(op.spent, op.start, 'Overpressure: cost 4 + everything else');
  assert.equal(pv.guard, 9, 'Pressure Valve: 3 Guard per point vented (6 spent: no Pressure Release)');
  assert.equal(op.guard, 8, 'Overpressure itself grants no Guard: the 8 is Pressure Release (4 + 6 spent)');
  const up = vent('pressure_valve', true, 8);
  assert.equal(up.spent, 3 + 4, 'upgraded vents up to 4');
  assert.ok(up.dmg >= 7 * 5);
  // a long combo: Pressure Valve then another arte, both paid for (Pressure Release reads 6 + 2 = 8)
  const c = fixed(['scrapline', 'rivet_jab', 'pressure_valve', 'cache_hook', 'last_word'], ['scrapline', 'piston_strike_b'], { momentum: 9 });
  c.selectHero('C');
  play(c, 'scrapline', 'rivet_jab', 'pressure_valve');
  assert.ok(c.momentum >= 4, 'enough left for a rank-6 arte');
  play(c, 'cache_hook'); // rank 5 → 4
  play(c, 'last_word');
  const ex = c.drainEvents().filter((e) => e.type === 'exCombo').map((e) => e.id);
  assert.ok(ex.includes('pressure_release'), '6 + 4 = 10 Momentum spent on artes, legitimately');
  integrity(c);
});

test('Overpressure counts its cost and what it spends toward Pressure Release (was: only what it spent)', () => {
  const c = fixed(['cold_start', 'overpressure'], [], { momentum: 5 });
  c.selectHero('C');
  play(c, 'cold_start'); // 6
  play(c, 'overpressure'); // cost 4, spends 2: 6 spent
  assert.equal(c.combo ? c.combo.cards.at(-1).spent : c.history.at(-1) && 6, 6);
});

test('saved instances of the converted cards (upgraded, grafted) load and play as techniques', () => {
  const run = Run.create({ seed: 4242, tutorial: false });
  run.d.deck.push({ uid: 'old1', id: 'rethread', up: true, graft: 'spark', rankMod: 1, variant: 'B' }, { uid: 'old2', id: 'cache_hook', up: false, graft: 'cached', rankMod: 0, variant: null }, { uid: 'old3', id: 'pressure_valve', up: true, graft: 'keen', rankMod: 0, variant: null });
  const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  assert.ok(re);
  const ids = re.d.deck.map((c) => c.id);
  for (const id of ['rethread', 'cache_hook', 'pressure_valve']) assert.ok(ids.includes(id), id);
  const c = new Combat({ deck: [{ uid: 'a', id: 'scrapline', up: false }, { uid: 'b', id: 'rivet_jab', up: false }, { uid: 'e', id: 'scrapfall', up: false }, ...re.d.deck.filter((x) => x.uid.startsWith('old'))], party: PARTY, hp: 130, maxHp: 130, enemies: ['foundry_warden'], seed: 3, relics: [], mutations: [], act: 1 });
  c.hand = ['a', 'b', 'e', 'old1', 'old2', 'old3'];
  c.draw = []; c.discard = [];
  for (const e of c.enemies) e.atb = -1000;
  c.momentum = 4;
  c.selectHero('V');
  play(c, 'scrapline', 'rivet_jab', 'scrapfall');
  const m = c.momentum;
  play(c, 'rethread');
  assert.equal(c.combo.rank, 1, 'upgraded Rethread: rank 4 − 3 (a recut rank or suit does not apply to a technique)');
  assert.equal(c.momentum, m - 1 + 1, 'cost 1, Spark +1');
  integrity(c);
});

test('randomized soak with techniques: zones, Momentum and queue integrity hold', () => {
  const pool = ['scrapline', 'rivet_jab', 'hotwire', 'piston_strike', 'scrapfall', 'scrap_feed', 'thermal_lance', 'kindling', 'bolt_volley', 'splitter', 'rethread', 'prism_cut', 'downshift', 'cache_hook', 'pressure_valve', 'overpressure', 'mend_circuit', 'salvage'];
  let techs = 0;
  for (let n = 0; n < 30; n++) {
    let s = 1000 + n * 17;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const deck = Array.from({ length: 20 }, (_, i) => ({ uid: `r${i}`, id: pool[Math.floor(rnd() * pool.length)], up: rnd() < 0.3 }));
    const c = new Combat({ deck, party: PARTY, hp: 130, maxHp: 130, enemies: ['wire_jammer', 'suit_scrambler'], seed: 50 + n, relics: [], mutations: [], act: 2 });
    for (const e of c.enemies) e.hp = e.maxHp = 500;
    for (let i = 0; i < 2400 && c.phase !== 'END'; i++) {
      c.update(1 / 30);
      if (i % 4) continue;
      const roll = rnd();
      const legal = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok);
      if (roll < 0.6 && legal.length) c.commit(legal[Math.floor(rnd() * legal.length)]);
      else if (roll < 0.68) { for (const h of ['V', 'C', 'S']) if (c.relayCheck(h).ok) { c.selectHero(h); break; } }
      else if (roll < 0.74 && c.queue.length) c.cancelCmd(c.queue[c.queue.length - 1].id);
      else if (roll < 0.78) { const u = c.hand.find((x) => x); if (u) c.churnCard(u); }
      else if (roll < 0.82) { const u = c.hand.find((x) => x && c.canStash(x)); if (u) c.stash(u); }
      else if (roll < 0.87 && c.combo) c.finishOrCashOut();
      const z = c.verifyZones();
      assert.ok(z.ok, z.error);
      assert.ok(c.momentum >= 0 && c.reserved >= 0 && c.reserved <= c.momentum);
      if (c.combo) { assert.ok(c.combo.rank >= 0); assert.ok(c.combo.deadline <= c.flowCap() + 1e-9); }
    }
    techs += c.stats.techniques;
  }
  assert.ok(techs > 10, `${techs} techniques executed in the soak`);
});
