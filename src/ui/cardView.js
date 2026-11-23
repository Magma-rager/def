// Card DOM rendering (hand cards, reward cards, deck grids, reserve minis).
import { CARDS, cardValue, isOffensive } from '../data/cards.js';
import { t, num, cardName, cardTemplate, categoryName, strengthName, ownerName, ownerInitial, graftName, graftText, rarityName, tagName } from '../i18n/index.js';
import { ICON_PATHS } from '../render/icons.js';
import { LOOKS, POSES, drawCharacter } from '../render/rig.js';
import { h, esc } from './dom.js';

// Hero vignettes for card art: each owner rendered in the pose of the card's action, cached as data URLs.
const VIGNETTE_POSE = { melee: 'strike', shoot: 'fire', cast: 'castRelease', guard: 'guard', buff: 'flourish' };
const vignettes = {};
function vignette(owner, anim) {
  const key = owner + anim;
  if (vignettes[key] !== undefined) return vignettes[key];
  vignettes[key] = '';
  try {
    if (typeof document === 'undefined' || !LOOKS[owner]) return '';
    const cv = document.createElement('canvas');
    cv.width = 200;
    cv.height = 150;
    const ctx = cv.getContext('2d');
    const pose = POSES[owner][VIGNETTE_POSE[anim] || 'idle'];
    ctx.translate(owner === 'S' ? 62 : 70, 152);
    const k = owner === 'S' ? 1.42 : 1.3;
    ctx.scale(k, k);
    drawCharacter(ctx, LOOKS[owner], { ...pose, x: 0, glow: Math.max(pose.glow || 0, 0.6) }, 0.4);
    vignettes[key] = cv.toDataURL('image/png');
  } catch (e) {
    vignettes[key] = '';
  }
  return vignettes[key];
}
const GLYPH_MAP = { gear: 'summon', bolt: 'bolt', arrow: 'sword', shield: 'shield', hammer: 'sword', flame: 'flame', spiral: 'scramble', box: 'chest', star: 'star', eye: 'eye', coin: 'coin', ladder: 'up', wave: 'wave', prism: 'prism', hook: 'hook', clock: 'hourglass', chain: 'lock', glitch: 'glitch' };
// category symbols, also used by the strip, the Reserve and How to Play
export const CAT_GLYPH = { basic: '◆', arte: '★', support: '✚', junk: '✕' };

// Hessa's Guard cards also start Cover (engine/combat.js): the card says so.
export const coversParty = (def) => def.owner === 'V' && (def.tags || []).includes('guard');

export function cardText(def, up) {
  const text = cardTemplate(def.id).replace(/\{(\w+)\}/g, (_, k) => {
    const v = cardValue(def, up, k);
    const base = cardValue(def, false, k);
    return up && v !== base ? `<b class="upv">${num(v)}</b>` : `<b>${num(v)}</b>`;
  });
  return coversParty(def) ? `${text} <b class="kw-cover">${esc(t('Cover.'))}</b>` : text;
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
// A card's corner badge: what it costs (artes, support) or the Momentum it generates (basic attacks).
function costBadge(def) {
  if (def.category === 'basic') return `<span class="gain" title="${esc(t('Generates {n} Momentum', { n: def.gain }))}">+${def.gain}<i></i></span>`;
  if ((def.category === 'arte' || def.category === 'support') && def.cost > 0) return `<span class="cost" title="${esc(t('Costs {n} Momentum', { n: def.cost }))}">${def.cost}<i></i></span>`;
  return '';
}

// inst: run card instance {uid,id,up,graft,rankMod,variant}. opts: {rank, variant} effective overrides
export function cardEl(inst, opts = {}) {
  const def = CARDS[inst.id];
  const off = isOffensive(def);
  const rank = opts.rank !== undefined ? opts.rank : Math.max(1, Math.min(9, def.rank + (inst.rankMod || 0)));
  const variant = opts.variant || inst.variant || def.variant;
  // neutral cards (basic attacks, some support): any hero (three colour dots); Glitch: '!'
  const owner = def.owner || (def.category === 'junk' ? 'X' : 'N');
  const chip = owner === 'N' ? '<i class="o-V"></i><i class="o-C"></i><i class="o-S"></i>' : owner === 'X' ? '!' : ownerInitial(owner);
  const el = h('div', {
    class: `card owner-${owner} cat-${def.category} v-${variant}${inst.up ? ' upgraded' : ''}${opts.mini ? ' mini' : ''}${opts.static ? ' static' : ''}`,
    'data-uid': inst.uid,
  });
  const mods = [];
  if (inst.rankMod && off) mods.push(`<span class="mod">${t('{n}R', { n: `${inst.rankMod > 0 ? '+' : ''}${inst.rankMod}` })}</span>`);
  if (inst.recut && off) mods.push(`<span class="mod">${t('RECUT')}</span>`);
  const catWord = def.category === 'basic' ? strengthName(def.rank) : def.tech ? t('Technique') : categoryName(def.category);
  el.innerHTML = `
    <div class="card-frame">
      <div class="card-top">
        <span class="rank">${off ? rank : def.category === 'support' ? '✚' : '–'}</span>
        ${off ? `<span class="var">${variant}</span>` : ''}
        <span class="role-tag" title="${esc(categoryName(def.category))}"><i>${CAT_GLYPH[def.category]}</i><span class="rt-word">${esc(catWord)}</span>${def.category === 'basic' ? `<span class="rt-cost gain">+${def.gain}</span>` : def.cost > 0 ? `<span class="rt-cost">${def.cost}</span>` : ''}</span>
      </div>
      <div class="card-art"${def.owner && vignette(def.owner, def.anim) ? ` style="--vig:url(${vignette(def.owner, def.anim)})"` : ''}>${artSvg(def)}<span class="owner-chip${owner === 'N' ? ' any' : ''}">${chip}</span>${costBadge(def)}${def.rarity === 'rare' ? '<span class="rare-gem"></span>' : ''}</div>
      <div class="card-name"><span class="name-owner">${owner === 'N' ? '◇' : owner === 'X' ? '!' : ownerInitial(owner)}</span>${esc(cardName(def.id))}${inst.up ? '<sup>+</sup>' : ''}</div>
      <div class="card-text">${cardText(def, inst.up)}</div>
      <div class="card-foot">${inst.graft ? `<span class="graft">${esc(graftName(inst.graft))}</span>` : ''}${mods.join('')}<span class="reason"></span></div>
    </div>
    <div class="card-lock"><svg viewBox="0 0 36 36"><circle class="lock-ring" cx="18" cy="18" r="15"/></svg><span class="lock-icon">⛓</span><span class="lock-time"></span><span class="lock-src"></span></div>
    <div class="card-scramble"></div>`;
  queueFit(el);
  return el;
}

// Fitting. Translated names and texts can run longer than their box; instead of being cut they
// shrink (via --fit, which the CSS font sizes multiply by) and names may take a second line. Runs
// once the card is in the document; sizes are in --cs units, so the fit survives resizing.
const toFit = new Set();
let fitQueued = false;
function queueFit(el) {
  if (typeof requestAnimationFrame === 'undefined') return;
  toFit.add(el);
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    const els = [...toFit];
    toFit.clear();
    for (const e of els) if (e.isConnected) fitCard(e);
  });
}

// A web font that finishes loading after a card was fitted changes its text width: fit again.
if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => document.querySelectorAll('.card').forEach((el) => fitCard(el)));
}

// Width is measured exactly (scrollWidth rounds): a fraction of a pixel over is enough for the
// browser to draw an ellipsis.
function overflows(n) {
  if (n.scrollHeight > n.clientHeight + 1) return true;
  const r = document.createRange();
  r.selectNodeContents(n);
  return r.getBoundingClientRect().width > n.getBoundingClientRect().width + 0.01;
}
// Shrinks a text box until it (and `alsoFits`, if given) fits, down to `min` of its normal size;
// returns whether it fits.
export function fitText(node, min = 0.72, alsoFits = null) {
  if (!node) return true;
  node.style.removeProperty('--fit');
  for (let k = 1; ; k -= 0.06) {
    if (k < 1) node.style.setProperty('--fit', k.toFixed(2));
    if (!overflows(node) && !(alsoFits && alsoFits())) return true;
    if (k - 0.06 < min) return false;
  }
}

export function fitCard(el) {
  const frame = el.querySelector('.card-frame');
  const name = el.querySelector('.card-name');
  const fitAll = () => {
    name.classList.remove('two-line');
    if (!fitText(name, 0.8)) { name.classList.add('two-line'); fitText(name, 0.68); }
    // the text also gives way when the card as a whole would overflow (e.g. a two-line name); the
    // smallest phones (html.narrow) allow a little more shrinking
    const min = document.documentElement.classList.contains('narrow') ? 0.6 : 0.7;
    fitText(el.querySelector('.card-text'), min, () => frame.scrollHeight > frame.clientHeight + 1);
  };
  el.classList.remove('chip-out', 'cost-out');
  fitAll();
  // a long text can squeeze the art band below the hero initial: show the initial before the name
  const art = el.querySelector('.card-art');
  const chip = el.querySelector('.owner-chip');
  if (art && chip && art.clientHeight < chip.offsetHeight) {
    el.classList.add('chip-out');
    fitAll();
  }
  // ...or below the cost badge: show the cost in the top tag instead of the category word
  const badge = art && art.querySelector('.cost, .gain');
  if (badge && art.clientHeight < badge.offsetHeight + 2) el.classList.add('cost-out');
}

export function cardTooltip(inst) {
  const def = CARDS[inst.id];
  const who = def.owner ? ownerName(def.owner) : def.category === 'junk' ? '' : t('any hero');
  const lines = [`<b>${esc(cardName(def.id))}${inst.up ? '+' : ''}</b> · ${esc(categoryName(def.category))} · ${esc(who)}`];
  // the rules line: what the category means for this card
  if (def.category === 'basic') lines.push(`<span class="dim">${esc(t('{s} attack (rank {r}): any hero can perform it; generates {n} Momentum.', { s: strengthName(def.rank), r: def.rank, n: def.gain }))}</span>`);
  else if (def.category === 'arte') lines.push(`<span class="dim">${esc(t('{hero}\'s arte (rank {r}, costs {n} Momentum): needs a basic attack earlier in {hero}\'s combo.', { hero: { hero: def.owner }, r: def.rank, n: def.cost }))}</span>`);
  else if (def.tech) lines.push(`<span class="dim">${esc(t('Technique ({n} Momentum): a free ally performs it inside an open combo, after at least one card; it lowers the combo\'s rank for the attacking hero.', { n: def.cost }))}</span>`);
  else if (def.category === 'support') lines.push(`<span class="dim">${esc(def.cost > 0 ? t('Support (costs {n} Momentum): playable any time, in or out of a combo.', { n: def.cost }) : t('Support (free): playable any time, in or out of a combo.'))}</span>`);
  lines.push(cardText(def, inst.up));
  if (coversParty(def)) lines.push(`<span class="kw-cover">${esc(t('Cover: for 4s, hits aimed at Corvin or Pin land on Hessa, and her 30% Defense applies.'))}</span>`);
  if (inst.graft) lines.push(`<i>${esc(t('Graft — {g}:', { g: graftName(inst.graft) }))}</i> ${esc(graftText(inst.graft))}`);
  if (def.rarity) lines.push(`<span class="dim">${esc(rarityName(def.rarity))}${def.tags.length ? ' · ' + def.tags.map((x) => esc(tagName(x))).join(', ') : ''}</span>`);
  return lines.join('<br>');
}

export function upgradedPreview(inst) {
  return cardEl({ ...inst, up: true }, { static: true });
}
