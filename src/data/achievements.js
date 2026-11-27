import { RECIPE_IDS } from './recipes.js';

// The profile evaluator and both progression screens share these conditions and targets.
const achievement = (id, category, name, description, measure, target, { reward, historical = false } = {}) =>
  ({ id, category, name, description, measure, target, reward, historical });

export const ACHIEVEMENTS = [
  achievement('act_one', 'campaign', 'Through the Scrapworks', 'Defeat either Act I boss.', 'actOne', 1, { reward: 'stopwatch_gear', historical: true }),
  achievement('act_two', 'campaign', 'Protocol Broken', 'Defeat either Act II boss.', 'actTwo', 1, { historical: true }),
  achievement('victory', 'campaign', 'Signal Restored', 'Win a three-Act campaign.', 'wins', 1, { reward: 'echo_splice', historical: true }),
  achievement('all_bosses', 'campaign', 'Every Challenge Answered', 'Defeat all six alternative bosses.', 'bossWins', 6, { historical: true }),
  achievement('finish_three', 'campaign', 'Back for More', 'Finish three runs by victory or defeat.', 'finished', 3, { reward: 'pressure_gauge', historical: true }),

  achievement('ascending', 'combat', 'Four on the Rise', 'Finish a Perfect with four ascending attacks in the same hero’s segment.', 'ascending', 1, { reward: 'ladder_rungs' }),
  achievement('switch_suits', 'combat', 'Switching Signals', 'Finish three successful chains that each contain at least two Crosses and one Step.', 'crossChains', 3, { reward: 'twin_dials' }),
  achievement('reserve', 'combat', 'Ready When Needed', 'Play a card from Reserve in each of three completed encounters.', 'reserveBattles', 3, { reward: 'spare_pockets' }),
  achievement('guard', 'combat', 'Hold the Line', 'Absorb 40 damage with Guard across completed encounters.', 'guardAbsorbed', 40, { reward: 'tower_plate' }),
  achievement('cash_out', 'combat', 'Take the Payout', 'Complete four Cash Out chains in finished encounters.', 'cashouts', 4, { reward: 'riveted_ledger' }),
  achievement('interference', 'combat', 'Signal Recovered', 'In two completed encounters, land an attack with a scrambled or previously locked card, or Churn a Glitch.', 'responseBattles', 2, { reward: 'breach_clamp' }),
  achievement('relay_pair', 'combat', 'Pass the Baton', 'Finish a Perfect with two heroes who each landed an attack.', 'relayPair', 1),
  achievement('relay_trio', 'combat', 'Three in Concert', 'Finish a Perfect with all three heroes landing an attack.', 'relayTrio', 1),
  achievement('rank_six', 'combat', 'Sixth Gear', 'Finish a Perfect on a rank-six arte.', 'rankSix', 1),
  achievement('adapt_break', 'combat', 'Break the Counter', 'Break a boss adaptation in a completed encounter.', 'adaptBreak', 1),
  achievement('churn_payoff', 'combat', 'Make the Draw Count', 'Use an attack drawn by Churn in the same successful chain.', 'churnPayoff', 1),
  achievement('flow_finish', 'combat', 'Time Well Spent', 'Spend Momentum to extend Flow and finish that chain with a Perfect.', 'flowFinish', 1),
  achievement('momentum_burst', 'combat', 'Invest the Momentum', 'Spend eight Momentum on executed attacks in a single successful chain.', 'burst', 1),

  achievement('first_recipe', 'collection', 'A New Combination', 'Discover an EX Combo.', 'recipes', 1, { historical: true }),
  achievement('recipe_five', 'collection', 'Combo Researcher', 'Discover five different EX Combos.', 'recipes', 5, { historical: true }),
  achievement('recipe_all', 'collection', 'Complete Journal', 'Discover every EX Combo.', 'recipes', RECIPE_IDS.length, { historical: true }),
  achievement('advanced_recipe', 'collection', 'Deep Signal', 'Discover an advanced EX Combo.', 'advanced', 1, { historical: true }),
  achievement('bestiary', 'collection', 'Field Notes', 'Encounter 18 different enemies.', 'enemies', 18, { historical: true }),
  achievement('relic_collection', 'collection', 'Curator of Broken Things', 'Acquire 20 different relics.', 'relics', 20, { historical: true }),
  achievement('boss_sight', 'collection', 'Know Your Opponents', 'Encounter all six bosses.', 'bossSight', 6, { historical: true }),

  achievement('build_explorer', 'mastery', 'Changing Tactics', 'Beat an Act I boss and finish a run with each of three different builds, using its signature mechanic.', 'builds', 3),
  achievement('build_victory', 'mastery', 'Signature Victory', 'Win a campaign with a build whose signature mechanic you used throughout the run.', 'masteryWins', 1),
];
