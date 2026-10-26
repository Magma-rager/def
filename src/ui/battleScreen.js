// Battle screen: owns the Combat instance for one encounter, renders the hand/controls,
// handles touch gestures (tap = play, swipe down = Churn, swipe up = Reserve, hold = details).
import { Combat, RULES } from '../engine/combat.js';
import { CARDS } from '../data/cards.js';
import { ENEMIES } from '../data/enemies.js';
import { DEV_REMARKS } from '../data/story.js';
import { TRAITS } from '../data/traits.js';
import { BattleView } from '../render/battleView.js';
import { drawPortrait } from '../render/rig.js';
import { h, clear } from './dom.js';
import { cardEl, cardTooltip } from './cardView.js';

const OWNER_COL = { V: '#d0603f', C: '#b48cf0', S: '#e6c25a' };

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
    this.tutorialQueue = [];
    this.lastFlowWarn = 0;
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
    this.flowBar = h('div', { class: 'flow-bar' }, this.flowCap, this.flowFill, this.flowText);
    const strip = h('div', { class: 'strip' }, h('div', { class: 'combo-wrap' }, this.chipsEl, this.nextEl), this.flowBar);
    this.reserveEl = h('div', { class: 'reserve' }, h('div', { class: 'zone-label' }, 'RESERVE'));
    this.reserveSlots = h('div', { class: 'reserve-slots' });
    this.reserveEl.append(this.reserveSlots);
    this.handEl = h('div', { class: 'hand' });
    this.slots.forEach((s, i) => {
      const el = h('div', { class: 'slot', 'data-slot': i }, h('div', { class: 'slot-jam' }, h('span', {}, 'STATIC')), h('div', { class: 'swipe-hint' }));
      s.box = el;
      this.bindGestures(el, i);
      this.handEl.append(el);
    });
    // controls
    this.cashBtn = h('button', { class: 'ctl cash', type: 'button' }, h('span', { class: 'ctl-main' }, 'CASH OUT'), h('span', { class: 'ctl-sub' }, ''));
    this.cashBtn.addEventListener('click', () => this.doCashOut());
    this.flowBtn = h('button', { class: 'ctl mom', type: 'button' }, h('span', { class: 'ctl-main' }, '+FLOW'), h('span', { class: 'ctl-sub' }, ''));
    this.flowBtn.addEventListener('click', () => this.doSpend('flow'));
    this.guardBtn = h('button', { class: 'ctl mom', type: 'button' }, h('span', { class: 'ctl-main' }, '+GUARD'), h('span', { class: 'ctl-sub' }, ''));
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

    this.view = new BattleView(this.canvas, {
      sfx: (n, o) => this.app.audio.sfx(n, o),
      banner: (t, s, tone) => this.banner(t, s, tone),
      cutin: (info) => this.cutin(info),
      telegraph: () => this.app.audio.sfx('telegraph'),
    });
    this.view.reducedMotion = this.app.settings.reducedMotion;
    this.view.shakeEnabled = this.app.settings.shake;
    this.view.setCombat(c, this.setup.act, this.setup.kind === 'boss' ? 1 : 0);
    this.canvas.addEventListener('pointerdown', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const uid = this.view.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (uid) { c.setTarget(uid); this.app.audio.sfx('click'); }
    });
    this.keyHandler = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyHandler);
    this.renderTop();
    this.layout();
    this.consumeEvents(c.drainEvents());
    const isBoss = this.setup.kind === 'boss';
    this.app.audio.music(isBoss ? 'boss' : `battle${this.setup.act}`);
    if (this.setup.trait) this.banner(TRAITS[this.setup.trait].name.toUpperCase(), TRAITS[this.setup.trait].text, 'info');
    if (c.adapt) this.banner('ADAPTATION', `${c.adapt.name}: ${c.adapt.desc}`, 'bad');
    if (this.setup.tutorial) this.tutorial('start');
  }

  layout() {
    const r = this.field.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.view.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)), dpr);
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    clearTimeout(this.endTimer);
  }

  renderTop() {
    const s = this.setup;
    const run = this.app.run;
    const node = run ? run.node(run.d.pending && run.d.pending.nodeId) : null;
    const relics = (s.relics || []).map((id) => h('span', { class: 'relic-pip', title: id, 'data-relic': id }, this.app.relicIcon(id)));
    const pause = h('button', { class: 'icon-btn pause-btn', type: 'button', 'aria-label': 'Pause' }, '❚❚');
    pause.addEventListener('click', () => this.app.pause());
    const label = s.kind === 'boss' ? 'BOSS' : s.kind === 'elite' ? 'ELITE' : `ACT ${s.act}`;
    clear(this.topbar).append(
      h('div', { class: 'bt-left' }, h('span', { class: `bt-kind k-${s.kind}` }, label), node ? h('span', { class: 'bt-floor' }, `Floor ${run.d.floors}`) : null, s.trait ? h('span', { class: 'trait-pip', style: { color: TRAITS[s.trait].color } }, TRAITS[s.trait].name) : null),
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
    const c = this.combat;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { this.app.pause(); e.preventDefault(); return; }
    if (this.app.paused) return;
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
      const alive = c.aliveEnemies();
      if (alive.length) {
        const i = alive.findIndex((x) => x.uid === c.target);
        c.setTarget(alive[(i + 1) % alive.length].uid);
      }
      e.preventDefault();
    }
  }

  // ───────────────────────── actions ─────────────────────────
  doPlay(uid) {
    if (this.app.paused || this.ended) return;
    const c = this.combat;
    const def = c.def(uid);
    const res = c.playCard(uid);
    if (res.ok) {
      this.causes[uid] = 'play';
      this.app.audio.sfx('cardPlay', { rank: def ? def.rank : 1 });
      if (this.setup.tutorial) {
        if (def.role === 'open') this.tutorial('opened');
      }
    } else if (res.reason === 'locked' || res.reason === 'junk' || res.reason === 'ko' || res.reason === 'recover' || res.reason === 'latched') {
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

  doCashOut() {
    if (this.app.paused || this.ended) return;
    const r = this.combat.cashOut();
    if (!r.ok) this.app.audio.sfx('reject');
    this.afterAction();
  }

  doSpend(kind) {
    if (this.app.paused || this.ended) return;
    const r = kind === 'flow' ? this.combat.spendMomentumFlow() : this.combat.spendMomentumGuard();
    this.app.audio.sfx(r.ok ? 'momentum' : 'reject');
    if (!r.ok && r.text) this.flashNote(r.text);
    this.afterAction();
  }

  afterAction() {
    this.consumeEvents(this.combat.drainEvents());
    this.updateHud(true);
  }

  // ───────────────────────── frame ─────────────────────────
  frame(dt) {
    const c = this.combat;
    if (!this.app.paused) {
      c.update(dt);
      this.consumeEvents(c.drainEvents());
      this.view.update(dt);
      this.remarkCooldown = Math.max(0, this.remarkCooldown - dt);
    }
    this.view.draw();
    this.updateHud(false);
    if (c.phase === 'END' && !this.ended) {
      this.ended = true;
      const win = c.result.victory;
      this.app.audio.sfx(win ? 'victory' : 'defeat');
      this.banner(win ? 'VICTORY' : 'DEFEAT', win ? 'Signal holds' : 'The party falls', win ? 'gold' : 'bad');
      this.endTimer = setTimeout(() => this.onEnd(c.outcome(), c), win ? 1700 : 2200);
    }
  }

  consumeEvents(events) {
    if (!events.length) return;
    this.view.consume(events);
    const c = this.combat;
    for (const ev of events) {
      switch (ev.type) {
        case 'churn': this.causes[ev.uid] = 'churn'; break;
        case 'tuck': this.causes[ev.uid] = 'tuck'; break;
        case 'stash': this.causes[ev.uid] = 'stash'; break;
        case 'lock': this.app.audio.sfx('lock'); if (this.setup.tutorial || !this.app.meta.tut.lock) this.tutorial('lock'); break;
        case 'unlock': this.app.audio.sfx('unlock'); break;
        case 'scramble': if (!this.app.meta.tut.scramble) this.tutorial('scramble'); break;
        case 'jam': if (!this.app.meta.tut.jam) this.tutorial('jam'); break;
        case 'glitch': if (!this.app.meta.tut.glitch) this.tutorial('glitch'); break;
        case 'latch': if (!this.app.meta.tut.latch) this.tutorial('latch'); break;
        case 'stumble': this.flashNote(`STUMBLE ${ev.n}/${RULES.MAX_STUMBLES}`); break;
        case 'reject': if (ev.text && ev.reason !== 'zone') this.flashNote(ev.text); break;
        case 'comboEnd': this.onComboEnd(ev); break;
        case 'banner': if (ev.text === 'ADAPTATION BROKEN') this.remark('adaptBroken', true); break;
        case 'phase': this.app.audio.music('boss'); break;
        default: break;
      }
    }
    if (this.setup.tutorial && c.phase === 'ACTIVE' && c.hand.some((u) => u && c.roleOf(u) === 'close' && c.check(u).ok)) this.tutorial('closer');
  }

  onComboEnd(ev) {
    if (this.setup.tutorial) this.tutorial('afterCombo');
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
    const low = this.combat.party.filter((p) => !p.ko && p.hp < p.maxHp * 0.25).length >= 2;
    if (low) this.remark('lowHp', true);
  }

  remark(key, once) {
    if (once && this.saidOnce.has(key)) return;
    if (this.remarkCooldown > 0) return;
    this.saidOnce.add(key);
    this.remarkCooldown = 14;
    const list = DEV_REMARKS[key];
    this.app.toast(list[Math.floor(Math.random() * list.length)], 'dev');
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
    band.append(h('div', { class: 'cutin-text' }, info.len >= 7 ? 'GRAND RELAY' : 'RELAY FINISHER'));
    this.cutinEl.append(band);
    setTimeout(() => band.remove(), 1100);
  }

  tutorial(key) {
    const meta = this.app.meta;
    if (!this.app.settings.hints || meta.tut[key]) return;
    const TXT = {
      start: ['THE RELAY', 'Your three heroes share one hand of six cards. Enemies act in real time — watch their ATB bars and intent bubbles (the dot shows who they will hit).<br><br><b>Tap an OPENER</b> to start a combo. Tap an enemy to target it.'],
      opened: ['FLOW IS TICKING', 'The combo has <b>3 seconds of Flow</b>. Your hand swapped to <b>Converters ⟳</b> and <b>Closers ■</b>.<br><br>Each card must have a <b>higher rank</b>. Same suit (A→A, B→B): any higher rank. Switching suit (A↔B) is a <b>Cross</b>: exactly +1. <b>EX</b> fits anything.<br><br>Bright cards are legal. Each valid card refunds a little Flow.'],
      closer: ['CLOSE IT', 'A <b>Closer</b> is legal now. Closers end the combo with a payoff based on everything you played before — card count, Relays between heroes, Steps, Crosses.<br><br>A Closer ending is a <b>PERFECT</b>: +2 Momentum and a Churn charge.'],
      afterCombo: ['MORE TOOLS', '<b>Swipe a card DOWN</b> to Churn it (uses a charge, replaces it).<br><b>Swipe UP</b> to stash it in Reserve; Reserve cards can be played later.<br><b>CASH OUT</b> ends a combo of 2+ cards early for a guaranteed payout (bonus if 1.5s+ Flow remains).<br><b>Momentum</b> buys +Flow or +Guard. Guard is shared and slowly fades.'],
      lock: ['CARD LOCKED', 'An enemy <b>Locked</b> a card (chain icon). Locks show their source and expire after their timer runs out — even between combos. Plan around them.'],
      scramble: ['SCRAMBLED', 'A <b>Scramble</b> temporarily changed a card\'s rank or suit (glitch stripes). The card shows its current values; it reverts in a few seconds.'],
      jam: ['SLOT JAMMED', 'Static jammed a hand slot. No card can fill it until the static clears.'],
      glitch: ['GLITCH CARDS', 'Glitch cards were shuffled into your deck. They are unplayable — <b>swipe them down</b> to delete them for free.'],
      latch: ['RESERVE LATCHED', 'A Latch Wisp grabbed your Reserve. It steals a stored card, or seals the Reserve for a few seconds.'],
    };
    const t = TXT[key];
    if (!t) return;
    meta.tut[key] = true;
    this.app.saveMeta();
    this.app.pause(true);
    clear(this.tutEl);
    this.tutEl.hidden = false;
    const ok = h('button', { class: 'btn primary', type: 'button' }, 'Got it');
    ok.addEventListener('click', () => { this.tutEl.hidden = true; this.app.resume(); });
    this.tutEl.append(h('div', { class: 'tut-card' }, h('div', { class: 'tut-title' }, t[0]), h('div', { class: 'tut-body', html: t[1] }), ok));
    setTimeout(() => ok.focus(), 50);
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
    // flow strip
    if (c.phase === 'ACTIVE' && c.combo) {
      const left = c.flowLeft();
      const cap = c.flowCap() - c.t;
      this.flowFill.style.width = `${Math.min(100, (left / RULES.FLOW_ABS_MAX) * 100)}%`;
      this.flowCap.style.width = `${Math.min(100, (cap / RULES.FLOW_ABS_MAX) * 100)}%`;
      this.flowText.textContent = `FLOW ${left.toFixed(1)}s`;
      this.flowBar.className = `flow-bar active${left < 1 ? ' low' : ''}`;
    } else {
      this.flowFill.style.width = '0%';
      this.flowCap.style.width = '0%';
      this.flowText.textContent = c.phase === 'RECOVER' ? 'RECOVERING…' : c.phase === 'END' ? '—' : 'PRE-COMBO · PLAY AN OPENER';
      this.flowBar.className = `flow-bar ${c.phase === 'PRE' ? 'pre' : ''}`;
    }
    // combo chips
    const combo = c.combo;
    const sig = combo ? combo.cards.map((e) => e.uid + e.kind).join() + combo.rank + combo.variant : c.phase;
    if (force || sig !== this.chipSig) {
      this.chipSig = sig;
      clear(this.chipsEl);
      if (combo) {
        for (const e of combo.cards) {
          this.chipsEl.append(h('span', { class: `chip v-${e.variant}`, style: { borderColor: OWNER_COL[e.owner] } },
            h('b', {}, String(e.rank)), e.variant, e.kind === 'step' ? h('i', { class: 'k' }, '↑') : e.kind === 'cross' ? h('i', { class: 'k' }, '✕') : null, e.relay ? h('i', { class: 'k relay' }, '⇄') : null));
        }
        const rv = combo.variant === 'EX' ? 'any suit' : `${combo.variant}/EX`;
        const crossV = combo.variant === 'A' ? 'B' : combo.variant === 'B' ? 'A' : null;
        this.nextEl.innerHTML = `NEXT <b>${rv} ${Math.min(9, combo.rank + 1)}+</b>${crossV && combo.rank < 9 ? ` · <b>${crossV} ${combo.rank + 1}${c.crossGap() > 1 ? `–${Math.min(9, combo.rank + 2)}` : ''}</b>` : ''}${combo.convCount < 1 ? ' · <i>Converter before Closer</i>' : ''}`;
      } else {
        this.nextEl.innerHTML = c.phase === 'PRE' ? 'Any <b>Opener ▶</b> starts a combo' : '';
      }
    }
    // momentum
    const max = c.momentumMax();
    const momSig = `${c.momentum}/${max}`;
    if (force || momSig !== this.momSig) {
      this.momSig = momSig;
      clear(this.momEl);
      const pips = h('div', { class: 'pips' });
      for (let i = 0; i < max; i++) pips.append(h('i', { class: i < c.momentum ? 'on' : '' }));
      this.momEl.append(h('span', { class: 'mom-label' }, 'MOMENTUM'), h('b', { class: 'mom-num' }, String(c.momentum)), pips);
    }
    const fc = c.momentumCostFlow();
    this.flowBtn.disabled = !(c.phase === 'ACTIVE' && c.momentum >= fc && c.combo && c.combo.deadline < c.flowCap() - 0.01);
    this.flowBtn.querySelector('.ctl-sub').textContent = `${fc}M · +${c.flowSpendAmount()}s`;
    this.guardBtn.disabled = !(c.momentum >= RULES.MOMENTUM_COST && c.phase !== 'END');
    this.guardBtn.querySelector('.ctl-sub').textContent = `${RULES.MOMENTUM_COST}M · +${c.guardSpendAmount()}`;
    // guard & churn
    const g = Math.floor(c.guard);
    this.guardEl.innerHTML = `<span class="ic">▣</span><b>${g}</b><span class="lbl">GUARD</span>${c.counter ? `<span class="counter">↺${c.counter}</span>` : ''}`;
    const snared = c.churnJamUntil > c.t;
    let dots = '';
    for (let i = 0; i < c.churnMax(); i++) dots += `<i class="${i < c.churn.charges ? 'on' : ''}"></i>`;
    const free = c.relics.has('beta_badge') && !c.churn.freeUsed;
    this.churnEl.innerHTML = `<span class="ic">⟲</span><span class="dots">${dots}</span><span class="lbl">${snared ? 'SNARED' : 'CHURN'}</span>${free && !snared ? '<span class="free">FREE</span>' : ''}`;
    this.churnEl.classList.toggle('snared', snared);
    // cash out
    const can = c.canCashOut();
    this.cashBtn.disabled = !can;
    const sub = this.cashBtn.querySelector('.ctl-sub');
    if (can) {
      const p = c.payoutAmount(1);
      sub.textContent = `${p.quick ? 'QUICK · ' : ''}≈${p.amount} dmg +${p.guard}▣`;
      this.cashBtn.classList.toggle('quick', p.quick);
    } else {
      sub.textContent = c.phase === 'ACTIVE' ? 'needs 2+ cards' : 'during a combo';
      this.cashBtn.classList.remove('quick');
    }
    // adaptation & citation
    if (c.adapt || c.citation) {
      this.adaptEl.hidden = false;
      const parts = [];
      if (c.adapt) parts.push(`<div class="ad-title ${c.adapt.broken ? 'broken' : ''}">${c.adapt.broken ? 'BROKEN · ' : 'ADAPTATION · '}${c.adapt.name}</div><div class="ad-desc">${c.adapt.broken ? 'Disabled.' : c.adapt.desc}</div>${c.adapt.broken ? '' : `<div class="ad-break">Break: ${c.adapt.breakText} <b>${Math.floor(c.adapt.progress)}/${c.adapt.need}</b></div>`}`);
      if (c.citation) parts.push(`<div class="ad-title cite">CITATION · -40% damage</div><div class="ad-desc">${c.citation.kind === 'suit' ? `Open with a suit other than ${c.citation.value}` : 'Finish with a different Closer'}</div>`);
      const html = parts.join('');
      if (html !== this.adaptHtml) { this.adaptHtml = html; this.adaptEl.innerHTML = html; }
    } else this.adaptEl.hidden = true;
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
      if (!s.el || !uid) continue;
      // live state (single source of truth: combat.check)
      const chk = c.check(uid);
      const locked = c.isLocked(uid);
      const scr = c.isScrambled(uid) || c.wild.has(uid);
      const ko = chk.reason === 'ko';
      const st = `${chk.ok ? 'legal' : 'illegal'}|${locked}|${scr}|${ko}|${chk.text || ''}|${c.effRank(uid)}${c.effVariant(uid)}`;
      if (st !== s.state) {
        s.state = st;
        const el = s.el;
        el.classList.toggle('legal', chk.ok);
        el.classList.toggle('illegal', !chk.ok);
        el.classList.toggle('locked', locked);
        el.classList.toggle('scrambled', scr);
        el.classList.toggle('ko', ko);
        const def = CARDS[c.cards.get(uid).id];
        if (def.role !== 'junk') {
          s.rankEl.textContent = String(c.effRank(uid));
          const v = c.effVariant(uid);
          s.varEl.textContent = v;
          el.classList.remove('v-A', 'v-B', 'v-EX');
          el.classList.add(`v-${v}`);
        }
        s.reasonEl.textContent = !chk.ok && !locked && ['rank', 'cross', 'needconv', 'junk', 'role'].includes(chk.reason) && c.phase !== 'RECOVER' ? chk.text : '';
        if (locked) s.lockSrc.textContent = c.locks[uid].source;
      }
      if (locked) {
        const l = c.locks[uid];
        const left = Math.max(0, l.until - c.t);
        s.lockTime.textContent = left.toFixed(1);
        s.lockRing.style.strokeDashoffset = String(94.2 * (1 - left / l.dur));
      }
    }
  }

  updateReserve() {
    const c = this.combat;
    const max = c.reserveMax();
    const sig = c.reserve.join() + '|' + max;
    if (sig !== this.resSig) {
      this.resSig = sig;
      clear(this.reserveSlots);
      this.resEls = [];
      for (let i = 0; i < max; i++) {
        const uid = c.reserve[i];
        const cell = h('div', { class: 'res-cell' });
        if (uid) {
          const inst = c.cards.get(uid);
          const def = CARDS[inst.id];
          const el = h('div', { class: `res-card owner-${def.owner} v-${c.effVariant(uid)} role-${def.role}`, role: 'button', tabindex: '0' },
            h('span', { class: 'rr' }, String(c.effRank(uid))), h('span', { class: 'rv' }, c.effVariant(uid)), h('span', { class: 'rn' }, def.name));
          el.addEventListener('click', () => this.doPlay(uid));
          let lp;
          el.addEventListener('pointerdown', () => { lp = setTimeout(() => this.showDetail(uid), 480); });
          el.addEventListener('pointerup', () => clearTimeout(lp));
          el.addEventListener('pointerleave', () => clearTimeout(lp));
          cell.append(el);
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

export function enemyName(id) {
  return ENEMIES[id].name;
}

export { cardTooltip };
