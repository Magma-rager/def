// Procedural notation for resolved impacts and mechanical responses. Every shape is readable
// without the palette. Geometry lives in actor space or impact space, never over the card tray.
import { circle, poly } from './draw.js';

const TAU = Math.PI * 2;
const line = (ctx, pts) => { poly(ctx, pts, false); ctx.stroke(); };
const ring = (ctx, x, y, r) => { circle(ctx, x, y, r); ctx.stroke(); };
const diamond = (ctx, x, y, r) => { poly(ctx, [x, y-r, x+r, y, x, y+r, x-r, y]); ctx.stroke(); };
const arc = (ctx, r, a, b) => { ctx.beginPath(); ctx.arc(0, 0, r, a, b); ctx.stroke(); };
const marks = (ctx, n, radius, tilt, draw) => {
  for (let i=0; i<n; i++) {
    const a = tilt + i * TAU/n;
    ctx.save(); ctx.translate(Math.cos(a)*radius, Math.sin(a)*radius); ctx.rotate(a);
    draw(ctx, i);
    ctx.restore();
  }
};

// Target paths are afterimages sampled at actual contact, so retargeting can never leave a
// projectile travelling to the target that happened to be selected at commit time.
export function drawContactPath(ctx, f, p) {
  const dx = f.x - f.sx, dy = f.y - f.sy;
  const length = Math.hypot(dx, dy);
  if (length < 8) return;
  ctx.save();
  ctx.translate(f.sx, f.sy);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.globalAlpha = (1-p) ** 2 * .8;
  ctx.strokeStyle = f.color;
  ctx.lineCap = 'round';
  if (f.shape === 'cleave' || f.shape === 'anvil') {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(length*.16, -15);
    ctx.quadraticCurveTo(length*.65, -24, length, 0);
    ctx.stroke();
  } else if (['fork','fan','cross','relay'].includes(f.shape)) {
    ctx.lineWidth = 1.4;
    for (const sign of [-1,1]) line(ctx, [0,0, length*.42, sign*9, length*.72, sign*7, length,0]);
  } else if (['rail','pressure','prism','scan'].includes(f.shape)) {
    ctx.lineWidth = f.shape === 'pressure' ? 3.2 : 2.2;
    line(ctx,[0,0, length*.17,1, length*.44,-1, length,0]);
    ctx.lineWidth = .8;
    line(ctx,[length*.16,4, length*.83,4, length,0]);
  } else {
    ctx.setLineDash([3,5]);
    ctx.lineWidth = 1.3;
    line(ctx,[0,0, length,0]);
  }
  ctx.restore();
}

export function drawSignal(ctx, f, p, reduced) {
  if (!reduced && f.sx != null) drawContactPath(ctx, f, p);
  ctx.save();
  ctx.translate(f.x, f.y);
  const scale = (f.size || 1) * (reduced ? .78 : .64 + p * .65);
  ctx.scale(scale, scale);
  ctx.strokeStyle = f.color;
  ctx.lineWidth = f.strong ? 2.35 : 1.85;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = (reduced ? .7 : .88) * (1 - p ** 2);
  const r = 17;
  switch (f.shape) {
    case 'cleave':
      ctx.rotate(-.56);
      ctx.beginPath(); ctx.moveTo(-30,2); ctx.quadraticCurveTo(1,-21,30,4);
      ctx.quadraticCurveTo(0,-6,-30,2); ctx.stroke();
      line(ctx,[-21,9,-9,2,14,0]); break;
    case 'anvil':
      line(ctx,[-27,2,-16,10,-7,6,3,17,13,5,23,9,32,0]);
      line(ctx,[1,-24,1,3,-5,-4,1,3,7,-4]); break;
    case 'stair':
    case 'ladder': {
      const step = f.shape === 'ladder' ? 9 : 7;
      line(ctx,[-27,16,-18,16,-18,8,-9,8,-9,0,1,0,1,-step,13,-step,13,-step*2,24,-step*2]);
      if(f.shape === 'ladder') line(ctx,[-18,22,26,-14]);
      break;
    }
    case 'stamp':
      ctx.strokeRect(-19,-13,38,26);
      ctx.setLineDash([2,3]); ctx.strokeRect(-25,-19,50,38);
      line(ctx,[-15,16,15,16]); break;
    case 'pressure':
      arc(ctx,23,-2.80,-.34); arc(ctx,17,-2.80,-.34);
      line(ctx,[-16,5,0,0,14,-16]); diamond(ctx,0,2,4); break;
    case 'dial':
      arc(ctx,20,-Math.PI*1.2,Math.PI*.25);
      marks(ctx,8,20,-.78,c=>line(c,[0,0,4,0]));
      line(ctx,[0,-13,0,0,10,4]); break;
    case 'interlock':
      for (const x of [-1,1]) line(ctx,[x*22,-14,x*9,-14,x*9,-6,x*3,-6,x*3,6,x*9,6,x*9,14,x*22,14]);
      ring(ctx,0,0,4); break;
    case 'splice':
      line(ctx,[-30,-10,-17,-10,-7,0,7,0,17,10,30,10]);
      line(ctx,[-30,10,-17,10,-7,0,7,0,17,-10,30,-10]);
      diamond(ctx,0,0,7); break;
    case 'ratchet':
      ring(ctx,0,0,11);
      marks(ctx,6,19,-.2,c=>line(c,[-4,-3,4,-3,4,4,0,4])); break;
    case 'fork':
      line(ctx,[-27,0,-8,0,13,-12,25,-12]);
      line(ctx,[-8,0,13,12,25,12]); diamond(ctx,5,0,4); break;
    case 'fan':
      for(const y of [-17,-9,0,9,17]) line(ctx,[-19,0,3,y*.6,23,y]);
      break;
    case 'rail':
      line(ctx,[-28,-7,20,-7,26,0,20,7,-28,7]);
      line(ctx,[13,-3,18,0,13,3]); break;
    case 'cinders':
    case 'rain':
      marks(ctx, f.shape === 'rain' ? 7 : 5, 20, p*.5, c=>line(c,[-4,4,0,-6,4,4])); break;
    case 'echo':
      arc(ctx,10,-1.7,1.7); arc(ctx,17,-1.56,1.56); arc(ctx,24,-1.42,1.42); break;
    case 'escrow':
      ctx.strokeRect(-14,-12,28,24);
      line(ctx,[-20,-4,-14,-4,-14,3,-20,3, -20,-4]);
      line(ctx,[20,-4,14,-4,14,3,20,3,20,-4]); break;
    case 'plates':
      for (const side of [-1,1]) line(ctx,[side*8,-22,side*19,-17,side*20,4,side*8,17]);
      diamond(ctx,0,-1,9); break;
    case 'mend':
      arc(ctx,18,-2.8,-.32); arc(ctx,18,.32,2.8);
      line(ctx,[-10,0,-4,0,-4,-6,4,-6,4,0,10,0,10,5,4,5,4,11,-4,11,-4,5,-10,5,-10,0]); break;
    case 'kit':
      ctx.strokeRect(-17,-9,34,24);
      line(ctx,[-7,-9,-7,-15,7,-15,7,-9]);
      line(ctx,[-8,3,8,3]);
      line(ctx,[0,-5,0,11]);
      break;
    case 'prism':
      diamond(ctx,0,0,22); diamond(ctx,0,0,12);
      line(ctx,[-24,8,0,0,25,-8]); break;
    case 'shear':
      line(ctx,[-24,16,-11,1,-2,3,9,-14,24,-20]);
      line(ctx,[-24,-12,-12,-12,-9,-7,6,-6,13,5,23,6]); break;
    case 'cross':
      line(ctx,[-24,-13,-8,-13,8,13,24,13]);
      line(ctx,[-24,13,-8,13,8,-13,24,-13]); ring(ctx,0,0,6); break;
    case 'scan':
      line(ctx,[-20,-6,-20,-16,-9,-16]); line(ctx,[9,-16,20,-16,20,-6]);
      line(ctx,[-20,6,-20,16,-9,16]); line(ctx,[9,16,20,16,20,6]);
      line(ctx,[-26,3,26,3]); ring(ctx,0,0,4); break;
    case 'cache':
      line(ctx,[-25,-9,-18,-15,16,-15,23,-8,23,8,14,14,-19,14,-25,8,-25,-9]);
      line(ctx,[-25,0,23,0]); diamond(ctx,0,0,6); break;
    case 'ledger':
      for (let i=0;i<3;i++) ring(ctx,(i-1)*15,(i-1)*-4,7);
      line(ctx,[-25,11,25,11]); break;
    case 'relay':
      marks(ctx,3,17,-Math.PI*.5,c=>diamond(c,0,0,6));
      line(ctx,[0,-11,11,5,-11,5,0,-11]); break;
    case 'harmonic':
      for(let i=0;i<3;i++) { ctx.save(); ctx.rotate(i*Math.PI/3); ctx.beginPath(); ctx.ellipse(0,0,24,8,0,0,TAU); ctx.stroke(); ctx.restore(); }
      break;
    default: ring(ctx,0,0,r);
  }
  ctx.restore();
}

// Layered physical response of the existing enemy rig. These poses are driven by intent charging,
// resolved impact and phase, with one identity-specific signature assembly for each boss.
export function enemyPose(profile, wind, contact, t, reduced) {
  if (reduced) return { x:0, y:0, angle:0, sx:1, sy:1 };
  const m = profile.motion;
  if (m === 'pounce') return { x:wind*15-contact*19, y:-contact*10, angle:wind*.10-contact*.08, sx:1+.17*wind, sy:1-.15*wind };
  if (m === 'skitter') return { x:Math.sin(t*8)*wind*5-contact*12, y:-contact*6, angle:Math.sin(t*14)*wind*.12, sx:1, sy:1-.13*wind };
  if (m === 'press') return { x:-contact*8, y:-wind*7, angle:wind*.08-contact*.09, sx:1+.12*contact, sy:1+.08*wind };
  if (m === 'dive') return { x:wind*6-contact*13, y:-wind*14+contact*6, angle:wind*.26-contact*.33, sx:1, sy:1 };
  if (m === 'brace') return { x:-contact*5, y:wind*6, angle:-wind*.10, sx:1+.10*wind, sy:1-.1*wind };
  if (m === 'clock') return { x:0, y:-wind*4, angle:-wind*.15+contact*.13, sx:1+.04*contact, sy:1 };
  if (m === 'mirror') return { x:0, y:-wind*8, angle:Math.sin(t*2)*wind*.24, sx:1+.22*wind, sy:1-.08*wind };
  if (m === 'fault') return { x:Math.sin(t*23)*wind*4-contact*6, y:-wind*8, angle:wind*.18-contact*.08, sx:1, sy:1+.09*wind };
  if (m === 'reactor') return { x:0, y:-wind*12, angle:contact*.15, sx:1+contact*.16, sy:1+wind*.08 };
  return { x: wind*4-contact*5, y:-wind*8, angle:wind*.12, sx:1+.09*contact, sy:1 };
}

export function drawEnemySignal(ctx, profile, { t, wind, hit, phase, die, top, boss, reduced }) {
  if (!boss && wind < .1 && hit <= .08 && die <= 0) return;
  ctx.save();
  const power = Math.max(wind, hit, die*0.7);
  ctx.translate(0, top*(boss?.53:.68));
  ctx.globalAlpha = boss ? .38 + power*.40 : .64*power;
  ctx.scale(1 + wind*.28 + die*.5, 1 + wind*.28 + die*.5);
  ctx.strokeStyle = profile.color;
  ctx.lineWidth = 1.35;
  if (profile.motion === 'clock') {
    const angle = reduced ? -.36 : t * (.65+wind*1.6);
    arc(ctx,30,angle,angle+4.4); arc(ctx,34,angle+.7,angle+3.55);
    marks(ctx,12,32,angle,c=>line(c,[0,0,4,0]));
  } else if (profile.motion === 'press') {
    for(const side of [-1,1]) line(ctx,[side*26,-22-wind*8,side*34,-15,side*34,13,side*22,18]);
  } else if (profile.motion === 'antenna') {
    const y = reduced ? -12 : Math.sin(t*2)*20;
    ctx.strokeRect(-30,-23,60,46);
    line(ctx,[-35,y,35,y]); line(ctx,[-29,y+4,29,y+4]);
  } else if (profile.motion === 'mirror') {
    const angle = reduced ? 0 : t*(phase>1 ? .86 : .42);
    marks(ctx,phase>1 ? 6 : 4,36,angle,c=>diamond(c,0,0,6+wind*3));
  } else if (profile.motion === 'fault') {
    for(let i=0;i<4;i++) {const y=-22+i*14; line(ctx,[-34,y,-13,y-4,3,y+5,30,y]);}
  } else if (profile.motion === 'reactor') {
    const angle = reduced ? .5 : t*(.46+phase*.18);
    for(let i=0;i<3;i++) arc(ctx,29+i*4,angle+i*.8,angle+i*.8+3.2);
    marks(ctx,6,42,angle,(c,i)=>{if (i<phase+1 || wind>.45) diamond(c,0,0,4);});
  } else marks(ctx,3,23,-.82,c=>line(c,[0,-4,5,0,0,4]));
  ctx.restore();
}
