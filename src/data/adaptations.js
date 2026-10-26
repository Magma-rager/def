// Boss adaptations: each counters one archetype. Chosen from current-run evidence only
// (see engine/run.js analyzeProfile). Every adaptation is telegraphed and can be broken.
export const ADAPTATIONS = {
  ladder: { id: 'long_chain', name: 'Chain Dampener', desc: 'Flow refunds are halved for the 5th card onward.', breakText: 'End 3 combos with 4 or fewer cards (Closer or Cash Out).', need: 3 },
  cashout: { id: 'payout_audit', name: 'Payout Audit', desc: 'Cash Out payouts are reduced by 40%.', breakText: 'Finish 3 combos with a Closer (Perfect).', need: 3 },
  guard: { id: 'guard_pierce', name: 'Guard Piercer', desc: 'Boss attacks ignore half of your Guard.', breakText: 'Deal 60 total damage with Closers.', need: 60 },
  churn: { id: 'churn_tax', name: 'Churn Tax', desc: 'Each Churn advances the boss ATB by 15%.', breakText: 'Finish 3 combos without Churning during them.', need: 3 },
  variantA: { id: 'suit_filter_A', name: 'Suit Filter: A', desc: 'Your A-suit cards deal 30% less damage.', breakText: 'Play 8 B-suit or EX cards.', need: 8 },
  variantB: { id: 'suit_filter_B', name: 'Suit Filter: B', desc: 'Your B-suit cards deal 30% less damage.', breakText: 'Play 8 A-suit or EX cards.', need: 8 },
  relay: { id: 'relay_jam', name: 'Relay Jammer', desc: 'Relays no longer grant Momentum.', breakText: 'Finish 2 Perfect combos with at most 1 Relay.', need: 2 },
  momentum: { id: 'momentum_drain', name: 'Momentum Siphon', desc: 'Each boss action drains 2 Momentum.', breakText: 'Spend 12 Momentum.', need: 12 },
  flow: { id: 'flow_clamp', name: 'Flow Clamp', desc: 'Flow gained from cards and Momentum is halved.', breakText: 'Finish 3 Perfect combos in under 3.5s each.', need: 3 },
  reserve: { id: 'reserve_seal', name: 'Reserve Seal', desc: 'Every boss action seals your Reserve for 3s.', breakText: 'Play 3 cards from Reserve.', need: 3 },
  interference: { id: 'lock_harden', name: 'Hardened Locks', desc: 'Boss Locks last 4.5s instead of 3s.', breakText: 'Deal 50 damage while a hand card is Locked or Scrambled.', need: 50 },
};

export const ARCH_FROM_ADAPT = Object.fromEntries(Object.entries(ADAPTATIONS).map(([k, v]) => [v.id, k]));
