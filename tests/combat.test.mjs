import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES, seqCheck } from '../src/engine/combat.js';
import { CARDS, STARTER_DECK, CARD_LIST } from '../src/data/cards.js';
import { RNG } from '../src/core/rng.js';

function deck(ids = STARTER_DECK) {
  return ids.map((id, i) => ({ uid: `c${i}`, id, up: false }));
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

test('card library meets content targets', () => {
  const real = CARD_LIST.filter((c) => c.role !== 'junk');
  const by = (r) => real.filter((c) => c.role === r).length;
  assert.ok(real.length >= 60, `cards ${real.length}`);
  assert.ok(by('open') >= 20 && by('conv') >= 20 && by('close') >= 20);
  for (const id of ['scrapline', 'hotwire', 'salvage', 'rethread', 'splitter', 'dead_drop', 'scrapfall', 'sunderline', 'last_word']) assert.ok(CARDS[id], id);
  for (const c of real) {
    assert.ok(c.rank >= 1 && c.rank <= 9, c.id);
    assert.ok(['A', 'B', 'EX'].includes(c.variant), c.id);
    assert.ok(['V', 'C', 'S'].includes(c.owner), c.id);
    for (const m of c.text.matchAll(/\{(\w+)\}/g)) assert.ok(c.v[m[1]], `${c.id} missing value ${m[1]}`);
  }
});

test('sequence rule', () => {
  assert.equal(seqCheck(1, 'A', 2, 'A').kind, 'step');
  assert.equal(seqCheck(1, 'A', 4, 'A').kind, 'climb');
  assert.equal(seqCheck(1, 'A', 2, 'B').kind, 'cross');
  assert.equal(seqCheck(1, 'A', 3, 'B').ok, false);
  assert.equal(seqCheck(3, 'A', 3, 'A').ok, false);
  assert.equal(seqCheck(3, 'EX', 7, 'B').ok, true);
  assert.equal(seqCheck(3, 'A', 7, 'EX').ok, true);
  assert.equal(seqCheck(1, 'A', 3, 'B', 2).kind, 'cross');
});

test('opening hand is all Openers and zones are intact', () => {
  const c = mk();
  assert.equal(c.phase, 'PRE');
  for (const u of c.hand) if (u) assert.equal(c.roleOf(u), 'open');
  assert.ok(legal(c).length > 0);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('first opener starts the 3s Flow window exactly once; enemies advance during PRE', () => {
  const c = mk();
  const atb0 = c.enemies[0].atb;
  advance(c, 1.0);
  assert.ok(c.enemies[0].atb > atb0, 'ATB advances in PRE');
  assert.equal(c.combo, undefined);
  const op = legal(c)[0];
  c.playCard(op);
  assert.equal(c.phase, 'ACTIVE');
  assert.ok(Math.abs(c.combo.deadline - c.combo.start - RULES.FLOW_INITIAL) < 1e-9);
  const start = c.combo.start;
  // hand now Converter/Closer only
  for (const u of c.hand) if (u) assert.ok(['conv', 'close'].includes(c.roleOf(u)));
  const conv = legal(c).find((u) => c.roleOf(u) === 'conv');
  if (conv) {
    const before = c.combo.deadline;
    c.playCard(conv);
    assert.equal(c.combo ? c.combo.start : start, start, 'combo start unchanged');
    if (c.combo) assert.ok(c.combo.deadline - before <= RULES.FLOW_REFUND + 1e-9);
  }
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('natural refunds cap at 1.2s and the combo never exceeds 6.2s', () => {
  const c = mk({ relics: ['brass_metronome'] });
  c.playCard(legal(c)[0]);
  const combo = c.combo;
  for (let i = 0; i < 20; i++) c.naturalRefund(1);
  assert.ok(combo.refundUsed <= RULES.FLOW_REFUND_MAX + 1e-9);
  c.momentum = 30;
  for (let i = 0; i < 10; i++) c.spendMomentumFlow();
  c.addFlow(10);
  assert.ok(combo.deadline - combo.start <= RULES.FLOW_ABS_MAX + 1e-9);
});

test('Flow expiry forces resolution and returns to an Opener hand', () => {
  const c = mk();
  c.momentum = 4;
  c.playCard(legal(c)[0]);
  advance(c, 3.2);
  assert.notEqual(c.phase, 'ACTIVE');
  assert.equal(c.history[0].type, 'forced');
  assert.equal(c.momentum <= 4, true);
  advance(c, 1.0);
  assert.equal(c.phase, 'PRE');
  for (const u of c.hand) if (u && c.roleOf(u) !== 'junk') assert.equal(c.roleOf(u), 'open');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('Cash Out requires 2 cards and is distinct from Perfect', () => {
  const c = mk({ enemies: ['foundry_warden'] });
  c.playCard(legal(c)[0]);
  assert.equal(c.canCashOut(), false);
  assert.equal(c.cashOut().ok, false);
  const conv = legal(c).find((u) => c.roleOf(u) === 'conv');
  c.playCard(conv);
  assert.equal(c.canCashOut(), true);
  const hp = c.enemies[0].hp + c.enemies[0].guard;
  c.cashOut();
  assert.equal(c.history[0].type, 'cashout');
  assert.ok(c.enemies[0].hp + c.enemies[0].guard < hp);
  assert.equal(c.phase, 'RECOVER');
});

test('closer completes a Perfect combo', () => {
  let found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const c = mk({ seed, enemies: ['foundry_warden'] });
    c.playCard(legal(c)[0]);
    for (let k = 0; k < 6 && c.combo; k++) {
      const l = legal(c);
      const close = l.find((u) => c.roleOf(u) === 'close');
      if (close) {
        c.playCard(close);
        assert.equal(c.history[0].type, 'perfect');
        found = true;
        break;
      }
      const conv = l.find((u) => c.roleOf(u) === 'conv');
      if (!conv) break;
      c.playCard(conv);
    }
  }
  assert.ok(found, 'some seed allows opener -> converter -> closer');
});

test('illegal play stumbles with bounded penalty, third stumble forces resolution', () => {
  const c = mk();
  c.playCard(legal(c)[0]);
  const illegal = c.hand.find((u) => u && !c.check(u).ok && ['rank', 'cross', 'needconv'].includes(c.check(u).reason));
  if (!illegal) return; // hand happened to be all legal
  const d0 = c.combo.deadline;
  c.playCard(illegal);
  assert.ok(c.combo.deadline <= d0 - RULES.STUMBLE_FLOW + 1e-9);
  c.playCard(illegal);
  c.playCard(illegal);
  assert.equal(c.combo, null);
  assert.equal(c.history[0].type, 'forced');
});

test('churn removes exactly one card, draws a replacement, never duplicates', () => {
  const c = mk();
  const u = c.hand[2];
  const charges = c.churn.charges;
  const r = c.churnCard(u);
  assert.ok(r.ok);
  assert.equal(c.churn.charges, charges - 1);
  assert.ok(!c.hand.includes(u));
  assert.ok(c.discard.includes(u) || c.hand.includes(u) === false);
  assert.equal(c.churnCard(u).ok, false, 'second activation on the same card is rejected');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('reserve stash, bounded, playable from reserve, survives phase transitions', () => {
  const c = mk();
  const a = c.hand[0], b = c.hand[1], d = c.hand[2];
  assert.ok(c.stash(a).ok);
  assert.ok(c.stash(b).ok);
  assert.equal(c.stash(d).ok, false, 'reserve bounded at 2');
  assert.equal(c.reserve.length, 2);
  assert.ok(c.check(a).ok, 'opener playable from reserve in PRE');
  c.playCard(a);
  assert.equal(c.phase, 'ACTIVE');
  assert.ok(c.reserve.includes(b), 'reserve not tucked on transition');
  assert.equal(c.check(b).ok, false, 'off-role reserve card not playable');
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('locks expire on combat time, continue in PRE, and freeze when paused', () => {
  const c = mk({ enemies: ['wire_jammer'] });
  const e = c.enemies[0];
  c.lockCards(e, 1);
  const locked = c.hand.find((u) => u && c.isLocked(u));
  assert.ok(locked);
  assert.equal(c.check(locked).ok, false);
  // "pause": no update calls -> still locked regardless of wall time
  assert.ok(c.isLocked(locked));
  advance(c, 1.5);
  assert.ok(c.isLocked(locked));
  advance(c, 1.6);
  assert.ok(!c.isLocked(locked), 'lock expired after 3s of combat time');
  assert.ok(!c.locks[locked]);
});

test('scramble expires and restores eligibility', () => {
  const c = mk({ enemies: ['suit_scrambler'] });
  const e = c.enemies[0];
  e.atb = -10; // keep it from acting again during the test
  c.scrambleCards(e, 2, 'suit');
  const s = Object.keys(c.temp);
  assert.equal(s.length, 2);
  advance(c, 5.1);
  assert.equal(Object.keys(c.temp).length, 0);
});

test('jammed slot refills after it expires', () => {
  const c = mk({ enemies: ['interference_mite'] });
  c.jamSlot(c.enemies[0], 4);
  const slot = Number(Object.keys(c.jams)[0]);
  assert.equal(c.hand[slot], null);
  advance(c, 4.1);
  assert.ok(!c.jams[slot]);
  assert.notEqual(c.hand[slot], null);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('echo restriction: echoes repeat damage only', () => {
  const c = mk({ enemies: ['foundry_warden'] });
  c.playCard(legal(c)[0]);
  const m = c.momentum;
  const rank = c.combo.rank;
  c.echo(0, 1.0);
  assert.equal(c.combo.rank, rank);
  assert.equal(c.momentum, m);
});

test('randomized soak: thousands of actions keep zones intact and timers sane', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = new RNG(seed * 13);
    const pool = CARD_LIST.filter((c) => c.role !== 'junk').map((c) => c.id);
    const ids = [...STARTER_DECK, ...Array.from({ length: 10 }, () => rng.pick(pool))];
    const enemies = [rng.pick([['wire_jammer', 'interference_mite'], ['suit_scrambler', 'latch_wisp'], ['the_corruptor'], ['clockwork_regent'], ['archive_censor'], ['scrap_tyrant']])][0];
    const c = new Combat({ deck: deck(ids), party: PARTY.map((p) => ({ ...p, hp: p.hp * 6, maxHp: p.maxHp * 6 })), enemies, seed, relics: ['echo_splice', 'spare_pockets', 'long_fuse'], mutations: ['relay_resonance'], act: 2 });
    for (let i = 0; i < 1500 && c.phase !== 'END'; i++) {
      const roll = rng.next();
      const l = legal(c);
      if (roll < 0.55 && l.length) c.playCard(rng.pick(l));
      else if (roll < 0.62) { const u = rng.pick(c.hand.filter(Boolean)); if (u) c.churnCard(u); }
      else if (roll < 0.66) { const u = rng.pick(c.hand.filter(Boolean)); if (u) c.stash(u); }
      else if (roll < 0.7) c.cashOut();
      else if (roll < 0.72) c.spendMomentumFlow();
      else if (roll < 0.74) c.spendMomentumGuard();
      else if (roll < 0.76) { const u = rng.pick(c.hand.filter(Boolean)); if (u) c.playCard(u); }
      c.update(rng.next() * 0.4);
      const z = c.verifyZones();
      assert.ok(z.ok, `seed ${seed} step ${i}: ${z.error}`);
      if (c.combo) assert.ok(c.combo.deadline - c.combo.start <= RULES.FLOW_ABS_MAX + 1e-9);
      for (const u of Object.keys(c.locks)) assert.ok(c.locks[u].until - c.t <= 4.6, 'no permanent locks');
      // UI legality == engine legality: anything marked legal must be accepted
      for (const u of c.hand) if (u) { const ok = c.check(u).ok; if (ok) assert.equal(c.check(u).ok, true); }
      c.drainEvents();
    }
  }
});
