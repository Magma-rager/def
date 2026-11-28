// Comparable combat measurements. Run from the source checkpoint for each variant.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { CARDS, STARTER_DECK } from '../src/data/cards.js';
import { Combat, RULES } from '../src/engine/combat.js';
import { simulateCampaign } from './simulate.mjs';
import { restorativePerformer } from './lib/bot.mjs';

const [mode = 'sequences', output, first = '1001', count = '30'] = process.argv.slice(2);
if (!['sequences', 'campaigns', 'soak'].includes(mode)) throw Error('Use sequences, campaigns or soak.');
const party = ['V', 'C', 'S'].map((id) => ({ id }));
const standard = new Set(Object.values(CARDS).filter((d) => d.standard ||
  (!CARDS.scrapline.standard && ['scrapline', 'rivet_jab', 'piston_strike'].includes(d.id))).map((d) => d.id));
const reactions = { quick: .55, regular: 1, learner: 1.4 };

function advance(c, dt) {
  for (let i = 0; i < Math.ceil(dt * 60 - 1e-9) && c.phase !== 'END'; i++) c.update(1 / 60);
}
function settle(c) {
  for (let i = 0; i < 360 && c.phase !== 'END' && (c.executing || c.queue.length); i++) c.update(1 / 60);
  assert.ok(!c.executing && !c.queue.length);
  assert.ok(c.verifyZones().ok);
}
function measurePath(input, pace, ex) {
  RULES.EX_COMBOS = ex;
  const ids = input.filter((id) => !['finish', 'relay'].includes(id));
  const deck = ids.map((id, i) => ({ uid: `c${i}`, id, up: false }));
  const c = new Combat({ deck, party, hp: 130, maxHp: 130, enemies: ['iron_maw'], seed: 17, act: 1 });
  c.hand = Array.from({ length: RULES.HAND }, (_, i) => deck[i]?.uid || null);
  c.draw = [];
  c.enemies[0].hp = c.enemies[0].maxHp = 10000;
  c.momentum = 4;
  c.drainEvents();
  let i = 0, minFlow = Infinity, completed = true;
  for (const id of input) {
    if (c.combo) minFlow = Math.min(minFlow, c.flowLeft());
    if (id === 'finish' && !c.combo && c.history[0]?.len === ids.length && c.history[0].type === 'perfect') break;
    const action = id === 'relay' ? c.selectHero('C') : id === 'finish' ? c.finishOrCashOut() : c.playCard(`c${i++}`);
    if (!action.ok) { completed = false; break; }
    settle(c);
    if (id !== input.at(-1)) advance(c, pace);
  }
  const dmg = c.stats.damage;
  return { path: input.join(' '), pace, ex, completed, seconds: c.t, damage: dmg, dps: dmg / c.t,
    hpLost: 130 - c.hp, enemyActions: c.events.filter((e) => e.type === 'enemyAct').length,
    minFlow: Number.isFinite(minFlow) ? minFlow : null, guard: c.stats.guardGained,
    momentumSpent: c.stats.momentumSpent, momentumNet: c.momentum - 4, exTriggered: c.stats.exByRecipe };
}
function sequences() {
  const [w, m, s, a, ca] = ['scrapline', 'rivet_jab', 'piston_strike', 'scrapfall', 'thermal_lance'];
  const paths = [[w,a],[m,a],[s,a],[w,s,a],[m,s,a],[w,m,s,a],
    [w,m],[w,m,s],[s,a,'relay',w,ca],[s,a,'relay',m,ca],[s,'relay',w,ca],[w,m,s,a,'relay',w,ca]];
  return paths.flatMap((cards) => [.55, 1.4, 2.5].flatMap((pace) =>
    [true, false].map((ex) => measurePath([...cards, 'finish'], pace, ex))));
}

function tallyBattle(c, m) {
  const commands = new Map();
  let previous = null;
  let needOpener = false;
  let prevArte = false;
  let position = 0;
  let chronological = true;
  for (const event of c.events) {
    if (event.type === 'act' && event.cmd) commands.set(event.cmd, event);
    if (event.type === 'relay') {
      m.relays++;
      prevArte = previous?.category === 'arte';
      m.afterArte += +prevArte;
      needOpener = true; position = 0; chronological = true;
    }
    if (event.type === 'comboEnd') {
      position = 0; chronological = true; needOpener = false; previous = null;
    }
    if (event.type === 'execResolve' && event.cmdType === 'support') {
      const a = commands.get(event.id);
      if (a?.id === 'mend_circuit') m.kits[a.who]++;
    }
    if (event.type === 'heal' && event.cue?.card === 'mend_circuit') m.kitHp += event.amount;
    if (event.type !== 'execResolve' || event.cmdType !== 'card') continue;
    const a = commands.get(event.id);
    if (!a) continue;
    const d = CARDS[a.id];
    if (d.category === 'basic') {
      m[standard.has(d.id) ? 'standard' : 'specialized']++;
      if (!position) m.openRanks[a.rank] = (m.openRanks[a.rank] || 0) + 1;
      if (needOpener) {
        m.relayOpener++;
        m.relayWeak += +(d.rank === 1 && a.rank === 1);
        m.arteWeak += +(prevArte && d.rank === 1 && a.rank === 1);
      }
      chronological &&= d.rank === position + 1 && a.rank === position + 1;
      if (chronological && position === 2) m.ladders++;
    } else {
      if (position === 3 && chronological) m.ladderArtes++;
      else if (previous?.category === 'basic') m.shortArtes++;
      chronological = false;
    }
    position++;
    previous = a;
    needOpener = false;
  }
}

function campaigns() {
  const result = [];
  for (const [profile, reaction] of Object.entries(reactions)) {
    for (let i = 0; i < +count; i++) {
      const seed = +first + i;
      const m = { standard: 0, specialized: 0, relays: 0, afterArte: 0, relayWeak: 0, arteWeak: 0, relayOpener: 0,
        openRanks: [0, 0, 0, 0], ladders: 0, ladderArtes: 0, shortArtes: 0, kitHp: 0, kits: { V: 0, C: 0, S: 0 },
        choosing: 0, openChoices: 0, noOpener: 0, continueChoices: 0, noContinue: 0 };
      const run = simulateCampaign(seed, { profile, reaction, target: null, tactics: null, audit: true, observeBattle(_setup, _out, c) { tallyBattle(c, m); },
        observeDecision(c) {
          if (c.executing || c.queue.length || !['PRE', 'ACTIVE'].includes(c.phase)) return;
          m.choosing++;
          const offensive = [...c.hand, ...c.reserve].some((uid) => uid && c.categoryOf(uid) !== 'support' && c.check(uid).ok);
          if (c.phase === 'PRE' && c.starter()) { m.openChoices++; if (!offensive) m.noOpener++; }
          if (c.combo?.cards.at(-1)?.category === 'basic' && !c.combo.pendingEnd) { m.continueChoices++; if (!offensive) m.noContinue++; }
        },
      });
      const offered = Object.entries(run.audit.offers);
      const acquired = run.audit.acquired.cards || [];
      const additions = run.audit.endDeck.filter((card) => Number(card.uid.slice(1)) > STARTER_DECK.length);
      result.push({ seed, profile, won: run.result === 'victory', left: run.act, fights: run.battles,
        m, duration: run.durations.reduce((a,b) => a+b, 0), hpLost: run.hpLoss.reduce((a,b) => a+b, 0),
        standardOffers: offered.filter(([id]) => standard.has(id)).reduce((s,[,n]) => s+n,0),
        specialOffers: offered.filter(([id]) => CARDS[id].category === 'basic' && !standard.has(id)).reduce((s,[,n]) => s+n,0),
        standardAcquired: acquired.filter((id) => standard.has(id)), specialAcquired: acquired.filter((id) => CARDS[id].category === 'basic' && !standard.has(id)),
        retainedAdditions: additions.filter((c) => CARDS[c.id].category === 'basic'),
        upgradedBasics: run.audit.endDeck.filter((c) => c.up && CARDS[c.id].category === 'basic'),
        offeredKits: run.audit.offers.mend_circuit || 0, acquiredKit: acquired.includes('mend_circuit'), upgradeServices: run.prog.upgrades,
        cash: run.k.cashouts || 0, dropped: run.k.forced || 0, attackDamage: run.k.damage || 0, momentumSpent: run.k.momentumSpent || 0,
      });
    }
  }
  return result;
}
function soak() {
  const heavy = ['mend_circuit','mend_circuit','mend_circuit','low_gear','low_gear','salvage','salvage','hold_the_line',
    'scrapline','rivet_jab','piston_strike','scrapfall','bolt_volley'];
  return [STARTER_DECK, heavy.map((id) => ({ id }))].flatMap((specs,i) =>
    ['rush_hound','foundry_warden','signalbreak_core'].flatMap((enemy) => Array.from({ length: 10 }, (_, j) => {
      const deck = specs.map((spec, k) => ({...spec, uid:`c${k}`}));
      const c = new Combat({ deck, party, hp: 91, maxHp: 130, enemies:[enemy], seed:500+j, act:enemy==='signalbreak_core'?3:1 });
      for (let turn=0;turn<480 && c.phase!=='END';turn++) {
        advance(c, .75);
        if (c.phase === 'END') break;
        const playable = c.hand.filter((u) => u && c.categoryOf(u) === 'support' && c.check(u).ok);
        const type = (id) => playable.find((u) => c.def(u).id === id);
        const heal = c.hp < 114 && type('mend_circuit');
        const u = heal || type('low_gear') || type('salvage') || type('hold_the_line');
        if (u) c.playCard(u,{performer:restorativePerformer(c,u)});
        else if (c.available()>=RULES.MOMENTUM_COST && c.guard<10) c.spendMomentumGuard();
        else if (c.churn.charges) {
          const dud = c.hand.find((uid)=>uid && c.categoryOf(uid)!=='support');
          if (dud) c.churnCard(dud);
        }
        assert.ok(c.verifyZones().ok);
      }
      return { deck:i?'healing/Guard stress':'starter', seed:500+j, enemy, seconds:c.t, hp:c.hp,
        damage:c.stats.damage, guardAbsorbed:c.stats.guardAbsorbed, supports:c.stats.supports,
        healed:c.events.filter((e)=>e.type==='heal').reduce((s,e)=>s+e.amount,0), defeated:c.phase==='END'&&!c.result?.victory };
    })));
}

const result = mode === 'sequences' ? sequences() : mode === 'campaigns' ? campaigns() : soak();
const json = JSON.stringify(result, null, 2);
if (output) fs.writeFileSync(output,`${json}\n`);
else console.log(json);
