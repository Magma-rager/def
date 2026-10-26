// Run state machine: map, nodes, rewards, shops, events, rest, surgery, bosses, mutations, saving.
// All run data lives in the plain object `this.d` so it serializes to localStorage verbatim.
import { RNG, seedFrom } from '../core/rng.js';
import { CARDS, STARTER_DECK, rewardPool, GRAFTS, ARCHETYPES } from '../data/cards.js';
import { RELICS, relicPool } from '../data/relics.js';
import { ENEMIES, FORMATIONS, ELITES, BOSSES } from '../data/enemies.js';
import { EVENTS, EVENT_MAP } from '../data/events.js';
import { MUTATIONS, MUTATION_IDS } from '../data/mutations.js';
import { ADAPTATIONS } from '../data/adaptations.js';
import { TRAIT_IDS } from '../data/traits.js';

export const PARTY_BASE = { V: 46, C: 34, S: 38 };
export const MAP_DEPTHS = 8; // depths 0..7, boss at depth 8
const SAVE_VERSION = 3;

const RARITY_PRICE = { common: 50, uncommon: 78, rare: 130 };
const RELIC_PRICE = { common: 135, uncommon: 175, rare: 225 };

export function emptyStats() {
  return {
    battles: 0, combos: 0, perfect: 0, cashouts: 0, forced: 0, longCombos: 0, churns: 0, guardGained: 0,
    guardAbsorbed: 0, relays: 0, crosses: 0, steps: 0, variantPlays: { A: 0, B: 0, EX: 0 }, momentumSpent: 0,
    flowGained: 0, reservePlays: 0, interferencePayoffs: 0, damage: 0, maxHit: 0, longest: 0, finishers: 0,
    damageTaken: 0, interference: 0, elites: 0, cardsPlayed: 0, bestComboDamage: 0,
  };
}

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
      party: Object.entries(PARTY_BASE).map(([id, hp]) => ({ id, hp, maxHp: hp })),
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
    };
    const run = new Run(d);
    for (const id of STARTER_DECK) run.addCard({ id });
    const brng = new RNG(seedFrom(s, 'bosses'));
    for (const act of [1, 2, 3]) d.bosses[act] = brng.pick(BOSSES[act]);
    run.generateMap(1);
    d.pending = { type: 'story', scene: 'intro', next: 'map' };
    return run;
  }

  static load(obj) {
    if (!obj || obj.version !== SAVE_VERSION) return null;
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

  addCard({ id, up = false, graft = null, variant = null, rankMod = 0 }) {
    const inst = { uid: `c${this.d.nextUid++}`, id, up, graft, rankMod, variant };
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
    return Math.max(1, Math.min(9, CARDS[inst.id].rank + (inst.rankMod || 0)));
  }
  effVariant(inst) {
    return inst.variant || CARDS[inst.id].variant;
  }

  roleCount(role) {
    return this.d.deck.filter((c) => CARDS[c.id].role === role).length;
  }

  canRemove(uid) {
    const inst = this.card(uid);
    if (!inst) return false;
    const role = CARDS[inst.id].role;
    const min = { open: 4, conv: 3, close: 2 };
    if (this.d.deck.length <= 10) return false;
    return this.roleCount(role) > min[role];
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

  archetypeLabel() {
    const top = this.dominantTags()[0];
    return top ? ARCHETYPES[top] : 'Balanced';
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
        this.d.pending = { type: 'surgery', nodeId: id, ops: 0, grafts: rng.sample(Object.keys(GRAFTS), 3), select: null };
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
    if (p.kind === 'boss' || node.type === 'boss') enemies = [this.d.bosses[act]];
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
    // party
    for (const r of outcome.party) {
      const m = this.member(r.id);
      m.hp = r.ko ? Math.max(1, Math.round(m.maxHp * 0.1)) : Math.max(1, Math.min(m.maxHp, r.hp));
    }
    // stats
    const S = this.d.stats, B = outcome.stats;
    S.battles++;
    for (const k of ['combos', 'perfect', 'cashouts', 'forced', 'longCombos', 'churns', 'guardGained', 'guardAbsorbed', 'relays', 'crosses', 'steps', 'momentumSpent', 'flowGained', 'reservePlays', 'interferencePayoffs', 'damage', 'finishers', 'damageTaken', 'interference', 'cardsPlayed']) S[k] += B[k] || 0;
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
    if (this.hasRelic('patch_kit')) this.healFlat(4);
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
    if (isBoss) relics = this.randomRelics(rng, 3, ['rare', 'uncommon']);
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
      const wantTag = tag || (i === 0 && tags.length && rng.chance(0.65) ? tags[0] : i === 1 && tags[1] && rng.chance(0.4) ? tags[1] : null);
      if (wantTag) {
        const t = cands.filter((c) => c.tags.includes(wantTag));
        if (t.length) cands = t;
      }
      if (!cands.length) cands = pool.filter((c) => !out.some((o) => o.id === c.id));
      const pick = rng.pick(cands);
      out.push({ id: pick.id, up: false, graft: grafted ? rng.pick(Object.keys(GRAFTS)) : null });
    }
    return out;
  }

  randomRelics(rng, n, rarities = null) {
    let pool = relicPool(this.d.relics);
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
    const avail = MUTATION_IDS.filter((m) => !this.d.mutations.includes(m));
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
    if (id === 'glass_cannon') for (const m of this.d.party) { m.maxHp = Math.round(m.maxHp * 0.85); m.hp = Math.min(m.hp, m.maxHp); }
    p.taken = id;
    const dec = this.d.bossDecisions[this.d.bossDecisions.length - 1];
    if (dec) dec.mutation = id;
    this.d.pending = { type: 'story', scene: `boss_win_act${this.d.act}`, next: 'nextAct' };
    return true;
  }

  advanceAct() {
    this.d.act++;
    for (const m of this.d.party) m.hp = Math.min(m.maxHp, m.hp + Math.round((m.maxHp - m.hp) * 0.75));
    this.generateMap(this.d.act);
    this.d.pending = { type: 'story', scene: `act${this.d.act}_intro`, next: 'map' };
  }

  // ───────────────────────── boss preparation ─────────────────────────
  analyzeProfile() {
    const S = this.d.stats;
    const b = Math.max(1, S.battles);
    const combos = Math.max(1, S.combos);
    const out = [];
    const add = (arch, score, evidence) => { if (score >= 1) out.push({ arch, score, evidence }); };
    if (S.combos >= 8) {
      add('ladder', S.longCombos >= 4 ? (S.longCombos / combos) / 0.3 : 0, `${S.longCombos} of ${S.combos} combos ran 5+ cards`);
      add('cashout', S.cashouts >= 5 ? (S.cashouts / combos) / 0.4 : 0, `${S.cashouts} of ${S.combos} combos ended in a Cash Out`);
      add('relay', S.relays >= 15 ? (S.relays / combos) / 1.4 : 0, `${S.relays} Relays across ${S.combos} combos`);
    }
    add('guard', S.guardAbsorbed >= 50 ? (S.guardGained / b) / 35 : 0, `${S.guardGained} Guard raised, ${S.guardAbsorbed} damage absorbed`);
    add('churn', S.churns >= 12 ? (S.churns / b) / 4 : 0, `${S.churns} Churns over ${S.battles} battles`);
    const ab = S.variantPlays.A + S.variantPlays.B;
    if (ab >= 30) {
      const dom = S.variantPlays.A >= S.variantPlays.B ? 'A' : 'B';
      const share = S.variantPlays[dom] / ab;
      add(`variant${dom}`, share / 0.68, `${Math.round(share * 100)}% of suited cards played were ${dom}`);
    }
    add('momentum', S.momentumSpent >= 25 ? (S.momentumSpent / b) / 6 : 0, `${S.momentumSpent} Momentum spent`);
    add('flow', S.flowGained >= 5 ? (S.flowGained / b) / 1.2 : 0, `${S.flowGained.toFixed(1)}s of bonus Flow gained`);
    add('reserve', S.reservePlays >= 6 ? (S.reservePlays / b) / 1.5 : 0, `${S.reservePlays} cards played from Reserve`);
    add('interference', S.interferencePayoffs >= 8 ? (S.interferencePayoffs / b) / 2 : 0, `${S.interferencePayoffs} interference-payoff cards played`);
    return out.sort((a, b2) => b2.score - a.score);
  }

  bossAnalysis() {
    const profile = this.analyzeProfile();
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
    let text = '';
    if (kind === 'prepared') {
      const plan = PREPARED_PLANS.find((x) => x.id === planId);
      if (!plan) return null;
      prep = { ...plan.prep };
      if (plan.healPct) this.healPct(plan.healPct);
      text = plan.name;
    } else {
      const v = VOLATILE_OUTCOMES.find((x) => x.id === p.volatileId);
      prep = { ...v.prep };
      if (v.partyDamagePct) for (const m of this.d.party) m.hp = Math.max(1, m.hp - Math.round(m.maxHp * v.partyDamagePct));
      if (v.rareCard) {
        const pick = this.rng('volcard', this.d.act).pick(rewardPool().filter((c) => c.rarity === 'rare'));
        this.addCard({ id: pick.id });
        text = `${v.name} (gained ${CARDS[pick.id].name})`;
      } else text = v.name;
    }
    p.choice = { kind, planId: planId || p.volatileId, text };
    p.prep = prep;
    this.d.bossDecisions.push({ act: this.d.act, boss: p.bossId, prep: kind, plan: text, adaptation: p.adaptation && !prep.noAdapt ? p.adaptation.name : null, evidence: p.profile[0] ? p.profile[0].evidence : null, result: null });
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

  eventChoose(idx) {
    const p = this.d.pending;
    if (!p || p.type !== 'event' || (p.result && !p.result.repeat)) return null;
    const ev = EVENT_MAP[p.eventId];
    const ch = ev.choices[idx];
    if (!ch) return null;
    const api = this.api(this.rng('evt', p.nodeId, (p.tries || 0)));
    if (ch.req) { const r = ch.req(api); if (r !== true) return { error: r }; }
    p.tries = (p.tries || 0) + 1;
    const res = ch.run(api) || { text: '' };
    p.result = { text: res.text, repeat: !!res.repeat, choice: idx, offer: res.offer || null };
    if (res.select) p.select = res.select;
    return p.result;
  }

  canApplySelect(action, inst) {
    const d = CARDS[inst.id];
    switch (action) {
      case 'remove': return this.canRemove(inst.uid);
      case 'upgrade': return !inst.up;
      case 'transform': return true;
      case 'duplicate': return true;
      case 'recut': return this.effVariant(inst) !== 'EX';
      case 'ex': return this.effVariant(inst) !== 'EX';
      case 'rankup': return this.effRank(inst) < 9;
      case 'rankdown': return this.effRank(inst) > 1;
      default:
        if (action.startsWith('graft:')) return inst.graft !== action.slice(6);
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
        const role = CARDS[inst.id].role;
        const cands = rewardPool().filter((c) => c.role === role && c.id !== inst.id);
        inst.id = rng.pick(cands).id;
        inst.variant = null; inst.rankMod = 0; inst.up = false;
        break;
      }
      case 'duplicate': this.addCard({ ...inst, variant: rng.pick(['A', 'B', 'EX']) }); break;
      case 'recut': inst.variant = this.effVariant(inst) === 'A' ? 'B' : 'A'; break;
      case 'ex': inst.variant = 'EX'; break;
      case 'rankup': inst.rankMod = (inst.rankMod || 0) + 1; break;
      case 'rankdown': inst.rankMod = (inst.rankMod || 0) - 1; break;
      default:
        if (action.startsWith('graft:')) inst.graft = action.slice(6);
        else return false;
    }
    const p = this.d.pending;
    if (p && p.select) p.select = null;
    return true;
  }

  cancelSelect() {
    const p = this.d.pending;
    if (p && p.select) p.select = null;
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
    const name = (id) => CARDS[id].name;
    return {
      rng,
      get scrap() { return run.d.scrap; },
      gain: (n) => { run.d.scrap += n; },
      spend: (n) => { run.d.scrap = Math.max(0, run.d.scrap - n); },
      hp: (id) => run.member(id).hp,
      hurt: (id, n) => { const m = run.member(id); m.hp = Math.max(1, m.hp - n); },
      hurtAll: (n) => run.d.party.forEach((m) => (m.hp = Math.max(1, m.hp - n))),
      healPct: (p) => run.healPct(p),
      healFlat: (n) => run.healFlat(n),
      gainMaxHp: (id, n) => { const m = run.member(id); m.maxHp += n; m.hp += n; },
      loseMaxHpRandom: (n) => { const m = rng.pick(run.d.party); m.maxHp = Math.max(10, m.maxHp - n); m.hp = Math.min(m.hp, m.maxHp); return { V: 'Hessa', C: 'Corvin', S: 'Pin' }[m.id]; },
      loseMaxHpPctAll: (p) => run.d.party.forEach((m) => { m.maxHp = Math.max(10, Math.round(m.maxHp * (1 - p))); m.hp = Math.min(m.hp, m.maxHp); }),
      upgradeRandom: (n) => {
        const c = rng.sample(run.d.deck.filter((x) => !x.up), n);
        c.forEach((x) => (x.up = true));
        return c.map((x) => name(x.id));
      },
      addRandomCards: (n, rarity) => {
        const pool = rewardPool().filter((c) => !rarity || c.rarity === rarity);
        const out = [];
        for (let i = 0; i < n; i++) { const c = rng.pick(pool); run.addCard({ id: c.id }); out.push(c.name); }
        return out;
      },
      offerCards: (n, minRarity, tag) => ({ text: 'Choose a card.', offer: run.cardChoices(rng, n, { minRarity, tag }) }),
      offerGraft: () => {
        const g = rng.pick(Object.keys(GRAFTS));
        return { text: `The Oracle prepares a ${GRAFTS[g].name} graft.`, select: { title: `Graft ${GRAFTS[g].name}`, filter: 'graftable', action: `graft:${g}` } };
      },
      addRandomRelic: () => {
        const r = run.randomRelics(rng, 1)[0];
        if (!r) { run.d.scrap += 50; return '50 Scrap (no relics left)'; }
        run.addRelic(r);
        return RELICS[r].name;
      },
      addRelic: (id) => run.addRelic(id),
      hasRelic: (id) => run.hasRelic(id),
      tradeableRelics: () => run.d.relics.filter((r) => RELICS[r].rarity !== 'starter').length,
      loseRandomRelic: () => {
        const c = run.d.relics.filter((r) => RELICS[r].rarity !== 'starter');
        const r = rng.pick(c);
        run.d.relics = run.d.relics.filter((x) => x !== r);
        return RELICS[r].name;
      },
      mutateRandomRank: () => {
        const c = rng.pick(run.d.deck);
        const delta = rng.chance(0.5) ? 1 : -1;
        const before = run.effRank(c);
        c.rankMod = (c.rankMod || 0) + delta;
        return `${name(c.id)} is now rank ${run.effRank(c)} (was ${before}).`;
      },
      flag: (f) => { run.d.flags[f] = true; },
      setNextBattleMod: (m) => { run.d.nextBattleMod = m; },
    };
  }

  healPct(p) {
    for (const m of this.d.party) m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * p));
  }
  healFlat(n) {
    for (const m of this.d.party) m.hp = Math.min(m.maxHp, m.hp + n);
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
      grafts: rng.sample(Object.keys(GRAFTS), 3),
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
  restChoose(option) {
    const p = this.d.pending;
    if (!p || p.type !== 'rest' || p.done) return null;
    if (option === 'recover') { this.healPct(p.quiet ? 0.45 : 0.3); p.done = 'recover'; return { text: 'The party patches up by the furnace.' }; }
    if (option === 'fortify') { this.d.prepToken = { startGuard: 12, startMomentum: 2 }; p.done = 'fortify'; return { text: 'Battle plan drafted. Your next Elite or Boss fight starts with 12 Guard and 2 Momentum.' }; }
    if (option === 'overdrive') {
      const up = this.api(this.rng('od', p.nodeId)).upgradeRandom(2);
      for (const m of this.d.party) m.hp = Math.max(1, m.hp - Math.round(m.hp * 0.15));
      p.done = 'overdrive';
      return { text: `Overdrive! ${up.join(' and ') || 'No cards'} upgraded. Everyone pays for it in HP.` };
    }
    if (option === 'tune') { p.select = { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade', then: 'tune' }; return { select: true }; }
    return null;
  }

  surgeryApply(uid, action) {
    const p = this.d.pending;
    if (!p || p.type !== 'surgery') return { ok: false };
    const cost = (p.ops === 0 ? 0 : 40) + (action === 'ex' ? 50 : 0);
    if (p.ops >= 2) return { ok: false, text: 'The surgeon is out of thread' };
    if (this.d.scrap < cost) return { ok: false, text: `Need ${cost} Scrap` };
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
      archetype: this.archetypeLabel(), longest: S.longest, maxHit: S.maxHit, damage: S.damage, combos: S.combos,
      perfect: S.perfect, cashouts: S.cashouts, finishers: S.finishers, score, seed: this.d.seed,
      decisions: this.d.bossDecisions.slice(), date: Date.now(), flags: { ...this.d.flags },
    };
  }
}

export const PREPARED_PLANS = [
  { id: 'brace', name: 'Brace Protocol', text: 'Start with 15 Guard and +1 Churn charge.', prep: { startGuard: 15, churnBonus: 1 } },
  { id: 'scout', name: 'Scout Report', text: 'Adaptation break requirement halved. The boss acts 4s later at the start.', prep: { scout: true, bossDelay: 4 } },
  { id: 'tuned', name: 'Tuned Opening', text: 'Heal 15% now and start with 4 Momentum.', prep: { startMomentum: 4 }, healPct: 0.15 },
];

export const VOLATILE_OUTCOMES = [
  { id: 'overcharged', name: 'Overcharged', text: 'Your damage +25%, but the boss has +20% HP.', prep: { dmgMult: 1.25, bossHpMult: 1.2 } },
  { id: 'redline', name: 'Redline', text: 'Start with 8 Momentum, but every ally takes 10% max HP damage now.', prep: { startMomentum: 8 }, partyDamagePct: 0.1 },
  { id: 'wildcard', name: 'Wildcard', text: 'Gain a random rare card permanently, but the boss starts with 30 Guard.', prep: { bossGuard: 30 }, rareCard: true },
  { id: 'scramble', name: 'Signal Scramble', text: 'Boss adaptation is removed, but the boss acts 15% faster.', prep: { noAdapt: true, bossHaste: 1.15 } },
];

export { ENEMIES };
