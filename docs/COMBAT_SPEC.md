# SIGNAL//BREAK — Combat Architecture Specification (Roadmap Phase 2)

Status: specification for Phases 3–8. Written 2026-11-15 against the reference build **0.2.2** (commit `46d01a5`; `git checkout 46d01a5` restores it). Phase 3 shipped in 0.2.3 (`338184c`), Phase 4 in 0.2.4 (`e6a43d1`; §25 lists its interim bridges), Phase 5 in 0.2.5 (§26 describes what was built and replaces most of §25's bridges), Phase 6 in 0.2.6 (§27: Act I onboarding, Relay accessibility, Act I tuning, telegraphs).
Numbers marked *(prototype)* are starting values kept in one configuration table (`RULES` in `src/engine/combat.js`), not approved balance.

Contents: 1 Goals · 2 Regression requirements · 3 Entities · 4 Party and shared resources · 5 Cards · 6 Hand and zones · 7 Hero states and scheduling · 8 Offensive sequences · 9 Relay · 10 Support · 11 Momentum · 12 Chain endings · 13 Timing · 14 Targeting · 15 Damage and mitigation · 16 Cancellation and interruption · 17 Enemy interference · 18 Content migration · 19 Saves · 20 Interface · 21 Prototype values · 22 Dependencies and phase plan · 23 Regression risks · 24 Decisions taken here

---

## 1. Goals

- One shared party (Hessa, Corvin, Pin) that never loses a hero to low HP, with targeting still mattering through individual Defense.
- Attacks built as deliberate sequences: neutral basic attacks (Weak, Medium, Strong) lead into a hero's own artes; heroes hand off to each other on purpose (Relay).
- Support (healing, protection, buffs, utility) usable on its own, at the cost of that hero's action.
- A visible rhythm: choose → commit → watch it execute → recover; thinking time is not eaten by animations.
- Keep the game's content: cards, relics, grafts, mutations, enemies, bosses and their adaptations are converted, not discarded, wherever their idea still fits.

## 2. Regression requirements (from the 0.2.2 beta-feedback patch)

These are acceptance conditions for every later phase. They describe outcomes; the code that produces them may change.

| ID | Requirement | How it is checked |
|---|---|---|
| R1 | Enemy pressure: per-act enemy speed (×0.70 / ×0.82 / ×0.90), at least 1.2s between two enemy actions, no hidden ATB jumps | unit tests (spacing, pace per act, ATB push event); `tools/encounter.mjs` |
| R2 | Decision time: a player choosing ~2.5s per card completes most sequences; time spent watching committed actions does not consume the decision window | `tools/pacing.mjs --pace=...` (≤ 25% dropped at 2.5s per card in opening fights) |
| R3 | Downtime: after every attack chain enemies wait for a short breather; the player can see deciding / executing / recovering states | unit test (enemies wait during the breather); visual check |
| R4 | Targeting: gold TARGET marker, ⌖ chip that names and cycles the target, automatic NEW TARGET when the target dies, red ring and "▼ damage" on the hero an enemy will hit; the attack lands on the selected enemy | `tools/targeting.mjs` (32 checks) |
| R5 | Early fights: Act I depth 0 has at most one interference type; a learning player completes opening fights without a hero being lost and with most HP left | `tools/pacing.mjs` learner rows |
| R6 | Readability: compact layout when cards are narrower than 80px; card text never clipped; hold-to-read pauses the battle | `tools/readability.mjs`, `tools/i18n-layout.mjs` |
| R7 | Saves, English/Russian, offline PWA keep working | `npm test`, `tools/milestone.mjs`, `tools/pwa.mjs` |

## 3. Entities

| Entity | Fields (combat state) |
|---|---|
| Party | `hp`, `maxHp`, `guard`, `momentum`, `churn`, `reserve` (shared) |
| Hero (V Hessa, C Corvin, S Pin) | `defense`, `state` (§7), `recoverUntil`, statuses (`weak`, `covering`, `braced`), `segmentsThisChain` |
| Card definition | `id`, `category` (basic / arte / support / junk), `owner` (V/C/S or `null` for neutral), `rank` (basic 1–3, arte 4–6, support none), `suit` (A/B/EX, bonus layer only), `cost` (Momentum), `action` (seconds of execution), effect script, tags |
| Card instance | `uid`, `id`, `up` (upgraded), `graft`, `rankMod`, `variant` (recut suit) — unchanged from today |
| Chain | ordered list of segments; `relays`, `cards`, `damage`, `history` (party-level), decision window (§13) |
| Segment | one hero's part of a chain: `hero`, `rank` (last rank played), `cards`, `hasBasic`, `artes` |
| Command | an entry in the execution queue: card play, Relay, support, or finish |

## 4. Party and shared resources

### 4.1 Party HP (Phase 3)
- One pool. Run start: `maxHp = 46 + 34 + 38 + 12 = 130`: the old three pools added up, plus a bonus of 12 *(prototype, set in Phase 3 from measurements)* that stands in for what the per-hero rules forgave without saying so (damage past a falling hero's last HP was lost; area attacks skipped fallen heroes). Without it the slow simulated player's Act I boss wins fell from 83%/57% to 57%/57% (Scrap Tyrant / Clockwork Regent); with it they are 77%/90% (`tools/pacing.mjs 30 --act1`). Everything that changed one hero's HP or max HP now changes the pool (conversion rules in §18.6).
- Heroes never fall. The old knockout, "DOWN" card state and stand-in rule (a standing ally playing a fallen hero's Openers) are removed.
- Defeat: party HP reaches 0. Victory: all enemies defeated.
- Between battles the pool persists; a battle that ends in victory leaves at least 1 HP.

### 4.2 Defense (Phase 3)
- Each hero has a Defense percentage *(prototype)*: **Hessa 30%**, **Pin 15%**, **Corvin 0%**.
- Defense reduces each enemy hit aimed at that hero before Guard (formula §15). It does not apply to self-inflicted costs (event prices, "Pay in blood").
- Statuses may change it: **Braced** +20 percentage points (cap 60%) for its duration.
- The hero an enemy targets is chosen when the enemy picks its intent and shown with the red ring (R4). Enemies favour Hessa 2:1:1 as today; enemies marked `targetMode: 'lowest'` (they used to pick the hero with the lowest HP) now pick the hero with the lowest Defense.

### 4.3 Guard
- Shared, unchanged in size, decay and cap. Absorbs damage after Defense (§15). Consumed once per hit; for an area attack the per-hero results are added and Guard is applied once to that total (§15.3).

### 4.4 Momentum
- Shared, cap 10 (+ relics/mutations as today). No second resource is added. Economy in §11.

### 4.5 Protection (Phase 3)
- **Cover** *(prototype 4s)*: when Hessa resolves a card tagged `guard` (or, from Phase 4, a support card with the Cover effect), she covers the party: single-target enemy hits aimed at Corvin or Pin are redirected to Hessa and use her Defense. Area attacks are not redirected. Shown as a shield badge with a countdown over Hessa; a redirected hit shows "COVER". These cards end their text with **Cover.**, and holding one explains it.
- **Braced** (Phase 4 support): +20 Defense points on one hero for a few seconds.
- The Momentum shortcut **+GUARD** (3 Momentum → +8 Guard) stays as a party action.

## 5. Cards

### 5.1 Categories (Phase 4)

| Category | Owner | Rank | Cost | Role in a chain |
|---|---|---|---|---|
| **Basic attack** | neutral | Weak 1, Medium 2, Strong 3 | 0 | Starts and builds a hero's segment; generates Momentum |
| **Arte** | one hero | 4–6 *(prototype)* | Momentum, usually 2 / 3 / 4 by rank | Needs at least one basic attack earlier in the same segment; spends Momentum |
| **Support** | one hero or neutral | none | 0–3 Momentum | Played outside sequences; costs the performing hero's action (§10) |
| **Junk** (Glitch) | — | — | — | Unplayable; Churn deletes it for free (as today) |

EX Combos (Phase 7) are not cards: they are recipes recognized from executed commands (§12.4).

### 5.2 Ranks and legality summary
Within one segment ranks strictly ascend; skipping ranks is legal (Weak 1 → Strong 3 → arte 5 is legal; Medium 2 → Medium 2 is not; arte 5 → arte 4 is not). Full rules in §8.

### 5.3 Suits
Suits (A, B, EX) stay on cards but stop deciding legality. They become a bonus layer: a **Cross** is any legal next card of a different suit than the previous card in the segment (EX matches neither and counts as a Cross whenever the suit differs); a **Step** is a next card of exactly +1 rank. Existing Step and Cross rewards (Momentum, damage, relic and mutation bonuses) keep working on these definitions.

## 6. Hand and zones (Phase 4)

- Six slots. A committed card leaves its slot for the **queue**; the slot shows a placeholder until the card has executed, then refills from the draw pile. No other card changes because a phase changed (the old Opener/chain hand swap is removed).
- **Next card**: the top card of the draw pile is shown face up beside the hand.
- **Reserve** (2 slots, +relics): swipe up to store a hand card; Reserve cards can be committed like hand cards. Unchanged except that phase transitions no longer exist.
- **Churn** (charges, refill over time): swipe down to discard a hand card and draw a replacement. Costs as today (outside a chain it pushes enemy ATB 5%, shown; during a chain it costs 0.3s of the decision window).
- Zones: draw, hand, reserve, queue, discard, exhaust. Every card instance is in exactly one zone at all times (existing `verifyZones()` extended with the queue).
- When the draw pile is empty the discard pile is shuffled in (as today).

## 7. Hero states and action scheduling (Phase 5)

Each hero has one state:

| State | Meaning | Can be chosen for |
|---|---|---|
| **Ready** | free | starting a chain, receiving a Relay, support |
| **Active** | running the current segment; commands can be added | basic attacks and own artes in the segment; Relay out; finish |
| **Committed** | has queued commands waiting to execute | — |
| **Acting** | its command is executing (animation length = `action` seconds) | — |
| **Recovering** | after its segment or support ends, until `recoverUntil` | nothing |

- **Recovery** *(prototype)*: after a segment, 1.5s + 0.3s per card the hero played in it; after a support action, 2.0s. Recovery runs in combat time; enemies keep acting during recovery except during the party breather (§13.4).
- The party can start a new chain with any Ready hero. If no hero is Ready, the player waits; this is never longer than the longest recovery (about 3.5s).

### 7.1 Execution queue
- One queue for the party, executed strictly in order. Commands: play card, Relay, support, finish.
- The player may queue up to 3 commands ahead *(prototype)*; selection continues while earlier commands execute.
- A command's targets are fixed at execution time, not at selection (§14).
- Animations follow execution; they never decide order.

## 8. Offensive sequences (Phase 4 rules, Phase 5 scheduling)

A **chain** is the party's attack; a **segment** is one hero's part of it.

### 8.1 Starting a chain
- Allowed when no chain is running and at least one hero is Ready.
- The first command is a basic attack; the player picks the hero who performs it (the selected hero is highlighted; default: the last hero who started a chain if Ready, otherwise the first Ready hero in party order). That hero becomes Active.

### 8.2 Legality of the next card in a segment
A card may be committed into the active segment when all hold:
1. Its category is basic or arte (support is never part of a segment).
2. Its effective rank is strictly higher than the segment's current rank (`rank 0` at segment start). Rank modifiers (Re-gauge, Scramble) apply.
3. A basic attack: always performable by the active hero.
4. An arte: its owner is the active hero; the segment already contains at least one basic attack; the party has enough unreserved Momentum for its cost (§11.3).
5. The card is not Locked; it is in the hand or Reserve; the Reserve is not sealed.
No other prerequisite exists for higher-rank artes (the roadmap forbids inventing stricter ones without a design decision).

### 8.3 After an arte
The segment continues: the hero may add a higher-ranked arte of their own (Momentum permitting) or, if the rank still allows, nothing else — basic attacks are rank 1–3 and therefore cannot follow an arte. The usual next steps are Relay or finishing.

### 8.4 Illegal input
Tapping an illegal card does nothing to the chain except a **Stumble**: −0.4s of decision window and −1 Momentum; three stumbles in one chain end it as Dropped (as today). The card shows why it is illegal (rank needed, wrong hero, Momentum short, needs a basic first).

## 9. Relay (Phase 5)

- A Relay is a command: "hand off to hero X". It is legal when the active segment has at least one executed or queued card, hero X is Ready, and X has not already had a segment in this chain *(prototype participation limit: each hero once per chain, so at most three segments)*.
- On execution: the outgoing hero's segment closes (it enters Recovery), X becomes Active with segment rank 0 and must start with a basic attack.
- Party-level Relay history persists across segments: `chain.relays`, total cards and damage, and effects that count Relays (Relay Harness +2 damage per Relay, Echo Splice, Relay Resonance, the Relay Echo archetype).
- Relay rewards *(prototype)*: +1 Momentum on execution (removed by the `relay_jam` boss adaptation as today); the incoming hero's first card deals +10% per Relay so far in the chain.
- The decision window holds for 1.2s after a Relay executes (the new hero's options) (§13.2).
- Playing a card owned by another hero no longer creates a Relay; only the Relay command does.

## 10. Support (Phase 4 effects, Phase 5 scheduling)

- A support card is performed by its owner, or by any Ready hero if neutral (the player picks).
- Legal when the performer is Ready (not Active, not Recovering) and the party has the Momentum cost. It may be played while another hero's chain is running: it is queued after the currently executing command and does not end, pause or cancel that chain.
- Opportunity cost: the performer enters Recovery after it (2.0s), so a hero who supports cannot join the running chain by Relay until Ready again.
- Targets: healing affects the party pool; buffs that need a hero (Braced) ask the player to tap a hero, defaulting to the hero most recently targeted by an enemy.
- Representative initial set (Phase 4): one heal (Corvin), one Guard/Cover (Hessa), one buff (Braced, Pin or neutral), one utility (draw/Churn charge), one hand-management card.

## 11. Momentum

### 11.1 Gains (on execution only)
| Source | Momentum |
|---|---|
| Weak / Medium basic attack | +1 |
| Strong basic attack | +2 |
| Relay | +1 |
| Cross (suit change in a segment) | +1 (as today) |
| Perfect finish (§12) | +2 (as today) |
| Cards, grafts (Spark), relics, mutations | as written |

### 11.2 Costs
- Arte: its `cost` *(prototype: rank 4 → 2, rank 5 → 3, rank 6 → 4)*.
- Support: its `cost` (0–3).
- +FLOW (decision window) and +GUARD shortcuts: 3 as today (Flywheel 2, Long Breath −1).

### 11.3 Accounting
- **Reservation**: committing a command reserves its cost; unreserved Momentum = Momentum − reservations. Legality checks use unreserved Momentum, so a cost can never be spent twice.
- **Spend** happens when the command starts executing; **gain** happens when its effect resolves. A cancelled command releases its reservation and gains nothing.
- Over-cap gains are lost (Overflow Valve converts them to damage, as today).
- Boss Momentum Drain removes unreserved Momentum first; it cannot cancel a command that has started.

## 12. Chain endings and rewards

### 12.1 Perfect
The chain ends after an arte executes and the player finishes (or no legal continuation exists). Rewards as today's Perfect: +2 Momentum, +1 Churn charge, relic/mutation hooks (Tuning Fork, Perfect Pitch, Auditor Seal). **Finisher** cut-in when the chain had 5+ cards or an arte of rank 6.

### 12.2 Cash Out
Ends the chain at any time after 2+ executed cards, without an arte at the end: payout damage to the target scaled by chain length and highest rank (today's formula), +25% when 2.5s+ of the decision window is left (Quick Cash), Guard per card as today. Cash Out relics and mutations unchanged.

### 12.3 Dropped
The decision window runs out (or three stumbles): queued commands that have started finish; queued commands that have not started are cancelled (§16); no payout; −2 Momentum (Long Fuse: 50% payout instead). If the last executed card was an arte, the ending counts as Perfect instead (the arte was the finish).

### 12.4 EX Combos (Phase 7)
- Recipes are patterns over executed commands in one chain (e.g. Weak → Medium → Strong → arte of the same hero; three-hero Relay chain; Cover followed by an arte). They trigger once per chain when their last command executes. Cancelled or never-executed commands never count.
- Overlap: when one executed command completes several recipes, all trigger in recipe priority order; the same recipe never triggers twice in one chain.
- Discovery records the recipe in the Museum's Combo Journal; an undiscovered recipe still works.
- As built in 0.2.7: §28 (catalogue, history, evaluation points, terminal order, effects, discovery policy, Journal, saves).

## 13. Timing

### 13.1 Clocks
Combat time advances only while the battle runs (pause, menus, tutorials, hold-to-read stop it — R6). Enemy ATB, statuses, Locks, recoveries and the decision window all use combat time.

### 13.2 Decision window ("Flow", per chain)
- Opens when the chain's first command is committed: 5.0s.
- **Holds** (does not count down) while any command is executing, for 1.2s after the chain's first card and after each Relay (reading new options), and while the game is paused.
- Each executed valid card refunds 1.0s (cap 5s per chain); +FLOW buys 1.5s.
- Hard cap: 14s of counting down per chain (holds excluded).
- When it reaches 0 the chain is Dropped (§12.3).
- This generalizes 0.2.2's per-card hold: in 0.2.2 the window held 0.7s after each card for its animation; with real execution states it holds for the actual execution length.

### 13.3 Enemies
Enemy ATB fills continuously at per-act pace and per-enemy speed, with at least 1.2s between two enemy actions (R1). It fills during selection and execution, waits during the party breather (§13.4) and during finishers, and freezes while paused.

### 13.4 Breather
When a chain ends, combat continues but enemy ATB waits for 0.8–1.2s (Perfect 1.0, Cash Out 0.8, Dropped 1.2 — as 0.2.2). During it the hand refills and the strip shows "BREATHER · ENEMIES WAIT".

### 13.5 Tactical mode (optional setting, Phase 5)
While a chain is open and the queue is empty (the player is deciding), enemy ATB runs at 25% speed. It changes timing pressure only, not enemy damage or HP. Off by default; stored in settings.

## 14. Targeting

- **Player target**: one selected enemy, chosen by tapping an enemy or the ⌖ chip (R4). Single-target attacks resolve against the target selected **when they execute**; if it has died, the next living enemy is chosen and labeled NEW TARGET. Area attacks hit all enemies.
- **Enemy target**: chosen when the enemy picks its intent, shown by the red ring and "▼ damage" (damage after that hero's Defense). Cover can redirect single-target hits to Hessa at hit time; the ring moves to Hessa when Cover starts.
- Support targets: §10.

## 15. Damage and mitigation

### 15.1 Single-target enemy hit
```
raw      = intent damage × enemy damage multiplier × (0.75 if the enemy is Weak)
target   = Hessa if Cover is active and the intended hero is not Hessa, else the intended hero
afterDef = raw > 0 ? max(1, round(raw × (1 − defense(target)))) : 0
blocked  = pierce ? 0 : min(guard usable, afterDef)     (boss Guard Pierce halves usable Guard)
hp      -= afterDef − blocked;  guard -= blocked
```
On-hit hooks (Counter, Heat Shield, Bastion Protocol) fire once per hit, as today.

### 15.2 Multi-hit
Each hit is a single-target hit (Defense and Guard per hit).

### 15.3 Area attack
```
for each hero: part = raw > 0 ? max(1, round(raw × (1 − defense(hero)))) : 0
total    = Σ part
blocked  = pierce ? 0 : min(guard usable, total)        (Guard applied once, to the total)
hp      -= total − blocked
```
The per-hero numbers shown are the parts after Guard is taken from them in hero order, so the shown numbers add up to the HP lost. On-hit hooks fire once per area attack, not per hero.

### 15.4 Reflect and party-wide self costs
Reflected damage (Parry, Mirror Stance) and self-inflicted costs ignore Defense and Guard. Self costs cannot reduce HP below 1 outside battle.

### 15.5 Healing
Healing restores party HP up to max. Conversion of old per-ally healing in §18.6.

## 16. Cancellation and interruption

- A queued command that has not started can be cancelled by tapping it in the queue strip: the card returns to its slot (or to the Reserve slot it came from), its Momentum reservation is released, nothing else changes.
- A started command always completes.
- When a chain ends early (Dropped, Cash Out, defeat or victory), commands not yet started are cancelled as above.
- If the active hero becomes unable to act (a future stun effect), its unstarted commands are cancelled and the player may Relay or finish.
- Locking a queued card: impossible (Locks affect hand and Reserve cards only).
- Victory or defeat mid-queue: the queue is cleared; no rewards from cancelled commands.

## 17. Enemy interference under the new rules

| Mechanic | Today | Under the new rules |
|---|---|---|
| Lock (cards, 3s) | hand cards unplayable | unchanged; never affects queued cards |
| Scramble (rank/suit, 5s) | shifts rank, flips suit | rank shift unchanged (affects legality); suit flip only affects Cross bonuses |
| Jam (slot, 4s) | slot cannot refill | unchanged |
| Churn snare | drains a charge, jams Churn | unchanged |
| Reserve latch | steals or seals Reserve | unchanged |
| Flow drain | removes Flow | removes decision-window time (never below 0.5s) |
| Glitch cards | unplayable junk | unchanged |
| Citation (Protocol Auditor, Core) | same Opener suit or same Closer twice → −40% damage | same first basic attack strength twice, or the same arte finishing twice → −40% until varied |
| Parry / Mirror stance | reflects damage taken | unchanged |
| Haste, Guard, heal, summon | — | unchanged |
| Enemy target choice | a hero; "lowest HP" mode | a hero; "lowest" mode picks the lowest Defense (§4.2) |

## 18. Content migration

### 18.1 Cards (79)
Conversion rules, applied in Phase 4 to a representative set and in Phase 8 to the rest:

| Today | Becomes |
|---|---|
| Starter Openers with plain damage (Scrapline, Hotwire, Rivet Jab…) | neutral **basic attacks** Weak/Medium/Strong by rank (1/2/3), suit kept |
| Openers and Converters whose effect is not damage (Guard, Churn charge, draw, healing) | **support** of the same owner, effect kept |
| Converters with a hero-flavoured attack effect | **artes** rank 4 of that hero |
| Closers (ranks 5–9) | **artes** rank 5–6 of that hero; their payoff effects ("+X per Relay this combo", "per card in this combo") keep working on chain history |
| Converters that rewrite rank/suit (Rewind, suit change) | support "techniques" that change the next card's rank or suit; Rewind lowers the active segment's rank by its value (enables a further arte) |
| Junk (Glitch) | unchanged |

The starter deck becomes *(prototype)*: 3 Weak, 3 Medium, 2 Strong (mixed suits), one rank-4 arte per hero, Corvin's heal, Hessa's Guard/Cover support.

### 18.2 Grafts (10)
| Graft | Status |
|---|---|
| spark (+1 Momentum), plated (+3 Guard), keen (+3 first hit), breaker (pierce), anchored (no Lock/Scramble), cached (+50% from Reserve), churnfed, ledger | keep as written |
| quick (+0.2s Flow) | +0.5s decision window *(prototype)* |
| echoing (as a Relay, Echoes itself 30%) | "When this card is the first card after a Relay, Echo it at 30%" |

### 18.3 Relics (39)
| Group | Relics | Change |
|---|---|---|
| Keep as written | beta_badge, pressure_gauge, junk_dividend, heat_shield, spare_pockets, churn_gear, flywheel, tower_plate, riveted_ledger, signal_flare, coal_heart, lucky_rivet, counter_spring, scrap_magnet, glitch_jar, quiet_coil, regent_mainspring, scrap_heart, mirror_lens, root_key, overflow_valve, breach_clamp, grease_trap | none |
| Flow wording | stopwatch_gear (+1.0s first chain), brass_metronome (refunds a third larger), long_fuse | wording uses "decision window" from Phase 5 |
| Suit layer | twin_dials (+1 Momentum per Cross), prism_lens (EX +3 damage), wild_hinge | keep with §5.3 definitions; wild_hinge becomes "Crosses also count as Steps" |
| Step layer | ladder_rungs (+3 per Step) | keep (Step = +1 rank) |
| Roles | iron_filings (Converter → 1 Guard), kettle_drum (Closers in 5+ card combos +25%) | iron_filings: each basic attack grants 1 Guard; kettle_drum: artes in chains of 5+ cards +25% |
| Relay | echo_splice, relay_harness | keep; trigger on the Relay command |
| Healing | tuning_fork (Perfect heals 2), patch_kit (after battle each ally heals 4) | tuning_fork heals the party 3; patch_kit heals the party 12 (Phase 3) |
| Knockout | dead_mans_switch | **Phase 3**: "The first time in a battle party HP falls below 25%: deal 15 to all enemies and gain 5 Momentum." |
| Citations | auditor_seal | keep |

### 18.4 Mutations (12)
| Mutation | Change |
|---|---|
| overpressure_valve, grinder, deep_pockets, bastion_protocol, quick_exit, signal_thief, perfect_pitch, relay_resonance | keep as written (Relay = command) |
| ascendant_ladder, duality_engine | keep on §5.3 Step/Cross definitions |
| long_breath | wording "decision window" |
| glass_cannon (party max HP −15%) | **Phase 3**: applies to the party pool |

### 18.5 Boss adaptations (11)
| Adaptation | Phase 8 change |
|---|---|
| guard_pierce, churn_tax, momentum_drain, reserve_seal, lock_harden, payout_audit, flow_clamp | keep (flow_clamp halves decision-window gains) |
| long_chain (refunds halved from the 5th card) | "from the 5th card of a chain" |
| relay_jam (Relays give no Momentum) | keep (Relay command) |
| suit_filter_A / _B (A or B cards −30%) | keep with suits as a bonus layer; break by playing 8 cards of the other suit or EX |
Every adaptation must keep a break condition the player can pursue with the counter it targets (roadmap Phase 8).

### 18.6 Run effects (Phase 3)
| Today | Party pool |
|---|---|
| "Heal every ally N" | heal 3N |
| "Heal every ally P% of max" | heal P% of party max |
| "Each ally loses N HP" | lose 3N |
| "Hessa takes N" / "Hessa −N HP" | lose N |
| "a random ally loses N max HP" | party max −N |
| "each ally loses P% max HP" | party max −P% |
| "Hessa gains N max HP" | party max +N |
| Rest: heal 30% (45% with Quiet Channel) | 30% / 45% of party max |
| KO'd heroes revive at 10% after a battle | removed (no knockouts) |
| Event requirement "Hessa is too hurt" | "The party is too hurt" (party HP must exceed the cost) |

### 18.7 Enemies
Intents, damage and timing are unchanged by Phases 3–5 except the `lowest` targeting rule (§4.2). Act I is retuned in Phase 6 around shared HP and the new action economy.

## 19. Saves

| Version | Phase | Migration |
|---|---|---|
| 3 | today | per-hero `party[{id,hp,maxHp}]` |
| **4** | Phase 3 | `hp = Σ hp + 12` (a knocked-out hero counts 0), `maxHp = Σ maxHp + 12` (the same bonus as a new run), `party = [{id}]`; older version-3 saves load and convert once |
| 5 | Phase 4 | deck card ids mapped by the §18.1 table (`MIGRATE_CARDS`); unknown ids become a Medium basic attack; grafts and upgrades carried over |
| 6 | Phase 7 | the run gains `exFound` and the EX statistics (empty for older saves; a damaged record is repaired); the Museum record — stored separately — gains `combos` (the Combo Journal), absent = empty, normalised idempotently (§28) |
Battles are never saved mid-fight (a Continue restarts the encounter), so combat state needs no migration. Museum records keep their fields; new fields default safely.

## 20. Interface

| Element | Phase | Behaviour |
|---|---|---|
| Party HP bar | 3 | one bar at the top left of the battlefield (above the party, under the act label) with Guard after the HP and the damage enemies are winding up (after Defense, minus Guard) shown pulsing at its end; same bar in the run header instead of three |
| Hero plate | 3 | name, Defense % shield, statuses (Weak, Cover, Braced) |
| Incoming ring | 3 | red ring on the targeted hero; "▼ n" = damage after Defense; moves to Hessa under Cover |
| Hand | 4 | six persistent slots, placeholder while a card is queued, next-card preview |
| Card face | 4 | category banner (Basic / Arte / Support), rank, cost pips, owner initial; illegal reason line as today |
| Hero selector | 5 | three hero buttons showing state (Ready / Active / Acting / Recovering with a countdown); tap to choose who starts a chain or receives a Relay |
| Queue strip | 5 | queued commands in order; tap to cancel an unstarted one |
| Decision window | 5 | today's Flow bar: HOLDING while executing, BREATHER after the chain |
| Relay | 5 | tapping a Ready hero during a chain queues "Relay to X"; disabled heroes explain why |
| Target | all | R4 unchanged |
All new text in English and Russian; layout checked at the seven sizes of `tools/i18n-layout.mjs`.

## 21. Prototype values

| Key | Value | Phase |
|---|---|---|
| `PARTY_MAX_HP` | 130 (46 + 34 + 38 + `PARTY_HP_BONUS` 12) | 3 |
| `DEFENSE` | V 0.30, S 0.15, C 0.00 | 3 |
| `BRACED_BONUS`, `DEFENSE_CAP` | +0.20, 0.60 | 4 |
| `COVER_SECONDS` | 4 | 3 |
| `SWITCH_THRESHOLD` (Dead Man's Switch) | 25% of party max | 3 |
| Basic ranks / Momentum | Weak 1 +1, Medium 2 +1, Strong 3 +2 | 4 |
| Arte ranks / costs | 4 → 2, 5 → 3, 6 → 4 | 4 |
| `QUEUE_AHEAD` | 3 | 5 |
| `ACTION_TIME` | 0.6s per card (animation length) | 5 |
| Recovery | segment 1.5s + 0.3s per card; support 2.0s | 5 |
| Participation limit | each hero once per chain | 5 |
| Relay | +1 Momentum; +10% on the incoming first card per Relay | 5 |
| Decision window | 5.0s, hold 1.2s at start and after each Relay, hold while executing, refund 1.0s per card (cap 5s), cap 14s, +FLOW 1.5s | 5 |
| `SEGMENT_READ_GRACE` | 1.2s hold after the incoming hero's first card has executed (at most twice per chain) | 6 |
| Breather | Perfect 1.0, Cash Out 0.8, Dropped 1.2 | kept |
| Enemy pace / spacing | ×0.70 / ×0.82 / ×0.90; 1.2s | kept |
| Tactical mode | enemy ATB ×0.25 while deciding | 5 |

## 22. Dependencies and phase plan

```
Phase 3  shared HP + Defense ─┬─► Phase 4  card categories, persistent hand, Momentum ─► Phase 5  scheduling, queue, Relay, decision window
                              │                                                            │
                              │                                                            ├─► Phase 6  Act I onboarding and tuning
                              │                                                            ├─► Phase 7  EX combos, journal, builds
                              └──────────────────────────────────────────────────────────► Phase 8  all content converted (needs 4, 5, 7)
Phase 9 meta-progression (needs 8) ─► Phase 10 presentation (needs 5–8) ─► Phase 11 content pass (needs 8) ─► Phase 12 release
```

| Module | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|
| `engine/combat.js` (rules) | HP pool, Defense, Cover, no KO | categories, legality, hand, Momentum accounting | heroes' states, queue, Relay, window | — | recipes | remaining effects |
| `engine/run.js` (party, rewards, events API) | pool, heals, max HP, migration | card rewards and shop pools | — | Act I formations reviewed (unchanged) | — | all events, services |
| `engine/save.js` | v4 | v5 | — | — | v6 | — |
| `data/cards.js` + `i18n/ru.js` | one card text (heal) | representative set + starter deck | — | — | combo cards | full catalogue |
| `data/relics.js`, `mutations.js`, `adaptations.js` | Dead Man's Switch, heal relics, Glass Cannon, Brass Metronome text | role-based relics | Flow wording | — | — | rest |
| `data/events.js` | HP wording and amounts | — | — | — | — | review |
| `render/battleView.js` | party HP bar, hero plates, Cover | card banners | hero states, queue, Relay choreography | telegraphs | EX effects | — |
| `ui/battleScreen.js`, `cardView.js` | HUD text | persistent hand, next card | hero selector, queue strip | tutorials | journal tracking | — |
| `ui/screens.js` (map header, rest, shop, results) | party HP | rewards | — | — | Museum journal | — |
| Tools (`milestone`, `simulate`, `pacing`, `encounter`) | read party HP | bot plays categories | bot uses heroes, Relay | onboarding checks | recipe checks | full runs |

## 23. Regression risks

| Risk | Where | Guard against it |
|---|---|---|
| Old saves fail to load or lose HP | save migration v3→v4→v5 | migration unit tests with captured v3 save fixtures |
| Healing/damage values change balance silently | §18.6 conversions | conversion table in tests; pacing and full-run simulation before/after |
| Cards that referred to knockouts, roles or owner-change Relays keep old behaviour | effect scripts | grep-based test that no effect reads `ko`, `role`, or owner-change Relay after Phase 8 |
| Bots and tools assume the old hand | milestone, simulate, pacing, encounter, targeting | update tools in the same phase as the engine change; never leave a phase with a broken tool |
| Loss of 0.2.2 usability outcomes | timing, targeting, layout | R1–R7 checks in every phase report |
| Russian text and layout drift | new strings | `i18n` key test (every key translated, no unused keys); layout check |
| Momentum double spending or gains from cancelled actions | queue | unit tests: reserve/spend/release; cancel yields nothing |
| Card instances lost or duplicated by the queue | zones | `verifyZones()` includes the queue; randomized soak test (existing) extended |
| Boss adaptations that disable a strategy outright | Phase 8 | each adaptation keeps a reachable break condition (test per adaptation) |

## 24. Decisions taken in this specification

Each is reversible; listed so they can be challenged.
1. **Suits stop deciding legality** and remain a bonus layer (§5.3). Reason: ascending ranks plus suits plus categories made legality hard to read; the suit-based relics, mutations and adaptations keep working as bonuses.
2. **Skipping ranks is legal**; ranks must strictly ascend within a segment.
3. **An arte needs one earlier basic attack in the same segment** and its owner must be the active hero; no further prerequisites.
4. **Each hero joins a chain once** (three segments at most) for the initial design.
5. **Defense is a percentage** applied before Guard, with a minimum of 1 damage per hit.
6. **Healing and damage that hit every ally triple** when converted to the pool, preserving their total.
7. **Momentum is reserved at commit, spent at execution, gained at resolution.**
8. **The decision window holds while commands execute**, replacing the fixed 0.7s per-card hold.
9. **Cover** is Hessa's protective identity from Phase 3, triggered by her Guard cards.

## 25. Phase 4 as built (0.2.4) — interim bridges and open questions

*Phase 5 (0.2.5) replaced the command, hero-selector, support, Braced and ending bridges below; §26 records what changed. The two open questions remain open.*

Phase 4 implements §5, §6, §8.2, §10 (effects), §11 and §12 and the save migration of §19. Phase 5 has not started, so a few rules run through deliberate, replaceable bridges. Each is listed here so Phase 5 can remove it without touching card effects.

**Bridges (to be replaced in Phase 5)**
- *Commands run back to back.* `playCard` = `commit` (validate, move the card to the queue zone, reserve its cost) then `execute` at once (spend, resolve, gain, discard, refill). `cancel` exists and is tested, but no player-facing queue does. The hand slot is held while a command waits (`heldSlots`), so Phase 5 can show the placeholder of §6.
- *Hero selector instead of hero states.* Three buttons above the hand (and a tap on the hero, keys Q/W/E) choose who performs basic attacks and starts the next combo; a combo keeps its hero until it ends. There are no Ready/Committed/Acting/Recovering states, and switching heroes mid-combo is refused rather than becoming a Relay. The selection stays on the hero who last started a combo (§8.1's default).
- *Support executes immediately and costs no Recovery.* It may be played before, during or outside a combo; it never starts, extends, ends or pauses one and changes no combo state. Its performer is its owner, or the selected (or attacking) hero when it is neutral. Phase 5 adds the performer's 2.0s Recovery. Until then support costs are the only opportunity cost, which is why the Phase 4 costs are higher than the §10 minimum (below).
- *Braced picks its hero automatically*: the hero the most imminent single-target enemy attack will land on (after Cover), else the hero hit last, else the performer. Phase 5 may add the tap-to-choose of §10.
- *Endings.* After an arte the combo ends as a Perfect by itself when the hero has no playable higher card; otherwise the end button reads FINISH (a Perfect) and the clock or a higher arte decide. CASH OUT is offered only when the last card is a basic attack (§12.2). A timeout or third Stumble after an arte counts as a Perfect (§12.3).

**Content conversion (§18)**
- Every card has a `category`. Of the 78 earlier cards (Glitch aside, unchanged), 68 are converted (`p4: 'converted'`) and 3 new ones were added (Piston Strike, the Strong basic attack; Hold the Line, the Braced support; Spare Parts, a Churn utility). Playable now: 24 basic attacks, 38 artes, 13 support cards; rewards, shops and events draw from 64 of them (starter cards excluded as before).
- Four Rewind cards (Rethread, Prism Cut, Downshift, Cache Hook) run as interim artes or basic attacks for decks that already hold them (`p4: 'compat'`) but are not offered until their "technique" conversion in Phase 8.
- Six cards that only work with Relays (Mirror Wire, Hand Off, Relay Baton, Chorus Break, Grand Relay, Pressure Valve) are withheld (`p4: 'withheld'`). Save version 5 replaces them with a converted card of the same hero and rarity.
- Relay content is kept but not offered until the Relay command exists: the relics Echo Splice and Relay Harness, the mutation Relay Resonance and the graft Echoing. Owned copies do nothing yet. Echo Splice was a starting relic unlocked by winning a run; that unlock now gives Spare Pockets.
- Relic conversions applied: Iron Filings (each basic attack +1 Guard), Kettle Drum (artes in 5+ card combos +25%), Wild Hinge (a Cross also counts as a Step). Quick graft: +0.5s.

**Prototype values set in Phase 4** (card data, not `RULES`): basic attacks Weak 5–7, Medium 7–9, Strong 10–13 damage (base/upgraded). Support costs: Salvage 0, Brace Up 1, Riposte Frame 1, Vault Guard 1, Ward Weave 1, Hold the Line 1, Signal Boost 1, Mend Circuit 2, Iron Oath 2, Counterweight 2; Low Gear, Spare Parts and Shuffle Step free. Braced lasts 6s (9s upgraded). The first measured Phase 4 build had Mend Circuit at 1 Momentum and Iron Oath and Brace Up cheaper: the simulated regular player then lost 0.1 HP per battle (`docs/AUDIT.md`, Phase 4), so those costs were raised.

**Two rules added in Phase 4 against stranded hands (R5), prototype.** A persistent mixed hand can fill with cards that cannot start a combo. In the first full UI playthrough the deck grew to 33 cards with many artes, the hand held six artes and no basic attack, the Churn charges ran out, and the party lost the final boss with the boss at 38 HP.
- *Free Churn while stranded:* before a combo, when no card in the hand or Reserve is playable, Churn costs no charge (the strip reads "NOTHING PLAYABLE · CHURN IS FREE" and the Churn panel shows FREE).
- *Basic attacks in rewards:* when fewer than 40% of the deck are basic attacks, the first card a reward offers is a basic attack. Shops and events are unchanged.

**Open questions for the Phase 5 design review** (the provisional §9/§14 decisions stand until then)
1. Whether a standard Relay requires an arte in the outgoing segment, or may follow any qualifying segment (§9 currently: any segment with at least one card).
2. Whether a queued attack locks its target when committed or uses the target selected when it executes (§14 currently: at execution).

## 26. Phase 5 as built (0.2.5) — scheduling, queue, Recovery, Relay

Phase 5 implements §7, §7.1, §9, §10 (scheduling), §11.3, §12, §13, §14 (timing of targets) and §16, and restores the Relay content of §18. All values are *(prototype)* entries in `RULES`.

**Hero states (§7).** Each hero's state is derived from authoritative facts, so two states never disagree (`combat.heroState`):

| State | Holds when | May |
|---|---|---|
| ACTING | the executing command is this hero's | nothing new |
| RECOVERING | `heroes[id].recoverUntil` is in the future | nothing |
| ACTIVE | the hero runs the chain's current (executed) segment; more of its cards may wait in the queue | add basic attacks and own artes; Relay out; FINISH / CASH OUT |
| COMMITTED | it has a queued support command, or is the destination of a queued Relay | nothing new |
| READY | none of the above | start a chain, receive a Relay, perform support |

Transitions: READY → (commits the chain's first card) ACTIVE/ACTING → (Relay resolves) RECOVERING for the outgoing hero, COMMITTED → ACTIVE for the incoming one → … → (chain ends) RECOVERING → READY. Support: READY → COMMITTED → ACTING → RECOVERING (2.0s) → READY. Recovery after a segment is 1.5s + 0.3s per card the hero played in it, starting when the segment closes (the Relay resolves, or the chain ends). Recovery runs in combat time, so pausing freezes it; it never pauses enemies. The next chain starts with the selected hero if Ready, otherwise the first Ready hero in party order; with every hero recovering the player waits (at most a few seconds) and enemies keep acting.

**Commands (§7.1, §11.3, §16).** One queue for the party; up to `QUEUE_AHEAD` = 3 commands wait behind the executing one; they execute strictly in order. Kinds: card (basic attack or arte), support, Relay, finish (FINISH or CASH OUT). Each command has four moments:
1. *Commit*: validated against the **projected chain** (the executed chain plus every command still to execute) by `check()`, `relayCheck()` or `finishable()`; a card leaves its slot (the slot shows a placeholder and does not refill) or its Reserve place (kept for it); its rank and suit are frozen into the command; its Momentum cost is reserved.
2. *Start*: the queue's head is revalidated against what has executed; the reservation becomes a spend; the hero's animation starts (`act`). Card and support commands execute for `ACTION_TIME` = 0.6s, a Relay for `RELAY_TIME` = 0.5s, a finish at once.
3. *Resolution*: at the impact frame of the hero's animation (`RESOLVE_AT`: melee 0.27s, cast 0.38s, shoot 0.25s, guard 0.15s, buff 0.2s, Relay 0.25s): damage, healing, Guard, statuses, Momentum gains and refunds happen now; the card goes to the discard pile and its slot refills.
4. *Completion*: support starts its performer's Recovery; the chain's first card and each Relay open their decision-window hold; a requested ending happens; otherwise a chain that cannot continue at all ends as a Perfect (below).

Momentum is never projected: an arte needs Momentum the party already has, unreserved. A waiting command can be cancelled (tap its chip or its placeholder, or Backspace): its card returns to its slot or Reserve place, its reservation is released, nothing else happens; every later command is revalidated in order and those that no longer fit (for example the cards of a cancelled Relay's incoming hero) are returned too. A started command cannot be cancelled. When a chain ends early (timeout, third Stumble, Cash Out, Clean Exit) its unstarted commands return; a command already executing finishes first, and the ending is judged on what executed. Support commands are not part of a chain and stay queued. Victory or defeat clears the queue: waiting cards return, an executing card that has not resolved goes to the discard pile without effect. `verifyZones()` checks one zone per card (draw, hand, Reserve, queue, executing, discard, exhaust), held slots against queued cards, reservations against the queue, that no queued command is illegal, and that Momentum is not negative.

**Relay (§9).** "Relay to X" is a command, requested by tapping another hero's button (or the hero on the field, or Q/W/E) while a chain runs; heroes who can take it show ⇄, others explain why not. Eligibility (`relayCheck`, one function): a chain is open; the current segment has at least one executed or queued card; X is Ready and has not joined this chain; the queue has room. `RULES.RELAY_NEEDS_ARTE` (default false) is open decision A's alternative. On resolution the outgoing hero's segment closes and its Recovery starts; X becomes active with segment rank 0 and must open with a basic attack; the chain's history (cards, damage, Relays, Steps, Crosses, heroes, segments) carries on. Rewards, once, on resolution: +1 Momentum (none under Relay Jammer, which still allows the Relay); X's first card +10% damage per Relay so far; the decision window holds 1.2s after it. Each hero joins a chain once: at most three segments and two Relays. Playing another hero's card never creates a Relay. Relay Echoes repeat the outgoing segment's **last attack** (the last card that dealt damage).

**Support (§10).** Performed by its owner, or — when neutral — by the selected hero if Ready, otherwise the first Ready hero in party order. It needs its performer Ready (an attacking, acting, committed or recovering hero cannot), enters the shared queue behind the commands already there, never touches the chain's rank, cards or ending, and costs its performer a 2.0s Recovery. A hero committed to support cannot take a Relay. Braced (Hold the Line) asks for its hero: the first tap opens the hero picker (default: the hero the most imminent single-target enemy attack will land on); a hero button, a hero on the field or Q/W/E commits it; ✕, Escape or a tap elsewhere cancels without spending the card; tapping the card again uses the default. Support costs were not changed in Phase 5.

**Endings (§12).** FINISH and CASH OUT are queued behind waiting commands and judged when they execute. FINISH needs the chain's last card (projected) to be an arte; CASH OUT 2+ cards ending on a basic attack; neither while a Relay is the last thing queued. A chain no longer ends automatically after an arte while a Relay is still possible: it ends by itself only when the last executed card is an arte, nothing higher is playable and every hero has already joined it. A timeout or a third Stumble while a command executes waits for that command, then ends; after an arte it counts as a Perfect. A Finisher triggers once per chain (5+ cards or a rank-6 arte).

**Decision window (§13.2).** Opens at the chain's first commit (5.0s; Stopwatch Gear +1.0s on the first chain). Holds while any command executes, for 1.2s after the chain's first card completes, for 1.2s after each Relay completes, and while paused. Refunds (1.0s per card after the first, cap 5s per chain) arrive when a card resolves; cancelled cards refund nothing. The counted time stays capped at 14s (holds excluded), so queueing cannot extend a chain without limit. Flow drain leaves at least 0.5s.

**Enemies and time (§13.3–13.5).** Enemy ATB fills during selection, execution and hero Recovery; it waits during the post-chain breather (Perfect 1.0s, Cash Out 0.8s, Dropped 1.2s) and the Finisher cut-in, and freezes while paused. During the breather no new command can be committed (it stays a short party pause; Churn and Reserve still work). Optional **Tactical timing** (Settings, off unless chosen): while a chain is open and nothing is executing or queued, enemy ATB runs at 25% speed; nothing else changes. Everything advances in fixed steps of at most 1/60s, so outcomes do not depend on frame rate beyond one step.

**Targets (§14).** Attacks use the enemy selected when they resolve (open decision B keeps the specification's default). `currentTarget()` is the only resolution point, so a lock-at-commit alternative would change one function. If the selected enemy dies while a command waits, the next living enemy is chosen and labeled NEW TARGET before the command resolves.

**Interference (§17).** Locks and Scrambles only affect cards in the hand or Reserve; a committed card keeps the rank and suit it was committed with. Jams never pick a held slot. Momentum Drain and every Momentum loss take unreserved Momentum only. An effect that raises the chain's rank (The Corruptor's Context Bleed) makes a waiting card illegal: it is returned at once (the queue is revalidated after every enemy action and every resolution), never executed. A Reserve card that is queued keeps its Reserve place, so cancelling it always fits; Reserve latch steals stored cards only.

**Stranded hands (§25).** Free Churn is judged on the cards and Momentum alone: heroes recovering, a full queue or a command executing are a wait, not a stranded hand. The reward rule (a basic attack first under 40% basic attacks) is unchanged.

**Interface (§20).** Hero buttons show each hero's state from the engine (▶ acting, a countdown and bar while recovering, … committed, ⇄ can take a Relay); the strip shows the executed cards, a ⇄ where a Relay handed over, the executing command (glow and progress) and the waiting commands (dashed; tap to take back, ↩); held hand slots show the queued card with QUEUED #n or ACTING; the battlefield shows Recovery as a thin bar under the hero plate, the hand-off as an arc between heroes and "RELAY n · +b%" over the incoming hero; the Flow bar reads EXECUTING, HOLDING or the time left, and ALL HEROES RECOVERING with the shortest wait.

**Content (§18).** Restored: the relics Echo Splice (back as the win unlock) and Relay Harness, the mutation Relay Resonance, the graft Echoing ("as the first card after a Relay, Echoes itself at 30%") and the cards Mirror Wire, Hand Off (its Relay Echo targets the last attack), Relay Baton, Chorus Break ("each first card after a Relay") and Grand Relay. Pressure Valve stays withheld: it is not a Relay card and repeats Overpressure at a lower value (Phase 8 content pass). The save-version-5 migration table is fixed as shipped in 0.2.4, so older saves convert exactly as before; no new save version (combat scheduling is never saved; Continue restarts the encounter).

**Open design decisions** (unchanged; evidence in `docs/AUDIT.md`, Phase 5)
- A. Whether a Relay requires an arte in the outgoing segment (implemented: no; `RULES.RELAY_NEEDS_ARTE`).
- B. Whether a queued attack locks its target at commit (implemented: target at execution; `currentTarget()`).

## 27. Phase 6 as built (0.2.6) — onboarding, Relay accessibility, Act I tuning, telegraphs

Phase 6 changes presentation and Act I balance on top of §26; the scheduling architecture is unchanged. Measurements and the reasoning behind each change are in `docs/AUDIT.md` (Phase 6).

**Progressive lessons (`src/ui/lessons.js`).** The start-of-battle tutorial cards are replaced by 28 short lessons, one idea each (50 words at most), shown once at the moment their mechanic becomes relevant in a real battle and pausing the battle while open. `pickLesson()` reads the engine's public state only (a unit test checks it changes nothing) and returns the first relevant unseen lesson with an anchor the screen spotlights (a hand slot, a hero button, an enemy, a control).
- First battle (Lessons 1–4 of the plan): *first attack* (a basic attack is playable before any combo; hero buttons and target choice), *enemy turns* (an enemy winding up a hit), *rising ranks* (a combo is open), *no need to wait* (a card executes and another legal card is in hand), *arte* (an arte is playable), *finish* (the projected last card is an arte), *take it back* (a card is waiting in the queue).
- Relay (Lesson 5): shown only when a Ready hero who has not joined the chain has an arte in hand and the decision window is held or has 2.5s+ left — a realistic opportunity, a two-hero Relay. Three-hero chains are left to play.
- Recovery and support (Lesson 6): *recovery* (a hero recovering after the first chain, or a tap refused because a hero is busy), *support* (a support card is playable while the party is hurt or an enemy winds up), *cover* (Hessa's Cover is active).
- The hand (Lesson 7): *churn* (a Glitch or a stranded hand, or no basic attack in hand after the first chains), *reserve* (during a combo, an arte of a hero who cannot act in it), *stumble* (after the first Stumble).
- Later decisions (Lesson 8, `late`: never in the first battle): *cash out* (a combo ending on a basic attack with under 2.2s of Flow), *little Flow left* (a Relay is possible after an arte with under 1.6s), *heavy hit* (a single hit of 11+ after Defense winding up), *hits every hero*, *summons*, *enemy Guard* (10+), *Flow theft* (a drain intent winding up during a combo), *boss* (the first seconds of a boss fight).
- Interference, the first time each happens: Lock, Scramble, Jam, Glitch, Reserve latch.
- Tactical timing: after a Dropped combo, while the setting is off, *too little time?* names the option (it never switches it on).
- Pacing: at least 2.0s of battle time between lessons; at most 14 in the first battle (an upper bound: each needs its moment) and 3 in later battles; lessons that do not fit wait for a later battle. `need` orders lessons only where one builds on another (ranks after the first attack, the queue after ranks, cancel after the queue, FINISH and Relay after the arte, Cover after support, late Relay after Relay, Cash Out after ranks); no lesson gates progress, so a missing card, a dead target, another hero or a lost battle can never block the run.
- Persistence: a lesson is recorded as seen when it is dismissed (`meta.tut`), so a reload while it is open shows it again. *Skip all tips* (on every lesson card) switches the existing Tutorial hints setting off; it stays off until switched on again. Settings → Replay tutorial hints clears the record (and switches tips on) without touching runs, unlocks or the current run. How to Play lists every lesson for rereading. Returning players: a profile that finished the first battle, or saw the 0.2.5 tutorial cards, has the introductory lessons marked as learned once (`migrateLessons`); newer contextual lessons still appear once.
- Keyboard: Enter, Space or Escape close a lesson.

**Relay accessibility.** After the incoming hero's first card has executed, the decision window holds `SEGMENT_READ_GRACE` = 1.2s, the same hold the chain's first card has always had: the player reads which of the new hero's artes is now within reach. At most two such holds per chain (two Relays); holds never count against the 14s counted cap, so no sequence of Relays extends a chain without limit. The Relay hold (1.2s) and every other timing value of §21 are unchanged. The interface adds an amber ⇄! on a hero who can take a Relay when under 1.6s of Flow is left (title: FINISH or CASH OUT is safer) and the *little Flow left* lesson; Relay eligibility (`relayCheck`) is unchanged.

**Act I enemies.** Hound Mother summons at most 3 litters per fight (`litters`), and each whelp is a smaller Rush Hound (60% HP, `whelpHp`; `summon(id, src, { hpScale })`); she still opens by whelping, Rallies the pack and Mauls. The other Act I formations, enemies, elites and both bosses are unchanged.

**Telegraphs.**
- *Hold an enemy* (480ms): the battle pauses and a panel shows its HP, Guard and statuses, its next move with the time until it acts, and the damage in the engine's own numbers — a single hit after the target's Defense (and that Cover moves it to Hessa), an area hit per hero after Defense and in all, both before Guard, which is named separately because it can still change. Special intents show their description (all 50 in English and Russian).
- *Area attacks* show the hit on each hero with three hero dots instead of "n×3" (which suggested a total before Defense).
- *Flow theft*: `imminentDrain()` gives the Flow a drain intent winding up (from 55% ATB) would take; the Flow bar shows it as a blinking red end and reads "THEFT −n". Drain intents carry their amount (`flow`).

**Unchanged (open decisions and settings).** Decision A (`RELAY_NEEDS_ARTE` false) and decision B (targets at execution, `currentTarget()`) keep their defaults. Tactical timing stays off by default; Relaxed assist and Reduced motion are unchanged. Save version 5; lesson progress lives in the meta record, which already existed.

## 28. Phase 7 as built (0.2.7) — EX Combo recipes, discovery and the Combo Journal

Phase 7 adds recognition of deliberate sequences on top of §27; the scheduling architecture, the card categories, Momentum and the chain endings are unchanged. Measurements are in `docs/AUDIT.md` (Phase 7).

**What a recipe is.** A data entry in `src/data/recipes.js`: `id`, `tier` (accessible, intermediate, advanced), explicit `priority`, `on` (`card` or `end`), `tags` (the build archetypes it belongs to), `kind` (offense, defense, utility), `support`, the texts (name, how, effect, hint, purpose; Russian in `src/i18n/ru.js`), `seq` (the Journal's chips), `match(x)` and `fx(api)`. An EX Combo is not a card, a card category, the EX suit (which stays a suit), a Finisher or Relay Echo, and has no resource or special card of its own: every recipe is built from cards the player already plays.

**Execution history.** Each chain keeps the executed card entries (`cards[]`; Phase 7 adds the printed strength of a basic attack, `disrupted` — the card had been Locked or was Scrambled when played —, `coverUp`, and the card's uid) and a compact ordered log of executed events (`log[]`): `card`, `relay`, `support` (performer, the attacking hero, HP actually healed, Guard, Cover — only while the chain is active), `churn` (with the card it drew), `stash`, `flow` (Flow the player gained: +FLOW or a card). Queued, cancelled and never-executed commands never enter it; support outside a chain is never attributed to one. The record lives and dies with the chain; nothing is scanned per frame.

**Evaluation points.** Exactly two: when a basic attack or arte resolves (after its own effects, after the card has moved to the discard or exhaust pile) — recipes with `on: 'card'` —, and when a chain ends (Perfect, Cash Out, Dropped, and a Clean Exit or Finisher Cash Out whose payout itself ended the battle) — `on: 'end'`. Order on one command: impact → card effects → recognition → EX effects in ascending priority → terminal cleanup. A recipe triggers at most once per chain (`chain.ex`); every recipe the command completes triggers. Damage shares are taken from the chain's damage before that command's EX effects, so overlaps do not compound. Matching changes no legality, queue or zone; a recipe that throws is treated as not matching.

**No recursion.** EX effects never go through card resolution, support or chain endings. Flow from an EX effect carries no source and so can never complete Second Wind; an EX Echo evaluates no recipe.

**Terminal events.** When the command's own damage ends the battle, the activation is still recognised — recorded in the Journal and the statistics, shown with "the battle was already won" — but its effect is not applied. Victory and defeat cleanup is unchanged; a command still in its follow-through when the battle ends no longer stays marked as executing (fixed in this phase).

**Effects (bounded).** A strike for a share of the chain's damage with a minimum, to the current target (targets are taken at execution, §14) or to every living enemy; a flat strike; Guard; healing; Momentum (cap 10); Flow (only for the live chain, inside the counted cap); a Churn charge (cap); Exposed; Counter; Cover (+seconds only while Cover is up); an Echo of a given arte; lifting every Lock on the player's cards. EX damage is ordinary damage: Guard blocks it, Weak, Exposed, Parry and the Protocol Auditor's citations apply, and the boss Suit Filters apply by the suit of the card that completed the recipe; it is not arte damage, so it never advances Guard Piercer. Lifting Locks (including a boss's hardened Locks) is Interference Reversal's explicit property.

**The catalogue (15).**

| Priority | Recipe | Tier | Builds | Completes on | Effect |
|---|---|---|---|---|---|
| 10 | Straight Circuit | accessible | ladder | the arte that follows Weak, Medium, Strong basic attacks opening one hero's part | strike 25% (≥5), +1 Momentum |
| 12 | Salvage Circuit | intermediate | churn | an arte, once the card a mid-combo Churn drew has been played (it may be the arte) | +1 Churn, +1 Momentum |
| 15 | Stored Strike | accessible | reserve | an arte after a basic attack played from the Reserve in the same part | strike 20% (≥5), +1 Momentum |
| 20 | High Climb | intermediate | ladder | an arte of rank 5–6 with three Steps in the part | Exposed 5s, +2 Momentum |
| 22 | Second Wind | intermediate | flow | the 6th card of a combo in which the player extended Flow | +1.5s Flow, 6 Guard |
| 25 | Prism Sequence | intermediate | variant | an arte in a part that holds A, B and EX suits | 3 per Cross to every enemy (3–15) |
| 30 | Cross Current | accessible | variant | an arte after two Crosses in the part | +1 Momentum, +1 Churn |
| 35 | Pressure Release | intermediate | momentum | the arte that brings Momentum spent on artes in the combo to 8 | 8 Guard, +2 Momentum |
| 40 | Tandem Signal | intermediate | relay | the incoming hero's first arte, of the same suit as the arte that ended the previous part before the Relay | that arte Echoes at 30% |
| 42 | Healing Cadence | intermediate | guard (support) | the attacker's next card after another hero's heal restored HP during the combo | +1s Flow, heal 4 |
| 45 | Iron Harmony | intermediate | guard (support) | Corvin's or Pin's arte while the Cover Hessa's Guard support started in this combo is up | Counter 6, Cover +2s |
| 50 | Three-Way Circuit | advanced | relay | the arte that gives all three heroes an arte in one combo | 15% (≥5) to every enemy, +1 Momentum |
| 55 | Interference Reversal | intermediate | interference | an arte after a card that had been Locked or Scrambled was played | strike 25% (≥5), every Lock lifted |
| 60 | Quick Settlement | accessible | cashout | a Quick Cash Out (2.5s+ Flow left) of 3+ cards with a Cross | 25% of the payout as damage, +1 Churn |
| 70 | Final Harmonic | advanced | ladder, relay | a rank-6 arte in a three-hero combo of 6+ cards | 30% (≥12) to every enemy, 10 Guard |

Every archetype has at least one recipe. With the starter deck alone the recipe lab's deliberate player reached 10 of the 15 in Act I fights; all 15 were reached by drafted decks (`tools/recipelab.mjs`). Material changes from the assignment's candidate table (all measured, `docs/AUDIT.md` Phase 7):
- *Second Wind* is added: the Flow Extension build had no candidate.
- *Tandem Signal* ("two heroes each land an arte in one Relay chain") needs the outgoing hero's part to end with the arte and the incoming hero's first arte to share its suit: ordinary Relay play completed the candidate in most two-hero chains (1.8 per battle for the ordinary quick bot).
- *Three-Way Circuit* ("two Relays and a payoff from the third hero") needs an arte from each of the three heroes, for the same reason.
- *Quick Settlement* needs a Cross in the cashed-out combo: two thirds of all Cash Outs were already Quick Cash Outs of three cards.
- *Salvage Circuit* ("a card-management action contributes to a later sequence") needs the card a mid-combo Churn drew to be played: Churning a dead card before any arte was free value every chain.
- *Pressure Release* asks for 8 Momentum on artes, not 6, which two artes of two heroes paid routinely.
- *Healing Cadence*'s "meaningful continuation" is the attacking hero's next card after the heal, and the heal must restore HP (a heal at full HP does not count).

**Discovery policy.** A recipe is discovered the moment it activates: the Museum record (`meta.combos`: `{ id: { at, count } }`) is updated and saved at once, and stays so if the battle is then lost, abandoned or restarted. The run's own EX statistics and `exFound` count finished battles only (merged when the battle ends), so a restarted encounter's activations reach the Journal but never count twice for the run. Unknown ids in the record are kept (a later build may know them) but never shown or counted. Undiscovered recipes work exactly like discovered ones.

**Presentation.** One banner per command (`.banner.tone-ex`, distinct from Step, Cross, Relay and Finisher feedback): the EX plate, the names joined with "+" in priority order, the sequence as symbol chips (why it triggered), the effects actually applied (what it did), and "NEW EX COMBO DISCOVERED" only on a first discovery; held 2.6s (new) or 1.7s; nothing pauses; it sits above the field, not over the hand or the controls. EX damage numbers are cyan. Reduced Motion removes its zoom and slide; its sounds follow the audio settings. The first discovery opens one short lesson (*EX combo*) once the banner has faded; later discoveries never interrupt. There is no permanent recipe row.

**Combo Journal.** The Museum's sixth tab: how many of the 15 are discovered; discovered recipes in full (name, activations, tier, kind, build, the sequence in chips with words, how, effect, purpose); undiscovered ones as "???" with their tier, kind, build, "?" chips and the hint; filters by kind, Relay, support and difficulty and by build. Touch and keyboard (buttons and a select); both languages; offline (local storage).

**Statistics.** Combat: `exActivations`, `exByRecipe`, `exOverlaps`, `exDamage`, `exGuard`, `exHeal`, `exMomentum`, `exFlow`, `exChurn`, `exChainCards`, `exRelay`, `exSupport`, `exUnapplied`; the run summary adds `ex` and `exRecipes`; the results screen has one compact line (EX Combos: activations · recipes). `RULES.EX_COMBOS` (true) switches recognition off for measurement tools only; nothing in the game exposes it.


## 29. Phase 8 as built (0.2.8) — techniques, content completion, reward economy

**Techniques.** The four former compatibility cards (Rethread, Prism Cut, Downshift, Cache Hook) are *techniques*: support cards (`tech(v, fromReserve) → { rewind, suit }` in `src/data/cards.js`) that a free ally performs inside the attacking hero's open combo. Rules:

- Legal only while a combo is projected open, not finishing, with at least one card already in the current part (`check()` reasons `nocombo`, `finishing`, `needcard`; the first two are shown on the card face).
- Performed by the support performer rule (owner if Ready, else the selected or first Ready hero) and never by the attacking hero: a technique owned by the attacker is refused.
- The effect is projected into the queue (`applyProj` lowers `P.rank`, sets `P.variant`), so the cards queued after it are judged against the lowered rank; it is a chain command (`isChainCmd`), cancelled with the combo and revalidated like an attack.
- On resolution it lowers `combo.rank` by its value (floor 0) and, for Prism Cut, makes the combo's suit EX, so the next A or B card Crosses. It never rewrites cards already played, Steps or Crosses; it is logged `{k:'tech'}` and counted in `stats.techniques`.
- Auto-finish waits while a technique is playable.
- Values: Rethread −2 (−3 upgraded); Prism Cut −1 (−2) and EX suit; Downshift −4 (−5) and +1s (+1.5s) Flow; Cache Hook −1 (−2), from the Reserve −2 (−3) and +1 Momentum. Cards show "Technique" as their role word; a lesson introduces them the first time one is playable mid-combo.

**Pressure Valve.** Corvin, rank 5, cost 3: deal 6 (7), then vent up to 3 (4) more Momentum, each vented point adding the base damage again and 3 Guard. Momentum above the cap stays. Overpressure spends everything; the Valve spends a bounded amount and keeps the rest. `spendMomentum(max)` accumulates `entry.spent`, so Pressure Release reads every arte's full spend (before Phase 8 only the last spend was kept).

**Content fixes found by the audit** (each with a test in `tests/content.test.mjs`, `tests/adaptations.test.mjs`, `tests/events.test.mjs`):
- Reserve Seal's break and Deep Pockets now count support played from the Reserve.
- Rank changes (events, surgery, mutations, loading) stay inside the card's category: basics 1–3, artes 4–6 (`RANK_RANGE`, `gaugedRank`).
- Keen, Breaker, Echoing and Ledger only go on attacks (`graftFits`).
- Hardened Locks is only chosen against a boss that Locks (`locks: true`, `adaptationApplies`).
- Shop heal and rest options that would do nothing are refused with the reason.
- Event card selections:
  - a selection no card can take is refused up front (`needs`);
  - a price is paid when the card is chosen (`cost`), so cancelling is free;
  - a trade whose reward comes first is `required`;
  - a traded relic never comes straight back;
  - the Rust Oracle's text matches what it does (one graft, chosen by the Oracle).

**Boss evidence.** Each measure is compared with its typical value at that act's boss (`EVIDENCE_TYPICAL`, medians of ordinary simulated campaigns; score 1 = 15% above typical; a habit at 0.6 still counts when nothing stands out). Before, fixed thresholds from before artes cost Momentum made Momentum Siphon the adaptation in 87 of 89 simulated boss fights; now ten of the eleven appear.

**Reward economy.**
- The build direction is what the player acquired: cards beyond the starter deck (each starter id skipped as often as the starter holds it), non-starter relics, and mutations (counted double).
- With a direction (the most-held tag, held twice or leading alone):
  - the first offered card leans into it (60%);
  - the second leans into the second direction (40%), or the lead (30%);
  - the last card is always a pivot to an archetype outside the top two.
- Without a direction, the offered cards come from different archetypes.
- A lean or pivot whose tag has no card at the rolled rarity takes the nearest rarity (Reserve and Cash Out have no commons), so every archetype is offered as a pivot.
- The 40% basic-attack safeguard keeps the first slot and prefers a basic of the lead tag.

**Build payoffs strengthened** (measured with `tools/simulate.mjs --build=each --tactics`):
- Churn: Junk Toss +4 per Churn (max +20/+24); Junkstorm +4/+5 per Churn (max +36/+45); Scrap Feed adds 4/5 Guard; Recycler 12/15; Spare Parts adds 5/7 Guard.
- Flow: Spark Primer +5/+7; Quickdraw 8/10; Slipstream 5/7 twice; Overclock 8/10; Timekeeper +5/+6 per second; Relay Baton now deals 8/10.
- Interference: Jam Breaker +3/+4; Breach Payload +6/+7.

## 30. Permanent progression (Phase 9)

The Museum profile records acquisitions, actual combat accomplishments, achievements, loadout eligibility and completed-run records. A new profile can win with the default loadout. New Run selects one relic from the available roster using the same eligibility rules as the Museum. Unlocks grant a choice of starting relic and retain ordinary acquisition. A deliberate starter can lightly bias an opening reward slot before an acquired direction forms. The existing timing assists, reward tiers, boss pool and campaign stats remain in force.

Cards and relics are discovered on legitimate acquisition, enemies on encounter or summon and EX recipes on execution. Encounter-based proof is committed with the battle outcome. The finished-run counter for Pressure Gauge uses victories and defeats; earlier eligibility is retained. A v7 run checkpoints durable evidence before applying it to the v3 Museum profile. A stable identity and progress cursor prevent repeat credit after a retry, reload or duplicate callback. See [the Phase 9 report](PHASE9.md) for migration, catalogue, validation and results.
