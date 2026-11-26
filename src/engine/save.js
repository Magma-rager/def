// Local persistence. An active-run write is the recovery checkpoint for profile updates.
import { normalizeCombos } from '../data/recipes.js';
import { applyCheckpoint, assignRunId, awardAchievements, count, counters, ids, normalizeProgress, object, settleRun } from './progression.js';

const KEYS = { run: 'signalbreak.run.v3', meta: 'signalbreak.meta.v1', settings: 'signalbreak.settings.v1' };
const memory = new Map();
const memoryStorage = {
  getItem: (key) => memory.get(key),
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};

export function createSave(storage) {
  function getStorage() {
    if (storage) return storage;
    // Node tools can use memory. A browser that rejects storage must report the failure.
    if (typeof window === 'undefined' && typeof localStorage === 'undefined') return memoryStorage;
    return globalThis.localStorage;
  }
  function read(type) {
    try {
      const raw = getStorage().getItem(KEYS[type]);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function write(type, value) {
    try {
      getStorage().setItem(KEYS[type], JSON.stringify(value));
      return true;
    } catch { return false; }
  }
  function clearRun() {
    try {
      getStorage().removeItem(KEYS.run);
      return true;
    } catch { return false; }
  }
  function checkpoint(run, meta) {
    const id = assignRunId(meta, run);
    if (id <= meta.progress.settled || (meta.progress.active && meta.progress.active.id !== id)) return { ok: false };
    if (!write('run', run.serialize())) return { ok: false };
    const next = JSON.parse(JSON.stringify(meta));
    const earned = applyCheckpoint(next, run);
    if (JSON.stringify(next) !== JSON.stringify(meta) && !write('meta', next)) return { ok: false };
    return { ok: true, meta: next, earned };
  }
  function finish(run, result, meta) {
    const stored = read('meta');
    if (count(stored?.progress?.settled) > meta.progress.settled) meta = normalizeMeta(stored);
    const id = assignRunId(meta, run);
    const active = read('run');
    if (active?.progress?.id && active.progress.id !== id) {
      // A delayed duplicate must never clear or overwrite a newer active save.
      return id <= meta.progress.settled ? { ok: true, meta, summary: meta.runs.find((r) => r.runId === id) } : { ok: false };
    }
    if (id <= meta.progress.settled) {
      return { ok: !active || clearRun(), meta, summary: meta.runs.find((r) => r.runId === id) };
    }
    if (!run.d.pending?.finalize) run.d.pending = { type: 'gameover', victory: result === 'victory', finalize: { result, date: Date.now() } };
    if (!write('run', run.serialize())) return { ok: false };
    const next = JSON.parse(JSON.stringify(meta));
    const pending = run.d.pending.finalize;
    const summary = settleRun(next, run, pending.result, pending.date);
    if (!summary || !write('meta', next)) return { ok: false };
    return { ok: clearRun(), meta: next, summary };
  }
  return {
    loadRun: () => read('run'),
    saveRun: (d) => write('run', d),
    clearRun,
    hasRun: () => !!read('run'),
    loadMeta: () => normalizeMeta(read('meta')),
    saveMeta: (m) => write('meta', m),
    loadSettings: () => ({ ...defaultSettings(), ...object(read('settings')) }),
    saveSettings: (s) => write('settings', s),
    checkpoint,
    finish,
  };
}

export const Save = createSave();

export function defaultSettings() {
  return { master: 0.8, music: 0.55, sfx: 0.8, muted: false, reducedMotion: false, shake: true, hints: true, relaxed: false, lang: null };
}

export function defaultMeta() {
  const m = {
    version: 3, runs: [], totalRuns: 0, wins: 0, bossesDefeated: {}, enemiesSeen: {},
    relicsFound: [], cardsSeen: [], bestCombo: 0, maxHit: 0, bestScore: 0, endings: [],
    archetypes: {}, tutorialDone: false, defeats: 0, devTrust: 0, combos: {},
  };
  m.progress = normalizeProgress(m, null, false);
  return m;
}

export function normalizeMeta(raw) {
  const source = object(raw);
  const m = { ...defaultMeta(), ...source };
  m.runs = Array.isArray(source.runs) ? source.runs.filter((r) => r && typeof r === 'object' && !Array.isArray(r)).slice(0, 30) : [];
  for (const k of ['relicsFound', 'cardsSeen', 'endings']) m[k] = ids(source[k]);
  for (const k of ['bossesDefeated', 'enemiesSeen', 'archetypes']) m[k] = counters(source[k]);
  for (const k of ['totalRuns', 'wins', 'bestCombo', 'maxHit', 'bestScore', 'defeats', 'devTrust']) m[k] = count(source[k]);
  m.wins = Math.max(m.wins, m.runs.filter((r) => r.result === 'victory').length);
  m.totalRuns = Math.max(m.totalRuns, m.runs.length, m.wins);
  const documentedBosses = Object.create(null);
  for (const run of m.runs) for (const id of ids(run.bosses)) documentedBosses[id] = (documentedBosses[id] || 0) + 1;
  for (const [id, n] of Object.entries(documentedBosses)) m.bossesDefeated[id] = Math.max(count(m.bossesDefeated[id]), n);
  m.combos = normalizeCombos(source.combos);
  m.progress = normalizeProgress(m, source.progress, count(source.version) < 3);
  m.version = Math.max(3, count(source.version));
  awardAchievements(m, null, true);
  return m;
}
