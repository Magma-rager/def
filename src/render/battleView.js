// Battle renderer: draws the battlefield, animated actors, effects and the in-field HUD.
// It only *reads* combat state and consumes combat events; it never decides mechanics.
import { Actor, LOOKS, drawCharacter, weaponTip } from './rig.js';
import { ENEMY_ART, ART_BOUNDS } from './enemyArt.js';
import { Background } from './backgrounds.js';
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
  }

  setCombat(combat, act, variant = 0) {
    this.combat = combat;
    this.bg = new Background(act, variant);
    this.enemyActors.clear();
    this.fx = [];
    this.particles = [];
    this.numbers = [];
    this.queue = [];
    this.victoryPlayed = false;
    for (const id of ['V', 'C', 'S']) {
      const a = new Actor(id);
      const p = combat.party.find((x) => x.id === id);
      if (p && p.ko) { a.play('ko'); a.ct = 1; }
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
    return [px * this.w, py * this.h];
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

  schedule(delay, fn) {
    this.queue.push({ at: this.time + Math.max(0, delay), fn });
  }

  // ───────────────────────── events → presentation ─────────────────────────
  consume(events) {
    let impactAt = { V: 0, C: 0, S: 0 };
    let lastWho = null;
    let hitCount = {};
    let enemyImpact = 0;
    for (const ev of events) {
      switch (ev.type) {
        case 'act': this.onAct(ev, impactAt); lastWho = ev.who; hitCount = {}; break;
        case 'echo': this.onEcho(ev, impactAt); lastWho = ev.who; hitCount = {}; break;
        case 'hit': {
          const who = ev.by || null;
          const base = who && impactAt[who] ? impactAt[who] : this.time;
          const n = (hitCount[ev.uid] = (hitCount[ev.uid] || 0) + 1) - 1;
          const delay = Math.max(0, base - this.time) + (ev.hit || 0) * 0.07 + (ev.all ? 0 : n * 0.05);
          this.schedule(delay, () => this.onHit(ev));
          break;
        }
        case 'enemyAct': enemyImpact = this.onEnemyAct(ev); break;
        case 'partyHit': this.schedule(ev.reflect ? 0.05 : enemyImpact || 0.2, () => this.onPartyHit(ev)); break;
        case 'enemyAoe': {
          const a = this.enemyActors.get(ev.src);
          if (a) this.schedule(0.18, () => this.waveFrom(a));
          break;
        }
        case 'enemyDie': {
          const delay = lastWho && impactAt[lastWho] ? Math.max(0, impactAt[lastWho] - this.time) + 0.12 : 0.1;
          this.schedule(delay, () => this.onEnemyDie(ev));
          break;
        }
        case 'partyKO': this.schedule(enemyImpact + 0.05, () => { this.actors[ev.who].play('ko'); this.sfx('ko'); }); break;
        case 'guard': this.onGuard(ev); break;
        case 'heal': this.onHeal(ev); break;
        case 'status': this.onStatus(ev); break;
        case 'relay': this.onRelay(ev); break;
        case 'comboStart': this.sfx('comboStart'); break;
        case 'comboEnd': this.onComboEnd(ev); break;
        case 'cashout': this.onCashout(ev); break;
        case 'phase': this.onPhase(ev); break;
        case 'summon': this.assignSlots(); this.onSummon(ev); break;
        case 'victory': this.schedule(0.7, () => this.onVictory()); break;
        case 'defeat': this.schedule(0.4, () => { this.dim = 1; }); break;
        case 'momentum': if (ev.delta > 0 && ev.why === 'Perfect') this.sfx('momentum'); break;
        case 'counter': this.floatAt('V', tr('COUNTER {n}', { n: ev.amount }), '#e6c779', 11); break;
        case 'partyStatus': this.schedule(enemyImpact || 0.2, () => this.floatAt(ev.who, tr('WEAK'), '#9ec4d8', 13)); break;
        case 'enemyGuard': { const a = this.enemyActors.get(ev.uid); if (a) this.enemyNumber(a, `+${ev.amount}`, '#9ec4d8', 12, 'shield'); this.sfx('enemyGuard'); break; }
        case 'enemyHeal': { const a = this.enemyActors.get(ev.uid); if (a) this.enemyNumber(a, `+${ev.amount}`, '#8ed49a', 13); break; }
        case 'banner': this.hooks.banner && this.hooks.banner(msg(ev.text), msg(ev.sub), ev.tone); break;
        case 'drain': this.flashScreen = 0.25; this.flashColor = '#7a4ab0'; this.sfx('drain'); break;
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

  onAct(ev, impactAt) {
    const who = ev.who;
    const actor = this.actors[who];
    const member = this.combat.party.find((p) => p.id === who);
    if (!actor || (member && member.ko)) return;
    const tgtUid = ev.target || this.combat.target;
    const [tx, ty] = this.targetX(tgtUid);
    const [hx] = this.partyPos(who);
    const k = this.unit() * LOOKS[who].scale;
    let impact = 0;
    const anim = ev.anim;
    if (anim === 'melee' || anim === 'counter') {
      const dx = tx - hx - 34 * k;
      impact = actor.play(anim === 'counter' ? 'counter' : 'melee', { targetDx: dx });
      this.schedule(impact, () => { this.slash(tx, ty, ev.big); this.sfx(ev.big ? 'heavyHit' : 'slash'); });
      this.sfx('whoosh');
    } else if (anim === 'shoot') {
      impact = actor.play('shoot');
      const travel = 0.11;
      this.schedule(impact, () => { this.projectile(who, tx, ty, 'bolt', travel, ev.big); this.sfx('shoot'); });
      impact += travel;
    } else if (anim === 'cast') {
      impact = actor.play('cast');
      const travel = 0.16;
      this.schedule(0.06, () => this.magicCircle(who));
      this.schedule(impact, () => { this.projectile(who, tx, ty, 'orb', travel, ev.big); this.sfx('cast'); });
      impact += travel;
      this.sfx('charge');
    } else if (anim === 'guard') {
      impact = actor.play('guard');
      this.sfx('guardUp');
    } else {
      impact = actor.play('buff');
      this.schedule(0.1, () => this.sparkleOn(who, '#e6c779'));
      this.sfx('buff');
    }
    impactAt[who] = this.time + impact;
    this.lastActor = who;
    if (ev.card && ev.role !== 'counter' && ev.role !== 'momentum') this.actBanner(who, ev);
    if (ev.big) this.zoom = Math.max(this.zoom, 0.04);
  }

  onEcho(ev, impactAt) {
    const who = ev.who;
    const [hx, hy] = this.partyPos(who);
    const [tx, ty] = this.targetX(this.combat.target);
    const delay = 0.12;
    this.fx.push({ kind: 'ghost', who, t: 0, dur: 0.6, x: hx + 12, y: hy - 4, anim: ev.anim });
    this.schedule(delay + 0.1, () => {
      if (ev.anim === 'melee') this.slash(tx, ty, false, '#c9a8ff');
      else if (ev.anim === 'shoot' || ev.anim === 'cast') this.projectile(who, tx, ty, ev.anim === 'cast' ? 'orb' : 'bolt', 0.1, false, '#c9a8ff');
      this.sfx('echo');
    });
    impactAt[who] = this.time + delay + 0.2;
    this.floatAt(who, tr('ECHO {n}%', { n: Math.round(ev.mult * 100) }), '#c9a8ff', 11);
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
    a.flash = 1;
    const cx = x + (b[0] + b[2]) * 0.5 * sc, cy = y + b[1] * sc * 0.5;
    const tag = ev.tag;
    let color = '#fff4dc', size = 15;
    if (ev.big) { color = '#ffd36a'; size = 22; }
    if (ev.echo) color = '#c9a8ff';
    if (tag === 'scorch') { color = '#ff9a4a'; size = 12; }
    if (tag === 'counter' || tag === 'bastion') color = '#e6c779';
    if (tag === 'cashout') { color = '#ffe08a'; size = 22; }
    if (tag === 'step') { color = '#8fd0ff'; size = 12; }
    const text = ev.amount > 0 ? String(ev.amount) : ev.blocked > 0 ? '0' : tr('MISS');
    this.enemyNumber(a, text, color, size);
    if (ev.blocked > 0) this.enemyNumber(a, `▣${ev.blocked}`, '#9ec4d8', 11);
    const n = ev.big ? 16 : 7;
    for (let i = 0; i < n; i++) this.particles.push({ x: cx, y: cy, vx: (Math.random() - 0.3) * 260, vy: (Math.random() - 0.7) * 260, life: 0, max: 0.35 + Math.random() * 0.3, size: 2 + Math.random() * 2, color: ev.echo ? '#c9a8ff' : tag === 'scorch' ? '#ff8a3a' : '#ffd890', grav: 500, kind: 'spark' });
    this.fx.push({ kind: 'ring', x: cx, y: cy, r0: 4, r1: ev.big ? 60 : 28, t: 0, dur: ev.big ? 0.35 : 0.22, color: ev.big ? '#ffd36a' : '#fff0c8' });
    if (ev.big) { this.shake = Math.max(this.shake, 9); this.flashScreen = Math.max(this.flashScreen, 0.18); this.flashColor = '#fff2d0'; }
    else this.shake = Math.max(this.shake, 3);
    if (ev.pierce && ev.big) this.fx.push({ kind: 'pierce', x: cx, y: cy, t: 0, dur: 0.3 });
    if (tag !== 'scorch') this.sfx(ev.big ? 'impactBig' : 'impact', { amount: ev.amount });
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
    if (!a) return 0.2;
    a.attack(ev.kind);
    const melee = ev.kind === 'atk';
    this.sfx(melee ? 'enemyAttack' : 'enemyCast', { kind: ev.kind });
    const [x, y, sc, b] = this.enemyPos(a);
    this.numbers.push({ x: x + (b[0] + b[2]) * 0.5 * sc, y: y + b[1] * sc - 26, text: ev.id ? intentName(ev.id, ev.key) : ev.name, color: '#ffb3a0', t: 0, dur: 1.1, size: 12, vy: -10, label: true });
    if (['lock', 'scramble', 'jam', 'snare', 'latch', 'glitch'].includes(ev.kind)) {
      this.fx.push({ kind: 'beam', x1: x + b[0] * sc, y1: y + b[1] * sc * 0.5, x2: this.w * 0.35, y2: this.h * 1.02, t: 0, dur: 0.45, color: ev.kind === 'scramble' ? '#7fd6c2' : '#b48cf0' });
      this.sfx('interfere', { kind: ev.kind });
    }
    if (ev.kind === 'guard' || ev.kind === 'heal' || ev.kind === 'buff') this.fx.push({ kind: 'ring', x: x, y: y + b[1] * sc * 0.5, r0: 10, r1: 80 * sc / this.unit() * 0.5, t: 0, dur: 0.5, color: ev.kind === 'heal' ? '#8ed49a' : '#9ec4d8' });
    if (ev.target && melee) {
      const [px, py] = this.partyPos(ev.target);
      this.schedule(0.16, () => this.slash(px + 10, py - 50 * this.unit(), false, '#ff8a6a'));
    }
    return 0.22;
  }

  onPartyHit(ev) {
    const actor = this.actors[ev.who];
    const [hx, hy] = this.partyPos(ev.who);
    const k = this.unit();
    if (ev.amount > 0) {
      actor.flash = 1;
      if (!actor.down) actor.play(ev.amount >= 12 ? 'stagger' : 'hurt');
      this.numbers.push({ x: hx + (Math.random() - 0.5) * 20, y: hy - 70 * k, text: String(ev.amount), color: '#ff6a5a', t: 0, dur: 0.9, size: ev.amount >= 12 ? 20 : 16, vy: -36 });
      this.shake = Math.max(this.shake, ev.amount >= 12 ? 8 : 4);
      this.sfx('partyHurt', { who: ev.who, amount: ev.amount });
      for (let i = 0; i < 6; i++) this.particles.push({ x: hx, y: hy - 55 * k, vx: (Math.random() - 0.7) * 200, vy: (Math.random() - 0.8) * 200, life: 0, max: 0.4, size: 2.5, color: '#ff8a6a', grav: 500, kind: 'spark' });
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
    for (let i = 0; i < (ev.boss ? 60 : 24); i++) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 30, y: cy + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0, max: 0.8 + Math.random() * 0.6, size: 3 + Math.random() * 4, color: ['#c9a24a', '#9a3f2a', '#6c6872', '#ffd890'][i % 4], grav: 700, kind: i % 3 === 0 ? 'gear' : 'shard', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
    this.fx.push({ kind: 'ring', x: cx, y: cy, r0: 10, r1: ev.boss ? 260 : 110, t: 0, dur: ev.boss ? 0.8 : 0.45, color: '#ffd890' });
    this.shake = Math.max(this.shake, ev.boss ? 18 : 7);
    if (ev.boss) { this.flashScreen = 0.6; this.flashColor = '#fff2d0'; }
    this.sfx(ev.boss ? 'bossDie' : 'enemyDie');
  }

  onGuard(ev) {
    this.fx.push({ kind: 'dome', t: 0, dur: 0.55 });
    this.floatAt('V', tr('+{n} GUARD', { n: ev.amount }), '#9ec4d8', 12);
  }

  onHeal(ev) {
    this.sparkleOn(ev.who, '#8ed49a');
    this.floatAt(ev.who, `+${ev.amount}`, '#8ed49a', 15);
    this.sfx('heal');
  }

  onStatus(ev) {
    const a = this.enemyActors.get(ev.uid);
    if (!a) return;
    const names = { exposed: tr('EXPOSED'), weak: tr('WEAK'), scorch: tr('SCORCH {n}', { n: ev.n }), mark: tr('MARKED'), parry: tr('PARRY STANCE'), shock: tr('SHOCK') };
    const colors = { exposed: '#ffb35a', weak: '#9ec4d8', scorch: '#ff8a3a', mark: '#ffd36a', parry: '#c9a8ff', shock: '#8fd0ff' };
    this.enemyNumber(a, names[ev.kind] || ev.kind.toUpperCase(), colors[ev.kind] || '#fff', 11);
  }

  onRelay(ev) {
    const from = this.lastActor;
    if (!from || from === ev.to) return;
    const [x1, y1] = this.partyPos(from);
    const [x2, y2] = this.partyPos(ev.to);
    const k = this.unit();
    this.fx.push({ kind: 'relay', x1, y1: y1 - 60 * k, x2, y2: y2 - 60 * k, t: 0, dur: 0.45, color: OWNER_COLORS[ev.to] });
    this.floatAt(ev.to, tr('RELAY'), OWNER_COLORS[ev.to], 13);
    this.sfx('relay');
  }

  onComboEnd(ev) {
    if (ev.kind === 'perfect') {
      this.sfx(ev.finisher ? 'finisher' : 'perfect');
      if (ev.finisher) {
        this.zoom = 0.09;
        this.flashScreen = 0.4;
        this.flashColor = '#ffe9b0';
        if (this.hooks.cutin) this.hooks.cutin({ owners: ev.owners, len: ev.len, damage: ev.damage });
      } else this.zoom = Math.max(this.zoom, 0.035);
      if (this.hooks.banner) this.hooks.banner(ev.finisher ? tr('FINISHER') : tr('PERFECT'), tr('{n} {n|card|cards} · {d} dmg', { n: ev.len, d: ev.damage }), 'good');
    } else if (ev.kind === 'forced') {
      this.sfx('dropped');
      if (this.hooks.banner) this.hooks.banner(tr('DROPPED'), tr('Flow ran out'), 'bad');
    }
  }

  onCashout(ev) {
    const [tx, ty] = this.targetX(this.combat.target);
    for (let i = 0; i < 18; i++) this.particles.push({ x: tx, y: ty, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 360, life: 0, max: 0.9, size: 4, color: '#ffd36a', grav: 700, kind: 'coin', rot: Math.random() * 6, vr: 8 });
    this.sfx('cashout', { quick: ev.quick });
    if (this.hooks.banner && ev.scale >= 1) this.hooks.banner(ev.quick ? tr('QUICK CASH OUT') : tr('CASH OUT'), tr('Payout {n}', { n: ev.amount }), 'gold');
  }

  onPhase(ev) {
    this.flashScreen = 0.7;
    this.flashColor = '#ff6a4a';
    this.shake = 16;
    this.zoom = 0.06;
    this.sfx('phase');
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
  slash(x, y, big, color) {
    this.fx.push({ kind: 'slash', x, y, r: big ? 70 : 42, ang: -0.6 + Math.random() * 0.3, t: 0, dur: big ? 0.28 : 0.2, color: color || (big ? '#ffd36a' : '#fff4dc'), big });
  }

  projectile(who, tx, ty, kind, dur, big, color) {
    const actor = this.actors[who];
    const [hx, hy] = this.partyPos(who);
    const k = this.unit() * LOOKS[who].scale;
    const tip = weaponTip(LOOKS[who], actor.lastPose);
    const sx = hx + actor.rootFrac * actor.targetDx + tip[0] * k, sy = hy + tip[1] * k;
    this.fx.push({ kind: kind === 'orb' ? 'orb' : 'bolt', x1: sx, y1: sy, x2: tx, y2: ty, t: 0, dur, color: color || (kind === 'orb' ? '#f0b25a' : '#ffe6a0'), big });
    for (let i = 0; i < 5; i++) this.particles.push({ x: sx, y: sy, vx: 120 + Math.random() * 120, vy: (Math.random() - 0.5) * 120, life: 0, max: 0.2, size: 2, color: '#fff0c0', grav: 0, kind: 'spark' });
  }

  magicCircle(who) {
    const [hx, hy] = this.partyPos(who);
    this.fx.push({ kind: 'circle', x: hx, y: hy, t: 0, dur: 0.6, color: '#f0b25a' });
  }

  sparkleOn(who, color) {
    const [hx, hy] = this.partyPos(who);
    const k = this.unit();
    for (let i = 0; i < 12; i++) this.particles.push({ x: hx + (Math.random() - 0.5) * 40 * k, y: hy - Math.random() * 90 * k, vx: 0, vy: -40 - Math.random() * 40, life: 0, max: 0.8, size: 2.5, color, grav: -20, kind: 'spark' });
  }

  waveFrom(a) {
    const [x, y, sc, b] = this.enemyPos(a);
    this.fx.push({ kind: 'wave', x: x + b[0] * sc, y: y - 20, t: 0, dur: 0.5, color: '#ff8a6a' });
  }

  // ───────────────────────── frame ─────────────────────────
  update(dt) {
    this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].at <= this.time) {
        const q = this.queue[i];
        this.queue.splice(i, 1);
        q.fn();
      }
    }
    for (const a of Object.values(this.actors)) a.update(dt);
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
    this.particles = this.particles.filter((p) => p.life < p.max);
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
    const t = this.time;
    ctx.save();
    const sh = this.reducedMotion || !this.shakeEnabled ? 0 : this.shake;
    const z = this.reducedMotion ? 0 : this.zoom;
    ctx.translate(w / 2 + (Math.random() - 0.5) * sh, h * 0.7 + (Math.random() - 0.5) * sh);
    ctx.scale(1 + z, 1 + z);
    ctx.translate(-w / 2, -h * 0.7);
    this.bg.draw(ctx, t, w, h, dpr);

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
    this.bg.drawForeground(ctx, t, w, h);
    ctx.restore();

    this.drawEnemyHud(ctx, t);
    this.drawPartyHud(ctx, t);
    this.drawNumbers(ctx);
    if (this.flashScreen > 0) {
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
    const pose = actor.pose(t);
    const x = hx + actor.rootFrac * actor.targetDx;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(ctx, x, hy + 2, 22 * k, 5 * k);
    ctx.fill();
    // active-actor highlight during combos
    const c = this.combat;
    if (c && c.combo && c.combo.owner === id) {
      glow(ctx, x, hy - 40 * k, 70 * k, OWNER_COLORS[id], 0.35 + 0.1 * Math.sin(t * 8));
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
    drawCharacter(ctx, look, pose, t);
    if (down && 'filter' in ctx) ctx.filter = 'none';
    if (actor.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = actor.flash * 0.55;
      drawCharacter(ctx, look, pose, t);
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
    const [x, y, sc] = this.enemyPos(a);
    const atk = a.atkCurve();
    const melee = a.atkKind === 'atk';
    const lunge = melee ? -atk * this.w * 0.12 : -atk * this.w * 0.015;
    const shake = a.hurt > 0 ? Math.sin(t * 70) * a.hurt * 4 : 0;
    const kb = a.hurt * 8;
    const flyBob = a.def.flying ? Math.sin(t * 2 + a.slot) * 6 : 0;
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
    ctx.translate(x + lunge + shake + kb, y + flyBob);
    let alpha = a.spawnT;
    if (a.dieT >= 0) {
      const p = clamp(a.dieT / 1.0, 0, 1);
      alpha *= 1 - p;
      ctx.translate(0, p * 20 * sc);
      ctx.rotate(p * 0.25);
    }
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    const art = ENEMY_ART[a.art];
    const params = { t: t + a.slot * 1.7, wind, atk, hurt: a.hurt, phase: e.phase, parry: e.st.parry || 0 };
    art(ctx, params);
    if (a.flash > 0 || (a.dieT >= 0 && a.dieT < 0.3)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.max(a.flash, a.dieT >= 0 ? 1 - a.dieT / 0.3 : 0) * 0.6 * alpha;
      art(ctx, params);
    }
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
      const y = n.y + n.vy * n.t;
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
    for (const a of this.enemyActors.values()) {
      const e = c.enemies.find((x) => x.uid === a.uid);
      if (!e || !e.alive) continue;
      if (e.tier === 'boss') { this.drawBossHud(ctx, e, t); continue; }
      const [x, y, sc, b] = this.enemyPos(a);
      const bw = Math.max(compact ? 64 : 80, Math.min(130, (b[2] - b[0]) * sc));
      const top = y + b[1] * sc - (compact ? 22 : 30);
      const bx = x + (b[0] + b[2]) * 0.5 * sc - bw / 2;
      this.drawBars(ctx, e, bx, top, bw, compact, t);
      if (c.target === e.uid) this.drawTargetMarker(ctx, x + (b[0] + b[2]) * 0.5 * sc, y + b[1] * sc * 0.5, (b[2] - b[0]) * sc, -b[1] * sc, t);
    }
  }

  drawBars(ctx, e, bx, top, bw, compact, t) {
    const c = this.combat;
    const fs = compact ? 10 : 12;
    // name
    ctx.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const name = enemyName(e.id, e.lvl).toUpperCase();
    ctx.fillStyle = 'rgba(20,8,14,0.85)';
    ctx.fillText(name, bx + 1, top - 1 + 1);
    ctx.fillStyle = e.tier === 'elite' ? '#ffb35a' : '#efe2c6';
    ctx.fillText(name, bx, top - 1);
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
      const txt = it.kind === 'aoe' ? `${it.dmg}×3` : String(it.dmg);
      ctx.strokeText(txt, x + r, y + r * 1.62);
      ctx.fillStyle = '#ffd36a';
      ctx.fillText(txt, x + r, y + r * 1.62);
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
      this.drawTargetMarker(ctx, x + (b[0] + b[2]) * 0.5 * sc, y + b[1] * sc * 0.5, (b[2] - b[0]) * sc, -b[1] * sc, t);
    }
  }

  drawTargetMarker(ctx, cx, cy, w, h, t) {
    const pad = 8 + Math.sin(t * 6) * 3;
    const x0 = cx - w / 2 - pad, x1 = cx + w / 2 + pad, y0 = cy - h / 2 - pad, y1 = cy + h / 2 + pad;
    const L = Math.min(16, w * 0.3);
    ctx.save();
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.moveTo(x + dx * L, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * L);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawPartyHud(ctx, t) {
    const c = this.combat;
    const compact = this.h < 300;
    const k = this.unit();
    for (const p of c.party) {
      const [hx, hy] = this.partyPos(p.id);
      const bw = compact ? 54 : Math.max(70, 64 * k);
      const bx = hx - bw / 2, by = hy + (compact ? 5 : 8);
      const fs = compact ? 9 : 11;
      roundRect(ctx, bx - 1, by - 1, bw + 2, (compact ? 5 : 7) + 2, 2);
      ctx.fillStyle = 'rgba(20,8,14,0.85)';
      ctx.fill();
      const hp = clamp(p.hp / p.maxHp, 0, 1);
      ctx.fillStyle = hp < 0.3 ? '#e8644a' : '#7ec48a';
      ctx.fillRect(bx, by, bw * hp, compact ? 5 : 7);
      ctx.font = `700 ${fs}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = OWNER_COLORS[p.id];
      ctx.fillText(p.ko ? `${ownerName(p.id)} · ${tr('KO')}` : ownerName(p.id), bx, by + (compact ? 6 : 9));
      ctx.textAlign = 'right';
      ctx.fillStyle = '#efe2c6';
      ctx.fillText(`${Math.ceil(p.hp)}/${p.maxHp}`, bx + bw, by + (compact ? 6 : 9));
      if (!p.ko && p.st.weak && p.st.weak > c.t) {
        const left = p.st.weak - c.t;
        drawIcon(ctx, 'down', bx - 9, by + 3, 12, '#9ec4d8');
        ctx.textAlign = 'right';
        ctx.fillStyle = '#9ec4d8';
        ctx.fillText(`${tr('WEAK')} ${tr('{n}s', { n: Math.round(left) })}`, bx - 16, by + (compact ? 6 : 9));
      }
    }
    void t;
  }
}
