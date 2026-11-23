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
//
// `ex: true` (Phase 7) is a player who has read the Combo Journal (src/data/recipes.js): with the same
// hand it orders its legal choices towards EX Combo recipes — climbing W→M→S before the arte, Cashing
// Out quickly, buying Flow to reach 6 cards, a heal or Hessa's Cover from another hero mid-chain, a
// Churn before the arte. It never builds a recipe the engine has not seen executed, and plays nothing
// check() would refuse; recipes trigger only through the engine (tools/recipelab.mjs counts them).
import { CARDS } from '../../src/data/cards.js';

const def = (c, u) => CARDS[c.cards.get(u).id];
const cat = (c, u) => def(c, u).category;
const cards = (c) => [...c.hand, ...c.reserve].filter(Boolean);
export const QUEUE_AHEAD = { quick: 3, regular: 2, learner: 0 };
// Flow a player wants left before handing over (the new hero still needs a basic attack and an arte;
// the Flow bar shows it). SB_NAIVE_RELAY=1 drops the check, to measure a player who relays regardless.
export const RELAY_MIN_FLOW = { quick: 1.2, regular: 2.0, learner: 4.0, naive: 0 };
const naiveRelay = () => typeof process !== 'undefined' && process.env && process.env.SB_NAIVE_RELAY === '1';
// Relay policies (tools/relaylab.mjs, docs/AUDIT.md Phase 6): 'careful' checks the Flow bar first
// (RELAY_MIN_FLOW by profile, the default), 'active' relays whenever another hero can follow up,
// whatever Flow is left, 'none' never relays.
export const RELAY_POLICIES = ['careful', 'active', 'none'];

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
function relayTarget(c, profile, policy = 'careful') {
  if (policy === 'none') return null;
  const basicsLeft = cards(c).filter((u) => cat(c, u) === 'basic' && !c.isLocked(u)).length;
  if (!basicsLeft) return null;
  const minFlow = naiveRelay() || policy === 'active' ? 0 : RELAY_MIN_FLOW[profile] !== undefined ? RELAY_MIN_FLOW[profile] : 2;
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

// The cards of the projected current part of the chain (executed ones, then the executing and queued
// commands after the last Relay): printed strength (basic attacks 1-3), category and suit.
function projSeg(c) {
  const cm = c.combo;
  let seg = cm ? cm.cards.slice(cm.cards.length - cm.segCards).map((e) => ({ s: e.strength || 0, cat: e.category, v: e.variant })) : [];
  const cmds = [...(c.executing && !c.executing.resolved ? [c.executing.cmd] : []), ...c.queue];
  for (const q of cmds) {
    if (q.type === 'relay') seg = [];
    else if (q.type === 'card' && q.category !== 'support') { const d = def(c, q.uid); seg.push({ s: d.category === 'basic' ? d.rank : 0, cat: q.category, v: q.variant }); }
  }
  return seg;
}
// Phase 8 techniques (docs/COMBAT_SPEC.md §29): when the active hero's arte is out of reach because the
// combo's rank is already as high, a free ally's technique that lowers the rank enough brings it back.
function techMove(c, P, hero) {
  const techs = cards(c).filter((u) => def(c, u).tech && c.check(u).ok);
  if (!techs.length) return null;
  const blocked = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === hero && !c.isLocked(u) && c.check(u).reason === 'rank');
  if (!blocked.length) return null;
  for (const t of techs) {
    const fx = c.techOf(t, c.reserve.includes(t));
    if (!fx.rewind) continue;
    const after = Math.max(0, P.rank - fx.rewind);
    const budget = c.available() - (def(c, t).cost || 0) + pendingGain(c);
    if (blocked.some((u) => c.effRank(u) > after && def(c, u).cost <= budget)) return { type: 'play', uid: t };
  }
  return null;
}
const chainHas = (c, k) => !!(c.combo && c.combo.log && c.combo.log.some((l) => l.k === k));
const QUICK_LEFT = 2.5; // RULES.QUICK_CASH_LEFT (Flow left for a Quick Cash Out)

// A recipe-minded move inside a chain (not right after a Relay), or null to fall back to the base policy.
function exMove(c, P, hero, artes, basics, busy) {
  const seg = projSeg(c);
  const left = c.flowLeft();
  const mine = cards(c).filter((u) => cat(c, u) === 'arte' && def(c, u).owner === hero && !c.isLocked(u));
  const ok = (u) => c.check(u).ok;
  const sup = cards(c).filter((u) => cat(c, u) === 'support' && ok(u));
  // Healing Cadence: another hero's heal during the chain, when the party is hurt
  if (P.seg >= 1 && left > 1.5 && c.hp < c.maxHp * 0.9) {
    const h = sup.find((u) => def(c, u).id === 'mend_circuit' && def(c, u).owner !== hero);
    if (h) return { type: 'play', uid: h };
  }
  // Iron Harmony: Hessa's Guard support (her Cover) during another hero's chain, before that hero's arte
  if (hero !== 'V' && P.seg >= 1 && mine.length && left > 1.8 && !chainHas(c, 'support')) {
    const g = sup.find((u) => def(c, u).owner === 'V' && (def(c, u).tags || []).includes('guard'));
    if (g) return { type: 'play', uid: g };
  }
  // Second Wind: buy Flow once when the hand can carry the chain to 6 cards
  const left6 = 6 - P.cards;
  const fuel = cards(c).filter((u) => cat(c, u) !== 'support' && cat(c, u) !== 'junk' && !c.isLocked(u)).length;
  if (P.cards >= 2 && left6 > 0 && fuel >= left6 && !chainHas(c, 'flow') && left < 3 && c.available() >= c.momentumCostFlow() + 2 && c.combo.deadline < c.flowCap() - 1) return { type: 'spend', what: 'flow' };
  // Straight Circuit: one hero's part opens Weak, Medium, Strong before their arte
  const ladder = seg.length < 3 && seg.every((e, i) => e.cat === 'basic' && e.s === i + 1);
  if (ladder && seg.length && mine.length && left > 1.2 + 0.6 * (3 - seg.length)) {
    const next = basics.find((u) => def(c, u).rank === seg.length + 1);
    const reach = c.available() + pendingGain(c) + (next ? def(c, next).gain || 0 : 0);
    if (next && mine.some((u) => def(c, u).cost <= reach + 2)) return { type: 'play', uid: next };
  }
  // Salvage Circuit: dig with a Churn while no arte is playable, then play what it brought in
  const drew = c.combo && c.combo.log ? c.combo.log.filter((l) => l.k === 'churn' && l.drew).map((l) => l.drew) : [];
  const found = drew.find((u) => (c.hand.includes(u) || c.reserve.includes(u)) && ok(u) && cat(c, u) !== 'support');
  if (found && !(cat(c, found) === 'basic' && artes.length && left < 1.5)) return { type: 'play', uid: found };
  if (!artes.length && mine.length && c.churn.charges > 0 && !drew.length && left > 2 && c.churnJamUntil <= c.t) {
    const dead = c.hand.find((u) => u && cat(c, u) === 'basic' && !ok(u) && !c.isLocked(u)); // a basic attack too low to follow
    if (dead) return { type: 'churn', uid: dead };
  }
  // Cross Current / Prism Sequence: a suit technique (Prism Cut) before an A or B basic, so it Crosses
  const crosses = seg.slice(1).filter((e, i) => e.v && seg[i].v && e.v !== seg[i].v).length;
  if (!artes.length && crosses < 2 && seg.length >= 1 && mine.length) {
    const suitTech = cards(c).find((u) => def(c, u).tech && c.check(u).ok && c.techOf(u, c.reserve.includes(u)).suit);
    const next = basics.find((u) => c.effVariant(u) !== 'EX');
    if (suitTech && next && P.variant !== 'EX') return { type: 'play', uid: suitTech };
  }
  // Cross Current: with two basic attacks to choose from and no arte yet, switch suits
  if (!artes.length && basics.length > 1 && !busy) {
    const other = basics.filter((u) => c.effVariant(u) !== P.variant).sort((a, b) => c.effRank(a) - c.effRank(b));
    if (other.length && mine.length) return { type: 'play', uid: other[0] };
  }
  return null;
}

// Phase 8 build tactics (docs/AUDIT.md Phase 8): a player who leans into the build their deck holds —
// Churning between chains to feed a Churn Engine, keeping the Reserve stocked for a Reserve deck,
// Cashing Out a chain that carries Cash Out cards, saving Momentum for a Momentum deck's big artes.
// `build` names the archetype tag, or 'auto' picks the tag held by the most non-starter cards (at least 4).
const deckBuild = (c) => {
  if (c._botBuild !== undefined) return c._botBuild;
  const n = {};
  for (const inst of c.cards.values()) { const d = CARDS[inst.id]; if (!d || d.rarity === 'starter') continue; for (const t of d.tags || []) n[t] = (n[t] || 0) + 1; }
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  c._botBuild = top && top[1] >= 4 ? top[0] : null;
  return c._botBuild;
};
const tagged = (c, u, t) => (def(c, u).tags || []).includes(t);
function buildMove(c, build, P, busy) {
  if (!build) return null;
  const free = !c.combo && !busy;
  if (build === 'churn' && c.churnJamUntil <= c.t) {
    // between chains, Churn a card that is no use now: the payoffs grow with every Churn this battle
    const keep = 1 + (cards(c).some((u) => ['scrap_feed', 'recycler', 'salvage', 'spare_parts'].includes(def(c, u).id)) ? 0 : 1);
    if (free && c.churn.charges > keep) {
      const dud = c.hand.find((u) => u && !c.isLocked(u) && !tagged(c, u, 'churn') && (cat(c, u) === 'support' ? !c.check(u).ok : cat(c, u) === 'arte' && !c.heroReady(def(c, u).owner)));
      const low = c.hand.filter((u) => u && cat(c, u) === 'basic' && !tagged(c, u, 'churn')).sort((a, b) => c.effRank(a) - c.effRank(b));
      const target = dud || (low.length >= 3 ? low[low.length - 1] : null);
      if (target) return { type: 'churn', uid: target };
    }
  }
  if (build === 'reserve' && free && c.reserve.length < c.reserveMax() && c.reserveLatchUntil <= c.t) {
    // keep the Reserve stocked: a Reserve-tagged card (they pay off from there), else a spare basic attack
    const r = c.hand.find((u) => u && tagged(c, u, 'reserve') && cat(c, u) !== 'arte' && c.canStash(u));
    const spare = c.hand.filter((u) => u && cat(c, u) === 'basic' && c.canStash(u));
    const u = r || (c.reserve.length === 0 && spare.length >= 3 ? spare[0] : null);
    if (u) return { type: 'stash', uid: u };
  }
  if (build === 'reserve' && !c.combo) {
    // open from the Reserve with a card that pays off there (Hidden Ace)
    const ace = c.reserve.find((u) => tagged(c, u, 'reserve') && cat(c, u) === 'basic' && c.check(u).ok);
    if (ace) return { type: 'play', uid: ace };
  }
  if (build === 'cashout' && P.open && !busy && P.cards >= 2 && c.canCashOut() && c.combo) {
    // a chain carrying a Cash Out card ends in a Cash Out rather than pushing on
    if (c.combo.cards.some((e) => (CARDS[e.id].tags || []).includes('cashout'))) return { type: 'finish' };
  }
  return null;
}

export function decide(c, { profile = 'regular', rng = Math.random, relay = 'careful', ex = false, build = null } = {}) {
  if (c.phase === 'END' || c.phase === 'RECOVER') return { type: 'wait' };
  const tools = profile !== 'learner';
  const ahead = QUEUE_AHEAD[profile] !== undefined ? QUEUE_AHEAD[profile] : 1;
  const busy = !!(c.executing || c.queue.length);
  const junk = c.hand.find((u) => u && cat(c, u) === 'junk' && !c.isLocked(u));
  if (junk && c.churnJamUntil <= c.t) return { type: 'churn', uid: junk };
  // a learner watches each command finish; the others keep up to `ahead` commands waiting
  if (busy && c.queue.length >= ahead) return { type: 'wait' };
  if (tools && danger(c) && c.guard < 6 && c.available() >= 3 && !c.combo && !((build === 'auto' ? deckBuild(c) : build) === 'momentum' && c.hp > c.maxHp * 0.5)) return { type: 'spend', what: 'guard' };
  const sup = usefulSupport(c, profile);
  if (sup && (!c.combo || c.flowHeld() || c.flowLeft() > 2)) return { type: 'play', uid: sup };

  const P = c.proj();
  const bm = buildMove(c, build === 'auto' ? deckBuild(c) : build, P, busy);
  if (bm) return bm;
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
    if (ex) {
      // Stored Strike: open with a basic attack kept in the Reserve; between combos, keep a spare Weak one there
      const kept = basics.find((u) => c.reserve.includes(u) && c.effRank(u) === c.effRank(basics[0]));
      if (kept) return { type: 'play', uid: kept };
      const weak = c.hand.filter((u) => u && cat(c, u) === 'basic' && def(c, u).rank === 1 && !c.isLocked(u));
      if (!busy && weak.length >= 2 && c.reserve.length < c.reserveMax() && c.reserveLatchUntil <= c.t && c.canStash(weak[1])) return { type: 'stash', uid: weak[1] };
    }
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
  if (ex) { const m = exMove(c, P, hero, artes, basics, busy); if (m) return m; }
  if (artes.length) {
    artes.sort((a, b) => c.effRank(b) - c.effRank(a));
    return { type: 'play', uid: artes[0] };
  }
  if (P.last === 'arte' && !busy) {
    const tm = techMove(c, P, hero);
    if (tm) return tm;
  }
  if (P.last === 'arte') {
    // after an arte: hand over to a hero who can follow up, otherwise FINISH (a Perfect)
    const to = relayTarget(c, profile, relay);
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
    const to = relayTarget(c, profile, relay);
    if (to && (profile !== 'learner' || P.seg >= 2)) return { type: 'select', hero: to };
  }
  // Quick Settlement: a Cash Out of 3+ cards with Flow to spare
  if (ex && !pending.length && P.cards >= 3 && c.canCashOut() && c.flowLeft() >= QUICK_LEFT && !busy && c.combo && c.combo.cards.some((e) => e.cross)) return { type: 'finish' };
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
