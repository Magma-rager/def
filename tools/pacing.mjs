// Combat pacing measurements for the opening Act I encounters, through the real engine.
// Two simulated players: a "learner" (reads a new hand for ~2s, ~1.3s per card, occasionally taps an
// illegal card, never uses Momentum or Churn tricks) and the faster heuristic "regular" bot.
// Reports enemy action frequency, incoming damage, Flow timeouts, combo length and survival.
// Usage: node tools/pacing.mjs [battles per encounter = 40] [--json]
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { RNG } from '../src/core/rng.js';

const N = +(process.argv[2] || 40);
const JSON_OUT = process.argv.includes('--json');

// Opening encounters: the tutorial fight and the Act I formations available at depths 0-2.
// Opening encounters (the tutorial fight and Act I formations at depths 0-2); --act1 adds Act I's
// later formations, elites and bosses.
const ENCOUNTERS = [
  { name: 'tutorial: hound + jammer', enemies: ['rush_hound', 'wire_jammer'], depth: 0, tutorial: true },
  { name: 'd0: 2 hounds', enemies: ['rush_hound', 'rush_hound'], depth: 0 },
  { name: 'd0: hound + mite', enemies: ['rush_hound', 'interference_mite'], depth: 0 },
  { name: 'd1: 2 mites + hound', enemies: ['interference_mite', 'interference_mite', 'rush_hound'], depth: 1 },
  { name: 'd1: jammer + hound', enemies: ['wire_jammer', 'rush_hound'], depth: 1 },
  { name: 'd1: iron maw', enemies: ['iron_maw'], depth: 1 },
  { name: 'd2: snare + mite', enemies: ['churn_snare', 'interference_mite'], depth: 2 },
  { name: 'd2: jammer + 2 mites', enemies: ['wire_jammer', 'interference_mite', 'interference_mite'], depth: 2 },
];
if (process.argv.includes('--act1')) {
  ENCOUNTERS.push(
    { name: 'd4: snare + hound + jammer', enemies: ['churn_snare', 'rush_hound', 'wire_jammer'], depth: 4 },
    { name: 'elite d3: foundry warden', enemies: ['foundry_warden'], depth: 3, tier: 1.65 },
    { name: 'elite d4: hound mother', enemies: ['hound_mother'], depth: 4, tier: 1.65 },
    { name: 'boss: scrap tyrant', enemies: ['scrap_tyrant'], depth: 8, tier: 1.5 },
    { name: 'boss: clockwork regent', enemies: ['clockwork_regent'], depth: 8, tier: 1.5 },
  );
}

const PLAYERS = {
  learner: { read: 2.0, card: 1.3, misTap: 0.08, tools: false },
  regular: { read: 0.55, card: 0.55, misTap: 0, tools: true },
};

function setupFor(enc, seed) {
  const run = Run.create({ seed, tutorial: false });
  return {
    deck: run.d.deck.map((c) => ({ ...c })),
    party: run.d.party.map((p) => ({ ...p })),
    enemies: enc.enemies,
    seed: seed * 31 + 7,
    relics: [],
    mutations: [],
    trait: null,
    kind: enc.tier === 1.5 ? 'boss' : enc.tier ? 'elite' : 'normal',
    act: 1,
    hpMult: (enc.tier || 1.75) * (1 + enc.depth * 0.035),
    dmgMult: 1.1 * (1 + enc.depth * 0.02),
    prep: {},
    tutorial: !!enc.tutorial,
    depth: enc.depth,
  };
}

function play(enc, player, seed) {
  const rng = new RNG(seed * 13 + 5);
  const c = new Combat(setupFor(enc, seed));
  const P = PLAYERS[player];
  const hp0 = c.party.reduce((a, p) => a + p.hp, 0);
  const dt = 1 / 60;
  const m = { enemyActs: [], damage: 0, combos: 0, forcedByTime: 0, cards: 0, longest: 0, time: { PRE: 0, ACTIVE: 0, RECOVER: 0 }, firstKO: null };
  let think = P.read;
  let handSig = '';
  for (let i = 0; i < 60 * 900 && c.phase !== 'END'; i++) {
    c.update(dt);
    if (c.phase !== 'END') m.time[c.phase] = (m.time[c.phase] || 0) + dt;
    for (const ev of c.drainEvents()) {
      if (ev.type === 'enemyAct') m.enemyActs.push(ev.t);
      if (ev.type === 'partyKO' && m.firstKO === null) m.firstKO = ev.t;
      if (ev.type === 'comboEnd') {
        m.combos++;
        m.longest = Math.max(m.longest, ev.len);
        if (ev.kind === 'forced') m.forcedByTime++;
      }
    }
    if (c.phase === 'END') break;
    // a changed hand has to be read again
    const sig = c.hand.join(',');
    if (sig !== handSig) {
      const changed = c.hand.filter((u, k) => u && handSig.split(',')[k] !== String(u)).length;
      if (changed >= 3) think = Math.max(think, P.read * (0.75 + rng.next() * 0.5));
      handSig = sig;
    }
    think -= dt;
    if (think > 0) continue;
    think = P.card * (0.75 + rng.next() * 0.5);
    const legal = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok);
    if (P.misTap && c.phase === 'ACTIVE' && rng.chance(P.misTap)) {
      const bad = c.hand.find((u) => u && !c.check(u).ok && c.roleOf(u) !== 'junk');
      if (bad) { c.playCard(bad); continue; }
    }
    if (P.tools) {
      const danger = c.aliveEnemies().some((e) => e.atb > 0.8 && e.intent && (e.intent.kind === 'atk' || e.intent.kind === 'aoe'));
      if (danger && c.guard < 6 && c.momentum >= 3 && rng.chance(0.7)) { c.spendMomentumGuard(); continue; }
    }
    if (c.phase === 'PRE') {
      if (!legal.length) {
        const junk = c.hand.find((u) => u && c.roleOf(u) === 'junk');
        if (junk) c.churnCard(junk);
        continue;
      }
      legal.sort((a, b) => c.effRank(a) - c.effRank(b));
      c.playCard(legal[0]);
      m.cards++;
    } else if (c.phase === 'ACTIVE') {
      const closers = legal.filter((u) => c.roleOf(u) === 'close');
      const convs = legal.filter((u) => c.roleOf(u) === 'conv');
      const len = c.combo.cards.length;
      if (convs.length && (len < 4 || !closers.length)) {
        convs.sort((a, b) => c.effRank(a) - c.effRank(b));
        c.playCard(convs[0]); m.cards++;
      } else if (closers.length) {
        closers.sort((a, b) => c.effRank(b) - c.effRank(a));
        c.playCard(closers[0]); m.cards++;
      } else if (c.canCashOut()) c.cashOut();
      else if (P.tools) {
        const bad = c.hand.find((u) => u && !c.check(u).ok && !c.isLocked(u));
        if (bad && c.churn.charges > 0) c.churnCard(bad);
      }
    }
  }
  const hp1 = c.party.reduce((a, p) => a + Math.max(0, p.hp), 0);
  const gaps = [];
  for (let k = 1; k < m.enemyActs.length; k++) gaps.push(m.enemyActs[k] - m.enemyActs[k - 1]);
  return {
    win: !!(c.result && c.result.victory), t: c.t, hpLost: (hp0 - hp1) / hp0,
    actsPerMin: (m.enemyActs.length / c.t) * 60, gaps, dmgPerMin: (c.stats.damageTaken / c.t) * 60,
    combos: m.combos, forced: m.forcedByTime, longest: m.longest, cardsPerCombo: m.combos ? c.stats.cardsPlayed / m.combos : 0,
    time: m.time, firstKO: m.firstKO,
  };
}

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;

const report = [];
for (const enc of ENCOUNTERS) {
  for (const player of Object.keys(PLAYERS)) {
    const rs = [];
    for (let s = 1; s <= N; s++) rs.push(play(enc, player, s));
    const row = {
      encounter: enc.name, player,
      win: mean(rs.map((r) => (r.win ? 1 : 0))),
      seconds: mean(rs.map((r) => r.t)),
      hpLost: mean(rs.map((r) => r.hpLost)),
      enemyActsPerMin: mean(rs.map((r) => r.actsPerMin)),
      medianGap: median(rs.flatMap((r) => r.gaps)),
      shortGaps: mean(rs.map((r) => (r.gaps.length ? r.gaps.filter((g) => g < 1).length / r.gaps.length : 0))),
      dmgPerMin: mean(rs.map((r) => r.dmgPerMin)),
      combos: mean(rs.map((r) => r.combos)),
      timedOut: mean(rs.map((r) => (r.combos ? r.forced / r.combos : 0))),
      longest: mean(rs.map((r) => r.longest)),
      cardsPerCombo: mean(rs.map((r) => r.cardsPerCombo)),
      firstKO: median(rs.filter((r) => r.firstKO !== null).map((r) => r.firstKO)),
      koRate: mean(rs.map((r) => (r.firstKO !== null ? 1 : 0))),
    };
    report.push(row);
  }
}
if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
else {
  console.log('encounter                     player   win  time  hpLost  acts/min medGap <1s  dmg/min combos timeout longest cards/combo KO%  firstKO');
  for (const r of report) {
    console.log(`${r.encounter.padEnd(29)} ${r.player.padEnd(8)} ${pct(r.win).padStart(4)} ${r.seconds.toFixed(0).padStart(4)}s ${pct(r.hpLost).padStart(6)} ${r.enemyActsPerMin.toFixed(1).padStart(8)} ${r.medianGap.toFixed(2).padStart(6)} ${pct(r.shortGaps).padStart(4)} ${r.dmgPerMin.toFixed(0).padStart(7)} ${r.combos.toFixed(1).padStart(6)} ${pct(r.timedOut).padStart(7)} ${r.longest.toFixed(1).padStart(7)} ${r.cardsPerCombo.toFixed(1).padStart(11)} ${pct(r.koRate).padStart(4)} ${r.firstKO ? r.firstKO.toFixed(0) + 's' : '-'}`);
  }
}
