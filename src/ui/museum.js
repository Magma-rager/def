// Museum: persistent cross-run records (separate from current-run boss adaptation).
import { h, clear, btn } from './dom.js';
import { ENEMIES } from '../data/enemies.js';
import { RELICS, RELIC_IDS, STARTER_OPTIONS } from '../data/relics.js';
import { CARD_LIST } from '../data/cards.js';
import { drawEnemyStill } from './scene.js';
import { unlocks } from '../engine/save.js';
import { t, lang, archName, enemyName, enemyLore, relicName, relicText, starterHint, mutName, cardName, roleName, ownerName, rarityName, tierName } from '../i18n/index.js';

export function museumModal(app) {
  const m = app.meta;
  const tabs = ['Records', 'Runs', 'Bestiary', 'Relics', 'Cards'];
  let cur = 'Records';
  const tabLabel = { Records: t('Records'), Runs: t('Runs'), Bestiary: t('Bestiary'), Relics: t('Relics'), Cards: t('Cards') };
  const body = h('div', { class: 'museum-body' });
  const tabRow = h('div', { class: 'tabs' });
  const render = () => {
    clear(tabRow);
    for (const tab of tabs) {
      const b = h('button', { class: `tab ${tab === cur ? 'on' : ''}`, type: 'button' }, tabLabel[tab]);
      b.addEventListener('click', () => { cur = tab; app.audio.sfx('click'); render(); });
      tabRow.append(b);
    }
    clear(body);
    if (cur === 'Records') {
      const u = unlocks(m);
      const row = (k, v) => h('div', { class: 'stat-row' }, h('span', {}, k), h('b', {}, String(v)));
      body.append(h('div', { class: 'stats-grid' },
        row(t('Runs finished'), m.totalRuns), row(t('Victories'), m.wins), row(t('Defeats'), m.defeats), row(t('Best score'), m.bestScore),
        row(t('Longest combo'), t('{n} {n|card|cards}', { n: m.bestCombo })), row(t('Biggest hit'), m.maxHit), row(t('Bosses defeated'), Object.values(m.bossesDefeated).reduce((a, b) => a + b, 0)),
        row(t('Enemies catalogued'), `${Object.keys(m.enemiesSeen).length}/${Object.keys(ENEMIES).length}`), row(t('Relics discovered'), `${m.relicsFound.length}/${RELIC_IDS.length}`),
        row(t('Cards catalogued'), `${m.cardsSeen.length}/${CARD_LIST.length - 1}`), row(t('Endings seen'), m.endings.length ? t('Core Stabilized') : t('None')), row(t('Ozmund\'s trust'), '★'.repeat(Math.min(5, m.devTrust)) || '—')));
      // Older records are keyed by the English build label; archName maps both forms.
      const counts = {};
      for (const [a, n] of Object.entries(m.archetypes)) { const k = archName(a); counts[k] = (counts[k] || 0) + n; }
      const arch = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (arch.length) body.append(h('div', { class: 'rr-label' }, t('Builds played')), h('div', { class: 'chips-row' }, ...arch.map(([a, n]) => h('span', { class: 'tagchip' }, `${a} ×${n}`))));
      body.append(h('div', { class: 'rr-label' }, t('Unlocks (modest; no stat inflation)')), ...STARTER_OPTIONS.filter((o) => o.unlock).map((o) => h('div', { class: `unlock ${u[o.unlock] ? 'on' : ''}` }, h('b', {}, relicName(o.id)), h('span', {}, u[o.unlock] ? t('Available as a starting relic') : starterHint(o.id)))));
    } else if (cur === 'Runs') {
      if (!m.runs.length) body.append(h('p', { class: 'dim' }, t('No finished runs yet.')));
      for (const r of m.runs) {
        body.append(h('div', { class: `run-row ${r.result}` },
          h('b', {}, r.result === 'victory' ? t('VICTORY') : r.result === 'abandoned' ? t('ABANDONED') : t('DEFEAT')),
          h('span', {}, t('Act {act} · Floor {floor} · {build} · score {score}', { act: r.act, floor: r.floors, build: archName(r.archetype), score: r.score })),
          h('span', { class: 'dim' }, t('{date} · bosses: {bosses} · longest {n}', { date: new Date(r.date).toLocaleDateString(lang()), bosses: r.bosses.map((b) => enemyName(b)).join(', ') || t('none'), n: r.longest }) + (r.mutations.length ? ` · ${r.mutations.map((x) => mutName(x)).join(', ')}` : ''))));
      }
    } else if (cur === 'Bestiary') {
      const grid = h('div', { class: 'bestiary' });
      for (const [id, e] of Object.entries(ENEMIES)) {
        const seen = m.enemiesSeen[id];
        const cv = h('canvas', { width: 120, height: 100 });
        const cell = h('div', { class: `beast ${seen ? '' : 'unseen'}` }, cv, h('b', {}, seen ? enemyName(id) : '???'), h('span', {}, seen ? t('{tier} · Act {act} · seen in {n} {n|run|runs}', { tier: tierName(e.tier), act: e.act, n: seen }) : tierName(e.tier)), seen ? h('span', { class: 'dim small' }, enemyLore(id)) : null, m.bossesDefeated[id] ? h('span', { class: 'gold' }, t('Defeated ×{n}', { n: m.bossesDefeated[id] })) : null);
        grid.append(cell);
        requestAnimationFrame(() => drawEnemyStill(cv, id, 1));
      }
      body.append(grid);
    } else if (cur === 'Relics') {
      const grid = h('div', { class: 'relic-grid' });
      for (const id of RELIC_IDS) {
        const f = m.relicsFound.includes(id);
        grid.append(h('div', { class: `relic-cell ${f ? '' : 'unseen'}` }, h('span', { class: 'rb-ico', html: app.relicIconSvg(id) }), h('b', {}, f ? relicName(id) : '???'), h('span', {}, f ? relicText(id) : rarityName(RELICS[id].rarity))));
      }
      body.append(grid);
    } else {
      const grid = h('div', { class: 'relic-grid' });
      for (const c of CARD_LIST) {
        if (c.role === 'junk') continue;
        const f = m.cardsSeen.includes(c.id);
        grid.append(h('div', { class: `relic-cell ${f ? '' : 'unseen'}` }, h('b', {}, f ? `${cardName(c.id)} · ${c.rank}${c.variant}` : '???'), h('span', {}, f ? `${roleName(c.role)} · ${ownerName(c.owner)} · ${rarityName(c.rarity)}` : roleName(c.role))));
      }
      body.append(grid);
    }
  };
  render();
  const close = app.modal(h('div', { class: 'panel wide museum' }, h('h2', {}, t('The Museum of Broken Things')), tabRow, body, h('div', { class: 'row-btns end' }, btn(t('Close'), () => close(), 'primary'))), { dismiss: true });
}
