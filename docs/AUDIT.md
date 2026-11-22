# SIGNAL//BREAK — Implementation Audit (Phase 0)

Audit date: 2026-10-27. Baseline commit: `251bbb8` (branch `claude/adoring-newton-e9l4sf`). This is the recoverable baseline the roadmap asks for; `git checkout 251bbb8` restores it.

## How things were verified

| Code | Meaning |
|---|---|
| **U** | Engine unit test (`npm test`, file in brackets) |
| **S** | Headless full-run simulation through the real engine (`tools/simulate.mjs`) |
| **P** | UI-only playthrough: ordinary gameplay driven by taps and clicks, no state injection (`tools/milestone.mjs`, `tools/uiplay.mjs`) |
| **V** | Visually inspected in screenshots |
| **I** | UI check with injected state (proves the screen path, not natural reachability) |
| **—** | Implemented but not verified |

"Natural" below means reached through ordinary play with no state injection. The playthrough bot taps roughly every 0.15 s and reads engine state to choose moves; it never writes state.

## Combat (Relay)

| System | Implemented in | Status | Evidence |
|---|---|---|---|
| Six-card shared hand, three heroes, one deck | `engine/combat.js` | Working | U (combat), P, V |
| Role-phased hand (Openers before a combo, Converters/Closers during), off-role cards tucked | `combat.js` `transitionHand` | Working | U (combat: opening hand, flow tests) |
| Card instance integrity across draw/hand/Reserve/discard/exhaust | `combat.js` `verifyZones` | Working | U (40-seed × 1500-action soak), S (checked every action) |
| Opener → Converter → Closer; ranks 1–9; A/B/EX; Step/Climb/Cross rule | `combat.js` `seqCheck`, `check` | Working | U (combat, archetypes) |
| Flow: 3.0 s start, +0.18 s refunds capped at 1.2 s, 6.2 s absolute cap | `combat.js` `RULES` | Working | U (combat) |
| Momentum: 3 → +0.6 s Flow, 3 → +8 Guard | `combat.js` | Working | U (systems) |
| Relay (hero switch, +1 Momentum) | `combat.js` `resolveCard` | Working | U (systems, archetypes) |
| Echo (repeat at reduced power; restriction list) and Dead Drop stored echo | `combat.js` `echo`, `makeApi` | Working | U (combat, archetypes) |
| Churn (charges, regen, Flow/ATB cost, swipe-down gesture) | `combat.js` `churnCard`, `ui/battleScreen.js` | Working | U (combat), P (swipe churns exactly once), touch emulation |
| Reserve (2 slots, survives phase swaps, swipe-up gesture) | `combat.js` `stash` | Working | U (combat), touch emulation |
| Manual Cash Out (2+ cards, Quick Cash bonus, distinct from Perfect/forced) | `combat.js` `cashOut`, `payout` | Working | U (combat, archetypes), P |
| Stumbles (−0.4 s, −1 Momentum, 3rd drops the combo) and forced resolution | `combat.js` `stumble`, `finishCombo` | Working | U (combat) |
| Real-time enemy ATB, continues before a combo, frozen by pause | `combat.js` `step`; pause = no `update()` | Working | U (combat) |
| Timed Locks (3 s, source and countdown, expire in PRE, frozen by pause) | `combat.js` `lockCards` | Working | U (combat), V |
| Scramble, jammed slots, Churn snare, Reserve latch, Flow drain, Glitch cards, Citations | `combat.js` enemy API | Working | U (combat, systems), V |
| Shared party HP pool, per-hero Defense, Cover, defeat at 0 (replaced per-hero HP, knockouts and the stand-in rule in 0.2.3) | `combat.js` `hitParty`, `hitAll`, `mitigate`; `run.js` | Working | U (combat, run), S, P (Phase 3 section) |
| Guard (shared, decays, capped at 80; enemy Guard capped) | `combat.js` | Working | U (systems) |
| Ten build archetypes | `data/cards.js`, relics, mutations | Working | U (archetypes: one signature test each) |

## Run structure

| System | Implemented in | Status | Evidence |
|---|---|---|---|
| Three acts, branching 8-depth maps, guaranteed route to boss | `engine/run.js` `generateMap` | Working | U (200 seeds × 3 acts), S, P |
| Route traits (HOTWIRE, STATIC, QUIET_CHANNEL, SCRAP_CACHE, BLACKOUT, WILD_SIGNAL) | `run.js`, `combat.js` | Working | S; effects per trait — (no per-trait test) |
| Card rewards (skip allowed), Scrap, relics | `run.js` `makeReward` | Working | U (run), S, P |
| Shops (cards, relics, removal, upgrade, surgery, heal) | `run.js` `makeShop`, `shopBuy` | Working | U (run), P (card purchase applied, 4 runs); services U only |
| Events (21; every choice) | `data/events.js` | Working | U (run: all choices), P |
| Rest (recover, tune-up, fortify, overdrive), surgery, caches | `run.js` | Working | U (systems), P |
| Elites | `data/enemies.js` | Working | S, P (Foundry Warden, Hound Mother, Archive Censor, Choir Engine beaten through the UI; Rank Eater and Null Knight in the Russian run at 1194×834) |
| Boss preparation (Prepared ×3 / Volatile) | `run.js` `chooseBossPrep` | Working | U (run, systems), P (Prepared: every run; Volatile: milestone runs 6–7) |
| Build-responsive boss adaptations from current-run evidence | `run.js` `analyzeProfile`, `data/adaptations.js` | Working | U (run: needs real evidence), P (results log shows adaptations) |
| Boss trophy relics, mutation choice, act transition | `run.js` | Working | U (run), **P (natural Act I → II → III, 5+ runs)** |
| Defeat → results → Museum → new run | `main.js` `endRun` | Working | P (milestone run 2: final-boss defeat → results → next run) |
| Final victory → ending scene → credits → victory results | `run.js`, `main.js`, `screens.js` `creditsScreen` | Working | S, **P (natural UI victories against both Act III bosses; credits reached and continued to results, English and Russian)** |
| Credits: cast, fonts and their licenses, version; rolls after the ending and opens from the title screen; no personal credits yet (deferred to Phase 9) | `screens.js` `creditsScreen` | Working | P, layout check (both languages, all viewports) |

## Persistence and meta

| System | Status | Evidence |
|---|---|---|
| Save after every run-state change; Continue from title | Working | U, **P (reload + Continue at Act I mid-battle, Act I boss fight, boss reward, mutation, boss aftermath, Act II entry, Act II mid-battle, Act III entry, final boss fight, ending scene: state identical every time)** |
| Mid-battle Continue restarts the same encounter (bosses keep their preparation and adaptation) | Working (by design: fights restart from their beginning) | U, P |
| Run cleared after it ends: no Continue, recorded in the Museum exactly once | Working | P |
| Museum records, bestiary, relic/card catalogues | Working | U (systems), P |
| Starter relic selection (4 options) and unlocks | Working | U (systems), P (Stopwatch Gear unlocked by the Act I boss, then selected and applied in the next run, every milestone run) |
| Offline: single-file build, file:// play, PWA service worker, embedded fonts | Working | Offline Playwright checks; `tools/pwa.mjs` (see "Web app on iPhone and iPad") |

## Presentation

| System | Status | Evidence |
|---|---|---|
| Articulated hero rigs with all required animation states | Working | V |
| Enemy art and animation (idle, telegraph, attack, hurt, death) for 25 designs | Working | V |
| Three act environments | Working | V |
| Combat feedback: numbers, relay trails, echoes, cut-ins, banners, camera | Working | V |
| Audio: synthesized SFX, music, ambience, volume/mute | Implemented, not listened to | — (runs without errors) |
| Accessibility: reduced motion, shake, hints, relaxed enemy speed, keyboard | Implemented | — (no behavioral test) |
| Layout at 844×390, 1024×768, 1194×834, 1920×1080 | Working | V, P (full runs at 1024×768, 1194×834, 1920×1080, 844×390) |

## Milestone: Act I → Act II proof, extended to the full run (2026-10-27)

Tool: `node tools/milestone.mjs <outDir> [minutes] [stopAtAct] [w] [h]` against the dev server. Every run uses a fresh browser profile, starts from the title screen, and plays only through taps, swipes and clicks. The bot reads engine state to choose moves and to assert; it never writes state. At each checkpoint it reloads the page, presses Continue, and compares act, floor, Scrap, deck (card instances, upgrades, grafts), relics, mutations, party HP, path, map, pending node and boss decisions before and after.

### Runs

| # | Viewport | Result | Checks | Bosses (adaptation) | Elites | Shop buy |
|---|---|---|---|---|---|---|
| 1 | 1194×834 | Victory | 23/23 | Clockwork Regent → Mirror Array → The Corruptor (all Relay Jammer) | 0 | — |
| 2 | 1194×834 | Defeat at final boss | 35/35 | Clockwork Regent → Mirror Array → The Corruptor (Momentum Siphon) | 3 | yes |
| 3 | 1024×768 | Victory | 36/36 | Scrap Tyrant → Protocol Auditor → The Corruptor | 1 | yes |
| 4 | 1194×834 | Victory | 35/35 | Clockwork Regent → Protocol Auditor → Signalbreak Core | 0 | yes |
| 5 | 1920×1080 | Victory | 36/36 | Scrap Tyrant → Protocol Auditor → The Corruptor | 1 | yes |
| 6 | 1194×834 | Victory | 40/40 | Scrap Tyrant → Protocol Auditor (**Volatile**: Wildcard) → The Corruptor | 1 | yes |
| 7 | 844×390 | Defeat at final boss (77 HP left) | 37/37 | Scrap Tyrant → Mirror Array (**Volatile**: Overcharged) → Signalbreak Core | 1 | yes |

Totals: 7 runs, 5 natural victories, 2 final-boss defeats, 242 of 242 checks passed, zero page errors. Run 1 predates the elite, shop, boss-fight, ending and post-run checks. Runs 6–7 add the Volatile path (rolled, shown, survives reload). All six bosses have been beaten through the UI.

### Transitions demonstrated through the UI (reload + Continue, state identical)

1. Act I mid-battle → same encounter restarts.
2. Act I boss fight (after the intro and preparation) → straight back into the same boss with the same preparation and adaptation.
3. Act I boss defeated → boss reward (trophy relic) restored.
4. Mutation choice screen restored; chosen mutation recorded and survives a reload.
5. Boss aftermath story restored.
6. Act II entry: new act, new map, same deck/relics/mutations.
7. Act II mid-battle → same encounter.
8. Act II boss with Volatile preparation → outcome rolled, shown, and kept after reload (runs 6–7).
9. Act III entry.
10. Final boss fight → same boss.
11. Ending scene → replays after Continue, then credits (added 2026-11-11), then victory results.
12. After the results screen: no Continue offered, run recorded in the Museum exactly once.
13. Next run: Stopwatch Gear (unlocked by the Act I boss kill) is selectable and present in the new run's relics.

### What had to change

- **Game code:** one fix. The dialogue Skip button sat on top of the map header's menu button (seen in run 1's next-run screenshot); it now sits above the dialogue box (`src/ui/screens.js`, `src/styles.css`). Checked at 844×390, 1194×834 and 1920×1080. No engine or run-layer changes were needed for the Act I → Act II sequence or the full run.
- **Docs:** README relic count corrected (34 → 39).
- **Verification added:** `tests/systems.test.mjs` (8 tests: Momentum spends, Relay, snare/latch/drain, Glitch, Guard caps, Volatile prep, rest/surgery/cache, Museum unlock), `tools/milestone.mjs`, this audit.
- **Bot defect found and fixed (tool only):** run 2's bot never swiped away Glitch cards before a combo, and The Corruptor floods the deck with them. Engine simulation, 40 runs each: against The Corruptor, a bot that clears Glitches won 14 of 18 fights; one that doesn't won 4 of 18. The game was not stuck. The fight was lost because of a play mistake that a player is told how to avoid ("Glitch: swipe down"; the boss intent says Churning them is free). The milestone bot now clears them.

### Tests

- `npm test`: 49/49 pass (combat 17, run 10, systems 8, archetypes 12, App Store upload client 2).
- `tools/offline.mjs` on the built `dist/` (since replaced by `tools/pwa.mjs`): service worker controls the page, title renders offline, Continue restores the run.
- Milestone runs: 242/242 checks passed across 7 runs (table above).

### Still not demonstrated

- Build variety in natural play: every bot run ended as Momentum Burst. The other nine archetypes are proven only by unit tests (one signature test each). The roadmap's "four builds shown" item is open.
- Shop services (remove/upgrade/surgery/heal) through the UI.
- Human testers, a physical iPad or iPhone, Safari/WebKit, and audio by ear.

## Localization (English / Russian)

| Area | Status | Evidence |
|---|---|---|
| Language system: `src/i18n/index.js`, one translation file per language (`src/i18n/ru.js`), switch on the title screen and in Settings, choice saved, first launch follows the browser | Working | U (i18n), P (switched from the title screen, kept after reload) |
| Coverage: 352 interface keys and all content: 79 cards, 10 grafts, 39 relics, 12 mutations, 11 adaptations, 6 traits, 25 enemies (names, lore, 80 intent names, 7 boss phases), 21 events (53 choices, 56 outcomes), story (13 scenes / 49 lines, 4 defeat dialogues, 15 developer remarks, 18 in-code lines), 9 tutorial cards, 9 How to Play sections, boss plans, results, Museum | 100% of displayable text | U (i18n: every key and content entry, placeholders identical) |
| Not translated on purpose | Enemy intent descriptions exist in the data but are never shown in the game; the PWA manifest description (install prompt, not in-game) | — |
| Logic, balance and saves independent of language | Working: engine, run layer and save code do not import `src/i18n`; saved runs hold ids and message keys; older English-text saves still display | U (i18n: no imports; event outcomes saved as keys and rendered in both languages) |
| Terminology | One Russian term per mechanic | `docs/GLOSSARY_RU.md` |
| Cyrillic fonts, offline | Working: Cyrillic faces join the existing families (Fira Sans Extra Condensed, Oswald, Spectral Cyrillic), embedded in the build | Offline `file://` check: every face renders Cyrillic, no network requests |
| Layout | Working | `tools/i18n-layout.mjs`: every screen, modal, event outcome, boss preparation, banner, tutorial card, all 79 cards (plain and upgraded) and every card name in a 4-slot Reserve, at 667×375, 844×390, 900×500, 1024×768, 1194×834, 1920×1080: 0 issues in Russian and 0 in English (1356 screens each); iPad portrait 834×1194: 0 and 0 |
| Russian playthrough | Working | P: `SB_LANG=ru SB_FLOW=defeat`, 844×390: three acts to victory with save/reload at every checkpoint, Museum unlock, restart encounter from the pause menu, defeat (results screen and defeat dialogue), new run to its first victory: 47/47, 0 page errors, 0 on-screen texts with untranslated words, 0 layout issues. `SB_LANG=ru`, 1194×834: Act III elites Rank Eater and Null Knight beaten, lost to the final boss (Signalbreak Core) in natural play, run recorded in the Museum: 41/41, 0 page errors, 0 layout issues; the only Latin text on screen was the brand in the boss name «Ядро Signalbreak» |

## Web app on iPhone and iPad (PWA)

| Area | Status | Evidence |
|---|---|---|
| Install from Safari: home-screen icon (180 px PNG), name "SignalBreak", opens full screen without browser bars | Implemented | Head and manifest checked by `tools/pwa.mjs`; not yet tried on a device |
| First online launch caches the game; the title screen says when it is available offline | Working | P (`tools/pwa.mjs`, Chromium) |
| Launch with no connection (start URL, folder URL, URL with a query), saved run continues, battle plays, no network requests | Working | P (`tools/pwa.mjs`, Chromium) |
| New build: checked on each launch and on return to the app, installed in the background, used from the next launch, old cache removed | Working | P (`tools/pwa.mjs`, Chromium) |
| Phones in portrait: the game asks to turn the device and pauses a fight (an installed web app cannot lock orientation); iPad portrait plays normally | Working | P (844×390 → 390×844 → back: combat time frozen, pause menu on return; 834×1194 battle laid out) |
| Smallest iPhones in landscape (667×375, iPhone SE size): hand cards show the role as its symbol only and their text may shrink a little more | Working | `tools/i18n-layout.mjs` at 667×375: 0 issues in both languages (English cards were also clipped there before) |
| Audio after the app was in the background or a call | Implemented (resumes on the next touch) | Not tested on a device |
| Hosting | GitHub Pages from this branch's root (the root page redirects to `dist/` on github.io; `.nojekyll` serves files as they are), plus an optional mirror in an S3-compatible bucket uploaded by `.github/workflows/mirror.yml` | `tools/pwa.mjs` passes for both layouts (16/16 Pages, 15/15 bucket path); Pages needs switching on in the repository settings; the mirror needs a bucket and keys; neither is live yet |

Reachability: no single host is open on every network. GitHub has been degraded in Russia since May 2026 (OONI: 10–16% failed connections in early May; wider outages in July) and is intermittent in mainland China; Russian networks also throttle Cloudflare, Hetzner and DigitalOcean, while Russian-hosted services are reliable there (and Yandex is blocked in Ukraine). Hence two addresses. Once installed, the game runs offline wherever it is, so a block affects only installing and updates.

Limits on iOS: the home-screen app keeps its own storage, separate from Safari, so a run started in Safari does not carry over; installed web apps are exempt from Safari's 7-day storage limit. Chromium stands in for Safari in `tools/pwa.mjs`; Safari itself has not been run.

## Revised roadmap, Phase 1: beta-feedback patch (2026-11-13)

The revised roadmap (2026-11-13) replaces the earlier one; its phase numbers are new, so the earlier "Phase 1" and "Phase 2" above are campaign-progression milestones, not evidence for this patch. Status words here: **implemented** (code merged), **tested** (automated checks below), **accepted** (human playtesting supports it). Nothing in this section is accepted yet.

Every changed value is a prototype in `RULES` (`src/engine/combat.js`), not settled balance.

| Requirement | What changed | Automated evidence | Human status |
|---|---|---|---|
| 1.1 Enemy ATB pressure | Enemy ATB speed ×0.70 in Act I, ×0.82 Act II, ×0.90 Act III (fast/normal/slow enemies keep their ratios). Two enemy actions are at least 1.2s apart (a full bar waits, longest-waiting first). Churning outside a combo still pushes enemy ATB 5%, now shown by a flash on every bar | U (spacing, pace per act, ATB push event); pacing tool, opening fights: 8–30 → 5–18 enemy actions/min; enemy actions less than 1s after the previous one: up to 45% (learner) and 63% (regular) → 0% | Pending |
| 1.2 Time to build combos | Flow 3s → 5s; it holds 1.2s after the Opener while the swapped hand is read (the hold does not shorten the combo). Refund per card 0.18s → 0.8s, up to 5s per combo (was 1.2s); combo cap 6.2s → 14s. Momentum buys 1.5s (was 0.6s). Quick Cash Out needs 2.5s left (was 1.5s). Stumble penalty unchanged | U (hold, cap moves with the hold, six-card combo at 1.3s per card); pacing tool, learner: combos timing out 95–99% → 2–5%; average longest combo 3.0 → 4.9 cards | Pending |
| 1.3 Downtime | After every combo a breather (0.8–1.2s, was 0.3–0.9s) in which enemies wait while the hand refills; the Flow strip reads "BREATHER · ENEMIES WAIT" and enemy bars dim. Enemy spacing gives relief between hits. Deciding (opener, no timer), holding (reading the new hand), acting (Flow) and the breather are separate, visible states | U (enemies wait during the breather) | Pending |
| 1.4 Targeting | Gold brackets, a ring at the feet and a TARGET label on the selected enemy; a ⌖ chip above the hand names it and switches target on tap; a change snaps the brackets in. When the target dies the next enemy is picked and labeled NEW TARGET (`retarget` event). The hero an enemy is about to hit gets a red ring and "▼ damage" by their name, distinct from the player's gold target | `tools/targeting.mjs` through touch taps, English and Russian at 844×390, 1194×834, 667×375: 21/21 (tap to target, chip names it, chip cycles, retarget on death with label, incoming marker); V | Pending |
| 1.5 Early encounters | Act I depth 0: two hounds, or a hound and one mite (one interference type). Two-mite, jammer and Iron Maw formations from depth 1; two interference types together from depth 2 | pacing tool, learner, opening fights: HP lost 24–87% → 4–19%; a hero knocked out in 80–93% of the four worst fights → 0%; fight length 48–108s → 19–32s. Act I later fights: mixed depth-4 fight won 0% → 100%, elites 0–18% → 93–100%, bosses 0–23% → 57–88% | Pending |
| 1.6 Preservation | No shared HP, basic attacks, role, scheduling, Relay or card-catalogue changes. Text updated in both languages: first-battle tutorial, How to Play (new Targets section; Flow, Momentum and Churn sections), Stopwatch Gear, Flow Clamp's break condition (Perfect under 6s, was 3.5s) | U 63/63 (i18n keys complete); playthroughs with save/reload at every checkpoint: English 1024×768 45/45 (three-act victory, credits), Russian 844×390 50/50 on the final code (victory, restart encounter, defeat, new run; 0 untranslated texts, 0 layout issues); layout check at six viewports, every card in the hand included: 0 issues in Russian (1538 screens) and English (1540); PWA offline check 16/16 | — |

Found while checking, and fixed: in natural play a hero initial on a card whose long text squeezed the art band was cut off (the initial's box is now as tall as the letter, and if the band is still too small the initial moves in front of the card name); the green "+" of an upgraded card made a two-line name taller than its box. The layout check now puts every card, plain and upgraded, into the battle hand at every viewport.

Pacing tool (`node tools/pacing.mjs 40 --act1`): the "learner" reads a new hand for about 2s, plays a card about every 1.3s, taps a wrong card 8% of the time and uses no Momentum, Guard or Churn; the "regular" bot plays every ~0.55s and uses them. Neither stands in for a person.

Full-run simulation (`tools/simulate.mjs`, 30 runs each): bot reacting every 0.55s won 19 → 29 runs; bot reacting every 1.0s won 0 → 4 and reached Act III in 0 → 23 runs (it used to die in Act I in 16 runs). The game is much easier for fast players; later acts still decide most slower runs. Re-tune after human feedback.

Ready for a human playtest. Things to watch: whether the pace now feels too slow for players who already know the game; whether the Flow hold and breather are noticed; whether the red incoming ring is read as "an enemy will hit this hero"; whether the first two or three fights teach without being trivial.

### Follow-up (0.2.2, 2026-11-14): ordinary encounters, decision time, readability

Known-good baseline before this follow-up: commit `fba3e85` (0.2.1); `git checkout fba3e85` restores it.

**Measured in ordinary post-tutorial fights** (`tools/encounter.mjs`: real game, touch input, no tutorial pop-ups; the first fight entered from the map, four more with a set Act I formation):
- First enemy action: 3.2–4.6s after the fight starts in two-enemy fights, 8.8–10.6s against Iron Maw. Gaps between enemy actions: median 2.5–4.9s (11.3s for Iron Maw), never under 1.2s.
- Enemy ATB, per enemy per second: 0.21 for Rush Hound (0.7 ÷ 3.4s; 0.29 during its Frenzy), 0.13 for Wire Jammer, 0.17 for Interference Mite, 0.097 for Iron Maw (measured: 0.097); the same while deciding, while Flow holds and during a combo; zero during the breather after a combo and during a finisher (combat time stops); none during tutorial or menu pauses.
- Enemies never acted during the breather or a finisher, or while the player had no playable card. They do act while Flow holds (about once per fight): the hold pauses Flow, not the fight, and the player can act.
- The UI never blocks input during animations; the only lock-out is the breather, when enemies wait too.

**Reproduced and corrected**
- *Decision time spent watching.* Each card's attack plays for 0.5–0.7s (melee 0.66, cast 0.62, shoot 0.48, guard 0.72) and the replacement card slides in over 0.36s, all while Flow drained. A player reading 2–3s per card dropped most combos (pacing tool: 34–42% at 2.0s, 71–76% at 2.5s, 92–95% at 3.0s), and the long fights that followed drained HP (knock-outs in up to 37% of fights at 2.5s). Now Flow also holds 0.7s after each valid card (`FLOW_CARD_HOLD`) and each valid card refunds 1.0s (was 0.8s). Result: 6–7% at 2.0s, 14–22% at 2.5s, 58–63% at 3.0s; HP lost at 2.5s 26–62% → 17–40%; knock-outs at 2.5s up to 37% → up to 10%. Real UI, slow player in Russian at 732×510 (3s to read a new hand, 2.5s per card): dropped combos 15/24 → 4/17, total fight time 358s → 257s, heroes knocked out 2 → 1.
- *Card text at 732×510* (the recording's size). The phone layout was chosen by screen height alone (under 500px), so a 510px-high screen got the larger layout, whose type scales with card width: 63px cards, effect text 6.1–6.5px, role label 5.5px, suit 8.3px. The compact layout now also applies when cards would be narrower than 80px: effect text 7.6/10px (smallest/median), role 8px, suit 11px, name 9.8/12px, rank 20px (`tools/readability.mjs`). Holding a card, which pauses the battle, is now taught in the in-battle tutorial and How to Play for the longest texts (6.4–7.6px at phone sizes).
- *Stale numbers in text:* the in-battle tutorial and the Quick Exit mutation still said Quick Cash Out needs 1.5s of Flow (it needs 2.5s); Long Breath still said +0.8s instead of +0.6s (now +2.0s instead of +1.5s). Fixed in both languages.

**Checked, not reproduced:** excessive enemy action frequency in ordinary early fights (above); targeting (`tools/targeting.mjs`, touch taps, English and Russian at 844×390, 1194×834, 667×375 and 732×510: tap to target, the ⌖ chip names it and cycles, the attack hits the tapped enemy and no other, retarget with NEW TARGET when it dies, red marker on the hero an enemy will hit: 32/32).

**Verification:** unit tests 64/64 (new: Flow holds while each card resolves, not after a wrong card); layout check at seven viewports including 732×510, every card in the hand included: Russian 0 issues (1794 screens); English 1 issue ("CONVERTER" did not fit the 67px cards at 732×510), fixed by showing the role symbol only on cards under 78px and re-checked at 732×510 and 844×390 in English and 732×510 in Russian: 0 issues; full-run simulation, 30 runs each: bot reacting every 0.55s won 26 (0.2.1: 29), every 1.0s won 5 (0.2.1: 4); playthroughs with save/reload and Continue at every checkpoint: English 1024×768 43/43 (shop, elites, three-act victory, credits, Museum record), Russian 732×510 49/49 (victory, restart encounter, defeat with results and defeat dialogue, new run; 0 untranslated texts, 0 layout issues); the ordinary fights above went on to the reward screen; offline web app check 16/16.

**Still for human judgment:** whether the pace now feels right (or too slow for experienced players); whether players notice and use the holds, the breather and hold-to-read; whether 8px role labels and 7–10px effect text are readable on real phones; the two-hound opening fight for very slow players (one knock-out at 2.5s per card, from attack frequency over a long fight, not per-hit damage or interference).

## Revised roadmap, Phase 3: shared party HP and individual Defense (0.2.3, 2026-11-15)

Specification: `docs/COMBAT_SPEC.md` §4 (party and shared resources), §15 (damage), §18.6 (conversion of run effects), §19 (saves). Reference build for regressions: 0.2.2 (`46d01a5`). Status words as in the Phase 1 section; nothing here is accepted by human play yet (the roadmap places the next human checkpoint at Phase 5).

**Implemented**
- *One HP pool.* The heroes' three pools became one (`combat.hp`/`maxHp`, run `d.hp`/`d.maxHp`). Heroes are never knocked out: the KO state, the "DOWN" card overlay, the tucking of a fallen hero's cards and the stand-in rule are gone. The battle is lost when the pool reaches 0 (all three heroes collapse, DEFEAT); a won battle leaves at least 1 HP.
- *Defense.* Hessa 30%, Pin 15%, Corvin 0% (`RULES.DEFENSE`), applied to each enemy hit aimed at that hero before Guard, minimum 1 damage. Pierce skips Guard, not Defense; reflected damage and self-inflicted costs skip both. Enemies that used to pick the most hurt hero (`targetMode: 'lowest'`: Predator Needle, Null Knight) now pick the lowest Defense (Corvin).
- *Area attacks.* Each hero's share is reduced by that hero's Defense; shared Guard absorbs the total once; on-hit effects (Counter, Heat Shield, Bastion Protocol) fire once per attack, not once per hero.
- *Cover.* When Hessa resolves one of her Guard cards she covers the party for 4s: single-target hits aimed at Corvin or Pin land on her and use her Defense; area attacks are not redirected. These nine cards end their text with "Cover." (a keyword added to the card face), and holding one explains it.
- *Healing and HP effects* now act on the pool, converted per spec §18.6 ("every ally" amounts ×3): Mend Circuit, Tuning Fork (Perfect: heal the party 3), Patch Kit (12 after each battle), rests (30%/45%), act transitions (75% of missing HP), events (e.g. Pay in Blood −15, Drink the Current +30, Harmonize +45), Glass Cannon and Core Dump (−15%/−10% max HP), Overdrive (−15% of current), Redline (−10% of max). Dead Man's Switch now fires once per battle, the first time party HP falls below 25%. Overture gives 1 Momentum per hero in the party.
- *Pool size.* 130 at the start of a run: the old 46 + 34 + 38 = 118 plus 12 (`PARTY_HP_BONUS`, prototype). The bonus replaces what the old rules forgave without saying so: damage past a falling hero's last HP was lost, area attacks skipped fallen heroes, and a fallen hero came back at 10% after the battle. Measured below.
- *Saves.* Version 4. A version-3 save converts once when loaded: HP and max HP become the sums (a knocked-out hero counts 0) plus the same 12, and the party keeps only the hero ids.
- *Interface.* One party HP bar at the top left of the battlefield (one line in the phone layout), with Guard after the HP and the damage the enemies are winding up (after Defense, minus Guard) pulsing at its end; hero plates with name and Defense %; a COVER badge with countdown over Hessa and a COVER float when a hit is redirected; the red incoming ring and its "▼ n" number now show damage after Defense and move to Hessa under Cover; heals show on the bar. The map/shop/rest header shows the same single bar. How to Play has a new "Party HP, Defense, Cover" section. All new text in English and Russian.
- *Fixed on the way:* the How to Play and in-battle tutorial still said a valid card refunds 0.8s of Flow (it is 1.0s since 0.2.1); Brass Metronome's text still described the old 0.24s/1.2s refunds. Both languages corrected.

**Tested**
- Unit tests 75/75 (new: one pool and no knockout API; Defense per hero and minimum 1; Guard after Defense; area attack with Defense per hero and Guard once; Cover started by a resolved Hessa Guard card, redirecting single-target hits but not area attacks, and expiring; pierce versus reflect; lowest-Defense targeting; pool healing; Dead Man's Switch once below 25%; defeat at 0 with the pool in the outcome; v3→v4 conversion, applied once; battles read and write the pool; Patch Kit; events take and give pool HP; every event choice leaves a whole-number HP within 1..max). The last check caught a missed conversion (the vending machine's "Kick it" still passed a hero id, which made party HP NaN); fixed.
- Battle screen through touch input, English 844×390 and Russian 667×375 (`tools/party.mjs`, 8/8 each): the tapped Salvage says "Cover." and starts Cover; the red ring moves to Hessa; the hit aimed at Corvin costs 7 of 10; healing fills the bar; with the pool at 3 a real enemy attack loses the battle, the heroes collapse and the run-over screen follows; no page errors.
- Targeting (`tools/targeting.mjs`, 4 sizes, both languages): 32/32.
- Layout (`tools/i18n-layout.mjs`, 7 viewports, every card in hand and Reserve): Russian 1800 screens, English 1797 screens, 0 issues.
- Card readability (`tools/readability.mjs`): identical to 0.2.2 at 667×375, 732×510 (both languages) and 844×390 — smallest effect text 6.4px, median 9.4–10px.
- Ordinary play through the UI only, with reload and Continue at every checkpoint: English 1024×768 43/43 (three acts won, a shop, two elites, Volatile Redline at the Act II boss, credits, Museum unlock); Russian 732×510 49/49 (three acts won, credits, restart encounter, a run lost at the Act I boss as the pool ran out — 52 → 13 → 0 — with the results screen and defeat dialogue, then a new run to its first victory; 0 untranslated texts, 0 layout issues).
- Balance, same seeds against 0.2.2 (`tools/pacing.mjs 30 --act1`, slow "learner" bot: 2s to read a hand, 1.3s per card, occasional wrong taps, no Momentum or Churn): ordinary Act I fights cost about a fifth less HP (e.g. two hounds 19% → 13% of the pool, snare + hound + jammer 32% → 23%); elites 40% → 29% (Foundry Warden) and 82% → 60% (Hound Mother, now 100% won); bosses won 83% → 77% (Scrap Tyrant) and 57% → 90% (Clockwork Regent). Without the 12-HP bonus the bosses fell to 57%/57%; with 142 HP they would be 90%/97%. The faster "regular" bot is unaffected (100% everywhere). Full runs (`tools/simulate.mjs 30`, bot reacting every 0.55s): 28/30 won (0.2.2: 26/30), HP lost per battle 5.0 (6.8), no errors, every run reached Act III.

**Still for human judgment:** whether one shared bar reads better than three; whether players notice Defense and Cover and change how they play (the bots do not use Cover deliberately); whether the game is now too forgiving for experienced players (the full-run bot wins more often; Act I retuning belongs to Phase 6); whether "Cover." on nine cards is understood without opening the card.

## Revised roadmap, Phase 4: basic attacks, artes, support and a persistent hand (0.2.4, 2026-11-18)

Specification: `docs/COMBAT_SPEC.md` §5 (card categories), §6 (hand and draw), §8.2 (hero selection), §10 (support), §11 (sequence rule), §12 (endings), §18 (content conversion), §19 (saves); what was built and which Phase 5 bridges it uses: §25. Reference build for regressions: 0.2.3 (`fd8f3e4`, playable with `git checkout fd8f3e4`). Status words as in the Phase 1 section; nothing here is accepted by human play yet (the next human checkpoint is Phase 5).

**Implemented**
- *Three playable categories and junk.* Basic attacks are neutral: Weak (rank 1), Medium (2) and Strong (3), cost 0, +1/+1/+2 Momentum when they resolve; the selected hero performs them. Artes belong to one hero: rank 4/5/6, cost 2/3/4 Momentum; they need a basic attack earlier in the same combo, a strictly higher rank and enough unreserved Momentum, and only their owner can perform them. Support (heal, Guard and Cover, Braced, utility, hand management) is played on its own, before, during or outside a combo, and never starts, extends or ends one. Glitch is unchanged.
- *Sequence rule.* Ranks strictly ascend and may skip (1 → 3 → 5 is legal); suits never forbid a card. A Step (exactly +1 rank) and a Cross (a different suit) are bonuses and can both apply. One authority (`combat.check()`) decides legality and gives the reason a card is refused (rank, owner, basic attack first, Momentum); the card face, the hero buttons, the bots and the tests all ask it.
- *Momentum.* Committing a card reserves its cost; executing spends it; gains arrive on resolution (basic gain, +1 per Cross); cancelling releases the reservation and gains nothing. Drains take only unreserved Momentum. The cap and Overflow Valve work as before. Flywheel, Long Breath, Pressure Gauge and the Momentum relics still change costs and caps.
- *Hero selection.* Three buttons above the hand (★ shows how many of that hero's artes are in hand), a tap on the hero, or keys Q/W/E. A combo keeps its hero; switching mid-combo is refused and is never a Relay. Nothing triggers a Relay automatically.
- *Persistent mixed hand.* Six slots holding any mix of categories. Playing a card refills only its slot, from the top of the draw pile. The hand is never replaced by phase. NEXT CARD shows the actual top card, or nothing when the draw pile is empty; showing it never draws or reshuffles. Churn replaces one card; Reserve keeps its rules; cards in Reserve obey the same legality and costs.
- *Endings.* After an arte the combo ends as a Perfect by itself when the hero has no higher playable card. Otherwise the end button reads FINISH ★ (a Perfect). CASH OUT is offered only when 2+ cards were played and the last is a basic attack. A timeout or a third stumble after an arte counts as a Perfect. Citations now track the first basic attack's strength and the finishing arte.
- *Content.* 82 card definitions: 71 converted (68 earlier cards plus Piston Strike, the Strong starter; Hold the Line, Braced; Spare Parts, Churn), 4 compatible but not offered (the Rewind cards Rethread, Prism Cut, Downshift, Cache Hook), 6 withheld until Relays exist (Mirror Wire, Hand Off, Relay Baton, Chorus Break, Grand Relay, Pressure Valve). Playable: 24 basic attacks, 38 artes, 13 support; rewards, shops and events draw from 64. Starter deck (13): Scrapline ×3 (Weak), Rivet Jab ×2 and Hotwire (Medium), Piston Strike ×2 (Strong), one rank-4 arte each (Scrapfall, Thermal Lance, Bolt Volley), Mend Circuit (Corvin's heal) and Salvage (Hessa's Guard and Cover); suits mixed. The relics Echo Splice and Relay Harness, the mutation Relay Resonance and the graft Echoing stay defined but are not offered; the Echo Splice unlock now gives Spare Pockets. Iron Filings, Kettle Drum, Wild Hinge and the Quick graft were reworded or converted (§25). Run operations respect categories: suits and rank changes only on attacks, transforms keep the category, removal keeps at least 4 basic attacks.
- *Saves.* Version 5. A version-3 save goes through v4 to v5, a version-4 save to v5, and a version-5 save loads unchanged. Withheld ids map to a converted card of the same hero and rarity, unknown ids become a Medium basic attack, and uid, upgrade, graft, rank modifier and suit are kept. The deck keeps its card count. Cards offered by a pending reward, shop or event migrate too.
- *Interface.* Card faces show the category (◆ basic, ★ arte, ✚ support, ✕ junk) with the strength name on basic attacks, rank, Momentum cost or gain, owner (N for neutral), suit, upgrade and graft, and the reason a card cannot be played now. Support cards have a green face. The strip shows the hero buttons, combo chips with Step ↑, Cross ✕ and ★, and a hint for the next legal card. NEXT CARD sits in the Reserve column and becomes a one-line rank/suit preview when the Reserve has 3–4 slots. FINISH ★ and CASH OUT share one button; the battlefield shows the performer and Braced. How to Play, the tutorial, story lines and every changed text are rewritten in English and Russian, with no Opener/Converter/Closer teaching left.
- *Two rules against stranded hands (R5, prototype, §25).* Before a combo, when no card in the hand or Reserve can be played, Churn is free. When fewer than 40% of the deck are basic attacks, a reward's first card is a basic attack.
- *Bots.* One shared player policy (`tools/lib/bot.mjs`) understands neutral basic attacks, hero selection, owned artes and their prerequisites, Momentum, support, the mixed hand, rank legality, FINISH and CASH OUT, Churn and Reserve, with quick, regular and learner profiles. `tools/lib/uibot.mjs` performs its decisions through taps and swipes only. Simulation, pacing, milestone, encounter, boss and UI tools all use it. `tools/accept4.mjs` is the 17-step acceptance scenario.

**Tested**
- Unit tests 103/103: category legality, Steps and Crosses, Momentum reservation and no double spend, cancel gains nothing, caps and Overflow Valve, drains, the persistent hand and preview, Churn, Reserve, modifiers through every zone, mid-combo hero switching, endings, support independence, Braced, a randomized soak of thousands of commit/cancel/execute/Churn/Reserve actions keeping zones and Momentum consistent, save fixtures generated by the real 0.2.2 (version 3, Act I) and 0.2.3 (version 4, Act II) engines, idempotent loading, unknown ids and pending offers.
- Acceptance scenario (`tools/accept4.mjs`, through touch input on the real interface): English 844×390 23/23 and Russian 667×375 23/23 — mixed hand; Hessa selected; Weak then a higher basic; Momentum 3 − 2 + 2 + 1 = 4 checked against the engine; Hessa's arte; Perfect pays +2 Momentum and a Churn charge; the breather holds the enemies; support with no combo; Churn replaces one card; Reserve stash and later play; the preview equals the drawn card; Pin or Corvin starts the next combo and plays their arte; the battle is won; a compatible reward is taken; reload and Continue restore the exact version-5 state.
- Full runs through the UI only, with reload and Continue at every checkpoint: English 1024×768 43/43 (three acts won against Scrap Tyrant, Mirror Array and The Corruptor; elites in Acts II and III; a shop; Volatile preparation at the Act II boss; ending, credits, results; the run recorded once; the Museum unlock Stopwatch Gear applied to the next run). Russian 732×510 49/49 (language switched on the title screen and kept after reload; three acts won against Scrap Tyrant, Mirror Array and Signalbreak Core; a shop; an elite; credits; then a fight restarted from the pause menu, a run lost at the Act I boss, where the bot stops acting on purpose, with the results screen and defeat dialogue, and a new run to its first victory). No page errors in either, 0 layout issues in the Russian run, and one Latin text: the boss name ЯДРО SIGNALBREAK, which keeps the game's title (now on the checker's list of allowed words).
- Ordinary encounters (`tools/encounter.mjs`, English 844×390, touch, learner policy): 5/5 won, HP lost 5–13 of 130, enemy actions at least 1.2s apart and none during a breather.
- Targeting (`tools/targeting.mjs`, 4 sizes, both languages): 32/32.
- Layout (`tools/i18n-layout.mjs`, 7 viewports, every card in hand and Reserve): Russian 1812 screens, English 1808 screens, 0 issues (the first Phase 4 Russian sweep found 301, fixed as listed below)
- Readability (`tools/readability.mjs`, playable cards, smallest/median effect text): English 667×375 7.6/9.4px, 732×510 7.6/10.0, 844×390 7.6/10.0, 1194×834 11.6/12.4; Russian 667×375 7.0/10.0, 732×510 7.6, 844×390 7.6, 1194×834 12.4. 0.2.3 had 6.4px at the three small sizes.
- Pacing, same seeds against 0.2.3 (`tools/pacing.mjs 30 --act1 --pace=2.5`; the bots differ between the builds, so differences cannot be traced to one cause): the learner wins every Act I fight (0.2.3: Scrap Tyrant 77%, Clockwork Regent 90%) and loses less HP (two hounds 13% → 7%, snare + hound + jammer 23% → 13%, Hound Mother 60% → 38%, Scrap Tyrant 86% → 40%, Clockwork Regent 87% → 29%); combos are shorter (3.0–3.4 cards against 4.6–6.8). At 2.5s per card, 8–14% of opening-fight combos run out of Flow (0.2.3: 14–22%; limit 25%). Enemy actions per minute fell by 5–20% because shorter combos bring more breathers; spacing and act multipliers are unchanged.
- Full-run simulation (`tools/simulate.mjs 30`): reacting every 0.55s, 30/30 won, 1.2 HP lost per battle, 37s per battle; per battle 18.7 basic attacks, 10.3 artes, 9.8 support, Momentum +44.8/−35.6, 0 illegal taps, 1.0 Churn, Reserve 0.4 stashed/0.3 played; endings: Perfect 4896, Cash Out 1249, Dropped 194; zone and Momentum integrity checked after every action: 0 failures. Reacting every 1.0s: 19/30 won, 7.3 HP per battle. (0.2.3 with its own bot: 28/30 and 5.0 HP at 0.55s.)
- Offline web app (`tools/pwa.mjs`, the built game): 16/16 under the GitHub Pages path and 15/15 at the site root as on the storage mirror (offline launch from every start URL, the saved run offered, a battle and a card played offline, nothing requested from the network, update to a new build).

**Regression requirements R1–R7**
| | Requirement | Result |
|---|---|---|
| R1 | Enemy pressure: act multipliers 0.70/0.82/0.90, ≥1.2s between enemy actions, ATB correct in pauses and breathers, no hidden acceleration | Multipliers unchanged (unit test); minimum gap ≥1.2s in every measured fight (pacing: 0% under 1s; encounter: min ≥1.2s); 0 actions in breathers; actions per minute 5–20% lower than 0.2.3 because breathers come more often |
| R2 | ≤25% of opening-fight combos drop at ~2.5s per card | 8–14% (0.2.3: 14–22%), measured with the new policy on the new rules |
| R3 | Real downtime; ATB frozen in breathers | Breather after every combo; enemy ATB gain under 0.01 per breather in the encounter measurements; decision, combo and breather time reported separately |
| R4 | Target marker, taps, cycle, NEW TARGET, red ring, Defense/Cover projections, hits on the intended enemy | Targeting matrix 32/32 |
| R5 | Early survivability for the learner; no stranding | Learner wins every Act I fight; free Churn while stranded and the basic-attack reward rule; no new permanent HP |
| R6 | Readability and layout | Smallest effect text 6.4px → 7.0–7.6px; layout sweeps above; category and cost marks on every card face; support has its own colour; the performer is outlined and selected on the hero buttons; hold-to-read still pauses |
| R7 | Saves, languages, offline | Unit and migration tests, genuine v3/v4 fixtures, English and Russian UI runs with reload and Continue, offline check above |

**Bugs found and fixed during the phase**
- Stash left its hand slot empty; it now refills the slot (unit test).
- A new battle's combo field started as `undefined` rather than `null` (caught by the unit tests).
- The simulated player stalled with a hand full of support cards; the policy now plays or Churns support when nothing else can be played.
- The first balance pass was far too easy (0.1 HP lost per battle; Mend Circuit played 236 times in 30 runs): support costs were raised (§25).
- The first full UI run lost the final boss with six artes in hand, no basic attack and no Churn charges: the two anti-stranding rules above (unit tests for both).
- A neutral support card showed Glitch's "!" owner mark; it shows N now.
- Text left from the old rules: How to Play, tutorial, story lines, three relic texts, Russian Dead Drop; rewritten.
- Russian layout at 667×375: "Сначала базовая атака" was cut off on hand cards and the strip hint ended in an ellipsis (shorter wording); with four Reserve slots the new NEXT CARD cell pushed the last slot off screen and cut off suit tags (one-line preview, rank and suit side by side).
- Tools: the encounter measurement attributed actions to the breather by the state at the start of the frame; the acceptance scenario's step 11b had an always-true check (`|| true`), removed.

**Still for human judgment:** whether basic attacks into artes reads better than Opener/Converter/Closer; whether the hero buttons and the "Basic attack first" line make arte rules clear; whether support costs feel fair while support is still instant (Phase 5 adds Recovery); whether the game is now too easy for experienced players (the regular bot loses almost nothing; Act I retuning belongs to Phase 6); whether the free Churn while stranded and the basic-attack reward rule are noticed or feel like hand-holding.

**Open for the Phase 5 design review** (recorded, not changed): whether a standard Relay requires an arte in the outgoing segment (spec §9 now: any segment); whether a queued attack locks its target at commit or uses the target selected at execution (spec §14 now: at execution).

## Revised roadmap, Phase 5: action scheduling, command queue, hero Recovery and deliberate Relays (0.2.5, 2026-11-19)

Specification: `docs/COMBAT_SPEC.md` §7, §7.1, §9, §10, §11.3, §12, §13, §14, §16, §17; what was built: §26. Reference build for regressions: 0.2.4 (source `e6a43d1`, build `d5d18c7`; `git checkout d5d18c7` restores it). Status words as in the Phase 1 section. This is the roadmap's human checkpoint: nothing here has been judged by human players yet (`docs/PLAYTEST.md` is the test plan).

**Implemented**
- *Hero states.* READY / ACTIVE / COMMITTED / ACTING / RECOVERING, derived from the executing command, Recovery timers, the active segment and the queue (`combat.heroState`). Recovery: 1.5s + 0.3s per card after a segment, 2.0s after support, in combat time; it never pauses enemies. The next chain starts with the selected hero if Ready, otherwise the first Ready hero.
- *Command queue.* Card, support, Relay and finish commands in one queue, up to 3 waiting behind the executing one, executed in order. Commit (validated on the projected chain, card to the queue, slot held, rank and suit frozen, cost reserved) → start (revalidated, cost spent, animation) → resolution at the animation's impact frame (effects, gains, refund, slot refill) → completion (support Recovery, decision-window holds, pending endings). Cards execute for 0.6s, Relays for 0.5s. Players keep choosing while commands execute.
- *Cancellation.* Tap a waiting chip, its hand placeholder, or Backspace: the card returns to its slot or Reserve place, the reservation is released, later commands are revalidated (a cancelled Relay takes the incoming hero's cards with it). Started commands always complete. Timeouts, third Stumbles, Cash Out and Clean Exit return unstarted chain commands; victory or defeat clears the queue without effects.
- *Relay.* An explicit command (hero buttons, a hero on the field, Q/W/E), eligible after one executed or queued card of the segment, to a Ready hero who has not joined the chain, with queue room (`relayCheck`; `RULES.RELAY_NEEDS_ARTE` isolates open decision A). On resolution: outgoing hero recovers, incoming hero active at rank 0 (basic attack first), chain history kept, +1 Momentum (not under Relay Jammer), +10% on the incoming first card per Relay, 1.2s hold. Each hero once per chain. Chains no longer end automatically after an arte while a Relay is still possible.
- *Support.* Through the queue, performer Ready required (owner, or the selected / first Ready hero when neutral), 2.0s Recovery afterwards, cannot double-book a Relay destination. Braced asks for its hero (picker on the hero buttons; ✕ cancels without spending the card). Support costs were not changed.
- *Decision window.* Holds while any command executes, 1.2s after the first card and after each Relay; refunds arrive on resolution; cancelled cards refund nothing; 14s counted-time cap unchanged.
- *Enemies.* ATB runs during selection, execution and Recovery; waits in the breather and Finisher. Optional Tactical timing (Settings, off by default): ×0.25 while a chain is open and nothing is executing or queued.
- *Targets.* Resolved when an attack executes (spec default for open decision B), only in `currentTarget()`; a dead target is replaced and labeled NEW TARGET before waiting attacks land.
- *Interference.* Locks/Scrambles never touch committed cards; frozen rank and suit; jams skip held slots; drains take unreserved Momentum; the queue is revalidated after every enemy action and every resolution (The Corruptor's Context Bleed can make a waiting card illegal; it is returned at once).
- *Stranded hands.* Free Churn is judged on cards and Momentum only; busy heroes are a wait.
- *Content.* Restored: Echo Splice (again the win unlock), Relay Harness, Relay Resonance, the Echoing graft, Mirror Wire, Hand Off, Relay Baton, Chorus Break, Grand Relay (texts adjusted: Relay Echoes repeat the last attack; "Relay cards" are the first cards after a Relay). Pressure Valve stays withheld (not a Relay card; repeats Overpressure). The save-version-5 migration table is frozen as shipped in 0.2.4. Playable: 80 cards (25 basic attacks, 42 artes, 13 support).
- *Interface.* Hero buttons with live state (▶ acting, countdown and bar while recovering, … committed, ⇄ can take a Relay); one strip row for executed cards, ⇄ hand-over marks, the executing command (glow, progress) and waiting commands (dashed, ↩ to take back), folding older cards into "+n"; hand placeholders (QUEUED #n / ACTING); a Recovery bar under each hero plate; the Relay hand-off arc and "RELAY n · +b%"; Flow reads EXECUTING / HOLDING; tutorial, How to Play and all new texts in English and Russian; Tactical timing setting.
- *Saves.* No new save version: combat scheduling is never saved, and Continue restarts the encounter with every hero Ready and an empty queue (unit test).

**Tested** (all on the final build unless noted)
- Unit tests 127/127 (`npm test`): the Phase 4 suites adapted to timed execution, and `tests/scheduler.test.mjs` (24 tests): commit does not resolve, effects at the impact frame, order, capacity, projected legality, cancel and dependent revalidation, stale commands after victory/defeat, hero states and Recovery lengths, pausing, all-heroes-recovering, Relay eligibility/execution/rewards/history/participation, three-hero chains, Relay content (Jammer, Echoing, Mirror Wire, Hand Off, Chorus Break, Grand Relay, Relay Baton), Braced targeting, refunds and caps, frame-rate independence (30/60/144 fps give identical results), ATB in each state and Tactical timing, Stumble endings with pending commands, queued FINISH/CASH OUT, interference on queued cards, Reserve latch and jams, and a randomized soak (40 battles × 1500 actions with commits, Relays, support, cancels, Churn, Reserve, interference, victory and defeat; zones, Momentum, queue size, hero states and the participation limit checked after every action). Plus the save test above.
- Acceptance scenario (`tools/accept5.mjs`, 31 steps through taps after a disclosed fixture: stacked deck, Foundry Warden encounter): English 844×390 33/33, Russian 667×375 33/33.
- Full runs through the UI only, with reload and Continue at every checkpoint: English 1024×768 42/42 (three acts won against Scrap Tyrant, Protocol Auditor and Signalbreak Core; a shop; an elite; Volatile preparation; credits; Museum unlock); Russian 732×510 49/49 (three acts won, credits, restarted fight, a shop, a run lost at the Act I boss with the defeat dialogue, a new run to its first victory; 0 untranslated texts; its 2 layout findings — a clipped ⇄ chip and a long Russian reason — were fixed afterwards and covered by the final layout sweep).
- Typical encounters (`tools/encounter.mjs`, English 844×390, touch, learner policy; before the last text fixes): 5/5 won, HP lost 9–24 of 130 (0.2.4: 5–13), enemy actions at least 1.20s apart, none during a breather, chains of up to 7 cards and 3 heroes.
- Targeting (`tools/targeting.mjs`, 4 sizes, both languages): 36/36 — the 32 earlier checks plus "a queued attack lands on the target selected when it executes" at each size.
- Layout (`tools/i18n-layout.mjs`, 7 viewports, now including the queue, Relay and Braced-picker states): Russian 1827 screens, English 1822 screens, 0 issues (the first Phase 5 sweeps found 35 and 14; fixes listed below).
- Readability (`tools/readability.mjs`, smallest/median effect text): English 667×375 7.6/9.4px, 732×510 7.6/10.0, 844×390 7.6/10.0, 1194×834 11.6/12.4; Russian 7.0/9.4, 7.6/10.0, 7.6/10.0, 12.4/12.4 — unchanged from 0.2.4 after three restored or rewritten card texts were shortened (they had brought it down to 6.4px).
- Offline web app (`tools/pwa.mjs`, the built game): 16/16 under the GitHub Pages path and 15/15 at the site root as on the storage mirror (offline launch from every start URL, the saved run offered, a battle and a card played offline, nothing requested from the network, update to a new build).

**Measurements** (`tools/pacing.mjs 30 --act1 --pace=2.5`; `tools/simulate.mjs 30`; bots differ between builds, so differences are observations, not isolated causes)
- *Learner, Act I* (2s per hand, 1.3s per card, waits for each command): every fight won, as in 0.2.4; HP lost higher: two hounds 7% → 10%, snare + hound + jammer 13% → 19%, Foundry Warden 5% → 14%, Hound Mother 38% → 48%, Scrap Tyrant 40% → 49%, Clockwork Regent 29% → 48%. The learner relays in every fight (1.6–12 Relays per battle).
- *Very slow player (2.5s per card), opening fights:* combos dropped by time pressure 0–4% when the player checks the Flow bar before a Relay (0.2.4: 8–14%); 11–31% when the player relays regardless (tutorial fight 31%, two hounds 26%). Elites and bosses got harder for this player: Hound Mother 17% → 0% won, Scrap Tyrant 100% → 80%, Clockwork Regent 70% → 47%.
- *Full runs:* quick player (0.55s, up to 3 queued) 26/30 won, 4.6 HP lost per battle (0.2.4: 30/30, 1.2), 36s per battle; ordinary player (1.0s, up to 2 queued) 19/30, 9.0 HP (0.2.4: 19/30, 7.3), 53s. Quick player per battle: 17.7 basic attacks, 8.6 artes, 6.0 support, 7.1 Relays, Momentum +36.5/−27.1; chains of 1/2/3 heroes 35%/32%/33%, 3.7 cards per chain (longest 9), 1.2 artes per chain, 51 damage per chain; endings Perfect 61%, Cash Out 36%, Dropped 2%; time deciding 2.6s, executing 22.6s, holds 1.7s, breathers 6.0s, idle 3.3s, all heroes recovering 0.3s; 0 illegal actions; card-zone and Momentum integrity checked after every action: 0 failures. Ordinary player: 1/2/3 heroes 54%/34%/12%, 3.2 cards per chain, Perfect 76%, Dropped 5%, deciding 9.2s.
- *Enemy pressure:* actions per minute rose back towards 0.2.3 levels (two hounds, learner: 12.8 in 0.2.4 → 15.7) because longer chains bring breathers less often; no two enemy actions under 1s apart in any measured fight.

**Regression requirements R1–R7**
| | Requirement | Result |
|---|---|---|
| R1 | Enemy pressure | Act multipliers unchanged (unit test); ≥1.2s spacing in every measured fight (pacing: 0% under 1s; encounter minimum 1.20s); enemy actions recorded during deciding, executing and holds, none in breathers; ATB keeps filling during hero Recovery (unit test, acceptance step 26) |
| R2 | ≤25% dropped at ~2.5s per card, opening fights | Passed for a player who looks at the Flow bar before relaying (0–4%); failed for one who relays regardless (31% and 26% in two of eight fights). Decision time is now counted only while the player chooses; execution and holds are separate (stats.time) |
| R3 | Real downtime | Breathers after every chain freeze enemy ATB (unit test, acceptance step 27); Recovery does not; the Flow bar and hero buttons show executing, holding, recovering |
| R4 | Targeting | 36/36 including queued attacks |
| R5 | Early survivability | Learner wins every Act I fight; no stranding (free Churn unchanged, not triggered by busy heroes); no extra permanent HP |
| R6 | Readability and layout | Smallest effect text unchanged (7.0–7.6px); layout sweep above; hold-to-read still pauses |
| R7 | Saves, languages, offline | Unit, migration and save tests; English and Russian full runs; offline check above |

**Open design decisions (evidence, defaults unchanged)**
- *A. Relays without an arte.* Under the current rule, 43% of the quick bot's Relays came from a segment with no arte (3.0 per battle, worth 1.7 Momentum). With `RELAY_NEEDS_ARTE` the same bot won 29/30 runs with 3.0 HP lost per battle (current rule: 26/30, 4.6), relayed less (4.6 per battle), Cashed Out more (50% of chains) and dropped more (7%). The bot's no-arte Relays did not make it stronger, so this does not demonstrate a degenerate incentive; a human player optimising Momentum might use them differently, which only a playtest can show.
- *B. Target at execution.* Attacks waited in the queue 16–20 times per battle in the full runs; their target changed while they waited only when it died (0.3 per battle, quick player; labeled NEW TARGET). The bots never retarget mid-queue; in the UI targeting check a retarget during the wait moved the queued attack to the new target at every size. No unintended retargeting was observed; whether players find the rule clear is a playtest question.

**Bugs found and fixed during the phase**
- The full-run simulation (quick player, 1 of 30 runs) stopped on "illegal queued command": The Corruptor's Context Bleed raised the chain's rank while a card waited. The queue is now revalidated after every enemy action and every resolution (regression test in `tests/scheduler.test.mjs`).
- Hand reason lines kept stale text when the reason was a structured message (the state signature compared "[object Object]"); they now compare the rendered text.
- The queue's cancel mark (✕) looked like the Cross mark on executed chips; cancel is now ↩.
- Layout: the strip hint ran out of room beside the queue chips (shortened, and it steps aside at 3+ chips); the Braced prompt hid behind the chips (the chips step aside while picking); a two-line card name squeezed the cost badge out of the art band (the cost moves into the top tag); Russian Recovery reasons on cards were too long ("Ready in 0.8s" instead); an overflowing strip clipped the last chip (older cards fold into "+n" until it fits).
- Readability: three restored or rewritten card texts (Hold the Line, Hand Off, Mirror Wire) brought the smallest text to 6.4px; shortened back to 7.0/7.6px.
- Tools: the targeting check waited 0.15s for an attack that now takes 0.27–0.38s to land, and compared the ⌖ cycle against a stale target; both fixed.

**Still for human judgment:** whether the queue and the hero states are understood without explanation; whether Recovery feels like tactical downtime or like waiting; whether Relays are recognised and worth their risk (a Relay late in the decision window can turn a Perfect into a Dropped combo); whether very slow players can use Relays at all (they mostly cannot within the current window) and whether Tactical timing helps them; whether support's Recovery cost makes support too weak or right; whether the game is now too hard for fast players (Act I retuning belongs to Phase 6).

## Revised roadmap, Phase 6: Act I onboarding, Relay accessibility, Act I tuning and telegraphs (0.2.6, 2026-11-21)

Specification: `docs/COMBAT_SPEC.md` §27. Reference build for regressions: 0.2.5 (source `b702145`, build `51d2e4d`; `git checkout 51d2e4d` restores it). Before/after comparisons below ran the same Phase 6 tools on both builds (the 0.2.5 tree with the new `tools/` copied in), with the same seeds. Nothing here has been judged by human players (`docs/PLAYTEST.md` is the test plan).

**Baseline reproduced first.** `tools/simulate.mjs 30 0.55 quick` and `30 1.0 regular` on 0.2.5 gave exactly the reported 26/30 (4.6 HP per battle) and 19/30 (9.0); `tools/pacing.mjs 30 --pace=2.5` reproduced the slow player's 0–4% (checking Flow before a Relay) and, with `SB_NAIVE_RELAY=1`, 31% (tutorial) and 26% (two hounds). Every quick-player loss in those 30 runs was in Act III (Signalbreak Core 3, a Signal Hound pack 1); none in Act I.

**Measurement model.** The 0.2.5 pacing bot played the card after a Relay the moment the Relay finished executing (no time to find the incoming hero's basic attack). Phase 6 tools default to model p6, where a Relay is a decision like a card and the next command comes one card-pace later; `--model=p5` reproduces the old figures. Results under both models are given where they matter.

### Relay accessibility

*Diagnosis* (`tools/relaylab.mjs`, opening fights, 2.5s per card, a player who relays whenever another Ready hero has an arte — "active" — 0.2.5): Flow left when the Relay was tapped 2.2–2.5s; the incoming hero's basic attack came 2.0–2.1s after the hand-off (of which 1.2s was held) and their arte 4.4–4.7s after it; only 46–56% of incoming segments reached an arte; 34% of chains with a Relay were dropped, most of them in the second hero's segment (0.45 drops per battle, against 0.15 before any Relay and 0.08 in a third segment). By Flow left at the tap: under 1s 29% of those chains dropped, 1–2s 55%, 2–3s 20%, 3s+ 19% — a Relay with 1–2s left usually leaves time for the incoming basic attack but not for the arte, turning a Perfect into a Dropped combo. Traced chains showed the three causes: Relays with almost no Flow, a mistaken tap, and the incoming segment running out between its basic attack and its arte.

*Controlled experiments* (each one rule changed, nothing shipped this way; 30 battles per fight unless noted, so differences of a few points are noise):

| Change | Active 2.5s dropped (worst fight) | Note |
|---|---|---|
| none (0.2.5), 30 / 100 / 200 battles | 26% (35%) / 30% (35%) / 27% (29%) | |
| Relay hold 1.2 → 2.0s | 25% (31%); 100 battles: 30% (32%) | barely helps: the gap is after the incoming basic attack |
| Relay hold 2.5s / 3.0s | 22% (30%) / 20% (27%) | |
| Relay refunds 1.0s | 33% (41%) | worse: the extra time funds a third segment that then drops |
| Relay hold ends at the incoming hero's first commit (2.5s / 3.0s) | 24% / 25% | |
| Flow topped up to 1.5 / 2.0 / 2.5s at a Relay | 32% / 28% / 29% | worse, for the same reason |
| hold 2.0s + top-up 2.0s (100 battles) | 26% (29%) | |
| **incoming hero's first card opens the opener's 1.2s hold** (100 battles) | **14% (17%)** | |
| the same + Relay hold 2.0s (100 battles) | 13% (17%) | no meaningful gain over the hold alone |

*Shipped:* `SEGMENT_READ_GRACE` = 1.2s — the hold the chain's first card has always had, given to the first card of each incoming segment (at most twice per chain; holds stay outside the 14s counted cap). The unused experiment switches were removed. Interface: an amber ⇄! (little Flow left; FINISH or CASH OUT is safer) and the *little Flow left* lesson.

*Result* (`tools/relaylab.mjs 200 --seed0=1000 --quick`, 200 battles per fight and player, seeds 1001–1200; dropped = each battle's share of dropped chains, averaged, as in R2):

| Player | 0.2.5 dropped (worst fight) | 0.2.6 dropped (worst fight) | Relays per battle | chains with a Relay | completed multi-hero chains per battle | drops after a Relay |
|---|---|---|---|---|---|---|
| active 1.3s | 2% (2%) | 2% (2%) | 2.09 → 2.09 | 70% → 70% | 0.93 → 0.93 | 0% → 0% |
| active 2.0s | 12% (16%) | 6% (7%) | 2.24 → 2.17 | 67% → 66% | 0.93 → 0.94 | 14% → 5% |
| **active 2.5s** | **27% (29%)** | **14% (18%)** | **2.31 → 2.22** | **64% → 61%** | **1.06 → 1.11** | **34% → 16%** |
| active 3.0s | 44% (46%) | 25% (26%) | 2.34 → 2.13 | 58% → 54% | 0.92 → 1.26 | 56% → 26% |
| careful 2.5s (checks Flow ≥4s) | 5% (6%) | 5% (6%) | 0.15 → 0.15 | 3% → 3% | 0.09 → 0.10 | 15% → 4% |
| careful 2.0s | 3% (4%) | 2% (3%) | 1.06 → 1.13 | 28% → 26% | 0.75 → 0.69 | 2% → 1% |
| no Relays 2.5s / 3.0s | 5% / 10% | 5% / 10% | 0 | 0 | 0 | — |
| quick (0.4s, 3 queued) | 0% | 0% | 3.21 → 3.21 | 100% | 0.85 → 0.85 | 0% |

Active 2.5s, per fight: 24–29% → 11–18%; incoming segments reaching an arte 46–56% → 59–72%. Under the 0.2.5 model (p5, 100 battles): 20% (23%) → 14% (18%). In the pacing tool (p6 model, 60 battles, `SB_NAIVE_RELAY=1`) the same player's drops over every Act I fight went from 23–35% to 12–18%. **R2 now passes for a player who actively relays (14%, worst opening fight 18%, at 2.2 Relays per battle)**; the improvement does not come from fewer Relay attempts (2.31 → 2.22 per battle, 64% → 61% of chains). Remaining limits: a 3.0s active player still drops 25%; a careful slow player rarely relays at all (the bot's rule waits for 4s of Flow); the bots' decision model, not human behaviour, sets these numbers.

### Hound Mother

*Observed (0.2.5, `tools/fightlab.mjs hound_mother 60`):* the very slow player (2.5s) won 2% and lost all HP by 72s; enemies acted 27.6 times a minute for 129 damage a minute (Foundry Warden: 5.4 and 36). The starting hound and the summoned one dealt 110 of 154 damage taken (71%), the Mother 44. Summons: exactly 1 per fight — the whelp rule caps the field at 3 and the bots never kill a hound, because they never change target: they hit the Mother (the default target) all fight.

*Controlled:* with a target habit that taps the enemy dealing the most damage for its HP (hounds first), the learner's HP loss fell 53% → 36% and the ordinary player's 25% → 12%, but the slow player still won only 3%: the Mother whelped every time a hound died, 8.5 times in a 213s fight — new hounds' HP arrived about as fast as the slow player dealt damage (2.3 per second), so she was never reached. Turning hero Recovery off changed nothing for the slow player (2.3 damage per second either way): the cause is the unlimited full-size replacement, not the Phase 5 economy. Variants (60 battles; win / HP lost of max; hounds first):

| Variant | slow 2.5s full HP | slow 2.5s at 70% HP | learner | ordinary | quick |
|---|---|---|---|---|---|
| 0.2.5 | 3% / 99% (213s, 8.5 summons) | 0% / 70% | 100% / 36% | 100% / 12% | 100% / 3% |
| at most 2 litters | 90% / 84% | 27% / 68% | 100% / 39% | 100% / 13% | 100% / 3% |
| at most 3 litters | 67% / 89% | 12% / 69% | 100% / 38% | 100% / 12% | 100% / 3% |
| whelps at 60% HP | 100% / 59% (176s, 7.1 summons) | 93% / 45% | 100% / 24% | 100% / 8% | 100% / 2% |
| **3 litters + whelps at 60% HP** | **98% / 69% (129s, 3.0 summons)** | **75% / 58%** | **100% / 24%** | **100% / 8%** | **100% / 2%** |

*Shipped:* at most 3 litters per fight, whelps at 60% of a Rush Hound's HP. She still opens by whelping, Rallies (+30% ATB) and Mauls; the fight still punishes ignoring the pack: a player who keeps hitting the Mother at 2.5s per card still loses (2%, all HP), unchanged, because the two hounds on the field from the start do the damage. A *summons* lesson (tap a summon to target it, or race the summoner) and the hold-to-read panel are the counters the game now teaches. A unit test kills every whelp at once for 400s: exactly 3 litters, never more than 3 enemies.

### Act I encounters and bosses

All Act I formations, both elites' other numbers and both bosses are unchanged; the formation table still introduces one interference type at depth 0 (unit test). `tools/pacing.mjs 60 --act1 --pace=2.5` (p6 model, bots that never retarget), 0.2.5 → 0.2.6, win / HP lost: learner every fight 100% won, HP lost unchanged within a point (tutorial 3%, d0 two hounds 12%, d4 snare + hound + jammer 21%, Foundry Warden 18%, Hound Mother 52 → 53%, Scrap Tyrant 48%, Clockwork Regent 48 → 49%); ordinary player 1–28%, quick 0–10%, unchanged. Slow 2.5s careful player: opening fights 100% won, 6–25% HP lost, 3–6% dropped, unchanged; Scrap Tyrant 53 → 62% won, Clockwork Regent 27 → 28%.

*Scrap Tyrant* (`tools/fightlab.mjs scrap_tyrant 60`): quick 100% / 10% HP lost, ordinary 100% / 24%, learner 100% / 48%, slow 2.5s 62% won (no Relays 75%, relaying at every chance 2%); starting at 70% HP: slow 25%; with Tactical timing and 70% HP: slow 100% / 16%, learner 100% / 14%. Its Guard (Scrap Barrier 22, Grind Gears 10, regenerating in phase 2 where Pierce hits double) is the fight's identity; the *enemy Guard* lesson and the hold panel explain it. No change: the challenge scales with the player's speed and Tactical timing makes it winnable for the slowest player.

*Clockwork Regent* (`tools/fightlab.mjs clockwork_regent 60`): quick 100% / 6%, ordinary 100% / 28%, learner 100% / 49%, slow 2.5s 28% won (2% relaying at every chance); with Tactical timing slow 100% / 42% (70% HP start: 100% / 23%). Tempo Theft stole Flow 5.2 times (6.2s) per fight from the slow player and 1.0 time from the quick one; the slow player's dropped share was 9% against 7% in the Tyrant fight. The theft is now telegraphed (red end of the Flow bar, "THEFT −1.2s", the *Flow theft* lesson) so it no longer arrives unannounced; its strength is unchanged.

*Competent players:* the quick bot loses 0–12% HP in every Act I fight and the ordinary bot 1–28%; Act I stays a real but beatable challenge for an ordinary player and is easy for the superhuman quick bot (0.4s per decision, 3 commands queued), as before.

### Support and combo balance

Support was not changed. Measured (`tools/fightlab.mjs`, support cards in hand at every decision): playable 17–32% of the time, waiting for a busy or recovering hero 65–83%, short of Momentum 0–5% — the binding cost is the hero's availability (the Phase 5 design), not Momentum, and every support card still gets played (1–8 per fight; Salvage most, Mend Circuit when hurt). Full runs (quick player): 5.9 support, 17.8 basic attacks and 8.6 artes per battle; chains of 1/2/3 heroes 35% / 32% / 34%; 3.68 cards and 1.22 artes per chain; Perfect 60%, Cash Out 37%, Dropped 3% — all within noise of 0.2.5 (3.67 cards, 1.22 artes, Perfect 61%, Cash Out 36%). Perfect, Cash Out and Relays all stay in use; nothing indicates one dominant ending.

### Full runs

`tools/simulate.mjs 30`: quick 26/30 → 28/30 won, 4.6 → 4.3 HP per battle, 36.4 → 36.6s per battle; ordinary 19/30 → 18/30, 9.0 → 9.3 HP, 53.0 → 52.9s. One or two runs in 30 is within noise; no Act I deaths in either build; losses are at Signalbreak Core (Act III) as before. Time per battle (quick): deciding 2.6 → 2.3s, holds 1.7 → 2.3s (the new hold), executing 22.6s, breathers 6.0s. Integrity checks every action: 0 failures.

### Onboarding

The 0.2.5 tutorial was five pause cards in the first battle — "THE RELAY" before the first attack (hand, enemies, targets, hero buttons, arte stars, basic attacks and the queue in one card), then COMBO STARTED, ARTE READY, MORE TOOLS (Recovery, support, Churn, Reserve, Cash Out, next card) and RELAY — plus five interference cards. 0.2.6 replaces them with 28 one-idea lessons triggered by the battle state (§27 lists every trigger), spotlighting the control they explain, at least 2s apart, at most 14 in the first battle and 3 in later ones; late lessons (Cash Out, little Flow left, heavy hit, area attacks, summons, enemy Guard, Flow theft, boss) never appear in the first battle. Skip (a confirming second tap), replay (Settings), rereading (How to Play) and returning-player migration as in §27. A lesson card ignores input for its first 0.45s so a tap meant for a card cannot dismiss or skip it (found by the acceptance run, below).

### Interface and telegraphs (implemented)

Hold an enemy for the next move in the engine's numbers (single hits after the target's Defense, with Cover; area hits per hero and in all; both before Guard), 50 intent descriptions in both languages; area-attack bubbles show the per-hero hit with three hero dots instead of "n×3"; the Flow bar shows an imminent Flow theft in red ("THEFT −1.2s"); an amber ⇄! warns of a Relay with little Flow left; lesson cards with a spotlight; How to Play gains "All tutorial tips". Card faces were not changed: the smallest effect text is unchanged from 0.2.5 (below), and the full text stays one hold away.

### Tested

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 144/144 — `tests/phase6.test.mjs` (17): lesson order and dependencies, lessons never change combat state (randomized), contextual triggers in any order, a battle won with no lesson shown, returning-player migration and replay, lesson progress saved, short texts, the incoming hero's read hold applied once, holds cannot extend a chain without limit, FINISH instead of a Relay, Act I formations (one interference type at depth 0), Hound Mother's 3 litters of smaller whelps over 400s, both bosses' mechanics, the Flow-theft warning equal to the theft, the enemy panel numbers equal to the damage taken (single and area), every source file parses, the Tactical timing lesson |
| Acceptance (`tools/accept6.mjs`, taps/holds/swipes after a disclosed fixture) | English 844×390 47/47 and Russian 1194×834 47/47 (first battle, combat time frozen while a lesson is open, Act I through the elite and the boss into Act II, reload and Continue, skip/replay/returning player); first battle only: Russian 667×375 32/32, English 1194×834 32/32 |
| Phase 5 acceptance (`tools/accept5.mjs`, English 844×390) | 33/33 (no regression) |
| Targeting (`tools/targeting.mjs`, 4 sizes, both languages) | 36/36 |
| Layout (`tools/i18n-layout.mjs`, 7 viewports, every lesson card included) | Russian 1955 screens, English 1957 screens, 0 issues |
| Readability (`tools/readability.mjs`, smallest effect text) | English 667×375 7.6px, 732×510 7.6, 844×390 7.6, 1194×834 11.6; Russian 7.0, 7.6, 7.6, 12.4 — unchanged from 0.2.5 |
| Typical encounters (`tools/encounter.mjs`, English 844×390, touch, learner) | 5/5 won, 5–19 of 130 HP lost, enemy actions at least 1.22s apart, none in a breather |
| Full campaign through the UI (`tools/milestone.mjs`, reload and Continue at every checkpoint) | English 1024×768 43/43: three acts won (Clockwork Regent, Mirror Array, Signalbreak Core), both Act I elites (Foundry Warden, Hound Mother), a shop, the Volatile preparation, the ending, credits, results, the Museum unlock in the next run. Russian 732×510 (defeat flow) 49/49: three acts won, credits, a restarted fight, a lost run with the defeat dialogue, a new run to its first victory; 0 untranslated texts; 2 layout findings (one hint, below), fixed and rechecked |
| Offline web app (`tools/pwa.mjs`, the built game, source `0bfcf8f`) | 16/16 under the GitHub Pages path and 15/15 at the site root as on the storage mirror (offline launch from every start URL, the saved run offered, a battle and a card played offline, nothing requested from the network, update to a new build) |

**Regression requirements R1–R7**
| | Requirement | Result |
|---|---|---|
| R1 | Enemy pressure | Act multipliers and the 1.2s spacing unchanged (unit tests); 0% of enemy gaps under 1s in every pacing row; encounter minimum 1.22s; enemy ATB stands still while a lesson is open (acceptance step 3) and in breathers; the only enemy change is Hound Mother's litters and whelp HP |
| R2 | ≤25% dropped at ~2.5s per card in opening fights, **with actual Relay participation** | Passed: a player who relays whenever another hero can follow up drops 14% (worst opening fight 18%) at 2.22 Relays per battle, 61% of chains with a Relay (0.2.5: 27%, worst 29%, 2.31 Relays); a careful player 5%, a player who never relays 5%. At 3.0s per card the active player still drops 25% |
| R3 | Downtime | Decision, execution, holds, breather, Recovery and pause kept separate (`stats.time`): quick player per battle deciding 2.3s, executing 22.6s, holds 2.3s, breathers 6.0s; Recovery is per hero and never pauses enemies; breathers do |
| R4 | Targeting | 36/36 including queued attacks; NEW TARGET; hold-to-read added (a tap still targets) |
| R5 | Early survivability | Learner wins every Act I fight; opening fights cost the learner 3–12% HP and the slow careful player 6–25%; starting party HP not changed |
| R6 | Readability | Layout 0 issues in both languages at 7 sizes (lessons included); smallest card effect text 7.6px (English) / 7.0px (Russian) at 667×375, unchanged — not a fix, the full text remains a hold away; hold-to-read pauses for cards and now for enemies |
| R7 | Saves, languages, offline | Unit, migration and save tests; lesson progress in the meta record (save version 5 unchanged); acceptance and campaign runs in both languages with reload and Continue; offline check above |

**Open design decisions (defaults unchanged)**
- *A. Relays without an arte* (`RULES.RELAY_NEEDS_ARTE`, false). 0.2.6, quick player: 42% of Relays come from a segment without an arte (3.0 per battle). With the alternative rule: 27/30 runs won, 3.6 HP per battle (default 28/30, 4.3), Relays 4.6 per battle (7.1), Cash Out 49% (37%), Dropped 8% (3%), chains of 1/2/3 heroes 56/28/16% (35/32/34%). For the 2.5s active player the alternative gives 11% dropped (default 14%) at 1.55 Relays per battle (2.22). The arte rule makes Relays rarer and safer; neither rule shows a degenerate pattern in the bots. A human decision.
- *B. Target at execution* (`currentTarget()`). Queued attacks 18.9 per battle; their target changed while waiting only when it died (0.3 per battle). The hold-to-read panel and the summons lesson make the current target more visible; the rule is unchanged.

**Bugs found and fixed during the phase**
- *A lesson could be dismissed or skipped by a tap meant for a card.* The acceptance run's ordinary play tapped where a lesson had just appeared and hit "Skip all tips": tips were off for the rest of Act I (seen as 15 lessons recorded against 14 seen). Fixed: a lesson card ignores input for its first 0.45s, and skipping takes a confirming second tap; the acceptance run now checks that tips stay on and that every recorded lesson was one the player saw (20 of 20).
- *main.js failed to load*: an apostrophe in a new How to Play sentence ended its string. The unit tests never import `main.js`, so they passed; the browser run showed it. Fixed, and a test now syntax-checks every source file.
- *Too many lessons competing in the first battle*: late lessons (Cash Out, heavy hit, …) took first-battle slots before the queue and cancel lessons. Late lessons are now never shown in the first battle; the first-battle limit is 14.
- *A Russian hint clipped on phones*: in live play at 732×510 the strip hint after an arte ("Корвин: арте выше, ЭСТАФЕТА ⇄ или ЗАВЕРШИТЬ") ended in an ellipsis beside two chips (the static layout sweep had not produced that state). Narrow strips now show the short form ("…: ЭСТАФЕТА ⇄ или ЗАВЕРШИТЬ"; the cards already say whether a higher arte is playable); rechecked in that state at 667×375, 732×510, 844×390 and 900×500: 0 issues.
- *Tools*: the relay lab's first metric pooled chains across battles (R2 averages per battle; both are now reported); a measurement model that gave the card after a Relay no thinking time (model p5) is kept only for reproducing 0.2.5; acceptance-scenario races (lesson timing, the queue chip render, the elite route) fixed in the tool.

**Still for human judgment:** whether the lessons are understood and arrive at the right moments; whether 10–14 short pauses in the first battle feel like help or interruption; whether players find the Relay and use it on purpose; whether the incoming hero's read hold is noticed or just feels like breathing room; whether the Hound Mother now reads as "deal with the pack" and the bosses as fair; whether holding an enemy is discovered; whether 7.0–7.6px card text is readable on real phones; whether Tactical timing is found and helps. No human has played 0.2.6, and no physical iPhone or iPad has run it.


## Revised roadmap, Phase 7: EX Combo recipes, discovery and the Combo Journal (0.2.7, 2026-11-22)

Specification: `docs/COMBAT_SPEC.md` §28 (and §12.4, §19). Reference build for regressions: 0.2.6 (source `0bfcf8f`, build `3fd8b6b`; the Phase 6 checkpoint is `bdeb723`). Nothing here has been judged by human players: the project owner decided no human beta test is required for this phase, and none was run.

**Baseline reproduced first.** On 0.2.6, `tools/simulate.mjs 30 0.55 quick` gave 28/30 (36.6s per battle, 4.3 HP lost per battle) and `30 1.0 regular` 18/30 (52.9s, 9.3). The same two runs on 0.2.7 with recognition switched off (`SB_EX=off`, i.e. `RULES.EX_COMBOS = false`, a measurement switch only) give exactly the same numbers, line for line: the recipe engine changes nothing when no recipe triggers.

### The recipe system

Fifteen recipes (§28 table), evaluated only when a basic attack or arte resolves or a chain ends, from a compact per-chain record of executed commands. Each triggers once per chain; several on one command all trigger in priority order; undiscovered recipes work; matching never changes legality, the queue or zones; EX effects cannot trigger further recipes. Discoveries go to the Museum record the moment they happen; the run counts finished battles only.

### Tuning the catalogue (measured, not guessed)

The first catalogue was far too generous: the ordinary bots completed recipes without trying. 30 full runs each, quick 0.55s / regular 1.0s:

| Catalogue | EX per 100 chains (ordinary bot, quick / regular) | Battle time vs 0.2.6 | Regular wins | Recipe-aware bot, regular wins |
|---|---|---|---|---|
| v1 (first draft) | 145 / 92 | −22% / −16% | 22/30 | 24/30 |
| v2 (Tandem same suit, Salvage needs the Churned card, Three-Way needs three artes, smaller effects) | 107 / 74 | −12% / −12% | 21 | 25 |
| v3 (Quick Settlement needs a Cross, Pressure Release needs 8 Momentum) | 85 / 61 | −14% / −11% | 19 | 20 |
| **v4 (shipped: every damage share cut about a quarter)** | **81 / 60** | **−10% / −8%** | **20** | **23** |

Activation requirements were tightened before effects were cut, as the assignment asks; no enemy was changed to compensate.

### Balance: the existing policy against a recipe-aware one

`tools/lib/bot.mjs` gained a recipe-aware policy (`ex: true`): with the same hand, it orders its legal choices towards recipes (climb W→M→S before the arte, switch suits, a quick Cash Out after a Cross, +FLOW towards six cards, another hero's heal or Hessa's Cover mid-chain, Churn to dig and play what it brings, open with a basic attack kept in the Reserve). It plays nothing `check()` refuses and writes no history. 30 full runs per row, seeds 1001–1030:

| Policy | Rules | Wins | HP lost / battle | Battle | EX / battle (per 100 chains) | Distinct recipes / run | 3-hero chains | Cards / chain | Momentum + / − | Support | Perfect / Cash Out / Dropped |
|---|---|---|---|---|---|---|---|---|---|---|---|
| quick, existing | EX off (= 0.2.6) | 28 | 4.3 | 36.6s | 0 | 0 | 34% | 3.68 | 36.6 / 27.1 | 5.9 | 60 / 37 / 3% |
| quick, existing | EX on | 28 | 3.8 | 32.8s | 4.55 (81) | 10.4 | 33% | 3.62 | 32.6 / 23.1 | 5.4 | 57 / 40 / 2% |
| quick, recipe-aware | EX off | 27 | 2.7 | 36.8s | 0 | 0 | 26% | 3.71 | 36.3 / 26.9 | 7.5 | 62 / 35 / 3% |
| quick, recipe-aware | EX on | 28 | 2.9 | 31.0s | 6.35 (126) | 11.6 | 28% | 3.81 | 32.8 / 23.2 | 5.8 | 64 / 34 / 2% |
| regular, existing | EX off (= 0.2.6) | 18 | 9.3 | 52.9s | 0 | 0 | 12% | 3.16 | 44.3 / 34.9 | 8.0 | 76 / 19 / 5% |
| regular, existing | EX on | 20 | 7.1 | 48.6s | 4.66 (60) | 10.9 | 12% | 3.16 | 41.4 / 31.9 | 7.0 | 76 / 19 / 5% |
| regular, recipe-aware | EX off | 20 | 6.4 | 50.4s | 0 | 0 | 11% | 3.35 | 42.2 / 32.6 | 9.0 | 76 / 18 / 6% |
| regular, recipe-aware | EX on | 23 | 6.0 | 43.9s | 7.14 (114) | 11.7 | 9% | 3.36 | 38.4 / 28.8 | 8.0 | 78 / 17 / 5% |
| learner 1.4s, existing | EX off | 11 | 12.5 | 48.8s | 0 | 0 | 9% | 2.92 | 38.1 / 27.7 | 6.6 | 67 / 21 / 12% |
| learner 1.4s, existing | EX on | 14 | 12.1 | 48.3s | 4.14 (52) | 9.5 | 9% | 2.98 | 38.9 / 28.4 | 6.2 | 69 / 19 / 12% |

*Reading it.* The recipe-aware policy with recognition off is no better than the existing policy (quick 27 vs 28 wins, the same 36.8s battles; regular 20 vs 18, 50.4 vs 52.9s): its different choices are not stronger play in themselves. With recognition on, the same choices shorten battles a further 13–16% (quick 36.8 → 31.0s, regular 50.4 → 43.9s) and lift regular wins 20 → 23. That gap is the strategic value of playing for recipes: a reward large enough to change normal decisions (more Perfects, longer chains, support used mid-chain, fewer three-hero chains in favour of same-suit hand-overs), not an automatic gain. The existing policy gets 4.1–4.7 recipes per battle incidentally, worth 8–10% shorter battles and wins within noise of 0.2.6 (quick 28 = 28, regular 20 vs 18, learner 14 vs 11 over 30 runs). EX damage is 6–8% of chain damage; EX Momentum 1.3–3.1 per battle against 32–41 gained; nothing runs away (Momentum and Churn caps hold in every recipe test and in the 25-battle soak).

*By recipe* (per battle, existing quick / recipe-aware regular): Quick Settlement 1.27 / 0.17, Tandem Signal 0.70 / 0.82, Cross Current 0.47 / 1.19, Salvage Circuit 0.46 / 0.75, Three-Way 0.41 / 0.36, Iron Harmony 0.39 / 1.29, Interference Reversal 0.27 / 0.45, Pressure Release 0.17 / 0.15, Healing Cadence 0.13 / 0.38, Prism 0.10 / 0.26, Final Harmonic 0.08 / 0.07, Second Wind 0.06 / 0.09, Straight Circuit 0.06 / 1.12, High Climb 0.00 / 0.05. Straight Circuit is the clearest case of deliberate play: 0.06 per battle when the bot plays its usual way, 1.12 when it climbs on purpose. By encounter: 2.8–4.6 in ordinary fights, 4–7 in elites, 10–18 in bosses (longer fights, more chains).

### Builds (`tools/recipelab.mjs 12`)

Twelve drafted decks per archetype (the starter deck plus seven reward cards with the archetype's tag and three others), Act I and II formations, elites and bosses at run scaling, 168 battles per build and policy. All 15 recipes were reached through legal play; no recipe needed injected history. The starter deck alone reached 10 in Act I (Straight Circuit 1.89 per battle, Cross Current 1.14, Tandem Signal 0.81, Stored Strike 0.70, Three-Way 0.70, Iron Harmony 0.57, Quick Settlement 0.19, Interference Reversal 0.18, Salvage Circuit 0.12, Healing Cadence 0.08).

| Build | Its recipes (recipe-aware, per battle) | Average over all builds |
|---|---|---|
| Flow Extension | Second Wind 0.87 | 0.19 |
| Cash Out | Quick Settlement 1.07 | 0.26 |
| Guard & Counter | Iron Harmony 2.02 | 1.07 |
| Rank Ladder | Final Harmonic 0.70 (Straight Circuit 1.11) | 0.24 (1.17) |
| Relay Echo | Three-Way 1.26, Tandem 1.24, Final Harmonic 0.41 | 1.02, 1.08, 0.24 |
| Reserve Strategy | Stored Strike 0.80 | 0.53 |
| Momentum Burst | Pressure Release 0.87 | 0.81 |
| Interference Exploit | Interference Reversal 0.60 | 0.58 |
| Suit Switching | Cross Current 0.92, Prism 0.44 | 1.11, 0.44 |
| Churn Engine | Salvage Circuit 1.05 | 1.66 |

Six builds clearly favour their own recipes; Momentum Burst and Interference Exploit only marginally (Interference Reversal depends on enemy Locks, not on the player's cards); Suit Switching and Churn Engine decks did not reach their recipes more often than other decks with this bot — its Cross and Churn habits are the same whatever the deck holds. Every build has recipes it can pursue; whether the differentiation reads as real to players is a question for human play.

### Presentation and onboarding

One banner per command (names, the sequence as chips, the effect actually applied, NEW only the first time); the first discovery opens one short lesson once the banner has faded (29 lessons now; the Phase 6 28 unchanged, their spacing, skip, replay, returning-player migration, pauses, input guard and Tactical timing untouched). No permanent recipe row; card text not reduced.

### Tested

| Check | Result |
|---|---|
| Unit tests (`npm test`) | 182/182 — `tests/recipes.test.mjs` (36): every recipe assembled by legal play (commit, Relay, support, Churn, Reserve, +FLOW, FINISH / CASH OUT) on a stacked hand and checked on the command that completes it, with its negatives (wrong order, missing step, other hero, rank, suit, part boundary, cancelled Relay, cancelled or queued card, support outside the chain, Cover expired, full HP); once per chain and again next chain; overlaps in priority order; caps; no recursion; a lethal completing arte and a winning Cash Out (recorded, not applied); a 25-battle randomized soak; EX damage to the target at execution, through Guard and the Suit Filters, not counted as arte damage; the Journal record (first, repeat, unknown and damaged ids, idempotent, older records); save and reload; run statistics; the two engine fixes. `tests/run.test.mjs`: a genuine 0.2.6 save (version 5) loads as version 6 with everything kept; a damaged version-6 record loads safely; the v3/v4 fixtures still convert |
| Acceptance (`tools/accept7.mjs`, the assignment's scenarios A–E, steps 1–42 plus 5 extra checks, taps only after a disclosed fixture) | English 844×390 47/47, English 1180×820 47/47, Russian 844×390 47/47, Russian 1180×820 47/47 (all four run in parallel under load) |
| Recipe coverage (`tools/recipelab.mjs 12`) | 15/15 recipes reached through legal play; 10 with the starter deck alone |
| Balance (`tools/simulate.mjs`, 10 configurations × 30 runs) | above |
| Phase 5 acceptance (`tools/accept5.mjs`, English 844×390) | 31/33 in the first run, under heavy parallel load: step 25 (a queued heal cancelled) raced the screenshot taken before the cancel tap, and step 30 still expected save version 5 (the tool now checks the current version); re-run pending |
| Phase 6 acceptance (`tools/accept6.mjs`, English 844×390) | running |
| Targeting (`tools/targeting.mjs`, 4 sizes, both languages) | 36/36 |
| Layout (`tools/i18n-layout.mjs`, 7 viewports, now with every Combo Journal state and filter and every EX banner) | running |
| Readability (`tools/readability.mjs`, smallest card effect text) | English 667×375 7.6px, 732×510 7.6, 844×390 7.6, 1194×834 11.6; Russian 7.0, 7.6, 7.6, 12.4 — unchanged from 0.2.6 |
| Reduced Motion and no freeze (browser check) | with Reduced Motion the EX banner has no animation; with or without it, combat time and enemy ATB keep running while the banner shows (0.5s of battle time, ATB 0.48 → 0.59) |
| Full campaign through the UI (`tools/milestone.mjs`, reload and Continue at every checkpoint) | English 1194×834 41/41: three acts won (Clockwork Regent, Protocol Auditor with the Volatile preparation, Signalbreak Core), a shop, the ending, credits, the results screen (EX Combos 67 · 12 recipes), the Museum record and unlock. Russian 844×390 and the defeat flow: running |
| Offline web app (`tools/pwa.mjs`, the built game) | 16/16 under the GitHub Pages path and 15/15 at the site root as on the storage mirror |

**Regression requirements R1–R7**

| | Requirement | Result |
|---|---|---|
| R1 | Enemy pressure | Act multipliers and the 1.2s spacing unchanged (unit tests); 0% of enemy gaps under 1s in every pacing row with EX on and off (`tools/pacing.mjs 60 --act1 --pace=2.5`); the EX banner pauses nothing (enemy ATB keeps filling, browser check); the first-EX lesson pauses like every lesson |
| R2 | ≤25% dropped at ~2.5s per card in opening fights, with Relays | The 2.5s active-Relay player drops 12–17% per Act I fight with EX on, 14–18% with EX off (`--relay=active --only-slow`, 60 battles per fight); the careful 2.5s player 5–8% either way. No presentation takes decision time |
| R3 | Downtime | Decision, execution, holds, breathers, Recovery and pause still separate (`stats.time`); with EX on the quick player decides 1.9s, executes 19.9s, holds 2.0s, breathers 5.0s per battle (battles are shorter); no global freeze |
| R4 | Targeting | 36/36 including queued attacks; EX strikes hit the target current when they resolve and area effects every living enemy (unit test) |
| R5 | Early survivability | Learner, ordinary and quick players win every Act I fight with EX on and off; the learner's Act I HP loss is unchanged or lower; recipes are not needed to win (the existing policy with EX off is 0.2.6) |
| R6 | Readability | Smallest card text unchanged (7.0–7.6px on phones); no permanent EX row; layout sweep running |
| R7 | Saves, languages, offline | Version-6 run saves, v3/v4/v5 fixtures and the Museum record normalisation (unit tests); the Journal survives reload, a new run and a restarted encounter (acceptance steps 37–42a, both languages); 0 of 491 interface keys untranslated; offline check above; full campaign above |

**Bugs found and fixed during the phase**
- *A lethal Slipstream crashed the engine* (present in 0.2.6, confirmed by running the same sequence on `bdeb723`): its "refunds double Flow" ran after its own damage had ended the battle and read the chain that no longer existed. The recipe lab's drafted decks were the first to land a killing Slipstream. Fixed (`naturalRefund` returns 0 without a chain); unit test.
- *A battle that ended during a command's follow-through left it marked as executing* (pre-existing; exposed when the scheduler soak's random stream changed): victory or defeat while a support was still animating after its effect. Fixed in the end-of-battle cleanup; unit test.
- *EX damage skipped the boss Suit Filters* (found in review of the damage path): a strike carries no card entry, so the filter did not apply. EX damage now carries the suit of the card that completed the recipe; unit test.
- *The first-EX lesson covered the EX banner.* It now waits until the banner has faded.
- *Tools*: the acceptance scenario's first runs lost taps at battle start and raced the cancel window under parallel load; taps are now confirmed and the arte is queued two places back. A battle node with the Wild Signal trait (suits change on draw) legitimately broke the scripted same-suit sequence; the tool now picks a node without a suit-changing or Locking trait and records the trait.

**Still for human judgment:** whether players notice recipes, understand why one triggered from the banner, and find the Journal; whether the recipes change how they play or only reward what they already do; whether 4–7 banners per battle (10–18 in boss fights) feel like reward or noise; whether the first-EX lesson is enough; whether the builds feel different. No human has played 0.2.7, and no physical iPhone or iPad has run it.

## Version

Rule (`src/version.js`): `0.N.x`, where N is the highest roadmap phase whose exit gate has passed with evidence here; the patch number counts published builds with changes since that gate; `1.0.0` is the Phase 9 release. The title tagline, the "Patch Notes" event, `package.json` and the iOS project all show the same number (enforced by a test).

| Phase | Exit gate | Status |
|---|---|---|
| 0 | Every major system has a recorded implementation and verification status | Passed (this document) |
| 1 | Fresh run → Act I boss by ordinary play → mutation → Act II, state preserved through save/load | Passed (milestone runs 1–7) |
| 2 | Normal playthrough reaches the credits and returns to the main loop; victory and defeat resolve | Passed (2026-11-11): bot runs in English (1024×768, 43/43) and Russian (844×390, 49/49) each won all three acts by ordinary play: ending scene → credits → results → new run. The Russian run then lost a run (results screen and defeat dialogue) and started another |
| 3 | Four distinct build families demonstrated through play | Not passed (all bot runs ended as Momentum Burst) |

The table above follows the earlier roadmap. From 2026-11-13 the revised roadmap applies: the number keeps counting from 0.2, the minor number advances when one of the revised roadmap's phase gates is accepted (Phase 1 needs human playtesting for that), and the patch number counts published builds in between.

Current version: **0.2.7** (the beta-feedback patch and its follow-up, plus revised-roadmap Phase 3, shared party HP and individual Defense, Phase 4, basic attacks, artes, support and a persistent hand, Phase 5, the command queue, hero Recovery and Relays, Phase 6, Act I onboarding, Relay accessibility, Act I tuning and telegraphs, and Phase 7, EX Combo recipes, discovery and the Combo Journal; Phase 1 still waits for human playtesting, so the minor number stays at 2; earlier 0.2.0 passed the old Phase 2 gate). The previous build, 0.2.6, is commit `3fd8b6b` (source `0bfcf8f`).

## Not present in this build

These roadmap references have no counterpart in this repository:

- **"Junk Realm" setting.** The story here is set inside the fictional game itself (the Scrapworks, the Broken Protocol, the Severed Signal).
- **Earlier Replit project assets.** Nothing from it exists in this repo.
- **"Version 0.3.1"** was in-story flavor text in the title tagline, not a real version, and `package.json` said 1.0.0. Both now carry the real version (0.1.0, then 0.1.1, 0.1.2 and 0.2.0), defined by roadmap gates (see "Version" above).

## Content inventory

| Component | Roadmap target | This build |
|---|---|---|
| Acts | 3 | 3 |
| Heroes | 3 | 3 |
| Normal enemies | 12–18 | 12 (+1 summon) |
| Elites | 6 | 6 |
| Bosses | 3 + up to 3 alternatives | 6 (2 per act, one chosen per run) |
| Playable cards | 75–100 | 80 (25 basic attacks, 42 artes, 13 support; 4 of them kept for older decks but not offered) + 1 withheld (Pressure Valve) |
| Relics | 30–45 | 39 (incl. 5 boss trophies) |
| Events | 12–18 | 21 |
| Build families | ≥ 4 | 10 (each with a passing signature test) |
| EX Combo recipes | 12–16 (Phase 7) | 15 (every build has at least one; all reached through legal play in `tools/recipelab.mjs`) |
| Starting relics | 4 with unlocks | 4 with unlocks |

## Known risks

- Balance is tuned against bots only; no human playtest data yet.
- EX Combo frequency and value are tuned against bots only: whether 4–7 banners per battle (10–18 in boss fights) read as reward or noise, and whether players change their play for recipes, is unmeasured.
- No test on a physical iPad, iPhone or Safari; Chromium only.
- Audio has never been heard.
- Mid-battle saves restart the fight rather than resuming mid-combo.
