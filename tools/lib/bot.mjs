// Phase 4 player policy shared by the headless simulators (simulate, pacing) and the UI bots
// (milestone, encounter, uiplay). It reads the combat engine only through its public state and
// check() — the same legality the hand shows — and returns ONE action; the caller performs it,
// either on the engine (headless) or as a tap or swipe on the matching element (UI bots).
// Works in Node and in the browser (no Node imports).
//
// profiles: 'regular' (uses every tool), 'learner' (no Momentum shortcuts, Churn only for Glitch,
// support only when obviously useful, picks the first hero showing a ★).
import { CARDS } from '../../src/data/cards.js';

const def = (c, u) => CARDS[c.cards.get(u).id];
const cat = (c, u) => def(c, u).category;
const cards = (c) => [...c.hand, ...c.reserve].filter(Boolean);

// The hero who should start the next combo: the one whose artes (hand + Reserve) can be reached
// with the basic attacks in hand. Score = cheapest reachable arte, more artes as a tie-break.
export function bestHero(c, profile = 'regular') {
  const basics = cards(c).filter((u) => cat(c, u) === 'basic' && !c.isLocked(u));
  const gainSum = basics.map((u) => def(c, u).gain).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) + 1;
  const reach = c.available() + gainSum;
  let best = null;
  for (const id of ['V', 'C', 'S']) {
    const artes = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === id && !c.isLocked(u));
    if (!artes.length) continue;
    if (profile === 'learner') return id; // the first hero showing a ★
    const reachable = artes.filter((u) => def(c, u).cost <= reach);
    const score = (reachable.length ? 100 : 0) + artes.length * 10 - Math.min(...artes.map((u) => def(c, u).cost));
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : c.selected;
}

function danger(c) {
  return c.aliveEnemies().some((e) => e.atb > 0.72 && e.intent && e.intent.dmg > 0 && (e.intent.kind === 'atk' || e.intent.kind === 'aoe'));
}

// A support card worth playing now, or null.
function usefulSupport(c, profile) {
  const sup = cards(c).filter((u) => cat(c, u) === 'support' && c.check(u).ok);
  if (!sup.length) return null;
  const id = (u) => def(c, u).id;
  const hurt = c.hp < c.maxHp * (profile === 'learner' ? 0.5 : 0.72);
  const pick = (pred) => sup.find(pred) || null;
  if (hurt) { const h = pick((u) => id(u) === 'mend_circuit'); if (h) return h; }
  if (danger(c) && c.guard < 8) { const g = pick((u) => (def(c, u).tags || []).includes('guard') && id(u) !== 'mend_circuit'); if (g) return g; }
  if (profile === 'learner') return null;
  if (c.churn.charges < 2) { const s = pick((u) => id(u) === 'spare_parts'); if (s) return s; }
  if (c.available() < 2) { const m = pick((u) => id(u) === 'low_gear'); if (m) return m; }
  const stuck = c.hand.filter((u) => u && !c.check(u).ok && !c.isLocked(u)).length;
  if (stuck >= 3) { const s = pick((u) => id(u) === 'shuffle_step'); if (s) return s; }
  if (c.aliveEnemies().length >= 2) { const s = pick((u) => id(u) === 'signal_boost'); if (s) return s; }
  // free Guard support with nothing better to do between combos
  if (!c.combo && c.guard < 6) { const g = pick((u) => def(c, u).cost === 0 && (def(c, u).tags || []).includes('guard')); if (g) return g; }
  return null;
}

// the cheapest playable support card (to cycle the hand), or null
function cheapestSupport(c) {
  const sup = cards(c).filter((u) => cat(c, u) === 'support' && c.check(u).ok);
  sup.sort((a, b) => def(c, a).cost - def(c, b).cost);
  return sup[0] || null;
}

export function decide(c, { profile = 'regular', rng = Math.random } = {}) {
  if (c.phase === 'END' || c.phase === 'RECOVER') return { type: 'wait' };
  const tools = profile !== 'learner';
  const junk = c.hand.find((u) => u && cat(c, u) === 'junk' && !c.isLocked(u));
  if (junk && c.churnJamUntil <= c.t) return { type: 'churn', uid: junk };
  if (tools && danger(c) && c.guard < 6 && c.available() >= 3 && !c.combo) return { type: 'spend', what: 'guard' };
  const sup = usefulSupport(c, profile);
  if (sup && (!c.combo || c.flowHeld() || c.flowLeft() > 2)) return { type: 'play', uid: sup };

  if (!c.combo) {
    const hero = bestHero(c, profile);
    if (hero !== c.selected) return { type: 'select', hero };
    const basics = cards(c).filter((u) => cat(c, u) === 'basic' && c.check(u).ok);
    if (!basics.length) {
      // nothing to start with: play a support card (its slot refills from the deck) or Churn
      const cycle = cheapestSupport(c);
      if (cycle) return { type: 'play', uid: cycle };
      if ((c.churn.charges > 0 || c.stranded()) && (tools || c.hand.every((u) => !u || !c.check(u).ok))) {
        const bad = c.hand.find((u) => u && !c.isLocked(u) && cat(c, u) !== 'basic');
        if (bad) return { type: 'churn', uid: bad };
      }
      return { type: 'wait' };
    }
    // start low, so higher basic attacks and the artes can follow
    basics.sort((a, b) => c.effRank(a) - c.effRank(b) || def(c, b).gain - def(c, a).gain);
    return { type: 'play', uid: basics[0] };
  }

  // in a combo
  const hero = c.combo.hero;
  const legal = cards(c).filter((u) => c.check(u).ok && cat(c, u) !== 'support');
  const artes = legal.filter((u) => cat(c, u) === 'arte');
  const basics = legal.filter((u) => cat(c, u) === 'basic');
  if (artes.length) {
    // the highest affordable arte; if a higher one of this hero needs more Momentum than is left
    // after it, play the lower one first only when both fit
    artes.sort((a, b) => c.effRank(b) - c.effRank(a));
    return { type: 'play', uid: artes[0] };
  }
  if (c.canFinish()) return { type: 'finish' };
  // an arte of this hero is in hand but not affordable yet: build Momentum with basic attacks
  const pending = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === hero && !c.isLocked(u) && c.effRank(u) > c.combo.rank);
  if (basics.length) {
    if (pending.length) {
      const need = Math.min(...pending.map((u) => def(c, u).cost)) - c.available();
      // the basic that pays the most (a Cross adds 1) while leaving a rank below the arte
      const top = Math.min(...pending.map((u) => c.effRank(u)));
      const ok = basics.filter((u) => c.effRank(u) < top);
      const pool = ok.length ? ok : basics;
      pool.sort((a, b) => {
        const ga = def(c, a).gain + (c.effVariant(a) !== c.combo.variant ? 1 : 0);
        const gb = def(c, b).gain + (c.effVariant(b) !== c.combo.variant ? 1 : 0);
        return need > 0 ? gb - ga || c.effRank(a) - c.effRank(b) : c.effRank(a) - c.effRank(b);
      });
      return { type: 'play', uid: pool[0] };
    }
    // no arte coming: a couple more basic attacks, then Cash Out
    if (c.combo.cards.length >= 3 && c.canCashOut() && rng() < 0.5) return { type: 'finish' };
    basics.sort((a, b) => c.effRank(a) - c.effRank(b));
    return { type: 'play', uid: basics[0] };
  }
  if (c.canCashOut()) return { type: 'finish' };
  // stuck after one card: a support card draws a replacement that may continue the combo
  const cycle = c.flowLeft() > 1 ? cheapestSupport(c) : null;
  if (cycle) return { type: 'play', uid: cycle };
  if (tools && c.churn.charges > 0 && c.flowLeft() > 1) {
    const bad = c.hand.find((u) => u && !c.check(u).ok && !c.isLocked(u) && cat(c, u) !== 'support' && !(cat(c, u) === 'arte' && def(c, u).owner === hero));
    if (bad) return { type: 'churn', uid: bad };
  }
  if (tools && c.reserve.length < c.reserveMax() && c.reserveLatchUntil <= c.t) {
    // keep another hero's arte for that hero's next combo instead of clogging the hand
    const other = c.hand.find((u) => u && cat(c, u) === 'arte' && def(c, u).owner !== hero && !c.isLocked(u));
    if (other) return { type: 'stash', uid: other };
  }
  return { type: 'wait' };
}

// Performs an action on the engine (headless players). Returns the engine's result.
export function perform(c, a) {
  switch (a.type) {
    case 'play': return c.playCard(a.uid);
    case 'select': return c.selectHero(a.hero);
    case 'finish': return c.finishOrCashOut();
    case 'churn': return c.churnCard(a.uid);
    case 'stash': return c.stash(a.uid);
    case 'spend': return a.what === 'guard' ? c.spendMomentumGuard() : c.spendMomentumFlow();
    default: return { ok: true };
  }
}
