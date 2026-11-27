import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, defaultMeta, defaultSettings } from '../src/engine/save.js';
import { Run } from '../src/engine/run.js';
import { Combat } from '../src/engine/combat.js';
import { BOSSES, ENEMIES, FORMATIONS } from '../src/data/enemies.js';
import { addRunRecipe } from '../src/engine/progression.js';

const keys = { run:'signalbreak.run.v3',meta:'signalbreak.meta.v1',settings:'signalbreak.settings.v1' };
function disk() {
  const values = new Map();
  return { values, store: { getItem:(k)=>values.get(k)??null, setItem:(k,v)=>values.set(k,v), removeItem:(k)=>values.delete(k) } };
}

const newRun = () => Run.create({seed:120421,tutorial:false});

test('unreadable records survive beginning, checkpointing, finalization and settings writes', () => {
  const { store,values } = disk();
  values.set(keys.meta,'{"hadRecords":');
  values.set(keys.run,'broken');
  values.set(keys.settings,'[]');
  const old = [...values];
  const save = createSave(store);
  assert.equal(save.healthy(),false);
  assert.equal(save.checkpoint(newRun(),save.loadMeta()).ok,false);
  assert.equal(save.finish(newRun(),'defeat',defaultMeta()).ok,false);
  assert.equal(save.saveSettings(defaultSettings()),false);
  assert.equal(save.saveMeta(defaultMeta()),false);
  assert.deepEqual([...values],old);
});

test('storage that rejects reads cannot be mistaken for an empty writable save', () => {
  const writes = [];
  const save = createSave({getItem(){ throw Error('denied'); }, setItem(k,v){ writes.push([k,v]); }});
  assert.equal(save.healthy(),false);
  assert.equal(save.checkpoint(newRun(),save.loadMeta()).ok,false);
  assert.equal(save.finish(newRun(),'abandoned',defaultMeta()).ok,false);
  assert.deepEqual(writes,[]);
});

test('numeric settings are safe for WebAudio and an explicit game erase preserves other origin data', () => {
  const { store,values } = disk();
  const malformed = {master:'NaN',music:4,sfx:-1,muted:'false',hints:false,tactical:true,lang:'ru'};
  values.set(keys.settings,JSON.stringify(malformed));
  values.set('unrelated', 'keep');
  const save = createSave(store);
  assert.deepEqual(save.loadSettings(),{ ...defaultSettings(),music:1,sfx:0,hints:false,tactical:true,lang:'ru' });
  assert.deepEqual(JSON.parse(values.get(keys.settings)),malformed);
  assert.ok(save.erase());
  assert.deepEqual([...values],[['unrelated','keep']]);
});

test('a stale tab cannot overwrite a more recent checkpoint in the same encounter or clear a new run', () => {
  const { store,values } = disk();
  const foreground = createSave(store);
  const background = createSave(store);
  const live = newRun();
  let profile = foreground.checkpoint(live,foreground.loadMeta()).meta;
  const stale = Run.load(background.loadRun());
  const staleProfile = background.loadMeta();
  addRunRecipe(live,'switchyard',120);
  profile = foreground.checkpoint(live,profile).meta;
  const recent = [...values];
  assert.deepEqual(background.checkpoint(stale,staleProfile),{ok:false,changed:true});
  assert.equal(background.saveMeta(staleProfile),false);
  assert.deepEqual(background.finish(stale,'abandoned',staleProfile),{ok:false,changed:true});
  assert.deepEqual([...values],recent);
  const finish = foreground.finish(live,'defeat',profile);
  const successor = newRun();
  assert.ok(foreground.checkpoint(successor,finish.meta).ok);
  assert.ok(background.finish(stale,'defeat',staleProfile).ok,'a duplicate may read its already settled result');
  assert.equal(foreground.loadRun().progress.id,successor.d.progress.id);
  assert.equal(foreground.loadMeta().combos.switchyard.count,1);
});

test('all nodes are reachable and all paths terminate at a valid boss over 1024 generated campaigns', () => {
  const ordinary = new Set();
  for (let seed=1;seed<=1024;seed++) {
    const run = Run.create({seed,tutorial:false});
    for (const act of [1,2,3]) {
      run.d.act = act;
      run.d.pending = null;
      run.generateMap(act);
      assert.ok(BOSSES[act].includes(run.d.map.bossId));
      const {nodes} = run.d.map;
      const roots = run.availableNodes();
      const reachable = new Set(roots);
      assert.ok(roots.length > 0);
      for (const node of nodes) {
        assert.ok(reachable.has(node.id),`reachable seed ${seed}, node ${node.id}`);
        assert.ok(node.type==='boss' || node.edges.length > 0);
        assert.ok(node.type!=='elite' || node.depth>=3);
        for (const id of node.edges) {
          reachable.add(id);
          assert.equal(run.node(id)?.depth,node.depth+1);
        }
        if (node.type === 'battle') {
          // Select an ordinary generated node in isolation to measure every pool, not a played campaign.
          run.d.pending = {type:'battle',nodeId:node.id,kind:'battle'};
          const {enemies} = run.battleSetup();
          assert.ok(FORMATIONS[act].some(([,ids,depth])=>node.depth>=depth && ids.join()===enemies.join()));
          ordinary.add(`${act}:${enemies.join()}`);
        }
      }
    }
  }
  assert.equal(ordinary.size,33);
});

test('Signal Collapse gives the late Core pattern a response window before the next Beam', () => {
  const c = new Combat({deck:[{uid:'a',id:'scrapline'}],party:['V','C','S'].map(id=>({id})),hp:130,maxHp:130,
    enemies:['signalbreak_core'],act:3,seed:4});
  const e = c.enemies[0];
  e.phase = 3;
  e.actCount = 1;
  c.chooseIntent(e);
  assert.equal(e.intent.key,'collapse');
  assert.equal(e.intent.dmg,c.edmg(e,11));
  c.enemyAct(e);
  assert.equal(e.intent.key,'tempo');
  assert.equal(ENEMIES.signalbreak_core.ai({...e,actCount:4},c),'beam');
});

test('Mirror Array previews Reflection using the same dynamic damage as the next contact', () => {
  const c = new Combat({deck:[{uid:'a',id:'scrapline'}],party:['V','C','S'].map(id=>({id})),hp:130,maxHp:130,
    enemies:['mirror_array'],act:2,seed:4});
  const e = c.enemies[0];
  e.actCount = 1;
  c.chooseIntent(e);
  assert.equal(e.intent.key,'reflect');
  assert.equal(e.intent.dmg,c.edmg(e,8));
  c.history.push({strongest:40});
  const predicted = c.mitigate(e,c.edmg(e,24),c.hitTarget(e.intent.target),{});
  assert.equal(e.intent.dmg,c.edmg(e,24));
  c.enemyAct(e);
  assert.equal(130-c.hp,predicted);
});
