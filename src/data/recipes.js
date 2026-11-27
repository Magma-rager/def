// EX Combo recipes (Phase 7; docs/COMBAT_SPEC.md §12.4, §28). A recipe is a pattern over the commands
// that actually executed in one chain. The combat engine evaluates the catalogue at two moments only —
// when a basic attack or arte resolves (`on: 'card'`) and when a chain ends (`on: 'end'`) — never per
// frame, never for queued or cancelled commands. Each recipe triggers at most once per chain; several
// completing on the same command all trigger, in ascending `priority`.
//
// `match(x)` reads a compact record the engine keeps for the chain:
//   x.c        the chain: cards[] (executed card entries), log[] (executed events in order), owners[],
//              relays, quick (the Cash Out was a Quick Cash), payout (its damage)
//   x.e        the card entry that just resolved (on: 'card'): { index, seg, owner, category, rank,
//              strength (basic 1-3), variant, step, cross, fromReserve, disrupted, coverUp, spent }
//   x.end      the ending (on: 'end'): 'perfect' | 'cashout' | 'forced'
//   x.logPos   position of the resolved card in x.c.log
// log events: { k: 'card', i } · { k: 'relay', from, to } · { k: 'support', id, hero, attacker, heal,
//   guard, cover } · { k: 'churn' } · { k: 'stash' } · { k: 'flow', src: 'buy' | 'card' }
// Effects (`fx(api)`) use bounded engine helpers, so every cap (Momentum, Flow, Guard, Churn, HP) holds;
// damage is a share of the chain's damage before any EX effect of this command (`api.base`).
//
// Texts are the English originals; Russian ones are in src/i18n/ru.js (`recipes`). `seq` is the
// sequence the Combo Journal draws as chips (see src/ui/museum.js).

const seg = (x, i = x.e.seg) => x.c.cards.filter((e) => e.seg === i && e.index <= x.e.index);
const arte = (x) => x.e && x.e.category === 'arte';
const before = (x, pred) => x.c.log.slice(0, x.logPos).some(pred);

export const RECIPES = [
  {
    id: 'straight_circuit', tier: 'accessible', priority: 10, on: 'card', tags: ['ladder'], kind: 'offense',
    name: 'Straight Circuit',
    how: 'One hero opens their part of a combo with a Weak, a Medium and a Strong basic attack, in that order, then plays an arte.',
    effect: 'A strike for 25% of the combo\'s damage (at least 5) and +1 Momentum.',
    hint: 'Climb all three basic strengths with one hero, then their arte.',
    purpose: 'Rewards building the full ladder before spending Momentum.',
    seq: ['W', 'M', 'S', 'A'],
    match: (x) => { if (!arte(x)) return false; const s = seg(x); return s.length === 4 && s[0].strength === 1 && s[1].strength === 2 && s[2].strength === 3 && s.slice(0, 3).every((e) => e.category === 'basic'); },
    fx: (a) => { a.strike(0.25, 5); a.momentum(1); },
  },
  {
    id: 'salvage_circuit', tier: 'intermediate', priority: 12, on: 'card', tags: ['churn'], kind: 'utility',
    name: 'Salvage Circuit',
    how: 'Churn a card while a combo is running, play the card that Churn brought in, and land an arte in that combo (the new card itself may be the arte).',
    effect: 'One Churn charge back and +1 Momentum.',
    hint: 'Dig mid-combo — and play what you find.',
    purpose: 'Makes mid-combo Churn a way to dig for the next card rather than a loss of time.',
    seq: ['CHURN', 'NEW', 'A'],
    match: (x) => { if (!arte(x)) return false; const drew = new Set(x.c.log.slice(0, x.logPos).filter((l) => l.k === 'churn' && l.drew).map((l) => l.drew)); return x.c.cards.some((e) => e.index <= x.e.index && drew.has(e.uid)); },
    fx: (a) => { a.churn(1); a.momentum(1); },
  },
  {
    id: 'stored_strike', tier: 'accessible', priority: 15, on: 'card', tags: ['reserve'], kind: 'offense',
    name: 'Stored Strike',
    how: 'Play a basic attack from your Reserve, then an arte in the same hero\'s part of the combo.',
    effect: 'A strike for 20% of the combo\'s damage (at least 5) and +1 Momentum.',
    hint: 'Something kept for later can open the way to an arte.',
    purpose: 'Rewards saving a basic attack to open a later combo.',
    seq: ['RES', 'A'],
    match: (x) => arte(x) && seg(x).some((e) => e.category === 'basic' && e.fromReserve && e.index < x.e.index),
    fx: (a) => { a.strike(0.2, 5); a.momentum(1); },
  },
  {
    id: 'high_climb', tier: 'intermediate', priority: 20, on: 'card', tags: ['ladder'], kind: 'offense',
    name: 'High Climb',
    how: 'Three Steps (exactly +1 rank) in one hero\'s part of a combo, ending with an arte of rank 5 or 6.',
    effect: 'The target is Exposed for 5s (takes 30% more damage) and +2 Momentum.',
    hint: 'Step, step, step — and land high.',
    purpose: 'Pushes Rank Ladder decks towards their higher artes.',
    seq: ['STEP', 'STEP', 'STEP', 'A5'],
    match: (x) => arte(x) && x.e.rank >= 5 && seg(x).filter((e) => e.step).length >= 3,
    fx: (a) => { a.expose(5); a.momentum(2); },
  },
  {
    id: 'second_wind', tier: 'intermediate', priority: 22, on: 'card', tags: ['flow'], kind: 'utility',
    name: 'Second Wind',
    how: 'Extend Flow during a combo (+FLOW, or a card that gives Flow), then keep it going to 6 cards.',
    effect: '+1.5s of Flow (within the combo\'s limit) and 6 Guard.',
    hint: 'Buy time, then use it: a long combo after more Flow.',
    purpose: 'Turns Flow tools into longer, safer combos.',
    seq: ['FLOW', 'B', 'B', '6+'],
    match: (x) => x.c.cards.length >= 6 && before(x, (l) => l.k === 'flow'),
    fx: (a) => { a.flow(1.5); a.guard(6); },
  },
  {
    id: 'prism_sequence', tier: 'intermediate', priority: 25, on: 'card', tags: ['variant'], kind: 'offense',
    name: 'Prism Sequence',
    how: 'Cards of all three suits — A, B and EX — in one hero\'s part of a combo, ending with an arte.',
    effect: 'Every enemy takes 3 damage per Cross in this combo (3 to 15).',
    hint: 'Three suits, one hero, one arte.',
    purpose: 'Rewards Suit Switching decks that carry EX-suit cards.',
    seq: ['SA', 'SB', 'SEX', 'A'],
    match: (x) => { if (!arte(x)) return false; const v = new Set(seg(x).map((e) => e.variant)); return v.has('A') && v.has('B') && v.has('EX'); },
    fx: (a) => { a.strikeAllFlat(Math.max(3, Math.min(15, 3 * a.crosses()))); },
  },
  {
    id: 'cross_current', tier: 'accessible', priority: 30, on: 'card', tags: ['variant'], kind: 'utility',
    name: 'Cross Current',
    how: 'Two Crosses (suit changes) in one hero\'s part of a combo, then that hero\'s arte.',
    effect: '+1 Momentum and one Churn charge.',
    hint: 'Change suits twice before the arte.',
    purpose: 'Rewards alternating suits on purpose.',
    seq: ['X', 'X', 'A'],
    match: (x) => arte(x) && seg(x).filter((e) => e.cross).length >= 2,
    fx: (a) => { a.momentum(1); a.churn(1); },
  },
  {
    id: 'pressure_release', tier: 'intermediate', priority: 35, on: 'card', tags: ['momentum'], kind: 'defense',
    name: 'Pressure Release',
    how: 'Spend 8 or more Momentum on artes in one combo.',
    effect: '8 Guard and +2 Momentum back.',
    hint: 'Pour Momentum into several artes in one combo — a lot of it.',
    purpose: 'Rewards saving Momentum for a big turn.',
    seq: ['A', 'A', '8M'],
    match: (x) => arte(x) && x.c.cards.filter((e) => e.category === 'arte').reduce((s, e) => s + (e.spent || 0), 0) >= 8,
    fx: (a) => { a.guard(8); a.momentum(2); },
  },
  {
    id: 'tandem_signal', tier: 'intermediate', priority: 40, on: 'card', tags: ['relay'], kind: 'offense',
    name: 'Tandem Signal',
    how: 'One hero ends their part of a combo with an arte and Relays; the incoming hero\'s first arte is of the same suit.',
    effect: 'The handing-over hero\'s arte Echoes at 30%.',
    hint: 'Two artes of one suit, either side of a Relay.',
    purpose: 'Rewards handing over after an arte, and pairing heroes whose artes share a suit.',
    seq: ['A', 'R', 'B', 'A'],
    match: (x) => { if (!arte(x) || x.e.seg < 1) return false; const s = seg(x); if (s.filter((e) => e.category === 'arte').length !== 1) return false; const prev = x.c.cards.filter((e) => e.seg === x.e.seg - 1); const last = prev[prev.length - 1]; return !!last && last.category === 'arte' && last.variant === x.e.variant; },
    fx: (a) => { const s = a.chain(); const prev = s.cards.filter((e) => e.seg === a.entry().seg - 1); a.echoArte(prev[prev.length - 1].index, 0.3); },
  },
  {
    id: 'healing_cadence', tier: 'intermediate', priority: 42, on: 'card', tags: ['guard'], kind: 'defense', support: true,
    name: 'Healing Cadence',
    how: 'While one hero attacks, another hero\'s healing support restores HP; then the attacking hero plays another card.',
    effect: '+1s of Flow (within the combo\'s limit) and the party heals 4.',
    hint: 'Heal the party in the middle of someone else\'s combo, and keep attacking.',
    purpose: 'Rewards timing support during a combo instead of between combos.',
    seq: ['B', 'HEAL', 'B'],
    match: (x) => before(x, (l) => l.k === 'support' && l.heal > 0 && l.hero !== l.attacker),
    fx: (a) => { a.flow(1); a.heal(4); },
  },
  {
    id: 'iron_harmony', tier: 'intermediate', priority: 45, on: 'card', tags: ['guard'], kind: 'defense', support: true,
    name: 'Iron Harmony',
    how: 'During Corvin\'s or Pin\'s combo, Hessa\'s Guard support starts her Cover; then the attacking hero lands an arte while Cover is still up.',
    effect: 'Counter 6 (the next enemy hit is struck back) and Cover lasts 2s longer.',
    hint: 'Let Hessa cover someone else\'s combo, then strike behind her shield.',
    purpose: 'Connects Hessa\'s defence with another hero\'s offence.',
    seq: ['B', 'COVER', 'A'],
    match: (x) => arte(x) && x.e.owner !== 'V' && x.e.coverUp && before(x, (l) => l.k === 'support' && l.hero === 'V' && l.cover),
    fx: (a) => { a.counter(6); a.cover(2); },
  },
  {
    id: 'three_way_circuit', tier: 'advanced', priority: 50, on: 'card', tags: ['relay'], kind: 'offense',
    name: 'Three-Way Circuit',
    how: 'All three heroes land an arte in one combo (two Relays).',
    effect: 'Every enemy takes 15% of the combo\'s damage (at least 5) and +1 Momentum.',
    hint: 'Hessa, Corvin and Pin — an arte each, one combo.',
    purpose: 'The payoff for planning a three-hero combo.',
    seq: ['A', 'R', 'A', 'R', 'A'],
    match: (x) => arte(x) && x.e.seg >= 2 && new Set(x.c.cards.filter((e) => e.category === 'arte' && e.index <= x.e.index).map((e) => e.owner)).size >= 3,
    fx: (a) => { a.strikeAll(0.15, 5); a.momentum(1); },
  },
  {
    id: 'interference_reversal', tier: 'intermediate', priority: 55, on: 'card', tags: ['interference'], kind: 'offense',
    name: 'Interference Reversal',
    how: 'Play a card an enemy had Locked or Scrambled, then land an arte later in the same combo.',
    effect: 'A strike for 25% of the combo\'s damage (at least 5) and every Lock on your cards is lifted.',
    hint: 'Turn an enemy\'s Lock or Scramble against it.',
    purpose: 'Makes disrupted cards worth playing instead of waiting out.',
    seq: ['LOCK', 'A'],
    match: (x) => arte(x) && x.c.cards.some((e) => e.disrupted && e.index < x.e.index),
    fx: (a) => { a.strike(0.25, 5); a.unlockAll(); },
  },
  {
    id: 'quick_settlement', tier: 'accessible', priority: 60, on: 'end', tags: ['cashout'], kind: 'offense',
    name: 'Quick Settlement',
    how: 'Change suit at least once (a Cross), then Cash Out the combo with 3 or more cards and 2.5s or more of Flow left (a Quick Cash).',
    effect: 'An extra 25% of the payout as damage and one Churn charge.',
    hint: 'Switch suits, then take the money early, with time to spare.',
    purpose: 'Makes a fast Cash Out a real alternative to the Perfect.',
    seq: ['B', 'X', 'B', 'CASH'],
    match: (x) => x.end === 'cashout' && x.c.cards.length >= 3 && !!x.c.quick && x.c.cards.some((e) => e.cross),
    fx: (a) => { a.strikeFlat(Math.round(0.25 * (a.payout() || 0))); a.churn(1); },
  },
  {
    id: 'final_harmonic', tier: 'advanced', priority: 70, on: 'card', tags: ['ladder', 'relay'], kind: 'offense',
    name: 'Final Harmonic',
    how: 'All three heroes join one combo of 6 or more cards, and it reaches a rank-6 arte.',
    effect: 'Every enemy takes 30% of the combo\'s damage (at least 12) and the party gains 10 Guard.',
    hint: 'Three heroes, a long combo, the highest rank.',
    purpose: 'The hardest recipe: a full party combo that climbs to rank 6.',
    seq: ['R', 'R', '6+', 'A6'],
    match: (x) => arte(x) && x.e.rank >= 6 && x.c.owners.length >= 3 && x.c.cards.length >= 6,
    fx: (a) => { a.strikeAll(0.3, 12); a.guard(10); },
  },
  {
    id: 'switchyard', tier: 'advanced', priority: 64, on: 'card', tags: ['churn', 'reserve'], kind: 'offense',
    name: 'Switchyard',
    how: 'Play a basic attack drawn by Churn, then an arte from Reserve in the same hero’s segment.',
    effect: 'A strike for 25% of the combo’s damage (at least 7) and 5 Guard.',
    hint: 'Draw the approach under pressure. Save the finisher ahead of time.',
    purpose: 'Joins two forms of hand preparation in one segment.',
    seq: ['CHURN', 'NEW', 'RES', 'A'],
    match: (x) => arte(x) && x.e.fromReserve && seg(x).some((e) => e.category === 'basic' && e.fromChurn),
    fx: (a) => { a.strike(0.25, 7); a.guard(5); },
  },
  {
    id: 'safety_interlock', tier: 'intermediate', priority: 67, on: 'card', tags: ['reserve', 'guard'], kind: 'defense', support: true,
    name: 'Safety Interlock',
    how: 'While one hero attacks, another plays support from Reserve. The attacking hero then lands an arte.',
    effect: '7 Guard and Counter 5.',
    hint: 'Keep one support card ready for someone else’s combo.',
    purpose: 'Makes saved support useful in a deck that rarely saves attacks.',
    seq: ['B', 'RES', 'A'],
    match: (x) => arte(x) && before(x, (l) => l.k === 'support' && l.fromReserve && l.hero !== l.attacker && l.attacker === x.e.owner),
    fx: (a) => { a.guard(7); a.counter(5); },
  },
].sort((a, b) => a.priority - b.priority);

export const RECIPE_MAP = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const RECIPE_IDS = RECIPES.map((r) => r.id);
export const RECIPE_TIERS = ['accessible', 'intermediate', 'advanced'];
export const RECIPE_KINDS = ['offense', 'defense', 'utility'];

// Museum combo record (meta.combos): { [id]: { at: time of discovery, count: activations } }.
// Unknown ids are kept (a later build may know them) but never shown or counted.
export function normalizeCombos(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (typeof id !== 'string' || !/^[a-z0-9_]{1,40}$/.test(id)) continue;
    const at = v && Number.isFinite(+v.at) ? +v.at : 0;
    const count = v && Number.isFinite(+v.count) ? Math.max(1, Math.floor(+v.count)) : 1;
    out[id] = { at, count };
  }
  return out;
}
export const knownDiscoveries = (combos) => RECIPE_IDS.filter((id) => combos && combos[id]);
