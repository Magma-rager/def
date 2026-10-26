// Relics persist for a run. Effects are implemented as hooks inside engine/combat.js and engine/run.js
// keyed by relic id; the text here is the player-facing contract.
export const RELICS = {
  beta_badge: { name: "Beta Tester's Badge", rarity: 'starter', icon: 'badge', tag: 'churn', text: 'The first Churn each battle is free.' },
  stopwatch_gear: { name: 'Stopwatch Gear', rarity: 'common', icon: 'clock', tag: 'flow', text: 'Your first combo each battle gains +1.0s Flow (6.2s cap still applies).' },
  pressure_gauge: { name: 'Pressure Gauge', rarity: 'common', icon: 'gauge', tag: 'momentum', text: 'Max Momentum +3. Start each battle with 2 Momentum.' },

  junk_dividend: { name: 'Junk Dividend', rarity: 'uncommon', icon: 'coin', tag: 'cashout', text: 'Each Cash Out: +1 Momentum and 3 Scrap (max 15 Scrap per battle).' },
  heat_shield: { name: 'Heat Shield', rarity: 'uncommon', icon: 'shield', tag: 'guard', text: 'When Guard fully absorbs an enemy hit, apply 2 Scorch to the attacker.' },
  echo_splice: { name: 'Echo Splice', rarity: 'rare', icon: 'spiral', tag: 'relay', text: 'The first Relay each combo Echoes the previous card at 40%.' },
  breach_clamp: { name: 'Breach Clamp', rarity: 'uncommon', icon: 'chain', tag: 'interference', text: 'When an enemy Locks or Scrambles your cards: +1 Momentum and +3 Guard. Locks last 1s less.' },

  brass_metronome: { name: 'Brass Metronome', rarity: 'common', icon: 'clock', tag: 'flow', text: 'Natural Flow refunds are 0.24s per card (1.2s refund cap still applies).' },
  ladder_rungs: { name: 'Ladder Rungs', rarity: 'common', icon: 'ladder', tag: 'ladder', text: 'Every Step deals 3 bonus damage to the target.' },
  twin_dials: { name: 'Twin Dials', rarity: 'common', icon: 'dial', tag: 'variant', text: 'Each Cross grants +1 extra Momentum.' },
  prism_lens: { name: 'Prism Lens', rarity: 'uncommon', icon: 'prism', tag: 'variant', text: 'EX cards deal +3 damage.' },
  spare_pockets: { name: 'Spare Pockets', rarity: 'uncommon', icon: 'box', tag: 'reserve', text: 'Reserve holds +1 card. Cards played from Reserve deal +3.' },
  churn_gear: { name: 'Churn Gear', rarity: 'common', icon: 'gear', tag: 'churn', text: '+1 max Churn charge. Charges recover 30% faster.' },
  oiled_bearings: { name: 'Oiled Bearings', rarity: 'uncommon', icon: 'gear', tag: 'churn', text: 'Churning no longer costs Flow or advances enemy ATB.' },
  flywheel: { name: 'Flywheel', rarity: 'uncommon', icon: 'gear', tag: 'flow', text: 'Spending Momentum for Flow costs 2 instead of 3.' },
  tower_plate: { name: 'Tower Plate', rarity: 'common', icon: 'shield', tag: 'guard', text: 'Spending Momentum for Guard grants 12 instead of 8.' },
  riveted_ledger: { name: 'Riveted Ledger', rarity: 'common', icon: 'coin', tag: 'cashout', text: 'Cash Out payout +30%.' },
  signal_flare: { name: 'Signal Flare', rarity: 'common', icon: 'flare', tag: 'interference', text: 'At battle start, all enemies are Exposed for 6s.' },
  coal_heart: { name: 'Coal Heart', rarity: 'common', icon: 'flame', tag: 'interference', text: 'Scorch you apply is +1.' },
  tuning_fork: { name: 'Tuning Fork', rarity: 'common', icon: 'fork', tag: 'guard', text: 'Perfect combos heal the most injured ally for 2.' },
  grease_trap: { name: 'Grease Trap', rarity: 'uncommon', icon: 'chain', tag: 'interference', text: 'Enemy Locks last half as long.' },
  lucky_rivet: { name: 'Lucky Rivet', rarity: 'uncommon', icon: 'star', tag: null, text: 'Card rewards offer 4 choices.' },
  patch_kit: { name: 'Patch Kit', rarity: 'common', icon: 'cross', tag: 'guard', text: 'After each battle, every ally heals 4 HP.' },
  counter_spring: { name: 'Counter Spring', rarity: 'uncommon', icon: 'spring', tag: 'guard', text: 'Counter damage is doubled.' },
  long_fuse: { name: 'Long Fuse', rarity: 'rare', icon: 'flame', tag: 'cashout', text: 'When Flow runs out, the combo pays out at 50% instead of dropping (no Momentum loss).' },
  relay_harness: { name: 'Relay Harness', rarity: 'rare', icon: 'hook', tag: 'relay', text: 'Each Relay gives later cards in the combo +2 damage (stacking).' },
  scrap_magnet: { name: 'Scrap Magnet', rarity: 'common', icon: 'magnet', tag: null, text: '+25% Scrap from battles.' },
  wild_hinge: { name: 'Wild Hinge', rarity: 'rare', icon: 'prism', tag: 'variant', text: 'Switching suits may climb +1 or +2 ranks.' },
  iron_filings: { name: 'Iron Filings', rarity: 'common', icon: 'shield', tag: 'guard', text: 'Each Converter played grants 1 Guard.' },
  dead_mans_switch: { name: "Dead Man's Switch", rarity: 'uncommon', icon: 'skull', tag: null, text: "When an ally is KO'd: deal 15 to ALL enemies and gain 5 Momentum." },
  glitch_jar: { name: 'Glitch Jar', rarity: 'rare', icon: 'jar', tag: 'interference', text: 'Scrambled cards in your hand count as EX.' },
  kettle_drum: { name: 'Kettle Drum', rarity: 'rare', icon: 'drum', tag: 'ladder', text: 'Closers in combos of 5+ cards deal +25%.' },
  quiet_coil: { name: 'Quiet Coil', rarity: 'common', icon: 'spring', tag: 'guard', text: 'Guard decays 50% slower.' },
  regent_mainspring: { name: "Regent's Mainspring", rarity: 'boss', icon: 'clock', tag: 'interference', boss: 'clockwork_regent', text: 'Enemy Locks last 1s less. Whenever a Lock expires, gain 1 Momentum.' },
  scrap_heart: { name: 'Scrap Heart', rarity: 'boss', icon: 'shield', tag: 'guard', boss: 'scrap_tyrant', text: 'Start each battle with 10 Guard. Your Guard cap is raised by 20.' },
  auditor_seal: { name: "Auditor's Seal", rarity: 'boss', icon: 'eye', tag: 'variant', boss: 'protocol_auditor', text: 'Citations can no longer be issued against you. Your first Perfect combo each battle grants +4 Momentum.' },
  mirror_lens: { name: 'Mirror Lens', rarity: 'boss', icon: 'prism', tag: 'relay', boss: 'mirror_array', text: 'Echoes are 25% stronger.' },
  root_key: { name: 'Root Key', rarity: 'boss', icon: 'jar', tag: 'interference', boss: 'the_corruptor', text: 'Glitch cards cannot be added to your deck. Scrambled cards deal +4 damage.' },
  overflow_valve: { name: 'Overflow Valve', rarity: 'uncommon', icon: 'gauge', tag: 'momentum', text: 'Momentum gained beyond the cap deals 3 damage per point to the target.' },
};

export const RELIC_IDS = Object.keys(RELICS);

export function relicPool(exclude = []) {
  return RELIC_IDS.filter((id) => RELICS[id].rarity !== 'starter' && RELICS[id].rarity !== 'boss' && !exclude.includes(id));
}

// Relics that may be chosen as the starting relic once unlocked in the Museum.
export const STARTER_OPTIONS = [
  { id: 'beta_badge', unlock: null, hint: 'Default' },
  { id: 'stopwatch_gear', unlock: 'boss1', hint: 'Defeat any Act I boss' },
  { id: 'pressure_gauge', unlock: 'runs3', hint: 'Finish 3 runs (win or lose)' },
  { id: 'echo_splice', unlock: 'win', hint: 'Win a run' },
];
