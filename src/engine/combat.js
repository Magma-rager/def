// SIGNAL//BREAK — authoritative Relay combat engine.
// Pure logic: no DOM, no rendering. The view reads state and drains `events` for presentation.
// All timing uses this.t (combat seconds), advanced only by update(); pausing = not calling update().
import { CARDS, cardValue } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { RNG } from '../core/rng.js';

export const RULES = {
  HAND: 6,
  FLOW_INITIAL: 3.0,
  FLOW_REFUND: 0.18,
  FLOW_REFUND_MAX: 1.2,
  FLOW_ABS_MAX: 6.2,
  MOMENTUM_COST: 3,
  FLOW_SPEND: 0.6,
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
  RECOVER: { perfect: 0.45, cashout: 0.3, forced: 0.9 },
  GUARD_DECAY_DELAY: 2.0,
  GUARD_DECAY_RATE: 1.0,
  GUARD_CAP: 80,
  FINISHER_HOLD: 0.7,
};

const OPEN_ROLES = ['open'];
const CHAIN_ROLES = ['conv', 'close'];
const SEQ_REASONS = new Set(['rank', 'cross', 'role', 'needconv']);

export const PARTY_DEFS = {
  V: { name: 'Hessa', role: 'Vanguard' },
  C: { name: 'Corvin', role: 'Channeler' },
  S: { name: 'Pin', role: 'Striker' },
};

// Rank/suit continuation rule (pure, exported for UI hints and tests).
// Same suit (or either side EX): any higher rank.  Opposite suit (A<->B): exactly +1 ("Cross")
// (+1 or +2 with Wild Hinge).  "step" = same-suit exactly +1.
export function seqCheck(curRank, curVar, rank, variant, crossGap = 1) {
  if (rank <= curRank) return { ok: false, reason: 'rank' };
  if (curVar === 'EX' || variant === 'EX' || variant === curVar) {
    return { ok: true, kind: rank === curRank + 1 ? 'step' : 'climb' };
  }
  if (rank - curRank <= crossGap) return { ok: true, kind: 'cross' };
  return { ok: false, reason: 'cross' };
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
    this.phase = 'PRE';
    this.handMode = 'open';
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

    // ── party ──
    this.party = opts.party.map((p) => ({
      id: p.id, name: PARTY_DEFS[p.id].name, hp: p.hp, maxHp: p.maxHp, ko: p.hp <= 0, st: {},
    }));
    for (const p of this.party) if (p.ko) p.hp = 0;
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
  roleOf(uid) {
    const d = this.def(uid);
    return d ? d.role : null;
  }
  ownerKO(owner) {
    const p = this.party.find((x) => x.id === owner);
    return p ? p.ko : false;
  }
  // True when a standing ally owns at least one live card of this role. When none does,
  // knocked-out heroes' cards become playable by a stand-in so the party can always act.
  aliveRoleExists(role) {
    for (const [uid, inst] of this.cards) {
      const d = CARDS[inst.id];
      if (d.role === role && !this.ownerKO(d.owner) && !this.exhaust.includes(uid)) return true;
    }
    return false;
  }
  actorFor(owner) {
    if (!this.ownerKO(owner)) return owner;
    const p = this.party.find((x) => !x.ko);
    return p ? p.id : owner;
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
    return this.mutations.has('long_breath') ? 0.8 : RULES.FLOW_SPEND;
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
      this.emit({ type: 'banner', text: 'ADAPTATION BROKEN', sub: `${this.adapt.name} disabled`, tone: 'good' });
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
    if (d.role === 'junk') return 0;
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
  flowCap() {
    return this.combo ? this.combo.start + RULES.FLOW_ABS_MAX : 0;
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
  crossGap() {
    return this.relics.has('wild_hinge') ? 2 : 1;
  }

  // ───────────────────────── legality ─────────────────────────
  // Single source of truth for "can this card be played right now". The UI renders from this.
  check(uid) {
    const inst = this.cards.get(uid);
    if (!inst) return { ok: false, reason: 'missing', text: 'Missing card' };
    const d = CARDS[inst.id];
    const zone = this.hand.includes(uid) ? 'hand' : this.reserve.includes(uid) ? 'reserve' : null;
    if (!zone) return { ok: false, reason: 'zone', text: 'Not in hand' };
    if (this.phase === 'END') return { ok: false, reason: 'end', text: 'Battle over' };
    if (d.role === 'junk') return { ok: false, reason: 'junk', text: 'Glitch: swipe down' };
    if (zone === 'reserve' && this.reserveLatchUntil > this.t) return { ok: false, reason: 'latched', text: 'Reserve sealed' };
    if (this.isLocked(uid)) return { ok: false, reason: 'locked', text: `Locked ${this.lockLeft(uid).toFixed(1)}s` };
    if (this.ownerKO(d.owner) && this.aliveRoleExists(d.role)) return { ok: false, reason: 'ko', text: `${PARTY_DEFS[d.owner].name} is down` };
    if (this.phase === 'RECOVER') return { ok: false, reason: 'recover', text: 'Recovering' };
    if (this.phase === 'PRE') {
      if (d.role !== 'open') return { ok: false, reason: 'role', text: 'Needs an Opener' };
      return { ok: true, kind: 'open', zone };
    }
    // ACTIVE
    if (d.role === 'open') return { ok: false, reason: 'role', text: 'Combo running' };
    if (d.role === 'close' && this.combo.convCount < 1) return { ok: false, reason: 'needconv', text: 'Converter first' };
    const r = seqCheck(this.combo.rank, this.combo.variant, this.effRank(uid), this.effVariant(uid), this.crossGap());
    if (!r.ok) {
      return r.reason === 'rank'
        ? { ok: false, reason: 'rank', text: `Needs rank ${this.combo.rank + 1}+` }
        : { ok: false, reason: 'cross', text: `Cross needs rank ${this.combo.rank + 1}` };
    }
    return { ok: true, kind: r.kind, zone };
  }

  canCashOut() {
    return this.phase === 'ACTIVE' && this.combo && this.combo.cards.length >= RULES.CASHOUT_MIN;
  }

  // ───────────────────────── zones ─────────────────────────
  matchesRoles(uid, roles) {
    const d = this.def(uid);
    if (!d) return false;
    if (d.role === 'junk') return true;
    return roles.includes(d.role) && (!this.ownerKO(d.owner) || !this.aliveRoleExists(d.role));
  }
  drawMatching(roles, exclude) {
    let idx = this.draw.findIndex((u) => u !== exclude && this.matchesRoles(u, roles));
    if (idx < 0 && this.discard.length) {
      const pile = this.rng.shuffle(this.discard.splice(0));
      this.draw.push(...pile);
      this.emit({ type: 'reshuffle', n: pile.length });
      idx = this.draw.findIndex((u) => u !== exclude && this.matchesRoles(u, roles));
    }
    if (idx < 0) return null;
    return this.draw.splice(idx, 1)[0];
  }
  slotJammed(i) {
    const j = this.jams[i];
    return !!(j && j.until > this.t);
  }
  refill(exclude) {
    const roles = this.handMode === 'open' ? OPEN_ROLES : CHAIN_ROLES;
    for (let i = 0; i < RULES.HAND; i++) {
      if (this.hand[i] !== null || this.slotJammed(i)) continue;
      const uid = this.drawMatching(roles, exclude);
      if (!uid) continue;
      this.hand[i] = uid;
      if (this.trait === 'WILD_SIGNAL' && !this.wild.has(uid) && this.def(uid).role !== 'junk' && this.rng.chance(0.25)) this.wild.add(uid);
      this.emit({ type: 'draw', uid, slot: i });
    }
  }
  tuck(i) {
    const uid = this.hand[i];
    if (!uid) return;
    this.hand[i] = null;
    this.draw.push(uid);
    this.emit({ type: 'tuck', uid, slot: i });
  }
  transitionHand(mode) {
    this.handMode = mode;
    for (let i = 0; i < RULES.HAND; i++) {
      const uid = this.hand[i];
      if (!uid) continue;
      const role = this.roleOf(uid);
      if (role === 'junk') continue;
      const off = mode === 'open' ? role !== 'open' : role === 'open';
      if (off) this.tuck(i);
    }
    this.refill();
  }
  // Integrity: every card instance lives in exactly one zone.
  verifyZones() {
    const seen = new Map();
    const zones = { draw: this.draw, hand: this.hand.filter(Boolean), reserve: this.reserve, discard: this.discard, exhaust: this.exhaust };
    for (const [z, arr] of Object.entries(zones)) {
      for (const u of arr) {
        if (seen.has(u)) return { ok: false, error: `duplicate ${u} in ${seen.get(u)} and ${z}` };
        seen.set(u, z);
      }
    }
    for (const u of this.cards.keys()) if (!seen.has(u)) return { ok: false, error: `missing ${u}` };
    if (seen.size !== this.cards.size) return { ok: false, error: 'unknown card in zone' };
    return { ok: true };
  }

  // ───────────────────────── player actions ─────────────────────────
  playCard(uid) {
    const chk = this.check(uid);
    if (!chk.ok) {
      this.stumble(uid, chk);
      return chk;
    }
    this.resolveCard(uid, chk);
    this.checkEnd();
    return chk;
  }

  stumble(uid, chk) {
    this.emit({ type: 'reject', uid, reason: chk.reason, text: chk.text });
    if (this.phase !== 'ACTIVE' || !SEQ_REASONS.has(chk.reason)) return;
    const c = this.combo;
    c.stumbles++;
    this.stats.stumbles++;
    c.deadline = Math.max(this.t + 0.15, c.deadline - RULES.STUMBLE_FLOW);
    if (this.momentum > 0) this.momentum -= 1;
    this.emit({ type: 'stumble', uid, n: c.stumbles });
    if (c.stumbles >= RULES.MAX_STUMBLES) this.finishCombo('forced');
  }

  startCombo() {
    const extra = this.firstCombo && this.relics.has('stopwatch_gear') ? 1.0 : 0;
    this.firstCombo = false;
    this.combo = {
      start: this.t,
      deadline: Math.min(this.t + RULES.FLOW_INITIAL + extra, this.t + RULES.FLOW_ABS_MAX),
      refundUsed: 0, cards: [], rank: 0, variant: null, owner: null, relays: 0, crosses: 0, steps: 0, climbs: 0,
      convCount: 0, damage: 0, guardGained: 0, stumbles: 0, owners: [], suits: [], stepBonus: 0, refundBonus: 0,
      relayEcho: 0, relayEchoUsed: false, nextRelayEcho: 0, cashPct: 0, cashPerCard: 0, stored: [], pendingBonus: 0,
      harness: 0, closeAsCashOut: false, churned: false, len: 0,
    };
    this.phase = 'ACTIVE';
    this.emit({ type: 'comboStart', deadline: this.combo.deadline });
  }

  naturalRefund(entryIndex, times = 1) {
    const c = this.combo;
    let per = (this.relics.has('brass_metronome') ? 0.24 : RULES.FLOW_REFUND) + c.refundBonus;
    if (this.mutations.has('ascendant_ladder') && c.cards[entryIndex] && c.cards[entryIndex].kind === 'step') per += 0.06;
    if (this.adaptOn('long_chain') && entryIndex >= 4) per *= 0.5;
    const amt = Math.min(per * times, RULES.FLOW_REFUND_MAX - c.refundUsed);
    if (amt <= 0) return 0;
    c.refundUsed += amt;
    const before = c.deadline;
    c.deadline = Math.min(c.deadline + amt, c.start + RULES.FLOW_ABS_MAX);
    return c.deadline - before;
  }

  addFlow(sec) {
    if (!this.combo) return 0;
    if (this.adaptOn('flow_clamp')) sec *= 0.5;
    const before = this.combo.deadline;
    this.combo.deadline = Math.min(this.combo.deadline + sec, this.combo.start + RULES.FLOW_ABS_MAX);
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

  resolveCard(uid, chk) {
    const inst = this.cards.get(uid);
    const d = CARDS[inst.id];
    const fromReserve = chk.zone === 'reserve';
    const rank = this.effRank(uid);
    const variant = this.effVariant(uid);
    const wasLocked = this.wasLocked.has(uid);
    this.wasLocked.delete(uid);
    const disruptedAtPlay = this.disruptedCount() > 0;
    const scrambledAtPlay = this.isScrambled(uid);
    // remove from its zone
    if (fromReserve) this.reserve.splice(this.reserve.indexOf(uid), 1);
    else this.hand[this.hand.indexOf(uid)] = null;

    const isOpen = this.phase === 'PRE';
    if (isOpen) this.startCombo();
    const c = this.combo;
    const owner = this.actorFor(d.owner);
    const relay = c.owner !== null && c.owner !== owner;
    const kind = isOpen ? 'open' : chk.kind;
    const entry = {
      uid, id: d.id, name: d.name, owner, role: d.role, rank, variant, kind, relay, fromReserve,
      dmg: 0, spent: 0, wasLocked, index: c.cards.length,
    };
    c.cards.push(entry);
    c.len = c.cards.length;
    if (!c.owners.includes(owner)) c.owners.push(owner);
    if (!c.suits.includes(variant)) c.suits.push(variant);
    if (kind === 'step') { c.steps++; this.stats.steps++; }
    if (kind === 'cross') { c.crosses++; this.stats.crosses++; }
    if (kind === 'climb') c.climbs++;
    if (relay) { c.relays++; this.stats.relays++; }
    if (d.role === 'conv') c.convCount++;
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
    c.owner = owner;
    if (!isOpen) this.naturalRefund(entry.index);

    // sequencing momentum
    if (relay) {
      if (!this.adaptOn('relay_jam')) this.gainMomentum(1, 'Relay');
      this.emit({ type: 'relay', to: owner });
    }
    if (kind === 'cross') {
      let m = 1 + (this.relics.has('twin_dials') ? 1 : 0) + (this.mutations.has('duality_engine') ? 1 : 0);
      this.gainMomentum(m, 'Cross');
    }

    const pendingBonus = c.pendingBonus;
    c.pendingBonus = 0;
    const pendingRelayEcho = c.nextRelayEcho;
    c.nextRelayEcho = 0;

    this.emit({
      type: 'act', who: owner, anim: d.anim, card: d.name, id: d.id, role: d.role, rank, variant, kind, relay,
      big: d.role === 'close', all: false, fromReserve,
    });

    // first-hit bonuses
    let bonus = pendingBonus;
    if (inst.graft === 'keen') bonus += 3;
    if (variant === 'EX' && this.relics.has('prism_lens')) bonus += 3;
    if (fromReserve && this.relics.has('spare_pockets')) bonus += 3;
    if (fromReserve && this.mutations.has('deep_pockets')) bonus += 4;
    if (kind === 'cross' && this.mutations.has('duality_engine')) bonus += 4;
    if (scrambledAtPlay && this.relics.has('root_key')) bonus += 4;
    bonus += c.harness * 2;

    let mult = 1;
    if (fromReserve && inst.graft === 'cached') mult *= 1.5;
    if (wasLocked && this.mutations.has('signal_thief')) mult *= 1.5;

    const api = this.makeApi(entry, inst, d, { mult, bonus, echoing: false, disruptedAtPlay, ctx: c });
    d.fx(api);

    // grafts
    if (inst.graft === 'spark') this.gainMomentum(1, 'Spark');
    if (inst.graft === 'quick') this.addFlow(0.2);
    if (inst.graft === 'plated') this.addGuard(3);
    if (inst.graft === 'echoing' && relay) this.echo(entry.index, 0.3, entry);
    if (fromReserve && this.mutations.has('deep_pockets')) this.gainMomentum(1, 'Reserve');

    // step payoffs
    if (kind === 'step') {
      let sb = c.stepBonus + (this.relics.has('ladder_rungs') ? 3 : 0) + (this.mutations.has('ascendant_ladder') ? 3 : 0);
      const tgt = this.currentTarget();
      if (sb > 0 && tgt) this.dealDamage(tgt, sb, { src: owner, entry, tag: 'step' });
    }
    // relay echoes
    if (relay && entry.index > 0) {
      const prev = entry.index - 1;
      if (!c.relayEchoUsed) {
        let p = 0;
        if (this.relics.has('echo_splice')) p = Math.max(p, 0.4);
        if (c.relayEcho) p = Math.max(p, c.relayEcho);
        if (p > 0) { c.relayEchoUsed = true; this.echo(prev, p, entry); }
      }
      if (pendingRelayEcho > 0) this.echo(prev, pendingRelayEcho, entry);
      if (this.mutations.has('relay_resonance')) this.echo(prev, 0.25, entry);
      if (this.relics.has('relay_harness')) c.harness++;
    }
    if (d.role === 'conv' && this.relics.has('iron_filings')) this.addGuard(1);

    // card to discard (temp cards are deleted)
    if (d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);

    if (this.phase === 'END') return; // fx may have ended the battle
    if (isOpen) this.transitionHand('chain');
    else this.refill();

    if (d.role === 'close') this.finishCombo(c.closeAsCashOut ? 'cashout' : 'perfect');
    else if (c.deadline <= this.t) this.finishCombo('forced');
  }

  echo(idx, mult, creditEntry) {
    const c = this.combo;
    if (!c) return;
    const e = c.cards[idx];
    if (!e) return;
    const inst = this.cards.get(e.uid);
    const d = CARDS[e.id];
    if (this.relics.has('mirror_lens')) mult *= 1.25;
    this.emit({ type: 'echo', who: e.owner, card: e.name, anim: d.anim, mult });
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
      kind: entry.kind, relay: entry.relay, fromReserve: entry.fromReserve,
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
            total += self.dealDamage(t, amt, { src: entry.owner, entry: credit, pierce, closer: def.role === 'close', echo: echoing, hit: h, all: !!opt.all });
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
      spendMomentum() {
        if (echoing) return entry.spent || 0;
        const n = self.momentum;
        self.momentum = 0;
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
      recycleIllegal() {
        if (echoing) return 0;
        let n = 0;
        // evaluated after this card resolves sequence state; cards illegal for the next play are replaced
        for (let i = 0; i < RULES.HAND; i++) {
          const u = self.hand[i];
          if (!u || self.isLocked(u)) continue;
          if (self.roleOf(u) === 'junk') { self.hand[i] = null; self.exhaust.push(u); n++; continue; }
          const r = seqCheck(c.rank, c.variant, self.effRank(u), self.effVariant(u), self.crossGap());
          if (!r.ok) { self.hand[i] = null; self.discard.push(u); self.emit({ type: 'churn', uid: u, slot: i, free: true }); n++; }
        }
        self.refill();
        return n;
      },
      stashBestCloser() {
        if (echoing) return false;
        if (self.reserve.length >= self.reserveMax() || self.reserveLatchUntil > self.t) return false;
        let best = -1, bestRank = -1;
        self.hand.forEach((u, i) => {
          if (u && self.roleOf(u) === 'close' && !self.isLocked(u) && self.effRank(u) > bestRank) { best = i; bestRank = self.effRank(u); }
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
            self.dealDamage(e, s * p * mult, { src: entry.owner, entry: credit, pierce: true, closer: true, echo: echoing });
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
    const junk = d.role === 'junk';
    if (this.isLocked(uid)) { this.emit({ type: 'reject', uid, reason: 'locked', text: 'Locked' }); return { ok: false, text: 'Locked' }; }
    if (!junk && this.churnJamUntil > this.t) { this.emit({ type: 'reject', uid, reason: 'snared', text: 'Churn snared' }); return { ok: false, text: 'Churn snared' }; }
    const free = junk || (this.relics.has('beta_badge') && !this.churn.freeUsed);
    if (!free && this.churn.charges < 1) { this.emit({ type: 'reject', uid, reason: 'nocharge', text: 'No Churn charges' }); return { ok: false, text: 'No Churn charges' }; }
    if (!junk && this.relics.has('beta_badge') && !this.churn.freeUsed) this.churn.freeUsed = true;
    else if (!junk) this.churn.charges -= 1;
    this.hand[slot] = null;
    if (junk || d.temp) this.exhaust.push(uid);
    else this.discard.push(uid);
    if (!junk) {
      this.stats.churns++;
      if (this.combo) this.combo.churned = true;
      if (!this.relics.has('oiled_bearings')) {
        if (this.phase === 'ACTIVE') this.combo.deadline = Math.max(this.t + 0.2, this.combo.deadline - 0.3);
        else for (const e of this.aliveEnemies()) e.atb = Math.min(0.97, e.atb + 0.05);
      }
      const inst = this.cards.get(uid);
      if (inst.graft === 'churnfed') { this.gainMomentum(1, 'Churnfed'); this.addGuard(2); }
      if (this.mutations.has('grinder')) {
        const t = this.rng.pick(this.aliveEnemies());
        if (t) this.dealDamage(t, 4, { src: 'V', tag: 'grinder' });
      }
      if (this.adaptOn('churn_tax')) for (const e of this.aliveEnemies()) if (e.tier === 'boss') e.atb = Math.min(0.97, e.atb + 0.15);
    }
    this.emit({ type: 'churn', uid, slot, junk });
    this.refill(uid);
    this.checkEnd();
    return { ok: true };
  }

  canStash(uid) {
    if (this.phase === 'END') return false;
    return this.hand.includes(uid) && this.reserve.length < this.reserveMax() && this.reserveLatchUntil <= this.t
      && !this.isLocked(uid) && this.roleOf(uid) !== 'junk';
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
    return { ok: true };
  }

  gainChurn(n) {
    const before = this.churn.charges;
    this.churn.charges = Math.min(this.churnMax(), this.churn.charges + n);
    if (this.churn.charges > before) this.emit({ type: 'churnGain', n: this.churn.charges - before });
  }

  spendMomentumFlow() {
    const cost = this.momentumCostFlow();
    if (this.phase !== 'ACTIVE' || this.momentum < cost) return { ok: false, text: this.phase !== 'ACTIVE' ? 'No combo running' : 'Not enough Momentum' };
    if (this.combo.deadline >= this.flowCap() - 0.01) return { ok: false, text: 'At 6.2s combo cap' };
    this.momentum -= cost;
    this.stats.momentumSpent += cost;
    if (this.adaptOn('momentum_drain')) this.adaptProgress(cost);
    this.emit({ type: 'momentum', delta: -cost, why: 'Flow' });
    this.addFlow(this.flowSpendAmount());
    return { ok: true };
  }

  spendMomentumGuard() {
    if (this.phase === 'END') return { ok: false, text: 'Battle over' };
    if (this.momentum < RULES.MOMENTUM_COST) return { ok: false, text: 'Not enough Momentum' };
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
      this.emit({ type: 'reject', reason: 'cashout', text: this.phase === 'ACTIVE' ? 'Needs 2+ cards' : 'No combo running' });
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
    const quick = this.flowLeft() >= 1.5;
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
    // Dead Drop stored echoes release on Closer or Cash Out
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
      if (this.relics.has('tuning_fork')) this.healParty(2, 'lowest');
      finisher = c.cards.length >= 5 || c.cards[c.cards.length - 1].rank >= 9;
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
      else if (this.momentum > 0) {
        const loss = Math.min(2, this.momentum);
        this.momentum -= loss;
        this.emit({ type: 'momentum', delta: -loss, why: 'Dropped' });
      }
    }
    const summary = {
      type, len: c.cards.length, relays: c.relays, crosses: c.crosses, steps: c.steps, damage: c.damage,
      openerSuit: c.cards[0] ? c.cards[0].variant : null, closerId: type === 'perfect' ? c.cards[c.cards.length - 1].id : null,
      owners: c.owners.length, duration, churned: c.churned, maxRank: Math.max(...c.cards.map((e) => e.rank)),
      strongest: Math.max(0, ...c.cards.map((e) => e.dmg)),
    };
    this.history.push(summary);
    this.trackAdaptation(summary);
    this.updateCitation(summary);
    this.emit({ type: 'comboEnd', kind: type, len: summary.len, damage: c.damage, finisher, quick: !!c.quick, relays: c.relays, owners: c.owners.slice() });
    this.combo = null;
    if (this.phase === 'END') return;
    this.transitionHand('open');
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
      case 'flow_clamp': if (s.type === 'perfect' && s.duration < 3.5) this.adaptProgress(1); break;
      default: break;
    }
  }

  // ── Protocol Auditor / Core citation system ──
  auditPatterns(e) {
    if (this.relics.has('auditor_seal')) { this.emit({ type: 'banner', text: 'AUDIT BLOCKED', sub: "Auditor's Seal", tone: 'good' }); return; }
    const h = this.history;
    if (h.length < 2) { this.emit({ type: 'banner', text: 'AUDIT: INSUFFICIENT DATA', sub: 'No citation issued', tone: 'info' }); return; }
    const a = h[h.length - 1], b = h[h.length - 2];
    let reason = null;
    if (a.openerSuit && a.openerSuit === b.openerSuit) reason = { kind: 'suit', value: a.openerSuit, text: `Opened with suit ${a.openerSuit} twice` };
    else if (a.closerId && a.closerId === b.closerId) reason = { kind: 'closer', value: a.closerId, text: `Same Closer twice` };
    if (!reason) { this.emit({ type: 'banner', text: 'AUDIT PASSED', sub: 'Your patterns varied', tone: 'good' }); return; }
    this.citation = reason;
    this.stats.interference++;
    this.emit({ type: 'banner', text: 'CITATION ISSUED', sub: `${reason.text}: -40% damage until you vary`, tone: 'bad' });
    if (e.flags.strict) this.hitAll(e, this.edmg(e, 10));
  }
  updateCitation(s) {
    if (!this.citation) return;
    const r = this.citation;
    const varied = r.kind === 'suit' ? s.openerSuit !== r.value : s.closerId !== r.value;
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
    if (o.closer && this.relics.has('kettle_drum') && this.combo && this.combo.cards.length >= 5) a *= 1.25;
    if (this.citation && !o.cashout) a *= 0.6;
    if (o.entry && this.adapt && !this.adapt.broken) {
      if (this.adaptOn('suit_filter_A') && o.entry.variant === 'A') a *= 0.7;
      if (this.adaptOn('suit_filter_B') && o.entry.variant === 'B') a *= 0.7;
    }
    if ((e.st.exposed || 0) > 0) a *= 1.3;
    if (o.closer && e.st.mark > 0) { a *= 1.5; e.st.mark = 0; }
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
    if (o.closer && this.adaptOn('guard_pierce') && !o.echo) this.adaptProgress(total);
    this.emit({ type: 'hit', uid: e.uid, amount: a, blocked, by: o.src || null, big: !!o.closer, echo: !!o.echo, tag: o.tag || null, all: !!o.all, hit: o.hit || 0, pierce: !!o.pierce });
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

  healParty(n, who = 'all') {
    let targets = this.party.filter((p) => !p.ko);
    if (who === 'lowest') targets = targets.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    else if (who !== 'all') targets = targets.filter((p) => p.id === who);
    for (const p of targets) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + n);
      if (p.hp > before) this.emit({ type: 'heal', who: p.id, amount: p.hp - before });
    }
  }

  killEnemy(e) {
    e.alive = false;
    e.hp = 0;
    e.atb = 0;
    this.emit({ type: 'enemyDie', uid: e.uid, boss: e.tier === 'boss' });
    if (e.tier === 'boss') for (const x of this.enemies) if (x.alive && x.summoned) { x.alive = false; x.hp = 0; this.emit({ type: 'enemyDie', uid: x.uid }); }
    this.currentTarget();
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
    this.emit({ type: 'phase', uid: e.uid, name: next.name, text: next.text });
    if (next.summon) for (const sid of next.summon) this.summon(sid, e);
    e.atb = Math.min(e.atb, 0.3);
    this.chooseIntent(e);
  }

  // ───────────────────────── party damage ─────────────────────────
  hitParty(e, pid, amount, o = {}) {
    let p = this.member(pid);
    if (!p || p.ko) p = this.pickTargetMember(e);
    if (!p) return 0;
    let a = amount;
    if (!o.reflect && e && (e.st.weak || 0) > 0) a *= 0.75;
    a = Math.max(0, Math.round(a));
    let blocked = 0;
    if (!o.pierce && this.guard >= 1) {
      let usable = Math.floor(this.guard);
      if (e && e.tier === 'boss' && this.adaptOn('guard_pierce')) usable = Math.floor(usable / 2);
      blocked = Math.min(usable, a);
      this.guard -= blocked;
      a -= blocked;
      this.stats.guardAbsorbed += blocked;
    }
    p.hp -= a;
    this.stats.damageTaken += a;
    this.emit({ type: 'partyHit', who: p.id, amount: a, blocked, src: e ? e.uid : null, reflect: !!o.reflect });
    if (e && e.alive && !o.reflect) {
      if (blocked > 0 && a === 0 && this.relics.has('heat_shield')) this.applyStatus(e, 'scorch', 2);
      if (blocked > 0 && this.mutations.has('bastion_protocol')) this.dealDamage(e, Math.round(blocked * 0.5), { src: 'V', counter: true, pierce: true, tag: 'bastion' });
      if (this.counter > 0 && e.alive) {
        const cd = this.counter * (this.relics.has('counter_spring') ? 2 : 1);
        this.counter = 0;
        this.emit({ type: 'act', who: 'V', anim: 'counter', card: 'Counter', role: 'counter', big: false, target: e.uid });
        this.dealDamage(e, cd, { src: 'V', counter: true, pierce: true, tag: 'counter' });
      }
    }
    if (p.hp <= 0) this.koMember(p);
    return a;
  }

  hitAll(e, amount, o = {}) {
    this.emit({ type: 'enemyAoe', src: e ? e.uid : null });
    for (const p of this.party) if (!p.ko) this.hitParty(e, p.id, amount, o);
  }

  koMember(p) {
    if (p.ko) return;
    p.ko = true;
    p.hp = 0;
    this.emit({ type: 'partyKO', who: p.id });
    if (this.relics.has('dead_mans_switch')) {
      for (const e of this.aliveEnemies()) this.dealDamage(e, 15, { src: null, pierce: true, tag: 'switch' });
      this.gainMomentum(5, "Dead Man's Switch");
    }
    for (let i = 0; i < RULES.HAND; i++) {
      const u = this.hand[i];
      if (u && this.def(u).owner === p.id) this.tuck(i);
    }
    this.refill();
    this.checkEnd();
  }

  pickTargetMember(e) {
    const alive = this.party.filter((p) => !p.ko);
    if (!alive.length) return null;
    const def = e ? ENEMIES[e.id] : null;
    if (def && def.targetMode === 'lowest') return alive.slice().sort((a, b) => a.hp - b.hp)[0];
    // Vanguard draws aggro
    return this.rng.weighted(alive.map((p) => [p, p.id === 'V' ? 2 : 1]));
  }

  // ───────────────────────── enemy API ─────────────────────────
  spawnEnemy(id, { hpMult = 1, dmgMult = 1, summoned = false } = {}) {
    const def = ENEMIES[id];
    const lvl = Math.max(0, this.act - def.act);
    const scale = 1 + 0.4 * lvl;
    let hp = Math.round(def.hp * hpMult * scale * (this.prep.bossHpMult && def.tier === 'boss' ? this.prep.bossHpMult : 1));
    if (this.tutorial) hp = Math.round(hp * 0.8);
    const e = {
      uid: `e${++this.uidCounter}`, id, name: def.name + (lvl > 0 ? ' Mk' + (lvl + 1) : ''), tier: def.tier, hp, maxHp: hp, guard: 0,
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
    const targets = pid === 'all' ? this.party.filter((p) => !p.ko) : [this.member(pid) || this.pickTargetMember(e)].filter(Boolean);
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
    const pri = { close: 3, conv: 2, open: 1 };
    const cands = this.hand
      .filter((u) => u && !this.isLocked(u) && this.roleOf(u) !== 'junk' && this.cards.get(u).graft !== 'anchored' && (!filter || filter(u)))
      .map((u) => ({ u, s: pri[this.roleOf(u)] * 10 + this.effRank(u) + this.rng.next() }))
      .sort((a, b) => b.s - a.s)
      .slice(0, n);
    if (!cands.length) return 0;
    for (const { u } of cands) {
      this.locks[u] = { until: this.t + dur, dur, source: e ? e.name : 'Interference' };
      this.wasLocked.add(u);
      this.emit({ type: 'lock', uid: u, dur, source: e ? e.name : '' });
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
    const cands = this.rng.shuffle(this.hand.filter((u) => u && this.roleOf(u) !== 'junk' && this.cards.get(u).graft !== 'anchored')).slice(0, n);
    if (!cands.length) return 0;
    for (const u of cands) {
      const m = { until: this.t + RULES.SCRAMBLE_DURATION, flip: false, rankDelta: 0, source: e ? e.name : '' };
      if (mode === 'suit' || mode === 'both') m.flip = true;
      if (mode === 'rank' || mode === 'both') m.rankDelta = this.rng.pick([-2, -1, 1, 2]);
      if (mode === 'rankup') { m.rankDelta = 2; m.until = this.t + 6; }
      this.temp[u] = m;
    }
    this.emit({ type: 'scramble', uids: cands, source: e ? e.name : '', mode });
    this.noteInterference();
    return cands.length;
  }

  jamSlot(e, dur) {
    const free = [];
    for (let i = 0; i < RULES.HAND; i++) if (!this.slotJammed(i) && !(this.hand[i] && this.isLocked(this.hand[i]))) free.push(i);
    if (!free.length) return;
    const i = this.rng.pick(free);
    if (this.hand[i]) this.tuck(i);
    this.jams[i] = { until: this.t + dur, source: e ? e.name : '' };
    this.emit({ type: 'jam', slot: i, dur, source: e ? e.name : '' });
    this.noteInterference();
  }

  snareChurn(e, dur, drain) {
    const before = this.churn.charges;
    this.churn.charges = Math.max(0, this.churn.charges - drain);
    if (dur) this.churnJamUntil = Math.max(this.churnJamUntil, this.t + dur);
    this.emit({ type: 'snare', drained: before - this.churn.charges, dur, source: e ? e.name : '' });
    this.noteInterference();
  }

  latchReserve(e) {
    if (this.reserve.length) {
      const u = this.reserve.pop();
      this.discard.push(u);
      this.emit({ type: 'latch', uid: u, source: e ? e.name : '' });
    } else {
      this.reserveLatchUntil = Math.max(this.reserveLatchUntil, this.t + 5);
      this.emit({ type: 'latch', uid: null, dur: 5, source: e ? e.name : '' });
    }
    this.noteInterference();
  }

  drainFlow(e, sec) {
    if (!this.combo) return;
    this.combo.deadline = Math.max(this.t + 0.25, this.combo.deadline - sec);
    this.emit({ type: 'drain', amount: sec, source: e ? e.name : '' });
    this.noteInterference();
  }

  addGlitch(e, n) {
    if (this.relics.has('root_key')) { this.emit({ type: 'banner', text: 'CORRUPTION BLOCKED', sub: 'Root Key', tone: 'good' }); return; }
    for (let i = 0; i < n; i++) {
      const uid = `g${++this.uidCounter}`;
      this.cards.set(uid, { uid, id: 'glitch', up: false, temp: true });
      const pos = this.rng.int(Math.max(1, Math.ceil(this.draw.length / 2)) + 1);
      this.draw.splice(pos, 0, uid);
    }
    this.emit({ type: 'glitch', n, source: e ? e.name : '' });
    this.noteInterference();
  }

  bleedContext(e) {
    if (this.combo) {
      this.combo.variant = this.rng.pick(['A', 'B']);
      this.combo.rank = Math.min(8, this.combo.rank + 1);
      this.emit({ type: 'bleed', variant: this.combo.variant, rank: this.combo.rank, source: e.name });
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
      case 'momentum': { const n = this.momentum; this.momentum = 0; this.emit({ type: 'momentum', delta: -n, why: 'Siphoned' }); this.hitAll(e, this.edmg(e, 4 + n)); break; }
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
    this.emit({ type: 'enemyAct', uid: e.uid, kind: it.kind, name: it.name, target: it.target });
    idef.exec(e, this, it);
    if (e.flags.rootAccess && this.phase !== 'END') this.addGlitch(e, 1);
    if (this.trait === 'STATIC' && this.phase !== 'END' && it.kind !== 'lock' && this.rng.chance(0.25)) this.lockCards(e, 1);
    if (e.tier === 'boss' && this.phase !== 'END') {
      if (this.adaptOn('momentum_drain') && this.momentum > 0) {
        const n = Math.min(2, this.momentum);
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
    let s = 1;
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
    if (this.phase === 'ACTIVE' && this.combo && t >= this.combo.deadline) this.finishCombo('forced');
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
    // enemy ATB
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.atb += (dt / e.actTime) * this.enemySpeed(e);
      if (e.atb >= 1) {
        e.atb = 0;
        this.enemyAct(e);
        if (this.phase === 'END') return;
      }
    }
    this.checkEnd();
  }

  checkEnd() {
    if (this.phase === 'END') return;
    if (this.party.every((p) => p.ko)) {
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
      party: this.party.map((p) => ({ id: p.id, hp: Math.max(0, Math.round(p.hp)), ko: p.ko })),
      stats: this.stats,
      scrapBonus: this.scrapEarned,
      enemies: this.enemies.map((e) => e.id),
    };
  }
}
