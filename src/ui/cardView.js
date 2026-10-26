// Card DOM rendering (hand cards, reward cards, deck grids, reserve minis).
import { CARDS, ROLE_NAMES, OWNER_NAMES, GRAFTS, cardValue } from '../data/cards.js';
import { ICON_PATHS } from '../render/icons.js';
import { h, esc } from './dom.js';

const GLYPH_MAP = { gear: 'summon', bolt: 'bolt', arrow: 'sword', shield: 'shield', hammer: 'sword', flame: 'flame', spiral: 'scramble', box: 'chest', star: 'star', eye: 'eye', coin: 'coin', ladder: 'up', wave: 'wave', prism: 'prism', hook: 'hook', clock: 'hourglass', chain: 'lock', glitch: 'glitch' };
const ROLE_GLYPH = { open: '▶', conv: '⟳', close: '■', junk: '✕' };

export function cardText(def, up) {
  return def.text.replace(/\{(\w+)\}/g, (_, k) => {
    const v = cardValue(def, up, k);
    const base = cardValue(def, false, k);
    return up && v !== base ? `<b class="upv">${v}</b>` : `<b>${v}</b>`;
  });
}

function artSvg(def) {
  const g = ICON_PATHS[GLYPH_MAP[def.glyph] || 'star'];
  const filled = ['shield', 'flame', 'star', 'coin', 'chest'].includes(GLYPH_MAP[def.glyph]);
  return `<svg class="card-glyph" viewBox="-14 -12 28 24" aria-hidden="true">
    <circle cx="9" cy="-6" r="6" class="g-gear"/>
    <path d="${g}" class="${filled ? 'g-fill' : 'g-line'}"/>
  </svg>`;
}

// inst: run card instance {uid,id,up,graft,rankMod,variant}. opts: {rank, variant} effective overrides
export function cardEl(inst, opts = {}) {
  const def = CARDS[inst.id];
  const rank = opts.rank !== undefined ? opts.rank : Math.max(1, Math.min(9, def.rank + (inst.rankMod || 0)));
  const variant = opts.variant || inst.variant || def.variant;
  const owner = def.owner || 'X';
  const el = h('div', {
    class: `card owner-${owner} role-${def.role} v-${variant}${inst.up ? ' upgraded' : ''}${opts.mini ? ' mini' : ''}${opts.static ? ' static' : ''}`,
    'data-uid': inst.uid,
  });
  const mods = [];
  if (inst.rankMod) mods.push(`<span class="mod">${inst.rankMod > 0 ? '+' : ''}${inst.rankMod}R</span>`);
  if (inst.variant && inst.variant !== def.variant) mods.push('<span class="mod">RECUT</span>');
  el.innerHTML = `
    <div class="card-frame">
      <div class="card-top">
        <span class="rank">${def.role === 'junk' ? '–' : rank}</span>
        <span class="var">${variant}</span>
        <span class="role-tag"><i>${ROLE_GLYPH[def.role]}</i>${ROLE_NAMES[def.role]}</span>
      </div>
      <div class="card-art">${artSvg(def)}<span class="owner-chip">${owner === 'X' ? '!' : owner}</span>${def.rarity === 'rare' ? '<span class="rare-gem"></span>' : ''}</div>
      <div class="card-name">${esc(def.name)}${inst.up ? '<sup>+</sup>' : ''}</div>
      <div class="card-text">${cardText(def, inst.up)}</div>
      <div class="card-foot">${inst.graft ? `<span class="graft">${GRAFTS[inst.graft].name}</span>` : ''}${mods.join('')}<span class="reason"></span></div>
    </div>
    <div class="card-lock"><svg viewBox="0 0 36 36"><circle class="lock-ring" cx="18" cy="18" r="15"/></svg><span class="lock-icon">⛓</span><span class="lock-time"></span><span class="lock-src"></span></div>
    <div class="card-scramble"></div>
    <div class="card-ko">DOWN</div>`;
  return el;
}

export function cardTooltip(inst) {
  const def = CARDS[inst.id];
  const lines = [`<b>${esc(def.name)}${inst.up ? '+' : ''}</b> · ${ROLE_NAMES[def.role]} · ${OWNER_NAMES[def.owner] || ''}`];
  lines.push(cardText(def, inst.up));
  if (inst.graft) lines.push(`<i>Graft — ${GRAFTS[inst.graft].name}:</i> ${GRAFTS[inst.graft].text}`);
  if (def.rarity) lines.push(`<span class="dim">${def.rarity}${def.tags.length ? ' · ' + def.tags.join(', ') : ''}</span>`);
  return lines.join('<br>');
}

export function upgradedPreview(inst) {
  return cardEl({ ...inst, up: true }, { static: true });
}
