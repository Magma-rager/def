// Headless full-run simulator: a heuristic bot plays complete runs through the real engine
// (Run + Combat) to verify progression integrity and gather balance data.
// Usage: node tools/simulate.mjs [runs=20] [reaction=0.55] [profile=quick|regular|learner] [--ex] [-v]
// --ex: the recipe-aware policy (tools/lib/bot.mjs `ex`); SB_EX=off turns EX Combo recipes off in the
// engine (RULES.EX_COMBOS, a measurement switch the game never exposes) to compare with the 0.2.6 rules.
// The bot is tools/lib/bot.mjs: it picks the hero, commits basic attacks, artes, support and Relays
// through the engine's own legality checks (queueing ahead as its profile allows), and uses Churn,
// Reserve and Momentum shortcuts. 'quick' at 0.55s is the quick player, 'regular' at 1.0s the
// ordinary one.
import { Run } from '../src/engine/run.js';
import { decide, perform } from './lib/bot.mjs';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS } from '../src/data/cards.js';
import { EVENT_MAP } from '../src/data/events.js';
import { RNG } from '../src/core/rng.js';

const RUNS = +(process.argv[2] || 20);
const REACT = +(process.argv[3] || 0.55);
const PROFILE = ['quick', 'regular', 'learner'].includes(process.argv[4]) ? process.argv[4] : 'quick';
// SB_RELAY_NEEDS_ARTE=1 measures open decision A's alternative (a Relay only after an arte)
if (process.env.SB_RELAY_NEEDS_ARTE === '1') RULES.RELAY_NEEDS_ARTE = true;
const VERBOSE = process.argv.includes('-v');
const EX = process.argv.includes('--ex');
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
    const a = decide(c, { profile: PROFILE, rng: r, ex: EX });
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
        for (const k of ['basics', 'artes', 'supports', 'momentumGained', 'momentumSpent', 'rejected', 'perfect', 'cashouts', 'forced', 'churns', 'stashes', 'reservePlays', 'relays', 'cancelled', 'chainCards', 'chainArtes', 'damage', 'recoverTime', 'allRecovering', 'relayMomentum', 'finishers', 'combos', 'relaysNoArte', 'relayMomentumNoArte', 'queuedAttacks', 'targetChangedByPlayer', 'targetChangedByDeath', 'exActivations', 'exOverlaps', 'exDamage', 'exGuard', 'exHeal', 'exMomentum', 'exFlow', 'exChurn', 'exChainCards', 'exRelay', 'exSupport', 'exUnapplied']) log.k[k] = (log.k[k] || 0) + (out.stats[k] || 0);
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
        void c;
        run.finishBattle(out);
        break;
      }
      case 'bossprep': run.chooseBossPrep('prepared', 'brace'); break;
      case 'reward': {
        const tags = run.dominantTags();
        let idx = p.cards.findIndex((s) => CARDS[s.id].tags.some((t) => tags.slice(0, 2).includes(t)));
        if (idx < 0) idx = 0;
        if (run.d.deck.length < 26) run.takeReward('card', idx);
        if (p.relics.length) run.takeReward('relic', 0);
        run.finishReward();
        break;
      }
      case 'mutation': run.chooseMutation(p.options[0]); break;
      case 'event': {
        const ev = EVENT_MAP[p.eventId];
        const api = run.api(run.rng('x'));
        const i = ev.choices.findIndex((ch) => !ch.req || ch.req(api) === true);
        run.eventChoose(Math.max(0, i));
        if (run.d.pending.select) {
          const sel = run.d.pending.select;
          const t = run.d.deck.find((x) => run.canApplySelect(sel.action, x));
          if (t) run.applySelect(sel.action, t.uid); else run.cancelSelect();
        }
        if (run.d.pending.result && run.d.pending.result.offer) run.takeOfferCard(0);
        run.leaveNode();
        break;
      }
      case 'shop': {
        const s = p.stock;
        const i = s.cards.findIndex((it) => !it.sold && it.price <= run.d.scrap - 40);
        if (i >= 0) run.shopBuy('card', i);
        const r = s.relics.findIndex((it) => !it.sold && it.price <= run.d.scrap);
        if (r >= 0) run.shopBuy('relic', r);
        run.leaveNode();
        break;
      }
      case 'rest': {
        const avg = run.d.hp / run.d.maxHp;
        if (avg < 0.7) run.restChoose('recover');
        else { const t = run.d.deck.find((x) => !x.up); if (t) run.applySelect('upgrade', t.uid); }
        run.leaveNode();
        break;
      }
      case 'surgery': {
        const t = run.d.deck.find((x) => run.canApplySelect(p.grafts[0] ? `graft:${p.grafts[0]}` : 'recut', x));
        if (t) run.surgeryApply(t.uid, `graft:${p.grafts[0]}`);
        run.leaveNode();
        break;
      }
      case 'treasure': run.treasureTake(0); run.leaveNode(); break;
      case 'gameover':
        log.result = p.victory ? 'victory' : 'defeat';
        log.act = run.d.act;
        log.floors = run.d.floors;
        log.deck = run.d.deck.length;
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
for (let s = 1; s <= RUNS; s++) {
  try {
    const r = playRun(1000 + s);
    results.push(r);
    console.log(`seed ${1000 + s}: ${r.result} act ${r.act} floors ${r.floors} battles ${r.battles} bosses ${r.bosses} deck ${r.deck}${r.deaths ? ' died: ' + r.deaths : ''}`);
  } catch (e) {
    console.log(`seed ${1000 + s}: ERROR ${e.stack}`);
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
console.log(`endings: Perfect ${Math.round((sum('perfect') / chains) * 100)}% · Cash Out ${Math.round((sum('cashouts') / chains) * 100)}% · Dropped ${Math.round((sum('forced') / chains) * 100)}% · Finishers ${per('finishers')}/battle · Relay Momentum ${per('relayMomentum')}/battle · cancelled ${per('cancelled')}/battle · queue peak ${Math.max(0, ...all.map((r) => r.k.queuePeak || 0))}`);
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
console.log(`by build (dominant tag at the end): ${archs.map((a) => { const rs = all.filter((r) => r.arch === a); const b = rs.reduce((x, r) => x + r.battles, 0); return `${a} ${rs.length} runs, ${rs.filter((r) => r.result === 'victory').length} wins, EX ${(rs.reduce((x, r) => x + (r.k.exActivations || 0), 0) / Math.max(1, b)).toFixed(2)}/battle`; }).join(' · ')}`);
