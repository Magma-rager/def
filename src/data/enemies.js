// Enemy roster. Each enemy has an ATB cycle (actTime seconds per action), a pattern-driven AI that
// chooses its next intent (shown to the player while ATB fills), and intent scripts executed by the
// combat engine through its public enemy API (see engine/combat.js "Enemy API").

const atk = (name, dmg, extra = {}) => ({
  kind: 'atk', name, dmg, desc: `Strike one ally for ${dmg}.`,
  exec: (e, c, it) => c.hitParty(e, it.target, c.edmg(e, dmg), extra),
  ...extra,
});
const aoe = (name, dmg, extra = {}) => ({
  kind: 'aoe', name, dmg, desc: `Hit every ally for ${dmg}.`,
  exec: (e, c) => c.hitAll(e, c.edmg(e, dmg), extra),
  ...extra,
});
const lock = (name, n, dmg = 0) => ({
  kind: 'lock', name, dmg, desc: `Lock ${n} hand card${n > 1 ? 's' : ''} for 3s${dmg ? `, and strike for ${dmg}` : ''}.`,
  exec: (e, c, it) => { c.lockCards(e, n); if (dmg) c.hitParty(e, it.target, c.edmg(e, dmg)); },
});
const scramble = (name, n, mode, dmg = 0) => ({
  kind: 'scramble', name, dmg,
  desc: mode === 'suit' ? `Flip the suit of ${n} hand cards for 5s.` : mode === 'rank' ? `Shift the rank of ${n} hand cards for 5s.` : `Scramble rank and suit of ${n} hand cards for 5s.`,
  exec: (e, c, it) => { c.scrambleCards(e, n, mode); if (dmg) c.hitParty(e, it.target, c.edmg(e, dmg)); },
});
const guardSelf = (name, g) => ({ kind: 'guard', name, desc: `Gain ${g} Guard.`, exec: (e, c) => c.enemyGuard(e, g) });
const guardAll = (name, g) => ({ kind: 'guard', name, desc: `All enemies gain ${g} Guard.`, exec: (e, c) => c.enemies.filter((x) => x.alive).forEach((x) => c.enemyGuard(x, g)) });

// Pattern helper: cycle through keys by action count.
const cycle = (...keys) => (e) => keys[e.actCount % keys.length];

export const ENEMIES = {
  // ─────────────── ACT I — The Scrapworks ───────────────
  rush_hound: {
    name: 'Rush Hound', act: 1, tier: 'normal', hp: 24, actTime: 3.4, art: 'hound', size: 1,
    lore: 'A tutorial enemy that was never told the tutorial ended.',
    intents: {
      bite: atk('Bite', 4),
      pounce: atk('Pounce', 7),
      frenzy: { kind: 'buff', name: 'Frenzy', desc: 'Act 40% faster for 6s.', exec: (e, c) => c.hasteEnemy(e, 1.4, 6) },
    },
    ai: (e, c) => (e.hp < e.maxHp * 0.5 && !e.flags.frenzied ? ((e.flags.frenzied = true), 'frenzy') : cycle('bite', 'bite', 'pounce')(e)),
  },
  wire_jammer: {
    name: 'Wire Jammer', act: 1, tier: 'normal', hp: 28, actTime: 5.4, art: 'jammer', size: 1,
    lore: 'Designed to "add friction". It adds friction.',
    intents: { jam: lock('Jam Signal', 1, 2), zap: atk('Zap', 6) },
    ai: cycle('jam', 'zap'),
  },
  interference_mite: {
    name: 'Interference Mite', act: 1, tier: 'normal', hp: 13, actTime: 4.2, art: 'mite', size: 0.7,
    lore: 'A rounding error with legs.',
    intents: {
      static: { kind: 'jam', name: 'Static', desc: 'Jam one hand slot for 4s (no card can fill it).', exec: (e, c) => c.jamSlot(e, 4) },
      nibble: atk('Nibble', 3),
    },
    ai: cycle('nibble', 'static'),
  },
  iron_maw: {
    name: 'Iron Maw', act: 1, tier: 'normal', hp: 56, actTime: 7.2, art: 'maw', size: 1.25,
    lore: 'A trash compactor promoted to boss, then demoted back.',
    intents: { chomp: atk('Chomp', 12), grind: guardSelf('Grind Plates', 10), crush: aoe('Crush', 5) },
    ai: cycle('chomp', 'grind', 'crush'),
  },
  churn_snare: {
    name: 'Churn Snare', act: 1, tier: 'normal', hp: 32, actTime: 5.4, art: 'snare', size: 1,
    lore: 'Punishes players who reroll. The dev wrote it after a bad review.',
    intents: {
      snare: { kind: 'snare', name: 'Snare Gears', desc: 'Drain 1 Churn charge and jam Churn for 4s.', exec: (e, c) => c.snareChurn(e, 4, 1) },
      lash: atk('Lash', 6),
    },
    ai: cycle('snare', 'lash', 'lash'),
  },

  // ─────────────── ACT II — The Broken Protocol ───────────────
  suit_scrambler: {
    name: 'Suit Scrambler', act: 2, tier: 'normal', hp: 44, actTime: 5.0, art: 'scrambler', size: 1,
    lore: 'Shuffles your intentions. Sometimes your cards too.',
    intents: { flip: scramble('Suit Flip', 2, 'suit'), needle: atk('Needle', 8), reshuffle: scramble('Rank Shuffle', 2, 'rank', 3) },
    ai: cycle('flip', 'needle', 'reshuffle', 'needle'),
  },
  needle_wing: {
    name: 'Needle Wing', act: 2, tier: 'normal', hp: 36, actTime: 4.4, art: 'wing', size: 1, flying: true,
    lore: 'Its flight code was copy-pasted from a fish.',
    intents: { rain: aoe('Needle Rain', 4), dive: atk('Dive', 9) },
    ai: cycle('dive', 'rain'),
  },
  latch_wisp: {
    name: 'Latch Wisp', act: 2, tier: 'normal', hp: 40, actTime: 5.6, art: 'wisp', size: 0.9, flying: true,
    lore: 'Steals what you saved for later. Very relatable.',
    intents: {
      latch: { kind: 'latch', name: 'Latch', desc: 'Pull a card out of Reserve (or seal Reserve for 5s if empty).', exec: (e, c) => c.latchReserve(e) },
      siphon: { kind: 'atk', name: 'Siphon', dmg: 6, desc: 'Strike for 6 and heal 6.', exec: (e, c, it) => { c.hitParty(e, it.target, c.edmg(e, 6)); c.healEnemy(e, 6); } },
    },
    ai: cycle('latch', 'siphon'),
  },
  signal_hound: {
    name: 'Signal Hound', act: 2, tier: 'normal', hp: 42, actTime: 3.9, art: 'hound2', size: 1,
    lore: 'Barks in packets.',
    intents: {
      howl: { kind: 'buff', name: 'Howl', desc: 'Every enemy gains +25% ATB.', exec: (e, c) => c.enemies.filter((x) => x.alive && x !== e).forEach((x) => (x.atb = Math.min(0.95, x.atb + 0.25))) },
      bite: atk('Packet Bite', 6),
    },
    ai: (e, c) => (c.enemies.filter((x) => x.alive).length > 1 && e.actCount % 3 === 1 ? 'howl' : 'bite'),
  },
  bulwark_signal: {
    name: 'Bulwark Signal', act: 2, tier: 'normal', hp: 50, actTime: 6.0, art: 'bulwark', size: 1.15,
    lore: 'A defensive buff that became sentient and smug.',
    intents: { pulse: guardAll('Shield Pulse', 9), zap: atk('Pulse Zap', 6) },
    ai: cycle('pulse', 'zap', 'zap'),
  },

  // ─────────────── ACT III — The Severed Signal ───────────────
  predator_needle: {
    name: 'Predator Needle', act: 3, tier: 'normal', hp: 62, actTime: 5.0, art: 'predator', size: 1.1,
    lore: 'Reads your habits. Hunts the weakest link.',
    intents: {
      strike: {
        kind: 'atk', name: 'Hunt', dmg: 10, desc: 'Strike the most injured ally for 10, +10 if your Guard is below 6.',
        exec: (e, c, it) => c.hitParty(e, it.target, c.edmg(e, 10 + (c.guard < 6 ? 10 : 0))),
      },
      exploit: {
        kind: 'aoe', name: 'Exploit Pattern', dmg: 9, desc: 'Your last two combos ended the same way. Hit every ally for 9.',
        exec: (e, c) => c.hitAll(e, c.edmg(e, 9)),
      },
    },
    targetMode: 'lowest',
    ai: (e, c) => (c.lastEndingsRepeat() ? 'exploit' : 'strike'),
  },
  scrap_overseer: {
    name: 'Scrap Overseer', act: 3, tier: 'normal', hp: 72, actTime: 6.0, art: 'overseer', size: 1.2,
    lore: 'Middle management, rendered in brass.',
    intents: {
      whip: { kind: 'buff', name: 'Crack the Whip', desc: 'Other enemies gain +35% ATB and act faster for 5s.', exec: (e, c) => c.enemies.filter((x) => x.alive && x !== e).forEach((x) => { x.atb = Math.min(0.95, x.atb + 0.35); c.hasteEnemy(x, 1.25, 5); }) },
      repair: { kind: 'heal', name: 'Field Repair', desc: 'Heal the most damaged enemy for 14.', exec: (e, c) => { const t = c.enemies.filter((x) => x.alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (t) c.healEnemy(t, 14); } },
      slam: atk('Quota Slam', 11),
    },
    ai: (e, c) => {
      const others = c.enemies.filter((x) => x.alive && x !== e);
      if (!others.length) return 'slam';
      const hurt = c.enemies.some((x) => x.alive && x.hp < x.maxHp * 0.6);
      return ['whip', hurt ? 'repair' : 'slam', 'slam'][e.actCount % 3];
    },
  },

  // ─────────────── ELITES ───────────────
  foundry_warden: {
    name: 'Foundry Warden', act: 1, tier: 'elite', hp: 118, actTime: 6.6, art: 'warden', size: 1.5,
    lore: 'A quality-assurance robot. It has never passed anything.',
    intents: { lockdown: lock('Lockdown', 2), hammer: atk('Drop Hammer', 15), fortify: guardSelf('Fortify', 14), quake: aoe('Floor Quake', 6) },
    ai: cycle('lockdown', 'hammer', 'fortify', 'quake', 'hammer'),
  },
  hound_mother: {
    name: 'Hound Mother', act: 1, tier: 'elite', hp: 92, actTime: 5.0, art: 'houndmother', size: 1.45,
    lore: 'The spawner node. Every litter is a bug report.',
    intents: {
      whelp: { kind: 'summon', name: 'Whelp', desc: 'Summon a Rush Hound.', exec: (e, c) => c.summon('rush_hound', e) },
      rally: { kind: 'buff', name: 'Rally', desc: 'All other enemies gain +30% ATB.', exec: (e, c) => c.enemies.filter((x) => x.alive && x !== e).forEach((x) => (x.atb = Math.min(0.95, x.atb + 0.3))) },
      maul: atk('Maul', 11),
    },
    startWith: ['rush_hound'],
    ai: (e, c) => {
      const alive = c.enemies.filter((x) => x.alive).length;
      if (alive < 3 && e.actCount % 3 === 0) return 'whelp';
      return e.actCount % 3 === 1 && alive > 1 ? 'rally' : 'maul';
    },
  },
  archive_censor: {
    name: 'Archive Censor', act: 2, tier: 'elite', hp: 150, actTime: 6.0, art: 'censor', size: 1.45,
    lore: 'Redacts anything that might be fun.',
    intents: {
      redact: { kind: 'lock', name: 'Redact', desc: 'Lock every Closer in your hand for 3s.', exec: (e, c) => c.lockCards(e, 6, (uid) => c.roleOf(uid) === 'close') },
      file: scramble('Misfile', 2, 'both'),
      strike: atk('Stamp of Denial', 13),
      audit: { kind: 'aoe', name: 'Audit', dmg: 4, desc: 'Hit every ally for 4, +2 per card in your Reserve.', exec: (e, c) => c.hitAll(e, c.edmg(e, 4 + 2 * c.reserve.length)) },
    },
    ai: cycle('redact', 'strike', 'file', 'audit', 'strike'),
  },
  choir_engine: {
    name: 'Choir Engine', act: 2, tier: 'elite', hp: 140, actTime: 5.2, art: 'choir', size: 1.45,
    lore: 'Sings the error log. In harmony.',
    intents: {
      feedback: { kind: 'drain', name: 'Feedback', desc: 'If a combo is active: drain 1.0s of Flow. Otherwise hit every ally for 5.', exec: (e, c) => { if (c.combo) c.drainFlow(e, 1.0); else c.hitAll(e, c.edmg(e, 5)); } },
      chorus: aoe('Chorus', 5),
      harmonize: { kind: 'heal', name: 'Harmonize', desc: 'All enemies heal 8 and gain 6 Guard.', exec: (e, c) => c.enemies.filter((x) => x.alive).forEach((x) => { c.healEnemy(x, 8); c.enemyGuard(x, 6); }) },
      solo: atk('Solo', 12),
    },
    ai: cycle('feedback', 'solo', 'chorus', 'feedback', 'harmonize'),
  },
  null_knight: {
    name: 'Null Knight', act: 3, tier: 'elite', hp: 210, actTime: 6.4, art: 'knight', size: 1.55,
    lore: 'A parry mechanic with a sword attached.',
    intents: {
      parry: { kind: 'special', name: 'Parry Stance', desc: 'For 3s, reflects 50% of damage it takes back at the attacker. Hold your attacks!', exec: (e, c) => c.enemyStatus(e, 'parry', 3) },
      cleave: aoe('Null Cleave', 10),
      execute: { kind: 'atk', name: 'Execute', dmg: 20, desc: 'Strike the most injured ally for 20.', exec: (e, c, it) => c.hitParty(e, it.target, c.edmg(e, 20)) },
    },
    targetMode: 'lowest',
    ai: cycle('parry', 'cleave', 'execute', 'parry', 'execute'),
  },
  rank_eater: {
    name: 'Rank Eater', act: 3, tier: 'elite', hp: 190, actTime: 6.0, art: 'eater', size: 1.5,
    lore: 'Feeds on long combos. Gets fat on ladders.',
    intents: {
      devour: scramble('Devour Rank', 3, 'rankup'),
      gnash: atk('Gnash', 17),
      feast: { kind: 'heal', name: 'Feast', desc: 'If your last combo had 5+ cards: heal 20 and gain 15 Guard. Otherwise gain 8 Guard.', exec: (e, c) => { const last = c.history[c.history.length - 1]; if (last && last.len >= 5) { c.healEnemy(e, 20); c.enemyGuard(e, 15); } else c.enemyGuard(e, 8); } },
    },
    ai: cycle('devour', 'gnash', 'feast', 'gnash'),
  },

  // ─────────────── SUMMONS ───────────────
  mirror_shard: {
    name: 'Mirror Shard', act: 2, tier: 'normal', hp: 40, actTime: 4.8, art: 'shard', size: 0.75, flying: true,
    lore: 'A fragment that thinks it is the whole.',
    intents: { glint: atk('Glint', 6), reflect: { kind: 'special', name: 'Mirror Stance', desc: 'Reflects 30% of damage for 3s.', exec: (e, c) => c.enemyStatus(e, 'parry', 3, 0.3) } },
    ai: cycle('glint', 'reflect'),
  },

  // ─────────────── BOSSES ───────────────
  clockwork_regent: {
    name: 'Clockwork Regent', act: 1, tier: 'boss', hp: 270, actTime: 5.8, art: 'regent', size: 2.0,
    lore: 'Rules the Scrapworks by the tick. Every second is taxed.',
    intents: {
      decree: lock('Royal Decree', 2),
      hourhand: atk('Hour Hand', 13),
      tempo: { kind: 'drain', name: 'Tempo Theft', desc: 'If a combo is active, steal 1.2s of Flow. Otherwise Lock 1 card and strike for 6.', exec: (e, c, it) => { if (c.combo) c.drainFlow(e, 1.2); else { c.lockCards(e, 1); c.hitParty(e, it.target, c.edmg(e, 6)); } } },
      toll: aoe('Midnight Toll', 9),
      decree3: lock('Absolute Decree', 3),
    },
    phases: [{ at: 0.5, name: 'OVERWOUND', text: 'The Regent overwinds its mainspring. It acts faster and decrees harder.', actTime: 4.6 }],
    ai: (e) => (e.phase === 1 ? cycle('decree', 'hourhand', 'tempo', 'hourhand')(e) : cycle('decree3', 'toll', 'tempo', 'hourhand')(e)),
  },
  scrap_tyrant: {
    name: 'Scrap Tyrant', act: 1, tier: 'boss', hp: 300, actTime: 6.6, art: 'tyrant', size: 2.1,
    lore: 'Made of every asset the game cut. It remembers all of them.',
    intents: {
      barrier: guardSelf('Scrap Barrier', 22),
      compactor: { kind: 'snare', name: 'Compactor', dmg: 10, desc: 'Drain 2 Churn charges and strike for 10.', exec: (e, c, it) => { c.snareChurn(e, 0, 2); c.hitParty(e, it.target, c.edmg(e, 10)); } },
      rubble: aoe('Rubble Rain', 6),
      grind: { kind: 'jam', name: 'Grind Gears', desc: 'Jam 2 hand slots for 4s and gain 10 Guard.', exec: (e, c) => { c.jamSlot(e, 4); c.jamSlot(e, 4); c.enemyGuard(e, 10); } },
    },
    phases: [{ at: 0.5, name: 'JUNK ARMOR', text: 'The Tyrant bolts on cut content. Its Guard regenerates; Pierce hits for double.', actTime: 6.0, pierceVuln: true }],
    ai: (e) => (e.phase === 1 ? cycle('barrier', 'compactor', 'rubble', 'compactor')(e) : cycle('grind', 'compactor', 'barrier', 'rubble')(e)),
  },
  protocol_auditor: {
    name: 'Protocol Auditor', act: 2, tier: 'boss', hp: 400, actTime: 5.8, art: 'auditor', size: 2.0,
    lore: 'Detects repeated patterns. Issues Citations. Has never been wrong (it checked).',
    intents: {
      audit: {
        kind: 'special', name: 'Pattern Audit', dmg: 7,
        desc: 'Checks your last two combos. Same opening suit or same Closer: issue a Citation (-40% damage until you vary). Strikes for 7.',
        exec: (e, c, it) => { c.auditPatterns(e); c.hitParty(e, it.target, c.edmg(e, 7)); },
      },
      redtape: lock('Red Tape', 2),
      beam: atk('Compliance Beam', 13),
      strict: aoe('Strict Mode', 8),
    },
    phases: [{ at: 0.5, name: 'STRICT MODE', text: 'The Auditor enables Strict Mode. Citations now also deal 10 damage to the whole party.', actTime: 5.0, strict: true }],
    ai: (e) => (e.phase === 1 ? cycle('audit', 'beam', 'redtape', 'beam')(e) : cycle('audit', 'strict', 'redtape', 'beam')(e)),
  },
  mirror_array: {
    name: 'Mirror Array', act: 2, tier: 'boss', hp: 380, actTime: 5.8, art: 'mirror', size: 2.0,
    lore: 'It plays exactly like you. It plays slightly worse. It is annoyed about that.',
    intents: {
      reflect: { kind: 'atk', name: 'Reflection', dmg: 8, desc: 'Fires back 60% of your last combo’s strongest card (min 8).', exec: (e, c, it) => c.hitParty(e, it.target, c.edmg(e, Math.max(8, Math.round(0.6 * c.lastStrongestHit())))) },
      mguard: { kind: 'guard', name: 'Mirror Guard', desc: 'Gain Guard equal to your Guard (max 30) + 6.', exec: (e, c) => c.enemyGuard(e, Math.min(30, Math.floor(c.guard)) + 6) },
      mlock: { kind: 'lock', name: 'Mirror Lock', desc: 'Lock up to 2 hand cards that match the suit of your last combo’s opener.', exec: (e, c) => { const v = c.lastOpenerSuit(); c.lockCards(e, 2, v ? (uid) => c.effVariant(uid) === v : null); } },
      shatter: aoe('Shatter Glare', 7),
    },
    phases: [{ at: 0.5, name: 'SPLIT IMAGE', text: 'The Array splits. Two Mirror Shards break free.', actTime: 5.2, summon: ['mirror_shard', 'mirror_shard'] }],
    ai: (e) => (e.phase === 1 ? cycle('mlock', 'reflect', 'mguard', 'reflect')(e) : cycle('mlock', 'reflect', 'shatter', 'mguard')(e)),
  },
  the_corruptor: {
    name: 'The Corruptor', act: 3, tier: 'boss', hp: 520, actTime: 5.8, art: 'corruptor', size: 2.1,
    lore: 'A system-level fault that edits cards in flight.',
    intents: {
      corrupt: { kind: 'glitch', name: 'Corrupt Deck', desc: 'Shuffle 2 Glitch cards into your draw pile (Churn them for free).', exec: (e, c) => c.addGlitch(e, 2) },
      bleed: { kind: 'scramble', name: 'Context Bleed', desc: 'If a combo is active: rewrite its suit at random and raise its rank by 1. Otherwise scramble 3 cards.', exec: (e, c) => c.bleedContext(e) },
      rewrite: scramble('Rewrite', 3, 'both', 5),
      devour: atk('Devour', 16),
      delete: atk('Delete', 22),
    },
    phases: [{ at: 0.5, name: 'ROOT ACCESS', text: 'The Corruptor gains root access. Each action also inserts a Glitch.', actTime: 5.0, rootAccess: true }],
    ai: (e) => (e.phase === 1 ? cycle('corrupt', 'devour', 'bleed', 'rewrite', 'devour')(e) : cycle('bleed', 'delete', 'rewrite', 'devour')(e)),
  },
  signalbreak_core: {
    name: 'Signalbreak Core', act: 3, tier: 'boss', hp: 600, actTime: 5.6, art: 'core', size: 2.2,
    lore: 'The heart of the game. It knows every rule you broke.',
    intents: {
      clock: lock('Clock Protocol', 2, 6),
      tempo: { kind: 'drain', name: 'Tempo Theft', desc: 'If a combo is active, steal 1.2s of Flow. Otherwise strike for 10.', exec: (e, c, it) => { if (c.combo) c.drainFlow(e, 1.2); else c.hitParty(e, it.target, c.edmg(e, 10)); } },
      audit: { kind: 'special', name: 'Audit Protocol', dmg: 8, desc: 'Checks your last two combos for repetition: issue a Citation. Strikes for 8.', exec: (e, c, it) => { c.auditPatterns(e); c.hitParty(e, it.target, c.edmg(e, 8)); } },
      barrier: guardSelf('Signal Barrier', 24),
      adapt: { kind: 'special', name: 'Counter-Strategy', desc: 'Targets your dominant strategy (see Adaptation).', exec: (e, c, it) => c.coreCounter(e, it) },
      collapse: aoe('Signal Collapse', 13),
      beam: atk('Carrier Beam', 15),
    },
    phases: [
      { at: 0.66, name: 'AUDIT PROTOCOL', text: 'Phase 2: the Core starts auditing your patterns.', actTime: 5.2 },
      { at: 0.33, name: 'ADAPTIVE PROTOCOL', text: 'Phase 3: the Core rewrites itself around your strategy.', actTime: 4.8 },
    ],
    ai: (e) => (e.phase === 1 ? cycle('clock', 'beam', 'tempo', 'beam')(e) : e.phase === 2 ? cycle('audit', 'beam', 'barrier', 'clock')(e) : cycle('adapt', 'collapse', 'beam', 'adapt', 'tempo')(e)),
  },
};

// Encounter formations by act. Each entry: [weight, [enemy ids], minDepth]
export const FORMATIONS = {
  1: [
    [3, ['rush_hound', 'rush_hound'], 0],
    [3, ['interference_mite', 'interference_mite', 'rush_hound'], 0],
    [3, ['wire_jammer', 'rush_hound'], 0],
    [2, ['iron_maw'], 1],
    [3, ['churn_snare', 'interference_mite'], 1],
    [3, ['wire_jammer', 'interference_mite', 'interference_mite'], 2],
    [2, ['iron_maw', 'interference_mite'], 3],
    [3, ['churn_snare', 'rush_hound', 'wire_jammer'], 4],
    [2, ['iron_maw', 'wire_jammer'], 5],
  ],
  2: [
    [3, ['suit_scrambler', 'needle_wing'], 0],
    [3, ['needle_wing', 'needle_wing'], 0],
    [3, ['latch_wisp', 'signal_hound'], 0],
    [2, ['signal_hound', 'rush_hound'], 1],
    [3, ['bulwark_signal', 'needle_wing'], 1],
    [3, ['bulwark_signal', 'suit_scrambler'], 2],
    [3, ['latch_wisp', 'suit_scrambler', 'interference_mite'], 3],
    [2, ['signal_hound', 'wire_jammer', 'needle_wing'], 4],
    [2, ['bulwark_signal', 'latch_wisp', 'signal_hound'], 5],
  ],
  3: [
    [3, ['predator_needle', 'interference_mite'], 0],
    [3, ['scrap_overseer', 'rush_hound', 'interference_mite'], 0],
    [3, ['predator_needle', 'bulwark_signal'], 1],
    [2, ['scrap_overseer', 'iron_maw'], 1],
    [3, ['latch_wisp', 'predator_needle'], 2],
    [3, ['suit_scrambler', 'scrap_overseer', 'needle_wing'], 3],
    [2, ['signal_hound', 'predator_needle'], 4],
    [2, ['churn_snare', 'scrap_overseer', 'wire_jammer'], 5],
  ],
};

export const ELITES = {
  1: ['foundry_warden', 'hound_mother'],
  2: ['archive_censor', 'choir_engine'],
  3: ['null_knight', 'rank_eater'],
};

export const BOSSES = {
  1: ['clockwork_regent', 'scrap_tyrant'],
  2: ['protocol_auditor', 'mirror_array'],
  3: ['the_corruptor', 'signalbreak_core'],
};

export const ENEMY_KIND_ICONS = {
  atk: 'sword', aoe: 'burst', lock: 'lock', scramble: 'scramble', jam: 'static', snare: 'snare', latch: 'hook',
  drain: 'hourglass', guard: 'shield', buff: 'up', heal: 'heal', summon: 'summon', glitch: 'glitch', special: 'eye',
};
