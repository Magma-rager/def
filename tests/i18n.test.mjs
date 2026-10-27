// Localization: every displayable string has a Russian translation with the same placeholders,
// game logic is independent of the language, and saved data holds no display text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RU } from '../src/i18n/ru.js';
import * as I from '../src/i18n/index.js';
import { collectKeys } from '../tools/i18n-keys.mjs';
import { CARDS, GRAFTS, ARCHETYPES, CARD_LIST } from '../src/data/cards.js';
import { RELICS, STARTER_OPTIONS } from '../src/data/relics.js';
import { ENEMIES } from '../src/data/enemies.js';
import { EVENTS } from '../src/data/events.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { ADAPTATIONS } from '../src/data/adaptations.js';
import { TRAITS, NODE_TYPES } from '../src/data/traits.js';
import { SCENES, SPEAKERS, DEFEAT_LINES, DEV_REMARKS } from '../src/data/story.js';
import { PREPARED_PLANS, VOLATILE_OUTCOMES, THEME_NAMES } from '../src/data/acts.js';
import { Run } from '../src/engine/run.js';

const holes = (s) => new Set([...String(s).matchAll(/\{(\w+)/g)].map((m) => m[1]));
const sameHoles = (a, b, what) => assert.deepEqual([...holes(b)].sort(), [...holes(a)].sort(), `placeholders differ: ${what}`);
const filled = (v, what) => assert.ok(typeof v === 'string' && v.trim().length > 0, `missing translation: ${what}`);

test('every interface key has a translation, none unused, placeholders kept', () => {
  const keys = collectKeys();
  const missing = [...keys].filter((k) => RU.ui[k] === undefined);
  assert.deepEqual(missing, [], 'untranslated interface keys');
  const unused = Object.keys(RU.ui).filter((k) => !keys.has(k));
  assert.deepEqual(unused, [], 'translations for keys the game never shows');
  for (const [k, v] of Object.entries(RU.ui)) sameHoles(k, v, k);
});

test('all current content is translated', () => {
  for (const c of CARD_LIST) {
    filled(RU.cards[c.id] && RU.cards[c.id].name, `card ${c.id}`);
    sameHoles(c.text, RU.cards[c.id].text, `card ${c.id}`);
  }
  for (const id of Object.keys(GRAFTS)) { filled(RU.grafts[id].name, `graft ${id}`); filled(RU.grafts[id].text, `graft ${id}`); }
  for (const id of Object.keys(RELICS)) { filled(RU.relics[id] && RU.relics[id].name, `relic ${id}`); filled(RU.relics[id].text, `relic ${id}`); }
  for (const o of STARTER_OPTIONS) filled(RU.starterHints[o.id], `starter hint ${o.id}`);
  for (const id of Object.keys(MUTATIONS)) { filled(RU.mutations[id].name, `mutation ${id}`); filled(RU.mutations[id].text, `mutation ${id}`); }
  for (const k of Object.keys(ADAPTATIONS)) for (const f of ['name', 'desc', 'breakText']) filled(RU.adaptations[k][f], `adaptation ${k}.${f}`);
  for (const id of Object.keys(TRAITS)) { filled(RU.traits[id].name, `trait ${id}`); filled(RU.traits[id].text, `trait ${id}`); }
  for (const id of Object.keys(NODE_TYPES)) filled(RU.nodes[id], `node ${id}`);
  for (const [id, e] of Object.entries(ENEMIES)) {
    const r = RU.enemies[id];
    filled(r && r.name, `enemy ${id}`);
    filled(r.lore, `enemy ${id} lore`);
    for (const key of Object.keys(e.intents)) filled(r.intents[key], `enemy ${id} intent ${key}`);
    for (let i = 0; i < (e.phases || []).length; i++) { filled(r.phases[i].name, `enemy ${id} phase ${i}`); filled(r.phases[i].text, `enemy ${id} phase ${i}`); }
  }
  for (const k of [...Object.keys(ARCHETYPES), 'balanced']) filled(RU.archetypes[k], `archetype ${k}`);
  for (const p of PREPARED_PLANS) { filled(RU.plans[p.id].name, `plan ${p.id}`); filled(RU.plans[p.id].text, `plan ${p.id}`); }
  for (const v of VOLATILE_OUTCOMES) { filled(RU.volatile[v.id].name, `volatile ${v.id}`); filled(RU.volatile[v.id].text, `volatile ${v.id}`); }
  for (const act of Object.keys(THEME_NAMES)) filled(RU.themes[act], `theme ${act}`);
  for (const role of ['open', 'conv', 'close', 'junk']) filled(RU.roles[role], `role ${role}`);
  for (const o of ['V', 'C', 'S']) { filled(RU.owners[o], `owner ${o}`); filled(RU.initials[o], `initial ${o}`); filled(RU.heroRoles[o], `hero role ${o}`); }
  for (const r of new Set([...CARD_LIST.map((c) => c.rarity), ...Object.values(RELICS).map((r) => r.rarity)])) filled(RU.rarities[r], `rarity ${r}`);
  for (const tier of new Set(Object.values(ENEMIES).map((e) => e.tier))) filled(RU.tiers[tier], `tier ${tier}`);
  const tags = new Set([...CARD_LIST.flatMap((c) => c.tags), ...Object.values(MUTATIONS).map((m) => m.tag), ...Object.values(GRAFTS).map((g) => g.tag)].filter(Boolean));
  for (const tag of tags) filled(RU.tags[tag], `tag ${tag}`);
});

test('every event, choice and outcome is translated', () => {
  for (const ev of EVENTS) {
    const r = RU.events[ev.id];
    filled(r && r.title, `event ${ev.id}`);
    filled(r.text, `event ${ev.id} text`);
    assert.equal(r.choices.length, ev.choices.length, `event ${ev.id} choice count`);
    ev.choices.forEach((ch, i) => {
      filled(r.choices[i].label, `${ev.id}[${i}] label`);
      filled(r.choices[i].hint, `${ev.id}[${i}] hint`);
      assert.deepEqual(Object.keys(r.choices[i].results).sort(), Object.keys(ch.results).sort(), `${ev.id}[${i}] outcomes`);
      for (const [k, tpl] of Object.entries(ch.results)) sameHoles(tpl, r.choices[i].results[k], `${ev.id}[${i}].${k}`);
    });
  }
});

test('story, dialogue, tutorial and help are translated line for line', () => {
  for (const [who, s] of Object.entries(SPEAKERS)) { filled(RU.speakers[who].name, `speaker ${who}`); assert.equal(typeof RU.speakers[who].title, typeof s.title); }
  for (const [key, lines] of Object.entries(SCENES)) {
    assert.equal((RU.scenes[key] || []).length, lines.length, `scene ${key} line count`);
    RU.scenes[key].forEach((ln, i) => filled(ln, `scene ${key}[${i}]`));
  }
  assert.equal(RU.defeat.length, DEFEAT_LINES.length);
  DEFEAT_LINES.forEach((pair, i) => assert.equal(RU.defeat[i].length, pair.length, `defeat ${i}`));
  for (const [key, list] of Object.entries(DEV_REMARKS)) assert.equal((RU.remarks[key] || []).length, list.length, `remarks ${key}`);
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const m of main.matchAll(/line\('([\w.]+)', '((?:[^'\\]|\\.)*)'/g)) { filled(RU.lines[m[1]], `line ${m[1]}`); sameHoles(m[2], RU.lines[m[1]], m[1]); }
  for (const m of main.matchAll(/^\s{8}(\w+): '/gm)) if (main.includes('quip.${arch}')) filled(RU.lines[`quip.${m[1]}`], `quip ${m[1]}`);
  for (const m of main.matchAll(/sec\('(\w+)', /g)) { filled(RU.howto[m[1]][0], `howto ${m[1]}`); filled(RU.howto[m[1]][1], `howto ${m[1]}`); }
  const battle = fs.readFileSync(new URL('../src/ui/battleScreen.js', import.meta.url), 'utf8');
  for (const m of battle.matchAll(/^\s{6}(\w+): \['/gm)) { filled(RU.tutorial[m[1]][0], `tutorial ${m[1]}`); filled(RU.tutorial[m[1]][1], `tutorial ${m[1]}`); }
});

test('Russian plural forms and number formatting', () => {
  I.setLang('ru');
  try {
    assert.equal(I.t('{n} {n|card|cards}', { n: 1 }), '1 карта');
    assert.equal(I.t('{n} {n|card|cards}', { n: 3 }), '3 карты');
    assert.equal(I.t('{n} {n|card|cards}', { n: 11 }), '11 карт');
    assert.equal(I.t('{n} {n|card|cards}', { n: 21 }), '21 карта');
    assert.equal(I.secs(1.5, 1), '1,5 с');
    assert.equal(I.cardName('scrapline'), 'Ломострел');
  } finally { I.setLang('en'); }
  assert.equal(I.t('{n} {n|card|cards}', { n: 1 }), '1 card');
  assert.equal(I.secs(1.5, 1), '1.5s');
});

test('game logic and save code never import the localization layer', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const f of ['engine/combat.js', 'engine/run.js', 'engine/save.js', 'core/rng.js', 'core/util.js', ...fs.readdirSync(new URL('data/', dir)).map((x) => `data/${x}`)]) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/from '\.\.\/i18n|from '\.\/i18n/.test(src), `${f} imports i18n`);
  }
});

test('event outcomes are saved as language-neutral messages and render in both languages', () => {
  for (const ev of EVENTS) {
    ev.choices.forEach((ch, i) => {
      const run = Run.create({ seed: 4242 + i, tutorial: false });
      run.d.scrap = 500;
      run.d.pending = { type: 'event', eventId: ev.id, nodeId: 'n_test' };
      const res = run.eventChoose(i);
      if (!res || res.error) return;
      const saved = JSON.parse(JSON.stringify(run.serialize()));
      const text = saved.pending.result.text;
      assert.equal(typeof text, 'object', `${ev.id}[${i}] saved display text`);
      for (const lang of ['en', 'ru']) {
        I.setLang(lang);
        const out = I.eventResult(ev.id, i, text);
        assert.ok(out && !/\{\w+\}|undefined|null/.test(out), `${lang} ${ev.id}[${i}]: ${out}`);
        if (saved.pending.select) assert.ok(I.msg(saved.pending.select.title));
      }
      I.setLang('en');
    });
  }
});
