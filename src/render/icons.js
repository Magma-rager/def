// Small vector icons drawn on canvas (intents, statuses, map nodes). Centered at (0,0), ~size px.
export function drawIcon(ctx, name, x, y, size, color = '#efe2c6') {
  ctx.save();
  ctx.translate(x, y);
  const k = size / 20;
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = new Path2D(ICON_PATHS[name] || ICON_PATHS.eye);
  if (FILLED.has(name)) ctx.fill(P);
  else ctx.stroke(P);
  ctx.restore();
}

const FILLED = new Set(['burst', 'shield', 'heal', 'flame', 'skull', 'crown', 'coin', 'chest', 'star']);

// SVG path data in a 20x20 box centered on 0,0
export const ICON_PATHS = {
  sword: 'M-7 7 L6 -6 M3 -8 L8 -3 M-4 2 L-1 5 M-8 8 L-6 6',
  burst: 'M0 -9 L2 -3 L8 -5 L4 0 L9 4 L2 3 L0 9 L-2 3 L-9 4 L-4 0 L-8 -5 L-2 -3 Z',
  lock: 'M-6 -1 h12 v8 h-12 Z M-4 -1 v-3 a4 4 0 0 1 8 0 v3',
  scramble: 'M-8 -5 h4 l8 10 h4 M-8 5 h4 l8 -10 h4 M5 -8 l3 3 l-3 3 M5 2 l3 3 l-3 3',
  static: 'M-8 0 l3 -5 l3 8 l3 -8 l3 8 l3 -5',
  snare: 'M0 -8 a8 8 0 1 1 -0.1 0 M0 -3 v6 M-3 0 h6',
  hook: 'M2 -9 v9 a5 5 0 1 1 -8 -2',
  hourglass: 'M-6 -8 h12 M-6 8 h12 M-5 -8 c0 6 10 10 10 16 M5 -8 c0 6 -10 10 -10 16',
  shield: 'M0 -9 L8 -6 C8 2 5 6 0 9 C-5 6 -8 2 -8 -6 Z',
  up: 'M0 8 V-7 M-6 -1 L0 -7 L6 -1',
  down: 'M0 -8 V7 M-6 1 L0 7 L6 1',
  heal: 'M-3 -8 h6 v5 h5 v6 h-5 v5 h-6 v-5 h-5 v-6 h5 Z',
  summon: 'M0 -8 v16 M-8 0 h16 M-5 -5 l10 10 M5 -5 l-10 10',
  glitch: 'M-8 -6 h10 M-4 -2 h12 M-8 2 h8 M-2 6 h10',
  eye: 'M-9 0 C-5 -6 5 -6 9 0 C5 6 -5 6 -9 0 Z M0 -2.5 a2.5 2.5 0 1 1 -0.1 0',
  flame: 'M0 -9 C5 -4 7 0 5 5 C3 9 -3 9 -5 5 C-7 0 -3 -2 -2 -6 C-1 -3 1 -2 0 -9 Z',
  bolt: 'M2 -9 L-6 1 H0 L-2 9 L6 -1 H0 Z',
  skull: 'M-7 -1 C-7 -10 7 -10 7 -1 V3 H4 V7 H-4 V3 H-7 Z',
  crown: 'M-8 6 L-8 -5 L-4 0 L0 -7 L4 0 L8 -5 L8 6 Z',
  coin: 'M0 -8 a8 8 0 1 1 -0.1 0 Z',
  chest: 'M-8 -2 h16 v9 h-16 Z M-8 -2 c0 -6 16 -6 16 0',
  question: 'M-4 -4 a4 4 0 1 1 6 3 c-2 1 -2 2 -2 4 M0 7 v0.5',
  wrench: 'M-7 7 L2 -2 M2 -2 a4 4 0 1 0 5 -5 l-2 2 l-2 -1 l-1 -2 l2 -2',
  star: 'M0 -9 L2.5 -3 L9 -3 L4 1 L6 8 L0 4 L-6 8 L-4 1 L-9 -3 L-2.5 -3 Z',
  wave: 'M-9 0 c3 -6 6 6 9 0 c3 -6 6 6 9 0',
  prism: 'M0 -9 L8 6 H-8 Z M0 -9 L0 6',
  mark: 'M-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M0 -9 v4 M0 5 v4 M-9 0 h4 M5 0 h4',
  shock: 'M2 -9 L-6 1 H0 L-2 9 L6 -1 H0 Z',
  parry: 'M-8 -6 L8 6 M8 -6 L-8 6',
  counter: 'M-7 -4 h10 l-3 -3 M7 4 h-10 l3 3',
  flame2: 'M0 -9 C5 -4 7 0 5 5 C3 9 -3 9 -5 5',
};
