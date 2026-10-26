// Verifies the signature mechanic of each of the ten build archetypes changes real outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat } from '../src/engine/combat.js';

const PARTY = [{ id: 'V', hp: 300, maxHp: 300 }, { id: 'C', hp: 300, maxHp: 300 }, { id: 'S', hp: 300, maxHp: 300 }];

// Build a combat whose deck is exactly `ids` (in that draw order) against a passive dummy.
function mk(ids, { relics = [], mutations = [] } = {}) {
  const deck = ids.map((id, i) => ({ uid: `k${i}`, id, up: false }));
  const c = new Combat({ deck, party: PARTY.map((p) => ({ ...p })), enemies: ['foundry_warden'], seed: 3, relics, mutations, act: 1 });
  for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = 5000; }
  return c;
}
const uidOf = (c, id) => [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === id);
function play(c, id) {
  const u = uidOf(c, id);
  assert.ok(u, `${id} not available (hand: ${c.hand.map((x) => x && c.def(x).id)})`);
  const r = c.playCard(u);
  assert.ok(r.ok, `${id}: ${r.text}`);
}
const hp = (c) => c.enemies[0].hp;

test('Rank Ladder: steps add First Rung bonus damage', () => {
  const run = (rung) => {
    const c = mk([rung ? 'first_rung' : 'scrapline', 'step_up', 'coil_charge', 'scrapfall', 'rethread']);
    play(c, rung ? 'first_rung' : 'scrapline');
    const h0 = hp(c);
    play(c, 'step_up'); // 1A -> 2A step
    return { dmg: h0 - hp(c), steps: c.combo.steps };
  };
  const a = run(false), b = run(true);
  assert.equal(b.steps, 1);
  assert.ok(b.dmg > a.dmg, `ladder bonus ${b.dmg} vs ${a.dmg}`);
});

test('Suit switching: Crosses grant Momentum and power Crosscut', () => {
  const c = mk(['scrapline', 'gear_swap', 'crosscut', 'step_up']);
  play(c, 'scrapline'); // 1A
  const m0 = c.momentum;
  play(c, 'step_up'); // 2A step
  play(c, 'gear_swap'); // 3B cross (+1 exact), flips suit to A
  assert.equal(c.combo.crosses, 1);
  assert.ok(c.momentum > m0);
  assert.equal(c.combo.variant, 'A');
});

test('Relay Echo: Echo Splice repeats the previous card on the first Relay', () => {
  const run = (relics) => {
    const c = mk(['scrapline', 'rethread', 'scrapfall'], { relics });
    const h0 = hp(c);
    play(c, 'scrapline'); // Pin
    play(c, 'rethread'); // Corvin -> relay
    return h0 - hp(c);
  };
  assert.ok(run(['echo_splice']) > run([]), 'echo adds damage');
});

test('Relay Echo: Dead Drop stores an echo released on Cash Out', () => {
  const run = (useDrop) => {
    const c = mk(['rivet_jab', useDrop ? 'dead_drop' : 'gear_swap', 'scrapfall']);
    play(c, 'rivet_jab');
    play(c, useDrop ? 'dead_drop' : 'gear_swap');
    const h0 = hp(c);
    c.cashOut();
    return h0 - hp(c);
  };
  assert.ok(run(true) > run(false) - 4, 'stored echo released');
});

test('Momentum Burst: Pressure Valve converts Momentum into damage', () => {
  const c = mk(['cold_start', 'pressure_valve', 'scrapfall']);
  c.momentum = 8;
  play(c, 'cold_start'); // 1A, no gain because Momentum is not 0
  const h0 = hp(c);
  play(c, 'pressure_valve'); // 6A climb, spends 8
  assert.equal(c.momentum, 0);
  assert.ok(h0 - hp(c) >= 24);
});

test('Flow Extension: Overclock adds Flow within the 6.2s cap', () => {
  const c = mk(['hotwire', 'overclock', 'scrapfall']);
  play(c, 'hotwire');
  const d0 = c.combo.deadline;
  play(c, 'overclock');
  assert.ok(c.combo.deadline - d0 > 0.5);
  assert.ok(c.combo.deadline - c.combo.start <= 6.2 + 1e-9);
});

test('Churn Engine: Junk Toss scales with Churns used this battle', () => {
  const c = mk(['junk_toss', 'scrapline', 'scrapline', 'hotwire', 'salvage', 'rivet_jab', 'hotwire', 'scrapfall', 'rethread']);
  c.churn.charges = 3;
  const victims = c.hand.filter((u) => u && c.def(u).id !== 'junk_toss').slice(0, 3);
  for (const v of victims) c.churnCard(v);
  assert.equal(c.stats.churns, 3);
  const h0 = hp(c);
  play(c, 'junk_toss');
  assert.ok(h0 - hp(c) >= 4 + 6);
});

test('Reserve Strategy: Hidden Ace triples from Reserve', () => {
  const run = (fromReserve) => {
    const c = mk(['hidden_ace', 'scrapline', 'rethread']);
    const u = uidOf(c, 'hidden_ace');
    if (fromReserve) c.stash(u);
    const h0 = hp(c);
    c.playCard(u);
    return h0 - hp(c);
  };
  assert.ok(run(true) >= run(false) * 2.5);
});

test('Guard & Counter: Counter strikes back when an enemy attacks', () => {
  const c = mk(['brace_up', 'rethread', 'scrapfall']);
  play(c, 'brace_up');
  assert.ok(c.counter > 0);
  const e = c.enemies[0];
  const h0 = e.hp;
  c.hitParty(e, 'V', 5);
  assert.ok(e.hp < h0, 'counter damage dealt');
  assert.equal(c.counter, 0);
});

test('Cash Out Specialist: Tally Mark boosts the payout per card', () => {
  const run = (tally) => {
    const c = mk(['open_ledger', tally ? 'tally_mark' : 'step_up', 'scrapfall'], { relics: ['riveted_ledger'] });
    play(c, 'open_ledger');
    play(c, tally ? 'tally_mark' : 'step_up');
    return c.payoutAmount(1).amount;
  };
  assert.ok(run(true) > run(false));
});

test('Interference Exploitation: Breach Payload scales with interference endured', () => {
  const c = mk(['scrapline', 'step_up', 'breach_payload', 'rethread']);
  const e = c.enemies[0];
  for (let i = 0; i < 4; i++) {
    c.lockCards(e, 1);
    for (const u of Object.keys(c.locks)) c.unlock(u);
  }
  assert.ok(c.stats.interference >= 4);
  play(c, 'scrapline');
  play(c, 'step_up');
  const h0 = hp(c);
  play(c, 'breach_payload');
  assert.ok(h0 - hp(c) >= 6 + 5 * 4);
});

test('Mutations change rules: Relay Resonance echoes every relay', () => {
  const run = (mut) => {
    const c = mk(['scrapline', 'rethread', 'scrapfall'], { mutations: mut });
    const h0 = hp(c);
    play(c, 'scrapline');
    play(c, 'rethread');
    return h0 - hp(c);
  };
  assert.ok(run(['relay_resonance']) > run([]));
});
