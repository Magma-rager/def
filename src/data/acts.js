// Act themes and boss preparation options (Prepared plans and Volatile outcomes).
// Effects are applied by engine/run.js chooseBossPrep and engine/combat.js; text is the player-facing contract.
export const THEME_NAMES = { 1: 'The Scrapworks', 2: 'The Broken Protocol', 3: 'The Severed Signal' };

export const PREPARED_PLANS = [
  { id: 'brace', name: 'Brace Protocol', text: 'Start with 15 Guard and +1 Churn charge.', prep: { startGuard: 15, churnBonus: 1 } },
  { id: 'scout', name: 'Scout Report', text: 'Adaptation break requirement halved. The boss acts 4s later at the start.', prep: { scout: true, bossDelay: 4 } },
  { id: 'tuned', name: 'Tuned Opening', text: 'Heal 15% now and start with 4 Momentum.', prep: { startMomentum: 4 }, healPct: 0.15 },
];

export const VOLATILE_OUTCOMES = [
  { id: 'overcharged', name: 'Overcharged', text: 'Your damage +25%, but the boss has +20% HP.', prep: { dmgMult: 1.25, bossHpMult: 1.2 } },
  { id: 'redline', name: 'Redline', text: 'Start with 8 Momentum, but every ally takes 10% max HP damage now.', prep: { startMomentum: 8 }, partyDamagePct: 0.1 },
  { id: 'wildcard', name: 'Wildcard', text: 'Gain a random rare card permanently, but the boss starts with 30 Guard.', prep: { bossGuard: 30 }, rareCard: true },
  { id: 'scramble', name: 'Signal Scramble', text: 'Boss adaptation is removed, but the boss acts 15% faster.', prep: { noAdapt: true, bossHaste: 1.15 } },
];

