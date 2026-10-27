// Procedural enemy art. Every function draws facing LEFT with origin at the feet center.
// a = { t, wind (0..1 telegraph), atk (0..1 attack), hurt (0..1), phase }
import { capsule, fillStroke, circle, ellipse, poly, rivets, lin, rad, glow, gear, eye, roundRect, INK } from './draw.js';
import { t as tr } from '../i18n/index.js';

const RUST = '#9a3f2a', RUST2 = '#6a2a1c', RUSTHI = '#c0603f';
const BRASS = '#c9a24a', BRASS2 = '#8f6d2a', BRASSHI = '#e6c779';
const IRON = '#6c6872', IRON2 = '#47434d', IRONHI = '#94909a';
const PLUM = '#4a2840', PLUM2 = '#2e1828';
const RED_EYE = '#ff6a3a', AMBER = '#f0b25a', VIOLET = '#b48cf0', TEAL = '#7fd6c2';

const s = Math.sin;
const pulse = (a, f = 4) => 0.5 + 0.5 * s(a.t * f);

function legSeg(ctx, x1, y1, x2, y2, r, col) {
  capsule(ctx, x1, y1, x2, y2, r, r * 0.85);
  fillStroke(ctx, col, 1.3);
}

function smoke(ctx, x, y, t, n = 3, scale = 1) {
  for (let i = 0; i < n; i++) {
    const p = (t * 0.6 + i / n) % 1;
    ctx.globalAlpha = 0.35 * (1 - p);
    circle(ctx, x + s(t + i) * 3 * scale + p * 6 * scale, y - p * 22 * scale, (3 + p * 7) * scale);
    ctx.fillStyle = '#8a7f80';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function spark(ctx, x, y, t, color = AMBER, r = 6) {
  const k = pulse({ t }, 18);
  glow(ctx, x, y, r * (1.5 + k), color, 0.7);
  ctx.strokeStyle = '#fff6d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = t * 9 + i * 1.7;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * r * (0.6 + k * 0.6), y + Math.sin(ang) * r * (0.6 + k * 0.6));
  }
  ctx.stroke();
}

function teeth(ctx, x1, x2, y, h, n, dirUp) {
  ctx.beginPath();
  const w = (x2 - x1) / n;
  for (let i = 0; i < n; i++) {
    ctx.moveTo(x1 + i * w, y);
    ctx.lineTo(x1 + i * w + w / 2, y + (dirUp ? -h : h));
    ctx.lineTo(x1 + (i + 1) * w, y);
  }
  fillStroke(ctx, '#e8dcc0', 1);
}

// ───────────────────────── ACT I ─────────────────────────
function hound(ctx, a, opt = {}) {
  const body = opt.body || RUST, body2 = opt.body2 || RUST2, eyeC = opt.eye || RED_EYE;
  const trot = s(a.t * (opt.fast ? 12 : 9));
  const crouch = a.wind * 6;
  const bob = trot * 1.2 - crouch;
  // legs (back pair darker)
  const legs = [[14, -2, body2, 1], [-12, -2, body2, -1], [10, 0, body, -1], [-16, 0, body, 1]];
  for (const [x, z, col, ph] of legs) {
    const sw = trot * ph * 0.35 + (a.atk > 0 ? (x < 0 ? -0.7 : 0.6) * a.atk : 0);
    const hx = x, hy = -22 + bob * 0.5 + z;
    const kx = hx + Math.sin(sw) * 11, ky = hy + Math.cos(sw) * 11;
    legSeg(ctx, hx, hy, kx, ky, 3.4, col);
    legSeg(ctx, kx, ky, kx + Math.sin(sw - 0.6) * 11, -1, 3, col);
  }
  // tail exhaust
  ctx.save();
  ctx.translate(22, -30 + bob);
  ctx.rotate(-0.6 + s(a.t * 6) * 0.15);
  roundRect(ctx, -2, -12, 5, 13, 2);
  fillStroke(ctx, IRON, 1.2);
  ctx.restore();
  smoke(ctx, 25, -44 + bob, a.t, 2, 0.6);
  // body barrel
  ellipse(ctx, 2, -30 + bob, 22, 11);
  fillStroke(ctx, lin(ctx, 0, -41, 0, -19, [opt.hi || RUSTHI, body, body2]), 1.6);
  for (let i = -2; i <= 2; i++) {
    ctx.strokeStyle = body2;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(i * 7 + 2, -40 + bob);
    ctx.lineTo(i * 7 + 2, -20 + bob);
    ctx.stroke();
  }
  rivets(ctx, [-14, -34 + bob, -6, -38 + bob, 6, -38 + bob, 14, -34 + bob], 1.2);
  if (opt.dish) {
    ctx.save();
    ctx.translate(6, -42 + bob);
    ctx.rotate(-0.4 + s(a.t * 2) * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, -6, 8, 4, 0, Math.PI, 0);
    fillStroke(ctx, BRASS, 1.2);
    ctx.fillStyle = IRON2;
    ctx.fillRect(-1, -6, 2, 6);
    glow(ctx, 0, -9, 8, TEAL, pulse(a, 6) * 0.8);
    ctx.restore();
  }
  // head + jaw
  const hx = -22, hy = -36 + bob + crouch * 0.5;
  const jaw = 0.15 + a.atk * 0.9 + a.wind * 0.3;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.save();
  ctx.rotate(-jaw * 0.5);
  poly(ctx, [4, 2, -16, 3, -17, 8, 2, 9]);
  fillStroke(ctx, body2, 1.4);
  teeth(ctx, -15, 0, 3, 3, 5, false);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(8, -8);
  ctx.lineTo(-6, -10);
  ctx.lineTo(-18, -4);
  ctx.lineTo(-18, 2);
  ctx.lineTo(6, 3);
  ctx.closePath();
  fillStroke(ctx, lin(ctx, 0, -10, 0, 3, [opt.hi || RUSTHI, body]), 1.5);
  teeth(ctx, -17, 0, 2, 3, 6, true);
  poly(ctx, [2, -9, 6, -16, 8, -8]);
  fillStroke(ctx, body2, 1.2);
  eye(ctx, -7, -4, 2.2, eyeC, a.t);
  ctx.restore();
}

function jammer(ctx, a) {
  const bob = s(a.t * 2) * 2;
  const y0 = -48 + bob;
  // wire tripod
  ctx.strokeStyle = '#3a3036';
  ctx.lineWidth = 2.2;
  for (const x of [-14, 0, 14]) {
    ctx.beginPath();
    ctx.moveTo(x * 0.5, y0 + 14);
    ctx.bezierCurveTo(x, y0 + 26, x * 1.6, -14, x * 1.4, 0);
    ctx.stroke();
  }
  // coil
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(0, y0 + 18 + i * 3, 7, 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // radio box
  roundRect(ctx, -20, y0 - 16, 40, 30, 4);
  fillStroke(ctx, lin(ctx, 0, y0 - 16, 0, y0 + 14, ['#7a6658', '#5a4a40', '#3e322c']), 1.7);
  roundRect(ctx, -16, y0 - 12, 20, 22, 2);
  fillStroke(ctx, '#2a2226', 1.2);
  ctx.strokeStyle = '#5a4c48';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-15, y0 - 9 + i * 3.4);
    ctx.lineTo(3, y0 - 9 + i * 3.4);
    ctx.stroke();
  }
  // dials
  circle(ctx, 11, y0 - 5, 4.2);
  fillStroke(ctx, BRASS, 1.2);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(11, y0 - 5);
  const ang = a.t * 3 + a.wind * 5;
  ctx.lineTo(11 + Math.cos(ang) * 3.5, y0 - 5 + Math.sin(ang) * 3.5);
  ctx.stroke();
  circle(ctx, 11, y0 + 6, 3);
  fillStroke(ctx, RUST, 1.1);
  eye(ctx, -6, y0 - 1, 2.6, RED_EYE, a.t);
  // antennae
  for (const [x, ph] of [[-12, 0], [12, 1.4]]) {
    const sw = s(a.t * 3 + ph) * 0.25 + a.atk * 0.4;
    const tx = x + Math.sin(sw - 0.2 * Math.sign(x)) * 22, ty = y0 - 16 - Math.cos(sw) * 22;
    ctx.strokeStyle = IRONHI;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y0 - 16);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    circle(ctx, tx, ty, 2.2);
    fillStroke(ctx, BRASS, 1);
    if (a.wind > 0.2 || a.atk > 0 || s(a.t * 5 + ph) > 0.7) spark(ctx, tx, ty, a.t + ph, AMBER, 5 + a.wind * 5);
  }
}

function mite(ctx, a) {
  const j = (s(a.t * 37) + s(a.t * 23)) * 0.6;
  const y0 = -16 + Math.abs(s(a.t * 8)) * 2;
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const lx = -6 + i * 6, sw = s(a.t * 16 + i * 2 + side) * 0.4;
      ctx.strokeStyle = '#2e262c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(lx, y0 + 3);
      ctx.lineTo(lx + side * 4 + sw * 4, y0 + 9);
      ctx.lineTo(lx + side * 6 + sw * 6, 0);
      ctx.stroke();
    }
  }
  ellipse(ctx, j, y0, 12, 9);
  fillStroke(ctx, lin(ctx, 0, y0 - 9, 0, y0 + 9, ['#8b7aa0', '#5a4a6a', '#2e2438']), 1.5);
  // static fuzz
  ctx.save();
  ellipse(ctx, j, y0, 12, 9);
  ctx.clip();
  for (let i = 0; i < 14; i++) {
    const x = ((i * 37 + Math.floor(a.t * 30) * 13) % 24) - 12, y = ((i * 53 + Math.floor(a.t * 30) * 7) % 18) - 9;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(20,10,20,0.35)';
    ctx.fillRect(j + x, y0 + y, 3, 1.2);
  }
  ctx.restore();
  eye(ctx, j - 6, y0 - 2, 2.6, a.wind > 0.3 ? '#ffd36a' : TEAL, a.t);
  ctx.strokeStyle = IRONHI;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(j - 3, y0 - 8);
  ctx.quadraticCurveTo(j - 8, y0 - 16, j - 12 + s(a.t * 9) * 2, y0 - 15);
  ctx.stroke();
}

function maw(ctx, a) {
  const open = 0.15 + a.wind * 0.45 + a.atk * 0.9 - (a.atk > 0.6 ? (a.atk - 0.6) * 2.5 : 0);
  // treads
  roundRect(ctx, -34, -14, 68, 14, 7);
  fillStroke(ctx, '#2e2a30', 1.6);
  for (let i = 0; i < 6; i++) {
    circle(ctx, -27 + i * 11, -7, 4.2);
    fillStroke(ctx, IRON, 1.1);
    gear(ctx, -27 + i * 11, -7, 3.6, 6, a.t * 3, IRON2, 0.8, 0.3);
  }
  // body
  roundRect(ctx, -30, -56, 60, 44, 6);
  fillStroke(ctx, lin(ctx, 0, -56, 0, -12, [IRONHI, IRON, IRON2]), 1.8);
  rivets(ctx, [-25, -50, 25, -50, -25, -18, 25, -18, 0, -52], 1.4);
  // furnace glow inside mouth
  const mx = -30, my = -36;
  glow(ctx, mx + 10, my, 24, AMBER, 0.4 + open * 0.6);
  // lower jaw
  ctx.save();
  ctx.translate(mx + 24, my + 4);
  ctx.rotate(open * 0.35);
  poly(ctx, [-30, -2, 6, -2, 6, 12, -26, 14]);
  fillStroke(ctx, lin(ctx, 0, -2, 0, 14, [RUSTHI, RUST, RUST2]), 1.6);
  teeth(ctx, -28, 2, -2, 6, 6, true);
  ctx.restore();
  // upper jaw
  ctx.save();
  ctx.translate(mx + 24, my - 4);
  ctx.rotate(-open * 0.45);
  poly(ctx, [-32, 2, 6, 2, 6, -20, -24, -18]);
  fillStroke(ctx, lin(ctx, 0, -20, 0, 2, [RUSTHI, RUST, RUST2]), 1.6);
  teeth(ctx, -30, 2, 2, 6, 7, false);
  eye(ctx, -16, -10, 2.8, RED_EYE, a.t);
  ctx.restore();
  // stacks
  for (const x of [12, 22]) {
    roundRect(ctx, x - 3, -72, 7, 18, 1.5);
    fillStroke(ctx, IRON2, 1.3);
    smoke(ctx, x, -74, a.t + x, 3, 0.8);
  }
}

function snare(ctx, a) {
  const spin = a.t * (1.5 + a.wind * 6 + a.atk * 10);
  const y0 = -42;
  // legs
  for (const [x, ph] of [[-16, 0], [16, 1], [-6, 2], [8, 3]]) {
    const sw = s(a.t * 4 + ph) * 0.15;
    legSeg(ctx, x * 0.6, y0 + 10, x + sw * 10, -18, 2.8, IRON2);
    legSeg(ctx, x + sw * 10, -18, x * 1.3, 0, 2.4, IRON2);
  }
  // chains with hooks
  for (const [x, ph] of [[-22, 0], [22, 2]]) {
    const sw = s(a.t * 2.5 + ph) * 0.4 - a.atk * 0.8 * Math.sign(x);
    ctx.save();
    ctx.translate(x * 0.6, y0 - 4);
    ctx.rotate(sw);
    ctx.strokeStyle = '#9a96a0';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 4 + i * 4, 1.6, 2.4, i % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-3, 30, 4, 0, Math.PI * 1.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  gear(ctx, 0, y0, 22, 14, spin, lin(ctx, 0, y0 - 22, 0, y0 + 22, [BRASSHI, BRASS, BRASS2]), 1.8, 0.0);
  gear(ctx, 0, y0, 12, 9, -spin * 1.6, RUST, 1.3, 0.3);
  eye(ctx, 0, y0, 3.4, a.wind > 0.3 ? '#ffd36a' : RED_EYE, a.t);
}

// ───────────────────────── ACT II ─────────────────────────
function cardShape(ctx, x, y, ang, label, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  roundRect(ctx, -5, -7, 10, 14, 1.5);
  fillStroke(ctx, '#efe2c6', 1.1);
  ctx.fillStyle = col;
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 0.5);
  ctx.restore();
}

function scrambler(ctx, a) {
  const bob = s(a.t * 2.2) * 1.5;
  // single wheel base
  circle(ctx, 0, -9, 9);
  fillStroke(ctx, IRON2, 1.5);
  gear(ctx, 0, -9, 7, 8, -a.t * 4, IRON, 1, 0.3);
  legSeg(ctx, 0, -18, 0, -32 + bob, 4, IRON);
  // torso
  roundRect(ctx, -16, -62 + bob, 32, 32, 6);
  fillStroke(ctx, lin(ctx, 0, -62, 0, -30, ['#7a5a7e', '#5a3c60', '#38223c']), 1.7);
  ctx.fillStyle = BRASS;
  ctx.fillRect(-16, -48 + bob, 32, 3);
  // dealer visor head
  roundRect(ctx, -12, -80 + bob, 24, 18, 5);
  fillStroke(ctx, IRON, 1.6);
  ctx.fillStyle = 'rgba(40,200,170,0.25)';
  roundRect(ctx, -11, -76 + bob, 18, 7, 2);
  ctx.fill();
  ctx.fillStyle = '#7fd6c2';
  ctx.fillRect(-9 + s(a.t * 3) * 3, -74 + bob, 5, 3);
  // orbiting cards
  const speed = 1.6 + a.wind * 5 + a.atk * 8;
  for (let i = 0; i < 6; i++) {
    const ang = a.t * speed + (i / 6) * Math.PI * 2;
    const x = Math.cos(ang) * 26, y = -50 + bob + Math.sin(ang) * 10;
    if (Math.sin(ang) < 0) cardShape(ctx, x, y, ang * 0.5, i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'EX', i % 3 === 0 ? '#b45a2a' : i % 3 === 1 ? '#3a6f8a' : '#8a3a8a');
  }
  // arms
  for (const side of [-1, 1]) {
    const sw = s(a.t * 3 + side) * 0.4 + a.atk * side * 0.8;
    legSeg(ctx, side * 15, -56 + bob, side * 24 + Math.sin(sw) * 6, -40 + bob, 3, IRON);
  }
  for (let i = 0; i < 6; i++) {
    const ang = a.t * speed + (i / 6) * Math.PI * 2;
    const x = Math.cos(ang) * 26, y = -50 + bob + Math.sin(ang) * 10;
    if (Math.sin(ang) >= 0) cardShape(ctx, x, y, ang * 0.5, i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'EX', i % 3 === 0 ? '#b45a2a' : i % 3 === 1 ? '#3a6f8a' : '#8a3a8a');
  }
}

function wing(ctx, a) {
  const flap = s(a.t * 14) * (a.atk > 0 ? 0.3 : 1);
  const dive = a.atk;
  ctx.save();
  ctx.rotate(-dive * 0.5);
  // back wing
  ctx.save();
  ctx.translate(4, -6);
  ctx.rotate(-0.4 - flap * 0.6);
  poly(ctx, [0, 0, 18, -24, 30, -20, 24, -6, 10, 2]);
  fillStroke(ctx, lin(ctx, 0, -24, 0, 2, ['#8d8a8f', '#5b5760']), 1.3);
  ctx.restore();
  // body
  ellipse(ctx, 2, 0, 16, 8, 0.1);
  fillStroke(ctx, lin(ctx, 0, -8, 0, 8, [BRASSHI, BRASS, BRASS2]), 1.5);
  // needle beak
  poly(ctx, [-12, -2, -34, 1, -12, 3]);
  fillStroke(ctx, '#d8d4dc', 1.1);
  eye(ctx, -8, -2, 2, RED_EYE, a.t);
  // tail fins
  poly(ctx, [16, -2, 28, -8, 26, 2, 30, 6, 16, 3]);
  fillStroke(ctx, RUST, 1.2);
  // front wing
  ctx.save();
  ctx.translate(2, -4);
  ctx.rotate(-0.2 - flap * 0.8);
  poly(ctx, [0, 0, 14, -28, 28, -26, 22, -10, 8, 2]);
  fillStroke(ctx, lin(ctx, 0, -28, 0, 2, ['#c2bec8', '#8d8a8f']), 1.4);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = IRON2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4 + i * 4, -2);
    ctx.lineTo(16 + i * 4, -24);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function wisp(ctx, a) {
  const y0 = -6;
  const fl = s(a.t * 7);
  // flame trail
  for (let i = 0; i < 5; i++) {
    const p = i / 5;
    ctx.globalAlpha = 0.5 * (1 - p);
    ellipse(ctx, 8 + p * 22 + s(a.t * 5 + i) * 3, y0 + 4 - p * 6, 9 - p * 6, 6 - p * 3);
    ctx.fillStyle = i % 2 ? VIOLET : '#7a5ab0';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // lantern cage
  roundRect(ctx, -11, y0 - 16, 22, 26, 5);
  fillStroke(ctx, 'rgba(40,24,50,0.6)', 1.5);
  glow(ctx, 0, y0 - 3, 26, VIOLET, 0.7 + fl * 0.15);
  ellipse(ctx, 0, y0 - 2, 6, 8 + fl);
  ctx.fillStyle = '#e8d6ff';
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1.6;
  for (const x of [-11, -4, 4, 11]) {
    ctx.beginPath();
    ctx.moveTo(x, y0 - 15);
    ctx.lineTo(x, y0 + 9);
    ctx.stroke();
  }
  poly(ctx, [-13, y0 - 16, 13, y0 - 16, 7, y0 - 24, -7, y0 - 24]);
  fillStroke(ctx, BRASS, 1.3);
  circle(ctx, 0, y0 - 27, 3);
  fillStroke(ctx, BRASS2, 1.1);
  // eyes in flame
  ctx.fillStyle = PLUM2;
  ctx.fillRect(-4, y0 - 4, 2, 3);
  ctx.fillRect(1, y0 - 4, 2, 3);
  // dangling hooks
  for (const [x, ph] of [[-8, 0], [0, 1.2], [8, 2.4]]) {
    const sw = s(a.t * 2 + ph) * 0.35 - a.atk * 0.9;
    ctx.save();
    ctx.translate(x, y0 + 10);
    ctx.rotate(sw);
    ctx.strokeStyle = '#a49eaa';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 14);
    ctx.arc(-3, 14, 3, 0, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }
}

function bulwark(ctx, a) {
  const rot = a.t * 0.8 + a.wind * 2;
  // base
  poly(ctx, [-22, 0, 22, 0, 14, -14, -14, -14]);
  fillStroke(ctx, IRON2, 1.6);
  // pylon
  poly(ctx, [-9, -14, 9, -14, 6, -70, -6, -70]);
  fillStroke(ctx, lin(ctx, -9, 0, 9, 0, [IRON2, IRONHI, IRON2]), 1.6);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = BRASS;
    ctx.fillRect(-8 + i * 0.6, -24 - i * 12, 16 - i * 1.2, 2.5);
  }
  // rotating shield plates
  for (let i = 0; i < 4; i++) {
    const ang = rot + (i / 4) * Math.PI * 2;
    const x = Math.cos(ang) * 24, z = Math.sin(ang);
    if (z > 0) continue;
    ctx.save();
    ctx.translate(x, -48);
    ctx.scale(0.4 + Math.abs(Math.cos(ang)) * 0.6, 1);
    poly(ctx, [-8, -14, 8, -14, 10, 8, 0, 16, -10, 8]);
    fillStroke(ctx, 'rgba(127,214,194,0.35)', 1.2, '#4a8a7a');
    ctx.restore();
  }
  // lens
  circle(ctx, 0, -78, 10);
  fillStroke(ctx, BRASS, 1.6);
  glow(ctx, 0, -78, 30, TEAL, 0.5 + pulse(a, 3) * 0.3 + a.wind * 0.4);
  circle(ctx, 0, -78, 6);
  ctx.fillStyle = '#c8fff2';
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const ang = rot + (i / 4) * Math.PI * 2;
    const x = Math.cos(ang) * 24, z = Math.sin(ang);
    if (z <= 0) continue;
    ctx.save();
    ctx.translate(x, -48);
    ctx.scale(0.4 + Math.abs(Math.cos(ang)) * 0.6, 1);
    poly(ctx, [-8, -14, 8, -14, 10, 8, 0, 16, -10, 8]);
    fillStroke(ctx, 'rgba(127,214,194,0.55)', 1.4, '#4a8a7a');
    ctx.restore();
  }
}

// ───────────────────────── ACT III ─────────────────────────
function predator(ctx, a) {
  const sway = s(a.t * 1.6) * 3;
  const strike = a.atk;
  // legs (digitigrade)
  for (const [x, col] of [[10, IRON2], [-6, IRON]]) {
    legSeg(ctx, x, -40, x + 8, -22, 3.4, col);
    legSeg(ctx, x + 8, -22, x - 2, -2, 3, col);
    poly(ctx, [x - 8, 0, x + 4, 0, x - 2, -4]);
    fillStroke(ctx, col, 1);
  }
  // abdomen
  ellipse(ctx, 18, -46, 14, 9, -0.3);
  fillStroke(ctx, lin(ctx, 0, -55, 0, -37, ['#5a3a5e', '#3a2440']), 1.5);
  // thorax
  ctx.save();
  ctx.translate(sway * 0.5, 0);
  capsule(ctx, 6, -44, -4, -72, 8, 6);
  fillStroke(ctx, lin(ctx, 0, -72, 0, -40, ['#6e4a74', '#45284a']), 1.6);
  // head with many eyes
  ctx.save();
  ctx.translate(-8, -80);
  ctx.rotate(-0.2 + a.wind * 0.2);
  poly(ctx, [6, -6, -10, -8, -18, 0, -8, 6, 6, 4]);
  fillStroke(ctx, '#4a2e50', 1.5);
  eye(ctx, -9, -2, 1.8, RED_EYE, a.t);
  eye(ctx, -4, -4, 1.4, RED_EYE, a.t + 1);
  eye(ctx, -13, 1, 1.3, RED_EYE, a.t + 2);
  ctx.restore();
  // needle arms
  for (const [y, ph, col] of [[-66, 0, IRON2], [-62, 0.3, IRONHI]]) {
    const raise = -1.4 - a.wind * 0.6 + strike * 2.2 + s(a.t * 2 + ph) * 0.08;
    ctx.save();
    ctx.translate(-2, y);
    ctx.rotate(raise);
    legSeg(ctx, 0, 0, 0, 18, 2.8, col);
    ctx.translate(0, 18);
    ctx.rotate(0.9 - strike * 0.6);
    poly(ctx, [-2.5, 0, 2.5, 0, 0.4, 34, -0.4, 34]);
    fillStroke(ctx, '#e0dce6', 1.1);
    ctx.restore();
  }
  ctx.restore();
}

function overseer(ctx, a) {
  const bob = s(a.t * 2) * 1.5;
  // stubby legs
  for (const x of [-10, 10]) {
    roundRect(ctx, x - 5, -18, 10, 18, 3);
    fillStroke(ctx, IRON2, 1.4);
  }
  // round belly boiler
  ellipse(ctx, 0, -40 + bob, 26, 24);
  fillStroke(ctx, lin(ctx, -26, -60, 26, -20, [BRASSHI, BRASS, BRASS2]), 1.8);
  rivets(ctx, [-20, -48 + bob, 20, -48 + bob, -22, -36 + bob, 22, -36 + bob], 1.4, '#fff0c0');
  // pressure gauge
  circle(ctx, 0, -42 + bob, 8);
  fillStroke(ctx, '#efe2c6', 1.3);
  ctx.strokeStyle = '#a8432b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -42 + bob);
  const g = -2.4 + pulse(a, 1.5) * 1.6 + a.wind;
  ctx.lineTo(Math.cos(g) * 6, -42 + bob + Math.sin(g) * 6);
  ctx.stroke();
  // head with top-hat chimney
  roundRect(ctx, -12, -78 + bob, 24, 16, 4);
  fillStroke(ctx, IRON, 1.5);
  ctx.fillStyle = '#ffcf6a';
  ctx.fillRect(-9, -73 + bob, 7, 3);
  ctx.fillRect(2, -73 + bob, 7, 3);
  ctx.fillStyle = IRON2;
  ctx.fillRect(-6, -66 + bob, 12, 2);
  roundRect(ctx, -9, -98 + bob, 18, 20, 2);
  fillStroke(ctx, '#2e2a30', 1.5);
  ctx.fillStyle = '#a8432b';
  ctx.fillRect(-9, -84 + bob, 18, 3);
  roundRect(ctx, -14, -80 + bob, 28, 4, 1.5);
  fillStroke(ctx, '#2e2a30', 1.3);
  smoke(ctx, 0, -100 + bob, a.t, 3, 0.9);
  // whip arm (front, raised when acting)
  const raise = -0.3 + a.wind * 1.2 + a.atk * 1.8;
  ctx.save();
  ctx.translate(-22, -50 + bob);
  ctx.rotate(raise);
  legSeg(ctx, 0, 0, -10, 14, 3.4, IRON);
  ctx.strokeStyle = '#3a281c';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-10, 14);
  const crack = a.atk;
  ctx.bezierCurveTo(-24, 10 - crack * 20, -36, 24 + s(a.t * 6) * 6, -48 + crack * 6, 8 - crack * 26);
  ctx.stroke();
  ctx.restore();
  // clipboard arm
  ctx.save();
  ctx.translate(22, -48 + bob);
  ctx.rotate(0.4);
  legSeg(ctx, 0, 0, 6, 14, 3.2, IRON2);
  roundRect(ctx, 0, 10, 12, 15, 1.5);
  fillStroke(ctx, '#efe2c6', 1.2);
  ctx.restore();
}

function shard(ctx, a) {
  const r = s(a.t * 1.3) * 0.3;
  ctx.save();
  ctx.rotate(r);
  poly(ctx, [0, -26, 14, -6, 8, 18, -10, 14, -14, -4]);
  fillStroke(ctx, lin(ctx, -14, -26, 14, 18, ['#e4f2ff', '#8fb7d9', '#4a6078']), 1.6);
  ctx.globalAlpha = 0.5 + s(a.t * 9) * 0.3;
  poly(ctx, [-4, -16, 6, -8, 0, 6]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  glow(ctx, 0, -4, 22, '#bfe2ff', 0.25 + a.wind * 0.5);
}

// ───────────────────────── ELITES ─────────────────────────
function warden(ctx, a) {
  const bob = s(a.t * 1.6) * 1.5;
  const lift = a.wind;
  // legs
  for (const [x, col] of [[12, IRON2], [-12, IRON]]) {
    roundRect(ctx, x - 7, -36, 14, 22, 3);
    fillStroke(ctx, col, 1.5);
    roundRect(ctx, x - 10, -15, 20, 15, 3);
    fillStroke(ctx, RUST2, 1.5);
  }
  // torso block
  roundRect(ctx, -26, -88 + bob, 52, 54, 6);
  fillStroke(ctx, lin(ctx, 0, -88, 0, -34, [RUSTHI, RUST, RUST2]), 2);
  // REJECT stamp plate
  roundRect(ctx, -18, -74 + bob, 36, 14, 2);
  fillStroke(ctx, '#efe2c6', 1.4);
  ctx.fillStyle = '#b8321e';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tr('REJECT'), 0, -64 + bob);
  rivets(ctx, [-21, -82 + bob, 21, -82 + bob, -21, -40 + bob, 21, -40 + bob], 1.6);
  // head
  roundRect(ctx, -14, -106 + bob, 28, 20, 4);
  fillStroke(ctx, IRON, 1.6);
  ctx.fillStyle = '#1a1016';
  ctx.fillRect(-11, -100 + bob, 22, 6);
  glow(ctx, -4, -97 + bob, 14, RED_EYE, 0.6 + lift * 0.4);
  ctx.fillStyle = RED_EYE;
  ctx.fillRect(-10 + s(a.t * 2) * 6 + 6, -99 + bob, 6, 4);
  // back arm
  legSeg(ctx, 24, -80 + bob, 30, -52 + bob, 6, IRON2);
  // drop hammer arm
  const ang = -0.2 - lift * 2.4 + a.atk * 3.2;
  ctx.save();
  ctx.translate(-24, -80 + bob);
  ctx.rotate(ang);
  legSeg(ctx, 0, 0, -4, 26, 6.5, IRON);
  ctx.translate(-4, 30);
  roundRect(ctx, -16, -2, 26, 22, 4);
  fillStroke(ctx, lin(ctx, 0, -2, 0, 20, ['#a4a0aa', '#55515c']), 1.8);
  ctx.fillStyle = BRASS;
  ctx.fillRect(-16, 6, 26, 3);
  if (lift > 0.3) glow(ctx, -3, 9, 26, AMBER, lift * 0.6);
  ctx.restore();
}

function houndmother(ctx, a) {
  ctx.save();
  ctx.scale(1.55, 1.45);
  hound(ctx, a, { body: '#7a3a2a', body2: '#4e2219', hi: '#a85a3e', eye: '#ffb03a' });
  ctx.restore();
  // kennel hatch on back
  roundRect(ctx, -6, -72, 26, 14, 3);
  fillStroke(ctx, IRON2, 1.4);
  ctx.fillStyle = '#1a1016';
  ctx.fillRect(-2, -69, 18, 8);
  glow(ctx, 7, -65, 12, AMBER, 0.4 + pulse(a, 3) * 0.3);
}

function censor(ctx, a) {
  const bob = s(a.t * 1.4) * 1;
  // cabinet body with drawers
  roundRect(ctx, -22, -96 + bob, 44, 96, 4);
  fillStroke(ctx, lin(ctx, -22, 0, 22, 0, ['#5e5a52', '#7a756a', '#4e4a44']), 2);
  for (let i = 0; i < 4; i++) {
    const out = i === 1 ? a.wind * 6 + s(a.t * 3) : i === 2 ? a.atk * 8 : 0;
    roundRect(ctx, -19 - out, -90 + i * 22 + bob, 38, 18, 2);
    fillStroke(ctx, '#6e695e', 1.3);
    roundRect(ctx, -6 - out, -83 + i * 22 + bob, 12, 4, 1.5);
    fillStroke(ctx, BRASS, 1);
    if (out > 2) {
      ctx.fillStyle = '#efe2c6';
      ctx.fillRect(-18 - out, -93 + i * 22 + bob, 3, 6);
      ctx.fillRect(-14 - out, -94 + i * 22 + bob, 3, 7);
    }
  }
  // redaction bar eyes
  ctx.fillStyle = '#0e0a0c';
  ctx.fillRect(-20, -112 + bob, 40, 10);
  glow(ctx, 0, -107 + bob, 16, RED_EYE, 0.3 + a.wind * 0.6);
  // stamp arm
  const ang = -0.4 - a.wind * 1.6 + a.atk * 2.6;
  ctx.save();
  ctx.translate(-20, -70 + bob);
  ctx.rotate(ang);
  legSeg(ctx, 0, 0, -2, 22, 4, IRON);
  ctx.translate(-2, 24);
  roundRect(ctx, -6, 0, 12, 6, 1);
  fillStroke(ctx, '#3a281c', 1.2);
  roundRect(ctx, -10, 6, 20, 8, 1.5);
  fillStroke(ctx, '#b8321e', 1.4);
  ctx.restore();
}

function choir(ctx, a) {
  const sing = 0.3 + a.wind * 0.5 + a.atk;
  // organ pipes
  const pipes = [[-24, 70], [-14, 92], [-4, 104], [6, 96], [16, 80], [26, 64]];
  for (const [x, h] of pipes) {
    roundRect(ctx, x - 5, -h, 10, h - 10, 2);
    fillStroke(ctx, lin(ctx, x - 5, 0, x + 5, 0, [BRASS2, BRASSHI, BRASS]), 1.5);
    const mouth = 3 + sing * 3 * (0.6 + 0.4 * s(a.t * 8 + x));
    ellipse(ctx, x, -h + 18, 3.5, mouth);
    ctx.fillStyle = '#1a1016';
    ctx.fill();
  }
  // console base
  roundRect(ctx, -32, -16, 64, 16, 3);
  fillStroke(ctx, PLUM, 1.6);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#efe2c6' : '#1a1016';
    ctx.fillRect(-28 + i * 7, -12, 6, 7);
  }
  // sound rings
  for (let i = 0; i < 3; i++) {
    const p = (a.t * 0.8 + i / 3) % 1;
    ctx.strokeStyle = `rgba(240,178,90,${0.5 * (1 - p) * sing})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-10, -70, 10 + p * 50, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
  }
  eye(ctx, 0, -40, 4, AMBER, a.t);
}

function knight(ctx, a) {
  const bob = s(a.t * 1.5) * 1.2;
  const parry = a.parry || 0;
  // legs
  for (const [x, col] of [[10, '#2a2432'], [-8, '#3a3444']]) {
    legSeg(ctx, x, -44, x - 2, -20, 5, col);
    legSeg(ctx, x - 2, -20, x - 4, -2, 4.4, col);
  }
  // cape
  ctx.beginPath();
  ctx.moveTo(-6, -92 + bob);
  ctx.quadraticCurveTo(26 + s(a.t * 2) * 3, -60, 22 + s(a.t * 2.4) * 4, -8);
  ctx.lineTo(8, -10);
  ctx.closePath();
  fillStroke(ctx, '#3a1830', 1.4);
  // torso
  poly(ctx, [-16, -94 + bob, 16, -94 + bob, 12, -44, -12, -44]);
  fillStroke(ctx, lin(ctx, 0, -94, 0, -44, ['#5a5468', '#2e2a38']), 1.8);
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -90 + bob);
  ctx.lineTo(0, -48);
  ctx.stroke();
  // helm
  ctx.beginPath();
  ctx.moveTo(-11, -96 + bob);
  ctx.lineTo(-12, -112 + bob);
  ctx.quadraticCurveTo(0, -124 + bob, 11, -112 + bob);
  ctx.lineTo(10, -96 + bob);
  ctx.closePath();
  fillStroke(ctx, '#4a4458', 1.6);
  ctx.fillStyle = '#0a0610';
  ctx.fillRect(-10, -108 + bob, 14, 4);
  glow(ctx, -4, -106 + bob, 14, VIOLET, 0.7);
  // sword arm
  const ang = parry > 0 ? 2.2 : -0.6 - a.wind * 1.8 + a.atk * 3.0;
  ctx.save();
  ctx.translate(-14, -88 + bob);
  ctx.rotate(ang);
  legSeg(ctx, 0, 0, -2, 24, 4.4, '#3a3444');
  ctx.translate(-2, 26);
  ctx.fillStyle = BRASS;
  ctx.fillRect(-7, -2, 14, 3);
  poly(ctx, [-2.5, 0, 2.5, 0, 1.5, 52, 0, 58, -1.5, 52]);
  fillStroke(ctx, lin(ctx, 0, 0, 0, 58, ['#2a2236', '#120a18']), 1.3, '#b48cf0');
  ctx.restore();
  if (parry > 0) {
    ctx.strokeStyle = `rgba(180,140,240,${0.5 + 0.3 * s(a.t * 12)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-6, -70, 46, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
  }
}

function eater(ctx, a) {
  const open = 0.2 + a.wind * 0.5 + a.atk * 0.8;
  // segmented body
  for (let i = 4; i >= 0; i--) {
    const x = 34 - i * 2 - (4 - i) * 10, y = -20 - i * 6 + s(a.t * 2 + i) * 2;
    ellipse(ctx, 40 - i * 12 + 6, -16 - s(a.t * 2 + i) * 2 - i * 3, 15 - i, 13 - i * 0.5);
    fillStroke(ctx, lin(ctx, 0, y - 14, 0, y + 14, ['#7a4a6a', '#4a2840']), 1.5);
  }
  // head
  ctx.save();
  ctx.translate(-14, -40);
  circle(ctx, 0, 0, 24);
  fillStroke(ctx, lin(ctx, 0, -24, 0, 24, ['#8a5878', '#5a3050']), 1.8);
  // gaping mouth with rank-tile teeth
  ctx.save();
  ctx.rotate(-0.2);
  ellipse(ctx, -10, 4, 14, 4 + open * 12);
  ctx.fillStyle = '#1a0a12';
  ctx.fill();
  glow(ctx, -10, 4, 16, AMBER, open * 0.6);
  for (let i = 0; i < 5; i++) {
    const tx = -20 + i * 5;
    const ty = 4 - (4 + open * 12) * 0.8;
    roundRect(ctx, tx - 2, ty - 1, 4.4, 5, 0.8);
    fillStroke(ctx, '#efe2c6', 0.8);
    ctx.fillStyle = INK;
    ctx.font = 'bold 4px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String((i * 2 + Math.floor(a.t)) % 9 + 1), tx + 0.2, ty + 3);
  }
  ctx.restore();
  eye(ctx, -2, -12, 3.2, RED_EYE, a.t);
  eye(ctx, 8, -14, 2.4, RED_EYE, a.t + 1);
  ctx.restore();
}

// ───────────────────────── BOSSES ─────────────────────────
function regent(ctx, a) {
  const p2 = a.phase >= 2;
  const bob = s(a.t * 1.3) * 1.5;
  const tick = p2 ? a.t * 3 : a.t;
  // cloak
  ctx.beginPath();
  ctx.moveTo(-18, -96 + bob);
  ctx.quadraticCurveTo(-34, -40, -30, 0);
  ctx.lineTo(30, 0);
  ctx.quadraticCurveTo(34, -40, 18, -96 + bob);
  ctx.closePath();
  fillStroke(ctx, lin(ctx, 0, -96, 0, 0, ['#6a2a3a', '#3a1424']), 2);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 2;
  ctx.stroke();
  // clock-face torso
  circle(ctx, 0, -66 + bob, 22);
  fillStroke(ctx, lin(ctx, 0, -88, 0, -44, [BRASSHI, BRASS, BRASS2]), 2);
  circle(ctx, 0, -66 + bob, 17);
  fillStroke(ctx, '#efe2c6', 1.4);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    ctx.fillStyle = INK;
    ctx.fillRect(Math.cos(ang) * 14 - 0.8, -66 + bob + Math.sin(ang) * 14 - 0.8, 1.6, 1.6);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -66 + bob);
  ctx.lineTo(Math.cos(tick * 2 - 1.57) * 13, -66 + bob + Math.sin(tick * 2 - 1.57) * 13);
  ctx.moveTo(0, -66 + bob);
  ctx.lineTo(Math.cos(tick * 0.2 - 1.57) * 8, -66 + bob + Math.sin(tick * 0.2 - 1.57) * 8);
  ctx.stroke();
  // overwound springs in phase 2
  if (p2) {
    ctx.strokeStyle = '#d0d0d8';
    ctx.lineWidth = 1.4;
    for (const [x, y, d] of [[18, -80, 1], [-20, -78, -1], [16, -50, 1]]) {
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const px = x + d * i * 0.9, py = y + bob + s(i * 1.3 + a.t * 10) * 2.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    glow(ctx, 0, -66 + bob, 40, RED_EYE, 0.25 + pulse(a, 8) * 0.2);
  }
  // head with gear crown
  circle(ctx, 0, -100 + bob, 11);
  fillStroke(ctx, IRON, 1.6);
  ctx.fillStyle = p2 ? '#ff6a3a' : '#ffd36a';
  ctx.fillRect(-7, -102 + bob, 5, 3);
  ctx.fillRect(2, -102 + bob, 5, 3);
  for (let i = -2; i <= 2; i++) gear(ctx, i * 6, -115 + bob - Math.abs(i) * -1.5, 4.2, 6, a.t * (i % 2 ? 2 : -2), BRASS, 1, 0.3);
  // sceptre arm with pendulum
  const ang = -0.3 - a.wind * 1.5 + a.atk * 2.4;
  ctx.save();
  ctx.translate(-20, -80 + bob);
  ctx.rotate(ang);
  legSeg(ctx, 0, 0, -4, 22, 4, IRON);
  ctx.translate(-4, 24);
  ctx.fillStyle = BRASS2;
  ctx.fillRect(-1.5, -26, 3, 52);
  gear(ctx, 0, -28, 6, 8, a.t * 3, BRASS, 1.2, 0.35);
  ctx.save();
  ctx.translate(0, 26);
  ctx.rotate(s(tick * 3) * 0.5);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 16);
  ctx.stroke();
  circle(ctx, 0, 19, 4);
  fillStroke(ctx, BRASSHI, 1.1);
  ctx.restore();
  ctx.restore();
}

function tyrant(ctx, a) {
  const p2 = a.phase >= 2;
  const bob = s(a.t * 1.1) * 1.5;
  // base of crates and wheels
  for (const [x, y, w, h, c] of [[-40, -26, 30, 26, '#7a5a3a'], [-8, -30, 34, 30, '#6a4a30'], [24, -22, 22, 22, '#5a3e28']]) {
    roundRect(ctx, x, y, w, h, 2);
    fillStroke(ctx, c, 1.6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
  }
  // main hulk
  ctx.beginPath();
  ctx.moveTo(-34, -28);
  ctx.lineTo(-30, -92 + bob);
  ctx.lineTo(-6, -110 + bob);
  ctx.lineTo(24, -100 + bob);
  ctx.lineTo(36, -28);
  ctx.closePath();
  fillStroke(ctx, lin(ctx, 0, -110, 0, -28, [IRONHI, IRON, IRON2]), 2.2);
  // patch plates
  for (const [x, y, w, h, c] of [[-26, -84, 18, 14, RUST], [6, -92, 16, 12, BRASS2], [-14, -60, 22, 16, RUST2], [14, -60, 14, 20, IRON2]]) {
    roundRect(ctx, x, y + bob, w, h, 2);
    fillStroke(ctx, c, 1.3);
    rivets(ctx, [x + 2, y + 2 + bob, x + w - 2, y + 2 + bob, x + 2, y + h - 2 + bob, x + w - 2, y + h - 2 + bob], 1);
  }
  // furnace mouth
  const open = 0.2 + a.wind * 0.6 + a.atk * 0.6;
  roundRect(ctx, -30, -50 + bob, 22, 10 + open * 10, 3);
  ctx.fillStyle = '#1a0a08';
  ctx.fill();
  glow(ctx, -20, -44 + bob, 26, AMBER, 0.5 + open * 0.5);
  // eyes
  eye(ctx, -20, -80 + bob, 3.5, p2 ? '#ff4a2a' : AMBER, a.t);
  eye(ctx, -8, -86 + bob, 2.6, p2 ? '#ff4a2a' : AMBER, a.t + 1);
  // crane arm
  const ang = -0.6 - a.wind * 0.8 + a.atk * 1.6;
  ctx.save();
  ctx.translate(-26, -94 + bob);
  ctx.rotate(ang);
  ctx.fillStyle = BRASS;
  ctx.fillRect(-3, -2, 6, 40);
  ctx.strokeStyle = BRASS2;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(-3, i * 6);
    ctx.lineTo(3, i * 6 + 6);
    ctx.stroke();
  }
  ctx.translate(0, 40);
  roundRect(ctx, -10, 0, 20, 12, 2);
  fillStroke(ctx, IRON2, 1.5);
  poly(ctx, [-10, 12, -6, 22, -2, 12]);
  fillStroke(ctx, IRON, 1.2);
  poly(ctx, [10, 12, 6, 22, 2, 12]);
  fillStroke(ctx, IRON, 1.2);
  ctx.restore();
  // smokestacks
  for (const x of [14, 26]) {
    roundRect(ctx, x - 4, -124 + bob, 8, 26, 1.5);
    fillStroke(ctx, IRON2, 1.4);
    smoke(ctx, x, -126 + bob, a.t + x, 3, 1.1);
  }
  if (p2) {
    ctx.strokeStyle = `rgba(240,178,90,${0.35 + 0.2 * s(a.t * 6)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, -60, 50, 64, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function auditor(ctx, a) {
  const p2 = a.phase >= 2;
  const hover = s(a.t * 1.4) * 3;
  const y0 = -20 + hover;
  // red tape ribbons
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#b8321e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14 + i * 14, y0);
    ctx.bezierCurveTo(-18 + i * 14 + s(a.t * 2 + i) * 6, y0 + 12, -10 + i * 14, y0 + 16, -16 + i * 14 + s(a.t * 3 + i) * 8, y0 + 24);
    ctx.stroke();
  }
  // monolith
  poly(ctx, [-24, y0, 24, y0, 20, y0 - 110, -20, y0 - 110]);
  fillStroke(ctx, lin(ctx, -24, 0, 24, 0, ['#3a3440', '#5a5262', '#2e2834']), 2.2);
  // ledger lines
  ctx.strokeStyle = 'rgba(239,226,198,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(-18, y0 - 12 - i * 9);
    ctx.lineTo(18, y0 - 12 - i * 9);
    ctx.stroke();
  }
  // giant scanning eye
  const look = s(a.t * 0.9) * 6 - a.wind * 4;
  ellipse(ctx, 0, y0 - 82, 18, 11);
  fillStroke(ctx, '#efe2c6', 1.8);
  circle(ctx, look, y0 - 82, 8);
  ctx.fillStyle = p2 ? '#d43a2a' : '#c9a24a';
  ctx.fill();
  circle(ctx, look, y0 - 82, 3.6);
  ctx.fillStyle = INK;
  ctx.fill();
  glow(ctx, look, y0 - 82, 30, p2 ? '#ff4a2a' : AMBER, 0.3 + a.wind * 0.5);
  // scan beam
  if (a.wind > 0.1 || a.atk > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 * (a.wind + a.atk);
    ctx.fillStyle = p2 ? '#ff6a3a' : AMBER;
    ctx.beginPath();
    ctx.moveTo(look - 4, y0 - 82);
    ctx.lineTo(-180, y0 - 20);
    ctx.lineTo(-180, y0 + 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // stamp arms
  for (const [side, ph] of [[-1, 0], [1, 1]]) {
    const ang = side * (0.5 + s(a.t * 1.5 + ph) * 0.15) - (side < 0 ? a.atk * 1.4 : 0);
    ctx.save();
    ctx.translate(side * 22, y0 - 60);
    ctx.rotate(ang);
    legSeg(ctx, 0, 0, side * 4, 26, 3.4, IRON);
    ctx.translate(side * 4, 28);
    roundRect(ctx, -8, 0, 16, 9, 2);
    fillStroke(ctx, side < 0 ? '#b8321e' : '#efe2c6', 1.3);
    ctx.restore();
  }
  // banner
  roundRect(ctx, -16, y0 - 54, 32, 10, 2);
  fillStroke(ctx, p2 ? '#b8321e' : BRASS, 1.2);
  ctx.fillStyle = INK;
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p2 ? tr('STRICT') : tr('AUDIT'), 0, y0 - 46.5);
}

function mirror(ctx, a) {
  const rot = a.t * 0.4;
  const p2 = a.phase >= 2;
  const y0 = -70;
  glow(ctx, 0, y0, 60, '#bfe2ff', 0.25 + a.wind * 0.3);
  const n = p2 ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const ang = rot + (i / n) * Math.PI * 2;
    const x = Math.cos(ang) * 40, y = y0 + Math.sin(ang) * 30;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang * 0.3);
    const hex = [];
    for (let k = 0; k < 6; k++) hex.push(Math.cos((k / 6) * Math.PI * 2) * 13, Math.sin((k / 6) * Math.PI * 2) * 13);
    poly(ctx, hex);
    fillStroke(ctx, lin(ctx, -13, -13, 13, 13, ['#e4f2ff', '#8fb7d9', '#3a4e66']), 1.6);
    // reflected party silhouette
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = ['#a8432b', '#5a2f5e', '#7a5236'][i % 3];
    ctx.fillRect(-3, -6, 6, 10);
    circle(ctx, 0, -8, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // core
  circle(ctx, 0, y0, 16);
  fillStroke(ctx, lin(ctx, 0, y0 - 16, 0, y0 + 16, ['#ffffff', '#a8c8e8', '#4a6078']), 2);
  eye(ctx, 0, y0, 5, a.wind > 0.3 ? '#ff8a6a' : '#8fd0ff', a.t);
  // frame stand
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(0, y0 + 16);
  ctx.lineTo(20, 0);
  ctx.stroke();
}

function corruptor(ctx, a) {
  const p2 = a.phase >= 2;
  const glitch = Math.floor(a.t * 12) % 7 === 0 ? 1 : 0;
  const y0 = -70;
  const drawBody = (dx, col, alpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, 0);
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const r = 40 + s(ang * 5 + a.t * 3) * 6 + s(ang * 3 - a.t * 2) * 4 + a.wind * 6;
      const x = Math.cos(ang) * r, y = y0 + Math.sin(ang) * r * 1.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  };
  drawBody(-3 - glitch * 4, 'rgba(255,40,80,0.5)', 0.7);
  drawBody(3 + glitch * 4, 'rgba(40,220,255,0.5)', 0.7);
  drawBody(0, '#140c16', 1);
  // tendrils of pixels
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + a.t * 0.3;
    for (let k = 0; k < 6; k++) {
      const r = 40 + k * 7 + a.atk * 20;
      const x = Math.cos(ang + s(a.t * 2 + k) * 0.2) * r, y = y0 + Math.sin(ang) * r * 1.1;
      ctx.fillStyle = k % 2 ? (p2 ? '#ff3a6a' : '#b48cf0') : '#2a1a30';
      ctx.fillRect(x - 3 + k * 0.3, y - 3, 6 - k * 0.6, 6 - k * 0.6);
    }
  }
  // glitch slices
  if (glitch || p2) {
    for (let i = 0; i < 4; i++) {
      const y = y0 - 40 + ((i * 29 + Math.floor(a.t * 20) * 17) % 80);
      ctx.fillStyle = i % 2 ? 'rgba(255,60,100,0.6)' : 'rgba(80,230,255,0.5)';
      ctx.fillRect(-46 + ((i * 13) % 10), y, 92, 2);
    }
  }
  // face: warning glyph
  ctx.fillStyle = p2 ? '#ff3a6a' : '#efe2c6';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', -6 + glitch * 3, y0);
  eye(ctx, -18, y0 - 12, 3.4, p2 ? '#ff3a6a' : VIOLET, a.t);
  eye(ctx, 6, y0 - 16, 2.6, p2 ? '#ff3a6a' : VIOLET, a.t + 1);
  glow(ctx, 0, y0, 70, p2 ? '#ff3a6a' : VIOLET, 0.2 + a.wind * 0.3);
}

function core(ctx, a) {
  const ph = a.phase || 1;
  const col = ph === 1 ? AMBER : ph === 2 ? '#d43a2a' : VIOLET;
  const y0 = -78;
  const spin = a.t * (0.6 + ph * 0.3) + a.wind * 2;
  glow(ctx, 0, y0, 90, col, 0.3 + pulse(a, 2) * 0.15 + a.wind * 0.3);
  // pedestal
  poly(ctx, [-34, 0, 34, 0, 18, -26, -18, -26]);
  fillStroke(ctx, lin(ctx, 0, -26, 0, 0, [IRON, IRON2]), 2);
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-14, -26);
  ctx.lineTo(-6, -40);
  ctx.moveTo(14, -26);
  ctx.lineTo(6, -40);
  ctx.stroke();
  // rings
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(0, y0);
    ctx.rotate(spin * (i % 2 ? -1 : 1) + i);
    ctx.strokeStyle = i === ph - 1 ? col : BRASS;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 54 - i * 6, 16 + i * 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + spin;
      circle(ctx, Math.cos(ang) * (54 - i * 6), Math.sin(ang) * (16 + i * 6), 3.2);
      fillStroke(ctx, BRASSHI, 1);
    }
    ctx.restore();
  }
  // sphere
  circle(ctx, 0, y0, 30);
  fillStroke(ctx, rad(ctx, -10, y0 - 12, 4, 34, ['#ffffff', col, '#2a1420']), 2.2);
  // spikes in phase 3
  if (ph >= 3) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + a.t * 0.5;
      const r1 = 30, r2 = 44 + s(a.t * 4 + i) * 4;
      poly(ctx, [Math.cos(ang - 0.12) * r1, y0 + Math.sin(ang - 0.12) * r1, Math.cos(ang) * r2, y0 + Math.sin(ang) * r2, Math.cos(ang + 0.12) * r1, y0 + Math.sin(ang + 0.12) * r1]);
      fillStroke(ctx, '#2a1430', 1.2, col);
    }
  }
  // central eye
  ellipse(ctx, 0, y0, 13, 8);
  fillStroke(ctx, '#140a10', 1.4);
  circle(ctx, -2 + s(a.t) * 3, y0, 5);
  ctx.fillStyle = col;
  ctx.fill();
  circle(ctx, -2 + s(a.t) * 3, y0, 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

export const ENEMY_ART = {
  hound: (c, a) => hound(c, a),
  hound2: (c, a) => hound(c, a, { body: '#4a5470', body2: '#2e3448', hi: '#6a7896', eye: TEAL, dish: true, fast: true }),
  jammer, mite, maw, snare, scrambler, wing, wisp, bulwark, predator, overseer, shard,
  warden, houndmother, censor, choir, knight, eater,
  regent, tyrant, auditor, mirror, corruptor, core,
};

// Approximate art bounds (in art units, before size scaling) for HUD placement and hit-testing.
export const ART_BOUNDS = {
  hound: [-40, -56, 36, 2], hound2: [-40, -60, 36, 2], jammer: [-34, -92, 34, 2], mite: [-16, -32, 16, 2], maw: [-60, -80, 36, 2],
  snare: [-30, -68, 30, 2], scrambler: [-34, -86, 34, 2], wing: [-36, -30, 32, 10], wisp: [-16, -36, 34, 26], bulwark: [-30, -92, 30, 2],
  predator: [-40, -96, 34, 2], overseer: [-48, -108, 36, 2], shard: [-18, -30, 18, 22], warden: [-48, -112, 36, 2], houndmother: [-62, -90, 56, 2],
  censor: [-40, -116, 24, 2], choir: [-34, -110, 34, 2], knight: [-46, -126, 28, 2], eater: [-40, -66, 62, 2],
  regent: [-40, -124, 36, 2], tyrant: [-48, -132, 48, 2], auditor: [-30, -136, 30, 10], mirror: [-58, -110, 58, 2], corruptor: [-60, -125, 60, 2], core: [-60, -130, 60, 2],
};
