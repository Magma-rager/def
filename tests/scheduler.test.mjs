// Phase 5 action scheduling (docs/COMBAT_SPEC.md §7, §9, §10, §11.3, §12, §13, §16, §17): hero states,
// the timed command queue, deliberate Relays, support Recovery, the decision window and interruptions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARD_LIST, STARTER_DECK } from '../src/data/cards.js';
import { RNG } from '../src/core/rng.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
function deck(specs) {
  return specs.map((s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s }));
}
// hand slots then draw pile, enemies held back unless `live`
function fixed(handSpecs, drawSpecs = [], extra = {}) {
  const specs = [...handSpecs, ...drawSpecs];
  const c = new Combat({ deck: deck(specs), party: PARTY, hp: 130, maxHp: 130, enemies: extra.enemies || ['foundry_warden'], seed: 5, relics: extra.relics || [], mutations: extra.mutations || [], act: 1, ...extra.opts });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < handSpecs.length ? `c${i}` : null));
  c.draw = drawSpecs.map((_, i) => `c${handSpecs.length + i}`);
  c.discard = [];
  c.exhaust = [];
  if (!extra.live) for (const e of c.enemies) { e.atb = -100; e.hp = e.maxHp = extra.enemyHp || 2000; }
  c.momentum = extra.momentum !== undefined ? extra.momentum : 0;
  c.drainEvents();
  return c;
}
const slot = (c, i) => c.hand[i];
const byId = (c, id) => [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === id);
function advance(c, sec, dt = 1 / 60) {
  for (let x = 0; x < sec - 1e-9; x += dt) c.update(Math.min(dt, sec - x));
}
function settle(c, max = 20) {
  for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60);
}
const ehp = (c) => c.enemies[0].hp + c.enemies[0].guard;
// Hessa A1 → B2 → A3 basics, her arte, Corvin and Pin's artes, more basics in the draw pile
const CHAIN_HAND = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'piston_strike', variant: 'A' }, 'scrapfall', 'thermal_lance', 'bolt_volley'];
const CHAIN_DRAW = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'scrapline', variant: 'B' }, { id: 'rivet_jab', variant: 'A' }, 'mend_circuit', 'salvage'];

// ── command queue ──
test('commit does not resolve an attack: effects happen at the execution impact, the command ends after its duration', () => {
  const c = fixed(['piston_strike', 'rivet_jab'], ['pinprick', 'tripwire', 'cold_start', 'junk_toss', 'tinder_toss']);
  const hp0 = ehp(c);
  const r = c.commit(slot(c, 0));
  assert.ok(r.ok);
  assert.equal(c.executing.cmd.id, r.cmd.id, 'execution starts at once when nothing is ahead of it');
  assert.equal(ehp(c), hp0, 'no damage at commit');
  assert.equal(c.momentum, 0, 'no Momentum at commit');
  assert.equal(c.zoneOf(r.cmd.uid), null, 'the card is in the executing zone');
  assert.equal(c.hand[0], null, 'its slot is a placeholder');
  assert.deepEqual(c.verifyZones(), { ok: true });
  const evs = c.drainEvents().map((e) => e.type);
  assert.deepEqual(evs.filter((t) => ['commit', 'execStart', 'act', 'hit', 'execEnd'].includes(t)), ['commit', 'execStart', 'act'], 'animation starts, nothing resolved');
  advance(c, RULES.RESOLVE_AT.melee - 0.05);
  assert.equal(ehp(c), hp0, 'still winding up');
  advance(c, 0.1);
  assert.ok(ehp(c) < hp0, 'resolved at the impact moment');
  assert.equal(c.momentum, 2, 'Strong +2 on resolution');
  assert.ok(c.discard.includes(r.cmd.uid));
  assert.notEqual(c.hand[0], null, 'the slot refilled when the card resolved');
  assert.ok(c.executing, 'the command is still executing (follow-through)');
  advance(c, RULES.ACTION_TIME - RULES.RESOLVE_AT.melee);
  assert.equal(c.executing, null);
  assert.ok(c.drainEvents().some((e) => e.type === 'execEnd'));
});

test('commands execute in committed order; three may wait; a fourth is refused while the queue is full', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'salvage', 'mend_circuit', 'hold_the_line'], [], { momentum: 6 });
  c.selectHero('V');
  assert.ok(c.commit(slot(c, 0)).ok); // executing: Weak 1
  assert.ok(c.commit(slot(c, 1)).ok); // Medium 2 waits
  assert.ok(c.commit(slot(c, 2)).ok, 'Strong 3 is legal on the projected chain (Medium is only queued)');
  assert.ok(c.commit(slot(c, 4)).ok, "Corvin's heal waits behind them");
  assert.equal(c.queue.length, 3);
  const full = c.commit(slot(c, 5));
  assert.equal(full.ok, false);
  assert.equal(full.chk.reason, 'queue');
  const order = [];
  for (let i = 0; i < 400 && (c.executing || c.queue.length); i++) {
    c.update(1 / 60);
    for (const e of c.drainEvents()) if (e.type === 'execStart') order.push(c.def(e.uid).id);
    assert.deepEqual(c.verifyZones(), { ok: true });
  }
  assert.deepEqual(order, ['scrapline', 'rivet_jab', 'piston_strike', 'mend_circuit'], 'strictly in order');
  assert.equal(c.combo.cards.map((e) => e.id).join(), 'scrapline,rivet_jab,piston_strike');
});

test('projected legality: the queue is judged as it will be, never on Momentum it does not have yet', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'scrapline'], [], { momentum: 0 });
  c.selectHero('V');
  c.commit(slot(c, 0)); // Weak executing
  c.commit(slot(c, 1)); // Medium queued
  assert.equal(c.check(slot(c, 4)).reason, 'rank', 'Weak 1 after the queued Medium 2: impossible');
  assert.ok(c.check(slot(c, 2)).ok, 'Strong 3 after the queued Medium 2');
  assert.equal(c.check(slot(c, 3)).reason, 'momentum', 'the arte needs Momentum the party has now; queued gains do not count');
  settle(c);
  assert.ok(c.check(slot(c, 3)).ok, 'after the basics resolved, their gains pay for it');
});

test('cancelling a queued command revalidates the ones behind it; dependent commands go back too', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 4 });
  c.selectHero('V');
  c.commit(slot(c, 0)); // Hessa Weak executing
  const relay = c.selectHero('C'); // Relay to Corvin queued
  assert.ok(relay.ok, JSON.stringify(relay.text));
  assert.equal(c.heroState('C'), 'COMMITTED');
  const corvinBasic = c.commit(slot(c, 1)); // Corvin's first card (rank resets after the Relay)
  assert.ok(corvinBasic.ok);
  assert.equal(corvinBasic.cmd.hero, 'C');
  assert.ok(c.cancel(relay.cmd));
  assert.equal(c.queue.length, 0, "Corvin's card depended on the Relay: cancelled with it");
  assert.equal(c.hand[1], corvinBasic.cmd.uid, 'and back in its slot');
  assert.equal(c.heroState('C'), 'READY');
  assert.deepEqual(c.verifyZones(), { ok: true });
  // an independent command survives: Weak → (Strong) → arte; cancelling Strong keeps the arte
  const d = fixed(['scrapline', 'piston_strike', 'scrapfall'], [], { momentum: 4 });
  d.selectHero('V');
  d.commit(slot(d, 0));
  const strong = d.commit(slot(d, 1));
  d.commit(slot(d, 2));
  d.cancel(strong.cmd);
  assert.deepEqual(d.queue.map((q) => d.def(q.uid).id), ['scrapfall'], 'the arte still follows Weak 1');
  settle(d);
  assert.equal(d.combo.cards.map((e) => e.id).join(), 'scrapline,scrapfall');
});

test('a battle that ends mid-queue executes nothing more: waiting cards return, the executing card never resolves', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike'], [], { enemyHp: 3 });
  c.enemies[0].hp = 3;
  c.enemies[0].maxHp = 3;
  c.selectHero('V');
  c.commit(slot(c, 0)); // Weak (5) will kill
  c.commit(slot(c, 1));
  c.commit(slot(c, 2));
  advance(c, 0.4);
  assert.equal(c.phase, 'END');
  assert.equal(c.result.victory, true);
  assert.equal(c.queue.length, 0);
  assert.equal(c.executing, null);
  assert.deepEqual(c.verifyZones(), { ok: true });
  assert.equal(c.stats.basics, 1, 'only the first card resolved');
  // defeat while a card is executing (before its impact)
  const d = fixed(['piston_strike', 'rivet_jab'], [], {});
  d.commit(slot(d, 0));
  d.hp = 1;
  d.hitParty(d.enemies[0], 'C', 10);
  assert.equal(d.phase, 'END');
  advance(d, 1);
  assert.equal(d.stats.basics, 0, 'the started card never resolved');
  assert.deepEqual(d.verifyZones(), { ok: true });
});

// ── hero states and Recovery ──
test('heroes start Ready; states follow the scheduler; Recovery lengths follow the prototype rule', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 0 });
  for (const h of ['V', 'C', 'S']) assert.equal(c.heroState(h), 'READY');
  c.selectHero('V');
  c.commit(slot(c, 0));
  assert.equal(c.heroState('V'), 'ACTING');
  assert.equal(c.heroReady('V'), false, 'an acting hero is not Ready');
  c.commit(slot(c, 1));
  c.commit(slot(c, 2));
  settle(c);
  assert.equal(c.heroState('V'), 'ACTIVE');
  const relay = c.selectHero('S');
  assert.ok(relay.ok);
  for (let i = 0; i < 120 && !c.drainEvents().some((e) => e.type === 'relay'); i++) c.update(1 / 60);
  const expect = RULES.RECOVER_SEGMENT + RULES.RECOVER_PER_CARD * 3;
  assert.ok(Math.abs(c.recoverLeft('V') - expect) < 0.03, `segment Recovery ${c.recoverLeft('V')} vs ${expect}`);
  settle(c);
  assert.equal(c.heroState('V'), 'RECOVERING');
  assert.equal(c.heroState('S'), 'ACTIVE');
  const left = c.recoverLeft('V');
  c.update(0); // a paused battle does not advance time at all
  assert.equal(c.recoverLeft('V'), left, 'pausing (no update) freezes Recovery');
  advance(c, left + 0.05);
  assert.equal(c.heroState('V'), 'READY', 'Recovery over (combat time)');
  assert.equal(c.relayCheck('V').reason, 'used', 'Ready again, but she has already had her segment in this chain');
});

test('a support action reserves its performer and costs a 2.0s Recovery; others act meanwhile', () => {
  const c = fixed(['salvage', 'scrapline', 'mend_circuit', 'rivet_jab'], ['pinprick', 'tripwire'], { momentum: 2 });
  c.selectHero('V');
  c.commit(slot(c, 1)); // Hessa Weak executing
  const sup = c.check(slot(c, 0));
  assert.equal(sup.reason, 'busy', "Hessa's own support while she attacks");
  assert.deepEqual(sup.text, { k: '{hero} is attacking', p: { hero: { hero: 'V' } } });
  const heal = c.commit(slot(c, 2)); // Corvin's heal waits behind the Weak
  assert.ok(heal.ok);
  assert.equal(c.heroState('C'), 'COMMITTED');
  assert.equal(c.relayCheck('C').reason, 'busy', 'a hero committed to support cannot also take the Relay');
  settle(c);
  assert.equal(c.heroState('C'), 'RECOVERING');
  assert.ok(Math.abs(c.recoverLeft('C') - RULES.RECOVER_SUPPORT) < 0.03);
  assert.ok(c.relayCheck('S').ok, 'Pin, still Ready, can take the Relay');
  advance(c, RULES.RECOVER_SUPPORT + 0.05);
  assert.equal(c.heroState('C'), 'READY');
  assert.ok(c.drainEvents().some((e) => e.type === 'heroReady' && e.who === 'C'));
});

test('with every hero recovering the player waits; enemies keep acting; it always resolves', () => {
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick'], { live: true, enemies: ['rush_hound'] });
  for (const h of ['V', 'C', 'S']) c.startRecovery(h, 2.5, 'test');
  c.enemies[0].atb = 0;
  c.enemies[0].hp = c.enemies[0].maxHp = 999;
  assert.equal(c.check(slot(c, 0)).reason, 'heroes');
  assert.equal(c.stranded(), false, 'busy heroes are a wait, not a stranded hand: Churn is not free');
  advance(c, 1);
  assert.ok(c.enemies[0].atb > 0, 'individual Recovery never pauses the enemies');
  advance(c, 1.6);
  assert.ok(c.check(slot(c, 0)).ok, 'Ready again');
  assert.ok(c.stats.allRecovering > 2.4);
});

test('with the selected hero recovering, the next chain starts with the first Ready hero', () => {
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick']);
  c.selectHero('V');
  c.startRecovery('V', 3, 'test');
  assert.equal(c.selectHero('V').ok, false, 'a recovering hero cannot be chosen');
  const chk = c.check(slot(c, 0));
  assert.ok(chk.ok);
  assert.equal(chk.hero, 'C');
});

// ── Relay ──
test('a Relay is an explicit command: eligibility, execution, Recovery, rank reset, history, rewards once', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 0 });
  c.selectHero('V');
  assert.equal(c.relayCheck('C').reason, 'nochain');
  c.commit(slot(c, 0));
  assert.ok(c.relayCheck('C').ok, 'one queued or executed card qualifies (spec §9 prototype)');
  c.commit(slot(c, 1));
  c.commit(slot(c, 2));
  settle(c);
  c.commit(slot(c, 3)); // Scrapfall (cost 2)
  settle(c);
  assert.ok(c.combo, 'the arte did not end the chain: a Relay is possible');
  const before = { cards: c.combo.cards.length, damage: c.combo.damage, crosses: c.combo.crosses, m: c.momentum };
  const r = c.selectHero('C');
  assert.ok(r.ok);
  assert.equal(r.cmd.type, 'relay');
  assert.equal(c.momentum, before.m, 'nothing is paid for queuing a Relay');
  settle(c);
  assert.equal(c.momentum, before.m + RULES.RELAY_MOMENTUM, '+1 Momentum when the Relay executed');
  assert.deepEqual([c.combo.hero, c.combo.rank, c.combo.relays, c.combo.owners], ['C', 0, 1, ['V', 'C']]);
  assert.equal(c.heroState('V'), 'RECOVERING');
  assert.equal(c.heroState('C'), 'ACTIVE');
  assert.equal(c.check(slot(c, 4)).reason, 'needbasic', "Corvin's segment starts with a basic attack");
  assert.deepEqual([c.combo.cards.length, c.combo.damage, c.combo.crosses], [before.cards, before.damage, before.crosses], 'party history carries on');
  assert.equal(c.relayCheck('V').reason, 'used', 'each hero joins a chain once');
  assert.equal(c.relayCheck('S').reason, 'setup', 'Corvin must play a card before relaying on');
  const basic = c.hand.find((u) => u && c.categoryOf(u) === 'basic');
  assert.equal(c.check(basic).ok, true, 'rank 0 again: any basic attack');
  // +10% on the incoming first card: compare with the same card later in a segment
  const hp0 = ehp(c);
  c.commit(basic);
  settle(c);
  const dealt = hp0 - ehp(c);
  const base = { scrapline: 5, rivet_jab: 7 }[c.def(basic).id];
  assert.equal(dealt, Math.round(base * 1.1), `first card after one Relay: ${dealt}`);
  assert.equal(c.combo.cards.at(-1).relay, true);
  assert.equal(c.stats.relays, 1);
});

test('three heroes, two Relays: Hessa → Corvin → Pin in one chain, finished as a Perfect', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 0 });
  c.selectHero('V');
  for (const i of [0, 1, 2]) c.commit(slot(c, i));
  settle(c);
  c.commit(slot(c, 3));
  settle(c);
  c.selectHero('C');
  settle(c);
  c.commit(c.hand.find((u) => u && c.categoryOf(u) === 'basic'));
  settle(c);
  assert.ok(c.check(byId(c, 'thermal_lance')).ok, JSON.stringify(c.check(byId(c, 'thermal_lance'))));
  c.commit(byId(c, 'thermal_lance'));
  settle(c);
  assert.ok(c.combo);
  assert.ok(c.selectHero('S').ok);
  settle(c);
  c.commit(c.hand.find((u) => u && c.categoryOf(u) === 'basic'));
  settle(c);
  c.commit(byId(c, 'bolt_volley'));
  settle(c);
  assert.equal(c.combo, null, 'every hero has joined and Pin has nothing higher: the chain ends by itself');
  const h = c.history[0];
  assert.deepEqual([h.type, h.relays, h.heroes, h.len], ['perfect', 2, ['V', 'C', 'S'], 8]);
  assert.deepEqual(h.segments.map((s) => [s.hero, s.cards]), [['V', 4], ['C', 2], ['S', 2]]);
  assert.equal(c.stats.chainHeroes[3], 1);
  assert.equal(c.stats.finishers, 1, 'an 8-card chain is a Finisher, once');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('a cancelled Relay grants nothing; a Relay is refused to a recovering or already-used hero', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike'], ['pinprick', 'tripwire'], { momentum: 0 });
  c.selectHero('V');
  c.commit(slot(c, 0));
  const r = c.selectHero('C');
  assert.ok(r.ok);
  assert.ok(c.cancel(r.cmd));
  settle(c);
  assert.equal(c.combo.relays, 0);
  assert.equal(c.momentum, 1, 'only the Weak +1');
  assert.ok(!c.drainEvents().some((e) => e.type === 'relay'));
  c.startRecovery('S', 3, 'test');
  assert.equal(c.relayCheck('S').reason, 'busy');
  assert.deepEqual(c.relayCheck('S').text.k, '{hero} recovering {s}s');
});

test('Relay rewards and Relay content: Relay Jammer, Echoing graft, Mirror Wire, Hand Off, Chorus Break, Grand Relay, Relay Baton', () => {
  // Relay Jammer: no Momentum, the Relay still works
  const j = fixed(['scrapline', 'rivet_jab'], ['pinprick'], { enemies: ['scrap_tyrant'], opts: { adaptation: { id: 'relay_jam', need: 2 } } });
  j.enemies[0].tier = 'boss';
  j.commit(slot(j, 0));
  j.selectHero('C');
  settle(j);
  assert.deepEqual([j.combo.relays, j.momentum], [1, 1], 'Relay executed, no Relay Momentum');
  // Echoing: the incoming first card Echoes itself at 30%
  const e = fixed(['scrapline', { id: 'piston_strike', graft: 'echoing' }], ['pinprick']);
  e.commit(slot(e, 0));
  e.selectHero('S');
  settle(e);
  e.drainEvents();
  e.commit(slot(e, 1));
  settle(e);
  assert.ok(e.drainEvents().some((x) => x.type === 'echo' && Math.round(x.mult * 100) === 30 && x.id === 'piston_strike'));
  // Mirror Wire: the first Relay Echoes the last attack
  const m = fixed(['scrapline', 'mirror_wire', 'rivet_jab'], ['pinprick'], { momentum: 2 });
  m.selectHero('C');
  m.commit(slot(m, 0));
  m.commit(slot(m, 1));
  settle(m);
  m.drainEvents();
  m.selectHero('V');
  settle(m);
  assert.ok(m.drainEvents().some((x) => x.type === 'echo' && x.id === 'mirror_wire' && Math.round(x.mult * 100) === 50));
  // Hand Off: only when the very next command is the Relay; it Echoes the last attack
  const h = fixed(['scrapline', 'hand_off', 'rivet_jab'], ['pinprick']);
  h.commit(slot(h, 0));
  h.commit(slot(h, 1));
  settle(h);
  h.drainEvents();
  h.selectHero('S');
  settle(h);
  assert.ok(h.drainEvents().some((x) => x.type === 'echo' && x.id === 'scrapline' && Math.round(x.mult * 100) === 40), 'Hand Off: the Relay Echoes Scrapline at 40%');
  // Chorus Break, Grand Relay and Relay Baton count the chain's heroes and Relay cards
  const g = fixed([{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'scrapline', variant: 'B' }, 'grand_relay', 'relay_baton', 'pinprick'], ['tripwire', 'cold_start'], { momentum: 10, enemies: ['rush_hound', 'rush_hound'] });
  g.commit(slot(g, 0));
  g.selectHero('C');
  g.commit(slot(g, 1));
  g.selectHero('S');
  settle(g);
  g.commit(slot(g, 2));
  settle(g);
  const hp = g.enemies.map((x) => x.hp);
  g.commit(byId(g, 'relay_baton'));
  settle(g);
  assert.equal(g.combo.owners.length, 3);
  g.commit(byId(g, 'grand_relay'));
  settle(g);
  assert.ok(g.enemies.every((x, i) => x.hp < hp[i]), 'Grand Relay with three heroes hits every enemy');
});

test('Chorus Break echoes each first card after a Relay', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'chorus_break', 'pinprick'], ['tripwire'], { momentum: 6 });
  c.selectHero('V');
  c.commit(slot(c, 0));
  c.selectHero('C');
  c.commit(slot(c, 1)); // Corvin's first card: a Relay card
  settle(c);
  c.drainEvents();
  c.commit(byId(c, 'chorus_break'));
  settle(c);
  const echoes = c.drainEvents().filter((x) => x.type === 'echo').map((x) => x.id);
  assert.deepEqual(echoes, ['rivet_jab']);
});

// ── support scheduling ──
test('Braced is committed with the hero the player chose; the default is the hero an enemy is aiming at', () => {
  const c = fixed(['hold_the_line', 'hold_the_line', 'scrapline'], ['pinprick'], { momentum: 2 });
  const e = c.enemies[0];
  e.intent = { ...e.intent, kind: 'atk', dmg: 10, target: 'C' };
  c.selectHero('V');
  const r = c.commit(slot(c, 0), { target: 'S' });
  assert.ok(r.ok);
  assert.equal(r.cmd.target, 'S');
  assert.equal(r.cmd.hero, 'V', 'the selected (Ready) hero performs the neutral support');
  settle(c);
  assert.ok(c.member('S').st.braced > c.t, 'Pin, as chosen, not Corvin (the default)');
  assert.ok(!(c.member('C').st.braced > c.t));
  assert.equal(c.heroState('V'), 'RECOVERING');
  const r2 = c.commit(slot(c, 1));
  assert.equal(r2.cmd.hero, 'C', 'next Ready hero performs it');
  settle(c);
  assert.ok(c.member('C').st.braced > c.t, 'no choice: the default target');
});

// ── decision window ──
test('refunds come when a card resolves; a cancelled card refunds nothing; the counted-time cap holds', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike'], ['pinprick'], { momentum: 30 });
  c.selectHero('V');
  c.commit(slot(c, 0));
  settle(c);
  const d0 = c.combo.deadline;
  c.commit(slot(c, 1)); // executes
  const q = c.commit(slot(c, 2)); // waits
  c.cancel(q.cmd);
  settle(c);
  assert.ok(Math.abs(c.combo.deadline - d0 - RULES.ACTION_TIME - RULES.FLOW_REFUND) < 0.03, 'one refund (Medium); the hold moved the deadline by the execution time');
  for (let i = 0; i < 12; i++) c.spendMomentumFlow();
  assert.ok(c.combo.deadline <= c.flowCap() + 1e-9);
  const counted = c.combo.deadline - c.combo.start - c.combo.graceUsed;
  assert.ok(counted <= RULES.FLOW_ABS_MAX + 1e-9, `counted ${counted}`);
});

test('frame rate does not change outcomes: the same commands give the same result at 30, 60 and 144 fps', () => {
  const runAt = (fps) => {
    const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 0 });
    const dt = 1 / fps;
    const go = (s) => advance(c, s, dt);
    c.selectHero('V');
    for (const i of [0, 1, 2]) c.commit(slot(c, i));
    go(2.2);
    c.commit(slot(c, 3));
    go(0.8);
    c.selectHero('C');
    go(0.7);
    c.commit(c.hand.find((u) => u && c.categoryOf(u) === 'basic'));
    go(1.5);
    c.finishOrCashOut();
    go(2);
    return { m: c.momentum, dmg: c.stats.damage, h: c.history.map((x) => `${x.type}/${x.len}/${x.relays}`).join(), recV: Math.round(c.heroes.V.recoverUntil * 10) / 10 };
  };
  const a = runAt(30), b = runAt(60), d = runAt(144);
  assert.deepEqual([a.m, a.dmg, a.h], [b.m, b.dmg, b.h]);
  assert.deepEqual([d.m, d.dmg, d.h], [b.m, b.dmg, b.h]);
  assert.ok(Math.abs(a.recV - b.recV) <= 0.1 && Math.abs(d.recV - b.recV) <= 0.1);
});

test('enemy ATB fills while commands execute and while heroes recover, waits in the breather; Tactical slows it only while deciding', () => {
  const mkLive = (tactical) => {
    const c = fixed(['scrapline', 'rivet_jab', 'piston_strike'], ['pinprick', 'tripwire'], { live: true, enemies: ['iron_maw'], opts: { tactical } });
    c.enemies[0].hp = c.enemies[0].maxHp = 999;
    c.enemies[0].atb = 0;
    return c;
  };
  const rate = (c, s) => { const a = c.enemies[0].atb; advance(c, s); return (c.enemies[0].atb - a) / s; };
  const n = mkLive(false);
  n.commit(slot(n, 0));
  const exec = rate(n, 0.5);
  assert.ok(exec > 0, 'executing: enemies advance');
  settle(n);
  advance(n, RULES.FLOW_READ_GRACE + 0.05);
  const decide = rate(n, 0.5);
  const t = mkLive(true);
  t.commit(slot(t, 0));
  const texec = rate(t, 0.5);
  settle(t);
  advance(t, RULES.FLOW_READ_GRACE + 0.05);
  const tdecide = rate(t, 0.5);
  assert.ok(Math.abs(texec - exec) < 1e-6, 'Tactical does not slow enemies during execution');
  assert.ok(Math.abs(tdecide - decide * RULES.TACTICAL_ATB) < 1e-6, `deciding: ${tdecide} vs ${decide} × 0.25`);
  assert.equal(n.finishOrCashOut().ok, false, 'one card: no Cash Out; let it drop');
  for (let i = 0; i < 600 && n.phase !== 'RECOVER'; i++) n.update(1 / 60);
  assert.equal(n.phase, 'RECOVER');
  assert.equal(rate(n, 0.5), 0, 'breather: enemies wait');
  advance(n, 1);
  assert.equal(n.heroState('V'), 'RECOVERING');
  assert.ok(rate(n, 0.3) > 0, 'hero Recovery: enemies advance');
});

// ── endings with pending commands ──
test('the third Stumble cancels unstarted chain commands, lets the executing one finish, and judges executed cards', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'pinprick', 'piston_strike'], ['tripwire'], { momentum: 3 });
  c.selectHero('V');
  c.commit(slot(c, 0));
  settle(c);
  c.commit(slot(c, 3)); // Strong executing
  const q = c.commit(slot(c, 1)); // rank 2 after projected 3: refused (stumble 1)
  assert.equal(q.ok, false);
  c.commit(slot(c, 2));
  c.commit(slot(c, 2));
  assert.ok(c.combo, 'the chain waits for the executing Strong');
  assert.equal(c.combo.pendingEnd, 'forced');
  settle(c);
  assert.equal(c.combo, null);
  assert.deepEqual([c.history[0].type, c.history[0].len], ['forced', 2], 'the started Strong counted; nothing else');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('a queued FINISH or CASH OUT resolves after the commands ahead of it; nothing automatic overrides a queued Relay', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'pinprick'], ['tripwire'], { enemies: ['foundry_warden'] });
  c.selectHero('V');
  c.commit(slot(c, 0));
  c.commit(slot(c, 1));
  assert.equal(c.canCashOut(), true, 'projected: two cards ending on a basic attack');
  const f = c.cashOut();
  assert.ok(f.ok);
  assert.equal(c.queue.at(-1).type, 'finish');
  assert.equal(c.check(slot(c, 2)).reason, 'finishing');
  settle(c);
  assert.deepEqual([c.history[0].type, c.history[0].len], ['cashout', 2]);
  // an arte executing with a Relay queued behind it: the Relay happens, no automatic Perfect
  const d = fixed(['piston_strike', 'scrapfall', 'scrapline'], ['rivet_jab'], { momentum: 2 });
  d.selectHero('V');
  d.commit(slot(d, 0));
  settle(d);
  d.commit(slot(d, 1));
  d.selectHero('S');
  settle(d);
  assert.ok(d.combo);
  assert.deepEqual([d.combo.hero, d.combo.relays], ['S', 1]);
});

// ── interference with queued commands ──
test('Lock and Scramble never touch committed cards; a queued card keeps the rank it was committed with', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'tripwire'], [], { enemies: ['suit_scrambler'] });
  c.selectHero('V');
  c.scrambleCards(c.enemies[0], 4, 'rankup');
  const strong = slot(c, 2);
  const rank = c.effRank(strong);
  c.commit(slot(c, 0));
  const q = c.commit(strong);
  assert.equal(q.cmd.rank, rank);
  c.lockCards(c.enemies[0], 4);
  assert.ok(!Object.keys(c.locks).includes(strong), 'a queued card cannot be Locked');
  c.temp = {}; // the Scramble ends while the card waits
  settle(c);
  assert.equal(c.combo.cards.at(-1).rank, rank, 'executed with its committed rank');
});

test('an enemy raising the chain rank makes a queued card illegal: it is returned at once, never executed', () => {
  // regression: found by the full-run simulation (an illegal queued command between two steps)
  const c = fixed(['scrapline', 'rivet_jab'], ['pinprick'], { enemies: ['the_corruptor'] });
  c.selectHero('V');
  c.commit(slot(c, 0));
  const q = c.commit(slot(c, 1)); // Medium 2 waits
  advance(c, 0.3); // Weak resolved: rank 1
  const core = c.enemies[0];
  core.intent = { key: 'bleed', kind: 'scramble', name: 'Context Bleed', dmg: 0, target: null };
  c.enemyAct(core); // raises the chain's rank to 2 (The Corruptor's Context Bleed)
  assert.equal(c.combo.rank, 2);
  assert.deepEqual(c.verifyZones(), { ok: true }, 'no illegal command is left waiting');
  assert.equal(c.hand[1], q.cmd.uid, 'returned to its slot');
  settle(c);
  assert.equal(c.stats.basics, 1);
  assert.ok(c.stats.cancelled >= 1);
});

test('Reserve: a committed Reserve card keeps its place; Reserve latch steals only stored cards; jams skip held slots', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'pinprick', 'tripwire', 'cold_start', 'junk_toss'], ['tinder_toss', 'gauge_read'], { enemies: ['latch_wisp'] });
  c.stash(slot(c, 1));
  c.stash(slot(c, 2));
  c.selectHero('V');
  c.commit(slot(c, 0)); // Weak executing
  const fromRes = c.reserve[0];
  const q = c.commit(fromRes); // Medium from Reserve waits
  assert.ok(q.ok);
  assert.equal(c.canStash(slot(c, 3)), false, 'its Reserve place is kept');
  c.latchReserve(c.enemies[0]);
  assert.equal(c.reserve.length, 0, 'the stored card was taken, not the queued one');
  c.cancel(q.cmd);
  assert.ok(c.reserve.includes(fromRes), 'cancelled: back to Reserve');
  for (let i = 0; i < 6; i++) c.jamSlot(c.enemies[0], 4);
  assert.ok(!Object.keys(c.jams).map(Number).includes(0), 'the held slot is never jammed');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

// ── stability ──
test('randomized scheduler soak: commits, Relays, support, cancels, Churn, Reserve, interference, victory and defeat keep every invariant', () => {
  const pool = CARD_LIST.filter((x) => x.category !== 'junk' && x.p4 !== 'withheld').map((x) => x.id);
  let endings = 0, relays = 0, cancels = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = new RNG(seed * 17);
    const specs = [...STARTER_DECK, ...Array.from({ length: 12 }, () => rng.pick(pool))];
    const enemies = rng.pick([['wire_jammer', 'interference_mite'], ['suit_scrambler', 'latch_wisp'], ['the_corruptor'], ['clockwork_regent'], ['archive_censor'], ['scrap_tyrant'], ['signalbreak_core']]);
    const c = new Combat({ deck: deck(specs), party: PARTY, hp: 400, maxHp: 400, enemies, seed, relics: ['spare_pockets', 'long_fuse', 'overflow_valve', 'echo_splice', 'relay_harness'], mutations: ['deep_pockets', 'relay_resonance'], act: 2, tactical: seed % 2 === 0 });
    for (let i = 0; i < 1500 && c.phase !== 'END'; i++) {
      const roll = rng.next();
      const cards = [...c.hand, ...c.reserve].filter(Boolean);
      const legal = cards.filter((u) => c.check(u).ok);
      if (roll < 0.45 && legal.length) c.commit(rng.pick(legal), { target: rng.pick(['V', 'C', 'S', null]) });
      else if (roll < 0.55) { const r = c.selectHero(rng.pick(['V', 'C', 'S'])); if (r.cmd) relays++; }
      else if (roll < 0.6 && c.queue.length) { if (c.cancelCmd(rng.pick(c.queue).id)) cancels++; }
      else if (roll < 0.65) { const u = rng.pick(c.hand.filter(Boolean)); if (u) c.churnCard(u); }
      else if (roll < 0.68) { const u = rng.pick(c.hand.filter(Boolean)); if (u) c.stash(u); }
      else if (roll < 0.73) c.finishOrCashOut();
      else if (roll < 0.75) c.spendMomentumFlow();
      else if (roll < 0.76) c.spendMomentumGuard();
      else if (roll < 0.79 && cards.length) c.playCard(rng.pick(cards)); // possibly illegal: Stumbles
      c.update(rng.next() * 0.35);
      const z = c.verifyZones();
      assert.ok(z.ok, `seed ${seed} step ${i}: ${z.error}`);
      assert.ok(c.momentum >= 0 && c.momentum <= c.momentumMax(), `momentum ${c.momentum}`);
      assert.ok(c.reserved >= 0 && c.reserved <= c.momentum);
      assert.ok(c.queue.length <= RULES.QUEUE_AHEAD);
      const states = ['V', 'C', 'S'].map((h) => c.heroState(h));
      assert.ok(states.filter((s) => s === 'ACTING').length <= 1, 'one acting hero at most');
      assert.ok(states.filter((s) => s === 'ACTIVE').length <= 1, 'one active segment at most');
      if (c.combo) {
        assert.ok(c.combo.deadline <= c.flowCap() + 1e-9);
        assert.ok(c.combo.owners.length <= 3 && c.combo.relays <= 2, 'participation limit');
      } else assert.ok(!c.queue.some((q) => q.type !== 'support'), 'no chain commands without a chain');
      for (const h of ['V', 'C', 'S']) assert.ok(c.recoverLeft(h) <= 6, 'no unbounded Recovery');
      c.drainEvents();
    }
    // play on until the battle ends (victory or defeat), still checking
    for (let i = 0; i < 6000 && c.phase !== 'END'; i++) { c.update(0.05); assert.ok(c.verifyZones().ok); }
    if (c.phase === 'END') {
      endings++;
      assert.equal(c.queue.length, 0);
      assert.equal(c.executing, null);
      assert.deepEqual(c.verifyZones(), { ok: true });
    }
  }
  assert.ok(relays > 50 && cancels > 20, `exercised: ${relays} Relays, ${cancels} cancels`);
  assert.ok(endings >= 30, `${endings} battles ended`);
});
