// Museum: persistent cross-run records (separate from current-run boss adaptation).
import { h, clear, btn } from './dom.js';
import { ENEMIES } from '../data/enemies.js';
import { RELICS, RELIC_IDS, STARTER_OPTIONS } from '../data/relics.js';
import { CARD_LIST } from '../data/cards.js';
import { MUTATIONS } from '../data/mutations.js';
import { drawEnemyStill } from './scene.js';
import { unlocks } from '../engine/save.js';

export function museumModal(app) {
  const m = app.meta;
  const tabs = ['Records', 'Runs', 'Bestiary', 'Relics', 'Cards'];
  let cur = 'Records';
  const body = h('div', { class: 'museum-body' });
  const tabRow = h('div', { class: 'tabs' });
  const render = () => {
    clear(tabRow);
    for (const t of tabs) {
      const b = h('button', { class: `tab ${t === cur ? 'on' : ''}`, type: 'button' }, t);
      b.addEventListener('click', () => { cur = t; app.audio.sfx('click'); render(); });
      tabRow.append(b);
    }
    clear(body);
    if (cur === 'Records') {
      const u = unlocks(m);
      const row = (k, v) => h('div', { class: 'stat-row' }, h('span', {}, k), h('b', {}, String(v)));
      body.append(h('div', { class: 'stats-grid' },
        row('Runs finished', m.totalRuns), row('Victories', m.wins), row('Defeats', m.defeats), row('Best score', m.bestScore),
        row('Longest combo', `${m.bestCombo} cards`), row('Biggest hit', m.maxHit), row('Bosses defeated', Object.values(m.bossesDefeated).reduce((a, b) => a + b, 0)),
        row('Enemies catalogued', `${Object.keys(m.enemiesSeen).length}/${Object.keys(ENEMIES).length}`), row('Relics discovered', `${m.relicsFound.length}/${RELIC_IDS.length}`),
        row('Cards catalogued', `${m.cardsSeen.length}/${CARD_LIST.length - 1}`), row('Endings seen', m.endings.length ? 'Core Stabilized' : 'None'), row('Ozmund\'s trust', '★'.repeat(Math.min(5, m.devTrust)) || '—')));
      const arch = Object.entries(m.archetypes).sort((a, b) => b[1] - a[1]);
      if (arch.length) body.append(h('div', { class: 'rr-label' }, 'Builds played'), h('div', { class: 'chips-row' }, ...arch.map(([a, n]) => h('span', { class: 'tagchip' }, `${a} ×${n}`))));
      body.append(h('div', { class: 'rr-label' }, 'Unlocks (modest; no stat inflation)'), ...STARTER_OPTIONS.filter((o) => o.unlock).map((o) => h('div', { class: `unlock ${u[o.unlock] ? 'on' : ''}` }, h('b', {}, RELICS[o.id].name), h('span', {}, u[o.unlock] ? 'Available as a starting relic' : o.hint))));
    } else if (cur === 'Runs') {
      if (!m.runs.length) body.append(h('p', { class: 'dim' }, 'No finished runs yet.'));
      for (const r of m.runs) {
        body.append(h('div', { class: `run-row ${r.result}` },
          h('b', {}, r.result === 'victory' ? 'VICTORY' : r.result === 'abandoned' ? 'ABANDONED' : 'DEFEAT'),
          h('span', {}, `Act ${r.act} · Floor ${r.floors} · ${r.archetype} · score ${r.score}`),
          h('span', { class: 'dim' }, `${new Date(r.date).toLocaleDateString()} · bosses: ${r.bosses.map((b) => ENEMIES[b].name).join(', ') || 'none'} · longest ${r.longest} · ${r.mutations.map((x) => MUTATIONS[x].name).join(', ')}`)));
      }
    } else if (cur === 'Bestiary') {
      const grid = h('div', { class: 'bestiary' });
      for (const [id, e] of Object.entries(ENEMIES)) {
        const seen = m.enemiesSeen[id];
        const cv = h('canvas', { width: 120, height: 100 });
        const cell = h('div', { class: `beast ${seen ? '' : 'unseen'}` }, cv, h('b', {}, seen ? e.name : '???'), h('span', {}, seen ? `${e.tier} · Act ${e.act} · seen in ${seen} run${seen > 1 ? 's' : ''}` : e.tier), seen ? h('span', { class: 'dim small' }, e.lore) : null, m.bossesDefeated[id] ? h('span', { class: 'gold' }, `Defeated ×${m.bossesDefeated[id]}`) : null);
        grid.append(cell);
        requestAnimationFrame(() => drawEnemyStill(cv, id, 1));
      }
      body.append(grid);
    } else if (cur === 'Relics') {
      const grid = h('div', { class: 'relic-grid' });
      for (const id of RELIC_IDS) {
        const f = m.relicsFound.includes(id);
        grid.append(h('div', { class: `relic-cell ${f ? '' : 'unseen'}` }, h('span', { class: 'rb-ico', html: app.relicIconSvg(id) }), h('b', {}, f ? RELICS[id].name : '???'), h('span', {}, f ? RELICS[id].text : RELICS[id].rarity)));
      }
      body.append(grid);
    } else {
      const grid = h('div', { class: 'relic-grid' });
      for (const c of CARD_LIST) {
        if (c.role === 'junk') continue;
        const f = m.cardsSeen.includes(c.id);
        grid.append(h('div', { class: `relic-cell ${f ? '' : 'unseen'}` }, h('b', {}, f ? `${c.name} · ${c.rank}${c.variant}` : '???'), h('span', {}, f ? `${c.role} · ${c.owner} · ${c.rarity}` : c.role)));
      }
      body.append(grid);
    }
  };
  render();
  const close = app.modal(h('div', { class: 'panel wide museum' }, h('h2', {}, 'The Museum of Broken Things'), tabRow, body, h('div', { class: 'row-btns end' }, btn('Close', () => close(), 'primary'))), { dismiss: true });
}
