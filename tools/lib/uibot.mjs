// UI driver for the Phase 5 player policy (tools/lib/bot.mjs). The decision is computed in the page
// from the live engine (read-only); the action is then performed with real input — a tap on the
// card (and on the hero for a Braced support), a tap on a hero button (start hero, or a Relay during
// a chain), FINISH / CASH OUT, a tap on a waiting queue chip to cancel it, a swipe for Churn and
// Reserve — never by calling the engine. Used by milestone.mjs, encounter.mjs, uiplay.mjs and
// accept5.mjs. Packaged offline campaigns inject the separate test policy once at navigation.
import { build as bundle } from 'esbuild';
import { fileURLToPath } from 'node:url';

let packagedPolicy;
export async function installUiPolicy(page) {
  packagedPolicy ??= bundle({
    stdin: { contents: `export { decide } from './bot.mjs';
      export { starterOptions } from '../../src/engine/progression.js';`,
      resolveDir: fileURLToPath(new URL('.',import.meta.url)) },
    format:'iife', bundle:true, globalName:'__sbTestPolicy', write:false,
  }).then((result)=>`${result.outputFiles[0].text}\nglobalThis.__sbTestPolicy = __sbTestPolicy;`);
  await page.addInitScript({content:await packagedPolicy});
}

export async function uiDecision(p, profile = 'regular', build = null) {
  return p.evaluate(async ({ profile, build }) => {
    const bs = window.__sb && window.__sb.battle;
    const c = bs && bs.combat;
    if (!c || c.phase === 'END' || bs.ended) return null;
    const { decide } = window.__sbTestPolicy || await import('/tools/lib/bot.mjs');
    const a = decide(c, { profile, build });
    if (a.uid) {
      a.zone = c.hand.includes(a.uid) ? 'hand' : c.reserve.includes(a.uid) ? 'reserve' : null;
      a.card = c.def(a.uid).id;
    }
    return a;
  }, { profile, build });
}

async function center(p, selector) {
  return p.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null;
  }, selector);
}

async function swipe(p, selector, dy) {
  const at = await center(p, selector);
  if (!at) return false;
  await p.mouse.move(at[0], at[1]);
  await p.mouse.down();
  for (let k = 1; k <= 6; k++) await p.mouse.move(at[0], at[1] + (dy * k) / 6);
  await p.mouse.up();
  return true;
}

// Performs the action through the interface. `touch`: tap with the touchscreen instead of the mouse.
export async function uiPerform(p, a, { touch = false } = {}) {
  if (!a || a.type === 'wait') return false;
  const tap = async (selector) => {
    const at = await center(p, selector);
    if (!at) return false;
    if (touch) await p.touchscreen.tap(at[0], at[1]);
    else await p.mouse.click(at[0], at[1]);
    return true;
  };
  const cardSel = (uid, zone) => (zone === 'reserve' ? `.reserve .res-card[data-uid="${uid}"]` : `.hand .card[data-uid="${uid}"]`);
  switch (a.type) {
    case 'play': {
      const ok = await tap(cardSel(a.uid, a.zone));
      // a hero-targeted support opens the hero picker: tap the chosen hero, or the card again (default)
      const picking = await p.evaluate(() => { const b = document.querySelector('.pick-cancel'); return !!(b && !b.hidden); });
      if (ok && picking) return a.target ? tap(`.hero-btn[data-hero="${a.target}"]`) : tap(cardSel(a.uid, a.zone));
      return ok;
    }
    case 'select': return tap(`.hero-btn[data-hero="${a.hero}"]`);
    case 'cancel': return tap(`.chip.q.wait[data-cmd="${a.id}"]`);
    case 'finish': return tap('.ctl.cash');
    case 'spend': return tap(a.what === 'guard' ? '.ctl.mom:nth-of-type(2)' : '.ctl.mom:nth-of-type(1)');
    case 'churn': return swipe(p, cardSel(a.uid, 'hand'), 60);
    case 'stash': return swipe(p, cardSel(a.uid, 'hand'), -60);
    default: return false;
  }
}
