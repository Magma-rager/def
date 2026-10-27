// Collects every interface-text key the game can display, by scanning the sources:
//   t('…') / tr('…') calls in the UI and renderers, and the language-neutral messages produced by
//   the engine, the run layer and events (text/sub/title/k fields and requirement strings).
// Used by tests/i18n.test.mjs to prove every key has a translation, and runnable on its own:
//   node tools/i18n-keys.mjs            prints keys missing from ru.js
//   node tools/i18n-keys.mjs --all      prints every key
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STR = String.raw`'((?:[^'\\]|\\.)*)'`;
const unescape = (s) => s.replace(/\\(.)/g, '$1');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'i18n' ? [] : files(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

export function collectKeys() {
  const keys = new Set();
  const add = (k) => { k = unescape(k); if (k.startsWith('$')) k = k.slice(1); if (k) keys.add(k); };
  const literals = (line) => [...line.matchAll(new RegExp(STR, 'g'))].map((m) => m[1]);
  for (const f of [...files(path.join(ROOT, 'src')), path.join(ROOT, 'src/i18n/index.js')]) {
    const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.])(?:t|tr)\(\s*` + STR, 'g'))) add(m[1]);
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (rel === 'src/engine/combat.js' || rel === 'src/engine/run.js') {
      // Engine messages: string literals on lines that build a text/sub/title/k message or an action
      // label. Message keys start with a capital letter, a digit, '{' or '$'; code identifiers do not.
      for (const ln of src.split('\n')) {
        if (!/\b(text|sub|title|k|card)\b\s*[:=]/.test(ln)) continue;
        for (const lit of literals(ln)) if (/^[A-Z0-9{$]/.test(lit) && !/^[A-Z_]+$/.test(lit) || /^[A-Z]+[ :][A-Z :]+$/.test(lit)) add(lit);
      }
    }
    if (rel === 'src/data/events.js') {
      for (const m of src.matchAll(new RegExp(String.raw`select: \{ title: ` + STR, 'g'))) add(m[1]);
      for (const m of src.matchAll(new RegExp(String.raw`\bk: ` + STR, 'g'))) add(m[1]);
      for (const m of src.matchAll(new RegExp(String.raw`\|\| ` + STR, 'g'))) add(m[1]);
    }
  }
  return keys;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { RU } = await import('../src/i18n/ru.js');
  const keys = [...collectKeys()].sort();
  const show = process.argv.includes('--all') ? keys : keys.filter((k) => RU.ui[k] === undefined);
  for (const k of show) console.log(JSON.stringify(k));
  console.error(`${show.length} of ${keys.length} keys${process.argv.includes('--all') ? '' : ' missing'}`);
}
