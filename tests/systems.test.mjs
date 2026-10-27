// Direct assertions for systems previously covered only indirectly (soak tests, simulations, screenshots).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { Run, VOLATILE_OUTCOMES } from '../src/engine/run.js';
import { STARTER_DECK } from '../src/data/cards.js';
import { unlocks, defaultMeta, recordRun } from '../src/engine/save.js';
import { VERSION } from '../src/version.js';
import { EVENT_MAP } from '../src/data/events.js';
import fs from 'node:fs';

const PARTY = [{ id: 'V', hp: 300, maxHp: 300 }, { id: 'C', hp: 300, maxHp: 300 }, { id: 'S', hp: 300, maxHp: 300 }];
function mk(ids = STARTER_DECK, enemies = ['foundry_warden'], extra = {}) {
  const c = new Combat({ deck: ids.map((id, i) => ({ uid: `t${i}`, id })), party: PARTY.map((p) => ({ ...p })), enemies, seed: 9, act: 1, ...extra });
  for (const e of c.enemies) e.atb = -1000;
  return c;
}
const legal = (c, role) => [...c.hand, ...c.reserve].find((u) => u && c.check(u).ok && (!role || c.roleOf(u) === role));

test('Momentum: 3 buys +0.6s Flow (within cap) and 3 buys +8 Guard', () => {
  const c = mk();
  c.momentum = 6;
  c.playCard(legal(c, 'open'));
  const d0 = c.combo.deadline;
  assert.ok(c.spendMomentumFlow().ok);
  assert.ok(Math.abs(c.combo.deadline - d0 - 0.6) < 1e-9);
  const g0 = c.guard;
  assert.ok(c.spendMomentumGuard().ok);
  assert.equal(c.guard - g0, 8);
  assert.equal(c.momentum <= 1, true);
  assert.equal(c.spendMomentumGuard().ok, false, 'not enough Momentum');
});

test('Relay: switching heroes mid-combo grants Momentum and records the relay', () => {
  const c = mk(['scrapline', 'rethread', 'scrapfall']); // Pin opener -> Corvin converter
  c.playCard(legal(c, 'open'));
  const m0 = c.momentum;
  c.playCard(legal(c, 'conv'));
  assert.equal(c.combo.relays, 1);
  assert.ok(c.momentum >= m0 + 1);
  assert.deepEqual(c.combo.owners.sort(), ['C', 'S']);
});

test('Interference: Churn snare, Reserve latch, Flow drain and Glitch cards all resolve and expire', () => {
  const c = mk();
  const e = c.enemies[0];
  const ch = c.churn.charges;
  c.snareChurn(e, 4, 1);
  assert.equal(c.churn.charges, ch - 1);
  assert.equal(c.churnCard(c.hand[0]).ok, false, 'Churn jammed');
  for (let i = 0; i < 90; i++) c.update(0.05);
  assert.ok(c.churnCard(c.hand.find(Boolean)).ok, 'snare expired');
  // latch: steals a stored card, or seals an empty Reserve
  const u = c.hand.find(Boolean);
  c.stash(u);
  c.latchReserve(e);
  assert.ok(c.discard.includes(u));
  c.latchReserve(e);
  assert.equal(c.stash(c.hand.find(Boolean)).ok, false, 'sealed');
  for (let i = 0; i < 110; i++) c.update(0.05);
  assert.ok(c.stash(c.hand.find(Boolean)).ok, 'seal expired');
  // drain
  c.reserve.length && c.playCard(c.reserve[0]);
  if (c.phase !== 'ACTIVE') c.playCard(legal(c, 'open'));
  const d0 = c.combo.deadline;
  c.drainFlow(e, 1);
  assert.ok(c.combo.deadline <= d0 - 1 + 1e-9);
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('Glitch cards: unplayable, Churned for free, removed from the game', () => {
  const c = mk(['scrapline', 'hotwire', 'salvage', 'rethread', 'scrapfall', 'step_up'], ['the_corruptor']);
  c.addGlitch(c.enemies[0], 3);
  const charges = c.churn.charges;
  for (let i = 0; i < 40; i++) c.update(0.05);
  for (let k = 0; k < 6; k++) { c.hand.forEach((u, i) => { if (u && c.roleOf(u) !== 'junk') c.tuck(i); }); c.refill(); }
  const g = c.hand.find((u) => u && c.roleOf(u) === 'junk');
  assert.ok(g, 'a Glitch reached the hand');
  assert.equal(c.check(g).ok, false);
  assert.ok(c.churnCard(g).ok);
  assert.equal(c.churn.charges, charges, 'free');
  assert.ok(c.exhaust.includes(g));
  assert.deepEqual(c.verifyZones(), { ok: true });
});

test('Guard caps: party Guard stops at 80, enemy Guard at max(30, 50% HP)', () => {
  const c = mk();
  c.addGuard(500);
  assert.equal(c.guard, RULES.GUARD_CAP);
  const e = c.enemies[0];
  c.enemyGuard(e, 99999);
  assert.equal(e.guard, Math.max(30, Math.round(e.maxHp * 0.5)));
});

test('Boss preparation: Volatile applies its fixed outcome and logs the decision', () => {
  const run = Run.create({ seed: 31 });
  run.d.pending = null;
  const boss = run.d.map.nodes.find((n) => n.type === 'boss');
  run.d.position = run.d.map.nodes.find((n) => n.edges.includes(boss.id)).id;
  run.enterNode(boss.id);
  const vid = run.d.pending.volatileId;
  const v = VOLATILE_OUTCOMES.find((x) => x.id === vid);
  run.chooseBossPrep('volatile');
  const setup = run.battleSetup();
  for (const [k, val] of Object.entries(v.prep)) assert.deepEqual(setup.prep[k], val, k);
  assert.equal(run.d.bossDecisions[0].prep, 'volatile');
});

test('Rest, surgery and cache nodes change persistent run state', () => {
  const run = Run.create({ seed: 41 });
  run.d.party.forEach((m) => (m.hp = 10));
  run.d.pending = { type: 'rest', nodeId: 'x', done: false };
  run.restChoose('recover');
  assert.ok(run.d.party.every((m) => m.hp > 10));
  run.d.pending = { type: 'rest', nodeId: 'y', done: false };
  run.restChoose('fortify');
  assert.deepEqual(run.d.prepToken, { startGuard: 12, startMomentum: 2 });
  run.d.pending = { type: 'surgery', nodeId: 'z', ops: 0, grafts: ['spark'] };
  const card = run.d.deck[0];
  assert.ok(run.surgeryApply(card.uid, 'graft:spark').ok);
  assert.equal(run.card(card.uid).graft, 'spark');
  const scrap = run.d.scrap;
  assert.ok(run.surgeryApply(card.uid, 'rankup').ok, 'second op');
  assert.equal(run.d.scrap, scrap - 40);
  assert.equal(run.surgeryApply(card.uid, 'recut').ok, false, 'max two operations');
  run.d.pending = { type: 'treasure', nodeId: 't', relics: ['ladder_rungs', 'twin_dials'], taken: false, scrap: 20 };
  assert.ok(run.treasureTake(1));
  assert.ok(run.d.relics.includes('twin_dials'));
});

test('Museum: an Act I boss kill unlocks a starter relic for later runs', () => {
  const meta = defaultMeta();
  assert.equal(unlocks(meta).boss1, false);
  const run = Run.create({ seed: 51 });
  run.d.bossesDefeated.push('scrap_tyrant');
  recordRun(meta, run.summary('defeat'), { enemiesSeen: [], relicsSeen: [], cardsSeen: [] });
  assert.equal(unlocks(meta).boss1, true);
  const next = Run.create({ seed: 52, starterRelic: 'stopwatch_gear' });
  assert.ok(next.d.relics.includes('stopwatch_gear'));
});

test('one version number everywhere: package.json, iOS project, in-game text', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version, VERSION);
  assert.match(fs.readFileSync(new URL('../ios/SignalBreak.swiftpm/Package.swift', import.meta.url), 'utf8'), new RegExp(`displayVersion: "${VERSION.replace(/\./g, '\\.')}"`));
  assert.equal(EVENT_MAP.patch_notes.title, `Patch Notes v${VERSION}`);
});
