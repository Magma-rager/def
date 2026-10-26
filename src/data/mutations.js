// Mutations: run-wide build modifiers offered after each boss victory (choose 1 of 3).
export const MUTATIONS = {
  ascendant_ladder: { name: 'Ascendant Ladder', tag: 'ladder', text: 'Every Step deals +3 damage and refunds +0.06s more Flow (refund cap still applies).' },
  duality_engine: { name: 'Duality Engine', tag: 'variant', text: 'Each Cross grants +1 Momentum and +4 damage to the crossing card.' },
  relay_resonance: { name: 'Relay Resonance', tag: 'relay', text: 'Every Relay Echoes the previous card at 25%.' },
  overpressure_valve: { name: 'Overpressure Valve', tag: 'momentum', text: 'Max Momentum +4. At 10+ Momentum, your cards deal +25%.' },
  long_breath: { name: 'Long Breath', tag: 'flow', text: 'Spending Momentum on Flow costs 1 less and grants +0.8s instead of +0.6s.' },
  grinder: { name: 'Grinder', tag: 'churn', text: '+2 max Churn charges. Every Churn deals 4 damage to a random enemy.' },
  deep_pockets: { name: 'Deep Pockets', tag: 'reserve', text: 'Reserve +1 slot. Cards played from Reserve deal +4 and grant +1 Momentum.' },
  bastion_protocol: { name: 'Bastion Protocol', tag: 'guard', text: 'Guard decays 50% slower. When Guard absorbs a hit, deal 50% of the absorbed amount back.' },
  quick_exit: { name: 'Quick Exit', tag: 'cashout', text: 'Cash Out payout +40%. Quick Cash (1.5s+ Flow left) also grants +2 Momentum.' },
  signal_thief: { name: 'Signal Thief', tag: 'interference', text: 'Whenever an enemy interferes with your hand, gain 2 Momentum. Formerly Locked cards deal +50%.' },
  perfect_pitch: { name: 'Perfect Pitch', tag: 'ladder', text: 'Perfect combos grant +2 more Momentum and 6 Guard.' },
  glass_cannon: { name: 'Glass Cannon', tag: null, text: 'All your damage +25%. Party max HP -15%.' },
};

export const MUTATION_IDS = Object.keys(MUTATIONS);
