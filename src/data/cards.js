// SIGNAL//BREAK card library.
// owner: V = Hessa (Vanguard), C = Corvin (Channeler), S = Pin (Striker)
// role: open | conv | close.  variant: A | B | EX.  rank 1-9.
// v: numeric values [base, upgraded]; text uses {key} placeholders that render those values.
// fx(A): effect script run by the combat engine. A is the card API (see engine/combat.js makeApi).

export const ROLE_NAMES = { open: 'Opener', conv: 'Converter', close: 'Closer', junk: 'Glitch' };
export const OWNER_NAMES = { V: 'Hessa', C: 'Corvin', S: 'Pin' };

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
  C.push(def);
}

// ───────────────────────────── OPENERS ─────────────────────────────
card({
  id: 'scrapline', name: 'Scrapline', owner: 'S', role: 'open', rank: 1, variant: 'A', rarity: 'starter', anim: 'shoot', glyph: 'arrow',
  v: { d: [5, 7] }, text: 'Deal {d}.', tags: [],
  fx: (A) => A.dmg(A.v('d')),
});
card({
  id: 'hotwire', name: 'Hotwire', owner: 'C', role: 'open', rank: 2, variant: 'B', rarity: 'starter', anim: 'cast', glyph: 'bolt',
  v: { d: [3, 4], m: [1, 2] }, text: 'Deal {d}. Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => { A.dmg(A.v('d')); A.mom(A.v('m')); },
});
card({
  id: 'salvage', name: 'Salvage', owner: 'V', role: 'open', rank: 1, variant: 'B', rarity: 'starter', anim: 'guard', glyph: 'box',
  v: { g: [5, 7] }, text: 'Gain {g} Guard. Recover 1 Churn charge.', tags: ['guard', 'churn'],
  fx: (A) => { A.guard(A.v('g')); A.churnGain(1); },
});
card({
  id: 'rivet_jab', name: 'Rivet Jab', owner: 'V', role: 'open', rank: 2, variant: 'A', rarity: 'starter', anim: 'melee', glyph: 'hammer',
  v: { d: [6, 8] }, text: 'Deal {d}.', tags: [],
  fx: (A) => A.dmg(A.v('d')),
});
card({
  id: 'spark_primer', name: 'Spark Primer', owner: 'C', role: 'open', rank: 1, variant: 'EX', rarity: 'common', anim: 'cast', glyph: 'star',
  v: { d: [2, 3], b: [4, 6] }, text: 'Deal {d}. The next card this combo deals +{b}.', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d')); A.nextBonus(A.v('b')); },
});
card({
  id: 'pinprick', name: 'Pinprick', owner: 'S', role: 'open', rank: 1, variant: 'A', rarity: 'common', anim: 'shoot', glyph: 'arrow',
  v: { d: [3, 4] }, text: 'Deal {d} twice.', tags: [],
  fx: (A) => A.dmg(A.v('d'), { hits: 2 }),
});
card({
  id: 'brace_up', name: 'Brace Up', owner: 'V', role: 'open', rank: 3, variant: 'A', rarity: 'common', anim: 'guard', glyph: 'shield',
  v: { g: [7, 9], k: [3, 5] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'low_gear', name: 'Low Gear', owner: 'C', role: 'open', rank: 1, variant: 'B', rarity: 'common', anim: 'buff', glyph: 'gear',
  v: { m: [2, 3] }, text: 'Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => A.mom(A.v('m')),
});
card({
  id: 'first_rung', name: 'First Rung', owner: 'S', role: 'open', rank: 1, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'ladder',
  v: { d: [3, 4], b: [2, 3] }, text: 'Deal {d}. This combo, every Step deals +{b} bonus damage.', tags: ['ladder'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('stepBonus', A.v('b')); },
});
card({
  id: 'tinder_toss', name: 'Tinder Toss', owner: 'C', role: 'open', rank: 2, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame',
  v: { s: [3, 5] }, text: 'Apply {s} Scorch.', tags: ['interference'],
  fx: (A) => A.status('scorch', A.v('s')),
});
card({
  id: 'gauge_read', name: 'Gauge Read', owner: 'S', role: 'open', rank: 2, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'eye',
  v: { d: [3, 5] }, text: 'Deal {d}. If Reserve holds a card: +1 Momentum and +0.3s Flow.', tags: ['reserve'],
  fx: (A) => { A.dmg(A.v('d')); if (A.c.reserve.length > 0) { A.mom(1); A.flow(0.3); } },
});
card({
  id: 'quickdraw', name: 'Quickdraw', owner: 'S', role: 'open', rank: 3, variant: 'B', rarity: 'common', anim: 'shoot', glyph: 'clock',
  v: { d: [5, 7] }, text: 'Deal {d}. Continuations this combo refund +0.06s more (refund cap still applies).', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxAdd('refundBonus', 0.06); },
});
card({
  id: 'shield_bash', name: 'Shield Bash', owner: 'V', role: 'open', rank: 3, variant: 'B', rarity: 'common', anim: 'melee', glyph: 'shield',
  v: { d: [4, 6] }, text: 'Deal damage equal to half your Guard (min {d}).', tags: ['guard'],
  fx: (A) => A.dmg(Math.max(A.v('d'), Math.floor(A.c.guard / 2))),
});
card({
  id: 'junk_toss', name: 'Junk Toss', owner: 'V', role: 'open', rank: 2, variant: 'B', rarity: 'common', anim: 'melee', glyph: 'box',
  v: { d: [4, 5] }, text: 'Deal {d}, +2 per Churn used this battle (max +10).', tags: ['churn'],
  fx: (A) => A.dmg(A.v('d') + Math.min(10, 2 * A.c.stats.churns)),
});
card({
  id: 'fault_finder', name: 'Fault Finder', owner: 'S', role: 'open', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'eye',
  v: { d: [3, 4], b: [6, 9] }, text: 'Deal {d}. Apply 4s Exposed. +{b} damage if a hand card is Locked or Scrambled.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d') + (A.disruptedCount() > 0 ? A.v('b') : 0)); A.status('exposed', 4); },
});
card({
  id: 'mirror_wire', name: 'Mirror Wire', owner: 'C', role: 'open', rank: 3, variant: 'EX', rarity: 'uncommon', anim: 'cast', glyph: 'spiral',
  v: { d: [3, 4], p: [50, 75] }, text: 'Deal {d}. The first Relay this combo Echoes the previous card at {p}%.', tags: ['relay'],
  fx: (A) => { A.dmg(A.v('d')); A.ctxSet('relayEcho', A.v('p') / 100); },
});
card({
  id: 'open_ledger', name: 'Open Ledger', owner: 'V', role: 'open', rank: 1, variant: 'A', rarity: 'uncommon', anim: 'guard', glyph: 'coin',
  v: { g: [3, 5], p: [50, 75] }, text: 'Gain {g} Guard. If this combo Cashes Out, payout +{p}%.', tags: ['cashout'],
  fx: (A) => { A.guard(A.v('g')); A.ctxAdd('cashPct', A.v('p') / 100); },
});
card({
  id: 'polarity_shift', name: 'Polarity Shift', owner: 'C', role: 'open', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'wave',
  v: { d: [3, 5] }, text: "Deal {d}. The combo's suit becomes B.", tags: ['variant'],
  fx: (A) => { A.dmg(A.v('d')); A.setVariant('B'); },
});
card({
  id: 'overture', name: 'Overture', owner: 'C', role: 'open', rank: 4, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'star',
  v: { d: [5, 7] }, text: 'Deal {d} to ALL. Gain 1 Momentum per standing ally.', tags: ['momentum', 'relay'],
  fx: (A) => { A.dmg(A.v('d'), { all: true }); A.mom(A.c.party.filter((p) => !p.ko).length); },
});
card({
  id: 'deadeye_set', name: 'Deadeye Set', owner: 'S', role: 'open', rank: 4, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'eye',
  v: { d: [4, 6] }, text: 'Deal {d}. Mark the target: its next Closer hit deals +50%.', tags: ['ladder'],
  fx: (A) => { A.dmg(A.v('d')); A.status('mark', 1); },
});
card({
  id: 'iron_oath', name: 'Iron Oath', owner: 'V', role: 'open', rank: 2, variant: 'EX', rarity: 'rare', anim: 'guard', glyph: 'shield',
  v: { g: [10, 14] }, text: 'Gain {g} Guard. Guard stops decaying for 8s.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.holdGuard(8); },
});
card({
  id: 'static_bloom', name: 'Static Bloom', owner: 'C', role: 'open', rank: 1, variant: 'B', rarity: 'rare', anim: 'cast', glyph: 'bolt',
  v: { d: [2, 3] }, text: 'Deal {d} to ALL. Unlock every Locked hand card; +1 Momentum for each.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d'), { all: true }); const n = A.unlockAll(); A.mom(n); },
});
card({
  id: 'cold_start', name: 'Cold Start', owner: 'V', role: 'open', rank: 1, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'hammer',
  v: { d: [4, 5], m: [2, 3] }, text: 'Deal {d}. If you have 0 Momentum, gain {m}.', tags: ['momentum'],
  fx: (A) => { const zero = A.c.momentum === 0; A.dmg(A.v('d')); if (zero) A.mom(A.v('m')); },
});
card({
  id: 'tripwire', name: 'Tripwire', owner: 'S', role: 'open', rank: 3, variant: 'A', rarity: 'common', anim: 'shoot', glyph: 'hook',
  v: { d: [4, 6] }, text: 'Deal {d}. Apply 4s Weak (target deals -25%).', tags: ['guard'],
  fx: (A) => { A.dmg(A.v('d')); A.status('weak', 4); },
});
card({
  id: 'hidden_ace', name: 'Hidden Ace', owner: 'S', role: 'open', rank: 1, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'star',
  v: { d: [4, 5] }, text: 'Deal {d}. From Reserve: deal triple and +1 Momentum.', tags: ['reserve'],
  fx: (A) => { if (A.fromReserve) { A.dmg(A.v('d') * 3); A.mom(1); } else A.dmg(A.v('d')); },
});

// ──────────────────────────── CONVERTERS ────────────────────────────
card({
  id: 'rethread', name: 'Rethread', owner: 'C', role: 'conv', rank: 3, variant: 'A', rarity: 'starter', anim: 'cast', glyph: 'spiral',
  v: { d: [3, 5] }, text: 'Deal {d}. Rewind 2 (combo rank -2).', tags: ['ladder'],
  fx: (A) => { A.dmg(A.v('d')); A.rewind(2); },
});
card({
  id: 'splitter', name: 'Splitter', owner: 'S', role: 'conv', rank: 4, variant: 'B', rarity: 'starter', anim: 'shoot', glyph: 'arrow',
  v: { d: [3, 4] }, text: 'Deal {d} to target and {d} to a random enemy. Relay: +1 Momentum.', tags: ['relay'],
  fx: (A) => { A.dmg(A.v('d')); A.dmg(A.v('d'), { rand: true }); if (A.relay) A.mom(1); },
});
card({
  id: 'dead_drop', name: 'Dead Drop', owner: 'V', role: 'conv', rank: 3, variant: 'EX', rarity: 'starter', anim: 'guard', glyph: 'box',
  v: { g: [3, 4], p: [60, 90] }, text: 'Gain {g} Guard. Store: when this combo Closes or Cashes Out, Echo its strongest card at {p}%.', tags: ['relay', 'cashout'],
  fx: (A) => { A.guard(A.v('g')); A.storeEcho(A.v('p') / 100); },
});
card({
  id: 'gear_swap', name: 'Gear Swap', owner: 'V', role: 'conv', rank: 3, variant: 'B', rarity: 'starter', anim: 'melee', glyph: 'gear',
  v: { d: [4, 6] }, text: "Deal {d}. Flip the combo's suit (A↔B).", tags: ['variant'],
  fx: (A) => { A.dmg(A.v('d')); A.flipVariant(); },
});
card({
  id: 'step_up', name: 'Step Up', owner: 'S', role: 'conv', rank: 2, variant: 'A', rarity: 'starter', anim: 'shoot', glyph: 'ladder',
  v: { d: [3, 4], b: [3, 4] }, text: 'Deal {d}. As a Step: +{b} damage and +1 Momentum.', tags: ['ladder'],
  fx: (A) => { const st = A.kind === 'step'; A.dmg(A.v('d') + (st ? A.v('b') : 0)); if (st) A.mom(1); },
});
card({
  id: 'coil_charge', name: 'Coil Charge', owner: 'C', role: 'conv', rank: 4, variant: 'A', rarity: 'starter', anim: 'cast', glyph: 'bolt',
  v: { m: [1, 2], d: [2, 4] }, text: 'Deal {d}. Gain {m} Momentum.', tags: ['momentum'],
  fx: (A) => { A.dmg(A.v('d')); A.mom(A.v('m')); },
});
card({
  id: 'ward_weave', name: 'Ward Weave', owner: 'C', role: 'conv', rank: 4, variant: 'B', rarity: 'common', anim: 'guard', glyph: 'shield',
  v: { g: [5, 7], r: [3, 4] }, text: 'Gain {g} Guard. Relay: +{r} more.', tags: ['guard', 'relay'],
  fx: (A) => A.guard(A.v('g') + (A.relay ? A.v('r') : 0)),
});
card({
  id: 'riposte_frame', name: 'Riposte Frame', owner: 'V', role: 'conv', rank: 5, variant: 'A', rarity: 'uncommon', anim: 'guard', glyph: 'shield',
  v: { g: [5, 7], k: [5, 8] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'feedback_loop', name: 'Feedback Loop', owner: 'C', role: 'conv', rank: 5, variant: 'EX', rarity: 'uncommon', anim: 'cast', glyph: 'spiral',
  v: { p: [75, 100] }, text: 'Echo the previous card at {p}%.', tags: ['relay'],
  fx: (A) => A.echoPrev(A.v('p') / 100),
});
card({
  id: 'hand_off', name: 'Hand Off', owner: 'S', role: 'conv', rank: 2, variant: 'EX', rarity: 'common', anim: 'buff', glyph: 'hook',
  v: { p: [40, 60] }, text: 'Gain 1 Momentum. If the next card is a Relay, it Echoes at {p}%.', tags: ['relay'],
  fx: (A) => { A.mom(1); A.ctxSet('nextRelayEcho', A.v('p') / 100); },
});
card({
  id: 'overclock', name: 'Overclock', owner: 'C', role: 'conv', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'clock',
  v: { f: [0.5, 0.7], d: [2, 3] }, text: 'Gain {f}s Flow. Deal {d}.', tags: ['flow'],
  fx: (A) => { A.flow(A.v('f')); A.dmg(A.v('d')); },
});
card({
  id: 'slipstream', name: 'Slipstream', owner: 'S', role: 'conv', rank: 4, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'wave',
  v: { d: [2, 3] }, text: 'Deal {d} twice. This card refunds double Flow.', tags: ['flow'],
  fx: (A) => { A.dmg(A.v('d'), { hits: 2 }); A.extraRefund(); },
});
card({
  id: 'scrap_feed', name: 'Scrap Feed', owner: 'V', role: 'conv', rank: 4, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'gear',
  v: { d: [4, 6] }, text: 'Deal {d}. Gain 1 Churn charge.', tags: ['churn'],
  fx: (A) => { A.dmg(A.v('d')); A.churnGain(1); },
});
card({
  id: 'shuffle_step', name: 'Shuffle Step', owner: 'S', role: 'conv', rank: 5, variant: 'A', rarity: 'uncommon', anim: 'buff', glyph: 'spiral',
  v: { d: [2, 3] }, text: 'Replace every unplayable hand card for free. Deal {d} per card replaced.', tags: ['churn'],
  fx: (A) => { const n = A.recycleIllegal(); if (n > 0) A.dmg(A.v('d') * n); },
});
card({
  id: 'pocket_watch', name: 'Pocket Watch', owner: 'S', role: 'conv', rank: 3, variant: 'B', rarity: 'uncommon', anim: 'buff', glyph: 'clock',
  v: { d: [3, 5] }, text: 'Deal {d}. Stash the highest-rank Closer in hand into Reserve.', tags: ['reserve'],
  fx: (A) => { A.dmg(A.v('d')); A.stashBestCloser(); },
});
card({
  id: 'bulwark_shift', name: 'Bulwark Shift', owner: 'V', role: 'conv', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'guard', glyph: 'shield',
  v: { p: [50, 75] }, text: "Gain Guard equal to {p}% of this combo's damage (min 4).", tags: ['guard'],
  fx: (A) => A.guard(Math.max(4, Math.floor((A.ctx.damage * A.v('p')) / 100))),
});
card({
  id: 'pressure_valve', name: 'Pressure Valve', owner: 'C', role: 'conv', rank: 6, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'flame',
  v: { d: [3, 4] }, text: 'Spend all Momentum: deal {d} per point.', tags: ['momentum'],
  fx: (A) => { const n = A.spendMomentum(); if (n > 0) A.dmg(A.v('d') * n); },
});
card({
  id: 'prism_cut', name: 'Prism Cut', owner: 'C', role: 'conv', rank: 5, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'prism',
  v: { d: [4, 6] }, text: 'Deal {d}. The combo becomes EX (any suit may follow). Rewind 1.', tags: ['variant'],
  fx: (A) => { A.dmg(A.v('d')); A.setVariant('EX'); A.rewind(1); },
});
card({
  id: 'short_circuit', name: 'Short Circuit', owner: 'S', role: 'conv', rank: 4, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'bolt',
  v: { d: [4, 5], b: [6, 9] }, text: 'Deal {d}. Unlock a hand card; if you did, deal {b} more.', tags: ['interference'],
  fx: (A) => { const u = A.unlockOne(); A.dmg(A.v('d') + (u ? A.v('b') : 0)); },
});
card({
  id: 'tally_mark', name: 'Tally Mark', owner: 'V', role: 'conv', rank: 2, variant: 'A', rarity: 'uncommon', anim: 'buff', glyph: 'coin',
  v: { g: [3, 4], b: [3, 4] }, text: 'Gain {g} Guard. If this combo Cashes Out, payout +{b} per card.', tags: ['cashout'],
  fx: (A) => { A.guard(A.v('g')); A.ctxAdd('cashPerCard', A.v('b')); },
});
card({
  id: 'relay_baton', name: 'Relay Baton', owner: 'S', role: 'conv', rank: 5, variant: 'B', rarity: 'rare', anim: 'buff', glyph: 'hook',
  v: { f: [0.2, 0.3] }, text: 'For each different ally who has acted this combo: +1 Momentum and +{f}s Flow.', tags: ['flow', 'relay'],
  fx: (A) => { const n = A.ctx.owners.length; A.mom(n); A.flow(n * A.v('f')); },
});
card({
  id: 'downshift', name: 'Downshift', owner: 'V', role: 'conv', rank: 6, variant: 'EX', rarity: 'rare', anim: 'melee', glyph: 'hammer',
  v: { d: [6, 8], r: [4, 5] }, text: 'Deal {d}. Rewind {r}.', tags: ['ladder', 'flow'],
  fx: (A) => { A.dmg(A.v('d')); A.rewind(A.v('r')); },
});
card({
  id: 'signal_boost', name: 'Signal Boost', owner: 'C', role: 'conv', rank: 3, variant: 'B', rarity: 'common', anim: 'cast', glyph: 'wave',
  v: { s: [4, 6] }, text: 'Apply {s}s Exposed to ALL enemies.', tags: ['interference'],
  fx: (A) => A.status('exposed', A.v('s'), { all: true }),
});
card({
  id: 'kindling', name: 'Kindling', owner: 'C', role: 'conv', rank: 4, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame',
  v: { s: [2, 3] }, text: 'Apply {s} Scorch. If already Scorched, apply {s} more.', tags: ['interference'],
  fx: (A) => { const had = A.target && (A.target.st.scorch || 0) > 0; A.status('scorch', A.v('s') * (had ? 2 : 1)); },
});
card({
  id: 'jam_breaker', name: 'Jam Breaker', owner: 'V', role: 'conv', rank: 5, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'chain',
  v: { d: [4, 5], b: [2, 3] }, text: 'Deal {d}, +{b} per interference endured this battle (max 5).', tags: ['interference'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.min(5, A.c.stats.interference)),
});
card({
  id: 'cache_hook', name: 'Cache Hook', owner: 'S', role: 'conv', rank: 3, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'hook',
  v: { d: [4, 6] }, text: 'Deal {d}. From Reserve: Rewind 2 and gain 1 Momentum.', tags: ['reserve', 'ladder'],
  fx: (A) => { A.dmg(A.v('d')); if (A.fromReserve) { A.rewind(2); A.mom(1); } },
});
card({
  id: 'vault_guard', name: 'Vault Guard', owner: 'V', role: 'conv', rank: 4, variant: 'B', rarity: 'uncommon', anim: 'guard', glyph: 'box',
  v: { g: [4, 5] }, text: 'Gain {g} Guard, +{g} per card in Reserve.', tags: ['reserve', 'guard'],
  fx: (A) => A.guard(A.v('g') * (1 + A.c.reserve.length)),
});

// ───────────────────────────── CLOSERS ─────────────────────────────
card({
  id: 'scrapfall', name: 'Scrapfall', owner: 'V', role: 'close', rank: 5, variant: 'A', rarity: 'starter', anim: 'melee', glyph: 'hammer', big: true,
  v: { d: [6, 8], b: [3, 4] }, text: 'Deal {d} + {b} per card in this combo.', tags: [],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.len),
});
card({
  id: 'sunderline', name: 'Sunderline', owner: 'V', role: 'close', rank: 6, variant: 'B', rarity: 'starter', anim: 'melee', glyph: 'hammer', big: true,
  v: { d: [9, 12], b: [5, 6] }, text: 'Deal {d} + {b} per Relay this combo. Pierces Guard.', tags: ['relay'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.relays, { pierce: true }),
});
card({
  id: 'last_word', name: 'Last Word', owner: 'C', role: 'close', rank: 6, variant: 'EX', rarity: 'starter', anim: 'cast', glyph: 'star', big: true,
  v: { d: [4, 6], p: [30, 45] }, text: "Deal {d} + {p}% of this combo's damage to ALL enemies.", tags: [],
  fx: (A) => A.dmg(A.v('d') + Math.floor((A.ctx.damage * A.v('p')) / 100), { all: true }),
});
card({
  id: 'bolt_volley', name: 'Bolt Volley', owner: 'S', role: 'close', rank: 5, variant: 'B', rarity: 'starter', anim: 'shoot', glyph: 'arrow', big: true,
  v: { d: [3, 4] }, text: 'Deal {d} once per card in this combo.', tags: [],
  fx: (A) => A.dmg(A.v('d'), { hits: A.ctx.len }),
});
card({
  id: 'ladder_peak', name: 'Ladder Peak', owner: 'S', role: 'close', rank: 9, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'ladder', big: true,
  v: { d: [10, 14], b: [5, 6] }, text: 'Deal {d} + {b} per Step this combo.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.steps),
});
card({
  id: 'capstone', name: 'Capstone', owner: 'V', role: 'close', rank: 8, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'hammer', big: true,
  v: { d: [16, 20] }, text: 'Deal {d}. Double damage if this combo has 3+ Steps.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d') * (A.ctx.steps >= 3 ? 2 : 1)),
});
card({
  id: 'crosscut', name: 'Crosscut', owner: 'S', role: 'close', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'shoot', glyph: 'prism', big: true,
  v: { d: [6, 8], b: [6, 8] }, text: 'Deal {d} + {b} per Cross this combo.', tags: ['variant'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.ctx.crosses),
});
card({
  id: 'suit_storm', name: 'Suit Storm', owner: 'C', role: 'close', rank: 7, variant: 'EX', rarity: 'rare', anim: 'cast', glyph: 'prism', big: true,
  v: { d: [5, 7] }, text: 'Deal {d} to ALL per distinct suit played this combo (A, B, EX).', tags: ['variant'],
  fx: (A) => A.dmg(A.v('d') * A.ctx.suits.length, { all: true }),
});
card({
  id: 'chorus_break', name: 'Chorus Break', owner: 'C', role: 'close', rank: 6, variant: 'A', rarity: 'uncommon', anim: 'cast', glyph: 'wave', big: true,
  v: { p: [50, 70], d: [4, 6] }, text: 'Deal {d}. Echo every Relay card this combo at {p}%.', tags: ['relay'],
  fx: (A) => { A.dmg(A.v('d')); A.ctx.cards.forEach((e, i) => { if (e.relay && i < A.ctx.cards.length - 1) A.echo(i, A.v('p') / 100); }); },
});
card({
  id: 'overpressure', name: 'Overpressure', owner: 'C', role: 'close', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'flame', big: true,
  v: { d: [5, 6] }, text: 'Spend all Momentum: deal {d} per point.', tags: ['momentum'],
  fx: (A) => { const n = A.spendMomentum(); A.dmg(Math.max(3, A.v('d') * n)); },
});
card({
  id: 'momentum_lance', name: 'Momentum Lance', owner: 'S', role: 'close', rank: 7, variant: 'A', rarity: 'uncommon', anim: 'shoot', glyph: 'arrow', big: true,
  v: { d: [10, 13] }, text: 'Deal {d}. If you have 5+ Momentum, deal {d} more.', tags: ['momentum'],
  fx: (A) => A.dmg(A.v('d') * (A.c.momentum >= 5 ? 2 : 1)),
});
card({
  id: 'timekeeper', name: 'Timekeeper', owner: 'S', role: 'close', rank: 5, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'clock', big: true,
  v: { d: [4, 6], b: [7, 9] }, text: 'Deal {d} + {b} per full second of Flow remaining.', tags: ['flow'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.floor(A.flowLeft())),
});
card({
  id: 'recycler', name: 'Recycler', owner: 'V', role: 'close', rank: 5, variant: 'A', rarity: 'common', anim: 'melee', glyph: 'gear', big: true,
  v: { d: [8, 11] }, text: 'Deal {d}. Gain 2 Churn charges.', tags: ['churn'],
  fx: (A) => { A.dmg(A.v('d')); A.churnGain(2); },
});
card({
  id: 'junkstorm', name: 'Junkstorm', owner: 'V', role: 'close', rank: 7, variant: 'A', rarity: 'rare', anim: 'melee', glyph: 'box', big: true,
  v: { d: [6, 8] }, text: 'Deal {d} +2 per Churn used this battle (max +24) to ALL enemies.', tags: ['churn'],
  fx: (A) => A.dmg(A.v('d') + Math.min(24, 2 * A.c.stats.churns), { all: true }),
});
card({
  id: 'cache_release', name: 'Cache Release', owner: 'S', role: 'close', rank: 6, variant: 'EX', rarity: 'uncommon', anim: 'shoot', glyph: 'box', big: true,
  v: { d: [5, 7], b: [7, 9] }, text: 'Deal {d} + {b} per card in Reserve.', tags: ['reserve'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * A.c.reserve.length),
});
card({
  id: 'fortress_slam', name: 'Fortress Slam', owner: 'V', role: 'close', rank: 6, variant: 'B', rarity: 'uncommon', anim: 'melee', glyph: 'shield', big: true,
  v: { d: [2, 5] }, text: 'Deal damage equal to your Guard + {d}. Keep your Guard.', tags: ['guard'],
  fx: (A) => A.dmg(Math.floor(A.c.guard) + A.v('d')),
});
card({
  id: 'counterweight', name: 'Counterweight', owner: 'V', role: 'close', rank: 4, variant: 'A', rarity: 'common', anim: 'guard', glyph: 'shield', big: true,
  v: { g: [12, 15], k: [6, 8] }, text: 'Gain {g} Guard. Counter {k}.', tags: ['guard'],
  fx: (A) => { A.guard(A.v('g')); A.counter(A.v('k')); },
});
card({
  id: 'mend_circuit', name: 'Mend Circuit', owner: 'C', role: 'close', rank: 5, variant: 'B', rarity: 'common', anim: 'cast', glyph: 'wave', big: true,
  v: { h: [3, 5] }, text: 'Heal all allies {h} + 1 per card in this combo.', tags: ['guard'],
  fx: (A) => A.heal(A.v('h') + A.ctx.len, 'all'),
});
card({
  id: 'detonate', name: 'Detonate', owner: 'C', role: 'close', rank: 7, variant: 'B', rarity: 'uncommon', anim: 'cast', glyph: 'flame', big: true,
  v: { p: [3, 4] }, text: 'Consume all Scorch on enemies: deal {p}× the stacks to each.', tags: ['interference'],
  fx: (A) => A.detonateScorch(A.v('p')),
});
card({
  id: 'breach_payload', name: 'Breach Payload', owner: 'S', role: 'close', rank: 5, variant: 'A', rarity: 'rare', anim: 'shoot', glyph: 'chain', big: true,
  v: { d: [6, 8], b: [5, 6] }, text: 'Deal {d} + {b} per interference endured this battle (max 6).', tags: ['interference'],
  fx: (A) => A.dmg(A.v('d') + A.v('b') * Math.min(6, A.c.stats.interference)),
});
card({
  id: 'clean_exit', name: 'Clean Exit', owner: 'V', role: 'close', rank: 3, variant: 'EX', rarity: 'uncommon', anim: 'buff', glyph: 'coin', big: true,
  v: { p: [40, 60] }, text: 'Close this combo as a Cash Out with +{p}% payout. Recover 1 Churn charge.', tags: ['cashout'],
  fx: (A) => { A.ctxAdd('cashPct', A.v('p') / 100); A.churnGain(1); A.closeAsCashOut(); },
});
card({
  id: 'grand_relay', name: 'Grand Relay', owner: 'S', role: 'close', rank: 9, variant: 'EX', rarity: 'rare', anim: 'shoot', glyph: 'star', big: true,
  v: { d: [10, 13] }, text: 'Deal {d} per different ally who acted this combo. All three: hits ALL enemies.', tags: ['relay'],
  fx: (A) => { const n = A.ctx.owners.length; A.dmg(A.v('d') * n, { all: n >= 3 }); },
});
card({
  id: 'echo_chamber', name: 'Echo Chamber', owner: 'C', role: 'close', rank: 8, variant: 'A', rarity: 'rare', anim: 'cast', glyph: 'spiral', big: true,
  v: { p: [80, 100] }, text: 'Echo the two strongest cards this combo at {p}%.', tags: ['relay'],
  fx: (A) => { A.strongestIdx(2).forEach((i) => A.echo(i, A.v('p') / 100)); },
});
card({
  id: 'final_notice', name: 'Final Notice', owner: 'V', role: 'close', rank: 9, variant: 'B', rarity: 'rare', anim: 'melee', glyph: 'hammer', big: true,
  v: { d: [28, 36] }, text: 'Deal {d}. Pierces Guard.', tags: ['ladder'],
  fx: (A) => A.dmg(A.v('d'), { pierce: true }),
});
card({
  id: 'payday', name: 'Payday', owner: 'S', role: 'close', rank: 4, variant: 'B', rarity: 'uncommon', anim: 'shoot', glyph: 'coin', big: true,
  v: { d: [4, 6], p: [50, 70] }, text: 'Deal {d}. Then trigger a Cash Out payout at {p}% (still a Perfect close).', tags: ['cashout'],
  fx: (A) => { A.dmg(A.v('d')); A.payout(A.v('p') / 100); },
});
card({
  id: 'thermal_lance', name: 'Thermal Lance', owner: 'C', role: 'close', rank: 5, variant: 'A', rarity: 'common', anim: 'cast', glyph: 'flame', big: true,
  v: { d: [7, 9], s: [3, 4] }, text: 'Deal {d}. Apply {s} Scorch.', tags: ['interference'],
  fx: (A) => { A.dmg(A.v('d')); A.status('scorch', A.v('s')); },
});

// ─────────────────────────── STATUS / JUNK ───────────────────────────
card({
  id: 'glitch', name: 'Glitch', owner: null, role: 'junk', rank: 0, variant: 'EX', rarity: 'status', anim: 'buff', glyph: 'glitch',
  v: {}, text: 'Unplayable corruption. Churn it for free; it is deleted.', tags: [], temp: true,
  fx: () => {},
});

export const CARDS = Object.fromEntries(C.map((c) => [c.id, c]));
export const CARD_LIST = C;

export const STARTER_DECK = [
  'scrapline', 'scrapline', 'hotwire', 'hotwire', 'salvage', 'rivet_jab',
  'rethread', 'step_up', 'gear_swap', 'splitter', 'coil_charge', 'dead_drop',
  'scrapfall', 'sunderline', 'last_word', 'bolt_volley',
];

export function rewardPool() {
  return C.filter((c) => c.rarity !== 'starter' && c.rarity !== 'status');
}

export function cardValue(def, up, key) {
  const pair = def.v[key];
  if (!pair) return 0;
  return up ? pair[1] : pair[0];
}

// Grafts: surgical alterations attached to a single card instance.
export const GRAFTS = {
  spark: { name: 'Spark', text: '+1 Momentum when played.', tag: 'momentum' },
  quick: { name: 'Quick', text: '+0.2s Flow when played.', tag: 'flow' },
  plated: { name: 'Plated', text: '+3 Guard when played.', tag: 'guard' },
  echoing: { name: 'Echoing', text: 'As a Relay, Echoes itself at 30%.', tag: 'relay' },
  keen: { name: 'Keen', text: '+3 damage to its first hit.', tag: 'ladder' },
  cached: { name: 'Cached', text: '+50% power when played from Reserve.', tag: 'reserve' },
  churnfed: { name: 'Churnfed', text: 'When Churned: +1 Momentum and +2 Guard.', tag: 'churn' },
  breaker: { name: 'Breaker', text: 'Its damage pierces Guard.', tag: 'guard' },
  anchored: { name: 'Anchored', text: 'Cannot be Locked or Scrambled.', tag: 'interference' },
  ledger: { name: 'Ledger', text: 'Cash Out payout +3 if this card is in the combo.', tag: 'cashout' },
};
