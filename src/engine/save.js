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
  const seen = {};
  function getStorage() {
    if (storage) return storage;
    // Node tools can use memory. A browser that rejects storage must report the failure.
    if (typeof window === 'undefined' && typeof localStorage === 'undefined') return memoryStorage;
    return globalThis.localStorage;
  }
  function inspect(type) {
    try {
      const raw = getStorage().getItem(KEYS[type]);
      if (raw == null) return { ok: true, value: null, raw: null };
      const value = JSON.parse(raw);
      return { ok: !!value && typeof value === 'object' && !Array.isArray(value), value, raw };
    } catch { return { ok: false }; }
  }
  const read = (type) => { const record = inspect(type); return record.ok ? record.value : null; };
  function load(type) {
    const record = inspect(type);
    if (record.ok) seen[type] = record.raw;
    return record.ok ? record.value : null;
  }
  const changed = (type, record) => seen[type] !== undefined && seen[type] !== record.raw;
  function write(type, value) {
    try {
      const raw = JSON.stringify(value);
      getStorage().setItem(KEYS[type], raw);
      seen[type] = raw;
      return true;
    } catch { return false; }
  }
  function clearRun() {
    try {
      getStorage().removeItem(KEYS.run);
      seen.run = null;
      return true;
    } catch { return false; }
  }
  function erase() {
    try {
      const store = getStorage();
      for (const [type,key] of Object.entries(KEYS)) {
        store.removeItem(key);
        seen[type] = null;
      }
      return true;
    } catch { return false; }
  }
  function checkpoint(run, meta) {
    const profile = inspect('meta');
    const save = inspect('run');
    if (!profile.ok || !save.ok) return { ok: false };
    if (changed('meta',profile) || changed('run',save)) return { ok: false, changed: true };
    const id = assignRunId(meta, run);
    const storedId = count(save.value?.progress?.id);
    const progress = profile.value?.progress;
    if (id <= count(progress?.settled) || (storedId && storedId !== id) ||
        (count(progress?.active?.id) && count(progress.active.id) !== id) ||
        count(save.value?.floors) > run.d.floors || count(save.value?.battleCount) > run.d.battleCount ||
        (save.value?.pending?.finalize && !run.d.pending?.finalize)) return { ok: false };
    if (id <= meta.progress.settled || (meta.progress.active && meta.progress.active.id !== id)) return { ok: false };
    if (!write('run', run.serialize())) return { ok: false };
    const next = JSON.parse(JSON.stringify(meta));
    const earned = applyCheckpoint(next, run);
    if (JSON.stringify(next) !== JSON.stringify(meta) && !write('meta', next)) return { ok: false };
    return { ok: true, meta: next, earned };
  }
  function finish(run, result, meta) {
    const profile = inspect('meta');
    const save = inspect('run');
    if (!profile.ok || !save.ok) return { ok: false };
    const stored = profile.value;
    if (count(stored?.progress?.settled) > meta.progress.settled) meta = normalizeMeta(stored);
    const id = assignRunId(meta, run);
    const active = save.value;
    if (active?.progress?.id && active.progress.id !== id) {
      // A delayed duplicate must never clear or overwrite a newer active save.
      return id <= meta.progress.settled ? { ok: true, meta, summary: meta.runs.find((r) => r.runId === id) } : { ok: false };
    }
    if (id <= meta.progress.settled) {
      return { ok: !active || clearRun(), meta, summary: meta.runs.find((r) => r.runId === id) };
    }
    if (changed('meta',profile) || (changed('run',save) && !active?.pending?.finalize)) return { ok: false, changed: true };
    if ((count(stored?.progress?.active?.id) && count(stored.progress.active.id) !== id) ||
        count(active?.floors) > run.d.floors || count(active?.battleCount) > run.d.battleCount) return { ok: false };
    if (active?.pending?.finalize) run.d.pending = active.pending;
    if (!run.d.pending?.finalize) run.d.pending = { type: 'gameover', victory: result === 'victory', finalize: { result, date: Date.now() } };
    if (!write('run', run.serialize())) return { ok: false };
    const next = JSON.parse(JSON.stringify(meta));
    const pending = run.d.pending.finalize;
    const summary = settleRun(next, run, pending.result, pending.date);
    if (!summary || !write('meta', next)) return { ok: false };
    return { ok: clearRun(), meta: next, summary };
  }
  return {
    loadRun: () => load('run'),
    saveRun: (d) => inspect('run').ok && write('run', d),
    clearRun,
    erase,
    hasRun: () => !!read('run'),
    healthy: () => Object.keys(KEYS).every((key) => inspect(key).ok),
    loadMeta: () => normalizeMeta(load('meta')),
    saveMeta: (m) => {
      const stored = inspect('meta');
      return stored.ok && !changed('meta',stored) && count(stored.value?.progress?.settled) <= m.progress.settled &&
        (!stored.value?.progress?.active || stored.value.progress.active.id === m.progress.active?.id) && write('meta', m);
    },
    loadSettings: () => {
      const defaults = defaultSettings();
      const settings = { ...defaults, ...object(read('settings')) };
      for (const key of ['master','music','sfx']) {
        settings[key] = Number.isFinite(settings[key]) ? Math.max(0,Math.min(1,settings[key])) : defaults[key];
      }
      for (const [key,value] of Object.entries(defaults)) {
        if (typeof value === 'boolean' && typeof settings[key] !== 'boolean') settings[key] = value;
      }
      if (!['en','ru'].includes(settings.lang)) settings.lang = null;
      return settings;
    },
    saveSettings: (s) => inspect('settings').ok && write('settings', s),
    checkpoint,
    finish,
  };
}

export const Save = createSave();

export function defaultSettings() {
  return { master: 0.8, music: 0.55, sfx: 0.8, muted: false, reducedMotion: false, shake: true, hints: true, relaxed: false, tactical: false, lang: null };
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
