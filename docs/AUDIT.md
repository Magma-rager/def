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
| Party HP/KO, stand-in rule when only downed heroes own a role, defeat | `combat.js` | Working | U (combat), S, P |
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

## Version

Rule (`src/version.js`): `0.N.x`, where N is the highest roadmap phase whose exit gate has passed with evidence here; the patch number counts published builds with changes since that gate; `1.0.0` is the Phase 9 release. The title tagline, the "Patch Notes" event, `package.json` and the iOS project all show the same number (enforced by a test).

| Phase | Exit gate | Status |
|---|---|---|
| 0 | Every major system has a recorded implementation and verification status | Passed (this document) |
| 1 | Fresh run → Act I boss by ordinary play → mutation → Act II, state preserved through save/load | Passed (milestone runs 1–7) |
| 2 | Normal playthrough reaches the credits and returns to the main loop; victory and defeat resolve | Passed (2026-11-11): bot runs in English (1024×768, 43/43) and Russian (844×390, 49/49) each won all three acts by ordinary play: ending scene → credits → results → new run. The Russian run then lost a run (results screen and defeat dialogue) and started another |
| 3 | Four distinct build families demonstrated through play | Not passed (all bot runs ended as Momentum Burst) |

The table above follows the earlier roadmap. From 2026-11-13 the revised roadmap applies: the number keeps counting from 0.2, the minor number advances when one of the revised roadmap's phase gates is accepted (Phase 1 needs human playtesting for that), and the patch number counts published builds in between.

Current version: **0.2.1** (the beta-feedback patch, implemented and ready for testing; earlier 0.2.0 passed the old Phase 2 gate).

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
| Playable cards | 75–100 | 78 |
| Relics | 30–45 | 39 (incl. 5 boss trophies) |
| Events | 12–18 | 21 |
| Build families | ≥ 4 | 10 (each with a passing signature test) |
| Starting relics | 4 with unlocks | 4 with unlocks |

## Known risks

- Balance is tuned against bots only; no human playtest data yet.
- No test on a physical iPad, iPhone or Safari; Chromium only.
- Audio has never been heard.
- Mid-battle saves restart the fight rather than resuming mid-combo.
