// Battle screen: owns the Combat instance for one encounter, renders the hand/controls,
// handles touch gestures (tap = play, swipe down = Churn, swipe up = Reserve, hold = details).
import { Combat, RULES } from '../engine/combat.js';
import { CARDS, isOffensive } from '../data/cards.js';
import { DEV_REMARKS } from '../data/story.js';
import { TRAITS } from '../data/traits.js';
import { t, msg, num, secs, block, cardName, enemyName, intentName, intentDesc, recipeName, traitName, traitText, adaptName, adaptDesc, adaptBreak, relicName, remark, ownerName, ownerInitial, strengthName } from '../i18n/index.js';
import { BattleView } from '../render/battleView.js';
import { drawPortrait } from '../render/rig.js';
import { h, clear, btn } from './dom.js';
import { cardEl, cardTooltip, fitText, CAT_GLYPH } from './cardView.js';
import { LESSONS, LESSON_PACE, pickLesson } from './lessons.js';
import { recordCombo } from '../engine/save.js';
import { knownDiscoveries, RECIPE_MAP } from '../data/recipes.js';
import { seqChips } from './museum.js';

const OWNER_COL = { V: '#d0603f', C: '#b48cf0', S: '#e6c25a' };
const HERO_KEYS = { KeyQ: 'V', KeyW: 'C', KeyE: 'S' };
const KEY_OF = { V: 'Q', C: 'W', S: 'E' };
// reasons an unplayable hand card shows on its face (others are shown by the card's own state)
const SHOWN_REASONS = ['rank', 'owner', 'needbasic', 'momentum', 'junk', 'busy', 'heroes', 'queue', 'nocombo', 'needcard'];

// A mini card (Reserve, next card): rank and suit for attacks, a cross for support, then the name.
function miniCard(c, uid, inst) {
  const def = CARDS[inst.id];
  const off = isOffensive(def);
  const v = uid && c ? c.effVariant(uid) : inst.variant || def.variant;
  const rank = uid && c ? c.effRank(uid) : def.rank;
  return h('div', { class: `res-card owner-${def.owner || 'N'} v-${v} cat-${def.category}`, role: 'button', tabindex: '0', 'data-uid': uid || inst.uid },
    h('span', { class: 'rr' }, off ? String(rank) : CAT_GLYPH[def.category]),
    off ? h('span', { class: 'rv' }, v) : def.cost ? h('span', { class: 'rc' }, `${def.cost}M`) : h('span', {}),
    h('span', { class: 'rn' }, cardName(def.id)));
}


// A Reserve mini-card keeps rank and suit on their own row while the name fits beneath them;
// in a short slot (3-4 slots, small screens) the name wraps around them and uses the full height.
function fitReserveCard(el) {
  if (!el.isConnected) return;
  const rn = el.querySelector('.rn');
  const over = () => el.scrollHeight > el.clientHeight + 1;
  el.classList.remove('dense');
  // strict here: a name box shorter than its line cuts the descenders
  if (fitText(rn, 0.8, () => rn.scrollHeight > rn.clientHeight || over())) return;
  el.classList.add('dense');
  fitText(rn, 0.7, over);
}
export class BattleScreen {
  constructor(app, setup, onEnd) {
    this.app = app;
    this.setup = setup;
    this.onEnd = onEnd;
    this.combat = new Combat(setup);
    this.slots = Array.from({ length: RULES.HAND }, () => ({ uid: null, el: null }));
    this.causes = {};
    this.endTimer = null;
    this.ended = false;
    this.remarkCooldown = 0;
    this.cashStreak = 0;
    this.perfectStreak = 0;
    this.saidOnce = new Set();
    // progressive lessons (src/ui/lessons.js): how many this battle has shown, when the last closed
    this.lessons = { flags: {}, shown: 0, lastAt: -99, kind: setup.kind, poll: 0 };
    this.lessonOpen = null;
    this.exLog = []; // EX Combos shown in this battle: { id, fresh } (also read by tools)
    this.lastFlowWarn = 0;
    this.pick = null; // a hero-targeted support (Braced) waiting for the player to choose its hero
  }

  mount(root) {
    const c = this.combat;
    this.root = h('div', { class: 'battle' });
    // field
    this.canvas = h('canvas', { class: 'battle-canvas' });
    this.field = h('div', { class: 'field' }, this.canvas);
    this.topbar = h('div', { class: 'battle-top' });
    this.adaptEl = h('div', { class: 'adapt-panel', hidden: true });
    this.bannerEl = h('div', { class: 'banner-layer' });
    this.cutinEl = h('div', { class: 'cutin-layer' });
    this.tutEl = h('div', { class: 'tut-layer', hidden: true });
    this.field.append(this.topbar, this.adaptEl, this.bannerEl, this.cutinEl);
    // deck area
    this.chipsEl = h('div', { class: 'combo-chips' });
    this.nextEl = h('div', { class: 'combo-next' });
    this.flowFill = h('div', { class: 'flow-fill' });
    this.flowCap = h('div', { class: 'flow-cap' });
    this.flowText = h('div', { class: 'flow-text' });
    // the Flow an enemy is about to steal (Tempo Theft): the end of the fill, in red
    this.flowThreat = h('div', { class: 'flow-threat' });
    this.flowBar = h('div', { class: 'flow-bar' }, this.flowCap, this.flowFill, this.flowThreat, this.flowText);
    // who the next attack hits; tap to switch to the next enemy (enemies can also be tapped directly)
    this.targetChip = h('button', { class: 'target-chip', type: 'button' }, h('span', { class: 'tc-ico', 'aria-hidden': 'true' }, '⌖'), h('span', { class: 'tc-name' }), h('span', { class: 'tc-cycle', 'aria-hidden': 'true' }, '⟳'));
    this.targetChip.addEventListener('click', () => this.cycleTarget());
    // hero buttons (docs/COMBAT_SPEC.md §20): each hero's state (Ready, Active, Acting, Committed,
    // Recovering with a bar); with no chain a tap picks who starts the next one, during a chain a tap
    // on another hero asks for a Relay (also: tap a hero on the field, Q/W/E)
    this.heroSel = h('div', { class: 'hero-sel', role: 'group' });
    this.heroBtns = {};
    for (const id of ['V', 'C', 'S']) {
      const b = h('button', { class: `hero-btn owner-${id}`, type: 'button', 'data-hero': id }, h('span', { class: 'hb-i' }), h('span', { class: 'hb-n' }), h('span', { class: 'hb-a' }), h('span', { class: 'hb-st' }), h('span', { class: 'hb-bar' }));
      b.addEventListener('click', () => this.doSelectHero(id));
      this.heroBtns[id] = b;
      this.heroSel.append(b);
    }
    // while a hero-targeted support waits for its hero: cancel without spending the card
    this.pickCancel = h('button', { class: 'pick-cancel', type: 'button', hidden: true }, '✕');
    this.pickCancel.addEventListener('click', () => this.endPick(true));
    this.heroSel.append(this.pickCancel);
    const strip = h('div', { class: 'strip' }, this.heroSel, this.targetChip, h('div', { class: 'combo-wrap' }, this.chipsEl, this.nextEl), this.flowBar);
    this.nextCell = h('div', { class: 'next-cell' }, h('span', { class: 'nc-label' }), h('div', { class: 'nc-body' }));
    this.nextCell.lastChild.style.cssText = 'flex:1;display:flex;min-height:0';
    this.reserveEl = h('div', { class: 'reserve' }, this.nextCell, h('div', { class: 'zone-label' }));
    this.reserveSlots = h('div', { class: 'reserve-slots' });
    this.reserveEl.append(this.reserveSlots);
    this.handEl = h('div', { class: 'hand' });
    this.slots.forEach((s, i) => {
      const el = h('div', { class: 'slot', 'data-slot': i }, h('div', { class: 'slot-jam' }, h('span', {})), h('div', { class: 'swipe-hint' }),
        h('div', { class: 'slot-ghost' }, h('span', { class: 'g-r' }), h('span', { class: 'g-n' }), h('span', { class: 'g-s' })));
      s.box = el;
      this.bindGestures(el, i);
      this.handEl.append(el);
    });
    // controls
    this.cashBtn = h('button', { class: 'ctl cash', type: 'button' }, h('span', { class: 'ctl-main' }), h('span', { class: 'ctl-sub' }, ''));
    this.cashBtn.addEventListener('click', () => this.doCashOut());
    this.flowBtn = h('button', { class: 'ctl mom', type: 'button' }, h('span', { class: 'ctl-main' }), h('span', { class: 'ctl-sub' }, ''));
    this.flowBtn.addEventListener('click', () => this.doSpend('flow'));
    this.guardBtn = h('button', { class: 'ctl mom', type: 'button' }, h('span', { class: 'ctl-main' }), h('span', { class: 'ctl-sub' }, ''));
    this.guardBtn.addEventListener('click', () => this.doSpend('guard'));
    this.momEl = h('div', { class: 'momentum' });
    this.guardEl = h('div', { class: 'stat guard' });
    this.churnEl = h('div', { class: 'stat churn' });
    this.controls = h('div', { class: 'controls' },
      h('div', { class: 'ctl-row' }, this.momEl),
      h('div', { class: 'ctl-row two' }, this.flowBtn, this.guardBtn),
      h('div', { class: 'ctl-row two' }, this.guardEl, this.churnEl),
      this.cashBtn);
    this.deck = h('div', { class: 'deck' }, strip, h('div', { class: 'row' }, this.reserveEl, this.handEl, this.controls));
    this.root.append(this.field, this.deck, this.tutEl);
    clear(root).append(this.root);
    this.applyLabels();

    this.view = new BattleView(this.canvas, {
      sfx: (n, o) => this.app.audio.sfx(n, o),
      banner: (t, s, tone) => this.banner(t, s, tone),
      cutin: (info) => this.cutin(info),
      telegraph: () => this.app.audio.sfx('telegraph'),
    });
    this.view.reducedMotion = this.app.settings.reducedMotion;
    this.view.shakeEnabled = this.app.settings.shake;
    this.view.setCombat(c, this.setup.act, this.setup.kind === 'boss' ? 1 : 0);
    // tap an enemy: make it the target; hold it: read what it will do (the battle pauses)
    let hold = null;
    const endHold = () => { if (hold) clearTimeout(hold.timer); hold = null; };
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const hero = this.view.heroHitTest(e.clientX - r.left, e.clientY - r.top);
      if (hero) { this.doSelectHero(hero); return; }
      if (this.pick) { this.endPick(true); return; }
      const uid = this.view.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (uid) {
        c.setTarget(uid);
        this.app.audio.sfx('click');
        endHold();
        hold = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { hold = null; this.showEnemyDetail(uid); }, 480) };
      }
    });
    this.canvas.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12) endHold(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.canvas.addEventListener(ev, endHold);
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.renderTop();
    this.layout();
    this.consumeEvents(c.drainEvents());
    const isBoss = this.setup.kind === 'boss';
    this.app.audio.music(isBoss ? 'boss' : `battle${this.setup.act}`);
    if (this.setup.trait) this.banner(traitName(this.setup.trait).toUpperCase(), traitText(this.setup.trait), 'info');
    if (c.adapt) this.banner(t('ADAPTATION'), `${adaptName(c.adapt)}: ${adaptDesc(c.adapt)}`, 'bad');
    this.maybeLesson();
  }

  // Fixed labels; called on mount and after a language switch.
  applyLabels() {
    this.reserveEl.querySelector('.zone-label').textContent = t('RESERVE');
    this.nextCell.querySelector('.nc-label').textContent = t('NEXT CARD');
    for (const [id, b] of Object.entries(this.heroBtns)) {
      b.querySelector('.hb-i').textContent = ownerInitial(id);
      b.querySelector('.hb-n').textContent = ownerName(id);
    }
    this.pickCancel.title = t('Cancel');
    for (const s of this.slots) s.box.querySelector('.slot-jam span').textContent = t('STATIC');
    this.cashBtn.querySelector('.ctl-main').textContent = t('CASH OUT');
    this.flowBtn.querySelector('.ctl-main').textContent = t('+FLOW');
    this.guardBtn.querySelector('.ctl-main').textContent = t('+GUARD');
  }

  // Re-renders every text in the battle UI in the current language. Combat state is untouched.
  relocalize() {
    this.applyLabels();
    this.renderTop();
    for (const k of ['_ft', '_fbs', '_gbs', '_gh', '_ch', '_cs', '_cm', 'chipSig', 'momSig', 'resSig', 'adaptHtml', 'tgtSig', 'heroSig', 'nextSig', 'hintSig']) this[k] = undefined;
    for (const b of Object.values(this.heroBtns)) b._sig = undefined;
    for (const sl of this.slots) sl.ghostSig = undefined;
    for (const s of this.slots) {
      if (s.el) s.el.remove();
      s.el = null;
      s.uid = null;
    }
    this.updateHud(true);
  }

  layout() {
    const r = this.field.getBoundingClientRect();
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width * r.height * dpr * dpr > 2.2e6) dpr = Math.max(1, Math.min(dpr, 1.5));
    this.view.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)), dpr);
    for (const [, el] of this.resEls || []) fitReserveCard(el);
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    clearTimeout(this.endTimer);
  }

  renderTop() {
    const s = this.setup;
    const run = this.app.run;
    const node = run ? run.node(run.d.pending && run.d.pending.nodeId) : null;
    const relics = (s.relics || []).map((id) => h('span', { class: 'relic-pip', title: relicName(id), 'data-relic': id }, this.app.relicIcon(id)));
    const pause = h('button', { class: 'icon-btn pause-btn', type: 'button', 'aria-label': t('Pause') }, '❚❚');
    pause.addEventListener('click', () => this.app.pause());
    const label = s.kind === 'boss' ? t('BOSS') : s.kind === 'elite' ? t('ELITE') : t('ACT {n}', { n: s.act });
    clear(this.topbar).append(
      h('div', { class: 'bt-left' }, h('span', { class: `bt-kind k-${s.kind}` }, label), node ? h('span', { class: 'bt-floor' }, t('Floor {n}', { n: run.d.floors })) : null, s.trait ? h('span', { class: 'trait-pip', style: { color: TRAITS[s.trait].color } }, traitName(s.trait)) : null),
      h('div', { class: 'bt-relics' }, relics),
      pause,
    );
    this.topbar.querySelectorAll('.relic-pip').forEach((el) => el.addEventListener('click', () => this.app.showRelic(el.dataset.relic)));
  }

  // ───────────────────────── gestures ─────────────────────────
  bindGestures(box, i) {
    let g = null;
    let lp = null;
    const cardOf = () => this.slots[i].el;
    const reset = () => {
      const el = cardOf();
      if (el) { el.style.transform = ''; el.classList.remove('dragging'); }
      box.classList.remove('hint-churn', 'hint-stash');
      clearTimeout(lp);
      g = null;
    };
    box.addEventListener('pointerdown', (e) => {
      const uid = this.slots[i].uid;
      if (!uid && !g && this.combat.heldSlots.has(i)) { this.cancelSlot(i); e.preventDefault(); return; }
      if (!uid || g) return;
      this.app.audio.unlock();
      g = { id: e.pointerId, uid, x0: e.clientX, y0: e.clientY, t0: performance.now(), dy: 0, moved: false, done: false };
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      lp = setTimeout(() => {
        if (g && !g.moved) { g.done = true; this.showDetail(uid); reset(); }
      }, 480);
      e.preventDefault();
    });
    box.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y0, dx = e.clientX - g.x0;
      g.dy = dy;
      if (Math.abs(dy) > 9 || Math.abs(dx) > 14) { g.moved = true; clearTimeout(lp); }
      const el = cardOf();
      if (el && g.moved && this.slots[i].uid === g.uid) {
        el.classList.add('dragging');
        const y = Math.max(-80, Math.min(95, dy));
        el.style.transform = `translateY(${y}px) rotate(${y * 0.04}deg)`;
      }
      box.classList.toggle('hint-churn', dy > 34);
      box.classList.toggle('hint-stash', dy < -34);
    });
    const finish = (e, cancelled) => {
      if (!g || e.pointerId !== g.id) return;
      const gg = g;
      reset();
      if (cancelled || gg.done) return;
      if (this.slots[i].uid !== gg.uid) return; // card changed under the finger
      if (gg.dy > 34) this.doChurn(gg.uid);
      else if (gg.dy < -34) this.doStash(gg.uid);
      else if (!gg.moved) this.doPlay(gg.uid);
    };
    box.addEventListener('pointerup', (e) => finish(e, false));
    box.addEventListener('pointercancel', (e) => finish(e, true));
    box.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onKey(e) {
    if (this.app.modalOpen() || this.ended) return;
    if (this.lessonOpen) {
      if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && performance.now() - this.lessonShownAt > 450) { this.closeLesson(false); e.preventDefault(); }
      return;
    }
    const c = this.combat;
    if (e.key === 'Escape' && this.pick) { this.endPick(true); e.preventDefault(); return; }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { this.app.pause(); e.preventDefault(); return; }
    if (this.app.paused) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { this.cancelLast(); e.preventDefault(); return; }
    if (HERO_KEYS[e.code] && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { this.doSelectHero(HERO_KEYS[e.code]); e.preventDefault(); return; }
    const n = parseInt(e.key, 10);
    const digit = /^Digit[1-8]$/.test(e.code) ? parseInt(e.code.slice(5), 10) : n;
    if (digit >= 1 && digit <= 6) {
      const uid = c.hand[digit - 1];
      if (!uid) return;
      if (e.shiftKey) this.doChurn(uid);
      else if (e.altKey) this.doStash(uid);
      else this.doPlay(uid);
      e.preventDefault();
    } else if (digit === 7 || digit === 8) {
      const uid = c.reserve[digit - 7];
      if (uid) this.doPlay(uid);
    } else if (e.key === ' ' || e.key === 'Enter') { this.doCashOut(); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') this.doSpend('flow');
    else if (e.key === 'g' || e.key === 'G') this.doSpend('guard');
    else if (e.key === 'Tab') {
      this.cycleTarget();
      e.preventDefault();
    }
  }

  cycleTarget() {
    const c = this.combat;
    const alive = c.aliveEnemies();
    if (alive.length < 2) return;
    const i = alive.findIndex((x) => x.uid === c.target);
    c.setTarget(alive[(i + 1) % alive.length].uid);
    this.app.audio.sfx('click');
  }

  // ───────────────────────── actions ─────────────────────────
  doPlay(uid, opts) {
    if (this.app.paused || this.ended) return;
    const c = this.combat;
    const def = c.def(uid);
    // a hero-targeted support (Braced): the first tap asks which hero; tapping it again uses the default
    if (def && def.targetHero && !opts) {
      if (this.pick && this.pick.uid === uid) { const tgt = this.pick.def; this.endPick(false); return this.doPlay(uid, { target: tgt }); }
      if (c.check(uid).ok) { this.startPick(uid); return; }
    }
    const res = c.playCard(uid, opts);
    if (res.ok) {
      this.causes[uid] = 'play';
      this.app.audio.sfx('cardPlay', { rank: def ? Math.max(1, def.rank) : 1 });
    } else if (res.reason === 'locked' || res.reason === 'junk' || res.reason === 'recover' || res.reason === 'latched') {
      this.app.audio.sfx('reject');
    } else this.app.audio.sfx(c.phase === 'ACTIVE' || (c.combo && c.combo.stumbles) ? 'stumble' : 'reject');
    this.afterAction();
  }

  doChurn(uid) {
    if (this.app.paused || this.ended) return;
    const r = this.combat.churnCard(uid);
    if (r.ok) { this.causes[uid] = 'churn'; this.app.audio.sfx('churn'); }
    else this.app.audio.sfx('reject');
    this.afterAction();
  }

  doStash(uid) {
    if (this.app.paused || this.ended) return;
    const r = this.combat.stash(uid);
    if (r.ok) { this.causes[uid] = 'stash'; this.app.audio.sfx('stash'); }
    else this.app.audio.sfx('reject');
    this.afterAction();
  }

  // the end-of-combo button: FINISH after an arte (a Perfect), CASH OUT otherwise
  doCashOut() {
    if (this.app.paused || this.ended) return;
    const r = this.combat.finishOrCashOut();
    if (!r.ok) this.app.audio.sfx('reject');
    this.afterAction();
  }

  doSelectHero(id) {
    if (this.app.paused || this.ended) return;
    if (this.pick) {
      const uid = this.pick.uid;
      this.endPick(false);
      this.doPlay(uid, { target: id });
      return;
    }
    const r = this.combat.selectHero(id);
    this.app.audio.sfx(r.ok ? (r.cmd ? 'relay' : 'click') : 'reject');
    this.afterAction();
  }

  // Braced: choose the hero (hero buttons, a hero on the field, Q/W/E); ✕, Escape or a tap elsewhere
  // cancels without spending the card
  startPick(uid) {
    const c = this.combat;
    const d = c.braceTarget();
    this.pick = { uid, def: d ? d.id : 'V' };
    this.app.audio.sfx('click');
    this.afterAction();
  }
  endPick(cancelled) {
    if (!this.pick) return;
    this.pick = null;
    if (cancelled) this.app.audio.sfx('click');
    this.afterAction();
  }
  // cancel the queued command whose card came from this hand slot (tap the placeholder)
  cancelSlot(i) {
    const c = this.combat;
    const q = c.queue.find((x) => x.zone === 'hand' && x.slot === i);
    if (q) this.doCancel(q.id);
    else { this.app.audio.sfx('reject'); this.flashNote(t('Already executing')); }
  }
  cancelLast() {
    const q = this.combat.queue[this.combat.queue.length - 1];
    if (q) this.doCancel(q.id);
  }
  doCancel(id) {
    if (this.app.paused || this.ended) return;
    const ok = this.combat.cancelCmd(id);
    this.app.audio.sfx(ok ? 'click' : 'reject');
    this.afterAction();
  }

  doSpend(kind) {
    if (this.app.paused || this.ended) return;
    const r = kind === 'flow' ? this.combat.spendMomentumFlow() : this.combat.spendMomentumGuard();
    this.app.audio.sfx(r.ok ? 'momentum' : 'reject');
    if (!r.ok && r.text) this.flashNote(msg(r.text));
    this.afterAction();
  }

  afterAction() {
    this.consumeEvents(this.combat.drainEvents());
    this.updateHud(true);
    this.maybeLesson();
  }

  // ───────────────────────── frame ─────────────────────────
  frame(dt) {
    const c = this.combat;
    if (!this.app.paused) {
      c.update(dt);
      this.consumeEvents(c.drainEvents());
      this.view.update(dt);
      this.remarkCooldown = Math.max(0, this.remarkCooldown - dt);
      this.lessons.poll -= dt;
      if (this.lessons.poll <= 0) { this.lessons.poll = 0.2; this.maybeLesson(); }
    }
    this.view.draw();
    this.updateHud(false);
    if (c.phase === 'END' && !this.ended) {
      this.ended = true;
      const win = c.result.victory;
      this.app.audio.sfx(win ? 'victory' : 'defeat');
      this.banner(win ? t('VICTORY') : t('DEFEAT'), win ? t('Signal holds') : t('The party falls'), win ? 'gold' : 'bad');
      this.endTimer = setTimeout(() => this.onEnd(c.outcome(), c), win ? 1700 : 2200);
    }
  }

  consumeEvents(events) {
    if (!events.length) return;
    this.view.consume(events);
    const c = this.combat;
    const ex = new Map(); // EX Combos completed by the same command are shown together
    for (const ev of events) {
      switch (ev.type) {
        case 'exCombo': { if (!ex.has(ev.group)) ex.set(ev.group, []); ex.get(ev.group).push(ev); break; }
        case 'churn': this.causes[ev.uid] = 'churn'; break;
        case 'tuck': this.causes[ev.uid] = 'tuck'; break;
        case 'stash': this.causes[ev.uid] = 'stash'; break;
        case 'lock': this.app.audio.sfx('lock'); break;
        case 'unlock': this.app.audio.sfx('unlock'); break;
        case 'stumble': this.flashNote(t('STUMBLE {n}/{max}', { n: ev.n, max: RULES.MAX_STUMBLES })); break;
        case 'reject':
          if (ev.text && ev.reason !== 'zone') this.flashNote(msg(ev.text));
          // a tap refused because a hero is busy is the moment Recovery needs explaining
          if (['hero', 'busy', 'recover', 'heroes'].includes(ev.reason)) this.lessons.flags.busyTap = true;
          break;
        case 'comboEnd': this.onComboEnd(ev); break;
        case 'banner': if (ev.text === 'ADAPTATION BROKEN') this.remark('adaptBroken', true); break;
        case 'phase': this.app.audio.music('boss'); break;
        default: break;
      }
    }
    for (const list of ex.values()) this.onExCombo(list);
  }

  onComboEnd(ev) {
    if (ev.kind === 'cashout') this.cashStreak++;
    else this.cashStreak = 0;
    if (ev.kind === 'perfect') this.perfectStreak++;
    else this.perfectStreak = 0;
    if (ev.len >= 6) this.remark('longCombo');
    if (this.cashStreak >= 3) this.remark('cashSpam');
    if (this.perfectStreak >= 3) this.remark('perfectStreak');
    if (ev.owners && ev.owners.length === 3) this.remark('tripleRelay', true);
    if (ev.finisher) this.remark('finisher', true);
    if (this.combat.stats.churns >= 6) this.remark('churnSpam', true);
    const low = this.combat.hp < this.combat.maxHp * 0.25;
    if (low) this.remark('lowHp', true);
  }

  // EX Combos (Phase 7). A discovery is recorded in the Museum's Combo Journal the moment the recipe
  // activates and saved at once — whatever happens to the battle afterwards (docs/COMBAT_SPEC.md §28).
  // One banner per command: the recipes in priority order and what their effects actually gave.
  onExCombo(list) {
    const fresh = [];
    for (const ev of list) {
      const isNew = recordCombo(this.app.meta, ev.id);
      if (isNew) fresh.push(ev.id);
      this.exLog.push({ id: ev.id, fresh: isNew, applied: ev.applied, group: ev.group, order: ev.order, len: ev.len, heroes: ev.heroes, sum: { ...ev.sum }, t: this.combat.t });
    }
    this.app.saveMeta();
    const sum = {};
    for (const ev of list) for (const [k, v] of Object.entries(ev.sum)) sum[k] = typeof v === 'boolean' ? sum[k] || v : (sum[k] || 0) + v;
    const parts = [];
    if (sum.dmg) parts.push(t('{n} damage', { n: sum.dmg }));
    if (sum.guard) parts.push(t('+{n} Guard', { n: sum.guard }));
    if (sum.heal) parts.push(t('+{n} HP', { n: sum.heal }));
    if (sum.momentum) parts.push(t('+{n} Momentum', { n: sum.momentum }));
    if (sum.flow) parts.push(t('+{s} Flow', { s: secs(sum.flow, 1) }));
    if (sum.churn) parts.push(t('+{n} Churn', { n: sum.churn }));
    if (sum.exposed) parts.push(t('Exposed {s}', { s: secs(sum.exposed, 0) }));
    if (sum.counter) parts.push(t('Counter {n}', { n: sum.counter }));
    if (sum.cover) parts.push(t('Cover +{s}', { s: secs(sum.cover, 0) }));
    if (sum.unlocked) parts.push(t('{n} unlocked', { n: sum.unlocked }));
    if (sum.echo) parts.push(t('Echo'));
    if (list.some((ev) => !ev.applied)) parts.push(t('the battle was already won'));
    const text = h('div', { class: 'banner-text' }, h('span', { class: 'ex-plate' }, 'EX'), list.map((ev) => recipeName(ev.id)).join(' + '));
    // why: each recipe's sequence as symbol chips (the Combo Journal has it in words)
    const why = h('div', { class: 'banner-why' }, ...list.map((ev, i) => [i ? h('span', { class: 'plus' }, '+') : null, seqChips(RECIPE_MAP[ev.id], true)]).flat().filter(Boolean));
    const b = h('div', { class: 'banner tone-ex', 'data-ex': list.map((ev) => ev.id).join(',') }, text, why,
      parts.length ? h('div', { class: 'banner-sub' }, parts.join(' · ')) : null,
      fresh.length ? h('div', { class: 'banner-sub banner-new' }, t('NEW EX COMBO DISCOVERED')) : null);
    this.bannerEl.append(b);
    while (this.bannerEl.children.length > 2) this.bannerEl.firstChild.remove();
    const hold = fresh.length ? 2600 : 1700;
    setTimeout(() => b.classList.add('out'), hold);
    setTimeout(() => b.remove(), hold + 700);
    this.app.audio.sfx(fresh.length ? 'exNew' : 'ex');
  }

  remark(key, once) {
    if (once && this.saidOnce.has(key)) return;
    if (this.remarkCooldown > 0) return;
    this.saidOnce.add(key);
    this.remarkCooldown = 14;
    const i = Math.floor(Math.random() * DEV_REMARKS[key].length);
    this.app.toast(remark(key, i), 'dev');
  }

  flashNote(text) {
    const n = h('div', { class: 'flash-note' }, text);
    this.deck.append(n);
    setTimeout(() => n.remove(), 900);
  }

  banner(text, sub, tone = 'info') {
    const b = h('div', { class: `banner tone-${tone}` }, h('div', { class: 'banner-text' }, text), sub ? h('div', { class: 'banner-sub' }, sub) : null);
    this.bannerEl.append(b);
    while (this.bannerEl.children.length > 2) this.bannerEl.firstChild.remove();
    setTimeout(() => b.classList.add('out'), tone === 'bad' && sub && sub.length > 40 ? 2600 : 1300);
    setTimeout(() => b.remove(), 3000);
  }

  cutin(info) {
    if (this.app.settings.reducedMotion) return;
    const band = h('div', { class: 'cutin' });
    for (const id of info.owners) {
      const cv = h('canvas', { width: 160, height: 160, class: 'cutin-portrait' });
      const ctx = cv.getContext('2d');
      ctx.fillStyle = OWNER_COL[id];
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, 0, 160, 160);
      ctx.globalAlpha = 1;
      drawPortrait(ctx, id, 160, 160, 0.5, 'victory');
      band.append(cv);
    }
    band.append(h('div', { class: 'cutin-text' }, info.len >= 7 ? t('GRAND RELAY') : t('RELAY FINISHER')));
    this.cutinEl.append(band);
    setTimeout(() => band.remove(), 1100);
  }

  // ───────────────────────── lessons ─────────────────────────
  // The first relevant lesson not seen yet (src/ui/lessons.js), at most LESSON_PACE.perBattle per
  // battle and LESSON_PACE.gap seconds of battle time apart. It pauses the battle while open.
  maybeLesson() {
    const c = this.combat;
    if (!this.app.settings.hints || this.lessonOpen || this.ended || this.app.paused || this.pick || c.phase === 'END') return;
    const L = this.lessons;
    if (L.shown >= (this.setup.tutorial ? LESSON_PACE.perBattle.tutorial : LESSON_PACE.perBattle.normal)) return;
    if (c.t - L.lastAt < LESSON_PACE.gap) return;
    const r = pickLesson(c, { seen: this.app.meta.tut, flags: L.flags, kind: this.setup.kind, tutorial: !!this.setup.tutorial, tactical: !!c.tactical, exKnown: knownDiscoveries(this.app.meta.combos).length, exBanner: !!this.bannerEl.querySelector('.banner.tone-ex:not(.out)') });
    if (r) this.showLesson(r.lesson, r.anchor);
  }
  // also used by tools (i18n-layout) to show a given lesson
  showLessonByKey(key) {
    const L = LESSONS.find((x) => x.key === key);
    if (L) this.showLesson(L, L.when(this.combat, { seen: {}, flags: { busyTap: true }, kind: this.setup.kind }) || null);
  }
  showLesson(L, anchor) {
    const [title, body] = block('lessons', L.key, [L.title, L.body]);
    this.lessonOpen = L.key;
    this.lessonAnchor = anchor;
    this.lessonShownAt = performance.now();
    this.updateHud(true);
    this.app.pause(true);
    clear(this.tutEl);
    this.tutEl.hidden = false;
    this.tutEl.classList.add('coach');
    this.tutEl.dataset.lesson = L.key;
    // a lesson can appear under a finger that was about to tap a card: the card ignores input for a
    // moment, and turning every tip off takes a second, confirming tap
    const openedAt = performance.now();
    const ready = () => performance.now() - openedAt > 450;
    const ok = h('button', { class: 'btn primary', type: 'button' }, t('Got it'));
    ok.addEventListener('click', () => { if (ready()) this.closeLesson(false); });
    const skip = h('button', { class: 'btn small coach-skip', type: 'button' }, t('Skip all tips'));
    skip.addEventListener('click', () => {
      if (!ready()) return;
      if (skip.classList.contains('armed')) { this.closeLesson(true); return; }
      skip.classList.add('armed');
      skip.textContent = t('Tap again: no more tips');
    });
    const card = h('div', { class: 'tut-card coach-card', role: 'dialog', 'aria-label': title },
      h('div', { class: 'tut-title' }, title), h('div', { class: 'tut-body', html: body }), h('div', { class: 'coach-btns' }, ok, skip));
    const box = this.root.getBoundingClientRect();
    const r = this.anchorRect(anchor);
    if (r) {
      const pad = 4;
      const ring = h('div', { class: 'coach-ring' });
      Object.assign(ring.style, { left: `${r.left - box.left - pad}px`, top: `${r.top - box.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      this.tutEl.append(ring);
    }
    this.tutEl.append(card);
    // beside the spotlight: above it in the lower half of the screen, below it in the upper half
    const cw = card.offsetWidth, ch = card.offsetHeight, W = box.width, H = box.height;
    let x = (W - cw) / 2, y = (H - ch) / 2;
    if (r) {
      const cx = r.left - box.left + r.width / 2;
      x = Math.max(8, Math.min(W - cw - 8, cx - cw / 2));
      const top = r.top - box.top, bottom = r.bottom - box.top;
      if (top + r.height / 2 > H / 2) y = top - ch - 12 >= 4 ? top - ch - 12 : Math.max(4, (top - ch) / 2);
      else y = bottom + 12 + ch <= H - 4 ? bottom + 12 : Math.min(H - ch - 4, bottom + (H - bottom - ch) / 2);
      if (y < 4) y = 4;
    }
    Object.assign(card.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px` });
    setTimeout(() => ok.focus(), 50);
  }
  closeLesson(skipAll) {
    const key = this.lessonOpen;
    if (!key) return;
    this.app.meta.tut[key] = true;
    this.app.saveMeta();
    if (skipAll) {
      this.app.settings.hints = false;
      this.app.saveSettings();
      this.app.toast(t('Tips are off. Settings → Tutorial hints turns them back on.'));
    }
    this.lessonOpen = null;
    this.lessons.shown++;
    this.lessons.lastAt = this.combat.t;
    this.tutEl.hidden = true;
    this.tutEl.classList.remove('coach');
    clear(this.tutEl);
    this.app.resume();
  }
  // Where a lesson's anchor is on screen (viewport coordinates), or null.
  anchorRect(a) {
    if (!a) return null;
    const cv = this.canvas.getBoundingClientRect();
    const field = (r) => (r ? { left: cv.left + r.x, top: cv.top + r.y, width: r.w, height: r.h, right: cv.left + r.x + r.w, bottom: cv.top + r.y + r.h } : null);
    if (a.slot !== undefined) return this.slots[a.slot] ? this.slots[a.slot].box.getBoundingClientRect() : null;
    if (a.reserve !== undefined) { const el = this.reserveSlots.children[a.reserve]; return (el || this.reserveEl).getBoundingClientRect(); }
    if (a.hero) return this.heroBtns[a.hero].getBoundingClientRect();
    if (a.fieldHero) return field(this.view.heroRect(a.fieldHero));
    if (a.enemy) return field(this.view.enemyRect(a.enemy));
    const el = { cash: this.cashBtn, guard: this.guardBtn, flow: this.flowBar, momentum: this.momEl, reserve: this.reserveEl, hand: this.handEl,
      queueWait: this.chipsEl.querySelector('.chip.q.wait') || this.chipsEl }[a.ui];
    return el ? el.getBoundingClientRect() : null;
  }

  // What an enemy is about to do, in numbers the engine will use: single hits after the target's
  // Defense (Cover moves them to Hessa), area hits per hero and in all — both before Guard, which the
  // panel names separately because it can still change before the hit lands.
  showEnemyDetail(uid) {
    const c = this.combat;
    const e = c.enemies.find((x) => x.uid === uid && x.alive);
    if (!e || this.ended) return;
    const it = e.intent;
    const lines = [];
    if (it) {
      const left = Math.max(0, ((1 - e.atb) * e.actTime) / Math.max(0.01, c.enemySpeed(e)));
      lines.push(h('p', {}, h('b', {}, intentName(e.id, it.key)), ' · ', t('acts in about {s}', { s: secs(left, 1) })));
      if (it.dmg && it.kind === 'aoe') {
        const parts = c.party.map((p) => ({ id: p.id, n: c.mitigate(e, it.dmg, p, {}) }));
        const total = parts.reduce((a, x) => a + x.n, 0);
        lines.push(h('p', {}, t('Hits every hero after Defense: {list} — {n} in all, before Guard.', { list: parts.map((x) => `${ownerName(x.id)} ${x.n}`).join(' · '), n: total })));
      } else if (it.dmg && it.target) {
        const tgt = c.hitTarget(it.target);
        const n = c.mitigate(e, it.dmg, tgt, {});
        lines.push(h('p', {}, tgt.id !== it.target
          ? t('Hits {hero} for {n} after Defense, before Guard (Cover: aimed at {aimed}).', { hero: ownerName(tgt.id), n, aimed: ownerName(it.target) })
          : t('Hits {hero} for {n} after Defense, before Guard.', { hero: ownerName(tgt.id), n })));
      }
      const plain = (it.kind === 'atk' && /^Strike one ally for \d+\.$/.test(it.desc || '')) || (it.kind === 'aoe' && /^Hit every ally for \d+\.$/.test(it.desc || ''));
      if (!plain) lines.push(h('p', { class: 'dim' }, intentDesc(e.id, it.key)));
      if (c.guard >= 1 && it.dmg) lines.push(h('p', { class: 'dim small' }, t('Your Guard {n} absorbs what gets through Defense.', { n: Math.floor(c.guard) })));
    }
    const st = [];
    if (e.guard >= 1) st.push(t('Guard {n}', { n: Math.floor(e.guard) }));
    for (const k of ['exposed', 'weak', 'shock', 'parry']) if (e.st[k] > 0) st.push(`${t(k === 'exposed' ? 'Exposed' : k === 'weak' ? 'Weak' : k === 'shock' ? 'Shock' : 'Parry')} ${secs(e.st[k], 0)}`);
    const close = this.app.modal(h('div', { class: 'panel enemy-detail' },
      h('h2', {}, enemyName(e.id, e.lvl)),
      h('p', { class: 'dim' }, `${t('HP {a}/{b}', { a: Math.ceil(e.hp), b: e.maxHp })}${st.length ? ' · ' + st.join(' · ') : ''}`),
      ...lines,
      h('p', { class: 'dim small' }, t('Tap an enemy to make it your target · hold it to read it')),
      btn(t('Close'), () => close(), 'primary')), { dismiss: true });
  }

  showDetail(uid) {
    const inst = this.combat.cards.get(uid);
    if (!inst) return;
    this.app.cardDetail(inst, this.combat.check(uid));
  }

  // ───────────────────────── HUD ─────────────────────────
  updateHud(force) {
    const c = this.combat;
    this.updateHand();
    this.updateReserve();
    const tgt = c.enemies.find((e) => e.uid === c.target && e.alive);
    const tsig = tgt ? `${tgt.uid}|${c.aliveEnemies().length}` : '-';
    if (force || tsig !== this.tgtSig) {
      this.tgtSig = tsig;
      this.targetChip.querySelector('.tc-name').textContent = tgt ? enemyName(tgt.id, tgt.lvl) : '—';
      const many = c.aliveEnemies().length > 1;
      this.targetChip.classList.toggle('many', many);
      this.targetChip.title = many ? t('Target: {e}. Tap an enemy, or here, to switch.', { e: tgt ? enemyName(tgt.id, tgt.lvl) : '' }) : t('Target: {e}', { e: tgt ? enemyName(tgt.id, tgt.lvl) : '' });
      this.targetChip.classList.remove('flash');
      void this.targetChip.offsetWidth;
      if (tgt) this.targetChip.classList.add('flash');
    }
    // flow strip (writes only when values change): the decision window, and what is happening now
    const set = (key, fn, val) => { if (this[key] !== val) { this[key] = val; fn(val); } };
    if (c.phase === 'ACTIVE' && c.combo) {
      const left = c.flowLeft();
      const cap = c.flowCap() - c.t;
      set('_ff', (v) => (this.flowFill.style.width = v), `${Math.min(100, (left / RULES.FLOW_BAR_SECONDS) * 100).toFixed(1)}%`);
      set('_fc', (v) => (this.flowCap.style.width = v), `${Math.min(100, (cap / RULES.FLOW_BAR_SECONDS) * 100).toFixed(1)}%`);
      const drain = c.imminentDrain();
      const fill = Math.min(100, (left / RULES.FLOW_BAR_SECONDS) * 100);
      const dw = Math.min(fill, (drain / RULES.FLOW_BAR_SECONDS) * 100);
      set('_fd', (v) => { const [l, w] = v.split('|'); this.flowThreat.style.left = l; this.flowThreat.style.width = w; }, `${(fill - dw).toFixed(1)}%|${dw.toFixed(1)}%`);
      const held = c.flowHeld();
      set('_ft', (v) => (this.flowText.textContent = v), drain > 0.05 ? t('FLOW {s} · THEFT −{d}', { s: secs(left, 1), d: secs(drain, 1) }) : c.executing ? t('FLOW {s} · EXECUTING', { s: secs(left, 1) }) : held ? t('FLOW {s} · HOLDING', { s: secs(left, 1) }) : t('FLOW {s}', { s: secs(left, 1) }));
      set('_fb', (v) => (this.flowBar.className = v), `flow-bar active${held ? ' held' : left < 1.5 ? ' low' : ''}${c.executing ? ' exec' : ''}`);
    } else {
      set('_ff', (v) => (this.flowFill.style.width = v), '0%');
      set('_fc', (v) => (this.flowCap.style.width = v), '0%');
      set('_fd', (v) => { this.flowThreat.style.width = v; }, '0%');
      const stranded = c.stranded();
      const starter = c.starter();
      const soonest = Math.min(...c.party.map((p) => c.recoverLeft(p.id)));
      const txt = c.phase === 'RECOVER' ? t('BREATHER · ENEMIES WAIT') : c.phase === 'END' ? '—' : stranded ? t('NOTHING PLAYABLE · CHURN IS FREE')
        : !starter ? t('ALL HEROES RECOVERING · {s}', { s: secs(soonest, 1) }) : t('{hero} · PLAY A BASIC ATTACK', { hero: ownerName(starter).toUpperCase() });
      set('_ft', (v) => (this.flowText.textContent = v), txt);
      set('_fb', (v) => (this.flowBar.className = v), `flow-bar ${c.phase === 'PRE' ? (starter ? 'pre' : 'wait') : c.phase === 'RECOVER' ? 'breather' : ''}`);
    }
    // the chain and the queue in one row: executed cards (solid, a ⇄ where a Relay handed over), the
    // executing command (glowing, with progress), then waiting commands (dashed; tap one to cancel it)
    this.renderQueue();
    // the hint beside the chips
    const P = c.proj();
    const hintSig = `${c.phase}|${P.open}|${P.hero}|${P.rank}|${P.last}|${P.lastCmd}|${P.hasBasic}|${P.finish}|${c.starter()}|${this.pick ? this.pick.uid : ''}|${c.relayStillPossible()}`;
    if (force || hintSig !== this.hintSig) {
      this.hintSig = hintSig;
      const narrowStrip = this.deck.getBoundingClientRect().width < 900;
      if (this.pick) this.setNext(t('<b>BRACE</b>: tap a hero · ✕'));
      else if (P.open) {
        const hero = ownerName(P.hero);
        if (P.finish) this.setNext(t('Finishing the combo…'));
        else if (P.lastCmd === 'relay') this.setNext(t('<b>{hero}</b>: start with a basic attack ◆', { hero }));
        // narrow strips (phones) drop "higher arte": the cards say whether one is playable
        else if (P.last === 'arte') this.setNext(c.relayStillPossible() ? (narrowStrip ? t('<b>{hero}</b>: RELAY ⇄ or FINISH', { hero }) : t('<b>{hero}</b>: higher arte, RELAY ⇄ or FINISH', { hero })) : t('<b>{hero}</b>: a higher arte, or FINISH', { hero }));
        else this.setNext(P.hasBasic && !narrowStrip ? t('NEXT <b>rank {n}+</b> · {hero}\'s arte or a basic attack', { n: Math.min(9, P.rank + 1), hero }) : t('NEXT <b>rank {n}+</b>', { n: Math.min(9, P.rank + 1) }));
      } else {
        const st = c.starter();
        this.setNext(c.phase === 'PRE' && st ? t('<b>{hero}</b> starts: tap a basic attack ◆', { hero: ownerName(st) }) : '');
      }
    }
    // hero buttons: state from the engine (Ready / Active / Acting / Committed / Recovering + bar), arte
    // count; during a chain, which heroes can take a Relay
    this.updateHeroButtons(P);
    // next card: the real top of the draw pile; nothing is shown (or drawn) when it is empty
    const nu = c.nextCard();
    // with 3-4 Reserve slots the preview shrinks to one row (rank, suit, owner colour; hold for the card)
    const row = c.reserveMax() > 2;
    const nextSig = (nu ? nu + c.effRank(nu) + c.effVariant(nu) : `-${c.discard.length}`) + row;
    if (force || nextSig !== this.nextSig) {
      this.nextSig = nextSig;
      this.reserveEl.classList.toggle('many', row);
      this.nextCell.querySelector('.nc-label').textContent = row ? t('NEXT') : t('NEXT CARD');
      const body = this.nextCell.querySelector('.nc-body');
      clear(body);
      if (nu) {
        const el = miniCard(c, nu, c.cards.get(nu));
        el.removeAttribute('tabindex');
        el.setAttribute('data-uid', nu);
        let lp;
        el.addEventListener('pointerdown', () => { lp = setTimeout(() => { if (el.isConnected) this.showDetail(nu); }, 480); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(lp));
        body.append(el);
        if (!row) requestAnimationFrame(() => fitReserveCard(el));
      } else body.append(h('div', { class: 'nc-empty', title: c.discard.length ? t('Discard reshuffles') : '' }, c.discard.length ? (row ? '↻' : t('Discard reshuffles')) : '—'));
    }
    // momentum
    const max = c.momentumMax();
    const momSig = `${c.momentum}/${max}`;
    if (force || momSig !== this.momSig) {
      this.momSig = momSig;
      clear(this.momEl);
      const pips = h('div', { class: 'pips' });
      for (let i = 0; i < max; i++) pips.append(h('i', { class: i < c.momentum ? 'on' : '' }));
      this.momEl.append(h('span', { class: 'mom-label' }, t('MOMENTUM')), h('b', { class: 'mom-num' }, String(c.momentum)), pips);
    }
    const fc = c.momentumCostFlow();
    this.flowBtn.disabled = !(c.phase === 'ACTIVE' && c.momentum >= fc && c.combo && c.combo.deadline < c.flowCap() - 0.01);
    set('_fbs', (v) => (this.flowBtn.querySelector('.ctl-sub').textContent = v), t('{n}M · +{s}', { n: fc, s: secs(c.flowSpendAmount()) }));
    this.guardBtn.disabled = !(c.momentum >= RULES.MOMENTUM_COST && c.phase !== 'END');
    set('_gbs', (v) => (this.guardBtn.querySelector('.ctl-sub').textContent = v), t('{n}M · +{g}', { n: RULES.MOMENTUM_COST, g: c.guardSpendAmount() }));
    // guard & churn
    const g = Math.floor(c.guard);
    set('_gh', (v) => (this.guardEl.innerHTML = v), `<span class="ic">▣</span><b>${g}</b><span class="lbl">${t('GUARD')}</span>${c.counter ? `<span class="counter">↺${c.counter}</span>` : ''}`);
    const snared = c.churnJamUntil > c.t;
    let dots = '';
    for (let i = 0; i < c.churnMax(); i++) dots += `<i class="${i < c.churn.charges ? 'on' : ''}"></i>`;
    const free = (c.relics.has('beta_badge') && !c.churn.freeUsed) || c.stranded();
    set('_ch', (v) => (this.churnEl.innerHTML = v), `<span class="ic">⟲</span><span class="dots">${dots}</span><span class="lblwrap"><span class="lbl">${snared ? t('SNARED') : t('CHURN')}</span>${free && !snared ? `<span class="free">${t('FREE')}</span>` : ''}</span>`);
    this.churnEl.classList.toggle('snared', snared);
    // cash out / finish (queued behind waiting commands when there are any)
    const fin = c.canFinish();
    const can = c.canCashOut();
    const finishing = P.finish;
    set('_cm', (v) => (this.cashBtn.querySelector('.ctl-main').textContent = v), finishing ? t('FINISHING') : fin ? t('FINISH ★') : t('CASH OUT'));
    this.cashBtn.classList.toggle('finish', fin || finishing);
    this.cashBtn.disabled = (!can && !fin) || finishing;
    const sub = this.cashBtn.querySelector('.ctl-sub');
    if (finishing) {
      set('_cs', (v) => (sub.textContent = v), t('after the queue'));
      this.cashBtn.classList.remove('quick');
    } else if (fin) {
      set('_cs', (v) => (sub.textContent = v), t('PERFECT · +2M'));
      this.cashBtn.classList.remove('quick');
    } else if (can) {
      const p = c.payoutAmount(1);
      set('_cs', (v) => (sub.textContent = v), `${p.quick ? t('QUICK · ') : ''}${t('≈{n} dmg +{g}▣', { n: p.amount, g: p.guard })}`);
      this.cashBtn.classList.toggle('quick', p.quick);
    } else {
      set('_cs', (v) => (sub.textContent = v), c.phase === 'ACTIVE' ? t('needs 2+ cards') : t('during a combo'));
      this.cashBtn.classList.remove('quick');
    }
    // adaptation & citation
    if (c.adapt || c.citation) {
      this.adaptEl.hidden = false;
      const parts = [];
      if (c.adapt) parts.push(`<div class="ad-title ${c.adapt.broken ? 'broken' : ''}">${c.adapt.broken ? t('BROKEN · ') : t('ADAPTATION · ')}${adaptName(c.adapt)}</div><div class="ad-desc">${c.adapt.broken ? t('Disabled.') : adaptDesc(c.adapt)}</div>${c.adapt.broken ? '' : `<div class="ad-break">${t('Break: {b}', { b: adaptBreak(c.adapt) })} <b>${Math.floor(c.adapt.progress)}/${c.adapt.need}</b></div>`}`);
      if (c.citation) parts.push(`<div class="ad-title cite">${t('CITATION · -40% damage')}</div><div class="ad-desc">${c.citation.kind === 'strength' ? t('Start a combo with something other than a {s} attack', { s: strengthName(c.citation.value) }) : t('Finish with a different arte')}</div>`);
      const html = parts.join('');
      if (html !== this.adaptHtml) { this.adaptHtml = html; this.adaptEl.innerHTML = html; }
    } else this.adaptEl.hidden = true;
  }

  // The chain and the queue (docs/COMBAT_SPEC.md §20 "Queue strip"): executed cards, a ⇄ mark where a
  // Relay handed over, the executing command (with its progress), then the waiting commands, each a tap
  // target that cancels it. Older executed cards fold into a "+n" chip on small screens.
  renderQueue() {
    const c = this.combat;
    const combo = c.combo;
    const x = c.executing;
    const sig = `${combo ? combo.cards.map((e) => e.uid + e.kind).join() + combo.lastCmd : ''}|${x ? x.cmd.id + (x.resolved ? 'r' : '') : ''}|${c.queue.map((q) => q.id).join()}|${this.root.classList.contains('compact') || document.documentElement.classList.contains('compact')}`;
    if (sig !== this.chipSig) {
      this.chipSig = sig;
      clear(this.chipsEl);
      this.execChip = null;
      const compact = this.deck.getBoundingClientRect().width < 900;
      const max = compact ? 4 : 7;
      if (combo) {
        const cards = combo.cards;
        const hidden = Math.max(0, cards.length - max);
        if (hidden) this.chipsEl.append(h('span', { class: 'chip more', title: t('{n} earlier cards', { n: hidden }) }, `+${hidden}`));
        for (let i = hidden; i < cards.length; i++) {
          const e = cards[i];
          if (e.relay) this.chipsEl.append(h('span', { class: 'chip relay-mark', style: { borderColor: OWNER_COL[e.owner], color: OWNER_COL[e.owner] }, title: t('Relay') }, '⇄'));
          const el = h('span', { class: `chip v-${e.variant}${e.category === 'arte' ? ' arte' : ''}`, style: { borderColor: OWNER_COL[e.owner] } },
            h('b', {}, String(e.rank)), e.variant, e.step ? h('i', { class: 'k' }, '↑') : null, e.cross ? h('i', { class: 'k' }, '✕') : null, e.category === 'arte' ? h('i', { class: 'cat' }, '★') : null);
          // a card that has resolved but is still playing out is still the executing command
          if (x && x.resolved && x.cmd.uid === e.uid) { el.classList.add('exec'); el.append(h('i', { class: 'qp' })); this.execChip = el; }
          this.chipsEl.append(el);
        }
      }
      const cmdChip = (q, state) => {
        const hero = q.type === 'relay' ? q.to : q.hero;
        const label = q.type === 'relay' ? ['⇄', ownerInitial(q.to)] : q.type === 'finish' ? [q.mode === 'perfect' ? '★✓' : '$'] : q.type === 'support' ? ['✚', ownerInitial(q.hero)] : [h('b', {}, String(q.rank)), q.variant, q.category === 'arte' ? h('i', { class: 'cat' }, '★') : null];
        const name = q.type === 'relay' ? t('Relay to {hero}', { hero: ownerName(q.to) }) : q.type === 'finish' ? (q.mode === 'perfect' ? t('FINISH ★') : t('CASH OUT')) : cardName(c.def(q.uid).id);
        const el = h('button', { type: 'button', class: `chip q ${state} q-${q.type}${q.type === 'card' ? ` v-${q.variant}` : ''}`, style: { borderColor: OWNER_COL[hero] }, 'data-cmd': q.id, title: state === 'wait' ? t('{c} · waiting · tap to cancel', { c: name }) : t('{c} · executing', { c: name }) }, ...label);
        if (q.cost) el.append(h('i', { class: 'qc' }, `${q.cost}M`));
        if (state === 'wait') { el.append(h('i', { class: 'qx' }, '↩')); el.addEventListener('click', () => this.doCancel(q.id)); }
        else { el.append(h('i', { class: 'qp' })); this.execChip = el; el.addEventListener('click', () => { this.app.audio.sfx('reject'); this.flashNote(t('Already executing')); }); }
        return el;
      };
      // an executed Relay whose incoming hero has not played yet
      if (combo && combo.lastCmd === 'relay' && !(x && !x.resolved && x.cmd.type === 'relay')) this.chipsEl.append(h('span', { class: 'chip relay-mark', style: { borderColor: OWNER_COL[combo.hero], color: OWNER_COL[combo.hero] }, title: t('Relay') }, '⇄'));
      if (x && !(x.resolved && x.cmd.type === 'card') && x.cmd.type !== 'finish') this.chipsEl.append(cmdChip(x.cmd, 'exec'));
      for (const q of c.queue) this.chipsEl.append(cmdChip(q, 'wait'));
      // the chips need the room: the hint steps aside while three or more are shown
      this.nextEl.classList.toggle('crowded', this.chipsEl.children.length >= 3);
      // still too wide: fold the oldest executed cards into the "+n" chip until the row fits
      const wrap = this.chipsEl.parentElement;
      const fits = () => this.chipsEl.getBoundingClientRect().right <= wrap.getBoundingClientRect().right + 0.5;
      let folded = combo ? Math.max(0, combo.cards.length - max) : 0;
      for (let guard = 0; guard < 12 && !fits(); guard++) {
        const old = [...this.chipsEl.children].find((el) => !el.classList.contains('more') && !el.classList.contains('q') && !el.classList.contains('exec'));
        if (!old) break;
        if (!old.classList.contains('relay-mark')) folded++;
        old.remove();
        let more = this.chipsEl.querySelector('.chip.more');
        if (!more) { more = h('span', { class: 'chip more' }); this.chipsEl.prepend(more); }
        more.textContent = `+${folded}`;
        more.title = t('{n} earlier cards', { n: folded });
      }
    }
    if (this.execChip && x) {
      const f = x.endAt > x.start ? Math.min(1, (c.t - x.start) / (x.endAt - x.start)) : 1;
      const bar = this.execChip.querySelector('.qp');
      if (bar) bar.style.width = `${(f * 100).toFixed(0)}%`;
    }
  }

  updateHeroButtons(P) {
    const c = this.combat;
    for (const [id, b] of Object.entries(this.heroBtns)) {
      const st = c.heroState(id);
      const artes = [...c.hand, ...c.reserve].filter((u) => u && c.categoryOf(u) === 'arte' && c.def(u).owner === id).length;
      const rel = P.open && id !== P.hero ? c.relayCheck(id) : null;
      const picking = !!this.pick;
      const left = c.recoverLeft(id);
      const mark = picking ? '' : st === 'ACTING' ? '▶' : st === 'RECOVERING' ? num(left, 1) : st === 'COMMITTED' ? '…' : rel && rel.ok ? '⇄' : '';
      // a Relay with little Flow left may not leave the new hero time for an arte: the ⇄ turns amber
      const late = !!(rel && rel.ok) && !c.flowHeld() && c.flowLeft() < 1.6;
      const sig = `${st}|${artes}|${mark}|${rel ? rel.ok + String(rel.reason) : '-'}|${P.open && P.hero === id}|${c.starter() === id}|${picking}|${this.pick && this.pick.def === id}|${late}`;
      if (b._sig !== sig) {
        b._sig = sig;
        b.className = `hero-btn owner-${id} st-${st.toLowerCase()}`;
        const sel = picking ? this.pick.def === id : P.open ? P.hero === id : c.starter() === id;
        b.classList.toggle('sel', sel);
        b.classList.toggle('relay', !!(rel && rel.ok) && !picking);
        b.classList.toggle('relay-late', late && !picking);
        b.classList.toggle('locked', !picking && ((P.open && id !== P.hero && !(rel && rel.ok)) || (!P.open && st !== 'READY')));
        b.classList.toggle('pick', picking);
        b.querySelector('.hb-a').textContent = '★'.repeat(Math.min(3, artes));
        b.querySelector('.hb-st').textContent = mark;
        b.setAttribute('aria-pressed', String(sel));
        const state = { READY: t('Ready'), ACTIVE: t('Active'), ACTING: t('Acting'), COMMITTED: t('Committed'), RECOVERING: t('Recovering') }[st];
        b.title = picking ? t('Brace {hero}', { hero: ownerName(id) })
          : P.open ? (id === P.hero ? t('{hero} · {s} · attacking', { hero: ownerName(id), s: state }) : rel && rel.ok ? (late ? t('Relay to {hero} (key {k}) · little Flow left: FINISH or CASH OUT is safer', { hero: ownerName(id), k: KEY_OF[id] }) : t('Relay to {hero} (key {k})', { hero: ownerName(id), k: KEY_OF[id] })) : `${ownerName(id)} · ${rel ? msg(rel.text) : state}`)
            : t('{hero} · {s} · starts the next combo (key {k})', { hero: ownerName(id), s: state, k: KEY_OF[id] });
      }
      const bar = b.querySelector('.hb-bar');
      const f = st === 'RECOVERING' && c.heroes[id].recoverDur > 0 ? 1 - left / c.heroes[id].recoverDur : 0;
      const w = st === 'RECOVERING' ? `${(f * 100).toFixed(0)}%` : '0%';
      if (bar._w !== w) { bar._w = w; bar.style.width = w; }
    }
    this.pickCancel.hidden = !this.pick;
    // while the Braced picker is open its hint takes the chips' place
    this.chipsEl.classList.toggle('picking', !!this.pick);
    this.nextEl.classList.toggle('picking', !!this.pick);
  }

  updateHand() {
    const c = this.combat;
    for (let i = 0; i < RULES.HAND; i++) {
      const s = this.slots[i];
      const uid = c.hand[i];
      if (uid !== s.uid) {
        if (s.el) {
          const old = s.el;
          const cause = this.causes[s.uid] || 'play';
          old.classList.add(`leave-${cause}`, 'leaving');
          old.style.transform = '';
          setTimeout(() => old.remove(), 360);
          delete this.causes[s.uid];
        }
        s.uid = uid;
        s.el = null;
        if (uid) {
          const inst = c.cards.get(uid);
          const el = cardEl(inst);
          el.classList.add('enter');
          setTimeout(() => el.classList.remove('enter'), 320);
          s.box.append(el);
          s.el = el;
          s.rankEl = el.querySelector('.rank');
          s.varEl = el.querySelector('.var');
          s.reasonEl = el.querySelector('.reason');
          s.lockRing = el.querySelector('.lock-ring');
          s.lockTime = el.querySelector('.lock-time');
          s.lockSrc = el.querySelector('.lock-src');
          s.state = '';
        }
      }
      s.box.classList.toggle('jammed', c.slotJammed(i));
      // a committed card leaves a placeholder in its slot until it resolves (tap to cancel while it waits)
      const held = !uid && c.heldSlots.has(i);
      let gsig = '';
      if (held) {
        const q = c.queue.find((x) => x.zone === 'hand' && x.slot === i);
        const ex = c.executing && c.executing.cmd.zone === 'hand' && c.executing.cmd.slot === i ? c.executing.cmd : null;
        const cmd = q || ex;
        if (cmd) {
          const d = c.def(cmd.uid);
          gsig = `${cmd.id}|${q ? 'w' : 'x'}`;
          if (s.ghostSig !== gsig) {
            s.ghostSig = gsig;
            const g = s.box.querySelector('.slot-ghost');
            g.querySelector('.g-r').textContent = d.category === 'support' ? '✚' : String(cmd.rank);
            g.querySelector('.g-n').textContent = cardName(d.id);
            g.querySelector('.g-s').textContent = q ? t('QUEUED #{n} · ↩', { n: c.queue.indexOf(q) + 1 }) : t('ACTING');
            g.className = `slot-ghost owner-${cmd.hero} ${q ? 'wait' : 'exec'}`;
          }
        }
      }
      if (!gsig && s.ghostSig) s.ghostSig = undefined;
      s.box.classList.toggle('held', !!gsig);
      if (!s.el || !uid) continue;
      // live state (single source of truth: combat.check)
      const chk = c.check(uid);
      const locked = c.isLocked(uid);
      const scr = c.isScrambled(uid) || c.wild.has(uid);
      // a recovering performer (or every hero recovering): the card just says when it can be played
      const why = chk.ok ? '' : chk.reason === 'busy' && chk.text && chk.text.k === '{hero} recovering {s}s' ? t('Ready in {s}s', { s: chk.text.p.s })
        : chk.reason === 'heroes' ? t('Ready in {s}s', { s: { n: Math.min(...c.party.map((m) => c.recoverLeft(m.id))), d: 1 } }) : msg(chk.text || '');
      const st = `${chk.ok ? 'legal' : 'illegal'}|${locked}|${scr}|${why}|${c.effRank(uid)}${c.effVariant(uid)}`;
      if (st !== s.state) {
        s.state = st;
        const el = s.el;
        el.classList.toggle('legal', chk.ok);
        el.classList.toggle('illegal', !chk.ok);
        el.classList.toggle('locked', locked);
        el.classList.toggle('scrambled', scr);
        const def = CARDS[c.cards.get(uid).id];
        if (isOffensive(def)) {
          s.rankEl.textContent = String(c.effRank(uid));
          const v = c.effVariant(uid);
          if (s.varEl) s.varEl.textContent = v;
          el.classList.remove('v-A', 'v-B', 'v-EX');
          el.classList.add(`v-${v}`);
        }
        s.reasonEl.textContent = !chk.ok && !locked && SHOWN_REASONS.includes(chk.reason) && c.phase !== 'RECOVER' ? why : '';
        if (locked) s.lockSrc.textContent = c.locks[uid].source ? enemyName(c.locks[uid].source) : t('Interference');
      }
      if (locked) {
        const l = c.locks[uid];
        const left = Math.max(0, l.until - c.t);
        const txt = num(left, 1);
        if (s.lockTxt !== txt) {
          s.lockTxt = txt;
          s.lockTime.textContent = txt;
          s.lockRing.style.strokeDashoffset = String(94.2 * (1 - left / l.dur));
        }
      }
    }
  }

  // the hint beside the combo chips shrinks a little rather than end in an ellipsis
  setNext(html) {
    this.nextEl.innerHTML = html;
    requestAnimationFrame(() => { if (this.nextEl.isConnected) fitText(this.nextEl, 0.8); });
  }

  updateReserve() {
    const c = this.combat;
    const max = c.reserveMax();
    const sig = c.reserve.map((u) => u + c.effRank(u) + c.effVariant(u)).join() + '|' + max;
    if (sig !== this.resSig) {
      this.resSig = sig;
      clear(this.reserveSlots);
      this.reserveSlots.classList.toggle('many', max > 2);
      this.resEls = [];
      for (let i = 0; i < max; i++) {
        const uid = c.reserve[i];
        const cell = h('div', { class: 'res-cell' });
        if (uid) {
          const inst = c.cards.get(uid);
          const el = miniCard(c, uid, inst);
          el.addEventListener('click', () => this.doPlay(uid));
          let lp;
          // hold for details; a re-render under the finger removes this element, so check it is still shown
          el.addEventListener('pointerdown', () => { lp = setTimeout(() => { if (el.isConnected) this.showDetail(uid); }, 480); });
          for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearTimeout(lp));
          cell.append(el);
          requestAnimationFrame(() => fitReserveCard(el));
          this.resEls.push([uid, el]);
        } else cell.append(h('div', { class: 'res-empty' }, '↑'));
        this.reserveSlots.append(cell);
      }
    }
    const latched = c.reserveLatchUntil > c.t;
    this.reserveEl.classList.toggle('latched', latched);
    for (const [uid, el] of this.resEls || []) {
      const ok = c.check(uid).ok;
      el.classList.toggle('legal', ok);
      el.classList.toggle('illegal', !ok);
    }
  }
}

export { cardTooltip };
