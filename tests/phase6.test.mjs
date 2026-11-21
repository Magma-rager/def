// Phase 6 (docs/COMBAT_SPEC.md §27): progressive lessons, the incoming hero's read hold, Act I enemy
// changes (Hound Mother) and the telegraphs the interface reads from the engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { ENEMIES, FORMATIONS, ELITES, BOSSES } from '../src/data/enemies.js';
import { LESSONS, LESSON_KEYS, INTRO_KEYS, LESSON_PACE, pickLesson, migrateLessons } from '../src/ui/lessons.js';
import { STARTER_DECK } from '../src/data/cards.js';
import { Save } from '../src/engine/save.js';
import { RNG } from '../src/core/rng.js';

const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const deck = (specs) => specs.map((s, i) => (typeof s === 'string' ? { uid: `c${i}`, id: s, up: false } : { uid: `c${i}`, up: false, ...s }));
function fixed(handSpecs, drawSpecs = [], extra = {}) {
  const specs = [...handSpecs, ...drawSpecs];
  const c = new Combat({ deck: deck(specs), party: PARTY, hp: 130, maxHp: 130, enemies: extra.enemies || ['foundry_warden'], seed: 5, relics: [], mutations: [], act: 1, ...extra.opts });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => (i < handSpecs.length ? `c${i}` : null));
  c.draw = drawSpecs.map((_, i) => `c${handSpecs.length + i}`);
  c.discard = [];
  c.exhaust = [];
  if (!extra.live) for (const e of c.enemies) { e.atb = -100; e.hp = e.maxHp = extra.enemyHp || 2000; }
  c.momentum = extra.momentum !== undefined ? extra.momentum : 0;
  c.drainEvents();
  return c;
}
const advance = (c, sec, dt = 1 / 60) => { for (let x = 0; x < sec - 1e-9; x += dt) c.update(Math.min(dt, sec - x)); };
const settle = (c, max = 20) => { for (let i = 0; i < max * 60 && (c.executing || c.queue.length); i++) c.update(1 / 60); };
const byId = (c, id) => [...c.hand, ...c.reserve].find((u) => u && c.def(u).id === id);
const CHAIN_HAND = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'piston_strike', variant: 'A' }, 'scrapfall', 'thermal_lance', 'bolt_volley'];
const CHAIN_DRAW = [{ id: 'scrapline', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'scrapline', variant: 'B' }, { id: 'rivet_jab', variant: 'A' }, 'mend_circuit', 'salvage'];
const ctx = (seen = {}, flags = {}, kind = 'normal') => ({ seen, flags, kind });
const snapshot = (c) => JSON.stringify({ t: c.t, m: c.momentum, r: c.reserved, hand: c.hand, res: c.reserve, q: c.queue.map((q) => q.id), ex: c.executing && c.executing.cmd.id, hp: c.hp, e: c.enemies.map((e) => [e.hp, e.atb, e.guard]), d: c.combo && c.combo.deadline, g: c.combo && c.combo.graceUntil });

// ── lessons ──
test('lessons follow their dependencies: first attack, then rising ranks, then the queue', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW);
  c.selectHero('V');
  let r = pickLesson(c, ctx());
  assert.equal(r.lesson.key, 'attack', 'a new player first learns the basic attack');
  assert.ok(r.anchor.slot !== undefined && c.categoryOf(c.hand[r.anchor.slot]) === 'basic', 'it points at a basic attack');
  c.commit(byId(c, 'scrapline'));
  r = pickLesson(c, ctx({ attack: true }));
  assert.equal(r.lesson.key, 'ranks', 'the queue lesson waits until ranks were explained, although a card is executing');
  r = pickLesson(c, ctx({ attack: true, ranks: true }));
  assert.equal(r.lesson.key, 'queue', 'while an attack plays out with another legal card in hand');
  assert.equal(pickLesson(c, ctx(Object.fromEntries(LESSON_KEYS.map((k) => [k, true])))), null, 'nothing once every lesson is seen');
});

test('a lesson only reads the engine: picking one never changes combat state', () => {
  const rng = new RNG(31);
  for (let n = 0; n < 6; n++) {
    const c = new Combat({ deck: STARTER_DECK.map((s, i) => ({ uid: `s${i}`, id: s.id || s, up: false })), party: PARTY, hp: 90, maxHp: 130, enemies: ['hound_mother'], seed: 40 + n, relics: [], mutations: [], act: 1 });
    for (let step = 0; step < 900 && c.phase !== 'END'; step++) {
      c.update(1 / 30);
      if (step % 7 === 0) {
        const u = c.hand.find((x) => x && c.check(x).ok);
        if (u && rng.chance(0.7)) c.commit(u);
        else for (const id of ['V', 'C', 'S']) if (c.relayCheck(id).ok) { c.selectHero(id); break; }
      }
      if (step % 5 === 0) {
        const before = snapshot(c);
        for (let k = 0; k < 4; k++) pickLesson(c, ctx(rng.chance(0.5) ? {} : { attack: true, ranks: true, arte: true, queue: true, enemies: true, support: true, relay: true, finish: true }, { busyTap: true }, 'elite'));
        assert.equal(snapshot(c), before, 'pickLesson changed the battle');
        c.drainEvents();
      }
    }
  }
});

test('contextual lessons trigger whenever their mechanic appears, in any order', () => {
  // a Lock before the player has learned anything else
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { live: true, enemies: ['wire_jammer'] });
  c.lockCards(c.enemies[0], 1);
  const all = Object.fromEntries(INTRO_KEYS.map((k) => [k, true]));
  assert.equal(pickLesson(c, ctx(all)).lesson.key, 'lock');
  // the Relay lesson needs a hero who can take over with an arte, and time to spare
  const d = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 4 });
  d.selectHero('V');
  d.commit(byId(d, 'scrapline'));
  settle(d);
  const seen = { attack: true, ranks: true, arte: true, queue: true, finish: true, cancel: true, enemies: true, stumble: true, recovery: true, support: true, churn: true, reserve: true };
  const r = pickLesson(d, ctx(seen));
  assert.equal(r && r.lesson.key, 'relay');
  assert.ok(['C', 'S'].includes(r.anchor.hero), 'pointing at a hero who can take the Relay');
  // with little Flow left the Relay lesson is not offered (no unrealistic demonstration)
  d.combo.deadline = d.t + 1.0;
  d.combo.graceUntil = 0;
  assert.notEqual((pickLesson(d, ctx(seen)) || { lesson: {} }).lesson.key, 'relay');
});

test('a lesson whose moment never comes blocks nothing: the battle is won without any lesson shown', () => {
  const c = fixed(['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'rivet_jab', 'piston_strike'], ['scrapline', 'rivet_jab', 'piston_strike'], { enemyHp: 30 });
  c.selectHero('V');
  for (let i = 0; i < 4000 && c.phase !== 'END'; i++) {
    c.update(1 / 60);
    const u = c.hand.find((x) => x && c.check(x).ok);
    if (u && !c.queue.length) c.commit(u);
    if (c.combo && !c.executing && !c.queue.length && c.canCashOut()) c.finishOrCashOut();
  }
  assert.equal(c.phase, 'END');
  assert.ok(c.result.victory, 'no arte was ever drawn, the arte and Relay lessons never came, the fight still ended');
});

test('returning players keep the earlier tutorial as learned; replaying hints shows every lesson again', () => {
  const old = { tutorialDone: true, tut: { start: true, opened: true, lock: true } };
  assert.equal(migrateLessons(old), true);
  for (const k of INTRO_KEYS) assert.equal(old.tut[k], true, `${k} marked as learned`);
  assert.equal(old.tut.drain, undefined, 'newer contextual lessons are still shown once');
  assert.equal(migrateLessons(old), false, 'migration runs once');
  // Settings → Replay tutorial hints clears the record; migration does not mark it again
  old.tut = {};
  assert.equal(migrateLessons(old), false);
  const c = fixed(CHAIN_HAND, CHAIN_DRAW);
  assert.equal(pickLesson(c, ctx(old.tut)).lesson.key, 'attack');
  // a brand-new player is not marked
  const fresh = { tutorialDone: false, tut: {} };
  assert.equal(migrateLessons(fresh), false);
  assert.equal(Object.keys(fresh.tut).length, 0);
});

test('lesson progress survives saving and loading', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    const meta = Save.loadMeta();
    meta.tut = { attack: true, ranks: true };
    meta.lessonsMigrated = true;
    Save.saveMeta(meta);
    const back = Save.loadMeta();
    assert.deepEqual(back.tut, { attack: true, ranks: true });
    assert.equal(back.lessonsMigrated, true);
  } finally { delete global.localStorage; }
});

test('lesson texts are short and every lesson has a trigger', () => {
  const keys = new Set();
  for (const L of LESSONS) {
    assert.ok(!keys.has(L.key), `duplicate ${L.key}`);
    keys.add(L.key);
    assert.equal(typeof L.when, 'function');
    const words = L.body.replace(/<[^>]+>/g, '').split(/\s+/).length;
    assert.ok(words <= 50, `${L.key}: ${words} words (one idea, a few lines)`);
    for (const n of L.need || []) assert.ok(LESSON_KEYS.includes(n), `${L.key} needs unknown ${n}`);
  }
  assert.ok(LESSON_PACE.perBattle.normal >= 1 && LESSON_PACE.gap > 0);
});

// ── Relay accessibility: the incoming hero's read hold ──
test("the incoming hero's first card opens one read hold of SEGMENT_READ_GRACE; later cards do not", () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 4 });
  c.selectHero('V');
  c.commit(byId(c, 'scrapline'));
  settle(c);
  advance(c, 1.3);
  assert.ok(c.selectHero('C').ok, 'Relay to Corvin');
  settle(c);
  advance(c, RULES.RELAY_HOLD + 0.1);
  c.drainEvents();
  assert.equal(c.flowHeld(), false, 'the Relay hold is over');
  c.commit(byId(c, 'rivet_jab'));
  settle(c);
  const holds = c.drainEvents().filter((e) => e.type === 'flowHold');
  assert.equal(holds.length, 1, 'one hold after the incoming basic attack');
  assert.equal(holds[0].segment, true);
  assert.ok(Math.abs(c.combo.graceUntil - c.t - RULES.SEGMENT_READ_GRACE) < 0.05);
  const left = c.flowLeft();
  advance(c, RULES.SEGMENT_READ_GRACE - 0.1);
  assert.ok(Math.abs(c.flowLeft() - left) < 0.02, 'Flow stands still during the hold');
  advance(c, 0.2);
  c.commit(byId(c, 'thermal_lance'));
  settle(c);
  assert.equal(c.drainEvents().filter((e) => e.type === 'flowHold').length, 0, "the hero's second card opens no hold");
});

test('holds never extend a chain without limit: the 14s counted cap still ends it', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 10 });
  c.selectHero('V');
  c.commit(byId(c, 'scrapline'));
  settle(c);
  // play and relay at once, then idle: holds pass, Flow and the cap run out
  const t0 = c.combo.start;
  for (let i = 0; i < 60 * 60 && c.combo; i++) {
    c.update(1 / 60);
    if (!c.executing && !c.queue.length) {
      const u = c.hand.find((x) => x && c.check(x).ok && c.categoryOf(x) !== 'support');
      if (u) c.commit(u);
      else for (const id of ['V', 'C', 'S']) if (c.relayCheck(id).ok) { c.selectHero(id); break; }
    }
  }
  assert.equal(c.combo, null, 'the chain ended');
  const g = c.history[c.history.length - 1];
  assert.ok(g.duration <= RULES.FLOW_ABS_MAX + 2 * (RULES.RELAY_HOLD + RULES.SEGMENT_READ_GRACE) + RULES.FLOW_READ_GRACE + 12 * RULES.ACTION_TIME + 1, `chain lasted ${g.duration.toFixed(1)}s`);
  void t0;
});

test('after an arte the player can FINISH instead of relaying', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { momentum: 4 });
  c.selectHero('V');
  c.commit(byId(c, 'scrapline'));
  settle(c);
  c.commit(byId(c, 'scrapfall'));
  settle(c);
  assert.ok(c.relayCheck('C').ok && c.canFinish(), 'both a Relay and FINISH are open');
  c.finishOrCashOut();
  settle(c);
  assert.equal(c.combo, null);
  assert.equal(c.history[c.history.length - 1].type, 'perfect');
});

// ── Act I enemies ──
test('Act I formations are valid and teach one interference type at a time at depth 0', () => {
  const interference = new Set(['lock', 'scramble', 'jam', 'snare', 'latch', 'drain', 'glitch']);
  for (const [w, list, depth] of FORMATIONS[1]) {
    assert.ok(w > 0 && depth >= 0);
    for (const id of list) assert.ok(ENEMIES[id] && ENEMIES[id].act === 1, `${id} is an Act I enemy`);
    if (depth === 0) {
      const kinds = new Set(list.flatMap((id) => Object.values(ENEMIES[id].intents).map((it) => it.kind)).filter((k) => interference.has(k)));
      assert.ok(kinds.size <= 1, `depth 0 formation ${list} has ${[...kinds]}`);
    }
  }
  for (const id of [...ELITES[1], ...BOSSES[1]]) assert.ok(ENEMIES[id]);
});

test('Hound Mother summons at most three litters of smaller whelps, however long the fight', () => {
  const c = new Combat({ deck: deck(['scrapline', 'rivet_jab', 'piston_strike', 'scrapline', 'rivet_jab', 'piston_strike', 'scrapline']), party: PARTY, hp: 1e6, maxHp: 1e6, enemies: ['hound_mother'], seed: 9, relics: [], mutations: [], act: 1, hpMult: 1.88, dmgMult: 1.2 });
  const hound = c.enemies.find((e) => e.id === 'rush_hound');
  let summons = 0, peak = 0;
  for (let i = 0; i < 60 * 400 && c.phase !== 'END'; i++) {
    c.update(1 / 60);
    for (const ev of c.drainEvents()) if (ev.type === 'summon') {
      summons++;
      const w = c.enemies.find((e) => e.uid === ev.uid);
      assert.equal(w.maxHp, Math.round(hound.maxHp * ENEMIES.hound_mother.whelpHp), 'a whelp is a smaller Rush Hound');
      // kill each whelp at once, so she would whelp again if she could
      c.dealDamage(w, 9999, { pierce: true });
    }
    peak = Math.max(peak, c.aliveEnemies().length);
  }
  assert.equal(summons, ENEMIES.hound_mother.litters, 'exactly three litters in 400s');
  assert.ok(peak <= 3, 'never more than the Mother and two hounds');
  assert.ok(c.enemies.find((e) => e.id === 'hound_mother').actCount > 30, 'she kept acting: Rally and Maul once the litters are gone');
});

test('both Act I bosses keep their own mechanics', () => {
  const T = ENEMIES.scrap_tyrant, R = ENEMIES.clockwork_regent;
  assert.deepEqual(Object.keys(T.intents).sort(), ['barrier', 'compactor', 'grind', 'rubble']);
  assert.ok(T.phases[0].pierceVuln, 'Tyrant: junk armor, Pierce hits double');
  assert.deepEqual(Object.keys(R.intents).sort(), ['decree', 'decree3', 'hourhand', 'tempo', 'toll']);
  assert.equal(R.phases[0].actTime, 4.6, 'Regent: overwound second phase acts faster');
  assert.equal(R.intents.tempo.flow, 1.2, 'Tempo Theft names the Flow it steals');
});

// ── telegraphs ──
test('the Flow bar warning matches the Flow Tempo Theft takes', () => {
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { live: true, enemies: ['clockwork_regent'] });
  const boss = c.enemies[0];
  boss.hp = boss.maxHp = 5000;
  c.selectHero('V');
  c.commit(byId(c, 'scrapline'));
  settle(c);
  c.combo.deadline = c.t + 4;
  c.combo.graceUntil = 0;
  boss.intent = { key: 'tempo', name: 'Tempo Theft', kind: 'drain', dmg: 0, target: null };
  boss.atb = 0.4;
  assert.equal(c.imminentDrain(), 0, 'no warning before the wind-up');
  boss.atb = 0.6;
  assert.ok(Math.abs(c.imminentDrain() - 1.2) < 1e-9, 'warns of 1.2s');
  const before = c.flowLeft();
  c.lastEnemyActT = -99;
  boss.atb = 1;
  c.update(1 / 60);
  assert.ok(Math.abs(before - c.flowLeft() - 1.2) < 0.05, `the theft took ${(before - c.flowLeft()).toFixed(2)}s`);
  // never more than would leave 0.5s
  c.combo.deadline = c.t + 1.0;
  boss.intent = { key: 'tempo', name: 'Tempo Theft', kind: 'drain', dmg: 0, target: null };
  boss.atb = 0.7;
  assert.ok(Math.abs(c.imminentDrain() - 0.5) < 0.02);
});

test('the enemy panel numbers are what the hits take: single hits after Defense, area hits per hero and in all', () => {
  for (const [hero, key] of [['V', 'hammer'], ['C', 'hammer'], ['S', 'hammer']]) {
    const c = fixed(CHAIN_HAND, CHAIN_DRAW, { live: true, enemies: ['foundry_warden'] });
    const e = c.enemies[0];
    c.chooseIntent(e);
    e.intent = { key, name: 'Drop Hammer', kind: 'atk', dmg: c.edmg(e, 15), target: hero };
    const shown = c.mitigate(e, e.intent.dmg, c.hitTarget(hero), {});
    const hp = c.hp;
    ENEMIES.foundry_warden.intents[key].exec(e, c, e.intent);
    assert.equal(hp - c.hp, shown, `hit on ${hero}`);
  }
  const c = fixed(CHAIN_HAND, CHAIN_DRAW, { live: true, enemies: ['foundry_warden'] });
  const e = c.enemies[0];
  e.intent = { key: 'quake', name: 'Floor Quake', kind: 'aoe', dmg: c.edmg(e, 6), target: null };
  const parts = c.party.map((p) => c.mitigate(e, e.intent.dmg, p, {}));
  const hp = c.hp;
  ENEMIES.foundry_warden.intents.quake.exec(e, c, e.intent);
  assert.equal(hp - c.hp, parts.reduce((a, b) => a + b, 0), 'the area total is the sum of the per-hero parts');
  assert.ok(parts.reduce((a, b) => a + b, 0) < e.intent.dmg * 3, 'and less than the bubble number times three (Defense)');
});

test('every source file parses (modules the unit tests do not import, such as main.js, included)', async () => {
  const { spawnSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') ? [`${d}/${e.name}`] : []));
  for (const f of walk(new URL('../src', import.meta.url).pathname)) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
