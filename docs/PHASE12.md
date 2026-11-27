# Phase 12 beta candidate

## Starting checkpoint and acceptance measurements

The verified development branch started at distribution `77ed51bd848436a3ef1e7d62f6c9844bec6ebb9d`
with source `c35c1c1ea4671774f5a67276d5ade0bf2b58ee15` and version 0.2.11. The checkpoint is
preserved at `checkpoint/phase-11-0.2.11`. The Phase 10 comparison is `fffcb60`. Phase 11
contains 87 cards, 41 relics, 13 mutations, 11 grafts, 28 enemies, 33 ordinary formations,
six bosses, three Acts, 17 recipes, ten builds, ten starters, 27 achievements and 38 clips.

The archived Phase 11 first and second cohorts count eight learner deaths at the Core and
six each with the Winch/Wing and Wisp/Predator formations. Phase 10 recorded four Core
learner deaths and five with Wisp/Predator. Phase 11 reached Act III in 54/60 learner runs,
matching Phase 10. Fight-level traces need to establish where damage spikes and disruption
coincide. A death in a particular encounter does not by itself establish causation.

Measurements fixed for the corrective pass:

- Keep the Phase 11 matching method with 30 campaigns per policy per seed range. Aim to
  recover the five combined learner wins lost since Phase 10, with no meaningful additional
  drop in regular or quick completion. Check the original ranges and a third, unseen range.
  Opening timing and Act I survivability remain regression checks. Check individual boss and
  formation results plus damage, Guard, action mix, and HP entering the decider.
- Retain executed Churn-draw and in-chain proof as separate metrics. Five fewer Churn wins
  across the comparable 60 campaigns is an investigation trigger. Track Reserve use, a
  real setup/counterplay opportunity, and formation on the original three seeds. Include
  changes to the ordinary policy separately from game changes, on both checkpoints.
- Compare all ten focused directions and the ten unchanged starting kits. For repeated
  disparities inspect play behavior and individual effects before making a narrow change.
  Keep distinct win rates where they follow distinct strategies and no exploitable loop.
- The beta environment needs clean ordinary packaged campaigns, safe interrupted saves and
  updates, verified offline progression and bounded performance on tested desktop browsers.
  Existing essential 12 px effect text is the compact layout floor. Measure the same fixtures
  in both builds. Native, audible and human-experience acceptance require separate evidence.

## Corrective balancing

### Pressure and counterplay

Phase 11 did not lose more learners before Act III. The problem was concentrated in individual
late encounters. Across the first two seed ranges, the Core’s Signal Collapse alone dealt
428 net HP and absorbed 128 Guard in its eight learner losses. Four losses ended on Collapse.
Seven of the eight defeated learners had already broken their adaptation. Two arrived with
17 HP or less, and several others started healthy. Repeat vulnerability and incoming damage
mattered even when the adaptation was defeated. Phase 12 brings Collapse from 13 to 11 base per
hero and inserts Tempo Theft before the next Carrier Beam in the phase-three cycle. This
preserves the adaptation, Clock Protocol, damage, and the need to prepare for the largest hit.

Winch/Wing lost six learners in the original ranges, three from 117 HP or more. In those
losses Needle Rain dealt 261 net HP, Dive 169 and Return Hook 197. Shorter Tow pressure
and 4 seconds of self-Expose give a clearer retaliation opportunity. This change reduced
average damage slightly in the sample but did not reduce the observed loss proportion.
The Wisp/Predator traces show both Hunt burst and card disruption. Hunt now gives partial
Guard credit before its threshold, preserving the maximum against an unprotected party.
A latched card becomes the next draw, giving a path to retrieve it after disruption.

| Ordinary policy, wins per 30 | Phase 10 seeds 1001 / 3001 / 5001 | Phase 11 | Phase 12 |
|---|---:|---:|---:|
| Quick, 0.55s | 29 / 28 / 30 | 29 / 30 / 30 | 30 / 30 / 30 |
| Regular, 1.0s | 24 / 22 / 22 | 19 / 23 / 25 | 25 / 23 / 28 |
| Learner, 1.4s | 11 / 15 / 12 | 8 / 13 / 11 | 12 / 15 / 13 |

All use the stock deck and Badge. The third range was scored separately. The learner total
in the original 60 is 27, compared with 26 on Phase 10 and 21 on Phase 11. Across all 90,
mean learner damage in the Core encounter fell from 39.00 to 25.30, with deaths 8/21 → 5/20.
Wisp/Predator deaths were 6/29 → 4/29. Winch/Wing deaths were 8/54 → 9/56, despite a small
reduction in mean damage (41.70 → 40.79). Relative difficulty thus still varies by encounter.
The earlier engine and current 2.5-second opening timing outputs match, including the
learner time budget, enemy spacing, attacks, Relay and pauses. Identical starting seeds do not
imply identical later paths after a changed fight, reward or RNG call.

### Final build and loadout comparison

| Focused build | Phase 10, primary / second | Phase 11 | Phase 12 |
|---|---:|---:|---:|
| Rank Ladder | 23 / 25 | 26 / 27 | 27 / 29 |
| Suit Switching | 20 / 21 | 17 / 24 | 20 / 23 |
| Relay Echo | 18 / 14 | 20 / 15 | 18 / 17 |
| Momentum Burst | 21 / 21 | 18 / 23 | 19 / 21 |
| Flow Extension | 18 / 19 | 18 / 25 | 18 / 24 |
| Churn Engine | 19 / 13 | 24 / 23 | 26 / 24 |
| Reserve Strategy | 20 / 21 | 24 / 17 | 24 / 21 |
| Guard & Counter | 27 / 26 | 28 / 27 | 27 / 25 |
| Cash Out | 29 / 29 | 29 / 29 | 30 / 29 |
| Interference Exploit | 17 / 12 | 14 / 16 | 17 / 19 |

Each sample contains 30 ordinary focused campaigns per direction with the same policy and stock
starter. The Phase 11 audit and its uptake summaries cover all acquisitions and the ten
strategy paths. Phase 12 retains the original focused tests, including Reserve formation on
all three seeds and mechanics exercised in combat. The aggregate does not establish equal
strength or isolate the value of a single card. The per-build export reports stage clears,
formation, offers, pivot opportunities and actual mechanics. Offer and deck means are per
run. Combat means are per recorded encounter. [Focused campaign metrics](phase12/focused-builds.csv)

- Cash Out averaged 34.27 seconds and 25.83 Guard absorbed per fight. The Guard specialist
  absorbed 45.99 in 47.73 seconds. These are distinct tempo and defensive strategies.
  Quick Exit appeared in 43/60 Cash Out campaigns on both builds and now grants 30%, down
  from 40%, with the quick Momentum reward intact. HP lost rose from 7.35 to 7.89 per fight
  in the matched cohorts, while wins remained near the ceiling. A separate evaluation
  reducing Guard from two-card payouts lost two Cash Out wins across 90 campaigns and two
  learner wins in the third range, even though it helped the earliest learner ranges. That
  change was left out. Cash Out remains the leading policy result and a beta observation priority.
- Interference recorded a qualifying response in 267/971 battles (27.5%), with a battle HP
  loss improvement from 13.02 to 12.57. Some tagged cards are enablers or positional tools. Versus a
  clean hand and an enemy with no disruption, the payoff is deliberately lower. Interference
  Reversal and ordinary lock-clearing cards still activate. The separate role and the weaker
  coverage against clean enemies remain without a universal damage buff.
- Reserve’s focused plays increased from 4.09 to 4.22 per encounter and loss fell from 12.21 to
  11.27 HP. The original three-seed gate passed in all three runs, two of which won. With the
  separate Reserve specialist, the Badge won 46/60 and Spare Pockets 52/60. A controlled variant
  of the otherwise ordinary *policy* used Reserve only when a held card gave an explicit payoff.
  On the same 30 regular seeds it made 233 plays versus 44 under the stock policy (24 vs 25 wins).
  Applying the identical variant on Phase 11 yielded 251 plays and 24 wins. This demonstrates
  the already accessible use case and what the stock policy misses. The product change preserves
  a way to retrieve a latched card, rather than granting extra capacity or free attacks.
- Churn executed replacements at 0.85 → 0.88 per fight, with 0.27 strictly qualifying mid-chain
  payoffs in each build. The additional payoff comes from intentional prepared openings and real
  replacement execution. Queued, cancelled, tucked and exhausted cards retain their existing
  exclusions. Resource caps and recharge rates remain as in Phase 11. No indefinite loop was
  observed in the bounded effect or scheduler soak tests.
- Switchyard used 9 and 14 times in the two focused-plus-ordinary cohort mixes (450 campaigns
  per range). A visible-preview experiment holding a legal Arte and actively looking for its
  matching prepared basic activated 302 times across quick and regular runs in a separate
  30-seed study. The same experiment already activated 299 on Phase 11. Deliberate pursuit
  reduced wins, which shows its time and opportunity cost. No specific card is required.
  The new bilingual hint names the sequence directly. The recipe mechanics, effects and EX rail
  remain. All 17 recipes activated in the broad tests and have controlled verification.

Starter profiles on both seed ranges kept identical HP, Scrap and decks. All 60 opening
fights and Act I completions per policy and loadout passed. Each cell is wins out of 60.

| Starting relic | Quick | Regular | Learner |
|---|---:|---:|---:|
| Beta Tester's Badge | 60 | 48 | 27 |
| Stopwatch Gear | 60 | 46 | 28 |
| Echo Splice | 60 | 43 | 32 |
| Pressure Gauge | 60 | 45 | 36 |
| Ladder Rungs | 60 | 52 | 38 |
| Twin Dials | 60 | 47 | 30 |
| Spare Pockets | 60 | 44 | 25 |
| Tower Plate | 60 | 55 | 36 |
| Riveted Ledger | 60 | 51 | 35 |
| Breach Clamp | 59 | 50 | 32 |

Tower Plate’s real advantage is more mitigation on legal +Guard expenditures. The regular
policy uses that action in visible danger and the learner policy does not. The old 28 versus
19 gap on the primary range is now 27 versus 25. Tower still leads on the second regular
range, 28 versus 23. On both learner ranges the leader is Ladder Rungs. No account-level
stats, starter conditions or unlock thresholds changed. Early unlock concentration remains
a replayability question for the beta rather than a reason to add grinds.
The five cumulative profile simulations each played eight campaigns. After one run they
had seven to nine of the ten choices, including a learner and a variety profile that lost.
The learner's first victory was run four and it still had nine at the end. The ordinary
policy acquired Pressure Gauge on run three and Spare Pockets on run four. This verifies
early choice and the continued mechanical gates, with player motivation still unmeasured.

## Release-candidate engineering

| Finding | Reproduction | Correction and regression evidence |
|---|---|---|
| A stale tab could overwrite a newer run checkpoint or profile. Malformed data looked like a fresh profile. | Load the same snapshot in two sessions, update one, then save from the other. Separately make localStorage unavailable or seed a malformed record. | Save APIs distinguish an empty key, an unreadable record, a changed snapshot and a successful write. They check the current identity before overwriting or clearing it. The UI reports the failure and offers the latest checkpoint. Storage fixtures cover newer runs, newer checkpoints within one run, malformed fields, denied writes, and intentional data erasure limited to game keys. |
| An interrupted run finalization could leave a live save after the profile commit. | Fail the clear operation after the profile has already been written, then resume. | The Phase 9 two-stage protocol handles recovery with exactly one run record and one set of awards. Browser fault injection demonstrated this in Russian, with three assertions passing. The save schema and storage keys are unchanged. An ordinary Continue from combat restarts that encounter from the checkpoint. |
| A new worker could cache an old page and activate with a mismatched bundle. It could also remove a sibling scope's cache. | Serve the worker before its matching HTML. Use a sibling app-cache sentinel in the same origin. | The worker validates the page bytes and completes its own asset install before it can activate. Failures leave the previous cache usable. Activation removes only this app scope's superseded caches. Tests assert an old offline launch, a subsequent upgrade, survival of the sibling cache and a save/unlock still readable offline after restart. |
| Backwards presentation timestamps could stop the Canvas draw loop. | Replayed on the Phase 11 distribution with a controlled negative timestamp, and the old mirror-update run also produced a negative Canvas radius. | Battle and scene clocks are monotonic and the current build draws successfully under the same timestamp fixture. The test observes the real draw loop across the timestamp change. Combat scheduling and elapsed-time caps remain in force. |
| The compact target label could fall outside the play area, and party labels could intersect the adaptation plaque. | Use the 740×360 DPR 2 Mirror Array fixture with actual summoned enemies and EX recap. | Keep selection labels inside the field and give hero labels clearance. Mirror Array with two shards and a three-enemy ordinary formation retained three separate targets, 12 px effect text and independent adaptation and EX recap areas in the fixture. |
| Hunt and Reflection forecast information could misstate the defended or dynamic hit. | Change live Guard and vary the last resolved hit. | The intent previews and executed abilities use the same damage inputs. Contract tests cover dynamic Reflection, and the bilingual entry explains Hunt mitigation and the new destination of a latched Reserve card. |
| Quiet paused screens continued redrawing. The audio scheduler advanced into a muted or interrupted context. | Count Canvas paint calls while paused, and inspect context and music state following real control events. | Static paused state is invalidated by presentation changes such as viewport changes. Bounded viewport rescaling is accounted for. Audio unlock understands pointer, keyboard and click activation, and music work is suspended when its context or volume cannot produce playback. |

The procedural stress fixture walked reachable nodes and edges on all three generated Act
graphs for each of 1,024 seeds. It observed all 33 ordinary formations and checked Act
restrictions and reachable routes. Combat tests exercise reservations, legal cancellation,
target death and retargeting, interrupted EX actions, Reserve, Churn, enemy summons and boss
adaptations. The existing historical Phase 4–8 coverage is retained. The original undocumented
Phase 8 Act II stall still has no established root cause. Recent campaigns and recovery tests
exercise the transitions that succeeded, so their completion does not identify the old failure.

## Performance and presentation evidence

Measurements used desktop Chromium in a 740×360 viewport at DPR 2. An instrumented page
counted actual battle draws and collected RAF interval, event-to-paint time, observer latency
and post-GC heap data. Timings include the browser and test runner under variable load.

| Measurement | Phase 11 | Phase 12 |
|---|---:|---:|
| Packaged HTML | 1,022,039 bytes | 1,025,366 bytes |
| Swift Playgrounds ZIP | 921,980 bytes | 921,858 bytes |
| First app ready, observed | 1,750 ms | 1,458 ms |
| Warm ready, three samples | 609, 534, 534 ms | 721, 436, 338 ms |
| Paused Canvas draws over 1.8 s | 77 | 0 |
| Simple active draw p95 | 5.8 ms | 5.6 ms |
| Crowded active draw p95, stressed sample | 25.1 ms | 4.6 ms |
| Heap after collection, first / eighth mount | approximately 4.06 / 5.86 MB | approximately 4.03 / 5.90 MB |

The repeatable optimization is elimination of static paused draws. The loading, active draw
and timing samples vary with competing processes. They do not establish a general rendering
speedup or rule out slow accumulation on very long sessions. No mobile hardware, thermal,
battery or hardware audio measures were available.

The eight bilingual viewport sizes were measured on the packaged build, with no detected
collisions between the sampled card affordances, enemy plates and EX recap. All 16 combinations
preserved at least 12 CSS pixels for essential card effects. The shortest field is 141 px.
Rotation, touch selection and keyboard input were sampled separately. Chromium entered
and exited fullscreen during a retained battle. A simulated visibility event paused combat,
and Resume restored it. The virtual desktop did not produce a native hide event during
tab switching. Linux Firefox ESR 153.5.1 and WebKitGTK 2.52.6 each opened the package at phone
dimensions, accepted user input, executed a Basic and restored the same run and language.
These were smoke tests. Firefox audio remained suspended in the headless test. WebKitGTK
entered a running audio context, while the host had no usable PCM output. Safari, fullscreen
standalone on iOS and physical Apple device tests remain open.

The mixed music/effects stress recording peaked around 0.159 on a normalized scale with
zero clipped samples. Muting, first user activation, pause ducking and unmute recovery were
measured, with Chromium reaching a running context again. These are technical checks.
Sound quality and device interruption behavior belong to direct listening and physical tests.

See [crowded compact field](phase12/compact-formation.jpg),
[Mirror Array and the EX recap](phase12/compact-mirror.jpg), and
[offline campaign results](phase12/offline-results.jpg). The Mirror fixture and
[scheduler contact frames](phase12/motion-samples.jpg) are controlled presentation evidence.
The top row shows Bolt Volley and the bottom row Grand Relay, in scheduler order from left
to right. The campaign is ordinary progression.

The larger Russian sweep visited 1,040 rendered screens, including base and upgraded cards.
It reproduced five small overflows at 740×360 on Dead Drop, Mirror Wire and Pressure Splice.
Their final compact wording keeps the conditions and values. The detail views retain the
full wording. In a dedicated packaged retest, all six versions remained at 12 px and fit
without measured overflow. Repeating the 740×360 slice checked 354 English and 354 Russian
screens with zero reported issues. [Before and after, top then bottom](phase12/compact-copy-comparison.jpg).

A second packaged performance sample found median warm readiness about 557 ms, simple and
crowded active draw p95 of 3.1 and 5.7 ms, 0 paused draws, 7 ms button-to-paint and 1.4 ms
save persistence p95. Its first ready result was 1,744 ms. These readings confirm the sizing
and pause result, with the spread of the remaining timings visible.

## Regression matrix

| Coverage | Evidence |
|---|---|
| Unit and integration tests | 281/281 on the Phase 11 checkpoint and 288/288 on the clean final source. The matrix includes the original combat, timing, campaign, rarity, archetype, adaptation and progression suites. |
| R1 enemy pacing and R2 decision time | Identical Phase 11 and Phase 12 canonical 2.5-second learner opening output. Enemy pace and deliberate Relay timing remain under the standard suites. |
| R3 downtime and action scheduling | Phase 5 browser fixture 33/33. The queue position, contact, cancellation, reserved Momentum, post-chain breather and enemy ATB during Recovery are independently checked. |
| R4 targeting | 36/36 over English and Russian touch viewports. The queued attack fixture records one hit and one command still waiting before the retarget. Death, indicators and target cycling were checked separately. |
| R5 early survivability and content | 60/60 opening and Act I completions for every measured policy and loadout. The original Phase 8 focused formation suite passed 11/11, with all ten actual build paths represented. |
| R6 presentation and accessibility | Sixteen bilingual layout combinations, Russian full-surface sweep and fixed-card retest, reduced motion, muted state, animated combat fixtures, and the snapshot comparisons above. The engine and Canvas checks were run separately from the sweep. |
| R7 saves, localization, offline and progression | Russian Phase 7 EX fixture 47/47, Phase 8 interface scenario 51/51, Phase 9 interface, all-loadout, historical and interrupted-finalization fixtures 23/23, 12/12, 6/6 and 3/3, plus complete ordinary campaigns and real worker cache replacement. |

The eight Phase 4 failures carried through Phase 10 no longer reproduced as a group. The
historical suite initially recorded 22/23. Its single intermittent missed snapshot was a
Reserve refill preview check. Read-only event logging was added to show the exact slot,
draw, gesture and intervening actions. The same assertion passed with the observed predicted
card in the same slot, 23/23. The first miss had insufficient evidence to establish a cause.

Phase 5 reproduced a different problem in its fixture. The Warden Locked Pin's exact
scripted Arte, then its regional Static modifier could lock it again. Two naturally active
Iron Maws keep the planned chain and enemy ATB coverage. The test still checks lossless
cancellation, all three heroes, and actual outcome, and the tutorial suite checks enemy Lock
as its own interaction. Phase 6's initial queue lesson expected an eligible hand at one
particular moment. The harness now lets the player reach another eligible chain through its
ordinary controls and asserts the actual paused lesson and executing/waiting UI. The
English returning-player and staged tutorial run passed 32/32. The full Russian suite passed
47/47 through ordinary Act I play, the boss and a resumed Act II checkpoint. Targeting replaced a wall-clock sleep
between contact and retargeting with browser-clock fixture control. Every gameplay input is
still a touch and the exact combat queue assertion is stronger.

The earlier Phase 11 → Phase 12 Pages update passed 22/22. The historical mirror path
completed all cache and save operations but reproduced one page error stamped
`c35c1c1`, the old build's Canvas radius exception. Candidate-only Pages and mirror packages
passed 22/22 and 21/21 with interrupted worker publication, isolated same-origin sibling scope
coverage and browser-offline restart. The rollback below uses the same game versioning,
scope and saved profile protocol.
The final stamp passed the Pages suite 22/22 and the exact upgrade between the two 0.2.12
candidates passed the mirror suite 21/21.

### Ordinary gameplay and controlled coverage

| Packaged session | Evidence |
|---|---|
| Phase 11 baseline, EN tablet, seed 727643445 | 16/16. Ordinary campaign completed before corrective work. |
| 0.2.12 EN tablet, fresh Badge, seed 201643931 | 16/16. Tyrant, Mirror Array, Corruptor. Three resumes, credits, next run. |
| 0.2.12 RU phone, historical profile with Echo Splice, seed 806842376 | 16/16. Tyrant, Mirror Array, Corruptor. Three resumes, credits, next run. |
| 0.2.12 EN phone offline, fresh Badge, Reserve-focused policy, seed 393416783 | 18/18. Tyrant, Mirror Array, Core. Victory and Reserve-led build through ordinary card offers. Three resumes, credits, Museum, next start, zero network requests while offline. |
| Final stamp `ba84a11`, RU phone, fresh Badge, seed 843923648 | 16/16 after 17 battles. Regent, Protocol Auditor, Core. Three resumes, 11 EX discoveries, credits, Museum and next run. [Results screenshot](phase12/final-ru-results.jpg) |
| Earlier 0.2.12 iteration, ordinary seeds 449171355, 46982699, 396826758 | EN tablet Badge, RU phone Echo Splice and EN phone offline Badge. Together with the later candidate runs, ordinary browser victories exercised all six bosses. These runs supply Regent and Protocol Auditor coverage. |
| Defeat and subsequent start | On the final stamp, a separate fresh run permitted ordinary enemy damage through defeat. Results, one defeat record, reload and the new run were checked independently from victory. |

Historical profiles supplied only the previously earned starting eligibility at session start.
Campaigns otherwise used actual taps, standard map generation, legal transactions and
ordinary rewards. Between them, the campaigns reached shops, events, rest, surgery, mutations,
elite fights, both endings relevant to their outcomes and subsequent runs. Rail Bailiff, Phase
Lantern and Vector Winch appeared in naturally generated fights. The Phase 12 roster, split-EX,
late-boss, time reversal, damaged storage and unusual queue tests supplied controlled coverage
for cases normal campaign sampling may miss. None of the completed campaign runs above needed
an automatic nudge or exposed a reproducible progression stall.

## Reproducibility, rollback and release

Build input is source `ba84a11062b9eb9673c96daecdb0c9c285294aeb`, which includes the
gameplay and storage changes in `6e9d6ae3a0f9499943c2640add5a89f348cb4402`. The final
package is 0.2.12. A second build from the clean source reproduces the HTML, service worker
and binary Swift Playgrounds ZIP byte for byte. SHA-256 values for the same build follow.

- `dist/index.html` `31681edbe19c5893925a2851545781d9475475e67faeb5580f7a79c424fbaef5`.
- `dist/ios/SignalBreak.swiftpm.zip` `4b54c8ccdd7debaba0091b913b5884e89662cb1074facf7463901bfd82e86808`.
- The distribution commit is `f8bc7a248f60f8b24163aef702ca0da64bb8aba7`.

```sh
git worktree add --detach /tmp/sb-beta-source ba84a11062b9eb9673c96daecdb0c9c285294aeb
cd /tmp/sb-beta-source
npm ci
npm test
npm run build:ios
unzip -t dist/ios/SignalBreak.swiftpm.zip
node tools/serve.mjs dist 8128
```

The archive holds the existing Swift wrapper, Info and icon configuration, and built game
resources. The package declares iOS 16.0, iPhone and iPad families and landscape. Install
Playwright as a test tool and use the browser build it supports, then run the relevant
acceptance commands in another terminal.

The production dependency audit found zero advisories. The development audit reported
one moderate advisory for esbuild's development server. The build uses its bundler and
the project serves local tests with the separate `tools/serve.mjs` script. No esbuild server
ships in the package. [Dependency advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99)

```sh
SB_URL=http://localhost:8128/index.html node tools/accept8.mjs campaign en 1194 834 /tmp/sb-beta-en
SB_URL=http://localhost:8128/index.html SB_CAMPAIGN_PROFILE=tests/fixtures/meta-v2-phase8.json SB_CAMPAIGN_STARTER=echo_splice node tools/accept8.mjs campaign ru 844 390 /tmp/sb-beta-ru
PWA_OFFLINE_CAMPAIGN=1 SB_CAMPAIGN_FOCUS=reserve node tools/pwa.mjs /tmp/sb-beta-offline
node tools/pwa.mjs /tmp/sb-pwa-pages
PWA_PATH=/signalbreak/ PWA_PORT=8201 node tools/pwa.mjs /tmp/sb-pwa-mirror
node tools/beta-browser.mjs compact /tmp/sb-beta-compact
node tools/beta-browser.mjs card-fit /tmp/sb-beta-fit
node tools/beta-browser.mjs performance /tmp/sb-beta-perf
node tools/beta-browser.mjs audio /tmp/sb-beta-audio
node tools/phase12-balance.mjs /tmp/sb-balance-a.json 1001 30
node tools/phase11-audit.mjs /tmp/sb-builds-a.json 30 1001
node tools/accept8.mjs runs 3 1 1 /tmp/sb-formation
```

Use seed starts 3001 and 5001 for the replication and holdout. For historical comparisons,
run the identical tool and policy in worktrees pinned to the earlier source and distribution
checkpoints. The reporting coverage spans the project’s existing test harnesses, so browser
tools that import `/src/` use the development server documented at their heads.

For a deliberate web rollback on the verified development branch, restore the published
`dist` files from `77ed51bd848436a3ef1e7d62f6c9844bec6ebb9d` in a clean checkout, review and
commit the complete folder together, and push to the same branch. Confirm the Mirror
workflow served the old source stamp `c35c1c1` and verify an offline relaunch with a retained
profile after activation. The Phase 11 source is separately recoverable at
`c35c1c1ea4671774f5a67276d5ade0bf2b58ee15`. No rollback was performed.

The deployment runner verified HTTP 200 and served source stamp `ba84a11` after publishing the
distribution commit. Independent Yandex and Pages requests from this environment were
refused by the network proxy. The [Swift Playgrounds ZIP](https://raw.githubusercontent.com/Magma-rager/def/f8bc7a248f60f8b24163aef702ca0da64bb8aba7/dist/ios/SignalBreak.swiftpm.zip)
was downloaded from the distribution commit and matched the locally validated bytes.
[Development mirror](https://signalbreak-game.website.yandexcloud.net/) ·
[Deployment run and served stamp](https://github.com/Magma-rager/def/actions/runs/46042528858)

## Defect register and beta readiness

No unresolved reproducible critical defect remains in the verified Chromium beta environment.
Phase 12 confirmation is bounded by the routes, browsers, fault cases and seeds above.

| Priority | Open item | Consequence |
|---|---|---|
| Major balance observation | Winch/Wing still takes learners out at roughly its former rate. Cash Out leads the current policy and Interference still trails. | Reassess repeated inaccessible pressure or dominant choices against human run circumstances. Current simulations do not establish perceived fairness. |
| Historical investigation | Phase 8 Act II stall, and one intermittent Phase 4 preview snapshot. | No independently reconstructed stall on current transitions. Preserve coverage, and capture exact pending state and UI on any recurrence. |
| Minor presentation | Grouped results toasts can cover part of the last boss line briefly at phone size. | The finished-run record and result controls remain accessible after the notification expires. |
| Compatibility verification | Firefox headless audio stayed suspended. No Safari/device, iOS installed-app or physical interruption test. | Cross-browser smoke evidence is available. Native installation, lifecycle, listening and actual device interaction need the planned verification. |
| Measurement limit | Eight-mount heap sample and repeated rendering measurements. | No bounded effect-list runaway observed in the stress runs. Long sessions and actual mobile performance remain unmeasured. |

| Distribution target | Verdict | Basis and remaining gate |
|---|---|---|
| Browser-based human beta | **Ready** in tested Chromium | Both languages, entire campaigns, defeat, reload, progression and package deployment. Firefox and WebKitGTK are smoke coverage. Safari is pending. |
| Offline PWA beta | **Ready** in tested Chromium | Actual offline campaign, interrupted worker update, scoped replacement, local save retention and re-entry. iOS Add to Home Screen is unverified. |
| Native Apple device testing | **Conditionally ready** | Valid, deterministic Playgrounds archive. Compile, run, save/resume, rotate, suspend and measure on hardware with the Apple toolchain. |
| Eventual public web release | **Not ready** | Owner-led beta, evidence-based fixes and final distribution verification remain. |
| Eventual App Store release | **Not ready** | Native compilation, real bundle identity, signing, device verification, beta and explicit submission approval remain. |

The bilingual [beta packet](PLAYTEST.md) describes access, controls and accessibility, and
collects experience-sensitive feedback on comprehension, timing, targeting, builds,
progression, presentation and performance. It includes a reproducibility template, asks whether
a player used Reserve and Churn spontaneously, and treats subjective observations separately
from repeatable failures. The [draft notes](RELEASE_NOTES.md) are prepared for later distribution.
Human beta testing has not commenced.

## Developer retrospective

Relative to the inherited implementation, the Phase 9 work demonstrates continuation of
the same run engine and coherent progression through stable saves, achievements and museum
records. Phase 10 authored differentiated animation clips and synchronized visual contact
with the scheduler. Phase 11 delivered new cards, procedural enemy sprites and enemy poses,
with acquisition and ordinary encounter evidence. Phase 12 reproduced earlier policies and
worked back from fight traces to narrow late-game changes. It also addressed stale save
writers, mixed package activation and the stopped Canvas loop. The same architecture survived
those changes, and the candidate can be regenerated from a named source commit.

This supports technical ownership and continued iteration on SIGNAL//BREAK. The earlier
Claude Code work established the core gameplay, procedural look and many of the regression
tools this phase used. The phase evidence shows new audiovisual work in that established
style and actual motion and gameplay review. It does not establish that the work equals or
surpasses the earlier artistic quality. Direct listening, device-specific polish, human
balance and comprehension, and native deployment remain unestablished capabilities here.
