// Layered, animated battle environments for each Act. Static layers are cached per size;
// moving machinery (gears, belts, lamps, glitches, fragments) is drawn every frame.
import { gear, lin, rad, glow, roundRect, poly, fillStroke, circle, rivets } from './draw.js';
import { RNG } from '../core/rng.js';

const THEMES = {
  1: { sky: ['#1d1018', '#4a1e22', '#a8482a', '#d98a4a'], far: '#2a1418', mid: '#3a1e1c', floor: ['#4a2a22', '#2a1814'], accent: '#e8a04a', light: 'rgba(255,170,80,0.18)', name: 'The Scrapworks' },
  2: { sky: ['#120e1c', '#2a1a38', '#4a2e52', '#7a5a6a'], far: '#1a1426', mid: '#261c34', floor: ['#2e2638', '#16121e'], accent: '#b48cf0', light: 'rgba(180,140,240,0.14)', name: 'The Broken Protocol' },
  3: { sky: ['#0a080e', '#1c0e16', '#3a1420', '#6a2430'], far: '#120a10', mid: '#1c1018', floor: ['#221418', '#0e080a'], accent: '#ff5a4a', light: 'rgba(255,90,74,0.14)', name: 'The Severed Signal' },
};

export class Background {
  constructor(act, variant = 0) {
    this.act = act;
    this.variant = variant;
    this.cache = null;
    this.w = 0;
    this.h = 0;
    this.theme = THEMES[act];
    const rng = new RNG(act * 97 + variant * 13 + 5);
    this.gears = [];
    const n = act === 3 ? 7 : 5;
    for (let i = 0; i < n; i++) this.gears.push({ x: rng.next(), y: 0.15 + rng.next() * 0.35, r: 0.05 + rng.next() * 0.09, teeth: 10 + rng.int(10), speed: (rng.next() - 0.5) * 0.6, layer: rng.next() });
    this.lamps = Array.from({ length: 6 }, (_, i) => ({ x: 0.08 + i * 0.17 + rng.next() * 0.05, y: 0.32 + rng.next() * 0.12, ph: rng.next() * 6 }));
    this.frags = Array.from({ length: 12 }, () => ({ x: rng.next(), y: 0.08 + rng.next() * 0.45, w: 0.03 + rng.next() * 0.07, h: 0.02 + rng.next() * 0.05, sp: 0.2 + rng.next() * 0.6, ph: rng.next() * 6, rot: (rng.next() - 0.5) * 0.6 }));
    this.sparks = [];
    this.rng = rng;
  }

  build(w, h, dpr) {
    this.w = w;
    this.h = h;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    this.drawStatic(ctx, w, h);
    this.cache = c;
  }

  horizon() {
    return this.h * 0.58;
  }

  drawStatic(ctx, w, h) {
    const T = this.theme;
    const hz = this.horizon();
    ctx.fillStyle = lin(ctx, 0, 0, 0, hz, T.sky);
    ctx.fillRect(0, 0, w, hz + 2);
    const rng = new RNG(this.act * 31 + this.variant);
    if (this.act === 1) this.staticScrapworks(ctx, w, h, hz, rng);
    else if (this.act === 2) this.staticProtocol(ctx, w, h, hz, rng);
    else this.staticSevered(ctx, w, h, hz, rng);
    // floor
    ctx.fillStyle = lin(ctx, 0, hz, 0, h, T.floor);
    ctx.fillRect(0, hz, w, h - hz);
    // perspective floor plates
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * w * 0.05, hz);
      ctx.lineTo(w / 2 + i * w * 0.22, h);
      ctx.stroke();
    }
    for (let k = 0; k < 7; k++) {
      const y = hz + (h - hz) * Math.pow(k / 7, 1.7);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,230,180,0.05)';
    for (let k = 1; k < 7; k++) {
      const y = hz + (h - hz) * Math.pow(k / 7, 1.7);
      ctx.fillRect(0, y + 1, w, 1);
    }
    // floor rivets
    for (let i = 0; i < 60; i++) {
      const x = rng.next() * w, y = hz + 6 + rng.next() * (h - hz - 6);
      ctx.fillStyle = 'rgba(255,220,160,0.08)';
      ctx.fillRect(x, y, 2, 2);
    }
    // light pool where the fight happens
    ctx.fillStyle = rad(ctx, w * 0.5, h * 0.8, 10, w * 0.6, [T.light, 'rgba(0,0,0,0)']);
    ctx.fillRect(0, hz, w, h - hz);
    // vignette
    ctx.fillStyle = rad(ctx, w / 2, h * 0.55, Math.min(w, h) * 0.3, Math.max(w, h) * 0.8, ['rgba(0,0,0,0)', 'rgba(8,4,8,0.65)']);
    ctx.fillRect(0, 0, w, h);
  }

  staticScrapworks(ctx, w, h, hz, rng) {
    const T = this.theme;
    // far chimneys
    ctx.fillStyle = '#3a1a1a';
    for (let i = 0; i < 14; i++) {
      const x = rng.next() * w, cw = w * (0.015 + rng.next() * 0.02), ch = hz * (0.25 + rng.next() * 0.45);
      ctx.fillRect(x, hz - ch, cw, ch);
      ctx.fillRect(x - cw * 0.2, hz - ch, cw * 1.4, cw * 0.5);
    }
    // factory skyline
    ctx.fillStyle = T.far;
    ctx.beginPath();
    ctx.moveTo(0, hz);
    let x = 0;
    while (x < w) {
      const bw = w * (0.05 + rng.next() * 0.08), bh = hz * (0.18 + rng.next() * 0.25);
      ctx.lineTo(x, hz - bh);
      if (rng.chance(0.5)) {
        ctx.lineTo(x + bw * 0.5, hz - bh - hz * 0.06);
      }
      ctx.lineTo(x + bw, hz - bh);
      x += bw;
    }
    ctx.lineTo(w, hz);
    ctx.closePath();
    ctx.fill();
    // lit windows
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rng.chance(0.3) ? 'rgba(255,190,90,0.6)' : 'rgba(255,190,90,0.18)';
      ctx.fillRect(rng.next() * w, hz - rng.next() * hz * 0.3, 3, 4);
    }
    // catwalk + railing
    const cy = hz - h * 0.06;
    ctx.fillStyle = T.mid;
    ctx.fillRect(0, cy, w, h * 0.025);
    ctx.strokeStyle = '#5a2e24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy - h * 0.05);
    ctx.lineTo(w, cy - h * 0.05);
    for (let i = 0; i < w; i += w * 0.04) {
      ctx.moveTo(i, cy - h * 0.05);
      ctx.lineTo(i, cy);
    }
    ctx.stroke();
    // horizontal pipes
    for (const [py, pr, col] of [[hz * 0.62, h * 0.018, '#6a3424'], [hz * 0.7, h * 0.012, '#8a6a3a']]) {
      ctx.fillStyle = lin(ctx, 0, py - pr, 0, py + pr, ['#b0704a', col, '#2a1410']);
      ctx.fillRect(0, py - pr, w, pr * 2);
      for (let i = 0; i < 8; i++) {
        const jx = (i + 0.3) * (w / 8);
        ctx.fillStyle = '#3a2018';
        ctx.fillRect(jx, py - pr * 1.4, pr * 1.2, pr * 2.8);
      }
    }
  }

  staticProtocol(ctx, w, h, hz, rng) {
    // archive wall of drawers
    const top = hz * 0.18;
    ctx.fillStyle = '#1e1828';
    ctx.fillRect(0, top, w, hz - top);
    const cols = 18, rows = 6;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = (i / cols) * w + 2, y = top + (j / rows) * (hz - top) * 0.75 + 2;
        const cw = w / cols - 4, chh = ((hz - top) * 0.75) / rows - 4;
        ctx.fillStyle = (i + j) % 3 === 0 ? '#2e2640' : '#272034';
        ctx.fillRect(x, y, cw, chh);
        ctx.fillStyle = '#8f6d2a';
        ctx.fillRect(x + cw * 0.4, y + chh * 0.45, cw * 0.2, 2);
      }
    }
    // control consoles with CRT frames
    for (let i = 0; i < 5; i++) {
      const x = w * (0.04 + i * 0.2), y = hz - h * 0.13, cw = w * 0.13, chh = h * 0.1;
      roundRect(ctx, x, y, cw, chh, 4);
      fillStroke(ctx, '#2a2234', 1.5, '#0e0a14');
      roundRect(ctx, x + cw * 0.08, y + chh * 0.12, cw * 0.84, chh * 0.6, 3);
      ctx.fillStyle = '#0e1418';
      ctx.fill();
    }
    // signal towers
    ctx.strokeStyle = '#3a2e48';
    ctx.lineWidth = 2;
    for (const tx of [0.12, 0.5, 0.86]) {
      const x = w * tx;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.02, top);
      ctx.lineTo(x, top - hz * 0.16);
      ctx.lineTo(x + w * 0.02, top);
      ctx.moveTo(x - w * 0.012, top - hz * 0.06);
      ctx.lineTo(x + w * 0.012, top - hz * 0.06);
      ctx.stroke();
    }
    // hanging cables
    ctx.strokeStyle = 'rgba(10,6,14,0.8)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const x1 = rng.next() * w, x2 = x1 + (rng.next() - 0.5) * w * 0.4;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.quadraticCurveTo((x1 + x2) / 2, hz * (0.25 + rng.next() * 0.2), x2, 0);
      ctx.stroke();
    }
  }

  staticSevered(ctx, w, h, hz, rng) {
    // impossible architecture: inverted towers hanging from the sky
    ctx.fillStyle = '#16080e';
    for (let i = 0; i < 10; i++) {
      const x = rng.next() * w, tw = w * (0.03 + rng.next() * 0.05), th = hz * (0.2 + rng.next() * 0.35);
      ctx.fillRect(x, 0, tw, th);
      poly(ctx, [x, th, x + tw, th, x + tw / 2, th + tw * 1.2]);
      ctx.fill();
    }
    // cracked horizon with core glow
    ctx.fillStyle = rad(ctx, w * 0.5, hz, 5, w * 0.45, ['rgba(255,80,60,0.55)', 'rgba(120,20,40,0.2)', 'rgba(0,0,0,0)']);
    ctx.fillRect(0, 0, w, hz);
    // broken ground silhouettes tilted
    ctx.fillStyle = '#12080c';
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * w + rng.next() * 40, bw = w * 0.14, bh = hz * (0.12 + rng.next() * 0.18);
      ctx.save();
      ctx.translate(x + bw / 2, hz);
      ctx.rotate((rng.next() - 0.5) * 0.3);
      ctx.fillRect(-bw / 2, -bh, bw, bh);
      ctx.restore();
    }
    // interface window frames floating (static ones)
    ctx.strokeStyle = 'rgba(239,226,198,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = rng.next() * w * 0.9, y = rng.next() * hz * 0.6, fw = w * 0.12, fh = hz * 0.12;
      ctx.strokeRect(x, y, fw, fh);
      ctx.fillStyle = 'rgba(239,226,198,0.12)';
      ctx.fillRect(x, y, fw, fh * 0.15);
    }
  }

  draw(ctx, t, w, h, dpr) {
    if (!this.cache || this.w !== w || this.h !== h) this.build(w, h, dpr);
    ctx.drawImage(this.cache, 0, 0, w, h);
    const hz = this.horizon();
    const T = this.theme;
    // rotating background gears
    for (const g of this.gears) {
      const r = g.r * h * (0.8 + g.layer * 0.6);
      const col = this.act === 3 ? 'rgba(60,20,30,0.85)' : this.act === 2 ? 'rgba(52,40,70,0.9)' : 'rgba(80,40,30,0.9)';
      ctx.save();
      ctx.globalAlpha = 0.55 + g.layer * 0.35;
      gear(ctx, g.x * w, g.y * hz * (this.act === 3 ? 1.3 : 1), r, g.teeth, t * g.speed * (this.act === 3 ? -1.5 : 1), col, 1, 0.3);
      ctx.restore();
    }
    if (this.act === 1) this.animScrapworks(ctx, t, w, h, hz);
    else if (this.act === 2) this.animProtocol(ctx, t, w, h, hz);
    else this.animSevered(ctx, t, w, h, hz);
    // drifting dust / embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const p = (t * (0.02 + (i % 5) * 0.006) + i * 0.137) % 1;
      const x = ((i * 0.618 + Math.sin(t * 0.3 + i) * 0.02) % 1) * w;
      const y = h - p * h;
      ctx.fillStyle = T.accent;
      ctx.globalAlpha = 0.25 * Math.sin(p * Math.PI);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }

  drawForeground(ctx, t, w, h) {
    // foreground framing: pipes and hanging chains at the edges
    const col = this.act === 1 ? ['#7a3a28', '#3a1a12'] : this.act === 2 ? ['#3e3050', '#1a1424'] : ['#3a1820', '#120608'];
    ctx.save();
    ctx.fillStyle = lin(ctx, 0, 0, w * 0.04, 0, col);
    ctx.fillRect(0, 0, w * 0.028, h);
    ctx.fillStyle = lin(ctx, w, 0, w * 0.96, 0, col);
    ctx.fillRect(w * 0.972, 0, w * 0.028, h);
    ctx.fillStyle = lin(ctx, 0, 0, 0, h * 0.05, col);
    ctx.fillRect(0, 0, w, h * 0.03);
    rivets(ctx, [w * 0.014, h * 0.2, w * 0.014, h * 0.5, w * 0.986, h * 0.3, w * 0.986, h * 0.6], 2, 'rgba(232,207,138,0.6)');
    // chains
    ctx.strokeStyle = this.act === 2 ? 'rgba(120,100,140,0.7)' : 'rgba(120,90,70,0.75)';
    ctx.lineWidth = 2;
    for (const [cx, len, ph] of [[0.06, 0.18, 0], [0.93, 0.25, 1.3], [0.4, 0.08, 2.1]]) {
      const sw = Math.sin(t * 0.9 + ph) * 0.06;
      for (let k = 0; k < len * 40; k++) {
        const y = h * 0.03 + k * 5;
        const x = cx * w + Math.sin(sw) * k * 5;
        ctx.beginPath();
        ctx.ellipse(x, y, 1.8, 2.8, k % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  animScrapworks(ctx, t, w, h, hz) {
    // conveyor belt with crates in the midground
    const by = hz - h * 0.015;
    ctx.fillStyle = '#2a1612';
    ctx.fillRect(0, by, w, h * 0.022);
    ctx.fillStyle = 'rgba(255,200,120,0.15)';
    const off = (t * 40) % 30;
    for (let x = -30 + off; x < w; x += 30) ctx.fillRect(x, by + 2, 14, 2);
    for (let i = 0; i < 5; i++) {
      const x = ((t * 40 + i * w * 0.23) % (w + 80)) - 40;
      roundRect(ctx, x, by - h * 0.04, h * 0.045, h * 0.04, 2);
      fillStroke(ctx, i % 2 ? '#6a4a30' : '#5a3e28', 1.2, '#1a0e08');
    }
    // flickering lamps
    for (const l of this.lamps) {
      const flick = 0.6 + 0.4 * Math.sin(t * 3 + l.ph) * Math.sin(t * 7.3 + l.ph * 2);
      glow(ctx, l.x * w, l.y * hz, h * 0.08, '#ffb060', 0.35 * flick);
      circle(ctx, l.x * w, l.y * hz, 3);
      ctx.fillStyle = '#ffe0a0';
      ctx.fill();
    }
    // steam vents
    for (const vx of [0.2, 0.78]) {
      for (let i = 0; i < 4; i++) {
        const p = (t * 0.5 + i / 4) % 1;
        ctx.globalAlpha = 0.18 * (1 - p);
        circle(ctx, vx * w + Math.sin(t + i) * 6, hz - p * h * 0.3, 6 + p * 26);
        ctx.fillStyle = '#d8c8b8';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // falling sparks from overhead welding
    if (Math.sin(t * 1.7) > 0.6) {
      for (let i = 0; i < 6; i++) {
        const p = (t * 1.6 + i * 0.17) % 1;
        ctx.fillStyle = `rgba(255,200,90,${1 - p})`;
        ctx.fillRect(w * 0.62 + i * 3 + p * 10, h * 0.08 + p * p * h * 0.5, 2, 3);
      }
    }
  }

  animProtocol(ctx, t, w, h, hz) {
    // CRT screens with scrolling data
    for (let i = 0; i < 5; i++) {
      const x = w * (0.04 + i * 0.2), y = hz - h * 0.13, cw = w * 0.13, chh = h * 0.1;
      const sx = x + cw * 0.08, sy = y + chh * 0.12, sw = cw * 0.84, sh = chh * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
      for (let k = 0; k < 6; k++) {
        const ly = sy + ((k * 7 + t * 14 + i * 5) % sh);
        ctx.fillStyle = (k + i) % 4 === 0 ? 'rgba(240,140,90,0.7)' : 'rgba(127,214,194,0.55)';
        ctx.fillRect(sx + 3, ly, sw * (0.3 + ((k * 13 + i * 7) % 10) / 16), 2);
      }
      if (Math.sin(t * 2 + i * 3) > 0.92) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(sx, sy + ((t * 60) % sh), sw, 3);
      }
      ctx.restore();
    }
    // blinking tower lamps
    for (const [tx, ph] of [[0.12, 0], [0.5, 1], [0.86, 2]]) {
      const on = Math.sin(t * 3 + ph) > 0;
      glow(ctx, w * tx, hz * 0.18 - hz * 0.16, h * 0.04, '#ff6a5a', on ? 0.8 : 0.15);
    }
    // dial needles on the drawer wall
    for (let i = 0; i < 6; i++) {
      const x = w * (0.08 + i * 0.16), y = hz * 0.3;
      circle(ctx, x, y, h * 0.022);
      fillStroke(ctx, '#d9c7a0', 1.2, '#2a2034');
      ctx.strokeStyle = '#a8432b';
      ctx.lineWidth = 1.5;
      const ang = -2.4 + (Math.sin(t * (0.7 + i * 0.2) + i) * 0.5 + 0.5) * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * h * 0.018, y + Math.sin(ang) * h * 0.018);
      ctx.stroke();
    }
    // occasional signal tear
    const tear = Math.sin(t * 0.8) > 0.97;
    if (tear) {
      ctx.fillStyle = 'rgba(180,140,240,0.25)';
      ctx.fillRect(0, hz * (0.3 + 0.4 * Math.abs(Math.sin(t * 13))), w, 3);
    }
  }

  animSevered(ctx, t, w, h, hz) {
    // pulsing core on the horizon
    const p = 0.5 + 0.5 * Math.sin(t * 1.5);
    glow(ctx, w * 0.5, hz * 0.92, h * (0.25 + p * 0.05), '#ff4a3a', 0.35 + p * 0.2);
    // floating debris fragments
    for (const f of this.frags) {
      const y = (f.y + Math.sin(t * f.sp + f.ph) * 0.03) * hz;
      const x = ((f.x + t * 0.005 * f.sp) % 1.1) * w - w * 0.05;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot + Math.sin(t * 0.4 + f.ph) * 0.1);
      ctx.fillStyle = '#1c0c12';
      ctx.fillRect(-f.w * w / 2, -f.h * h / 2, f.w * w, f.h * h);
      ctx.fillStyle = 'rgba(255,90,74,0.25)';
      ctx.fillRect(-f.w * w / 2, f.h * h / 2 - 2, f.w * w, 2);
      ctx.restore();
    }
    // distorted interface panels drifting
    for (let i = 0; i < 3; i++) {
      const x = ((i * 0.37 + t * 0.01) % 1) * w, y = hz * (0.15 + i * 0.12);
      ctx.strokeStyle = `rgba(239,226,198,${0.15 + 0.1 * Math.sin(t * 2 + i)})`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w * 0.1, hz * 0.08);
      ctx.fillStyle = 'rgba(255,90,74,0.15)';
      ctx.fillRect(x + 4, y + 6, w * 0.06, 3);
    }
    // scanline glitch slices
    if (Math.sin(t * 5.3) > 0.85) {
      for (let i = 0; i < 3; i++) {
        const y = ((t * 133 + i * 97) % hz);
        ctx.fillStyle = i % 2 ? 'rgba(255,60,90,0.18)' : 'rgba(80,220,255,0.14)';
        ctx.fillRect(0, y, w, 2 + i);
      }
    }
  }
}

export function themeName(act) {
  return THEMES[act].name;
}
