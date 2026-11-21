// Act I fight lab (Phase 6, docs/AUDIT.md): one fight played many times through the real engine by the
// simulated players of tools/pacing.mjs, with the party's damage attributed to its source and the
// enemy side's actions, summons and interference counted.
//
//   node tools/fightlab.mjs <fight> [battles = 60] [--players=learner,slow2.5,ordinary,quick] [--hp=1.0]
//        [--tactical] [--relay=careful|active|none] [--relic=id] [--enemy=id.key=value,...] [--json]
//
// <fight>: hound_mother | foundry_warden | scrap_tyrant | clockwork_regent | a formation such as
// rush_hound+wire_jammer@2 (enemies @ depth). --hp starts the party at that share of its HP (carry-over
// from earlier fights). --enemy changes an enemy definition for a controlled experiment (actTime, hp, or
// an intent's damage as intents.<key>.dmg); nothing is shipped this way.
import { Run } from '../src/engine/run.js';
import { Combat, RULES } from '../src/engine/combat.js';
import { ENEMIES } from '../src/data/enemies.js';
import { RNG } from '../src/core/rng.js';
import { decide, perform } from './lib/bot.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FIGHT = args[0];
const N = +(args.find((a, i) => i > 0 && /^\d+$/.test(a)) || 60);
const HP_SHARE = +opt('hp', '1');
const RELAY = opt('relay', 'careful');
const TACTICAL = args.includes('--tactical');
const RELIC = opt('relic', '');
// target habit: 'first' (never retargets; the bots' default), 'threat' (taps the enemy that deals the most
// damage for its remaining HP: summons and small attackers first), 'weakest' (lowest HP first)
const TARGET = opt('target', 'first');
const JSON_OUT = args.includes('--json');
for (const kv of opt('enemy', '').split(',').filter(Boolean)) {
  const [path, v] = kv.split('=');
  const [id, ...keys] = path.split('.');
  let o = ENEMIES[id];
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = +v;
  // an intent's damage is baked into its exec closure; rebuild the simple attack ones
  if (keys[0] === 'intents' && keys[2] === 'dmg') {
    const it = ENEMIES[id].intents[keys[1]];
    const dmg = +v;
    if (it.kind === 'atk') it.exec = (e, c, x) => c.hitParty(e, x.target, c.edmg(e, dmg));
    if (it.kind === 'aoe') it.exec = (e, c) => c.hitAll(e, c.edmg(e, dmg));
  }
}
for (const kv of opt('set', '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); RULES[k] = +v; }

const ELITE = { foundry_warden: 3, hound_mother: 4 };
const BOSS = { scrap_tyrant: 8, clockwork_regent: 8 };
function encounter() {
  if (ELITE[FIGHT] !== undefined) return { enemies: [FIGHT], depth: ELITE[FIGHT], tier: 1.65, kind: 'elite' };
  if (BOSS[FIGHT] !== undefined) return { enemies: [FIGHT], depth: 8, tier: 1.5, kind: 'boss' };
  const [list, d] = FIGHT.split('@');
  return { enemies: list.split('+'), depth: +(d || 0), kind: 'normal' };
}
const ENC = encounter();
const PLAYERS = {
  learner: { read: 2.0, card: 1.3, misTap: 0.08, profile: 'learner' },
  ordinary: { read: 1.0, card: 1.0, misTap: 0.02, profile: 'regular' },
  quick: { read: 0.4, card: 0.4, misTap: 0, profile: 'quick' },
};
const pick = opt('players', 'learner,slow2.5,ordinary,quick').split(',');
for (const p of pick) if (p.startsWith('slow')) PLAYERS[p] = { read: 2.5, card: +p.slice(4), misTap: 0.08, profile: 'learner' };

function setup(seed) {
  const run = Run.create({ seed, tutorial: false });
  const tier = ENC.tier || 1.75;
  return {
    deck: run.d.deck.map((c) => ({ ...c })), party: run.d.party.map((p) => ({ ...p })),
    hp: Math.max(1, Math.round(run.d.maxHp * HP_SHARE)), maxHp: run.d.maxHp, enemies: ENC.enemies, seed: seed * 31 + 7,
    relics: RELIC ? [RELIC] : [], mutations: [], trait: null, kind: ENC.kind, act: 1,
    hpMult: tier * (1 + ENC.depth * 0.035), dmgMult: 1.1 * (1 + ENC.depth * 0.02), prep: {}, tutorial: false, depth: ENC.depth,
  };
}

function play(P, seed) {
  const rng = new RNG(seed * 13 + 5);
  const c = new Combat(setup(seed));
  c.tactical = TACTICAL;
  const hp0 = c.hp;
  const m = { supHand: {}, supPlays: {}, supMomentum: 0, supRecover: 0, dmgBy: {}, acts: {}, summons: 0, deaths: 0, summonKills: 0, drains: 0, drainSec: 0, phaseAt: null, peakEnemies: c.aliveEnemies().length, enemySecs: 0 };
  const idOf = (uid) => { const e = c.enemies.find((x) => x.uid === uid); return e ? (e.summoned ? `${e.id}*` : e.id) : 'other'; };
  let think = P.read;
  let handSig = '';
  for (let i = 0; i < 60 * 900 && c.phase !== 'END'; i++) {
    c.update(1 / 60);
    m.enemySecs += c.aliveEnemies().length / 60;
    m.peakEnemies = Math.max(m.peakEnemies, c.aliveEnemies().length);
    for (const ev of c.drainEvents()) {
      if (ev.type === 'partyHit' && !ev.reflect) { const k = idOf(ev.src); m.dmgBy[k] = (m.dmgBy[k] || 0) + ev.amount; }
      if (ev.type === 'enemyAct') { const k = `${ev.id}.${ev.key}`; m.acts[k] = (m.acts[k] || 0) + 1; }
      if (ev.type === 'summon') m.summons++;
      if (ev.type === 'enemyDie') { m.deaths++; const e = c.enemies.find((x) => x.uid === ev.uid); if (e && e.summoned) m.summonKills++; }
      if (ev.type === 'drain') { m.drains++; m.drainSec += ev.amount; }
      if (ev.type === 'phase' && m.phaseAt === null) m.phaseAt = c.t;
    }
    if (c.phase === 'END') break;
    const sig = c.hand.join(',');
    if (sig !== handSig) {
      const changed = c.hand.filter((u, k) => u && handSig.split(',')[k] !== String(u)).length;
      if (changed >= 3) think = Math.max(think, P.read * (0.75 + rng.next() * 0.5));
      handSig = sig;
    }
    think -= 1 / 60;
    if (think > 0) continue;
    think = P.card * (0.75 + rng.next() * 0.5);
    if (TARGET !== 'first' && c.aliveEnemies().length > 1) {
      const score = (e) => {
        if (TARGET === 'weakest') return -e.hp;
        const it = e.intent || {};
        const dps = ((it.dmg || 0) + 4) * c.enemySpeed(e) / e.actTime;
        return dps / Math.max(1, e.hp);
      };
      const best = c.aliveEnemies().slice().sort((a, b) => score(b) - score(a))[0];
      if (best && best.uid !== c.target) c.setTarget(best.uid);
    }
    if (P.misTap && c.phase === 'ACTIVE' && rng.chance(P.misTap)) {
      const bad = c.hand.find((u) => u && !c.check(u).ok && c.categoryOf(u) !== 'junk');
      if (bad) { c.playCard(bad); continue; }
    }
    // support cards in hand at each decision, by why they can or cannot be played now
    for (const u of [...c.hand, ...c.reserve]) {
      if (!u || c.categoryOf(u) !== 'support') continue;
      const k = c.check(u);
      const why = k.ok ? 'playable' : k.reason === 'momentum' ? 'momentum' : ['recover', 'busy', 'heroes', 'acting', 'committed'].includes(k.reason) ? 'hero busy' : k.reason;
      m.supHand[why] = (m.supHand[why] || 0) + 1;
    }
    const a = decide(c, { profile: P.profile, rng: () => rng.next(), relay: RELAY });
    if (a.type === 'play' && c.categoryOf(a.uid) === 'support') {
      const d = c.def(a.uid);
      m.supPlays[d.id] = (m.supPlays[d.id] || 0) + 1;
      m.supMomentum += d.cost || 0;
      m.supRecover += RULES.RECOVER_SUPPORT;
    }
    if (a.type === 'finish' || (a.type === 'select' && !c.combo)) think = Math.min(think, 0.35);
    perform(c, a);
    if (a.type === 'wait') think = 0.15;
  }
  const s = c.stats;
  return {
    win: !!(c.result && c.result.victory), t: c.t, hpLost: (hp0 - Math.max(0, c.hp)) / c.maxHp, m,
    chains: s.combos, dropped: s.forced, perfect: s.perfect, cashouts: s.cashouts, relays: s.relays, supports: s.supports,
    guardAbsorbed: s.guardAbsorbed, damage: s.damage, decide: s.time.decide,
  };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const out = [];
for (const name of pick) {
  const P = PLAYERS[name];
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(play(P, s));
  const keys = [...new Set(rs.flatMap((r) => Object.keys(r.m.dmgBy)))];
  const acts = [...new Set(rs.flatMap((r) => Object.keys(r.m.acts)))].sort();
  const row = {
    player: name, win: mean(rs.map((r) => (r.win ? 1 : 0))), hpLost: mean(rs.map((r) => r.hpLost)), seconds: mean(rs.map((r) => r.t)),
    winSeconds: mean(rs.filter((r) => r.win).map((r) => r.t)),
    chains: mean(rs.map((r) => r.chains)), dropped: mean(rs.map((r) => (r.chains ? r.dropped / r.chains : 0))), relays: mean(rs.map((r) => r.relays)), supports: mean(rs.map((r) => r.supports)),
    summons: mean(rs.map((r) => r.m.summons)), summonKills: mean(rs.map((r) => r.m.summonKills)), peakEnemies: mean(rs.map((r) => r.m.peakEnemies)), enemyCount: mean(rs.map((r) => r.m.enemySecs / r.t)),
    drains: mean(rs.map((r) => r.m.drains)), drainSec: mean(rs.map((r) => r.m.drainSec)), phaseAt: mean(rs.filter((r) => r.m.phaseAt !== null).map((r) => r.m.phaseAt)),
    dmgBy: Object.fromEntries(keys.map((k) => [k, mean(rs.map((r) => r.m.dmgBy[k] || 0))])),
    acts: Object.fromEntries(acts.map((k) => [k, mean(rs.map((r) => r.m.acts[k] || 0))])),
    actsPerMin: mean(rs.map((r) => (Object.values(r.m.acts).reduce((a, b) => a + b, 0) / r.t) * 60)),
    dmgPerMin: mean(rs.map((r) => ((Object.values(r.m.dmgBy).reduce((a, b) => a + b, 0)) / r.t) * 60)),
    supHand: (() => { const tot = {}; for (const r of rs) for (const [k, v] of Object.entries(r.m.supHand)) tot[k] = (tot[k] || 0) + v; const n = Object.values(tot).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, v / n])); })(),
    supPlays: (() => { const tot = {}; for (const r of rs) for (const [k, v] of Object.entries(r.m.supPlays)) tot[k] = (tot[k] || 0) + v / N; return tot; })(),
    supMomentum: mean(rs.map((r) => r.m.supMomentum)), supRecover: mean(rs.map((r) => r.m.supRecover)),
    playerDps: mean(rs.map((r) => r.damage / r.t)), guardAbsorbed: mean(rs.map((r) => r.guardAbsorbed)), decide: mean(rs.map((r) => r.decide)),
  };
  out.push(row);
}
if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${FIGHT} · ${N} battles · party HP ${pct(HP_SHARE)} at start${TACTICAL ? ' · Tactical timing' : ''} · Relays ${RELAY} · targets ${TARGET}${RELIC ? ' · relic ' + RELIC : ''}`);
  for (const r of out) {
    console.log(`\n${r.player}: win ${pct(r.win)} · HP lost ${pct(r.hpLost)} of max · ${r.seconds.toFixed(0)}s (wins ${r.winSeconds.toFixed(0)}s) · chains ${r.chains.toFixed(1)} dropped ${pct(r.dropped)} · Relays ${r.relays.toFixed(1)} · support ${r.supports.toFixed(1)} · player dmg/s ${r.playerDps.toFixed(1)} · Guard absorbed ${r.guardAbsorbed.toFixed(0)}`);
    console.log(`   enemies: ${r.actsPerMin.toFixed(1)} actions/min · ${r.dmgPerMin.toFixed(0)} damage/min · on the field ${r.enemyCount.toFixed(2)} (peak ${r.peakEnemies.toFixed(1)}) · summons ${r.summons.toFixed(1)} (killed ${r.summonKills.toFixed(1)})${r.drains ? ` · Flow stolen ${r.drains.toFixed(1)}× ${r.drainSec.toFixed(1)}s` : ''}${r.phaseAt ? ` · phase 2 at ${r.phaseAt.toFixed(0)}s` : ''}`);
    console.log(`   damage taken by source: ${Object.entries(r.dmgBy).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ')}`);
    console.log(`   enemy actions: ${Object.entries(r.acts).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`);
    console.log(`   support: played ${Object.entries(r.supPlays).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ') || '-'} · Momentum ${r.supMomentum.toFixed(1)} · Recovery ${r.supRecover.toFixed(1)} hero-s · support cards in hand at decisions: ${Object.entries(r.supHand).map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}`);
  }
}
