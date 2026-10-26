// Events: each choice has a real mechanical outcome applied through the run API (engine/run.js RunAPI).
// A choice may return { text, select: { title, filter, action } } to ask the player to pick a card.
// Selection actions: remove | upgrade | transform | duplicate | recut | graft:<id> | ex | rankup | rankdown

export const EVENTS = [
  // ───────────── ACT I ─────────────
  {
    id: 'tutorial_kiosk', acts: [1], title: 'The Tutorial Kiosk', art: 'kiosk',
    text: 'A coin-op kiosk blinks "LEARN TO RELAY!" in a font nobody licensed. Its tutorial video is 40 minutes long. Its coin slot is very inviting.',
    choices: [
      { label: 'Insert 25 Scrap', hint: 'Upgrade a random card.', req: (R) => R.scrap >= 25 || 'Need 25 Scrap', run: (R) => { R.spend(25); const c = R.upgradeRandom(1); return { text: c.length ? `The kiosk plays a 3-second clip that is somehow useful. ${c[0]} upgraded.` : 'Nothing left to teach you.' }; } },
      { label: 'Smash it', hint: 'Gain 40 Scrap. Hessa takes 8 damage.', run: (R) => { R.gain(40); R.hurt('V', 8); return { text: 'Hessa punches the kiosk. Coins and one tooth (hers?) clatter out.' }; } },
      { label: 'Walk away', hint: 'Nothing happens.', run: () => ({ text: 'Granraku: "I have seen enough tutorials for one lifetime."' }) },
    ],
  },
  {
    id: 'discard_belt', acts: [1, 2], title: 'Conveyor of Discards', art: 'belt',
    text: 'A conveyor drags rejected cards toward an incinerator. Some of them look... fine, actually. Ozmund\'s voice crackles: "Those were CUT for a REASON."',
    choices: [
      { label: 'Grab one', hint: 'Choose 1 of 3 cards to add.', run: (R) => R.offerCards(3, 'common') },
      { label: 'Grab the whole stack', hint: 'Add 2 random cards. A random ally loses 5 max HP.', run: (R) => { const a = R.addRandomCards(2); const who = R.loseMaxHpRandom(5); return { text: `You haul ${a.join(' and ')} off the belt. ${who} strained something structural.` }; } },
      { label: 'Throw one in', hint: 'Remove a card from your deck.', run: () => ({ text: 'Pick something to feed the fire.', select: { title: 'Remove a card', filter: 'removable', action: 'remove' } }) },
    ],
  },
  {
    id: 'save_point', acts: [1], title: 'Abandoned Save Point', art: 'save',
    text: 'A crystal hums with "SAVE?" in three languages, two of them invented. A sticky note reads: "do not use, corrupts relics :) - O."',
    choices: [
      { label: 'Rest at it', hint: 'Heal every ally 25% of max HP.', run: (R) => { R.healPct(0.25); return { text: 'Warm light. Your progress bar feels respected.' }; } },
      { label: 'Corrupt the save', hint: 'Gain a random relic. A random card loses 1 rank... or gains it.', run: (R) => { const r = R.addRandomRelic(); const c = R.mutateRandomRank(); return { text: `The crystal coughs up ${r}. ${c}` }; } },
    ],
  },
  {
    id: 'patch_notes', acts: [1, 2, 3], title: 'Patch Notes v0.3.1', art: 'notes',
    text: 'A floating scroll unrolls: "BALANCE CHANGES: Relay is now worse (it was already bad?). Fixed a bug where players had fun." It offers to apply a hotfix to you.',
    choices: [
      { label: 'Accept the nerf', hint: 'Remove a card. Gain 30 Scrap.', run: (R) => { R.gain(30); return { text: 'Ozmund: "See? Healthy for the meta."', select: { title: 'Nerf (remove) a card', filter: 'removable', action: 'remove' } }; } },
      { label: 'Request a rework', hint: 'Transform a card into a random card of the same role.', run: () => ({ text: 'The scroll sighs and rewrites a card.', select: { title: 'Rework a card', filter: 'transformable', action: 'transform' } }) },
      { label: 'Mark as "won\'t fix"', hint: 'Nothing happens.', run: () => ({ text: 'Granraku: "Classic."' }) },
    ],
  },
  {
    id: 'rust_oracle', acts: [1, 2], title: 'The Rust Oracle', art: 'oracle',
    text: 'An automaton made entirely of rust offers surgery. "Payment: a little blood. Or a lot of oil. We are out of oil."',
    choices: [
      { label: 'Pay in blood', hint: 'Each ally loses 5 HP. Graft a card (choice of 3 grafts).', run: (R) => { R.hurtAll(5); return R.offerGraft(); } },
      { label: 'Ask for a reading', hint: 'Upgrade a card of your choice. Lose 20 Scrap.', req: (R) => R.scrap >= 20 || 'Need 20 Scrap', run: (R) => { R.spend(20); return { text: '"Your future... has a +2 in it."', select: { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade' } }; } },
      { label: 'Leave', hint: 'Nothing happens.', run: () => ({ text: 'The Oracle flakes away, offended.' }) },
    ],
  },
  {
    id: 'vending', acts: [1, 3], title: 'Broken Vending Machine', art: 'vending',
    text: 'A vending machine full of relics. The OUT OF ORDER sign is load-bearing. Hessa cracks her knuckles.',
    choices: [
      { label: 'Kick it (Hessa -6 HP)', hint: '40% chance for a relic. Can be repeated.', req: (R) => R.hp('V') > 6 || 'Hessa is too hurt', run: (R) => { R.hurt('V', 6); if (R.rng.chance(0.4)) { const r = R.addRandomRelic(); return { text: `CLUNK. ${r} drops out.`, repeat: false }; } return { text: 'The machine rattles smugly.', repeat: true }; } },
      { label: 'Pay 60 Scrap', hint: 'Gain a random relic.', req: (R) => R.scrap >= 60 || 'Need 60 Scrap', run: (R) => { R.spend(60); return { text: `It works perfectly. Suspicious. You get ${R.addRandomRelic()}.` }; } },
      { label: 'Leave', hint: 'Nothing happens.', run: () => ({ text: 'Pin: "We could have been heroes."' }) },
    ],
  },
  {
    id: 'cable_garden', acts: [1, 2, 3], title: 'Cable Garden', art: 'garden',
    text: 'Someone planted cables in neat rows and they grew. Soft blue current drips from the leaves.',
    choices: [
      { label: 'Drink the current', hint: 'Heal every ally 10 HP.', run: (R) => { R.healFlat(10); return { text: 'Corvin: "Tastes like a battery. In a good way."' }; } },
      { label: 'Prune a card', hint: 'Remove a card. Each ally loses 4 HP.', run: (R) => { R.hurtAll(4); return { text: 'The vines take their payment.', select: { title: 'Remove a card', filter: 'removable', action: 'remove' } }; } },
    ],
  },

  // ───────────── ACT II ─────────────
  {
    id: 'mech_archive', acts: [2], title: 'Mechanical Archive', art: 'archive',
    text: 'Endless drawers of design documents. One is labelled "RELAY - DELETE?". It was never deleted.',
    choices: [
      { label: 'Study', hint: 'Upgrade 2 random cards.', run: (R) => { const u = R.upgradeRandom(2); return { text: u.length ? `You learn things about ${u.join(' and ')} the designer never intended.` : 'You already know everything here.' }; } },
      { label: 'Read the Relay doc', hint: 'Story. Gain a Relay-focused card choice.', run: (R) => { R.flag('readRelayDoc'); const o = R.offerCards(3, null, 'relay'); o.text = 'The doc says: "if three heroes pass the turn like a baton, it might feel like a team." Then: "too complex, cut." Granraku reads it twice.'; return o; } },
      { label: 'Burn it', hint: 'Gain 55 Scrap.', run: (R) => { R.gain(55); return { text: 'Ozmund, quietly: "...that was my favorite drawer."' }; } },
    ],
  },
  {
    id: 'duplicate_bug', acts: [2, 3], title: 'Duplicate Bug', art: 'dupe',
    text: 'A shimmering tear in the floor clones anything you drop into it. Mostly. It once cloned a chair into a slightly sadder chair.',
    choices: [
      { label: 'Clone a card', hint: 'Duplicate a card. The copy gets a random suit.', run: () => ({ text: 'The tear ripples.', select: { title: 'Duplicate a card', filter: 'any', action: 'duplicate' } }) },
      { label: 'Clone your Scrap', hint: '50%: double your Scrap (max +80). 50%: lose 30.', run: (R) => { if (R.rng.chance(0.5)) { const g = Math.min(80, R.scrap); R.gain(g); return { text: `Exploit confirmed. +${g} Scrap.` }; } R.spend(Math.min(30, R.scrap)); return { text: 'The tear eats the Scrap and burps.' }; } },
      { label: 'Report the bug', hint: 'Gain 25 Scrap.', run: (R) => { R.gain(25); return { text: 'Ozmund: "Thank you for your report. It will be ignored."' }; } },
    ],
  },
  {
    id: 'signal_choir', acts: [2], title: 'The Signal Choir', art: 'choir',
    text: 'Three broken speakers sing the battle theme a half-step apart. It is, somehow, beautiful.',
    choices: [
      { label: 'Harmonize', hint: 'Every ally heals 15 HP.', run: (R) => { R.healFlat(15); return { text: 'The party hums along. Even Hessa.' }; } },
      { label: 'Record it', hint: 'Gain Echo-themed relic if you lack it, else 40 Scrap.', run: (R) => { if (!R.hasRelic('echo_splice')) { R.addRelic('echo_splice'); return { text: 'You capture the echo. Gained Echo Splice.' }; } R.gain(40); return { text: 'You already have one. You sell the bootleg for 40 Scrap.' }; } },
    ],
  },
  {
    id: 'dev_door', acts: [2], title: 'The Dev Room Door', art: 'door', story: true,
    text: 'A door marked STAFF ONLY. Behind it: Ozmund Lurr, in a turtleneck, surrounded by mugs. "You\'re not supposed to be here. Nobody\'s supposed to be ANYWHERE. Nobody PLAYS this."',
    choices: [
      { label: '"Relay is good, actually."', hint: 'Story. Ozmund grumbles. Upgrade a card of your choice.', run: (R) => { R.flag('praisedRelay'); return { text: 'Ozmund stares. "...Which part." Granraku tells him. For twenty minutes. Ozmund takes notes on a napkin.', select: { title: 'Upgrade a card', filter: 'upgradable', action: 'upgrade' } }; } },
      { label: 'Exploit his dev console', hint: 'Gain a random rare card. Next battle enemies have +20% HP.', run: (R) => { R.flag('exploitedConsole'); R.setNextBattleMod({ hpMult: 1.2 }); const c = R.addRandomCards(1, 'rare'); return { text: `You type "give rare". You get ${c[0]}. Ozmund: "THAT IS NOT A FEATURE."` }; } },
      { label: 'Report a bug and leave', hint: 'Gain 50 Scrap.', run: (R) => { R.gain(50); return { text: '"A bounty? For QA? ...Fine. Take it. Leave."' }; } },
    ],
  },
  {
    id: 'variant_press', acts: [2, 3], title: 'The Suit Press', art: 'press',
    text: 'A hydraulic press stamps suits onto blank cards. A/B/EX. The EX die is cracked, but still works if you pay.',
    choices: [
      { label: 'Recut a suit (free)', hint: 'Switch a card between A and B.', run: () => ({ text: 'KA-CHUNK.', select: { title: 'Recut a card', filter: 'recuttable', action: 'recut' } }) },
      { label: 'Stamp EX (45 Scrap)', hint: 'Make a card EX.', req: (R) => R.scrap >= 45 || 'Need 45 Scrap', run: (R) => { R.spend(45); return { text: 'The cracked die bites down.', select: { title: 'Make a card EX', filter: 'notEX', action: 'ex' } }; } },
      { label: 'Leave', hint: 'Nothing happens.', run: () => ({ text: 'The press keeps stamping nothing, forever.' }) },
    ],
  },
  {
    id: 'unfinished_npc', acts: [2, 3], title: 'The Unfinished NPC', art: 'npc',
    text: 'A character with no texture and one line of dialogue: "TRADE?" It holds out something shiny.',
    choices: [
      { label: 'Trade a card for a relic', hint: 'Remove a card of your choice. Gain a random relic.', run: (R) => { const r = R.addRandomRelic(); return { text: `It hands you ${r}. "TRADE." It seems happy.`, select: { title: 'Give a card', filter: 'removable', action: 'remove' } }; } },
      { label: 'Give it a name', hint: 'Story. Heal every ally 8.', run: (R) => { R.flag('namedNPC'); R.healFlat(8); return { text: 'Pin names it "Gerald". Gerald says "TRADE?" with new dignity.' }; } },
    ],
  },

  // ───────────── ACT III ─────────────
  {
    id: 'core_dump', acts: [3], title: 'Core Dump', art: 'dump',
    text: 'A pile of memory spills across the floor: half-loaded relics, deleted cards, a developer\'s grocery list.',
    choices: [
      { label: 'Dig through it', hint: 'Every ally loses 10% max HP. Gain 2 random relics.', run: (R) => { R.loseMaxHpPctAll(0.1); const a = R.addRandomRelic(); const b = R.addRandomRelic(); return { text: `You surface with ${a} and ${b}, and a little less of yourselves.` }; } },
      { label: 'Take one thing', hint: 'Gain a random relic.', run: (R) => ({ text: `You take ${R.addRandomRelic()} and leave the grocery list. (It says "more mugs".)` }) },
    ],
  },
  {
    id: 'recursive_merchant', acts: [3], title: 'Recursive Merchant', art: 'merchant',
    text: 'A merchant who sells merchants. Inside the smallest one is a single relic, offered as an exchange.',
    choices: [
      { label: 'Trade a relic for two', hint: 'Lose a random relic (not your starter). Gain 2 random relics.', req: (R) => R.tradeableRelics() > 0 || 'No relic to trade', run: (R) => { const lost = R.loseRandomRelic(); const a = R.addRandomRelic(); const b = R.addRandomRelic(); return { text: `You hand over ${lost}. Out come ${a} and ${b}.` }; } },
      { label: 'Buy a card (40 Scrap)', hint: 'Choose 1 of 3 uncommon+ cards.', req: (R) => R.scrap >= 40 || 'Need 40 Scrap', run: (R) => { R.spend(40); return R.offerCards(3, 'uncommon'); } },
      { label: 'Leave', hint: 'Nothing happens.', run: () => ({ text: 'The merchant folds itself away.' }) },
    ],
  },
  {
    id: 'dev_confession', acts: [3], title: 'Ozmund\'s Confession', art: 'door', story: true,
    text: 'Ozmund sits on a broken server, mug empty. "Relay was the first thing I made. Then the publisher said it was too hard to explain, and I buried it under all this... stuff. You found it anyway."',
    choices: [
      { label: 'Encourage him', hint: 'Story. Fully heal the party.', run: (R) => { R.flag('encouragedDev'); R.healPct(1); return { text: 'Granraku: "It\'s the best thing in here. Ship that." Ozmund laughs, the first real laugh in the whole game.' }; } },
      { label: 'Critique the rest', hint: 'Story. Upgrade 3 random cards.', run: (R) => { R.flag('critiquedDev'); const u = R.upgradeRandom(3); return { text: `Granraku lists every problem. Ozmund patches three of them on the spot: ${u.join(', ') || 'nothing left to patch'}.` }; } },
    ],
  },
  {
    id: 'frozen_frame', acts: [3], title: 'Frozen Frame', art: 'frame',
    text: 'Time has stopped in this room, mid-explosion. You can walk between the sparks.',
    choices: [
      { label: 'Steal a moment', hint: 'Graft "Quick" onto a card.', run: () => ({ text: 'You pocket a fraction of a second.', select: { title: 'Graft Quick', filter: 'graftable', action: 'graft:quick' } }) },
      { label: 'Rest in the stillness', hint: 'Every ally heals 20% max HP.', run: (R) => { R.healPct(0.2); return { text: 'Nothing moves. For once, neither do you.' }; } },
    ],
  },
  {
    id: 'echo_chamber_event', acts: [2, 3], title: 'Whispering Hall', art: 'hall',
    text: 'Every word spoken here repeats forever, a little quieter each time. Corvin is delighted.',
    choices: [
      { label: 'Teach a card to echo', hint: 'Graft "Echoing" onto a card.', run: () => ({ text: 'The card hums with its own reflection.', select: { title: 'Graft Echoing', filter: 'graftable', action: 'graft:echoing' } }) },
      { label: 'Shout for Scrap', hint: 'Gain 35 Scrap.', run: (R) => { R.gain(35); return { text: '"SCRAP!" ... scrap ... scrap ... Coins rain from the vents.' }; } },
    ],
  },
  {
    id: 'last_checkpoint', acts: [3], title: 'The Last Checkpoint', art: 'save',
    text: 'A checkpoint flag, slightly on fire. Beyond it the map simply stops being drawn.',
    choices: [
      { label: 'Touch the flag', hint: 'Every ally heals 40% max HP.', run: (R) => { R.healPct(0.4); return { text: 'CHECKPOINT REACHED. The music swells, then glitches, then recovers.' }; } },
      { label: 'Pull the flag up', hint: 'Gain 90 Scrap.', run: (R) => { R.gain(90); return { text: 'The flagpole is solid brass. Very sellable.' }; } },
    ],
  },
  {
    id: 'stray_pack', acts: [1, 2, 3], title: 'Stray Booster Pack', art: 'pack',
    text: 'An unopened booster pack lies in the dust. "SIGNAL//BREAK: COLLECTOR\'S EDITION". There is only one edition.',
    choices: [
      { label: 'Open it', hint: 'Add 3 random cards (one is rare).', run: (R) => { const a = R.addRandomCards(2); const b = R.addRandomCards(1, 'rare'); return { text: `Inside: ${[...a, ...b].join(', ')}.` }; } },
      { label: 'Sell it sealed', hint: 'Gain 45 Scrap.', run: (R) => { R.gain(45); return { text: 'Mint condition. A collector would weep.' }; } },
    ],
  },
  {
    id: 'grease_monkey', acts: [1, 2, 3], title: 'Grease Monkey Bench', art: 'bench',
    text: 'A workbench with a sign: "FREE TUNE-UPS (one per customer) (customers: 0)".',
    choices: [
      { label: 'Re-gauge a card up', hint: 'Raise a card\'s rank by 1.', run: () => ({ text: 'Click-click-click.', select: { title: 'Raise rank', filter: 'rankup', action: 'rankup' } }) },
      { label: 'Re-gauge a card down', hint: 'Lower a card\'s rank by 1.', run: () => ({ text: 'Click... click.', select: { title: 'Lower rank', filter: 'rankdown', action: 'rankdown' } }) },
      { label: 'Plate armor (Hessa)', hint: 'Hessa gains 6 max HP.', run: (R) => { R.gainMaxHp('V', 6); return { text: 'Hessa bolts on a spare boiler plate. Fashion.' }; } },
    ],
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
