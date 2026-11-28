import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS } from '../src/data/cards.js';
import { ENEMIES, FORMATIONS } from '../src/data/enemies.js';
import { RECIPE_IDS } from '../src/data/recipes.js';
import { Run } from '../src/engine/run.js';
import { RNG } from '../src/core/rng.js';
import { defaultMeta, normalizeMeta } from '../src/engine/save.js';
import { awardAchievements, collections } from '../src/engine/progression.js';

function fixture(hand, draw, opts = {}) {
  const deck = [...hand, ...draw].map((v, i) => ({ uid: String(i + 1), ...(typeof v === 'string' ? { id: v } : v) }));
  const c = new Combat({ deck, hp: 110, maxHp: 130, party: ['V','C','S'].map((id) => ({ id })),
    seed: 11, relics: [], mutations: [], act: 1, enemies: ['rush_hound'], ...opts });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => i < hand.length ? deck[i].uid : null);
  c.draw = deck.slice(hand.length).map((d) => d.uid);
  c.momentum = 6;
  for (const e of c.enemies) { e.atb = -100; if (!opts.enemies) e.maxHp = e.hp = 1000; }
  return c;
}
const find = (c, id) => [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === id);
function settle(c) {
  for (let i = 0; i < 200 && (c.executing || c.queue.length); i++) c.update(1/60);
  assert.ok(c.verifyZones().ok);
}
function play(c, id) {
  assert.ok(c.commit(find(c, id)).ok, id);
  settle(c);
}
function churn(c, id) {
  assert.ok(c.churnCard(find(c, id)).ok, id);
}

test('Index Slug primes the next hit only after the exact Churn draw is executed', () => {
  const c = fixture(['scrapline','salvage','junk_toss','piston_strike','scrapfall','bolt_volley'], ['scrapline_b','index_slug','rivet_jab']);
  play(c, 'scrapline');
  churn(c, 'salvage');
  assert.ok(c.combo.churnDraws.has(find(c, 'index_slug')));
  play(c, 'index_slug');
  assert.equal(c.combo.pendingBonus, 6);
  play(c, 'piston_strike');
  assert.equal(c.combo.cards.at(-1).dmg, CARDS.piston_strike.v.d[0] + 6);
  assert.equal(c.combo.churnDraws.size, 0);

  const another = fixture(['scrapline','salvage','piston_strike','scrapfall','bolt_volley','mend_circuit'], ['cold_start','index_slug','pocket_gauge']);
  play(another, 'scrapline');
  churn(another, 'salvage');
  const uid = find(another, 'index_slug');
  churn(another, 'index_slug');
  assert.ok(!another.combo.churnDraws.has(uid));
  assert.ok(another.verifyZones().ok);
});

test('a Junk Toss drawn by Churn gains its own payoff on the executed hit', () => {
  const c = fixture(['scrapline','salvage','piston_strike','scrapfall','bolt_volley','mend_circuit'], ['scrapline_b','junk_toss']);
  play(c, 'scrapline');
  churn(c, 'salvage');
  play(c, 'junk_toss');
  assert.equal(c.combo.cards.at(-1).dmg, 19);
});

test('only the last prepared Churn draw carries into the next chain, with no Salvage Circuit credit', () => {
  const c = fixture(['scrapline','salvage','piston_strike','scrapfall','bolt_volley','mend_circuit'], ['index_slug','pocket_gauge','scrapline_b']);
  churn(c,'salvage');
  const expired = find(c,'index_slug');
  churn(c,'mend_circuit');
  assert.equal(c.hasChurnMark(expired),false);
  assert.equal(c.hasChurnMark(find(c,'pocket_gauge')),true);
  play(c,'scrapline');
  const before = c.momentum;
  play(c,'pocket_gauge');
  assert.equal(c.combo.cards.at(-1).fromChurn,true);
  assert.equal(c.combo.cards.at(-1).duringChurn,false);
  assert.equal(c.momentum,before+3); // Basic, Cross, prepared draw
  play(c,'scrapfall');
  assert.equal(c.stats.exByRecipe.salvage_circuit,undefined);
});

test('Ratchet Burst fires its second hit only after an executed Churn draw in Pin’s segment', () => {
  for (const powered of [false, true]) {
    const c = fixture(['scrapline','salvage','ratchet_burst','piston_strike','scrapfall','grand_relay'], ['scrapline_b','index_slug']);
    c.selectHero('S');
    play(c, 'scrapline');
    if (powered) { churn(c, 'salvage'); play(c, 'index_slug'); }
    c.drainEvents();
    play(c, 'ratchet_burst');
    assert.equal(c.drainEvents().filter((e) => e.type === 'hit' && e.cue?.card === 'ratchet_burst').length, powered ? 2 : 1);
  }
});

test('Pressure Splice offers its next-hit and Flow payoff only after a Churn in the live chain', () => {
  for (const powered of [false, true]) {
    const c = fixture(['scrapline','salvage','pressure_splice','piston_strike','scrapfall','overture'], ['scrapline_b','rivet_jab']);
    c.selectHero('C');
    play(c, 'scrapline');
    if (powered) churn(c, 'salvage');
    play(c, 'pressure_splice');
    assert.equal(c.combo.pendingBonus, powered ? 6 : 0);
    assert.ok(c.combo.deadline <= c.flowCap());
    assert.equal(c.stats.flowGained, powered ? 1 : 0);
  }
});

test('Pocket Gauge and Pocket Seal expose the struck enemy before damage from Reserve', () => {
  const c = fixture(['scrapline',{ id:'pocket_gauge', graft:'pocket_seal' },'salvage','piston_strike','scrapfall','mend_circuit'], ['scrapline_b']);
  assert.ok(c.stash(find(c, 'pocket_gauge')).ok);
  play(c, 'scrapline');
  play(c, 'pocket_gauge');
  assert.equal(c.combo.cards.at(-1).dmg, 7);
  assert.ok(c.enemies[0].st.exposed > 2);
  assert.equal(c.stats.reservePlays, 1);
});

test('Safety Interlock waits for saved support and a later Arte, never its cancellation', () => {
  const c = fixture(['scrapline','signal_case','scrapfall','salvage','capstone','piston_strike'], ['scrapline_b','hotwire']);
  assert.ok(c.stash(find(c,'signal_case')).ok);
  play(c, 'scrapline');
  c.locks[find(c, 'piston_strike')] = { until: 50 };
  play(c, 'signal_case');
  assert.equal(c.hp, 114);
  assert.equal(c.isLocked(find(c, 'piston_strike')), false);
  assert.ok(Math.abs(c.stats.flowGained - 0.7) < 1e-9);
  assert.ok(c.commit(find(c, 'piston_strike')).ok);
  assert.ok(c.commit(find(c, 'scrapfall')).ok);
  assert.ok(c.cancelCmd(c.queue[0].id));
  settle(c);
  assert.equal(c.stats.exByRecipe.safety_interlock, undefined);
  play(c, 'scrapfall');
  assert.equal(c.stats.exByRecipe.safety_interlock, 1);
});

test('new enemies use ally guard, repair and acceleration as forecast', () => {
  const cards = ['scrapline','scrapfall','mend_circuit'];
  const bail = fixture(cards, [], { enemies: ['rail_bailiff','rush_hound'] });
  bail.enemyAct(bail.enemies[0]);
  assert.equal(bail.enemies[1].guard, 8);
  assert.equal(bail.enemies[0].intent.key, 'crossbar');
  const lantern = fixture(cards, [], { act:2, enemies: ['phase_lantern','signal_hound'] });
  lantern.enemies[1].hp -= 11;
  const hp = lantern.enemies[1].hp;
  lantern.enemyAct(lantern.enemies[0]);
  lantern.enemyAct(lantern.enemies[0]);
  assert.equal(lantern.enemies[1].hp, hp + 10);
  assert.equal(lantern.enemies[0].st.exposed, 4);
  const tow = fixture(cards, [], { act:3, enemies: ['vector_winch','predator_needle','interference_mite'] });
  tow.enemyAct(tow.enemies[0]);
  const fast = tow.enemies.slice(1).sort((a,b) => a.actTime-b.actTime)[0];
  assert.equal(fast.hasteMult, 1.25);
  assert.equal(fast.hasteUntil-tow.t,4);
  assert.equal(tow.enemies[0].st.exposed, 4);
  assert.equal(tow.enemies[0].intent.key, 'hook');
});

test('the Core counters Churn and Reserve without removing a full hand plan', () => {
  const hand = ['scrapline','salvage','pocket_gauge','latchshield','scrapline_b','piston_strike'];
  const draw = ['rivet_jab','mend_circuit'];
  const core = { act:3, enemies:['signalbreak_core'] };
  const churner = fixture(hand, draw, { ...core, profileArch:'churn' });
  const charges = churner.churn.charges;
  churner.coreCounter(churner.enemies[0], { target:'V' });
  assert.equal(churner.churn.charges,charges-1);
  assert.equal(churner.churnJamUntil-churner.t,3);

  const planner = fixture(hand, draw, { ...core, profileArch:'reserve' });
  const kept = find(planner,'pocket_gauge');
  assert.ok(planner.stash(kept).ok);
  assert.ok(planner.stash(find(planner,'latchshield')).ok);
  planner.coreCounter(planner.enemies[0], { target:'V' });
  assert.deepEqual(planner.reserve,[kept]);
  assert.ok(planner.verifyZones().ok);
});

test('Hunt forecasts its actual high damage and updates when the party uses Guard', () => {
  for (const [guard, raw] of [[0,20],[3,14],[7,10]]) {
    const c = fixture(['scrapline','piston_strike','mend_circuit'], [], { act:3, enemies:['predator_needle'] });
    const enemy = c.enemies[0];
    assert.equal(enemy.intent.dmg,c.edmg(enemy,20));
    c.guard = guard;
    const expected = c.edmg(enemy,raw);
    assert.equal(enemy.intent.dmg,expected);
    const hp = c.hp;
    c.enemyAct(enemy);
    assert.equal(hp-c.hp,expected-guard); // Targets Corvin, the hero with 0% Defense.
  }
});

test('Index Spring and Reclaim Circuit stack once per combo and do not replenish Churn', () => {
  const c = fixture(['scrapline','salvage','mend_circuit','piston_strike','scrapfall','bolt_volley'],
    ['scrapline_b','index_slug','rivet_jab','quickdraw'], { relics:['index_spring'], mutations:['reclaim_circuit'] });
  c.selectHero('C');
  play(c,'scrapline');
  const charges = c.churn.charges;
  churn(c,'salvage');
  play(c,'index_slug');
  assert.equal(c.guard,12);
  assert.equal(c.churn.charges,charges-1);
  assert.ok(c.combo.deadline <= c.flowCap());
  churn(c,'mend_circuit');
  play(c,'quickdraw');
  assert.equal(c.guard,12);
  assert.equal(c.churn.charges,charges-2);
});

test('opening offers teach two distinct tools and retain a pivot and the requested rarity', () => {
  const run = Run.create({ seed:701 });
  for (let s=0;s<80;s++) for (const [count, tag] of [[1,'reserve'],[2,'churn']]) {
    run.d.battleCount = count;
    const result = run.cardChoices(new RNG(s + 1), 3, { minRarity:'uncommon' });
    assert.equal(result.length,3);
    assert.ok(CARDS[result[1].id].tags.includes(tag));
    assert.ok(result.every(({id}) => CARDS[id].rarity !== 'common'));
  }
});

test('new encounters belong to ordinary act pools and preserve the opening depth', () => {
  const ids = ['rail_bailiff','phase_lantern','vector_winch'];
  for (const [i, id] of ids.entries()) {
    const pool = FORMATIONS[i+1].filter(([, enemies]) => enemies.includes(id));
    assert.equal(pool.length,2);
    assert.equal(ENEMIES[id].act,i+1);
    if (i === 0) assert.ok(pool.every(([, , depth]) => depth >= 3));
  }
});

test('expanded Journal preserves Complete Journal for an earlier profile', () => {
  const meta = defaultMeta();
  for (const id of RECIPE_IDS.filter((id) => !['switchyard','safety_interlock'].includes(id))) meta.combos[id] = { at:10,count:1 };
  meta.progress.earned.recipe_all = { at:42 };
  normalizeMeta(meta);
  assert.deepEqual(collections(meta).recipes, [15,17]);
  assert.deepEqual(meta.progress.earned.recipe_all, { at:42 });
  delete meta.progress.earned.recipe_all;
  awardAchievements(meta, 50);
  assert.equal(meta.progress.earned.recipe_all, undefined);
  meta.combos.switchyard = { at:11,count:1 };
  meta.combos.safety_interlock = { at:12,count:1 };
  awardAchievements(meta, 60);
  assert.equal(meta.progress.earned.recipe_all.at,60);
});
