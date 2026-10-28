# SIGNAL//BREAK

A single-player, real-time, party-based roguelite deckbuilding JRPG for landscape iPad and desktop browsers.

Granraku, a cynical trash-game hunter, enters a malfunctioning experimental card RPG and discovers that its "deprecated" **Relay** combat system is brilliant. Three heroes share one deck and one six-card hand. Opener → Converter → Closer sequences resolve in real time while enemies keep acting on their ATB bars.

## Play

- **Built game:** `dist/index.html` is self-contained (one HTML file with inline JS/CSS). Serve the `dist/` folder over HTTP to enable the offline service worker (`npm run serve` serves the repo root; `node tools/serve.mjs dist 8124` serves the build).
- **Development:** `npm run serve`, then open `http://localhost:8123/index.html`. This runs the ES-module sources directly; there is no build step for development.
- **Build:** `npm install && npm run build` writes `dist/index.html` (full PWA document), `dist/artifact.html` (page fragment for embedded hosting), `dist/sw.js`, the manifest and the icons (`node tools/render-icon.mjs` renders the PNG icons from `public/app-icon.svg`).
- **Tests:** `npm test` runs the engine, run-layer, systems and archetype tests (Node built-in test runner).

### iPhone / iPad web app (no App Store)

The game installs from Safari as a web app and then plays offline:

1. Open **https://magma-rager.github.io/def/** in Safari.
2. Share → **Add to Home Screen** (on iOS 26, keep **Open as Web App** on) → Add.
3. Open it once from the home screen while online and wait for **Available offline** under the title menu (a few seconds).
4. From then on it starts without a connection. New builds download in the background when online and are used from the next launch.

The home-screen app keeps its own saves, separate from Safari's. On a phone held upright the game asks to be turned sideways.

**Hosting.** No single address is reachable from every network, so the same build can be served from two places; after the first launch the game no longer needs either.

- **GitHub Pages** (most of the world; unreliable in Russia since May 2026 and in mainland China): Settings → Pages → Deploy from a branch, folder `/`. The root `index.html` sends github.io visitors to `dist/`, and `.nojekyll` makes Pages serve files unprocessed.
- **Storage mirror** (for networks where GitHub is slow or blocked, e.g. Russia): `.github/workflows/mirror.yml` uploads the web app files to an S3-compatible bucket whenever `dist/` changes. Set up once with Yandex Object Storage:
  1. In the Yandex Cloud console create a bucket (name without dots, e.g. `signalbreak-game`) with object reading and object listing open to everyone, and turn on Website hosting with `index.html` as the main page.
  2. Create a service account with the `storage.editor` role and a static access key for it.
  3. In GitHub: Settings → Secrets and variables → Actions → add secrets `MIRROR_KEY_ID` and `MIRROR_SECRET` (the key), and the variable `MIRROR_BUCKET` (the bucket name).
  4. Actions → Mirror web app → open the latest run → Re-run all jobs (later pushes upload by themselves). The run opens the site after uploading and reports whether the game is live. The game is then at `https://<bucket>.website.yandexcloud.net/`.

  Another S3-compatible provider works the same way with the variables `MIRROR_ENDPOINT` and `MIRROR_REGION`.

### iPad / iPhone App Store build (no Mac)

`npm run build:ios` writes `dist/ios/SignalBreak.swiftpm.zip`: a Swift Playgrounds app project that runs the game offline in a full-screen web view (fonts and saves included).

1. Create the app record in App Store Connect (web) with a bundle ID, e.g. `com.yourname.signalbreak`.
2. Copy the zip to the iPad (AirDrop, iCloud Drive or Files), unzip it, and open `SignalBreak.swiftpm` in Swift Playgrounds.
3. Tap Run to test on the iPad.
4. In App Settings set your Team and the same Bundle ID; the custom icon and Games category are preset.
5. Tap Upload to App Store Connect, then finish the listing and submit for review on the App Store Connect website.

`tools/asc-upload.mjs` uploads an existing `.ipa` from any OS through Apple's Build Upload API (`npm run upload:ios -- --ipa App.ipa --app-id … --version … --build … --key AuthKey.p8 --key-id … --issuer …`, `--dry-run` to preview).

### Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Play a card | Tap | `1`–`6` |
| Churn (cycle) a card | Swipe down | `Shift` + `1`–`6` |
| Stash to Reserve | Swipe up | `Alt` + `1`–`6` |
| Play from Reserve | Tap the Reserve card | `7` / `8` |
| Card details | Hold | — |
| Cash Out | CASH OUT button | `Space` |
| Spend Momentum | +FLOW / +GUARD | `F` / `G` |
| Target an enemy | Tap the enemy | `Tab` cycles |
| Pause (freezes all combat time) | ❚❚ | `Esc` / `P` |

## Core rules (Relay)

- **Hand:** six slots, shared by Hessa (Vanguard), Corvin (Channeler) and Pin (Striker). The hand is role-phased. Before a combo (PRE-COMBO) it holds Openers. Once a combo starts, Openers are tucked under the draw pile and the hand refills with Converters and Closers. When the combo ends it swaps back. Card instances keep their identity across every zone (draw, hand, Reserve, discard, exhaust).
- **Sequence:** each card needs a higher rank (1–9). Same suit (A→A, B→B): any higher rank (+1 exactly is a **Step**). Switching suit A↔B is a **Cross**: exactly +1, and it grants Momentum. **EX** fits anything. Converters can Rewind the rank or change the suit. A Closer needs at least one Converter before it.
- **Flow:** the first legal card starts a 3.0s window. Each valid continuation refunds 0.18s, up to 1.2s per combo. Momentum can buy +0.6s. A combo can never exceed 6.2s. If Flow expires, the combo is **Dropped** (−2 Momentum). An illegal card is a **Stumble** (−0.4s, −1 Momentum); a third stumble drops the combo.
- **Endings:** a Closer ending is a **Perfect** (+2 Momentum, +1 Churn charge, Finisher cut-in at 5+ cards or rank 9). **Cash Out** (2+ cards) ends the combo immediately for a payout scaled by length and rank, with +25% if 1.5s+ Flow remains, but gives up the Perfect bonus.
- **Relay & Echo:** a card owned by a different hero is a Relay: that hero acts, and you gain +1 Momentum. Echoes repeat earlier cards' damage, Guard, healing and statuses at reduced power. They never repeat Flow, Momentum, rank or suit changes, or other Echoes.
- **Churn:** charges (3, refilling over time) replace a hand card. Churning costs 0.3s of Flow mid-combo, or advances enemy ATB before a combo starts.
- **Reserve:** 2 slots. Stashed cards survive phase swaps and can be played whenever they are legal.
- **Enemy interference:** Locks (3s, with visible source and countdown), Scrambles, jammed slots, Churn snares, Reserve latches, Flow drain, Glitch cards and Citations. All of them are timed and expire on combat time; pausing freezes them.

## Content

- 78 cards (25 Openers, 27 Converters, 26 Closers) across three owners, with A/B/EX suits, upgrades, rarities and 10 graft types.
- 39 relics (including 5 boss trophies), 12 mutations, 21 events, 6 route traits (HOTWIRE, STATIC, QUIET_CHANNEL, SCRAP_CACHE, BLACKOUT, WILD_SIGNAL).
- 12 normal enemies (+1 summon), 6 elites, 6 bosses (two per Act, each with phase changes), and adaptive boss counter-strategies driven by current-run evidence.
- Three Acts (The Scrapworks, The Broken Protocol, The Severed Signal) with branching 8-depth maps, shops, rests, surgery, caches, boss preparation (Prepared / Volatile) and mutations.
- Persistent Museum: run history, bestiary, relic and card catalogues, records, and modest starter-relic unlocks.

## Architecture

```
src/core      seeded RNG, helpers
src/data      cards, relics, enemies (+AI), events, story, mutations, adaptations, traits
src/engine    combat.js (authoritative real-time Relay engine, no DOM)
              run.js (map, nodes, rewards, shop, events, bosses, mutations, save data)
              save.js (localStorage persistence, Museum records)
src/render    rig.js (FK character rigs + animation clips), enemyArt.js, backgrounds.js,
              battleView.js (actors, effects, camera, in-field HUD), icons.js, draw.js
src/ui        battleScreen.js (hand, gestures, controls, tutorial), screens.js, museum.js,
              cardView.js, scene.js, dom.js
src/audio     audio.js (WebAudio synth SFX + procedural music)
tools         build, dev server, headless full-run simulator, Playwright UI checks
```

The combat engine is the single source of truth. The UI asks `combat.check(uid)` for each card's legality and renders from engine state. Presentation consumes engine events and never decides mechanics. All timers use combat time, which advances only when unpaused.

## Languages

English and Russian. Switch on the title screen (top-left) or in Settings → Language; the choice is saved, and a first launch follows the browser's language.

- `src/i18n/index.js` looks text up, picks Russian plural forms, formats decimals ("1,5 с") and resolves ids in messages to names.
- `src/i18n/ru.js` holds every Russian string: interface text keyed by the English string used in `t('…')`, and content keyed by the ids in `src/data/*`. Terminology: `docs/GLOSSARY_RU.md`.
- The engine, run layer and save code never import `src/i18n`. They produce ids and message keys, so balance and saves are identical in both languages, and a run saved in one language continues in the other.
- Cyrillic comes from extra faces in the same font families (Fira Sans Extra Condensed for Barlow Condensed, Oswald for Big Shoulders Display, and Spectral's own Cyrillic), embedded in the build, so the game stays offline.
- Card names and texts that run long shrink to fit (`fitCard` in `src/ui/cardView.js`), and names may take a second line.

**Adding a language:** copy `src/i18n/ru.js` to `src/i18n/<code>.js`, translate the values (keep `{placeholders}`, and give plural groups as many forms as the language needs; `pluralIndex` in `index.js` decides which form is used), then register it in `DICTS` and `LANGS` in `src/i18n/index.js`. `npm test` lists anything untranslated, and `node tools/i18n-layout.mjs <outDir> <code>` reports clipped text on every screen at six viewports. Add font faces if the script needs them.

## Version

The version follows the development roadmap, and the title screen shows it ("Patched to version 0.1.2. Probably.").

- `0.N.x`: N is the highest roadmap phase whose exit gate has passed, with the evidence recorded in `docs/AUDIT.md`.
- `0.N.P`: P counts published builds with changes since that gate.
- `1.0.0`: the Phase 9 release.

Current: **0.1.2** (0.1.0 plus two published builds: the Russian localization, then the iPhone/iPad web app). Phase 0 (audit) and Phase 1 (Act I → Act II with saves) have passed. Phase 2's gate requires a playthrough to reach the credits, and the game has an ending scene but no credits yet. The number lives in `src/version.js`; `package.json` and the iOS project must match it, and a test enforces that. The line under the title menu shows the build date and source commit.

## Verification tools

- `node tools/simulate.mjs [runs] [reactionSeconds]` runs complete runs through all three Acts with a heuristic bot. It checks zone integrity and save round-trips at every step, and reports win rates, battle durations and HP loss.
- `node tools/uiplay.mjs [w] [h] [minutes]` plays the game only through DOM taps and clicks in Chromium, from the title screen to the results screen.
- `node tools/i18n-layout.mjs [outDir] [lang] [viewports]` opens every screen, modal, event, card and boss-preparation layout in a language and reports clipped, truncated or off-screen text.
- `node tools/i18n-keys.mjs` lists interface keys missing from `ru.js`.
- `node tools/milestone.mjs [outDir] [minutes] [stopAtAct] [w] [h]` plays a fresh run through the UI only, reloads the page and presses Continue at every major transition (mid-battle, boss fights, boss reward, mutation, act entries, ending), checks the restored state is identical, and checks the Museum unlock in the next run. Needs the dev server on port 8123. Writes `report.json` and screenshots. See `docs/AUDIT.md`. `SB_LANG=ru` plays in Russian (switching from the title screen) and scans every screen and the battle canvas for untranslated words and clipped text; `SB_FLOW=defeat` continues into a pause-menu restart, a lost run and a new run.
- `node tools/flow.mjs`, `tools/screens.mjs` and `tools/bossfight.mjs` take screenshots of flows, screens, boss and interference visuals.
- `node tools/pwa.mjs [workDir]` checks the built web app as served from GitHub Pages (or, with `PWA_PATH=/name/`, from a bucket path like the storage mirror): first online launch, offline launches with a battle, and the update to a new build.

All art, animation, music and sound are generated procedurally in code; no external assets are used.
