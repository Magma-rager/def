// Articulated 2D character rigs (forward kinematics) with keyframed animation clips.
// Units: ~100u tall characters, origin at the feet, facing right. Angles: limbs 0 = down,
// positive = swing forward (+x); torso lean positive = top forward; weapon angle is absolute.
import { capsule, fillStroke, circle, ellipse, poly, rivets, lin, glow, INK, roundRect, gear } from './draw.js';
import { lerp, easeInOut } from '../core/util.js';

const DIMS = { thigh: 21, shin: 21, torso: 31, upper: 15, fore: 14, headR: 10.5 };
const dir = (a) => [Math.sin(a), Math.cos(a)];

const BASE_POSE = {
  lean: 0, head: 0, armF: [0.2, 0.3], armB: [0.1, 0.3], legF: [0.2, 0.1], legB: [-0.2, 0.1],
  weapon: 3.1, shield: 1.6, x: 0, y: 0, lift: 0, kneel: 0, shieldFront: 0, glow: 0,
};

function mergePose(a, b) {
  const p = { ...a };
  for (const k of Object.keys(b)) p[k] = Array.isArray(b[k]) ? b[k].slice() : b[k];
  return p;
}
export function lerpPose(a, b, t) {
  const p = {};
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k] === undefined ? va : b[k];
    if (Array.isArray(va)) p[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)];
    else if (typeof va === 'number') p[k] = lerp(va, vb, t);
    else p[k] = t < 0.5 ? va : vb;
  }
  return p;
}

// Compute joint positions from a pose.
export function skeleton(P, scale = 1) {
  const D = DIMS;
  const thF = P.legF[0], shF = thF - P.legF[1];
  const thB = P.legB[0], shB = thB - P.legB[1];
  const depF = D.thigh * Math.cos(thF) + D.shin * Math.cos(shF);
  const depB = D.thigh * Math.cos(thB) + D.shin * Math.cos(shB);
  const hipY = -Math.max(depF, depB) - P.lift + P.y;
  const hip = [P.x, hipY];
  const hjF = [hip[0] + 2.5, hip[1]], hjB = [hip[0] - 2.5, hip[1]];
  const dF1 = dir(thF), dF2 = dir(shF), dB1 = dir(thB), dB2 = dir(shB);
  const kneeF = [hjF[0] + dF1[0] * D.thigh, hjF[1] + dF1[1] * D.thigh];
  const footF = [kneeF[0] + dF2[0] * D.shin, kneeF[1] + dF2[1] * D.shin];
  const kneeB = [hjB[0] + dB1[0] * D.thigh, hjB[1] + dB1[1] * D.thigh];
  const footB = [kneeB[0] + dB2[0] * D.shin, kneeB[1] + dB2[1] * D.shin];
  const up = [Math.sin(P.lean), -Math.cos(P.lean)];
  const right = [Math.cos(P.lean), Math.sin(P.lean)];
  const T = D.torso * scale;
  const neck = [hip[0] + up[0] * T, hip[1] + up[1] * T];
  const sh = (side) => [hip[0] + up[0] * (T - 3) + right[0] * side, hip[1] + up[1] * (T - 3) + right[1] * side];
  const shoF = sh(2), shoB = sh(-2);
  const arm = (s, A) => {
    const a1 = P.lean + A[0], a2 = a1 + A[1];
    const d1 = dir(a1), d2 = dir(a2);
    const el = [s[0] + d1[0] * D.upper, s[1] + d1[1] * D.upper];
    const ha = [el[0] + d2[0] * D.fore, el[1] + d2[1] * D.fore];
    return { s, el, ha, a1, a2 };
  };
  const hd = [Math.sin(P.lean + P.head), -Math.cos(P.lean + P.head)];
  const head = [neck[0] + hd[0] * D.headR * 0.95, neck[1] + hd[1] * D.headR * 0.95];
  return { hip, hjF, hjB, kneeF, footF, kneeB, footB, neck, head, armF: arm(shoF, P.armF), armB: arm(shoB, P.armB), up, right, T };
}

// ───────────────────────── character looks ─────────────────────────
function boot(ctx, knee, foot, color, trim) {
  capsule(ctx, knee[0], knee[1], foot[0], foot[1] - 2, 4.2, 4.6);
  fillStroke(ctx, color, 1.4);
  poly(ctx, [foot[0] - 4.5, foot[1] - 5, foot[0] + 7.5, foot[1] - 3.5, foot[0] + 8, foot[1] + 0.5, foot[0] - 5, foot[1] + 0.5]);
  fillStroke(ctx, color, 1.4);
  if (trim) { ctx.fillStyle = trim; ctx.fillRect(foot[0] - 4.5, foot[1] - 1.2, 12, 1.6); }
}

function limb(ctx, a, b, r1, r2, color, lw = 1.4) {
  capsule(ctx, a[0], a[1], b[0], b[1], r1, r2);
  fillStroke(ctx, color, lw);
}

function hand(ctx, p, color) {
  circle(ctx, p[0], p[1], 3.3);
  fillStroke(ctx, color, 1.3);
}

// HESSA RIVETBOURNE — Vanguard: rust plate armor, brass trim, tower shield, piston hammer.
const HESSA = {
  id: 'V', scale: 1.06, torsoScale: 1,
  col: { armor: '#a8432b', armorHi: '#c9603f', armorLo: '#6e2618', trim: '#d4ad52', under: '#4a2840', skin: '#e0ae88', hair: '#3a2224', plume: '#d4503a', leather: '#5a3a26' },
  drawBack(ctx, P, S, t) {
    // plume trailing behind helmet
    const c = this.col;
    const h = S.head;
    ctx.save();
    ctx.translate(h[0], h[1]);
    ctx.rotate(P.lean + P.head);
    const sway = Math.sin(t * 3) * 1.5 - P.lean * 6;
    ctx.beginPath();
    ctx.moveTo(-2, -10);
    ctx.quadraticCurveTo(-10, -17 + sway * 0.3, -20 + sway, -8);
    ctx.quadraticCurveTo(-12, -9, -4, -6);
    ctx.closePath();
    fillStroke(ctx, c.plume, 1.3);
    ctx.restore();
  },
  drawLegs(ctx, P, S) {
    const c = this.col;
    const legs = [[S.hjB, S.kneeB, S.footB, c.armorLo], [S.hjF, S.kneeF, S.footF, c.armor]];
    for (const [hj, kn, ft, col] of legs) {
      limb(ctx, hj, kn, 5.6, 4.8, c.under);
      // thigh plate
      limb(ctx, [lerp(hj[0], kn[0], 0.25), lerp(hj[1], kn[1], 0.25)], kn, 5, 4.2, col);
      boot(ctx, kn, ft, col, c.trim);
      circle(ctx, kn[0], kn[1], 4.2);
      fillStroke(ctx, c.trim, 1.2);
    }
  },
  drawTorso(ctx, P, S) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.hip[0], S.hip[1]);
    ctx.rotate(P.lean);
    // tasset skirt
    poly(ctx, [-11, -3, 12, -3, 15, 9, -13, 9]);
    fillStroke(ctx, c.armorLo, 1.5);
    poly(ctx, [-3, -3, 4, -3, 5, 10, -4, 10]);
    fillStroke(ctx, c.armor, 1.2);
    // cuirass
    ctx.beginPath();
    ctx.moveTo(-11, -2);
    ctx.lineTo(-13, -22);
    ctx.quadraticCurveTo(-12, -32, -2, -33);
    ctx.lineTo(6, -33);
    ctx.quadraticCurveTo(15, -31, 14, -20);
    ctx.lineTo(12, -2);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, -12, -30, 14, -4, [c.armorHi, c.armor, c.armorLo]), 1.7);
    // chest rib & gear emblem
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1, -31);
    ctx.lineTo(1.5, -4);
    ctx.stroke();
    gear(ctx, 4, -20, 5, 8, 0, c.trim, 1, 0.4);
    // belt
    ctx.fillStyle = c.leather;
    ctx.fillRect(-12, -5, 25, 4);
    ctx.fillStyle = c.trim;
    ctx.fillRect(1, -5.5, 5, 5);
    rivets(ctx, [-9, -26, 10, -26, -10, -12, 11, -12], 1.1);
    ctx.restore();
  },
  drawHead(ctx, P, S, t) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.head[0], S.head[1]);
    ctx.rotate(P.lean + P.head);
    // neck
    ctx.fillStyle = c.under;
    ctx.fillRect(-4, 6, 8, 6);
    // face
    ellipse(ctx, 1.5, 1, 9, 10);
    fillStroke(ctx, c.skin, 1.5);
    // braid
    ctx.beginPath();
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(-13, 9, -10, 15);
    ctx.lineWidth = 4;
    ctx.strokeStyle = c.hair;
    ctx.stroke();
    // half helm
    ctx.beginPath();
    ctx.moveTo(-10, 1);
    ctx.quadraticCurveTo(-11, -11, 1, -12);
    ctx.quadraticCurveTo(12, -11, 11, -1);
    ctx.lineTo(8, -1);
    ctx.lineTo(7, -4);
    ctx.lineTo(-5, -3);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, 0, -12, 0, 2, [c.armorHi, c.armor]), 1.5);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-9, -3.5, 19, 2);
    // eye + brow
    ctx.fillStyle = INK;
    ctx.fillRect(5, 0.5, 2.4, 2.6);
    ctx.fillRect(3.5, -1.2, 5, 1);
    // mouth set
    ctx.fillRect(5, 6, 3.5, 0.9);
    ctx.restore();
  },
  drawArm(ctx, P, S, side) {
    const c = this.col;
    const A = side === 'F' ? S.armF : S.armB;
    const base = side === 'F' ? c.armor : c.armorLo;
    limb(ctx, A.s, A.el, 4.6, 4, c.under);
    limb(ctx, A.el, A.ha, 4, 3.6, base);
    // pauldron
    ellipse(ctx, A.s[0], A.s[1] + 0.5, 6.6, 5.6, A.a1 * -0.4);
    fillStroke(ctx, lin(ctx, A.s[0], A.s[1] - 6, A.s[0], A.s[1] + 6, [c.armorHi, base]), 1.5);
    rivets(ctx, [A.s[0] - 3, A.s[1] - 2, A.s[0] + 3, A.s[1] - 2], 1);
    hand(ctx, A.ha, c.leather);
  },
  drawWeapon(ctx, P, S, t) {
    // piston hammer in the front hand
    const c = this.col;
    const h = S.armF.ha;
    ctx.save();
    ctx.translate(h[0], h[1]);
    ctx.rotate(-P.weapon);
    // haft: extends along +y (business end) from slightly behind the grip
    roundRect(ctx, -1.8, -9, 3.6, 44, 1.5);
    fillStroke(ctx, '#5a3a26', 1.3);
    ctx.fillStyle = c.trim;
    ctx.fillRect(-2.2, 6, 4.4, 2.5);
    // head
    ctx.save();
    ctx.translate(0, 36);
    roundRect(ctx, -9, -6, 18, 13, 2.5);
    fillStroke(ctx, lin(ctx, -9, -6, 9, 7, ['#9b9aa0', '#6a6670', '#3f3b45']), 1.6);
    roundRect(ctx, 9, -3.5, 4, 7, 1);
    fillStroke(ctx, c.trim, 1.2);
    roundRect(ctx, -13, -4.5, 4, 9, 1);
    fillStroke(ctx, c.armor, 1.2);
    // piston
    ctx.fillStyle = c.trim;
    ctx.fillRect(-5, -9, 2.5, 4);
    ctx.fillRect(2.5, -9, 2.5, 4);
    if (P.glow > 0) glow(ctx, 0, 0, 22, '#f0b25a', P.glow * 0.8);
    ctx.restore();
    ctx.restore();
  },
  drawOffhand(ctx, P, S) {
    // tower shield on the back hand
    const c = this.col;
    const h = S.armB.ha;
    ctx.save();
    ctx.translate(h[0] + 2, h[1] - 2);
    ctx.rotate((P.shield - 1.6) * 0.5);
    ctx.beginPath();
    ctx.moveTo(-7, -17);
    ctx.lineTo(7, -17);
    ctx.quadraticCurveTo(10, -16, 10, -12);
    ctx.lineTo(9, 10);
    ctx.quadraticCurveTo(5, 18, 0, 20);
    ctx.quadraticCurveTo(-5, 18, -9, 10);
    ctx.lineTo(-10, -12);
    ctx.quadraticCurveTo(-10, -16, -7, -17);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, -10, -17, 10, 20, [c.armorHi, c.armor, c.armorLo]), 1.8);
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    gear(ctx, 0, 0, 6.5, 10, 0.2, c.trim, 1.1, 0.45);
    rivets(ctx, [-7, -13, 7, -13, -7, 8, 7, 8, 0, 16], 1.1);
    ctx.restore();
  },
};

// CORVIN ASHWELL — Channeler: long plum coat, brass coil staff with amber lantern core.
const CORVIN = {
  id: 'C', scale: 1.1, torsoScale: 1.05,
  col: { coat: '#5a2f5e', coatHi: '#7a4580', coatLo: '#3a1c3e', trim: '#d4b25a', scarf: '#e9dcc0', skin: '#d8a882', hair: '#ddd6cb', pants: '#2e2230', boot: '#3b2a26', energy: '#f0b25a', energy2: '#b48cf0' },
  drawBack(ctx, P, S, t) {
    const c = this.col;
    // scarf tail
    const n = S.neck;
    const sway = Math.sin(t * 2.6) * 2 - P.lean * 8;
    ctx.beginPath();
    ctx.moveTo(n[0] - 2, n[1] + 2);
    ctx.quadraticCurveTo(n[0] - 12, n[1] + 6 + sway * 0.5, n[0] - 18 + sway, n[1] + 16);
    ctx.lineTo(n[0] - 13 + sway, n[1] + 18);
    ctx.quadraticCurveTo(n[0] - 8, n[1] + 9, n[0] + 2, n[1] + 5);
    ctx.closePath();
    fillStroke(ctx, c.scarf, 1.2);
  },
  drawLegs(ctx, P, S) {
    const c = this.col;
    for (const [hj, kn, ft] of [[S.hjB, S.kneeB, S.footB], [S.hjF, S.kneeF, S.footF]]) {
      limb(ctx, hj, kn, 4.6, 3.8, c.pants);
      boot(ctx, kn, ft, c.boot, c.trim);
    }
  },
  drawTorso(ctx, P, S, t) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.hip[0], S.hip[1]);
    ctx.rotate(P.lean);
    // coat tails (swing with lean)
    const swing = -P.lean * 10 + Math.sin(t * 2) * 1;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(10, -4);
    ctx.lineTo(13 + swing * 0.3, 24);
    ctx.quadraticCurveTo(2, 27, -15 + swing, 25);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, 0, -4, 0, 26, [c.coat, c.coatLo]), 1.5);
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(1, -3);
    ctx.lineTo(1 + swing * 0.2, 25);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-10, -26);
    ctx.quadraticCurveTo(-8, -33, 0, -33);
    ctx.quadraticCurveTo(10, -33, 10, -26);
    ctx.lineTo(10, 0);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, -10, -30, 10, 0, [c.coatHi, c.coat, c.coatLo]), 1.6);
    // lapels & buttons
    poly(ctx, [0, -32, 7, -32, 3, -18]);
    fillStroke(ctx, c.coatLo, 1.1);
    rivets(ctx, [4, -16, 4, -10, 4, -4], 1.2, c.trim);
    // sash
    ctx.fillStyle = c.trim;
    ctx.fillRect(-10, -6, 20, 2.5);
    // high collar + scarf wrap
    ellipse(ctx, 1, -32, 8, 3.5);
    fillStroke(ctx, c.scarf, 1.2);
    ctx.restore();
  },
  drawHead(ctx, P, S, t) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.head[0], S.head[1]);
    ctx.rotate(P.lean + P.head);
    ellipse(ctx, 1.5, 1, 8.2, 10);
    fillStroke(ctx, c.skin, 1.5);
    // swept silver hair
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.quadraticCurveTo(-11, -9, -1, -11.5);
    ctx.quadraticCurveTo(9, -12, 10, -5);
    ctx.quadraticCurveTo(4, -8, 2, -5);
    ctx.quadraticCurveTo(-2, -2, -4, 6);
    ctx.closePath();
    fillStroke(ctx, c.hair, 1.4);
    // brass goggles on forehead
    ctx.fillStyle = c.trim;
    ctx.fillRect(-6, -7.5, 15, 2);
    circle(ctx, 6, -7, 3);
    fillStroke(ctx, '#6fa7a0', 1.1);
    // eye, nose, mouth
    ctx.fillStyle = INK;
    ctx.fillRect(5.5, -1, 2, 2.4);
    ctx.fillRect(4, -2.6, 4.5, 0.9);
    ctx.beginPath();
    ctx.moveTo(9.3, 0);
    ctx.lineTo(11, 3.5);
    ctx.lineTo(9, 4);
    ctx.stroke();
    ctx.fillRect(6, 6.5, 3, 0.8);
    ctx.restore();
  },
  drawArm(ctx, P, S, side) {
    const c = this.col;
    const A = side === 'F' ? S.armF : S.armB;
    const col = side === 'F' ? c.coat : c.coatLo;
    limb(ctx, A.s, A.el, 4.4, 3.8, col);
    limb(ctx, A.el, A.ha, 3.8, 4.6, col);
    // cuff
    circle(ctx, lerp(A.el[0], A.ha[0], 0.75), lerp(A.el[1], A.ha[1], 0.75), 4.4);
    fillStroke(ctx, c.trim, 1.1);
    hand(ctx, A.ha, c.skin);
    if (side === 'B' && P.glow > 0) {
      glow(ctx, A.ha[0], A.ha[1], 16, c.energy2, P.glow);
    }
  },
  drawWeapon(ctx, P, S, t) {
    const c = this.col;
    const h = S.armF.ha;
    ctx.save();
    ctx.translate(h[0], h[1]);
    ctx.rotate(-P.weapon);
    // staff: long shaft along +y with coil head at +y end, butt at -y
    roundRect(ctx, -1.5, -22, 3, 58, 1.4);
    fillStroke(ctx, '#4b3326', 1.2);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = c.trim;
      ctx.fillRect(-2.2, 24 + i * 2.6, 4.4, 1.4);
    }
    ctx.translate(0, 38);
    // brass cage
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    const pulse = 0.75 + Math.sin(t * 5) * 0.2 + P.glow * 0.6;
    glow(ctx, 0, 0, 14 + P.glow * 16, c.energy, 0.55 * pulse);
    circle(ctx, 0, 0, 3.4);
    ctx.fillStyle = '#fff2c6';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(0, -10);
    ctx.lineTo(5, -5);
    ctx.stroke();
    ctx.restore();
  },
  drawOffhand() {},
};

// PIN WEXLEY — Striker: leather jacket, long cream scarf, cap & goggles, brass repeater crossbow.
const PIN = {
  id: 'S', scale: 0.9, torsoScale: 0.95,
  col: { jacket: '#7a5236', jacketHi: '#946847', jacketLo: '#4f3322', scarf: '#ecdfc4', skin: '#f0c39a', hair: '#c8582e', pants: '#3f3a48', boot: '#4a3020', trim: '#d9a845', cap: '#8a3a28', wood: '#6a4228' },
  drawBack(ctx, P, S, t) {
    const c = this.col;
    const n = S.neck;
    const w = Math.sin(t * 4) * 3 - P.lean * 10;
    ctx.beginPath();
    ctx.moveTo(n[0] - 1, n[1] + 1);
    ctx.bezierCurveTo(n[0] - 12, n[1] + 1 + w * 0.3, n[0] - 20, n[1] - 4 + w, n[0] - 30, n[1] + 2 + w * 1.2);
    ctx.lineTo(n[0] - 28, n[1] + 7 + w * 1.2);
    ctx.bezierCurveTo(n[0] - 18, n[1] + 3 + w, n[0] - 10, n[1] + 6, n[0] + 1, n[1] + 5);
    ctx.closePath();
    fillStroke(ctx, c.scarf, 1.2);
  },
  drawLegs(ctx, P, S) {
    const c = this.col;
    for (const [hj, kn, ft] of [[S.hjB, S.kneeB, S.footB], [S.hjF, S.kneeF, S.footF]]) {
      limb(ctx, hj, kn, 4.4, 3.6, c.pants);
      boot(ctx, kn, ft, c.boot, c.trim);
    }
  },
  drawTorso(ctx, P, S) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.hip[0], S.hip[1]);
    ctx.rotate(P.lean);
    ctx.beginPath();
    ctx.moveTo(-9, 3);
    ctx.lineTo(-10, -24);
    ctx.quadraticCurveTo(-7, -31, 0, -31);
    ctx.quadraticCurveTo(9, -31, 9, -24);
    ctx.lineTo(10, 3);
    ctx.closePath();
    fillStroke(ctx, lin(ctx, -10, -30, 10, 3, [c.jacketHi, c.jacket, c.jacketLo]), 1.6);
    // bandolier
    ctx.strokeStyle = c.jacketLo;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -28);
    ctx.lineTo(8, -2);
    ctx.stroke();
    rivets(ctx, [-4, -21, -1, -16, 2, -11, 5, -6], 1.4, c.trim);
    // belt & pouch
    ctx.fillStyle = '#3a281c';
    ctx.fillRect(-10, -2, 20, 3.5);
    roundRect(ctx, 5, -1, 6, 6, 1.5);
    fillStroke(ctx, c.jacketLo, 1);
    ctx.restore();
  },
  drawHead(ctx, P, S) {
    const c = this.col;
    ctx.save();
    ctx.translate(S.head[0], S.head[1]);
    ctx.rotate(P.lean + P.head);
    ellipse(ctx, 1.5, 1.5, 8.6, 9.6);
    fillStroke(ctx, c.skin, 1.5);
    // messy hair under cap
    ctx.beginPath();
    ctx.moveTo(-9, 5);
    ctx.lineTo(-11, -2);
    ctx.lineTo(-7, -4);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-3, -7);
    ctx.lineTo(-2, 2);
    ctx.closePath();
    fillStroke(ctx, c.hair, 1.2);
    // cap with brim
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.quadraticCurveTo(-8, -13, 2, -12);
    ctx.quadraticCurveTo(10, -11, 10, -5);
    ctx.lineTo(15, -4);
    ctx.lineTo(14, -2.5);
    ctx.lineTo(-9, -3);
    ctx.closePath();
    fillStroke(ctx, c.cap, 1.4);
    // goggles on cap
    ctx.fillStyle = c.trim;
    circle(ctx, 3, -8, 2.8);
    fillStroke(ctx, '#8ec2c8', 1);
    circle(ctx, -2.5, -8, 2.8);
    fillStroke(ctx, '#8ec2c8', 1);
    // face
    ctx.fillStyle = INK;
    ctx.fillRect(5.5, 0, 2.2, 2.6);
    ctx.fillStyle = '#e48a6a';
    ctx.fillRect(3.5, 4, 3, 1.4);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(7, 6, 2, 0.2, Math.PI - 0.6);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  },
  drawArm(ctx, P, S, side) {
    const c = this.col;
    const A = side === 'F' ? S.armF : S.armB;
    const col = side === 'F' ? c.jacket : c.jacketLo;
    limb(ctx, A.s, A.el, 4, 3.4, col);
    limb(ctx, A.el, A.ha, 3.4, 3.2, col);
    hand(ctx, A.ha, '#4a3020');
  },
  drawWeapon(ctx, P, S, t) {
    const c = this.col;
    const h = S.armF.ha;
    ctx.save();
    ctx.translate(h[0], h[1]);
    ctx.rotate(-P.weapon);
    // stock behind the grip, body forward along +y
    roundRect(ctx, -3, -10, 6, 12, 2);
    fillStroke(ctx, c.wood, 1.2);
    roundRect(ctx, -2.6, 0, 5.2, 26, 1.5);
    fillStroke(ctx, '#6c6872', 1.3);
    // drum magazine
    circle(ctx, -5, 10, 5);
    fillStroke(ctx, c.trim, 1.3);
    circle(ctx, -5, 10, 1.6);
    ctx.fillStyle = INK;
    ctx.fill();
    // bow limbs at the front
    ctx.strokeStyle = '#3a2a24';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-12, 20);
    ctx.quadraticCurveTo(0, 28, 12, 20);
    ctx.stroke();
    ctx.strokeStyle = c.scarf;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-12, 20);
    ctx.lineTo(0, 13 - (P.glow > 0 ? 0 : 0));
    ctx.lineTo(12, 20);
    ctx.stroke();
    // bolt
    if (P.glow <= 0.01) {
      ctx.fillStyle = c.trim;
      ctx.fillRect(-0.8, 12, 1.6, 15);
    }
    ctx.restore();
  },
  drawOffhand() {},
};

export const LOOKS = { V: HESSA, C: CORVIN, S: PIN };

// ───────────────────────── poses ─────────────────────────
const P = (o) => mergePose(BASE_POSE, o);
export const POSES = {
  V: {
    idle: P({ lean: 0.06, head: -0.04, armF: [0.45, 0.35], weapon: 0.62, armB: [0.9, 0.55], shield: 1.6, legF: [0.34, 0.2], legB: [-0.3, 0.14] }),
    windup: P({ lean: -0.2, head: 0.08, armF: [2.85, 0.25], weapon: -2.85, armB: [0.45, 0.9], legF: [0.5, 0.65], legB: [-0.45, 0.35], glow: 0.4 }),
    dash: P({ lean: 0.38, head: 0.1, armF: [2.55, 0.2], weapon: -2.7, armB: [0.6, 0.6], legF: [0.95, 1.0], legB: [-0.75, 0.25], glow: 0.6 }),
    strike: P({ lean: 0.5, head: 0.18, armF: [1.55, 0.15], weapon: 2.05, armB: [0.25, 0.85], legF: [0.78, 0.7], legB: [-0.6, 0.12], glow: 1 }),
    follow: P({ lean: 0.55, head: 0.2, armF: [1.05, 0.2], weapon: 1.25, armB: [0.2, 0.8], legF: [0.8, 0.75], legB: [-0.62, 0.15] }),
    guard: P({ lean: 0.14, head: 0.12, armF: [0.35, 1.2], weapon: -1.9, armB: [1.5, 0.25], shield: 1.6, legF: [0.48, 0.55], legB: [-0.42, 0.38], shieldFront: 1 }),
    flourish: P({ lean: -0.06, head: -0.12, armF: [3.0, 0.1], weapon: 3.1, armB: [0.7, 0.8], legF: [0.3, 0.15], legB: [-0.3, 0.12], glow: 0.7 }),
    hurt: P({ lean: -0.32, head: -0.32, armF: [0.25, 0.5], weapon: -1.7, armB: [0.35, 0.7], legF: [0.15, 0.4], legB: [-0.38, 0.3], x: -5 }),
    stagger: P({ lean: -0.5, head: -0.45, armF: [-0.3, 0.4], weapon: -1.1, armB: [-0.2, 0.5], legF: [0.05, 0.6], legB: [-0.5, 0.5], x: -9 }),
    ko: P({ lean: 1.0, head: 0.65, armF: [0.15, 0.2], weapon: 0.6, armB: [0.05, 0.2], legF: [1.1, 2.3], legB: [-0.1, 2.1], x: 2 }),
    victory: P({ lean: -0.12, head: -0.18, armF: [3.0, 0.15], weapon: 3.05, armB: [0.9, 0.6], legF: [0.32, 0.15], legB: [-0.32, 0.12], glow: 0.5 }),
    castWind: null, castRelease: null, castHold: null, aim: null, fire: null,
  },
  C: {
    idle: P({ lean: 0.02, head: -0.05, armF: [0.25, 0.45], weapon: 3.0, armB: [0.12, 0.35], legF: [0.2, 0.08], legB: [-0.18, 0.08] }),
    castWind: P({ lean: -0.14, head: -0.12, armF: [2.3, 0.25], weapon: 2.9, armB: [-0.7, 1.7], legF: [0.32, 0.25], legB: [-0.32, 0.18], glow: 0.7 }),
    castRelease: P({ lean: 0.26, head: 0.1, armF: [1.45, 0.1], weapon: 1.6, armB: [1.75, 0.08], legF: [0.52, 0.45], legB: [-0.38, 0.1], glow: 1 }),
    castHold: P({ lean: 0.18, head: 0.05, armF: [1.35, 0.2], weapon: 1.7, armB: [1.45, 0.3], legF: [0.45, 0.35], legB: [-0.35, 0.1], glow: 0.4 }),
    guard: P({ lean: -0.04, head: 0.05, armF: [1.15, 0.8], weapon: 2.3, armB: [1.7, 0.5], legF: [0.4, 0.45], legB: [-0.38, 0.3], glow: 0.6 }),
    flourish: P({ lean: -0.08, head: -0.15, armF: [2.8, 0.1], weapon: 3.1, armB: [2.3, 0.4], legF: [0.22, 0.1], legB: [-0.22, 0.1], glow: 0.8 }),
    hurt: P({ lean: -0.3, head: -0.3, armF: [0.2, 0.5], weapon: 2.6, armB: [0.5, 0.9], legF: [0.12, 0.35], legB: [-0.35, 0.3], x: -5 }),
    stagger: P({ lean: -0.48, head: -0.42, armF: [-0.25, 0.6], weapon: 2.2, armB: [-0.3, 0.6], legF: [0.0, 0.55], legB: [-0.5, 0.45], x: -9 }),
    ko: P({ lean: 1.0, head: 0.7, armF: [0.1, 0.3], weapon: 0.5, armB: [0.05, 0.2], legF: [1.1, 2.3], legB: [-0.1, 2.1], x: 2 }),
    victory: P({ lean: -0.1, head: -0.2, armF: [2.5, 0.2], weapon: 3.0, armB: [1.2, 1.2], legF: [0.22, 0.1], legB: [-0.22, 0.1], glow: 0.6 }),
    windup: null, dash: null, strike: null, follow: null, aim: null, fire: null,
  },
  S: {
    idle: P({ lean: 0.06, head: -0.02, armF: [0.55, 0.95], weapon: 1.9, armB: [0.45, 1.25], legF: [0.32, 0.25], legB: [-0.28, 0.2] }),
    aim: P({ lean: 0.12, head: 0.06, armF: [1.42, 0.12], weapon: 1.57, armB: [1.15, 0.55], legF: [0.45, 0.45], legB: [-0.4, 0.25] }),
    fire: P({ lean: -0.06, head: -0.04, armF: [1.62, 0.04], weapon: 1.78, armB: [1.05, 0.6], legF: [0.4, 0.4], legB: [-0.42, 0.25], x: -3, glow: 1 }),
    guard: P({ lean: 0.08, head: 0.18, armF: [1.9, 0.9], weapon: 2.6, armB: [1.9, 1.1], legF: [0.6, 0.9], legB: [-0.5, 0.7] }),
    flourish: P({ lean: -0.1, head: -0.15, armF: [2.9, 0.1], weapon: 3.0, armB: [0.6, 1.3], legF: [0.3, 0.2], legB: [-0.3, 0.2] }),
    hurt: P({ lean: -0.32, head: -0.3, armF: [0.3, 0.7], weapon: 2.3, armB: [0.4, 1.0], legF: [0.15, 0.45], legB: [-0.38, 0.35], x: -5 }),
    stagger: P({ lean: -0.5, head: -0.45, armF: [-0.2, 0.6], weapon: 2.5, armB: [-0.3, 0.7], legF: [0.0, 0.6], legB: [-0.5, 0.5], x: -9 }),
    ko: P({ lean: 1.0, head: 0.7, armF: [0.1, 0.3], weapon: 0.9, armB: [0.05, 0.3], legF: [1.1, 2.3], legB: [-0.1, 2.1], x: 2 }),
    victory: P({ lean: -0.12, head: -0.2, armF: [2.9, 0.1], weapon: 3.1, armB: [2.6, 0.3], legF: [0.3, 0.2], legB: [-0.3, 0.2], lift: 2 }),
    windup: null, dash: null, strike: null, follow: null, castWind: null, castRelease: null, castHold: null,
  },
};
// Fill missing per-character poses with sensible stand-ins so every clip works for every actor.
(function fillPoses() {
  const sub = {
    V: { castWind: 'flourish', castRelease: 'strike', castHold: 'follow', aim: 'guard', fire: 'strike' },
    C: { windup: 'castWind', dash: 'castRelease', strike: 'castRelease', follow: 'castHold', aim: 'castHold', fire: 'castRelease' },
    S: { windup: 'aim', dash: 'aim', strike: 'fire', follow: 'aim', castWind: 'aim', castRelease: 'fire', castHold: 'aim' },
  };
  for (const id of Object.keys(POSES)) for (const [k, v] of Object.entries(sub[id])) if (!POSES[id][k]) POSES[id][k] = POSES[id][v];
})();

// Clips: keys are [time, poseName]; root is [time, fraction of the way to the target] for dashes.
export const CLIPS = {
  idle: { loop: true, dur: 1, keys: [[0, 'idle']] },
  melee: { dur: 0.66, keys: [[0, 'idle'], [0.09, 'windup'], [0.2, 'dash'], [0.28, 'strike'], [0.4, 'follow'], [0.66, 'idle']], root: [[0, 0], [0.1, 0], [0.25, 1], [0.42, 1], [0.64, 0]], impact: 0.27 },
  cast: { dur: 0.62, keys: [[0, 'idle'], [0.12, 'castWind'], [0.22, 'castRelease'], [0.42, 'castHold'], [0.62, 'idle']], impact: 0.22 },
  shoot: { dur: 0.48, keys: [[0, 'idle'], [0.07, 'aim'], [0.14, 'fire'], [0.27, 'aim'], [0.48, 'idle']], impact: 0.14 },
  guard: { dur: 0.72, keys: [[0, 'idle'], [0.08, 'guard'], [0.56, 'guard'], [0.72, 'idle']], impact: 0.08 },
  buff: { dur: 0.6, keys: [[0, 'idle'], [0.12, 'flourish'], [0.38, 'flourish'], [0.6, 'idle']], impact: 0.14 },
  counter: { dur: 0.46, keys: [[0, 'guard'], [0.1, 'strike'], [0.2, 'follow'], [0.46, 'idle']], root: [[0, 0], [0.08, 0.3], [0.26, 0.3], [0.46, 0]], impact: 0.11 },
  hurt: { dur: 0.34, keys: [[0, 'hurt'], [0.34, 'idle']] },
  block: { dur: 0.32, keys: [[0, 'guard'], [0.32, 'idle']] },
  stagger: { dur: 0.75, keys: [[0, 'stagger'], [0.45, 'stagger'], [0.75, 'idle']] },
  ko: { dur: 0.55, hold: true, keys: [[0, 'stagger'], [0.25, 'ko'], [0.55, 'ko']] },
  victory: { dur: 0.5, hold: true, keys: [[0, 'idle'], [0.3, 'victory'], [0.5, 'victory']] },
  revive: { dur: 0.5, keys: [[0, 'ko'], [0.5, 'idle']] },
};

export function drawCharacter(ctx, look, pose, t) {
  const S = skeleton(pose, look.torsoScale || 1);
  look.drawBack(ctx, pose, S, t);
  if (!pose.shieldFront) {
    look.drawArm(ctx, pose, S, 'B');
    look.drawOffhand(ctx, pose, S, t);
  }
  look.drawLegs(ctx, pose, S, t);
  look.drawTorso(ctx, pose, S, t);
  look.drawHead(ctx, pose, S, t);
  if (pose.shieldFront) {
    look.drawArm(ctx, pose, S, 'B');
    look.drawOffhand(ctx, pose, S, t);
  }
  look.drawWeapon(ctx, pose, S, t);
  look.drawArm(ctx, pose, S, 'F');
  return S;
}

// Muzzle / staff tip position in character space (for projectiles).
export function weaponTip(look, pose) {
  const S = skeleton(pose, look.torsoScale || 1);
  const h = S.armF.ha;
  const len = look.id === 'C' ? 38 : look.id === 'S' ? 26 : 36;
  const d = dir(pose.weapon);
  return [h[0] + d[0] * len, h[1] + d[1] * len];
}

// Runtime actor: plays clips, blends poses, smooths dash root motion.
export class Actor {
  constructor(id) {
    this.id = id;
    this.look = LOOKS[id];
    this.poses = POSES[id];
    this.clip = 'idle';
    this.ct = 0;
    this.from = null;
    this.blendT = 0;
    this.rootFrac = 0;
    this.targetDx = 0;
    this.flash = 0;
    this.down = false;
    this.ghost = 0;
    this.lastPose = this.poses.idle;
  }
  play(name, opts = {}) {
    if (this.down && name !== 'revive' && name !== 'ko') return 0;
    this.from = this.lastPose;
    this.blendT = 0.07;
    this.clip = name;
    this.ct = 0;
    if (opts.targetDx !== undefined) this.targetDx = opts.targetDx;
    if (name === 'ko') this.down = true;
    if (name === 'revive') this.down = false;
    const c = CLIPS[name];
    return c.impact || 0;
  }
  busy() {
    const c = CLIPS[this.clip];
    return !c.loop && !c.hold && this.ct < c.dur;
  }
  update(dt) {
    this.ct += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    const c = CLIPS[this.clip];
    if (!c.loop && !c.hold && this.ct >= c.dur) {
      this.clip = 'idle';
      this.ct = 0;
    }
    let want = 0;
    if (c.root) want = sampleRoot(c.root, Math.min(this.ct, c.dur));
    this.rootFrac += (want - this.rootFrac) * Math.min(1, dt * 22);
    if (this.blendT > 0) this.blendT = Math.max(0, this.blendT - dt);
  }
  pose(time) {
    const c = CLIPS[this.clip];
    const t = c.loop ? 0 : Math.min(this.ct, c.dur);
    let p = samplePose(this.poses, c.keys, t);
    if (this.clip === 'idle' || (c.hold && this.clip === 'victory')) {
      const b = Math.sin(time * 2.3 + this.id.charCodeAt(0));
      p = { ...p, lean: p.lean + b * 0.018, head: p.head + b * 0.025, armF: [p.armF[0] + b * 0.035, p.armF[1]], armB: [p.armB[0] - b * 0.03, p.armB[1]], y: p.y - (b + 1) * 0.4 };
    }
    if (this.from && this.blendT > 0) p = lerpPose(p, this.from, this.blendT / 0.07);
    this.lastPose = p;
    return p;
  }
}

function samplePose(poses, keys, t) {
  if (keys.length === 1 || t <= keys[0][0]) return poses[keys[0][1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, n0] = keys[i], [t1, n1] = keys[i + 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      return lerpPose(poses[n0], poses[n1], easeInOut(u));
    }
  }
  return poses[keys[keys.length - 1][1]];
}

function sampleRoot(root, t) {
  for (let i = 0; i < root.length - 1; i++) {
    const [t0, v0] = root[i], [t1, v1] = root[i + 1];
    if (t <= t1) return lerp(v0, v1, easeInOut((t - t0) / Math.max(1e-6, t1 - t0)));
  }
  return root[root.length - 1][1];
}

// Portrait bust (dialogue boxes and finisher cut-ins).
export function drawPortrait(ctx, id, w, h, t = 0, mood = 'idle') {
  ctx.save();
  if (LOOKS[id]) {
    const look = LOOKS[id];
    const pose = mood === 'victory' ? POSES[id].victory : mood === 'hurt' ? POSES[id].hurt : POSES[id].idle;
    const s = (h / 60) * (id === 'S' ? 1.15 : 1);
    ctx.translate(w * 0.42, h * 1.62);
    ctx.scale(s, s);
    drawCharacter(ctx, look, { ...pose, x: 0 }, t);
  } else if (id === 'gran') drawGranraku(ctx, w, h, t);
  else if (id === 'dev') drawOzmund(ctx, w, h, t);
  else drawSystem(ctx, w, h, t);
  ctx.restore();
}

function drawGranraku(ctx, w, h, t) {
  const s = h / 60;
  ctx.translate(w * 0.5, h * 0.62);
  ctx.scale(s, s);
  // hoodie shoulders
  ctx.beginPath();
  ctx.moveTo(-26, 40);
  ctx.quadraticCurveTo(-24, 14, 0, 12);
  ctx.quadraticCurveTo(24, 14, 26, 40);
  ctx.closePath();
  fillStroke(ctx, '#3d3a46', 1.6);
  // hood back
  ellipse(ctx, 0, -2, 17, 19);
  fillStroke(ctx, '#4a4656', 1.6);
  // face
  ellipse(ctx, 1, 0, 11, 13);
  fillStroke(ctx, '#e3b48e', 1.5);
  // hair fringe
  ctx.beginPath();
  ctx.moveTo(-11, -4);
  ctx.quadraticCurveTo(-8, -15, 3, -14);
  ctx.quadraticCurveTo(12, -13, 12, -3);
  ctx.lineTo(7, -7);
  ctx.lineTo(3, -4);
  ctx.lineTo(-2, -8);
  ctx.lineTo(-6, -3);
  ctx.closePath();
  fillStroke(ctx, '#22191d', 1.2);
  // headphones
  ctx.strokeStyle = '#2a2830';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -2, 15, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  roundRect(ctx, -17, -6, 6, 11, 2);
  fillStroke(ctx, '#c9a24a', 1.2);
  roundRect(ctx, 11, -6, 6, 11, 2);
  fillStroke(ctx, '#c9a24a', 1.2);
  // tired eyes
  ctx.fillStyle = INK;
  const blink = Math.sin(t * 0.9) > 0.97 ? 0.3 : 1;
  ctx.fillRect(-5, -1, 3.5, 2 * blink);
  ctx.fillRect(4, -1, 3.5, 2 * blink);
  ctx.fillStyle = 'rgba(80,40,60,0.35)';
  ctx.fillRect(-5.5, 1.5, 4.5, 1.2);
  ctx.fillRect(3.5, 1.5, 4.5, 1.2);
  ctx.fillStyle = INK;
  ctx.fillRect(-1, 7, 5, 1);
  // drawstrings
  ctx.strokeStyle = '#d9c7a0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4, 16);
  ctx.lineTo(-5, 28);
  ctx.moveTo(4, 16);
  ctx.lineTo(5, 28);
  ctx.stroke();
}

function drawOzmund(ctx, w, h, t) {
  const s = h / 60;
  ctx.translate(w * 0.5, h * 0.62);
  ctx.scale(s, s);
  // turtleneck shoulders
  ctx.beginPath();
  ctx.moveTo(-25, 40);
  ctx.quadraticCurveTo(-22, 15, 0, 13);
  ctx.quadraticCurveTo(22, 15, 25, 40);
  ctx.closePath();
  fillStroke(ctx, '#1f1a24', 1.6);
  roundRect(ctx, -7, 8, 14, 9, 3);
  fillStroke(ctx, '#1f1a24', 1.4);
  // face
  ellipse(ctx, 0, -1, 11, 13.5);
  fillStroke(ctx, '#d9a27c', 1.5);
  // wild grey hair
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const r = 15 + (i % 2 ? 4 : 0) + Math.sin(t * 2 + i) * 0.6;
    const x = Math.cos(a) * r, y = -4 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(10, -6);
  ctx.quadraticCurveTo(0, -10, -10, -6);
  ctx.closePath();
  fillStroke(ctx, '#b9b2aa', 1.3);
  // big round glasses
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 1.8;
  circle(ctx, -4.5, -1, 4.6);
  ctx.stroke();
  circle(ctx, 5.5, -1, 4.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.1, -1);
  ctx.lineTo(0.9, -1);
  ctx.stroke();
  ctx.fillStyle = INK;
  circle(ctx, -4, -1, 1.3);
  ctx.fill();
  circle(ctx, 6, -1, 1.3);
  ctx.fill();
  // nervous smile
  ctx.beginPath();
  ctx.moveTo(-3, 8);
  ctx.quadraticCurveTo(1, 10, 5, 7.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // mug
  roundRect(ctx, 14, 18, 9, 12, 2);
  fillStroke(ctx, '#e9dcc0', 1.2);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(23, 24, 3, -1.2, 1.2);
  ctx.stroke();
  const steam = Math.sin(t * 3) * 1.5;
  ctx.strokeStyle = 'rgba(240,230,210,0.5)';
  ctx.beginPath();
  ctx.moveTo(18, 16);
  ctx.quadraticCurveTo(16 + steam, 12, 19, 8);
  ctx.stroke();
}

function drawSystem(ctx, w, h, t) {
  const s = h / 60;
  ctx.translate(w * 0.5, h * 0.55);
  ctx.scale(s, s);
  roundRect(ctx, -20, -18, 40, 30, 4);
  fillStroke(ctx, '#2a2f3a', 1.6);
  ctx.fillStyle = '#8fb7d9';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(Math.sin(t * 4) > 0 ? '>_' : '> ', 0, 2);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(-6, 12, 12, 6);
  ctx.fillRect(-12, 18, 24, 3);
}
