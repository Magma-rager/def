// Progressive lessons (Phase 6; docs/COMBAT_SPEC.md §27). Each lesson explains one idea in a few
// lines, once, at the moment its mechanic is relevant in a real battle: an arte when one becomes
// playable, a Relay when another hero can usefully take over, Recovery when a hero is recovering,
// Churn when the hand holds a dead card, an interference effect when it happens. Nothing here plays
// for the player or changes combat; a lesson only pauses the battle while it is open.
//
// pickLesson() reads the combat engine's public state only and returns the first relevant lesson the
// player has not seen, with an anchor the battle screen spotlights:
//   { slot: i } a hand slot · { reserve: i } a Reserve card · { hero: id } a hero button ·
//   { fieldHero: id } a hero on the field · { enemy: uid } an enemy · { ui: name } a control
//   ('cash', 'guard', 'flow', 'momentum', 'reserve', 'queueWait', 'hand').
// `late` lessons (decisions for later fights and the boss) never appear in the first battle.
// `need` orders lessons only where one builds on another; a lesson whose moment never comes simply
// waits for a later battle, so no lesson can block the run. The battle screen decides how many
// lessons one battle may show and how far apart (LESSON_PACE).
//
// Texts are the English originals; Russian ones are in src/i18n/ru.js (`lessons`).

const offensive = (c, u) => { const k = c.categoryOf(u); return k === 'basic' || k === 'arte'; };
const held = (c) => [...c.hand, ...c.reserve].filter(Boolean);
const where = (c, u) => (c.hand.includes(u) ? { slot: c.hand.indexOf(u) } : { reserve: c.reserve.indexOf(u) });
const playable = (c, u) => c.check(u).ok;

export const LESSON_PACE = {
  gap: 2.0, // seconds of battle time between two lessons
  perBattle: { tutorial: 14, normal: 3 }, // most lessons one battle shows (an upper bound: each needs its moment)
};

export const LESSONS = [
  // ── the first battle, one idea at a time (Lessons 1–4 of the onboarding plan) ──
  {
    key: 'attack', intro: true, title: 'FIRST ATTACK',
    body: 'Tap a <b>basic attack ◆</b> to strike. It hits the enemy in <b>gold brackets</b> — tap an enemy to pick another. The buttons above the hand choose which hero attacks; basic attacks belong to no one.',
    when: (c) => {
      if (c.phase !== 'PRE' || c.combo) return null;
      const u = c.hand.find((x) => x && c.categoryOf(x) === 'basic' && playable(c, x));
      return u ? where(c, u) : null;
    },
  },
  {
    key: 'enemies', intro: true, need: ['attack'], title: 'ENEMY TURNS',
    body: 'Enemies act on their own clock. The bar under each one fills; its bubble shows the next move and its damage, and a <b>red ring</b> marks the hero it will hit. They keep acting while you choose.',
    when: (c) => { const e = c.aliveEnemies().find((x) => x.intent && x.intent.dmg > 0 && x.atb >= 0.5); return e ? { enemy: e.uid } : null; },
  },
  {
    key: 'ranks', intro: true, need: ['attack'], title: 'RISING RANKS',
    body: 'Keep the combo going: each next attack needs a <b>higher rank</b> — Weak 1, Medium 2, Strong 3 — and skipping a rank is fine. Cards that cannot follow are dimmed and say why. Basic attacks earn <b>Momentum</b> when they land.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || !c.combo) return null;
      const P = c.proj();
      if (!P.open || P.cards < 1 || P.lastCmd === 'relay') return null;
      const u = c.hand.find((x) => x && c.categoryOf(x) === 'basic' && playable(c, x));
      return u ? where(c, u) : { ui: 'momentum' };
    },
  },
  {
    key: 'queue', intro: true, need: ['ranks'], title: 'NO NEED TO WAIT',
    body: 'Tap your next card while an attack plays out: it <b>waits in the queue</b> (dashed) and runs in order. <b>Flow holds</b> while attacks play out, so watching costs no time.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || !c.executing || c.queue.length) return null;
      const u = held(c).find((x) => offensive(c, x) && playable(c, x));
      return u ? where(c, u) : null;
    },
  },
  {
    key: 'arte', intro: true, need: ['attack'], title: 'ARTE ★',
    body: 'This hero\'s <b>arte ★</b> is ready. An arte belongs to one hero, needs a basic attack earlier in that hero\'s part of the combo, and costs the <b>Momentum</b> in its corner.',
    when: (c) => {
      if (c.phase !== 'ACTIVE') return null;
      const u = held(c).find((x) => c.categoryOf(x) === 'arte' && playable(c, x));
      return u ? where(c, u) : null;
    },
  },
  {
    key: 'finish', intro: true, need: ['arte'], title: 'FINISH: A PERFECT',
    body: 'A combo that ends on an arte can be closed with <b>FINISH</b>: a <b>PERFECT</b> gives +2 Momentum and a Churn charge. If Flow runs out right after an arte, it still counts as a Perfect.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || !c.combo) return null;
      const P = c.proj();
      return P.last === 'arte' && P.lastCmd === 'card' && c.finishable('perfect', P) ? { ui: 'cash' } : null;
    },
  },
  {
    key: 'cancel', intro: true, need: ['queue'], title: 'TAKE IT BACK',
    body: 'Changed your mind? Tap a <b>waiting</b> card — its dashed chip or its placeholder in the hand — to take it back; its Momentum returns. A card that has started always finishes.',
    when: (c) => (c.queue.some((q) => q.type === 'card' && q.zone === 'hand') ? { ui: 'queueWait' } : null),
  },
  // ── Lesson 5: Relay, when another hero can usefully take over with time to spare ──
  {
    key: 'relay', intro: true, need: ['arte'], title: 'RELAY ⇄',
    body: 'Hand this combo to the hero marked <b>⇄</b>: tap their button. They start again from a basic attack, then their arte; the combo keeps everything it has built, gains +1 Momentum, and their first attack hits harder. Each hero joins a combo once.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || !c.combo) return null;
      if (!(c.flowHeld() || c.flowLeft() >= 2.5)) return null;
      for (const id of ['V', 'C', 'S']) {
        if (!c.relayCheck(id).ok) continue;
        if (held(c).some((u) => c.categoryOf(u) === 'arte' && c.def(u).owner === id && !c.isLocked(u))) return { hero: id };
      }
      return null;
    },
  },
  {
    key: 'stumble', intro: true, title: 'STUMBLE',
    body: 'That card could not follow — the reason is written on it. A wrong tap during a combo costs 0.4s of Flow and 1 Momentum; three in one combo end it.',
    when: (c) => (c.combo && c.combo.stumbles > 0 ? { ui: 'flow' } : null),
  },
  {
    key: 'tactical', need: ['ranks'], title: 'TOO LITTLE TIME?',
    body: 'That combo was <b>Dropped</b>. If choosing feels rushed, <b>Tactical timing</b> (Settings) slows enemies to a quarter while you pick your next card in a combo. It changes nothing else, and it is off unless you turn it on.',
    when: (c, x) => {
      if (x.tactical || c.combo || c.phase === 'END') return null;
      const last = c.history[c.history.length - 1];
      return last && last.type === 'forced' ? { ui: 'flow' } : null;
    },
  },
  // ── Lesson 6: Recovery and support ──
  {
    key: 'recovery', intro: true, need: ['attack'], title: 'RECOVERY',
    body: 'After their part of a combo a hero <b>recovers</b> for a moment — the bar on their button (1.5s + 0.3s per card; 2s after support). The others can act meanwhile; enemies do not wait.',
    when: (c, x) => {
      if (c.phase === 'END') return null;
      if (!x.flags.busyTap && !c.history.length) return null;
      const p = c.party.find((h) => c.heroState(h.id) === 'RECOVERING' && c.recoverLeft(h.id) > 0.6);
      return p ? { hero: p.id } : null;
    },
  },
  {
    key: 'support', intro: true, need: ['attack'], title: 'SUPPORT ✚',
    body: '<b>Support</b> heals, guards or helps — at any time, even during another hero\'s combo, without touching it. The hero who performs it recovers for 2s afterwards.',
    when: (c) => {
      const pressed = c.hp < c.maxHp * 0.9 || c.aliveEnemies().some((e) => e.intent && e.intent.dmg > 0 && e.atb >= 0.5);
      if (!pressed) return null;
      const u = held(c).find((x) => c.categoryOf(x) === 'support' && playable(c, x));
      return u ? where(c, u) : null;
    },
  },
  {
    key: 'cover', need: ['support'], title: 'COVER',
    body: 'Hessa\'s Guard cards make her <b>cover</b> the party for 4s: hits aimed at Corvin or Pin land on her instead, softened by her 30% Defense.',
    when: (c) => (c.coverActive() ? { fieldHero: 'V' } : null),
  },
  // ── Lesson 7: the hand ──
  {
    key: 'churn', intro: true, need: ['attack'], title: 'CHURN',
    body: '<b>Swipe a card down</b> to Churn it: the card shown as <b>NEXT CARD</b> takes its place. It uses a charge (charges refill over time); when nothing in your hand can be played, Churn is free.',
    when: (c) => {
      if (c.phase !== 'PRE' || c.combo) return null;
      if (c.stranded()) return { ui: 'hand' };
      if (c.churn.charges < 1 || c.churnJamUntil > c.t) return null;
      const junk = c.hand.find((u) => u && c.categoryOf(u) === 'junk');
      if (junk) return where(c, junk);
      // a hand that cannot start a combo with a basic attack, after the first few combos
      if (c.history.length < 2 || c.hand.some((u) => u && c.categoryOf(u) === 'basic' && !c.isLocked(u))) return null;
      const u = c.hand.find((x) => x && c.categoryOf(x) === 'arte' && !c.isLocked(x));
      return u ? where(c, u) : null;
    },
  },
  {
    key: 'reserve', intro: true, need: ['attack'], title: 'RESERVE',
    body: '<b>Swipe a card up</b> to keep it in <b>Reserve</b> (2 slots). It stays out of the hand until you play it — an arte saved for its hero\'s next combo, for instance.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || !c.history.length || c.reserve.length >= c.reserveMax() || c.reserveLatchUntil > c.t) return null;
      const P = c.proj();
      if (!P.open) return null;
      const u = c.hand.find((x) => x && c.categoryOf(x) === 'arte' && c.def(x).owner !== P.hero && !c.isLocked(x) && !c.relayCheck(c.def(x).owner).ok && c.canStash(x));
      return u ? where(c, u) : null;
    },
  },
  // ── Lesson 8: decisions that matter by the Act I boss (also shown to returning players) ──
  {
    key: 'cashout', late: true, need: ['ranks'], title: 'CASH OUT',
    body: 'Low on Flow? <b>CASH OUT</b> ends the combo now for a payout (more with 2.5s+ Flow left). A combo that runs out after a basic attack is <b>Dropped</b>: no payout and −2 Momentum.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || c.executing || c.flowHeld() || c.flowLeft() >= 2.2) return null;
      const P = c.proj();
      return P.last === 'basic' && c.finishable('cashout', P) ? { ui: 'cash' } : null;
    },
  },
  {
    key: 'lateRelay', late: true, need: ['relay'], title: 'LITTLE FLOW LEFT',
    body: 'A Relay now may not leave the next hero time for a basic attack and an arte. <b>FINISH</b> banks this Perfect — finishing early is often the right call.',
    when: (c) => {
      if (c.phase !== 'ACTIVE' || c.flowHeld() || c.flowLeft() >= 1.6) return null;
      const P = c.proj();
      if (P.last !== 'arte' || P.lastCmd !== 'card' || !c.finishable('perfect', P)) return null;
      return ['V', 'C', 'S'].some((id) => c.relayCheck(id).ok) ? { ui: 'cash' } : null;
    },
  },
  {
    key: 'bigHit', late: true, need: ['enemies'], title: 'HEAVY HIT',
    body: 'A heavy attack is winding up: the red ring and ▼ show the damage after that hero\'s Defense. <b>Guard</b> absorbs it, <b>Hold the Line</b> braces a hero, and Hessa\'s Cover takes it on her shield.',
    when: (c) => {
      for (const e of c.aliveEnemies()) {
        const it = e.intent;
        if (!it || !it.dmg || it.kind !== 'atk' || !it.target || e.atb < 0.55) continue;
        if (c.mitigate(e, it.dmg, c.hitTarget(it.target), {}) >= 11) return { enemy: e.uid };
      }
      return null;
    },
  },
  {
    key: 'area', late: true, need: ['enemies'], title: 'HITS EVERY HERO',
    body: 'This attack hits <b>all three heroes</b>. The bubble shows the hit on each; each hero\'s Defense reduces their part, and Guard absorbs the total once.',
    when: (c) => { const e = c.aliveEnemies().find((x) => x.intent && x.intent.kind === 'aoe' && x.intent.dmg > 0 && x.atb >= 0.5); return e ? { enemy: e.uid } : null; },
  },
  {
    key: 'summon', late: true, title: 'SUMMONS',
    body: 'A new enemy joined the fight. Summons are small but hit often: <b>tap one</b> to make it your target, or race the summoner — the gold brackets decide who your attacks hit.',
    when: (c) => { const e = c.aliveEnemies().find((x) => x.summoned); return e ? { enemy: e.uid } : null; },
  },
  {
    key: 'enemyGuard', late: true, title: 'ENEMY GUARD',
    body: 'This enemy is shielded: its <b>Guard</b> (the number on its bar) absorbs your hits until it breaks. Big hits break it; cards that <b>Pierce</b> ignore it.',
    when: (c) => { const e = c.aliveEnemies().find((x) => x.guard >= 10); return e ? { enemy: e.uid } : null; },
  },
  {
    key: 'drain', late: true, title: 'FLOW THEFT',
    body: 'This enemy is about to <b>steal Flow</b> from your combo (hourglass bubble; the red part of the Flow bar). Finish or Cash Out before it acts, or keep a second to spare.',
    when: (c) => {
      if (!c.combo) return null;
      const e = c.aliveEnemies().find((x) => x.intent && x.intent.kind === 'drain' && x.atb >= 0.5);
      return e ? { ui: 'flow' } : null;
    },
  },
  {
    key: 'boss', late: true, title: 'BOSS',
    body: 'Bosses change phase (banner) and adapt to your habits. Read each intent bubble, end combos before big hits, Churn dead cards between combos, and keep Guard for the heavy blows.',
    when: (c, x) => (x.kind === 'boss' && c.t < 4 && c.aliveEnemies()[0] ? { enemy: c.aliveEnemies()[0].uid } : null),
  },
  // ── Phase 7: the first EX Combo ──
  {
    key: 'exCombo', title: 'EX COMBO',
    body: 'That sequence was an <b>EX Combo</b>: a recipe made of cards and actions you already use, with an extra effect on top. There are more to find. The Museum\'s <b>Combo Journal</b> records every one you discover and how to repeat it.',
    when: (c, x) => (x.exKnown > 0 && !x.exBanner ? { ui: 'none' } : null), // once the EX banner has had its moment
  },
  // ── interference, the first time each happens ──
  {
    key: 'lock', title: 'CARD LOCKED',
    body: 'An enemy <b>Locked</b> a card (chain icon). A Lock shows its source and expires when its timer runs out — even between combos. Cards already queued are never locked.',
    when: (c) => { const u = c.hand.find((x) => x && c.isLocked(x)); return u ? where(c, u) : null; },
  },
  {
    key: 'scramble', title: 'SCRAMBLED',
    body: 'A <b>Scramble</b> changed a card\'s rank or suit for a few seconds (glitch stripes). The card shows its current values.',
    when: (c) => { const u = c.hand.find((x) => x && c.isScrambled(x)); return u ? where(c, u) : null; },
  },
  {
    key: 'jam', title: 'SLOT JAMMED',
    body: 'Static jammed a hand slot: no card can fill it until the static clears.',
    when: (c) => { for (let i = 0; i < c.hand.length; i++) if (c.slotJammed(i)) return { slot: i }; return null; },
  },
  {
    key: 'glitch', title: 'GLITCH CARDS',
    body: 'Glitch cards were shuffled into your deck. They cannot be played — <b>swipe them down</b> to delete them for free.',
    when: (c) => { const u = c.hand.find((x) => x && c.categoryOf(x) === 'junk'); return u ? where(c, u) : null; },
  },
  {
    key: 'latch', title: 'RESERVE LATCHED',
    body: 'A Latch Wisp grabbed your Reserve: it steals a stored card, or seals the Reserve for a few seconds.',
    when: (c) => (c.reserveLatchUntil > c.t ? { ui: 'reserve' } : null),
  },
];

export const LESSON_KEYS = LESSONS.map((l) => l.key);
// Lessons a player who finished the earlier (0.2.5) tutorial has already been taught.
export const INTRO_KEYS = LESSONS.filter((l) => l.intro).map((l) => l.key);
const OLD_TUTORIAL = ['start', 'opened', 'closer', 'afterCombo', 'relay'];

// Returning players: anyone who finished the first battle, or saw the earlier tutorial cards, has the
// introductory lessons marked as seen (once; replaying hints from Settings clears them on purpose).
export function migrateLessons(meta) {
  if (meta.lessonsMigrated) return false;
  meta.lessonsMigrated = true;
  const tut = meta.tut || (meta.tut = {});
  if (!meta.tutorialDone && !OLD_TUTORIAL.some((k) => tut[k])) return false;
  for (const k of INTRO_KEYS) tut[k] = true;
  return true;
}

// The first lesson that is relevant now and not seen yet, or null. `x`: { seen: Set or object of
// seen keys, flags: { busyTap }, kind: 'normal' | 'elite' | 'boss', tutorial: the first battle,
// tactical: Tactical timing is on, exKnown: EX Combos in the Combo Journal, exBanner: an EX banner is showing }.
export function pickLesson(c, x) {
  if (!c || c.phase === 'END') return null;
  const seen = (k) => (x.seen instanceof Set ? x.seen.has(k) : !!(x.seen && x.seen[k]));
  for (const L of LESSONS) {
    if (seen(L.key)) continue;
    if (L.late && x.tutorial) continue;
    if (L.need && !L.need.every(seen)) continue;
    const anchor = L.when(c, x);
    if (anchor) return { lesson: L, anchor };
  }
  return null;
}
