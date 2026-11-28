# Combat refinement 0.2.13

## Checkpoint and comparison criteria

Phase 12 source `ba84a11062b9eb9673c96daecdb0c9c285294aeb` and distribution
`f8bc7a248f60f8b24163aef702ca0da64bb8aba7` are immutable comparisons.
Local checkpoint `checkpoint/phase-12-0.2.12` retains the later, documentation-only head
`76397c026ec1db3c89dcfbebbb024249519b1561` of the same development branch.

Before tuning, use the same 60 campaign seeds and policies as Phase 12, plus its separate
30-seed holdout. Run the six-card catalogue and neutral heal independently where possible,
then combined. Record opening and Act I clear rates, pace, legal starts and dropped sequences
alongside wins. Investigate a decrease of more than two wins over 60 in Quick, four in Regular
or four in Learner, or a learner drop of more than two on the holdout. These are investigation
thresholds for an automated sample, with opening survival and learner access taking priority
over improvements in any other policy. Use both Phase 12 focused sets for all ten build
directions. Investigate a loss of more than six wins over 60 or an appreciable decline in
formation or mechanic use. Test all ten starters at the original party HP, Scrap, deck
composition by rank and acquisition rules.

Compare actual resolved sequence payoffs, card costs, speed and risk with and without EX
recognition. Preserve the available flexible actions. Add an incentive only if the existing
reward has a demonstrated practical shortfall, and an isolated candidate fills it without
raising resource abuse or making shorter choices poor. Verify decisions, cancellation and
migration at the engine boundary and show how the installed UI communicates them. Browser
campaigns, controlled fixtures, and subjective human judgment establish separate outcomes.

## Card catalogue

Phase 12 had 26 basics, 23 with individual effects. This build has 21 basics. Six are
standard attacks and 15 are specialized. The playable collection changes from 87 to 82,
with 41 relics, 17 EX recipes, ten build directions and the three Acts retained.

| Standard pair | IDs | Printed rank | Damage base → upgraded | Momentum on resolution |
|---|---|---:|---:|---:|
| Weak Attack A and B | `scrapline`, `scrapline_b` | 1 | 5 → 7 | +1 |
| Medium Attack A and B | `rivet_jab`, `hotwire` | 2 | 7 → 9 | +1 |
| Strong Attack A and B | `piston_strike`, `piston_strike_b` | 3 | 10 → 13 | +2 |

Both suits use the same damage at each rank, zero Momentum cost and the unchanged action
duration. Hessa strikes, Corvin casts and Pin shoots with their established scheduler contact.
Step, Cross, grafts, rank modification, suit modification, Reserve, Churn and EX recognition
operate on the same card instances. The standardized values use the Phase 12 plain attacks
as their anchor. Medium B gains three base damage relative to Hotwire and loses its scripted
extra Momentum. The 13-card start still has three Weak, three Medium and two Strong attacks,
one Arte per hero, Salvage and the converted healing card. The suit distribution, 130 shared
HP, 80 Scrap and ten starting relic choices retain the original starting setup.

| Phase 12 attack | Disposition | Purpose or retained mechanical alternative |
|---|---|---|
| Scrapline | Standard Weak A or B | True A/B definitions replace the starter's implicit B copy. |
| Spark Primer | Retired → Weak A, preserve EX suit | Index Slug and Pressure Splice retain prepared next-hit bonus paths. The EX slot still exists on Hidden Ace and other specialist basics. |
| Pinprick | Retired → Weak A | The light double hit was a generic damage alternative. Multi-hit play stays on Artes such as Splitter, Bolt Volley and Slipstream. |
| First Rung | Retained | A deliberate opener that raises the damage of subsequent Steps. |
| Cold Start | Retained | A lower-damage zero-Momentum recovery opener. |
| Hidden Ace | Retained | A Reserve payoff with a genuine decision about when to store the card. |
| Static Bloom | Retained | Early-rank area pressure and a distinct answer to several Locks. |
| Open Ledger | Retired → Weak A | Tally Mark keeps the payoff on an offensive card and other Cash Out effects remain. |
| Rivet Jab | Standard Medium A or B | Per-instance B copies become the matching definition unless recut. |
| Hotwire | Standard Medium B | Momentum gain is standardized. Cold Start, Low Gear and Momentum Artes keep specialist investment. |
| Step Up | Retained after comparative testing | An immediate Step reward with Momentum. Removing it harmed Ladder performance despite high formation. |
| Tinder Toss | Retired → Medium A | Scorch remains on specialist Artes including Kindling and Detonate. |
| Gauge Read | Retired → Medium A, preserve EX suit | Pocket Gauge, Pocket Watch, Hidden Ace and Signal Case keep Reserve setup and payoff choices. |
| Junk Toss | Retained | Converts an executed Churn draw into a concrete damage payoff. |
| Fault Finder | Retained | Exposes targets and exploits actual disrupted hand state. |
| Polarity Shift | Retired → Medium A | Gear Swap, Prism Cut and other suit interactions retain tactical suit control. |
| Tally Mark | Retained | Builds Cash Out payout per resolved offensive card. |
| Piston Strike | Standard Strong A or B | True A/B definitions replace the starter's implicit B copy. |
| Quickdraw | Retained | Investment in Flow refunds for a longer chain. |
| Tripwire | Retired → Strong A | Removes a generic damage-plus-Weak basic. Physical protection and reactive damage remain on Shield Bash, defensive support and counters. |
| Shield Bash | Retained | Converts existing Guard into attack power rather than granting free protection. |
| Gear Swap | Retained | Flips the current suit for deliberate Cross or Step manipulation. |
| Pocket Watch | Retained | Prepares a high-rank Arte for Reserve instead of providing immediate power. |
| Hand Off | Retained | Enables a Relay Echo with an immediate positional choice. |
| Pocket Gauge | Retained | Lets the player plan Exposed before an attack by playing from Reserve. |
| Index Slug | Retained | A prepared Churn draw creates a following-attack bonus. |

Common foundations can appear in ordinary rewards or shops. The foundation slot leaves
named and early Reserve/Churn offers, rarity floors and the pivot in place. The basic
safeguard prioritizes underfilled ranks when it reaches the foundation pool. The first
trial applied this preference to every foundation slot and only offered Strong attacks
from a fresh deck. The final slot rules make all six obtainable in a fresh deck's normal
shop and reward samples while retaining the narrow safeguard preference.

## Healing and migration

Mend Circuit is now the neutral **Repair Kit**, retaining `mend_circuit`, its common
acquisition, cost of two Momentum, healing of 14 or 20 HP and its normal two-second
support Recovery. Tap the kit, then tap an eligible hero or press Q/W/E. An ally may
perform it during the active hero's chain. The picker reserves nothing until a hero is chosen.
Cancel returns to combat without cost. A queued kit reserves Momentum and commits its
performer. Cancelling that command returns both resources. The actual heal happens at
contact and the card goes through the ordinary discard and reshuffle cycle. Hessa using it
does not activate her owned Guard-card Cover effect. The recorded animation is a separate
kit action for each performer, with a shared repair-case icon and contact effect.

Mend Circuit was the only conventional character-owned heal. Signal Case's conditional
Reserve utility, Healing Cadence's executed-healing check, and Tuning Fork's Perfect heal
retain their existing roles. Patch Kit and Quiet Channel still heal after an encounter.
Rest, shop healing, event recovery, maximum-HP changes and the existing Act transition
recovery stay separate from combat. No additional inventories or battle recovery rules exist.

Run version 8 migrates all seven retired attacks as above. The old EX variants on Spark
Primer and Gauge Read survive even though their standard replacement's ordinary suit is A.
Explicit suits and recuts remain on the instance, including a recut to EX. A legitimate
implicit B counterpart maps to the B definition while keeping UID, upgrade, graft and rank
modifier. The previous ID is kept on migrated deck instances. Older migrations still run
first. Pending reward, shop and event offers preserve order, price, sold state and modifiers.
Museum discoveries retain historical IDs and recognize a canonical successor where supported.
Journal, achievements, unlocks and historical run summaries stay in the existing profile.
Continue restores the original checkpoint and restarts a fight. Phase 12 never saved its
live hand, Reserve, discard or queue, so there is no saved battle-zone data to remap.
An upgraded v8 run requires 0.2.13; a Phase 12 rollback needs a pre-upgrade v7 checkpoint
to continue the old run.

## Incentives tested

The standard card experiment leaves 1, 2 and 3 as legal openers. Short ascending paths need
only the existing Arte ownership and Momentum. Straight Circuit already rewards three
executed printed strengths and the Arte, once per combo. Neither commitments nor cancelled
cards count. Its exact four-card segment predicate and prior interactions with Techniques
remain. The optional help now points players to Straight Circuit and Tandem Signal.

An isolated 35% Straight Circuit damage trial was compared with the existing 25% plus one
Momentum. It did not improve learner wins in the main 60-run set or the 30-run holdout.
The live effect remains 25% with a floor of five. This gives a completed ladder an offensive
payoff without removing the time, Guard and resource reasons to use Cash Out.

Two isolated 0.5s Flow trials required the outgoing Arte, a real Relay and an executed Weak
opener. The one that counted as card-granted Flow also enabled Second Wind more often. Its
aggregate results looked favorable. The plain Flow trial without that additional recipe
qualification did not reproduce the learner gain. No enhanced Relay effect ships. Existing
Relay Momentum, damage, grace, Echoes, Tandem Signal and three-hero recipes still reward
handoff planning. A composition that uses a Medium or Strong after Relay stays legal.

### Controlled sequences

These are actual resolved Hessa/Scrapfall sequences with the same-suit, unupgraded basics,
four initial Momentum and 1.4 seconds between decisions. The Iron Maw has fixture HP to
keep each path observable. Time includes the decision to finish. Guard is the credited
payout Guard. Net Momentum includes the existing ending and EX rewards.

| Sequence | Damage | Seconds | Damage/s | Guard | Net Momentum |
|---|---:|---:|---:|---:|---:|
| 1 → Arte | 17 | 4.0 | 4.25 | 0 | +1 |
| 2 → Arte | 19 | 4.0 | 4.75 | 0 | +1 |
| 3 → Arte | 22 | 4.0 | 5.50 | 0 | +2 |
| 1 → 3 → Arte | 30 | 6.0 | 5.00 | 0 | +3 |
| 2 → 3 → Arte | 32 | 6.0 | 5.33 | 0 | +3 |
| 1 → 2 → 3 → Arte | 50 | 8.0 | 6.25 | 0 | +5 |
| 1 → 2 → Cash Out | 27 | 4.0 | 6.75 | 4 | +2 |
| 1 → 2 → 3 → Cash Out | 42 | 6.0 | 7.00 | 6 | +4 |

The complete Arte path drops to 40 damage and +4 Momentum when EX is disabled in that
fixture. Damage, decision windows and opportunity are still different on another hero,
with Crosses, at a different pace, or against interference. In the 1.4s fixture, the
one-segment paths finished before the first enemy action. An Arte-completed Relay into
Weak → Thermal Lance took 9.9s, landed 44 damage, drew one enemy action and triggered
Tandem Signal. Starting that incoming segment with Medium instead landed 46 damage in
the same time and also triggered Tandem Signal. Relaying before Scrapfall left a faster,
27-damage alternative. The full-ladder-plus-Relay sequence landed 74 damage at this pace.
The three paces, EX on/off and optional alternatives are reproducible with the procedure below.

The card-granted Relay trial raised Second Wind from about 0.12 to 0.69 activations per
battle across the focused-plus-ordinary comparison. The plain time-only trial stayed near
0.12. The apparent campaign benefit cannot be attributed to the half-second alone. In the
early ordinary cohort, 1,031 Quick, 768 Regular and 661 Learner resolved handoffs already
matched Arte → Relay → Weak without an added effect. In that cohort complete Arte ladders
occurred 25, 30 and 23 times, respectively. The controller often played abbreviated
sequences. These are measures of observed opportunity and policy choice, rather than
evidence about what a human will prefer.

## Campaign measurements

Wins per 60 use Phase 12 seed starts 1001 and 3001 with identical unchanged timing
and acquisition policies except for interpreting the kit's performer. Old healing still
uses Corvin. The revised policy uses him when Ready and can use another available hero.

| Version or isolated trial | Quick | Regular | Learner |
|---|---:|---:|---:|
| Immutable Phase 12 | 60 | 48 | 27 |
| Initial catalogue only | 59 | 45 | 27 |
| Repair Kit only | 60 | 51 | 34 |
| Initial catalogue plus kit | 60 | 49 | 25 |
| Restored Step Up, early foundation selection | 60 | 45 | 29 |
| Same trial plus 35% Straight Circuit | 60 | 46 | 29 |
| Same trial plus Flow counted as a card effect | 60 | 48 | 33 |
| Same trial plus plain Flow | 60 | 44 | 28 |
| **Final catalogue, normal rank access and kit** | **60** | **47** | **23** |

Learner wins missed the Phase 12 primary result by four, the edge of the declared
investigation tolerance. The primary seeds have a mixed result. The three additional
30-run ranges (5001/7001/9001) returned 18/14/16 learner wins, versus 13/12/14 on
Phase 12. Across all 150 seeds the final wins were 148 Quick, 119 Regular and 71
Learner, versus 149, 122 and 66. Every policy won all 150 first fights and 133
learners reached Act III on each build. Regular Act III arrivals rose from 147 to 150.
Seed-matching controls initial inputs, with later route and reward divergence expected.

For 2.5-second decisions, all nine ordinary or tutorial scenarios went 40/40 in both
builds. Opening damage was slightly lower in those scenarios. Tyrant rose from 37/40
to 40/40 and Regent from 25/40 to 29/40. Hound Mother remained a difficult optional
elite, 1/40 to 2/40 in the fixed starting-deck fixture. These are isolated encounter
checks and differ from full campaign acquisition. The minimum-spacing rules were
unchanged, and the tested openings contained zero early-spaced attacks.

Among learner encounters across the 150 seeds, Core losses were 6/33 → 5/37 and
mean HP loss 29.4 → 30.5. Corruptor losses stayed 2/41 with higher mean HP loss
(14.5 → 23.4). Winch/Wing went from 11/86 to 8/84 losses and 41.6 → 37.0 mean damage.
Wisp/Predator went from 8/53 to 3/45 losses with higher mean damage among the
encounters sampled. No enemy or boss stats were changed for this milestone.

### Build outcomes

| Build | Phase 12 win / dominant | Final win / dominant |
|---|---:|---:|
| Rank Ladder | 56 / 59 | 53 / 59 |
| Suit Switching | 43 / 57 | 50 / 58 |
| Relay Echo | 35 / 59 | 39 / 56 |
| Momentum Burst | 40 / 57 | 44 / 58 |
| Flow Extension | 42 / 58 | 44 / 58 |
| Churn Engine | 50 / 60 | 46 / 60 |
| Reserve Strategy | 45 / 57 | 45 / 60 |
| Guard & Counter | 52 / 60 | 58 / 60 |
| Cash Out | 59 / 49 | 60 / 50 |
| Interference Exploit | 36 / 60 | 36 / 60 |

The 60-run comparisons start with the normal Badge deck and use ordinary acquisition.
The focused build experiment keeps divergence visible. Formation, its own mechanics
and victory are reported separately. All ten retained passage through Act I and reached
late game in the chosen direction. Cash Out remains highly efficient and Guard improved.
The card consolidation does not establish that this existing spread is solved. The full
export reports net HP lost, battle time, Guard, Arte and Relay use, Churn draws, Reserve
plays, interference responses, Momentum, Flow, actual offer exposure and hybrid pivots.
[Paired build metrics](refinement/focused-builds.csv)

All ten starting relics went 60/60 on both opening wins and Act I clears across each
of the three policies. The tool verifies identical starting resources and deck within
every starting-relic comparison. [Starting loadout measurements](refinement/starting-loadouts.csv)

### Card use, recovery and risk

In the first 30 learner campaigns, the fraction of open decisions with no playable
attack fell from 664/4,670 (14.2%) to 479/3,888 (12.3%). Basic-chain decisions with
no legal attack continuation fell from 2,486/9,140 (27.2%) to 1,991/7,776 (25.6%).
The measured drop rate was 0.433 → 0.376 per fight. In the same cohort, standard
and specialized attacks resolved 4,816 and 1,214 times. The learner opened 2,394
segments at rank 1, 1,706 at rank 2 and 507 at rank 3. Standard cards were offered
44 times and specialized basics 413, with 121 added basic cards retained at the
campaign end and 44 upgraded basic instances still in the deck. The other policies
are available through the same audit. The system removed scripted effects from the
starter's basic decisions. Human comprehension has not been measured.

The learner in that cohort used the kit 48 times with Hessa, 134 with Corvin and
125 with Pin. Old Mend Circuit was used 278 times, all by Corvin. Actual restored
HP rose from 3,365 to 3,446 across those campaigns. Learner net HP loss per fight
increased from 15.73 to 16.73 while fight time fell from 38.26s to 35.87s. Regular
net HP loss fell from 10.61 to 8.77. These mix role flexibility and catalogue effects.
The separate item-only cohort isolates the former more directly.

A support-only stress policy tested the starter and a deliberately defense-heavy
13-card deck across 10 seeds each against Hound, Warden and Core. The three starters
could not fund perpetual defense. Both Phase 12 and the final defense-heavy deck
survived the 360-second bounds with no offensive progress. The Core test restored more
HP with the kit and ended around 121 HP versus 123 on Phase 12. The late encounter
still demanded repeated paid actions and considerable Guard. This stress test did
not find a new route to resource accumulation or campaign progress while stalling.
It does not prove that all drafted decks are incapable of sustaining a defense.

## Packaged gameplay and regression evidence

| Actual interface session | Conditions and result |
|---|---|
| English tablet, 1194×834 | Seed `794184763`, fresh Badge, 16/16. Beat Regent, Mirror Array and Corruptor in a 20-battle campaign. The final deck was Interference-led. Three checkpoint restores, a score of 1,520, credits and a subsequent run. [Results](refinement/campaign-en-results.jpg) |
| Russian phone, 844×390 | Seed `754160791`, historical Phase 8 profile, earned Echo Splice. The 21-battle campaign beat Tyrant, Auditor and Corruptor. Three checkpoint restores, a Guard-led deck, a score of 1,600, credits and a subsequent run. 16/16. [Results](refinement/campaign-ru-results.jpg) |
| English phone, 844×390, offline | Seed `341819499`, fresh Badge and a Reserve-preferring policy. 18/18, with Tyrant, Auditor and Core, three checkpoint restores, a score of 1,560 and a subsequent run. The campaign was offline from title through the next run and drafted through ordinary rewards. The deck's final dominant direction was Churn. [Results](refinement/campaign-offline-results.jpg) |
| Fresh defeat and reload | Ordinary enemy damage ended a run. Results recorded a single defeat, and both reload and a subsequent start worked. |
| Item and specialist coexistence | Seed `288925607`, standard Badge deck and ordinary Draft choices. Pin healed 10 missing HP with Repair Kit and later executed the drafted First Rung. All actions used touch; the trace records resolved events. [Combat screenshot](refinement/item-and-specialist.jpg) |

Together the three winning campaigns encountered all six bosses and completed without a
recovery nudge or a page error. [Browser assertion and event traces](refinement/browser-checks.json)

The playable package passed all 295 engine tests from the clean build source, against
288 at the Phase 12 checkpoint. Relevant engine tests cover return of reserved Momentum
and card on cancel, damage and Momentum for each standard pair, ordinary abbreviated
sequences, standard attack acquisition, and preservation of legacy cards and variants.
The ordinary focus suite passed 11/11 across the ten build families. The recipe tests and
recipe-aware laboratory exercised all 17 EX patterns. Stable recipe IDs let historical
recognition and discoveries survive.

The browser tests returned 23/23 for Phase 4 tactical inputs, 33/33 for Phase 5 queue and
Relay, 47/47 for the complete Phase 6 Russian tutorial and Act I acceptance, 47/47 for
Phase 7 EX and the Combo Journal, 51/51 for Phase 8 content, rewards and adaptations, and
23/23 for the Phase 9 collection and unlock UI. Targeting passed 36/36, historical profile
and active-run browser migration 6/6, interrupted finalization 3/3 and starting loadouts
12/12. Historical test updates follow the item picker and version 8 mapping. The queue and
preview fixtures bound the interval between actual inputs using the Playwright clock, and
the tutorial test waits for the due enemy lesson before testing enemy long press. The
ordinary campaigns use the real-time clock, maps, card rewards and menu actions.

The packaged item fixture tested all three performers, verified that a busy combo owner
could not be selected, and confirmed that cancelling the performer picker over the battlefield
spent no resources. Each hero's contact cue coincided with the HP change in the scheduler
trace. The Russian phone fixture used Reduced Motion, and the muted fixtures retained the
visible case and party HP feedback. [English contact](refinement/repair-kit-contact-en.jpg)
[Russian picker](refinement/repair-kit-selection-ru.jpg)

Sixteen English and Russian packaged viewport checks measured at least 12 CSS px for card
effect and restriction text. The full catalogue/layout sweep sampled 348 English and 350
Russian screens at 740×360, with zero reported overlap or text issues. The 740×360 compact
fixture retained 141 px of battlefield height and verified adaptation and enemy threat targets.
Chromium verified the layouts. Human comprehension and audio aesthetics, Safari, and native
Apple-device execution remain unverified.

The exact Phase 12 → 0.2.13 packaged PWA update passed 22/22 on Pages-style paths and
21/21 on mirror-style paths. The tests cover offline launch and combat, Journal and earned
loadout access, saves, preservation of the old worker during an interrupted upload and the
same active save after the complete update.

## Build, deployment and repeatability

Version `0.2.13` was built from `2b8a332bed0a7261ad5883822e8ca07e5168ad69`.
Distribution commit `555a38bf76698d5128ccb55bb6f96e1c6f39c32c` contains the web build,
service worker and Swift Playgrounds project and archive. Two clean builds matched byte for
byte on the HTML, worker and ZIP. The repository-hosted ZIP matches the local archive and
passes `unzip -tq`. Apple compilation and execution remain unverified.

- `dist/index.html` SHA-256 `9206f667716d02edcf4ce5f75ff0957d17f86bd96afcab7f41d1856179dfb405`
- `dist/sw.js` SHA-256 `1f82d850b2a19d1ef15a223cde9648d6b90f5eb9131601a3f56354ff498ed210`
- `dist/ios/SignalBreak.swiftpm.zip` SHA-256 `7d3f7733b032def50514c86827d73b933e2cee5d94425e9b2f7eb1aae322c9c0`

The existing mirror workflow ran against the distribution commit, fetched the hosted game
with HTTP 200 and printed the served build stamp `2b8a332`. Direct mirror access from the
development cloud was blocked by its network proxy. [Deployment run](https://github.com/Magma-rager/def/actions/runs/46146343660)
[Playable build](https://signalbreak-game.website.yandexcloud.net/)
[Swift Playgrounds archive](https://raw.githubusercontent.com/Magma-rager/def/555a38bf76698d5128ccb55bb6f96e1c6f39c32c/dist/ios/SignalBreak.swiftpm.zip)

Use the pinned Phase 12 source and distribution above to reproduce or recover the previous
build. To roll back the mirror, restore its entire `dist/` tree from `f8bc7a2` in a new
commit on the existing development branch and verify the served `ba84a11` stamp through
the workflow. Keep a pre-upgrade active-run copy if it must work under 0.2.12. A new run's
version 8 state is read by 0.2.13.

```sh
npm ci
npm test
npm run build:ios
unzip -tq dist/ios/SignalBreak.swiftpm.zip
node tools/combat-refinement.mjs sequences /tmp/sb-sequences.json
node tools/combat-refinement.mjs soak /tmp/sb-heal-soak.json
node tools/combat-refinement.mjs campaigns /tmp/sb-mechanics.json 1001 30
node tools/phase12-balance.mjs /tmp/sb-campaigns.json 1001 30
node tools/phase11-audit.mjs /tmp/sb-builds.json 30 1001
SB_FIRST_SEED=1001 node tools/progression.mjs balance 30
node tools/serve.mjs dist 8128
```

With Chromium and Playwright available, run these from another terminal. The ordinary
campaigns generate their own seeds and print them with the initial loadout. The balance
commands take explicit seed ranges. Repeat the campaign commands with a local HTTP origin.
Set `PWA_FROM` to a Phase 12 `dist/` path to test the real archived upgrade.

```sh
node tools/refinement-browser.mjs /tmp/sb-item-acceptance http://localhost:8128/index.html
SB_URL=http://localhost:8128/index.html node tools/presentation.mjs layout /tmp/sb-layout
SB_URL=http://localhost:8128/index.html node tools/accept8.mjs campaign en 1194 834 /tmp/sb-en
SB_URL=http://localhost:8128/index.html SB_CAMPAIGN_PROFILE=tests/fixtures/meta-v2-phase8.json SB_CAMPAIGN_STARTER=echo_splice node tools/accept8.mjs campaign ru 844 390 /tmp/sb-ru
PWA_OFFLINE_CAMPAIGN=1 SB_CAMPAIGN_FOCUS=reserve node tools/pwa.mjs /tmp/sb-offline
PWA_FROM=/path/to/phase12/dist node tools/pwa.mjs /tmp/sb-pages-upgrade
PWA_FROM=/path/to/phase12/dist PWA_PATH=/signalbreak/ PWA_PORT=8201 node tools/pwa.mjs /tmp/sb-mirror-upgrade
```
