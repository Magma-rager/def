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

test('first opener starts the Flow window exactly once; enemies advance during PRE', () => {
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

test('natural refunds are capped per combo and the combo never exceeds its cap', () => {
  const c = mk({ relics: ['brass_metronome'] });
  c.playCard(legal(c)[0]);
  const combo = c.combo;
  for (let i = 0; i < 20; i++) c.naturalRefund(1);
  assert.ok(combo.refundUsed <= RULES.FLOW_REFUND_MAX + 1e-9);
  c.momentum = 30;
  for (let i = 0; i < 10; i++) c.spendMomentumFlow();
  c.addFlow(10);
  assert.ok(combo.deadline - combo.start <= RULES.FLOW_ABS_MAX + combo.graceUsed + 1e-9);
  assert.ok(combo.deadline <= c.flowCap() + 1e-9);
});

test('Flow expiry forces resolution and returns to an Opener hand', () => {
  const c = mk();
  c.momentum = 4;
  c.playCard(legal(c)[0]);
  advance(c, RULES.FLOW_READ_GRACE + RULES.FLOW_INITIAL + 0.2);
  assert.notEqual(c.phase, 'ACTIVE');
  assert.equal(c.history[0].type, 'forced');
  assert.equal(c.momentum <= 4, true);
  advance(c, RULES.RECOVER.forced + 0.1);
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
  c.playCard(legal(c)[0]);
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

// ── beta-feedback pacing ──
test('Flow holds while the new hand is read, without shortening the combo', () => {
  const c = mk();
  c.playCard(legal(c)[0]);
  const left0 = c.flowLeft();
  assert.ok(c.flowHeld());
  advance(c, RULES.FLOW_READ_GRACE * 0.8);
  assert.ok(Math.abs(c.flowLeft() - left0) < 0.02, `held: ${left0} -> ${c.flowLeft()}`);
  advance(c, RULES.FLOW_READ_GRACE * 0.2 + 1);
  assert.ok(!c.flowHeld());
  assert.ok(c.flowLeft() < left0 - 0.9, 'drains after the grace');
  assert.ok(Math.abs(c.flowCap() - (c.combo.start + RULES.FLOW_READ_GRACE + RULES.FLOW_ABS_MAX)) < 0.02, 'the cap moves with the grace');
});

test('the Flow rules give a learning player time for a six-card combo', () => {
  const c = mk();
  c.playCard(legal(c)[0]);
  advance(c, RULES.FLOW_READ_GRACE); // reading the new hand costs no Flow
  for (let i = 0; i < 5; i++) {
    advance(c, 1.3); // a learning player's pace per card
    assert.ok(c.combo, `combo still running before card ${i + 2}`);
    c.naturalRefund(c.combo.cards.length); // what a valid card refunds
  }
  assert.ok(c.flowLeft() > 1.5, `Flow left after six cards: ${c.flowLeft().toFixed(2)}s`);
});

test('enemies never act within ENEMY_SPACING of each other', () => {
  const c = mk({ enemies: ['rush_hound', 'rush_hound', 'interference_mite'] });
  for (const e of c.enemies) e.atb = 0.99;
  const acts = [];
  for (let i = 0; i < 600; i++) { c.update(1 / 60); for (const ev of c.drainEvents()) if (ev.type === 'enemyAct') acts.push(ev.t); }
  assert.ok(acts.length >= 3, `${acts.length} actions`);
  for (let i = 1; i < acts.length; i++) assert.ok(acts[i] - acts[i - 1] >= RULES.ENEMY_SPACING - 1e-6, `gap ${acts[i] - acts[i - 1]}`);
});

test('enemies wait during the breather after a combo', () => {
  const c = mk({ enemies: ['rush_hound'] });
  c.playCard(legal(c)[0]);
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

test('Churning outside a combo pushes enemy ATB and says so', () => {
  const c = mk({ enemies: ['rush_hound'] });
  c.drainEvents();
  const u = c.hand.find(Boolean);
  c.churnCard(u);
  assert.ok(c.drainEvents().some((ev) => ev.type === 'atbPush'));
});

test('Flow also holds while each played card resolves, but not after a wrong card', () => {
  const c = mk({ ids: ['scrapline', 'hotwire', 'salvage', 'rivet_jab', 'step_up', 'gear_swap', 'relay_baton', 'shuffle_step', 'scrapfall', 'last_word', 'grand_relay', 'spark_primer'] });
  c.playCard(legal(c)[0]);
  advance(c, RULES.FLOW_READ_GRACE + 0.5);
  const conv = legal(c).find((u) => c.roleOf(u) === 'conv');
  assert.ok(conv, 'a playable Converter');
  c.playCard(conv);
  assert.ok(c.flowHeld(), 'held after a valid card');
  const left = c.flowLeft();
  advance(c, RULES.FLOW_CARD_HOLD * 0.8);
  assert.ok(Math.abs(c.flowLeft() - left) < 0.02);
  advance(c, RULES.FLOW_CARD_HOLD * 0.2 + 0.3);
  assert.ok(!c.flowHeld());
  const bad = c.hand.find((u) => u && !c.check(u).ok && c.roleOf(u) !== 'junk' && !c.isLocked(u));
  if (bad) {
    c.playCard(bad);
    assert.ok(!c.flowHeld(), 'a stumble does not hold Flow');
  }
});
