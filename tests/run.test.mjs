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
      assert.ok(Number.isInteger(run.d.hp) && run.d.hp >= 1 && run.d.hp <= run.d.maxHp, `${ev.id} choice ${i}: party HP ${run.d.hp}/${run.d.maxHp}`);
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

test('saving during a battle never keeps the action queue: Continue restarts the fight with Ready heroes and nothing pending', async () => {
  const { Combat } = await import('../src/engine/combat.js');
  const run = Run.create({ seed: 77 });
  run.d.pending = null;
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  const c = new Combat(setup);
  for (const e of c.enemies) e.atb = -100;
  const basics = c.hand.filter((u) => u && c.categoryOf(u) === 'basic').sort((a, b) => c.effRank(a) - c.effRank(b));
  for (const u of basics) c.commit(u);
  c.selectHero(['V', 'C', 'S'].find((h) => h !== c.combo.hero));
  assert.ok(c.executing && c.queue.length >= 1, 'commands in flight when the game is saved');
  const saved = JSON.parse(JSON.stringify(run.serialize()));
  assert.ok(!JSON.stringify(saved).includes('"queue"') && !JSON.stringify(saved).includes('recoverUntil'), 'no combat scheduling state in the save');
  const re = Run.load(saved);
  assert.equal(re.d.version, 6, 'the current save version (6)');
  const again = new Combat(re.battleSetup());
  assert.deepEqual(['V', 'C', 'S'].map((h) => again.heroState(h)), ['READY', 'READY', 'READY']);
  assert.deepEqual([again.queue.length, again.executing, again.reserved, again.combo, again.momentum], [0, null, 0, null, c.opts.relics && c.opts.relics.includes('pressure_gauge') ? 2 : 0]);
  assert.deepEqual(again.enemies.map((e) => e.id), c.enemies.map((e) => e.id), 'the same encounter');
  assert.deepEqual([...again.cards.keys()].sort(), [...c.cards.keys()].sort(), 'the same deck, every card present');
  assert.deepEqual(again.verifyZones(), { ok: true });
});

test('each boss offers its own trophy relic, and trophies never appear in normal pools', () => {
  for (const [boss, trophy] of [['clockwork_regent', 'regent_mainspring'], ['scrap_tyrant', 'scrap_heart']]) {
    const run = Run.create({ seed: 5 });
    run.d.bosses[1] = boss;
    const node = run.d.map.nodes.find((n) => n.type === 'boss');
    const r = run.makeReward(node, 'boss', { scrapBonus: 0 });
    assert.equal(r.relics[0], trophy);
  }
  const run = Run.create({ seed: 6 });
  for (let i = 0; i < 50; i++) for (const id of run.randomRelics(run.rng('p', i), 3)) assert.notEqual(RELICS[id].rarity, 'boss');
});

// ── Phase 3: shared party HP ──
test('a version-3 save converts once to the shared pool (a knocked-out hero counts 0)', () => {
  const v4 = Run.create({ seed: 71 }).serialize();
  const v3 = { ...v4, version: 3, party: [{ id: 'V', hp: 20, maxHp: 46 }, { id: 'C', hp: 0, maxHp: 34 }, { id: 'S', hp: 38, maxHp: 44 }] };
  delete v3.hp; delete v3.maxHp;
  const run = Run.load(JSON.parse(JSON.stringify(v3)));
  assert.ok(run, 'loads');
  assert.equal(run.d.version, 6, 'converted through versions 4 and 5 to the current version 6');
  assert.deepEqual([run.d.hp, run.d.maxHp], [58 + 12, 124 + 12], 'sum of the old pools plus the shared-pool bonus');
  assert.deepEqual(run.d.party, [{ id: 'V' }, { id: 'C' }, { id: 'S' }]);
  const again = Run.load(JSON.parse(JSON.stringify(run.serialize())));
  assert.deepEqual([again.d.hp, again.d.maxHp], [70, 136], 'no second conversion');
  assert.equal(Run.load({ ...v4, version: 2 }), null, 'unknown versions are still refused');
});

test('battles start from the pool and write it back; Patch Kit heals the party 12', () => {
  const run = Run.create({ seed: 72, starterRelic: 'patch_kit' });
  run.d.pending = null;
  run.d.hp = 70;
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  const c = new Combat(setup);
  assert.deepEqual([c.hp, c.maxHp], [70, 130]);
  c.hitParty(c.enemies[0], 'C', 20);
  for (const e of c.enemies) { e.hp = 0; e.alive = false; }
  c.checkEnd();
  run.finishBattle(c.outcome());
  assert.equal(run.d.hp, 70 - 20 + 12);
});

test('events take HP from and give HP to the pool', () => {
  const play = (id, idx, hp = 100) => {
    const run = Run.create({ seed: 73 });
    run.d.scrap = 200;
    run.d.hp = hp;
    run.d.pending = { type: 'event', nodeId: 'x', eventId: id, result: null };
    return [run, run.eventChoose(idx)];
  };
  assert.equal(play('tutorial_kiosk', 1)[0].d.hp, 92, 'Smash it: -8');
  // Pay in blood: the 15 HP are paid when the graft goes onto a card (Phase 8: cancelling costs nothing)
  const [oracle] = play('rust_oracle', 0);
  assert.equal(oracle.d.hp, 100);
  const target = oracle.d.deck.find((x) => oracle.canApplySelect(oracle.d.pending.select.action, x));
  assert.ok(oracle.applySelect(oracle.d.pending.select.action, target.uid));
  assert.equal(oracle.d.hp, 85, 'Pay in blood: -15');
  assert.equal(play('cable_garden', 0, 50)[0].d.hp, 80, 'Drink the current: +30');
  const [belt] = play('discard_belt', 1);
  assert.equal(belt.d.maxHp, 125, 'Grab the whole stack: party max HP -5');
  const [plate] = play('grease_monkey', 2);
  assert.equal(plate.d.maxHp, 136);
  const [, kick] = play('vending', 0, 6);
  assert.deepEqual(kick, { error: 'The party is too hurt' });
  const [core] = play('core_dump', 0);
  assert.equal(core.d.maxHp, 130 - 13);
  assert.ok(core.d.hp <= core.d.maxHp);
});

// ── Phase 4: save version 5 (card catalogue) ──
import fs from 'node:fs';
import { CARDS as CARDDEFS, MIGRATE_CARDS, rewardPool as pool, graftPool } from '../src/data/cards.js';
const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const strip = (d) => {
  const { deck, version, hp, maxHp, party, exFound, ...rest } = d;
  if (rest.stats) { const { exActivations, exByRecipe, exOverlaps, exDamage, ...st } = rest.stats; rest.stats = st; }
  return rest;
};
const mods = (c) => ({ uid: c.uid, up: c.up, graft: c.graft, rankMod: c.rankMod, variant: c.variant });

function checkCardMigration(before, after) {
  assert.equal(after.deck.length, before.deck.length, 'no card added or lost');
  for (let i = 0; i < before.deck.length; i++) {
    const a = before.deck[i], b = after.deck[i];
    assert.deepEqual(mods(b), mods(a), `${a.uid} keeps uid, upgrade, graft, rank modifier and suit`);
    const expect = MIGRATE_CARDS[a.id] || a.id;
    assert.equal(b.id, expect, `${a.id} → ${b.id}`);
    assert.ok(CARDDEFS[b.id] && CARDDEFS[b.id].p4 !== 'withheld', `${b.id} is playable`);
    if (b.id !== a.id) assert.equal(b.was, a.id);
    if (a.variant && a.variant !== CARDDEFS[b.id].variant) assert.equal(b.recut, true, `${a.id}: an earlier recut stays marked`);
  }
}

test('a genuine 0.2.2 save (version 3, Act I) loads as version 6: pool HP, cards and every modifier kept', () => {
  const v3 = fixture('save-v3-0.2.2-act1.json');
  assert.equal(v3.version, 3);
  const run = Run.load(JSON.parse(JSON.stringify(v3)));
  assert.ok(run);
  assert.equal(run.d.version, 6);
  assert.deepEqual([run.d.hp, run.d.maxHp], [38 + 22 + 38 + 12, 46 + 34 + 38 + 12]);
  checkCardMigration(v3, run.d);
  const ids = run.d.deck.map((c) => c.id);
  for (const gone of ['grand_relay', 'relay_baton', 'chorus_break', 'hand_off']) assert.ok(!ids.includes(gone), gone);
  for (const kept of ['echo_chamber', 'pocket_watch', 'capstone', 'feedback_loop', 'final_notice', 'scrapfall']) assert.ok(ids.includes(kept), kept);
  const fn = run.d.deck.find((c) => c.id === 'final_notice');
  assert.deepEqual([fn.up, fn.graft], [true, 'breaker'], 'a rare upgraded, grafted card survives as itself');
  assert.deepEqual(strip(run.d), strip(v3), 'map, position, relics, Scrap, stats, flags and pending state untouched');
});

test('a genuine 0.2.3 save (version 4, Act II) loads as version 6 and plays on', () => {
  const v4 = fixture('save-v4-0.2.3-act2.json');
  assert.equal(v4.version, 4);
  const run = Run.load(JSON.parse(JSON.stringify(v4)));
  assert.equal(run.d.version, 6);
  assert.deepEqual([run.d.hp, run.d.maxHp, run.d.act], [v4.hp, v4.maxHp, 2]);
  checkCardMigration(v4, run.d);
  assert.deepEqual(strip(run.d), strip(v4));
  // Continue in Act II: the next battle builds and plays under the new rules
  run.enterNode(run.availableNodes()[0]);
  const setup = run.battleSetup();
  if (setup) {
    const c = new Combat(setup);
    for (const e of c.enemies) e.atb = -100;
    const b = c.hand.find((u) => u && c.check(u).ok && c.categoryOf(u) === 'basic');
    assert.ok(b, 'a basic attack is playable at once');
    c.playCard(b);
    assert.equal(c.phase, 'ACTIVE');
    assert.deepEqual(c.verifyZones(), { ok: true });
  }
});

test('loading is idempotent; a fresh version-6 run round-trips unchanged', () => {
  const once = Run.load(fixture('save-v3-0.2.2-act1.json')).serialize();
  const twice = Run.load(JSON.parse(JSON.stringify(once))).serialize();
  assert.deepEqual(twice, once);
  const fresh = Run.create({ seed: 91 }).serialize();
  assert.equal(fresh.version, 6);
  assert.deepEqual(Run.load(JSON.parse(JSON.stringify(fresh))).serialize(), fresh);
});

test('an unknown card id becomes a Medium basic attack; offered cards in a pending reward migrate too', () => {
  const v4 = fixture('save-v4-0.2.3-act2.json');
  v4.deck[0] = { ...v4.deck[0], id: 'card_that_never_existed', up: true };
  v4.pending = { type: 'reward', nodeId: 'n', cards: [{ id: 'grand_relay', up: false, graft: null }, { id: 'crosscut', up: false, graft: null }], cardTaken: false };
  const run = Run.load(v4);
  assert.equal(run.d.deck[0].id, 'rivet_jab');
  assert.equal(run.d.deck[0].was, 'card_that_never_existed');
  assert.equal(run.d.deck[0].up, true);
  assert.deepEqual(run.d.pending.cards.map((c) => c.id), ['ladder_peak', 'crosscut']);
});

test('run card operations respect categories: suits and ranks only on attacks, transforms keep the category', () => {
  const run = Run.create({ seed: 92 });
  const heal = run.d.deck.find((c) => c.id === 'mend_circuit');
  const weak = run.d.deck.find((c) => c.id === 'scrapline');
  for (const a of ['recut', 'ex', 'rankup', 'rankdown']) {
    assert.equal(run.canApplySelect(a, heal), false, `${a} on support`);
    assert.equal(run.canApplySelect(a, weak), a !== 'rankdown', `${a} on a Weak attack`);
  }
  assert.ok(run.applySelect('transform', heal.uid));
  assert.equal(CARDDEFS[heal.id].category, 'support');
  assert.equal(CARDDEFS[heal.id].p4, 'converted');
  run.applySelect('recut', weak.uid);
  assert.equal(weak.recut, true);
  // removal keeps at least 4 basic attacks
  const basics = () => run.d.deck.filter((c) => CARDDEFS[c.id].category === 'basic');
  for (let i = 0; i < 20; i++) { const b = basics().find((c) => run.canRemove(c.uid)); if (b) run.removeCard(b.uid); }
  assert.equal(basics().length, 4);
  // no offer can be withheld content
  for (let i = 0; i < 50; i++) for (const c of run.cardChoices(run.rng('t', i), 4, { grafted: true })) { assert.equal(CARDDEFS[c.id].p4, 'converted'); assert.ok(!c.graft || graftPool().includes(c.graft)); }
  assert.ok(pool().length >= 45, `reward pool ${pool().length}`);
});

test('rewards keep a deck playable: under 40% basic attacks, the first card offered is a basic attack', () => {
  const run = Run.create({ seed: 93 });
  for (let i = 0; i < 12; i++) run.addCard({ id: 'scrap_feed' });
  assert.ok(run.categoryCount('basic') / run.d.deck.length < 0.4);
  for (let i = 0; i < 30; i++) {
    const offer = run.cardChoices(run.rng('g', i), 3, { kind: i % 3 === 0 ? 'elite' : 'battle' });
    assert.equal(CARDDEFS[offer[0].id].category, 'basic', `offer ${i}: ${offer.map((o) => o.id)}`);
  }
  const fresh = Run.create({ seed: 94 });
  const kinds = new Set();
  for (let i = 0; i < 40; i++) kinds.add(CARDDEFS[fresh.cardChoices(fresh.rng('h', i), 3)[0].id].category);
  assert.ok(kinds.size > 1, 'a balanced deck gets ordinary offers');
});

// ── Phase 7: save version 6 ──
test('a genuine 0.2.6 save (version 5) loads as version 6: everything kept, an empty EX Combo record added', () => {
  const v5 = fixture('save-v5-0.2.6-act1.json');
  assert.equal(v5.version, 5);
  const run = Run.load(JSON.parse(JSON.stringify(v5)));
  assert.ok(run);
  assert.equal(run.d.version, 6);
  assert.deepEqual(run.d.exFound, []);
  assert.equal(run.d.stats.exActivations, 0);
  assert.deepEqual(run.d.stats.exByRecipe, {});
  assert.deepEqual(run.d.deck, v5.deck, 'deck, upgrades and grafts unchanged');
  assert.deepEqual([run.d.hp, run.d.maxHp, run.d.scrap, run.d.act, run.d.floors, run.d.position], [v5.hp, v5.maxHp, v5.scrap, v5.act, v5.floors, v5.position]);
  assert.deepEqual(run.d.relics, v5.relics);
  assert.deepEqual(run.d.pending, v5.pending, 'the pending reward survives');
  assert.deepEqual(strip(run.d), strip(v5));
  for (const k of Object.keys(v5.stats)) assert.deepEqual(run.d.stats[k], v5.stats[k], `stat ${k} kept`);
  // idempotent: loading the converted save again changes nothing
  const once = run.serialize();
  assert.deepEqual(Run.load(JSON.parse(JSON.stringify(once))).serialize(), once);
});

test('a version-6 save with a damaged EX record loads safely', () => {
  const d = Run.create({ seed: 93 }).serialize();
  d.exFound = 'garbage';
  d.stats.exByRecipe = null;
  delete d.stats.exActivations;
  const run = Run.load(d);
  assert.ok(run);
  assert.deepEqual(run.d.exFound, []);
  assert.deepEqual(run.d.stats.exByRecipe, {});
  assert.equal(run.d.stats.exActivations, 0);
});
