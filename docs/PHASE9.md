# Phase 9 permanent progression

## Phase 8 lifecycle before the change

Baseline source `56efb85`, distribution `6f3f7e9`, 243 passing tests. Local ref `checkpoint/phase-8-0.2.8` identifies the recoverable distribution.

| Field | Phase 8 write and read | Durability and historical evidence |
|---|---|---|
| Recent runs, total, wins, defeats | `recordEnd` writes through `recordRun` before credits/results or when explicitly abandoning. Title, returning dialogue and Museum read these values. | The last 30 summaries include outcome labels. The lifetime defeat count also includes abandoned runs, and older outcomes can no longer be individually classified. Pressure Gauge used the inclusive total. |
| Boss defeats and endings | `Run.finishBattle` credits a boss within the active run. Run finalization copies defeats and the victory ending into the profile. Boss preparation and Museum read the respective run and profile data. | A boss win can be recorded after defeat or abandonment. Profile storage and active-run removal are separate writes. Historical boss totals and wins establish campaign milestones. |
| Enemies, relics and cards | Encounters and relic acquisition track distinct IDs in the active run. Finalization merges those and the final deck into the Museum. | Enemy figures count runs. Summons absent from the run list and cards taken then removed can be lost from the catalogue. Historical recorded IDs establish discovery. |
| Best combo, hit, score and build labels | Completed battle stats feed the run. `recordRun` aggregates maxima and final deck direction. Museum and returning dialogue display records. | Ends of runs including defeat or abandonment qualify. A historical tag establishes deck direction, with combat mastery evidence usually unavailable. |
| Tutorial and Ozmund’s trust | The lesson controller commits progress in the profile. Tutorial victory sets its flag. Finalization increments trust for the existing story flags. | Existing values survive reload when storage succeeds. Duplicate finalization can duplicate trust. |
| Combo Journal | Resolved EX activation writes first seen and count immediately. The UI uses it for discovery banners and the Museum Journal. Run statistics count only finished battles. | Discoveries survive defeat, abandonment and restart. Real activations after a restart legitimately contribute to the Journal. Known IDs establish historical discovery. |
| Settings | Independent settings record, updated from existing controls and loaded on startup. | Language, timing assists and Reduced Motion remain profile-independent. |

The old finalization path ignored failed profile writes and cleared the active save. A reload between successful profile write and active-save removal could record the same run again.

## Permanent progression in 0.2.9

A run begins with the same 130 party HP, 80 Scrap, heroes and starter deck. The player chooses one unlocked relic in New Run. The existing relic hooks apply the selected effect. Achievements grant recognition and starter eligibility. They add zero profile-wide combat stats, currency or resources. Difficulty and timing assists remain available from the start.

Cards and relics go into the collection when their acquisition is checkpointed. This includes the starting cards and selected relic, accepted rewards, purchases, card grants, transforms and trophies. Removed cards and traded relics stay catalogued. Reading an offer or unlocking a starting relic leaves the collection unchanged. Initial enemy IDs are recorded on committed entry to an encounter. A displayed combat summon is recorded when it occurs. Bestiary counts are distinct runs in which a creature appeared. Boss wins are separately counted at committed battle outcomes. The Corruptor’s Root Key is awarded when its owner falls, which is the point where the previous path went straight to the ending screen.

The current collection totals are 81 playable cards, 39 relics, 25 enemies and 15 EX recipes. Enemies comprise 12 normal enemies, six elites, six bosses and the Mirror Shard summon. Signal Hounds summoned by Hound Mother also belong to ordinary enemy pools. Current totals exclude Junk, withheld content and unknown historical IDs. Unknown discoveries stay in storage. All 15 EX recipes are usable from the start. A resolved activation updates the Journal even if the player restarts the encounter. A new activation in a replay is a new Journal activation. Finished-battle totals count only the encounter outcome that was actually committed.

Museum Records tracks results, personal bests, boss coverage, collections, achievements, loadouts and explored builds. The original tabs remain, alongside Achievements and Starting relics. Achievements filters include Earned, Incomplete and all four categories. Runs retains the most recent 30 outcomes. Expand a row to see the recorded loadout, deck size, boss encounters and preparation, relics, mutations, accessibility options used, EX activity and progression receipt. Older details display available evidence and mark missing fields. Returning encounters with Ozmund and the existing endings use the same story logic.

After battle, grouped achievement notices appear on a safe screen, never inside the combat timing loop. An award is written before it can be announced. A reload may skip the transient notice. The Museum and run receipt retain the award. Victory and defeat receipts show newly discovered entries, achievements, newly unlocked starters and increased records when present. Abandonment returns to title and keeps the receipt in Museum Runs.

## Starting relics

Nine alternate loadouts remain available as ordinary relic purchases or rewards without a profile unlock. The Badge is exclusively a starter. All ten use their ordinary effects. The matched-action test checks actual effects, and the controlled interface roster exercise starts and abandons a run with each one. The 900-campaign headless sweep used the standard starting deck and stats for every choice.

| Relic | Build | Effect | Starting unlock |
|---|---|---|---|
| Beta Tester's Badge | Churn Engine | First Churn each battle is free | Available immediately |
| Stopwatch Gear | Flow Extension | First combo receives +1s Flow, subject to the cap | Defeat either Act I boss |
| Pressure Gauge | Momentum Burst | +3 cap and +2 starting Momentum in battles with this relic | Finish three runs as victory or defeat. Retains historical eligibility |
| Echo Splice | Relay Echo | First Relay in each combo Echoes the last attack at 40% | First campaign victory |
| Ladder Rungs | Rank Ladder | Steps deal +3 damage | Perfect with four consecutive ascending attacks by one hero |
| Twin Dials | Suit Switching | Crosses grant +1 extra Momentum | Three successful chains with at least two Crosses and one Step each |
| Spare Pockets | Reserve Strategy | One more Reserve slot and +3 damage from Reserve | Play a card from Reserve in three committed encounters |
| Tower Plate | Guard & Counter | A Momentum Guard spend grants 12 Guard in place of 8 | Absorb 40 actual damage with Guard |
| Riveted Ledger | Cash Out | Cash Out payout increases by 30% | End four chains with successful Cash Out payouts |
| Breach Clamp | Interference Exploit | Lock or Scramble gives +1 Momentum and +3 Guard. Locks are 1s shorter | In two completed encounters, land a disrupted or formerly locked attack or Churn a Glitch |

**Tower Plate replaces the proposed Iron Filings.** In 60 paired seeds, regular Iron Filings won 55 campaigns and lost 4.03 HP per battle versus 47 wins and 9.45 HP with the Badge. The learner gap was 38 versus 28 wins and 8.66 versus 14.55 HP lost. Tower Plate measured 49 regular wins at 8.18 HP, and 29 learner wins at 13.94 HP. Quick results were 60 wins with Iron Filings or Tower Plate and 58 with the Badge, at 1.06, 3.32 and 4.31 HP lost respectively. Iron Filings remains in ordinary acquisition. Ladder Rungs was also retested after a learner gap emerged. It won 59/47/35 out of 60 in quick/regular/learner, against the Badge’s 58/47/28. Its damage depends on Steps.

The opening offer signal applies only to a deliberately chosen alternative. Before acquisitions establish a build, the first eligible card slot can favor its tag at 40%. Existing acquired direction takes precedence as it forms. The normal rarity, Basic safeguard and pivot logic still apply. The Badge leaves the opening signal neutral. Starting relics alone do not count toward acquired build direction or mastery.

## Achievement catalogue

Targets measure committed events or distinct eligible discoveries. “Historical” indicates an achievement that can be inferred from earlier recorded evidence. A previously earned achievement with no known date uses a historical flag and an empty date. Prospective combat credit uses executed mechanics in completed encounters, including a finished fight lost in normal play. Queued, cancelled and discarded fight attempts do not grant that credit.

| Achievement | Category | Measurement and target | Starter reward | Evidence |
|---|---|---|---|---|
| Through the Scrapworks | Campaign | Any Act I boss win | Stopwatch Gear | Committed boss outcome, with historical recognition |
| Protocol Broken | Campaign | Any Act II boss win | — | Committed boss outcome, with historical recognition |
| Signal Restored | Campaign | One three-Act victory | Echo Splice | Engine and ordinary campaigns, with historical recognition |
| Every Challenge Answered | Campaign | Six different boss wins | — | All six boss outcomes and eight-run profile and historical recognition |
| Back for More | Campaign | Three victories or defeats | Pressure Gauge | Real result sequences and immediate-abandon test and historical recognition |
| Four on the Rise | Combat | One Perfect with four ascending attacks in one hero’s segment | Ladder Rungs | Executed four-card chain |
| Switching Signals | Combat | Three successful chains containing two Crosses and one Step each | Twin Dials | Executed chains with chosen suits |
| Ready When Needed | Combat | An actual play from Reserve in three encounters | Spare Pockets | Stash, play and commit test and profile simulations |
| Hold the Line | Combat | 40 damage absorbed by Guard | Tower Plate | Incoming damage actually absorbed |
| Take the Payout | Combat | Four successful chain-ending payouts | Riveted Ledger | Ordinary UI payouts and lethal-payout test |
| Signal Recovered | Combat | Interference response in two completed encounters | Breach Clamp | Executed Glitch Churn and campaign evidence |
| Pass the Baton | Combat | One Perfect with two heroes landing attacks | — | Two-hero executable Relay chain |
| Three in Concert | Combat | One Perfect with all heroes landing attacks | — | Three-hero executable Relay chain |
| Sixth Gear | Combat | One Perfect finishing on rank six | — | Executed rank-six Arte |
| Break the Counter | Combat | One boss adaptation break in a completed fight | — | Underlying counterplay and committed fight |
| Make the Draw Count | Combat | Attack drawn by Churn played in the same successful chain | — | Actual Churn, draw and executed payoff |
| Time Well Spent | Combat | Momentum buys Flow and that chain ends in a Perfect | — | Paid Flow in a completed chain |
| Invest the Momentum | Combat | Spend eight Momentum on attacks in a successful chain | — | Executed attacks and their costs |
| A New Combination | Collections | One known EX recipe | — | Activation and migration |
| Combo Researcher | Collections | Five different EX recipes | — | Campaigns and collection test and historical recognition |
| Complete Journal | Collections | All 15 recipes | — | Collector profile and existing recipe activation tests and historical recognition |
| Deep Signal | Collections | One advanced EX recipe | — | Recipe activation and collection test and historical recognition |
| Field Notes | Collections | 18 different known enemies | — | Encounter/summon tests and ordinary profiles and historical recognition |
| Curator of Broken Things | Collections | 20 acquired relics | — | Acquisition and ordinary profiles and historical recognition |
| Know Your Opponents | Collections | Six different bosses encountered | — | All six encounters and historical recognition |
| Changing Tactics | Mastery | Three proven directional builds in finished runs with an Act I boss win | — | Distinct completed build runs |
| Signature Victory | Mastery | One campaign win with twice the signature threshold and use in each Act | — | Committed victory and per-Act proof test and collector profile |

Build direction still comes from the run’s acquired cards, relics and mutations. To be recognised the run must finish, defeat an Act I boss and meet the proof threshold for its final direction. The minimums are two Ladder Perfects, five Suit Switching chains, four two-hero Relay chains, three Momentum Burst chains, three paid-Flow Perfects, three Churn payoff chains, five encounters using Reserve, 100 Guard absorption, six Cash Out finishes or three encounters responding to interference. Signature Victory needs twice that amount and positive proof in every Act. An historical archetype label contributes to the traditional build record only.

## Persistence and migration

Run schema v7 adds stable identity, the selected starter for new runs, acquisition evidence, cumulative committed combat proof and pending finalization. Museum schema v3 adds the settled-run watermark, one active-run cursor, achievements, outcome breakdown and build proof. Storage keys and the separate settings schema are unchanged. Run v3, v4 and v5 work through the earlier fixtures and v6 is covered by captured Phase 8 Act II and game-over saves. Museum fixtures were generated using the actual earlier v1 and v2 game code. They contain ordinary engine-run results, plus the earlier fields that those versions wrote.

A run checkpoint is written first. Its cumulative evidence is folded into the profile after that write. Reprocessing the same checkpoint copies only evidence beyond the profile’s cursor. Finalization checkpoints the result and date, commits the profile, then clears the active run. Success requires storage confirmation. A reload after the profile commit detects the stable settled ID and completes the clear without changing totals. A late callback for an older ID cannot clear a newer active save. Same-seed runs get separate IDs. History eviction keeps the settled watermark. If writing or clearing fails, the UI exposes a retry. Continue can recover a persisted pending checkpoint.

Migration preserves legacy outcomes and lifetime totals. Rows with clear result labels are classified. The lifetime difference that cannot be attributed to defeat or abandonment is displayed as earlier outcomes unavailable. An old profile that already qualified for Pressure Gauge from its inclusive total keeps the unlock, even if some runs were abandoned. New abandonment does not count for that condition. Historical dates are never inferred. Mechanical mastery begins with prospective evidence. Reopening the Museum and changing language leave the achievement state alone. Normalization recovers valid fields around missing, duplicate or malformed entries.

## Starting-relic balance and rewards

Run `node tools/progression.mjs balance 30`. All 30 paired seeds (1001–1030) at each speed reached the Act I exit for every final loadout and won their opening fight. The paired sweep uses the normal reward, map, boss and combat paths under the same player policy and starter deck, with controlled loadout selection to isolate the relic. Results below are quick / regular / learner. Raw output includes opening HP, opening duration and per-battle uses of Steps, Crosses, Reserve, Guard, Cash Out, Churn, Relay, Flow, Momentum and interference.

| Starter | Campaign wins / 30 | HP lost per battle | Seconds per battle | EX activations per battle | Matching final directions / 30 |
|---|---|---|---|---|---|
| `beta_badge` | 29 / 24 / 11 | 4.57 / 9.21 / 14.88 | 28.46 / 40.89 / 38.66 | 5.44 / 4.85 / 4.51 | 3 / 3 / 2 |
| `stopwatch_gear` | 28 / 25 / 11 | 5.2 / 10.72 / 17.65 | 27.21 / 38.82 / 37.34 | 5.54 / 5.55 / 4.95 | 9 / 10 / 10 |
| `pressure_gauge` | 29 / 23 / 13 | 4.26 / 9.44 / 15.09 | 26.58 / 39.42 / 37.73 | 5.54 / 5.28 / 4.68 | 12 / 12 / 11 |
| `echo_splice` | 29 / 25 / 9 | 5.26 / 10.51 / 17.54 | 27.35 / 37.91 / 37.13 | 5.65 / 5.72 / 5.01 | 12 / 11 / 13 |
| `ladder_rungs` | 29 / 24 / 19 | 4.52 / 10.01 / 14.13 | 28.13 / 39.91 / 38.68 | 5.09 / 4.85 / 4.95 | 10 / 12 / 13 |
| `twin_dials` | 30 / 20 / 10 | 5.99 / 11.6 / 16.42 | 27.03 / 37.16 / 34.66 | 5.34 / 5.03 / 4.54 | 10 / 10 / 11 |
| `spare_pockets` | 30 / 24 / 15 | 4.89 / 10.24 / 15.46 | 29.24 / 41.67 / 39.94 | 5.4 / 5.35 / 5.06 | 8 / 10 / 9 |
| `tower_plate` | 30 / 22 / 17 | 3.26 / 8.32 / 13.4 | 30.18 / 41.88 / 41.72 | 5.4 / 5.43 / 4.76 | 14 / 16 / 13 |
| `riveted_ledger` | 30 / 25 / 18 | 4.26 / 9.34 / 15 | 26.35 / 38.9 / 39.61 | 5.24 / 5.06 / 4.6 | 8 / 9 / 5 |
| `breach_clamp` | 30 / 24 / 14 | 5.45 / 8.53 / 15.74 | 26.94 / 37.46 / 37.53 | 5.2 / 5.72 / 5.21 | 14 / 14 / 14 |

The regular policy saw 3.43 first-slot Reserve offers per campaign with Spare Pockets against 0.77 with the Badge, and 3.60 Suit Switching offers with Twin Dials against 1.07 with the Badge. Spare Pockets produced the Reserve lead in 10/30 runs and 24/30 wins, equal to the Badge’s total wins. Twin Dials produced its lead in 10/30 and 20/30 wins. Those runs still received about one pivot opportunity per run in the tracked slot, with multiple end builds. Spare Pockets improves acquisition opportunities. The Phase 8 Reserve formation issue remains visible in the three-seed focused acceptance run. The Badge produced eight final directions in the quick and regular samples. Few ordinary runs ended as Churn even with the Badge. The separate Phase 8 Churn balance question remains open.

## Long-term progression

Run `node tools/progression.mjs profile 8` and `SB_FIRST_SEED=1007 node tools/progression.mjs profile 6 learner`. Each starts from a fresh profile, commits actual run events and reuses the earned profile in the next run. The variety policy selects among earned starters. The collector targets missing recipes and alternate bosses. Counts describe simulated progression opportunities. They measure neither human playtime nor human enjoyment.

| Policy | Results in order | Available loadouts after each run | Final awards | Cards | Relics | Enemies | EX | Bosses defeated |
|---|---|---|---|---|---|---|---|---|
| Ordinary | WWWWWWWL | 9 → 9 → 10 → 10 → 10 → 10 → 10 → 10 | 26/27 | 56/81 | 23/39 | 23/25 | 13/15 | 6/6 |
| Learner | WWLWLWLL | 8 → 8 → 9 → 9 → 9 → 9 → 9 → 9 | 24/27 | 49/81 | 26/39 | 24/25 | 12/15 | 6/6 |
| Quick | WWWWWWWW | 7 → 8 → 9 → 9 → 9 → 9 → 9 → 9 | 23/27 | 54/81 | 28/39 | 23/25 | 14/15 | 6/6 |
| Variety | LWLLLWWW | 7 → 8 → 9 → 9 → 10 → 10 → 10 → 10 | 25/27 | 50/81 | 26/39 | 25/25 | 14/15 | 6/6 |
| Collector | WWWLWWWW | 9 → 9 → 10 → 10 → 10 → 10 → 10 → 10 | 27/27 | 52/81 | 26/39 | 23/25 | 15/15 | 6/6 |
| Learner, defeat-first seed range | LLLLLL | 7 → 7 → 8 → 9 → 9 → 9 | 20/27 | 51/81 | 19/39 | 23/25 | 12/15 | 4/6 |

The first ordinary seed earned eight alternates, including Echo Splice, and had all ten after the third run. The variety profile lost its first run, unlocked Echo Splice on its second and Spare Pockets on its fifth. The defeat-first learner never won its six samples. It still claimed seven options from its first run, Pressure Gauge on run three and Spare Pockets on run four. The ordinary learner and quick policies ended with 0/3 Reserve encounters. This makes Spare Pockets sensitive to player intent. Its requirement can be met with the normal Reserve slots and the starting deck. The collector completed all 27 achievements, all 15 recipes and all six boss wins in eight runs. An exploratory catalogue milestone is quite different from collecting every card or relic. The measured first-win profile is front-loaded. Later recognition is more heavily weighted toward mastery and collections. Whether that feels well-paced is a final beta question.

## Acceptance and regression evidence

Run the browser commands below against `npm run serve` on port 8123. They use Playwright with Chromium. The acceptance programs write results, screenshots and available stall diagnostics to the chosen output directory.

| Command | What it exercises |
|---|---|
| `npm test` | 261 passing tests, including 18 added Phase 9 behavioral cases. The existing suites retain coverage of six bosses, eleven adaptations, all fifteen EX recipes, persistence, economy, targeting and timing |
| `node tools/accept9.mjs ui en 844 390 OUTPUT` and the same in Russian | 23/23 in each language. Fresh profile, locked controls, actual Cash Out/EX unlock, defeat, receipt, reload, use of an earned starter, acquisition/removal/trade, Mirror Shard summons, abandonment and language switching |
| `node tools/accept9.mjs historical ru 844 390 OUTPUT` and the same in English | 6/6 in each language. Captured v2 profile plus active v6 run, unknown dates, preserved deck and prior records |
| `node tools/accept9.mjs loadouts ru 1180 820 OUTPUT` | 12/12. Explicitly seeded earned eligibility. Every actual selector choice applies one relic, respects baseline stats, and survives ordinary abandonment as a discovery |
| `node tools/accept9.mjs recovery en 844 390 OUTPUT` and the same in Russian | 3/3 in each language. A captured pending victory and one injected active-save clear failure, then real browser reload and one permanent victory |
| `node tools/accept9.mjs layout LANG W H OUTPUT` | Seven landscape sizes in both languages. Native scroll body, accessible select/filter controls and footer placement. Checked fresh, locked and fully available rosters |
| `node tools/accept8.mjs ui en 844 390 OUTPUT` | 51/51 in English and 51/51 in Russian. Phase 8 mechanics through the real UI with its documented fixtures |
| `node tools/accept8.mjs runs 3` | 10/11. Nine directional families and the four-family gate passed. Reserve did not meet the focused formation criterion on these three seeds |
| `node tools/accept8.mjs campaign en 1180 820 OUTPUT` and `campaign ru 844 390 OUTPUT` | Ordinary fresh-profile wins in both languages. Each initial run passed 11/11 checks, played 18 battles and advanced through all Acts to ending, credits, results, Museum and new run. The Russian rerun with per-Act reloads passed 16/16 checks and won after 16 battles. All three completed without recovery intervention |
| `node tools/accept5.mjs OUTPUT en 844x390` | 33/33. Command queue, recovery, Relay chain, safety, rewards and reload |
| `node tools/accept6.mjs en 844 390 OUTPUT` and `--part=a` | A/B reached Act II and restored it with all checks passing. A/C then passed 32/32, including skipping and replaying tips on the corrected tool |
| `node tools/accept7.mjs en 844 390 OUTPUT` | 47/47. EX activation conditions, actual cancellation results, discovery/replay distinction, Journal and reload |
| `node tools/targeting.mjs` | 36/36. Player target selection, threats and execution-time targeting |
| `node tools/pwa.mjs OUTPUT` and `PWA_PATH=/signalbreak/ node tools/pwa.mjs OUTPUT` | 20/20 and 19/19. Cached launches, existing run, play offline, achievements, Journal, unlocked offline start, reload, and service worker replacement |

Phase 9 UI fixtures arrange card draw and HP to exercise timing-sensitive accomplishments, controlled store/trade menus, one summon and storage failures. Qualifying cards, finish actions, purchases, removals and choices use the real controls. The campaign tests use normal player interaction and normal generation. A historical profile supplies eligibility for the alternate-starter campaign. Engine fixtures control maps, damage or outcomes as their test comments declare.

### R1–R7

| Regression | Evidence |
|---|---|
| R1 Enemy pressure | `node tools/pacing.mjs 60 --act1 --pace=2.5 --relay=active --json` gave byte-identical Phase 8 and Phase 9 JSON. Across the 13 learner encounter fixtures, short action gaps were zero. Targeted ATB and pause checks remain in the suite. |
| R2 Decision time | The same learner run recorded 100% wins in its isolated encounters and at most one timeout per 60 in a fixture. Default loadout and Relay eligibility unchanged. |
| R3 Downtime | Paired timing harness measured identical execution, decision and recovery metrics. Phase 5 browser check confirms a post-chain breather pauses ATB and recovery alone does not. |
| R4 Targeting | 36/36 targeting UI checks. The combat additions observe resolved damage and command state without replacing the target at execution. |
| R5 Early survivability | The default loadout won all 30 Act I samples at each simulated speed and 29/24/11 of 30 whole campaigns. Both default fresh UI runs reached credits. |
| R6 Readability | Phase 9 menus, filters and results exercised at phone/tablet sizes. The paired card-hand audit reports the same 6.4 CSS px Russian minimum at 667×375 on the baseline and Phase 9. This existing small text remains a Phase 10 issue. |
| R7 Saves, locale, offline and campaigns | Both languages, v3–v7 run migration, v1–v3 Museum, duplicate callback and interrupted writes, programmatic tests, three-Act browser play and the existing PWA harness. |

### Corrections and unresolved verification

- **Rarity promises.** Build-tagged offers once selected a lower nearest rarity. Explicit minimum rarity is now applied before that search, including the Basic safeguard. Tests force a marked build without a card of the intended rarity and check uncommon-or-better, rare and boss guarantees against the actual event and reward definitions. For an ordinary unpromised offer, nearest-rarity fallback still helps builds with unusual rarity coverage.
- **Compulsory event choices.** The ordinary headless campaign now resolves required choices via public run operations and fails if no legal choice exists. Leaving a node cannot erase a mandatory unresolved selection. The three-seed focused run still misses Reserve formation, recorded above.
- **Act II stalls.** Neither of the first two complete campaigns reproduced the old unexplained stall. A later Echo Splice campaign stalled at Act II floor 17 after 10 battles with full HP and pending Rest. The screenshot showed an open Tune-up modal and disabled Upgrade. The automation tapped the first card, which was already upgraded and ineligible. Its selector now targets a legal card before pressing the enabled confirmation button. The original Phase 8 report did not identify its stuck screen or cause, so this specific reproduction does not establish what happened in that run.
- **EX cancellation timing.** The Phase 7 tool captured a screenshot before cancelling an action that was still queued. Under load, that gave it time to execute. The capture now follows the assertion and the tool passed 47/47.
- **Storage failures.** The interrupted write path previously discarded the run or could double-count it. The v7 save protocol checkpoints before clearing, with tests for quota failures, duplicate callbacks, same-seed IDs, browser reload and completion within the bounded history.

## Presentation and final beta handoff

Phase 10 work remains on small-screen card readability, EX banner congestion, Museum and loadout presentation, audio, animation, visual consistency and physical-device/browser verification. Phase 11 retains the broader Churn pairing and Reserve acquisition questions. Simulations and interface tests establish reachability and observed behavior. The final beta after the full roadmap will assess whether players find the unlocks rewarding, understand the Museum, and voluntarily explore different strategies at the observed pace.

## Packaging

The web/PWA build and Swift Playgrounds project use 0.2.9. `npm run build:ios` generated the standalone web and artifact HTML, service worker, manifest, and `dist/ios/SignalBreak.swiftpm.zip`. The ZIP passed `unzip -tq`. Its embedded HTML started a fresh run in local Chromium. Native Swift execution on an iPhone or iPad is still unverified. The existing GitHub Pages and Yandex mirror workflow remain the distribution paths. Syncing an App Store record is outside this phase.

The English Echo Splice campaign (seed 397281893) started from the captured Phase 8 profile, restored exact checkpoints in all three Acts, beat the Clockwork Regent, Mirror Array and Signalbreak Core, and recorded a 1560-point victory after 18 battles. It passed 16/16 checks with zero recovery interventions. The Russian fresh campaign (seed 959015332) also passed 16/16 with zero interventions. It restored all three checkpoints, beat the Scrap Tyrant, Mirror Array and Signalbreak Core in 16 battles, and reached an earned-loadout start after results.

The build stamps source commit `c26a13c8f1cd9bb955a14226adcd88dfb82c8bd4`. The Phase 8 distribution remains recoverable at `6f3f7e9ba864e104cc2b83c55b45b3d1b9ee0486`.
