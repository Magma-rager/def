// Phase 7 recipe-coverage agent (docs/AUDIT.md Phase 7): does every EX Combo recipe come up in real,
// legal play, and does every build archetype have recipes it reaches more often than the others?
//
// For each of the ten archetypes it drafts decks the way a player leaning into that build would — the
// starter deck plus reward-pool cards carrying the archetype's tag (and a few others) — and fights Act I
// and Act II formations, elites and bosses (scaled as a run scales them) with the shared bot (tools/lib/bot.mjs), once as the ordinary player
// and once with the recipe-aware policy (`ex: true`). Nothing is injected: recipes trigger only when the
// engine has executed the pattern. A starter-deck-only pass shows which recipes need no rewards at all.
//
// Usage: node tools/recipelab.mjs [decks=12] [reaction=1.0]
import { Combat } from '../src/engine/combat.js';
import { CARDS, STARTER_DECK, rewardPool, ARCHETYPES } from '../src/data/cards.js';
import { FORMATIONS, ELITES, BOSSES } from '../src/data/enemies.js';
import { RECIPES } from '../src/data/recipes.js';
import { RNG } from '../src/core/rng.js';
import { decide, perform } from './lib/bot.mjs';

const DECKS = +(process.argv[2] || 12);
const REACT = +(process.argv[3] || 1.0);
const ARCH = Object.keys(ARCHETYPES);
const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const POOL = rewardPool();

function draft(arch, rng) {
  const ids = STARTER_DECK.map((s) => s.id || s);
  const tagged = POOL.filter((c) => c.tags.includes(arch));
  const other = POOL.filter((c) => !c.tags.includes(arch));
  for (let i = 0; i < 7; i++) ids.push(rng.pick(tagged).id);
  for (let i = 0; i < 3; i++) ids.push(rng.pick(other).id);
  return ids;
}

// enemy HP and damage as a run scales them at depth 4 of the act (src/engine/run.js battleSetup)
function battle(ids, enemies, act, seed, ex, kind = 'normal') {
  const rng = new RNG(seed);
  const depth = 4;
  const hpMult = (kind === 'boss' ? 1.5 : kind === 'elite' ? 1.65 : 1.75) * (1 + depth * 0.035) * (1 + 0.08 * (act - 1));
  const dmgMult = 1.1 * (1 + depth * 0.02);
  const c = new Combat({ deck: ids.map((id, i) => ({ uid: `d${i}`, id, up: rng.next() < 0.25 })), party: PARTY, hp: 130, maxHp: 130, enemies, seed, relics: [], mutations: [], act, kind, hpMult, dmgMult, depth });
  let think = 0.4;
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 400 && c.phase !== 'END'; step++) {
    c.update(dt);
    think -= dt;
    if (think > 0 || c.phase === 'END') continue;
    think = REACT * (0.7 + rng.next() * 0.6);
    const a = decide(c, { profile: 'regular', rng: () => rng.next(), ex });
    perform(c, a);
    if (a.type === 'play' || a.type === 'select') think = Math.min(think, REACT * 0.5);
    const z = c.verifyZones();
    if (!z.ok) throw new Error('zone corruption: ' + z.error);
  }
  return c;
}

function encounters(act, n) {
  const f = FORMATIONS[act].map((x) => [x[1], 'normal']);
  return [...Array.from({ length: n }, (_, i) => f[(i * 3) % f.length]), ...ELITES[act].map((e) => [[e], 'elite']), ...BOSSES[act].map((e) => [[e], 'boss'])];
}

const fmt = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
const total = {};
console.log(`Recipe lab: ${DECKS} decks per archetype, Act I + Act II formations, elites and bosses (run scaling, depth 4), reaction ${REACT}s ('regular' profile)\n`);
const table = [];
for (const arch of ARCH) {
  const res = { base: { b: 0, w: 0, t: 0, ex: 0, by: {} }, ex: { b: 0, w: 0, t: 0, ex: 0, by: {} } };
  for (let d = 0; d < DECKS; d++) {
    const rng = new RNG(9000 + d * 31 + ARCH.indexOf(arch) * 977);
    const ids = draft(arch, rng);
    for (const act of [1, 2]) {
      for (const [k, [enemies, kind]] of encounters(act, 3).entries()) {
        for (const mode of ['base', 'ex']) {
          const c = battle(ids, enemies, act, 100 + d * 13 + k * 7 + act, mode === 'ex', kind);
          const r = res[mode];
          r.b++; r.t += c.t; if (c.result && c.result.victory) r.w++;
          r.ex += c.stats.exActivations;
          for (const [id, v] of Object.entries(c.stats.exByRecipe)) { r.by[id] = (r.by[id] || 0) + v; if (mode === 'ex') total[id] = (total[id] || 0) + v; }
        }
      }
    }
  }
  const per = (r) => Object.fromEntries(Object.entries(r.by).map(([k, v]) => [k, v / r.b]));
  const tagged = RECIPES.filter((x) => x.tags.includes(arch)).map((x) => x.id);
  table.push({ arch, res, tagged, per: per(res.ex) });
  console.log(`${ARCHETYPES[arch]} (${arch}) — recipes tagged for it: ${tagged.join(', ')}`);
  for (const mode of ['base', 'ex']) {
    const r = res[mode];
    console.log(`  ${mode === 'ex' ? 'recipe-aware' : 'ordinary    '}: wins ${r.w}/${r.b} · ${(r.t / r.b).toFixed(1)}s per battle · EX ${(r.ex / r.b).toFixed(2)}/battle · top: ${fmt(per(r), 5) || 'none'}`);
  }
  const own = tagged.reduce((a, id) => a + (per(res.ex)[id] || 0), 0);
  console.log(`  its own recipes: ${own.toFixed(2)}/battle (recipe-aware)\n`);
}

// which archetype reaches each recipe most often (recipe-aware), relative to the average
console.log('Build differentiation — the archetype where each recipe is most frequent (recipe-aware, per battle; average over all archetypes in brackets):');
for (const r of RECIPES) {
  const rows = table.map((x) => [x.arch, x.per[r.id] || 0]).sort((a, b) => b[1] - a[1]);
  const avg = rows.reduce((a, x) => a + x[1], 0) / rows.length;
  const tagHit = r.tags.includes(rows[0][0]) ? ' ✓ tagged build' : '';
  console.log(`  ${r.id.padEnd(22)} ${rows[0][0].padEnd(12)} ${rows[0][1].toFixed(2)} (${avg.toFixed(2)})  next: ${rows[1][0]} ${rows[1][1].toFixed(2)}${tagHit}`);
}

// the starter deck alone, Act I formations
const st = { b: 0, by: {} };
for (let s = 0; s < DECKS * 2; s++) {
  for (const [k, [enemies, kind]] of encounters(1, 4).entries()) {
    const c = battle(STARTER_DECK.map((x) => x.id || x), enemies, 1, 500 + s * 11 + k, true, kind);
    st.b++;
    for (const [id, v] of Object.entries(c.stats.exByRecipe)) st.by[id] = (st.by[id] || 0) + v;
  }
}
console.log(`\nStarter deck only (Act I, recipe-aware, ${st.b} battles): ${Object.keys(st.by).length} recipes reached — ${fmt(Object.fromEntries(Object.entries(st.by).map(([k, v]) => [k, v / st.b])), 15)}`);
const never = RECIPES.filter((r) => !total[r.id]).map((r) => r.id);
console.log(`Recipes never reached by the recipe-aware decks: ${never.length ? never.join(', ') : 'none'}`);
