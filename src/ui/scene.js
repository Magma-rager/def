// Illustrated scene canvases for menus, events, boss previews and the title.
import { Background } from '../render/backgrounds.js';
import { Actor, LOOKS, drawCharacter } from '../render/rig.js';
import { ENEMY_ART, ART_BOUNDS } from '../render/enemyArt.js';
import { ENEMIES } from '../data/enemies.js';
import { drawIcon } from '../render/icons.js';
import { glow } from '../render/draw.js';

const EVENT_ICONS = {
  kiosk: 'question', belt: 'chest', save: 'star', notes: 'glitch', oracle: 'eye', vending: 'coin', garden: 'heal', archive: 'chest',
  dupe: 'scramble', choir: 'wave', door: 'question', press: 'prism', npc: 'question', dump: 'glitch', merchant: 'coin', frame: 'hourglass',
  hall: 'wave', pack: 'star', bench: 'wrench',
};

// A living scene: background + optional party + optional enemy. Returns a controller with stop().
export function liveScene(canvas, { act = 1, party = false, enemy = null, icon = null, partyPose = 'idle', dim = 0, left = false }) {
  const ctx = canvas.getContext('2d');
  const bg = new Background(act, 2);
  const actors = party ? { V: new Actor('V'), C: new Actor('C'), S: new Actor('S') } : null;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  let stopped = false;
  if (actors && partyPose === 'victory') for (const a of Object.values(actors)) a.play('victory');
  const frame = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg.draw(ctx, t, w, h, dpr);
    const k = Math.min(h * 0.0036, w * 0.0024);
    if (actors) {
      const slots = enemy || left ? { C: [0.14, 0.76], S: [0.24, 0.9], V: [0.34, 0.82] } : { C: [0.3, 0.76], S: [0.45, 0.9], V: [0.6, 0.82] };
      for (const id of ['C', 'V', 'S']) {
        const a = actors[id];
        a.update(dt);
        const [px, py] = slots[id];
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(px * w, py * h + 2, 22 * k, 5 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(px * w, py * h);
        ctx.scale(k * LOOKS[id].scale, k * LOOKS[id].scale);
        drawCharacter(ctx, LOOKS[id], a.pose(t), t);
        ctx.restore();
      }
    }
    if (enemy) {
      const def = ENEMIES[enemy];
      const b = ART_BOUNDS[def.art];
      const artH = -b[1];
      const sc = Math.min((h * 0.7) / artH, (w * 0.4) / (b[2] - b[0]));
      const ex = actors ? w * 0.74 : w * 0.5, ey = def.flying ? h * 0.72 : h * 0.92;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(ex, h * 0.92, 40 * sc, 8 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(ex, ey);
      ctx.scale(sc, sc);
      ENEMY_ART[def.art](ctx, { t, wind: 0.5 + 0.5 * Math.sin(t * 1.3) > 0.85 ? 0.6 : 0, atk: 0, hurt: 0, phase: 1 });
      ctx.restore();
    }
    if (icon) {
      const s = Math.min(w, h) * 0.32;
      glow(ctx, w * 0.5, h * 0.48, s * 1.4, '#f0b25a', 0.35 + Math.sin(t * 2) * 0.1);
      drawIcon(ctx, EVENT_ICONS[icon] || icon, w * 0.5, h * 0.48, s, '#efe2c6');
    }
    if (dim) {
      ctx.fillStyle = `rgba(14,8,12,${dim})`;
      ctx.fillRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { stop: () => { stopped = true; cancelAnimationFrame(raf); } };
}

// One-off still drawing of an enemy (bestiary, boss prep).
export function drawEnemyStill(canvas, id, t = 1) {
  const ctx = canvas.getContext('2d');
  const def = ENEMIES[id];
  const b = ART_BOUNDS[def.art];
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const sc = Math.min((h * 0.8) / -b[1], (w * 0.85) / (b[2] - b[0]));
  ctx.save();
  ctx.translate(w / 2 - ((b[0] + b[2]) / 2) * sc, h * 0.92 - (def.flying ? -b[3] * sc : 0));
  ctx.scale(sc, sc);
  ENEMY_ART[def.art](ctx, { t, wind: 0, atk: 0, hurt: 0, phase: 1 });
  ctx.restore();
}
