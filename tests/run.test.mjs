import test from 'node:test';
import assert from 'node:assert/strict';
import { Run, MAP_DEPTHS } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { EVENTS } from '../src/data/events.js';
import { RELICS, RELIC_IDS } from '../src/data/relics.js';
import { ENEMIES } from '../src/data/enemies.js';
import { CARDS } from '../src/data/cards.js';

test('content targets: relics, events, enemies, bosses', () => {
  assert.ok(RELIC_IDS.length >= 24);
  for (const r of ['junk_dividend', 'heat_shield', 'echo_splice', 'breach_clamp']) assert.ok(RELICS[r]);
  assert.ok(EVENTS.length >= 18);
  const tiers = (t) => Object.values(ENEMIES).filter((e) => e.tier === t && e.art !== 'shard').length;
  assert.ok(tiers('normal') >= 12, `normals ${tiers('normal')}`);
  assert.ok(tiers('elite') >= 6);
  assert.ok(tiers('boss') >= 6);
});

test('every generated map guarantees a legal route to the boss', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const run = Run.create({ seed });
    for (const act of [1, 2, 3]) {
      run.generateMap(act);
      assert.ok(run.verifyMap(), `seed ${seed} act ${act}`);
      const m = run.d.map;
      for (let d = 0; d < MAP_DEPTHS; d++) assert.ok(m.nodes.some((n) => n.depth === d));
      assert.ok(m.nodes.some((n) => n.type === 'shop'));
      assert.ok(m.nodes.some((n) => n.type === 'elite'));
      // more than one route: depth 0 has multiple nodes
      assert.ok(m.nodes.filter((n) => n.depth === 0).length >= 2);
    }
  }
});

test('illegal movement is rejected and visits are chronological', () => {
  const run = Run.create({ seed: 5 });
  run.d.pending = null;
  const deep = run.d.map.nodes.find((n) => n.depth === 3);
  assert.equal(run.enterNode(deep.id), null);
  const first = run.availableNodes()[0];
  run.enterNode(first);
  assert.deepEqual(run.d.path, [first]);
  assert.equal(run.availableNodes().length, 0, 'cannot move while a node is pending');
});

test('reward choice survives immediate save and continue', () => {
  const run = Run.create({ seed: 9 });
  run.d.pending = null;
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  const c = new Combat(setup);
  for (const e of c.enemies) { e.hp = 0; e.alive = false; }
  c.checkEnd();
  run.finishBattle(c.outcome());
  assert.equal(run.d.pending.type, 'reward');
  const before = run.d.deck.length;
  run.takeReward('card', 0);
  const json = JSON.stringify(run.serialize());
  const loaded = Run.load(JSON.parse(json));
  assert.equal(loaded.d.deck.length, before + 1);
  assert.equal(loaded.d.pending.cardTaken, true);
  assert.equal(loaded.takeReward('card', 1), false, 'cannot double-take after reload');
});

test('boss -> reward -> mutation -> act II transition persists through save', () => {
  const run = Run.create({ seed: 11 });
  run.d.pending = null;
  const boss = run.d.map.nodes.find((n) => n.type === 'boss');
  const prev = run.d.map.nodes.find((n) => n.edges.includes(boss.id));
  run.d.position = prev.id;
  run.enterNode(boss.id);
  assert.equal(run.d.pending.type, 'bossprep');
  run.chooseBossPrep('prepared', 'brace');
  const setup = run.battleSetup();
  assert.equal(setup.kind, 'boss');
  assert.equal(setup.prep.startGuard, 15);
  const c = new Combat(setup);
  assert.equal(c.guard, 15);
  c.enemies.forEach((e) => { e.hp = 0; e.alive = false; });
  c.checkEnd();
  run.finishBattle(c.outcome());
  assert.equal(run.d.pending.type, 'reward');
  assert.ok(run.d.pending.boss);
  run.takeReward('relic', 0);
  run.finishReward();
  assert.equal(run.d.pending.type, 'mutation');
  const mut = run.d.pending.options[0];
  run.chooseMutation(mut);
  const loaded = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  assert.ok(loaded.d.mutations.includes(mut));
  assert.equal(loaded.d.pending.type, 'story');
  loaded.advanceAct();
  assert.equal(loaded.d.act, 2);
  assert.equal(loaded.d.map.act, 2);
  assert.ok(loaded.d.mutations.includes(mut));
  assert.equal(loaded.d.bossDecisions[0].result, 'victory');
});

test('boss adaptation requires real evidence', () => {
  const run = Run.create({ seed: 3 });
  assert.equal(run.analyzeProfile().length, 0, 'fresh run has no specialization');
  run.d.stats.combos = 1; run.d.stats.cashouts = 1;
  assert.equal(run.analyzeProfile().length, 0, 'one cash out is not a build');
  run.d.stats.battles = 6; run.d.stats.combos = 30; run.d.stats.cashouts = 16;
  const p = run.analyzeProfile();
  assert.equal(p[0].arch, 'cashout');
});

test('events run without errors and card selections apply', () => {
  for (const ev of EVENTS) {
    for (let i = 0; i < ev.choices.length; i++) {
      const run = Run.create({ seed: 17 + i });
      run.d.scrap = 200;
      run.d.pending = { type: 'event', nodeId: 'x', eventId: ev.id, result: null };
      const r = run.eventChoose(i);
      assert.ok(r, `${ev.id} choice ${i}`);
      if (run.d.pending.select) {
        const sel = run.d.pending.select;
        const target = run.d.deck.find((c) => run.canApplySelect(sel.action, c));
        if (target) assert.ok(run.applySelect(sel.action, target.uid), `${ev.id} ${sel.action}`);
      }
      if (run.d.pending.result && run.d.pending.result.offer) assert.ok(run.takeOfferCard(0));
      for (const c of run.d.deck) assert.ok(CARDS[c.id], 'valid card ids');
    }
  }
});

test('shop purchases modify currency and inventory', () => {
  const run = Run.create({ seed: 21 });
  run.d.scrap = 500;
  run.d.pending = { type: 'shop', nodeId: 'x', stock: run.makeShop(run.rng('s'), false) };
  const price = run.d.pending.stock.cards[0].price;
  const n = run.d.deck.length;
  assert.ok(run.shopBuy('card', 0).ok);
  assert.equal(run.d.scrap, 500 - price);
  assert.equal(run.d.deck.length, n + 1);
  assert.equal(run.shopBuy('card', 0).ok, false, 'sold out');
  const rp = run.d.pending.stock.relics[0];
  assert.ok(run.shopBuy('relic', 0).ok);
  assert.ok(run.d.relics.includes(rp.id));
  const victim = run.d.deck.find((c) => run.canRemove(c.uid));
  assert.ok(run.shopService('remove', victim.uid));
  assert.ok(!run.card(victim.uid));
});

test('restarting or continuing a battle reuses the same encounter', () => {
  const run = Run.create({ seed: 77 });
  run.d.pending = null;
  run.enterNode(run.availableNodes()[0]);
  const a = run.battleSetup();
  const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  const b = re.battleSetup();
  const c = run.battleSetup();
  assert.deepEqual(a.enemies, b.enemies);
  assert.deepEqual(a.enemies, c.enemies);
  assert.equal(a.seed, c.seed);
});
