// Packaged desktop browser smoke via standardized WebDriver BiDi, including Firefox ESR.
// Launch Firefox with --headless --remote-debugging-port 9228 and an isolated profile first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
const [out, url='http://localhost:8151/dist/index.html', endpoint='ws://localhost:9228/session'] = process.argv.slice(2);
if (!out) throw Error('Pass an evidence directory.');
fs.mkdirSync(out,{recursive:true});
const ws=new WebSocket(endpoint);
await new Promise((resolve,reject)=>{ ws.addEventListener('open',resolve,{once:true}); ws.addEventListener('error',reject,{once:true}); });
let seq=0;
const messages=new Map();
const errors=[];
ws.addEventListener('message',e=>{
  const msg=JSON.parse(e.data);
  if(msg.method==='log.entryAdded' && msg.params.type==='javascript' && msg.params.level==='error') errors.push(msg.params.text);
  if(!messages.has(msg.id)) return;
  const {resolve,reject,timer}=messages.get(msg.id);
  messages.delete(msg.id); clearTimeout(timer);
  if(msg.type==='success') resolve(msg.result); else reject(Error(JSON.stringify(msg)));
});
function rpc(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++seq;
    const timer=setTimeout(()=>{messages.delete(id);reject(Error(`Browser timed out on ${method}`));},20000);
    messages.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
}
let created=false;
try {
  const session=await rpc('session.new',{capabilities:{alwaysMatch:{}}});
  created=true;
  await rpc('session.subscribe',{events:['log.entryAdded']});
  const {userContext}=await rpc('browser.createUserContext');
  const {context}=await rpc('browsingContext.create',{type:'tab',userContext});
  await rpc('browsingContext.setViewport',{context,viewport:{width:844,height:390},devicePixelRatio:2});
  const evaluate=async expression=>{
    const answer=await rpc('script.evaluate',{target:{context},expression:`JSON.stringify(${expression})`,awaitPromise:true});
    if(answer.type==='exception') throw Error(JSON.stringify(answer.exceptionDetails));
    return answer.result.value===undefined?undefined:JSON.parse(answer.result.value);
  };
  const ready=async (expression,timeout=13000)=>{
    const stop=Date.now()+timeout;
    do { if(await evaluate(expression)) return; await wait(120); } while(Date.now()<stop);
    throw Error(`Condition timed out: ${expression}`);
  };
  const tap=async selector=>{
    const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return null; e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];})()`);
    assert.ok(point,selector);
    const [x,y]=point.map(Math.round);
    await rpc('input.performActions',{context,actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[
      {type:'pointerMove',x,y,duration:0},{type:'pointerDown',button:0},{type:'pointerUp',button:0},
    ]}]});
  };
  const snap=(name)=>rpc('browsingContext.captureScreenshot',{context}).then(r=>fs.writeFileSync(`${out}/${name}.png`,Buffer.from(r.data,'base64')));
  await rpc('browsingContext.navigate',{context,url,wait:'complete'});
  await ready('!!window.__sb && !!document.querySelector(".title-menu")');
  await ready('document.fonts.ready.then(()=>document.fonts.check("12px Spectral","Жя"))');
  await tap('.lang-switch [lang=ru]');
  await ready('document.documentElement.lang === "ru"');
  await tap('.title-menu .btn.primary');
  await tap('.starter-panel .btn.primary');
  await ready('!!document.querySelector(".dlg-skip")');
  await tap('.dlg-skip');
  await ready('!!document.querySelector(".map-node.avail") && !document.querySelector(".dialog-layer")');
  await tap('.map-node.avail');
  await ready('!!document.querySelector(".map-info .btn.primary")');
  await tap('.map-info .btn.primary');
  for(let tries=0;tries<20;tries++) {
    if(await evaluate('!!document.querySelector(".dlg-skip")')) await tap('.dlg-skip');
    if(await evaluate('!!window.__sb.battle')) break;
    await wait(200);
  }
  await ready('!!window.__sb.battle');
  const play=()=>evaluate('(()=>{const b=window.__sb.battle,c=b.combat;return c?.hand.find(u=>u&&c.def(u).category==="basic"&&c.check(u).ok)??null;})()');
  for(let i=0;i<10;i++) {
    if(await evaluate('!!window.__sb.battle.lessonOpen')) {
      await wait(550); await tap('.tut-layer:not([hidden]) .btn.primary');
    } else if(await play()) break;
    await wait(250);
  }
  const uid=await play(); assert.ok(uid);
  await tap(`.hand .card[data-uid="${uid}"]`);
  await ready('window.__sb.battle.combat.stats.basics > 0');
  await wait(400);
  const first=await evaluate('({hp:window.__sb.run.d.hp,seed:window.__sb.run.d.seed,t:window.__sb.battle.combat.t,lang:document.documentElement.lang,canvas:!!document.querySelector("canvas").getContext("2d"),audio:window.__sb.audio.ctx?.state})');
  await snap('battle');
  await rpc('browsingContext.reload',{context,wait:'complete'});
  await ready('!!document.querySelector(".title-menu .btn.primary") && window.__sb.hasSave()');
  await tap('.title-menu .btn.primary');
  await ready('!!window.__sb.battle');
  const restored=await evaluate('({seed:window.__sb.run.d.seed,lang:document.documentElement.lang})');
  assert.equal(restored.seed,first.seed);
  assert.equal(restored.lang,'ru');
  assert.deepEqual(errors,[]);
  const report={browser:session.capabilities.browserName,version:session.capabilities.browserVersion,viewport:'844x390 DPR2',first,restored,errors};
  fs.writeFileSync(`${out}/bidi.json`,JSON.stringify(report,null,2)+'\n');
  console.log(report);
} finally {
  if(created) await rpc('session.end').catch(()=>{});
  ws.close();
}
