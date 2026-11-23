// SIGNAL//BREAK card library (docs/COMBAT_SPEC.md §5, §18.1).
//
// category: basic | arte | support | junk
//   basic   — neutral attacks any hero performs; rank 1 Weak, 2 Medium, 3 Strong; cost 0; generate
//             Momentum when they resolve (BASIC_GAIN)
//   arte    — one hero's offensive ability; rank 4-6; costs Momentum (ARTE_COST); needs a basic
//             attack earlier in the same combo, performed by the same hero
//   support — no rank; performed by its owner (or the selected hero if neutral); never part of a combo
//   junk    — unplayable; Churn deletes it
// owner: V = Hessa, C = Corvin, S = Pin, null = neutral.  variant (suit): A | B | EX — a bonus layer
// (Step, Cross), never a legality rule.
// v: numeric values [base, upgraded]; text uses {key} placeholders that render those values.
// fx(A): effect script run by the combat engine. A is the card API (engine/combat.js makeApi).
//
// Phase 4 conversion status (p4):
//   'converted' — reviewed for the new rules; offered by rewards, shops and events
//   'withheld'  — never offered; save version 5 replaces it with `migrate` (same hero and rarity)
//                 when an older save is loaded (the table below stays as Phase 4 shipped it).
// Phase 8 converted the last four interim cards into techniques and redesigned Pressure Valve: every
// card is now 'converted' (docs/COMBAT_SPEC.md §29).
//
// Techniques (Phase 8, §29): support cards with a `tech(v, fromReserve)` that returns { rewind, suit }.
// An ally who is free performs one during the active hero's combo (the support rules: its owner, or
// any free hero for a neutral one); when it executes, the active segment's rank drops by `rewind`
// (never below 0) and its current suit becomes `suit`. The queue's projection applies the same change,
// so cards committed after a technique are judged against the lowered rank; a technique needs a combo
// with at least one card in its current part, and is cancelled (card back, Momentum returned) if the
// combo ends before it executes. Past cards, Steps and Crosses are never rewritten.

export const CATEGORY_NAMES = { basic: 'Basic', arte: 'Arte', support: 'Support', junk: 'Glitch' };
export const STRENGTH_NAMES = { 1: 'Weak', 2: 'Medium', 3: 'Strong' };
export const OWNER_NAMES = { V: 'Hessa', C: 'Corvin', S: 'Pin' };
// prototype values (docs/COMBAT_SPEC.md §21)
export const BASIC_GAIN = { 1: 1, 2: 1, 3: 2 }; // Momentum a basic attack generates, by its printed rank
export const ARTE_COST = { 4: 2, 5: 3, 6: 4 }; // Momentum an arte costs, by its printed rank
// the attack a hero uses for a neutral basic attack
export const HERO_ANIM = { V: 'melee', C: 'cast', S: 'shoot' };

export const ARCHETYPES = {
  ladder: 'Rank Ladder',
  variant: 'Suit Switching',
  relay: 'Relay Echo',
  momentum: 'Momentum Burst',
  flow: 'Flow Extension',
  churn: 'Churn Engine',
  reserve: 'Reserve Strategy',
  guard: 'Guard & Counter',
  cashout: 'Cash Out',
  interference: 'Interference Exploit',
};

const C = [];
function card(def) {
  def.tags = def.tags || [];
  def.p4 = def.p4 || 'converted';
  if (def.category === 'basic') {
    def.owner = null;
    def.cost = 0;
    def.gain = BASIC_GAIN[def.rank];
    def.strength = def.rank;
  } else if (def.category === 'arte') {
    def.cost = def.cost !== undefined ? def.cost : ARTE_COST[def.rank];
  } else if (def.category === 'support') {
    def.rank = 0;
    def.cost = def.cost || 0;
  }
  C.push(def);
}

// ───────────────────────────── BASIC ATTACKS (neutral) ─────────────────────────────
// Weak (rank 1)
card({
  id: 'scrapline', name: 'Scrapline', category: 'basic', rank: 1, variant: 'A', rarity: 'starter', anim: 'shoot', glyph: 'arrow',
  v: { d: [5, 7] }, text: 'Deal {d}.',
  fx: (A) => A.dmg(A.v('d')),
});
card({
  id: 'spark_primer', name: 'Spark Primer', category: 'basic', rank: 1, variant: 'EX', rarity: 'common', anim: 'cast', glyph: 'star',
  v: { d: [3, 4], b: [5, 7] }, text: 'Deal {d}. The next card this combo deals +{b}.', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d')); A.nextBonus(A.v('b')); },
});
card({
  id: 'pinprick', name: 'Pinprick', category: 'basic', rank: 1, variant: 'A', rarity: 'common', anim: 'shoot', glyph: 'arrow',
  v: { d: [3, 4] }, text: 'Deal {d} twice.',
  fx: (A) => A.dmg(A.v('d'), { hits: 2 }),
});
card({
  id: 'first_rung', name: 'First Rung', category: 'basic', rank: 1, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'ladder',
  v: { d: [3, 4], b: [2, 3] }, text: 'Deal {d}. This combo, every Step deals +{b} bonus damage.', tags: ['ladder'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('stepBonus', A.v('b')); },
});
card({
  id: 'cold_start', name: 'Cold Start', category: 'basic', rank: 1, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'hammer',
  v: { d: [4, 5], m: [2, 3] }, text: 'Deal {d}. If you have 0 Momentum, gain {m}.', tags: ['momentum'],
  fx: (A) => { const zero = A.c.available() === 0; A.dmg(A.v('d')); if (zero) A.mom(A.v('m')); },
});
card({
  id: 'hidden_ace', name: 'Hidden Ace', category: 'basic', rank: 1, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'star',
  v: { d: [4, 5] }, text: 'Deal {d}. From Reserve: deal triple and +1 Momentum.', tags: ['reserve'],
  fx: (A) => { if (A.fromReserve) { A.dmg(A.v('d') * 3); A.mom(1); } else A.dmg(A.v('d')); },
});
card({
  id: 'static_bloom', name: 'Static Bloom', category: 'basic', rank: 1, variant: 'B', rarity: 'rare', anim: 'cast', glyph: 'bolt',
  v: { d: [2, 3] }, text: 'Deal {d} to ALL. Unlock every Locked hand card; +1 Momentum for each.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d'), { all: true }); const n = A.unlockAll(); A.mom(n); },
});
card({
  id: 'open_ledger', name: 'Open Ledger', category: 'basic', rank: 1, variant: 'A', rarity: 'uncommon', anim: 'melee', glyph: 'coin',
  v: { d: [3, 4], p: [50, 75] }, text: 'Deal {d}. If this combo Cashes Out, payout +{p}%.', tags: ['cashout'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('cashPct', A.v('p') / 100); },
});
// Medium (rank 2)
card({
  id: 'rivet_jab', name: 'Rivet Jab', category: 'basic', rank: 2, variant: 'A', rarity: 'starter', anim: 'melee', glyph: 'hammer',
  v: { d: [7, 9] }, text: 'Deal {d}.',
  fx: (A) => A.dmg(A.v('d')),
});
card({
  id: 'hotwire', name: 'Hotwire', category: 'basic', rank: 2, variant: 'B', rarity: 'starter', anim: 'cast', glyph: 'bolt',
  v: { d: [4, 5], m: [1, 2] }, text: 'Deal {d}. Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => { A.dmg(A.v('d')); A.mom(A.v('m')); },
});
card({
  id: 'step_up', name: 'Step Up', category: 'basic', rank: 2, variant: 'A', rarity: 'common', anim: 'shoot', glyph: 'ladder',
  v: { d: [4, 5], b: [3, 4] }, text: 'Deal {d}. As a Step: +{b} damage and +1 Momentum.', tags: ['ladder'],
  fx: (A) => { const st = A.step; A.dmg(A.v('d') + (st ? A.v('b') : 0)); if (st) A.mom(1); },
});
card({
  id: 'tinder_toss', name: 'Tinder Toss', category: 'basic', rank: 2, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame',
  v: { s: [3, 5] }, text: 'Apply {s} Scorch.', tags: ['interference'],
  fx: (A) => A.status('scorch', A.v('s')),
});
card({
  id: 'gauge_read', name: 'Gauge Read', category: 'basic', rank: 2, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'eye',
  v: { d: [4, 6] }, text: 'Deal {d}. If Reserve holds a card: +1 Momentum and +0.3s Flow.', tags: ['reserve'],
  fx: (A) => { A.dmg(A.v('d')); if (A.c.reserve.length > 0) { A.mom(1); A.flow(0.3); } },
});
card({
  id: 'junk_toss', name: 'Junk Toss', category: 'basic', rank: 2, variant: 'B', rarity: 'common', anim: 'melee', glyph: 'box',
  v: { d: [4, 5], p: [4, 4], m: [20, 24] }, text: 'Deal {d}, +{p} per Churn used this battle (max +{m}).', tags: ['churn'],
  fx: (A) => A.dmg(A.v('d') + Math.min(A.v('m'), A.v('p') * A.c.stats.churns)),
});
card({
  id: 'fault_finder', name: 'Fault Finder', category: 'basic', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'eye',
  v: { d: [3, 4], b: [6, 9] }, text: 'Deal {d}. 4s Exposed. +{b} if a hand card is Locked or Scrambled.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d') + (A.disruptedCount() > 0 ? A.v('b') : 0)); A.status('exposed', 4); },
});
card({
  id: 'polarity_shift', name: 'Polarity Shift', category: 'basic', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'wave',
  v: { d: [4, 5] }, text: "Deal {d}. The combo's suit becomes B.", tags: ['variant'],
  fx: (A) => { A.dmg(A.v('d')); A.setVariant('B'); },
});
card({
  id: 'tally_mark', name: 'Tally Mark', category: 'basic', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'melee', glyph: 'coin',
  v: { d: [3, 4], b: [3, 4] }, text: 'Deal {d}. If this combo Cashes Out, payout +{b} per card.', tags: ['cashout'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('cashPerCard', A.v('b')); },
});
// Strong (rank 3)
card({
  id: 'piston_strike', name: 'Piston Strike', category: 'basic', rank: 3, variant: 'A', rarity: 'starter', anim: 'melee', glyph: 'hammer',
  v: { d: [10, 13] }, text: 'Deal {d}.',
  fx: (A) => A.dmg(A.v('d')),
});
card({
  id: 'quickdraw', name: 'Quickdraw', category: 'basic', rank: 3, variant: 'B', rarity: 'common', anim: 'shoot', glyph: 'clock',
  v: { d: [8, 10] }, text: 'Deal {d}. Later cards this combo refund +0.3s more Flow.', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('refundBonus', 0.3); },
});
card({
  id: 'tripwire', name: 'Tripwire', category: 'basic', rank: 3, variant: 'A', rarity: 'common', anim: 'shoot', glyph: 'hook',
  v: { d: [6, 8] }, text: 'Deal {d}. Apply 4s Weak (target deals -25%).', tags: ['guard'],
  fx: (A) => { A.dmg(A.v('d')); A.status('weak', 4); },
});
card({
  id: 'shield_bash', name: 'Shield Bash', category: 'basic', rank: 3, variant: 'B', rarity: 'common', anim: 'melee', glyph: 'shield',
  v: { d: [6, 8] }, text: 'Deal damage equal to half your Guard (min {d}).', tags: ['guard'],
  fx: (A) => A.dmg(Math.max(A.v('d'), Math.floor(A.c.guard / 2))),
});
card({
  id: 'gear_swap', name: 'Gear Swap', category: 'basic', rank: 3, variant: 'B', rarity: 'common', anim: 'melee', glyph: 'gear',
  v: { d: [7, 9] }, text: "Deal {d}. Flip the combo's suit (A↔B).", tags: ['variant'],
  fx: (A) => { A.dmg(A.v('d')); A.flipVariant(); },
});
card({
  id: 'pocket_watch', name: 'Pocket Watch', category: 'basic', rank: 3, variant: 'B', rarity: 'uncommon', anim: 'shoot', glyph: 'clock',
  v: { d: [6, 8] }, text: 'Deal {d}. Stash the highest-rank arte in hand into Reserve.', tags: ['reserve'],
  fx: (A) => { A.dmg(A.v('d')); A.stashBestArte(); },
});
card({
  // Phase 8 technique (was an interim Strong attack that rewound itself from Reserve)
  id: 'cache_hook', name: 'Cache Hook', owner: null, category: 'support', variant: 'A', rarity: 'uncommon', anim: 'buff', glyph: 'hook',
  v: { r: [1, 2], rr: [2, 3] }, text: 'Technique: the combo\'s rank drops by {r}. Played from Reserve: by {rr} instead, and +1 Momentum.', tags: ['reserve', 'ladder'],
  tech: (v, fromReserve) => ({ rewind: fromReserve ? v('rr') : v('r') }),
  fx: (A) => { if (A.fromReserve) A.mom(1); },
});

// ───────────────────────────── ARTES ─────────────────────────────
// Hessa (V): heavy blows, Guard and piercing
card({
  id: 'scrapfall', name: 'Scrapfall', owner: 'V', category: 'arte', rank: 4, variant: 'A', rarity: 'starter', anim: 'melee', glyph: 'hammer',
  v: { d: [6, 8], b: [3, 4] }, text: 'Deal {d} + {b} per card in this combo.',
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.len),
});
card({
  id: 'scrap_feed', name: 'Scrap Feed', owner: 'V', category: 'arte', rank: 4, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'gear',
  v: { d: [9, 11], g: [4, 5] }, text: 'Deal {d} and gain {g} Guard. Gain 1 Churn charge.', tags: ['churn'],
  fx: (A) => { A.dmg(A.v('d')); A.guard(A.v('g')); A.churnGain(1); },
});
card({
  id: 'dead_drop', name: 'Dead Drop', owner: 'V', category: 'arte', rank: 4, variant: 'EX', rarity: 'uncommon', anim: 'guard', glyph: 'box',
  v: { g: [4, 5], p: [60, 90] }, text: 'Gain {g} Guard. On a Perfect or Cash Out: Echo the strongest card at {p}%.', tags: ['guard', 'cashout'],
  fx: (A) => { A.guard(A.v('g')); A.storeEcho(A.v('p') / 100); },
});
card({
  id: 'clean_exit', name: 'Clean Exit', owner: 'V', category: 'arte', rank: 4, variant: 'EX', rarity: 'uncommon', anim: 'buff', glyph: 'coin',
  v: { p: [40, 60] }, text: 'End this combo as a Cash Out with +{p}% payout. Recover 1 Churn charge.', tags: ['cashout'],
  fx: (A) => { A.ctxAdd('cashPct', A.v('p') / 100); A.churnGain(1); A.closeAsCashOut(); },
});
card({
  id: 'jam_breaker', name: 'Jam Breaker', owner: 'V', category: 'arte', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'chain',
  v: { d: [8, 10], b: [3, 4] }, text: 'Deal {d}, +{b} per interference endured this battle (max 5).', tags: ['interference'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.min(5, A.c.stats.interference)),
});
card({
  id: 'recycler', name: 'Recycler', owner: 'V', category: 'arte', rank: 5, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'gear',
  v: { d: [12, 15] }, text: 'Deal {d}. Gain 2 Churn charges.', tags: ['churn'],
  fx: (A) => { A.dmg(A.v('d')); A.churnGain(2); },
});
card({
  id: 'fortress_slam', name: 'Fortress Slam', owner: 'V', category: 'arte', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'shield',
  v: { d: [4, 7] }, text: 'Deal damage equal to your Guard + {d}. Keep your Guard.', tags: ['guard'],
  fx: (A) => A.dmg(Math.floor(A.c.guard) + A.v('d')),
});
card({
  id: 'bulwark_shift', name: 'Bulwark Shift', owner: 'V', category: 'arte', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'guard', glyph: 'shield',
  v: { p: [60, 85] }, text: "Gain Guard equal to {p}% of this combo's damage (min 6).", tags: ['guard'],
  fx: (A) => A.guard(Math.max(6, Math.floor((A.ctx.damage * A.v('p')) / 100))),
});
card({
  // Phase 8 technique (was an interim rank-5 arte that rewound itself)
  id: 'downshift', name: 'Downshift', owner: 'V', category: 'support', cost: 2, variant: 'EX', rarity: 'rare', anim: 'guard', glyph: 'hammer',
  v: { r: [4, 5], f: [1, 1.5] }, text: 'Technique: the combo\'s rank drops by {r} and its Flow gains {f}s (within the cap).', tags: ['ladder', 'flow'],
  tech: (v) => ({ rewind: v('r') }),
  fx: (A) => A.flow(A.v('f')),
});
card({
  id: 'sunderline', name: 'Sunderline', owner: 'V', category: 'arte', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'hammer',
  v: { d: [16, 20] }, text: 'Deal {d}. Pierces Guard.',
  fx: (A) => A.dmg(A.v('d'), { pierce: true }),
});
card({
  id: 'capstone', name: 'Capstone', owner: 'V', category: 'arte', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'hammer',
  v: { d: [12, 15] }, text: 'Deal {d}. Double damage if this combo has 2+ Steps.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d') * (A.ctx.steps >= 2 ? 2 : 1)),
});
card({
  id: 'final_notice', name: 'Final Notice', owner: 'V', category: 'arte', rank: 6, variant: 'B', rarity: 'rare', anim: 'melee', glyph: 'hammer',
  v: { d: [28, 36] }, text: 'Deal {d}. Pierces Guard.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d'), { pierce: true }),
});
card({
  id: 'junkstorm', name: 'Junkstorm', owner: 'V', category: 'arte', rank: 6, variant: 'A', rarity: 'rare', anim: 'melee', glyph: 'box',
  v: { d: [8, 10], p: [4, 5], m: [36, 45] }, text: 'Deal {d} +{p} per Churn used this battle (max +{m}) to ALL enemies.', tags: ['churn'],
  fx: (A) => A.dmg(A.v('d') + Math.min(A.v('m'), A.v('p') * A.c.stats.churns), { all: true }),
});
// Corvin (C): fire, area damage, Momentum and Echoes
card({
  id: 'thermal_lance', name: 'Thermal Lance', owner: 'C', category: 'arte', rank: 4, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame',
  v: { d: [8, 10], s: [3, 4] }, text: 'Deal {d}. Apply {s} Scorch.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d')); A.status('scorch', A.v('s')); },
});
card({
  id: 'coil_charge', name: 'Coil Charge', owner: 'C', category: 'arte', rank: 4, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'bolt',
  v: { d: [5, 7], m: [2, 3] }, text: 'Deal {d}. Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => { A.dmg(A.v('d')); A.mom(A.v('m')); },
});
card({
  id: 'kindling', name: 'Kindling', owner: 'C', category: 'arte', rank: 4, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame',
  v: { s: [4, 5] }, text: 'Apply {s} Scorch. If already Scorched, apply {s} more.', tags: ['interference'],
  fx: (A) => { const had = A.target && (A.target.st.scorch || 0) > 0; A.status('scorch', A.v('s') * (had ? 2 : 1)); },
});
card({
  id: 'overclock', name: 'Overclock', owner: 'C', category: 'arte', rank: 4, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'clock',
  v: { f: [1.0, 1.5], d: [8, 10] }, text: 'Gain {f}s Flow. Deal {d}.', tags: ['flow'],
  fx: (A) => { A.flow(A.v('f')); A.dmg(A.v('d')); },
});
card({
  id: 'overture', name: 'Overture', owner: 'C', category: 'arte', rank: 4, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'star',
  v: { d: [6, 8] }, text: 'Deal {d} to ALL. Gain 1 Momentum per hero in the party.', tags: ['momentum'],
  fx: (A) => { A.dmg(A.v('d'), { all: true }); A.mom(A.c.party.length); },
});
card({
  // Phase 8 technique (was an interim rank-4 arte that rewound itself)
  id: 'rethread', name: 'Rethread', owner: 'C', category: 'support', cost: 1, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'spiral',
  v: { r: [2, 3] }, text: 'Technique: the combo\'s rank drops by {r}, so another arte comes within reach.', tags: ['ladder'],
  tech: (v) => ({ rewind: v('r') }),
  fx: () => {},
});
card({
  id: 'feedback_loop', name: 'Feedback Loop', owner: 'C', category: 'arte', rank: 5, variant: 'EX', rarity: 'uncommon', anim: 'cast', glyph: 'spiral',
  v: { p: [90, 120] }, text: 'Echo the previous card at {p}%.', tags: ['relay'],
  fx: (A) => A.echoPrev(A.v('p') / 100),
});
card({
  id: 'detonate', name: 'Detonate', owner: 'C', category: 'arte', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'flame',
  v: { p: [3, 4] }, text: 'Consume all Scorch on enemies: deal {p}× the stacks to each.', tags: ['interference'],
  fx: (A) => A.detonateScorch(A.v('p')),
});
card({
  // Phase 8 technique (was an interim rank-5 arte that set the suit and rewound itself)
  id: 'prism_cut', name: 'Prism Cut', owner: 'C', category: 'support', cost: 1, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'prism',
  v: { r: [1, 2] }, text: 'Technique: the combo\'s suit becomes EX and its rank drops by {r}: the next A or B card Crosses.', tags: ['variant'],
  tech: (v) => ({ rewind: v('r'), suit: 'EX' }),
  fx: () => {},
});
card({
  id: 'last_word', name: 'Last Word', owner: 'C', category: 'arte', rank: 6, variant: 'EX', rarity: 'uncommon', anim: 'cast', glyph: 'star',
  v: { d: [6, 8], p: [40, 55] }, text: "Deal {d} + {p}% of this combo's damage to ALL enemies.",
  fx: (A) => A.dmg(A.v('d') + Math.floor((A.ctx.damage * A.v('p')) / 100), { all: true }),
});
card({
  id: 'overpressure', name: 'Overpressure', owner: 'C', category: 'arte', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'flame',
  v: { d: [5, 6] }, text: 'Spend all remaining Momentum: deal {d} per point (at least 10).', tags: ['momentum'],
  fx: (A) => { const n = A.spendMomentum(); A.dmg(Math.max(10, A.v('d') * n)); },
});
card({
  id: 'suit_storm', name: 'Suit Storm', owner: 'C', category: 'arte', rank: 6, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'prism',
  v: { d: [6, 8] }, text: 'Deal {d} to ALL per distinct suit played this combo (A, B, EX).', tags: ['variant'],
  fx: (A) => A.dmg(A.v('d') * A.ctx.suits.length, { all: true }),
});
card({
  id: 'echo_chamber', name: 'Echo Chamber', owner: 'C', category: 'arte', rank: 6, variant: 'A', rarity: 'rare', anim: 'cast', glyph: 'spiral',
  v: { p: [80, 100] }, text: 'Echo the two strongest cards this combo at {p}%.', tags: ['relay'],
  fx: (A) => { A.strongestIdx(2).forEach((i) => A.echo(i, A.v('p') / 100)); },
});
// Pin (S): multi-hits, Steps and Crosses, precision
card({
  id: 'bolt_volley', name: 'Bolt Volley', owner: 'S', category: 'arte', rank: 4, variant: 'B', rarity: 'starter', anim: 'shoot', glyph: 'arrow',
  v: { d: [4, 5] }, text: 'Deal {d} once per card in this combo.',
  fx: (A) => A.dmg(A.v('d'), { hits: A.ctx.len }),
});
card({
  id: 'splitter', name: 'Splitter', owner: 'S', category: 'arte', rank: 4, variant: 'B', rarity: 'common', anim: 'shoot', glyph: 'arrow',
  v: { d: [5, 6] }, text: 'Deal {d} to the target and {d} to a random enemy.',
  fx: (A) => { A.dmg(A.v('d')); A.dmg(A.v('d'), { rand: true }); },
});
card({
  id: 'slipstream', name: 'Slipstream', owner: 'S', category: 'arte', rank: 4, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'wave',
  v: { d: [5, 7] }, text: 'Deal {d} twice. This card refunds double Flow.', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d'), { hits: 2 }); A.extraRefund(); },
});
card({
  id: 'short_circuit', name: 'Short Circuit', owner: 'S', category: 'arte', rank: 4, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'bolt',
  v: { d: [6, 8], b: [6, 9] }, text: 'Deal {d}. Unlock a hand card; if you did, deal {b} more.', tags: ['interference'],
  fx: (A) => { const u = A.unlockOne(); A.dmg(A.v('d') + (u ? A.v('b') : 0)); },
});
card({
  id: 'payday', name: 'Payday', owner: 'S', category: 'arte', rank: 4, variant: 'B', rarity: 'uncommon', anim: 'shoot', glyph: 'coin',
  v: { d: [4, 6], p: [50, 70] }, text: 'Deal {d}. Then trigger a Cash Out payout at {p}%.', tags: ['cashout'],
  fx: (A) => { A.dmg(A.v('d')); A.payout(A.v('p') / 100); },
});
card({
  id: 'deadeye_set', name: 'Deadeye Set', owner: 'S', category: 'arte', rank: 4, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'eye',
  v: { d: [6, 8] }, text: 'Deal {d}. Mark the target: its next arte hit deals +50%.', tags: ['ladder'],
  fx: (A) => { A.dmg(A.v('d')); A.status('mark', 1); },
});
card({
  id: 'crosscut', name: 'Crosscut', owner: 'S', category: 'arte', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'shoot', glyph: 'prism',
  v: { d: [8, 10], b: [6, 8] }, text: 'Deal {d} + {b} per Cross this combo.', tags: ['variant'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.crosses),
});
card({
  id: 'momentum_lance', name: 'Momentum Lance', owner: 'S', category: 'arte', rank: 5, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'arrow',
  v: { d: [10, 13] }, text: 'Deal {d}. If you still have 3+ Momentum, deal {d} more.', tags: ['momentum'],
  fx: (A) => A.dmg(A.v('d') * (A.c.available() >= 3 ? 2 : 1)),
});
card({
  id: 'timekeeper', name: 'Timekeeper', owner: 'S', category: 'arte', rank: 5, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'clock',
  v: { d: [6, 8], b: [5, 6] }, text: 'Deal {d} + {b} per full second of Flow remaining.', tags: ['flow'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.floor(A.flowLeft())),
});
card({
  id: 'cache_release', name: 'Cache Release', owner: 'S', category: 'arte', rank: 5, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'box',
  v: { d: [7, 9], b: [7, 9] }, text: 'Deal {d} + {b} per card in Reserve.', tags: ['reserve'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.c.reserve.length),
});
card({
  id: 'breach_payload', name: 'Breach Payload', owner: 'S', category: 'arte', rank: 5, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'chain',
  v: { d: [8, 10], b: [6, 7] }, text: 'Deal {d} + {b} per interference endured this battle (max 6).', tags: ['interference'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.min(6, A.c.stats.interference)),
});
card({
  id: 'ladder_peak', name: 'Ladder Peak', owner: 'S', category: 'arte', rank: 6, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'ladder',
  v: { d: [12, 16], b: [5, 6] }, text: 'Deal {d} + {b} per Step this combo.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.steps),
});

// ───────────────────────────── SUPPORT ─────────────────────────────
// Hessa: Guard and Cover (her Guard cards also make her cover the party, engine/combat.js)
card({
  id: 'salvage', name: 'Salvage', owner: 'V', category: 'support', variant: 'B', rarity: 'starter', anim: 'guard', glyph: 'box',
  v: { g: [5, 7] }, text: 'Gain {g} Guard. Recover 1 Churn charge.', tags: ['guard', 'churn'],
  fx: (A) => { A.guard(A.v('g')); A.churnGain(1); },
});
card({
  id: 'brace_up', name: 'Brace Up', owner: 'V', category: 'support', cost: 1, variant: 'A', rarity: 'common', anim: 'guard', glyph: 'shield',
  v: { g: [7, 9], k: [3, 5] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'riposte_frame', name: 'Riposte Frame', owner: 'V', category: 'support', cost: 1, variant: 'A', rarity: 'uncommon', anim: 'guard', glyph: 'shield',
  v: { g: [6, 8], k: [7, 10] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'counterweight', name: 'Counterweight', owner: 'V', category: 'support', cost: 2, variant: 'A', rarity: 'common', anim: 'guard', glyph: 'shield',
  v: { g: [14, 17], k: [6, 8] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'vault_guard', name: 'Vault Guard', owner: 'V', category: 'support', cost: 1, variant: 'B', rarity: 'uncommon', anim: 'guard', glyph: 'box',
  v: { g: [4, 5] }, text: 'Gain {g} Guard, +{g} per card in Reserve.', tags: ['reserve', 'guard'],
  fx: (A) => A.guard(A.v('g') * (1 + A.c.reserve.length)),
});
card({
  id: 'iron_oath', name: 'Iron Oath', owner: 'V', category: 'support', cost: 2, variant: 'EX', rarity: 'rare', anim: 'guard', glyph: 'shield',
  v: { g: [12, 16] }, text: 'Gain {g} Guard. Guard stops decaying for 8s.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.holdGuard(8); },
});
// Corvin: healing, Momentum, debuffs
card({
  id: 'mend_circuit', name: 'Mend Circuit', owner: 'C', category: 'support', cost: 2, variant: 'B', rarity: 'common', anim: 'cast', glyph: 'wave',
  v: { h: [14, 20] }, text: 'Heal the party {h}.', tags: ['guard'],
  fx: (A) => A.heal(A.v('h'), 'all'),
});
card({
  id: 'ward_weave', name: 'Ward Weave', owner: 'C', category: 'support', cost: 1, variant: 'B', rarity: 'common', anim: 'guard', glyph: 'shield',
  v: { g: [7, 9] }, text: 'Gain {g} Guard.', tags: ['guard'],
  fx: (A) => A.guard(A.v('g')),
});
card({
  id: 'low_gear', name: 'Low Gear', owner: 'C', category: 'support', variant: 'B', rarity: 'common', anim: 'buff', glyph: 'gear',
  v: { m: [2, 3] }, text: 'Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => A.mom(A.v('m')),
});
card({
  id: 'signal_boost', name: 'Signal Boost', owner: 'C', category: 'support', cost: 1, variant: 'B', rarity: 'common', anim: 'cast', glyph: 'wave',
  v: { s: [5, 7] }, text: 'Apply {s}s Exposed to ALL enemies.', tags: ['interference'],
  fx: (A) => A.status('exposed', A.v('s'), { all: true }),
});
// Pin: hand management
card({
  id: 'shuffle_step', name: 'Shuffle Step', owner: 'S', category: 'support', variant: 'A', rarity: 'uncommon', anim: 'buff', glyph: 'spiral',
  v: {}, text: 'Replace every hand card you cannot play right now, for free.', tags: ['churn'],
  fx: (A) => A.recycleIllegal(),
});
// neutral
card({
  id: 'hold_the_line', name: 'Hold the Line', owner: null, category: 'support', cost: 1, variant: 'EX', rarity: 'common', anim: 'guard', glyph: 'shield', targetHero: true,
  v: { s: [6, 9] }, text: 'Brace a hero you pick: +20% Defense for {s}s.', tags: ['guard'],
  fx: (A) => A.brace(A.v('s')),
});
card({
  id: 'spare_parts', name: 'Spare Parts', owner: null, category: 'support', variant: 'EX', rarity: 'common', anim: 'buff', glyph: 'gear',
  v: { n: [2, 3], g: [5, 7] }, text: 'Recover {n} Churn charges and gain {g} Guard.', tags: ['churn'],
  fx: (A) => { A.churnGain(A.v('n')); A.guard(A.v('g')); },
});

// ─────────────── RELAY CARDS (withheld in Phase 4, restored in Phase 5 with the Relay command) ───────────────
// A Relay is the explicit hand-off command (docs/COMBAT_SPEC.md §9). "Relay cards" (Chorus Break) are
// the incoming hero's first cards after each Relay; "allies who joined" are the chain's heroes.
card({
  id: 'mirror_wire', name: 'Mirror Wire', owner: 'C', category: 'arte', rank: 4, variant: 'EX', rarity: 'uncommon', anim: 'cast', glyph: 'spiral',
  v: { d: [3, 4], p: [50, 75] }, text: 'Deal {d}. The first Relay this combo Echoes the last attack {p}%.', tags: ['relay'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxSet('relayEcho', A.v('p') / 100); },
});
card({
  id: 'hand_off', name: 'Hand Off', category: 'basic', rank: 2, variant: 'EX', rarity: 'common', anim: 'buff', glyph: 'hook',
  v: { p: [40, 60] }, text: 'Gain 1 Momentum. If a Relay follows, it Echoes the last attack at {p}%.', tags: ['relay'],
  fx: (A) => { A.mom(1); A.ctxSet('nextRelayEcho', A.v('p') / 100); },
});
card({
  id: 'relay_baton', name: 'Relay Baton', owner: 'S', category: 'arte', rank: 5, variant: 'B', rarity: 'rare', anim: 'buff', glyph: 'hook',
  v: { d: [8, 10], f: [0.2, 0.3] }, text: 'Deal {d}. For each hero who joined this combo: +1 Momentum and +{f}s Flow.', tags: ['flow', 'relay'],
  fx: (A) => { A.dmg(A.v('d')); const n = A.ctx.owners.length; A.mom(n); A.flow(n * A.v('f')); },
});
card({
  id: 'chorus_break', name: 'Chorus Break', owner: 'C', category: 'arte', rank: 6, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'wave',
  v: { p: [50, 70], d: [4, 6] }, text: 'Deal {d}. Echo each first card after a Relay this combo at {p}%.', tags: ['relay'],
  fx: (A) => { A.dmg(A.v('d')); A.ctx.cards.forEach((e, i) => { if (e.relay && i < A.ctx.cards.length - 1) A.echo(i, A.v('p') / 100); }); },
});
card({
  id: 'grand_relay', name: 'Grand Relay', owner: 'S', category: 'arte', rank: 6, variant: 'EX', rarity: 'rare', anim: 'shoot', glyph: 'star',
  v: { d: [10, 13] }, text: 'Deal {d} per hero who joined this combo. All three: hits ALL enemies.', tags: ['relay'],
  fx: (A) => { const n = A.ctx.owners.length; A.dmg(A.v('d') * n, { all: n >= 3 }); },
});
// still withheld: not a Relay card; repeats Overpressure at a lower value (Phase 8 redesign)
card({
  // Phase 8 redesign (was withheld: "spend all Momentum, {d} per point" repeated Overpressure at a lower
  // value). Overpressure is the all-in finisher; Pressure Valve is the measured one: it vents a capped
  // amount, half of it as Guard, and leaves the rest for the next arte of a long combo.
  id: 'pressure_valve', name: 'Pressure Valve', owner: 'C', category: 'arte', rank: 5, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'flame', migrate: 'overpressure',
  v: { d: [6, 7], n: [3, 4], g: [3, 3] }, text: 'Deal {d}. Then vent up to {n} more Momentum: +{d} damage and {g} Guard per point vented. Momentum above {n} stays.', tags: ['momentum', 'guard'],
  fx: (A) => { const n = A.spendMomentum(A.v('n')); A.dmg(A.v('d') * (1 + n)); if (n > 0) A.guard(A.v('g') * n); },
});

// ─────────────────────────── STATUS / JUNK ───────────────────────────
card({
  id: 'glitch', name: 'Glitch', owner: null, category: 'junk', rank: 0, variant: 'EX', rarity: 'status', anim: 'buff', glyph: 'glitch',
  v: {}, text: 'Unplayable corruption. Churn it for free; it is deleted.', temp: true,
  fx: () => {},
});

export const CARDS = Object.fromEntries(C.map((c) => [c.id, c]));
export const CARD_LIST = C;
export const isOffensive = (def) => def.category === 'basic' || def.category === 'arte';
// A card's rank after Grease Monkey / Save Point re-gauging stays inside its category (Phase 8): basic
// attacks Weak 1 to Strong 3, artes 4 to 6. (Enemy Scramble may still shift it for a few seconds.)
export const RANK_RANGE = { basic: [1, 3], arte: [4, 6] };
export function gaugedRank(def, rankMod = 0) {
  const r = RANK_RANGE[def.category];
  if (!r) return 0;
  return Math.max(r[0], Math.min(r[1], def.rank + (rankMod || 0)));
}
// Grafts that need damage, a Relay or a place in the combo only fit attacks (support has none of them).
const ATTACK_GRAFTS = new Set(['keen', 'breaker', 'echoing', 'ledger']);
export function graftFits(g, def) {
  if (!def || def.category === 'junk' || def.category === 'status') return false;
  return !ATTACK_GRAFTS.has(g) || isOffensive(def);
}

// Starter deck (docs/COMBAT_SPEC.md §18.1, prototype): 3 Weak, 3 Medium, 2 Strong with mixed suits,
// one rank-4 arte per hero, Corvin's heal and Hessa's Guard/Cover support.
export const STARTER_DECK = [
  { id: 'scrapline', variant: 'A' }, { id: 'scrapline', variant: 'B' }, { id: 'scrapline', variant: 'A' },
  { id: 'rivet_jab', variant: 'A' }, { id: 'rivet_jab', variant: 'B' }, { id: 'hotwire', variant: 'B' },
  { id: 'piston_strike', variant: 'A' }, { id: 'piston_strike', variant: 'B' },
  { id: 'scrapfall' }, { id: 'thermal_lance' }, { id: 'bolt_volley' },
  { id: 'mend_circuit' }, { id: 'salvage' },
];

// Cards that rewards, shops and events may offer: converted, non-starter, non-status.
export function rewardPool() {
  return C.filter((c) => c.p4 === 'converted' && c.rarity !== 'starter' && c.rarity !== 'status');
}

// Save version 5 card migration (docs/COMBAT_SPEC.md §19): withheld cards become a converted card of the
// same hero and rarity; unknown ids become a Medium basic attack.
// The table is the one Phase 4 shipped and stays fixed: a version-3 or version-4 save converts exactly
// as it did in 0.2.4, including the Relay cards Phase 5 has since restored.
export const MIGRATE_CARDS = {
  mirror_wire: 'feedback_loop', hand_off: 'hotwire', relay_baton: 'deadeye_set',
  chorus_break: 'feedback_loop', grand_relay: 'ladder_peak', pressure_valve: 'overpressure',
};
export const UNKNOWN_CARD_FALLBACK = 'rivet_jab';

export function cardValue(def, up, key) {
  const pair = def.v[key];
  if (!pair) return 0;
  return up ? pair[1] : pair[0];
}

// Grafts: surgical alterations attached to a single card instance.
export const GRAFTS = {
  spark: { name: 'Spark', text: '+1 Momentum when played.', tag: 'momentum' },
  quick: { name: 'Quick', text: '+0.5s Flow when played.', tag: 'flow' },
  plated: { name: 'Plated', text: '+3 Guard when played.', tag: 'guard' },
  echoing: { name: 'Echoing', text: 'As the first card after a Relay, Echoes itself at 30%.', tag: 'relay' },
  keen: { name: 'Keen', text: '+3 damage to its first hit.', tag: 'ladder' },
  cached: { name: 'Cached', text: '+50% power when played from Reserve.', tag: 'reserve' },
  churnfed: { name: 'Churnfed', text: 'When Churned: +1 Momentum and +2 Guard.', tag: 'churn' },
  breaker: { name: 'Breaker', text: 'Its damage pierces Guard.', tag: 'guard' },
  anchored: { name: 'Anchored', text: 'Cannot be Locked or Scrambled.', tag: 'interference' },
  ledger: { name: 'Ledger', text: 'Cash Out payout +3 if this card is in the combo.', tag: 'cashout' },
};
// Grafts that rewards, events and surgery may offer.
export const graftPool = () => Object.keys(GRAFTS).filter((g) => GRAFTS[g].p4 !== 'withheld');
