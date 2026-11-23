// Phase 8 boss adaptation audit (docs/COMBAT_SPEC.md §29): for each of the eleven adaptations, against
// a real boss, (1) the penalty applies while it is active, (2) its advertised counterplay — performed
// only with player commands (cards, Cash Out, Perfect, Reserve, Momentum buttons) — breaks it, and
// (3) once broken the penalty stops. Break progress is never written by a test; boss actions come from
// the boss's own turns (its ATB is advanced to the point of acting) except where noted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { ADAPTATIONS, adaptationApplies } from '../src/data/adaptations.js';
import { ENEMIES } from '../src/data/enemies.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const spec = (s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s });
// a boss fight with a stacked hand and draw pile; the boss's HP is raised so the fight lasts
function fight(arch, hand, draw = [], o = {}) {
  const all = [...hand, ...draw];
  const adaptation = arch ? { ...ADAPTATIONS[arch] } : null;
  const c = new Combat({ deck: all.map(spec), party: PARTY, hp: 130, maxHp: 130, enemies: [o.boss || 'scrap_tyrant'], seed: o.seed || 9, relics: [], mutations: [], act: 1, adaptation });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < hand.length ? `c${i}` : null));
  c.draw = draw.map((_, i) => `c${hand.length + i}`);
  c.discard = [];
  c.exhaust = [];
  for (const e of c.enemies) { e.atb = -1000; e.hp = e.maxHp = 5000; e.guard = 0; }
  c.momentum = o.momentum !== undefined ? o.momentum : 6;
  c.drainEvents();
  return c;
}
const boss = (c) => c.enemies.find((e) => e.tier === 'boss');
const settle = (c, max = 20) => { for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60); };
const uid = (c, id) => [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === id);
function play(c, ...ids) { for (const id of ids) { const u = uid(c, id); assert.ok(u, `${id} is held`); const r = c.commit(u); assert.ok(r.ok, `${id}: ${r.chk && r.chk.reason}`); settle(c); } }
function waitReady(c, hero) {
  for (let i = 0; i < 25 * 60 && (c.combo || c.executing || c.queue.length || !c.heroReady(hero)); i++) c.update(1 / 60);
  assert.ok(!c.combo && c.heroReady(hero), `${hero} ready for a new combo`);
}
// one combo by `hero`: the cards in order, then FINISH (Perfect after an arte, else Cash Out)
function chain(c, hero, ids, finish = true) {
  waitReady(c, hero);
  c.selectHero(hero);
  play(c, ...ids);
  if (finish) { const r = c.finishOrCashOut(); assert.ok(r.ok, `finish: ${r.chk && r.chk.reason}`); settle(c); for (let i = 0; i < 120 && c.combo; i++) c.update(1 / 60); }
  return c.history.at(-1);
}
// the boss takes its own next turn (its ATB is brought to the point of acting)
function bossActs(c) {
  const e = boss(c);
  const n = e.actCount;
  e.atb = 0.999;
  for (let i = 0; i < 15 * 60 && e.actCount === n; i++) c.update(1 / 60);
  assert.ok(e.actCount > n, 'the boss acted');
  e.atb = -1000;
}
const broken = (c) => c.adapt.broken;
const REP = (ids, n) => Array.from({ length: n }, () => ids).flat();

test('eleven adaptations, one per archetype; each names its penalty and its break', () => {
  assert.equal(Object.keys(ADAPTATIONS).length, 11);
  for (const [arch, a] of Object.entries(ADAPTATIONS)) { assert.ok(a.desc && a.breakText && a.need > 0, arch); }
  // applicability: Hardened Locks only against a boss that Locks
  for (const b of Object.values(ENEMIES).filter((e) => e.tier === 'boss')) {
    assert.equal(adaptationApplies('interference', b), !!b.locks, b.name);
    for (const arch of Object.keys(ADAPTATIONS).filter((x) => x !== 'interference')) assert.ok(adaptationApplies(arch, b));
  }
  assert.equal(adaptationApplies('interference', ENEMIES.scrap_tyrant), false);
  assert.equal(adaptationApplies('interference', ENEMIES.the_corruptor || ENEMIES.corruptor), false);
  assert.equal(adaptationApplies('interference', ENEMIES.clockwork_regent), true);
});

test('Chain Dampener (ladder): 5th-card refunds halved → three short combos break it → refunds restored', () => {
  const FIVE = ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'fortress_slam'];
  // the natural refund the 5th card gives, measured below the Flow cap
  const fifth = (c) => { waitReady(c, 'V'); c.selectHero('V'); play(c, ...FIVE.slice(0, 4)); c.combo.deadline = c.t + 1; const d0 = c.combo.deadline, t0 = c.t; play(c, FIVE[4]); const got = c.combo.deadline - d0 - (c.t - t0); /* Flow does not run while a card executes */ c.finishOrCashOut(); settle(c); return got; };
  const plain = fifth(fight(null, FIVE, [], { momentum: 9 }));
  const c = fight('ladder', FIVE, REP(['scrapline', 'rivet_jab', 'scrapline', 'rivet_jab', 'scrapline', 'rivet_jab', ...FIVE], 2), { momentum: 9 });
  const damp = fifth(c);
  assert.ok(Math.abs(damp - plain / 2) < 0.03, `halved: ${damp.toFixed(3)} vs ${plain.toFixed(3)}`);
  assert.equal(c.adapt.progress, 0, 'a 5-card combo is not a short one');
  for (let i = 0; i < 3; i++) { const s = chain(c, 'V', ['scrapline', 'rivet_jab']); assert.equal(s.type, 'cashout'); assert.ok(s.len <= 4); }
  assert.ok(broken(c));
  assert.equal(c.adaptOn('long_chain'), false);
  assert.ok(Math.abs(fifth(c) - plain) < 0.03, 'refunds restored');
});

test('Payout Audit (cashout): payouts −40% → three Perfect combos break it → full payouts', () => {
  const pay = (c) => { waitReady(c, 'V'); c.selectHero('V'); play(c, 'scrapline', 'rivet_jab'); const p = c.payoutAmount(1).amount; c.finishOrCashOut(); settle(c); return p; };
  const plain = pay(fight(null, ['scrapline', 'rivet_jab']));
  const c = fight('cashout', ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'scrapfall'], REP(['scrapline', 'rivet_jab', 'scrapfall'], 6), { momentum: 8 });
  const audited = pay(c);
  assert.ok(Math.abs(audited - Math.round(plain * 0.6)) <= 1, `${audited} vs ${plain}`);
  for (let i = 0; i < 3; i++) assert.equal(chain(c, 'V', ['scrapline', 'rivet_jab', 'scrapfall']).type, 'perfect');
  assert.ok(broken(c));
  assert.equal(pay(c), plain, 'payout restored');
});

test('Guard Piercer (guard): boss hits ignore half of Guard → 60 arte damage breaks it → Guard absorbs fully', () => {
  const c = fight('guard', ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'scrapfall'], REP(['scrapline', 'rivet_jab', 'scrapfall'], 8), { momentum: 10 });
  const absorbed = () => { const g0 = 20; c.guard = g0; const h0 = c.hp; c.hitParty(boss(c), 'C', 14); return { lost: h0 - c.hp, guardUsed: g0 - c.guard }; }; // the boss's attack routine, on Corvin (no Defense)
  const before = absorbed();
  assert.ok(before.guardUsed <= 10 && before.lost > 0, `half the Guard usable: used ${before.guardUsed}, lost ${before.lost}`);
  c.guard = 0;
  let n = 0;
  while (!broken(c) && n < 8) { const p0 = c.adapt.progress; chain(c, 'V', ['scrapline', 'rivet_jab', 'scrapfall']); assert.ok(c.adapt.progress > p0, 'arte damage counts'); n++; }
  assert.ok(broken(c), `broken after ${n} arte combos`);
  const after = absorbed();
  assert.equal(after.lost, 0, 'Guard absorbs the whole hit again');
  assert.equal(after.guardUsed, 14);
});

test('Churn Tax (churn): each Churn pushes the boss ATB 15% → three combos without Churn break it → no push', () => {
  const c = fight('churn', ['scrapline', 'rivet_jab', 'junk_toss', 'scrapline', 'rivet_jab', 'junk_toss'], REP(['scrapline', 'rivet_jab', 'junk_toss'], 6));
  const push = () => { const e = boss(c); e.atb = 0.1; const r = c.churnCard(uid(c, 'junk_toss')); assert.ok(r.ok); const d = e.atb - 0.1; e.atb = -1000; return d; };
  // a Churn outside a combo always costs 5% ATB; the tax adds 15% on the boss
  assert.ok(Math.abs(push() - 0.20) < 0.01);
  // a combo with a Churn during it does not count
  waitReady(c, 'V'); c.selectHero('V'); play(c, 'scrapline'); c.churnCard(uid(c, 'junk_toss')); play(c, 'rivet_jab'); c.finishOrCashOut(); settle(c);
  assert.equal(c.adapt.progress, 0);
  for (let i = 0; i < 3; i++) chain(c, 'V', ['scrapline', 'rivet_jab']);
  assert.ok(broken(c));
  c.churn.charges = c.churnMax();
  assert.ok(Math.abs(push() - 0.05) < 0.01, 'only the ordinary 5% again');
});

for (const [arch, hit, counter] of [['variantA', 'scrapline', ['spark_primer', 'hotwire', 'quickdraw']], ['variantB', 'hotwire', ['scrapline', 'rivet_jab', 'piston_strike']]]) {
  test(`Suit Filter ${arch.slice(-1)} (${arch}): ${hit} deals 30% less → 8 off-suit cards break it → full damage`, () => {
    const dmg = (c) => { waitReady(c, 'V'); c.selectHero('V'); const h0 = boss(c).hp; play(c, hit); const d = h0 - boss(c).hp; c.finishOrCashOut(); settle(c); return d; };
    const plain = dmg(fight(null, [hit, 'scrapline']));
    const c = fight(arch, [hit, ...counter, hit, 'scrapline'], [...REP(counter, 4), hit, hit]);
    const filtered = dmg(c);
    assert.ok(Math.abs(filtered - Math.round(plain * 0.7)) <= 1, `${filtered} vs ${plain}`);
    while (!broken(c)) { const p0 = c.adapt.progress; chain(c, 'V', counter); assert.equal(c.adapt.progress - p0 >= 3 || broken(c), true); }
    assert.ok(c.adapt.progress >= 8);
    assert.equal(dmg(c), plain, 'full damage again');
  });
}

test('Relay Jammer (relay): Relays give no Momentum → two Perfect combos with ≤1 Relay break it → Relay Momentum back', () => {
  const c = fight('relay', ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'pinprick'], REP(['scrapline', 'rivet_jab', 'scrapfall', 'pinprick'], 6), { momentum: 8 });
  const relayGain = () => { waitReady(c, 'V'); waitReady(c, 'S'); c.momentum = Math.min(c.momentum, 3); c.selectHero('V'); play(c, 'scrapline', 'rivet_jab'); c.drainEvents(); assert.ok(c.selectHero('S').ok); settle(c); const g = c.drainEvents().filter((e) => e.type === 'momentum' && e.why === 'Relay').reduce((a, e) => a + e.delta, 0); play(c, 'pinprick'); c.finishOrCashOut(); settle(c); return g; };
  assert.equal(relayGain(), 0, 'jammed');
  for (let i = 0; i < 2; i++) assert.equal(chain(c, 'V', ['scrapline', 'rivet_jab', 'scrapfall']).type, 'perfect');
  assert.ok(broken(c));
  assert.equal(relayGain(), RULES.RELAY_MOMENTUM);
});

test('Momentum Siphon (momentum): boss turns drain 2 → spending 12 Momentum breaks it → no drain', () => {
  const c = fight('momentum', ['scrapline', 'rivet_jab'], ['piston_strike'], { momentum: 16 });
  const siphon = () => { c.drainEvents(); bossActs(c); return c.drainEvents().filter((e) => e.type === 'momentum' && e.why === 'Siphon').reduce((a, e) => a - e.delta, 0); };
  assert.equal(siphon(), 2);
  // the +GUARD button, four times (3 Momentum each)
  for (let i = 0; i < 4; i++) assert.ok(c.spendMomentumGuard().ok);
  assert.ok(broken(c));
  c.momentum = Math.max(c.momentum, 4);
  assert.equal(siphon(), 0);
});

test('Flow Clamp (flow): Flow gains halved → three quick Perfect combos break it → full Flow', () => {
  const gain = (c) => { waitReady(c, 'V'); c.selectHero('V'); play(c, 'scrapline'); c.combo.deadline = c.t + 1; const r = c.spendMomentumFlow(); assert.ok(r.ok); const g = c.combo.deadline - (c.t + 1); c.finishOrCashOut(); settle(c); return g; };
  const plain = gain(fight(null, ['scrapline', 'rivet_jab'], [], { momentum: 6 }));
  const c = fight('flow', ['scrapline', 'rivet_jab', 'scrapfall', 'scrapline', 'rivet_jab', 'scrapfall'], REP(['scrapline', 'rivet_jab', 'scrapfall'], 6), { momentum: 12 });
  const clamped = gain(c);
  assert.ok(Math.abs(clamped - plain / 2) < 0.05, `${clamped} vs ${plain}`);
  for (let i = 0; i < 3; i++) { const s = chain(c, 'V', ['scrapline', 'rivet_jab', 'scrapfall']); assert.equal(s.type, 'perfect'); assert.ok(s.duration < 6, `${s.duration}s`); }
  assert.ok(broken(c));
  c.momentum = Math.max(c.momentum, 6);
  assert.ok(Math.abs(gain(c) - plain) < 0.05);
});

test('Reserve Seal (reserve): boss turns seal the Reserve 3s → three Reserve plays break it → no seal', () => {
  const c = fight('reserve', ['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'rivet_jab', 'pinprick'], REP(['scrapline', 'rivet_jab', 'piston_strike'], 6));
  assert.ok(c.stash(uid(c, 'scrapline')).ok);
  bossActs(c);
  assert.ok(c.reserveLatchUntil > c.t, 'sealed after the boss turn');
  assert.equal(c.check(c.reserve[0]).reason, 'latched');
  for (let i = 0; i < 200 && c.reserveLatchUntil > c.t; i++) c.update(1 / 60);
  // play from Reserve, twice in one combo and once more in the next
  assert.ok(c.stash(uid(c, 'rivet_jab')).ok);
  waitReady(c, 'V'); c.selectHero('V');
  const [r1, r2] = c.reserve;
  assert.ok(c.commit(r1).ok); settle(c);
  assert.ok(c.commit(r2).ok); settle(c);
  c.finishOrCashOut(); settle(c);
  assert.equal(c.adapt.progress, 2);
  assert.ok(c.stash(uid(c, 'scrapline')).ok);
  waitReady(c, 'V'); c.selectHero('V');
  assert.ok(c.commit(c.reserve[0]).ok); settle(c);
  assert.ok(broken(c));
  for (let i = 0; i < 300 && (c.combo || c.executing); i++) c.update(1 / 60);
  bossActs(c);
  assert.ok(c.reserveLatchUntil <= c.t, 'no seal after a boss turn');
});

test('Hardened Locks (interference, Clockwork Regent): Locks last 4.5s → 50 damage while Locked breaks it → 3s Locks', () => {
  const HAND = ['scrapline', 'rivet_jab', 'scrapfall', 'thermal_lance', 'scrapline', 'rivet_jab'];
  const c = fight('interference', HAND, REP(['scrapline', 'rivet_jab', 'scrapfall', 'thermal_lance', 'pinprick', 'bolt_volley'], 6), { boss: 'clockwork_regent', momentum: 12 });
  const e = boss(c);
  // the Regent's own turn: its opening intent is a Royal Decree (Lock 2)
  assert.equal(e.intent.kind, 'lock');
  bossActs(c);
  const locked = Object.values(c.locks);
  assert.ok(locked.length >= 1);
  assert.ok(locked.every((l) => Math.abs(l.dur - 4.5) < 1e-9), 'Locks last 4.5s');
  // while a card is Locked, play the free ones: damage counts only while something is Locked
  let n = 0;
  while (!broken(c) && n < 6) {
    if (c.disruptedCount() === 0) { while (boss(c).intent.kind !== 'lock' && !(boss(c).intent.key === 'tempo' && !c.combo)) bossActs(c); bossActs(c); }
    const hero = ['V', 'C', 'S'].find((h) => c.heroReady(h));
    if (!hero || c.combo) { c.update(1 / 60); continue; }
    c.selectHero(hero);
    const free = [...c.hand].filter((u) => u && !c.isLocked(u) && c.check(u).ok && c.categoryOf(u) === 'basic');
    if (!free.length) { c.update(0.1); continue; }
    const p0 = c.adapt.progress;
    assert.ok(c.commit(free[0]).ok); settle(c);
    if (c.disruptedCount() > 0) assert.ok(c.adapt.progress > p0 || broken(c), 'damage while Locked counts');
    const arte = [...c.hand].find((u) => u && !c.isLocked(u) && c.check(u).ok && c.categoryOf(u) === 'arte');
    if (arte) { c.commit(arte); settle(c); }
    if (c.combo) { c.finishOrCashOut(); settle(c); }
    n++;
  }
  assert.ok(broken(c), `progress ${c.adapt.progress}/${c.adapt.need}`);
  // once broken, the Regent's Locks last the ordinary 3s
  for (let i = 0; i < 400 && c.disruptedCount() > 0; i++) c.update(1 / 60);
  for (let k = 0; k < 6 && boss(c).intent.kind !== 'lock'; k++) bossActs(c);
  assert.equal(boss(c).intent.kind, 'lock');
  bossActs(c);
  assert.ok(Object.values(c.locks).length >= 1 && Object.values(c.locks).every((l) => Math.abs(l.dur - RULES.LOCK_DURATION) < 1e-9));
});

test('an adaptation is off once its boss is gone, and Hardened Locks is never chosen against a boss that cannot Lock', async () => {
  const { Run } = await import('../src/engine/run.js');
  for (let seed = 1; seed <= 60; seed++) {
    const run = Run.create({ seed, tutorial: false });
    const bossId = run.d.bosses[1];
    // a run whose evidence is all interference: Hardened Locks only if this boss Locks
    run.d.deck.push(...['tinder_toss', 'fault_finder', 'static_bloom', 'thermal_lance', 'kindling', 'detonate', 'signal_boost', 'jam_breaker'].map((id, i) => ({ uid: `i${i}`, id, up: false })));
    run.d.stats.interferencePayoffs = 40;
    const a = run.bossAnalysis();
    if (a.arch === 'interference') assert.ok(ENEMIES[bossId].locks, `${bossId} cannot Lock`);
    if (!ENEMIES[bossId].locks) assert.notEqual(a.arch, 'interference');
  }
});
