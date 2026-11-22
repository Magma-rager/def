// Local persistence (localStorage with in-memory fallback) for the run, the Museum, and settings.
import { normalizeCombos } from '../data/recipes.js';
const KEYS = { run: 'signalbreak.run.v3', meta: 'signalbreak.meta.v1', settings: 'signalbreak.settings.v1' };
const memory = {};

function store() {
  try {
    if (typeof localStorage !== 'undefined') {
      const k = '__sb_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return localStorage;
    }
  } catch (e) {
    /* storage blocked */
  }
  return {
    getItem: (k) => (k in memory ? memory[k] : null),
    setItem: (k, v) => { memory[k] = String(v); },
    removeItem: (k) => { delete memory[k]; },
  };
}
const S = store();

function read(key) {
  try {
    const raw = S.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function write(key, value) {
  try {
    S.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export const Save = {
  loadRun: () => read(KEYS.run),
  saveRun: (data) => write(KEYS.run, data),
  clearRun: () => { try { S.removeItem(KEYS.run); } catch (e) { /* ignore */ } },
  hasRun: () => !!read(KEYS.run),
  loadMeta: () => normalizeMeta(read(KEYS.meta)),
  saveMeta: (m) => write(KEYS.meta, m),
  loadSettings: () => ({ ...defaultSettings(), ...(read(KEYS.settings) || {}) }),
  saveSettings: (s) => write(KEYS.settings, s),
};

export function defaultSettings() {
  // lang: null until the player picks one; the browser language decides until then.
  return { master: 0.8, music: 0.55, sfx: 0.8, muted: false, reducedMotion: false, shake: true, hints: true, relaxed: false, lang: null };
}

export function defaultMeta() {
  return {
    version: 1,
    runs: [],
    totalRuns: 0,
    wins: 0,
    bossesDefeated: {},
    enemiesSeen: {},
    relicsFound: [],
    cardsSeen: [],
    bestCombo: 0,
    maxHit: 0,
    bestScore: 0,
    endings: [],
    archetypes: {},
    tutorialDone: false,
    defeats: 0,
    devTrust: 0,
    combos: {}, // Combo Journal (Phase 7): { [recipe id]: { at, count } }
  };
}

// Museum record version 2 (Phase 7; docs/COMBAT_SPEC.md §19): the Combo Journal (`combos`). An older
// record keeps every field it has; a missing or damaged field gets its default, `combos` is validated
// (see normalizeCombos). Idempotent, so it runs on every load.
export function normalizeMeta(raw) {
  const d = defaultMeta();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const m = { ...d, ...raw };
  const arr = (k) => { if (!Array.isArray(m[k])) m[k] = d[k]; };
  const obj = (k) => { if (!m[k] || typeof m[k] !== 'object' || Array.isArray(m[k])) m[k] = d[k]; };
  const num = (k) => { if (!Number.isFinite(m[k])) m[k] = d[k]; };
  for (const k of ['runs', 'relicsFound', 'cardsSeen', 'endings']) arr(k);
  for (const k of ['bossesDefeated', 'enemiesSeen', 'archetypes']) obj(k);
  for (const k of ['totalRuns', 'wins', 'bestCombo', 'maxHit', 'bestScore', 'defeats', 'devTrust']) num(k);
  m.combos = normalizeCombos(raw.combos);
  m.version = Math.max(2, Number.isFinite(raw.version) ? raw.version : 1);
  return m;
}

// Records one EX Combo activation in the Journal; returns true the first time (a discovery).
export function recordCombo(meta, id, now = Date.now()) {
  if (!meta.combos || typeof meta.combos !== 'object') meta.combos = {};
  const had = meta.combos[id];
  if (had) { had.count = (had.count || 0) + 1; return false; }
  meta.combos[id] = { at: now, count: 1 };
  return true;
}

// Record a finished run into the Museum. Cross-run memory is separate from current-run adaptation.
export function recordRun(meta, summary, extra) {
  meta.runs.unshift(summary);
  meta.runs = meta.runs.slice(0, 30);
  meta.totalRuns++;
  if (summary.result === 'victory') {
    meta.wins++;
    if (!meta.endings.includes('core_stabilized')) meta.endings.push('core_stabilized');
  } else meta.defeats++;
  for (const b of summary.bosses) meta.bossesDefeated[b] = (meta.bossesDefeated[b] || 0) + 1;
  for (const e of extra.enemiesSeen || []) meta.enemiesSeen[e] = (meta.enemiesSeen[e] || 0) + 1;
  for (const r of extra.relicsSeen || []) if (!meta.relicsFound.includes(r)) meta.relicsFound.push(r);
  for (const c of extra.cardsSeen || []) if (!meta.cardsSeen.includes(c)) meta.cardsSeen.push(c);
  meta.bestCombo = Math.max(meta.bestCombo, summary.longest || 0);
  meta.maxHit = Math.max(meta.maxHit, summary.maxHit || 0);
  meta.bestScore = Math.max(meta.bestScore, summary.score || 0);
  meta.archetypes[summary.archetype] = (meta.archetypes[summary.archetype] || 0) + 1;
  if (summary.flags && (summary.flags.praisedRelay || summary.flags.encouragedDev)) meta.devTrust++;
  return meta;
}

export function unlocks(meta) {
  const bossKeys = Object.keys(meta.bossesDefeated || {});
  return {
    boss1: bossKeys.some((b) => b === 'clockwork_regent' || b === 'scrap_tyrant'),
    runs3: meta.totalRuns >= 3,
    win: meta.wins >= 1,
  };
}
