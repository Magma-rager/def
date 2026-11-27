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
strength or isolate the value of a single card.

- Cash Out averaged 34.27 seconds and 25.83 Guard absorbed per fight. The Guard specialist
  absorbed 45.99 in 47.73 seconds. These are distinct tempo and defensive strategies.
  Quick Exit appeared in 43/60 Cash Out campaigns on both builds and now grants 30%, down
  from 40%, with the quick Momentum reward intact. HP lost rose from 7.35 to 7.89 per fight
  in the matched cohorts, while wins remained near the ceiling. A separate evaluation
  reducing Guard from two-card payouts lost two Cash Out wins across 90 campaigns and two
  learner wins in the third range, even though it helped the earliest learner ranges. That
  change was left out. Cash Out remains the leading policy result and a beta observation priority.
- Interference averaged only about 0.27 battles with a documented response, with a battle HP loss
  improvement from 13.02 to 12.57. Some tagged cards are enablers or positional tools. Versus a
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
