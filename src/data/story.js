// Story scenes and developer commentary. Speakers: gran (Granraku), dev (Ozmund Lurr), V/C/S (party), sys.
export const SPEAKERS = {
  gran: { name: 'Granraku', title: 'Trash-game hunter', color: '#d9c7a0' },
  dev: { name: 'Ozmund Lurr', title: 'Lead (only) developer', color: '#e0a35a' },
  V: { name: 'Hessa Rivetbourne', title: 'Vanguard', color: '#d0603f' },
  C: { name: 'Corvin Ashwell', title: 'Channeler', color: '#a97ad1' },
  S: { name: 'Pin Wexley', title: 'Striker', color: '#e6c25a' },
  sys: { name: 'SYSTEM', title: '', color: '#8fb7d9' },
};

export const SCENES = {
  intro: [
    { who: 'gran', text: 'Episode 212 of "Shovelware Safari." Tonight: SIGNAL//BREAK. Card-based JRPG. Refund rate: ninety-four percent.' },
    { who: 'gran', text: 'The store page promises "Relay Combat: the future of the genre." The reviews promise "my disc tray ejected itself in protest."' },
    { who: 'sys', text: 'WELCOME, PLAYER. PLEASE ENJOY THE INTENDED EXPERIENCE.' },
    { who: 'dev', text: 'Oh. A player. Hi. I\'m Ozmund, I made this. Please don\'t touch the Relay system, it\'s, uh, deprecated.' },
    { who: 'gran', text: 'A dev who lives inside his own failed game. That\'s new. Okay, Ozmund. What does the Relay system do?' },
    { who: 'dev', text: 'Nothing! It lets three party members share one hand and chain cards in real time. Openers, Converters, Closers. Very confusing. Ignore it.' },
    { who: 'V', text: 'Commander. Hessa Rivetbourne, Vanguard. Hammer, shield, opinions. Point me at something.' },
    { who: 'C', text: 'Corvin Ashwell. Channeler. I make the lightning go where the arguments are.' },
    { who: 'S', text: 'Pin Wexley! Striker! I shoot things and also sometimes the right things!' },
    { who: 'gran', text: 'Alright. Let\'s see how broken this is.' },
  ],
  tutorial_done: [
    { who: 'gran', text: '...Hold on. Opener, Converter, Closer, all inside three seconds, passing the turn between them like a baton?' },
    { who: 'gran', text: 'That\'s not broken. That\'s good. That\'s really good.' },
    { who: 'dev', text: 'It is NOT good. It\'s a legacy system. Please use the normal attacks.' },
    { who: 'gran', text: 'There are no normal attacks, Ozmund.' },
    { who: 'dev', text: '...There were supposed to be.' },
  ],
  boss_intro_clockwork_regent: [
    { who: 'dev', text: 'The Clockwork Regent! My masterpiece of pacing. It locks your cards and steals your time. Combos are NOT allowed in its throne room.' },
    { who: 'V', text: 'Then we\'ll make them fast.' },
  ],
  boss_intro_scrap_tyrant: [
    { who: 'dev', text: 'The Scrap Tyrant is built from every feature I cut. It eats Churn charges. It hides behind barriers. It\'s, um, a metaphor.' },
    { who: 'gran', text: 'A metaphor with Guard. Pin, Sunderline pierces. Remember that.' },
  ],
  boss_win_act1: [
    { who: 'dev', text: 'You beat it. With RELAY. Do you know how many internal playtesters quit at the first boss? All of them. Both of them.' },
    { who: 'gran', text: 'Your playtesters didn\'t pass the baton.' },
    { who: 'dev', text: 'Fine. FINE. Pick a mutation. The game will... adapt.' },
  ],
  act2_intro: [
    { who: 'sys', text: 'ACT II: THE BROKEN PROTOCOL.' },
    { who: 'gran', text: 'The art changes. The enemies get smarter. They\'re reading our hands now.' },
    { who: 'dev', text: 'The protocol layer! Where I put all the anti-cheese. You will NOT be repeating the same combo here.' },
    { who: 'C', text: 'He says that like we were going to.' },
  ],
  boss_intro_protocol_auditor: [
    { who: 'dev', text: 'The Protocol Auditor logs every pattern. Open with the same suit twice and it writes you a Citation. Variety is MANDATORY.' },
    { who: 'gran', text: 'An enemy that punishes autopilot. Ozmund, that\'s a good design.' },
    { who: 'dev', text: 'It\'s a PUNISHMENT design!' },
  ],
  boss_intro_mirror_array: [
    { who: 'dev', text: 'The Mirror Array plays exactly like you. It reflects your best hits back. Good luck beating yourself.' },
    { who: 'S', text: 'Easy. I miss constantly.' },
  ],
  boss_win_act2: [
    { who: 'dev', text: 'Okay. Okay okay okay. You know what? The Relay doc. The one in the archive. I wrote that when I was twenty-three.' },
    { who: 'gran', text: 'I read it. "If three heroes pass the turn like a baton, it might feel like a team."' },
    { who: 'dev', text: '...It does, doesn\'t it.' },
  ],
  act3_intro: [
    { who: 'sys', text: 'ACT III: THE SEVERED SIGNAL.' },
    { who: 'gran', text: 'The level geometry is folding. The UI is in the background. Ozmund, what is this?' },
    { who: 'dev', text: 'The core. Where the game decides what it is. It\'s been fighting itself for years. Now it\'s fighting you.' },
    { who: 'V', text: 'Good. We\'re better at fighting than it is.' },
  ],
  boss_intro_the_corruptor: [
    { who: 'dev', text: 'The Corruptor rewrites cards mid-flight. It shoves Glitches into your deck. It is every bug I never fixed.' },
    { who: 'gran', text: 'Churn the Glitches, keep the chain alive. We\'ve trained for this.' },
  ],
  boss_intro_signalbreak_core: [
    { who: 'dev', text: 'The Signalbreak Core. It remembers every rule you broke. It has three phases and it is going to use your own strategy against you.' },
    { who: 'gran', text: 'Then we play the whole game. Not one combo. All of it.' },
  ],
  ending: [
    { who: 'sys', text: 'SIGNAL//BREAK — CORE STABILIZED.' },
    { who: 'dev', text: 'You beat my game. With the system I tried to delete. Nobody... nobody\'s ever even finished the tutorial.' },
    { who: 'gran', text: 'I came here to make fun of you, Ozmund. I\'ll still make fun of the vending machines.' },
    { who: 'gran', text: 'But Relay is brilliant. Strip out the junk, keep the baton, and ship it.' },
    { who: 'dev', text: '...Patch 1.0. "Relay is now the game." I like that. I\'ll write it on a mug.' },
    { who: 'V', text: 'Same time next run, Commander?' },
    { who: 'gran', text: 'Episode 213. "SIGNAL//BREAK: I was wrong." Yeah. Same time next run.' },
  ],
};

export const DEFEAT_LINES = [
  [{ who: 'dev', text: 'See? Relay is too hard. Maybe try the... no, there are no other options. Try again?' }, { who: 'gran', text: 'I dropped the baton. That\'s on me, not the system.' }],
  [{ who: 'dev', text: 'GAME OVER. I recorded a sad trombone for this. Nobody had ever heard it before.' }, { who: 'gran', text: 'Again. I\'m seeing new lines.' }],
  [{ who: 'dev', text: 'Your build was interesting. Wrong, but interesting.' }, { who: 'gran', text: 'Next run I\'m bringing more Converters.' }],
  [{ who: 'dev', text: 'You know, most people quit after one defeat. You\'re making my telemetry look busy.' }, { who: 'gran', text: 'Your telemetry is about to see a lot more of me.' }],
];

// Mid-battle developer remarks ("patch notes"), keyed by trigger.
export const DEV_REMARKS = {
  longCombo: ['PATCH NOTE: 6-card combos were "never tested." Clearly.', 'Ozmund: "That chain is longer than my design doc."', 'PATCH NOTE: Relay chain length is now technically unlimited. Oops.'],
  cashSpam: ['Ozmund: "Cash Out was meant to be an emergency button, not a lifestyle."', 'PATCH NOTE: Cash Out is fine. Stop using it.'],
  churnSpam: ['Ozmund: "The Churn button is not a slot machine."', 'PATCH NOTE: Reduced fun of Churn by 0%. Couldn\'t find the variable.'],
  tripleRelay: ['Ozmund: "All three of them in one combo? That\'s... that\'s how I drew it on the napkin."', 'PATCH NOTE: Fixed an issue where the party felt like a team.'],
  adaptBroken: ['Ozmund: "You broke the adaptation. I spent a WEEKEND on that."', 'PATCH NOTE: Boss adaptations now cry a little when broken.'],
  perfectStreak: ['Ozmund: "Three Perfects in a row. Are you reading my code?"'],
  lowHp: ['Ozmund: "If you die here I get to keep my design philosophy."'],
  finisher: ['PATCH NOTE: Finisher animations were placeholder. They are now "final placeholder."', 'Ozmund: "I didn\'t know the camera could DO that."'],
};
