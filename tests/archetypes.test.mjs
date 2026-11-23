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
// commands execute over time (Phase 5): run the clock until the queue is empty
function settle(c) {
  for (let i = 0; i < 1200 && (c.executing || c.queue.length); i++) c.update(1 / 60);
}
function play(c, id) {
  const u = uidOf(c, id);
  assert.ok(u, `${id} not available (hand: ${c.hand.map((x) => x && c.def(x).id)})`);
  const r = c.playCard(u);
  assert.ok(r.ok, `${id}: ${JSON.stringify(r.text)}`);
  settle(c);
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

test('Echo: Feedback Loop repeats the previous card (Corvin arte, rank 5)', () => {
  const run = (echo) => {
    const c = mk(['scrapline', 'piston_strike', echo ? 'feedback_loop' : 'thermal_lance']);
    c.momentum = 3;
    c.selectHero('C');
    play(c, 'scrapline');
    play(c, 'piston_strike');
    const h0 = hp(c);
    play(c, echo ? 'feedback_loop' : 'thermal_lance');
    return { dmg: h0 - hp(c), echo: c.drainEvents().some((e) => e.type === 'echo') };
  };
  const r = run(true);
  assert.ok(r.echo);
  assert.ok(r.dmg >= 9, `echoed ${r.dmg}`);
});

test('Dead Drop stores an echo released when the combo ends in a Perfect', () => {
  const c = mk(['piston_strike', 'dead_drop', 'scrapline']);
  c.selectHero('V');
  play(c, 'piston_strike'); // +2
  play(c, 'dead_drop'); // the chain stays open while a Relay is possible; FINISH makes it a Perfect
  assert.ok(c.combo, 'no premature ending: Corvin or Pin could still take a Relay');
  assert.ok(c.finishChain().ok);
  assert.equal(c.history[0].type, 'perfect');
  const ev = c.drainEvents();
  assert.ok(ev.some((e) => e.type === 'echo' && e.id === 'piston_strike'), 'Echo of the strongest card');
  assert.ok(5000 - hp(c) > 10 + 5, 'Piston Strike and its echo both landed');
});

test('Momentum Burst: Overpressure spends what is left after its cost', () => {
  const c = mk(['cold_start', 'overpressure', 'scrapfall']);
  c.momentum = 8;
  c.selectHero('C');
  play(c, 'cold_start'); // Weak +1 → 9 (no Cold Start bonus: Momentum was not 0)
  const h0 = hp(c);
  play(c, 'overpressure'); // costs 4, spends the other 5: 5 × 5
  assert.ok(h0 - hp(c) >= 25, `${h0 - hp(c)}`);
  assert.ok(c.finishChain().ok);
  assert.equal(c.history[0].type, 'perfect');
  assert.equal(c.momentum, 5, 'emptied, then +1 for the Cross (A → B, paid on resolution), +2 for the Perfect and +2 from Pressure Release (4 + 5 = 9 Momentum spent on an arte, Phase 8 counts both)');
});

test('Flow Extension: Overclock adds Flow within the combo cap', () => {
  const c = mk(['hotwire', 'overclock', 'last_word']);
  c.momentum = 6;
  c.selectHero('C');
  play(c, 'hotwire');
  const d0 = c.combo.deadline;
  play(c, 'overclock'); // Last Word is still affordable: the combo stays open
  assert.ok(c.combo);
  assert.ok(c.combo.deadline - d0 > 0.9);
  assert.ok(c.combo.deadline <= c.flowCap() + 1e-9);
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
    settle(c);
    return h0 - hp(c);
  };
  assert.ok(run(true) >= run(false) * 2.5);
});

test('Guard & Counter: Counter strikes back when an enemy attacks', () => {
  const c = mk(['brace_up', 'rethread', 'scrapfall']);
  c.momentum = 1; // Brace Up costs 1
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
  const c = mk(['scrapline', 'step_up', 'breach_payload', 'tripwire']);
  const e = c.enemies[0];
  for (let i = 0; i < 4; i++) {
    c.lockCards(e, 1);
    for (const u of Object.keys(c.locks)) c.unlock(u);
  }
  assert.ok(c.stats.interference >= 4);
  c.momentum = 1;
  c.selectHero('S');
  play(c, 'scrapline');
  play(c, 'step_up');
  const h0 = hp(c);
  play(c, 'breach_payload');
  assert.ok(h0 - hp(c) >= 8 + 5 * 4);
});

test('Mutations change rules: Duality Engine makes Crosses pay more', () => {
  const run = (mut) => {
    const c = mk(['scrapline', 'hotwire', 'scrapfall'], { mutations: mut });
    play(c, 'scrapline'); // A
    const h0 = hp(c), m0 = c.momentum;
    play(c, 'hotwire'); // B: a Cross
    return { dmg: h0 - hp(c), mom: c.momentum - m0 };
  };
  const base = run([]), duality = run(['duality_engine']);
  assert.ok(duality.dmg >= base.dmg + 4);
  assert.equal(duality.mom, base.mom + 1);
});

test('Relay Echo: the Relay command triggers Echo Splice, Relay Resonance and Relay Harness; the content is offered again', async () => {
  const { rewardPool, graftPool } = await import('../src/data/cards.js');
  const { relicPool } = await import('../src/data/relics.js');
  const { mutationPool } = await import('../src/data/mutations.js');
  for (const id of ['echo_splice', 'relay_harness']) assert.ok(relicPool().includes(id), id);
  assert.ok(mutationPool().includes('relay_resonance'));
  assert.ok(graftPool().includes('echoing'));
  const offered = rewardPool().map((c) => c.id);
  for (const id of ['mirror_wire', 'hand_off', 'relay_baton', 'chorus_break', 'grand_relay']) assert.ok(offered.includes(id), id);
  assert.ok(offered.includes('pressure_valve'), 'Pressure Valve is offered again (Phase 8 redesign)');
  const run = (relics, mutations) => {
    const c = mk(['scrapline', 'hotwire', 'piston_strike', 'rivet_jab', 'scrapfall', 'thermal_lance'], { relics, mutations });
    play(c, 'scrapline');
    play(c, 'hotwire');
    c.drainEvents();
    const r = c.selectHero('C'); // a Relay: Hessa hands the chain to Corvin
    assert.ok(r.ok, JSON.stringify(r.text));
    settle(c);
    const echoes = c.drainEvents().filter((e) => e.type === 'echo').map((e) => Math.round(e.mult * 100));
    const h0 = hp(c);
    play(c, 'piston_strike');
    return { echoes, firstHit: h0 - hp(c), relays: c.combo.relays, harness: c.combo.harness };
  };
  const plain = run([], []);
  assert.deepEqual(plain.echoes, [], 'a plain Relay echoes nothing');
  const splice = run(['echo_splice'], ['relay_resonance']);
  assert.deepEqual(splice.echoes.sort(), [25, 40], 'Echo Splice 40% and Relay Resonance 25% on the first Relay');
  const harness = run(['relay_harness'], []);
  assert.equal(harness.harness, 1);
  assert.equal(harness.firstHit, plain.firstHit + 2, 'Relay Harness: +2 damage on later cards per Relay');
});
