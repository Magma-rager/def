// Phase 8 build investigations (docs/AUDIT.md Phase 8, assignment §13–15): Suit Switching, Churn Engine,
// Momentum Burst and Interference Exploit, measured in real bot-played battles (tools/lib/bot.mjs, the
// build's tactics on, ordinary and recipe-aware) with decks of two origins:
//   drafted — starter deck + 7 cards of the tag + 3 others (as tools/recipelab.mjs layer A)
//   natural — decks a build-focused player assembled through ordinary offers (tools/simulate.mjs
//             --build=each with SB_DECKS=<file>; the deck as it reached the Act I and Act II bosses)
// Everything is read from the engine's own records (chain logs, history, stats, events); nothing is
// injected. Usage: node tools/buildlab.mjs [decks=12] [reaction=1.0] [--natural=<file>]
import fs from 'node:fs';
import { Combat } from '../src/engine/combat.js';
import { CARDS, STARTER_DECK, rewardPool } from '../src/data/cards.js';
import { FORMATIONS, ELITES, BOSSES, ENEMIES } from '../src/data/enemies.js';
import { RNG } from '../src/core/rng.js';
import { decide, perform } from './lib/bot.mjs';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const DECKS = +(pos[0] || 12);
const REACT = +(pos[1] || 1.0);
const NATURAL = (args.find((a) => a.startsWith('--natural=')) || '').slice(10) || null;
const PARTY = [{ id: 'V' }, { id: 'C' }, { id: 'S' }];
const POOL = rewardPool();
const natural = NATURAL && fs.existsSync(NATURAL) ? fs.readFileSync(NATURAL, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];

function draft(arch, rng) {
  const ids = STARTER_DECK.map((s) => s.id);
  const tagged = POOL.filter((c) => c.tags.includes(arch));
  const other = POOL.filter((c) => !c.tags.includes(arch));
  for (let i = 0; i < 7; i++) ids.push(rng.pick(tagged).id);
  for (let i = 0; i < 3; i++) ids.push(rng.pick(other).id);
  return ids.map((id, i) => ({ uid: `d${i}`, id, up: rng.next() < 0.25 }));
}
const decksFor = (arch) => [
  ...Array.from({ length: DECKS }, (_, d) => ({ origin: 'drafted', deck: draft(arch, new RNG(7000 + d * 37 + arch.length * 101)), acts: [1, 2], relics: [], mutations: [] })),
  ...natural.filter((x) => x.target === arch && x.act <= 2).slice(0, DECKS).map((x) => ({ origin: 'natural', deck: x.deck, acts: [x.act], relics: x.relics || [], mutations: x.mutations || [] })),
];
const encounters = (act) => [...FORMATIONS[act].slice(0, 6).map((x) => [x[1], 'normal']), ...ELITES[act].map((e) => [[e], 'elite']), ...BOSSES[act].map((e) => [[e], 'boss'])];

// one battle, with chain-level records captured as each chain ends
function battle(dk, enemies, act, seed, kind, arch, ex) {
  const rng = new RNG(seed);
  const hpMult = (kind === 'boss' ? 1.5 : kind === 'elite' ? 1.65 : 1.75) * 1.14 * (1 + 0.08 * (act - 1));
  const c = new Combat({ deck: dk.deck.map((x) => ({ ...x })), party: PARTY, hp: 130, maxHp: 130, enemies, seed, relics: dk.relics, mutations: dk.mutations, act, kind, hpMult, dmgMult: 1.19, depth: 4 });
  const chains = [];
  const push = c.history.push.bind(c.history);
  c.history.push = (s) => { chains.push({ s, cards: c.combo ? c.combo.cards.map((e) => ({ ...e })) : [], log: c.combo ? c.combo.log.slice() : [] }); return push(s); };
  const ev = { churnInCombo: 0, churnOut: 0, flowLost: 0, enemyActs: 0, momentum: 0 };
  let think = 0.4;
  for (let step = 0; step < 30 * 400 && c.phase !== 'END'; step++) {
    c.update(1 / 30);
    for (const e of c.drainEvents()) {
      if (e.type === 'enemyAct') ev.enemyActs++;
    }
    think -= 1 / 30;
    if (think > 0 || c.phase === 'END') continue;
    think = REACT * (0.7 + rng.next() * 0.6);
    const a = decide(c, { profile: 'regular', rng: () => rng.next(), ex, build: arch });
    const inCombo = !!(c.combo && c.phase === 'ACTIVE');
    const isJunk = a.type === 'churn' && c.categoryOf(a.uid) === 'junk';
    const flowBefore = inCombo ? Math.min(0.3, Math.max(0, c.combo.deadline - c.t - 0.2)) : 0;
    const res = perform(c, a);
    // the player's own Churns (not Glitch, not Shuffle Step's free replacements), counted when issued
    if (a.type === 'churn' && res && res.ok && !isJunk) { if (inCombo) { ev.churnInCombo++; ev.flowLost += flowBefore; } else ev.churnOut++; }
    if (a.type === 'play' || a.type === 'select') think = Math.min(think, REACT * 0.5);
  }
  return { c, chains, ev };
}

const pct = (a, b) => `${Math.round((100 * a) / Math.max(1, b))}%`;
const f2 = (x) => x.toFixed(2);

// ───────────────────────── Suit Switching (§13) ─────────────────────────
function suitStudy() {
  console.log('\n=== Suit Switching (variant) ===');
  for (const origin of ['drafted', 'natural']) {
    const decks = decksFor('variant').filter((d) => d.origin === origin);
    if (!decks.length) continue;
    // deck composition: suits of attacks, EX share, suit tools
    const suits = { A: 0, B: 0, EX: 0 };
    let tools = 0, att = 0;
    for (const d of decks) for (const x of d.deck) { const def = CARDS[x.id]; if (!def || (def.category !== 'basic' && def.category !== 'arte')) continue; att++; suits[x.variant || def.variant]++; if (def.tags.includes('variant')) tools++; }
    for (const ex of [false, true]) {
      const m = { b: 0, w: 0, t: 0, chains: 0, cross: 0, consec: 0, triple: 0, cc: 0, ps: 0, dmg: 0, mom: 0, hpl: 0, acts: 0 };
      for (const [di, d] of decks.entries()) for (const act of d.acts) for (const [k, [en, kind]] of encounters(act).entries()) {
        const { c, chains, ev } = battle(d, en, act, 300 + di * 17 + k * 5 + act, kind, 'variant', ex);
        m.b++; m.t += c.t; if (c.result && c.result.victory) m.w++; m.dmg += c.stats.damage; m.mom += c.stats.momentumGained; m.hpl += c.stats.damageTaken; m.acts += ev.enemyActs;
        for (const ch of chains) {
          m.chains++;
          const xs = ch.cards.map((e) => e.cross);
          m.cross += xs.filter(Boolean).length;
          if (xs.some((x, i) => x && xs[i - 1])) m.consec++;
          for (let g = 0; g <= 9; g++) { const seg = ch.cards.filter((e) => e.seg === g && e.variant); if (new Set(seg.map((e) => e.variant)).size === 3) { m.triple++; break; } }
          if ((ch.s.ex || []).includes('cross_current')) m.cc++;
          if ((ch.s.ex || []).includes('prism_sequence')) m.ps++;
        }
      }
      console.log(`  ${origin.padEnd(7)} ${ex ? 'recipe-aware' : 'ordinary    '} · ${decks.length} decks · attacks A/B/EX ${pct(suits.A, att)}/${pct(suits.B, att)}/${pct(suits.EX, att)}, suit tools ${f2(tools / decks.length)}/deck · wins ${m.w}/${m.b} · Crosses ${f2(m.cross / m.chains)}/chain · chains with consecutive Crosses ${pct(m.consec, m.chains)} · A+B+EX in one segment ${pct(m.triple, m.chains)} · Cross Current ${f2(m.cc / m.b)}/battle (${f2(m.cc / m.chains)}/chain) · Prism Sequence ${f2(m.ps / m.b)}/battle · damage ${f2(m.dmg / m.t)}/s · Momentum ${f2(m.mom / m.b)}/battle · HP lost ${f2(m.hpl / m.b)}/battle`);
    }
  }
  // relic interactions: the same drafted decks with Twin Dials, Prism Lens, Wild Hinge
  const decks = decksFor('variant').filter((d) => d.origin === 'drafted').slice(0, 6);
  for (const relic of [null, 'twin_dials', 'prism_lens', 'wild_hinge']) {
    const m = { b: 0, t: 0, dmg: 0, mom: 0, cc: 0, ps: 0 };
    for (const [di, d] of decks.entries()) for (const [k, [en, kind]] of encounters(1).entries()) {
      const { c, chains } = battle({ ...d, relics: relic ? [relic] : [] }, en, 1, 600 + di * 7 + k, kind, 'variant', true);
      m.b++; m.t += c.t; m.dmg += c.stats.damage; m.mom += c.stats.momentumGained;
      for (const ch of chains) { if ((ch.s.ex || []).includes('cross_current')) m.cc++; if ((ch.s.ex || []).includes('prism_sequence')) m.ps++; }
    }
    console.log(`  relic ${String(relic || 'none').padEnd(10)} (drafted, recipe-aware, Act I): damage ${f2(m.dmg / m.t)}/s · Momentum ${f2(m.mom / m.b)}/battle · Cross Current ${f2(m.cc / m.b)} · Prism Sequence ${f2(m.ps / m.b)} per battle`);
  }
}

// ───────────────────────── Churn Engine (§14) ─────────────────────────
function churnStudy() {
  console.log('\n=== Churn Engine (churn) ===');
  for (const origin of ['drafted', 'natural']) {
    const decks = decksFor('churn').filter((d) => d.origin === origin);
    if (!decks.length) continue;
    for (const ex of [false, true]) {
      const m = { b: 0, w: 0, t: 0, churns: 0, inCombo: 0, out: 0, drew: 0, playable: 0, played: 0, laterArte: 0, flowLost: 0, sc: 0, chains: 0, charges: 0, dmg: 0, hpl: 0 };
      for (const [di, d] of decks.entries()) for (const act of d.acts) for (const [k, [en, kind]] of encounters(act).entries()) {
        const { c, chains, ev } = battle(d, en, act, 400 + di * 19 + k * 3 + act, kind, 'churn', ex);
        m.b++; m.t += c.t; if (c.result && c.result.victory) m.w++; m.churns += c.stats.churns; m.inCombo += ev.churnInCombo; m.out += ev.churnOut; m.flowLost += ev.flowLost; m.dmg += c.stats.damage; m.hpl += c.stats.damageTaken;
        m.charges += c.churn.charges;
        for (const ch of chains) {
          m.chains++;
          if ((ch.s.ex || []).includes('salvage_circuit')) m.sc++;
          for (const [li, l] of ch.log.entries()) {
            if (l.k !== 'churn' || !l.drew) continue;
            m.drew++;
            const later = ch.log.slice(li + 1).filter((x) => x.k === 'card').map((x) => ch.cards[x.i]).filter(Boolean);
            const used = later.find((e) => e.uid === l.drew);
            if (used) { m.played++; if (later.some((e) => e.category === 'arte' && e.index > used.index)) m.laterArte++; }
            if (CARDS[c.cards.get(l.drew).id].category !== 'support') m.playable++;
          }
        }
      }
      console.log(`  ${origin.padEnd(7)} ${ex ? 'recipe-aware' : 'ordinary    '} · ${decks.length} decks · wins ${m.w}/${m.b} · Churns ${f2(m.churns / m.b)}/battle (in a combo ${f2(m.inCombo / m.b)}, between ${f2(m.out / m.b)}) · charges left at the end ${f2(m.charges / m.b)} · in-combo Churns that drew a card ${m.drew}: attack (playable kind) ${pct(m.playable, m.drew)}, actually played ${pct(m.played, m.drew)}, then a later arte ${pct(m.laterArte, m.drew)} · Flow lost to Churn ${f2(m.flowLost / m.b)}s/battle · Salvage Circuit ${f2(m.sc / m.b)}/battle (${f2(m.sc / Math.max(1, m.drew))}/in-combo Churn) · damage ${f2(m.dmg / m.t)}/s · HP lost ${f2(m.hpl / m.b)}/battle`);
    }
  }
  const decks = decksFor('churn').filter((d) => d.origin === 'drafted').slice(0, 6);
  for (const relic of [null, 'churn_gear', 'oiled_bearings']) {
    const m = { b: 0, t: 0, dmg: 0, churns: 0, hpl: 0 };
    for (const [di, d] of decks.entries()) for (const [k, [en, kind]] of encounters(1).entries()) {
      const { c } = battle({ ...d, relics: relic ? [relic] : [] }, en, 1, 700 + di * 7 + k, kind, 'churn', false);
      m.b++; m.t += c.t; m.dmg += c.stats.damage; m.churns += c.stats.churns; m.hpl += c.stats.damageTaken;
    }
    console.log(`  relic ${String(relic || 'none').padEnd(14)} (drafted, Act I): Churns ${f2(m.churns / m.b)}/battle · damage ${f2(m.dmg / m.t)}/s · HP lost ${f2(m.hpl / m.b)}/battle`);
  }
  // Churnfed on the deck's churn cards
  const m = { b: 0, guard: 0, mom: 0 };
  for (const [di, d] of decks.entries()) for (const [k, [en, kind]] of encounters(1).entries()) {
    const deck = d.deck.map((x) => (CARDS[x.id].tags.includes('churn') ? x : { ...x, graft: 'churnfed' }));
    const { c } = battle({ ...d, deck }, en, 1, 800 + di * 7 + k, kind, 'churn', false);
    m.b++; m.guard += c.stats.guardGained; m.mom += c.stats.momentumGained;
  }
  console.log(`  Churnfed on every non-Churn card (drafted, Act I): Guard ${f2(m.guard / m.b)}/battle · Momentum ${f2(m.mom / m.b)}/battle`);
}

// ───────────────────────── Momentum Burst (§15) ─────────────────────────
function momentumStudy() {
  console.log('\n=== Momentum Burst (momentum) ===');
  for (const origin of ['drafted', 'natural']) {
    const decks = decksFor('momentum').filter((d) => d.origin === origin);
    if (!decks.length) continue;
    const m = { b: 0, w: 0, t: 0, gained: 0, spent: 0, artes: 0, pr: 0, guardSpend: 0, peak: 0, dmg: 0, hpl: 0 };
    for (const [di, d] of decks.entries()) for (const act of d.acts) for (const [k, [en, kind]] of encounters(act).entries()) {
      const { c, chains } = battle(d, en, act, 900 + di * 11 + k + act, kind, 'momentum', true);
      m.b++; m.t += c.t; if (c.result && c.result.victory) m.w++; m.gained += c.stats.momentumGained; m.spent += c.stats.momentumSpent; m.artes += c.stats.artes; m.dmg += c.stats.damage; m.hpl += c.stats.damageTaken;
      for (const ch of chains) if ((ch.s.ex || []).includes('pressure_release')) m.pr++;
    }
    console.log(`  ${origin.padEnd(7)} recipe-aware · ${decks.length} decks · wins ${m.w}/${m.b} · Momentum gained ${f2(m.gained / m.b)}, spent ${f2(m.spent / m.b)} per battle (${f2(m.gained / m.t)}/s) · artes ${f2(m.artes / m.b)}/battle (${f2(m.spent / Math.max(1, m.artes))} spent per arte) · Pressure Release ${f2(m.pr / m.b)}/battle · damage ${f2(m.dmg / m.t)}/s · HP lost ${f2(m.hpl / m.b)}/battle`);
  }
}

// ───────────────────────── Interference Exploit (§15) ─────────────────────────
function interferenceStudy() {
  console.log('\n=== Interference Exploit (interference) — by what the enemies do ===');
  const groups = { lock: [], scramble: [], other: [], none: [] };
  for (const act of [1, 2]) for (const [, en] of FORMATIONS[act].map((x) => [0, x[1]])) {
    const kinds = new Set(en.flatMap((id) => Object.values(ENEMIES[id].intents).map((i) => i.kind)));
    const g = kinds.has('lock') ? 'lock' : kinds.has('scramble') ? 'scramble' : [...kinds].some((k) => ['jam', 'snare', 'glitch', 'drain', 'latch'].includes(k)) ? 'other' : 'none';
    if (groups[g].length < 4) groups[g].push([en, act]);
  }
  for (const arch of ['interference', 'guard', 'ladder']) {
    const decks = decksFor(arch).filter((d) => d.origin === 'natural').length ? decksFor(arch).filter((d) => d.origin === 'natural') : decksFor(arch);
    const row = [];
    for (const [g, list] of Object.entries(groups)) {
      const m = { b: 0, w: 0, t: 0, dmg: 0, hpl: 0, ir: 0, endured: 0 };
      for (const [di, d] of decks.slice(0, 8).entries()) for (const [k, [en, act]] of list.entries()) {
        const { c, chains } = battle({ ...d, acts: [act] }, en, act, 1000 + di * 13 + k, 'normal', arch, true);
        m.b++; m.t += c.t; if (c.result && c.result.victory) m.w++; m.dmg += c.stats.damage; m.hpl += c.stats.damageTaken; m.endured += c.stats.interference;
        for (const ch of chains) if ((ch.s.ex || []).includes('interference_reversal')) m.ir++;
      }
      row.push(`${g}: wins ${m.w}/${m.b}, ${f2(m.dmg / Math.max(1, m.t))} dmg/s, HP lost ${f2(m.hpl / Math.max(1, m.b))}, interference endured ${f2(m.endured / Math.max(1, m.b))}, Interference Reversal ${f2(m.ir / Math.max(1, m.b))}/battle`);
    }
    console.log(`  ${arch.padEnd(12)} (${decks[0] && decks[0].origin} decks) — ${row.join(' · ')}`);
  }
}

console.log(`Build investigations: ${DECKS} drafted decks per build${natural.length ? ` + up to ${DECKS} natural decks (${NATURAL})` : ''}, reaction ${REACT}s, build tactics on`);
suitStudy();
churnStudy();
momentumStudy();
interferenceStudy();
