// Run the same campaigns for each starter, or carry an earned profile across runs.
import assert from 'node:assert/strict';
import { defaultMeta, normalizeMeta } from '../src/engine/save.js';
import { collections, starterOptions } from '../src/engine/progression.js';
import { RELICS, STARTER_OPTIONS } from '../src/data/relics.js';
import { simulateCampaign } from './simulate.mjs';

const [, , mode = 'profile', n = '8', selection] = process.argv;
const runs = Number(n);
const rates = { quick: 0.55, regular: 1, learner: 1.4 };
const startSeed = Number(process.env.SB_FIRST_SEED || 1001);
const mean = (xs) => Math.round(100 * xs.reduce((n, x) => n + x, 0) / Math.max(1, xs.length)) / 100;
assert.ok(Number.isSafeInteger(runs) && runs >= 1);
const print = (data) => console.log(JSON.stringify(data));

if (mode === 'balance') {
  const profiles = selection ? [selection] : Object.keys(rates);
  const starters = process.env.SB_STARTERS ? process.env.SB_STARTERS.split(',') : STARTER_OPTIONS.map((o) => o.id);
  for (const profile of profiles) {
    assert.ok(rates[profile], 'choose quick, regular or learner');
    let defaultRuns;
    for (const starterRelic of [...new Set(['beta_badge', ...starters])]) {
      const tag = RELICS[starterRelic].tag;
      const rows = Array.from({ length: runs }, (_, i) => simulateCampaign(startSeed + i, { starterRelic, profile, reaction: rates[profile] }));
      if (!defaultRuns) defaultRuns = rows;
      rows.forEach((r, i) => assert.deepEqual(r.base, defaultRuns[i].base));
      const battles = rows.reduce((s, r) => s + r.battles, 0);
      const perBattle = (key) => Math.round(100 * rows.reduce((s, r) => s + (r.k[key] || 0), 0) / battles) / 100;
      const available = (sample, field) => mean(sample.map((r) => r[field][tag] || 0));
      print({ profile, starterRelic, seeds: [startSeed, startSeed + runs - 1],
        openingWins: rows.filter((r) => r.opening.victory).length, openingHP: mean(rows.map((r) => r.opening.hpLost)),
        openingSeconds: mean(rows.map((r) => r.opening.seconds)), actOne: rows.filter((r) => r.firstActVictory).length,
        wins: rows.filter((r) => r.result === 'victory').length, hpPerBattle: mean(rows.flatMap((r) => r.hpLoss)),
        secondsPerBattle: mean(rows.flatMap((r) => r.durations)), exPerBattle: perBattle('exActivations'),
        mechanicPerBattle: Object.fromEntries(['steps', 'crosses', 'reservePlays', 'guardGained', 'cashouts', 'churns', 'relays', 'flowGained', 'momentumSpent', 'interferencePayoffs'].map((key) => [key, perBattle(key)])),
        direction: rows.filter((r) => r.arch === tag).length, directions: [...new Set(rows.map((r) => r.arch))].sort(),
        matchingOffersPerRun: available(rows, 'offersByTag'), sameTagWithDefault: available(defaultRuns, 'offersByTag'),
        ownFirstOffers: available(rows, 'firstOffersByTag'), defaultFirstOffers: available(defaultRuns, 'firstOffersByTag'),
        ownPivots: available(rows, 'pivotsByTag') });
    }
  }
} else if (mode === 'profile') {
  for (const scenario of selection ? [selection] : ['ordinary', 'learner', 'quick', 'variety', 'collector']) {
    assert.ok(['ordinary', 'learner', 'quick', 'variety', 'collector'].includes(scenario));
    let meta = defaultMeta();
    const used = new Set();
    for (let i = 0; i < runs; i++) {
      const options = starterOptions(meta).filter((o) => o.available).map((o) => o.id);
      const starterRelic = scenario === 'variety' ? options.find((id) => !used.has(id)) || options[i % options.length] : 'beta_badge';
      used.add(starterRelic);
      const profile = rates[scenario] ? scenario : 'regular';
      const log = simulateCampaign(startSeed + i, { starterRelic, meta, profile, reaction: rates[profile],
        target: scenario === 'variety' ? RELICS[starterRelic].tag : null,
        tactics: scenario === 'variety' ? 'auto' : null, recipeAware: scenario === 'collector' });
      assert.equal(meta.totalRuns, i + 1);
      const checkpoint = JSON.stringify(meta);
      meta = normalizeMeta(JSON.parse(checkpoint));
      assert.deepEqual(meta, normalizeMeta(JSON.parse(JSON.stringify(meta))));
      print({ scenario, run: i + 1, seed: startSeed + i, starterRelic, result: log.result, act: log.act,
        bossIds: log.bossIds, direction: log.arch, builds: meta.progress.builds, collections: collections(meta),
        newly: log.summary.progress, starters: Object.fromEntries(starterOptions(meta).map((o) =>
          [o.id, o.available ? true : [o.achievement.value, o.achievement.target]])) });
    }
  }
} else {
  throw new Error('Usage: node tools/progression.mjs balance|profile [runs] [profile or scenario]');
}
