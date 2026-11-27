// Measure ordinary campaigns with identical policies and observe resolved damage by enemy intent.
import fs from 'node:fs';
import { simulateCampaign } from './simulate.mjs';

const [file,start='1001',samples='30'] = process.argv.slice(2);
if (!file || !(+start > 0) || !(+samples > 0)) throw Error('Pass output path, first seed and number of runs per policy.');
const result = [];
for (const [profile,reaction] of Object.entries({quick:.55,regular:1,learner:1.4})) {
  for (let n=0;n<+samples;n++) {
    const seed = +start+n;
    const battles = [];
    const log = simulateCampaign(seed,{profile,reaction,target:null,tactics:null,audit:true,observeBattle(setup,out,c){
      if (setup.act < 3) return;
      const actions = [];
      const current = new Map();
      for (const e of c.events) {
        if (e.type==='enemyAct') {
          const a={enemy:e.id,intent:e.key,at:e.t,damage:0,blocked:0};
          actions.push(a); current.set(e.uid,a);
        } else if (e.type==='partyHit' && e.src) {
          const a=current.get(e.src);
          if (a) { a.damage+=e.amount; a.blocked+=e.blocked; }
        }
      }
      battles.push({ foes:setup.enemies, startHp:setup.hp, hp:out.hp, win:out.victory, t:c.t, actions,
        status:c.stats.interference,maxMomentum:c.momentumMax(),momentum:c.momentum,guard:c.guard,
        heroes:c.stats.byHero,passes:c.progress,adaptation:c.adapt,stashes:c.stats.stashes });
    }});
    result.push({seed,profile,win:log.result==='victory',act:log.act,opening:log.opening,battles,proofs:log.proofs,mechanics:log.k});
  }
}
fs.writeFileSync(file,JSON.stringify(result)+'\n');
for (const [profile,runs] of Object.entries(Object.groupBy(result,r=>r.profile))) {
  const losses=runs.filter(r=>!r.win);
  console.log(profile,runs.filter(r=>r.win).length,'/',runs.length,'Act III',runs.filter(r=>r.act===3).length,
    'losses',Object.fromEntries(Object.entries(Object.groupBy(losses,r=>r.battles.at(-1)?.foes.join('+')||'earlier Act')).map(([f,rs])=>[f,rs.length])));
}
