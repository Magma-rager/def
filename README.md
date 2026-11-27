# SIGNAL//BREAK

A single-player, real-time, party-based roguelite deckbuilding JRPG for landscape iPad and desktop browsers.

Granraku, a cynical trash-game hunter, enters a malfunctioning experimental card RPG and discovers that its "deprecated" **Relay** combat system is brilliant. Three heroes share one deck and one six-card hand. Combos of neutral basic attacks climbing into a hero's artes resolve in real time while enemies keep acting on their ATB bars.

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
  2. Create a service account (e.g. `signalbreak-uploader`) and give it the `storage.uploader` role on the folder: folder → Права доступа → Настроить доступ → type the account's name in «Кому выдать доступ» → Добавить роль → Сохранить. Then open the account and create a static access key. Copy both values with the copy buttons: the secret key is 40 characters and is shown only once.
  3. In GitHub: Settings → Secrets and variables → Actions → add secrets `MIRROR_KEY_ID` and `MIRROR_SECRET` (the key), and the variable `MIRROR_BUCKET` (the bucket name).
  4. Actions → Mirror web app → open the latest run → Re-run all jobs (later pushes upload by themselves). The run checks the key, opens the site after uploading and reports whether the game is live. The game is then at `https://<bucket>.website.yandexcloud.net/`; install it on the iPhone or iPad as in steps 2–3 above.

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

## Core rules (roadmap Phases 4–8: card categories, the command queue, Recovery, Relay, progressive lessons, EX Combos, techniques)

- **Learning:** the first battles teach the system with short lessons (one idea each) that appear when a mechanic becomes relevant — the first attack, ranks, artes, the queue, a Relay when another hero can usefully take over, Recovery, support, Churn, Reserve, interference — and pause the battle while open. "Skip all tips" turns them off; Settings → Replay tutorial hints shows them again; How to Play lists them all. Hold an enemy to read its next move with the damage each hero would take after Defense.

- **Hand:** six persistent slots, shared by Hessa (Vanguard), Corvin (Channeler) and Pin (Striker). Only the card you play, Churn or stash is replaced, from the top of the draw pile; **NEXT CARD** beside the hand shows that top card (it is never drawn just by being shown). When the draw pile is empty the discard pile is shuffled in. Card instances keep their identity across every zone (draw, hand, Reserve, queue, discard, exhaust).
- **Cards:** **basic attacks** (Weak 1, Medium 2, Strong 3) belong to no one and are performed by the attacking hero; **artes** (ranks 4–6) belong to one hero, cost Momentum (2/3/4) and need a basic attack earlier in that hero's part of the combo; **support** cards (no rank) heal, guard or help, cost 0–2 Momentum and can be played any time — even during another hero's combo — at the cost of the performer's action. Choose who starts a combo with the buttons above the hand, by tapping a hero, or with Q/W/E; a ★ on a button means that hero has an arte in hand.
- **Queue:** tapping a card commits it: it executes over 0.6s (its effect lands mid-animation) while you keep choosing; up to three commands wait in order behind it, shown beside the combo, each leaving a placeholder in its hand slot until it resolves. Tap a waiting command (or its placeholder, or Backspace) to take it back; its Momentum reservation is returned. Started commands always complete.
- **Heroes:** each hero is Ready, Active (running the combo), Acting, Committed (waiting to act) or Recovering — 1.5s + 0.3s per card after their part of a combo, 2.0s after a support action — shown on their button and under their name plate. Enemies keep acting while heroes recover; the other heroes can act meanwhile.
- **EX Combos:** fifteen recipes made of things you already do — Weak, Medium, Strong and then an arte by one hero; two Crosses before an arte; a same-suit arte on each side of a Relay; Hessa's Cover during Corvin's combo; a quick Cash Out after a suit change; a rank-6 arte in a three-hero combo of six cards — recognised from the commands that actually executed, once per combo, with a modest bonus (a strike, Guard, Momentum, Flow, a Churn charge, an Echo…). The first time each one happens it is discovered: a banner names it and the Museum's **Combo Journal** records it, with its sequence and effect; undiscovered recipes work too, and the Journal shows them as hints.
- **Relay:** during a combo, tap another Ready hero (marked ⇄) to queue a Relay. When it executes, the attacking hero recovers and the new one continues the same combo from rank 0 (a basic attack first); the combo's cards, damage, Steps and Crosses carry on. +1 Momentum, the new hero's first attack +10% per Relay so far, and the decision window holds 1.2s. Each hero joins a combo once (three heroes, two Relays at most). Playing another hero's card never creates a Relay.
- **Techniques:** four support cards (Rethread, Prism Cut, Downshift, Cache Hook) a free ally performs inside your combo after at least one card: they lower the combo's rank, so the attacking hero can follow with another arte; Prism Cut also turns the suit to EX so the next A or B card Crosses, Downshift adds Flow, Cache Hook is stronger from the Reserve. They never change cards already played and are cancelled if the combo ends first.
- **Sequence:** within a combo every attack needs a higher rank; skipping ranks is legal and suits never block a card. Exactly +1 rank is a **Step**; a different suit from the last card is a **Cross** (+1 Momentum); one card can be both. **EX** differs from A and B.
- **Flow:** the first attack starts a 5s decision window. It holds while any command executes, for 1.2s after the first card, after each Relay and after the incoming hero's first card, and while paused, so it only counts down while you are choosing. Each valid card refunds 1.0s when it lands, up to 5s per combo. Momentum can buy +1.5s. A combo lasts at most 14s of counted time. If Flow expires after a basic attack the combo is **Dropped** (−2 Momentum); after an arte it counts as a Perfect. Wrong cards cost a **Stumble** (−0.4s, −1 Momentum; three end the combo).
- **Pacing:** enemy ATB runs at 70% speed in Act I, 82% in Act II and 90% in Act III, including while your commands execute and your heroes recover. Two enemy actions are always at least 1.2s apart. After each combo comes a breather (0.8–1.2s) in which enemies wait while the hand refills. Optional **Tactical timing** (Settings): while a combo is open and nothing is executing or queued, enemies fill their bars at 25% speed.
- **Momentum:** Weak and Medium basic attacks +1, Strong +2, Cross +1, Relay +1, Perfect +2, gained when the command resolves. A committed card reserves its cost (legality uses the unreserved amount, never gains still on their way), spends it when it starts executing, and a cancelled one releases it and gains nothing. Cap 10 (+ relics/mutations).
- **Endings:** an arte at the end makes the combo a **Perfect** (+2 Momentum, +1 Churn charge, Finisher cut-in at 5+ cards or a rank-6 arte): after an arte the button reads **FINISH**; the combo ends by itself only when no higher arte is playable and every hero has already joined it. **Cash Out** ends a combo of 2+ cards whose last card is a basic attack, for a payout scaled by length and highest rank (+25% with 2.5s+ Flow left). Both are queued behind waiting commands and judged on what has executed.
- **Echo:** Echoes repeat earlier cards' damage, Guard, healing and statuses at reduced power. They never repeat Flow, Momentum, rank or suit changes, Relays or other Echoes. Relay Echoes (Echo Splice, Relay Resonance, Mirror Wire, Hand Off) repeat the outgoing hero's last attack.
- **Churn:** charges (3, refilling over time) replace a hand card. Churning costs 0.3s of Flow mid-combo, or advances enemy ATB by 5% before a combo starts (the enemy bars flash when it happens).
- **Targets:** attacks hit the enemy in gold brackets (TARGET) at the moment they execute; tap an enemy or the ⌖ chip above the hand to switch. When the target falls, the next enemy is picked and labeled NEW TARGET, including for attacks still waiting in the queue. A red ring under a hero, with ▼ and the damage by their name, marks who an enemy is about to hit.
- **Party HP, Defense, Cover:** the three heroes share one HP pool (130 at the start of a run; it carries over between battles). The battle is lost when it reaches 0; no hero is ever knocked out. Each hero has a Defense percentage applied to hits aimed at them before the shared Guard: Hessa 30%, Pin 15%, Corvin 0% (minimum 1 damage per hit). An attack on every hero applies each hero's Defense to their share and Guard once to the total. When Hessa resolves one of her Guard cards (their text ends with "Cover."), she covers the party for 4s: single-target hits aimed at Corvin or Pin land on her and use her Defense. The red-ring number already includes Defense and moves to Hessa under Cover.
- **Reserve:** 2 slots. Stashed cards can be played whenever they are legal, under the same rules and costs as hand cards; the stashed card's hand slot refills at once.
- **Enemy interference:** Locks (3s, with visible source and countdown), Scrambles, jammed slots, Churn snares, Reserve latches, Flow drain, Glitch cards and Citations. All of them are timed and expire on combat time; pausing freezes them.

## Content

- 81 playable cards (24 basic attacks, 40 artes, 17 support, four of them techniques) plus Glitch, with A/B/EX suits, upgrades, rarities and 10 graft types; Phase 8 completed the catalogue (no card is withheld or kept as a compatibility stub).
- 39 relics (including 5 boss trophies), 12 mutations, 21 events (every one checked by behaviour in tests), 6 route traits (HOTWIRE, STATIC, QUIET_CHANNEL, SCRAP_CACHE, BLACKOUT, WILD_SIGNAL).
- 12 normal enemies (+1 summon), 6 elites, 6 bosses (two per Act, each with phase changes), and adaptive boss counter-strategies driven by current-run evidence.
- Three Acts (The Scrapworks, The Broken Protocol, The Severed Signal) with branching 8-depth maps, shops, rests, surgery, caches, boss preparation (Prepared / Volatile) and mutations.
- Persistent Museum: run history, bestiary, relic and card catalogues, the Combo Journal of discovered EX Combos, records, and modest starter-relic unlocks.

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

The version follows the development roadmap. The title screen and Patch Notes show the current build.

- `0.N.x`: N is the highest roadmap phase whose exit gate has passed, with the evidence recorded in `docs/AUDIT.md`.
- `0.N.P`: P counts published builds with changes since that gate.
- `1.0.0`: the eventual release after the revised roadmap and final beta.

Current: **0.2.10**. Phase 10 updates combat choreography and sound, separates EX results from the battlefield, and reflows the hand for larger readable text. See [the Phase 10 report](docs/PHASE10.md) for visual and gameplay evidence, [the Phase 9 report](docs/PHASE9.md) for permanent progression and [the development audit](docs/AUDIT.md) for earlier work. The version comes from `src/version.js`, and tests enforce that the package and iOS project match. The title menu shows the build date and source commit. The next human beta follows completion of the revised roadmap through Phase 12.

## Verification tools

Phase 10 captures and checks use `node tools/presentation.mjs gallery|layout|motion|roster|audio|access OUTPUT` against the local development server with Playwright and Chromium.

- `node tools/simulate.mjs [runs] [reactionSeconds] [profile] [--ex]` runs complete runs through all three Acts with a heuristic bot. It checks zone integrity and save round-trips at every step, and reports win rates, battle durations, HP loss and EX Combo activations by recipe, encounter and build. `--ex` plays the recipe-aware policy; `SB_EX=off` measures without recipes.
- `node tools/simulate.mjs … --build=each|<tag> [--tactics]` (Phase 8) plays build-focused campaigns: each run targets an archetype and acquires only through the ordinary offers; reports cards of the target held, its own mechanic per battle against the all-build average, pace, EX and own recipes, deck progression and boss adaptations. `SB_DECKS=<file>` writes each deck as it reaches a boss (for recipelab and buildlab), `SB_SEED0` shifts the seeds, `SB_PROFILE_DUMP=1` prints the boss evidence.
- `node tools/recipelab.mjs [decks] [reaction] [--natural=<file>]` (Phase 7, layers in Phase 8): A drafted decks, B natural decks from simulate, C ordinary vs recipe-aware, D by encounter kind; EX per battle, per chain and per opportunity (chains that carried the build).
- `node tools/buildlab.mjs [decks] [reaction] [--natural=<file>]` (Phase 8) measures the Suit Switching, Churn, Momentum and Interference investigations (suit mix, Crosses, drawn cards played after a Churn, Momentum spent per arte, results by enemy interference type).
- `node tools/accept8.mjs ui|runs|campaign …` is the Phase 8 acceptance demonstration: techniques, Pressure Valve, a boss adaptation broken by play, relics, a mutation into Act II, shop, surgery and event through taps (ui); four or more build families through ordinary headless campaigns (runs); a full three-Act run through the interface to the Museum and a new run (campaign).
- `node tools/accept7.mjs [lang] [w] [h] [outDir]` is the Phase 7 acceptance demonstration: EX Combos performed through taps (a single-hero recipe and its discovery, a Relay recipe, two recipes on one arte, a cancelled and recommitted arte), the Combo Journal, a reload, a new run and a restarted encounter.
- `node tools/uiplay.mjs [w] [h] [minutes]` plays the game only through DOM taps and clicks in Chromium, from the title screen to the results screen.
- `node tools/i18n-layout.mjs [outDir] [lang] [viewports]` opens every screen, modal, event, card and boss-preparation layout in a language and reports clipped, truncated or off-screen text.
- `node tools/i18n-keys.mjs` lists interface keys missing from `ru.js`.
- `node tools/milestone.mjs [outDir] [minutes] [stopAtAct] [w] [h]` plays a fresh run through the UI only, reloads the page and presses Continue at every major transition (mid-battle, boss fights, boss reward, mutation, act entries, ending), checks the restored state is identical, and checks the Museum unlock in the next run. Needs the dev server on port 8123. Writes `report.json` and screenshots. See `docs/AUDIT.md`. `SB_LANG=ru` plays in Russian (switching from the title screen) and scans every screen and the battle canvas for untranslated words and clipped text; `SB_FLOW=defeat` continues into a pause-menu restart, a lost run and a new run.
- `node tools/flow.mjs`, `tools/screens.mjs` and `tools/bossfight.mjs` take screenshots of flows, screens, boss and interference visuals.
- `node tools/relaylab.mjs [battles] [--paces=…] [--policies=careful,active,none] [--quick]` times every Relay in the opening fights for players of different speeds and Relay habits (Flow at the Relay, time to the incoming basic attack and arte, drops by segment).
- `node tools/fightlab.mjs <fight> [battles] [--target=first|threat] [--hp=…] [--tactical] [--relay=…]` plays one fight (an elite, a boss or a formation) and attributes the damage taken to its source, with summons, enemy actions, Flow theft and support use; `--enemy=` changes an enemy for a controlled experiment.
- `node tools/accept6.mjs [lang] [w] [h] [outDir]` is the Phase 6 acceptance demonstration: a new player's first run through taps, holds and swipes — each lesson awaited before the action it explains — on through Act I into Act II with a reload, then the skip, replay and returning-player checks.
- `node tools/pacing.mjs [battles] [--act1]` plays the opening Act I encounters (and with `--act1` the later ones, elites and bosses) headless with a simulated learning player and a faster one, and reports enemy action frequency, Flow timeouts, combo length, damage and survival.
- `node tools/targeting.mjs [outDir]` checks targeting through touch taps in English and Russian at phone and tablet sizes: tap to target, the ⌖ chip, retargeting when the target dies, and the marker on the hero an enemy is about to hit.
- `node tools/party.mjs [outPrefix] [lang] [size]` checks the shared party HP on the battle screen through touch input: a Hessa Guard card starts Cover, the red ring and the hit move to her with her Defense, healing fills the pool, and the battle is lost when the pool reaches 0.
- `node tools/accept4.mjs [outDir] [lang] [WxH]` is the Phase 4 acceptance demonstration: one battle played only through taps and swipes (hero selection, a Weak and a higher basic attack, Hessa's arte, the Perfect and its breather, a support card, Churn, Reserve, the next-card preview, a second hero's arte, the win, a reward, save and Continue).
- `tools/lib/bot.mjs` is the player policy shared by `simulate`, `pacing` and the UI bots (`milestone`, `encounter`, `uiplay`); `tools/lib/uibot.mjs` performs its decisions as real taps and swipes.
- `node tools/encounter.mjs [outDir] [lang] [WxH]` plays ordinary post-tutorial fights in the real game with a slow player tapping the touchscreen (`SB_READ`, `SB_CARD` set its pace) and reports, per combat state, how much time passes, how far enemy ATB advances and when enemies act.
- `node tools/readability.mjs [lang] [sizes]` reports the rendered font size of every piece of card information in the battle hand, for every card, at the supported landscape sizes.
- `node tools/pwa.mjs [workDir]` checks the built web app as served from GitHub Pages (or, with `PWA_PATH=/name/`, from a bucket path like the storage mirror): first online launch, offline launches with a battle, and the update to a new build.

All art, animation, music and sound are generated procedurally in code; no external assets are used.
