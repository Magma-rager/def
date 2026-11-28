// Authored presentation only. Cards, enemies and recipes continue to be resolved by Combat.
const cue = (clip, shape, color, notes) => ({ clip, shape, color, notes });
const SLAG = '#ff9466', BRASS = '#ffd782', VIOLET = '#dbadff', TEAL = '#75efde', BLUE = '#99d8ff';
const hessa = {
  latchshield: cue('shieldLatch', 'interlock', BRASS, [43, 55, 47, 51]),
  scrapfall: cue('cleave', 'cleave', SLAG, [48, 43]),
  scrap_feed: cue('ram', 'anvil', BRASS, [47, 52]),
  dead_drop: cue('anchor', 'escrow', BLUE, [49, 56, 45]),
  clean_exit: cue('vault', 'ledger', BRASS, [64, 71, 76]),
  jam_breaker: cue('cleave', 'shear', TEAL, [49, 61, 50]),
  recycler: cue('vault', 'ratchet', BRASS, [51, 55, 58]),
  fortress_slam: cue('ram', 'anvil', BLUE, [44, 51, 43]),
  bulwark_shift: cue('anchor', 'plates', BLUE, [43, 55, 58]),
  downshift: cue('anchor', 'stair', BLUE, [55, 52, 48]),
  sunderline: cue('breakline', 'shear', SLAG, [44, 68, 41]),
  capstone: cue('breakline', 'stair', BRASS, [48, 55, 63]),
  final_notice: cue('breakline', 'stamp', SLAG, [50, 45, 40]),
  junkstorm: cue('vault', 'rain', BRASS, [54, 59, 42]),
  salvage: cue('anchor', 'ratchet', BLUE, [55, 61]),
  brace_up: cue('anchor', 'plates', BLUE, [50, 62]),
  riposte_frame: cue('riposte', 'escrow', BLUE, [48, 60]),
  counterweight: cue('riposte', 'anvil', BRASS, [45, 57]),
  vault_guard: cue('vault', 'plates', TEAL, [54, 66]),
  iron_oath: cue('anchor', 'escrow', BRASS, [48, 60, 64]),
};
const corvin = {
  pressure_splice: cue('pressureSplice', 'splice', VIOLET, [46, 58, 63, 67]),
  signal_case: cue('signalCase', 'cache', TEAL, [65, 57, 69]),
  thermal_lance: cue('lens', 'rail', SLAG, [55, 62, 50]),
  coil_charge: cue('orbit', 'ratchet', VIOLET, [58, 65, 72]),
  kindling: cue('orbit', 'cinders', SLAG, [61, 67]),
  overclock: cue('meter', 'dial', TEAL, [55, 62, 69]),
  overture: cue('array', 'fan', VIOLET, [51, 58, 63]),
  rethread: cue('meter', 'stair', VIOLET, [65, 60, 55]),
  feedback_loop: cue('orbit', 'echo', VIOLET, [63, 70, 63]),
  detonate: cue('array', 'cinders', SLAG, [47, 50, 44]),
  prism_cut: cue('meter', 'prism', TEAL, [61, 66, 74]),
  last_word: cue('array', 'stamp', VIOLET, [50, 57, 45]),
  overpressure: cue('lens', 'pressure', SLAG, [45, 56, 42]),
  suit_storm: cue('array', 'prism', TEAL, [57, 64, 71]),
  echo_chamber: cue('orbit', 'echo', VIOLET, [53, 65, 60]),
  ward_weave: cue('mend', 'plates', BLUE, [49, 56, 61]),
  low_gear: cue('meter', 'ratchet', VIOLET, [48, 52, 60]),
  signal_boost: cue('array', 'scan', TEAL, [57, 66]),
  mirror_wire: cue('lens', 'echo', VIOLET, [54, 66, 61]),
  chorus_break: cue('array', 'relay', VIOLET, [53, 60, 65]),
  pressure_valve: cue('meter', 'pressure', BLUE, [58, 65, 50]),
};
const pin = {
  ratchet_burst: cue('ratchetBurst', 'ratchet', BRASS, [62, 45, 62, 52]),
  bolt_volley: cue('salvo', 'rail', BRASS, [56, 61, 63]),
  splitter: cue('fan', 'fork', BRASS, [52, 59, 64]),
  slipstream: cue('sidestep', 'echo', TEAL, [54, 61]),
  short_circuit: cue('sidestep', 'shear', TEAL, [59, 68, 52]),
  payday: cue('flip', 'ledger', BRASS, [62, 69, 74]),
  deadeye_set: cue('braceShot', 'scan', BRASS, [53, 67, 51]),
  crosscut: cue('fan', 'cross', TEAL, [55, 60, 67]),
  momentum_lance: cue('braceShot', 'pressure', BRASS, [47, 60, 53]),
  timekeeper: cue('flip', 'dial', BLUE, [62, 57, 69]),
  cache_release: cue('salvo', 'cache', BRASS, [50, 62, 67]),
  breach_payload: cue('braceShot', 'shear', TEAL, [51, 62, 46]),
  ladder_peak: cue('salvo', 'stair', BRASS, [53, 60, 65]),
  shuffle_step: cue('flip', 'ratchet', TEAL, [63, 56, 65]),
  relay_baton: cue('flip', 'relay', BRASS, [54, 61, 69]),
  grand_relay: cue('fan', 'relay', BRASS, [57, 64, 69]),
};
export const CARD_CUES = { ...hessa, ...corvin, ...pin };
const basic = {
  V: [cue('jab', 'cleave', SLAG, [56]), cue('cleave', 'cleave', SLAG, [50, 46]), cue('ram', 'anvil', BRASS, [44, 49])],
  C: [cue('meter', 'rail', VIOLET, [61]), cue('lens', 'rail', VIOLET, [57, 63]), cue('array', 'pressure', VIOLET, [52, 58])],
  S: [cue('snap', 'rail', BRASS, [60]), cue('sidestep', 'fork', BRASS, [55, 62]), cue('braceShot', 'rail', BRASS, [48, 60])],
};
const utility = cue('handoff', 'relay', TEAL, [55, 62]);
const kits = {
  V: cue('kitShield', 'kit', TEAL, [52, 60, 67]),
  C: cue('kitCircuit', 'kit', TEAL, [55, 62, 69]),
  S: cue('kitQuick', 'kit', TEAL, [57, 64, 71]),
};
export function cardCue(ev) {
  if (ev.role === 'counter') return cue('riposte', 'cleave', SLAG, [53, 46]);
  if (ev.role === 'momentum') return hessa.brace_up;
  if (ev.id === 'mend_circuit') return kits[ev.who] || kits.C;
  if (CARD_CUES[ev.id]) return CARD_CUES[ev.id];
  if (ev.category === 'basic') return basic[ev.who]?.[Math.max(0, Math.min(2, ev.rank - 1))] || basic.S[0];
  if (ev.id === 'cache_hook') return cue('handoff', 'cache', TEAL, [63, 55]);
  if (ev.anim === 'guard') return cue('block', 'plates', BLUE, [46, 57]);
  return utility;
}

export const EX_CUES = {
  switchyard: cue(null, 'splice', TEAL, [48, 60, 57, 72]),
  safety_interlock: cue(null, 'interlock', BLUE, [48, 55, 66, 62]),
  straight_circuit: cue(null, 'stair', TEAL, [62, 65, 69, 74]),
  salvage_circuit: cue(null, 'ratchet', BRASS, [57, 64, 60]),
  stored_strike: cue(null, 'cache', BLUE, [50, 62, 70]),
  high_climb: cue(null, 'ladder', BRASS, [58, 62, 65, 70]),
  second_wind: cue(null, 'dial', TEAL, [57, 64, 76]),
  prism_sequence: cue(null, 'prism', VIOLET, [60, 66, 71, 78]),
  cross_current: cue(null, 'cross', TEAL, [66, 60, 72]),
  pressure_release: cue(null, 'pressure', BLUE, [55, 62, 43]),
  tandem_signal: cue(null, 'fork', BLUE, [55, 67, 62, 74]),
  healing_cadence: cue(null, 'mend', TEAL, [60, 64, 67, 72]),
  iron_harmony: cue(null, 'plates', BRASS, [48, 55, 60, 64]),
  three_way_circuit: cue(null, 'relay', TEAL, [52, 59, 64, 76]),
  interference_reversal: cue(null, 'shear', VIOLET, [66, 57, 69, 81]),
  quick_settlement: cue(null, 'ledger', BRASS, [64, 71, 76, 83]),
  final_harmonic: cue(null, 'harmonic', VIOLET, [48, 55, 62, 69, 77]),
};

const foe = (motion, shape, color, notes, bias = 0) => ({ motion, shape, color, notes, bias });
export const ENEMY_CUES = {
  rail_bailiff: foe('brace', 'interlock', BRASS, [37, 49, 41]),
  phase_lantern: foe('float', 'prism', TEAL, [58, 64, 69]),
  vector_winch: foe('press', 'splice', SLAG, [39, 50, 43]),
  rush_hound: foe('pounce', 'cleave', SLAG, [42, 37]),
  wire_jammer: foe('antenna', 'cross', VIOLET, [46, 54]),
  interference_mite: foe('skitter', 'shear', TEAL, [53, 44]),
  iron_maw: foe('press', 'anvil', SLAG, [38, 33]),
  churn_snare: foe('antenna', 'ratchet', BRASS, [45, 52, 41]),
  suit_scrambler: foe('float', 'prism', VIOLET, [52, 59, 47]),
  needle_wing: foe('dive', 'rail', BLUE, [53, 45]),
  latch_wisp: foe('float', 'cache', TEAL, [49, 57]),
  signal_hound: foe('pounce', 'fork', VIOLET, [45, 38]),
  bulwark_signal: foe('brace', 'plates', BLUE, [39, 46]),
  predator_needle: foe('dive', 'scan', SLAG, [52, 47]),
  scrap_overseer: foe('press', 'stamp', BRASS, [38, 45]),
  foundry_warden: foe('brace', 'anvil', SLAG, [41, 36]),
  hound_mother: foe('pounce', 'fan', BRASS, [44, 49, 40]),
  archive_censor: foe('antenna', 'cache', VIOLET, [45, 51]),
  choir_engine: foe('float', 'harmonic', BLUE, [40, 52, 59]),
  null_knight: foe('brace', 'shear', VIOLET, [40, 34]),
  rank_eater: foe('skitter', 'stair', TEAL, [49, 44, 35]),
  mirror_shard: foe('float', 'prism', BLUE, [58, 65]),
  clockwork_regent: foe('clock', 'dial', BRASS, [47, 54, 59], -5),
  scrap_tyrant: foe('press', 'anvil', SLAG, [34, 41, 29], 4),
  protocol_auditor: foe('antenna', 'stamp', BLUE, [48, 55, 52], -3),
  mirror_array: foe('mirror', 'prism', TEAL, [53, 60, 65], 2),
  the_corruptor: foe('fault', 'shear', VIOLET, [44, 50, 43], -4),
  signalbreak_core: foe('reactor', 'harmonic', '#ff938a', [36, 48, 55], 6),
};
export const FOE_ACTION = {
  atk: 'cleave', aoe: 'fan', lock: 'cache', scramble: 'prism', jam: 'stamp', snare: 'ratchet',
  latch: 'fork', glitch: 'shear', guard: 'plates', heal: 'mend', buff: 'stair', drain: 'dial', summon: 'relay', expose: 'scan',
};
