// Museum: persistent cross-run records (separate from current-run boss adaptation).
import { h, clear, btn } from './dom.js';
import { ENEMIES } from '../data/enemies.js';
import { RELICS, RELIC_IDS, STARTER_OPTIONS } from '../data/relics.js';
import { CARD_LIST, ARCHETYPES } from '../data/cards.js';
import { RECIPES, RECIPE_TIERS, RECIPE_KINDS, knownDiscoveries } from '../data/recipes.js';
import { drawEnemyStill } from './scene.js';
import { unlocks } from '../engine/save.js';
import { t, lang, archName, recipeField, enemyName, enemyLore, relicName, relicText, starterHint, mutName, cardName, categoryName, ownerName, rarityName, tierName } from '../i18n/index.js';

export function museumModal(app) {
  const m = app.meta;
  const tabs = ['Records', 'Runs', 'Bestiary', 'Relics', 'Cards', 'Journal'];
  let cur = app.museumTab && tabs.includes(app.museumTab) ? app.museumTab : 'Records';
  const tabLabel = { Records: t('Records'), Runs: t('Runs'), Bestiary: t('Bestiary'), Relics: t('Relics'), Cards: t('Cards'), Journal: t('Combo Journal') };
  const jf = { kind: 'all', build: 'all' }; // Combo Journal filters
  const body = h('div', { class: 'museum-body' });
  const tabRow = h('div', { class: 'tabs' });
  const render = () => {
    clear(tabRow);
    for (const tab of tabs) {
      const b = h('button', { class: `tab ${tab === cur ? 'on' : ''}`, type: 'button' }, tabLabel[tab]);
      b.dataset.tab = tab;
      b.addEventListener('click', () => { cur = tab; app.museumTab = tab; app.audio.sfx('click'); render(); });
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
    } else if (cur === 'Journal') {
      body.append(comboJournal(app, m, jf, render));
    } else {
      const grid = h('div', { class: 'relic-grid' });
      for (const c of CARD_LIST) {
        if (c.category === 'junk' || c.p4 === 'withheld') continue;
        const f = m.cardsSeen.includes(c.id);
        const head = c.category === 'support' ? cardName(c.id) : `${cardName(c.id)} · ${c.rank}${c.variant}`;
        grid.append(h('div', { class: `relic-cell ${f ? '' : 'unseen'}` }, h('b', {}, f ? head : '???'), h('span', {}, f ? [categoryName(c.category), c.owner ? ownerName(c.owner) : '', rarityName(c.rarity)].filter(Boolean).join(' · ') : categoryName(c.category))));
      }
      body.append(grid);
    }
  };
  render();
  const close = app.modal(h('div', { class: 'panel wide museum' }, h('h2', {}, t('The Museum of Broken Things')), tabRow, body, h('div', { class: 'row-btns end' }, btn(t('Close'), () => close(), 'primary'))), { dismiss: true });
}

// ───────────────────────── Combo Journal (Phase 7) ─────────────────────────
// Every EX Combo recipe: discovered ones in full (sequence, conditions, effect, purpose, how often it
// activated), undiscovered ones as a mystery with their category and a hint. Filters: kind (offence,
// defence, utility, Relay, support), difficulty, build.
const SEQ = () => ({
  W: ['◆1', t('Weak')], M: ['◆2', t('Medium')], S: ['◆3', t('Strong')], B: ['◆', t('Basic')], A: ['★', t('Arte')], A5: ['★5+', t('Arte')], A6: ['★6', t('Arte')],
  R: ['⇄', t('Relay')], HEAL: ['✚', t('Heal')], COVER: ['▣', t('Cover')], CHURN: ['↓', t('Churn')], NEW: ['↺', t('Card drawn')], RES: ['↑', t('Reserve')], X: ['✕', t('Cross')], STEP: ['+1', t('Step')],
  LOCK: ['⛓', t('Locked card')], FLOW: ['+', t('Flow')], CASH: ['$', t('Cash Out')], SA: ['A', t('suit')], SB: ['B', t('suit')], SEX: ['EX', t('suit')], '6+': ['6+', t('cards')], '8M': ['8', t('Momentum')],
});
const KIND_LABEL = () => ({ all: t('All'), offense: t('Offense'), defense: t('Defense'), utility: t('Utility'), relay: t('Relay'), support: t('Support'), accessible: t('Accessible'), intermediate: t('Intermediate'), advanced: t('Advanced') });

export function seqChips(r) {
  const seq = SEQ();
  return h('div', { class: 'seq' }, ...r.seq.map((k, i) => {
    const [g, word] = seq[k] || [k, ''];
    return h('span', { class: `seq-chip k-${k.replace(/[^A-Za-z0-9]/g, '_')}` }, h('b', {}, g), word ? h('span', {}, word) : null, i < r.seq.length - 1 ? h('i', { 'aria-hidden': 'true' }, '›') : null);
  }));
}

function comboJournal(app, m, jf, rerender) {
  const known = new Set(knownDiscoveries(m.combos));
  const KL = KIND_LABEL();
  const wrap = h('div', { class: 'journal' });
  wrap.append(h('div', { class: 'jr-head' },
    h('b', {}, t('{a} of {b} EX Combos discovered', { a: known.size, b: RECIPES.length })),
    h('span', { class: 'dim' }, known.size < RECIPES.length ? t('{n} still undiscovered — they work before you find them.', { n: RECIPES.length - known.size }) : t('Every recipe found.'))));
  const chip = (key, val) => {
    const b = h('button', { class: `tagchip jf ${jf.kind === val ? 'on' : ''}`, type: 'button', 'data-filter': val }, KL[val]);
    b.addEventListener('click', () => { jf.kind = val; app.audio.sfx('click'); rerender(); });
    return b;
  };
  const sel = h('select', { class: 'jf-build', 'aria-label': t('Build') }, h('option', { value: 'all' }, t('All builds')), ...Object.keys(ARCHETYPES).map((k) => h('option', { value: k }, archName(k))));
  sel.value = jf.build;
  sel.addEventListener('change', () => { jf.build = sel.value; rerender(); });
  wrap.append(h('div', { class: 'jr-filters' }, ...['all', 'offense', 'defense', 'utility', 'relay', 'support', 'accessible', 'intermediate', 'advanced'].map((v) => chip('kind', v)), sel));
  const pass = (r) => {
    const k = jf.kind;
    if (k !== 'all' && !(r.kind === k || r.tier === k || (k === 'relay' && r.tags.includes('relay')) || (k === 'support' && r.support))) return false;
    return jf.build === 'all' || r.tags.includes(jf.build);
  };
  const list = h('div', { class: 'jr-list' });
  let shown = 0;
  for (const r of RECIPES) {
    if (!pass(r)) continue;
    shown++;
    const got = known.has(r.id);
    const meta = [KL[r.tier], KL[r.kind], ...r.tags.map((x) => archName(x))].join(' · ');
    if (got) {
      const rec = m.combos[r.id];
      list.append(h('div', { class: `jr-card found t-${r.tier}`, 'data-recipe': r.id },
        h('div', { class: 'jr-top' }, h('span', { class: 'ex-plate' }, 'EX'), h('b', { class: 'jr-name' }, recipeField(r.id, 'name')), h('span', { class: 'jr-count' }, t('×{n}', { n: rec.count || 1 }))),
        h('div', { class: 'jr-meta dim' }, meta),
        seqChips(r),
        h('div', { class: 'jr-how' }, recipeField(r.id, 'how')),
        h('div', { class: 'jr-fx' }, h('b', {}, t('Effect')), ' ', recipeField(r.id, 'effect')),
        h('div', { class: 'jr-why dim' }, recipeField(r.id, 'purpose'))));
    } else {
      list.append(h('div', { class: `jr-card locked t-${r.tier}`, 'data-recipe': r.id },
        h('div', { class: 'jr-top' }, h('span', { class: 'ex-plate off' }, 'EX'), h('b', { class: 'jr-name' }, '???')),
        h('div', { class: 'jr-meta dim' }, meta),
        h('div', { class: 'seq' }, ...r.seq.map(() => h('span', { class: 'seq-chip q' }, h('b', {}, '?')))),
        h('div', { class: 'jr-hint' }, h('b', {}, t('Hint')), ' ', recipeField(r.id, 'hint'))));
    }
  }
  if (!shown) list.append(h('p', { class: 'dim' }, t('No recipe matches this filter.')));
  wrap.append(list);
  return wrap;
}
