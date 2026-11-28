import test from 'node:test';
import assert from 'node:assert/strict';
import { BASIC_GAIN, CARD_LIST, CARDS, RETIRED_ATTACKS, STARTER_DECK, rewardPool } from '../src/data/cards.js';
import { Combat, RULES } from '../src/engine/combat.js';
import { RNG } from '../src/core/rng.js';
import { Run, SAVE_VERSION } from '../src/engine/run.js';
import { normalizeMeta } from '../src/engine/save.js';
import { cardName, setLang, t } from '../src/i18n/index.js';

const ids = { 1: ['scrapline', 'scrapline_b'], 2: ['rivet_jab', 'hotwire'], 3: ['piston_strike', 'piston_strike_b'] };
const party = ['V', 'C', 'S'].map((id) => ({ id }));

function battle(cards, { hp = 80, momentum = 6 } = {}) {
  const deck = cards.map((spec, i) => ({ uid: `c${i}`, up: false, ...(typeof spec === 'string' ? { id: spec } : spec) }));
  const c = new Combat({ deck, party, hp, maxHp: 130, enemies: ['foundry_warden'], act: 1, seed: 81 });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => deck[i]?.uid || null);
  c.draw = [];
  c.enemies[0].hp = c.enemies[0].maxHp = 10000;
  c.enemies[0].atb = -50;
  c.momentum = momentum;
  return c;
}
function settle(c) {
  for (let i = 0; i < 600 && (c.executing || c.queue.length); i++) c.update(1 / 60);
  assert.ok(!c.executing && !c.queue.length);
  assert.deepEqual(c.verifyZones(), { ok: true });
}

test('the six foundation attacks use pairs of equal damage, upgrades and Momentum with hero contact', () => {
  assert.deepEqual(CARD_LIST.filter((c) => c.standard).map((c) => c.id), Object.values(ids).flat());
  assert.deepEqual(STARTER_DECK.filter((c) => CARDS[c.id].standard).map((c) => CARDS[c.id].rank), [1, 1, 1, 2, 2, 2, 3, 3]);
  const power = { 1: [5, 7], 2: [7, 9], 3: [10, 13] };
  for (const [rank, pair] of Object.entries(ids)) {
    for (const [i, id] of pair.entries()) {
      const d = CARDS[id];
      assert.deepEqual([d.rank, d.variant, d.owner, d.gain, d.cost], [+rank, i ? 'B' : 'A', null, BASIC_GAIN[rank], 0]);
      assert.deepEqual(d.v, { d: power[rank] });
      assert.ok(rewardPool().includes(d));
      for (const [hero, anim] of [['V', 'melee'], ['C', 'cast'], ['S', 'shoot']]) {
        for (const up of [false, true]) {
          const c = battle([{ id, up }], { momentum: 0 });
          c.selectHero(hero);
          assert.ok(c.playCard('c0').ok);
          assert.equal(c.executing.anim, anim);
          assert.equal(c.enemies[0].hp, 10000);
          settle(c);
          assert.equal(10000 - c.enemies[0].hp, power[rank][+up]);
          assert.equal(c.momentum, BASIC_GAIN[rank]);
        }
      }
    }
  }
});

test('all six foundation cards occur from normal rewards and shops and rare floors are kept', () => {
  const offered = new Set();
  const sold = new Set();
  for (let seed = 1; seed <= 240; seed++) {
    const run = Run.create({ seed });
    for (const spec of run.cardChoices(new RNG(seed), 3)) if (CARDS[spec.id].standard) offered.add(spec.id);
    for (const { spec } of run.makeShop(new RNG(seed), false).cards) if (CARDS[spec.id].standard) sold.add(spec.id);
    assert.ok(run.cardChoices(new RNG(seed), 3, { minRarity: 'rare' }).every(({ id }) => CARDS[id].rarity === 'rare'));
  }
  assert.deepEqual([...offered].sort(), Object.values(ids).flat().sort());
  assert.deepEqual([...sold].sort(), [...offered].sort());
});

test('short ascending paths still reach an Arte, while only a resolved 1-2-3 path earns Straight Circuit', () => {
  for (const path of [[1], [2], [3], [1, 3], [2, 3], [1, 2, 3]]) {
    const c = battle([...path.map((n) => ids[n][0]), 'scrapfall']);
    for (let i = 0; i <= path.length; i++) {
      assert.ok(c.playCard(`c${i}`).ok, path.join(','));
      settle(c);
    }
    assert.equal(c.stats.artes, 1);
    assert.equal(c.stats.exByRecipe.straight_circuit || 0, path.length === 3 ? 1 : 0);
  }
  const c = battle(['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall']);
  c.commit('c0');
  const m = c.commit('c1');
  c.commit('c2');
  assert.ok(c.cancelCmd(m.cmd.id));
  settle(c);
  assert.ok(c.playCard('c3').ok);
  settle(c);
  assert.equal(c.stats.exByRecipe.straight_circuit || 0, 0);
});

test('the Repair Kit heals only at contact and uses the chosen Ready hero with ordinary Recovery', () => {
  for (const { id } of party) for (const up of [false, true]) {
    const c = battle([{ id: 'mend_circuit', up }]);
    assert.ok(c.playCard('c0', { performer: id }).ok);
    assert.equal(c.executing.cmd.hero, id);
    assert.equal(c.momentum, 4);
    assert.equal(c.hp, 80);
    c.update(0.3);
    assert.equal(c.hp, 80);
    settle(c);
    assert.equal(c.hp, up ? 100 : 94);
    assert.equal(c.heroState(id), 'RECOVERING');
    assert.ok(party.filter((h) => h.id !== id).every((h) => c.heroReady(h.id)));
    assert.ok(c.discard.includes('c0') || c.hand.includes('c0'), 'the reusable card stays in the deck cycle');
    assert.ok(!c.exhaust.includes('c0'));
    assert.ok(!c.coverActive());
  }
});

test('an item cannot use the attacking or committed hero, and cancellation restores card and reservation', () => {
  const c = battle(['scrapline', 'mend_circuit', 'mend_circuit', 'rivet_jab']);
  c.commit('c0');
  assert.equal(c.commit('c1', { performer: 'V' }).ok, false);
  assert.equal(c.commit('c1', { performer: 'missing' }).ok, false);
  const kit = c.commit('c1', { performer: 'S' });
  assert.ok(kit.ok);
  assert.equal(c.reserved, 2);
  assert.equal(c.commit('c2', { performer: 'S' }).ok, false);
  assert.ok(!c.relayCheck('S').ok);
  assert.ok(c.cancelCmd(kit.cmd.id));
  assert.equal(c.reserved, 0);
  assert.ok(c.hand.includes('c1'));
  assert.equal(c.hp, 80);
  assert.ok(c.relayCheck('S').ok);
  assert.ok(c.commit('c1', { performer: 'C' }).ok);
  settle(c);
  assert.equal(c.hp, 94);
  assert.equal(c.combo.hero, 'V');
  assert.equal(c.stats.exByRecipe.healing_cadence, undefined);
  assert.ok(c.commit('c3').ok);
  settle(c);
  assert.equal(c.stats.exByRecipe.healing_cadence, 1);
});

test('v7 migration keeps old instances, rank and recut, and remaps offers without rerolling', () => {
  const old = Run.create({ seed: 91 }).serialize();
  old.version = 7;
  old.deck = [
    ...Object.keys(RETIRED_ATTACKS).map((id, i) => ({ id, uid: `old${i}`, up: true, graft: 'keen', rankMod: 0 })),
    { id: 'scrapline', uid: 'standardB', variant: 'B', rankMod: 1, up: true, graft: 'spark' },
    { id: 'rivet_jab', uid: 'recut', variant: 'EX', recut: true, rankMod: -1, up: true, graft: 'plated' },
    { id: 'mend_circuit', uid: 'kit', up: true, graft: 'cached', rankMod: 0 },
  ];
  old.pending = { type: 'shop', stock: { cards: [{ spec: { id: 'spark_primer', up: true }, price: 54, sold: false }] }, result: { offer: [{ id: 'tripwire' }] } };
  old.progress.cards = ['pinprick', 'lost_legacy_card'];
  old.exFound = ['straight_circuit'];
  const raw = structuredClone(old);
  const run = Run.load(old);
  assert.equal(run.d.version, SAVE_VERSION);
  for (const [i, d] of run.d.deck.entries()) {
    const a = raw.deck[i];
    assert.deepEqual([d.uid, d.up, d.graft, d.rankMod], [a.uid, a.up, a.graft, a.rankMod]);
    assert.ok(CARDS[d.id]);
    if (RETIRED_ATTACKS[a.id]) {
      assert.equal(d.was, a.id);
      assert.deepEqual([d.id, run.effVariant(d)], RETIRED_ATTACKS[a.id]);
    }
  }
  const standard = run.card('standardB');
  const recut = run.card('recut');
  assert.deepEqual([standard.id, run.effVariant(standard), run.effRank(standard)], ['scrapline_b', 'B', 2]);
  assert.deepEqual([recut.id, recut.recut, run.effVariant(recut), run.effRank(recut)], ['rivet_jab', true, 'EX', 1]);
  assert.equal(run.card('kit').id, 'mend_circuit');
  assert.deepEqual(run.d.pending.stock.cards[0], { spec: { id: 'scrapline', variant: 'EX', up: true }, price: 54, sold: false });
  assert.deepEqual(run.d.pending.result.offer, [{ id: 'piston_strike' }]);
  assert.ok(run.d.progress.cards.includes('lost_legacy_card'));
  assert.deepEqual(run.d.exFound, raw.exFound);
  assert.deepEqual(Run.load(run.serialize()).serialize(), run.serialize());
  const meta = normalizeMeta({ cardsSeen: ['spark_primer', 'unknown_old'], combos: { straight_circuit: { count: 3 } } });
  assert.deepEqual(meta.cardsSeen, ['spark_primer', 'scrapline', 'unknown_old']);
  assert.equal(meta.combos.straight_circuit.count, 3);
});

test('both languages distinguish the standardized pair and the neutral item', () => {
  try {
    setLang('en');
    assert.deepEqual([cardName('scrapline_b'), cardName('mend_circuit')], ['Weak Attack B', 'Repair Kit']);
    setLang('ru');
    assert.deepEqual([cardName('scrapline_b'), cardName('mend_circuit')], ['Слабая атака B', 'Ремкомплект']);
    assert.equal(t('Choose who uses the kit'), 'Кто применит ремкомплект?');
  } finally { setLang('en'); }
});
