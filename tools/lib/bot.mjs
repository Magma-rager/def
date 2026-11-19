// Phase 5 player policy shared by the headless simulators (simulate, pacing) and the UI bots
// (milestone, encounter, uiplay, accept5). It reads the combat engine only through its public state,
// check(), relayCheck() and the projected chain (proj()) — the same rules the interface shows — and
// returns ONE action; the caller performs it, either on the engine (headless) or as a tap or swipe on
// the matching element (UI bots). Works in Node and in the browser (no Node imports).
//
// Actions: play {uid, target?} · select {hero} (with a chain running: a Relay to that hero) ·
// finish (FINISH or CASH OUT) · churn {uid} · stash {uid} · spend {what} · wait.
//
// profiles (docs/COMBAT_SPEC.md §7.1: up to 3 commands may wait behind the executing one):
//   'quick'   — keeps up to 3 commands queued, Relays whenever another hero can follow up, uses every tool
//   'regular' — keeps up to 2 commands queued, Relays to a hero with an arte in hand, uses every tool
//   'learner' — waits for each command to finish before choosing the next, no Momentum shortcuts,
//               Churn only for Glitch, support only when obviously useful, picks the first hero
//               showing a ★, Relays only to a hero whose arte is in hand
import { CARDS } from '../../src/data/cards.js';

const def = (c, u) => CARDS[c.cards.get(u).id];
const cat = (c, u) => def(c, u).category;
const cards = (c) => [...c.hand, ...c.reserve].filter(Boolean);
export const QUEUE_AHEAD = { quick: 3, regular: 2, learner: 0 };
// Flow a player wants left before handing over (the new hero still needs a basic attack and an arte;
// the Flow bar shows it). SB_NAIVE_RELAY=1 drops the check, to measure a player who relays regardless.
export const RELAY_MIN_FLOW = { quick: 1.2, regular: 2.0, learner: 4.0, naive: 0 };
const naiveRelay = () => typeof process !== 'undefined' && process.env && process.env.SB_NAIVE_RELAY === '1';

// The hero who should start the next chain: a Ready hero whose artes (hand + Reserve) can be reached
// with the basic attacks in hand. Score = cheapest reachable arte, more artes as a tie-break.
export function bestHero(c, profile = 'regular') {
  const basics = cards(c).filter((u) => cat(c, u) === 'basic' && !c.isLocked(u));
  const gainSum = basics.map((u) => def(c, u).gain).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) + 1;
  const reach = c.available() + gainSum;
  let best = null;
  for (const id of ['V', 'C', 'S']) {
    if (!c.heroReady(id)) continue;
    const artes = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === id && !c.isLocked(u));
    if (!artes.length) continue;
    if (profile === 'learner') return id; // the first Ready hero showing a ★
    const reachable = artes.filter((u) => def(c, u).cost <= reach);
    const score = (reachable.length ? 100 : 0) + artes.length * 10 - Math.min(...artes.map((u) => def(c, u).cost));
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : c.starter();
}

function danger(c) {
  return c.aliveEnemies().some((e) => e.atb > 0.72 && e.intent && e.intent.dmg > 0 && (e.intent.kind === 'atk' || e.intent.kind === 'aoe'));
}

// A support card worth playing now (its performer is free: check() says so), or null.
function usefulSupport(c, profile) {
  const sup = cards(c).filter((u) => cat(c, u) === 'support' && c.check(u).ok);
  if (!sup.length) return null;
  const id = (u) => def(c, u).id;
  const hurt = c.hp < c.maxHp * (profile === 'learner' ? 0.5 : 0.72);
  const pick = (pred) => sup.find(pred) || null;
  if (hurt) { const h = pick((u) => id(u) === 'mend_circuit'); if (h) return h; }
  if (danger(c) && c.guard < 8) { const g = pick((u) => (def(c, u).tags || []).includes('guard') && id(u) !== 'mend_circuit'); if (g) return g; }
  if (danger(c)) { const b = pick((u) => id(u) === 'hold_the_line'); if (b) return b; }
  if (profile === 'learner') return null;
  if (c.churn.charges < 2) { const s = pick((u) => id(u) === 'spare_parts'); if (s) return s; }
  if (c.available() < 2) { const m = pick((u) => id(u) === 'low_gear'); if (m) return m; }
  const stuck = c.hand.filter((u) => u && !c.check(u).ok && !c.isLocked(u)).length;
  if (stuck >= 3) { const s = pick((u) => id(u) === 'shuffle_step'); if (s) return s; }
  if (c.aliveEnemies().length >= 2) { const s = pick((u) => id(u) === 'signal_boost'); if (s) return s; }
  // free Guard support with nothing better to do between chains
  if (!c.combo && c.guard < 6) { const g = pick((u) => def(c, u).cost === 0 && (def(c, u).tags || []).includes('guard')); if (g) return g; }
  return null;
}

// the cheapest playable support card (to cycle the hand), or null
function cheapestSupport(c) {
  const sup = cards(c).filter((u) => cat(c, u) === 'support' && c.check(u).ok);
  sup.sort((a, b) => def(c, a).cost - def(c, b).cost);
  return sup[0] || null;
}

// Momentum the queued (and executing, unresolved) basic attacks will add when they resolve.
function pendingGain(c) {
  const cmds = [...(c.executing && !c.executing.resolved ? [c.executing.cmd] : []), ...c.queue];
  return cmds.filter((q) => q.type === 'card' && q.category === 'basic').reduce((a, q) => a + (def(c, q.uid).gain || 0), 0);
}

// A hero to hand the chain to: Ready, eligible (relayCheck), with an arte in hand or Reserve and a basic
// attack left to open their segment. The quick player also relays to a hero who only has basics when
// the current one has nothing left (Relays pay Momentum and hold the decision window).
function relayTarget(c, profile) {
  const basicsLeft = cards(c).filter((u) => cat(c, u) === 'basic' && !c.isLocked(u)).length;
  if (!basicsLeft) return null;
  const minFlow = naiveRelay() ? 0 : RELAY_MIN_FLOW[profile] !== undefined ? RELAY_MIN_FLOW[profile] : 2;
  if (c.flowLeft() < minFlow) return null;
  let best = null;
  for (const id of ['V', 'C', 'S']) {
    if (!c.relayCheck(id).ok) continue;
    const artes = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === id && !c.isLocked(u));
    const reach = c.available() + 3;
    const ok = artes.some((u) => def(c, u).cost <= reach);
    if (!ok && !(profile === 'quick' && basicsLeft >= 2)) continue;
    const score = (ok ? 100 : 0) + artes.length;
    if (!best || score > best.score) best = { id, score };
  }
  return best ? best.id : null;
}

export function decide(c, { profile = 'regular', rng = Math.random } = {}) {
  if (c.phase === 'END' || c.phase === 'RECOVER') return { type: 'wait' };
  const tools = profile !== 'learner';
  const ahead = QUEUE_AHEAD[profile] !== undefined ? QUEUE_AHEAD[profile] : 1;
  const busy = !!(c.executing || c.queue.length);
  const junk = c.hand.find((u) => u && cat(c, u) === 'junk' && !c.isLocked(u));
  if (junk && c.churnJamUntil <= c.t) return { type: 'churn', uid: junk };
  // a learner watches each command finish; the others keep up to `ahead` commands waiting
  if (busy && c.queue.length >= ahead) return { type: 'wait' };
  if (tools && danger(c) && c.guard < 6 && c.available() >= 3 && !c.combo) return { type: 'spend', what: 'guard' };
  const sup = usefulSupport(c, profile);
  if (sup && (!c.combo || c.flowHeld() || c.flowLeft() > 2)) return { type: 'play', uid: sup };

  const P = c.proj();
  if (!P.open) {
    if (busy && profile === 'learner') return { type: 'wait' };
    const hero = bestHero(c, profile);
    if (hero && hero !== c.starter() && c.heroReady(hero)) return { type: 'select', hero };
    const basics = cards(c).filter((u) => cat(c, u) === 'basic' && c.check(u).ok);
    if (!basics.length) {
      if (!c.starter()) return { type: 'wait' }; // every hero is busy: wait for one
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

  // in a chain: judge everything on the projected segment
  const hero = P.hero;
  const legal = cards(c).filter((u) => cat(c, u) !== 'support' && c.check(u).ok);
  const artes = legal.filter((u) => cat(c, u) === 'arte');
  const basics = legal.filter((u) => cat(c, u) === 'basic');
  if (P.lastCmd === 'relay') {
    // the incoming hero opens with a basic attack; the one that best leads to their arte
    if (basics.length) {
      basics.sort((a, b) => c.effRank(a) - c.effRank(b));
      return { type: 'play', uid: basics[0] };
    }
    return { type: 'wait' };
  }
  if (artes.length) {
    artes.sort((a, b) => c.effRank(b) - c.effRank(a));
    return { type: 'play', uid: artes[0] };
  }
  if (P.last === 'arte') {
    // after an arte: hand over to a hero who can follow up, otherwise FINISH (a Perfect)
    const to = relayTarget(c, profile);
    if (to) return { type: 'select', hero: to };
    if (busy) return { type: 'wait' };
    if (c.canFinish()) return { type: 'finish' };
    return { type: 'wait' };
  }
  // an arte of this hero is in hand but not affordable yet: build Momentum with basic attacks
  const pending = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === hero && !c.isLocked(u) && c.effRank(u) > P.rank);
  if (pending.length) {
    const need = Math.min(...pending.map((u) => def(c, u).cost)) - c.available() - pendingGain(c);
    if (need <= 0 && busy) return { type: 'wait' }; // the gains on their way will pay for it
    if (basics.length) {
      const top = Math.min(...pending.map((u) => c.effRank(u)));
      const ok = basics.filter((u) => c.effRank(u) < top);
      const pool = ok.length ? ok : basics;
      pool.sort((a, b) => {
        const ga = def(c, a).gain + (c.effVariant(a) !== P.variant ? 1 : 0);
        const gb = def(c, b).gain + (c.effVariant(b) !== P.variant ? 1 : 0);
        return need > 0 ? gb - ga || c.effRank(a) - c.effRank(b) : c.effRank(a) - c.effRank(b);
      });
      return { type: 'play', uid: pool[0] };
    }
    if (busy) return { type: 'wait' };
  }
  // no arte coming for this hero: hand over to one who has one (a Relay may follow any card)
  if (!pending.length && P.seg >= 1) {
    const to = relayTarget(c, profile);
    if (to && (profile !== 'learner' || P.seg >= 2)) return { type: 'select', hero: to };
  }
  if (basics.length) {
    if (P.cards >= 3 && c.canCashOut() && rng() < 0.5) return { type: 'finish' };
    basics.sort((a, b) => c.effRank(a) - c.effRank(b));
    return { type: 'play', uid: basics[0] };
  }
  if (busy) return { type: 'wait' };
  if (c.canCashOut()) return { type: 'finish' };
  // stuck after one card: a support card draws a replacement that may continue the chain
  const cycle = c.flowLeft() > 1 ? cheapestSupport(c) : null;
  if (cycle) return { type: 'play', uid: cycle };
  if (tools && c.churn.charges > 0 && c.flowLeft() > 1) {
    const bad = c.hand.find((u) => u && !c.check(u).ok && !c.isLocked(u) && cat(c, u) !== 'support' && !(cat(c, u) === 'arte' && def(c, u).owner === hero));
    if (bad) return { type: 'churn', uid: bad };
  }
  if (tools && c.reserve.length < c.reserveMax() && c.reserveLatchUntil <= c.t) {
    // keep another hero's arte for that hero's next chain instead of clogging the hand
    const other = c.hand.find((u) => u && cat(c, u) === 'arte' && def(c, u).owner !== hero && !c.isLocked(u));
    if (other && c.canStash(other)) return { type: 'stash', uid: other };
  }
  return { type: 'wait' };
}

// Performs an action on the engine (headless players). Returns the engine's result.
export function perform(c, a) {
  switch (a.type) {
    case 'play': return c.playCard(a.uid, a.target ? { target: a.target } : undefined);
    case 'select': return c.selectHero(a.hero);
    case 'finish': return c.finishOrCashOut();
    case 'churn': return c.churnCard(a.uid);
    case 'stash': return c.stash(a.uid);
    case 'cancel': return c.cancelCmd(a.id);
    case 'spend': return a.what === 'guard' ? c.spendMomentumGuard() : c.spendMomentumFlow();
    default: return { ok: true };
  }
}
