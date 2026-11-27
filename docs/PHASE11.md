# Phase 11 · Content and balance

## Baseline and decision criteria

Phase 10 distribution `fffcb60` and source `c3b3dac` were verified against the development
branch before changes. The archived checkout passed 266 tests and rebuilt both distributions.
The baseline inventory is 81 cards, 39 relics, 12 mutations, 10 grafts, 25 enemies, 27 ordinary
formations, six bosses, 15 recipes, ten build directions, ten starters and 27 achievements.
The 34 clips and 26 poses per hero are the presentation floor.

The original focused scenario uses seeds 4000 + build index × 50 + offset. Its Reserve gate
is kept: at least one of three runs must have five Reserve cards, a Reserve lead, Act II and
a round-tripping save. Report actual plays and the wider sample separately. Reserve starts
with six uncommon cards, so a successful build in one cohort can still be starved in the
opening rewards of another. Stashing a spare starter already enables Stored Strike. The
tactic historically gave preference to Hidden Ace while overlooking neutral saved basics
and many saved Artes. Observe the economy, the behavior, and runs with Spare Pockets separately.

The initial focused Churn sample won 1/10, despite 10/10 leading decks and 3.4 Churns per
fight. Phase 8's study identified failed rank fits: roughly a quarter of mid-chain
replacements were played. The older focused policy tended to discard before opening a
chain, and its generic fallback often Churned without checking the visible next card.
The primary Churn gate is a gain of at least three victories in the matched 30-seed
focused cohort, with more executed replacements and no global Churn regeneration increase.
Repeat with a corrected policy on both code versions and check a separate seed range.
For Reserve require the original gate and improved ordinary access and actual plays.

Compare ordinary quick, regular and learner runs at identical reaction settings and
resources. Preserve the opening clock and no sub-second enemy action gaps. Broader
campaign outcomes should flag material deterioration or concentration, with a five-win
loss out of 30 ordinary campaigns as an investigation trigger. High observed rates
from one policy are not an estimate of human difficulty. Acquisitions and actual
plays must accompany any successful formation claim. Compare crossing, relaying,
spending, protection and finish behaviors separately from the final deck label.

## Content shipped

| Component | Phase 10 | Phase 11 |
|---|---:|---:|
| Playable cards / ordinary reward pool | 81 / 74 | 87 / 80 |
| Relics / mutations / grafts | 39 / 12 / 10 | 41 / 13 / 11 |
| Enemy designs, including summon / ordinary formations | 25 / 27 | 28 / 33 |
| EX recipes | 15 | 17 |
| Acts / bosses / adaptations / events | 3 / 6 / 11 / 21 | 3 / 6 / 11 / 21 |
| Directions / starter options / achievements | 10 / 10 / 27 | 10 / 10 / 27 |
| Hero clips / poses per hero | 34 / 26 | 38 / 26 |

Reserve gets an entry attack, a defensive finisher, and an ally-support interaction. Churn
gets an entry attack, a mid-chain bridge, and an execution-dependent finisher. That covers
setup, continuation and payoff without filling every rarity or adding another resource.
Three enemies introduce protection, repair and acceleration. Each appears in one relatively
simple and one mixed formation. The other systems already have acquisition and payoff paths.
Maintenance there focused on reward quality, encounter pressure and verification. All new
items use the existing pool and save identifiers, both languages and collection tracking.

| New card | Role and base → upgraded effect | Offers / campaigns acquired / executions |
|---|---|---:|
| Pocket Gauge, neutral R2 B, common | The Reserve opener Exposes before dealing 5 → 7 damage. Expose lasts 3 → 4s. | 748 / 94 / 4081 |
| Index Slug, neutral R2 B, common | Deals 7 → 9. Playing the marked Churn draw prepares +6 → +8 on the next attack. | 338 / 44 / 1032 |
| Latchshield, Hessa R4 A, common | A planted hammer and shield strike for 8 → 11. From Reserve, add 9 → 12 Guard and Counter 4 → 6. | 724 / 135 / 4732 |
| Pressure Splice, Corvin R4 EX, common | A two-beat instrument discharge for 10 → 12. Churn during the chain prepares +6 → +8 damage on the next hit and 1.0 → 1.3s Flow. | 287 / 34 / 736 |
| Ratchet Burst, Pin R5 B, uncommon | A braced shot for 14 → 17, with a second contact if Pin already executed a Churn replacement that segment. | 366 / 35 / 1074 |
| Signal Case, Corvin support, uncommon | A folding instrument motion with a heal of 4 → 6. From Reserve during a combo it also unlocks a card and adds 0.7 → 1.0s Flow. | 208 / 62 / 777 |

Offers count observations recorded by the simulator, including reward offers and shop
stock. Acquisition counts distinct campaigns with a copy, including cards later removed.
The primary cohort comprises 450 campaigns with disclosed policy mixes.

| New modifier or recipe | Function and ordinary access | Primary sample |
|---|---|---:|
| Index Spring | Uncommon relic in rewards, treasure and shops. First executed Churn attack per combo grants 5 Guard and 1 Momentum. | 48 campaigns |
| Slip Case | Common relic in the same pools. First executed Reserve card per combo gives 5 Guard. | 67 campaigns |
| Reclaim Circuit | Boss mutation draft. First executed Churn attack per combo grants 7 Guard and up to 1.25s Flow, subject to the existing Flow cap. | 67 campaigns |
| Pocket Seal | Attack-only graft through Surgery and ordinary graftable offers. First sealed Reserve attack in a combo Exposes for 3s before damage. | Present in 447 battles |
| Switchyard | Churn into a basic attack, execute it and then a saved Arte in the same segment. A 25%-damage strike (minimum 7) and 5 Guard, with folding splice effect. | 7 activations |
| Safety Interlock | Another hero resolves stored support before the attacker's Arte. Gain 7 Guard and Counter 5, with a shield closure and four-note cue. | 216 activations |

Each multiplier or passive has a one-use limit where stated. Neither of the new Churn
modifiers generates a charge. Echoes leave Churn marks, Flow and Momentum alone. A single
paid or Badge-enabled prepared draw may transfer into the next chain and grant 1 Momentum
on attack. The mark belongs to the exact card instance, expires on storage, replacement,
execution or chain end and has no bonus from a free stranded rescue before a chain.
Salvage Circuit and existing lifetime Churn proof still require a mid-chain replacement.
Switchyard can use either. Existing Junk Toss and Junkstorm now reward actual replacement
attacks instead of raw button presses. Junkstorm caps its bonus at two executed draws.
The card edge and detail view explain the mark. Full Journal completion now targets 17
recipes and previously earned completion remains earned.

| Act and formation | Tactical role | Appearances in 450 campaigns |
|---|---|---:|
| I, Rail Bailiff + Rush Hound | Hinged barrier covers the fast attacker unless interrupted or prioritized. Crossbar alternates with Custody. | 86 |
| I, Rail Bailiff + Interference Mite | Protection keeps the disruption source alive and rewards careful target order. | 37 |
| II, Phase Lantern + Signal Hound | The lamp can repair a wounded ally, then exposes its own glass core. | 176 |
| II, Phase Lantern + Bulwark Signal + Needle Wing | Stacked defense and repair encourage focus fire and a deliberate timing window. | 56 |
| III, Vector Winch + Needle Wing | The winch accelerates its fastest ally for 5s and Exposes itself for 3s, giving a choice between stopping acceleration and exploiting the opening. | 323 |
| III, Vector Winch + Bulwark Signal + Interference Mite | Accelerated disruption competes with shield coverage. | 65 |

The new enemies use distinct articulated silhouettes, wind-ups and contacts. The Bailiff
swings its counterweighted arm, the Lantern opens and contracts its shutter vanes, and the
Winch winds a spool and throws a tether. Existing damage reactions, signals, defeat and
reduced-motion handling apply to each. [New enemy motion](phase11/enemies.jpg) and the
[hero contact sheet](phase11/abilities.jpg) show frame captures from the Canvas renderer.
The Arte checks recorded real `execResolve` and `hit` events. The recipe and roster gallery
fixtures illustrate rare visual states separately from campaign evidence.

## Build formation and combat use

The full-catalogue audit records cards, relics, mutations, grafts, recipes, enemies, formations,
and event visits. It samples acquisition, use and composition rather than judging power from
rarity or tags. High Climb activated 35 times against 8,083 Tandem Signals in 450 primary runs.
Switchyard is deliberately narrower, and the primary sample alone is insufficient to assess
whether its hint leads players to discover it. Legacy compatibility aliases remain available
for migration. Every counted card still has a supported acquisition route. There is no hidden
loadout prerequisite.

The same first seed in each study means a comparable starting state. New encounters and card
picks change later choices and RNG consumption. There are 30 campaigns per row per seed set.
Leading decks are Phase 11 primary results. Combat use is per battle, except the last row,
which is the fraction of encounters with an actual interference response. Each build starts
with the Badge and a standard deck, with appropriately tagged ordinary acquisitions preferred.

| Build | Tactical acquisition and pivot | Phase 10 → 11 wins, primary | Phase 10 → 11 wins, separate seed set | Leading decks / 30 | Actual use in primary |
|---|---|---:|---:|---:|---|
| Rank Ladder | First Rung and cheap basics make successive Steps into Ladder Peak. Sudden locks encourage switching suits or relaying instead of waiting. | 23 → 26 | 25 → 27 | 30 | Steps 4.83 → 5.01 |
| Suit Switching | Crosscut and Suit Storm reward alternating A/B or inserting EX. Shared Cross Momentum feeds Momentum and Relay. | 20 → 17 | 21 → 24 | 29 | Crosses 7.12 → 6.70 |
| Relay Echo | Acquire handoffs and echo Artes for a sequence that transfers among Ready heroes. Guard buys time to reset and a missed handoff can finish as a single-hero chain. | 18 → 20 | 14 → 15 | 30 | Relays 7.12 → 6.74 |
| Momentum Burst | Basics and Crosses fund Pressure Valve or Overpressure. The former banks Guard, the latter consumes the reserve of Momentum. | 21 → 18 | 21 → 23 | 28 | Momentum spent 35.00 → 31.15 |
| Flow Extension | Timekeeper, Long Breath and paid +Flow support deliberate chains. Pivot into Relay during a long route, or cash out while Flow is high. | 18 → 18 | 19 → 25 | 30 | Flow gained 2.57 → 2.73s |
| Churn Engine | Use the preview to replace a dead card with a legal attack. Index Slug, Pressure Splice and Ratchet Burst offer separate payoffs. Reserve and Flow can bridge a bad draw. | 19 → 24 | 13 → 23 | 30 | Executed replacement attacks 0.73 → 0.81 |
| Reserve Strategy | Keep a suitable opener, finisher or off-hero support. Pocket Gauge, Latchshield, Signal Case and Stored Strike reward different decisions. The two-slot limit keeps extra storage from dominating. | 20 → 24 | 21 → 17 | 28 | Reserve cards played 3.73 → 4.40 |
| Guard & Counter | Use Cover and Guard when an enemy telegraphs. Follow with Guard payoffs or Latchshield. Piercing enemies and long battles can push the deck toward short finishes. | 27 → 28 | 26 → 27 | 30 | Guard absorbed 49.29 → 44.27 |
| Cash Out | Invest in quick basic attacks, payouts and Quick Exit. Keep at least one viable Arte for bosses that suppress payouts. | 29 → 29 | 29 → 29 | 28 | Successful payouts 1.26 → 1.30 |
| Interference Exploit | Play through lock and Glitch pressure with Breach Payload, removal and an alternate route via stored cards. Payoffs depend on the enemy, and an early turn against a clean enemy favors a direct attack. | 17 → 14 | 12 → 16 | 30 | Response encounter fraction 0.26 → 0.28 |

In the primary sample the acquisition policy finished with at least four cards of a second
build in 22/30 Reserve decks and 19/30 Cash Out decks. All directions saw pivot offers.
Cash Out remains the strongest observed specialized policy (58/60 wins), with Guard & Counter
55/60 and Interference 30/60. Guard absorbed substantially more damage than other directions
and averaged 47.24s battles compared with 33.49s for Cash Out. Differences in timing and risk
remain visible. The numerical ordering is policy-specific, particularly for Interference and
Relay. Each tactical path is demonstrated without an unlocked starter, while the historical
Phase 8 focused check measures only formation and Act II access.

**Reserve.** The original three seeds produced zero qualifying Phase 10 runs and two in
Phase 11. The qualifying runs each reached Act III, with 15 and 12 Reserve cards and 5.4 and
3.2 actual Reserve plays per battle. Neither won. In the broader studies with the same
focused policy, Reserve plays improved from 3.73 to 4.40 and 3.44 to 3.77. Wins remained 41/60
across the two cohorts. In the separate same-seed specialist comparison, the Badge went
20 → 26 and 17 → 21. Spare Pockets went 23 → 25 and 17 → 22. The two-slot base kit can already
produce a functioning build. The unfocused ordinary policy is still around 0.1 Reserve
plays per battle. It saw 3.60 → 5.77 total Reserve-tagged card offers per campaign and
0.77 → 1.80 in the first offer slot. Spare Pockets raised first-slot offers to 3.90 for the
regular policy. Early slot 2 supplies one random Reserve offer and later one Churn offer.
The safety and pivot slots and minimum rarity still apply.

**Churn.** The legacy focused 30-seed policy won 7 on Phase 10. Correcting use of the visible
preview and following through on the actual replacement raised the comparable Phase 10
cohort to 19/30 after the policy was finalized. With the same final policy, Phase 11 won
24/30 and 23/30 against 13/30 on the separate Phase 10 cohort. Executed replacements rose
0.73 → 0.81 and 0.71 → 0.88 per battle. The stricter prior-battle evidence for successful
in-chain Churn dipped (0.29 → 0.27 and 0.29 → 0.26 qualifying chains per battle). That excludes
prepared openers. The gain supports Churn as a playstyle on both tested ranges, without
establishing that every Churn line improved. Primary HP lost per battle fell 13.62 → 11.92.
Damage per battle rose 309.09 → 329.08. The specialist has no hidden cards or knowledge.

## Campaign, rewards and loadouts

| Ordinary default policy | Primary wins / 30 | Separate-set wins / 30 | Phase 11 primary Act III reached | Phase 11 primary HP lost / battle |
|---|---:|---:|---:|---:|
| Quick | 29 → 29 | 28 → 30 | 30 | 3.98 |
| Regular | 24 → 19 | 22 → 23 | 29 | 11.16 |
| Learner | 11 → 8 | 15 → 13 | 28 | 16.52 |

All 90 primary opening fights and Act I exits succeeded. For the primary learner policy,
HP lost per battle rises 8.87 → 14.43 → 29.43 by Act, battle duration 26.04 → 40.01 → 47.62s,
and mean enemy actions per minute 10.43 → 12.67 → 14.60. These are per-encounter means over
165, 169 and 125 battles respectively. They reflect surviving runs and route choices.
The regular primary deficit crossed the investigation threshold. Four of its 11 defeats
were at the Core, while learner defeats concentrated at the Core and at Latch Wisp + Predator
Needle. An earlier Winch + Predator Needle draft also caused frequent late losses and was
replaced by Needle Wing. In a separate experiment reducing the older Latch Wisp + Predator
pairing's frequency helped some primary seeds, but produced 10 learner wins against 11 with
the current pool on a third seed range (5001–5030). I kept the current pairing. The Predator's
Hunt had another concrete fairness defect: the forecast always used 10 base damage even when
the executed attack used 20. The forecast now follows the same live Guard rule.

Boss results in the two Phase 11 sets, aggregated across policies, were Scrap Tyrant
451/451, Clockwork Regent 449/449, Protocol Auditor 427/450, Mirror Array 445/446, Corruptor
346/350, and Signalbreak Core 314/345. The numbers reflect surviving campaigns and three
policies with heavily differing strength. The audited samples exercised all 11 adaptations.
The Core's Churn response now drains a charge and snares for 3s. Its Reserve response affects
one storage card. Other adaptation counters remain in place. A dedicated regression checks
both cases. The aggregate rates do not isolate a boss's intrinsic difficulty.

Each starting loadout was tested on all three policies and 30 matched seeds with the stock
deck, HP 130 and Scrap 80. These are regular acquisitions with no specialized hand tactics.

| Starting relic | Quick / regular / learner victories out of 30 | Regular leading decks with its tag / 30 |
|---|---:|---:|
| Beta Tester's Badge | 29 / 19 / 8 | 4 |
| Stopwatch Gear | 30 / 22 / 14 | 11 |
| Echo Splice | 30 / 19 / 16 | 9 |
| Pressure Gauge | 29 / 24 / 17 | 8 |
| Ladder Rungs | 30 / 25 / 20 | 14 |
| Twin Dials | 30 / 24 / 13 | 10 |
| Spare Pockets | 30 / 23 / 14 | 10 |
| Tower Plate | 30 / 28 / 20 | 12 |
| Riveted Ledger | 30 / 24 / 15 | 8 |
| Breach Clamp | 30 / 23 / 16 | 15 |

Tower Plate's strong regular result and the gap between several learner relics and the Badge
warrant attention in final QA and beta. Every loadout cleared Act I on all 30 seeds per policy.
Across eight successive campaigns, ordinary, quick and variety policies had all ten options
by runs 4, 4 and 5. The learner had nine by run 4 and still nine by run 8. The recipe-aware
collector had all ten by run 3 and 16/17 recipes by run 8. Initial variety still arrives early.
No unlock threshold changed. Horizontal progression, historical saves, and independent
accessibility settings are retained.

## Verification

- `npm test` returned 281 passes on Phase 11, up from 266 on the archived Phase 10 checkpoint.
  The additions exercise the precise Churn-card instance, expiry and cancellation, Reserve
  effects, stacked passive limits, enemy tactics, the live Hunt forecast, the Core measures,
  permitted reward tiers and legacy Journal completion. Tests retain historical save and
  interruption coverage.
- The Phase 4 interface suite now passes **23/23 on both checkpoints**. The archived failures
  were 4, 5, 6a, 8a, 9, 10, 12a and 14. Cases 4, 5 and 6a sampled before the attack resolved.
  Case 8a omitted Cross Current's extra Momentum. Case 9 checked support before resolution. Cases 10 and
  12a sampled slot contents while a prior command was still replacing its card. Case 14 assumed an
  automatic Perfect immediately after an Arte. The revised test taps the same inputs, waits
  for resolution, checks the exact Momentum equation including observed EX rewards, and taps
  FINISH. It runs an actual swipe for both hand operations. No combat rule was changed for these
  tests. The Phase 8 targeted suite still checks that Pressure Valve is offered and acquired in
  an ordinary reward. Its seed search now accounts for the committed first-battle count. Its
  scripted follow-up chooses a naturally generated second encounter without a random card lock.
  A seed found without that condition let a Wire Jammer lock Splitter. The assertion now also
  checks actual Splitter execution. The Phase 9 fresh-profile suite uses the expanded collection
  denominators and still verifies the exact displayed values and the existing profile behavior.
- Ordinary browser campaigns progressed through the UI with no recovery intervention or
  page errors. Each continued from a real save once per Act and verified ending, credits,
  results, Museum, and a subsequent run with standard resources.

| Campaign | Starting state | Bosses | Result |
|---|---|---|---|
| English, 1194×834, seed 409953212 | Fresh profile and Beta Badge | Regent, Mirror Array, Corruptor | Victory, 17 battles, 16/16 |
| Russian, 844×390, seed 283027288 | Captured Phase 8 profile and its earned Echo Splice | Tyrant, Auditor, Core | Victory, 19 battles, 16/16 |
| English, 844×390, seed 8867861 | Fresh profile and Beta Badge, Reserve reward preference and visible-hand policy | Regent, Auditor, Corruptor | Victory, 16/16, Reserve lead |

The Reserve campaign selected Pocket Gauge, Latchshield, Signal Case and Index Slug
from legal offers, fought Vector Winch, and earned Spare Pockets. Only the Russian returning
profile was loaded from a fixture. The tactical policy uses visible legal moves, preview and
ordinary choices through the game, with no injected cards, other enemies, or outcomes in these
three campaigns. The Phase 9 Russian loss is a separate controlled encounter, ended through
normal enemy actions, and checks proper finalization, discoveries, earned relic and reload.
The ordinary campaign harness keeps diagnostics and distinguishes unassisted completions,
automatic nudges, defeats and unresolved timeouts. The historical Act II stall was not observed
in these runs. Its cause remains unresolved.

### Presentation and accessibility evidence

The 16-case card and HUD sweep covers both languages at 667×375, 740×360, 732×510, 844×390,
932×430, 1024×768, 1194×834 and 1366×1024. It checks all 87 base and upgraded cards, including
Reserve group sizing, and a grouped EX result with both new recipes. Minimum essential effect
and restriction text is 12 CSS px with no detected clipping. One Russian card name at 1024×768
is 11.25 CSS px. At 740×360 the field remains 141 CSS px. Visual inspection of the new Act II
formation found Needle Wing's Russian name behind Pause. After measuring the toolbar, the
renderer also spaces neighboring labels so moving the name clear does not hide the Bulwark.
Tests verify separate names and targetable enemy centers in both viewports.
[Before and after](phase11/phone-label-comparison.jpg) · [Act I](phase11/phone-act1.jpg) ·
[Act II](phase11/phone-act2.jpg) · [Act III](phase11/phone-act3.jpg).

Chromium measured the new hero cues, enemy cues, EX cues, and the existing Act and boss scores.
The sampled stress mix peaked at 0.159 amplitude with zero clipped samples. The new cue peaks
ranged from 0.0126 to 0.0264. Muted output measured zero. Muted Reduced Motion, keyboard targeting,
rotation, EX detail and save reload passed. This covers browser playback and visual communication
under reduced effects. Listening quality, subjective art quality, native iOS frame rate, Safari
and physical touch usability remain unverified.

### Reproduce

Run from the project root. The browser commands need Playwright and Chromium and the source
server from `npm run serve`.

```sh
npm ci
npm test
node tools/accept8.mjs runs 3
node tools/phase11-audit.mjs primary.json 30 1001
node tools/phase11-audit.mjs separate.json 30 3001
node tools/progression.mjs balance 30
node tools/progression.mjs profile 8
node tools/pacing.mjs 60 --act1 --pace=2.5 --relay=active --json
node tools/accept4.mjs
node tools/accept6.mjs en 844 390 evidence/phase6
node tools/accept7.mjs ru 844 390 evidence/phase7
node tools/accept8.mjs ui en 844 390 evidence/phase8
node tools/accept8.mjs campaign en 1194 834 evidence/campaign-en
SB_CAMPAIGN_FOCUS=reserve node tools/accept8.mjs campaign en 844 390 evidence/campaign-reserve
SB_CAMPAIGN_PROFILE=tests/fixtures/meta-v2-phase8.json SB_CAMPAIGN_STARTER=echo_splice \
  node tools/accept8.mjs campaign ru 844 390 evidence/campaign-ru
node tools/accept9.mjs ui ru 844 390 evidence/phase9
node tools/accept9.mjs historical en 844 390 evidence/historical
node tools/accept9.mjs recovery en 844 390 evidence/recovery
node tools/presentation.mjs layout evidence/layout
node tools/presentation.mjs motion evidence/motion
node tools/presentation.mjs roster evidence/roster
node tools/presentation.mjs formations evidence/formations
node tools/presentation.mjs audio evidence/audio
node tools/presentation.mjs access evidence/access
npm run build:ios
unzip -t dist/ios/SignalBreak.swiftpm.zip
node tools/pwa.mjs evidence/pages
PWA_PATH=/signalbreak/ node tools/pwa.mjs evidence/mirror
```

Run the balance tools against Phase 10 with only `tools/phase11-audit.mjs`, `tools/simulate.mjs`,
`tools/lib/bot.mjs` and `tools/lib/hand-tactics.mjs` from Phase 11. Keep the Phase 10 game source.
The legacy focused Churn policy can be reproduced by setting `SB_LEGACY_HAND=1`. For the 2.5s
opening pacing command above the Phase 10 and Phase 11 JSON outputs were byte-for-byte equal,
including enemy spacing, Relay, decision time and downtime. The added mixed formations start
later than the opening encounter.

### Phase 12 handoff

1. Validate learner Act III difficulty and readability on the planned beta route when the roadmap is
   complete. Check Core and Predator Needle/Reserve-disruption matchups with deliberate forecasts and
   the default loadout. The latest headless learner outcomes remain below the baseline in both
   tested cohorts. Cash Out and Guard are the strongest focused simulation strategies.
2. Run native Swift Playgrounds, Safari, PWA installation/update, offline saves and rotation on an
   actual iPhone and iPad. Check the 141–156 px compact battlefield with several relics and threat
   indicators, and listen to the revised sounds on built-in speakers.
3. Observe whether players use Reserve without a focused strategy, how frequently they find
   Switchyard and other narrow recipes, and whether Tower Plate and early unlock density crowd
   out other choices. The focused Reserve win comparison is inconclusive across cohorts.
4. Capture further real-interface and device performance evidence through the eventual beta.
   The current estimates come from a headless policy and Chromium. Phase 11 does not establish
   human enjoyment, perceived fairness or artistic quality.
