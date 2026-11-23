// Recipe-coverage and build lab (Phase 7, extended in Phase 8 — docs/AUDIT.md Phase 8). Does every EX
// Combo recipe come up in real, legal play, and does each of the ten build archetypes reach its own
// recipes more often than the others? Five layers:
//
//   A drafted   — decks drafted the way a player leaning into the build would: the starter deck plus
//                 seven reward-pool cards carrying the archetype's tag and three others
//   B natural   — decks a build-focused player actually assembled through the campaign's ordinary offers
//                 (tools/simulate.mjs --build=each with SB_DECKS=<file>: the deck as it reached each boss)
//   C           — in A and B, the ordinary player and the recipe-aware one (`ex: true`) on the same decks
//   D           — per encounter kind (formation, elite, boss)
//   E full run  — tools/simulate.mjs 100 1.0 regular --build=each --tactics [--ex] (its build table)
//
// Metrics: per battle, per chain (EX / chains), and per opportunity — the archetype's own recipes per
// chain that played at least one card of the archetype (a chain where the build was actually present).
// In battle the bot uses the build's tactics (tools/lib/bot.mjs `build`). Nothing is injected: recipes
// trigger only when the engine has executed the pattern.
//
// Usage: node tools/recipelab.mjs [decks=12] [reaction=1.0] [--natural=<SB_DECKS file>]
import fs from 'node:fs';
import { Combat } from '../src/engine/combat.js';
import { CARDS, STARTER_DECK, rewardPool, ARCHETYPES } from '../src/data/cards.js';
import { FORMATIONS, ELITES, BOSSES } from '../src/data/enemies.js';
import { RECIPES } from '../src/data/recipes.js';
import { RNG } from '../src/core/rng.js';
import { decide, perform } from './lib/bot.mjs';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const DECKS = +(pos[0] || 12);
const REACT = +(pos[1] || 1.0);
const NATURAL = (args.find((a) => a.startsWith('--natural=')) || '').slice(10) || null;
const ARCH = Object.keys(ARCHETYPES);
const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const POOL = rewardPool();
const own = (arch) => RECIPES.filter((x) => x.tags.includes(arch)).map((x) => x.id);

function draft(arch, rng) {
  const ids = STARTER_DECK.map((s) => s.id || s);
  const tagged = POOL.filter((c) => c.tags.includes(arch));
  const other = POOL.filter((c) => !c.tags.includes(arch));
  for (let i = 0; i < 7; i++) ids.push(rng.pick(tagged).id);
  for (let i = 0; i < 3; i++) ids.push(rng.pick(other).id);
  return ids.map((id, i) => ({ uid: `d${i}`, id, up: rng.next() < 0.25 }));
}

// enemy HP and damage as a run scales them at depth 4 of the act (src/engine/run.js battleSetup)
function battle(deck, enemies, act, seed, ex, kind, arch, relics = [], mutations = []) {
  const rng = new RNG(seed);
  const depth = 4;
  const hpMult = (kind === 'boss' ? 1.5 : kind === 'elite' ? 1.65 : 1.75) * (1 + depth * 0.035) * (1 + 0.08 * (act - 1));
  const dmgMult = 1.1 * (1 + depth * 0.02);
  const c = new Combat({ deck: deck.map((x) => ({ ...x })), party: PARTY, hp: 130, maxHp: 130, enemies, seed, relics, mutations, act, kind, hpMult, dmgMult, depth });
  // every chain's cards and recipes, for the per-chain and per-opportunity measures
  const chains = [];
  const push = c.history.push.bind(c.history);
  c.history.push = (s) => { chains.push({ ids: c.combo ? c.combo.cards.map((e) => e.id) : [], ex: s.ex || [] }); return push(s); };
  let think = 0.4;
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 400 && c.phase !== 'END'; step++) {
    c.update(dt);
    think -= dt;
    if (think > 0 || c.phase === 'END') continue;
    think = REACT * (0.7 + rng.next() * 0.6);
    const a = decide(c, { profile: 'regular', rng: () => rng.next(), ex, build: arch });
    perform(c, a);
    if (a.type === 'play' || a.type === 'select') think = Math.min(think, REACT * 0.5);
    const z = c.verifyZones();
    if (!z.ok) throw new Error('zone corruption: ' + z.error);
  }
  return { c, chains };
}

function encounters(act, n) {
  const f = FORMATIONS[act].map((x) => [x[1], 'normal']);
  return [...Array.from({ length: n }, (_, i) => f[(i * 3) % f.length]), ...ELITES[act].map((e) => [[e], 'elite']), ...BOSSES[act].map((e) => [[e], 'boss'])];
}

const blank = () => ({ b: 0, w: 0, t: 0, ex: 0, chains: 0, opp: 0, oppOwn: 0, own: 0, by: {}, kind: {} });
function record(r, { c, chains }, arch, kind) {
  r.b++; r.t += c.t; if (c.result && c.result.victory) r.w++;
  r.ex += c.stats.exActivations;
  r.chains += chains.length;
  const mine = own(arch);
  for (const ch of chains) {
    const present = ch.ids.some((id) => CARDS[id] && (CARDS[id].tags || []).includes(arch));
    const hits = ch.ex.filter((id) => mine.includes(id)).length;
    r.own += hits;
    if (present) { r.opp++; r.oppOwn += hits; }
  }
  for (const [id, v] of Object.entries(c.stats.exByRecipe)) r.by[id] = (r.by[id] || 0) + v;
  const k = (r.kind[kind] = r.kind[kind] || { b: 0, ex: 0 });
  k.b++; k.ex += c.stats.exActivations;
}
const line = (r) => `wins ${r.w}/${r.b} · ${(r.t / Math.max(1, r.b)).toFixed(1)}s · EX ${(r.ex / Math.max(1, r.b)).toFixed(2)}/battle, ${(r.ex / Math.max(1, r.chains)).toFixed(2)}/chain · own ${(r.own / Math.max(1, r.b)).toFixed(2)}/battle, ${(r.oppOwn / Math.max(1, r.opp)).toFixed(2)}/opportunity (${r.opp} of ${r.chains} chains carried the build)`;
const per = (r) => Object.fromEntries(Object.entries(r.by).map(([k, v]) => [k, v / Math.max(1, r.b)]));
const fmt = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');

function runDecks(arch, decks) {
  const res = { base: blank(), ex: blank() };
  for (const [d, dk] of decks.entries()) {
    for (const act of dk.acts) {
      for (const [k, [enemies, kind]] of encounters(act, 3).entries()) {
        for (const mode of ['base', 'ex']) record(res[mode], battle(dk.deck, enemies, act, 100 + d * 13 + k * 7 + act, mode === 'ex', kind, arch, dk.relics, dk.mutations), arch, kind);
      }
    }
  }
  return res;
}

const total = {};
const tables = { A: [], B: [] };
console.log(`Recipe and build lab: ${DECKS} drafted decks per archetype${NATURAL ? ` + natural decks from ${NATURAL}` : ''}, Act I + II formations, elites and bosses (run scaling, depth 4), reaction ${REACT}s ('regular' profile, build tactics)\n`);
const natural = NATURAL && fs.existsSync(NATURAL) ? fs.readFileSync(NATURAL, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
for (const arch of ARCH) {
  console.log(`${ARCHETYPES[arch]} (${arch}) — its recipes: ${own(arch).join(', ')}`);
  const drafted = Array.from({ length: DECKS }, (_, d) => ({ deck: draft(arch, new RNG(9000 + d * 31 + ARCH.indexOf(arch) * 977)), acts: [1, 2], relics: [], mutations: [] }));
  const A = runDecks(arch, drafted);
  for (const [id, v] of Object.entries(A.ex.by)) total[id] = (total[id] || 0) + v;
  tables.A.push({ arch, per: per(A.ex) });
  console.log(`  A drafted  · ordinary    : ${line(A.base)}`);
  console.log(`             · recipe-aware: ${line(A.ex)} · top: ${fmt(per(A.ex), 4)}`);
  const nat = natural.filter((x) => x.target === arch && x.act <= 2).slice(0, DECKS).map((x) => ({ deck: x.deck, acts: [x.act], relics: x.relics || [], mutations: x.mutations || [] }));
  if (nat.length) {
    const B = runDecks(arch, nat);
    for (const [id, v] of Object.entries(B.ex.by)) total[id] = (total[id] || 0) + v;
    tables.B.push({ arch, per: per(B.ex) });
    console.log(`  B natural  · ordinary    : ${line(B.base)} (${nat.length} decks)`);
    console.log(`             · recipe-aware: ${line(B.ex)} · top: ${fmt(per(B.ex), 4)}`);
  }
  console.log(`  D by encounter (recipe-aware, drafted): ${Object.entries(A.ex.kind).map(([k, v]) => `${k} ${(v.ex / v.b).toFixed(2)}`).join(' · ')} EX/battle\n`);
}

for (const L of ['A', 'B']) {
  const table = tables[L];
  if (!table.length) continue;
  console.log(`Build differentiation (${L === 'A' ? 'drafted' : 'natural'} decks, recipe-aware) — the archetype where each recipe is most frequent per battle (average over archetypes in brackets):`);
  for (const r of RECIPES) {
    const rows = table.map((x) => [x.arch, x.per[r.id] || 0]).sort((a, b) => b[1] - a[1]);
    const avg = rows.reduce((a, x) => a + x[1], 0) / rows.length;
    const tagHit = r.tags.includes(rows[0][0]) ? ' ✓ tagged build' : '';
    console.log(`  ${r.id.padEnd(22)} ${rows[0][0].padEnd(12)} ${rows[0][1].toFixed(2)} (${avg.toFixed(2)})  next: ${rows[1][0]} ${rows[1][1].toFixed(2)}${tagHit}`);
  }
  console.log('');
}

// the starter deck alone, Act I formations
const st = { b: 0, by: {} };
for (let s = 0; s < DECKS * 2; s++) {
  for (const [k, [enemies, kind]] of encounters(1, 4).entries()) {
    const { c } = battle(STARTER_DECK.map((x, i) => ({ uid: `s${i}`, id: x.id || x, up: false })), enemies, 1, 500 + s * 11 + k, true, kind, null);
    st.b++;
    for (const [id, v] of Object.entries(c.stats.exByRecipe)) st.by[id] = (st.by[id] || 0) + v;
  }
}
console.log(`Starter deck only (Act I, recipe-aware, ${st.b} battles): ${Object.keys(st.by).length} recipes reached — ${fmt(Object.fromEntries(Object.entries(st.by).map(([k, v]) => [k, v / st.b])), 15)}`);
const never = RECIPES.filter((r) => !total[r.id]).map((r) => r.id);
console.log(`Recipes never reached by the recipe-aware decks: ${never.length ? never.join(', ') : 'none'}`);
console.log('E full run: node tools/simulate.mjs 100 1.0 regular --build=each --tactics --ex (its build table: EX and own recipes per battle by target build)');
