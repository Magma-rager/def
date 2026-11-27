# Phase 10 presentation

## Baseline

Magma-rager/def on `claude/adoring-newton-e9l4sf`, version 0.2.9, source `c26a13c` and
distribution `a606264`. The clean remote tip matched the Phase 9 distribution. The local
`checkpoint/phase-9-0.2.9` ref and archived checkout preserve the baseline. A clean install,
261 automated tests, web/Swift Playgrounds build, and ZIP integrity check passed. Data contained
81 playable cards, 39 relics, 25 enemies, six bosses, 15 recipes, ten builds, ten starting relics,
and 27 achievements.

I inspected the existing game's procedural silhouettes, three environments, and phone combat
fixture. Bilingual card-fit measurements reproduced the documented 6.4 CSS px minimum in Russian.
The 667×375 boss capture showed a three-recipe EX event covering part of the adaptation panel,
with the adaptation introduction and EX feedback taking the middle of the field. The hand used
57 px wide cards because the vertically stacked action cluster took 176 px.

The rigs already give the three heroes different weapons and silhouettes. Many mechanically
different actions use one of the same melee, cast, shoot, guard or buff clips. The renderer used
predicted target positions and its own impact-delay queue, with enemy hits rendered later than
their mechanical outcomes. Existing audio is local WebAudio synthesis, with shared cue families
and some high-amplitude overlapping voices. The code already contained music per Act. Reduced
Motion disabled camera movement but still rendered full-screen flashes, particles, and some
Canvas movement. The Museum and long lists already had functioning progression logic.

## Presentation delivered

Phase 10 keeps the rig silhouettes, original illustrated components, Canvas renderer and
synthesized audio. Three perspective floor treatments extend the Act backgrounds: warm riveted
platework, archive circuit traces and red core-pressure lanes. Fight, dialogue, title, results,
boss preparation, starter selection and Museum surfaces use the same enamel, brass and signal
plates. Combat type emphasizes effect, ownership, rank and cost. On the compact hand the full
illustration, graft name and recut history can be read by holding the card. Its live rank, suit,
cost, effect and current restriction are directly visible. The new dialogue type treatment uses
speaker accents and roles. Text reveals faster, or all at once with Reduced Motion. Speaker,
choices, branches and endings still use the existing story data.

| Performer | Examples of new choreography |
|---|---|
| Hessa | Drops her centre of gravity and drives through the hammer in Fortress Slam. Sunderline leads with a longer two-handed sweep and a cutting trace. Defensive Artes plant the feet, turn the shield and throw a plated arc. |
| Corvin | Gathers energy at his instrument, opens a lattice for the cast and releases it with a visible recoil. Pressure Valve vents in a narrow line. Suit Storm fans out in crossing lanes. Support lifts the instrument toward the party and draws the benefit at its recipient. |
| Pin | Braces and recoils in Bolt Volley. Grand Relay pivots, fans out and resolves into a pointed beam. Recoil, magazine movement and reset distinguish his shots and recovery from Corvin's sustained casts. |
| Shared | Hero-specific idle cadence and finish, paired Relay send and catch, hurt and stagger, and differentiated victory and defeat poses. Basics vary with hero and rank. Similar actions share clips, with card-specific pose, shape and sound choices for the distinctive Artes. |

The six bosses have separate movement and sound signatures. Clockwork Regent winds driven
dials, Scrap Tyrant braces through a piston frame, Protocol Auditor sweeps a scanning aperture,
Mirror Array fans and rotates discrete shards, the Corruptor tears and offsets its signal, and
the Core pulses concentric rings around its eye. Wind-up, contact, hit, interruption,
phase and shutdown have state-specific feedback. The other foes reuse their original bodies
with class-specific movement such as pounce, skitter, dive, brace, press and antenna motion,
plus individual signal colours, effects and motifs. Boss recipes, summon limits, timing and
counterplay retain their existing definitions.

Every EX recipe has its own effect signature and note pattern. Examples include the stair
outline of Straight Circuit, the split crossing of Cross Current, the mend rings of Healing
Cadence, and the concentric modulation of Final Harmonic. Compact recipe results group
consecutive activations into one rail. The rail reports names and aggregate applied effects
and keeps the details available after the initial highlight. Its detail panel contains each
recipe's sequence, individual impact and discovery status. The boss adaptation panel, incoming
indicators, party state and controls have their own bounds. Discordant full-field cut-ins and an
adaptation announcement on top of the panel were replaced by local reactions and the panel
itself. No recipe effects or discoveries depend on viewing the rail.

### Before and after

- [Same 667×375 Russian boss fixture](phase10/phone-ex-before-after.jpg), with three simultaneous EX results. The relocated rail leaves the adaptation name, rule, progress and party HP visible.
- [Timed contact sheet for each hero](phase10/hero-motion-contact.jpg), from the playable renderer. Actual scheduler events accompany the recorded frames.
- [All six boss signatures](phase10/boss-signatures.jpg), with phase contact above each wind-up.

Chromium checked 81 playable cards plus Glitch, both base and upgraded with Anchored, in both
languages across 667×375, 740×360, 732×510, 844×390, 932×430, 1024×768, 1194×834 and 1366×1024.
The compact 667×375 hand increased card width from 57 to 86 px. Effect and restriction text
measured at least **12 CSS px** in all 16 locale/viewport configurations, with no measured
clipping in the test. Compact names measured 13 px. On the 1024×768 layout an unusually long
Russian card name could fit at 11.25 px; its effect remained 12 px. The Reserve/next-card
preview and other secondary labels retain smaller type. All six compact hand slots and the
lower action rail stay on screen. Enlarging the deck at 740×360 leaves a 141 px battlefield,
the smallest field in this sweep. This is a measurable layout tradeoff. Physical readability
and touch comfort still require device testing.

The Museum presents eight consistent destinations, grouped across two rows at phone widths.
Progressive disclosure keeps detailed requirements, build proof, run records and journal
sequences in their respective pages. Achievement meters use the existing authoritative
progress value. Starter options show eligibility and leave the confirm and cancel buttons
available during scrolling. The results progression groups continue to reflect the recorded
run. EN tablet and RU phone starter/Museum checks passed keyboard selection, achievement
filters and the locked/earned states. Real taps, holds, swipes and keyboard actions were used
in the related Playwright suites.

## Timing, audio and reduced effects

The engine emits the existing start and end timing with the action and publishes
`execResolve` at the scheduler's existing resolve point. The presentation fits the release
pose to that point. Contact is drawn from the rig to the resolved recipient, or on the actual
recipient alone when no source applies. Damage numbers, hurt reactions and impact audio come
from `hit` and `partyHit`. A trajectory shows a fast afterimage of a completed contact over
several frames. It cannot hit or apply damage independently. Commands cancelled before
execution produce no strike. The struck target is chosen by the engine at execution. Each
affected hero in an area attack receives their own actual reaction. The EX cue consumes the
recipe identity and applied outcome. The battle advances on the original scheduler while
these reactions play.

Reviewed captures use the scheduler for Fortress Slam, Sunderline, Pressure Valve, Suit
Storm, Bolt Volley and Grand Relay. The motion tool steps five 60 Hz frames between samples,
records each command's start, resolve, hit and end and captures its playable scene. Other
controlled captures traverse 25 enemy designs, six boss phase entries and 15 recipe cues.
Those fixtures supply staging state or a resolved recipe event to the exact rendering path.
The ordinary campaigns independently verify legal acquisition, execution, progress,
reloading, victory and starting a subsequent run.

The WebAudio engine uses per-hero attack timbres, distinct incoming and defensive cues,
all 15 EX motifs and short contact signals. Three Act tracks were extended with six
boss-specific variations and phase accents. The mixer uses a compressor, a headroom gain
and explicit startup mute. Waveforms were rendered with the real audio implementation at
24 kHz. Across 30 renders, maximum peak was 0.1665, the stress mix reached 0.1546, no sample
clipped, and the muted output was exactly zero. The browser resumed its live audio context
through a user gesture. These measurements establish signal, headroom and mute behavior.
Direct audible quality, comfort and loudness perception are unverified.

The browser's system preference and the game setting both engage Reduced Motion. It removes
the broad flashes, shake, drift, zoom and particle ejections and retains steady local
markers, names, intent and progress. The browser exercised rotation pause, the in-combat EX
detail control and a reload with saved mute enabled. Settings remain independent of account
progress.

## Verification

| Check | Evidence |
|---|---|
| Automated suite | 265/265. Four new tests cover cue catalogues, bilingual effect placeholders, resolved target and sound timing, cancellation and reduced-motion contact. |
| Opening pacing | Baseline and Phase 10 JSON are byte-identical across `node tools/pacing.mjs 60 --act1 --pace=2.5 --relay=active --json`. Includes learner decision timing, active Relay, enemy pressure, survivability and downtime. |
| Real selection and execution | Targeting 36/36. Phase 6 RU tutorial and controls 32/32. Phase 7 EX and Journal 47/47 in each language. Phase 8 techniques/rewards/adaptation 51/51. |
| Ordinary campaigns | EN 1180×820: 16/16, score 1400, 16 fights, Clockwork Regent, Protocol Auditor and Signalbreak Core. RU 844×390: 16/16, score 1600, 16 fights, Scrap Tyrant, Protocol Auditor and the Corruptor. Both saved/reloaded between Acts, played the ending and credits, recorded victory once and began another standard run with an earned starter. No recovery intervention or page error was recorded in either completed campaign. |
| Progression and migration | Historical RU 6/6 using genuine Phase 8 files. Finalization recovery 3/3. RU small phone and EN tablet Museum/loadout layout 13/13 each. RU Phase 9 interface rerun 23/23 for defeat, summons, collection, reload and abandonment. |
| Language | 536 keys checked, zero missing; bilingual card geometry, two ordinary campaigns and menu checks. Original story data remains the source. |
| Historical controls | Phase 4 reproduces the same eight failures on the immutable Phase 9 baseline and on the Phase 10 checkout. The suite remains intact. A Phase 5 interval sampled enemy ATB over a legitimate reset in one run, and the Phase 9 comparison had a separate queue-cancel race. The final Phase 5 run passed 33/33 without harness changes. |

Corrections during verification included a missing enemy drawing bound, a clipped Russian
restriction footer, and a moving card's initial touch target. The last bug caused a legitimate
opening attack in the Phase 9 summon exercise to be missed. The deal animation now fades into
an already stationary input target. The same check then produced two Shards through ordinary
battle input. The broad historical locale sweep was updated only to clear the relocated EX
rail between fixtures. Its inspection logic and older gameplay assertions were retained.

### Reproduce

Run `npm ci`, `npm test` and `npm run serve`. Use Playwright and a compatible Chromium for
the following. Set `SB_URL` to a separately served Phase 9 checkout for the first gallery
capture, then run the same command against Phase 10.

```text
node tools/presentation.mjs gallery OUTPUT
node tools/presentation.mjs layout OUTPUT
node tools/presentation.mjs motion OUTPUT
node tools/presentation.mjs roster OUTPUT
node tools/presentation.mjs audio OUTPUT
node tools/presentation.mjs access OUTPUT
node tools/pacing.mjs 60 --act1 --pace=2.5 --relay=active --json
node tools/targeting.mjs
node tools/accept6.mjs ru 844 390 OUTPUT --part=a
node tools/accept7.mjs en 844 390 OUTPUT
node tools/accept7.mjs ru 844 390 OUTPUT
node tools/accept8.mjs ui en 844 390 OUTPUT
node tools/accept8.mjs campaign en 1180 820 OUTPUT
node tools/accept8.mjs campaign ru 844 390 OUTPUT
node tools/accept9.mjs historical ru 844 390 OUTPUT
node tools/accept9.mjs recovery en 844 390 OUTPUT
node tools/accept9.mjs layout ru 667 375 OUTPUT
node tools/accept9.mjs layout en 1194 834 OUTPUT
node tools/accept9.mjs ui ru 844 390 OUTPUT
npm run build:ios
node tools/pwa.mjs OUTPUT
PWA_PATH=/signalbreak/ node tools/pwa.mjs OUTPUT
```

## Remaining evidence and next phase

No rules, reward values or card pool changes were made for Reserve or Churn. Reserve's
early acquisition reliability, Churn's effectiveness, broad build balance and further
content and encounter work belong to Phase 11. Existing tiny secondary markers and very
short landscape layouts warrant checking on real hardware. Native iPhone/iPad use and audio
listening still lack direct verification. Human judgments about legibility, expressiveness,
pace and sound remain for the scheduled final beta.

Claude's prior work produced the game's recognizable original silhouettes, combat language,
Canvas pipeline and campaign-wide presentation. Phase 10 demonstrates an extension of those
assets across the roster, reliable event-level timing and a more legible combat composition
at small sizes. The resulting style owes much to the prior rigs and artwork. These outcomes
show creative and integration capability within the established game. They provide no
independent comparison of original character art, perceived musical quality or human-rated
artistic quality.
