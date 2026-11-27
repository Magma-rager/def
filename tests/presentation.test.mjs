import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARD_LIST, CARDS } from '../src/data/cards.js';
import { ENEMIES } from '../src/data/enemies.js';
import { RECIPES } from '../src/data/recipes.js';
import { CLIPS, POSES, clipClock } from '../src/render/rig.js';
import { CARD_CUES, EX_CUES, ENEMY_CUES, cardCue } from '../src/render/choreography.js';
import { BattleView } from '../src/render/battleView.js';
import { CARD_BRIEFS } from '../src/i18n/cardBriefs.js';

function battle() {
  const c = new Combat({
    party: [{ id: 'V' }, { id: 'C' }, { id: 'S' }], hp: 130, maxHp: 130,
    deck: [{ uid:'x', id:'scrapline' }, { uid:'y', id:'rivet_jab' }], enemies: ['rush_hound','wire_jammer'],
    seed: 18, relics: [], mutations: [], act: 1,
  });
  c.hand = ['x', 'y', null, null, null, null];
  for (const e of c.enemies) e.atb = -100;
  c.drainEvents();
  return c;
}

function renderer(c) {
  const sound = [];
  const v = new BattleView({ getContext: () => ({}), style: {} }, { sfx: (id) => sound.push(id) });
  v.resize(667, 170, 1);
  v.setCombat(c, 1);
  return { v, sound };
}

test('real scheduler aligns contact and sound to the resolved target after retargeting', () => {
  const c = battle();
  const { v, sound } = renderer(c);
  c.selectHero('S');
  c.setTarget(c.enemies[0].uid);
  assert.ok(c.commit('x').ok);
  const start = c.drainEvents();
  const act = start.find((e) => e.type === 'act');
  v.consume(start);
  assert.equal(v.fx.filter((f) => f.kind === 'signal').length, 0);
  assert.ok(!sound.includes('contact'));
  assert.equal(act.at,RULES.RESOLVE_AT.shoot);
  c.setTarget(c.enemies[1].uid);
  const before = c.enemies.map((e) => e.hp);
  assert.ok(c.commit('y').ok);
  assert.ok(c.cancelCmd(c.queue[0].id));
  for(let i=0;i<12;i++) { v.update(1/60); c.update(1/60); v.consume(c.drainEvents()); }
  assert.deepEqual(c.enemies.map((e) => e.hp), before);
  assert.ok(!sound.includes('contact'));
  for(let i=0;i<5;i++) { v.update(1/60); c.update(1/60); }
  const events = c.drainEvents();
  const hit = events.find((e) => e.type === 'hit');
  assert.equal(hit.uid,c.enemies[1].uid);
  assert.equal(hit.cue.command,act.cmd);
  assert.equal(events.find((e) => e.type === 'execResolve').target,hit.uid);
  assert.ok(events.every((e) => e.type !== 'act' || e.id !== 'rivet_jab'));
  v.consume(events);
  const [contact] = v.fx.filter((f) => f.kind === 'signal' && f.sx !== undefined);
  const [x,,sc,b] = v.enemyPos(v.enemyActors.get(hit.uid));
  assert.equal(contact.x,x+(b[0]+b[2])*.5*sc);
  assert.ok(sound.includes('contact'));
  assert.equal(c.enemies[0].hp,before[0]);
});

test('every art and EX recipe has a resolved cue, enemy identities are complete and authored clips have joint poses', () => {
  assert.deepEqual(Object.keys(ENEMY_CUES).sort(),Object.keys(ENEMIES).sort());
  assert.deepEqual(Object.keys(EX_CUES).sort(),RECIPES.map((r) => r.id).sort());
  assert.equal(new Set(Object.values(EX_CUES).map((e) => e.shape)).size,RECIPES.length);
  for (const d of CARD_LIST) {
    if (d.owner) assert.ok(CARD_CUES[d.id],d.id);
    for (const who of d.owner ? [d.owner] : Object.keys(POSES)) {
      const cue = cardCue({ id:d.id, who, category:d.category, rank:d.rank, anim:d.anim });
      for (const [,name] of CLIPS[cue.clip].keys) assert.ok(POSES[who][name],`${d.id} ${who} ${name}`);
    }
  }
  const clip = CLIPS.breakline;
  assert.equal(clipClock(.27,.27,RULES.ACTION_TIME,clip),clip.impact);
  assert.ok(Math.abs(clipClock(RULES.ACTION_TIME,.27,RULES.ACTION_TIME,clip)-clip.dur) < 1e-9);
});

test('reduced motion keeps local EX results but removes decorative particles, paths and false strikes', () => {
  const { v, sound } = renderer(battle());
  v.reducedMotion = true;
  v.consume([{ type:'exCombo', id:'straight_circuit', hero:'V', order:0, applied:false }]);
  assert.equal(v.fx.length,0);
  v.consume([{ type:'exCombo', id:'healing_cadence', hero:'C', order:0, applied:true }]);
  assert.deepEqual(v.fx.map(({ shape })=>shape),['mend']);
  assert.equal(v.fx[0].sx,undefined);
  assert.ok(sound.includes('recipe'));
  v.onEnemyDie({ uid:v.combat.enemies[0].uid,boss:false });
  assert.equal(v.particles.length,0);
});

test('compact bilingual rule templates keep every interpolated card value', () => {
  const values = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  for (const [id, [en,ru]] of Object.entries(CARD_BRIEFS)) {
    assert.ok(CARDS[id],id);
    assert.deepEqual(values(en),values(CARDS[id].text),id);
    assert.deepEqual(values(ru),values(CARDS[id].text),id);
  }
});
