// Usage: node tools/phase11-audit.mjs RESULT_JSON [samples per archetype] [first seed]
import fs from 'node:fs';
import { simulateCampaign } from './simulate.mjs';
import { CARD_LIST, ARCHETYPES, GRAFTS } from '../src/data/cards.js';
import { RELICS } from '../src/data/relics.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { EVENTS } from '../src/data/events.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { RECIPES } from '../src/data/recipes.js';
import { ENEMIES, FORMATIONS } from '../src/data/enemies.js';

const [file, count = '30', first = '1001'] = process.argv.slice(2);
if (!file || +count < 1 || +first < 1) throw Error('Pass an output path, positive sample size and first seed.');
const tags = Object.keys(ARCHETYPES);
const builds = tags.flatMap((target, i) => Array.from({ length: +count }, (_, n) => ({
  target, seed: +first + i + n * tags.length, profile: 'regular', reaction: 1, tactics: 'auto',
})));
const ordinary = ['quick','regular','learner'].flatMap((profile, i) =>
  Array.from({ length: +count }, (_, n) => ({ target:null, seed:+first + n, profile, reaction:[0.55,1,1.4][i], tactics:null })));
const reserve = ['beta_badge','spare_pockets'].flatMap((starterRelic) => Array.from({ length: +count }, (_, n) => ({
  starterRelic, target:'reserve', seed:+first+n, profile:'regular',reaction:1,tactics:'reserve',
})));
const runs = [...builds,...ordinary,...reserve].map(({seed,...condition}) => ({
  seed, condition, ...simulateCampaign(seed,{...condition,audit:true}),
}));
const sum = (rows, select) => rows.reduce((s,r)=>s+(select(r)||0),0);
const seen = (id, table) => sum(runs,r=>r.audit.acquired[table]?.includes(id)?1:0);
const audit = {
  cards: CARD_LIST.map(({id,name,tags,rarity,rank,variant,category,text}) => ({
    id,name,tags,rarity,rank,variant,category,text, offerings:sum(runs,r=>r.audit.offers[id]),
    acquired:seen(id,'cards'), plays:sum(runs,r=>r.audit.plays[id]),
  })),
  relics:Object.entries(RELICS).map(([id,d])=>({id,...d,acquired:seen(id,'relics')})),
  mutations:Object.entries(MUTATIONS).map(([id,d])=>({id,...d,acquired:seen(id,'mutations')})),
  grafts:Object.entries(GRAFTS).map(([id,d])=>({id,...d,heldInBattle:sum(runs,r=>r.audit.grafts[id])})),
  recipes:RECIPES.map(({id,name,tier,purpose,how,effect,tags})=>({id,name,tier,purpose,how,effect,tags,counts:sum(runs,r=>r.k['ex_'+id])})),
  enemies:Object.entries(ENEMIES).map(([id,e])=>({id,name:e.name,act:e.act,tier:e.tier,intents:Object.values(e.intents).map(({name,desc})=>({name,desc})),
    encounters:sum(runs,r=>r.audit.encounters.filter((e)=>e.enemies.includes(id)).length)})),
  formations:Object.entries(FORMATIONS).flatMap(([act, rows])=>rows.map(([weight, enemies, depth])=>({
    act:+act, weight, enemies, depth, occurrences:sum(runs,r=>r.audit.encounters.filter((e)=>e.act===+act && e.enemies.join()===enemies.join()).length),
  }))),
  events:EVENTS.map(({id,name,choices})=>({id,name,choices:choices.length,visits:sum(runs,r=>r.audit.services[id])})),
  achievements:ACHIEVEMENTS,
};
fs.writeFileSync(file, JSON.stringify({ count:+count, first:+first, audit, runs })+'\n');
console.log(`Audited ${runs.length} ordinary acquisitions/campaign simulations with explicit policy cohorts.`);
