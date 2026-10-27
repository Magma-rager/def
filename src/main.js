// SIGNAL//BREAK — application shell: routing between screens, overlays, saving, main loop.
import { Run } from './engine/run.js';
import { Save, recordRun } from './engine/save.js';
import { AudioEngine } from './audio/audio.js';
import { CARDS } from './data/cards.js';
import { RELICS } from './data/relics.js';
import {
  t, msg, LANGS, lang, setLang, detectLang, block, line, sceneLines as sceneText, cardName, rolePlural, relicName, relicText,
  rarityName, graftName, graftText, heroRole, ownerName,
} from './i18n/index.js';
import { ICON_PATHS } from './render/icons.js';
import { h, clear, btn } from './ui/dom.js';
import { cardEl, cardTooltip, cardText } from './ui/cardView.js';
import { BattleScreen } from './ui/battleScreen.js';
import * as S from './ui/screens.js';
import { museumModal } from './ui/museum.js';

const RELIC_ICON = {
  badge: 'star', clock: 'hourglass', gauge: 'up', coin: 'coin', shield: 'shield', spiral: 'scramble', chain: 'lock', ladder: 'up',
  dial: 'eye', prism: 'prism', box: 'chest', gear: 'summon', flare: 'star', flame: 'flame', fork: 'wave', star: 'star', cross: 'heal',
  spring: 'wave', hook: 'hook', magnet: 'coin', skull: 'skull', jar: 'glitch', drum: 'burst',
};

class App {
  constructor(root) {
    this.root = root;
    this.settings = Save.loadSettings();
    setLang(this.settings.lang || detectLang(typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []));
    this.meta = Save.loadMeta();
    if (!this.meta.tut) this.meta.tut = {};
    this.audio = new AudioEngine(this.settings);
    this.run = null;
    this.offline = null; // web app offline cache: null (none), 'caching' or 'ready'
    this.battle = null;
    this.paused = false;
    this.cleanup = null;
    this.modals = [];
    this.layers = {
      screen: h('div', { class: 'layer-screen' }),
      dialog: h('div', { class: 'layer-dialog' }),
      modal: h('div', { class: 'layer-modal' }),
      toast: h('div', { class: 'layer-toast' }),
    };
    // Phones in portrait: the game is landscape-only, and an installed web app cannot lock the
    // orientation, so ask for a turn (CSS shows this only while html.rotate is set).
    this.rotateText = h('div', { class: 'rotate-text' });
    this.rotateHint = h('div', { class: 'rotate-hint', 'aria-live': 'polite' }, h('div', { class: 'rotate-phone' }), this.rotateText);
    root.append(this.layers.screen, this.layers.dialog, this.layers.modal, this.layers.toast, this.rotateHint);
    document.documentElement.classList.toggle('reduced-motion', !!this.settings.reducedMotion);
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.battle && !this.paused) this.pause(); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.onResize();
  }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.battle) this.battle.frame(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    const r = document.documentElement.style;
    const deckH = Math.round(Math.max(150, Math.min(300, H * 0.38)));
    const stripH = H < 500 ? 26 : 34;
    const ctlW = Math.round(Math.max(176, Math.min(290, W * 0.22)));
    const resW0 = H < 500 ? 58 : 82;
    let cardH = deckH - stripH - 14;
    const ratio = H < 500 ? 0.86 : 0.72;
    let cardW = Math.min(cardH * ratio, (W - ctlW - resW0 - 16 - 7 * 6) / 6);
    cardH = Math.min(cardH, cardW / 0.6);
    r.setProperty('--deck-h', deckH + 'px');
    r.setProperty('--strip-h', stripH + 'px');
    r.setProperty('--card-w', Math.floor(cardW) + 'px');
    r.setProperty('--card-h', Math.floor(cardH) + 'px');
    r.setProperty('--ctl-w', ctlW + 'px');
    r.setProperty('--res-w', resW0 + 'px');
    r.setProperty('--cs', (cardW / 100).toFixed(3));
    document.documentElement.classList.toggle('compact', H < 500);
    // hand cards under ~72px wide (iPhone SE-size screens in landscape)
    document.documentElement.classList.toggle('narrow', cardW < 72);
    document.documentElement.classList.toggle('portrait', H > W);
    const rotate = H > W && W < 600;
    document.documentElement.classList.toggle('rotate', rotate);
    this.rotateText.textContent = t('Turn your device sideways to play');
    // a fight does not go on behind the hint
    if (rotate && this.battle && !this.paused) this.pause();
    if (this.battle) requestAnimationFrame(() => this.battle && this.battle.layout());
  }

  // Shown on the title screen, so a player on the first online launch knows when the game will
  // also start without a connection.
  setOffline(state) {
    this.offline = state;
    const el = document.querySelector('.title-offline');
    if (el) el.textContent = S.offlineLabel(state);
  }

  // ───────────────────────── persistence ─────────────────────────
  hasSave() { return !!Save.loadRun(); }
  save() { if (this.run) Save.saveRun(this.run.serialize()); }
  saveMeta() { Save.saveMeta(this.meta); }
  saveSettings() { Save.saveSettings(this.settings); this.audio.applySettings(this.settings); }

  // Switches the interface language, stores the choice, and redraws what is on screen. Run, combat
  // and save state are not touched: they hold no display text.
  setLanguage(id) {
    if (id === lang() && this.settings.lang === id) return;
    this.settings.lang = id;
    this.saveSettings();
    setLang(id);
    this.preloadFonts();
    const settingsOpen = this.settingsOpen;
    const pauseOpen = this.pauseOpen;
    this.closeAllModals();
    if (this.battle) {
      this.battle.relocalize();
      this.paused = pauseOpen || settingsOpen;
    } else if (this.current) this.show(this.current[0], ...this.current[1]);
    this.rotateText.textContent = t('Turn your device sideways to play');
    if (pauseOpen) this.pause();
    if (settingsOpen) this.openSettings();
  }

  // Canvas text does not trigger web-font loading on its own; load the faces for the current script.
  preloadFonts() {
    if (typeof document === 'undefined' || !document.fonts) return;
    const sample = lang() === 'ru' ? 'Ая' : 'Aa';
    const faces = ['400', '600', '700', '800'].map((w) => `${w} 12px "Barlow Condensed"`)
      .concat(['700', '800', '900'].map((w) => `${w} 12px "Big Shoulders Display"`), ['400 12px Spectral', 'italic 400 12px Spectral', '600 12px Spectral']);
    for (const f of faces) document.fonts.load(f, sample).catch(() => {});
  }

  // ───────────────────────── routing ─────────────────────────
  show(fn, ...args) {
    if (this.cleanup) { try { this.cleanup(); } catch (e) { /* ignore */ } }
    document.documentElement.classList.toggle('in-battle', false);
    clear(this.layers.dialog);
    this.cleanup = null;
    if (this.battle) { this.battle.destroy(); this.battle = null; }
    this.paused = false;
    this.current = [fn, args];
    const r = fn(this, this.layers.screen, ...args);
    if (typeof r === 'function') this.cleanup = r;
  }

  toTitle() {
    this.closeAllModals();
    this.run = null;
    this.show(S.titleScreen);
  }

  start() {
    this.preloadFonts();
    this.show(S.titleScreen);
  }

  newRunFlow() {
    this.closeAllModals();
    if (this.hasSave()) {
      this.confirm('Start a new run?', 'Your current run will be abandoned and recorded in the Museum.', 'Abandon & start new', () => {
        const saved = Run.load(Save.loadRun());
        if (saved) this.recordEnd(saved, 'abandoned');
        Save.clearRun();
        S.newRunDialog(this);
      });
    } else S.newRunDialog(this);
  }

  startRun(starterRelic) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.run = Run.create({ seed, starterRelic, tutorial: !this.meta.tutorialDone });
    if (this.meta.totalRuns > 0 && this.meta.tutorialDone) this.run.d.pending = { type: 'story', scene: 'intro_return', next: 'map' };
    this.save();
    this.route();
  }

  continueRun() {
    const d = Save.loadRun();
    const run = d && Run.load(d);
    if (!run) { this.toast('Save data could not be loaded.'); Save.clearRun(); this.show(S.titleScreen); return; }
    this.run = run;
    this.route();
  }

  route() {
    const run = this.run;
    if (!run) { this.show(S.titleScreen); return; }
    const p = run.d.pending;
    if (!p) { this.show(S.mapScreen); return; }
    switch (p.type) {
      case 'story': {
        const lines = this.sceneLines(p.scene);
        this.show(S.mapScreen);
        S.storyDialog(this, lines, () => {
          if (p.next === 'map') run.d.pending = null;
          else if (p.next === 'nextAct') run.advanceAct();
          else if (p.next === 'victory') run.d.pending = { type: 'gameover', victory: true };
          this.save();
          this.route();
        });
        break;
      }
      case 'battle': this.startBattle(); break;
      case 'bossprep':
        if (!p.introShown) {
          this.show(S.bossPrepScreen);
          S.storyDialog(this, sceneText(`boss_intro_${p.bossId}`), () => { p.introShown = true; this.save(); });
        } else this.show(S.bossPrepScreen);
        break;
      case 'reward': this.show(S.rewardScreen); break;
      case 'shop': this.show(S.shopScreen); break;
      case 'event': this.show(S.eventScreen); break;
      case 'rest': this.show(S.restScreen); break;
      case 'surgery': this.show(S.surgeryScreen); break;
      case 'treasure': this.show(S.treasureScreen); break;
      case 'mutation': this.show(S.mutationScreen); break;
      case 'gameover': this.endRun(p.victory ? 'victory' : 'defeat'); break;
      default: this.show(S.mapScreen);
    }
  }

  // Story lines, with variations that react to cross-run memory and the current build.
  sceneLines(scene) {
    const m = this.meta;
    const run = this.run;
    if (scene === 'intro_return') {
      const lines = [{ who: 'gran', text: line('return.episode', 'Shovelware Safari, episode {ep}. Back in SIGNAL//BREAK. Run number {run}.', { ep: 212 + m.totalRuns, run: m.totalRuns + 1 }) }];
      if (m.wins > 0) lines.push({ who: 'dev', text: line('return.winner', 'You again. The one who FINISHED it. I patched nothing. I was too busy staring at the telemetry.') });
      else if (m.defeats >= 3) lines.push({ who: 'dev', text: line('return.defeats', '{n} defeats and you keep coming back. Is it... is it the Relay? It\'s the Relay, isn\'t it.', { n: m.defeats }) });
      else lines.push({ who: 'dev', text: line('return.back', 'Oh. You came back. Nobody comes back. Please do not tell the publisher.') });
      if (m.devTrust > 0) lines.push({ who: 'dev', text: line('return.napkin', 'I, um. Kept the napkin. The one with the baton diagram.') });
      if (m.bestCombo >= 6) lines.push({ who: 'gran', text: line('return.best', 'Personal best: a {n}-card chain. Let\'s beat it.', { n: m.bestCombo }) });
      lines.push({ who: 'V', text: line('return.formation', 'Commander. Same formation as last time?') }, { who: 'gran', text: line('return.deck', 'Same formation. New deck.') });
      return lines;
    }
    const base = sceneText(scene);
    if (scene.startsWith('boss_win') && run) {
      const quip = {
        ladder: 'You climbed it rank by rank like a ladder I forgot to remove.',
        variant: 'All that suit switching. A, B, A, B. My eyes hurt. In a good way? No. Bad way.',
        relay: 'Echoes on echoes. The boss lost to its own reflection of your team.',
        momentum: 'You hoarded Momentum and spent it all at once. That is fiscally irresponsible.',
        flow: 'You squeezed every hundredth of a second out of the Flow window. I measured.',
        churn: 'You rerolled your way to victory. The Churn button has filed a complaint.',
        reserve: 'You saved cards for later. Later came. It was bad for my boss.',
        guard: 'You just... stood behind a shield and hit back? That is a valid strategy, apparently.',
        cashout: 'Cash Out, Cash Out, Cash Out. You treated my boss like an ATM.',
        interference: 'You turned my interference into ammunition. That is MY interference.',
      };
      const arch = run.archetypeKey();
      if (quip[arch]) return [{ who: 'dev', text: line(`quip.${arch}`, quip[arch]) }, ...base];
    }
    return base;
  }

  startBattle() {
    const setup = this.run.battleSetup();
    setup.assist = !!this.settings.relaxed;
    if (setup.assist) this.run.d.flags.assistUsed = true;
    this.save();
    this.show(() => {});
    const screen = new BattleScreen(this, setup, (outcome, combat) => this.onBattleEnd(outcome, combat, setup));
    this.battle = screen;
    screen.mount(this.layers.screen);
    document.documentElement.classList.toggle('in-battle', true);
  }

  onBattleEnd(outcome, combat, setup) {
    if (!this.run || this.battle == null) return;
    const res = this.run.finishBattle(outcome);
    this.save();
    if (setup.tutorial && outcome.victory && !this.meta.tutorialDone) {
      this.meta.tutorialDone = true;
      this.saveMeta();
      this.show(S.mapScreen);
      S.storyDialog(this, sceneText('tutorial_done'), () => this.route());
      return;
    }
    void res;
    this.route();
  }

  recordEnd(run, result) {
    const summary = run.summary(result);
    recordRun(this.meta, summary, { enemiesSeen: run.d.enemiesSeen, relicsSeen: run.d.relicsSeen, cardsSeen: [...new Set(run.d.deck.map((c) => c.id))] });
    this.saveMeta();
    return summary;
  }

  endRun(result) {
    const run = this.run;
    const summary = this.recordEnd(run, result);
    Save.clearRun();
    this.run = null;
    if (result === 'defeat') {
      this.show(S.resultsScreen, summary);
      S.storyDialog(this, S.defeatLines(this), () => {});
    } else this.show(S.resultsScreen, summary);
  }

  // ───────────────────────── pause & modals ─────────────────────────
  pause(silent) {
    if (this.battle) {
      this.paused = true;
      this.audio.setDuck(0.35);
    }
    if (silent) return;
    this.pauseOpen = true;
    const close = this.modal(h('div', { class: 'panel pause-panel' },
      h('h2', {}, t('Paused')),
      h('p', { class: 'dim' }, this.battle ? t('Combat time is frozen: Flow, ATB, locks and statuses are all stopped.') : t('Run saved.')),
      h('div', { class: 'pause-btns' },
        btn(t('Resume'), () => { close(); }, 'primary big'),
        this.battle ? btn(t('Restart encounter'), () => this.confirm(t('Restart this encounter?'), t('The fight restarts from the beginning with the same enemies. Your deck and HP are as they were when it began.'), t('Restart'), () => { this.closeAllModals(); this.startBattle(); }), '') : null,
        btn(t('View deck'), () => this.viewDeck(), ''),
        btn(t('How to play'), () => this.howToPlay(), ''),
        btn(t('Settings'), () => this.openSettings(), ''),
        btn(t('Save & quit to title'), () => { close(); this.save(); this.toTitle(); }, ''),
        this.run ? btn(t('Abandon run'), () => this.confirm(t('Abandon this run?'), t('It will be recorded as abandoned in the Museum.'), t('Abandon'), () => { close(); this.closeAllModals(); const r = this.run; this.recordEnd(r, 'abandoned'); Save.clearRun(); this.run = null; this.toTitle(); }), 'danger') : null)),
    { dismiss: true, onClose: () => { this.pauseOpen = false; this.resume(); } });
  }

  resume() {
    if (this.modals.length) return;
    this.paused = false;
    this.audio.setDuck(1);
  }

  modalOpen() { return this.modals.length > 0; }

  modal(content, opts = {}) {
    const wrap = h('div', { class: 'modal' }, h('div', { class: 'modal-bg' }), h('div', { class: 'modal-inner' }, content));
    this.layers.modal.append(wrap);
    if (this.battle) { this.paused = true; }
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      wrap.remove();
      this.modals = this.modals.filter((m) => m !== close);
      if (opts.onClose) opts.onClose();
      if (!this.modals.length && this.battle && this.battle.tutEl.hidden) this.resume();
    };
    if (opts.dismiss) wrap.querySelector('.modal-bg').addEventListener('click', () => { this.audio.sfx('back'); close(); });
    const esc = (e) => { if (e.key === 'Escape' && this.modals[this.modals.length - 1] === close) { close(); window.removeEventListener('keydown', esc); } };
    if (opts.dismiss) window.addEventListener('keydown', esc);
    this.modals.push(close);
    return close;
  }

  closeAllModals() {
    for (const c of [...this.modals]) c();
  }

  confirm(title, text, okLabel, onOk) {
    const close = this.modal(h('div', { class: 'panel' }, h('h2', {}, title), h('p', {}, text), h('div', { class: 'row-btns' }, btn(t('Cancel'), () => close(), ''), btn(okLabel, () => { close(); onOk(); }, 'danger'))), { dismiss: true });
  }

  info(title, text, onClose) {
    const close = this.modal(h('div', { class: 'panel' }, h('h2', {}, title), h('p', {}, text), h('div', { class: 'row-btns end' }, btn(t('OK'), () => close(), 'primary'))), { dismiss: true, onClose });
  }

  toast(text, kind = '') {
    const el = h('div', { class: `toast ${kind}` }, kind === 'dev' ? h('span', { class: 'toast-who' }, t('OZMUND')) : null, h('span', {}, text));
    this.layers.toast.append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  relicIconSvg(id) {
    const r = RELICS[id];
    const name = RELIC_ICON[r.icon] || 'star';
    const filled = ['shield', 'flame', 'star', 'coin', 'chest', 'skull', 'burst', 'heal'].includes(name);
    return `<svg viewBox="-11 -11 22 22" class="ico r-${r.rarity}"><path d="${ICON_PATHS[name]}" class="${filled ? 'f' : 's'}"/></svg>`;
  }
  relicIcon(id) { return h('span', { class: 'ri', html: this.relicIconSvg(id) }); }

  showRelic(id) {
    this.info(relicName(id), `${relicText(id)} (${rarityName(RELICS[id].rarity)})`);
  }

  cardDetail(inst, chk) {
    const def = CARDS[inst.id];
    const status = chk ? (chk.ok ? t('Playable now') : msg(chk.text)) : '';
    const close = this.modal(h('div', { class: 'panel card-detail' },
      h('div', { class: 'cd-card' }, cardEl(inst, { static: true })),
      h('div', { class: 'cd-text' },
        h('h2', {}, cardName(def.id) + (inst.up ? '+' : '')),
        h('p', { html: cardTooltip(inst) }),
        status ? h('p', { class: chk.ok ? 'good' : 'bad' }, status) : null,
        h('p', { class: 'dim small' }, t('Tap: play · Swipe down: Churn · Swipe up: Reserve')),
        btn(t('Close'), () => close(), 'primary'))), { dismiss: true });
  }

  viewDeck() {
    const run = this.run;
    if (!run) return;
    const order = { open: 0, conv: 1, close: 2 };
    const grid = h('div', { class: 'deck-grid' });
    const cards = run.d.deck.slice().sort((a, b) => order[CARDS[a.id].role] - order[CARDS[b.id].role] || run.effRank(a) - run.effRank(b));
    for (const c of cards) {
      const el = cardEl(c, { static: true });
      el.addEventListener('click', () => this.cardDetail(c));
      grid.append(el);
    }
    const counts = ['open', 'conv', 'close'].map((r) => `${rolePlural(r)} ${run.roleCount(r)}`).join(' · ');
    const close = this.modal(h('div', { class: 'panel wide' }, h('h2', {}, t('Deck ({n})', { n: run.d.deck.length })), h('p', { class: 'dim' }, counts), grid, h('div', { class: 'row-btns end' }, btn(t('Close'), () => close(), 'primary'))), { dismiss: true });
  }

  selectCard({ title, filter, confirm = t('Confirm'), preview = false, action = null, cancelable = true }) {
    return new Promise((resolve) => {
      const run = this.run;
      let sel = null;
      const grid = h('div', { class: 'deck-grid select' });
      const prev = h('div', { class: 'select-preview' });
      const ok = btn(confirm, () => { done = true; close(); resolve(sel); }, 'primary');
      ok.disabled = true;
      let done = false;
      const order = { open: 0, conv: 1, close: 2 };
      const cards = run.d.deck.slice().sort((a, b) => order[CARDS[a.id].role] - order[CARDS[b.id].role] || run.effRank(a) - run.effRank(b));
      for (const c of cards) {
        const can = filter(c);
        const el = cardEl(c, { static: true });
        if (!can) el.classList.add('disabled');
        el.addEventListener('click', () => {
          if (!can) return;
          sel = c.uid;
          grid.querySelectorAll('.card').forEach((x) => x.classList.remove('selected'));
          el.classList.add('selected');
          ok.disabled = false;
          clear(prev);
          if (preview) prev.append(h('span', { class: 'dim' }, t('After:')), cardEl({ ...c, up: true }, { static: true }));
          else if (action) prev.append(h('span', { class: 'dim' }, t('After:')), cardEl(simulate(run, c, action), { static: true }));
          this.audio.sfx('card', { rank: CARDS[c.id].rank });
        });
        grid.append(el);
      }
      const close = this.modal(h('div', { class: 'panel wide' }, h('h2', {}, title), grid, h('div', { class: 'select-foot' }, prev, h('div', { class: 'row-btns' }, cancelable ? btn(t('Cancel'), () => { close(); }, '') : null, ok))), {
        dismiss: cancelable,
        onClose: () => { if (!done) resolve(null); },
      });
    });
  }

  chooseSurgeryOp(grafts) {
    return new Promise((resolve) => {
      let done = false;
      const ops = [['rankup', t('Re-gauge +1 rank')], ['rankdown', t('Re-gauge −1 rank')], ['recut', t('Recut suit (A↔B)')], ...grafts.map((g) => [`graft:${g}`, t('Graft {g}: {text}', { g: graftName(g), text: graftText(g) })])];
      const list = h('div', { class: 'event-choices' });
      for (const [a, label] of ops) list.append(btn(label, () => { done = true; close(); resolve(a); }, 'choice'));
      const close = this.modal(h('div', { class: 'panel' }, h('h2', {}, t('Choose an operation')), list, h('div', { class: 'row-btns end' }, btn(t('Cancel'), () => close(), ''))), { dismiss: true, onClose: () => { if (!done) resolve(null); } });
    });
  }

  openSettings() {
    const s = this.settings;
    const slider = (key, label) => {
      const id = `set-${key}`;
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]), id });
      input.addEventListener('input', () => { s[key] = parseFloat(input.value); this.saveSettings(); });
      input.addEventListener('change', () => this.audio.sfx('click'));
      return h('label', { class: 'set-row', for: id }, h('span', {}, label), input);
    };
    const toggle = (key, label, after) => {
      const id = `set-${key}`;
      const input = h('input', { type: 'checkbox', id });
      input.checked = !!s[key];
      input.addEventListener('change', () => { s[key] = input.checked; this.saveSettings(); if (after) after(); });
      return h('label', { class: 'set-row', for: id }, h('span', {}, label), input);
    };
    const langRow = h('div', { class: 'set-row lang-row' }, h('span', {}, t('Language')),
      h('div', { class: 'lang-switch inline', role: 'group', 'aria-label': t('Language') }, ...LANGS.map((l) => {
        const b = h('button', { class: `lang-opt ${lang() === l.id ? 'on' : ''}`, type: 'button', lang: l.id, 'aria-pressed': String(lang() === l.id) }, l.name);
        b.addEventListener('click', () => this.setLanguage(l.id));
        return b;
      })));
    this.settingsOpen = true;
    const close = this.modal(h('div', { class: 'panel' },
      h('h2', {}, t('Settings')),
      langRow,
      slider('master', t('Master volume')), slider('music', t('Music')), slider('sfx', t('Sound effects')),
      toggle('muted', t('Mute all audio')),
      toggle('reducedMotion', t('Reduced motion (no zoom/shake/cut-ins)'), () => {
        document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
        if (this.battle) this.battle.view.reducedMotion = s.reducedMotion;
      }),
      toggle('shake', t('Screen shake'), () => { if (this.battle) this.battle.view.shakeEnabled = s.shake; }),
      toggle('hints', t('Tutorial hints')),
      toggle('relaxed', t('Assist: relaxed enemy speed (−25% enemy ATB; Flow rules unchanged)')),
      h('div', { class: 'row-btns' },
        btn(t('Replay tutorial hints'), () => { this.meta.tut = {}; this.saveMeta(); this.toast(t('Tutorial hints reset.')); }, 'small'),
        btn(t('Erase all data'), () => this.confirm(t('Erase everything?'), t('Deletes the current run, Museum records and settings on this device.'), t('Erase'), () => {
          Save.clearRun();
          try { localStorage.clear(); } catch (e) { /* storage unavailable */ }
          location.reload();
        }), 'small danger')),
      h('div', { class: 'row-btns end' }, btn(t('Done'), () => close(), 'primary'))), { dismiss: true, onClose: () => { this.settingsOpen = false; } });
  }

  openMuseum() { museumModal(this); }

  howToPlay() {
    const sec = (key, title, body) => { const [tl, bd] = block('howto', key, [title, body]); return h('div', { class: 'htp-sec' }, h('h3', {}, tl), h('div', { html: bd })); };
    const close = this.modal(h('div', { class: 'panel wide htp' },
      h('h2', {}, t('How to Relay')),
      sec('hand', 'The hand', 'Your three heroes — <b>Hessa</b> (Vanguard), <b>Corvin</b> (Channeler) and <b>Pin</b> (Striker) — share one deck and one hand of <b>six cards</b>. Enemies act in real time: their ATB bar fills and they execute the intent shown in their bubble (the colored dot shows their target).'),
      sec('sequence', 'Opener → Converter → Closer', 'Tap an <b>Opener ▶</b> to start a combo. The hand switches to <b>Converters ⟳</b> and <b>Closers ■</b>. A Closer needs at least one Converter before it, and ends the combo with a payoff based on everything played.'),
      sec('ranks', 'Ranks & suits', 'Every card must have a <b>higher rank</b> than the last. Same suit (A→A, B→B): any higher rank (exactly +1 is a <b>Step</b>). Switching suit A↔B is a <b>Cross</b>: exactly +1, and it grants Momentum. <b>EX</b> cards fit with anything. Converters can <b>Rewind</b> the rank or change the suit.'),
      sec('flow', 'Flow', 'The first card starts <b>3.0s of Flow</b>. Each valid card refunds 0.18s (max 1.2s per combo). A combo can never last more than <b>6.2s</b>. If Flow runs out the combo is <b>Dropped</b> (−2 Momentum). Wrong cards cause a <b>Stumble</b> (−0.4s, −1 Momentum; three stumbles drop the combo).'),
      sec('relay', 'Relay & Echo', 'Playing a card owned by a different hero is a <b>Relay</b>: that hero takes over the action (+1 Momentum). Echo effects repeat earlier cards\' damage, Guard, healing and statuses at reduced power (never Flow, Momentum, rank changes or other Echoes).'),
      sec('momentum', 'Momentum, Guard, Cash Out', '<b>Momentum</b> comes from Relays, Crosses, Perfect combos and cards. Spend 3 for <b>+0.6s Flow</b> (within the 6.2s cap) or <b>+8 Guard</b>. Guard is shared by the party and fades slowly. <b>CASH OUT</b> ends a combo of 2+ cards immediately for a payout (+25% if 1.5s+ Flow is left) — but gives up the Perfect bonus.'),
      sec('churn', 'Churn & Reserve', '<b>Swipe a card down</b> to Churn it (uses a charge; charges refill over time). <b>Swipe up</b> to stash it in Reserve (2 slots); Reserve cards stay through combo phases and can be played when legal. <b>Hold</b> a card for details.'),
      sec('interference', 'Interference', 'Enemies Lock cards (3s), Scramble ranks/suits, jam slots, snare Churn, latch your Reserve and steal Flow. Every effect shows its source and timer and always expires.'),
      sec('keyboard', 'Keyboard', '<b>1–6</b> play · <b>Shift+1–6</b> Churn · <b>Alt+1–6</b> Reserve · <b>7/8</b> play Reserve · <b>Space</b> Cash Out · <b>F</b> +Flow · <b>G</b> +Guard · <b>Tab</b> cycle target · <b>Esc</b> pause'),
      h('div', { class: 'row-btns end' }, btn(t('Close'), () => close(), 'primary'))), { dismiss: true });
  }
}

function simulate(run, inst, action) {
  const c = { ...inst };
  if (action === 'rankup') c.rankMod = (c.rankMod || 0) + 1;
  else if (action === 'rankdown') c.rankMod = (c.rankMod || 0) - 1;
  else if (action === 'recut') c.variant = run.effVariant(inst) === 'A' ? 'B' : 'A';
  else if (action === 'ex') c.variant = 'EX';
  else if (action && action.startsWith('graft:')) c.graft = action.slice(6);
  else if (action === 'upgrade') c.up = true;
  return c;
}

void cardText;

export function boot() {
  const root = document.getElementById('app');
  const app = new App(root);
  window.__sb = app;
  app.start();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('claude')) {
    app.setOffline('caching');
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const w = reg.installing || reg.waiting;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'redundant' && !reg.active) app.setOffline(null); });
      // look for a newer build on each launch and whenever the app comes back to the foreground (a
      // home-screen app is often resumed rather than relaunched); offline this fails quietly
      if (reg.active) reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      return navigator.serviceWorker.ready;
    }).then(() => caches.match('index.html')).then((hit) => app.setOffline(hit ? 'ready' : null)).catch(() => app.setOffline(null));
    // keep the cache and saves from being evicted under storage pressure (granted silently or ignored)
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
}

boot();
