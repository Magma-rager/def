// Phase 8 event and service audit (docs/COMBAT_SPEC.md §29): every choice of all 21 events is taken
// through the run API with its requirement met (and, where it has one, unmet), every card selection is
// completed, and the run is checked afterwards (deck, relics, Scrap, HP, save round trip). Services:
// shop, surgery, rest, treasure and every boss preparation, including Wildcard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { EVENTS } from '../src/data/events.js';
import { CARDS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { PREPARED_PLANS, VOLATILE_OUTCOMES } from '../src/data/acts.js';
import { ENEMIES } from '../src/data/enemies.js';
import { RU } from '../src/i18n/ru.js';

const fresh = (seed = 41) => { const r = Run.create({ seed, tutorial: false }); r.d.pending = null; return r; };
const snap = (r) => JSON.stringify({ deck: r.d.deck, relics: r.d.relics, scrap: r.d.scrap, hp: r.d.hp, maxHp: r.d.maxHp, flags: r.d.flags, mod: r.d.nextBattleMod });
function invariants(r, where) {
  assert.ok(r.d.hp >= 1 && r.d.hp <= r.d.maxHp, `${where}: HP ${r.d.hp}/${r.d.maxHp}`);
  assert.ok(r.d.maxHp >= 30, where);
  assert.ok(r.d.scrap >= 0, where);
  const uids = r.d.deck.map((x) => x.uid);
  assert.equal(new Set(uids).size, uids.length, `${where}: unique card uids`);
  for (const x of r.d.deck) assert.ok(CARDS[x.id], `${where}: ${x.id} exists`);
  assert.equal(new Set(r.d.relics).size, r.d.relics.length, `${where}: no duplicate relic`);
  for (const id of r.d.relics) assert.ok(RELICS[id], `${where}: relic ${id}`);
  const back = Run.load(JSON.parse(JSON.stringify(r.serialize())));
  assert.deepEqual(back.serialize(), JSON.parse(JSON.stringify(r.serialize())), `${where}: save round trip`);
}
const atEvent = (r, ev) => { r.d.act = ev.acts[0]; r.d.pending = { type: 'event', nodeId: 'evt-test', eventId: ev.id, result: null, select: null }; };

test('all 21 events: every choice applies a real outcome, completes its card selection, and keeps the run valid', () => {
  assert.equal(EVENTS.length, 21);
  let k = 0;
  for (const ev of EVENTS) for (const [i, ch] of ev.choices.entries()) {
    const r = fresh(500 + k++);
    r.d.scrap = 300; r.d.hp = 100;
    r.d.relics.push('flywheel'); // a tradeable relic
    atEvent(r, ev);
    const before = snap(r);
    const res = r.eventChoose(i);
    const where = `${ev.id}#${i} (${ch.label})`;
    assert.ok(res && !res.error, `${where}: ${res && JSON.stringify(res.error)}`);
    // the outcome text is a template of this choice (language-neutral, translated)
    if (res.text && res.text.k) {
      const key = res.text.k;
      if (key.startsWith('$')) assert.ok(RU.ui[key.slice(1)], `${where}: ${key} translated`);
      else { assert.ok(ch.results[key], `${where}: result ${key}`); assert.ok(RU.events[ev.id].choices[i].results[key], `${where}: RU result ${key}`); }
    }
    const p = r.d.pending;
    if (p.select) {
      const target = r.d.deck.find((x) => r.canApplySelect(p.select.action, x));
      assert.ok(target, `${where}: a card can take ${p.select.action}`);
      const n0 = r.d.deck.length, inst0 = JSON.stringify(target);
      assert.ok(r.applySelect(p.select.action, target.uid), where);
      const after = r.d.deck.find((x) => x.uid === target.uid);
      if (r.d.deck.length === n0 && after) assert.notEqual(JSON.stringify(after), inst0, `${where}: the chosen card changed`);
      else assert.notEqual(r.d.deck.length, n0, `${where}: the deck changed`);
      assert.equal(r.d.pending.select, null);
    }
    if (p.result && p.result.offer) {
      const n0 = r.d.deck.length;
      assert.ok(r.takeOfferCard(0));
      assert.equal(r.d.deck.length, n0 + 1);
    }
    const nothing = /^(Nothing happens\.|)$/.test(ch.hint || '') || /Walk away|Leave|Ignore/i.test(ch.label) && !/Gain|Lose|Heal|Upgrade/.test(ch.hint || '');
    if (!nothing) assert.notEqual(snap(r), before, `${where}: something mechanical changed (${ch.hint})`);
    invariants(r, where);
  }
});

test('requirements: an unaffordable or impossible choice is refused and changes nothing', () => {
  let refused = 0;
  for (const ev of EVENTS) for (const [i, ch] of ev.choices.entries()) {
    if (!ch.req) continue;
    const r = fresh(77);
    r.d.scrap = 0; r.d.hp = 5;
    r.d.relics = r.d.relics.filter((id) => RELICS[id].rarity === 'starter');
    atEvent(r, ev);
    const before = snap(r);
    const res = r.eventChoose(i);
    if (res && res.error) { refused++; assert.equal(snap(r), before, `${ev.id}#${i}`); assert.ok(typeof res.error === 'string' ? RU.ui[res.error] : RU.ui[res.error.k], `${ev.id}#${i}: reason translated`); }
  }
  assert.ok(refused >= 5, `${refused} refusals`);
  // a selection nobody can take is refused up front: an all-EX deck cannot be stamped EX
  const ex = EVENTS.find((e) => e.choices.some((c) => c.needs === 'ex'));
  const idx = ex.choices.findIndex((c) => c.needs === 'ex');
  const r = fresh(78);
  r.d.scrap = 200;
  for (const x of r.d.deck) if (CARDS[x.id].category !== 'support') x.variant = 'EX';
  atEvent(r, ex);
  assert.equal(r.eventChoiceReq(idx), 'No card in the deck can take this');
  assert.deepEqual(r.eventChoose(idx), { error: 'No card in the deck can take this' });
  assert.equal(r.d.scrap, 200);
});

test('a paid card selection costs nothing when cancelled, and is paid on completion', () => {
  for (const [id, label, field] of [['variant_press', 'Stamp EX', 'scrap'], ['rust_oracle', 'Ask for a reading', 'scrap'], ['cable_garden', 'Prune a card', 'hp'], ['rust_oracle', 'Pay in blood', 'hp']]) {
    const ev = EVENTS.find((e) => e.id === id);
    const i = ev.choices.findIndex((c) => c.label.startsWith(label));
    assert.ok(i >= 0, label);
    const r = fresh(90);
    r.d.scrap = 200; r.d.hp = 100;
    atEvent(r, ev);
    r.eventChoose(i);
    assert.ok(r.d.pending.select);
    const cost = r.d.pending.select.cost;
    assert.ok(cost && cost[field] > 0, `${label}: priced`);
    assert.ok(r.cancelSelect());
    assert.equal(r.d.scrap, 200, `${label}: no Scrap taken`);
    assert.equal(r.d.hp, 100, `${label}: no HP taken`);
    // the same choice again, completed this time
    const r2 = fresh(90);
    r2.d.scrap = 200; r2.d.hp = 100;
    atEvent(r2, ev);
    r2.eventChoose(i);
    const sel = r2.d.pending.select;
    const target = r2.d.deck.find((x) => r2.canApplySelect(sel.action, x));
    assert.ok(r2.applySelect(sel.action, target.uid));
    if (field === 'scrap') assert.equal(r2.d.scrap, 200 - cost.scrap);
    else assert.equal(r2.d.hp, 100 - cost.hp);
  }
});

test('a trade whose reward comes first cannot be cancelled; a traded relic never comes straight back', () => {
  for (const [id, label] of [['patch_notes', 'Accept the nerf'], ['unfinished_npc', 'Trade a card']]) {
    const ev = EVENTS.find((e) => e.id === id);
    const i = ev.choices.findIndex((c) => c.label.startsWith(label));
    const r = fresh(91);
    atEvent(r, ev);
    r.eventChoose(i);
    assert.ok(r.d.pending.select.required, label);
    assert.equal(r.cancelSelect(), false);
    assert.ok(r.d.pending.select, `${label}: still waiting for a card`);
  }
  const ev = EVENTS.find((e) => e.choices.some((c) => c.label.startsWith('Trade a relic')));
  const i = ev.choices.findIndex((c) => c.label.startsWith('Trade a relic'));
  for (let seed = 1; seed <= 40; seed++) {
    const r = fresh(seed);
    r.d.relics = [r.d.relics[0], 'flywheel'];
    atEvent(r, ev);
    const res = r.eventChoose(i);
    const lost = res.text.p.lost.relic;
    assert.ok(!r.d.relics.includes(lost), `seed ${seed}: ${lost} came back`);
    assert.equal(r.d.relics.length, 3);
  }
});

// ───────────────────────── services ─────────────────────────
const atShop = (r, cheap = false) => { r.d.pending = { type: 'shop', nodeId: 'shop-test', stock: r.makeShop(r.rng('shop-test'), cheap) }; return r.d.pending.stock; };

test('shop: cards, relics, heal, remove, upgrade, surgery — prices paid once, refusals free', () => {
  const r = fresh(12);
  r.d.scrap = 1000; r.d.hp = 60;
  const s = atShop(r);
  assert.equal(s.cards.length, 5);
  assert.equal(s.relics.length, 3);
  const n0 = r.d.deck.length, sc0 = r.d.scrap;
  assert.ok(r.shopBuy('card', 0).ok);
  assert.equal(r.d.deck.length, n0 + 1);
  assert.equal(r.d.scrap, sc0 - s.cards[0].price);
  assert.equal(r.shopBuy('card', 0).ok, false, 'sold out');
  assert.ok(r.shopBuy('relic', 0).ok);
  assert.ok(r.d.relics.includes(s.relics[0].id));
  assert.ok(r.shopBuy('heal').ok);
  assert.equal(r.d.hp, 60 + Math.round(r.d.maxHp * 0.3));
  assert.equal(r.shopBuy('heal').ok, false, 'one heal per shop');
  // remove: selection first, payment on confirmation; the next shop's removal costs 25 more
  const rc = r.d.removeCost;
  assert.deepEqual(r.shopBuy('remove'), { ok: true, needSelect: true });
  const victim = r.d.deck.find((x) => r.canRemove(x.uid));
  const sc1 = r.d.scrap;
  assert.ok(r.shopService('remove', victim.uid));
  assert.ok(!r.d.deck.some((x) => x.uid === victim.uid));
  assert.equal(r.d.scrap, sc1 - s.removePrice);
  assert.equal(r.d.removeCost, rc + 25);
  assert.equal(r.shopService('remove', r.d.deck[0].uid), false, 'one removal per shop');
  // upgrade: an upgraded card cannot be chosen, and nothing is charged for trying
  const up = r.d.deck.find((x) => !x.up);
  up.up = true;
  const sc2 = r.d.scrap;
  assert.equal(r.shopService('upgrade', up.uid), false);
  assert.equal(r.d.scrap, sc2);
  const other = r.d.deck.find((x) => !x.up);
  assert.ok(r.shopService('upgrade', other.uid));
  assert.ok(other.up);
  // surgery at the shop: a graft that fits
  const heal = r.d.deck.find((x) => x.id === 'mend_circuit');
  assert.equal(r.shopService('surgery', heal.uid, 'graft:keen'), false, 'Keen does not fit a heal');
  assert.ok(r.shopService('surgery', heal.uid, 'graft:plated'));
  assert.equal(heal.graft, 'plated');
  invariants(r, 'shop');
  // poor and at full HP
  const q = fresh(13);
  q.d.scrap = 0;
  atShop(q);
  assert.equal(q.shopBuy('card', 0).ok, false);
  assert.deepEqual(q.shopBuy('heal'), { ok: false, text: 'The party is at full HP' });
  q.d.hp = 50;
  assert.equal(q.shopBuy('heal').ok, false);
  assert.equal(q.d.scrap, 0);
  // a Scrap Cache shop is 20% cheaper
  const c1 = fresh(14), c2 = fresh(14);
  assert.ok(atShop(c2, true).healPrice < atShop(c1, false).healPrice);
});

test('surgery: first operation free, second 40 (+50 for EX), at most two, inapplicable ones free', () => {
  const r = fresh(15);
  r.d.scrap = 200;
  r.d.pending = { type: 'surgery', nodeId: 'srg', ops: 0, grafts: ['spark', 'keen', 'plated'], select: null };
  const heal = r.d.deck.find((x) => x.id === 'mend_circuit');
  assert.equal(r.surgeryApply(heal.uid, 'graft:keen').ok, false);
  assert.equal(r.d.pending.ops, 0);
  assert.equal(r.d.scrap, 200);
  const atk = r.d.deck.find((x) => x.id === 'scrapline');
  assert.ok(r.surgeryApply(atk.uid, 'graft:keen').ok);
  assert.equal(r.d.scrap, 200, 'first one free');
  assert.equal(r.surgeryCost('ex'), 90);
  const atk2 = r.d.deck.find((x) => x.id === 'rivet_jab');
  assert.ok(r.surgeryApply(atk2.uid, 'ex').ok);
  assert.equal(r.d.scrap, 110);
  assert.equal(atk2.variant, 'EX');
  assert.deepEqual(r.surgeryApply(r.d.deck.find((x) => x.id === 'piston_strike').uid, 'recut'), { ok: false, text: 'The surgeon is out of thread' });
  // rank changes stay inside the card's category
  const r2 = fresh(16);
  r2.d.scrap = 200;
  r2.d.pending = { type: 'surgery', nodeId: 'srg', ops: 0, grafts: [], select: null };
  const strong = r2.d.deck.find((x) => x.id === 'piston_strike');
  assert.equal(r2.surgeryApply(strong.uid, 'rankup').ok, false, 'a Strong attack is already rank 3');
  assert.ok(r2.surgeryApply(strong.uid, 'rankdown').ok);
  assert.equal(r2.effRank(strong), 2);
  invariants(r2, 'surgery');
});

test('rest: Recover, Tune-up, Fortify (consumed by the next Elite or Boss), Overdrive — one choice per site', () => {
  const r = fresh(17);
  r.d.hp = 50;
  r.d.pending = { type: 'rest', nodeId: 'rst', done: false, quiet: false };
  assert.ok(r.restChoose('recover'));
  assert.equal(r.d.hp, 50 + Math.round(r.d.maxHp * 0.3));
  assert.equal(r.restChoose('fortify'), null, 'one choice');
  const q = fresh(17);
  q.d.hp = 50;
  q.d.pending = { type: 'rest', nodeId: 'rst', done: false, quiet: true };
  q.restChoose('recover');
  assert.equal(q.d.hp, 50 + Math.round(q.d.maxHp * 0.45), 'Quiet Channel: 45%');
  // nothing to gain: refused, with the reason
  const full = fresh(18);
  full.d.pending = { type: 'rest', nodeId: 'rst', done: false, quiet: false };
  assert.deepEqual(full.restChoose('recover'), { error: 'The party is at full HP' });
  for (const x of full.d.deck) x.up = true;
  assert.equal(full.restAvailable('overdrive'), 'Every card is already upgraded');
  assert.equal(full.restAvailable('tune'), 'Every card is already upgraded');
  assert.equal(full.d.pending.done, false);
  // Overdrive: two upgrades for 15% of current HP
  const od = fresh(19);
  od.d.hp = 100;
  od.d.pending = { type: 'rest', nodeId: 'rst', done: false, quiet: false };
  const ups = od.d.deck.filter((x) => x.up).length;
  od.restChoose('overdrive');
  assert.equal(od.d.deck.filter((x) => x.up).length, ups + 2);
  assert.equal(od.d.hp, 85);
  // Fortify: the next Elite (not a plain battle) starts with 12 Guard and 2 Momentum, then it is spent
  const f = fresh(20);
  f.d.pending = { type: 'rest', nodeId: 'rst', done: false, quiet: false };
  f.restChoose('fortify');
  const battleNode = f.d.map.nodes.find((n) => n.type === 'battle' && n.act === undefined || n.type === 'battle');
  f.d.pending = { type: 'battle', nodeId: battleNode.id, kind: 'battle' };
  assert.deepEqual(f.battleSetup().prep, {});
  const eliteNode = f.d.map.nodes.find((n) => n.type === 'elite') || battleNode;
  f.d.pending = { type: 'battle', nodeId: eliteNode.id, kind: 'elite' };
  const setup = f.battleSetup();
  assert.deepEqual(setup.prep, { startGuard: 12, startMomentum: 2 });
  const c = new Combat(setup);
  assert.ok(c.guard >= 12);
  f.finishBattle({ victory: true, hp: f.d.hp, maxHp: f.d.maxHp, stats: c.stats, scrapBonus: 0, enemies: setup.enemies, exFound: [] });
  assert.equal(f.d.prepToken, null, 'spent');
});

test('treasure: take one relic and the Scrap, or leave with the Scrap; never twice', () => {
  const r = fresh(21);
  const s0 = r.d.scrap;
  r.d.pending = { type: 'treasure', nodeId: 'tr', relics: r.randomRelics(r.rng('tr'), 2), taken: false, scrap: 20 };
  const pick = r.d.pending.relics[1];
  assert.ok(r.treasureTake(1));
  assert.ok(r.d.relics.includes(pick));
  assert.equal(r.d.scrap, s0 + 20);
  assert.equal(r.treasureTake(0), false);
  r.leaveNode();
  assert.equal(r.d.scrap, s0 + 20, 'no second payout on leaving');
  const l = fresh(22);
  const l0 = l.d.scrap, rel = l.d.relics.length;
  l.d.pending = { type: 'treasure', nodeId: 'tr', relics: l.randomRelics(l.rng('tr'), 2), taken: false, scrap: 20 };
  l.leaveNode();
  assert.equal(l.d.scrap, l0 + 20);
  assert.equal(l.d.relics.length, rel);
});

test('boss preparation: three plans and four volatile outcomes each reach the boss fight as described', () => {
  const prepFor = (kind, id) => {
    const r = fresh(23);
    r.d.hp = 100;
    const node = r.d.map.nodes.find((n) => n.type === 'boss');
    r.d.pending = { type: 'bossprep', nodeId: node.id, bossId: r.d.bosses[1], ...r.bossAnalysis() };
    if (kind === 'volatile') r.d.pending.volatileId = id;
    const deck0 = r.d.deck.length;
    assert.ok(r.chooseBossPrep(kind, kind === 'prepared' ? id : undefined));
    const setup = r.battleSetup();
    return { r, setup, c: new Combat(setup), deck0 };
  };
  let x = prepFor('prepared', 'brace');
  assert.ok(x.c.guard >= 15);
  assert.equal(x.c.churn.charges, x.c.churnMax() + 1, 'one Churn charge above the usual full set');
  assert.equal(x.setup.prep.churnBonus, 1);
  x = prepFor('prepared', 'scout');
  if (x.c.adapt) assert.equal(x.c.adapt.need, Math.max(1, Math.ceil(x.setup.adaptation.need / 2)));
  assert.ok(x.c.enemies[0].atb < 0, 'the boss acts later');
  x = prepFor('prepared', 'tuned');
  assert.equal(x.r.d.hp, Math.min(x.r.d.maxHp, 100 + Math.round(x.r.d.maxHp * 0.15)));
  assert.ok(x.c.momentum >= 4);
  x = prepFor('volatile', 'overcharged');
  const plain = prepFor('prepared', 'brace');
  assert.equal(x.c.enemies[0].maxHp, Math.round(plain.c.enemies[0].maxHp * 1.2) || x.c.enemies[0].maxHp);
  assert.ok(x.c.enemies[0].maxHp > plain.c.enemies[0].maxHp);
  x = prepFor('volatile', 'redline');
  assert.equal(x.r.d.hp, 100 - Math.round(x.r.d.maxHp * 0.1));
  assert.ok(x.c.momentum >= 8);
  // Wildcard: a random rare card, permanently; the boss starts with 30 Guard
  x = prepFor('volatile', 'wildcard');
  assert.equal(x.r.d.deck.length, x.deck0 + 1);
  const rare = x.r.d.deck.at(-1);
  assert.equal(CARDS[rare.id].rarity, 'rare');
  assert.equal(x.r.d.pending.choice.rareCard, rare.id);
  assert.ok(x.setup.deck.some((c) => c.uid === rare.uid), 'it is in the boss fight deck');
  assert.ok(x.c.enemies[0].guard >= 30);
  x.r.finishBattle({ victory: true, hp: x.r.d.hp, maxHp: x.r.d.maxHp, stats: x.c.stats, scrapBonus: 0, enemies: x.setup.enemies, exFound: [] });
  assert.ok(x.r.d.deck.some((c) => c.uid === rare.uid), 'and stays after it');
  // Signal Scramble: no adaptation, a faster boss
  x = prepFor('volatile', 'scramble');
  assert.equal(x.setup.adaptation, null);
  assert.equal(x.c.adapt, null);
  assert.equal(x.c.enemies[0].flags.prepHaste, 1.15);
  invariants(x.r, 'boss prep');
  assert.equal(PREPARED_PLANS.length, 3);
  assert.equal(VOLATILE_OUTCOMES.length, 4);
  assert.ok(ENEMIES[x.r.d.bosses[1]].tier === 'boss');
});
