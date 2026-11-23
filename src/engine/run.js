// Run state machine: map, nodes, rewards, shops, events, rest, surgery, bosses, mutations, saving.
// All run data lives in the plain object `this.d` so it serializes to localStorage verbatim.
import { RNG, seedFrom } from '../core/rng.js';
import { CARDS, STARTER_DECK, rewardPool, graftPool, ARCHETYPES, MIGRATE_CARDS, UNKNOWN_CARD_FALLBACK, isOffensive, RANK_RANGE, gaugedRank, graftFits } from '../data/cards.js';
import { RELICS, relicPool } from '../data/relics.js';
import { ENEMIES, FORMATIONS, ELITES, BOSSES } from '../data/enemies.js';
import { EVENTS, EVENT_MAP } from '../data/events.js';
import { MUTATIONS, mutationPool } from '../data/mutations.js';
import { ADAPTATIONS, adaptationApplies } from '../data/adaptations.js';
import { TRAIT_IDS } from '../data/traits.js';
import { PREPARED_PLANS, VOLATILE_OUTCOMES } from '../data/acts.js';

export const PARTY_BASE = { V: 46, C: 34, S: 38 };
// The party shares one HP pool (save version 4, docs/COMBAT_SPEC.md §4.1): the three old pools added up, plus a bonus (prototype) that stands in
// for what the old per-hero rules forgave: damage past a falling hero's last HP was lost, and area
// attacks skipped fallen heroes. Measured with tools/pacing.mjs --act1 (docs/AUDIT.md, Phase 3).
export const PARTY_HP_BONUS = 12;
export const PARTY_MAX_HP = PARTY_BASE.V + PARTY_BASE.C + PARTY_BASE.S + PARTY_HP_BONUS;
export const MAP_DEPTHS = 8; // depths 0..7, boss at depth 8
export const SAVE_VERSION = 6;

// Save version 5 (docs/COMBAT_SPEC.md §19): card ids of the old Opener/Converter/Closer catalogue that
// Phase 4 withholds (they need Relays) become a converted card of the same hero and rarity; unknown ids
// become a Medium basic attack. Everything on the instance (uid, upgrade, graft, rank modifier, suit) is
// kept, and the number of cards does not change. A suit set by an earlier recut is marked as such.
export function migrateCardId(id) {
  if (MIGRATE_CARDS[id]) return MIGRATE_CARDS[id];
  return CARDS[id] ? id : UNKNOWN_CARD_FALLBACK;
}
function migrateCard(c) {
  const id = migrateCardId(c.id);
  const out = { ...c, id };
  if (id !== c.id) out.was = c.id;
  if (out.variant && out.variant !== CARDS[id].variant && out.recut === undefined) out.recut = true;
  return out;
}
const migrateSpec = (spec) => (spec && spec.id ? { ...spec, id: migrateCardId(spec.id) } : spec);

// Older saves are converted once when loaded, one version at a time.
// v3 → v4: per-hero HP becomes the shared pool (a knocked-out hero counts 0), plus the same bonus a
// new run has.  v4 → v5: the card catalogue (above), including cards offered by a pending reward,
// shop or event.  v5 → v6 (Phase 7): the run gains its EX Combo record — the recipes activated in this
// run (`exFound`) and activation counts in `stats` — starting empty; nothing else changes. The
// permanent Combo Journal lives in the Museum record (src/engine/save.js), not in the run.
function migrate(obj) {
  if (obj.version === 3) {
    const party = obj.party || [];
    const sumMax = party.reduce((a, m) => a + (m.maxHp || 0), 0);
    obj.maxHp = sumMax ? sumMax + PARTY_HP_BONUS : PARTY_MAX_HP;
    obj.hp = Math.max(1, Math.min(obj.maxHp, party.reduce((a, m) => a + Math.max(0, m.hp || 0), 0) + PARTY_HP_BONUS));
    obj.party = party.map((m) => ({ id: m.id }));
    obj.version = 4;
  }
  if (obj.version === 4) {
    obj.deck = (obj.deck || []).map(migrateCard);
    const p = obj.pending;
    if (p && p.type === 'reward' && Array.isArray(p.cards)) p.cards = p.cards.map(migrateSpec);
    if (p && p.type === 'shop' && p.stock && Array.isArray(p.stock.cards)) p.stock.cards = p.stock.cards.map((x) => ({ ...x, spec: migrateSpec(x.spec) }));
    if (p && p.result && Array.isArray(p.result.offer)) p.result.offer = p.result.offer.map(migrateSpec);
    obj.version = 5;
  }
  if (obj.version === 5) {
    obj.exFound = [];
    obj.stats = { ...emptyStats(), ...(obj.stats || {}) };
    obj.version = 6;
  }
  if (obj.version === 6) {
    if (!Array.isArray(obj.exFound)) obj.exFound = [];
    obj.exFound = obj.exFound.filter((id) => typeof id === 'string');
    obj.stats = obj.stats || emptyStats();
    if (!obj.stats.exByRecipe || typeof obj.stats.exByRecipe !== 'object') obj.stats.exByRecipe = {};
    if (!Number.isFinite(obj.stats.exActivations)) obj.stats.exActivations = 0;
  }
  return obj;
}

const RARITY_PRICE = { common: 50, uncommon: 78, rare: 130 };
const RELIC_PRICE = { common: 135, uncommon: 175, rare: 225 };

export function emptyStats() {
  return {
    battles: 0, combos: 0, perfect: 0, cashouts: 0, forced: 0, longCombos: 0, churns: 0, guardGained: 0,
    guardAbsorbed: 0, relays: 0, crosses: 0, steps: 0, variantPlays: { A: 0, B: 0, EX: 0 }, momentumSpent: 0,
    flowGained: 0, reservePlays: 0, interferencePayoffs: 0, damage: 0, maxHit: 0, longest: 0, finishers: 0,
    damageTaken: 0, interference: 0, elites: 0, cardsPlayed: 0, bestComboDamage: 0,
    exActivations: 0, exByRecipe: {}, exOverlaps: 0, exDamage: 0,
  };
}

// Typical per-battle evidence at each act's boss: medians of ordinary simulated campaigns (tools/simulate.mjs
// with SB_PROFILE_DUMP=1, docs/AUDIT.md Phase 8), with small floors where ordinary play does none of it.
// long/cash/relay: per combo · guard/churn/mom/flow/reserve/interf: per battle · suit: share above 50%.
export const EVIDENCE_TYPICAL = {
  1: { long: 0.31, cash: 0.12, relay: 1.0, guard: 14, churn: 0.5, suit: 0.1, mom: 10.3, flow: 0.2, reserve: 0.15, interf: 1.17 },
  2: { long: 0.24, cash: 0.17, relay: 0.76, guard: 28.3, churn: 0.5, suit: 0.1, mom: 18.1, flow: 0.2, reserve: 0.15, interf: 1.5 },
  3: { long: 0.19, cash: 0.18, relay: 0.68, guard: 47, churn: 1.46, suit: 0.1, mom: 27.4, flow: 0.3, reserve: 0.15, interf: 1.94 },
};
export const EVIDENCE_MARGIN = 1.15;
export const EVIDENCE_MIN = 0.6;

export class Run {
  constructor(d) {
    this.d = d;
  }

  static create({ seed, starterRelic = 'beta_badge', tutorial = false }) {
    const s = seed >>> 0;
    const d = {
      version: SAVE_VERSION,
      seed: s,
      act: 1,
      party: Object.keys(PARTY_BASE).map((id) => ({ id })),
      hp: PARTY_MAX_HP,
      maxHp: PARTY_MAX_HP,
      deck: [],
      nextUid: 1,
      relics: [starterRelic],
      mutations: [],
      scrap: 80,
      bosses: {},
      map: null,
      position: null,
      path: [],
      log: [],
      pending: null,
      stats: emptyStats(),
      flags: {},
      seenEvents: [],
      removeCost: 75,
      prepToken: null,
      bossDecisions: [],
      battleCount: 0,
      lastFormation: null,
      nextBattleMod: null,
      tutorial,
      startedAt: Date.now(),
      floors: 0,
      bossesDefeated: [],
      enemiesSeen: [],
      relicsSeen: [starterRelic],
      exFound: [],
    };
    const run = new Run(d);
    for (const spec of STARTER_DECK) run.addCard(spec);
    const brng = new RNG(seedFrom(s, 'bosses'));
    for (const act of [1, 2, 3]) d.bosses[act] = brng.pick(BOSSES[act]);
    run.generateMap(1);
    d.pending = { type: 'story', scene: 'intro', next: 'map' };
    return run;
  }

  static load(obj) {
    if (!obj) return null;
    migrate(obj);
    if (obj.version !== SAVE_VERSION) return null;
    // Phase 8: a re-gauged rank stays inside its category (basic 1-3, arte 4-6); older saves could hold
    // a basic attack raised to rank 4+ or an arte to 7+ under the 1-9 rule. Grafts are kept as they are.
    for (const inst of obj.deck || []) {
      const d = CARDS[inst.id];
      if (!d || !RANK_RANGE[d.category] || !inst.rankMod) continue;
      inst.rankMod = gaugedRank(d, inst.rankMod) - d.rank;
    }
    return new Run(obj);
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.d));
  }

  rng(...salt) {
    return new RNG(seedFrom(this.d.seed, ...salt));
  }

  // ───────────────────────── basics ─────────────────────────
  get act() { return this.d.act; }
  get scrap() { return this.d.scrap; }
  hasRelic(id) { return this.d.relics.includes(id); }
  member(id) { return this.d.party.find((p) => p.id === id); }
  // shared HP pool
  get hp() { return this.d.hp; }
  setHp(v) { this.d.hp = Math.max(1, Math.min(this.d.maxHp, Math.round(v))); }
  hurt(n) { this.setHp(this.d.hp - n); }
  changeMaxHp(delta) {
    this.d.maxHp = Math.max(30, Math.round(this.d.maxHp + delta));
    this.d.hp = Math.min(this.d.hp, this.d.maxHp);
  }

  addCard({ id, up = false, graft = null, variant = null, rankMod = 0, recut = false }) {
    const inst = { uid: `c${this.d.nextUid++}`, id, up, graft, rankMod, variant };
    if (recut) inst.recut = true;
    this.d.deck.push(inst);
    return inst;
  }
  card(uid) { return this.d.deck.find((c) => c.uid === uid); }

  addRelic(id) {
    if (this.d.relics.includes(id)) return false;
    this.d.relics.push(id);
    if (!this.d.relicsSeen.includes(id)) this.d.relicsSeen.push(id);
    return true;
  }

  effRank(inst) {
    if (!isOffensive(CARDS[inst.id])) return 0;
    return gaugedRank(CARDS[inst.id], inst.rankMod);
  }
  effVariant(inst) {
    return inst.variant || CARDS[inst.id].variant;
  }

  categoryCount(cat) {
    return this.d.deck.filter((c) => CARDS[c.id].category === cat).length;
  }

  // Removal keeps a playable deck: at least 8 cards, 4 of them basic attacks (every combo starts
  // with one).
  canRemove(uid) {
    const inst = this.card(uid);
    if (!inst) return false;
    if (this.d.deck.length <= 8) return false;
    if (CARDS[inst.id].category === 'basic') return this.categoryCount('basic') > 4;
    return true;
  }

  removeCard(uid) {
    if (!this.canRemove(uid)) return false;
    this.d.deck = this.d.deck.filter((c) => c.uid !== uid);
    return true;
  }

  dominantTags() {
    const counts = {};
    for (const c of this.d.deck) for (const t of CARDS[c.id].tags) counts[t] = (counts[t] || 0) + 1;
    for (const r of this.d.relics) { const t = RELICS[r].tag; if (t) counts[t] = (counts[t] || 0) + 1; }
    for (const m of this.d.mutations) { const t = MUTATIONS[m].tag; if (t) counts[t] = (counts[t] || 0) + 2; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  // Dominant build archetype key (see ARCHETYPES), or 'balanced'.
  archetypeKey() {
    const top = this.dominantTags()[0];
    return top && ARCHETYPES[top] ? top : 'balanced';
  }

  // ───────────────────────── map ─────────────────────────
  generateMap(act) {
    const rng = this.rng('map', act);
    const nodes = [];
    const byDepth = [];
    let id = 0;
    for (let depth = 0; depth < MAP_DEPTHS; depth++) {
      const n = depth === 0 || depth === MAP_DEPTHS - 1 ? 3 : rng.range(3, 4);
      const row = [];
      for (let i = 0; i < n; i++) {
        const y = (i + 0.5) / n + (rng.next() - 0.5) * (0.35 / n);
        const node = { id: `n${act}_${id++}`, depth, y, type: 'battle', trait: null, edges: [], visited: false };
        row.push(node);
        nodes.push(node);
      }
      byDepth.push(row);
    }
    const boss = { id: `n${act}_boss`, depth: MAP_DEPTHS, y: 0.5, type: 'boss', trait: null, edges: [], visited: false };
    nodes.push(boss);
    // edges: monotone proportional mapping with occasional branches; every node gets in/out edges
    for (let d = 0; d < MAP_DEPTHS - 1; d++) {
      const A = byDepth[d], B = byDepth[d + 1];
      const incoming = new Set();
      A.forEach((a, i) => {
        const j = A.length === 1 ? 0 : Math.round((i * (B.length - 1)) / (A.length - 1));
        a.edges.push(B[j].id);
        incoming.add(B[j].id);
        if (rng.chance(0.5)) {
          const k = j + (rng.chance(0.5) ? 1 : -1);
          const alt = B[k];
          if (alt && !a.edges.includes(alt.id)) { a.edges.push(alt.id); incoming.add(alt.id); }
        }
      });
      B.forEach((b, j) => {
        if (incoming.has(b.id)) return;
        const i = B.length === 1 ? 0 : Math.round((j * (A.length - 1)) / (B.length - 1));
        A[i].edges.push(b.id);
      });
    }
    for (const n of byDepth[MAP_DEPTHS - 1]) n.edges.push(boss.id);
    // node types
    const parentsOf = (node) => nodes.filter((p) => p.edges.includes(node.id));
    for (let d = 0; d < MAP_DEPTHS; d++) {
      for (const node of byDepth[d]) {
        if (d === 0) { node.type = 'battle'; continue; }
        if (d === MAP_DEPTHS - 1) { node.type = 'rest'; continue; }
        let type = 'battle';
        for (let tries = 0; tries < 6; tries++) {
          type = rng.weighted([
            ['battle', 44], ['event', 22], ['elite', d >= 3 ? 13 : 0], ['shop', d >= 2 ? 8 : 0],
            ['rest', d >= 4 ? 6 : 0], ['surgery', d >= 2 ? 7 : 0],
          ]);
          if (type === 'battle' || !parentsOf(node).some((p) => p.type === type)) break;
        }
        node.type = type;
      }
    }
    const last = byDepth[MAP_DEPTHS - 1];
    if (last.length >= 3) last[last.length - 1].type = rng.pick(['shop', 'surgery']);
    const mid = byDepth[4];
    if (!mid.some((n) => n.type === 'treasure')) rng.pick(mid).type = 'treasure';
    const ensure = (type, minDepth, maxDepth) => {
      if (nodes.some((n) => n.type === type)) return;
      const cands = nodes.filter((n) => n.type === 'battle' && n.depth >= minDepth && n.depth <= maxDepth);
      if (cands.length) rng.pick(cands).type = type;
    };
    ensure('shop', 2, 6);
    ensure('surgery', 2, 6);
    ensure('elite', 3, 6);
    ensure('event', 1, 6);
    // traits
    for (const node of nodes) {
      if (node.type === 'battle' || node.type === 'elite') { if (rng.chance(0.38)) node.trait = rng.pick(TRAIT_IDS); }
      else if (node.type === 'shop') { if (rng.chance(0.3)) node.trait = 'SCRAP_CACHE'; }
      else if (node.type === 'rest') { if (rng.chance(0.3)) node.trait = 'QUIET_CHANNEL'; }
      else if (node.type === 'event') { if (rng.chance(0.2)) node.trait = rng.pick(['SCRAP_CACHE', 'WILD_SIGNAL']); }
    }
    if (this.d.tutorial && act === 1) byDepth[0].forEach((n) => (n.trait = null));
    this.d.map = { act, nodes, bossId: this.d.bosses[act] };
    this.d.position = null;
    this.d.path = [];
  }

  node(id) { return this.d.map.nodes.find((n) => n.id === id); }
  currentNode() { return this.d.position ? this.node(this.d.position) : null; }

  availableNodes() {
    if (this.d.pending) return [];
    const cur = this.currentNode();
    if (!cur) return this.d.map.nodes.filter((n) => n.depth === 0).map((n) => n.id);
    return cur.edges.slice();
  }

  // Every node can reach the boss (used by tests and as a guard).
  verifyMap() {
    const nodes = this.d.map.nodes;
    const bossId = nodes.find((n) => n.type === 'boss').id;
    const memo = {};
    const reach = (id) => {
      if (id === bossId) return true;
      if (memo[id] !== undefined) return memo[id];
      memo[id] = false;
      const n = nodes.find((x) => x.id === id);
      memo[id] = n.edges.some(reach);
      return memo[id];
    };
    return nodes.every((n) => reach(n.id));
  }

  enterNode(id) {
    if (!this.availableNodes().includes(id)) return null;
    const node = this.node(id);
    node.visited = true;
    this.d.position = id;
    this.d.path.push(id);
    this.d.floors++;
    this.d.log.push({ act: this.d.act, node: id, type: node.type, trait: node.trait, at: this.d.floors });
    const rng = this.rng('node', id);
    switch (node.type) {
      case 'battle':
      case 'elite':
        this.d.pending = { type: 'battle', nodeId: id, kind: node.type };
        break;
      case 'boss':
        this.d.pending = { type: 'bossprep', nodeId: id, bossId: this.d.bosses[this.d.act], ...this.bossAnalysis() };
        break;
      case 'event': {
        const ev = this.pickEvent(rng);
        if (node.trait === 'SCRAP_CACHE') this.d.scrap += 25;
        this.d.pending = { type: 'event', nodeId: id, eventId: ev.id, result: null, select: null };
        break;
      }
      case 'shop':
        this.d.pending = { type: 'shop', nodeId: id, stock: this.makeShop(rng, node.trait === 'SCRAP_CACHE') };
        break;
      case 'rest':
        this.d.pending = { type: 'rest', nodeId: id, done: false, quiet: node.trait === 'QUIET_CHANNEL' };
        break;
      case 'surgery':
        this.d.pending = { type: 'surgery', nodeId: id, ops: 0, grafts: rng.sample(graftPool(), 3), select: null };
        break;
      case 'treasure':
        this.d.pending = { type: 'treasure', nodeId: id, relics: this.randomRelics(rng, 2), taken: false, scrap: 20 };
        break;
      default:
        this.d.pending = null;
    }
    return this.d.pending;
  }

  // ───────────────────────── battles ─────────────────────────
  battleSetup() {
    const p = this.d.pending;
    const node = this.node(p.nodeId);
    const act = this.d.act;
    const rng = this.rng('enc', p.nodeId);
    let enemies;
    let tutorial = false;
    const isBoss = node.type === 'boss';
    if (p.enemies) {
      enemies = p.enemies.slice();
      tutorial = !!p.tutorial;
    } else if (p.kind === 'boss' || node.type === 'boss') enemies = [this.d.bosses[act]];
    else if (p.kind === 'elite') {
      const opts = ELITES[act].filter((e) => e !== this.d.lastElite);
      enemies = [rng.pick(opts.length ? opts : ELITES[act])];
      this.d.lastElite = enemies[0];
    } else if (this.d.tutorial && act === 1 && node.depth === 0) {
      enemies = ['rush_hound', 'wire_jammer'];
      tutorial = true;
    } else {
      const pool = FORMATIONS[act].filter((f) => f[2] <= node.depth && f[1].join() !== this.d.lastFormation);
      enemies = rng.weighted(pool.map((f) => [f[1], f[0]]));
      this.d.lastFormation = enemies.join();
    }
    p.enemies = enemies.slice();
    p.tutorial = tutorial;
    const tierHp = isBoss ? 1.5 : p.kind === 'elite' ? 1.65 : 1.75;
    let hpMult = tierHp * (1 + node.depth * 0.035) * (1 + 0.08 * (act - 1));
    let dmgMult = 1.1 * (1 + node.depth * 0.02);
    if (this.d.nextBattleMod) { hpMult *= this.d.nextBattleMod.hpMult || 1; }
    let prep = {};
    if ((p.kind === 'elite' || isBoss) && this.d.prepToken) prep = { ...this.d.prepToken };
    if (isBoss && p.prep) prep = { ...prep, ...p.prep };
    for (const id of enemies) if (!this.d.enemiesSeen.includes(id)) this.d.enemiesSeen.push(id);
    return {
      deck: this.d.deck.map((c) => ({ ...c })),
      party: this.d.party.map((x) => ({ ...x })),
      hp: this.d.hp,
      maxHp: this.d.maxHp,
      enemies,
      seed: seedFrom(this.d.seed, 'battle', p.nodeId, this.d.battleCount),
      relics: this.d.relics.slice(),
      mutations: this.d.mutations.slice(),
      trait: node.trait,
      kind: isBoss ? 'boss' : p.kind,
      act,
      hpMult,
      dmgMult,
      prep,
      tutorial,
      adaptation: isBoss && p.adaptation && !(p.prep && p.prep.noAdapt) ? p.adaptation : null,
      profileArch: isBoss ? p.arch || null : null,
      depth: node.depth,
    };
  }

  finishBattle(outcome) {
    const p = this.d.pending;
    const node = this.node(p.nodeId);
    const isBoss = node.type === 'boss';
    this.d.battleCount++;
    this.d.nextBattleMod = null;
    if ((p.kind === 'elite' || isBoss) && this.d.prepToken) this.d.prepToken = null;
    // party: the pool carries over (a won battle always leaves at least 1)
    this.setHp(outcome.hp);
    // stats
    const S = this.d.stats, B = outcome.stats;
    S.battles++;
    for (const k of ['combos', 'perfect', 'cashouts', 'forced', 'longCombos', 'churns', 'guardGained', 'guardAbsorbed', 'relays', 'crosses', 'steps', 'momentumSpent', 'flowGained', 'reservePlays', 'interferencePayoffs', 'damage', 'finishers', 'damageTaken', 'interference', 'cardsPlayed', 'exActivations', 'exOverlaps', 'exDamage']) S[k] = (S[k] || 0) + (B[k] || 0);
    // EX Combos of a finished battle count for the run (a restarted or abandoned battle's do not)
    S.exByRecipe = S.exByRecipe || {};
    for (const [id, n] of Object.entries(B.exByRecipe || {})) S.exByRecipe[id] = (S.exByRecipe[id] || 0) + n;
    if (!Array.isArray(this.d.exFound)) this.d.exFound = [];
    for (const id of outcome.exFound || []) if (!this.d.exFound.includes(id)) this.d.exFound.push(id);
    for (const v of ['A', 'B', 'EX']) S.variantPlays[v] += B.variantPlays[v] || 0;
    S.maxHit = Math.max(S.maxHit, B.maxHit);
    S.longest = Math.max(S.longest, B.longest);
    S.bestComboDamage = Math.max(S.bestComboDamage, B.bestComboDamage || 0);
    if (p.kind === 'elite') S.elites++;
    if (!outcome.victory) {
      this.d.pending = { type: 'gameover', victory: false };
      return this.d.pending;
    }
    if (this.d.tutorial && this.d.act === 1 && node.depth === 0) {
      this.d.tutorial = false;
      this.d.flags.tutorialDone = true;
    }
    if (this.hasRelic('patch_kit')) this.healFlat(12);
    if (node.trait === 'QUIET_CHANNEL') this.healFlat(6);
    if (isBoss) {
      const bossId = this.d.bosses[this.d.act];
      this.d.bossesDefeated.push(bossId);
      const dec = this.d.bossDecisions[this.d.bossDecisions.length - 1];
      if (dec) dec.result = 'victory';
      if (this.d.act === 3) {
        this.d.pending = { type: 'story', scene: 'ending', next: 'victory' };
        return this.d.pending;
      }
    }
    this.d.pending = this.makeReward(node, p.kind, outcome);
    return this.d.pending;
  }

  makeReward(node, kind, outcome) {
    const rng = this.rng('reward', node.id);
    const isBoss = node.type === 'boss';
    let scrap = isBoss ? 75 : kind === 'elite' ? rng.range(32, 42) : rng.range(14, 22);
    if (this.hasRelic('scrap_magnet')) scrap = Math.round(scrap * 1.25);
    if (node.trait === 'SCRAP_CACHE') scrap = Math.round(scrap * 1.5);
    if (node.trait === 'HOTWIRE') scrap += 15;
    scrap += outcome.scrapBonus || 0;
    const n = 3 + (this.hasRelic('lucky_rivet') ? 1 : 0);
    const cards = this.cardChoices(rng, n, {
      kind: isBoss ? 'boss' : kind, boost: node.trait === 'STATIC', grafted: node.trait === 'WILD_SIGNAL',
    });
    let relics = [];
    if (isBoss) {
      const bossId = this.d.bosses[this.d.act];
      const trophy = Object.keys(RELICS).find((id) => RELICS[id].boss === bossId && !this.d.relics.includes(id));
      relics = [...(trophy ? [trophy] : []), ...this.randomRelics(rng, trophy ? 2 : 3, ['rare', 'uncommon'])];
    }
    else if (kind === 'elite' || (node.trait === 'BLACKOUT' && rng.chance(0.5))) relics = this.randomRelics(rng, 1);
    return {
      type: 'reward', nodeId: node.id, boss: isBoss, scrap, scrapTaken: false, cards, cardTaken: false,
      relics, relicTaken: false, relicChoice: isBoss,
    };
  }

  cardChoices(rng, n, { kind = 'battle', boost = false, grafted = false, minRarity = null, tag = null } = {}) {
    const pool = rewardPool();
    const tags = this.dominantTags();
    const out = [];
    // Every combo starts with a basic attack: when fewer than 40% of the deck are basic attacks, the
    // first card offered is one (prototype, docs/COMBAT_SPEC.md §25), so a deck full of artes stays playable.
    const needBasic = this.d.deck.length > 0 && this.categoryCount('basic') / this.d.deck.length < 0.4;
    for (let i = 0; i < n; i++) {
      let rarity;
      if (kind === 'boss') rarity = 'rare';
      else {
        const w = kind === 'elite' ? [['common', 40], ['uncommon', 42], ['rare', 18]] : [['common', 58], ['uncommon', 34], ['rare', 8]];
        rarity = rng.weighted(w);
        if (boost && rarity !== 'rare' && rng.chance(0.6)) rarity = rarity === 'common' ? 'uncommon' : 'rare';
      }
      if (minRarity === 'uncommon' && rarity === 'common') rarity = 'uncommon';
      if (minRarity === 'rare') rarity = 'rare';
      let cands = pool.filter((c) => c.rarity === rarity && !out.some((o) => o.id === c.id));
      if (i === 0 && needBasic) {
        const b = cands.filter((c) => c.category === 'basic');
        cands = b.length ? b : pool.filter((c) => c.category === 'basic' && !out.some((o) => o.id === c.id));
      }
      const wantTag = tag || (i === 0 && tags.length && rng.chance(0.65) ? tags[0] : i === 1 && tags[1] && rng.chance(0.4) ? tags[1] : null);
      if (wantTag && !(i === 0 && needBasic)) {
        const t = cands.filter((c) => c.tags.includes(wantTag));
        if (t.length) cands = t;
      }
      if (!cands.length) cands = pool.filter((c) => !out.some((o) => o.id === c.id));
      const pick = rng.pick(cands);
      out.push({ id: pick.id, up: false, graft: grafted ? rng.pick(graftPool().filter((g) => graftFits(g, pick))) : null });
    }
    return out;
  }

  randomRelics(rng, n, rarities = null, exclude = []) {
    let pool = relicPool([...this.d.relics, ...exclude]);
    if (rarities) {
      const r = pool.filter((id) => rarities.includes(RELICS[id].rarity));
      if (r.length >= n) pool = r;
    }
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const id = rng.weighted(pool.filter((x) => !out.includes(x)).map((x) => [x, { common: 50, uncommon: 35, rare: 15 }[RELICS[x].rarity] || 10]));
      if (id) out.push(id);
    }
    return out;
  }

  takeReward(what, idx) {
    const p = this.d.pending;
    if (!p || p.type !== 'reward') return false;
    if (what === 'scrap' && !p.scrapTaken) { this.d.scrap += p.scrap; p.scrapTaken = true; return true; }
    if (what === 'card' && !p.cardTaken && p.cards[idx]) { this.addCard(p.cards[idx]); p.cardTaken = true; p.cardPicked = idx; return true; }
    if (what === 'skipcard' && !p.cardTaken) { p.cardTaken = true; p.cardPicked = -1; return true; }
    if (what === 'relic' && !p.relicTaken && p.relics[idx]) { this.addRelic(p.relics[idx]); p.relicTaken = true; p.relicPicked = idx; return true; }
    return false;
  }

  finishReward() {
    const p = this.d.pending;
    if (!p || p.type !== 'reward') return null;
    if (!p.scrapTaken) { this.d.scrap += p.scrap; p.scrapTaken = true; }
    if (p.boss) {
      const rng = this.rng('mut', this.d.act);
      this.d.pending = { type: 'mutation', options: this.mutationOptions(rng), taken: null };
      return this.d.pending;
    }
    this.d.pending = null;
    return null;
  }

  mutationOptions(rng) {
    const avail = mutationPool().filter((m) => !this.d.mutations.includes(m));
    const tags = this.dominantTags();
    const out = [];
    const tagged = avail.filter((m) => MUTATIONS[m].tag === tags[0]);
    if (tagged.length) out.push(rng.pick(tagged));
    while (out.length < 3 && out.length < avail.length) {
      const m = rng.pick(avail.filter((x) => !out.includes(x)));
      out.push(m);
    }
    return out;
  }

  chooseMutation(id) {
    const p = this.d.pending;
    if (!p || p.type !== 'mutation' || !p.options.includes(id)) return false;
    this.d.mutations.push(id);
    if (id === 'glass_cannon') this.changeMaxHp(-this.d.maxHp * 0.15);
    p.taken = id;
    const dec = this.d.bossDecisions[this.d.bossDecisions.length - 1];
    if (dec) dec.mutation = id;
    this.d.pending = { type: 'story', scene: `boss_win_act${this.d.act}`, next: 'nextAct' };
    return true;
  }

  advanceAct() {
    this.d.act++;
    this.setHp(this.d.hp + (this.d.maxHp - this.d.hp) * 0.75);
    this.generateMap(this.d.act);
    this.d.pending = { type: 'story', scene: `act${this.d.act}_intro`, next: 'map' };
  }

  // ───────────────────────── boss preparation ─────────────────────────
  // Boss evidence (Phase 8, docs/COMBAT_SPEC.md §29): what this run does clearly more than ordinary play
  // at the same act. Each measure is compared with its typical value at this act's boss (EVIDENCE_TYPICAL,
  // the median of ordinary simulated campaigns, docs/AUDIT.md); a score of 1 means 15% above typical.
  // Before Phase 8 the thresholds were fixed numbers from before artes cost Momentum, so Momentum
  // spending — which every deck now does — won almost every boss.
  analyzeProfile() {
    const S = this.d.stats;
    const b = Math.max(1, S.battles);
    const combos = Math.max(1, S.combos);
    const T = EVIDENCE_TYPICAL[this.d.act] || EVIDENCE_TYPICAL[3];
    const out = [];
    // a habit at least near its typical level still counts when nothing stands out more (the boss adapts to the strongest)
    const add = (arch, ok, value, typical, evidence) => { const score = ok ? value / (typical * EVIDENCE_MARGIN) : 0; if (score >= EVIDENCE_MIN) out.push({ arch, score, evidence }); };
    if (S.combos >= 8) {
      add('ladder', S.longCombos >= 4, S.longCombos / combos, T.long, { k: '{a} of {b} combos ran 5+ cards', p: { a: S.longCombos, b: S.combos } });
      add('cashout', S.cashouts >= 5, S.cashouts / combos, T.cash, { k: '{a} of {b} combos ended in a Cash Out', p: { a: S.cashouts, b: S.combos } });
      add('relay', S.relays >= 15, S.relays / combos, T.relay, { k: '{a} Relays across {b} combos', p: { a: S.relays, b: S.combos } });
    }
    add('guard', S.guardAbsorbed >= 50, S.guardGained / b, T.guard, { k: '{a} Guard raised, {b} damage absorbed', p: { a: S.guardGained, b: S.guardAbsorbed } });
    add('churn', S.churns >= 12, S.churns / b, T.churn, { k: '{a} Churns over {b} battles', p: { a: S.churns, b: S.battles } });
    const ab = S.variantPlays.A + S.variantPlays.B;
    if (ab >= 30) {
      const dom = S.variantPlays.A >= S.variantPlays.B ? 'A' : 'B';
      const share = S.variantPlays[dom] / ab;
      add(`variant${dom}`, true, share - 0.5, T.suit, { k: '{a}% of suited cards played were {s}', p: { a: Math.round(share * 100), s: dom } });
    }
    add('momentum', S.momentumSpent >= 25, S.momentumSpent / b, T.mom, { k: '{a} Momentum spent', p: { a: S.momentumSpent } });
    add('flow', S.flowGained >= 5, S.flowGained / b, T.flow, { k: '{a}s of bonus Flow gained', p: { a: { n: S.flowGained, d: 1 } } });
    add('reserve', S.reservePlays >= 6, S.reservePlays / b, T.reserve, { k: '{a} cards played from Reserve', p: { a: S.reservePlays } });
    add('interference', S.interferencePayoffs >= 8, S.interferencePayoffs / b, T.interf, { k: '{a} interference-payoff cards played', p: { a: S.interferencePayoffs } });
    return out.sort((a, b2) => b2.score - a.score);
  }

  bossAnalysis() {
    // the strongest evidence whose counter this boss can actually apply (Hardened Locks needs a boss
    // that Locks); the preparation screen lists that same evidence
    const all = this.analyzeProfile();
    const boss = ENEMIES[this.d.bosses[this.d.act]];
    const profile = all.filter((x) => adaptationApplies(x.arch, boss));
    const top = profile[0] || null;
    const adaptation = top ? { ...ADAPTATIONS[top.arch] } : null;
    const rng = this.rng('volatile', this.d.act);
    const volatile = rng.pick(VOLATILE_OUTCOMES);
    return { profile, arch: top ? top.arch : null, adaptation, volatileId: volatile.id, choice: null };
  }

  chooseBossPrep(kind, planId) {
    const p = this.d.pending;
    if (!p || p.type !== 'bossprep' || p.choice) return null;
    let prep = {};
    let rareCard = null;
    if (kind === 'prepared') {
      const plan = PREPARED_PLANS.find((x) => x.id === planId);
      if (!plan) return null;
      prep = { ...plan.prep };
      if (plan.healPct) this.healPct(plan.healPct);
    } else {
      const v = VOLATILE_OUTCOMES.find((x) => x.id === p.volatileId);
      prep = { ...v.prep };
      if (v.partyDamagePct) this.hurt(this.d.maxHp * v.partyDamagePct);
      if (v.rareCard) {
        const pick = this.rng('volcard', this.d.act).pick(rewardPool().filter((c) => c.rarity === 'rare'));
        this.addCard({ id: pick.id });
        rareCard = pick.id;
      }
    }
    p.choice = { kind, planId: planId || p.volatileId, rareCard };
    p.prep = prep;
    this.d.bossDecisions.push({ act: this.d.act, boss: p.bossId, prep: kind, planId: planId || p.volatileId, rareCard, adapt: p.adaptation && !prep.noAdapt ? p.arch : null, evidence: p.profile[0] ? p.profile[0].evidence : null, result: null });
    p.type = 'battle';
    p.kind = 'boss';
    return p;
  }

  // ───────────────────────── events ─────────────────────────
  pickEvent(rng) {
    const act = this.d.act;
    let pool = EVENTS.filter((e) => e.acts.includes(act) && !this.d.seenEvents.includes(e.id));
    if (!pool.length) pool = EVENTS.filter((e) => e.acts.includes(act));
    // story events take priority once per act if unseen
    const story = pool.filter((e) => e.story);
    const ev = story.length && rng.chance(0.5) ? rng.pick(story) : rng.pick(pool);
    this.d.seenEvents.push(ev.id);
    return ev;
  }

  // whether an event choice can be taken now: true, or the reason (shown on the choice)
  eventChoiceReq(idx) {
    const p = this.d.pending;
    const ch = p && p.type === 'event' ? EVENT_MAP[p.eventId].choices[idx] : null;
    if (!ch) return 'Not applicable';
    if (ch.req) { const r = ch.req(this.api(this.rng('preview'))); if (r !== true) return r; }
    // a choice that asks for a card is refused when no card in the deck can take it
    if (ch.needs && !this.d.deck.some((x) => this.canApplySelect(ch.needs, x))) { const text = 'No card in the deck can take this'; return text; }
    return true;
  }

  eventChoose(idx) {
    const p = this.d.pending;
    if (!p || p.type !== 'event' || (p.result && !p.result.repeat)) return null;
    const ev = EVENT_MAP[p.eventId];
    const ch = ev.choices[idx];
    if (!ch) return null;
    const ok = this.eventChoiceReq(idx);
    if (ok !== true) return { error: ok };
    const api = this.api(this.rng('evt', p.nodeId, (p.tries || 0)));
    p.tries = (p.tries || 0) + 1;
    const res = ch.run(api) || { text: '' };
    p.result = { text: res.text, repeat: !!res.repeat, choice: idx, offer: res.offer || null };
    if (res.select) p.select = res.select;
    return p.result;
  }

  // Suit and rank changes only apply to attacks (basic attacks and artes); support has neither.
  canApplySelect(action, inst) {
    const d = CARDS[inst.id];
    const off = !!d && isOffensive(d);
    switch (action) {
      case 'remove': return this.canRemove(inst.uid);
      case 'upgrade': return !inst.up;
      case 'transform': return !!d && d.category !== 'junk';
      case 'duplicate': return true;
      case 'recut': return off && this.effVariant(inst) !== 'EX';
      case 'ex': return off && this.effVariant(inst) !== 'EX';
      case 'rankup': return off && this.effRank(inst) < RANK_RANGE[d.category][1];
      case 'rankdown': return off && this.effRank(inst) > RANK_RANGE[d.category][0];
      default:
        if (action.startsWith('graft:')) return inst.graft !== action.slice(6) && graftFits(action.slice(6), d);
        return !!d;
    }
  }

  applySelect(action, uid) {
    const inst = this.card(uid);
    if (!inst || !this.canApplySelect(action, inst)) return false;
    const rng = this.rng('sel', uid, action, this.d.floors);
    switch (action) {
      case 'remove': this.removeCard(uid); break;
      case 'upgrade': inst.up = true; break;
      case 'transform': {
        const cat = CARDS[inst.id].category;
        const cands = rewardPool().filter((c) => c.category === cat && c.id !== inst.id);
        inst.id = rng.pick(cands).id;
        inst.variant = null; inst.rankMod = 0; inst.up = false; delete inst.recut;
        break;
      }
      case 'duplicate': {
        // the copy of an attack gets a random suit; a support card has none to change
        const off = isOffensive(CARDS[inst.id]);
        const variant = off ? rng.pick(['A', 'B', 'EX']) : inst.variant;
        this.addCard({ ...inst, variant, recut: off && variant !== CARDS[inst.id].variant });
        break;
      }
      case 'recut': inst.variant = this.effVariant(inst) === 'A' ? 'B' : 'A'; inst.recut = true; break;
      case 'ex': inst.variant = 'EX'; inst.recut = true; break;
      case 'rankup': inst.rankMod = (inst.rankMod || 0) + 1; break;
      case 'rankdown': inst.rankMod = (inst.rankMod || 0) - 1; break;
      default:
        if (action.startsWith('graft:')) inst.graft = action.slice(6);
        else return false;
    }
    const p = this.d.pending;
    if (p && p.select) {
      // an event's price is paid when its card is chosen (docs/COMBAT_SPEC.md §29): cancelling costs nothing
      const cost = p.select.cost;
      if (cost && cost.scrap) this.d.scrap = Math.max(0, this.d.scrap - cost.scrap);
      if (cost && cost.hp) this.hurt(cost.hp);
      p.select = null;
    }
    return true;
  }

  cancelSelect() {
    const p = this.d.pending;
    if (p && p.select && !p.select.required) p.select = null;
    return !!p && !p.select;
  }

  takeOfferCard(idx) {
    const p = this.d.pending;
    if (!p || !p.result || !p.result.offer) return false;
    const spec = p.result.offer[idx];
    if (!spec) return false;
    this.addCard(spec);
    p.result.offer = null;
    p.result.offerTaken = spec.id;
    return true;
  }

  leaveNode() {
    const p = this.d.pending;
    if (p && p.type === 'treasure' && !p.taken) this.d.scrap += p.scrap;
    this.d.pending = null;
  }

  // Run API handed to event scripts.
  api(rng) {
    const run = this;
    return {
      rng,
      get scrap() { return run.d.scrap; },
      gain: (n) => { run.d.scrap += n; },
      spend: (n) => { run.d.scrap = Math.max(0, run.d.scrap - n); },
      // event effects on the shared pool (docs/COMBAT_SPEC.md §18.6)
      hp: () => run.d.hp,
      hurt: (n) => run.hurt(n),
      healPct: (p) => run.healPct(p),
      healFlat: (n) => run.healFlat(n),
      gainMaxHp: (n) => { run.d.maxHp += n; run.d.hp += n; },
      loseMaxHp: (n) => run.changeMaxHp(-n),
      loseMaxHpPct: (p) => run.changeMaxHp(-run.d.maxHp * p),
      upgradeRandom: (n) => {
        const c = rng.sample(run.d.deck.filter((x) => !x.up), n);
        c.forEach((x) => (x.up = true));
        return c.map((x) => x.id);
      },
      addRandomCards: (n, rarity) => {
        const pool = rewardPool().filter((c) => !rarity || c.rarity === rarity);
        const out = [];
        for (let i = 0; i < n; i++) { const c = rng.pick(pool); run.addCard({ id: c.id }); out.push(c.id); }
        return out;
      },
      offerCards: (n, minRarity, tag) => ({ text: { k: '$Choose a card.' }, offer: run.cardChoices(rng, n, { minRarity, tag }) }),
      offerGraft: (cost = null) => {
        // a graft some card in the deck can take
        const fits = graftPool().filter((g) => run.d.deck.some((x) => run.canApplySelect(`graft:${g}`, x)));
        const g = rng.pick(fits.length ? fits : graftPool());
        return { text: { k: '$The Oracle prepares a {g} graft.', p: { g: { graft: g } } }, select: { title: { k: 'Graft {g}', p: { g: { graft: g } } }, filter: 'graftable', action: `graft:${g}`, ...(cost ? { cost } : {}) } };
      },
      addRandomRelic: (exclude = []) => {
        const r = run.randomRelics(rng, 1, null, exclude)[0];
        if (!r) { run.d.scrap += 50; return null; }
        run.addRelic(r);
        return r;
      },
      addRelic: (id) => run.addRelic(id),
      hasRelic: (id) => run.hasRelic(id),
      tradeableRelics: () => run.d.relics.filter((r) => RELICS[r].rarity !== 'starter').length,
      loseRandomRelic: () => {
        const c = run.d.relics.filter((r) => RELICS[r].rarity !== 'starter');
        const r = rng.pick(c);
        run.d.relics = run.d.relics.filter((x) => x !== r);
        return r;
      },
      mutateRandomRank: () => {
        const c = rng.pick(run.d.deck.filter((x) => isOffensive(CARDS[x.id])));
        const [lo, hi] = RANK_RANGE[CARDS[c.id].category];
        const before = run.effRank(c);
        // up or down at random, but always a real change inside the card's category
        let delta = rng.chance(0.5) ? 1 : -1;
        if (before + delta > hi || before + delta < lo) delta = -delta;
        if (before + delta > hi || before + delta < lo) delta = 0;
        c.rankMod = (c.rankMod || 0) + delta;
        return { k: '{card} is now rank {now} (was {was}).', p: { card: { card: c.id }, now: run.effRank(c), was: before } };
      },
      flag: (f) => { run.d.flags[f] = true; },
      setNextBattleMod: (m) => { run.d.nextBattleMod = m; },
    };
  }

  healPct(p) {
    this.d.hp = Math.min(this.d.maxHp, this.d.hp + Math.round(this.d.maxHp * p));
  }
  healFlat(n) {
    this.d.hp = Math.min(this.d.maxHp, this.d.hp + Math.round(n));
  }

  // ───────────────────────── shop ─────────────────────────
  makeShop(rng, cheap) {
    const disc = cheap ? 0.8 : 1;
    const cards = this.cardChoices(rng, 5, {}).map((spec) => ({ spec, price: Math.round(RARITY_PRICE[CARDS[spec.id].rarity] * disc * (0.9 + rng.next() * 0.2)), sold: false }));
    const relics = this.randomRelics(rng, 3).map((id) => ({ id, price: Math.round(RELIC_PRICE[RELICS[id].rarity] * disc * (0.9 + rng.next() * 0.2)), sold: false }));
    return {
      cards, relics, disc,
      removePrice: Math.round(this.d.removeCost * disc), removeUsed: false,
      healPrice: Math.round(45 * disc), healUsed: false,
      upgradePrice: Math.round(60 * disc), upgradeUsed: false,
      surgeryPrice: Math.round(70 * disc), surgeryUsed: false,
      grafts: rng.sample(graftPool(), 3),
    };
  }

  shopBuy(kind, idx) {
    const p = this.d.pending;
    if (!p || p.type !== 'shop') return { ok: false };
    const s = p.stock;
    const pay = (price) => {
      if (this.d.scrap < price) return false;
      this.d.scrap -= price;
      return true;
    };
    if (kind === 'card') {
      const it = s.cards[idx];
      if (!it || it.sold || !pay(it.price)) return { ok: false, text: 'Not enough Scrap' };
      it.sold = true;
      this.addCard(it.spec);
      return { ok: true };
    }
    if (kind === 'relic') {
      const it = s.relics[idx];
      if (!it || it.sold || !pay(it.price)) return { ok: false, text: 'Not enough Scrap' };
      it.sold = true;
      this.addRelic(it.id);
      return { ok: true };
    }
    if (kind === 'heal') {
      if (this.d.hp >= this.d.maxHp) return { ok: false, text: 'The party is at full HP' };
      if (s.healUsed || !pay(s.healPrice)) return { ok: false, text: 'Not enough Scrap' };
      s.healUsed = true;
      this.healPct(0.3);
      return { ok: true };
    }
    if (kind === 'remove' || kind === 'upgrade' || kind === 'surgery') {
      const used = `${kind}Used`, price = s[`${kind}Price`];
      if (s[used]) return { ok: false, text: 'Already used' };
      if (this.d.scrap < price) return { ok: false, text: 'Not enough Scrap' };
      // payment happens on confirmation via shopService
      return { ok: true, needSelect: true };
    }
    return { ok: false };
  }

  shopService(kind, uid, action) {
    const p = this.d.pending;
    if (!p || p.type !== 'shop') return false;
    const s = p.stock;
    const used = `${kind}Used`, price = s[`${kind}Price`];
    if (s[used] || this.d.scrap < price) return false;
    let act = kind === 'remove' ? 'remove' : kind === 'upgrade' ? 'upgrade' : action;
    if (!act || !this.applySelect(act, uid)) return false;
    this.d.scrap -= price;
    s[used] = true;
    if (kind === 'remove') this.d.removeCost += 25;
    return true;
  }

  // ───────────────────────── rest & surgery & treasure ─────────────────────────
  // whether a rest option does anything now: true, or the reason it is unavailable
  restAvailable(option) {
    if ((option === 'tune' || option === 'overdrive') && !this.d.deck.some((x) => !x.up)) { const text = 'Every card is already upgraded'; return text; }
    if (option === 'recover' && this.d.hp >= this.d.maxHp) { const text = 'The party is at full HP'; return text; }
    return true;
  }

  restChoose(option) {
    const p = this.d.pending;
    if (!p || p.type !== 'rest' || p.done) return null;
    const ok = this.restAvailable(option);
    if (ok !== true) return { error: ok };
    if (option === 'recover') { this.healPct(p.quiet ? 0.45 : 0.3); p.done = 'recover'; return { text: 'The party patches up by the furnace.' }; }
    if (option === 'fortify') { this.d.prepToken = { startGuard: 12, startMomentum: 2 }; p.done = 'fortify'; return { text: 'Battle plan drafted. Your next Elite or Boss fight starts with 12 Guard and 2 Momentum.' }; }
    if (option === 'overdrive') {
      const up = this.api(this.rng('od', p.nodeId)).upgradeRandom(2);
      this.hurt(this.d.hp * 0.15);
      p.done = 'overdrive';
      return { text: { k: 'Overdrive! {cards} upgraded. The party pays for it in HP.', p: { cards: { cards: up } } } };
    }
    if (option === 'tune') { p.select = { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade', then: 'tune' }; return { select: true }; }
    return null;
  }

  surgeryApply(uid, action) {
    const p = this.d.pending;
    if (!p || p.type !== 'surgery') return { ok: false };
    const cost = (p.ops === 0 ? 0 : 40) + (action === 'ex' ? 50 : 0);
    if (p.ops >= 2) return { ok: false, text: 'The surgeon is out of thread' };
    if (this.d.scrap < cost) return { ok: false, text: { k: 'Need {n} Scrap', p: { n: cost } } };
    if (!this.applySelect(action, uid)) return { ok: false, text: 'Not applicable' };
    this.d.scrap -= cost;
    p.ops++;
    return { ok: true };
  }

  surgeryCost(action) {
    const p = this.d.pending;
    return (p.ops === 0 ? 0 : 40) + (action === 'ex' ? 50 : 0);
  }

  treasureTake(idx) {
    const p = this.d.pending;
    if (!p || p.type !== 'treasure' || p.taken) return false;
    const id = p.relics[idx];
    if (!id) return false;
    this.addRelic(id);
    this.d.scrap += p.scrap;
    p.taken = true;
    return true;
  }

  // ───────────────────────── results ─────────────────────────
  summary(result) {
    const S = this.d.stats;
    const score = this.d.floors * 10 + this.d.bossesDefeated.length * 150 + S.elites * 40 + (result === 'victory' ? 500 : 0) + Math.min(300, S.finishers * 15);
    return {
      result, act: this.d.act, floors: this.d.floors, bosses: this.d.bossesDefeated.slice(), elites: S.elites,
      deckSize: this.d.deck.length, relics: this.d.relics.slice(), mutations: this.d.mutations.slice(),
      archetype: this.archetypeKey(), longest: S.longest, maxHit: S.maxHit, damage: S.damage, combos: S.combos,
      perfect: S.perfect, cashouts: S.cashouts, finishers: S.finishers, score, seed: this.d.seed,
      ex: S.exActivations || 0, exRecipes: (this.d.exFound || []).slice(),
      decisions: this.d.bossDecisions.slice(), date: Date.now(), flags: { ...this.d.flags },
    };
  }
}

export { ENEMIES, PREPARED_PLANS, VOLATILE_OUTCOMES };
