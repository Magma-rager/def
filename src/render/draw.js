// Shared canvas drawing primitives for the procedural art.
export const INK = '#24131c';
export const PAL = {
  cream: '#efe2c6', cream2: '#d9c7a0', rust: '#a8432b', rust2: '#7c2d1d', brass: '#c9a24a', brass2: '#8f6d2a',
  plum: '#4a2840', plum2: '#2e1828', char: '#26202a', char2: '#17131a', brown: '#6b4a32', brown2: '#45301f',
  gold: '#d9b45a', amber: '#f0b25a', violet: '#b48cf0', teal: '#7fb3a2', red: '#d4503a', steel: '#8d8a8f', steel2: '#5b5760',
};

export function capsule(ctx, x1, y1, x2, y2, r1, r2) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

export function fillStroke(ctx, fill, lw = 1.6, stroke = INK) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function gear(ctx, x, y, r, teeth, rot, fill, lw = 1.5, hole = 0.35) {
  const inner = r * 0.82;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = rot + (i / (teeth * 2)) * Math.PI * 2;
    const a1 = rot + ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : inner;
    if (i === 0) ctx.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
    else ctx.lineTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr);
    ctx.lineTo(x + Math.cos(a1) * rr, y + Math.sin(a1) * rr);
  }
  ctx.closePath();
  if (hole > 0) {
    ctx.moveTo(x + r * hole, y);
    ctx.arc(x, y, r * hole, 0, Math.PI * 2, true);
  }
  fillStroke(ctx, fill, lw);
}

export function rivets(ctx, pts, r = 1.2, color = '#e8cf8a') {
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i += 2) {
    ctx.beginPath();
    ctx.arc(pts[i], pts[i + 1], r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function lin(ctx, x1, y1, x2, y2, stops) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

export function rad(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// Additive soft glow. Uses cached radial-gradient sprites (one per color) for speed.
const glowSprites = new Map();
function glowSprite(color) {
  let s = glowSprites.get(color);
  if (s) return s;
  if (typeof document === 'undefined') return null;
  s = document.createElement('canvas');
  s.width = s.height = 128;
  const g = s.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowSprites.set(color, s);
  return s;
}
export function glow(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  const sprite = glowSprite(color);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.globalCompositeOperation = 'lighter';
  if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  else {
    ctx.fillStyle = rad(ctx, x, y, 0, r, [color, 'rgba(0,0,0,0)']);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

export function eye(ctx, x, y, r, color, t = 0) {
  circle(ctx, x, y, r * 1.35);
  fillStroke(ctx, '#1a1016', 1.2);
  const pulse = 0.85 + Math.sin(t * 6) * 0.15;
  glow(ctx, x, y, r * 3.2, color, 0.5 * pulse);
  circle(ctx, x, y, r * pulse);
  ctx.fillStyle = color;
  ctx.fill();
  circle(ctx, x - r * 0.3, y - r * 0.3, r * 0.3);
  ctx.fillStyle = 'rgba(255,255,240,0.85)';
  ctx.fill();
}

export function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
