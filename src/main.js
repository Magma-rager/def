// SIGNAL//BREAK — application shell: routing between screens, overlays, saving, main loop.
import { Run } from './engine/run.js';
import { Save } from './engine/save.js';
import { addRunRecipe, canStartWith } from './engine/progression.js';
import { AudioEngine } from './audio/audio.js';
import { CARDS } from './data/cards.js';
import { RELICS } from './data/relics.js';
import {
  t, msg, LANGS, lang, setLang, detectLang, block, line, sceneLines as sceneText, cardName, categoryPlural, relicName, relicText,
  rarityName, graftName, graftText, heroRole, ownerName,
} from './i18n/index.js';
import { ICON_PATHS } from './render/icons.js';
import { h, clear, btn } from './ui/dom.js';
import { cardEl, cardTooltip, cardText } from './ui/cardView.js';
import { BattleScreen } from './ui/battleScreen.js';
import { LESSONS, migrateLessons } from './ui/lessons.js';
import * as S from './ui/screens.js';
import { museumModal } from './ui/museum.js';

const RELIC_ICON = {
  badge: 'star', clock: 'hourglass', gauge: 'up', coin: 'coin', shield: 'shield', spiral: 'scramble', chain: 'lock', ladder: 'up',
  dial: 'eye', prism: 'prism', box: 'chest', gear: 'summon', flare: 'star', flame: 'flame', fork: 'wave', star: 'star', cross: 'heal',
  spring: 'wave', hook: 'hook', magnet: 'coin', skull: 'skull', jar: 'glitch', drum: 'burst',
};

// Deck order: basic attacks, artes (by hero), support, Glitch; then rank.
const CAT_ORDER = { basic: 0, arte: 1, support: 2, junk: 3 };
function sortDeck(run) {
  return run.d.deck.slice().sort((a, b) => CAT_ORDER[CARDS[a.id].category] - CAT_ORDER[CARDS[b.id].category]
    || String(CARDS[a.id].owner || '').localeCompare(String(CARDS[b.id].owner || '')) || run.effRank(a) - run.effRank(b));
}

class App {
  constructor(root) {
    this.root = root;
    this.settings = Save.loadSettings();
    setLang(this.settings.lang || detectLang(typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []));
    this.meta = Save.loadMeta();
    if (!this.meta.tut) this.meta.tut = {};
    // players who finished the earlier tutorial keep its lessons marked as learned (src/ui/lessons.js)
    if (migrateLessons(this.meta)) Save.saveMeta(this.meta);
    this.audio = new AudioEngine(this.settings);
    this.run = null;
    this.progressNotice = new Set();
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
    this.systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.systemMotion.addEventListener('change', () => this.syncMotion());
    this.syncMotion();
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('click', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.battle && !this.paused) this.pause(); });
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.onResize();
  }

  loop(now) {
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    if (this.battle) this.battle.frame(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  syncMotion() {
    const reduced = !!this.settings.reducedMotion || this.systemMotion.matches;
    document.documentElement.classList.toggle('reduced-motion', reduced);
    if (this.battle) {
      this.battle.view.reducedMotion = reduced;
      this.battle.paintRequested = true;
    }
  }

  onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    const r = document.documentElement.style;
    const insets = getComputedStyle(this.root);
    const horizontal = parseFloat(insets.paddingLeft) + parseFloat(insets.paddingRight);
    const usable = W - horizontal;
    const desktopTray = Math.round(Math.max(168, Math.min(315, H * .40)));
    const ctlW = Math.round(Math.max(176, Math.min(290, usable * .22)));
    const fit = (usable - ctlW - 82 - 16 - 7 * 6) / 6;
    const compact = H <= 540 || fit < 100;
    const deckH = compact ? Math.round(Math.min(259, Math.max(219, H * .582))) : desktopTray;
    const stripH = compact ? 28 : 34;
    const resW0 = compact ? 58 : 82;
    const cardH = Math.max(40, deckH - stripH - (compact ? 30 : 32) - (compact ? 30 : 0) - 10);
    const cardW = compact ? Math.min(142, (usable - resW0 - 16 - 7 * 4) / 6) : Math.min(cardH * .74, fit);
    r.setProperty('--deck-h', deckH + 'px');
    r.setProperty('--strip-h', stripH + 'px');
    r.setProperty('--card-w', Math.floor(cardW) + 'px');
    r.setProperty('--card-h', Math.floor(cardH) + 'px');
    r.setProperty('--ctl-w', ctlW + 'px');
    r.setProperty('--res-w', resW0 + 'px');
    r.setProperty('--cs', (cardW / 100).toFixed(3));
    document.documentElement.classList.toggle('compact', compact);
    // hand cards under ~78px wide (iPhone SE-size screens in landscape, 732x510): the role label
    // shows its symbol only, since "CONVERTER" no longer fits
    document.documentElement.classList.toggle('narrow', cardW < 78);
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
  hasSave() { return Save.hasRun(); }
  storageHealthy() { return Save.healthy(); }
  storageNotice(ok, changed = false) {
    if (!ok && !this.storageWarning) {
      this.toast(changed ? t('This save changed in another tab. Reload the last checkpoint.') :
        t('Progress could not be saved. Check available storage and retry.'), 'progress-toast');
    }
    this.storageWarning = !ok;
    this.storageChanged = changed;
    return ok;
  }
  save() {
    if (!this.run) return true;
    const saved = Save.checkpoint(this.run, this.meta);
    if (!this.storageNotice(saved.ok, saved.changed)) return false;
    this.meta = saved.meta;
    for (const id of saved.earned) this.progressNotice.add(id);
    if (!this.battle) this.announceProgress();
    return true;
  }
  saveMeta() { return this.storageNotice(Save.saveMeta(this.meta)); }
  announceProgress() {
    const n = this.progressNotice.size;
    if (!n) return;
    this.progressNotice.clear();
    this.toast(t('Achievements earned: {n}', { n }), 'progress-toast');
  }
  discoverRecipes(list) {
    const fresh = new Set();
    if (!this.run) return fresh;
    for (const { id } of list) {
      if (!this.meta.combos[id] && !this.run.d.progress.recipes[id]) fresh.add(id);
      addRunRecipe(this.run, id);
    }
    return this.save() ? fresh : new Set();
  }
  saveSettings() { this.storageNotice(Save.saveSettings(this.settings)); this.audio.applySettings(this.settings); }

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
    if (fn.name) this.announceProgress();
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
      this.confirm(t('Start a new run?'), t('Your current run will be abandoned when the new run begins.'),
        t('Abandon & start new'), () => S.newRunDialog(this, true));
    } else S.newRunDialog(this);
  }

  startRun(starterRelic, replace = false) {
    if (!canStartWith(this.meta, starterRelic)) {
      this.toast(t('Choose an available starting relic.'));
      return false;
    }
    const saved = Save.loadRun();
    if (saved) {
      if (replace !== true) return false;
      const previous = this.run || Run.load(saved);
      if (!previous || !this.finalize(previous, previous.d.pending?.type === 'gameover' ?
        (previous.d.pending.victory ? 'victory' : 'defeat') : 'abandoned')) return false;
    }
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    return this.#beginRun(starterRelic, seed);
  }

  // Deterministic scenario tools use an explicit fixture entry point. Normal play always
  // goes through startRun, which rejects locked options and protects an existing save.
  startFixtureRun(starterRelic, seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) {
    const saved = this.run || Run.load(Save.loadRun());
    if (saved && !this.finalize(saved, 'abandoned')) return false;
    return this.#beginRun(starterRelic, seed >>> 0);
  }

  #beginRun(starterRelic, seed) {
    this.run = Run.create({ seed, starterRelic, tutorial: !this.meta.tutorialDone });
    if (this.meta.totalRuns > 0 && this.meta.tutorialDone) this.run.d.pending = { type: 'story', scene: 'intro_return', next: 'map' };
    if (!this.save()) {
      // Retry the same run if the checkpoint itself failed. If the checkpoint is already on
      // disk, Continue also recovers it after a reload.
      this.show(S.saveRetryScreen, () => { if (this.save()) this.route(); }, this.storageChanged);
      return false;
    }
    this.route();
    return true;
  }

  continueRun() {
    const run = Run.load(Save.loadRun());
    if (!run) { this.toast(t('Save data could not be loaded.')); this.show(S.titleScreen); return; }
    this.run = run;
    if (run.d.pending?.type !== 'gameover') this.save();
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
      case 'gameover': this.endRun(p.finalize?.result || (p.victory ? 'victory' : 'defeat')); break;
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
    setup.tactical = !!this.settings.tactical; // optional Tactical timing (off unless chosen)
    if (setup.assist) this.run.d.flags.assistUsed = true;
    if (setup.tactical) this.run.d.flags.tacticalUsed = true;
    this.save();
    this.show(() => {});
    const screen = new BattleScreen(this, setup, (outcome, combat) => this.onBattleEnd(outcome, combat, setup));
    this.battle = screen;
    screen.mount(this.layers.screen);
    document.documentElement.classList.toggle('in-battle', true);
  }

  onBattleEnd(outcome, combat, setup) {
    if (!this.run || this.battle == null) return;
    if (!this.run.finishBattle(outcome)) return;
    const tutorialWon = setup.tutorial && outcome.victory && !this.meta.tutorialDone;
    if (!this.save()) { this.show(S.saveRetryScreen, () => { if (this.save()) this.route(); }); return; }
    if (tutorialWon) {
      this.show(S.mapScreen);
      S.storyDialog(this, sceneText('tutorial_done'), () => this.route());
      return;
    }
    this.route();
  }

  finalize(run, result) {
    const before = this.meta.progress.earned;
    const saved = Save.finish(run, result, this.meta);
    if (saved.meta) this.meta = saved.meta;
    for (const id of saved.summary?.progress?.achievements || []) {
      if (!Object.hasOwn(before, id)) this.progressNotice.add(id);
    }
    if (!this.storageNotice(saved.ok, saved.changed)) {
      this.run = run;
      this.show(S.saveRetryScreen, () => this.endRun(run.d.pending?.finalize?.result || result), saved.changed);
      return null;
    }
    this.run = null;
    return saved.summary;
  }

  endRun(result) {
    if (!this.run) return;
    const summary = this.finalize(this.run, result);
    if (!summary) return;
    if (summary.result === 'abandoned') { this.toTitle(); return; }
    if (summary.result === 'defeat') {
      this.show(S.resultsScreen, summary);
      S.storyDialog(this, S.defeatLines(this), () => {});
    } else this.show(S.creditsScreen, () => this.show(S.resultsScreen, summary));
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
        btn(t('Save & quit to title'), () => { if (this.save()) { close(); this.toTitle(); } }, ''),
        this.run ? btn(t('Abandon run'), () => this.confirm(t('Abandon this run?'), t('It will be recorded as abandoned in the Museum.'), t('Abandon'), () => { close(); this.closeAllModals(); this.endRun('abandoned'); }), 'danger') : null)),
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
      if (opts.dismiss) window.removeEventListener('keydown', esc);
      this.modals = this.modals.filter((m) => m !== close);
      if (opts.onClose) opts.onClose();
      if (!this.modals.length && this.battle && this.battle.tutEl.hidden) this.resume();
    };
    if (opts.dismiss) wrap.querySelector('.modal-bg').addEventListener('click', () => { this.audio.sfx('back'); close(); });
    const esc = (e) => { if (e.key === 'Escape' && this.modals[this.modals.length - 1] === close) close(); };
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
    const grid = h('div', { class: 'deck-grid' });
    const cards = sortDeck(run);
    for (const c of cards) {
      const el = cardEl(c, { static: true });
      el.addEventListener('click', () => this.cardDetail(c));
      grid.append(el);
    }
    const counts = ['basic', 'arte', 'support'].map((k) => `${categoryPlural(k)} ${run.categoryCount(k)}`).join(' · ');
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
      const cards = sortDeck(run);
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
      toggle('reducedMotion', t('Reduced motion (steady camera, fewer flashes and effects)'), () => this.syncMotion()),
      toggle('shake', t('Screen shake'), () => { if (this.battle) this.battle.view.shakeEnabled = s.shake; }),
      toggle('hints', t('Tutorial hints')),
      toggle('relaxed', t('Assist: relaxed enemy speed (−25% enemy ATB; Flow rules unchanged)')),
      toggle('tactical', t('Tactical timing: enemies slow to 25% while you choose your next command in a combo'), () => { if (this.battle) this.battle.combat.tactical = !!s.tactical; }),
      h('div', { class: 'row-btns' },
        btn(t('Replay tutorial hints'), () => {
          // every lesson shows again at its moment in the next battles; runs, unlocks and records stay
          this.meta.tut = {};
          this.meta.lessonsMigrated = true;
          this.saveMeta();
          if (!s.hints) { s.hints = true; this.saveSettings(); const box = document.getElementById('set-hints'); if (box) box.checked = true; }
          this.toast(t('Tutorial hints reset.'));
        }, 'small'),
        btn(t('Erase all data'), () => this.confirm(t('Erase everything?'), t('Deletes the current run, Museum records and settings on this device.'), t('Erase'), () => {
          if (this.storageNotice(Save.erase())) location.reload();
        }), 'small danger')),
      h('div', { class: 'row-btns end' }, btn(t('Done'), () => close(), 'primary'))), { dismiss: true, onClose: () => { this.settingsOpen = false; } });
  }

  openMuseum() { museumModal(this); }

  howToPlay() {
    const sec = (key, title, body) => { const [tl, bd] = block('howto', key, [title, body]); return h('div', { class: 'htp-sec' }, h('h3', {}, tl), h('div', { html: bd })); };
    const close = this.modal(h('div', { class: 'panel wide htp' },
      h('h2', {}, t('How to Relay')),
      sec('hand', 'The hand', 'Your three heroes — <b>Hessa</b> (Vanguard), <b>Corvin</b> (Channeler) and <b>Pin</b> (Striker) — share one deck and one hand of <b>six cards</b>. The hand stays as it is: only the card you play (or Churn) is replaced, from the top of the deck. <b>NEXT CARD</b>, beside the hand, is the card you will draw next. Enemies act in real time: their ATB bar fills and they execute the intent shown in their bubble. Two enemies never act in the same moment.'),
      sec('target', 'Targets', 'Your attacks hit the enemy in <b>gold brackets</b>, labeled TARGET; its name is also on the ⌖ button above your hand. <b>Tap an enemy</b> (or that button) to switch. If your target falls, the next enemy is chosen and labeled NEW TARGET. A <b>red ring</b> under a hero, with ▼ and a number by their name, shows who an enemy is about to hit and for how much. <b>Hold an enemy</b> to read its next move, with the damage each hero would take after Defense (the battle pauses while you read).'),
      sec('party', 'Party HP, Defense, Cover', 'The three heroes share <b>one HP bar</b> (top left); the battle is lost only when it reaches 0, and no hero is ever knocked out. Each hero has a <b>Defense</b> % (the shield on their name plate) that reduces hits aimed at them: <b>Hessa 30%</b>, <b>Pin 15%</b>, <b>Corvin 0%</b>. Shared <b>Guard</b> absorbs what is left. An attack on every hero is reduced by each one\'s own Defense, and Guard absorbs it once. When Hessa plays a <b>Guard</b> card she <b>covers</b> the party for 4s: hits aimed at Corvin or Pin land on her instead (the COVER badge over her shows the time left).'),
      sec('sequence', 'Basic attacks, artes, support', '<b>Basic attacks ◆</b> (Weak 1, Medium 2, Strong 3) belong to no one: the hero who is attacking performs them. A combo starts with a basic attack by the hero you choose with the buttons above the hand (or by tapping a hero). <b>Artes ★</b> (ranks 4–6) belong to one hero: only that hero can use them, after at least one basic attack in that hero\'s part of the combo, and they cost Momentum (the number in the card\'s corner). <b>Support ✚</b> cards (healing, Guard, utility) have no rank and can be played any time, even during another hero\'s combo; the hero who performs one then recovers. A ★ on a hero button means that hero has an arte in hand.'),
      sec('queue', 'The queue and Recovery', 'Tapping a card <b>commits</b> it: it plays out over a moment (its effect lands mid-animation) and you can keep tapping cards meanwhile — up to three wait in order beside the combo (dashed chips), each leaving a placeholder in its hand slot. <b>Tap a waiting card</b> (chip or placeholder) to take it back; its Momentum is returned. A card that has started cannot be taken back. Momentum is spent when a card starts and gained when it lands, so an arte needs Momentum you already have. Each hero has a state on their button: Ready, Active (attacking), Acting, Committed (waiting to act) or <b>Recovering</b> — after their part of a combo (1.5s + 0.3s per card) or a support action (2s), shown by a bar. Enemies keep acting while heroes recover.'),
      sec('ranks', 'Ranks & suits', 'Within a combo every attack needs a <b>higher rank</b> than the last; skipping ranks is fine (Weak 1 → Strong 3 → arte 5). Suits never block a card. Exactly +1 rank is a <b>Step</b>; a different suit from the last card is a <b>Cross</b> (+1 Momentum); one card can be both. <b>EX</b> differs from A and B.'),
      sec('flow', 'Flow', 'The first attack starts <b>5s of Flow</b>. Flow only counts down while you are choosing: it <b>holds while any command plays out</b>, and for a moment after the first card, after each Relay and after the new hero\'s first card. Each valid card refunds 1s when it lands (up to 5s per combo). A combo lasts at most 14s, not counting the holds. An enemy about to steal Flow shows the amount in red at the end of the bar. If Flow runs out after a basic attack the combo is <b>Dropped</b> (−2 Momentum; waiting cards return to your hand); after an arte it counts as a Perfect. Wrong cards cause a <b>Stumble</b> (−0.4s, −1 Momentum; three stumbles end the combo). After every combo comes a short <b>breather</b>: enemies wait. The optional <b>Tactical timing</b> setting slows enemies to 25% while you choose.'),
      sec('relay', 'Relay & Echo', 'During a combo, <b>tap another Ready hero</b> to queue a <b>Relay</b> (heroes who can take it show ⇄). When it runs, the attacking hero recovers and the new hero continues the <b>same combo</b>: ranks start again (open with a basic attack), everything else carries on — cards, damage, Steps, Crosses. A Relay gives +1 Momentum and the new hero\'s first attack +10% per Relay so far. Each hero joins a combo once, so a combo has at most three parts. Echo effects repeat earlier cards\' damage, Guard, healing and statuses at reduced power (never Flow, Momentum, rank changes, Relays or other Echoes).'),
      sec('momentum', 'Momentum, Guard, Finish, Cash Out', '<b>Momentum</b> comes from basic attacks (Weak and Medium +1, Strong +2), Crosses, Perfect combos and cards. It pays for artes and some support, or buys <b>+1.5s Flow</b> or <b>+8 Guard</b> (3 each). Guard is shared by the party and fades slowly. Ending a combo with an arte is a <b>PERFECT</b> (+2 Momentum, +1 Churn charge): after an arte the button reads <b>FINISH</b>; the combo finishes by itself only when no higher arte is playable and every hero has already joined it. <b>CASH OUT</b> ends a combo of 2+ cards that ends with a basic attack for a payout (+25% if 2.5s+ Flow is left).'),
      sec('churn', 'Churn & Reserve', '<b>Swipe a card down</b> to Churn it (uses a charge; charges refill over time; outside a combo it also nudges every enemy\'s ATB forward, and their bars flash). The last replacement prepared before a chain is marked. Play it as an attack in the next chain for +1 Momentum. <b>Swipe up</b> to stash it in Reserve (2 slots); Reserve cards can be played whenever they are legal. If nothing in your hand can be played before a combo, Churn is <b>free</b>. <b>Hold</b> a card to read it in full; the battle pauses while you read.'),
      sec('interference', 'Interference', 'Enemies Lock cards (3s), Scramble ranks/suits, jam slots, snare Churn, latch your Reserve and steal Flow. Every effect shows its source and timer and always expires.'),
      h('div', { class: 'htp-sec htp-tips' }, h('h3', {}, t('All tutorial tips')),
        h('p', { class: 'dim' }, t('The tips appear once each, when they become useful in a battle. Settings → Replay tutorial hints shows them again.')),
        ...LESSONS.map((L) => { const [tl, bd] = block('lessons', L.key, [L.title, L.body]); return h('details', { class: 'htp-tip' }, h('summary', {}, tl), h('div', { html: bd })); })),
      sec('ex', 'EX Combos', 'EX recipes add an effect when you play their sequence. All recipes work from the first run. The strip below the battlefield groups recipes that resolve together. Open <b>EX details</b> to see their effects, and visit the Museum’s <b>Combo Journal</b> to review what you have discovered.'),
      sec('starters', 'Starting relics', 'Choose one available relic at the start of a run. A different relic replaces the default badge and helps you try a new strategy. See <b>Starters</b> in the Museum for requirements and progress.'),
      sec('keyboard', 'Keyboard', '<b>Q / W / E</b> choose Hessa / Corvin / Pin (during a combo: Relay to them; for Braced: the hero to protect) · <b>1–6</b> play · <b>Shift+1–6</b> Churn · <b>Alt+1–6</b> Reserve · <b>7/8</b> play Reserve · <b>Backspace</b> take back the last waiting card · <b>Space</b> Finish / Cash Out when no control has focus · <b>F</b> +Flow · <b>G</b> +Guard · <b>T</b> cycle target · <b>Tab</b> move focus · <b>Esc</b> pause'),
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
