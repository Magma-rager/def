// SIGNAL//BREAK — authoritative Relay combat engine.
// Pure logic: no DOM, no rendering. The view reads state and drains `events` for presentation.
// All timing uses this.t (combat seconds), advanced only by update(); pausing = not calling update().
import { CARDS, cardValue, HERO_ANIM, isOffensive } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { RNG } from '../core/rng.js';

// Timing values marked "prototype" were set by the beta-feedback patch (players had too little time
// to read a new hand and build a combo, and enemies acted too often). They are starting points for
// human playtesting, not settled balance.
export const RULES = {
  HAND: 6,
  FLOW_INITIAL: 5.0, // prototype (was 3.0)
  FLOW_READ_GRACE: 1.2, // prototype: Flow holds this long after a combo's first card, while the next one is chosen
  FLOW_CARD_HOLD: 0.7, // prototype: and this long after every other valid card, while its attack plays (0.5-0.7s) and the new card slides in
  FLOW_REFUND: 1.0, // prototype (was 0.18, then 0.8): per valid card
  FLOW_REFUND_MAX: 5.0, // prototype (was 1.2): per combo
  FLOW_ABS_MAX: 14, // prototype (was 6.2): longest combo, counted from the opener, not counting the grace
  FLOW_BAR_SECONDS: 8, // the Flow bar's full width
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
    this.queue = [];
    this.reserved = 0;
    this.cmdSeq = 0;
    this.heldSlots = new Set(); // hand slots whose card is in the queue (they do not refill)

    // ── party: three heroes, one HP pool (heroes never fall; defeat is the pool reaching 0) ──
    this.party = opts.party.map((p) => ({ id: p.id, name: PARTY_DEFS[p.id].name, def: RULES.DEFENSE[p.id] || 0, st: {} }));
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
      damage: 0, maxHit: 0, combos: 0, perfect: 0, cashouts: 0, forced: 0, longest: 0, churns: 0, stashes: 0,
      reservePlays: 0, relays: 0, crosses: 0, steps: 0, guardGained: 0, guardAbsorbed: 0, interference: 0,
      variantPlays: { A: 0, B: 0, EX: 0 }, cardsPlayed: 0, momentumSpent: 0, flowGained: 0, longCombos: 0,
      stumbles: 0, damageTaken: 0, interferencePayoffs: 0, bestComboDamage: 0, finishers: 0,
      basics: 0, artes: 0, supports: 0, momentumGained: 0, rejected: 0, byHero: { V: 0, C: 0, S: 0 }, strandedChurns: 0,
    };

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
  // The hero who would perform a neutral card now: the combo's hero, or the selected hero.
  performer() {
    return this.combo ? this.combo.hero : this.selected;
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
    let r = d.rank + (inst.rankMod || 0);
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
  flowHeld() {
    return !!(this.combo && this.combo.graceUntil > this.t);
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

  // ───────────────────────── legality ─────────────────────────
  // Single source of truth for "can this card be played right now" (docs/COMBAT_SPEC.md §8.2, §10).
  // The hand, the Reserve, keyboard input, the bots and the tests all use it.
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
    if (this.phase === 'RECOVER') return { ok: false, reason: 'recover', text: 'Recovering' };
    const cost = d.cost || 0;
    const short = () => ({ ok: false, reason: 'momentum', text: { k: 'Needs {n} Momentum', p: { n: cost } } });
    // support: independent of combos; performed by its owner, or by the selected hero when neutral
    if (d.category === 'support') {
      if (this.available() < cost) return short();
      return { ok: true, kind: 'support', zone, category: 'support', hero: d.owner || this.performer() };
    }
    const rank = this.effRank(uid);
    if (this.phase === 'PRE') {
      // a combo starts with a basic attack, performed by the selected hero
      if (d.category === 'arte') return { ok: false, reason: 'needbasic', text: 'Basic attack first' };
      return { ok: true, kind: 'open', zone, category: 'basic', hero: this.selected, step: false, cross: false };
    }
    // ACTIVE: the next offensive card of the combo's hero
    const c = this.combo;
    if (d.category === 'arte') {
      if (d.owner !== c.hero) return { ok: false, reason: 'owner', text: { k: '{hero} only', p: { hero: { hero: d.owner } } } };
      if (!c.hasBasic) return { ok: false, reason: 'needbasic', text: 'Basic attack first' };
    }
    const r = seqCheck(c.rank, c.variant, rank, this.effVariant(uid), this.crossIsStep());
    if (!r.ok) return { ok: false, reason: 'rank', text: { k: 'Needs rank {n}+', p: { n: c.rank + 1 } } };
    if (this.available() < cost) return short();
    return { ok: true, kind: r.kind, step: r.step, cross: r.cross, zone, category: d.category, hero: c.hero };
  }

  // Cash Out: 2+ cards and the last one is not an arte (an arte ends the combo as a Perfect instead).
  canCashOut() {
    return this.phase === 'ACTIVE' && this.combo && this.combo.cards.length >= RULES.CASHOUT_MIN && !this.lastIsArte();
  }
  canFinish() {
    return this.phase === 'ACTIVE' && this.lastIsArte();
  }
  // A hand with nothing playable before a combo (for example only artes, which need a basic attack
  // first, or support the party cannot afford) must not strand the player: until something is
  // playable, Churn costs no charge (prototype, docs/COMBAT_SPEC.md §25).
  stranded() {
    if (this.phase !== 'PRE') return false;
    const held = [...this.hand, ...this.reserve].filter(Boolean);
    if (!held.length || !this.hand.some((u) => u && !this.isLocked(u))) return false;
    return !held.some((u) => this.check(u).ok);
  }

  // Whether the combo's hero still has an offensive card that is playable now.
  hasContinuation() {
    for (const u of [...this.hand, ...this.reserve]) {
      if (!u) continue;
      const d = this.def(u);
      if (d && isOffensive(d) && this.check(u).ok) return true;
    }
    return false;
  }

  // Phase 4 hero selector: who performs neutral basic attacks and starts the next combo. A combo
  // keeps its hero until it ends (handing over to another hero is the Phase 5 Relay command).
  selectHero(id) {
    if (!this.member(id) || this.phase === 'END') return { ok: false };
    if (this.combo && this.combo.hero !== id) {
      const text = 'Finish this combo to switch heroes';
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
  // card's slot refills, other cards stay. When the draw pile is empty the discard pile is shuffled in.
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
  // Integrity: every card instance lives in exactly one zone.
  verifyZones() {
    const seen = new Map();
    const zones = { draw: this.draw, hand: this.hand.filter(Boolean), reserve: this.reserve, queue: this.queue.map((q) => q.uid), discard: this.discard, exhaust: this.exhaust };
    for (const [z, arr] of Object.entries(zones)) {
      for (const u of arr) {
        if (seen.has(u)) return { ok: false, error: `duplicate ${u} in ${seen.get(u)} and ${z}` };
        if (!this.cards.has(u)) return { ok: false, error: `unknown card ${u} in ${z}` };
        seen.set(u, z);
      }
    }
    for (const u of this.cards.keys()) if (!seen.has(u)) return { ok: false, error: `missing ${u}` };
    if (this.hand.length !== RULES.HAND) return { ok: false, error: 'hand size changed' };
    if (this.reserved !== this.queue.reduce((a, q) => a + q.cost, 0)) return { ok: false, error: 'reservations out of step with the queue' };
    return { ok: true };
  }

  // ───────────────────────── commands ─────────────────────────
  // commit: validate, move the card from its slot (or Reserve) into the queue, reserve its cost.
  commit(uid) {
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
    const cmd = { id: ++this.cmdSeq, uid, zone: chk.zone, slot, cost: d.cost || 0, chk, hero: chk.hero };
    this.reserved += cmd.cost;
    this.queue.push(cmd);
    return { ok: true, cmd, chk };
  }
  // cancel: an unstarted command returns its card where it came from and releases its reservation;
  // nothing else happens (no effect, no Momentum gained).
  cancel(cmd) {
    const i = this.queue.indexOf(cmd);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    this.reserved -= cmd.cost;
    if (cmd.zone === 'hand') {
      this.heldSlots.delete(cmd.slot);
      if (this.hand[cmd.slot] === null) this.hand[cmd.slot] = cmd.uid;
      else this.discard.push(cmd.uid);
    } else if (this.reserve.length < this.reserveMax()) this.reserve.push(cmd.uid);
    else this.discard.push(cmd.uid);
    this.emit({ type: 'cancel', uid: cmd.uid });
    return true;
  }
  cancelAll() {
    for (const q of [...this.queue]) this.cancel(q);
  }
  // execute: spend the reservation, resolve the card, then gains; the card goes to discard and its
  // slot refills.
  execute(cmd) {
    const i = this.queue.indexOf(cmd);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    if (cmd.slot >= 0) this.heldSlots.delete(cmd.slot);
    this.reserved -= cmd.cost;
    if (cmd.cost > 0) {
      this.momentum -= cmd.cost;
      this.stats.momentumSpent += cmd.cost;
      if (this.adaptOn('momentum_drain')) this.adaptProgress(cmd.cost);
      this.emit({ type: 'momentum', delta: -cmd.cost, why: CARDS[this.cards.get(cmd.uid).id].name });
    }
    if (this.def(cmd.uid).category === 'support') this.resolveSupport(cmd);
    else this.resolveCard(cmd);
    return true;
  }

  // ───────────────────────── player actions ─────────────────────────
  playCard(uid) {
    const r = this.commit(uid);
    if (!r.ok) return r.chk;
    this.execute(r.cmd);
    this.checkEnd();
    return r.chk;
  }

  stumble(uid, chk) {
    this.stats.rejected++;
    this.emit({ type: 'reject', uid, reason: chk.reason, text: chk.text });
    if (this.phase !== 'ACTIVE' || !SEQ_REASONS.has(chk.reason)) return;
    const c = this.combo;
    c.stumbles++;
    this.stats.stumbles++;
    c.deadline = Math.max(this.t + 0.15, c.deadline - RULES.STUMBLE_FLOW);
    if (this.available() > 0) this.momentum -= 1;
    this.emit({ type: 'stumble', uid, n: c.stumbles });
    if (c.stumbles >= RULES.MAX_STUMBLES) this.finishCombo(this.lastIsArte() ? 'perfect' : 'forced');
  }

  startCombo(hero) {
    const extra = this.firstCombo && this.relics.has('stopwatch_gear') ? 1.0 : 0;
    this.firstCombo = false;
    this.combo = {
      start: this.t,
      deadline: Math.min(this.t + RULES.FLOW_INITIAL + extra, this.t + RULES.FLOW_ABS_MAX),
      graceUntil: 0, graceUsed: 0, hero, owner: hero, hasBasic: false, artes: 0,
      refundUsed: 0, cards: [], rank: 0, variant: null, relays: 0, crosses: 0, steps: 0, climbs: 0,
      damage: 0, guardGained: 0, stumbles: 0, owners: [hero], suits: [], stepBonus: 0, refundBonus: 0,
      relayEcho: 0, relayEchoUsed: false, nextRelayEcho: 0, cashPct: 0, cashPerCard: 0, stored: [], pendingBonus: 0,
      harness: 0, closeAsCashOut: false, churned: false, len: 0,
    };
    this.phase = 'ACTIVE';
    this.emit({ type: 'comboStart', deadline: this.combo.deadline, hero });
  }

  naturalRefund(entryIndex, times = 1) {
    const c = this.combo;
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

  addFlow(sec) {
    if (!this.combo) return 0;
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

  // A basic attack or arte executing as the next card of the combo (starting one if none is running).
  resolveCard(cmd) {
    const uid = cmd.uid;
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const fromReserve = cmd.zone === 'reserve';
    const rank = this.effRank(uid);
    const variant = this.effVariant(uid);
    const wasLocked = this.wasLocked.has(uid);
    this.wasLocked.delete(uid);
    const disruptedAtPlay = this.disruptedCount() > 0;
    const scrambledAtPlay = this.isScrambled(uid);

    const isOpen = !this.combo;
    if (isOpen) this.startCombo(cmd.hero);
    const c = this.combo;
    const hero = c.hero;
    const first = c.cards.length === 0;
    const seq = first ? { step: false, cross: false, kind: 'open' } : seqCheck(c.rank, c.variant, rank, variant, this.crossIsStep());
    const entry = {
      uid, id: d.id, name: d.name, owner: hero, cardOwner: d.owner, category: d.category, rank, variant,
      kind: seq.kind, step: !!seq.step, cross: !!seq.cross, relay: false, fromReserve, dmg: 0, spent: cmd.cost, wasLocked, index: c.cards.length,
    };
    c.cards.push(entry);
    c.len = c.cards.length;
    if (!c.suits.includes(variant)) c.suits.push(variant);
    if (entry.step) { c.steps++; this.stats.steps++; }
    if (entry.cross) { c.crosses++; this.stats.crosses++; }
    if (!entry.step && !entry.cross && !first) c.climbs++;
    if (d.category === 'basic') { c.hasBasic = true; this.stats.basics++; } else { c.artes++; this.stats.artes++; }
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
    if (!first) this.naturalRefund(entry.index);

    const pendingBonus = c.pendingBonus;
    c.pendingBonus = 0;

    this.emit({
      type: 'act', who: hero, anim: d.owner ? d.anim : HERO_ANIM[hero], card: d.name, id: d.id, category: d.category, rank, variant,
      kind: entry.kind, step: entry.step, cross: entry.cross, relay: false, big: d.category === 'arte', all: false, fromReserve,
    });

    // first-hit bonuses
    let bonus = pendingBonus;
    if (inst.graft === 'keen') bonus += 3;
    if (variant === 'EX' && this.relics.has('prism_lens')) bonus += 3;
    if (fromReserve && this.relics.has('spare_pockets')) bonus += 3;
    if (fromReserve && this.mutations.has('deep_pockets')) bonus += 4;
    if (entry.cross && this.mutations.has('duality_engine')) bonus += 4;
    if (scrambledAtPlay && this.relics.has('root_key')) bonus += 4;

    let mult = 1;
    if (fromReserve && inst.graft === 'cached') mult *= 1.5;
    if (wasLocked && this.mutations.has('signal_thief')) mult *= 1.5;

    const api = this.makeApi(entry, inst, d, { mult, bonus, echoing: false, disruptedAtPlay, ctx: c });
    d.fx(api);
    this.coverCheck(d);

    // gains on resolution (docs/COMBAT_SPEC.md §11.1): basic attacks by strength, Crosses, grafts
    if (d.category === 'basic') this.gainMomentum(d.gain || 0, 'Basic');
    if (entry.cross) this.gainMomentum(1 + (this.relics.has('twin_dials') ? 1 : 0) + (this.mutations.has('duality_engine') ? 1 : 0), 'Cross');
    if (inst.graft === 'spark') this.gainMomentum(1, 'Spark');
    if (inst.graft === 'quick') this.addFlow(0.5);
    if (inst.graft === 'plated') this.addGuard(3);
    if (fromReserve && this.mutations.has('deep_pockets')) this.gainMomentum(1, 'Reserve');
    if (d.category === 'basic' && this.relics.has('iron_filings')) this.addGuard(1);

    // step payoffs
    if (entry.step) {
      const sb = c.stepBonus + (this.relics.has('ladder_rungs') ? 3 : 0) + (this.mutations.has('ascendant_ladder') ? 3 : 0);
      const tgt = this.currentTarget();
      if (sb > 0 && tgt) this.dealDamage(tgt, sb, { src: hero, entry, tag: 'step' });
    }

    // card to discard (temp cards are deleted)
    if (d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);

    if (this.phase === 'END' || this.combo !== c) return; // fx may have ended the battle or the combo
    this.refill();
    // the first card: Flow holds while the next one is chosen; later cards: while each plays out
    if (first) {
      c.graceUntil = this.t + RULES.FLOW_READ_GRACE;
      this.emit({ type: 'flowHold', until: c.graceUntil });
    } else c.graceUntil = Math.max(c.graceUntil, this.t + RULES.FLOW_CARD_HOLD);

    // endings (docs/COMBAT_SPEC.md §12): an arte ends the combo as a Perfect unless the hero can still
    // add a higher card (then FINISH, the clock, or that card decide)
    if (d.category === 'arte') {
      if (c.closeAsCashOut) { this.payout(1); if (this.phase !== 'END') this.finishCombo('cashout'); }
      else if (!this.hasContinuation()) this.finishCombo('perfect');
    } else if (c.deadline <= this.t) this.finishCombo('forced');
  }

  // A support card: not part of any combo (it neither starts, extends, ends nor pauses one).
  // Phase 4 bridge (docs/COMBAT_SPEC.md §10): it executes at once, performed by its owner or the
  // selected hero; Phase 5 adds the performer's Recovery and the queue.
  resolveSupport(cmd) {
    const uid = cmd.uid;
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const fromReserve = cmd.zone === 'reserve';
    const hero = cmd.hero;
    const ctx = this.combo || { cards: [], len: 0, damage: 0, rank: 0, variant: null, owners: [hero], suits: [], stored: [], steps: 0, crosses: 0, relays: 0 };
    const entry = { uid, id: d.id, name: d.name, owner: hero, cardOwner: d.owner, category: 'support', rank: 0, variant: null, kind: 'support', step: false, cross: false, relay: false, fromReserve, dmg: 0, spent: cmd.cost, index: -1 };
    this.stats.supports++;
    this.stats.byHero[hero]++;
    this.stats.cardsPlayed++;
    if (fromReserve) this.stats.reservePlays++;
    this.emit({ type: 'act', who: hero, anim: d.anim, card: d.name, id: d.id, category: 'support', big: false, all: false, fromReserve });
    let mult = 1;
    if (fromReserve && inst.graft === 'cached') mult *= 1.5;
    const api = this.makeApi(entry, inst, d, { mult, bonus: 0, echoing: false, ctx });
    d.fx(api);
    this.coverCheck(d);
    if (inst.graft === 'spark') this.gainMomentum(1, 'Spark');
    if (inst.graft === 'quick') this.addFlow(0.5);
    if (inst.graft === 'plated') this.addGuard(3);
    if (d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);
    if (this.phase === 'END') return;
    this.refill();
  }

  // Finish the combo after an arte (the FINISH button): a Perfect.
  finishChain() {
    if (!this.canFinish()) {
      this.emit({ type: 'reject', reason: 'finish', text: this.phase === 'ACTIVE' ? 'Play an arte to finish' : 'No combo running' });
      return { ok: false };
    }
    this.finishCombo('perfect');
    this.checkEnd();
    return { ok: true };
  }
  // the end-of-combo button: FINISH after an arte, CASH OUT otherwise
  finishOrCashOut() {
    return this.canFinish() ? this.finishChain() : this.cashOut();
  }

  // Braced (docs/COMBAT_SPEC.md §4.5): the hero the most imminent single-target enemy attack will
  // land on (after Cover), else the hero last hit, else the performer.
  braceTarget() {
    let best = null;
    for (const e of this.aliveEnemies()) {
      const it = e.intent;
      if (it && it.dmg > 0 && it.target && it.kind !== 'aoe' && (!best || e.atb > best.atb)) best = e;
    }
    if (best) return this.hitTarget(best.intent.target);
    return this.member(this.lastHitHero) || this.member(this.performer());
  }
  brace(sec) {
    const p = this.braceTarget();
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
      flow: (s) => { if (!echoing) self.addFlow(s); },
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
      spendMomentum() {
        if (echoing) return entry.spentAll || 0;
        const n = self.available();
        self.momentum -= n;
        entry.spentAll = n;
        entry.spent = n;
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
      brace: (sec) => (echoing ? null : self.brace(sec)),
      stashBestArte() {
        if (echoing) return false;
        if (self.reserve.length >= self.reserveMax() || self.reserveLatchUntil > self.t) return false;
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
    if (!junk) {
      this.stats.churns++;
      if (this.combo) this.combo.churned = true;
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
    this.checkEnd();
    return { ok: true };
  }

  canStash(uid) {
    if (this.phase === 'END') return false;
    return this.hand.includes(uid) && this.reserve.length < this.reserveMax() && this.reserveLatchUntil <= this.t
      && !this.isLocked(uid) && this.categoryOf(uid) !== 'junk';
  }

  stash(uid) {
    if (!this.canStash(uid)) {
      const text = this.reserveLatchUntil > this.t ? 'Reserve sealed' : this.reserve.length >= this.reserveMax() ? 'Reserve full' : 'Cannot stash';
      this.emit({ type: 'reject', uid, reason: 'stash', text });
      return { ok: false, text };
    }
    const slot = this.hand.indexOf(uid);
    this.hand[slot] = null;
    this.reserve.push(uid);
    this.stats.stashes++;
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
    this.addFlow(this.flowSpendAmount());
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
    if (!this.canCashOut()) {
      this.emit({ type: 'reject', reason: 'cashout', text: this.phase === 'ACTIVE' ? (this.lastIsArte() ? 'Play an arte to finish' : 'Needs 2+ cards') : 'No combo running' });
      return { ok: false };
    }
    this.payout(1);
    if (this.phase !== 'END') this.finishCombo('cashout');
    this.checkEnd();
    return { ok: true };
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
    let amt = 4 + 3 * len + c.rank + (c.cashPerCard || 0) * len + ledger;
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
    this.emit({ type: 'cashout', amount: p.amount, quick: p.quick, scale, who: c.owner });
    if (tgt) this.dealDamage(tgt, p.amount, { src: c.owner, tag: 'cashout', pierce: false, cashout: true });
    this.addGuard(p.guard);
    if (p.quick && this.mutations.has('quick_exit')) this.gainMomentum(2, 'Quick Cash');
  }

  finishCombo(type) {
    const c = this.combo;
    if (!c) return;
    this.cancelAll(); // commands that have not started are cancelled (docs/COMBAT_SPEC.md §16)
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
    const summary = {
      type, len: c.cards.length, relays: c.relays, crosses: c.crosses, steps: c.steps, damage: c.damage,
      openerSuit: c.cards[0] ? c.cards[0].variant : null,
      openerStrength: c.cards[0] && c.cards[0].category === 'basic' ? CARDS[c.cards[0].id].rank : null,
      closerId: type === 'perfect' && this.lastIsArte() ? c.cards[c.cards.length - 1].id : null,
      owners: c.owners.length, duration, churned: c.churned, maxRank: Math.max(...c.cards.map((e) => e.rank)),
      strongest: Math.max(0, ...c.cards.map((e) => e.dmg)),
    };
    this.history.push(summary);
    this.trackAdaptation(summary);
    this.updateCitation(summary);
    this.emit({ type: 'comboEnd', kind: type, len: summary.len, damage: c.damage, finisher, quick: !!c.quick, relays: c.relays, owners: c.owners.slice(), hero: c.hero });
    this.combo = null;
    if (this.phase === 'END') return;
    this.phase = 'RECOVER';
    this.recoverUntil = this.t + RULES.RECOVER[type];
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
    if (o.entry && this.adapt && !this.adapt.broken) {
      if (this.adaptOn('suit_filter_A') && o.entry.variant === 'A') a *= 0.7;
      if (this.adaptOn('suit_filter_B') && o.entry.variant === 'B') a *= 0.7;
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

  summon(id, src) {
    if (this.aliveEnemies().length >= 4) return null;
    const e = this.spawnEnemy(id, { hpMult: this.hpMult, dmgMult: this.dmgMultBase, summoned: true });
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

  drainFlow(e, sec) {
    if (!this.combo) return;
    this.combo.deadline = Math.max(this.t + 0.25, this.combo.deadline - sec);
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
    this.emit({ type: 'enemyAct', uid: e.uid, id: e.id, key: it.key, kind: it.kind, name: it.name, target: it.target });
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
    if (this.phase === 'ACTIVE' && this.combo && this.combo.graceUntil > t - dt) {
      // Flow is held: move the deadline with the clock (the cap moves with it in flowCap)
      const held = Math.min(dt, this.combo.graceUntil - (t - dt));
      this.combo.deadline += held;
      this.combo.graceUsed += held;
    }
    if (this.phase === 'ACTIVE' && this.combo && t >= this.combo.deadline) this.finishCombo(this.lastIsArte() ? 'perfect' : 'forced');
    if (this.phase === 'RECOVER' && t >= this.recoverUntil) {
      this.phase = 'PRE';
      this.emit({ type: 'ready' });
    }
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
      for (const e of this.enemies) {
        if (!e.alive) continue;
        e.atb = Math.min(1, e.atb + (dt / e.actTime) * this.enemySpeed(e));
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
    if (this.hp <= 0) {
      this.phase = 'END';
      this.combo = null;
      this.result = { victory: false };
      this.emit({ type: 'defeat' });
    } else if (this.enemies.every((e) => !e.alive)) {
      this.phase = 'END';
      this.combo = null;
      this.result = { victory: true };
      this.emit({ type: 'victory' });
    }
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
    };
  }
}
