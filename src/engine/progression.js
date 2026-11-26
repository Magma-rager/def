// Phase 9 profile facts. All advancement is folded from saved run checkpoints.
// The single active-run cursor keeps replay of a checkpoint idempotent.
import { ACHIEVEMENTS } from '../data/achievements.js';
import { CARD_LIST, ARCHETYPES } from '../data/cards.js';
import { ENEMIES, BOSSES } from '../data/enemies.js';
import { RELIC_IDS, STARTER_OPTIONS } from '../data/relics.js';
import { RECIPES, RECIPE_IDS, knownDiscoveries } from '../data/recipes.js';

const BOSS_IDS = Object.values(BOSSES).flat();
export const PLAYABLE_CARDS = CARD_LIST.filter((c) => c.category !== 'junk' && c.p4 !== 'withheld');
const CARD_IDS = PLAYABLE_CARDS.map((c) => c.id);
const ENEMY_IDS = Object.keys(ENEMIES);
const STARTERS = STARTER_OPTIONS.map((o) => o.id);
export const count = (n) => Number.isSafeInteger(n) && n > 0 ? n : 0;
export const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const ids = (v) => Array.isArray(v) ? [...new Set(v.filter((id) => typeof id === 'string'))] : [];
export const counters = (v) => Object.fromEntries(Object.entries(object(v)).filter(([, n]) => count(n)));
const seen = (catalogue, discovered) => catalogue.filter((id) => discovered.includes(id)).length;

export function collections(meta) {
  return {
    cards: [seen(CARD_IDS, meta.cardsSeen), CARD_IDS.length],
    relics: [seen(RELIC_IDS, meta.relicsFound), RELIC_IDS.length],
    enemies: [seen(ENEMY_IDS, Object.keys(meta.enemiesSeen)), ENEMY_IDS.length],
    recipes: [knownDiscoveries(meta.combos).length, RECIPE_IDS.length],
    bosses: [BOSS_IDS.filter((id) => count(meta.bossesDefeated[id])).length, BOSS_IDS.length],
  };
}

export function normalizeProgress(meta, raw, legacy) {
  const p = object(raw);
  const oldDefeats = legacy ? meta.runs.filter((r) => r.result === 'defeat').length : 0;
  const oldAbandoned = legacy ? meta.runs.filter((r) => r.result === 'abandoned').length : 0;
  return {
    ...p,
    defeats: Math.max(oldDefeats, count(p.defeats)),
    abandoned: Math.max(oldAbandoned, count(p.abandoned)),
    unclassified: legacy ? Math.max(count(p.unclassified), meta.totalRuns - meta.wins - oldDefeats - oldAbandoned, 0) : count(p.unclassified),
    legacyGauge: p.legacyGauge === true || (legacy && meta.totalRuns >= 3),
    proofs: counters(p.proofs),
    builds: ids(p.builds),
    winsByBuild: ids(p.winsByBuild),
    earned: Object.fromEntries(Object.entries(object(p.earned)).filter(([id, v]) => /^[a-z0-9_]+$/.test(id) && v && typeof v === 'object')),
    settled: count(p.settled),
    active: count(p.active?.id) > 0 ? {
      id: p.active.id, enemies: ids(p.active.enemies), bosses: ids(p.active.bosses),
      recipes: counters(p.active.recipes), proofs: counters(p.active.proofs),
      new: Object.fromEntries(Object.entries(object(p.active.new)).map(([k, values]) => [k, ids(values)])),
    } : null,
  };
}

function measures(meta) {
  const p = meta.progress;
  const c = collections(meta);
  return {
    ...p.proofs,
    actOne: BOSSES[1].some((id) => count(meta.bossesDefeated[id])) ? 1 : 0,
    actTwo: BOSSES[2].some((id) => count(meta.bossesDefeated[id])) ? 1 : 0,
    wins: meta.wins,
    finished: meta.wins + p.defeats,
    bossWins: c.bosses[0],
    bossSight: BOSS_IDS.filter((id) => count(meta.enemiesSeen[id])).length,
    recipes: c.recipes[0],
    advanced: RECIPES.filter((r) => r.tier === 'advanced' && Object.hasOwn(meta.combos, r.id)).length,
    enemies: c.enemies[0],
    relics: c.relics[0],
    builds: seen(Object.keys(ARCHETYPES), p.builds),
    masteryWins: seen(Object.keys(ARCHETYPES), p.winsByBuild),
  };
}

export function achievementProgress(meta) {
  const values = measures(meta);
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    value: Math.min(a.target, count(values[a.measure])),
    earned: Object.hasOwn(meta.progress.earned, a.id),
  }));
}

export function starterOptions(meta) {
  const progress = achievementProgress(meta);
  return STARTER_OPTIONS.map((o) => {
    const achievement = progress.find((a) => a.id === o.unlock);
    const legacy = o.id === 'pressure_gauge' && meta.progress.legacyGauge;
    return { ...o, achievement, legacy, available: !o.unlock || achievement.earned || legacy };
  });
}

export function canStartWith(meta, id) {
  return typeof id === 'string' && starterOptions(meta).some((o) => o.id === id && o.available);
}

export function awardAchievements(meta, now, historical = false) {
  const earned = achievementProgress(meta).filter((a) => !a.earned && a.value >= a.target && (!historical || a.historical));
  for (const a of earned) meta.progress.earned[a.id] = { at: historical ? null : now, ...(historical ? { historical: true } : {}) };
  return earned.map((a) => a.id);
}

export function assignRunId(meta, run) {
  const p = meta.progress;
  if (!count(run.d.progress.id)) run.d.progress.id = Math.max(p.settled, count(p.active?.id)) + 1;
  return run.d.progress.id;
}

// These are played-mechanic thresholds for a whole run. A matching deck direction and successful
// Act I are also required. History with a tag alone gives no credit.
const SIGNATURE = {
  ladder: ['ascending', 2], variant: ['crossChains', 5], relay: ['relayPair', 4],
  momentum: ['burst', 3], flow: ['flowFinish', 3], churn: ['churnPayoff', 3],
  reserve: ['reserveBattles', 5], guard: ['guardAbsorbed', 100],
  cashout: ['cashouts', 6], interference: ['responseBattles', 3],
};

export function recognizeBuild(meta, summary) {
  const build = summary.archetype;
  const signature = SIGNATURE[build];
  if (!signature || !summary.bosses.some((id) => BOSSES[1].includes(id))) return;
  const [measure, minimum] = signature;
  if (count(summary.evidence?.[measure]) < minimum) return;
  if (!meta.progress.builds.includes(build)) meta.progress.builds.push(build);
  // A mastery win needs repeated use across the campaign. Earlier losses may still show exploration.
  const mastery = summary.result === 'victory' && count(summary.evidence[measure]) >= minimum * 2 &&
    [1, 2, 3].every((act) => count(summary.evidenceByAct?.[act]?.[measure]));
  if (mastery && !meta.progress.winsByBuild.includes(build)) meta.progress.winsByBuild.push(build);
  summary.buildProven = mastery ? 'mastery' : 'explored';
}

export function addRunRecipe(run, id, now = Date.now()) {
  if (!RECIPE_IDS.includes(id)) return false;
  const recipes = run.d.progress.recipes;
  const old = recipes[id];
  recipes[id] = { at: old?.at ?? now, count: count(old?.count) + 1 };
  return true;
}

export function runProofs(run) {
  return { ...run.d.progress.proofs, guardAbsorbed: count(run.d.stats.guardAbsorbed) };
}

export function applyCheckpoint(meta, run, now = Date.now()) {
  const id = assignRunId(meta, run);
  const p = meta.progress;
  if (id <= p.settled || (p.active && p.active.id !== id)) return null;
  if (!p.active) p.active = { id, enemies: [], bosses: [], recipes: {}, proofs: {}, new: {} };
  const cursor = p.active;
  const updates = cursor.new;
  if (run.d.flags?.tutorialDone) meta.tutorialDone = true;
  const beforeOptions = starterOptions(meta);
  const addNew = (key, value) => (updates[key] ||= []).push(value);
  const addIds = (key, received, found, valid) => {
    for (const id of ids(received)) {
      if (found.includes(id)) continue;
      found.push(id);
      if (valid.includes(id)) addNew(key, id);
    }
  };
  addIds('cards', run.d.progress.cards, meta.cardsSeen, CARD_IDS);
  addIds('relics', run.d.relicsSeen, meta.relicsFound, RELIC_IDS);

  for (const id of ids(run.d.enemiesSeen)) {
    if (!ENEMY_IDS.includes(id) || cursor.enemies.includes(id)) continue;
    cursor.enemies.push(id);
    if (!count(meta.enemiesSeen[id])) addNew('enemies', id);
    meta.enemiesSeen[id] = count(meta.enemiesSeen[id]) + 1;
  }
  for (const id of ids(run.d.bossesDefeated)) {
    if (!BOSS_IDS.includes(id) || cursor.bosses.includes(id)) continue;
    cursor.bosses.push(id);
    meta.bossesDefeated[id] = count(meta.bossesDefeated[id]) + 1;
  }
  for (const id of RECIPE_IDS) {
    const rec = run.d.progress.recipes[id];
    const n = count(rec?.count);
    const delta = n - count(cursor.recipes[id]);
    if (delta <= 0) continue;
    const old = meta.combos[id];
    if (!old) addNew('recipes', id);
    meta.combos[id] = { at: old?.at ?? rec.at, count: count(old?.count) + delta };
    cursor.recipes[id] = n;
  }
  for (const [key, n] of Object.entries(runProofs(run))) {
    const delta = count(n) - count(cursor.proofs[key]);
    if (delta <= 0) continue;
    p.proofs[key] = count(p.proofs[key]) + delta;
    cursor.proofs[key] = n;
  }
  const earned = awardAchievements(meta, now);
  for (const key of earned) addNew('achievements', key);
  for (const o of starterOptions(meta)) {
    if (o.available && !beforeOptions.find((b) => b.id === o.id).available) addNew('unlocked', o.id);
  }
  return earned;
}

export function settleRun(meta, run, result, date = Date.now()) {
  const id = assignRunId(meta, run);
  const p = meta.progress;
  if (id <= p.settled) return meta.runs.find((r) => r.runId === id) || null;
  if (applyCheckpoint(meta, run, date) === null) return null;
  const available = starterOptions(meta).filter((o) => o.available).map((o) => o.id);
  const summary = { ...run.summary(result), date };
  meta.totalRuns++;
  if (result === 'victory') {
    meta.wins++;
    if (!meta.endings.includes('core_stabilized')) meta.endings.push('core_stabilized');
  } else if (result === 'defeat') {
    meta.defeats++;
    p.defeats++;
  } else {
    p.abandoned++;
  }
  const updates = p.active.new;
  const records = {};
  for (const [key, field] of [['bestCombo', 'longest'], ['maxHit', 'maxHit'], ['bestScore', 'score']]) {
    if (count(summary[field]) <= meta[key]) continue;
    meta[key] = summary[field];
    records[key] = summary[field];
  }
  if (Object.keys(records).length) updates.records = records;
  meta.archetypes[summary.archetype] = count(meta.archetypes[summary.archetype]) + 1;
  if (summary.flags.praisedRelay || summary.flags.encouragedDev) meta.devTrust++;
  if (result !== 'abandoned') recognizeBuild(meta, summary);
  const earned = awardAchievements(meta, date);
  if (earned.length) (updates.achievements ||= []).push(...earned);
  const unlocked = starterOptions(meta).filter((o) => o.available && !available.includes(o.id)).map((o) => o.id);
  if (unlocked.length) (updates.unlocked ||= []).push(...unlocked);
  summary.progress = updates;
  meta.runs.unshift(summary);
  meta.runs.length = Math.min(30, meta.runs.length);
  p.settled = id;
  p.active = null;
  return summary;
}
