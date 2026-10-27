// Localization layer.
//
// English is the source language. Content text stays with the content (src/data/*), interface text
// is written in the UI code as t('English text') keys, and messages produced by the engine and the
// run layer are language-neutral: plain English keys or { k, p } objects whose params are numbers
// or typed ids ({ card }, { relic }, { hero }, ...). Translations live in one file per language
// (src/i18n/ru.js) and are looked up here. Game logic never imports this module, so combat, balance
// and save data are identical in every language.
import { CARDS, GRAFTS, ROLE_NAMES, OWNER_NAMES, ARCHETYPES } from '../data/cards.js';
import { RELICS, STARTER_OPTIONS } from '../data/relics.js';
import { ENEMIES } from '../data/enemies.js';
import { EVENT_MAP } from '../data/events.js';
import { MUTATIONS } from '../data/mutations.js';
import { ADAPTATIONS, ARCH_FROM_ADAPT } from '../data/adaptations.js';
import { TRAITS, NODE_TYPES } from '../data/traits.js';
import { SCENES, SPEAKERS, DEFEAT_LINES, DEV_REMARKS } from '../data/story.js';
import { PREPARED_PLANS, VOLATILE_OUTCOMES, THEME_NAMES } from '../data/acts.js';
import { RU } from './ru.js';

export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
];
// Russian typography: a number (or placeholder) and its unit stay on one line.
const typoRu = (s) => s.replace(/(\d|\}) (с|ОЗ)(?=[\s.,;:)!?»—]|$)/g, '$1\u00a0$2');
const polish = (v, fn) => (typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map((x) => polish(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, polish(x, fn)])) : v);
const DICTS = { en: null, ru: polish(RU, typoRu) };

let cur = 'en';
const listeners = new Set();

export const lang = () => cur;
export function setLang(id) {
  const next = id in DICTS ? id : 'en';
  const changed = next !== cur;
  cur = next;
  if (typeof document !== 'undefined') document.documentElement.lang = cur;
  if (changed) for (const fn of listeners) fn(cur);
  return cur;
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// Default language for a first launch, from the browser's preferred languages.
export function detectLang(langs) {
  for (const l of langs || []) {
    const base = String(l).toLowerCase().split('-')[0];
    if (base in DICTS) return base;
  }
  return 'en';
}
const D = () => DICTS[cur];
const pick = (section, key) => { const d = D(); return d && d[section] ? d[section][key] : undefined; };

// ───────────────────────── formatting ─────────────────────────
export function num(v, digits) {
  const s = digits === undefined ? String(v) : Number(v).toFixed(digits);
  return cur === 'ru' ? s.replace('.', ',') : s;
}

function pluralIndex(n) {
  n = Math.abs(Math.trunc(n));
  if (cur === 'ru') {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 0;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 1;
    return 2;
  }
  return n === 1 ? 0 : 1;
}

// "a", "a and b", "a, b and c"
export function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${t(' and ')}${items[items.length - 1]}`;
}

// Typed params let messages carry ids instead of display text.
function resolve(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'object') return v;
  if (Array.isArray(v)) return list(v.map(resolve));
  if ('n' in v) return num(v.n, v.d);
  if ('card' in v) return cardName(v.card);
  if ('cards' in v) return v.cards.length ? list(v.cards.map(cardName)) : t('no cards');
  if ('relic' in v) return v.relic ? relicName(v.relic) : t('50 Scrap (no relics left)');
  if ('relics' in v) return list(v.relics.map((r) => (r ? relicName(r) : t('50 Scrap (no relics left)'))));
  if ('hero' in v) return ownerName(v.hero);
  if ('graft' in v) return graftName(v.graft);
  if ('enemy' in v) return enemyName(v.enemy);
  if ('adapt' in v) return adaptName(v.adapt);
  if ('m' in v) return msg(v.m);
  return String(v);
}

// Interpolates {name} and plural groups {name|one|few|many} (English uses one|other).
export function fmt(tpl, p) {
  if (!p) return tpl;
  return tpl.replace(/\{(\w+)(?:\|([^}]*))?\}/g, (whole, k, forms) => {
    if (!(k in p)) return whole;
    if (forms !== undefined) {
      const f = forms.split('|');
      const raw = p[k];
      const n = typeof raw === 'object' && raw && 'n' in raw ? raw.n : Number(raw);
      return f[Math.min(pluralIndex(n), f.length - 1)];
    }
    const v = resolve(p[k]);
    return typeof v === 'number' ? num(v) : v;
  });
}

// Interface text. The English string is the key.
export function t(key, p) {
  const d = D();
  const s = d && d.ui[key] !== undefined ? d.ui[key] : key;
  return fmt(s, p);
}

// Seconds with the unit, e.g. "1.5s" / "1,5 с".
export const secs = (v, digits) => t('{s}s', { s: { n: v, d: digits } });

// Renders a language-neutral message: an English key, a { k, p } object, or legacy saved text.
export function msg(m) {
  if (m === null || m === undefined || m === '') return '';
  if (typeof m === 'string') return t(m);
  return t(m.k, m.p);
}

// ───────────────────────── content ─────────────────────────
export const cardName = (id) => (pick('cards', id) || {}).name || CARDS[id].name;
export const cardTemplate = (id) => (pick('cards', id) || {}).text || CARDS[id].text;
export const roleName = (role) => pick('roles', role) || ROLE_NAMES[role];
export const rolePlural = (role) => pick('rolesPlural', role) || `${ROLE_NAMES[role]}s`;
export const ownerName = (o) => pick('owners', o) || OWNER_NAMES[o] || '';
export const ownerInitial = (o) => pick('initials', o) || o;
export const heroRole = (o) => pick('heroRoles', o) || { V: 'Vanguard', C: 'Channeler', S: 'Striker' }[o];
export const rarityName = (r) => pick('rarities', r) || r;
export const tierName = (tier) => pick('tiers', tier) || tier;
export const tagName = (tag) => pick('tags', tag) || tag;
export const graftName = (g) => (pick('grafts', g) || {}).name || GRAFTS[g].name;
export const graftText = (g) => (pick('grafts', g) || {}).text || GRAFTS[g].text;

// Build archetype by key. Older records stored the English label; those are mapped back to a key.
const ARCH_BY_LABEL = Object.fromEntries(Object.entries(ARCHETYPES).map(([k, v]) => [v, k]));
ARCH_BY_LABEL.Balanced = 'balanced';
export function archName(keyOrLabel) {
  if (!keyOrLabel) return '';
  const key = ARCHETYPES[keyOrLabel] || keyOrLabel === 'balanced' ? keyOrLabel : ARCH_BY_LABEL[keyOrLabel];
  if (!key) return keyOrLabel;
  return pick('archetypes', key) || (key === 'balanced' ? 'Balanced' : ARCHETYPES[key]);
}

export const relicName = (id) => (pick('relics', id) || {}).name || RELICS[id].name;
export const relicText = (id) => (pick('relics', id) || {}).text || RELICS[id].text;
export const starterHint = (id) => pick('starterHints', id) || (STARTER_OPTIONS.find((o) => o.id === id) || {}).hint || '';

export const mutName = (id) => (pick('mutations', id) || {}).name || MUTATIONS[id].name;
export const mutText = (id) => (pick('mutations', id) || {}).text || MUTATIONS[id].text;

// Adaptations are addressed by archetype key ('relay') or by adaptation id ('relay_jam').
const adaptKey = (x) => (typeof x === 'object' && x ? adaptKey(x.id) : ADAPTATIONS[x] ? x : ARCH_FROM_ADAPT[x]);
const adaptField = (x, f) => { const k = adaptKey(x); return k ? (pick('adaptations', k) || {})[f] || ADAPTATIONS[k][f] : ''; };
export const adaptName = (x) => adaptField(x, 'name');
export const adaptDesc = (x) => adaptField(x, 'desc');
export const adaptBreak = (x) => adaptField(x, 'breakText');

export const traitName = (id) => (pick('traits', id) || {}).name || TRAITS[id].name;
export const traitText = (id) => (pick('traits', id) || {}).text || TRAITS[id].text;
export const nodeName = (type) => pick('nodes', type) || NODE_TYPES[type].name;

const enemyT = (id) => pick('enemies', id) || {};
export function enemyName(id, lvl = 0) {
  const base = enemyT(id).name || ENEMIES[id].name;
  return lvl > 0 ? t('{name} Mk{n}', { name: base, n: lvl + 1 }) : base;
}
export const enemyLore = (id) => enemyT(id).lore || ENEMIES[id].lore;
export const intentName = (id, key) => ((enemyT(id).intents || {})[key]) || ENEMIES[id].intents[key].name;
export const phaseName = (id, i) => ((enemyT(id).phases || [])[i] || {}).name || ENEMIES[id].phases[i].name;
export const phaseText = (id, i) => ((enemyT(id).phases || [])[i] || {}).text || ENEMIES[id].phases[i].text;

const eventT = (id) => pick('events', id) || {};
export const eventTitle = (id) => eventT(id).title || EVENT_MAP[id].title;
export const eventText = (id) => eventT(id).text || EVENT_MAP[id].text;
const choiceT = (id, i) => (eventT(id).choices || [])[i] || {};
export const choiceLabel = (id, i) => choiceT(id, i).label || EVENT_MAP[id].choices[i].label;
export const choiceHint = (id, i) => choiceT(id, i).hint || EVENT_MAP[id].choices[i].hint;
// Event outcome: { k, p } where k names one of the choice's results, '$...' a shared message.
export function eventResult(id, i, m) {
  if (!m) return '';
  if (typeof m === 'string') return m; // saved before localization
  if (m.k.startsWith('$')) return t(m.k.slice(1), m.p);
  const tpl = (choiceT(id, i).results || {})[m.k] || EVENT_MAP[id].choices[i].results[m.k];
  return fmt(tpl, m.p);
}

export const speakerName = (who) => ((pick('speakers', who) || {}).name) || (SPEAKERS[who] || SPEAKERS.sys).name;
export const speakerTitle = (who) => { const s = pick('speakers', who); return s && s.title !== undefined ? s.title : (SPEAKERS[who] || SPEAKERS.sys).title; };
// Lines keep the English speaker order; translations replace the text line by line.
export function sceneLines(key) {
  const tr = pick('scenes', key) || [];
  return (SCENES[key] || []).map((ln, i) => ({ who: ln.who, text: tr[i] || ln.text }));
}
export function defeatLines(i) {
  const tr = (pick('defeat', i) || []);
  return DEFEAT_LINES[i].map((ln, j) => ({ who: ln.who, text: tr[j] || ln.text }));
}
export function remark(key, i) {
  const tr = pick('remarks', key) || [];
  return tr[i] || DEV_REMARKS[key][i];
}
// Story lines written in code (the returning-player intro and boss-win quips).
export const line = (key, en, p) => fmt(pick('lines', key) || en, p);

export const planName = (id) => (pick('plans', id) || {}).name || PREPARED_PLANS.find((x) => x.id === id).name;
export const planText = (id) => (pick('plans', id) || {}).text || PREPARED_PLANS.find((x) => x.id === id).text;
export const volName = (id) => (pick('volatile', id) || {}).name || VOLATILE_OUTCOMES.find((x) => x.id === id).name;
export const volText = (id) => (pick('volatile', id) || {}).text || VOLATILE_OUTCOMES.find((x) => x.id === id).text;
export const themeName = (act) => pick('themes', act) || THEME_NAMES[act];

// Blocks of interface prose kept as tables (tutorial cards, How to Play sections).
export const block = (section, key, en) => pick(section, key) || en;
