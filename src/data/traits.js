// Route traits attached to map nodes. Each modifies real mechanics (see engine/combat.js and engine/run.js).
export const TRAITS = {
  HOTWIRE: { name: 'Hotwire', icon: 'bolt', color: '#e0703a', text: 'Battle: start with +3 Momentum, but enemies act 15% faster. Reward: +15 Scrap.' },
  STATIC: { name: 'Static', icon: 'static', color: '#9a86c9', text: 'Battle: enemy actions have a 25% chance to also Lock a card. Reward: card rarity improves.' },
  QUIET_CHANNEL: { name: 'Quiet Channel', icon: 'wave', color: '#7fb3a2', text: 'Enemies act 15% slower. Afterward the party heals 6. Rest sites heal 15% more.' },
  SCRAP_CACHE: { name: 'Scrap Cache', icon: 'coin', color: '#d9a845', text: '+50% Scrap from battles. Shops are 20% cheaper. Events grant +25 Scrap on arrival.' },
  BLACKOUT: { name: 'Blackout', icon: 'eye', color: '#5d5370', text: 'Enemy intents stay hidden until 75% ATB. Reward: 50% chance of a relic.' },
  WILD_SIGNAL: { name: 'Wild Signal', icon: 'prism', color: '#c9577a', text: 'Battle: 25% of drawn cards turn EX for the fight. Reward cards arrive pre-grafted.' },
};
export const TRAIT_IDS = Object.keys(TRAITS);

export const NODE_TYPES = {
  battle: { name: 'Battle', icon: 'sword', color: '#c8b48a' },
  elite: { name: 'Elite', icon: 'skull', color: '#d45a3c' },
  event: { name: 'Event', icon: 'question', color: '#9fc0b4' },
  shop: { name: 'Shop', icon: 'coin', color: '#e2b649' },
  rest: { name: 'Rest', icon: 'flame', color: '#e98b47' },
  surgery: { name: 'Surgery', icon: 'wrench', color: '#8fb7d9' },
  treasure: { name: 'Cache', icon: 'chest', color: '#d8c27a' },
  boss: { name: 'Boss', icon: 'crown', color: '#e0503a' },
};
