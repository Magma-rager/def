// Events: each choice has a real mechanical outcome applied through the run API (engine/run.js RunAPI).
// A choice may return { text, select: { title, filter, action } } to ask the player to pick a card.
// Selection actions: remove | upgrade | transform | duplicate | recut | graft:<id> | ex | rankup | rankdown
//
// Outcome text is language-neutral: run() returns say(key, params) naming one of the choice's
// `results` templates, and params carry ids ({ card }, { relic }, { hero }) rather than names, so the
// saved run never contains display text. src/i18n renders it in the current language.
import { VERSION } from '../version.js';

const say = (k, p) => ({ k, p });
const need = (n) => ({ k: 'Need {n} Scrap', p: { n } });
const card = (id) => ({ card: id });
const cards = (ids) => ({ cards: ids });
const relic = (id) => ({ relic: id });

export const EVENTS = [
  // ───────────── ACT I ─────────────
  {
    id: 'tutorial_kiosk', acts: [1], title: 'The Tutorial Kiosk', art: 'kiosk',
    text: 'A coin-op kiosk blinks "LEARN TO RELAY!" in a font nobody licensed. Its tutorial video is 40 minutes long. Its coin slot is very inviting.',
    choices: [
      { label: 'Insert 25 Scrap', hint: 'Upgrade a random card.', req: (R) => R.scrap >= 25 || need(25),
        results: { ok: 'The kiosk plays a 3-second clip that is somehow useful. {card} upgraded.', none: 'Nothing left to teach you.' },
        run: (R) => { R.spend(25); const c = R.upgradeRandom(1); return { text: c.length ? say('ok', { card: card(c[0]) }) : say('none') }; } },
      { label: 'Smash it', hint: 'Gain 40 Scrap. Hessa takes 8 damage.', results: { ok: 'Hessa punches the kiosk. Coins and one tooth (hers?) clatter out.' }, run: (R) => { R.gain(40); R.hurt('V', 8); return { text: say('ok') }; } },
      { label: 'Walk away', hint: 'Nothing happens.', results: { ok: 'Granraku: "I have seen enough tutorials for one lifetime."' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'discard_belt', acts: [1, 2], title: 'Conveyor of Discards', art: 'belt',
    text: 'A conveyor drags rejected cards toward an incinerator. Some of them look... fine, actually. Ozmund\'s voice crackles: "Those were CUT for a REASON."',
    choices: [
      { label: 'Grab one', hint: 'Choose 1 of 3 cards to add.', results: {}, run: (R) => R.offerCards(3, 'common') },
      { label: 'Grab the whole stack', hint: 'Add 2 random cards. A random ally loses 5 max HP.', results: { ok: 'You haul {cards} off the belt. {hero} strained something structural.' },
        run: (R) => { const a = R.addRandomCards(2); const who = R.loseMaxHpRandom(5); return { text: say('ok', { cards: cards(a), hero: { hero: who } }) }; } },
      { label: 'Throw one in', hint: 'Remove a card from your deck.', results: { ok: 'Pick something to feed the fire.' }, run: () => ({ text: say('ok'), select: { title: 'Remove a card', filter: 'removable', action: 'remove' } }) },
    ],
  },
  {
    id: 'save_point', acts: [1], title: 'Abandoned Save Point', art: 'save',
    text: 'A crystal hums with "SAVE?" in three languages, two of them invented. A sticky note reads: "do not use, corrupts relics :) - O."',
    choices: [
      { label: 'Rest at it', hint: 'Heal every ally 25% of max HP.', results: { ok: 'Warm light. Your progress bar feels respected.' }, run: (R) => { R.healPct(0.25); return { text: say('ok') }; } },
      { label: 'Corrupt the save', hint: 'Gain a random relic. A random card loses 1 rank... or gains it.', results: { ok: 'The crystal coughs up {relic}. {change}' },
        run: (R) => { const r = R.addRandomRelic(); const c = R.mutateRandomRank(); return { text: say('ok', { relic: relic(r), change: { m: c } }) }; } },
    ],
  },
  {
    id: 'patch_notes', acts: [1, 2, 3], title: `Patch Notes v${VERSION}`, art: 'notes',
    text: 'A floating scroll unrolls: "BALANCE CHANGES: Relay is now worse (it was already bad?). Fixed a bug where players had fun." It offers to apply a hotfix to you.',
    choices: [
      { label: 'Accept the nerf', hint: 'Remove a card. Gain 30 Scrap.', results: { ok: 'Ozmund: "See? Healthy for the meta."' }, run: (R) => { R.gain(30); return { text: say('ok'), select: { title: 'Nerf (remove) a card', filter: 'removable', action: 'remove' } }; } },
      { label: 'Request a rework', hint: 'Transform a card into a random card of the same role.', results: { ok: 'The scroll sighs and rewrites a card.' }, run: () => ({ text: say('ok'), select: { title: 'Rework a card', filter: 'transformable', action: 'transform' } }) },
      { label: 'Mark as "won\'t fix"', hint: 'Nothing happens.', results: { ok: 'Granraku: "Classic."' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'rust_oracle', acts: [1, 2], title: 'The Rust Oracle', art: 'oracle',
    text: 'An automaton made entirely of rust offers surgery. "Payment: a little blood. Or a lot of oil. We are out of oil."',
    choices: [
      { label: 'Pay in blood', hint: 'Each ally loses 5 HP. Graft a card (choice of 3 grafts).', results: {}, run: (R) => { R.hurtAll(5); return R.offerGraft(); } },
      { label: 'Ask for a reading', hint: 'Upgrade a card of your choice. Lose 20 Scrap.', req: (R) => R.scrap >= 20 || need(20), results: { ok: '"Your future... has a +2 in it."' }, run: (R) => { R.spend(20); return { text: say('ok'), select: { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade' } }; } },
      { label: 'Leave', hint: 'Nothing happens.', results: { ok: 'The Oracle flakes away, offended.' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'vending', acts: [1, 3], title: 'Broken Vending Machine', art: 'vending',
    text: 'A vending machine full of relics. The OUT OF ORDER sign is load-bearing. Hessa cracks her knuckles.',
    choices: [
      { label: 'Kick it (Hessa -6 HP)', hint: '40% chance for a relic. Can be repeated.', req: (R) => R.hp('V') > 6 || 'Hessa is too hurt', results: { win: 'CLUNK. {relic} drops out.', miss: 'The machine rattles smugly.' },
        run: (R) => { R.hurt('V', 6); if (R.rng.chance(0.4)) { const r = R.addRandomRelic(); return { text: say('win', { relic: relic(r) }), repeat: false }; } return { text: say('miss'), repeat: true }; } },
      { label: 'Pay 60 Scrap', hint: 'Gain a random relic.', req: (R) => R.scrap >= 60 || need(60), results: { ok: 'It works perfectly. Suspicious. You get {relic}.' }, run: (R) => { R.spend(60); return { text: say('ok', { relic: relic(R.addRandomRelic()) }) }; } },
      { label: 'Leave', hint: 'Nothing happens.', results: { ok: 'Pin: "We could have been heroes."' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'cable_garden', acts: [1, 2, 3], title: 'Cable Garden', art: 'garden',
    text: 'Someone planted cables in neat rows and they grew. Soft blue current drips from the leaves.',
    choices: [
      { label: 'Drink the current', hint: 'Heal every ally 10 HP.', results: { ok: 'Corvin: "Tastes like a battery. In a good way."' }, run: (R) => { R.healFlat(10); return { text: say('ok') }; } },
      { label: 'Prune a card', hint: 'Remove a card. Each ally loses 4 HP.', results: { ok: 'The vines take their payment.' }, run: (R) => { R.hurtAll(4); return { text: say('ok'), select: { title: 'Remove a card', filter: 'removable', action: 'remove' } }; } },
    ],
  },

  // ───────────── ACT II ─────────────
  {
    id: 'mech_archive', acts: [2], title: 'Mechanical Archive', art: 'archive',
    text: 'Endless drawers of design documents. One is labelled "RELAY - DELETE?". It was never deleted.',
    choices: [
      { label: 'Study', hint: 'Upgrade 2 random cards.', results: { ok: 'You learn things about {cards} the designer never intended.', none: 'You already know everything here.' },
        run: (R) => { const u = R.upgradeRandom(2); return { text: u.length ? say('ok', { cards: cards(u) }) : say('none') }; } },
      { label: 'Read the Relay doc', hint: 'Story. Gain a Relay-focused card choice.', results: { ok: 'The doc says: "if three heroes pass the turn like a baton, it might feel like a team." Then: "too complex, cut." Granraku reads it twice.' },
        run: (R) => { R.flag('readRelayDoc'); const o = R.offerCards(3, null, 'relay'); o.text = say('ok'); return o; } },
      { label: 'Burn it', hint: 'Gain 55 Scrap.', results: { ok: 'Ozmund, quietly: "...that was my favorite drawer."' }, run: (R) => { R.gain(55); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'duplicate_bug', acts: [2, 3], title: 'Duplicate Bug', art: 'dupe',
    text: 'A shimmering tear in the floor clones anything you drop into it. Mostly. It once cloned a chair into a slightly sadder chair.',
    choices: [
      { label: 'Clone a card', hint: 'Duplicate a card. The copy gets a random suit.', results: { ok: 'The tear ripples.' }, run: () => ({ text: say('ok'), select: { title: 'Duplicate a card', filter: 'any', action: 'duplicate' } }) },
      { label: 'Clone your Scrap', hint: '50%: double your Scrap (max +80). 50%: lose 30.', results: { win: 'Exploit confirmed. +{n} Scrap.', lose: 'The tear eats the Scrap and burps.' },
        run: (R) => { if (R.rng.chance(0.5)) { const g = Math.min(80, R.scrap); R.gain(g); return { text: say('win', { n: g }) }; } R.spend(Math.min(30, R.scrap)); return { text: say('lose') }; } },
      { label: 'Report the bug', hint: 'Gain 25 Scrap.', results: { ok: 'Ozmund: "Thank you for your report. It will be ignored."' }, run: (R) => { R.gain(25); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'signal_choir', acts: [2], title: 'The Signal Choir', art: 'choir',
    text: 'Three broken speakers sing the battle theme a half-step apart. It is, somehow, beautiful.',
    choices: [
      { label: 'Harmonize', hint: 'Every ally heals 15 HP.', results: { ok: 'The party hums along. Even Hessa.' }, run: (R) => { R.healFlat(15); return { text: say('ok') }; } },
      { label: 'Record it', hint: 'Gain Echo-themed relic if you lack it, else 40 Scrap.', results: { got: 'You capture the echo. Gained {relic}.', sold: 'You already have one. You sell the bootleg for 40 Scrap.' },
        run: (R) => { if (!R.hasRelic('echo_splice')) { R.addRelic('echo_splice'); return { text: say('got', { relic: relic('echo_splice') }) }; } R.gain(40); return { text: say('sold') }; } },
    ],
  },
  {
    id: 'dev_door', acts: [2], title: 'The Dev Room Door', art: 'door', story: true,
    text: 'A door marked STAFF ONLY. Behind it: Ozmund Lurr, in a turtleneck, surrounded by mugs. "You\'re not supposed to be here. Nobody\'s supposed to be ANYWHERE. Nobody PLAYS this."',
    choices: [
      { label: '"Relay is good, actually."', hint: 'Story. Ozmund grumbles. Upgrade a card of your choice.', results: { ok: 'Ozmund stares. "...Which part." Granraku tells him. For twenty minutes. Ozmund takes notes on a napkin.' },
        run: (R) => { R.flag('praisedRelay'); return { text: say('ok'), select: { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade' } }; } },
      { label: 'Exploit his dev console', hint: 'Gain a random rare card. Next battle enemies have +20% HP.', results: { ok: 'You type "give rare". You get {card}. Ozmund: "THAT IS NOT A FEATURE."' },
        run: (R) => { R.flag('exploitedConsole'); R.setNextBattleMod({ hpMult: 1.2 }); const c = R.addRandomCards(1, 'rare'); return { text: say('ok', { card: card(c[0]) }) }; } },
      { label: 'Report a bug and leave', hint: 'Gain 50 Scrap.', results: { ok: '"A bounty? For QA? ...Fine. Take it. Leave."' }, run: (R) => { R.gain(50); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'variant_press', acts: [2, 3], title: 'The Suit Press', art: 'press',
    text: 'A hydraulic press stamps suits onto blank cards. A/B/EX. The EX die is cracked, but still works if you pay.',
    choices: [
      { label: 'Recut a suit (free)', hint: 'Switch a card between A and B.', results: { ok: 'KA-CHUNK.' }, run: () => ({ text: say('ok'), select: { title: 'Recut a card', filter: 'recuttable', action: 'recut' } }) },
      { label: 'Stamp EX (45 Scrap)', hint: 'Make a card EX.', req: (R) => R.scrap >= 45 || need(45), results: { ok: 'The cracked die bites down.' }, run: (R) => { R.spend(45); return { text: say('ok'), select: { title: 'Make a card EX', filter: 'notEX', action: 'ex' } }; } },
      { label: 'Leave', hint: 'Nothing happens.', results: { ok: 'The press keeps stamping nothing, forever.' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'unfinished_npc', acts: [2, 3], title: 'The Unfinished NPC', art: 'npc',
    text: 'A character with no texture and one line of dialogue: "TRADE?" It holds out something shiny.',
    choices: [
      { label: 'Trade a card for a relic', hint: 'Remove a card of your choice. Gain a random relic.', results: { ok: 'It hands you {relic}. "TRADE." It seems happy.' },
        run: (R) => { const r = R.addRandomRelic(); return { text: say('ok', { relic: relic(r) }), select: { title: 'Give a card', filter: 'removable', action: 'remove' } }; } },
      { label: 'Give it a name', hint: 'Story. Heal every ally 8.', results: { ok: 'Pin names it "Gerald". Gerald says "TRADE?" with new dignity.' }, run: (R) => { R.flag('namedNPC'); R.healFlat(8); return { text: say('ok') }; } },
    ],
  },

  // ───────────── ACT III ─────────────
  {
    id: 'core_dump', acts: [3], title: 'Core Dump', art: 'dump',
    text: 'A pile of memory spills across the floor: half-loaded relics, deleted cards, a developer\'s grocery list.',
    choices: [
      { label: 'Dig through it', hint: 'Every ally loses 10% max HP. Gain 2 random relics.', results: { ok: 'You surface with {a} and {b}, and a little less of yourselves.' },
        run: (R) => { R.loseMaxHpPctAll(0.1); const a = R.addRandomRelic(); const b = R.addRandomRelic(); return { text: say('ok', { a: relic(a), b: relic(b) }) }; } },
      { label: 'Take one thing', hint: 'Gain a random relic.', results: { ok: 'You take {relic} and leave the grocery list. (It says "more mugs".)' }, run: (R) => ({ text: say('ok', { relic: relic(R.addRandomRelic()) }) }) },
    ],
  },
  {
    id: 'recursive_merchant', acts: [3], title: 'Recursive Merchant', art: 'merchant',
    text: 'A merchant who sells merchants. Inside the smallest one is a single relic, offered as an exchange.',
    choices: [
      { label: 'Trade a relic for two', hint: 'Lose a random relic (not your starter). Gain 2 random relics.', req: (R) => R.tradeableRelics() > 0 || 'No relic to trade', results: { ok: 'You hand over {lost}. Out come {a} and {b}.' },
        run: (R) => { const lost = R.loseRandomRelic(); const a = R.addRandomRelic(); const b = R.addRandomRelic(); return { text: say('ok', { lost: relic(lost), a: relic(a), b: relic(b) }) }; } },
      { label: 'Buy a card (40 Scrap)', hint: 'Choose 1 of 3 uncommon+ cards.', req: (R) => R.scrap >= 40 || need(40), results: {}, run: (R) => { R.spend(40); return R.offerCards(3, 'uncommon'); } },
      { label: 'Leave', hint: 'Nothing happens.', results: { ok: 'The merchant folds itself away.' }, run: () => ({ text: say('ok') }) },
    ],
  },
  {
    id: 'dev_confession', acts: [3], title: 'Ozmund\'s Confession', art: 'door', story: true,
    text: 'Ozmund sits on a broken server, mug empty. "Relay was the first thing I made. Then the publisher said it was too hard to explain, and I buried it under all this... stuff. You found it anyway."',
    choices: [
      { label: 'Encourage him', hint: 'Story. Fully heal the party.', results: { ok: 'Granraku: "It\'s the best thing in here. Ship that." Ozmund laughs, the first real laugh in the whole game.' }, run: (R) => { R.flag('encouragedDev'); R.healPct(1); return { text: say('ok') }; } },
      { label: 'Critique the rest', hint: 'Story. Upgrade 3 random cards.', results: { ok: 'Granraku lists every problem. Ozmund patches three of them on the spot: {cards}.', none: 'Granraku lists every problem. Ozmund patches three of them on the spot: nothing left to patch.' },
        run: (R) => { R.flag('critiquedDev'); const u = R.upgradeRandom(3); return { text: u.length ? say('ok', { cards: cards(u) }) : say('none') }; } },
    ],
  },
  {
    id: 'frozen_frame', acts: [3], title: 'Frozen Frame', art: 'frame',
    text: 'Time has stopped in this room, mid-explosion. You can walk between the sparks.',
    choices: [
      { label: 'Steal a moment', hint: 'Graft "Quick" onto a card.', results: { ok: 'You pocket a fraction of a second.' }, run: () => ({ text: say('ok'), select: { title: { k: 'Graft {g}', p: { g: { graft: 'quick' } } }, filter: 'graftable', action: 'graft:quick' } }) },
      { label: 'Rest in the stillness', hint: 'Every ally heals 20% max HP.', results: { ok: 'Nothing moves. For once, neither do you.' }, run: (R) => { R.healPct(0.2); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'echo_chamber_event', acts: [2, 3], title: 'Whispering Hall', art: 'hall',
    text: 'Every word spoken here repeats forever, a little quieter each time. Corvin is delighted.',
    choices: [
      { label: 'Teach a card to echo', hint: 'Graft "Echoing" onto a card.', results: { ok: 'The card hums with its own reflection.' }, run: () => ({ text: say('ok'), select: { title: { k: 'Graft {g}', p: { g: { graft: 'echoing' } } }, filter: 'graftable', action: 'graft:echoing' } }) },
      { label: 'Shout for Scrap', hint: 'Gain 35 Scrap.', results: { ok: '"SCRAP!" ... scrap ... scrap ... Coins rain from the vents.' }, run: (R) => { R.gain(35); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'last_checkpoint', acts: [3], title: 'The Last Checkpoint', art: 'save',
    text: 'A checkpoint flag, slightly on fire. Beyond it the map simply stops being drawn.',
    choices: [
      { label: 'Touch the flag', hint: 'Every ally heals 40% max HP.', results: { ok: 'CHECKPOINT REACHED. The music swells, then glitches, then recovers.' }, run: (R) => { R.healPct(0.4); return { text: say('ok') }; } },
      { label: 'Pull the flag up', hint: 'Gain 90 Scrap.', results: { ok: 'The flagpole is solid brass. Very sellable.' }, run: (R) => { R.gain(90); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'stray_pack', acts: [1, 2, 3], title: 'Stray Booster Pack', art: 'pack',
    text: 'An unopened booster pack lies in the dust. "SIGNAL//BREAK: COLLECTOR\'S EDITION". There is only one edition.',
    choices: [
      { label: 'Open it', hint: 'Add 3 random cards (one is rare).', results: { ok: 'Inside: {cards}.' }, run: (R) => { const a = R.addRandomCards(2); const b = R.addRandomCards(1, 'rare'); return { text: say('ok', { cards: cards([...a, ...b]) }) }; } },
      { label: 'Sell it sealed', hint: 'Gain 45 Scrap.', results: { ok: 'Mint condition. A collector would weep.' }, run: (R) => { R.gain(45); return { text: say('ok') }; } },
    ],
  },
  {
    id: 'grease_monkey', acts: [1, 2, 3], title: 'Grease Monkey Bench', art: 'bench',
    text: 'A workbench with a sign: "FREE TUNE-UPS (one per customer) (customers: 0)".',
    choices: [
      { label: 'Re-gauge a card up', hint: 'Raise a card\'s rank by 1.', results: { ok: 'Click-click-click.' }, run: () => ({ text: say('ok'), select: { title: 'Raise rank', filter: 'rankup', action: 'rankup' } }) },
      { label: 'Re-gauge a card down', hint: 'Lower a card\'s rank by 1.', results: { ok: 'Click... click.' }, run: () => ({ text: say('ok'), select: { title: 'Lower rank', filter: 'rankdown', action: 'rankdown' } }) },
      { label: 'Plate armor (Hessa)', hint: 'Hessa gains 6 max HP.', results: { ok: 'Hessa bolts on a spare boiler plate. Fashion.' }, run: (R) => { R.gainMaxHp('V', 6); return { text: say('ok') }; } },
    ],
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
