// Battle renderer: draws the battlefield, animated actors, effects and the in-field HUD.
// It only *reads* combat state and consumes combat events; it never decides mechanics.
import { Actor, LOOKS, drawCharacter, weaponTip } from './rig.js';
import { ENEMY_ART, ART_BOUNDS } from './enemyArt.js';
import { Background } from './backgrounds.js';
import { cardCue, ENEMY_CUES, EX_CUES, FOE_ACTION } from './choreography.js';
import { drawSignal, drawEnemySignal, enemyPose } from './signals.js';
import { drawIcon } from './icons.js';
import { glow, circle, roundRect, ellipse, lin, hexToRgba, poly } from './draw.js';
import { ENEMIES, ENEMY_KIND_ICONS } from '../data/enemies.js';
import { clamp, lerp, easeOut } from '../core/util.js';
import { t as tr, msg, cardName, enemyName, intentName, phaseName, phaseText, ownerName, ownerInitial } from '../i18n/index.js';

const OWNER_COLORS = { V: '#d0603f', C: '#b48cf0', S: '#e6c25a' };
const PARTY_SLOTS = { V: [0.31, 0.81], S: [0.205, 0.905], C: [0.115, 0.755] };
const ENEMY_SLOTS = {
  1: [[0.73, 0.84]],
  2: [[0.66, 0.79], [0.85, 0.89]],
  3: [[0.62, 0.77], [0.77, 0.9], [0.89, 0.75]],
  4: [[0.6, 0.78], [0.72, 0.91], [0.83, 0.76], [0.93, 0.9]],
};

class EnemyActor {
  constructor(e, slot) {
    this.uid = e.uid;
    this.art = e.art;
    this.id = e.id;
    this.def = ENEMIES[e.id];
    this.slot = slot;
    this.atkT = -1;
    this.atkKind = 'atk';
    this.hurt = 0;
    this.flash = 0;
    this.dieT = -1;
    this.spawnT = 0;
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.windPrev = 0;
  }
  attack(kind) {
    this.atkT = 0;
    this.atkKind = kind;
  }
  update(dt) {
    if (this.atkT >= 0) {
      this.atkT += dt;
      if (this.atkT > 0.55) this.atkT = -1;
    }
    this.hurt = Math.max(0, this.hurt - dt * 3.2);
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.dieT >= 0) this.dieT += dt;
    this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
  }
  atkCurve() {
    if (this.atkT < 0) return 0;
    const t = this.atkT;
    return t < 0.18 ? easeOut(t / 0.18) : Math.max(0, 1 - (t - 0.18) / 0.37);
  }
}

export class BattleView {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks; // { sfx(name, opts), cutin(info), banner(text, sub, tone), telegraph(e), toast }
    this.time = 0;
    this.actors = { V: new Actor('V'), C: new Actor('C'), S: new Actor('S') };
    this.enemyActors = new Map();
    this.fx = [];
    this.particles = [];
    this.numbers = [];
    this.queue = [];
    this.shake = 0;
    this.zoom = 0;
    this.flashScreen = 0;
    this.flashColor = '#ffffff';
    this.dim = 0;
    this.partyFlash = 0;
    this.combat = null;
    this.bg = null;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.reducedMotion = false;
    this.shakeEnabled = true;
    this.lastActor = null;
    this.relayTrail = null;
    this.victoryPlayed = false;
    this.commandCues = new Map();
    this.maxParticles = 100;
  }

  setCombat(combat, act, variant = 0) {
    this.combat = combat;
    this.bg = new Background(act, variant);
    this.enemyActors.clear();
    this.commandCues.clear();
    this.fx = [];
    this.particles = [];
    this.numbers = [];
    this.queue = [];
    this.victoryPlayed = false;
    for (const id of ['V', 'C', 'S']) {
      const a = new Actor(id);
      this.actors[id] = a;
    }
    this.assignSlots();
  }

  assignSlots() {
    const fresh = this.combat.enemies.filter((e) => e.alive && !this.enemyActors.has(e.uid));
    if (!fresh.length) return;
    if (this.enemyActors.size === 0) {
      const lay = ENEMY_SLOTS[Math.max(1, Math.min(4, fresh.length))];
      fresh.slice(0, 4).forEach((e, i) => {
        const a = new EnemyActor(e, i);
        a.pos = e.tier === 'boss' ? [0.76, 0.87] : lay[i];
        a.spawnT = 1;
        this.enemyActors.set(e.uid, a);
      });
      return;
    }
    const cands = [...ENEMY_SLOTS[4], [0.58, 0.9], [0.9, 0.82], [0.66, 0.74]];
    for (const e of fresh) {
      const living = [...this.enemyActors.values()].filter((a) => a.dieT < 0).map((a) => a.pos);
      let best = cands[0], bestD = -1;
      for (const c of cands) {
        const d = Math.min(...living.map((q) => Math.hypot(q[0] - c[0], (q[1] - c[1]) * 1.4)), 9);
        if (d > bestD) { bestD = d; best = c; }
      }
      const a = new EnemyActor(e, this.enemyActors.size);
      a.pos = best;
      this.enemyActors.set(e.uid, a);
    }
  }

  resize(w, h, dpr) {
    if (this.w === w && this.h === h && this.dpr === dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  unit() {
    return Math.min(this.h * 0.0037, this.w * 0.0021);
  }

  partyPos(id) {
    const [px, py] = PARTY_SLOTS[id];
    const boss = this.combat?.enemies.some((e) => e.tier === 'boss');
    const docket = this.h < 245 && boss ? Math.max(0, Math.min(213, this.w*.33) + 42 - this.w*PARTY_SLOTS.C[0]) : 0;
    // Keep room below the feet for the name, Defense and Recovery bar.
    return [px*this.w + docket, Math.min(py*this.h, this.h-27)];
  }

  enemyPos(a) {
    const [ex, ey] = a.pos;
    const def = a.def;
    const k = this.unit();
    let scale = k * def.size * (def.tier === 'boss' ? 0.95 : 1);
    const b = ART_BOUNDS[def.art] || [-30, -80, 30, 0];
    const artH = -b[1];
    let y = ey * this.h;
    if (def.flying) y -= this.h * 0.2;
    const maxScale = (y - this.h * 0.2) / artH;
    scale = Math.min(scale, Math.max(k * 0.6, maxScale));
    return [ex * this.w, y, scale, b];
  }

  hitTest(x, y) {
    let best = null;
    for (const a of this.enemyActors.values()) {
      const e = this.combat.enemies.find((q) => q.uid === a.uid);
      if (!e || !e.alive) continue;
      const [ex, ey, sc, b] = this.enemyPos(a);
      const pad = 14;
      if (x >= ex + b[0] * sc - pad && x <= ex + b[2] * sc + pad && y >= ey + b[1] * sc - pad - 30 && y <= ey + b[3] * sc + pad) {
        best = e.uid;
      }
    }
    return best;
  }

  // Screen rectangles (canvas CSS pixels) of an enemy and of a hero, for the lesson spotlight.
  enemyRect(uid) {
    const a = [...this.enemyActors.values()].find((x) => x.uid === uid);
    if (!a) return null;
    const [ex, ey, sc, b] = this.enemyPos(a);
    return { x: ex + b[0] * sc, y: ey + b[1] * sc - 30, w: (b[2] - b[0]) * sc, h: (b[3] - b[1]) * sc + 30 };
  }
  heroRect(id) {
    const k = this.unit();
    const [hx, hy] = this.partyPos(id);
    const s = k * LOOKS[id].scale;
    return { x: hx - 34 * s, y: hy - 115 * s, w: 68 * s, h: 115 * s + 24 };
  }

  // A hero under the pointer (tap a hero to select who attacks next).
  heroHitTest(x, y) {
    const k = this.unit();
    let best = null, bestD = Infinity;
    for (const id of ['V', 'C', 'S']) {
      const [hx, hy] = this.partyPos(id);
      const s = k * LOOKS[id].scale;
      if (x < hx - 34 * s - 8 || x > hx + 34 * s + 8 || y < hy - 115 * s || y > hy + 24) continue;
      const d = Math.abs(x - hx);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  schedule(delay, fn) {
    this.queue.push({ at: this.time + Math.max(0, delay), fn });
  }

  // ───────────────────────── events → presentation ─────────────────────────
  consume(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'act': this.onAct(ev); break;
        case 'execResolve': this.onResolve(ev); break;
        case 'execEnd':
          this.commandCues.delete(ev.id);
          if (this.aiming?.id === ev.id) this.aiming = null;
          break;
        case 'echo': this.onEcho(ev); break;
        case 'hit': this.onHit(ev); break;
        case 'enemyAct': this.onEnemyAct(ev); break;
        case 'partyHit': this.onPartyHit(ev); break;
        case 'enemyDie': this.onEnemyDie(ev); break;
        case 'exCombo': this.onRecipe(ev); break;
        case 'guard': this.onGuard(ev); break;
        case 'heal': this.onHeal(ev); break;
        case 'status': this.onStatus(ev); break;
        case 'relay': this.onRelay(ev); break;
        case 'relayStart': this.onRelayStart(ev); break;
        case 'recover': if (ev.why === 'support') this.floatAt(ev.who, tr('RECOVERING'), '#9aa7b8', 10); break;
        case 'comboStart': this.sfx('comboStart'); break;
        case 'comboEnd': this.onComboEnd(ev); break;
        case 'cashout': this.onCashout(ev); break;
        case 'phase': this.onPhase(ev); break;
        case 'summon': this.assignSlots(); this.onSummon(ev); break;
        case 'victory': this.aiming = null; this.commandCues.clear(); this.schedule(.35, () => this.onVictory()); break;
        case 'defeat': this.aiming = null; this.commandCues.clear(); this.schedule(0.3, () => { for (const id of ['V', 'C', 'S']) this.actors[id].play('ko'); this.sfx('ko'); }); this.schedule(0.6, () => { this.dim = 1; }); break;
        case 'cover': this.floatAt('V', tr('COVER'), '#9ec4d8', 13); break;
        case 'covered': this.floatAt('V', tr('COVER'), '#9ec4d8', 13); break;
        case 'momentum': if (ev.delta > 0 && ev.why === 'Perfect') this.sfx('momentum'); break;
        case 'counter': this.floatAt('V', tr('COUNTER {n}', { n: ev.amount }), '#e6c779', 11); break;
        case 'partyStatus':
          if (ev.kind === 'braced') { this.floatAt(ev.who, tr('BRACED +20%'), '#ffd36a', 13); this.sparkleOn(ev.who, '#ffd36a'); }
          else this.floatAt(ev.who, tr('WEAK'), '#9ec4d8', 13);
          break;
        case 'heroSelect': this.sparkleOn(ev.who, '#ffd36a'); break;
        case 'enemyGuard': { const a = this.enemyActors.get(ev.uid); if (a) this.enemyNumber(a, `+${ev.amount}`, '#9ec4d8', 12, 'shield'); this.sfx('enemyGuard'); break; }
        case 'enemyHeal': { const a = this.enemyActors.get(ev.uid); if (a) this.enemyNumber(a, `+${ev.amount}`, '#8ed49a', 13); break; }
        case 'banner': this.hooks.banner && this.hooks.banner(msg(ev.text), msg(ev.sub), ev.tone); break;
        case 'drain': this.flashScreen = 0.25; this.flashColor = '#7a4ab0'; this.sfx('drain'); break;
        // target chosen by the player, or moved because the selected enemy died
        case 'target': this.targetFx = { uid: ev.uid, t0: this.time, auto: false }; break;
        case 'retarget': this.targetFx = { uid: ev.uid, t0: this.time, auto: true }; break;
        case 'atbPush': this.atbPushAt = this.time; break;
        default: break;
      }
    }
  }

  sfx(name, opts) {
    if (this.hooks.sfx) this.hooks.sfx(name, opts);
  }

  targetX(uid) {
    const a = this.enemyActors.get(uid) || [...this.enemyActors.values()].find((x) => x.dieT < 0);
    if (!a) return [this.w * 0.75, this.h * 0.8];
    const [x, y, sc, b] = this.enemyPos(a);
    return [x + b[0] * sc * 0.6, y + b[1] * sc * 0.45];
  }

  signal(cue, x, y, more = {}) {
    this.fx.push({ kind: 'signal', shape: cue.shape, color: cue.color, x, y, t: 0, dur: this.reducedMotion ? .28 : .38, ...more });
  }

  weaponOrigin(id) {
    const actor = this.actors[id];
    const [x, y] = this.partyPos(id);
    const k = this.unit() * LOOKS[id].scale;
    const pose = actor.pose(this.time, false, this.reducedMotion);
    const tip = weaponTip(LOOKS[id], pose);
    return [x + (this.reducedMotion ? 0 : actor.rootFrac * actor.targetDx) + tip[0] * k, y + tip[1] * k];
  }

  onAct(ev) {
    const actor = this.actors[ev.who];
    if (!actor) return;
    const cue = cardCue(ev);
    if (ev.cmd != null) {
      this.commandCues.set(ev.cmd, ev);
      this.aiming = { id: ev.cmd, hero: ev.who };
    }
    const age = ev.t == null ? 0 : Math.max(0, this.combat.t - ev.t);
    actor.play(cue.clip, { age, impact: ev.at, duration: ev.dur, targetDx: this.targetX(this.combat.target)[0] - this.partyPos(ev.who)[0] - 30 * this.unit() });
    this.lastActor = ev.who;
    if (ev.cmd == null) {
      const [x,y] = this.partyPos(ev.who);
      this.signal(cue, x, y - 29 * this.unit());
      this.sfx('cue', { cue, voice: ev.who });
    } else if (ev.big) this.sfx('windup', { cue, voice: ev.who });
  }

  onResolve(ev) {
    const event = this.commandCues.get(ev.id);
    if (!event) return; // finish commands act through their resolved payout/ending events
    const actor = this.actors[event.who];
    actor.targetDx = this.targetX(ev.target || this.combat.target)[0] - this.partyPos(event.who)[0] - 30 * this.unit();
    actor.alignImpact();
    if (this.aiming?.id === ev.id) this.aiming = null;
    const cue = cardCue(event);
    this.sfx('cue', { cue, voice: event.who, strong: event.big });
    if (event.card) this.actBanner(event.who, event);
    if (event.category === 'support' || ['anchor','mend','meter','flip','orbit'].includes(cue.clip)) {
      const [x, y] = this.weaponOrigin(event.who);
      this.signal(cue, x, y, { size: event.big ? .91 : .73, strong: event.big });
    }
  }

  onEcho(ev) {
    const [x, y] = this.partyPos(ev.who);
    if (!this.reducedMotion) this.fx.push({ kind: 'ghost', who: ev.who, t: 0, dur: .31, x: x + 8, y, anim: ev.anim });
    this.floatAt(ev.who, tr('ECHO {n}%', { n: Math.round(ev.mult * 100) }), '#dbadff', 12);
    this.sfx('echo');
  }

  onRecipe(ev) {
    if (!ev.applied) return;
    const cue = EX_CUES[ev.id];
    if (!cue) return;
    const [x, y] = this.partyPos(ev.hero);
    this.signal(cue, x + ev.order * 15, y - this.unit() * (42 + ev.order * 5), { size: .86, strong: true });
    this.sfx('recipe', { cue, order: ev.order, voice: ev.hero });
  }

  actBanner(who, ev) {
    const [hx, hy] = this.partyPos(who);
    const k = this.unit();
    this.numbers.push({ x: hx, y: hy - 118 * k, text: ev.id ? cardName(ev.id) : tr(ev.card), color: OWNER_COLORS[who], t: 0, dur: 0.9, size: ev.big ? 15 : 12, vy: -16, label: true });
  }

  onHit(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    const [x, y, sc, b] = this.enemyPos(a);
    a.hurt = Math.min(1, a.hurt + (ev.big ? 1 : 0.6));
    a.flash = this.reducedMotion ? 0 : .52;
    const cx = x + (b[0] + b[2]) * 0.5 * sc, cy = y + b[1] * sc * 0.5;
    const tag = ev.tag;
    let color = '#fff4dc', size = 15;
    if (ev.big) { color = '#ffd36a'; size = 22; }
    if (ev.echo) color = '#c9a8ff';
    if (tag === 'scorch') { color = '#ff9a4a'; size = 12; }
    if (tag === 'counter' || tag === 'bastion') color = '#e6c779';
    if (tag === 'cashout') { color = '#ffe08a'; size = 22; }
    if (tag === 'step') { color = '#8fd0ff'; size = 12; }
    if (tag === 'ex') { color = '#6ff3ff'; size = 20; } // EX Combo damage
    const text = ev.amount > 0 ? String(ev.amount) : ev.blocked > 0 ? '0' : tr('MISS');
    this.enemyNumber(a, text, color, size);
    if (ev.blocked > 0) this.enemyNumber(a, `▣${ev.blocked}`, '#9ec4d8', 11);
    const event = this.commandCues.get(ev.cue?.command);
    const cue = EX_CUES[ev.cue?.recipe] || (ev.echo ? { shape: 'echo', color: '#dbadff' }
      : event && ev.by === event.who ? cardCue(event)
      : { shape: tag === 'cashout' ? 'ledger' : tag === 'scorch' ? 'cinders' : tag === 'counter' ? 'cleave' : 'stair', color });
    const source = ev.by && this.actors[ev.by] && tag !== 'scorch' ? this.weaponOrigin(ev.by) : null;
    this.signal(cue, cx, cy, {
      ...(source ? { sx: source[0], sy: source[1] } : {}), strong: ev.big || !!ev.cue?.recipe,
      ...(ev.echo ? { size: .81 } : {}),
    });
    if (tag === 'cashout' && !this.reducedMotion) {
      for (let i = 0; i < 10; i++) this.particles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 360, life: 0, max: 0.9, size: 4, color: '#ffd36a', grav: 700, kind: 'coin', rot: Math.random() * 6, vr: 8 });
    }
    if (!this.reducedMotion && ev.big) this.shake = Math.max(this.shake, 3.5);
    if (tag !== 'scorch' && (ev.hit || 0) === 0 && !ev.cue?.recipe) {
      this.sfx(ev.blocked && !ev.amount ? 'block' : 'contact', { amount: ev.amount, strong: ev.big, voice: ev.by, cue });
    }
  }

  enemyNumber(a, text, color, size, icon) {
    const [x, y, sc, b] = this.enemyPos(a);
    const recent = this.numbers.filter((n) => n.owner === a.uid && n.t < 0.3).length;
    this.numbers.push({ x: x + (b[0] + b[2]) * 0.5 * sc + (Math.random() - 0.5) * 16, y: y + b[1] * sc * 0.6 - recent * 14, text, color, t: 0, dur: 0.9, size, vy: -40, owner: a.uid, icon });
  }

  floatAt(who, text, color, size = 12) {
    const [hx, hy] = this.partyPos(who);
    const k = this.unit();
    this.numbers.push({ x: hx, y: hy - 100 * k, text, color, t: 0, dur: 1.0, size, vy: -24 });
  }

  onEnemyAct(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    const cue = ENEMY_CUES[ev.id || a.def.id] || ENEMY_CUES.rush_hound;
    a.attack(ev.kind);
    const [x, y, sc, b] = this.enemyPos(a);
    const kind = ev.kind;
    const strike = ['atk','aoe'].includes(kind);
    const shape = (a.def.tier === 'boss' && strike) ? cue.shape : FOE_ACTION[kind] || cue.shape;
    this.signal({ ...cue, shape }, x, y + b[1] * sc * .45, { size: a.def.tier === 'boss' ? 1.13 : .72, strong: a.def.tier === 'boss' });
    this.sfx('foe-cue', { cue, kind, strong: a.def.tier === 'boss' });
    // The enemy's intention name remains visible in its HUD. Only partyHit draws a victim.
  }

  onPartyHit(ev) {
    const actor = this.actors[ev.who];
    const [hx, hy] = this.partyPos(ev.who);
    const k = this.unit();
    const from = this.enemyActors.get(ev.src);
    if (from) {
      const cue = ENEMY_CUES[from.id] || ENEMY_CUES.rush_hound;
      const [sx,sy] = this.targetX(ev.src);
      this.signal({ ...cue, shape: ev.blocked && !ev.amount ? 'plates' : from.atkKind === 'aoe' ? 'fan' : cue.shape },
        hx, hy-46*k, { sx, sy, size: ev.all ? .66 : .81 });
    }
    if (ev.amount > 0) {
      actor.flash = this.reducedMotion ? 0 : .62;
      this.partyFlash = 1;
      if (!actor.down && !actor.busy() && !this.reducedMotion) actor.play(ev.amount >= 12 ? 'stagger' : 'hurt');
      this.numbers.push({ x: hx + (Math.random() - 0.5) * 20, y: hy - 70 * k, text: String(ev.amount), color: '#ff6a5a', t: 0, dur: 0.9, size: ev.amount >= 12 ? 20 : 16, vy: -36 });
      this.shake = Math.max(this.shake, ev.amount >= 12 ? 8 : 4);
      this.sfx('partyHurt', { who: ev.who, amount: ev.amount });
      for (let i = 0; i < (this.reducedMotion ? 0 : 4); i++) this.particles.push({ x: hx, y: hy - 55 * k, vx: (Math.random() - 0.7) * 200, vy: (Math.random() - 0.8) * 200, life: 0, max: 0.4, size: 2.5, color: '#ff8a6a', grav: 500, kind: 'spark' });
    }
    if (ev.blocked > 0) {
      if (ev.amount === 0 && !actor.down && !actor.busy()) actor.play('block');
      this.numbers.push({ x: hx + 18, y: hy - 82 * k, text: `▣${ev.blocked}`, color: '#9ec4d8', t: 0, dur: 0.9, size: 13, vy: -30 });
      this.fx.push({ kind: 'dome', t: 0, dur: 0.4, hit: true });
      this.sfx('block');
    }
  }

  onEnemyDie(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    a.dieT = 0;
    const [x, y, sc, b] = this.enemyPos(a);
    const cx = x + (b[0] + b[2]) * 0.5 * sc, cy = y + b[1] * sc * 0.5;
    const cue = ENEMY_CUES[a.id] || ENEMY_CUES.rush_hound;
    for (let i = 0; i < (this.reducedMotion ? 0 : ev.boss ? 35 : 10); i++) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 30, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0, max: 0.8 + Math.random() * 0.6, size: 3 + Math.random() * 4, color: ['#c9a24a', '#9a3f2a', '#6c6872', '#ffd890'][i % 4], grav: 700, kind: i % 3 === 0 ? 'gear' : 'shard', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
    this.signal(cue, cx, cy, { size: ev.boss ? 1.74 : .94, dur: ev.boss ? .86 : .35, strong: ev.boss });
    this.sfx(ev.boss ? 'foe-down' : 'enemyDie', { cue });
  }

  onGuard(ev) {
    this.fx.push({ kind: 'dome', t: 0, dur: 0.55 });
    this.floatAt('V', tr('+{n} GUARD', { n: ev.amount }), '#9ec4d8', 12);
  }

  onHeal(ev) {
    if (ev.who === 'party') {
      for (const id of ['V', 'C', 'S']) this.sparkleOn(id, '#8ed49a');
      const { x, y, w } = this.partyBarRect();
      this.numbers.push({ x: x + w * clamp(this.combat.hp / this.combat.maxHp, 0.1, 0.9), y: y + 22, text: `+${ev.amount}`, color: '#8ed49a', t: 0, dur: 1.0, size: 15, vy: -18 });
    } else {
      this.sparkleOn(ev.who, '#8ed49a');
      this.floatAt(ev.who, `+${ev.amount}`, '#8ed49a', 15);
    }
    this.sfx('heal');
  }

  onStatus(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    const names = { exposed: tr('EXPOSED'), weak: tr('WEAK'), scorch: tr('SCORCH {n}', { n: ev.n }), mark: tr('MARKED'), parry: tr('PARRY STANCE'), shock: tr('SHOCK') };
    const colors = { exposed: '#ffb35a', weak: '#9ec4d8', scorch: '#ff8a3a', mark: '#ffd36a', parry: '#c9a8ff', shock: '#8fd0ff' };
    this.enemyNumber(a, names[ev.kind] || ev.kind.toUpperCase(), colors[ev.kind] || '#fff', 11);
  }

  // The Relay command: the outgoing hero hands the chain over (relayStart, the hand-off motion), then the
  // incoming hero takes it (relay, when the command resolves) with the Relay count and bonus.
  onRelayStart(ev) {
    const actor = this.actors[ev.from];
    if (actor) actor.play('handoff', { impact: ev.at, duration: ev.dur });
    const [x1, y1] = this.partyPos(ev.from);
    const [x2, y2] = this.partyPos(ev.to);
    const k = this.unit();
    if (!this.reducedMotion) this.fx.push({ kind: 'relay', x1, y1: y1 - 60 * k, x2, y2: y2 - 60 * k, t: 0, dur: ev.at || .25, color: OWNER_COLORS[ev.to] });
    this.sfx('whoosh');
  }

  onRelay(ev) {
    const from = ev.from || this.lastActor;
    if (!from || from === ev.to) return;
    this.actors[ev.to].play('catch');
    this.sparkleOn(ev.to, OWNER_COLORS[ev.to]);
    this.floatAt(ev.to, tr('RELAY {n} · +{b}%', { n: ev.n || 1, b: ev.bonus || 0 }), OWNER_COLORS[ev.to], 14);
    this.zoom = Math.max(this.zoom, 0.03);
    this.sfx('relay');
  }

  onComboEnd(ev) {
    if (ev.kind === 'perfect') {
      this.sfx(ev.finisher ? 'finisher' : 'perfect');
      if (ev.finisher) {
        const members = ev.owners?.length ? ev.owners : [ev.hero];
        for (const id of members) {
          if (!this.actors[id].busy()) this.actors[id].play('finish');
          const [x,y] = this.partyPos(id);
          this.signal({ shape: 'stair', color: OWNER_COLORS[id] }, x, y - 36*this.unit(), { size: .81 });
        }
      }
      if (this.hooks.banner) this.hooks.banner(ev.finisher ? tr('FINISHER') : tr('PERFECT'), tr('{n} {n|card|cards} · {d} dmg', { n: ev.len, d: ev.damage }), 'good');
    } else if (ev.kind === 'forced') {
      this.sfx('dropped');
      if (this.hooks.banner) this.hooks.banner(tr('DROPPED'), tr('Flow ran out'), 'bad');
    }
  }

  onCashout(ev) {
    this.sfx('cashout', { quick: ev.quick });
    if (this.hooks.banner && ev.scale >= 1) this.hooks.banner(ev.quick ? tr('QUICK CASH OUT') : tr('CASH OUT'), tr('Payout {n}', { n: ev.amount }), 'gold');
  }

  onPhase(ev) {
    const cue = ENEMY_CUES[ev.id] || ENEMY_CUES.signalbreak_core;
    const [x, y] = this.targetX(ev.uid);
    this.signal(cue, x, y, { size: 1.9, dur: .74, strong: true });
    this.sfx('foe-phase', { cue, strong: true, phase: ev.idx || 0 });
    if (this.hooks.banner) this.hooks.banner(ev.id ? phaseName(ev.id, ev.idx) : ev.name, ev.id ? phaseText(ev.id, ev.idx) : ev.text, 'bad');
  }

  onSummon(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    const [x, y] = this.enemyPos(a);
    this.fx.push({ kind: 'ring', x, y: y - 30, r0: 5, r1: 70, t: 0, dur: 0.5, color: '#b48cf0' });
    this.sfx('summon');
  }

  onVictory() {
    if (this.victoryPlayed) return;
    this.victoryPlayed = true;
    for (const id of ['V', 'C', 'S']) if (!this.actors[id].down) this.actors[id].play('victory');
  }

  // ───────────────────────── effect spawners ─────────────────────────
  sparkleOn(who, color) {
    const [hx, hy] = this.partyPos(who);
    const k = this.unit();
    for (let i = 0; i < (this.reducedMotion ? 0 : 7); i++) this.particles.push({ x: hx + (Math.random() - 0.5) * 40 * k, y: hy - Math.random() * 90 * k, vx: 0, vy: -40 - Math.random() * 40, life: 0, max: 0.8, size: 2.5, color, grav: -20, kind: 'spark' });
  }

  // ───────────────────────── frame ─────────────────────────
  update(dt) {
    this.time += dt;
    if (this.partyFlash > 0) this.partyFlash = Math.max(0, this.partyFlash - dt * 3);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].at <= this.time) {
        const q = this.queue[i];
        this.queue.splice(i, 1);
        q.fn();
      }
    }
    for (const a of Object.values(this.actors)) a.update(dt);
    if (this.aiming && !this.reducedMotion) {
      const { hero } = this.aiming;
      this.actors[hero].targetDx = this.targetX(this.combat.target)[0] - this.partyPos(hero)[0] - 30 * this.unit();
    }
    if (this.combat) {
      for (const e of this.combat.enemies) {
        if (!this.enemyActors.has(e.uid) && e.alive) this.assignSlots();
      }
      for (const a of this.enemyActors.values()) {
        a.update(dt);
        const e = this.combat.enemies.find((x) => x.uid === a.uid);
        if (e && e.alive) {
          const wind = clamp((e.atb - 0.8) / 0.2, 0, 1);
          if (wind > 0 && a.windPrev === 0 && this.hooks.telegraph) this.hooks.telegraph(e);
          a.windPrev = wind;
        }
      }
    }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);
    for (const p of this.particles) {
      p.life += dt;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
    }
    this.particles = this.reducedMotion ? [] : this.particles.filter((p) => p.life < p.max).slice(-this.maxParticles);
    for (const n of this.numbers) n.t += dt;
    this.numbers = this.numbers.filter((n) => n.t < n.dur);
    this.shake = Math.max(0, this.shake - dt * 40);
    this.zoom = Math.max(0, this.zoom - dt * 0.25);
    this.flashScreen = Math.max(0, this.flashScreen - dt * 2.5);
  }

  draw() {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.combat) return;
    const t = this.reducedMotion ? 0 : this.time;
    ctx.save();
    const sh = this.reducedMotion || !this.shakeEnabled ? 0 : this.shake;
    const z = this.reducedMotion ? 0 : this.zoom;
    ctx.translate(w / 2 + (Math.random() - 0.5) * sh, h * 0.7 + (Math.random() - 0.5) * sh);
    ctx.scale(1 + z, 1 + z);
    ctx.translate(-w / 2, -h * 0.7);
    this.bg.draw(ctx, this.reducedMotion ? 0 : t, w, h, dpr);

    // depth-sorted drawables
    const list = [];
    for (const id of ['V', 'C', 'S']) list.push({ y: this.partyPos(id)[1], draw: () => this.drawPartyMember(ctx, id, t) });
    for (const a of this.enemyActors.values()) {
      const [, ey] = this.enemyPos(a);
      list.push({ y: ey + (a.def.flying ? this.h * 0.2 : 0), draw: () => this.drawEnemy(ctx, a, t) });
    }
    list.sort((p, q) => p.y - q.y);
    this.drawGuardDome(ctx, t, true);
    for (const d of list) d.draw();
    this.drawGuardDome(ctx, t, false);
    this.drawFx(ctx, t);
    this.drawParticles(ctx);
    this.bg.drawForeground(ctx, this.reducedMotion ? 0 : t, w, h);
    ctx.restore();

    this.drawEnemyHud(ctx, t);
    this.incoming = this.drawIncoming(ctx, t);
    this.drawPartyHud(ctx, t);
    this.drawNumbers(ctx);
    if (!this.reducedMotion && this.flashScreen > 0) {
      ctx.fillStyle = hexToRgba(this.flashColor, this.flashScreen * 0.6);
      ctx.fillRect(0, 0, w, h);
    }
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(10,4,8,${0.55 * this.dim})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawPartyMember(ctx, id, t) {
    const actor = this.actors[id];
    const [hx, hy] = this.partyPos(id);
    const look = LOOKS[id];
    const k = this.unit() * look.scale;
    const drawT = this.reducedMotion ? 0 : t;
    const pose = actor.pose(drawT, this.combat.heroState(id) === 'RECOVERING', this.reducedMotion);
    const x = hx + (this.reducedMotion ? 0 : actor.rootFrac * actor.targetDx);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(ctx, x, hy + 2, 22 * k, 5 * k);
    ctx.fill();
    // active-actor highlight during combos
    const c = this.combat;
    if (c && c.combo && c.combo.owner === id) {
      glow(ctx, x, hy - 40 * k, 70 * k, OWNER_COLORS[id], 0.30 + 0.08 * Math.sin(drawT * 8));
      ctx.strokeStyle = hexToRgba(OWNER_COLORS[id], 0.8);
      ctx.lineWidth = 2;
      ellipse(ctx, x, hy + 2, 26 * k, 7 * k);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, hy);
    ctx.scale(k, k);
    const down = actor.down;
    if (down) ctx.globalAlpha = 0.75;
    if (down && 'filter' in ctx) ctx.filter = 'grayscale(0.85) brightness(0.7)';
    drawCharacter(ctx, look, pose, drawT);
    if (down && 'filter' in ctx) ctx.filter = 'none';
    if (!this.reducedMotion && actor.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = actor.flash * 0.55;
      drawCharacter(ctx, look, pose, drawT);
    }
    ctx.restore();
    // ghost echoes
    for (const f of this.fx) {
      if (f.kind !== 'ghost' || f.who !== id) continue;
      const p = f.t / f.dur;
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - p);
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x + 18 * k + p * 30 * k, hy);
      ctx.scale(k, k);
      const P = actor.poses[f.anim === 'shoot' ? 'fire' : f.anim === 'cast' ? 'castRelease' : f.anim === 'melee' ? 'strike' : 'flourish'];
      drawCharacter(ctx, look, P, t);
      ctx.restore();
    }
  }

  drawEnemy(ctx, a, t) {
    const e = this.combat.enemies.find((x) => x.uid === a.uid);
    if (!e) return;
    if (a.dieT > 1.0) return;
    const [x, y, sc, b] = this.enemyPos(a);
    const atk = a.atkCurve();
    const melee = a.atkKind === 'atk';
    const lunge = this.reducedMotion ? 0 : melee ? -atk * this.w * 0.035 : -atk * this.w * 0.008;
    const shake = a.hurt > 0 && !this.reducedMotion ? Math.sin(t * 36) * a.hurt * 2 : 0;
    const kb = this.reducedMotion ? 0 : a.hurt * 6;
    const flyBob = a.def.flying && !this.reducedMotion ? Math.sin(t * 2 + a.slot) * 6 : 0;
    const wind = e.alive ? clamp((e.atb - 0.8) / 0.2, 0, 1) : 0;
    const blackout = this.combat.trait === 'BLACKOUT' && e.atb < 0.75;
    void blackout;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const shY = a.def.flying ? y + this.h * 0.2 : y;
    ellipse(ctx, x + lunge, shY + 2, 30 * sc * (a.def.flying ? 0.7 : 1), 6 * sc);
    ctx.fill();
    // telegraph aura
    if (wind > 0) glow(ctx, x + lunge, y - 40 * sc, 70 * sc, '#ff5a3a', wind * 0.45);
    ctx.save();
    const cue = ENEMY_CUES[e.id] || ENEMY_CUES.rush_hound;
    const pose = enemyPose(cue, wind, atk, t, this.reducedMotion);
    ctx.translate(x + lunge + shake + kb + pose.x * sc, y + flyBob + pose.y * sc);
    ctx.rotate(pose.angle);
    ctx.scale(pose.sx, pose.sy);
    let alpha = a.spawnT;
    if (a.dieT >= 0) {
      const p = clamp(a.dieT / 1.0, 0, 1);
      alpha *= 1 - p;
      if (!this.reducedMotion) {
        ctx.translate(0, p * (cue.motion === 'mirror' ? -12 : 20) * sc);
        ctx.rotate(p * (cue.motion === 'press' ? -.32 : .22));
        if (cue.motion === 'reactor') ctx.scale(1 + p*.27, 1 - p*.35);
      }
    }
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    const art = ENEMY_ART[a.art];
    const params = { t: this.reducedMotion ? 0 : t + a.slot * 1.7, wind, atk: this.reducedMotion ? 0 : atk,
      hurt: this.reducedMotion ? 0 : a.hurt, phase: e.phase, exposed: e.st.exposed > 0, parry: e.st.parry || 0 };
    art(ctx, params);
    if (!this.reducedMotion && a.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(a.flash, a.dieT >= 0 ? 1 - a.dieT / 0.3 : 0) * 0.6 * alpha;
      art(ctx, params);
    }
    drawEnemySignal(ctx, cue, { t, wind, hit: atk, die: Math.max(0,a.dieT), phase: e.phase,
      top: b[1], boss: e.tier === 'boss', reduced: this.reducedMotion });
    ctx.restore();
  }

  drawGuardDome(ctx, t, back) {
    const c = this.combat;
    const g = Math.floor(c.guard);
    const hitFx = this.fx.find((f) => f.kind === 'dome');
    if (g <= 0 && !hitFx) return;
    const cx = this.w * 0.21, cy = this.h * 0.8, rx = this.w * 0.16, ry = this.h * 0.36;
    const strength = clamp(g / 30, 0.25, 1);
    const flash = hitFx ? 1 - hitFx.t / hitFx.dur : 0;
    ctx.save();
    ctx.globalAlpha = (0.18 + flash * 0.4) * (g > 0 ? strength : 0.5);
    ctx.strokeStyle = '#9ec4d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
    if (!back) {
      ctx.fillStyle = 'rgba(158,196,216,0.06)';
      ctx.fill();
    }
    ctx.stroke();
    if (!back) {
      // hex shimmer
      ctx.globalAlpha *= 0.6;
      for (let i = 0; i < 9; i++) {
        const ang = Math.PI + (i / 8) * Math.PI;
        const px = cx + Math.cos(ang) * rx * 0.92, py = cy + Math.sin(ang) * ry * 0.92;
        const hs = 6 + Math.sin(t * 3 + i) * 1.5;
        const pts = [];
        for (let q = 0; q < 6; q++) pts.push(px + Math.cos((q / 6) * Math.PI * 2) * hs, py + Math.sin((q / 6) * Math.PI * 2) * hs);
        poly(ctx, pts);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawFx(ctx, t) {
    for (const f of this.fx) {
      const p = f.t / f.dur;
      if (f.kind === 'signal') { drawSignal(ctx, f, p, this.reducedMotion); continue; }
      ctx.save();
      switch (f.kind) {
        case 'slash': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 1 - p;
          ctx.lineWidth = (f.big ? 9 : 5) * (1 - p) + 1;
          ctx.beginPath();
          const a0 = f.ang - 1.2 + p * 0.4, a1 = f.ang + 1.0 * easeOut(Math.min(1, p * 2));
          ctx.arc(f.x, f.y, f.r, a0, a1);
          ctx.stroke();
          if (f.big) {
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r * 0.7, a0 + 0.2, a1);
            ctx.stroke();
          }
          break;
        }
        case 'bolt': {
          const x = lerp(f.x1, f.x2, p), y = lerp(f.y1, f.y2, p);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.big ? 4 : 2.5;
          ctx.beginPath();
          ctx.moveTo(lerp(f.x1, f.x2, Math.max(0, p - 0.35)), lerp(f.y1, f.y2, Math.max(0, p - 0.35)));
          ctx.lineTo(x, y);
          ctx.stroke();
          glow(ctx, x, y, f.big ? 22 : 12, f.color, 0.9);
          break;
        }
        case 'orb': {
          const x = lerp(f.x1, f.x2, p), y = lerp(f.y1, f.y2, p) - Math.sin(p * Math.PI) * 30;
          glow(ctx, x, y, f.big ? 34 : 20, f.color, 1);
          glow(ctx, x, y, f.big ? 16 : 9, '#ffffff', 0.9);
          for (let i = 1; i < 5; i++) {
            const q = Math.max(0, p - i * 0.06);
            glow(ctx, lerp(f.x1, f.x2, q), lerp(f.y1, f.y2, q) - Math.sin(q * Math.PI) * 30, 10 - i, '#b48cf0', 0.5);
          }
          break;
        }
        case 'ring': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 1 - p;
          ctx.lineWidth = 3 * (1 - p) + 0.5;
          circle(ctx, f.x, f.y, lerp(f.r0, f.r1, easeOut(p)));
          ctx.stroke();
          break;
        }
        case 'circle': {
          const k = this.unit();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.sin(p * Math.PI) * 0.8;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 1.5;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.scale(1, 0.32);
          ctx.rotate(t * 2);
          circle(ctx, 0, 0, 40 * k);
          ctx.stroke();
          circle(ctx, 0, 0, 30 * k);
          ctx.stroke();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 30 * k, Math.sin(a) * 30 * k);
            ctx.lineTo(Math.cos(a + 2.1) * 30 * k, Math.sin(a + 2.1) * 30 * k);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'beam': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - p) * 0.8;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -t * 60;
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.quadraticCurveTo((f.x1 + f.x2) / 2, Math.min(f.y1, f.y2) - 60, f.x2, f.y2);
          ctx.stroke();
          break;
        }
        case 'relay': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 4;
          const q = easeOut(Math.min(1, p * 1.6));
          const mx = (f.x1 + f.x2) / 2, my = Math.min(f.y1, f.y2) - 50;
          ctx.beginPath();
          ctx.moveTo(f.x1, f.y1);
          ctx.quadraticCurveTo(mx, my, lerp(f.x1, f.x2, q), lerp(f.y1, f.y2, q));
          ctx.stroke();
          glow(ctx, lerp(f.x1, f.x2, q), lerp(f.y1, f.y2, q) - Math.sin(q * Math.PI) * 25, 18, f.color, 1);
          break;
        }
        case 'wave': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - p) * 0.7;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 6 * (1 - p) + 1;
          ctx.beginPath();
          ctx.ellipse(f.x - p * this.w * 0.45, f.y, 20 + p * 40, this.h * 0.25, 0, Math.PI * 0.6, Math.PI * 1.4);
          ctx.stroke();
          break;
        }
        case 'pierce': {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(f.x - 80 + p * 60, f.y);
          ctx.lineTo(f.x + 80 + p * 60, f.y);
          ctx.stroke();
          break;
        }
        default: break;
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    ctx.save();
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'gear' || p.kind === 'shard' || p.kind === 'coin') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        if (p.kind === 'coin') {
          ctx.scale(Math.cos(p.rot * 2), 1);
          circle(ctx, 0, 0, p.size);
          ctx.fill();
        } else if (p.kind === 'gear') {
          circle(ctx, 0, 0, p.size);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          circle(ctx, 0, 0, p.size * 0.4);
          ctx.fill();
        } else ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  drawNumbers(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.numbers) {
      const p = n.t / n.dur;
      const pop = n.label ? 1 : p < 0.12 ? 0.6 + (p / 0.12) * 0.7 : 1.3 - Math.min(0.3, (p - 0.12) * 1.2);
      ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      const size = Math.round(n.size * pop);
      ctx.font = `${n.label ? 700 : 900} ${size}px "Big Shoulders Display", "Barlow Condensed", Impact, sans-serif`;
      const y = n.y + (this.reducedMotion ? 0 : n.vy * n.t);
      ctx.lineWidth = n.label ? 3 : 4;
      ctx.strokeStyle = 'rgba(20,8,14,0.9)';
      ctx.strokeText(n.text, n.x, y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, n.x, y);
    }
    ctx.restore();
  }

  // ───────────────────────── HUD ─────────────────────────
  drawEnemyHud(ctx, t) {
    const c = this.combat;
    const compact = this.h < 300;
    const occupied = [];
    for (const a of this.enemyActors.values()) {
      const e = c.enemies.find((x) => x.uid === a.uid);
      if (!e || !e.alive) continue;
      if (e.tier === 'boss') { this.drawBossHud(ctx, e, t); continue; }
      const row = this.enemyHudPosition(ctx, e, a, compact, occupied);
      const { x, y, sc, b, bx, top, bw, nameX } = row;
      occupied.push(row);
      this.drawBars(ctx, e, bx, top, bw, compact, t, nameX);
      if (c.target === e.uid) this.drawTargetMarker(ctx, x + (b[0] + b[2]) * 0.5 * sc, y + b[1] * sc * 0.5, (b[2] - b[0]) * sc, -b[1] * sc, t, e.uid, y + b[3] * sc);
    }
  }

  enemyHudPosition(ctx, e, actor, compact, occupied) {
    const [x, y, sc, b] = this.enemyPos(actor);
    const bw = Math.max(compact ? 64 : 80, Math.min(130, (b[2] - b[0]) * sc));
    const bx = x + (b[0] + b[2]) * 0.5 * sc - bw / 2;
    const fs = compact ? 12 : 13;
    let top = y + b[1] * sc - (compact ? 22 : 30);
    ctx.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const nameWidth = ctx.measureText(enemyName(e.id, e.lvl).toUpperCase()).width;
    const nameX = Math.min(bx, this.w - nameWidth - 7);
    const nameRight = nameX + nameWidth;
    const toolbar = this.hudToolbar;
    if (toolbar && Math.max(bx + bw, nameRight) >= toolbar.left - 4) top = Math.max(top, toolbar.bottom + fs + 3);
    for (const row of [...occupied].sort((p,q) => p.top - q.top)) {
      if (nameX < row.nameRight + 5 && nameRight + 5 > row.nameX && Math.abs(top - row.top) < fs + 3) top = row.top + fs + 3;
    }
    return { x, y, sc, b, bx, top, bw, nameX, nameRight };
  }

  drawBars(ctx, e, bx, top, bw, compact, t, nameX = bx) {
    const c = this.combat;
    const fs = compact ? 12 : 13;
    // name
    ctx.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const name = enemyName(e.id, e.lvl).toUpperCase();
    ctx.fillStyle = 'rgba(20,8,14,0.85)';
    ctx.fillText(name, nameX + 1, top);
    ctx.fillStyle = e.tier === 'elite' ? '#ffb35a' : '#efe2c6';
    ctx.fillText(name, nameX, top - 1);
    // HP bar
    const hh = compact ? 6 : 8;
    roundRect(ctx, bx - 1, top, bw + 2, hh + 2, 2);
    ctx.fillStyle = 'rgba(20,8,14,0.85)';
    ctx.fill();
    const hp = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = lin(ctx, 0, top, 0, top + hh, ['#e8644a', '#a8322a']);
    ctx.fillRect(bx, top + 1, bw * hp, hh);
    if (e.guard >= 1) {
      const g = clamp(e.guard / e.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(158,196,216,0.8)';
      ctx.fillRect(bx, top + 1, bw * g, hh * 0.45);
    }
    ctx.font = `700 ${fs - 1}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#efe2c6';
    ctx.fillText(`${Math.ceil(e.hp)}${e.guard >= 1 ? ` ▣${Math.floor(e.guard)}` : ''}`, bx + bw, top + hh + 3);
    // ATB bar
    const ay = top + hh + 3;
    const aw = bw * 0.6;
    roundRect(ctx, bx - 1, ay, aw + 2, 5, 2);
    ctx.fillStyle = 'rgba(20,8,14,0.85)';
    ctx.fill();
    const atb = clamp(e.atb, 0, 1);
    const hot = atb > 0.8;
    ctx.fillStyle = hot ? (Math.sin(t * 20) > 0 ? '#ff5a3a' : '#ffb35a') : '#d9b45a';
    ctx.fillRect(bx, ay + 1, aw * atb, 3);
    // Churning outside a combo pushed every bar forward: flash them
    if (this.atbPushAt && this.time - this.atbPushAt < 0.6) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - (this.time - this.atbPushAt) / 0.6)})`;
      ctx.fillRect(bx, ay + 1, aw * atb, 3);
    }
    // the breather after a combo: enemies wait, the bar dims
    if (c.phase === 'RECOVER') {
      ctx.fillStyle = 'rgba(20,8,14,0.45)';
      ctx.fillRect(bx, ay + 1, aw, 3);
    }
    // intent bubble
    this.drawIntent(ctx, e, bx - (compact ? 30 : 36), top - 4, compact, t);
    // statuses
    let sx = bx;
    const sy = ay + 9;
    for (const [k, icon, col] of [['exposed', 'eye', '#ffb35a'], ['weak', 'down', '#9ec4d8'], ['scorch', 'flame', '#ff8a3a'], ['mark', 'mark', '#ffd36a'], ['parry', 'parry', '#c9a8ff'], ['shock', 'shock', '#8fd0ff']]) {
      const v = e.st[k];
      if (!v || v <= 0) continue;
      drawIcon(ctx, icon, sx + 6, sy + 6, 11, col);
      ctx.font = `700 ${fs - 2}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = col;
      ctx.fillText(k === 'scorch' || k === 'mark' ? String(v) : tr('{n}s', { n: Math.round(v) }), sx + 13, sy + 1);
      sx += 30;
    }
    if (e.hasteUntil > c.t) {
      drawIcon(ctx, 'up', sx + 6, sy + 6, 11, '#ff8a6a');
      sx += 18;
    }
  }

  drawIntent(ctx, e, x, y, compact, t) {
    const c = this.combat;
    const it = e.intent;
    if (!it) return;
    const hidden = c.trait === 'BLACKOUT' && e.atb < 0.75;
    const r = compact ? 13 : 16;
    const hot = e.atb > 0.8;
    circle(ctx, x + r, y + r, r);
    ctx.fillStyle = hot ? 'rgba(120,20,16,0.95)' : 'rgba(30,14,24,0.92)';
    ctx.fill();
    ctx.lineWidth = hot ? 2.5 : 1.5;
    ctx.strokeStyle = hot ? '#ff6a4a' : '#c9a24a';
    ctx.stroke();
    if (hidden) {
      ctx.fillStyle = '#8a7f90';
      ctx.font = `900 ${r}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + r, y + r + 1);
      return;
    }
    const icon = ENEMY_KIND_ICONS[it.kind] || 'eye';
    drawIcon(ctx, icon, x + r, y + r - (it.dmg ? 3 : 0), r * 1.05, hot ? '#ffd0c0' : '#efe2c6');
    if (it.dmg) {
      ctx.font = `900 ${compact ? 10 : 12}px "Big Shoulders Display", Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1a0a10';
      // an area attack shows its hit on EACH hero (before Defense) with a dot per hero, never a
      // multiplied total: Defense differs by hero and Guard is taken once (the ▼ rings show each part)
      const txt = String(it.dmg);
      ctx.strokeText(txt, x + r, y + r * 1.62);
      ctx.fillStyle = '#ffd36a';
      ctx.fillText(txt, x + r, y + r * 1.62);
    }
    if (it.kind === 'aoe' && it.dmg) {
      ['V', 'C', 'S'].forEach((id, k) => {
        circle(ctx, x + r * 1.75, y + r * (0.05 + k * 0.62), compact ? 3.2 : 3.8);
        ctx.fillStyle = OWNER_COLORS[id];
        ctx.fill();
        ctx.strokeStyle = '#1a0a10';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
    if (it.target) {
      circle(ctx, x + r * 1.8, y + r * 0.2, compact ? 5 : 6);
      ctx.fillStyle = OWNER_COLORS[it.target];
      ctx.fill();
      ctx.strokeStyle = '#1a0a10';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#1a0a10';
      ctx.font = `900 ${compact ? 7 : 8}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ownerInitial(it.target), x + r * 1.8, y + r * 0.2 + 0.5);
    }
  }

  drawBossHud(ctx, e, t) {
    const compact = this.h < 300;
    const bw = Math.min(this.w * 0.42, 460);
    const bx = this.w * 0.5 - bw / 2 + this.w * 0.08;
    const top = compact ? 18 : 30;
    this.drawBars(ctx, e, bx, top, bw, compact, t);
    ctx.font = `700 ${compact ? 9 : 11}px "Barlow Condensed", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffb35a';
    const def = ENEMIES[e.id];
    const phases = def.phases ? def.phases.length + 1 : 1;
    ctx.fillText(tr('PHASE {n}/{max}', { n: e.phase, max: phases }), bx + bw, top - 1);
    const a = [...this.enemyActors.values()].find((x) => x.uid === e.uid);
    if (a && this.combat.target === e.uid) {
      const [x, y, sc, b] = this.enemyPos(a);
      this.drawTargetMarker(ctx, x + (b[0] + b[2]) * 0.5 * sc, y + b[1] * sc * 0.5, (b[2] - b[0]) * sc, -b[1] * sc, t, e.uid, y + b[3] * sc);
    }
  }

  // The player's target: gold corner brackets, a ring at its feet and a label under it. A change of
  // target (tapped, or automatic after the selected enemy died) snaps the brackets in from wide.
  drawTargetMarker(ctx, cx, cy, w, h, t, uid, footY) {
    const fx = this.targetFx && this.targetFx.uid === uid ? this.targetFx : null;
    const age = fx ? this.time - fx.t0 : 9;
    const snap = age < 0.35 ? (1 - age / 0.35) ** 2 : 0;
    const pad = 8 + Math.sin(t * 6) * 3 + snap * 40;
    const x0 = cx - w / 2 - pad, x1 = cx + w / 2 + pad, y0 = cy - h / 2 - pad, y1 = cy + h / 2 + pad;
    const L = Math.min(18, w * 0.32);
    const compact = this.h < 300;
    ctx.save();
    // ring at the feet
    if (footY !== undefined) {
      ctx.beginPath();
      ctx.ellipse(cx, footY, w * 0.55 + 6, Math.max(5, w * 0.12), 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,211,106,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(255,190,80,0.8)';
    ctx.shadowBlur = 8 + snap * 12;
    ctx.globalAlpha = 0.9 + snap * 0.1;
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.moveTo(x + dx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * L);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // label under the enemy: "TARGET", or "NEW TARGET" for a while after an automatic switch
    const label = fx && fx.auto && age < 2 ? tr('NEW TARGET') : tr('TARGET');
    const labelHeight = compact ? 14 : 17;
    const ly = Math.min((footY !== undefined ? footY : y1) + (compact ? 7 : 10), this.h - labelHeight - 2);
    ctx.font = `800 ${compact ? 9 : 11}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const tw = ctx.measureText(label).width + 16;
    roundRect(ctx, cx - tw / 2, ly, tw, labelHeight, 7);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fx && fx.auto && age < 2 ? '#ffb35a' : '#ffd36a';
    ctx.fill();
    ctx.fillStyle = '#1a0a10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, ly + (compact ? 7.5 : 9));
    ctx.restore();
  }

  // An enemy about to attack: a red ring under each hero it will hit and the damage it shows (after
  // that hero's Defense), so the enemy's target is never confused with the player's (gold) target.
  // Under Cover a single-target hit is shown on Hessa, who will take it.
  drawIncoming(ctx, t) {
    const c = this.combat;
    const k = this.unit();
    const threat = {};
    for (const e of c.enemies) {
      const it = e.alive && e.intent;
      if (!it || !it.dmg || e.atb < 0.55) continue;
      if (c.trait === 'BLACKOUT' && e.atb < 0.75) continue;
      const ids = it.kind === 'aoe' ? c.party.map((p) => p.id) : it.target ? [c.hitTarget(it.target).id] : [];
      for (const id of ids) {
        const cur = threat[id] || { dmg: 0, atb: 0 };
        const dmg = c.mitigate(e, it.dmg, c.member(id), {});
        threat[id] = { dmg: cur.dmg + dmg, atb: Math.max(cur.atb, e.atb), covered: cur.covered || (it.kind !== 'aoe' && id !== it.target) };
      }
    }
    for (const [id, th] of Object.entries(threat)) {
      const [hx, hy] = this.partyPos(id);
      const urgency = clamp((th.atb - 0.55) / 0.45, 0, 1);
      const pulse = this.reducedMotion ? .70 : .55 + .45 * Math.sin(t * (6 + urgency * 10));
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(hx, hy - 2, 30 * k + 10, 7 * k + 4, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,80,58,${0.45 + 0.5 * pulse * urgency + 0.05})`;
      ctx.lineWidth = 2.5 + urgency * 1.5;
      ctx.stroke();
      ctx.restore();
    }
    return threat;
  }

  // The shared party HP bar (top left, under the act label), with Guard after the HP and the damage
  // the enemies are winding up shown as the part of the bar it would take.
  partyBarRect() {
    const compact = this.h < 300;
    const w = Math.round(Math.min(this.w * 0.3, compact ? 250 : 340));
    return { x: Math.max(26, Math.round(this.w * 0.03)), y: compact ? 33 : 52, w, h: compact ? 10 : 13, compact };
  }

  drawPartyBar(ctx) {
    const c = this.combat;
    const { x, y, w, h, compact } = this.partyBarRect();
    const fs = compact ? 12 : 14;
    const maxHp = Math.max(1, c.maxHp);
    const hp = clamp(c.hp / maxHp, 0, 1);
    const guard = Math.floor(c.guard);
    const incoming = Object.values(this.incoming || {}).reduce((a, th) => a + th.dmg, 0);
    const loss = clamp(Math.max(0, incoming - guard) / maxHp, 0, hp);
    const flash = !this.reducedMotion && this.partyFlash > 0;
    const hpTxt = `${Math.max(0, Math.ceil(c.hp))}/${c.maxHp}`;
    const gTxt = guard >= 1 ? `▣${guard}` : '';
    ctx.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const label = tr('PARTY');
    const lw = ctx.measureText(label).width;
    const hw = ctx.measureText(hpTxt).width;
    const gw = gTxt ? ctx.measureText(gTxt).width + 6 : 0;
    // compact: one line (label, bar, numbers); otherwise label and numbers above the bar
    let bx = x, bw = w, ty = y - 3;
    if (compact) { bx = x + lw + 6; bw = w - lw - 6 - hw - gw - 6; ty = y + h - 1; }
    roundRect(ctx, x - 6, compact ? y - 4 : y - fs - 6, w + 12, compact ? h + 8 : h + fs + 11, 6);
    ctx.fillStyle = 'rgba(20,8,14,0.72)';
    ctx.fill();
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8c8a8';
    ctx.fillText(label, x, ty);
    ctx.textAlign = 'right';
    ctx.fillStyle = flash || hp < 0.3 ? '#ff8a6a' : '#efe2c6';
    ctx.fillText(hpTxt, x + w, ty);
    if (gTxt) { ctx.fillStyle = '#9ec4d8'; ctx.fillText(gTxt, x + w - hw - 6, ty); }
    roundRect(ctx, bx - 1, y - 1, bw + 2, h + 2, 3);
    ctx.fillStyle = 'rgba(10,4,8,0.9)';
    ctx.fill();
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, hp < 0.3 ? ['#ff7a5a', '#b8362a'] : ['#8ed49a', '#4f9a5e']);
    ctx.fillRect(bx, y, bw * (hp - loss), h);
    if (loss > 0) {
      const pulse = this.reducedMotion ? .65 : .55 + .45 * Math.sin(this.time * 9);
      ctx.fillStyle = `rgba(255,80,58,${0.55 + 0.4 * pulse})`;
      ctx.fillRect(bx + bw * (hp - loss), y, bw * loss, h);
    }
    if (guard >= 1) {
      const g = Math.min(guard / maxHp, 1 - hp);
      ctx.fillStyle = 'rgba(158,196,216,0.85)';
      ctx.fillRect(bx + bw * hp, y, bw * g, h);
      if (g < guard / maxHp) { ctx.fillStyle = 'rgba(158,196,216,0.55)'; ctx.fillRect(bx, y, bw * (guard / maxHp - g), h * 0.35); }
    }
    if (flash) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * this.partyFlash})`;
      ctx.fillRect(bx, y, bw * hp, h);
    }
  }

  drawPartyHud(ctx, t) {
    const c = this.combat;
    const compact = this.h < 300;
    const k = this.unit();
    this.drawPartyBar(ctx);
    const fs = compact ? 12 : 13;
    for (const p of c.party) {
      const [hx, hy] = this.partyPos(p.id);
      const by = hy + (compact ? 6 : 9);
      // hero plate: name and Defense
      ctx.font = `700 ${fs}px "Barlow Condensed", sans-serif`;
      const name = ownerName(p.id);
      const defTxt = `${Math.round(c.defenseOf(p) * 100)}%`;
      const nw = ctx.measureText(name).width;
      const dw = ctx.measureText(defTxt).width;
      const icon = fs + 1;
      const pw = nw + 6 + icon + 2 + dw + 12;
      const px = hx - pw / 2;
      roundRect(ctx, px, by - 1, pw, fs + 5, 4);
      ctx.fillStyle = 'rgba(20,8,14,0.78)';
      ctx.fill();
      // the hero who performs basic attacks and starts the next combo (or is attacking now)
      if (c.performer() === p.id && c.phase !== 'END') {
        ctx.save();
        ctx.strokeStyle = OWNER_COLORS[p.id];
        ctx.lineWidth = 2;
        ctx.shadowColor = OWNER_COLORS[p.id];
        ctx.shadowBlur = 6 + 3 * Math.sin(t * 4);
        roundRect(ctx, px - 1, by - 2, pw + 2, fs + 7, 5);
        ctx.stroke();
        ctx.restore();
      }
      // hero Recovery (docs/COMBAT_SPEC.md §7): a thin bar under the plate fills until the hero is Ready
      if (c.heroState(p.id) === 'RECOVERING') {
        const hs = c.heroes[p.id];
        const f = hs.recoverDur > 0 ? Math.max(0, Math.min(1, 1 - c.recoverLeft(p.id) / hs.recoverDur)) : 1;
        ctx.fillStyle = 'rgba(20,8,14,0.85)';
        ctx.fillRect(px + 2, by + fs + 5, pw - 4, 3);
        ctx.fillStyle = '#9aa7b8';
        ctx.fillRect(px + 2, by + fs + 5, (pw - 4) * f, 3);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = OWNER_COLORS[p.id];
      ctx.fillText(name, px + 6, by + 1);
      const braced = p.st.braced > c.t;
      const dcol = braced ? '#ffd36a' : c.defenseOf(p) > 0 ? '#9ec4d8' : '#8a7f78';
      drawIcon(ctx, 'shield', px + 6 + nw + 6 + icon / 2, by + 1 + fs / 2, icon, dcol);
      ctx.fillStyle = dcol;
      ctx.fillText(defTxt, px + 6 + nw + 6 + icon + 2, by + 1);
      const th = this.incoming && this.incoming[p.id];
      if (th) {
        // incoming damage after Defense, shown by the hero who takes it
        const txt = `▼ ${th.dmg}`;
        ctx.font = `900 ${fs + 2}px "Big Shoulders Display", Impact, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#1a0a10';
        ctx.strokeText(txt, px + pw + 4, by);
        ctx.fillStyle = '#ff6a4a';
        ctx.fillText(txt, px + pw + 4, by);
        ctx.font = `700 ${fs}px "Barlow Condensed", sans-serif`;
      }
      // statuses, left of the plate: Weak (blue), Braced (gold)
      let sy = by + 1;
      if (p.st.weak && p.st.weak > c.t) {
        const left = p.st.weak - c.t;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#9ec4d8';
        const wt = `${tr('WEAK')} ${tr('{n}s', { n: Math.round(left) })}`;
        ctx.fillText(wt, px - 4, sy);
        drawIcon(ctx, 'down', px - 4 - ctx.measureText(wt).width - 7, sy + fs / 2, 11, '#9ec4d8');
        sy -= fs + 2;
      }
      if (p.st.braced && p.st.braced > c.t) {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffd36a';
        ctx.fillText(`${tr('BRACED')} ${tr('{n}s', { n: Math.ceil(p.st.braced - c.t) })}`, px - 4, sy);
      }
    }
    // Cover: a shield badge with a countdown over Hessa
    if (c.coverActive()) {
      const [hx, hy] = this.partyPos('V');
      const left = c.coverUntil - c.t;
      const txt = `${tr('COVER')} ${tr('{n}s', { n: Math.ceil(left) })}`;
      ctx.font = `800 ${fs + 1}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      const tw = ctx.measureText(txt).width;
      const bw = tw + fs + 16;
      const bh = fs + 8;
      const bx = hx - bw / 2, byy = hy - 122 * k * LOOKS.V.scale - bh;
      const fade = left < 1 ? 0.5 + 0.5 * Math.sin(t * 14) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      roundRect(ctx, bx, byy, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(24,44,60,0.88)';
      ctx.fill();
      ctx.strokeStyle = '#9ec4d8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawIcon(ctx, 'shield', bx + 6 + fs / 2, byy + bh / 2, fs + 1, '#9ec4d8');
      ctx.fillStyle = '#e4f1f8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + fs + 10, byy + bh / 2 + 1);
      ctx.restore();
    }
  }
}
