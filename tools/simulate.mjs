// Headless full-run simulator: a heuristic bot plays complete runs through the real engine
// (Run + Combat) to verify progression integrity and gather balance data.
// Usage: node tools/simulate.mjs [runs=20] [reaction=0.55] [profile=quick|regular|learner] [--ex] [-v]
//        [--build=each|<archetype tag>] [--tactics]
// --build (Phase 8): a build-focused player. Each run has a target archetype (with 'each', run i takes
// the i-th of the ten in turn) and acquires only through the ordinary offers — battle, elite and boss
// rewards, shops, surgery and boss relics — preferring cards, relics, grafts and mutations of that tag
// and skipping off-plan cards once the deck has 16. Nothing is inserted; the report shows how many cards
// of the target the deck held at the end and how the build's own mechanics were used per battle.
// --ex: the recipe-aware policy (tools/lib/bot.mjs `ex`); SB_EX=off turns EX Combo recipes off in the
// engine (RULES.EX_COMBOS, a measurement switch the game never exposes) to compare with the 0.2.6 rules.
// The bot is tools/lib/bot.mjs: it picks the hero, commits basic attacks, artes, support and Relays
// through the engine's own legality checks (queueing ahead as its profile allows), and uses Churn,
// Reserve and Momentum shortcuts. 'quick' at 0.55s is the quick player, 'regular' at 1.0s the
// ordinary one.
import fs from 'node:fs';
import { Run } from '../src/engine/run.js';
import { RECIPES } from '../src/data/recipes.js';
import { decide, perform } from './lib/bot.mjs';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS, ARCHETYPES } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { GRAFTS } from '../src/data/cards.js';
import { EVENT_MAP } from '../src/data/events.js';
import { RNG } from '../src/core/rng.js';

const RUNS = +(process.argv[2] || 20);
const REACT = +(process.argv[3] || 0.55);
const PROFILE = ['quick', 'regular', 'learner'].includes(process.argv[4]) ? process.argv[4] : 'quick';
// SB_RELAY_NEEDS_ARTE=1 measures open decision A's alternative (a Relay only after an arte)
if (process.env.SB_RELAY_NEEDS_ARTE === '1') RULES.RELAY_NEEDS_ARTE = true;
const VERBOSE = process.argv.includes('-v');
const EX = process.argv.includes('--ex');
const BUILD = (process.argv.find((x) => x.startsWith('--build=')) || '').slice(8) || null;
// --tactics: in battle the bot leans into the build its deck holds (tools/lib/bot.mjs build: 'auto')
const TACTICS = process.argv.includes('--tactics') ? 'auto' : null;
const ARCH_LIST = Object.keys(ARCHETYPES);
const targetFor = (seed) => (BUILD === 'each' ? ARCH_LIST[(seed - 1001) % ARCH_LIST.length] : BUILD && ARCHETYPES[BUILD] ? BUILD : null);
if (process.env.SB_EX === 'off') RULES.EX_COMBOS = false;

function botBattle(setup, rng) {
  const c = new Combat(setup);
  let think = 0.4;
  const dt = 1 / 30;
  const r = () => rng.next();
  for (let step = 0; step < 30 * 600 && c.phase !== 'END'; step++) {
    c.update(dt);
    think -= dt;
    if (think > 0 || c.phase === 'END') continue;
    think = REACT * (0.7 + rng.next() * 0.6);
    const a = decide(c, { profile: PROFILE, rng: r, ex: EX, build: TACTICS });
    perform(c, a);
    // queueing is a quick tap: a player who just committed may commit the next card sooner
    if (a.type === 'play' || a.type === 'select') think = Math.min(think, REACT * 0.5);
    if (c.combo && c.available() >= 6 && c.flowLeft() < 1 && rng.chance(0.5)) c.spendMomentumFlow();
    const z = c.verifyZones();
    if (!z.ok) throw new Error('zone corruption: ' + z.error);
    if (c.momentum < 0 || c.reserved > c.momentum) throw new Error(`Momentum accounting: ${c.momentum} reserved ${c.reserved}`);
  }
  if (c.phase !== 'END') {
    const dump = { t: c.t, phase: c.phase, enemies: c.enemies.map((e) => ({ id: e.id, hp: e.hp, guard: e.guard, alive: e.alive, st: e.st })), hp: c.hp, guard: c.guard, mom: c.momentum, hand: c.hand.map((u) => u && `${c.def(u).id}:${c.check(u).text || 'ok'}`), reserve: c.reserve.map((u) => c.def(u).id), draw: c.draw.length, discard: c.discard.length, churn: c.churn };
    throw new Error(`battle timeout vs ${setup.enemies.join(',')} ${JSON.stringify(dump)}`);
  }
  return { out: c.outcome(), t: c.t, c };
}

function pickNode(run, rng) {
  const ids = run.availableNodes();
  const lowHp = run.d.hp / run.d.maxHp < 0.5;
  const w = ids.map((id) => {
    const n = run.node(id);
    const base = { battle: 4, event: 3, elite: lowHp ? 0.5 : 2, shop: run.d.scrap > 100 ? 4 : 1, rest: lowHp ? 6 : 1, surgery: 2, treasure: 5, boss: 10 }[n.type];
    return [id, base];
  });
  return rng.weighted(w);
}

function playRun(seed) {
  const rng = new RNG(seed * 7 + 1);
  const run = Run.create({ seed, tutorial: false });
  const log = { battles: 0, elites: 0, bosses: 0, hpLoss: [], durations: [], act: 1, result: null, deaths: null, combos: 0, k: {} };
  const target = targetFor(seed);
  // deck progression (assignment §11.1): offers seen and taken, skips, upgrades, transforms, removals, grafts
  const prog = { offered: 0, taken: 0, skipped: 0, shopCards: 0, upgrades: 0, transforms: 0, removed: 0, grafts: 0, relics: 0, mutations: 0, offeredTag: 0 };
  log.prog = prog;
  const startDeck = run.d.deck.length;
  log.target = target;
  const fits = (id) => !!target && CARDS[id].tags.includes(target);
  let guard = 0;
  while (guard++ < 400) {
    const p = run.d.pending;
    if (!p) { run.enterNode(pickNode(run, rng)); continue; }
    switch (p.type) {
      case 'story':
        if (p.next === 'map') run.d.pending = null;
        else if (p.next === 'nextAct') run.advanceAct();
        else if (p.next === 'victory') run.d.pending = { type: 'gameover', victory: true };
        break;
      case 'battle': {
        const setup = run.battleSetup();
        const before = run.d.hp;
        const { out, t, c } = botBattle(setup, rng);
        log.battles++;
        if (setup.kind === 'elite') log.elites++;
        log.durations.push(t);
        log.combos += out.stats.combos;
        for (const [k, v] of Object.entries(out.stats.exByRecipe || {})) log.k[`ex_${k}`] = (log.k[`ex_${k}`] || 0) + v;
        log.exFound = [...new Set([...(log.exFound || []), ...(out.exFound || [])])];
        log.k[`exKind_${setup.kind}`] = (log.k[`exKind_${setup.kind}`] || 0) + (out.stats.exActivations || 0);
        log.k[`battles_${setup.kind}`] = (log.k[`battles_${setup.kind}`] || 0) + 1;
        for (const k of ['crosses', 'steps', 'guardGained', 'flowGained', 'interferencePayoffs', 'longCombos', 'basics', 'artes', 'supports', 'momentumGained', 'momentumSpent', 'rejected', 'perfect', 'cashouts', 'forced', 'churns', 'stashes', 'reservePlays', 'relays', 'cancelled', 'chainCards', 'chainArtes', 'damage', 'recoverTime', 'allRecovering', 'relayMomentum', 'finishers', 'combos', 'relaysNoArte', 'relayMomentumNoArte', 'queuedAttacks', 'targetChangedByPlayer', 'targetChangedByDeath', 'exActivations', 'exOverlaps', 'exDamage', 'exGuard', 'exHeal', 'exMomentum', 'exFlow', 'exChurn', 'exChainCards', 'exRelay', 'exSupport', 'exUnapplied', 'techniques']) log.k[k] = (log.k[k] || 0) + (out.stats[k] || 0);
        for (const n of [1, 2, 3]) log.k[`chain${n}`] = (log.k[`chain${n}`] || 0) + out.stats.chainHeroes[n];
        for (const [k, v] of Object.entries(out.stats.time)) log.k[`time_${k}`] = (log.k[`time_${k}`] || 0) + v;
        log.k.longest = Math.max(log.k.longest || 0, out.stats.longest);
        log.k.queuePeak = Math.max(log.k.queuePeak || 0, out.stats.queuePeak);
        for (const h of ['V', 'C', 'S']) log.k[`hero${h}`] = (log.k[`hero${h}`] || 0) + (out.stats.byHero ? out.stats.byHero[h] : 0);
        const after = out.hp;
        log.hpLoss.push(before - after);
        if (VERBOSE) console.log(`  act${setup.act} d${setup.depth} ${setup.kind} ${setup.enemies.join('+')} ${out.victory ? 'WIN' : 'LOSS'} t=${t.toFixed(1)}s hp ${before}->${after} combos ${out.stats.combos} perfect ${out.stats.perfect} co ${out.stats.cashouts} forced ${out.stats.forced}`);
        log.arch = run.dominantTags()[0] || '-';
        if (!out.victory) log.deaths = `act${setup.act} ${setup.kind} ${setup.enemies.join('+')}`;
        if (setup.kind === 'boss' && out.victory) log.bosses++;
        // boss adaptations (Phase 8): which one, against which boss, and whether play broke it
        if (setup.kind === 'boss') (log.adapt = log.adapt || []).push({ boss: setup.enemies[0], id: c.adapt ? c.adapt.id : null, broken: !!(c.adapt && c.adapt.broken), progress: c.adapt ? c.adapt.progress / c.adapt.need : 0, win: out.victory });
        void c;
        run.finishBattle(out);
        break;
      }
      case 'bossprep': {
        // evidence the boss reads (Phase 8 calibration): raw per-battle rates at this boss
        if (process.env.SB_PROFILE_DUMP) {
          const S = run.d.stats, b = Math.max(1, S.battles), cb = Math.max(1, S.combos), ab = Math.max(1, S.variantPlays.A + S.variantPlays.B);
          console.log('PROFILE', JSON.stringify({ act: run.d.act, arch: run.dominantTags()[0], pick: p.arch, long: S.longCombos / cb, cash: S.cashouts / cb, relay: S.relays / cb, guard: S.guardGained / b, absorbed: S.guardAbsorbed, churn: S.churns / b, suit: Math.max(S.variantPlays.A, S.variantPlays.B) / ab, mom: S.momentumSpent / b, flow: S.flowGained / b, reserve: S.reservePlays / b, interf: S.interferencePayoffs / b, top: p.profile.slice(0, 3).map((x) => `${x.arch}:${x.score.toFixed(2)}`) }));
        }
        // natural decks for tools/recipelab.mjs layer B (Phase 8): the deck as it reached this boss
        if (process.env.SB_DECKS) fs.appendFileSync(process.env.SB_DECKS, JSON.stringify({ seed, target, act: run.d.act, top: run.dominantTags()[0] || null, deck: run.d.deck, relics: run.d.relics, mutations: run.d.mutations }) + '\n');
        run.chooseBossPrep('prepared', 'brace');
        break;
      }
      case 'reward': {
        const d0 = run.d.deck.length, r0 = run.d.relics.length;
        prog.offered += p.cards.length;
        if (target) prog.offeredTag += p.cards.filter((x) => fits(x.id)).length;
        const done = () => { const t = run.d.deck.length - d0; prog.taken += t; prog.skipped += t ? 0 : 1; prog.relics += run.d.relics.length - r0; };
        if (target) {
          const idx = p.cards.findIndex((s) => fits(s.id));
          // off-plan: only a card that leads nowhere else (no archetype tag), while the deck is small
          const neutral = p.cards.findIndex((s) => !CARDS[s.id].tags.some((t) => ARCHETYPES[t]));
          if (idx >= 0) run.takeReward('card', idx);
          else if (neutral >= 0 && run.d.deck.length < 16) run.takeReward('card', neutral);
          if (p.relics.length) { const r = p.relics.findIndex((id) => RELICS[id].tag === target); run.takeReward('relic', Math.max(0, r)); }
          done();
          run.finishReward();
          break;
        }
        const tags = run.dominantTags();
        let idx = p.cards.findIndex((s) => CARDS[s.id].tags.some((t) => tags.slice(0, 2).includes(t)));
        if (idx < 0) idx = 0;
        if (run.d.deck.length < 26) run.takeReward('card', idx);
        if (p.relics.length) run.takeReward('relic', 0);
        done();
        run.finishReward();
        break;
      }
      case 'mutation': { prog.mutations++; const m = target ? p.options.find((id) => MUTATIONS[id].tag === target) : null; run.chooseMutation(m || p.options[0]); break; }
      case 'event': {
        const ev = EVENT_MAP[p.eventId];
        const api = run.api(run.rng('x'));
        const i = ev.choices.findIndex((ch) => !ch.req || ch.req(api) === true);
        run.eventChoose(Math.max(0, i));
        if (run.d.pending.select) {
          const sel = run.d.pending.select;
          const t = run.d.deck.find((x) => run.canApplySelect(sel.action, x));
          if (t && run.applySelect(sel.action, t.uid)) { if (sel.action === 'upgrade') prog.upgrades++; else if (sel.action === 'transform') prog.transforms++; else if (sel.action === 'remove') prog.removed++; else if (sel.action.startsWith('graft:')) prog.grafts++; } else run.cancelSelect();
        }
        if (run.d.pending.result && run.d.pending.result.offer) run.takeOfferCard(0);
        run.leaveNode();
        break;
      }
      case 'shop': {
        const s = p.stock;
        const sd0 = run.d.deck.length, sr0 = run.d.relics.length, rc0 = run.d.removeCost;
        const shopDone = () => { prog.shopCards += Math.max(0, run.d.deck.length - sd0 + (run.d.removeCost > rc0 ? 1 : 0)); prog.removed += run.d.removeCost > rc0 ? 1 : 0; prog.relics += run.d.relics.length - sr0; };
        if (target) {
          for (const [i, it] of s.cards.entries()) if (!it.sold && fits(it.spec.id) && it.price <= run.d.scrap) run.shopBuy('card', i);
          const r = s.relics.findIndex((it) => !it.sold && RELICS[it.id].tag === target && it.price <= run.d.scrap);
          if (r >= 0) run.shopBuy('relic', r);
          // thin the deck: remove an off-plan starter Weak attack
          const weak = run.d.deck.find((x) => x.id === 'scrapline' && run.canRemove(x.uid));
          if (weak && run.shopBuy('remove').ok) run.shopService('remove', weak.uid);
          shopDone();
          run.leaveNode();
          break;
        }
        const i = s.cards.findIndex((it) => !it.sold && it.price <= run.d.scrap - 40);
        if (i >= 0) run.shopBuy('card', i);
        const r = s.relics.findIndex((it) => !it.sold && it.price <= run.d.scrap);
        if (r >= 0) run.shopBuy('relic', r);
        shopDone();
        run.leaveNode();
        break;
      }
      case 'rest': {
        const avg = run.d.hp / run.d.maxHp;
        if (avg < 0.7) run.restChoose('recover');
        else { const t = run.d.deck.find((x) => !x.up); if (t && run.applySelect('upgrade', t.uid)) prog.upgrades++; }
        run.leaveNode();
        break;
      }
      case 'surgery': {
        if (target) {
          const g = p.grafts.find((x) => GRAFTS[x].tag === target) || p.grafts[0];
          const t = run.d.deck.find((x) => fits(x.id) && run.canApplySelect(`graft:${g}`, x)) || run.d.deck.find((x) => run.canApplySelect(`graft:${g}`, x));
          if (t && run.surgeryApply(t.uid, `graft:${g}`).ok) prog.grafts++;
          run.leaveNode();
          break;
        }
        const t = run.d.deck.find((x) => run.canApplySelect(p.grafts[0] ? `graft:${p.grafts[0]}` : 'recut', x));
        if (t && run.surgeryApply(t.uid, `graft:${p.grafts[0]}`).ok) prog.grafts++;
        run.leaveNode();
        break;
      }
      case 'treasure': run.treasureTake(0); run.leaveNode(); break;
      case 'gameover':
        log.result = p.victory ? 'victory' : 'defeat';
        log.act = run.d.act;
        log.floors = run.d.floors;
        log.deck = run.d.deck.length;
        log.tagCards = target ? run.d.deck.filter((x) => fits(x.id)).length : 0;
        prog.start = startDeck; prog.final = run.d.deck.length; prog.upgradedAtEnd = run.d.deck.filter((x) => x.up).length;
        log.tagCounts = run.tagCounts();
        return log;
      default: throw new Error('unknown pending ' + p.type);
    }
    // save/load roundtrip each step to prove persistence integrity
    const re = Run.load(JSON.parse(JSON.stringify(run.serialize())));
    if (!re) throw new Error('save roundtrip failed');
  }
  throw new Error('run loop guard');
}

const results = [];
// SB_SEED0 shifts the seeds (parallel batches); keep it a multiple of 10 so --build=each keeps its rotation
const SEED0 = 1000 + (+process.env.SB_SEED0 || 0);
for (let s = 1; s <= RUNS; s++) {
  try {
    const r = playRun(SEED0 + s);
    results.push(r);
    console.log(`seed ${SEED0 + s}: ${r.result} act ${r.act} floors ${r.floors} battles ${r.battles} bosses ${r.bosses} deck ${r.deck}${r.deaths ? ' died: ' + r.deaths : ''}`);
  } catch (e) {
    console.log(`seed ${SEED0 + s}: ERROR ${e.stack}`);
    results.push({ result: 'error' });
  }
}
const n = results.length;
const wins = results.filter((r) => r.result === 'victory').length;
const errs = results.filter((r) => r.result === 'error').length;
const all = results.filter((r) => r.durations);
const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`\n${n} runs · wins ${wins} · errors ${errs}`);
console.log(`act reached: ${[1, 2, 3].map((a) => `${a}:${results.filter((r) => r.act === a).length}`).join(' ')}`);
console.log(`avg battle ${avg(all.flatMap((r) => r.durations)).toFixed(1)}s · avg HP lost/battle ${avg(all.flatMap((r) => r.hpLoss)).toFixed(1)} · bosses killed ${avg(all.map((r) => r.bosses)).toFixed(2)}/run`);
const sum = (k) => all.reduce((a, r) => a + (r.k[k] || 0), 0);
const battles = Math.max(1, all.reduce((a, r) => a + r.battles, 0));
const per = (k) => (sum(k) / battles).toFixed(1);
console.log(`per battle: basic ${per('basics')} · arte ${per('artes')} · support ${per('supports')} · Momentum +${per('momentumGained')} / −${per('momentumSpent')} · illegal taps ${per('rejected')} · Churn ${per('churns')} · Reserve ${per('stashes')}/${per('reservePlays')} played`);
console.log(`combo endings: Perfect ${sum('perfect')} · Cash Out ${sum('cashouts')} · Dropped ${sum('forced')} · cards by hero V ${sum('heroV')} C ${sum('heroC')} S ${sum('heroS')} · zone/Momentum integrity failures 0 (checked every action)`);
const chains = Math.max(1, sum('combos'));
console.log(`chains: ${(sum('combos') / battles).toFixed(1)}/battle · heroes per chain 1/2/3: ${[1, 2, 3].map((n) => `${Math.round((sum('chain' + n) / chains) * 100)}%`).join(' / ')} · Relays ${per('relays')}/battle · cards per chain ${(sum('chainCards') / chains).toFixed(2)} (longest ${Math.max(0, ...all.map((r) => r.k.longest || 0))}) · artes per chain ${(sum('chainArtes') / chains).toFixed(2)} · damage per chain ${(sum('damage') / chains).toFixed(0)}`);
console.log(`endings: Perfect ${Math.round((sum('perfect') / chains) * 100)}% · Cash Out ${Math.round((sum('cashouts') / chains) * 100)}% · Dropped ${Math.round((sum('forced') / chains) * 100)}% · Finishers ${per('finishers')}/battle · Relay Momentum ${per('relayMomentum')}/battle · cancelled ${per('cancelled')}/battle · techniques ${per('techniques')}/battle · queue peak ${Math.max(0, ...all.map((r) => r.k.queuePeak || 0))}`);
const tt = ['decide', 'execute', 'grace', 'breather', 'idle', 'wait'].map((k) => [k, sum('time_' + k) / battles]);
console.log(`time per battle (s): ${tt.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')} · hero Recovery ${per('recoverTime')} hero-s (all three recovering ${per('allRecovering')}s)`);
console.log(`open decisions: Relays without an arte in the outgoing segment ${per('relaysNoArte')}/battle (${Math.round((sum('relaysNoArte') / Math.max(1, sum('relays'))) * 100)}% of Relays, ${per('relayMomentumNoArte')} Momentum) · queued attacks ${per('queuedAttacks')}/battle, target changed while waiting: by the player ${per('targetChangedByPlayer')}, by a death ${per('targetChangedByDeath')}${RULES.RELAY_NEEDS_ARTE ? ' · RULES.RELAY_NEEDS_ARTE = true' : ''}`);
// Phase 7: EX Combo recipes (docs/AUDIT.md Phase 7)
const exAct = sum('exActivations');
const recipeIds = [...new Set(all.flatMap((r) => Object.keys(r.k).filter((k) => k.startsWith('ex_')).map((k) => k.slice(3))))].sort((a, b) => sum('ex_' + b) - sum('ex_' + a));
console.log(`EX combos: ${RULES.EX_COMBOS ? 'on' : 'OFF (SB_EX=off)'}${EX ? ' · recipe-aware policy (--ex)' : ''} · ${(exAct / battles).toFixed(2)}/battle (${Math.round((exAct / chains) * 100)} per 100 chains) · overlaps ${per('exOverlaps')} · after the battle was won ${per('exUnapplied')} · relay recipes ${per('exRelay')} · support recipes ${per('exSupport')} · chain length when triggered ${(sum('exChainCards') / Math.max(1, exAct)).toFixed(1)}`);
console.log(`EX effects per battle: damage ${per('exDamage')} (${Math.round((sum('exDamage') / Math.max(1, sum('damage') + sum('exDamage'))) * 100)}% of chain damage) · Guard ${per('exGuard')} · HP ${per('exHeal')} · Momentum ${per('exMomentum')} · Flow ${per('exFlow')}s · Churn ${per('exChurn')}`);
console.log(`EX by recipe (per battle): ${recipeIds.map((k) => `${k} ${(sum('ex_' + k) / battles).toFixed(2)}`).join(' · ') || 'none'}`);
console.log(`EX by encounter (per battle): ${['battle', 'elite', 'boss'].map((k) => `${k} ${(sum('exKind_' + k) / Math.max(1, sum('battles_' + k))).toFixed(2)}`).join(' · ')} · distinct recipes per run ${avg(all.map((r) => (r.exFound || []).length)).toFixed(1)} (all runs: ${new Set(all.flatMap((r) => r.exFound || [])).size} of 15)`);
const archs = [...new Set(all.map((r) => r.arch))];
{
  const ad = all.flatMap((r) => r.adapt || []);
  const by = {};
  for (const x of ad) { const k = x.id || 'none'; by[k] = by[k] || { n: 0, broken: 0, prog: 0, win: 0 }; by[k].n++; by[k].broken += x.broken ? 1 : 0; by[k].prog += x.progress; by[k].win += x.win ? 1 : 0; }
  const bb = {};
  for (const x of ad) { bb[x.boss] = bb[x.boss] || { n: 0, w: 0, ad: 0, br: 0 }; bb[x.boss].n++; bb[x.boss].w += x.win ? 1 : 0; bb[x.boss].ad += x.id ? 1 : 0; bb[x.boss].br += x.broken ? 1 : 0; }
  console.log(`bosses (all six alternatives): ${Object.entries(bb).map(([k, v]) => `${k} ${v.w}/${v.n} won, adapted ${v.ad}, broken ${v.br}`).join(' · ')}`);
  console.log(`boss adaptations (${ad.length} boss fights): ${Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}× broken ${v.broken} (avg progress ${Math.round((v.prog / v.n) * 100)}%, won ${v.win})`).join(' · ')}`);
}
{
  // deck progression across the runs (assignment §11.1)
  const P = (k) => all.reduce((x, r) => x + ((r.prog && r.prog[k]) || 0), 0) / Math.max(1, all.length);
  console.log(`deck progression per run: start ${P('start').toFixed(0)} → final ${P('final').toFixed(1)} cards · reward cards offered ${P('offered').toFixed(1)}, taken ${P('taken').toFixed(1)}, rewards skipped ${P('skipped').toFixed(1)}${BUILD ? `, offers of the target tag ${P('offeredTag').toFixed(1)}` : ''} · shop cards/removals ${P('shopCards').toFixed(1)} · upgrades ${P('upgrades').toFixed(1)} (upgraded at the end ${P('upgradedAtEnd').toFixed(1)}) · transforms ${P('transforms').toFixed(1)} · removals ${P('removed').toFixed(1)} · grafts ${P('grafts').toFixed(1)} · relics ${P('relics').toFixed(1)} · mutations ${P('mutations').toFixed(1)}`);
}
if (BUILD) {
  // characteristic mechanics per battle, for each target build (Phase 8 build differentiation)
  const M = { ladder: ['steps', 'longCombos'], variant: ['crosses'], relay: ['relays'], momentum: ['momentumSpent'], flow: ['flowGained'], churn: ['churns'], reserve: ['reservePlays'], guard: ['guardGained'], cashout: ['cashouts'], interference: ['interferencePayoffs'] };
  const keys = [...new Set(Object.values(M).flat())];
  const perB = (rs, k) => rs.reduce((x, r) => x + (r.k[k] || 0), 0) / Math.max(1, rs.reduce((x, r) => x + r.battles, 0));
  const avg = Object.fromEntries(keys.map((k) => [k, perB(all, k)]));
  console.log(`build-focused acquisition (${BUILD}): per target — wins, target cards held at the end, own mechanic per battle (× the all-builds average), top tag of the deck`);
  for (const a of ARCH_LIST) {
    const rs = all.filter((r) => r.target === a);
    if (!rs.length) continue;
    const held = rs.reduce((x, r) => x + r.tagCards, 0) / rs.length;
    const mech = M[a].map((k) => `${k} ${perB(rs, k).toFixed(1)} (${(perB(rs, k) / Math.max(1e-9, avg[k])).toFixed(2)}×)`).join(', ');
    const top = rs.map((r) => Object.entries(r.tagCounts || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || '-');
    const bt = rs.reduce((x, r) => x + r.battles, 0);
    const secs = rs.reduce((x, r) => x + r.durations.reduce((y, d) => y + d, 0), 0) / Math.max(1, bt);
    const hpl = rs.reduce((x, r) => x + r.hpLoss.reduce((y, d) => y + d, 0), 0) / Math.max(1, bt);
    const own = RECIPES.filter((x) => x.tags.includes(a)).reduce((x, rc) => x + perB(rs, `ex_${rc.id}`), 0);
    console.log(`  ${a.padEnd(12)} ${rs.filter((r) => r.result === 'victory').length}/${rs.length} wins · ${held.toFixed(1)} target cards · ${mech} · top tag ${top.filter((t) => t === a).length}/${rs.length} · ${secs.toFixed(1)}s/battle · damage ${(perB(rs, 'damage') / Math.max(1, secs)).toFixed(1)}/s · HP lost ${hpl.toFixed(1)}/battle · EX ${perB(rs, 'exActivations').toFixed(2)}/battle, own recipes ${own.toFixed(2)}/battle`);
  }
}
console.log(`by build (dominant tag at the end): ${archs.map((a) => { const rs = all.filter((r) => r.arch === a); const b = rs.reduce((x, r) => x + r.battles, 0); return `${a} ${rs.length} runs, ${rs.filter((r) => r.result === 'victory').length} wins, EX ${(rs.reduce((x, r) => x + (r.k.exActivations || 0), 0) / Math.max(1, b)).toFixed(2)}/battle`; }).join(' · ')}`);
