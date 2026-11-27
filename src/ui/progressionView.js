import { h } from './dom.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { RELICS } from '../data/relics.js';
import { ids } from '../engine/progression.js';
import { t, archName, cardName, enemyName, relicName, relicText, recipeField, achievementText } from '../i18n/index.js';

const meter = (a) => t('{current} of {target}', { current: a.value, target: a.target });
export const achievementCategories = () => ({ campaign: t('Campaign'), combat: t('Combat'), collection: t('Collections'), mastery: t('Build mastery') });

export function starterRow(app, option, choose) {
  const { id, achievement, available, legacy } = option;
  const progress = achievement ? (legacy && !achievement.earned ? t('Unlocked in an earlier version') : !available ? meter(achievement) : '') : '';
  const body = h('span', { class: 'so-body' },
    h('b', {}, relicName(id)), h('span', { class: 'gold' }, archName(RELICS[id].tag)),
    h('span', {}, relicText(id)),
    h('span', { class: available ? 'good' : 'dim' }, !achievement ? t('Available from the start') :
      available ? t('Available as a starting relic') : t('Locked')),
    achievement ? h('span', {}, achievementText(achievement, 1), progress ? ' · ' + progress : '') : null);
  const icon = h('span', { class: 'rb-ico', html: app.relicIconSvg(id) });
  if (!choose) return h('div', { class: 'starter-opt', 'data-relic': id }, icon, body);
  const b = h('button', { class: 'starter-opt', type: 'button', disabled: !available, 'data-relic': id }, icon, body);
  b.addEventListener('click', () => choose(id));
  return b;
}

export function achievementTile(a) {
  const label = a.earned ? t('Earned') : meter(a);
  return h('article', { class: 'achievement-tile', 'data-achievement': a.id, 'data-earned': String(a.earned) },
    h('div', { class: 'achievement-heading' }, h('b', {}, achievementText(a, 0)), h('span', { class: a.earned ? 'good' : 'dim' }, label)),
    h('span', { class: 'dim small' }, achievementCategories()[a.category]),
    !a.earned && a.target > 1 ? h('progress', { class: 'achievement-meter', max: a.target, value: a.value,
      'aria-label': achievementText(a, 0) }) : null,
    h('p', {}, achievementText(a, 1)),
    a.reward ? h('p', { class: 'gold' }, t('Starting relic: {relic}', { relic: relicName(a.reward) })) : null);
}

const recordLabel = (key) => {
  if (key === 'bestCombo') return t('Longest combo');
  if (key === 'maxHit') return t('Biggest hit');
  return t('Best score');
};

export function runProgressView(progress) {
  if (!progress) return null;
  const sections = [];
  const add = (label, list) => {
    if (!list.length) return;
    const items = h('ul', {}, ...list.map((value) => h('li', {}, value)));
    if (list.length > 6) sections.push(h('section', {}, h('details', {}, h('summary', {}, label, ' · ', list.length), items)));
    else sections.push(h('section', {}, h('h3', {}, label), items));
  };
  add(t('New discoveries'), [
    ...ids(progress.cards).map(cardName), ...ids(progress.relics).filter((id) => Object.hasOwn(RELICS, id)).map(relicName),
    ...ids(progress.enemies).map(enemyName), ...ids(progress.recipes).map((id) => recipeField(id, 'name')),
  ]);
  add(t('Achievements'), ids(progress.achievements).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter(Boolean).map((a) => achievementText(a, 0)));
  add(t('Starting relics unlocked'), ids(progress.unlocked).filter((id) => RELICS[id]).map((id) => relicName(id) + ' · ' + archName(RELICS[id].tag)));
  add(t('Personal records'), Object.entries(progress.records || {}).filter(([key, n]) => ['bestCombo', 'maxHit', 'bestScore'].includes(key) && Number.isFinite(n)).map(([key, value]) => recordLabel(key) + ' · ' + value));
  if (sections.length) return h('div', { class: 'run-progress' }, ...sections);
  return null;
}
