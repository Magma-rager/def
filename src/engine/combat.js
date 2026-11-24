// SIGNAL//BREAK — authoritative Relay combat engine.
// Pure logic: no DOM, no rendering. The view reads state and drains `events` for presentation.
// All timing uses this.t (combat seconds), advanced only by update(); pausing = not calling update().
import { RECIPES } from '../data/recipes.js';
import { CARDS, cardValue, HERO_ANIM, isOffensive, gaugedRank } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { RNG } from '../core/rng.js';

// Timing values marked "prototype" were set by the beta-feedback patch (players had too little time
// to read a new hand and build a combo, and enemies acted too often). They are starting points for
// human playtesting, not settled balance.
export const RULES = {
  HAND: 6,
  FLOW_INITIAL: 5.0, // prototype (was 3.0)
  FLOW_READ_GRACE: 1.2, // prototype: the decision window holds this long after a chain's first card has executed
  // Phase 5 scheduling (docs/COMBAT_SPEC.md §7, §9, §13; prototype values, §21). The decision window
  // also holds for as long as any command is executing (replacing 0.2.2-0.2.4's fixed 0.7s card hold).
  QUEUE_AHEAD: 3, // commands that may wait behind the one executing
  ACTION_TIME: 0.6, // seconds a card (or support) command executes
  RELAY_TIME: 0.5, // seconds the Relay hand-off executes
  // when, after its start, a command's effects resolve (matched to the hero animations' impact frames)
  RESOLVE_AT: { melee: 0.27, cast: 0.38, shoot: 0.25, guard: 0.15, buff: 0.2, counter: 0.11, relay: 0.25 },
  RECOVER_SEGMENT: 1.5, // a hero's Recovery after its segment: this + RECOVER_PER_CARD per card it played
  RECOVER_PER_CARD: 0.3,
  RECOVER_SUPPORT: 2.0, // Recovery after a support action
  RELAY_MOMENTUM: 1, // Momentum a Relay gives when it executes (none under the Relay Jammer adaptation)
  RELAY_FIRST_BONUS: 0.1, // the incoming hero's first card: +10% damage per Relay so far in the chain
  RELAY_HOLD: 1.2, // the decision window holds this long after a Relay
  // Phase 6 (docs/AUDIT.md, Relay accessibility): after the incoming hero's first card has executed the
  // decision window holds this long, as it does after a chain's first card — the player reads which of
  // the new hero's artes is now within reach. At most twice per chain (two Relays).
  SEGMENT_READ_GRACE: 1.2,
  RELAY_NEEDS_ARTE: false, // open design decision A (spec §25): false = a Relay may follow any card
  TACTICAL_ATB: 0.25, // Tactical timing (optional setting): enemy ATB speed while the player decides
  FLOW_REFUND: 1.0, // prototype (was 0.18, then 0.8): per valid card
  FLOW_REFUND_MAX: 5.0, // prototype (was 1.2): per combo
  FLOW_ABS_MAX: 14, // prototype (was 6.2): longest combo, counted from the opener, not counting the grace
  FLOW_BAR_SECONDS: 8, // the Flow bar's full width
  EX_COMBOS: true, // Phase 7: EX Combo recipes on. A measurement switch only (tools/simulate.mjs SB_EX=off); no setting exposes it
  QUICK_CASH_LEFT: 2.5, // prototype (was 1.5): Flow left for a Quick Cash Out
  MOMENTUM_COST: 3,
  FLOW_SPEND: 1.5, // prototype (was 0.6)
  GUARD_SPEND: 8,
  LOCK_DURATION: 3.0,
  SCRAMBLE_DURATION: 5.0,
  RESERVE: 2,
  CHURN_MAX: 3,
  CHURN_REGEN: 7,
  MOMENTUM_MAX: 10,
  STUMBLE_FLOW: 0.4,
  MAX_STUMBLES: 3,
  CASHOUT_MIN: 2,
  RECOVER: { perfect: 1.0, cashout: 0.8, forced: 1.2 }, // prototype (was 0.45/0.3/0.9): a breather; enemies wait too
  ENEMY_PACE: { 1: 0.7, 2: 0.82, 3: 0.9 }, // prototype: enemy ATB speed by act (was 1 everywhere)
  ENEMY_SPACING: 1.2, // prototype: at least this many seconds between two enemy actions
  // shared party HP and individual Defense (docs/COMBAT_SPEC.md §4, §15)
  DEFENSE: { V: 0.3, S: 0.15, C: 0 }, // prototype: share of each enemy hit the hero shrugs off
  COVER_SECONDS: 4, // prototype: Hessa's Guard cards make her take single-target hits aimed at the others
  SWITCH_THRESHOLD: 0.25, // Dead Man's Switch fires the first time party HP falls below this share
  BRACED_BONUS: 0.2, // prototype: Braced adds this much Defense to one hero
  DEFENSE_CAP: 0.6,
  GUARD_DECAY_DELAY: 2.0,
  GUARD_DECAY_RATE: 1.0,
  GUARD_CAP: 80,
  FINISHER_HOLD: 0.7,
};

// Illegal taps that cost a Stumble during a combo (docs/COMBAT_SPEC.md §8.4).
const SEQ_REASONS = new Set(['rank', 'owner', 'needbasic', 'momentum']);

export const PARTY_DEFS = {
  V: { name: 'Hessa', role: 'Vanguard' },
  C: { name: 'Corvin', role: 'Channeler' },
  S: { name: 'Pin', role: 'Striker' },
};

// Offensive continuation rule (pure, exported for UI hints and tests; docs/COMBAT_SPEC.md §5.2-5.3).
// Ranks strictly ascend within a combo; skipping ranks is legal; suits never block a card. They are a
// bonus layer: a Step is exactly +1 rank, a Cross is a suit different from the combo's current suit
// (EX differs from A and B). Both can apply to one card. With Wild Hinge a Cross also counts as a Step.
export function seqCheck(curRank, curVar, rank, variant, crossIsStep = false) {
  if (rank <= curRank) return { ok: false, reason: 'rank' };
  const cross = !!curVar && variant !== curVar;
  const step = rank === curRank + 1 || (crossIsStep && cross);
  return { ok: true, step, cross, kind: step ? 'step' : cross ? 'cross' : 'climb' };
}

export class Combat {
  constructor(opts) {
    this.opts = opts;
    this.rng = new RNG(opts.seed || 1);
    this.relics = new Set(opts.relics || []);
    this.mutations = new Set(opts.mutations || []);
    this.trait = opts.trait || null;
    this.kind = opts.kind || 'normal';
    this.act = opts.act || 1;
    this.prep = opts.prep || {};
    this.tutorial = !!opts.tutorial;
    this.profileArch = opts.profileArch || null;
    this.t = 0;
    this.hold = 0;
    this.lastEnemyActT = -10;
    this.phase = 'PRE';
    this.combo = null;
    this.events = [];
    this.history = [];
    this.result = null;
    this.scrapEarned = 0;
    this.dividendScrap = 0;
    this.uidCounter = 0;

    // ── cards ──
    this.cards = new Map();
    for (const inst of opts.deck) this.cards.set(inst.uid, { ...inst });
    this.draw = this.rng.shuffle([...this.cards.keys()]);
    this.hand = new Array(RULES.HAND).fill(null);
    this.reserve = [];
    this.discard = [];
    this.exhaust = [];
    this.locks = {}; // uid -> {until, dur, source}
    this.temp = {}; // uid -> {until, flip, rankDelta, source}
    this.jams = {}; // slot -> {until, source}
    this.wild = new Set(); // WILD_SIGNAL temporary EX cards
    this.wasLocked = new Set(); // for Signal Thief
    this.reserveLatchUntil = 0;
    this.churnJamUntil = 0;
    // Commands (docs/COMBAT_SPEC.md §7.1, §11.3): a committed card waits in the queue with its Momentum
    // reserved until it executes or is cancelled. Phase 4 executes each command at once (playCard); the
    // queue zone, reservation and cancel exist so Phase 5 can run commands over time.
    this.queue = []; // waiting commands, in order (the executing one is this.executing)
    this.executing = null; // { cmd, start, resolveAt, endAt, resolved }
    this.reserved = 0;
    this.cmdSeq = 0;
    this.heldSlots = new Set(); // hand slots whose card is queued or executing (they do not refill)
    this.tactical = !!opts.tactical; // optional Tactical timing (docs/COMBAT_SPEC.md §13.5)
    this.breatherUntil = 0;

    // ── party: three heroes, one HP pool (heroes never fall; defeat is the pool reaching 0) ──
    this.party = opts.party.map((p) => ({ id: p.id, name: PARTY_DEFS[p.id].name, def: RULES.DEFENSE[p.id] || 0, st: {} }));
    // each hero's own availability (docs/COMBAT_SPEC.md §7): Recovery after a segment or support
    this.heroes = Object.fromEntries(this.party.map((p) => [p.id, { recoverUntil: 0, recoverDur: 0, readyNoted: true }]));
    // callers that still pass per-hero HP (older tests and tools) get the sum
    this.maxHp = opts.maxHp !== undefined ? opts.maxHp : opts.party.reduce((a, p) => a + (p.maxHp || 0), 0);
    this.hp = Math.min(this.maxHp, opts.hp !== undefined ? opts.hp : opts.party.reduce((a, p) => a + Math.max(0, p.hp || 0), 0));
    this.coverUntil = 0;
    this.switchUsed = false;
    // the hero who performs neutral basic attacks and starts the next combo (Phase 4 hero selector)
    this.selected = opts.leader && PARTY_DEFS[opts.leader] ? opts.leader : 'V';
    this.lastHitHero = null;
    this.guard = 0;
    this.lastGuardT = -10;
    this.guardHoldUntil = 0;
    this.counter = 0;
    this.momentum = 0;
    this.churn = { charges: this.churnMax(), regen: 0, freeUsed: false };
    this.citation = null; // Protocol Auditor penalty

    // ── enemies ──
    this.enemies = [];
    const hpMult = opts.hpMult || 1;
    const dmgMult = opts.dmgMult || 1;
    this.hpMult = hpMult;
    this.dmgMultBase = dmgMult;
    for (const id of opts.enemies) this.spawnEnemy(id, { hpMult, dmgMult });
    for (const e of [...this.enemies]) {
      const def = ENEMIES[e.id];
      if (def.startWith) for (const sid of def.startWith) this.spawnEnemy(sid, { hpMult, dmgMult });
    }
    this.target = this.enemies[0] ? this.enemies[0].uid : null;

    // ── adaptation (boss only) ──
    this.adapt = opts.adaptation ? { ...opts.adaptation, progress: 0, broken: false } : null;
    if (this.adapt && this.prep.scout) this.adapt.need = Math.max(1, Math.ceil(this.adapt.need / 2));

    // ── stats ──
    this.stats = {
      techniques: 0,
      damage: 0, maxHit: 0, combos: 0, perfect: 0, cashouts: 0, forced: 0, longest: 0, churns: 0, stashes: 0,
      reservePlays: 0, relays: 0, crosses: 0, steps: 0, guardGained: 0, guardAbsorbed: 0, interference: 0,
      variantPlays: { A: 0, B: 0, EX: 0 }, cardsPlayed: 0, momentumSpent: 0, flowGained: 0, longCombos: 0,
      stumbles: 0, damageTaken: 0, interferencePayoffs: 0, bestComboDamage: 0, finishers: 0,
      basics: 0, artes: 0, supports: 0, momentumGained: 0, rejected: 0, byHero: { V: 0, C: 0, S: 0 }, strandedChurns: 0,
      // Phase 5: commands, chains by number of heroes, time by player state, hero Recovery
      commands: 0, cancelled: 0, chainHeroes: { 1: 0, 2: 0, 3: 0 }, chainCards: 0, chainArtes: 0, relayMomentum: 0,
      time: { decide: 0, execute: 0, grace: 0, breather: 0, idle: 0, wait: 0 }, recoverTime: 0, allRecovering: 0, queuePeak: 0,
      // evidence for the two open design decisions (docs/COMBAT_SPEC.md §26): Relays from a segment
      // without an arte (A), and queued attacks whose target changed between commit and execution (B)
      relaysNoArte: 0, relayMomentumNoArte: 0, queuedAttacks: 0, targetChangedByPlayer: 0, targetChangedByDeath: 0,
      // Phase 7 EX Combos: activations (a recipe triggering in a chain, any number of times per battle),
      // commands that completed two or more recipes, and what the EX effects actually gave
      exActivations: 0, exByRecipe: {}, exOverlaps: 0, exDamage: 0, exGuard: 0, exHeal: 0, exMomentum: 0, exFlow: 0, exChurn: 0,
      exChainCards: 0, exRelay: 0, exSupport: 0, exUnapplied: 0,
    };
    this.exFound = new Set(); // recipes that activated at least once in this battle
    this.exSeq = 0;

    // ── battle-start effects ──
    if (this.relics.has('pressure_gauge')) this.momentum += 2;
    if (this.trait === 'HOTWIRE') this.momentum += 3;
    if (this.prep.startMomentum) this.momentum += this.prep.startMomentum;
    this.momentum = Math.min(this.momentum, this.momentumMax());
    if (this.prep.startGuard) this.addGuard(this.prep.startGuard, true);
    if (this.prep.churnBonus) this.churn.charges += this.prep.churnBonus;
    if (this.relics.has('signal_flare')) for (const e of this.enemies) e.st.exposed = 6;
    if (this.relics.has('scrap_heart')) this.addGuard(10, true);
    for (const e of this.enemies) {
      if (e.tier !== 'boss') continue;
      if (this.prep.bossDelay) e.atb = -this.prep.bossDelay / e.actTime;
      if (this.prep.bossGuard) this.enemyGuard(e, this.prep.bossGuard);
      if (this.prep.bossHaste) e.flags.prepHaste = this.prep.bossHaste;
    }
    this.firstCombo = true;

    this.refill();
    this.emit({ type: 'start' });
  }

  // ───────────────────────── helpers ─────────────────────────
  emit(ev) {
    ev.t = this.t;
    this.events.push(ev);
  }
  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
  def(uid) {
    const inst = this.cards.get(uid);
    return inst ? CARDS[inst.id] : null;
  }
  categoryOf(uid) {
    const d = this.def(uid);
    return d ? d.category : null;
  }
  // Momentum not reserved by a committed command: what legality checks and spending may use.
  available() {
    return Math.max(0, this.momentum - this.reserved);
  }
  lastIsArte() {
    const c = this.combo;
    return !!(c && c.cards.length && c.cards[c.cards.length - 1].category === 'arte');
  }
  member(id) {
    return this.party.find((p) => p.id === id);
  }
  churnMax() {
    return RULES.CHURN_MAX + (this.relics.has('churn_gear') ? 1 : 0) + (this.mutations.has('grinder') ? 2 : 0);
  }
  guardCap() {
    return RULES.GUARD_CAP + (this.relics.has('scrap_heart') ? 20 : 0);
  }
  reserveMax() {
    return RULES.RESERVE + (this.relics.has('spare_pockets') ? 1 : 0) + (this.mutations.has('deep_pockets') ? 1 : 0);
  }
  momentumMax() {
    return RULES.MOMENTUM_MAX + (this.relics.has('pressure_gauge') ? 3 : 0) + (this.mutations.has('overpressure_valve') ? 4 : 0);
  }
  momentumCostFlow() {
    let c = this.relics.has('flywheel') ? 2 : RULES.MOMENTUM_COST;
    if (this.mutations.has('long_breath')) c -= 1;
    return Math.max(1, c);
  }
  flowSpendAmount() {
    return RULES.FLOW_SPEND + (this.mutations.has('long_breath') ? 0.5 : 0);
  }
  guardSpendAmount() {
    return this.relics.has('tower_plate') ? 12 : RULES.GUARD_SPEND;
  }
  adaptOn(id) {
    return this.adapt && !this.adapt.broken && this.adapt.id === id && this.enemies.some((e) => e.alive && e.tier === 'boss');
  }
  adaptProgress(n) {
    if (!this.adapt || this.adapt.broken) return;
    this.adapt.progress = Math.min(this.adapt.need, this.adapt.progress + n);
    if (this.adapt.progress >= this.adapt.need) {
      this.adapt.broken = true;
      this.emit({ type: 'banner', text: 'ADAPTATION BROKEN', sub: { k: '{adapt} disabled', p: { adapt: { adapt: this.adapt.id } } }, tone: 'good' });
    }
  }
  inHand(uid) {
    return this.hand.indexOf(uid);
  }
  zoneOf(uid) {
    if (this.hand.includes(uid)) return 'hand';
    if (this.reserve.includes(uid)) return 'reserve';
    if (this.draw.includes(uid)) return 'draw';
    if (this.discard.includes(uid)) return 'discard';
    if (this.exhaust.includes(uid)) return 'exhaust';
    if (this.queue.some((q) => q.uid === uid)) return 'queue';
    return null;
  }
  isLocked(uid) {
    const l = this.locks[uid];
    return !!(l && l.until > this.t);
  }
  lockLeft(uid) {
    const l = this.locks[uid];
    return l ? Math.max(0, l.until - this.t) : 0;
  }
  isScrambled(uid) {
    const m = this.temp[uid];
    return !!(m && m.until > this.t);
  }
  effRank(uid) {
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    if (!isOffensive(d)) return 0;
    let r = gaugedRank(d, inst.rankMod); // a re-gauged rank stays in its category (Phase 8)
    const m = this.temp[uid];
    if (m && m.until > this.t) r += m.rankDelta || 0;
    return Math.max(1, Math.min(9, r));
  }
  effVariant(uid) {
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    let v = inst.variant || d.variant;
    if (this.wild.has(uid)) v = 'EX';
    const m = this.temp[uid];
    if (m && m.until > this.t) {
      if (this.relics.has('glitch_jar')) return 'EX';
      if (m.flip && v !== 'EX') v = v === 'A' ? 'B' : 'A';
    }
    return v;
  }
  flowLeft() {
    return this.combo ? Math.max(0, this.combo.deadline - this.t) : 0;
  }
  // The grace after the opener shifts both the deadline and the cap, so it never costs combo length.
  flowCap() {
    return this.combo ? this.combo.start + this.combo.graceUsed + RULES.FLOW_ABS_MAX : 0;
  }
  // the decision window holds while a command executes and during the short holds after a chain's
  // first card and after each Relay (docs/COMBAT_SPEC.md §13.2)
  flowHeld() {
    return !!(this.combo && (this.executing || this.combo.graceUntil > this.t));
  }
  aliveEnemies() {
    return this.enemies.filter((e) => e.alive);
  }
  currentTarget() {
    let e = this.enemies.find((x) => x.uid === this.target && x.alive);
    if (!e) {
      e = this.aliveEnemies()[0] || null;
      this.target = e ? e.uid : null;
    }
    return e;
  }
  setTarget(uid) {
    const e = this.enemies.find((x) => x.uid === uid && x.alive);
    if (e) {
      this.target = uid;
      this.emit({ type: 'target', uid });
      return true;
    }
    return false;
  }
  disruptedCount() {
    return this.hand.filter((u) => u && (this.isLocked(u) || this.isScrambled(u))).length;
  }
  crossIsStep() {
    return this.relics.has('wild_hinge');
  }

  // ───────────────────────── heroes (docs/COMBAT_SPEC.md §7) ─────────────────────────
  // Each hero's state is derived from the authoritative facts (the executing command, Recovery
  // timers, the chain's active segment, queued commands), so two states can never disagree:
  //   ACTING      its command is executing now
  //   RECOVERING  after its segment or a support action, until heroes[id].recoverUntil
  //   ACTIVE      runs the chain's current segment (more of its attacks may wait in the queue)
  //   COMMITTED   has a queued support command, or is the destination of a queued Relay
  //   READY       free: may start a chain, receive a Relay or perform support
  heroState(id) {
    const x = this.executing;
    if (x && x.cmd.hero === id) return 'ACTING';
    const h = this.heroes[id];
    if (h && h.recoverUntil > this.t) return 'RECOVERING';
    if (this.combo && this.combo.hero === id) return 'ACTIVE';
    if ((x && x.cmd.to === id) || this.queue.some((q) => q.hero === id || q.to === id)) return 'COMMITTED';
    return 'READY';
  }
  heroReady(id) {
    return !!this.member(id) && this.heroState(id) === 'READY';
  }
  recoverLeft(id) {
    const h = this.heroes[id];
    return h ? Math.max(0, h.recoverUntil - this.t) : 0;
  }
  startRecovery(id, dur, why) {
    const h = this.heroes[id];
    if (!h) return;
    h.recoverUntil = Math.max(h.recoverUntil, this.t + dur);
    h.recoverDur = h.recoverUntil - this.t;
    h.readyNoted = false;
    this.emit({ type: 'recover', who: id, dur: h.recoverDur, why });
  }
  // Who starts the next chain: the selected hero if Ready, otherwise the first Ready hero in party
  // order (docs/COMBAT_SPEC.md §8.1). Null while every hero is busy.
  starter() {
    if (this.heroReady(this.selected)) return this.selected;
    const p = this.party.find((m) => this.heroReady(m.id));
    return p ? p.id : null;
  }
  // The hero who would perform a neutral card now: the (projected) chain's hero, or the starter.
  performer() {
    const P = this.proj();
    return P.open ? P.hero : this.starter() || this.selected;
  }
  // Who performs a support card: its owner, or (neutral) the selected hero when Ready, otherwise
  // the first Ready hero in party order. A hero that is attacking, acting, committed or recovering
  // cannot (docs/COMBAT_SPEC.md §10).
  supportPerformer(d) {
    if (d.owner) return this.heroReady(d.owner) ? d.owner : null;
    for (const id of [this.selected, ...this.party.map((p) => p.id)]) if (this.heroReady(id)) return id;
    return null;
  }
  busyText(id) {
    const st = this.heroState(id);
    if (st === 'RECOVERING') return { k: '{hero} recovering {s}s', p: { hero: { hero: id }, s: { n: this.recoverLeft(id), d: 1 } } };
    if (st === 'ACTIVE' || st === 'ACTING') return { k: '{hero} is attacking', p: { hero: { hero: id } } };
    return { k: '{hero} is busy', p: { hero: { hero: id } } };
  }
  // What the player is doing, for timing statistics and the enemy-action log (R1, R3).
  playerState() {
    if (this.phase === 'END') return 'end';
    if (this.phase === 'RECOVER') return 'breather';
    if (this.executing) return 'execute';
    if (this.phase === 'ACTIVE') return this.combo && this.combo.graceUntil > this.t ? 'grace' : 'decide';
    return this.party.some((p) => this.heroReady(p.id)) ? 'idle' : 'wait';
  }

  // ───────────────────────── projection ─────────────────────────
  // The chain as it will be once every started-but-unresolved and queued command has executed.
  // Legality of a new command is judged against this, so the player can queue Weak 1 → Medium 2 →
  // Strong 3 while Weak 1 is still executing. Momentum is never projected: costs need Momentum the
  // party already has and has not reserved (gains arrive only when their command resolves).
  baseProj() {
    const c = this.combo;
    if (!c) return { open: false, hero: null, rank: 0, variant: null, hasBasic: false, segArte: false, seg: 0, cards: 0, last: null, lastCmd: null, parts: new Set(), relays: 0, finish: false, ending: false };
    return {
      open: true, hero: c.hero, rank: c.rank, variant: c.variant, hasBasic: c.hasBasic, segArte: c.segArte, seg: c.segCards, cards: c.cards.length,
      last: c.cards.length ? c.cards[c.cards.length - 1].category : null, lastCmd: c.lastCmd, parts: new Set(c.owners), relays: c.relays, finish: false, ending: !!c.pendingEnd,
    };
  }
  applyProj(P, q) {
    if (q.type === 'card') {
      if (!P.open) { P.open = true; P.hero = q.hero; P.parts.add(q.hero); }
      P.rank = q.rank;
      P.variant = q.variant;
      if (q.category === 'basic') P.hasBasic = true; else P.segArte = true;
      P.seg++;
      P.cards++;
      P.last = q.category;
      P.lastCmd = 'card';
    } else if (q.type === 'relay') {
      P.hero = q.to;
      P.parts.add(q.to);
      P.rank = 0;
      P.variant = null;
      P.hasBasic = false;
      P.segArte = false;
      P.seg = 0;
      P.relays++;
      P.lastCmd = 'relay';
    } else if (q.type === 'finish') P.finish = true;
    else if (q.type === 'support' && q.tech && P.open) {
      P.rank = Math.max(0, P.rank - q.tech.rewind);
      if (q.tech.suit) P.variant = q.tech.suit;
    }
    return P;
  }
  proj() {
    const P = this.baseProj();
    const x = this.executing;
    if (x && !x.resolved) this.applyProj(P, x.cmd);
    for (const q of this.queue) this.applyProj(P, q);
    return P;
  }
  queueFull() {
    return this.queue.length >= RULES.QUEUE_AHEAD;
  }
  isChainCmd(cmd) {
    return cmd.type === 'card' || cmd.type === 'relay' || cmd.type === 'finish' || (cmd.type === 'support' && !!cmd.tech);
  }
  chainPending() {
    const x = this.executing;
    return !!((x && this.isChainCmd(x.cmd)) || this.queue.some((q) => this.isChainCmd(q)));
  }
  pendingFromReserve() {
    let n = this.queue.filter((q) => q.zone === 'reserve').length;
    const x = this.executing;
    if (x && !x.resolved && x.cmd.zone === 'reserve') n++;
    return n;
  }

  // ───────────────────────── legality ─────────────────────────
  // Single source of truth for "can this card be committed right now" (docs/COMBAT_SPEC.md §8.2,
  // §10). The hand, the Reserve, keyboard input, the bots and the tests all use it. Offensive cards
  // are judged against the projected chain (above); `rank`/`variant` are frozen into the command.
  check(uid) {
    const inst = this.cards.get(uid);
    if (!inst) return { ok: false, reason: 'missing', text: 'Missing card' };
    const d = CARDS[inst.id];
    const zone = this.hand.includes(uid) ? 'hand' : this.reserve.includes(uid) ? 'reserve' : null;
    if (!zone) return { ok: false, reason: 'zone', text: 'Not in hand' };
    if (this.phase === 'END') return { ok: false, reason: 'end', text: 'Battle over' };
    if (d.category === 'junk') return { ok: false, reason: 'junk', text: 'Glitch: swipe down' };
    if (zone === 'reserve' && this.reserveLatchUntil > this.t) return { ok: false, reason: 'latched', text: 'Reserve sealed' };
    if (this.isLocked(uid)) return { ok: false, reason: 'locked', text: { k: 'Locked {s}s', p: { s: { n: this.lockLeft(uid), d: 1 } } } };
    if (this.phase === 'RECOVER') return { ok: false, reason: 'recover', text: 'Breather' };
    if (this.queueFull()) return { ok: false, reason: 'queue', text: 'Queue full' };
    const cost = d.cost || 0;
    const short = () => ({ ok: false, reason: 'momentum', text: { k: 'Needs {n} Momentum', p: { n: cost } } });
    // support: independent of chains; costs its performer's action (Recovery afterwards)
    if (d.category === 'support') {
      // a technique (docs/COMBAT_SPEC.md §29) reshapes the active combo: there must be one, with a card
      // in its current part, and not already ending
      if (d.tech) {
        const P = this.proj();
        if (!P.open) return { ok: false, reason: 'nocombo', text: 'Needs a combo' };
        if (P.finish || P.ending) return { ok: false, reason: 'finishing', text: 'Combo ending' };
        if (P.seg < 1) return { ok: false, reason: 'needcard', text: 'Play a card first' };
      }
      const hero = this.supportPerformer(d);
      if (!hero) return { ok: false, reason: 'busy', text: d.owner ? this.busyText(d.owner) : 'Every hero is busy' };
      if (this.available() < cost) return short();
      return { ok: true, kind: 'support', zone, category: 'support', hero };
    }
    const rank = this.effRank(uid);
    const variant = this.effVariant(uid);
    const P = this.proj();
    if (P.finish || P.ending) return { ok: false, reason: 'finishing', text: 'Combo ending' };
    if (!P.open) {
      // a chain starts with a basic attack, performed by the starter
      if (d.category === 'arte') return { ok: false, reason: 'needbasic', text: 'Basic attack first' };
      const hero = this.starter();
      if (!hero) return { ok: false, reason: 'heroes', text: 'All heroes recovering' };
      return { ok: true, kind: 'open', zone, category: 'basic', hero, rank, variant, step: false, cross: false };
    }
    if (d.category === 'arte') {
      if (d.owner !== P.hero) return { ok: false, reason: 'owner', text: { k: '{hero} only', p: { hero: { hero: d.owner } } } };
      if (!P.hasBasic) return { ok: false, reason: 'needbasic', text: 'Basic attack first' };
    }
    const r = seqCheck(P.rank, P.variant, rank, variant, this.crossIsStep());
    if (!r.ok) return { ok: false, reason: 'rank', text: { k: 'Needs rank {n}+', p: { n: P.rank + 1 } } };
    if (this.available() < cost) return short();
    const first = P.seg === 0;
    return { ok: true, kind: first ? (P.relays ? 'relay' : 'open') : r.kind, step: !first && r.step, cross: !first && r.cross, zone, category: d.category, hero: P.hero, rank, variant };
  }

  // Ending a chain (projected): a Perfect needs the last card to be an arte; Cash Out needs 2+ cards
  // ending on a basic attack. Neither while a Relay is the last thing queued, or after a finish.
  finishable(mode, P = this.proj()) {
    if (!P.open || P.finish || P.ending || P.lastCmd === 'relay') return false;
    if (mode === 'perfect') return P.last === 'arte';
    return P.cards >= RULES.CASHOUT_MIN && P.last === 'basic';
  }
  canCashOut() {
    return this.phase === 'ACTIVE' && this.finishable('cashout');
  }
  canFinish() {
    return this.phase === 'ACTIVE' && this.finishable('perfect');
  }
  // A hand with nothing playable before a chain (for example only artes, which need a basic attack
  // first, or support the party cannot afford) must not strand the player: until something is
  // playable, Churn costs no charge (prototype, docs/COMBAT_SPEC.md §25). Judged on the cards and
  // Momentum alone — a hero recovering, a full queue or a command executing is a wait, not a
  // stranded hand, and never makes Churn free.
  stranded() {
    if (this.phase !== 'PRE' || this.combo) return false;
    const held = [...this.hand, ...this.reserve].filter(Boolean);
    if (!held.length || !this.hand.some((u) => u && !this.isLocked(u))) return false;
    return !held.some((u) => this.cardUsable(u));
  }
  // Whether a card could start or join something if every hero were free (cards and Momentum only).
  cardUsable(u) {
    const d = this.def(u);
    if (!d || d.category === 'junk' || this.isLocked(u)) return false;
    if (this.reserve.includes(u) && this.reserveLatchUntil > this.t) return false;
    if (d.category === 'basic') return true;
    if (d.category === 'support') return this.available() >= (d.cost || 0);
    return false; // an arte never starts a chain
  }
  // Whether the chain's hero still has an offensive card that is legal now.
  hasContinuation() {
    for (const u of [...this.hand, ...this.reserve]) {
      if (!u) continue;
      const d = this.def(u);
      if (d && isOffensive(d) && this.check(u).ok) return true;
    }
    return false;
  }
  // Whether a Relay could still happen in this chain: a hero who has not joined it yet (Ready now or
  // later — recovering and committed heroes become Ready within a few seconds).
  relayStillPossible() {
    const c = this.combo;
    if (!c) return false;
    return this.party.some((p) => !c.owners.includes(p.id));
  }

  // Relay eligibility (docs/COMBAT_SPEC.md §9), kept in one place so the rule can change without
  // touching the scheduler. Decision A is open: RULES.RELAY_NEEDS_ARTE (default false, the
  // specification's prototype) would require an arte in the outgoing segment.
  relayCheck(to) {
    if (this.phase === 'END') return { ok: false, reason: 'end', text: 'Battle over' };
    if (!this.member(to)) return { ok: false, reason: 'missing', text: 'Missing hero' };
    const P = this.proj();
    if (!P.open) return { ok: false, reason: 'nochain', text: 'No combo running' };
    if (P.finish || P.ending) return { ok: false, reason: 'finishing', text: 'Combo ending' };
    if (to === P.hero) return { ok: false, reason: 'same', text: { k: '{hero} is attacking', p: { hero: { hero: to } } } };
    if (P.parts.has(to)) return { ok: false, reason: 'used', text: { k: '{hero} already joined this combo', p: { hero: { hero: to } } } };
    if (P.seg < 1) return { ok: false, reason: 'setup', text: 'Play a card before the Relay' };
    if (RULES.RELAY_NEEDS_ARTE && !P.segArte) return { ok: false, reason: 'setup', text: 'Relay after an arte' };
    if (!this.heroReady(to)) return { ok: false, reason: 'busy', text: this.busyText(to) };
    if (this.queueFull()) return { ok: false, reason: 'queue', text: 'Queue full' };
    return { ok: true, from: P.hero, to };
  }

  // Hero buttons, a tap on a hero, Q/W/E. With no chain running: choose who starts the next one.
  // During a chain: request a Relay to that hero (docs/COMBAT_SPEC.md §20).
  selectHero(id) {
    if (!this.member(id) || this.phase === 'END') return { ok: false };
    const P = this.proj();
    if (P.open) {
      if (id === P.hero) return { ok: true, same: true };
      return this.commitRelay(id);
    }
    const st = this.heroState(id);
    if (st !== 'READY') {
      const text = this.busyText(id);
      this.emit({ type: 'reject', reason: 'hero', text });
      return { ok: false, text };
    }
    if (this.selected !== id) {
      this.selected = id;
      this.emit({ type: 'heroSelect', who: id });
    }
    return { ok: true };
  }

  // ───────────────────────── zones ─────────────────────────
  // The hand is six persistent slots filled from the top of the draw pile (this.draw[0]); a played
  // card's slot refills after the card resolves, other cards stay. When the draw pile is empty the
  // discard pile is shuffled in.
  nextCard() {
    return this.draw[0] || null;
  }
  drawTop(exclude) {
    if (!this.draw.length && this.discard.length) {
      const pile = this.rng.shuffle(this.discard.splice(0));
      // a card just Churned away is not drawn straight back
      const i = exclude ? pile.indexOf(exclude) : -1;
      if (i >= 0 && pile.length > 1) pile.push(pile.splice(i, 1)[0]);
      this.draw.push(...pile);
      this.emit({ type: 'reshuffle', n: pile.length });
    }
    return this.draw.length ? this.draw.shift() : null;
  }
  slotJammed(i) {
    const j = this.jams[i];
    return !!(j && j.until > this.t);
  }
  refill(exclude) {
    for (let i = 0; i < RULES.HAND; i++) {
      if (this.hand[i] !== null || this.slotJammed(i) || this.heldSlots.has(i)) continue;
      const uid = this.drawTop(exclude);
      if (!uid) continue;
      this.hand[i] = uid;
      if (this.trait === 'WILD_SIGNAL' && !this.wild.has(uid) && isOffensive(this.def(uid)) && this.rng.chance(0.25)) this.wild.add(uid);
      this.emit({ type: 'draw', uid, slot: i });
    }
  }
  // a jammed slot's card goes to the bottom of the draw pile
  tuck(i) {
    const uid = this.hand[i];
    if (!uid) return;
    this.hand[i] = null;
    this.draw.push(uid);
    this.emit({ type: 'tuck', uid, slot: i });
  }
  // Integrity: every card instance lives in exactly one zone (draw, hand, Reserve, queue, executing,
  // discard, exhaust); held slots match the commands whose cards came from them; reservations match
  // the queue; no queued command is illegal; resources are not negative.
  verifyZones() {
    const seen = new Map();
    const x = this.executing;
    const executing = x && !x.resolved && x.cmd.uid ? [x.cmd.uid] : [];
    const zones = { draw: this.draw, hand: this.hand.filter(Boolean), reserve: this.reserve, queue: this.queue.filter((q) => q.uid).map((q) => q.uid), executing, discard: this.discard, exhaust: this.exhaust };
    for (const [z, arr] of Object.entries(zones)) {
      for (const u of arr) {
        if (seen.has(u)) return { ok: false, error: `duplicate ${u} in ${seen.get(u)} and ${z}` };
        if (!this.cards.has(u)) return { ok: false, error: `unknown card ${u} in ${z}` };
        seen.set(u, z);
      }
    }
    for (const u of this.cards.keys()) if (!seen.has(u)) return { ok: false, error: `missing ${u}` };
    if (this.hand.length !== RULES.HAND) return { ok: false, error: 'hand size changed' };
    const held = new Set(this.queue.filter((q) => q.zone === 'hand').map((q) => q.slot));
    if (x && !x.resolved && x.cmd.zone === 'hand') held.add(x.cmd.slot);
    if (held.size !== this.heldSlots.size || [...held].some((s) => !this.heldSlots.has(s))) return { ok: false, error: `held slots ${[...this.heldSlots]} vs commands ${[...held]}` };
    for (const s of this.heldSlots) if (this.hand[s] !== null) return { ok: false, error: `held slot ${s} holds a card` };
    if (this.reserved !== this.queue.reduce((a, q) => a + q.cost, 0)) return { ok: false, error: 'reservations out of step with the queue' };
    if (this.momentum < 0 || this.reserved > this.momentum) return { ok: false, error: `Momentum ${this.momentum} reserved ${this.reserved}` };
    if (this.queue.length > RULES.QUEUE_AHEAD) return { ok: false, error: 'queue over capacity' };
    const P = this.baseProj();
    if (x && !x.resolved) this.applyProj(P, x.cmd);
    for (const q of this.queue) {
      if (!this.cmdValid(q, P)) return { ok: false, error: `illegal queued command ${q.type} ${q.uid || q.to || ''}` };
      this.applyProj(P, q);
    }
    if (this.combo && this.phase !== 'ACTIVE') return { ok: false, error: `chain open in phase ${this.phase}` };
    return { ok: true };
  }

  // A technique's effect for this instance (upgrades, played from Reserve): { rewind, suit }.
  techOf(uid, fromReserve) {
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const t = d.tech ? d.tech((k) => cardValue(d, inst.up, k), !!fromReserve) : {};
    return { rewind: Math.max(0, Math.floor(t.rewind || 0)), suit: t.suit || null };
  }
  // a technique in hand or Reserve that could be performed now (the combo should not auto-finish)
  techniqueAvailable() {
    return [...this.hand, ...this.reserve].some((u) => u && this.def(u).tech && this.check(u).ok);
  }

  // ───────────────────────── commands (docs/COMBAT_SPEC.md §7.1, §11.3, §16) ─────────────────────────
  // commit: validate, move the card from its slot (or Reserve) into the queue (its slot is held, not
  // refilled), reserve its cost. Execution starts when every earlier command has completed.
  // o.target: the hero a hero-targeted support (Braced) acts on.
  commit(uid, o = {}) {
    const chk = this.check(uid);
    if (!chk.ok) {
      this.stumble(uid, chk);
      return { ok: false, chk };
    }
    const d = this.def(uid);
    let slot = -1;
    if (chk.zone === 'reserve') this.reserve.splice(this.reserve.indexOf(uid), 1);
    else {
      slot = this.hand.indexOf(uid);
      this.hand[slot] = null;
      this.heldSlots.add(slot);
    }
    const cmd = {
      id: ++this.cmdSeq, type: d.category === 'support' ? 'support' : 'card', uid, zone: chk.zone, slot, cost: d.cost || 0, hero: chk.hero,
      category: d.category, rank: chk.rank || 0, variant: chk.variant || null, scrambled: this.isScrambled(uid), target: o.target && this.member(o.target) ? o.target : null, at: this.t,
      enemyAtCommit: this.target, waited: !!this.executing,
    };
    if (d.tech) cmd.tech = this.techOf(uid, chk.zone === 'reserve');
    if (cmd.type === 'card' && !this.combo) this.startCombo(chk.hero);
    this.reserved += cmd.cost;
    this.queue.push(cmd);
    this.emit({ type: 'commit', id: cmd.id, cmdType: cmd.type, uid, hero: cmd.hero, cost: cmd.cost });
    this.processQueue();
    this.checkEnd();
    return { ok: true, cmd, chk };
  }
  commitRelay(to) {
    const chk = this.relayCheck(to);
    if (!chk.ok) {
      this.emit({ type: 'reject', reason: chk.reason, text: chk.text });
      return { ok: false, text: chk.text, chk };
    }
    const cmd = { id: ++this.cmdSeq, type: 'relay', from: chk.from, to, hero: chk.from, cost: 0, at: this.t };
    this.queue.push(cmd);
    this.emit({ type: 'commit', id: cmd.id, cmdType: 'relay', hero: chk.from, to });
    this.processQueue();
    return { ok: true, cmd };
  }
  // FINISH (Perfect) or CASH OUT, queued behind the commands already committed; executes at once
  // when nothing is pending. The ending is decided from what has executed by then.
  commitFinish(mode) {
    const P = this.proj();
    if (!mode) mode = this.finishable('perfect', P) ? 'perfect' : 'cashout';
    if (!this.finishable(mode, P) || this.phase !== 'ACTIVE') {
      const text = this.phase !== 'ACTIVE' ? 'No combo running' : P.finish || P.ending ? 'Combo ending' : P.lastCmd === 'relay' ? 'Play a card after the Relay' : mode === 'perfect' ? 'Play an arte to finish' : P.last === 'arte' ? 'Play an arte to finish' : 'Needs 2+ cards';
      this.emit({ type: 'reject', reason: mode === 'perfect' ? 'finish' : 'cashout', text });
      return { ok: false, text };
    }
    if (this.queueFull()) {
      this.emit({ type: 'reject', reason: 'queue', text: 'Queue full' });
      return { ok: false, text: 'Queue full' };
    }
    const cmd = { id: ++this.cmdSeq, type: 'finish', mode, hero: P.hero, cost: 0, at: this.t };
    this.queue.push(cmd);
    this.emit({ type: 'commit', id: cmd.id, cmdType: 'finish', hero: P.hero, mode });
    this.processQueue();
    this.checkEnd();
    return { ok: true, cmd };
  }
  // Cancel a waiting command (the player taps it in the queue strip). A started command cannot be
  // cancelled. Later commands that depended on it are revalidated and dropped if now illegal.
  cancelCmd(ref, why = 'player') {
    const cmd = typeof ref === 'object' && ref ? ref : this.queue.find((q) => q.id === ref);
    const i = cmd ? this.queue.indexOf(cmd) : -1;
    if (i < 0) {
      if (why === 'player') this.emit({ type: 'reject', reason: 'started', text: 'Already executing' });
      return false;
    }
    this.queue.splice(i, 1);
    this.restoreCmd(cmd, why);
    this.revalidateQueue();
    this.abortEmptyChain();
    return true;
  }
  cancel(cmd) {
    return this.cancelCmd(cmd, 'player');
  }
  // the card goes back where it came from; the reservation is released; nothing else happens (no
  // effect, no Momentum, no refund)
  restoreCmd(cmd, why) {
    this.reserved -= cmd.cost;
    if (cmd.uid) {
      if (cmd.zone === 'hand') {
        this.heldSlots.delete(cmd.slot);
        if (this.hand[cmd.slot] === null) this.hand[cmd.slot] = cmd.uid;
        else this.discard.push(cmd.uid);
      } else if (this.reserve.length < this.reserveMax()) this.reserve.push(cmd.uid);
      else this.discard.push(cmd.uid);
    }
    this.stats.cancelled++;
    this.emit({ type: 'cancel', id: cmd.id, cmdType: cmd.type, uid: cmd.uid || null, to: cmd.to || null, why });
  }
  cancelAll(why = 'end') {
    for (const q of [...this.queue]) {
      this.queue.splice(this.queue.indexOf(q), 1);
      this.restoreCmd(q, why);
    }
  }
  cancelChainCmds(why) {
    for (const q of [...this.queue]) {
      if (!this.isChainCmd(q)) continue;
      this.queue.splice(this.queue.indexOf(q), 1);
      this.restoreCmd(q, why);
    }
  }
  // Is a queued command still legal on top of projection P (the executed chain plus the commands
  // before it)? Support stays valid (its performer is reserved for it).
  cmdValid(q, P) {
    if (q.type === 'support') return !q.tech || (P.open && !P.finish && !P.ending && P.seg >= 1);
    if (P.finish || P.ending) return false;
    if (q.type === 'finish') return this.finishable(q.mode, P);
    if (q.type === 'relay') {
      return P.open && P.seg >= 1 && q.to !== P.hero && !P.parts.has(q.to) && this.recoverLeft(q.to) <= 0 && (!RULES.RELAY_NEEDS_ARTE || P.segArte);
    }
    if (!P.open) return false;
    if (q.hero !== P.hero) return false;
    if (q.category === 'arte' && (!P.hasBasic || CARDS[this.cards.get(q.uid).id].owner !== P.hero)) return false;
    return q.rank > P.rank;
  }
  // walk the queue from what has executed; drop (and restore) every command that is no longer legal
  revalidateQueue() {
    const P = this.baseProj();
    const x = this.executing;
    if (x && !x.resolved) this.applyProj(P, x.cmd);
    for (const q of [...this.queue]) {
      if (this.cmdValid(q, P)) this.applyProj(P, q);
      else {
        this.queue.splice(this.queue.indexOf(q), 1);
        this.restoreCmd(q, 'invalid');
      }
    }
  }
  // a chain whose only commands were cancelled before anything executed never happened
  abortEmptyChain() {
    const c = this.combo;
    if (!c || c.cards.length || c.relays || this.chainPending()) return;
    this.combo = null;
    if (this.phase === 'ACTIVE') this.phase = 'PRE';
    if (c.stopwatch) this.firstCombo = true;
    this.emit({ type: 'comboAbort' });
  }
  // Runs the queue: resolve the executing command at its impact moment, complete it at its end,
  // then start the next waiting command (revalidated first). Called after every commit and every
  // combat step; commands never execute faster than their own duration.
  processQueue() {
    for (let guard = 0; guard < 64 && this.phase !== 'END'; guard++) {
      const x = this.executing;
      if (x) {
        if (!x.resolved && this.t >= x.resolveAt - 1e-9) {
          x.resolved = true;
          this.resolvingCmd = true;
          this.resolveCmd(x.cmd);
          this.resolvingCmd = false;
          if (this.phase === 'END') { this.executing = null; return; }
          if (this.queue.length) this.revalidateQueue(); // an effect may have changed the chain
          continue;
        }
        if (x.resolved && this.t >= x.endAt - 1e-9) {
          this.executing = null;
          this.completeCmd(x.cmd);
          if (this.phase === 'END') return;
          continue;
        }
        return;
      }
      if (!this.queue.length) return;
      this.revalidateQueue();
      if (!this.queue.length) { this.abortEmptyChain(); return; }
      this.startCmd(this.queue.shift());
    }
  }
  cmdAnim(cmd) {
    if (cmd.type === 'relay') return 'relay';
    if (cmd.type === 'finish') return 'finish';
    const d = this.def(cmd.uid);
    return d.owner ? d.anim : HERO_ANIM[cmd.hero];
  }
  // Execution start: the reservation becomes a spend, the hero acts (animation), effects wait for
  // the impact moment (RULES.RESOLVE_AT).
  startCmd(cmd) {
    this.reserved -= cmd.cost;
    if (cmd.cost > 0) {
      this.momentum -= cmd.cost;
      this.stats.momentumSpent += cmd.cost;
      if (this.adaptOn('momentum_drain')) this.adaptProgress(cmd.cost);
      this.emit({ type: 'momentum', delta: -cmd.cost, why: CARDS[this.cards.get(cmd.uid).id].name });
    }
    const anim = this.cmdAnim(cmd);
    const dur = cmd.type === 'finish' ? 0 : cmd.type === 'relay' ? RULES.RELAY_TIME : RULES.ACTION_TIME;
    const at = Math.min(dur, RULES.RESOLVE_AT[anim] !== undefined ? RULES.RESOLVE_AT[anim] : 0.3);
    this.executing = { cmd, start: this.t, resolveAt: this.t + at, endAt: this.t + dur, resolved: false, anim };
    this.stats.commands++;
    this.emit({ type: 'execStart', id: cmd.id, cmdType: cmd.type, hero: cmd.hero, uid: cmd.uid || null, to: cmd.to || null, dur, at });
    if (cmd.type === 'card' || cmd.type === 'support') {
      const d = this.def(cmd.uid);
      const c = this.combo;
      let seq = { kind: cmd.type === 'support' ? 'support' : 'open', step: false, cross: false };
      if (cmd.type === 'card' && c && c.segCards > 0) seq = seqCheck(c.rank, c.variant, cmd.rank, cmd.variant, this.crossIsStep());
      this.emit({
        type: 'act', who: cmd.hero, anim, card: d.name, id: d.id, category: d.category, rank: cmd.rank, variant: cmd.variant, cmd: cmd.id,
        kind: seq.kind, step: !!seq.step, cross: !!seq.cross, relay: !!(c && cmd.type === 'card' && c.segCards === 0 && c.relays), big: d.category === 'arte', all: false, fromReserve: cmd.zone === 'reserve',
      });
    } else if (cmd.type === 'relay') this.emit({ type: 'relayStart', from: cmd.from, to: cmd.to, cmd: cmd.id });
  }
  resolveCmd(cmd) {
    if (cmd.type === 'card') this.resolveCard(cmd);
    else if (cmd.type === 'support') this.resolveSupport(cmd);
    else if (cmd.type === 'relay') this.resolveRelay(cmd);
    else if (cmd.type === 'finish') this.resolveFinish(cmd);
  }
  // Execution complete: a support performer starts Recovery; the first card of a chain, each Relay
  // and the incoming hero's first card open a short hold of the decision window; a requested ending happens now; otherwise a
  // chain that cannot continue at all (no higher card, no hero left to Relay to) ends as a Perfect.
  completeCmd(cmd) {
    this.emit({ type: 'execEnd', id: cmd.id, cmdType: cmd.type, hero: cmd.hero });
    if (cmd.type === 'support') this.startRecovery(cmd.hero, RULES.RECOVER_SUPPORT, 'support');
    const c = this.combo;
    if (!c) return;
    if (cmd.type === 'card' && cmd.chainFirst) {
      c.graceUntil = Math.max(c.graceUntil, this.t + RULES.FLOW_READ_GRACE);
      this.emit({ type: 'flowHold', until: c.graceUntil });
    } else if (cmd.type === 'card' && cmd.relayFirst && RULES.SEGMENT_READ_GRACE > 0) {
      c.graceUntil = Math.max(c.graceUntil, this.t + RULES.SEGMENT_READ_GRACE);
      this.emit({ type: 'flowHold', until: c.graceUntil, segment: true });
    } else if (cmd.type === 'relay') {
      c.graceUntil = Math.max(c.graceUntil, this.t + RULES.RELAY_HOLD);
      this.emit({ type: 'flowHold', until: c.graceUntil, relay: true });
    }
    if (c.pendingEnd) {
      if (!this.chainPending()) {
        const type = c.pendingEnd;
        c.pendingEnd = null;
        this.finishCombo(type);
      }
      return;
    }
    this.autoFinish();
  }
  autoFinish() {
    const c = this.combo;
    if (!c || c.pendingEnd || this.chainPending() || this.phase !== 'ACTIVE') return;
    if (this.lastIsArte() && c.lastCmd === 'card' && !this.hasContinuation() && !this.relayStillPossible() && !this.techniqueAvailable()) this.finishCombo('perfect');
  }
  // End the chain now if nothing of it is executing, otherwise as soon as the executing command
  // completes. Unstarted chain commands are cancelled at once (docs/COMBAT_SPEC.md §12.3, §16).
  requestEnd(type) {
    const c = this.combo;
    if (!c || c.pendingEnd) return;
    this.cancelChainCmds('end');
    const x = this.executing;
    if (x && this.isChainCmd(x.cmd)) c.pendingEnd = type;
    else this.finishCombo(type);
  }

  // ───────────────────────── player actions ─────────────────────────
  // A tap on a card: commit it (it executes when its turn in the queue comes).
  playCard(uid, o) {
    const r = this.commit(uid, o);
    return r.ok ? r.chk : r.chk;
  }

  stumble(uid, chk) {
    this.stats.rejected++;
    this.emit({ type: 'reject', uid, reason: chk.reason, text: chk.text });
    if (this.phase !== 'ACTIVE' || !SEQ_REASONS.has(chk.reason) || !this.combo || this.combo.pendingEnd) return;
    // short of Momentum while commands are still executing is not a mistake: their gains are coming
    if (chk.reason === 'momentum' && (this.executing || this.queue.length)) return;
    const c = this.combo;
    c.stumbles++;
    this.stats.stumbles++;
    c.deadline = Math.max(this.t + 0.15, c.deadline - RULES.STUMBLE_FLOW);
    if (this.available() > 0) this.momentum -= 1;
    this.emit({ type: 'stumble', uid, n: c.stumbles });
    if (c.stumbles >= RULES.MAX_STUMBLES) this.requestEnd('forced');
  }

  startCombo(hero) {
    const extra = this.firstCombo && this.relics.has('stopwatch_gear') ? 1.0 : 0;
    this.firstCombo = false;
    this.combo = {
      start: this.t,
      deadline: Math.min(this.t + RULES.FLOW_INITIAL + extra, this.t + RULES.FLOW_ABS_MAX),
      graceUntil: 0, graceUsed: 0, hero, owner: hero, hasBasic: false, segArte: false, segCards: 0, artes: 0, lastCmd: null,
      refundUsed: 0, cards: [], rank: 0, variant: null, relays: 0, crosses: 0, steps: 0, climbs: 0,
      damage: 0, guardGained: 0, stumbles: 0, owners: [hero], suits: [], stepBonus: 0, refundBonus: 0,
      relayEcho: 0, relayEchoUsed: false, nextRelayEcho: 0, cashPct: 0, cashPerCard: 0, stored: [], pendingBonus: 0,
      harness: 0, relayBoost: 0, closeAsCashOut: false, churned: false, len: 0, pendingEnd: null, stopwatch: extra > 0,
      segments: [{ hero, cards: 0, basics: 0, artes: 0 }],
      // EX Combos (Phase 7): the chain's executed events in order, the recipes already triggered in it,
      // and the Cash Out payout dealt (docs/COMBAT_SPEC.md §28)
      log: [], ex: new Set(), payout: 0, quick: false,
    };
    this.phase = 'ACTIVE';
    this.emit({ type: 'comboStart', deadline: this.combo.deadline, hero });
  }

  naturalRefund(entryIndex, times = 1) {
    const c = this.combo;
    if (!c) return 0; // the card's own damage may already have ended the battle (e.g. a lethal Slipstream)
    let per = RULES.FLOW_REFUND * (this.relics.has('brass_metronome') ? 1.33 : 1) + c.refundBonus;
    if (this.mutations.has('ascendant_ladder') && c.cards[entryIndex] && c.cards[entryIndex].step) per += 0.06;
    if (this.adaptOn('long_chain') && entryIndex >= 4) per *= 0.5;
    const amt = Math.min(per * times, RULES.FLOW_REFUND_MAX - c.refundUsed);
    if (amt <= 0) return 0;
    c.refundUsed += amt;
    const before = c.deadline;
    c.deadline = Math.min(c.deadline + amt, this.flowCap());
    return c.deadline - before;
  }

  // `src` ('card' or 'buy') marks Flow the player gained during a chain (EX Combos read it); Flow from
  // EX effects passes none, so an EX reward can never complete another recipe
  addFlow(sec, src) {
    if (!this.combo) return 0;
    if (src && this.phase === 'ACTIVE') this.combo.log.push({ k: 'flow', src });
    if (this.adaptOn('flow_clamp')) sec *= 0.5;
    const before = this.combo.deadline;
    this.combo.deadline = Math.min(this.combo.deadline + sec, this.flowCap());
    const got = this.combo.deadline - before;
    this.stats.flowGained += got;
    if (got > 0) this.emit({ type: 'flow', amount: got });
    return got;
  }

  gainMomentum(n, why) {
    if (n <= 0) return;
    const max = this.momentumMax();
    const before = this.momentum;
    this.momentum = Math.min(max, this.momentum + n);
    const over = before + n - this.momentum;
    this.stats.momentumGained += this.momentum - before;
    if (this.momentum !== before) this.emit({ type: 'momentum', delta: this.momentum - before, why });
    if (over > 0 && this.relics.has('overflow_valve')) {
      const tgt = this.currentTarget();
      if (tgt) this.dealDamage(tgt, over * 3, { src: this.combo ? this.combo.owner : 'C', tag: 'overflow' });
    }
  }

  addGuard(n, silent) {
    n = Math.max(0, Math.min(Math.round(n), this.guardCap() - Math.floor(this.guard)));
    if (!n) return;
    this.guard += n;
    this.lastGuardT = this.t;
    this.stats.guardGained += n;
    if (this.combo) this.combo.guardGained += n;
    if (!silent) this.emit({ type: 'guard', amount: n });
  }

  // Hessa's Guard cards make her cover the party (docs/COMBAT_SPEC.md §4.5).
  coverCheck(d) {
    if (d.owner === 'V' && (d.tags || []).includes('guard')) {
      this.coverUntil = this.t + RULES.COVER_SECONDS;
      this.emit({ type: 'cover', until: this.coverUntil });
    }
  }

  // A basic attack or arte resolving (its impact moment) as the next card of the chain's active
  // segment. Rank and suit were frozen when the card was committed.
  resolveCard(cmd) {
    const uid = cmd.uid;
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const fromReserve = cmd.zone === 'reserve';
    const rank = cmd.rank;
    const variant = cmd.variant;
    const wasLocked = this.wasLocked.has(uid);
    this.wasLocked.delete(uid);
    const disruptedAtPlay = this.disruptedCount() > 0;
    const scrambledAtPlay = cmd.scrambled;
    if (cmd.slot >= 0) this.heldSlots.delete(cmd.slot);
    // decision B evidence: the target is the one selected now, at execution (spec §14)
    if (cmd.waited) {
      this.stats.queuedAttacks++;
      if (cmd.enemyAtCommit !== this.target) {
        const was = this.enemies.find((e) => e.uid === cmd.enemyAtCommit);
        if (was && !was.alive) this.stats.targetChangedByDeath++;
        else this.stats.targetChangedByPlayer++;
      }
    }

    if (!this.combo) this.startCombo(cmd.hero);
    const c = this.combo;
    const hero = c.hero;
    const segFirst = c.segCards === 0;
    const relayCard = segFirst && c.relays > 0; // the incoming hero's first card after a Relay
    const seq = segFirst ? { step: false, cross: false, kind: relayCard ? 'relay' : 'open' } : seqCheck(c.rank, c.variant, rank, variant, this.crossIsStep());
    const entry = {
      uid, id: d.id, name: d.name, owner: hero, cardOwner: d.owner, category: d.category, rank, variant, seg: c.segments.length - 1,
      kind: seq.kind, step: !!seq.step, cross: !!seq.cross, relay: relayCard, fromReserve, dmg: 0, spent: cmd.cost, wasLocked, index: c.cards.length,
      strength: d.category === 'basic' ? d.rank : 0, disrupted: !!(wasLocked || scrambledAtPlay), coverUp: false,
    };
    c.cards.push(entry);
    c.log.push({ k: 'card', i: entry.index });
    cmd.chainFirst = c.cards.length === 1;
    cmd.relayFirst = relayCard;
    c.len = c.cards.length;
    c.segCards++;
    c.lastCmd = 'card';
    const seg = c.segments[c.segments.length - 1];
    seg.cards++;
    if (!c.suits.includes(variant)) c.suits.push(variant);
    if (entry.step) { c.steps++; this.stats.steps++; }
    if (entry.cross) { c.crosses++; this.stats.crosses++; }
    if (!entry.step && !entry.cross && !segFirst) c.climbs++;
    if (d.category === 'basic') { c.hasBasic = true; seg.basics++; this.stats.basics++; } else { c.artes++; c.segArte = true; seg.artes++; this.stats.artes++; }
    this.stats.byHero[hero]++;
    this.stats.cardsPlayed++;
    this.stats.variantPlays[variant] = (this.stats.variantPlays[variant] || 0) + 1;
    if (fromReserve) { this.stats.reservePlays++; if (this.adaptOn('reserve_seal')) this.adaptProgress(1); }
    if (d.tags.includes('interference')) this.stats.interferencePayoffs++;
    if (this.adapt && !this.adapt.broken) {
      if (this.adapt.id === 'suit_filter_A' && variant !== 'A') this.adaptProgress(1);
      if (this.adapt.id === 'suit_filter_B' && variant !== 'B') this.adaptProgress(1);
    }

    // sequence state set before fx so effects may override it (rewind, suit change)
    c.rank = rank;
    c.variant = variant;
    if (!cmd.chainFirst) this.naturalRefund(entry.index);

    const pendingBonus = c.pendingBonus;
    c.pendingBonus = 0;
    c.nextRelayEcho = 0; // Hand Off's promise lapses unless its next command is a Relay

    // first-hit bonuses
    let bonus = pendingBonus;
    if (inst.graft === 'keen') bonus += 3;
    if (variant === 'EX' && this.relics.has('prism_lens')) bonus += 3;
    if (fromReserve && this.relics.has('spare_pockets')) bonus += 3;
    if (fromReserve && this.mutations.has('deep_pockets')) bonus += 4;
    if (entry.cross && this.mutations.has('duality_engine')) bonus += 4;
    if (scrambledAtPlay && this.relics.has('root_key')) bonus += 4;
    bonus += c.harness * 2; // Relay Harness: +2 for every Relay so far

    let mult = 1;
    if (fromReserve && inst.graft === 'cached') mult *= 1.5;
    if (wasLocked && this.mutations.has('signal_thief')) mult *= 1.5;
    if (relayCard) mult *= 1 + c.relayBoost; // +10% per Relay so far (docs/COMBAT_SPEC.md §9)

    const api = this.makeApi(entry, inst, d, { mult, bonus, echoing: false, disruptedAtPlay, ctx: c });
    d.fx(api);
    this.coverCheck(d);
    // Echoing graft (spec §18.2): the first card after a Relay Echoes itself at 30%
    if (relayCard && inst.graft === 'echoing' && this.combo === c) this.echo(entry.index, 0.3, entry);

    // gains on resolution (docs/COMBAT_SPEC.md §11.1): basic attacks by strength, Crosses, grafts
    if (d.category === 'basic') this.gainMomentum(d.gain || 0, 'Basic');
    if (entry.cross) this.gainMomentum(1 + (this.relics.has('twin_dials') ? 1 : 0) + (this.mutations.has('duality_engine') ? 1 : 0), 'Cross');
    if (inst.graft === 'spark') this.gainMomentum(1, 'Spark');
    if (inst.graft === 'quick') this.addFlow(0.5, 'card');
    if (inst.graft === 'plated') this.addGuard(3);
    if (fromReserve && this.mutations.has('deep_pockets')) this.gainMomentum(1, 'Reserve');
    if (d.category === 'basic' && this.relics.has('iron_filings')) this.addGuard(1);

    // step payoffs
    if (entry.step) {
      const sb = c.stepBonus + (this.relics.has('ladder_rungs') ? 3 : 0) + (this.mutations.has('ascendant_ladder') ? 3 : 0);
      const tgt = this.currentTarget();
      if (sb > 0 && tgt) this.dealDamage(tgt, sb, { src: hero, entry, tag: 'step' });
    }

    // card to discard (temp cards are deleted); its slot refills now that it has resolved
    if (d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);
    // EX Combos complete on the card that has just resolved — also when it ended the battle (the
    // activation is recorded, its effect is not applied after the end; docs/COMBAT_SPEC.md §28)
    entry.coverUp = this.coverActive();
    this.evalRecipes(c, { kind: 'card', entry });
    if (this.phase === 'END' || this.combo !== c) return; // fx may have ended the battle or the chain
    this.refill();
    // Clean Exit: the chain ends as a Cash Out once this card has finished executing
    if (d.category === 'arte' && c.closeAsCashOut) {
      this.payout(1);
      if (this.phase !== 'END') this.requestEnd('cashout');
      else this.evalRecipes(c, { kind: 'end', end: 'cashout' });
    }
  }

  // A support card resolving: not part of any chain (it neither starts, extends, ends nor pauses
  // one). Its performer goes into Recovery when the command completes (completeCmd).
  resolveSupport(cmd) {
    const uid = cmd.uid;
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const fromReserve = cmd.zone === 'reserve';
    const hero = cmd.hero;
    if (cmd.slot >= 0) this.heldSlots.delete(cmd.slot);
    const ctx = this.combo || { cards: [], len: 0, damage: 0, rank: 0, variant: null, owners: [hero], suits: [], stored: [], steps: 0, crosses: 0, relays: 0 };
    const entry = { uid, id: d.id, name: d.name, owner: hero, cardOwner: d.owner, category: 'support', rank: 0, variant: null, kind: 'support', step: false, cross: false, relay: false, fromReserve, dmg: 0, spent: cmd.cost, index: -1, target: cmd.target };
    this.stats.supports++;
    this.stats.byHero[hero]++;
    this.stats.cardsPlayed++;
    if (fromReserve) {
      this.stats.reservePlays++;
      if (this.adaptOn('reserve_seal')) this.adaptProgress(1);
      if (this.mutations.has('deep_pockets')) this.gainMomentum(1, 'Reserve');
    }
    let mult = 1;
    if (fromReserve && inst.graft === 'cached') mult *= 1.5;
    // a technique reshapes the active combo's current part: what projection promised when it was committed
    if (cmd.tech && this.combo && this.phase === 'ACTIVE') {
      const c = this.combo;
      const before = c.rank;
      c.rank = Math.max(0, c.rank - cmd.tech.rewind);
      if (cmd.tech.suit) c.variant = cmd.tech.suit;
      this.stats.techniques++;
      c.log.push({ k: 'tech', id: d.id, hero, attacker: c.hero, rewind: before - c.rank, suit: cmd.tech.suit });
      this.emit({ type: 'technique', id: d.id, hero, attacker: c.hero, rank: c.rank, rewind: before - c.rank, suit: cmd.tech.suit });
    }
    const api = this.makeApi(entry, inst, d, { mult, bonus: 0, echoing: false, ctx });
    const hp0 = this.hp, guard0 = Math.floor(this.guard), cover0 = this.coverActive();
    d.fx(api);
    this.coverCheck(d);
    if (inst.graft === 'spark') this.gainMomentum(1, 'Spark');
    if (inst.graft === 'quick') this.addFlow(0.5, 'card');
    if (inst.graft === 'plated') this.addGuard(3);
    // a support action executed while a chain runs is part of that chain's record (EX Combos): what it
    // actually did — healing, Guard, Cover — and whose combo it happened in; outside a chain it is not
    if (this.combo && this.phase === 'ACTIVE') {
      this.combo.log.push({ k: 'support', id: d.id, hero, attacker: this.combo.hero, heal: Math.max(0, this.hp - hp0), guard: Math.max(0, Math.floor(this.guard) - guard0), cover: !cover0 && this.coverActive() || (d.owner === 'V' && (d.tags || []).includes('guard')) });
    }
    if (d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);
    if (this.phase === 'END') return;
    this.refill();
  }

  // A Relay resolving (docs/COMBAT_SPEC.md §9): the outgoing hero's segment closes and that hero
  // starts Recovery; the incoming hero becomes active with segment rank 0 and must open with a basic
  // attack. The chain's history (cards, damage, Relays, Steps, Crosses, heroes) carries on.
  resolveRelay(cmd) {
    const c = this.combo;
    if (!c) return;
    const from = c.hero;
    const to = cmd.to;
    const noArte = !c.segArte;
    if (noArte) this.stats.relaysNoArte++;
    this.startRecovery(from, RULES.RECOVER_SEGMENT + RULES.RECOVER_PER_CARD * c.segCards, 'segment');
    c.relays++;
    this.stats.relays++;
    c.hero = to;
    c.owner = to;
    if (!c.owners.includes(to)) c.owners.push(to);
    c.rank = 0;
    c.variant = null;
    c.hasBasic = false;
    c.segArte = false;
    c.segCards = 0;
    c.lastCmd = 'relay';
    c.relayBoost = RULES.RELAY_FIRST_BONUS * c.relays;
    c.segments.push({ hero: to, cards: 0, basics: 0, artes: 0 });
    c.log.push({ k: 'relay', from, to });
    this.emit({ type: 'relay', from, to, n: c.relays, bonus: Math.round(c.relayBoost * 100) });
    if (!this.adaptOn('relay_jam')) {
      const before = this.momentum;
      this.gainMomentum(RULES.RELAY_MOMENTUM, 'Relay');
      this.stats.relayMomentum += this.momentum - before;
      if (noArte) this.stats.relayMomentumNoArte += this.momentum - before;
    }
    // Relay Echoes repeat the outgoing segment's last attack (the last card that dealt damage)
    let prev = -1;
    for (let i = c.cards.length - 1; i >= 0; i--) if (c.cards[i].dmg > 0) { prev = i; break; }
    if (prev >= 0) {
      if (!c.relayEchoUsed) {
        let p = 0;
        if (this.relics.has('echo_splice')) p = Math.max(p, 0.4);
        if (c.relayEcho) p = Math.max(p, c.relayEcho);
        if (p > 0) { c.relayEchoUsed = true; this.echo(prev, p, null); }
      }
      if (c.nextRelayEcho > 0 && this.combo === c) this.echo(prev, c.nextRelayEcho, null);
      if (this.mutations.has('relay_resonance') && this.combo === c) this.echo(prev, 0.25, null);
    }
    c.nextRelayEcho = 0;
    if (this.relics.has('relay_harness')) c.harness++;
  }

  // A queued FINISH / CASH OUT reaching the front: the ending is judged on what has executed.
  resolveFinish(cmd) {
    const c = this.combo;
    if (!c) return;
    const P = this.baseProj();
    if (!this.finishable(cmd.mode, P)) return; // no longer possible (an earlier command was dropped)
    if (cmd.mode === 'cashout') {
      this.payout(1);
      if (this.phase !== 'END' && this.combo === c) this.finishCombo('cashout');
      else if (this.phase === 'END') this.evalRecipes(c, { kind: 'end', end: 'cashout' }); // the payout won the battle
    } else this.finishCombo('perfect');
  }

  // the end-of-chain button: FINISH after an arte (a Perfect), CASH OUT after a basic attack
  finishChain() {
    return this.commitFinish('perfect');
  }
  finishOrCashOut() {
    return this.commitFinish(null);
  }

  // Braced (docs/COMBAT_SPEC.md §4.5, §10): the hero the player chose; by default the hero the most
  // imminent single-target enemy attack will land on (after Cover), else the hero last hit, else the
  // performer.
  braceTarget() {
    let best = null;
    for (const e of this.aliveEnemies()) {
      const it = e.intent;
      if (it && it.dmg > 0 && it.target && it.kind !== 'aoe' && (!best || e.atb > best.atb)) best = e;
    }
    if (best) return this.hitTarget(best.intent.target);
    return this.member(this.lastHitHero) || this.member(this.performer());
  }
  brace(sec, target) {
    const p = (target && this.member(target)) || this.braceTarget();
    if (!p) return null;
    p.st.braced = Math.max(p.st.braced || 0, this.t + sec);
    this.emit({ type: 'partyStatus', who: p.id, kind: 'braced', dur: sec });
    return p.id;
  }

  echo(idx, mult, creditEntry) {
    const c = this.combo;
    if (!c) return;
    const e = c.cards[idx];
    if (!e) return;
    const inst = this.cards.get(e.uid);
    const d = CARDS[e.id];
    if (this.relics.has('mirror_lens')) mult *= 1.25;
    this.emit({ type: 'echo', who: e.owner, card: e.name, id: e.id, anim: d.owner ? d.anim : HERO_ANIM[e.owner], mult });
    const api = this.makeApi(e, inst, d, { mult, bonus: 0, echoing: true, creditEntry: creditEntry || null, ctx: c });
    d.fx(api);
  }

  // Card effect API. Echo restriction: echoes repeat damage, Guard, healing and statuses at reduced
  // power; they never repeat rank/suit changes, Flow, Momentum, card movement, or other Echoes.
  makeApi(entry, inst, def, o) {
    const self = this;
    const c = o.ctx || this.combo;
    const echoing = o.echoing;
    const credit = echoing ? o.creditEntry : entry;
    let bonus = o.bonus || 0;
    const mult = o.mult;
    const scale = (n) => Math.max(0, Math.round(n * mult));
    const api = {
      c: self, ctx: c, entry, def, up: !!inst.up, mult, echoing,
      kind: entry.kind, step: !!entry.step, cross: !!entry.cross, relay: entry.relay, fromReserve: entry.fromReserve,
      get target() { return self.currentTarget(); },
      v: (key) => cardValue(def, inst.up, key),
      disruptedCount: () => (echoing ? 0 : self.disruptedCount()),
      flowLeft: () => self.flowLeft(),
      dmg(n, opt = {}) {
        const hits = Math.max(1, opt.hits || 1);
        let total = 0;
        for (let h = 0; h < hits; h++) {
          let amt = n * mult;
          if (bonus) { amt += bonus; bonus = 0; }
          const pierce = !!opt.pierce || inst.graft === 'breaker';
          const targets = opt.all ? self.aliveEnemies() : opt.rand ? [self.rng.pick(self.aliveEnemies())] : [self.currentTarget()];
          for (const t of targets) {
            if (!t) continue;
            total += self.dealDamage(t, amt, { src: entry.owner, entry: credit, pierce, arte: def.category === 'arte', echo: echoing, hit: h, all: !!opt.all });
          }
          if (opt.all && h === 0) self.emit({ type: 'aoe', who: entry.owner });
        }
        return total;
      },
      guard: (n) => self.addGuard(scale(n)),
      heal: (n, who) => self.healParty(scale(n), who),
      counter: (n) => { self.counter += scale(n); self.emit({ type: 'counter', amount: self.counter }); },
      status(kind, n, opt = {}) {
        const targets = opt.all ? self.aliveEnemies() : [self.currentTarget()];
        for (const t of targets) if (t) self.applyStatus(t, kind, kind === 'scorch' || kind === 'mark' ? scale(n) || 1 : n);
      },
      mom: (n) => { if (!echoing) self.gainMomentum(n, def.name); },
      flow: (s) => { if (!echoing) self.addFlow(s, 'card'); },
      rewind: (n) => { if (!echoing) { c.rank = Math.max(0, c.rank - n); self.emit({ type: 'rewind', rank: c.rank }); } },
      setVariant: (v) => { if (!echoing) { c.variant = v; self.emit({ type: 'suit', variant: v }); } },
      flipVariant: () => { if (!echoing && c.variant !== 'EX') { c.variant = c.variant === 'A' ? 'B' : 'A'; self.emit({ type: 'suit', variant: c.variant }); } },
      echo: (idx, m) => { if (!echoing) self.echo(idx, m, entry); },
      echoPrev: (m) => { if (!echoing && entry.index > 0) self.echo(entry.index - 1, m, entry); },
      storeEcho: (m) => { if (!echoing) c.stored.push({ mult: m }); },
      churnGain: (n) => { if (!echoing) self.gainChurn(n); },
      nextBonus: (n) => { if (!echoing) c.pendingBonus += n; },
      ctxAdd: (k, n) => { if (!echoing) c[k] = (c[k] || 0) + n; },
      ctxSet: (k, n) => { if (!echoing) c[k] = n; },
      // spends what is left after this card's own cost (reserved Momentum is never touched)
      spendMomentum(max = Infinity) {
        if (echoing) return entry.spentAll || 0;
        const n = Math.max(0, Math.min(self.available(), Math.floor(max)));
        self.momentum -= n;
        entry.spentAll = n;
        entry.spent = (entry.spent || 0) + n; // the card's own cost is already in `spent` (Pressure Release reads it)
        self.stats.momentumSpent += n;
        if (self.adaptOn('momentum_drain')) self.adaptProgress(n);
        if (n) self.emit({ type: 'momentum', delta: -n, why: def.name });
        return n;
      },
      holdGuard: (s) => { if (!echoing) self.guardHoldUntil = Math.max(self.guardHoldUntil, self.t + s); },
      unlockAll() {
        if (echoing) return 0;
        let n = 0;
        for (const u of self.hand) if (u && self.isLocked(u)) { self.unlock(u); n++; }
        return n;
      },
      unlockOne() {
        if (echoing) return false;
        const u = self.hand.find((x) => x && self.isLocked(x));
        if (!u) return false;
        self.unlock(u);
        return true;
      },
      // replaces every hand card that cannot be played right now (Glitch is deleted), using the same
      // legality check as the hand
      recycleIllegal() {
        if (echoing) return 0;
        let n = 0;
        for (let i = 0; i < RULES.HAND; i++) {
          const u = self.hand[i];
          if (!u || self.isLocked(u)) continue;
          if (self.categoryOf(u) === 'junk') { self.hand[i] = null; self.exhaust.push(u); self.emit({ type: 'churn', uid: u, slot: i, free: true, junk: true }); n++; continue; }
          if (!self.check(u).ok) { self.hand[i] = null; self.discard.push(u); self.emit({ type: 'churn', uid: u, slot: i, free: true }); n++; }
        }
        self.refill();
        return n;
      },
      brace: (sec) => (echoing ? null : self.brace(sec, entry.target)),
      stashBestArte() {
        if (echoing) return false;
        if (self.reserve.length + self.pendingFromReserve() >= self.reserveMax() || self.reserveLatchUntil > self.t) return false;
        let best = -1, bestRank = -1;
        self.hand.forEach((u, i) => {
          if (u && self.categoryOf(u) === 'arte' && !self.isLocked(u) && self.effRank(u) > bestRank) { best = i; bestRank = self.effRank(u); }
        });
        if (best < 0) return false;
        const u = self.hand[best];
        self.hand[best] = null;
        self.reserve.push(u);
        self.emit({ type: 'stash', uid: u, slot: best });
        return true;
      },
      strongestIdx(n) {
        return c.cards.slice(0, -1).map((e, i) => [e.dmg, i]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
      },
      detonateScorch(p) {
        for (const e of self.aliveEnemies()) {
          const s = e.st.scorch || 0;
          if (s > 0) {
            if (!echoing) e.st.scorch = 0;
            self.dealDamage(e, s * p * mult, { src: entry.owner, entry: credit, pierce: true, arte: true, echo: echoing });
          }
        }
      },
      closeAsCashOut: () => { if (!echoing) c.closeAsCashOut = true; },
      extraRefund: () => { if (!echoing) self.naturalRefund(entry.index); },
      payout: (p) => { if (!echoing) self.payout(p); },
    };
    return api;
  }

  churnCard(uid) {
    const slot = this.hand.indexOf(uid);
    if (slot < 0) return { ok: false, text: 'Not in hand' };
    if (this.phase === 'END') return { ok: false, text: 'Battle over' };
    const d = this.def(uid);
    const junk = d.category === 'junk';
    if (this.isLocked(uid)) { this.emit({ type: 'reject', uid, reason: 'locked', text: 'Locked' }); return { ok: false, text: 'Locked' }; }
    if (!junk && this.churnJamUntil > this.t) { this.emit({ type: 'reject', uid, reason: 'snared', text: 'Churn snared' }); return { ok: false, text: 'Churn snared' }; }
    const stranded = !junk && this.stranded();
    const free = junk || stranded || (this.relics.has('beta_badge') && !this.churn.freeUsed);
    if (!free && this.churn.charges < 1) { this.emit({ type: 'reject', uid, reason: 'nocharge', text: 'No Churn charges' }); return { ok: false, text: 'No Churn charges' }; }
    if (stranded) this.stats.strandedChurns++;
    else if (!junk && this.relics.has('beta_badge') && !this.churn.freeUsed) this.churn.freeUsed = true;
    else if (!junk) this.churn.charges -= 1;
    this.hand[slot] = null;
    if (junk || d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);
    let churnLog = null;
    if (!junk) {
      this.stats.churns++;
      if (this.combo) { this.combo.churned = true; if (this.phase === 'ACTIVE') { churnLog = { k: 'churn', drew: null }; this.combo.log.push(churnLog); } }
      if (!this.relics.has('oiled_bearings')) {
        if (this.phase === 'ACTIVE') this.combo.deadline = Math.max(this.t + 0.2, this.combo.deadline - 0.3);
        else {
          for (const e of this.aliveEnemies()) e.atb = Math.min(0.97, e.atb + 0.05);
          this.emit({ type: 'atbPush', amount: 0.05 }); // shown on the enemy bars: Churning outside a combo costs time
        }
      }
      const inst = this.cards.get(uid);
      if (inst.graft === 'churnfed') { this.gainMomentum(1, 'Churnfed'); this.addGuard(2); }
      if (this.mutations.has('grinder')) {
        const t = this.rng.pick(this.aliveEnemies());
        if (t) this.dealDamage(t, 4, { src: 'V', tag: 'grinder' });
      }
      if (this.adaptOn('churn_tax')) {
        for (const e of this.aliveEnemies()) if (e.tier === 'boss') e.atb = Math.min(0.97, e.atb + 0.15);
        this.emit({ type: 'atbPush', amount: 0.15, boss: true });
      }
    }
    this.emit({ type: 'churn', uid, slot, junk });
    this.refill(uid);
    if (churnLog) churnLog.drew = this.hand[slot] || null; // the card that Churn brought in (Salvage Circuit)
    this.checkEnd();
    return { ok: true };
  }

  canStash(uid) {
    if (this.phase === 'END') return false;
    return this.hand.includes(uid) && this.reserve.length + this.pendingFromReserve() < this.reserveMax() && this.reserveLatchUntil <= this.t
      && !this.isLocked(uid) && this.categoryOf(uid) !== 'junk';
  }

  stash(uid) {
    if (!this.canStash(uid)) {
      const text = this.reserveLatchUntil > this.t ? 'Reserve sealed' : this.reserve.length + this.pendingFromReserve() >= this.reserveMax() ? 'Reserve full' : 'Cannot stash';
      this.emit({ type: 'reject', uid, reason: 'stash', text });
      return { ok: false, text };
    }
    const slot = this.hand.indexOf(uid);
    this.hand[slot] = null;
    this.reserve.push(uid);
    this.stats.stashes++;
    if (this.combo && this.phase === 'ACTIVE') this.combo.log.push({ k: 'stash' });
    this.emit({ type: 'stash', uid, slot });
    this.refill(uid); // the hand keeps six cards: the slot refills from the draw pile
    return { ok: true };
  }

  gainChurn(n) {
    const before = this.churn.charges;
    this.churn.charges = Math.min(this.churnMax(), this.churn.charges + n);
    if (this.churn.charges > before) this.emit({ type: 'churnGain', n: this.churn.charges - before });
  }

  spendMomentumFlow() {
    const cost = this.momentumCostFlow();
    if (this.phase !== 'ACTIVE' || this.available() < cost) return { ok: false, text: this.phase !== 'ACTIVE' ? 'No combo running' : 'Not enough Momentum' };
    if (this.combo.deadline >= this.flowCap() - 0.01) return { ok: false, text: 'At the combo cap' };
    this.momentum -= cost;
    this.stats.momentumSpent += cost;
    if (this.adaptOn('momentum_drain')) this.adaptProgress(cost);
    this.emit({ type: 'momentum', delta: -cost, why: 'Flow' });
    this.addFlow(this.flowSpendAmount(), 'buy');
    return { ok: true };
  }

  spendMomentumGuard() {
    if (this.phase === 'END') return { ok: false, text: 'Battle over' };
    if (this.available() < RULES.MOMENTUM_COST) return { ok: false, text: 'Not enough Momentum' };
    this.momentum -= RULES.MOMENTUM_COST;
    this.stats.momentumSpent += RULES.MOMENTUM_COST;
    if (this.adaptOn('momentum_drain')) this.adaptProgress(RULES.MOMENTUM_COST);
    this.emit({ type: 'momentum', delta: -RULES.MOMENTUM_COST, why: 'Guard' });
    this.addGuard(this.guardSpendAmount());
    this.emit({ type: 'act', who: 'V', anim: 'guard', card: 'Brace', role: 'momentum', big: false });
    return { ok: true };
  }

  cashOut() {
    return this.commitFinish('cashout');
  }

  cashOutPreview() {
    if (!this.combo) return 0;
    return this.payoutAmount(1).amount;
  }

  payoutAmount(scale) {
    const c = this.combo;
    const len = c.cards.length;
    let ledger = 0;
    for (const e of c.cards) if (this.cards.get(e.uid).graft === 'ledger') ledger += 3;
    const top = len ? Math.max(...c.cards.map((e) => e.rank)) : 0; // the chain's highest rank (segments restart at 0)
    let amt = 4 + 3 * len + top + (c.cashPerCard || 0) * len + ledger;
    let pct = 1 + (c.cashPct || 0) + (this.relics.has('riveted_ledger') ? 0.3 : 0) + (this.mutations.has('quick_exit') ? 0.4 : 0);
    const quick = this.flowLeft() >= RULES.QUICK_CASH_LEFT;
    if (quick) pct += 0.25;
    if (this.adaptOn('payout_audit')) pct *= 0.6;
    if (this.payoutSealUntil && this.payoutSealUntil > this.t) pct *= 0.5;
    return { amount: Math.round(amt * pct * scale), quick, guard: Math.round(2 * len * scale) };
  }

  payout(scale) {
    const c = this.combo;
    if (!c) return;
    const p = this.payoutAmount(scale);
    const tgt = this.currentTarget();
    c.quick = p.quick;
    c.payout = p.amount;
    this.emit({ type: 'cashout', amount: p.amount, quick: p.quick, scale, who: c.owner });
    if (tgt) this.dealDamage(tgt, p.amount, { src: c.owner, tag: 'cashout', pierce: false, cashout: true });
    this.addGuard(p.guard);
    if (p.quick && this.mutations.has('quick_exit')) this.gainMomentum(2, 'Quick Cash');
  }

  finishCombo(type) {
    const c = this.combo;
    if (!c) return;
    if (type === 'forced' && this.lastIsArte()) type = 'perfect'; // the arte was the finish (spec §12.3)
    this.cancelChainCmds('end'); // chain commands that have not started are cancelled (spec §16)
    // the last segment closes: its hero recovers
    this.startRecovery(c.hero, RULES.RECOVER_SEGMENT + RULES.RECOVER_PER_CARD * c.segCards, 'segment');
    // Dead Drop stored echoes release on a Perfect or Cash Out
    if (type !== 'forced' && c.stored.length) {
      const idx = c.cards.map((e, i) => [e.dmg, i]).sort((a, b) => b[0] - a[0])[0];
      for (const s of c.stored) if (idx && idx[0] > 0) this.echo(idx[1], s.mult, null);
    }
    const duration = this.t - c.start;
    this.stats.combos++;
    this.stats.longest = Math.max(this.stats.longest, c.cards.length);
    if (c.cards.length >= 5) this.stats.longCombos++;
    this.stats.bestComboDamage = Math.max(this.stats.bestComboDamage, c.damage);
    this.stats.chainHeroes[Math.min(3, c.owners.length)]++;
    this.stats.chainCards += c.cards.length;
    this.stats.chainArtes += c.artes;
    let finisher = false;
    if (type === 'perfect') {
      this.stats.perfect++;
      let m = 2 + (this.mutations.has('perfect_pitch') ? 2 : 0);
      if (this.stats.perfect === 1 && this.relics.has('auditor_seal')) m += 4;
      this.gainMomentum(m, 'Perfect');
      if (this.mutations.has('perfect_pitch')) this.addGuard(6);
      this.gainChurn(1);
      if (this.relics.has('tuning_fork')) this.healParty(3);
      const last = c.cards[c.cards.length - 1];
      finisher = c.cards.length >= 5 || (last && last.category === 'arte' && last.rank >= 6);
      if (finisher) { this.stats.finishers++; this.hold = RULES.FINISHER_HOLD; }
    } else if (type === 'cashout') {
      this.stats.cashouts++;
      if (this.relics.has('junk_dividend')) {
        this.gainMomentum(1, 'Dividend');
        if (this.dividendScrap < 15) { this.dividendScrap += 3; this.scrapEarned += 3; }
      }
    } else {
      this.stats.forced++;
      if (this.relics.has('long_fuse')) this.payout(0.5);
      else if (this.available() > 0) {
        const loss = Math.min(2, this.available());
        this.momentum -= loss;
        this.emit({ type: 'momentum', delta: -loss, why: 'Dropped' });
      }
    }
    this.evalRecipes(c, { kind: 'end', end: type });
    const summary = {
      ex: [...c.ex],
      type, len: c.cards.length, relays: c.relays, crosses: c.crosses, steps: c.steps, damage: c.damage,
      openerSuit: c.cards[0] ? c.cards[0].variant : null,
      openerStrength: c.cards[0] && c.cards[0].category === 'basic' ? CARDS[c.cards[0].id].rank : null,
      closerId: type === 'perfect' && this.lastIsArte() ? c.cards[c.cards.length - 1].id : null,
      owners: c.owners.length, heroes: c.owners.slice(), segments: c.segments.map((g) => ({ ...g })), artes: c.artes,
      duration, churned: c.churned, maxRank: Math.max(0, ...c.cards.map((e) => e.rank)),
      strongest: Math.max(0, ...c.cards.map((e) => e.dmg)),
    };
    this.history.push(summary);
    this.trackAdaptation(summary);
    this.updateCitation(summary);
    this.emit({ type: 'comboEnd', kind: type, len: summary.len, damage: c.damage, finisher, quick: !!c.quick, relays: c.relays, owners: c.owners.slice(), hero: c.hero });
    this.combo = null;
    if (this.phase === 'END') return;
    this.phase = 'RECOVER';
    this.breatherUntil = this.t + RULES.RECOVER[type];
  }

  // ───────────────────────── EX Combos (Phase 7) ─────────────────────────
  // Evaluates the recipe catalogue for one executed moment of a chain: a card that has resolved
  // (`kind: 'card'`) or the chain's ending (`kind: 'end'`). Every recipe satisfied now and not yet
  // triggered in this chain is collected first, then resolved in priority order, each once. Effects
  // use the chain's damage before any EX effect of this moment as their base, so one recipe's damage
  // never inflates another's. When the battle is already over (the card or payout won or lost it), the
  // activation is recorded but no effect is applied; the same holds for the rest of a batch once an
  // effect ends the battle. EX effects never pass through here again (no card resolves, no chain ends
  // because of them), so they cannot complete further recipes.
  evalRecipes(c, ev) {
    if (!c || !c.ex || !RULES.EX_COMBOS) return [];
    const e = ev.entry || null;
    const logPos = e ? c.log.findIndex((l) => l.k === 'card' && l.i === e.index) : c.log.length;
    const x = { c, e, end: ev.end || null, logPos: logPos < 0 ? c.log.length : logPos };
    const hits = [];
    for (const r of RECIPES) {
      if (r.on !== ev.kind || c.ex.has(r.id)) continue;
      let ok = false;
      try { ok = !!r.match(x); } catch (err) { ok = false; }
      if (ok) hits.push(r);
    }
    if (!hits.length) return hits;
    const group = ++this.exSeq;
    const base = c.damage;
    if (hits.length > 1) this.stats.exOverlaps++;
    hits.forEach((r, k) => {
      c.ex.add(r.id);
      const sum = { dmg: 0, guard: 0, heal: 0, momentum: 0, flow: 0, churn: 0, unlocked: 0, exposed: 0, counter: 0, cover: 0, echo: false };
      const applied = this.phase !== 'END';
      if (applied) r.fx(this.exApi(c, base, sum, e));
      const st = this.stats;
      st.exActivations++;
      st.exByRecipe[r.id] = (st.exByRecipe[r.id] || 0) + 1;
      st.exDamage += sum.dmg; st.exGuard += sum.guard; st.exHeal += sum.heal; st.exMomentum += sum.momentum; st.exFlow += sum.flow; st.exChurn += sum.churn;
      st.exChainCards += c.cards.length;
      if (r.tags.includes('relay')) st.exRelay++;
      if (r.support) st.exSupport++;
      if (!applied) st.exUnapplied++;
      this.exFound.add(r.id);
      this.emit({ type: 'exCombo', id: r.id, group, order: k, of: hits.length, sum, applied, len: c.cards.length, heroes: c.owners.length, hero: c.hero });
    });
    return hits;
  }
  // The bounded effects a recipe may use; each records what it actually changed in `sum`.
  exApi(c, base, sum, entry = null) {
    const live = () => this.phase !== 'END';
    const pool = () => this.enemies.reduce((a, e) => a + Math.max(0, e.hp) + (e.alive ? Math.max(0, Math.floor(e.guard)) : 0), 0);
    const hit = (fn) => { if (!live()) return; const b = pool(); fn(); sum.dmg += Math.max(0, b - pool()); };
    // EX damage goes through everything ordinary damage does (Guard, Weak, Exposed, Parry, citations,
    // boss adaptations): it carries the suit of the card that completed the recipe for the Suit Filters
    const suit = entry ? entry.variant : null;
    const one = (n) => hit(() => { const t = this.currentTarget(); if (t && n > 0) this.dealDamage(t, n, { src: c.hero, tag: 'ex', suit }); });
    const all = (n) => hit(() => { for (const t of this.aliveEnemies()) { if (!live()) break; if (n > 0) this.dealDamage(t, n, { src: c.hero, tag: 'ex', all: true, suit }); } });
    const share = (pct, min) => Math.max(min, Math.round(pct * base));
    return {
      base,
      crosses: () => c.crosses,
      payout: () => c.payout || 0,
      strike: (pct, min) => one(share(pct, min)),
      strikeFlat: (n) => one(n),
      strikeAll: (pct, min) => all(share(pct, min)),
      strikeAllFlat: (n) => all(n),
      guard: (n) => { if (!live()) return; const b = Math.floor(this.guard); this.addGuard(n); sum.guard += Math.floor(this.guard) - b; },
      heal: (n) => { if (!live()) return; const b = this.hp; this.healParty(n); sum.heal += this.hp - b; },
      momentum: (n) => { if (!live()) return; const b = this.momentum; this.gainMomentum(n, 'EX'); sum.momentum += this.momentum - b; },
      // Flow only within the running chain and its counted cap (Flow Clamp halves it, as for cards)
      flow: (sec) => { if (!live() || this.combo !== c) return; const b = c.deadline; this.addFlow(sec); sum.flow += Math.max(0, c.deadline - b); },
      churn: (n) => { if (!live()) return; const b = this.churn.charges; this.gainChurn(n); sum.churn += Math.max(0, this.churn.charges - b); },
      expose: (sec) => { if (!live()) return; const t = this.currentTarget(); if (t) { t.st.exposed = Math.max(t.st.exposed || 0, sec); sum.exposed = sec; this.emit({ type: 'status', uid: t.uid, kind: 'exposed' }); } },
      counter: (n) => { if (!live()) return; this.counter += n; sum.counter += n; this.emit({ type: 'counter', amount: this.counter }); },
      cover: (sec) => { if (!live() || !this.coverActive()) return; this.coverUntil += sec; sum.cover += sec; this.emit({ type: 'cover', until: this.coverUntil }); },
      chain: () => c,
      entry: () => entry,
      echoArte: (i, mult) => { if (i >= 0 && c.cards[i]) hit(() => { if (this.combo === c) { this.echo(i, mult, null); sum.echo = true; } }); },
      echoFirstArte: (mult) => { const i = c.cards.findIndex((x) => x.category === 'arte'); if (i >= 0) hit(() => { if (this.combo === c) { this.echo(i, mult, null); sum.echo = true; } }); },
      unlockAll: () => { if (!live()) return; for (const uid of Object.keys(this.locks)) { this.unlock(uid); sum.unlocked++; } },
    };
  }

  trackAdaptation(s) {
    const a = this.adapt;
    if (!a || a.broken) return;
    switch (a.id) {
      case 'long_chain': if (s.type !== 'forced' && s.len <= 4) this.adaptProgress(1); break;
      case 'payout_audit': if (s.type === 'perfect') this.adaptProgress(1); break;
      case 'churn_tax': if (s.type !== 'forced' && !s.churned) this.adaptProgress(1); break;
      case 'relay_jam': if (s.type === 'perfect' && s.relays <= 1) this.adaptProgress(1); break;
      case 'flow_clamp': if (s.type === 'perfect' && s.duration < 6) this.adaptProgress(1); break; // prototype (was 3.5s, before the longer Flow)
      default: break;
    }
  }

  // ── Protocol Auditor / Core citation system ──
  auditPatterns(e) {
    if (this.relics.has('auditor_seal')) { this.emit({ type: 'banner', text: 'AUDIT BLOCKED', sub: { k: '{r}', p: { r: { relic: 'auditor_seal' } } }, tone: 'good' }); return; }
    const h = this.history;
    if (h.length < 2) { this.emit({ type: 'banner', text: 'AUDIT: INSUFFICIENT DATA', sub: 'No citation issued', tone: 'info' }); return; }
    const a = h[h.length - 1], b = h[h.length - 2];
    let reason = null;
    if (a.openerStrength && a.openerStrength === b.openerStrength) reason = { kind: 'strength', value: a.openerStrength };
    else if (a.closerId && a.closerId === b.closerId) reason = { kind: 'closer', value: a.closerId };
    if (!reason) { this.emit({ type: 'banner', text: 'AUDIT PASSED', sub: 'Your patterns varied', tone: 'good' }); return; }
    this.citation = reason;
    this.stats.interference++;
    const sub = reason.kind === 'strength' ? { 1: 'Started with a Weak attack twice: -40% damage until you vary', 2: 'Started with a Medium attack twice: -40% damage until you vary', 3: 'Started with a Strong attack twice: -40% damage until you vary' }[reason.value] : 'Same arte finished twice: -40% damage until you vary';
    this.emit({ type: 'banner', text: 'CITATION ISSUED', sub, tone: 'bad' });
    if (e.flags.strict) this.hitAll(e, this.edmg(e, 10));
  }
  updateCitation(s) {
    if (!this.citation) return;
    const r = this.citation;
    const varied = r.kind === 'strength' ? s.openerStrength !== r.value : s.closerId !== r.value;
    if (varied) {
      this.citation = null;
      this.emit({ type: 'banner', text: 'CITATION CLEARED', sub: 'Pattern varied', tone: 'good' });
    }
  }
  lastEndingsRepeat() {
    const h = this.history;
    if (h.length < 2) return false;
    const a = h[h.length - 1], b = h[h.length - 2];
    return a.type === b.type && a.len === b.len;
  }
  lastStrongestHit() {
    const h = this.history[this.history.length - 1];
    return h ? h.strongest : 0;
  }
  lastOpenerSuit() {
    const h = this.history[this.history.length - 1];
    return h ? h.openerSuit : null;
  }

  // ───────────────────────── damage & status ─────────────────────────
  dealDamage(e, amount, o = {}) {
    if (!e || !e.alive) return 0;
    let a = amount;
    if (o.src && this.member(o.src) && this.member(o.src).st.weak > this.t) a *= 0.75;
    if (this.mutations.has('glass_cannon')) a *= 1.25;
    if (this.mutations.has('overpressure_valve') && this.momentum >= 10) a *= 1.25;
    if (this.prep.dmgMult) a *= this.prep.dmgMult;
    if (o.arte && this.relics.has('kettle_drum') && this.combo && this.combo.cards.length >= 5) a *= 1.25;
    if (this.citation && !o.cashout) a *= 0.6;
    // a card's suit, or (EX Combo damage) the suit of the card that completed the recipe
    const suit = o.entry ? o.entry.variant : o.suit || null;
    if (suit && this.adapt && !this.adapt.broken) {
      if (this.adaptOn('suit_filter_A') && suit === 'A') a *= 0.7;
      if (this.adaptOn('suit_filter_B') && suit === 'B') a *= 0.7;
    }
    if ((e.st.exposed || 0) > 0) a *= 1.3;
    if (o.arte && e.st.mark > 0) { a *= 1.5; e.st.mark = 0; }
    if (o.pierce && e.flags.pierceVuln) a *= 2;
    a = Math.max(0, Math.round(a));
    let blocked = 0;
    if (!o.pierce && e.guard > 0) {
      blocked = Math.min(Math.floor(e.guard), a);
      e.guard -= blocked;
      a -= blocked;
    }
    e.hp -= a;
    const total = a + blocked;
    if (this.combo && !o.counter && o.tag !== 'scorch') this.combo.damage += total;
    if (o.entry) o.entry.dmg += total;
    this.stats.damage += a;
    this.stats.maxHit = Math.max(this.stats.maxHit, total);
    if (this.disruptedCount() > 0 && this.adaptOn('lock_harden')) this.adaptProgress(total);
    if (o.arte && this.adaptOn('guard_pierce') && !o.echo) this.adaptProgress(total);
    this.emit({ type: 'hit', uid: e.uid, amount: a, blocked, by: o.src || null, big: !!o.arte, echo: !!o.echo, tag: o.tag || null, all: !!o.all, hit: o.hit || 0, pierce: !!o.pierce });
    // parry reflection
    if ((e.st.parry || 0) > 0 && o.src && this.member(o.src) && !o.counter && total > 0) {
      const ref = Math.round(total * (e.st.parryPct || 0.5));
      if (ref > 0) this.hitParty(e, o.src, ref, { reflect: true, pierce: true });
    }
    if (e.hp <= 0) this.killEnemy(e);
    else this.checkPhase(e);
    return total;
  }

  applyStatus(e, kind, n) {
    if (!e || !e.alive) return;
    if (kind === 'scorch') {
      n += this.relics.has('coal_heart') ? 1 : 0;
      e.st.scorch = (e.st.scorch || 0) + n;
      if (!e.st.scorchT) e.st.scorchT = 1.5;
    } else if (kind === 'mark') e.st.mark = (e.st.mark || 0) + 1;
    else e.st[kind] = Math.max(e.st[kind] || 0, n);
    this.emit({ type: 'status', uid: e.uid, kind, n });
  }

  // Healing restores the shared pool. `who` only picks which hero the effect is shown on.
  healParty(n, who = 'all') {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Math.round(n)));
    if (this.hp > before) this.emit({ type: 'heal', who: who === 'all' || who === 'lowest' ? 'party' : who, amount: this.hp - before });
  }

  killEnemy(e) {
    e.alive = false;
    e.hp = 0;
    e.atb = 0;
    this.emit({ type: 'enemyDie', uid: e.uid, boss: e.tier === 'boss' });
    if (e.tier === 'boss') for (const x of this.enemies) if (x.alive && x.summoned) { x.alive = false; x.hp = 0; this.emit({ type: 'enemyDie', uid: x.uid }); }
    const was = this.target;
    const next = this.currentTarget();
    // the selected enemy died: the next attack goes to another one, and the view says so
    if (next && was !== next.uid) this.emit({ type: 'retarget', uid: next.uid, from: was });
    this.checkEnd();
  }

  checkPhase(e) {
    const def = ENEMIES[e.id];
    if (!def.phases) return;
    const next = def.phases[e.phase - 1];
    if (!next || e.hp > e.maxHp * next.at) return;
    e.phase++;
    if (next.actTime) e.actTime = next.actTime;
    if (next.strict) e.flags.strict = true;
    if (next.pierceVuln) e.flags.pierceVuln = true;
    if (next.rootAccess) e.flags.rootAccess = true;
    e.flags.regenGuard = !!next.pierceVuln;
    this.emit({ type: 'phase', uid: e.uid, id: e.id, idx: e.phase - 2, name: next.name, text: next.text });
    if (next.summon) for (const sid of next.summon) this.summon(sid, e);
    e.atb = Math.min(e.atb, 0.3);
    this.chooseIntent(e);
  }

  // ───────────────────────── party damage ─────────────────────────
  defenseOf(p) {
    return p ? Math.min(RULES.DEFENSE_CAP, p.def + (p.st.braced > this.t ? RULES.BRACED_BONUS : 0)) : 0;
  }
  coverActive() {
    return this.coverUntil > this.t;
  }
  // The hero a single-target hit lands on: the intended one, or Hessa while she covers the party.
  hitTarget(pid) {
    const p = this.member(pid);
    if (p && p.id !== 'V' && this.coverActive()) return this.member('V');
    return p;
  }
  // Defense first (minimum 1 per hit), then shared Guard once, then the HP pool.
  mitigate(e, raw, p, o) {
    let a = raw;
    if (!o.reflect && e && (e.st.weak || 0) > 0) a *= 0.75;
    a = Math.max(0, Math.round(a));
    if (a > 0 && !o.reflect && !o.self) a = Math.max(1, Math.round(a * (1 - this.defenseOf(p))));
    return a;
  }
  absorb(e, a, o) {
    if (o.pierce || o.reflect || o.self || this.guard < 1 || a <= 0) return 0;
    let usable = Math.floor(this.guard);
    if (e && e.tier === 'boss' && this.adaptOn('guard_pierce')) usable = Math.floor(usable / 2);
    const blocked = Math.min(usable, a);
    this.guard -= blocked;
    this.stats.guardAbsorbed += blocked;
    return blocked;
  }
  loseHp(n) {
    if (n <= 0) return;
    this.hp -= n;
    this.stats.damageTaken += n;
    if (!this.switchUsed && this.relics.has('dead_mans_switch') && this.hp > 0 && this.hp < this.maxHp * RULES.SWITCH_THRESHOLD) {
      this.switchUsed = true;
      this.emit({ type: 'banner', text: 'SWITCH TRIPPED', sub: { k: '{r}', p: { r: { relic: 'dead_mans_switch' } } }, tone: 'gold' });
      for (const x of this.aliveEnemies()) this.dealDamage(x, 15, { src: null, pierce: true, tag: 'switch' });
      this.gainMomentum(5, "Dead Man's Switch");
    }
  }
  // hooks that fire once per enemy attack (not per hero for area attacks)
  onHitHooks(e, blocked, a, o) {
    if (!e || !e.alive || o.reflect) return;
    if (blocked > 0 && a === 0 && this.relics.has('heat_shield')) this.applyStatus(e, 'scorch', 2);
    if (blocked > 0 && this.mutations.has('bastion_protocol')) this.dealDamage(e, Math.round(blocked * 0.5), { src: 'V', counter: true, pierce: true, tag: 'bastion' });
    if (this.counter > 0 && e.alive) {
      const cd = this.counter * (this.relics.has('counter_spring') ? 2 : 1);
      this.counter = 0;
      this.emit({ type: 'act', who: 'V', anim: 'counter', card: 'Counter', role: 'counter', big: false, target: e.uid });
      this.dealDamage(e, cd, { src: 'V', counter: true, pierce: true, tag: 'counter' });
    }
  }

  hitParty(e, pid, amount, o = {}) {
    const intended = this.member(pid) || this.pickTargetMember(e);
    if (!intended) return 0;
    const p = o.reflect || o.self ? intended : this.hitTarget(intended.id);
    if (p !== intended) this.emit({ type: 'covered', who: p.id, from: intended.id });
    if (!o.reflect) this.lastHitHero = p.id;
    const afterDef = this.mitigate(e, amount, p, o);
    const blocked = this.absorb(e, afterDef, o);
    const a = afterDef - blocked;
    this.loseHp(a);
    this.emit({ type: 'partyHit', who: p.id, amount: a, blocked, src: e ? e.uid : null, reflect: !!o.reflect });
    this.onHitHooks(e, blocked, a, o);
    this.checkEnd();
    return a;
  }

  // Area attack: each hero's Defense applies to its share; Guard is applied once to the total.
  hitAll(e, amount, o = {}) {
    this.emit({ type: 'enemyAoe', src: e ? e.uid : null });
    const parts = this.party.map((p) => [p, this.mitigate(e, amount, p, o)]);
    const total = parts.reduce((x, [, v]) => x + v, 0);
    let blocked = this.absorb(e, total, o);
    const blockedTotal = blocked;
    let lost = 0;
    for (const [p, v] of parts) {
      const b = Math.min(v, blocked);
      blocked -= b;
      lost += v - b;
      this.emit({ type: 'partyHit', who: p.id, amount: v - b, blocked: b, src: e ? e.uid : null, reflect: !!o.reflect, all: true });
    }
    this.loseHp(lost);
    this.onHitHooks(e, blockedTotal, lost, o);
    this.checkEnd();
    return lost;
  }

  pickTargetMember(e) {
    const def = e ? ENEMIES[e.id] : null;
    // enemies that used to pick the most hurt hero now go for the weakest armour
    if (def && def.targetMode === 'lowest') return this.party.slice().sort((a, b) => a.def - b.def)[0];
    // Vanguard draws aggro
    return this.rng.weighted(this.party.map((p) => [p, p.id === 'V' ? 2 : 1]));
  }

  // ───────────────────────── enemy API ─────────────────────────
  spawnEnemy(id, { hpMult = 1, dmgMult = 1, summoned = false } = {}) {
    const def = ENEMIES[id];
    const lvl = Math.max(0, this.act - def.act);
    const scale = 1 + 0.4 * lvl;
    let hp = Math.round(def.hp * hpMult * scale * (this.prep.bossHpMult && def.tier === 'boss' ? this.prep.bossHpMult : 1));
    if (this.tutorial) hp = Math.round(hp * 0.8);
    const e = {
      uid: `e${++this.uidCounter}`, id, lvl, name: def.name + (lvl > 0 ? ' Mk' + (lvl + 1) : ''), tier: def.tier, hp, maxHp: hp, guard: 0,
      atb: def.tier === 'boss' ? 0 : this.rng.next() * 0.3, actTime: def.actTime, dmgMult: dmgMult * (1 + 0.3 * lvl), alive: true,
      st: {}, flags: {}, actCount: 0, phase: 1, intent: null, summoned, size: def.size, art: def.art, hasteUntil: 0, hasteMult: 1,
    };
    this.enemies.push(e);
    this.chooseIntent(e);
    return e;
  }

  summon(id, src, { hpScale = 1 } = {}) {
    if (this.aliveEnemies().length >= 4) return null;
    const e = this.spawnEnemy(id, { hpMult: this.hpMult * hpScale, dmgMult: this.dmgMultBase, summoned: true });
    e.atb = 0;
    this.emit({ type: 'summon', uid: e.uid, src: src ? src.uid : null });
    return e;
  }

  edmg(e, base) {
    return Math.round(base * e.dmgMult);
  }

  intentInfo(e) {
    return e.intent;
  }

  chooseIntent(e) {
    const def = ENEMIES[e.id];
    let key = def.ai(e, this);
    const it = def.intents[key];
    let target = null;
    if (it.kind === 'atk' || (it.dmg && it.kind !== 'aoe')) {
      const m = this.pickTargetMember(e);
      target = m ? m.id : null;
    }
    e.intent = { key, name: it.name, kind: it.kind, dmg: it.dmg ? this.edmg(e, it.dmg) : 0, target, desc: it.desc };
  }

  hasteEnemy(e, mult, dur) {
    e.hasteMult = mult;
    e.hasteUntil = this.t + dur;
    this.emit({ type: 'enemyBuff', uid: e.uid });
  }

  enemyGuard(e, n) {
    n = Math.max(0, Math.min(n, Math.max(30, Math.round(e.maxHp * 0.5)) - e.guard));
    if (!n) return;
    e.guard += n;
    this.emit({ type: 'enemyGuard', uid: e.uid, amount: n });
  }

  healEnemy(e, n) {
    if (!e.alive) return;
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + n);
    if (e.hp > before) this.emit({ type: 'enemyHeal', uid: e.uid, amount: e.hp - before });
  }

  weakenParty(e, pid, dur) {
    const targets = pid === 'all' ? this.party : [this.member(pid) || this.pickTargetMember(e)].filter(Boolean);
    for (const p of targets) {
      p.st.weak = Math.max(p.st.weak || 0, this.t + dur);
      this.emit({ type: 'partyStatus', who: p.id, kind: 'weak', dur });
    }
  }

  enemyStatus(e, kind, dur, pct) {
    e.st[kind] = dur;
    if (kind === 'parry') e.st.parryPct = pct || 0.5;
    this.emit({ type: 'status', uid: e.uid, kind, n: dur });
  }

  noteInterference() {
    this.stats.interference++;
    if (this.relics.has('breach_clamp')) { this.gainMomentum(1, 'Breach Clamp'); this.addGuard(3); }
    if (this.mutations.has('signal_thief')) this.gainMomentum(2, 'Signal Thief');
  }

  lockCards(e, n, filter) {
    let dur = RULES.LOCK_DURATION;
    if (e && e.tier === 'boss' && this.adaptOn('lock_harden')) dur = 4.5;
    if (this.relics.has('grease_trap')) dur *= 0.5;
    if (this.relics.has('breach_clamp')) dur -= 1;
    if (this.relics.has('regent_mainspring')) dur -= 1;
    dur = Math.max(1, dur);
    const pri = { arte: 3, basic: 2, support: 1 };
    const cands = this.hand
      .filter((u) => u && !this.isLocked(u) && this.categoryOf(u) !== 'junk' && this.cards.get(u).graft !== 'anchored' && (!filter || filter(u)))
      .map((u) => ({ u, s: pri[this.categoryOf(u)] * 10 + this.effRank(u) + this.rng.next() }))
      .sort((a, b) => b.s - a.s)
      .slice(0, n);
    if (!cands.length) return 0;
    for (const { u } of cands) {
      this.locks[u] = { until: this.t + dur, dur, source: e ? e.id : null };
      this.wasLocked.add(u);
      this.emit({ type: 'lock', uid: u, dur, source: e ? e.id : null });
    }
    this.noteInterference();
    return cands.length;
  }

  unlock(uid) {
    if (this.locks[uid]) {
      delete this.locks[uid];
      this.emit({ type: 'unlock', uid });
    }
  }

  scrambleCards(e, n, mode) {
    // only basic attacks and artes have a rank and suit to scramble
    const cands = this.rng.shuffle(this.hand.filter((u) => u && isOffensive(this.def(u)) && this.cards.get(u).graft !== 'anchored')).slice(0, n);
    if (!cands.length) return 0;
    for (const u of cands) {
      const m = { until: this.t + RULES.SCRAMBLE_DURATION, flip: false, rankDelta: 0, source: e ? e.id : null };
      if (mode === 'suit' || mode === 'both') m.flip = true;
      if (mode === 'rank' || mode === 'both') m.rankDelta = this.rng.pick([-2, -1, 1, 2]);
      if (mode === 'rankup') { m.rankDelta = 2; m.until = this.t + 6; }
      this.temp[u] = m;
    }
    this.emit({ type: 'scramble', uids: cands, source: e ? e.id : null, mode });
    this.noteInterference();
    return cands.length;
  }

  jamSlot(e, dur) {
    const free = [];
    for (let i = 0; i < RULES.HAND; i++) if (!this.slotJammed(i) && !this.heldSlots.has(i) && !(this.hand[i] && this.isLocked(this.hand[i]))) free.push(i);
    if (!free.length) return;
    const i = this.rng.pick(free);
    if (this.hand[i]) this.tuck(i);
    this.jams[i] = { until: this.t + dur, source: e ? e.id : null };
    this.emit({ type: 'jam', slot: i, dur, source: e ? e.id : null });
    this.noteInterference();
  }

  snareChurn(e, dur, drain) {
    const before = this.churn.charges;
    this.churn.charges = Math.max(0, this.churn.charges - drain);
    if (dur) this.churnJamUntil = Math.max(this.churnJamUntil, this.t + dur);
    this.emit({ type: 'snare', drained: before - this.churn.charges, dur, source: e ? e.id : null });
    this.noteInterference();
  }

  latchReserve(e) {
    if (this.reserve.length) {
      const u = this.reserve.pop();
      this.discard.push(u);
      this.emit({ type: 'latch', uid: u, source: e ? e.id : null });
    } else {
      this.reserveLatchUntil = Math.max(this.reserveLatchUntil, this.t + 5);
      this.emit({ type: 'latch', uid: null, dur: 5, source: e ? e.id : null });
    }
    this.noteInterference();
  }

  // Flow the enemies winding up a Flow theft would take from the running combo (the Flow bar shows it
  // in red): drain intents tagged with `flow`, from 55% ATB, never more than drainFlow would remove.
  imminentDrain() {
    if (!this.combo) return 0;
    let sec = 0;
    for (const e of this.enemies) {
      const it = e.alive && e.intent;
      if (!it || it.kind !== 'drain' || e.atb < 0.55) continue;
      if (this.trait === 'BLACKOUT' && e.atb < 0.75) continue;
      sec += (ENEMIES[e.id].intents[it.key] || {}).flow || 0;
    }
    return Math.max(0, Math.min(sec, this.flowLeft() - 0.5));
  }
  drainFlow(e, sec) {
    if (!this.combo) return;
    this.combo.deadline = Math.max(this.t + 0.5, this.combo.deadline - sec); // never below 0.5s (spec §17)
    this.emit({ type: 'drain', amount: sec, source: e ? e.id : null });
    this.noteInterference();
  }

  addGlitch(e, n) {
    if (this.relics.has('root_key')) { this.emit({ type: 'banner', text: 'CORRUPTION BLOCKED', sub: { k: '{r}', p: { r: { relic: 'root_key' } } }, tone: 'good' }); return; }
    for (let i = 0; i < n; i++) {
      const uid = `g${++this.uidCounter}`;
      this.cards.set(uid, { uid, id: 'glitch', up: false, temp: true });
      const pos = this.rng.int(Math.max(1, Math.ceil(this.draw.length / 2)) + 1);
      this.draw.splice(pos, 0, uid);
    }
    this.emit({ type: 'glitch', n, source: e ? e.id : null });
    this.noteInterference();
  }

  bleedContext(e) {
    if (this.combo) {
      this.combo.variant = this.rng.pick(['A', 'B']);
      this.combo.rank = Math.min(8, this.combo.rank + 1);
      this.emit({ type: 'bleed', variant: this.combo.variant, rank: this.combo.rank, source: e.id });
      this.noteInterference();
    } else this.scrambleCards(e, 3, 'both');
  }

  coreCounter(e, it) {
    const arch = this.profileArch;
    const tgt = it.target;
    switch (arch) {
      case 'ladder': if (this.combo) this.drainFlow(e, 1.5); else this.lockCards(e, 2); break;
      case 'cashout': this.payoutSealUntil = this.t + 8; this.emit({ type: 'banner', text: 'PAYOUT SEALED', sub: 'Cash Out halved for 8s', tone: 'bad' }); this.hitAll(e, this.edmg(e, 6)); break;
      case 'guard': this.hitParty(e, tgt, this.edmg(e, 14), { pierce: true }); break;
      case 'churn': this.snareChurn(e, 5, 2); this.hitParty(e, tgt, this.edmg(e, 8)); break;
      case 'variantA': case 'variantB': this.scrambleCards(e, 3, 'suit'); this.hitParty(e, tgt, this.edmg(e, 6)); break;
      case 'relay': this.lockCards(e, 2); this.hitParty(e, tgt, this.edmg(e, 6)); break;
      case 'momentum': { const n = this.available(); this.momentum -= n; this.emit({ type: 'momentum', delta: -n, why: 'Siphoned' }); this.hitAll(e, this.edmg(e, 4 + n)); break; }
      case 'flow': if (this.combo) this.drainFlow(e, 1.5); else this.hitAll(e, this.edmg(e, 8)); break;
      case 'reserve': this.latchReserve(e); this.latchReserve(e); break;
      case 'interference': this.lockCards(e, 2); this.scrambleCards(e, 2, 'both'); break;
      default: this.hitAll(e, this.edmg(e, 10));
    }
  }

  enemyAct(e) {
    const def = ENEMIES[e.id];
    const it = e.intent;
    const idef = def.intents[it.key];
    this.emit({ type: 'enemyAct', uid: e.uid, id: e.id, key: it.key, kind: it.kind, name: it.name, target: it.target, pstate: this.playerState() });
    idef.exec(e, this, it);
    if (e.flags.rootAccess && this.phase !== 'END') this.addGlitch(e, 1);
    if (this.trait === 'STATIC' && this.phase !== 'END' && it.kind !== 'lock' && this.rng.chance(0.25)) this.lockCards(e, 1);
    if (e.tier === 'boss' && this.phase !== 'END') {
      if (this.adaptOn('momentum_drain') && this.available() > 0) {
        const n = Math.min(2, this.available());
        this.momentum -= n;
        this.emit({ type: 'momentum', delta: -n, why: 'Siphon' });
      }
      if (this.adaptOn('reserve_seal')) this.reserveLatchUntil = Math.max(this.reserveLatchUntil, this.t + 3);
      if (e.flags.regenGuard) this.enemyGuard(e, 6);
    }
    e.actCount++;
    if (e.alive) this.chooseIntent(e);
    // an enemy action may have changed what the queued commands rely on (The Corruptor's Context Bleed
    // raises the chain's rank): waiting commands that no longer fit go back at once, never executing
    if (this.phase !== 'END' && this.queue.length) { this.revalidateQueue(); this.abortEmptyChain(); }
  }

  enemySpeed(e) {
    let s = RULES.ENEMY_PACE[this.act] || 1;
    if ((e.st.shock || 0) > 0) s *= 0.65;
    if (e.hasteUntil > this.t) s *= e.hasteMult;
    if (this.trait === 'HOTWIRE') s *= 1.15;
    if (this.trait === 'QUIET_CHANNEL') s *= 0.85;
    if (this.tutorial) s *= 0.6;
    if (this.opts.assist) s *= 0.75;
    if (e.flags.prepHaste) s *= e.flags.prepHaste;
    return s;
  }

  // ───────────────────────── time ─────────────────────────
  update(dt) {
    if (this.phase === 'END') return;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-6 && this.phase !== 'END') {
      const step = Math.min(remaining, 1 / 60);
      remaining -= step;
      if (this.hold > 0) {
        this.hold = Math.max(0, this.hold - step);
        continue;
      }
      this.step(step);
    }
  }

  step(dt) {
    this.t += dt;
    const t = this.t;
    // time by player state (R2/R3 measurements) and hero Recovery
    const pst = this.playerState();
    if (this.stats.time[pst] !== undefined) this.stats.time[pst] += dt;
    const rec = this.party.filter((p) => this.heroes[p.id].recoverUntil > t).length;
    this.stats.recoverTime += rec * dt;
    if (rec === this.party.length) this.stats.allRecovering += dt;
    const c = this.combo;
    if (this.phase === 'ACTIVE' && c) {
      // the decision window is held while a command executes and during the post-card/Relay holds:
      // the deadline moves with the clock (the cap moves with it in flowCap)
      const held = this.executing ? dt : Math.max(0, Math.min(dt, c.graceUntil - (t - dt)));
      if (held > 0) {
        c.deadline += held;
        c.graceUsed += held;
      }
      if (!this.executing && t >= c.deadline && !c.pendingEnd) this.requestEnd('forced');
    }
    if (this.phase === 'RECOVER' && t >= this.breatherUntil) {
      this.phase = 'PRE';
      this.emit({ type: 'ready' });
    }
    for (const p of this.party) {
      const h = this.heroes[p.id];
      if (!h.readyNoted && h.recoverUntil <= t) {
        h.readyNoted = true;
        this.emit({ type: 'heroReady', who: p.id });
      }
    }
    this.processQueue();
    if (this.phase === 'END') return;
    this.stats.queuePeak = Math.max(this.stats.queuePeak, this.queue.length);
    for (const uid of Object.keys(this.locks)) {
      if (this.locks[uid].until <= t) {
        this.unlock(uid);
        if (this.relics.has('regent_mainspring')) this.gainMomentum(1, 'Mainspring');
      }
    }
    for (const uid of Object.keys(this.temp)) {
      if (this.temp[uid].until <= t) {
        delete this.temp[uid];
        this.emit({ type: 'unscramble', uid });
      }
    }
    let jamEnded = false;
    for (const k of Object.keys(this.jams)) if (this.jams[k].until <= t) { delete this.jams[k]; jamEnded = true; this.emit({ type: 'unjam', slot: +k }); }
    if (jamEnded) this.refill();

    // guard decay
    if (this.guard > 0 && t > this.guardHoldUntil && t - this.lastGuardT > RULES.GUARD_DECAY_DELAY) {
      let rate = RULES.GUARD_DECAY_RATE;
      if (this.relics.has('quiet_coil')) rate *= 0.5;
      if (this.mutations.has('bastion_protocol')) rate *= 0.5;
      this.guard = Math.max(0, this.guard - rate * dt);
    }
    // churn regen
    if (this.churn.charges < this.churnMax()) {
      this.churn.regen += dt * (this.relics.has('churn_gear') ? 1.3 : 1);
      if (this.churn.regen >= RULES.CHURN_REGEN) {
        this.churn.regen = 0;
        this.churn.charges++;
        this.emit({ type: 'churnGain', n: 1 });
      }
    } else this.churn.regen = 0;

    // enemy statuses
    for (const e of this.enemies) {
      if (!e.alive) continue;
      for (const k of ['exposed', 'weak', 'shock', 'parry']) if (e.st[k] > 0) e.st[k] = Math.max(0, e.st[k] - dt);
      if (e.guard > 0) e.guard = Math.max(0, e.guard - (e.tier === 'boss' ? 0.4 : 0.5) * dt);
      if (e.st.scorch > 0) {
        e.st.scorchT -= dt;
        if (e.st.scorchT <= 0) {
          e.st.scorchT = 1.5;
          const s = e.st.scorch;
          e.st.scorch = s - 1;
          this.dealDamage(e, s, { src: null, pierce: true, tag: 'scorch' });
          if (!e.alive || this.phase === 'END') continue;
        }
      }
    }
    if (this.phase === 'END') return;
    // enemy ATB: it waits during the breather after a combo, and two enemies never act within
    // ENEMY_SPACING of each other (a full bar holds until then; the bar shows it as ready)
    if (this.phase !== 'RECOVER') {
      // Tactical timing: while a chain is open and the player is choosing (nothing executing or
      // queued) enemies fill their bars at a quarter speed. Hero Recovery never slows them.
      const slow = this.tactical && this.phase === 'ACTIVE' && !this.executing && !this.queue.length ? RULES.TACTICAL_ATB : 1;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.atb = Math.min(1, e.atb + (dt / e.actTime) * this.enemySpeed(e) * slow);
      }
      if (t - this.lastEnemyActT >= RULES.ENEMY_SPACING) {
        // the enemy that has waited longest at full goes first
        for (const e of this.enemies) if (e.alive && e.atb >= 1 && !e.readyAt) e.readyAt = t;
        const e = this.enemies.filter((x) => x.alive && x.atb >= 1).sort((a, b) => a.readyAt - b.readyAt)[0];
        if (e) {
          e.atb = 0;
          e.readyAt = 0;
          this.lastEnemyActT = t;
          this.enemyAct(e);
          if (this.phase === 'END') return;
        }
      } else for (const e of this.enemies) if (e.alive && e.atb >= 1 && !e.readyAt) e.readyAt = t;
    }
    this.checkEnd();
  }

  checkEnd() {
    if (this.phase === 'END') return;
    let victory = null;
    if (this.hp <= 0) victory = false;
    else if (this.enemies.every((e) => !e.alive)) victory = true;
    if (victory === null) return;
    this.phase = 'END';
    this.endCleanup();
    this.combo = null;
    this.result = { victory };
    this.emit({ type: victory ? 'victory' : 'defeat' });
  }
  // Victory or defeat mid-queue (spec §16): waiting commands are cancelled (cards back, no rewards);
  // a command that started but has not resolved keeps its card out of play (to the discard pile)
  // and never resolves.
  endCleanup() {
    this.cancelAll('battleEnd');
    const x = this.executing;
    if (x && !x.resolved && x.cmd.uid) {
      if (x.cmd.slot >= 0) this.heldSlots.delete(x.cmd.slot);
      this.discard.push(x.cmd.uid);
    }
    // a command still in its follow-through when the battle ends (e.g. a support whose effect landed
    // before an enemy's final hit) is over too; one resolving right now is cleared by processQueue
    if (x && (!x.resolved || !this.resolvingCmd)) this.executing = null;
  }

  // Summary for run bookkeeping after the battle.
  outcome() {
    return {
      victory: !!(this.result && this.result.victory),
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: this.maxHp,
      stats: this.stats,
      scrapBonus: this.scrapEarned,
      enemies: this.enemies.map((e) => e.id),
      exFound: [...this.exFound],
    };
  }
}
