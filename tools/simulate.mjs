// Headless full-run simulator: a heuristic bot plays complete runs through the real engine
// (Run + Combat) to verify progression integrity and gather balance data.
// Usage: node tools/simulate.mjs [runs=20] [reaction=0.55]
import { Run } from '../src/engine/run.js';
import { Combat, RULES } from '../src/engine/combat.js';
import { CARDS } from '../src/data/cards.js';
import { EVENT_MAP } from '../src/data/events.js';
import { RNG } from '../src/core/rng.js';

const RUNS = +(process.argv[2] || 20);
const REACT = +(process.argv[3] || 0.55);
const VERBOSE = process.argv.includes('-v');

function botBattle(setup, rng) {
  const c = new Combat(setup);
  let think = 0.4;
  const dt = 1 / 30;
  let guardSpent = 0;
  for (let step = 0; step < 30 * 600 && c.phase !== 'END'; step++) {
    c.update(dt);
    think -= dt;
    if (think > 0 || c.phase === 'END') continue;
    think = REACT * (0.7 + rng.next() * 0.6);
    const legal = [...c.hand, ...c.reserve].filter((u) => u && c.check(u).ok);
    // defensive momentum use
    const danger = c.aliveEnemies().some((e) => e.atb > 0.8 && e.intent && (e.intent.kind === 'atk' || e.intent.kind === 'aoe'));
    if (danger && c.guard < 6 && c.momentum >= 3 && rng.chance(0.7)) { c.spendMomentumGuard(); guardSpent++; continue; }
    if (c.phase === 'PRE') {
      if (!legal.length) {
        const junk = c.hand.find((u) => u && c.roleOf(u) === 'junk');
        if (junk) c.churnCard(junk);
        continue;
      }
      legal.sort((a, b) => c.effRank(a) - c.effRank(b));
      c.playCard(legal[0]);
    } else if (c.phase === 'ACTIVE') {
      const closers = legal.filter((u) => c.roleOf(u) === 'close');
      const convs = legal.filter((u) => c.roleOf(u) === 'conv');
      const len = c.combo.cards.length;
      const left = c.flowLeft();
      if (closers.length && (len >= 3 || !convs.length || left < 1.1)) {
        closers.sort((a, b) => c.effRank(b) - c.effRank(a));
        c.playCard(closers[0]);
      } else if (convs.length && left > 0.25) {
        convs.sort((a, b) => c.effRank(a) - c.effRank(b));
        c.playCard(convs[0]);
      } else if (c.canCashOut()) c.cashOut();
      else {
        const bad = c.hand.find((u) => u && !c.check(u).ok && !c.isLocked(u));
        if (bad && c.churn.charges > 0) c.churnCard(bad);
      }
      if (c.combo && c.momentum >= 6 && c.flowLeft() < 1 && rng.chance(0.5)) c.spendMomentumFlow();
    }
    const z = c.verifyZones();
    if (!z.ok) throw new Error('zone corruption: ' + z.error);
  }
  if (c.phase !== 'END') {
    const dump = { t: c.t, phase: c.phase, enemies: c.enemies.map((e) => ({ id: e.id, hp: e.hp, guard: e.guard, alive: e.alive, st: e.st })), party: c.party.map((p) => [p.id, p.hp, p.ko]), guard: c.guard, mom: c.momentum, hand: c.hand.map((u) => u && `${c.def(u).id}:${c.check(u).text || 'ok'}`), reserve: c.reserve.map((u) => c.def(u).id), draw: c.draw.length, discard: c.discard.length, churn: c.churn };
    throw new Error(`battle timeout vs ${setup.enemies.join(',')} ${JSON.stringify(dump)}`);
  }
  return { out: c.outcome(), t: c.t, c };
}

function pickNode(run, rng) {
  const ids = run.availableNodes();
  const lowHp = run.d.party.reduce((a, p) => a + p.hp / p.maxHp, 0) / 3 < 0.5;
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
  const log = { battles: 0, elites: 0, bosses: 0, hpLoss: [], durations: [], act: 1, result: null, deaths: null, combos: 0 };
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
        const before = run.d.party.reduce((a, x) => a + x.hp, 0);
        const { out, t, c } = botBattle(setup, rng);
        log.battles++;
        if (setup.kind === 'elite') log.elites++;
        log.durations.push(t);
        log.combos += out.stats.combos;
        const after = out.party.reduce((a, x) => a + x.hp, 0);
        log.hpLoss.push(before - after);
        if (VERBOSE) console.log(`  act${setup.act} d${setup.depth} ${setup.kind} ${setup.enemies.join('+')} ${out.victory ? 'WIN' : 'LOSS'} t=${t.toFixed(1)}s hp ${before}->${after} combos ${out.stats.combos} perfect ${out.stats.perfect} co ${out.stats.cashouts} forced ${out.stats.forced}`);
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
        const avg = run.d.party.reduce((a, x) => a + x.hp / x.maxHp, 0) / 3;
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
