// Relay accessibility lab (Phase 6, docs/AUDIT.md): opening Act I fights played through the real engine
// by players of different speeds and Relay habits, with every Relay timed from decision to the incoming
// hero's arte.
//
//   node tools/relaylab.mjs [battles per fight = 30] [--paces=1.3,2.0,2.5,3.0] [--policies=careful,active,none]
//        [--quick] [--model=p6|p5] [--set=RULE=value,...] [--fights=opening|act1] [--json]
//
// Players: the slow learner of tools/pacing.mjs (reads a new hand for 2.5s, `pace` seconds between
// commands, 8% mistaken taps, waits for each command to finish) with one of three Relay habits:
//   careful — relays only with enough Flow left (tools/lib/bot.mjs RELAY_MIN_FLOW, 4s for this player)
//   active  — relays whenever another Ready hero has an arte to follow up with, whatever Flow is left
//   none    — never relays
// plus, with --quick, the quick experienced player (0.4s, up to 3 commands queued).
// Model p6 (default): a Relay is a decision like a card — the next command comes `pace` seconds after
// it (the player has to find the incoming hero's basic attack). Model p5 reproduces the 0.2.5
// measurement, where the card after a Relay was played the moment the Relay finished executing.
// --set changes RULES entries for a controlled experiment (nothing is shipped this way).
import { Run } from '../src/engine/run.js';
import { Combat, RULES } from '../src/engine/combat.js';
import { RNG } from '../src/core/rng.js';
import { decide, perform } from './lib/bot.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +(args.find((a) => /^\d+$/.test(a)) || 30);
const SEED0 = +opt('seed0', 0); // a different block of seeds for a robustness check
const PACES = opt('paces', '1.3,2.0,2.5,3.0').split(',').map(Number);
const POLICIES = opt('policies', 'careful,active,none').split(',');
const MODEL = opt('model', 'p6');
const JSON_OUT = args.includes('--json');
for (const kv of opt('set', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k in RULES)) throw new Error(`unknown rule ${k}`);
  RULES[k] = v === 'true' ? true : v === 'false' ? false : +v;
}
if (process.env.SB_RELAY_NEEDS_ARTE === '1') RULES.RELAY_NEEDS_ARTE = true;

const OPENING = [
  { name: 'tutorial: hound + jammer', enemies: ['rush_hound', 'wire_jammer'], depth: 0, tutorial: true },
  { name: 'd0: 2 hounds', enemies: ['rush_hound', 'rush_hound'], depth: 0 },
  { name: 'd0: hound + mite', enemies: ['rush_hound', 'interference_mite'], depth: 0 },
  { name: 'd1: 2 mites + hound', enemies: ['interference_mite', 'interference_mite', 'rush_hound'], depth: 1 },
  { name: 'd1: jammer + hound', enemies: ['wire_jammer', 'rush_hound'], depth: 1 },
  { name: 'd1: iron maw', enemies: ['iron_maw'], depth: 1 },
  { name: 'd2: snare + mite', enemies: ['churn_snare', 'interference_mite'], depth: 2 },
  { name: 'd2: jammer + 2 mites', enemies: ['wire_jammer', 'interference_mite', 'interference_mite'], depth: 2 },
];
const LATER = [
  { name: 'd4: snare + hound + jammer', enemies: ['churn_snare', 'rush_hound', 'wire_jammer'], depth: 4 },
  { name: 'elite d3: foundry warden', enemies: ['foundry_warden'], depth: 3, tier: 1.65 },
  { name: 'elite d4: hound mother', enemies: ['hound_mother'], depth: 4, tier: 1.65 },
  { name: 'boss: scrap tyrant', enemies: ['scrap_tyrant'], depth: 8, tier: 1.5 },
  { name: 'boss: clockwork regent', enemies: ['clockwork_regent'], depth: 8, tier: 1.5 },
];
const FIGHTS = opt('fights', 'opening') === 'act1' ? [...OPENING, ...LATER] : OPENING;

const PLAYERS = [];
for (const pace of PACES) for (const relay of POLICIES) PLAYERS.push({ key: `${relay}${pace}`, read: 2.5, card: pace, misTap: 0.08, profile: 'learner', relay });
if (args.includes('--quick')) PLAYERS.push({ key: 'quick', read: 0.4, card: 0.4, misTap: 0, profile: 'quick', relay: 'careful' });

export function setupFor(enc, seed) {
  const run = Run.create({ seed, tutorial: false });
  return {
    deck: run.d.deck.map((c) => ({ ...c })), party: run.d.party.map((p) => ({ ...p })), hp: run.d.hp, maxHp: run.d.maxHp,
    enemies: enc.enemies, seed: seed * 31 + 7, relics: [], mutations: [], trait: null,
    kind: enc.tier === 1.5 ? 'boss' : enc.tier ? 'elite' : 'normal', act: 1,
    hpMult: (enc.tier || 1.75) * (1 + enc.depth * 0.035), dmgMult: 1.1 * (1 + enc.depth * 0.02),
    prep: {}, tutorial: !!enc.tutorial, depth: enc.depth,
  };
}

function play(enc, P, seed) {
  const rng = new RNG(seed * 13 + 5);
  const c = new Combat(setupFor(enc, seed));
  const hp0 = c.hp;
  const dt = 1 / 60;
  const m = {
    chains: 0, dropped: 0, multi: 0, multiDone: 0, droppedAfterRelay: 0, relayChains: 0,
    attempts: 0, handoffs: 0, relayCancelled: 0, flowAtRelay: [], toBasic: [], toArte: [], cardsAfterRelay: 0,
    segAfterRelayArte: 0, segAfterRelay: 0, declined: 0, oppChains: 0, refundAfterRelay: 0,
    dropSeg: [0, 0, 0], // dropped chains by the segment they were in (1st, 2nd, 3rd hero)
    bucket: [[0, 0], [0, 0], [0, 0], [0, 0]], // Relays by Flow left at the tap (<1s, 1-2s, 2-3s, 3s+): [Relays, chains then dropped]
  };
  let chainBuckets = [];
  let think = P.read;
  let handSig = '';
  let seg = null; // the incoming segment being timed: { relayEnd, basicAt, arteAt, cards, refund0 }
  let opp = false; // a useful Relay was possible during this chain
  let relayedThisChain = false;
  for (let i = 0; i < 60 * 900 && c.phase !== 'END'; i++) {
    c.update(dt);
    for (const ev of c.drainEvents()) {
      if (ev.type === 'commit' && ev.cmdType === 'relay') {
        m.attempts++; m.flowAtRelay.push(c.flowLeft()); relayedThisChain = true;
        const b = Math.min(3, Math.floor(c.flowLeft()));
        m.bucket[b][0]++; chainBuckets.push(b);
      }
      if (ev.type === 'cancel' && ev.cmdType === 'relay') m.relayCancelled++;
      if (ev.type === 'execEnd' && ev.cmdType === 'relay') { m.handoffs++; m.segAfterRelay++; seg = { relayEnd: c.t, basicAt: null, arteAt: null, refund0: c.combo ? c.combo.refundUsed : 0 }; }
      if (ev.type === 'commit' && ev.cmdType === 'card' && seg && c.combo) {
        const cat = c.categoryOf(ev.uid);
        m.cardsAfterRelay++;
        if (cat === 'basic' && seg.basicAt === null) { seg.basicAt = c.t; m.toBasic.push(c.t - seg.relayEnd); }
        if (cat === 'arte' && seg.arteAt === null) { seg.arteAt = c.t; m.toArte.push(c.t - seg.relayEnd); m.segAfterRelayArte++; }
      }
      if (ev.type === 'comboEnd') {
        m.chains++;
        if (ev.kind === 'forced') { m.dropped++; m.dropSeg[Math.min(3, ev.owners.length) - 1]++; for (const b of chainBuckets) m.bucket[b][1]++; }
        chainBuckets = [];
        if (ev.owners.length >= 2) { m.multi++; if (ev.kind !== 'forced') m.multiDone++; }
        if (ev.relays > 0) { m.relayChains++; if (ev.kind === 'forced') m.droppedAfterRelay++; }
        if (seg && c.combo === null) m.refundAfterRelay += 0; // refunds are read before the chain closes (below)
        if (opp && !relayedThisChain) m.declined++;
        if (opp) m.oppChains++;
        seg = null; opp = false; relayedThisChain = false;
      }
    }
    if (seg && c.combo) seg.refund = c.combo.refundUsed - seg.refund0;
    if (c.phase === 'END') break;
    const sig = c.hand.join(',');
    if (sig !== handSig) {
      const changed = c.hand.filter((u, k) => u && handSig.split(',')[k] !== String(u)).length;
      if (changed >= 3) think = Math.max(think, P.read * (0.75 + rng.next() * 0.5));
      handSig = sig;
    }
    think -= dt;
    if (think > 0) continue;
    think = P.card * (0.75 + rng.next() * 0.5);
    if (P.misTap && c.phase === 'ACTIVE' && rng.chance(P.misTap)) {
      const bad = c.hand.find((u) => u && !c.check(u).ok && c.categoryOf(u) !== 'junk');
      if (bad) { c.playCard(bad); continue; }
    }
    const a = decide(c, { profile: P.profile, rng: () => rng.next(), relay: P.relay });
    // would an active player relay here? (a useful Relay this player chose not to take)
    if (c.combo && P.relay !== 'active' && a.type !== 'select') {
      const alt = decide(c, { profile: P.profile, rng: () => 0.99, relay: 'active' });
      if (alt.type === 'select') opp = true;
    } else if (a.type === 'select' && c.combo) opp = true;
    const relayTap = a.type === 'select' && !!c.combo;
    // pre-chain hero choice and FINISH / CASH OUT are quick taps; a Relay is a decision like a card
    // in model p6 (the next card has to be found for the incoming hero)
    if (a.type === 'finish' || (a.type === 'select' && (!relayTap || MODEL === 'p5'))) think = Math.min(think, 0.35);
    perform(c, a);
    if (a.type === 'wait') think = 0.15;
  }
  return { win: !!(c.result && c.result.victory), t: c.t, hpLost: (hp0 - Math.max(0, c.hp)) / hp0, m };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (rs, k) => rs.reduce((a, r) => a + r.m[k], 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const rows = [];
for (const enc of FIGHTS) {
  for (const P of PLAYERS) {
    const rs = [];
    for (let s = 1; s <= N; s++) rs.push(play(enc, P, SEED0 + s));
    const chains = sum(rs, 'chains');
    rows.push({
      fight: enc.name, player: P.key, win: mean(rs.map((r) => (r.win ? 1 : 0))), hpLost: mean(rs.map((r) => r.hpLost)), seconds: mean(rs.map((r) => r.t)),
      // dropped: the R2 measure of tools/pacing.mjs (each battle's share of dropped chains, averaged);
      // pooled: all chains of all battles together
      chains: chains / N, dropped: mean(rs.map((r) => (r.m.chains ? r.m.dropped / r.m.chains : 0))), pooled: chains ? sum(rs, 'dropped') / chains : 0,
      attempts: sum(rs, 'attempts') / N, handoffs: sum(rs, 'handoffs') / N, relayCancelled: sum(rs, 'relayCancelled') / N,
      relayChainShare: chains ? sum(rs, 'relayChains') / chains : 0,
      multiDone: sum(rs, 'multiDone') / N, droppedAfterRelay: sum(rs, 'relayChains') ? sum(rs, 'droppedAfterRelay') / sum(rs, 'relayChains') : 0,
      cardsAfterRelay: sum(rs, 'handoffs') ? sum(rs, 'cardsAfterRelay') / sum(rs, 'handoffs') : 0,
      arteAfterRelay: sum(rs, 'segAfterRelay') ? sum(rs, 'segAfterRelayArte') / sum(rs, 'segAfterRelay') : 0,
      flowAtRelay: mean(rs.flatMap((r) => r.m.flowAtRelay)), toBasic: mean(rs.flatMap((r) => r.m.toBasic)), toArte: mean(rs.flatMap((r) => r.m.toArte)),
      declined: sum(rs, 'oppChains') ? sum(rs, 'declined') / sum(rs, 'oppChains') : 0,
      dropSeg: [0, 1, 2].map((k) => rs.reduce((a, r) => a + r.m.dropSeg[k], 0) / N),
      bucket: [0, 1, 2, 3].map((k) => [rs.reduce((a, r) => a + r.m.bucket[k][0], 0), rs.reduce((a, r) => a + r.m.bucket[k][1], 0)]),
    });
  }
}
if (JSON_OUT) console.log(JSON.stringify({ model: MODEL, rules: { RELAY_HOLD: RULES.RELAY_HOLD, FLOW_READ_GRACE: RULES.FLOW_READ_GRACE, FLOW_REFUND: RULES.FLOW_REFUND, FLOW_REFUND_MAX: RULES.FLOW_REFUND_MAX }, rows }, null, 1));
else {
  console.log(`model ${MODEL} · RELAY_HOLD ${RULES.RELAY_HOLD}s · ${N} battles per fight and player`);
  console.log('fight                        player      win hpLost chains dropped | relays done canc  relay%  multi✓ drop|relay cards/relay arte|relay flow@relay →basic →arte declined');
  for (const r of rows) {
    console.log(`${r.fight.padEnd(28)} ${r.player.padEnd(11)} ${pct(r.win).padStart(4)} ${pct(r.hpLost).padStart(6)} ${r.chains.toFixed(1).padStart(6)} ${pct(r.dropped).padStart(7)} | ${r.attempts.toFixed(2).padStart(6)} ${r.handoffs.toFixed(2).padStart(4)} ${r.relayCancelled.toFixed(2).padStart(4)} ${pct(r.relayChainShare).padStart(7)} ${r.multiDone.toFixed(2).padStart(7)} ${pct(r.droppedAfterRelay).padStart(10)} ${r.cardsAfterRelay.toFixed(2).padStart(11)} ${pct(r.arteAfterRelay).padStart(10)} ${r.flowAtRelay.toFixed(2).padStart(10)} ${r.toBasic.toFixed(2).padStart(6)} ${r.toArte.toFixed(2).padStart(5)} ${pct(r.declined).padStart(8)}`);
  }
  // per player over all fights (opening-fight summary used for R2)
  console.log('\nsummary over the fights above (mean of fights; R2 limit: 25% dropped at ~2.5s per card)');
  console.log('player      dropped(max fight) relays/battle relay% multi-hero✓/battle drop|relay win  drops in seg 1/2/3 per battle  Relays by Flow left <1/1-2/2-3/3+ s (share then dropped)');
  for (const P of PLAYERS) {
    const rr = rows.filter((r) => r.player === P.key);
    const worst = rr.reduce((a, r) => (r.dropped > a.dropped ? r : a), rr[0]);
    const seg = [0, 1, 2].map((k) => mean(rr.map((r) => r.dropSeg[k])).toFixed(2)).join('/');
    const bk = [0, 1, 2, 3].map((k) => { const n = rr.reduce((a, r) => a + r.bucket[k][0], 0); const d = rr.reduce((a, r) => a + r.bucket[k][1], 0); return n ? `${n}(${pct(d / n)})` : '-'; }).join(' ');
    console.log(`${P.key.padEnd(11)} ${pct(mean(rr.map((r) => r.dropped))).padStart(5)} (${pct(worst.dropped)} ${worst.fight.split(':')[0]}) ${mean(rr.map((r) => r.attempts)).toFixed(2).padStart(9)} ${pct(mean(rr.map((r) => r.relayChainShare))).padStart(6)} ${mean(rr.map((r) => r.multiDone)).toFixed(2).padStart(13)} ${pct(mean(rr.map((r) => r.droppedAfterRelay))).padStart(10)} ${pct(mean(rr.map((r) => r.win))).padStart(4)}  ${seg.padStart(14)}  ${bk}`);
  }
}
