# Development commands and build outputs

Use Node.js 24. [AGENTS](../AGENTS.md) owns checks and release procedure.

## Commands

| Command                       | Purpose                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `npm ci`                      | Install locked dependencies                                         |
| `npm run check`               | Lint, format, strict product/tool type checks and dependency checks |
| `npm run lint`                | Lint source, tests and tools                                        |
| `npm run format`              | Format maintained files                                             |
| `npm run format:check`        | Check formatting                                                    |
| `npm run build`               | Clear dist, compile TypeScript, build tools and generate content    |
| `npm test`                    | All checks, build, startup smoke and driving scenarios              |
| `python3 -m http.server 8000` | Serve the checkout, game and tools                                  |

### Driving scenarios

`tests/scenarios/driving.test.mjs` defines the scenarios; `driving-harness.mjs` assembles the same
scene, race, vehicle physics, route readers, camera and rival sprite rendering as the browser, and prepares each
Session from a request through the browser's path (`prepareSession`: the Session admission, the products it needs from
delivery, and resolution).
The player is driven by the product's driver: an advance without input hands the player to its Session driver (the
driver of the takeover after GOAL), which plans, follows, passes and merges by the drivers' rules toward the
scenario's target exit at every fork. Policies that need other inputs script them: reverse, departure and the course
limit hold pedals and steering, and the closed-road and cone policies steer for a scripted lateral over their stretch.
`npm test` runs them on every CI build. After `npm run build`, use `npm run test:scenarios` alone.
The Node test runner reports total wall time and per-scenario times; these are observations, not timing gates.

Each scenario runs twice at the browser's fixed 1/60-second step and compares a digest of every
step's vehicle, recovery, progress and camera states plus outcome evidence. No pixel baselines or
wall-clock metrics enter the comparison. Rendering runs every simulated second, on recovery and finish,
and every tenth of a second outside the coordinate domain; it cycles through all three Strip methods.
All live vehicle numeric leaves, camera values and route occurrence coordinates/transforms must remain
finite. Each actor's s may move at most the loading coverage record's one-step allowance per step unless recovered.
The next pending crossing cannot move backward (an undiscovered fork successor is not a finish),
and accepted finish counts cannot decrease. Reverse starts at −20 m/s with neutral pedals (there is no reverse
input) and departures at 30 m/s: initial conditions through the ordinary vehicle constructor, with no pose or progress
edits during a run. In every row, rivals and traffic neither recover nor meet a wall or course limit (the race's step
observation names each vehicle a wall or course limit pushes); outside the reverse, departure, course limit and
closed-road policies, the player neither recovers nor meets one either. Leaving the pavement is not checked: a lane
change at speed can overshoot its lane a few centimetres off the pavement. Each row checks a situation no other row
does:

| Row (course)                                                 | Policy                                                                                                                                          | Passes when                                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reverse beyond entry (coast)                                 | neutral pedals from −20 m/s                                                                                                                     | the player backs beyond the entry and out of the coordinate domain, and recovery (`outside-domain`) returns it into the domain                                                  |
| departure right (coast, ring), departure left (fork)         | full lock and throttle for 20 s                                                                                                                 | the player leaves the pavement on that side, a wall or course limit pushes it (`limitContact`, from the race's step observation), and it neither recovers nor leaves the domain |
| course limit pushes back (coast)                             | steering −0.12 for 4 s, then its driver                                                                                                         | the left course limit pushes the player, which neither recovers nor leaves the domain, returns to the road and drives on above 20 m/s                                           |
| fork left finish, fork right finish (fork)                   | its driver, to exit 0 / 1                                                                                                                       | GOAL through the selected exit                                                                                                                                                  |
| closed Carriageway through player finish (fork)              | idle for 3 s while the rival locks exit 0, then the exit-1 road until recovery, then its driver                                                 | wrong-course recovery off the closed Carriageway (the seed's rival choice is checked), then GOAL; no actor's s jumps without recovery                                           |
| finished rival stops while player waits then finishes (fork) | as above, braking after recovery until the rival has stopped                                                                                    | the finished rival stays below 0.05 m/s for two seconds before the terminal, then the player reaches GOAL                                                                       |
| finish with rivals (coast, 1 lap; ring, 3 laps)              | its driver, two rivals                                                                                                                          | GOAL after the course's laps                                                                                                                                                    |
| through the cone row (coast)                                 | its driver, keeping to the lateral of the Route's first row of movable objects from 120 m before it until it has passed every object it knocked | every object of the row is knocked and landed, and the player drives on over them to GOAL                                                                                       |

Five rows cover Session rules. Their ARCADE settings come from a test-only series document,
`tests/scenarios/session-rules.series.json` (never delivered; the product RIBBON series is unchanged), with the
build's TESTAROSSA time budgets and pace schedules; RIBBON COAST's traffic row uses the delivered series. They add
`rules` evidence: outcome, cause, ending time, position, distance past the finish, player speed, rival travel after the
ending, and appearances and departures. After the ending, race time, progress, events and the position hold.

| Row (course)                                                          | Passes when                                                                                                                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARCADE finish ahead of a paced rival, then the takeover stops (coast) | from the player's own front slot ahead of a paced 911 rival (p = 1): GOAL at P1/2; over the 12 seconds after it the takeover stops the player within its runout and the rival keeps driving              |
| ARCADE with the RIBBON series traffic (coast, seed 7)                 | traffic appears and leaves the view, at most sixteen at once (its states join the digest and the `traffic` evidence); the outcome is open: traffic side by side can hold the lane-keeping player         |
| TIME TRIAL finish from the last slot (coast)                          | from the last grid slot, without rivals or clock: GOAL at P1/1                                                                                                                                           |
| ARCADE ahead entry appears and leaves (fork)                          | an entry in STAGE 2 only appears 80 m ahead of the player when it enters STAGE 2 and, while the player brakes after STAGE 2, leaves the view; absent, it is neither observed nor counted in the position |
| ARCADE rank limit GAME OVER (ring)                                    | `ring-CP1` is limited to rank 1 and the paced rival a slot ahead crosses it first: GAME OVER by RANK at that crossing's race time                                                                        |

To add a scenario, add a policy/outcome record to the course's list, with a finite simulated work limit.
Compose ordinary inputs in the harness, and require evidence that the intended situation occurred.
Use authored grid slots, fork intervals, Carriageways and crossing stations rather than world positions
or fixed ticks to locate course features.
When course shapes change, adapt these semantic targets and bounds instead of recording a new trace hash.
Expected results are compared between fresh runs, not committed as golden hashes. A defect regression
should fail when the original failure is temporarily reintroduced; never retain that mutation.
Visual correctness remains a manual check.

### TypeScript tools

Product and tool checking share `tsconfig.base.json`; `tsconfig.json` checks the browser product without
Node globals, and `tsconfig.tools.json` checks TypeScript tools with Node types and no emitted files.
Both roots use the same lint rules. `npm run check:dependencies` checks the boundaries described in
[Architecture](architecture.md#layer-boundaries); `check`, and so CI's `npm test`, runs it once.

Run a TypeScript tool with `node --import tsx tools/<domain>/<name>.ts`. The pinned loader resolves the
product's `.js` module specifiers to TypeScript source without a tool compilation directory; it does
not replace the strict `tsc` check. Measurement workers and tests consuming typed course helpers use the same loader.
Those tests import product source too, so a process has one module identity for compiled course objects.
Test files remain JavaScript. Authoring tools compile `content/` through the authoring core and never read `dist/`;
only checks of delivered results (startup smoke, driving scenarios, delivered-product tests and public-site
verification) read `dist/delivery` through `tools/course/read-content.ts`. Build clears `dist`, compiles the product, runs the browser-tools build
(`tools/build/build-browser-tools.ts`), then runs the content build (`tools/build/build-content.ts`).

All authoring implementations are TypeScript. Browser entries and worklet adapters are bundled from
source with pinned esbuild; bundling does not replace type checking. The browser build uses pngjs's
pinned browser distribution for the same PNG codec API used by Node file compilers.

### Course commands

The course commands compile the content through the authoring core and need no build: the named course document
stands in for the content course of its file name (or joins the content under it), and its images are read from
`--images` (by default the `images` directory beside its directory), then from `content/images/`. Vehicles, materials
and series come from the same compiled content.

```sh
npm run course -- compile content/courses/ribbon-coast.course.json
npm run course -- render content/courses/ribbon-coast.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/ribbon-coast.course.json --step 25 --out /tmp/course-report
node --import tsx tools/course/measure.ts request.json --out observations.json
```

`compile` reports the compiled course: its identity, type, entry Section, Sections, forks and ground metrics.
[Content and gameplay](content-and-gameplay.md#observation-formats) owns saved tool formats.
The render command uses the shared product scene; reports and preview images are disposable outputs.

### Measured products

The measurement tool writes the [measured products](content-and-gameplay.md#measured-products) under `content/` from
the content compiled by the authoring core; it never reads `dist/`:

```sh
npm run measure -- generate
npm run measure -- regenerate
npm run measure -- compare
npm run measure -- trace --vehicle TESTAROSSA --out /tmp/envelope.json
npm run measure -- trace --course ribbon-coast --vehicle TESTAROSSA --route 0 --out /tmp/reference.json
```

`generate` measures again only the envelopes and reference times whose identities are stale or that are absent, writes
them, removes saved products no catalog vehicle or series course owns, and prints what it measured with each changed
time (`before`, `after` and `difference` by gate and lap). `regenerate` measures and writes everything. `compare`
measures everything, writes nothing, and fails listing the files that would change; CI does not run it. `trace` writes
one complete envelope measurement, or with `--course` one reference run of a series course (route index and laps
optional), to a disposable file. Vehicles are measured in parallel on up to four workers.

### Browser tools

Run `npm run build`, then serve the repository root with `python3 -m http.server 8000`.
Open the generated pages, not the source HTML templates:

| Tool        | Local URL                                                    |
| ----------- | ------------------------------------------------------------ |
| Sprite Tool | `http://localhost:8000/dist/tools/graphics/sprite-tool.html` |
| LOD preview | `http://localhost:8000/dist/tools/graphics/sprite-lod.html`  |

On Pages these same `tools/...` paths live beneath `build/<commit>/`, where `<commit>` is the
published `version.txt` value. Each tool, its shared chunks, worklets, stylesheet and sample assets
resolve within that one build. The ordinary build command is the only generation step.

The file compilers are `npm run build:sprite-source -- <arguments>` and
`npm run build:sprite-lod -- <arguments>`; [Image assets](image-assets.md) owns their formats.

### Listening on devices

Sound settings are tuned by ear with `dev=1` in the game ([Browser](browser.md#sound-controls)).
On a device, check media volume and silent mode, then use SOUND START. Browser context state and audible
speaker output are separate observations. Record device/browser, scenario, settings and listening
findings with the change. [NEXT](NEXT.md) owns outstanding tuning and device work.

## Source-file conventions

Authored CourseDocuments and independent game assets live under `content/`. Reference videos,
extracted frames and pixel-bearing reference data stay in ignored `reference-media/` directories or
outside the checkout. This includes pixel arrays, masks and crops stored in JSON or other containers.
Only numeric observations, scalar calibration and source/edition descriptions are committed as
reference evidence. Product-renderer previews and reports are generated outputs.

## Build outputs

`dist/` contains compiled product ESM and bundled browser graphics/audio tools, not Node build-script output. `dist/delivery/` contains every delivered file
listed below and the content manifest. Product modules compile to `dist/<layer>/`, including the `content`
layer's modules in `dist/content/`; delivered files stay under `dist/delivery/` so modules and data never share a directory. Course JSON retains authored Strip constructs; the shared compiler expands them and builds immutable
preblend fields before browser driving or headless rendering. Expanded Strips and their knots are
in-memory compiler products, not committed files or an additional delivered image format. Build also delivers the
vehicle envelopes, game time budgets and pace schedules from the [measured products](#measured-products) saved under
`content/`; it runs no driving. Browsers load these products.

`dist/delivery/manifest.json` is the sole delivery index. Its own
`format: "superoutride.content-manifest", version: 1` identifies the index format; entries have only
`{kind, id, path, sha256}`. Every JSON file is delivered as compact JSON followed by a newline; vehicle
mechanics, vehicle listing, driving, material, surface-sound, wall-sound, audio, engine-sound, music, series and text tile documents are delivered exactly as authored in that
encoding, so the build knows their delivered digests before staging them. Recordings are not JSON: each is delivered
as the exact bytes its author placed under `content/`. Entries contain no payload
format/version. The manifest writer is the only authority for these kinds, IDs and paths under `dist/delivery/`:

| Kind              | ID                                                                                          | Path                                | Content                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `course`          | Course file name stem (the course selection key)                                            | `courses/<id>.course.json`          | Course document                                                                                              |
| `course-index`    | `courses`                                                                                   | `course-index.json`                 | Course index ([Content and gameplay](content-and-gameplay.md#course-index))                                  |
| `series`          | Series file name stem                                                                       | `series/<id>.series.json`           | Series document ([Content and gameplay](content-and-gameplay.md#series-documents))                           |
| `image`           | Image SHA-256, `vehicles` for the vehicle sprite library or `text-tiles` for the text tiles | `images/<sha256>.json`              | Compiled course images, the vehicle sprite library and the text tiles                                        |
| `vehicle`         | Vehicle ID                                                                                  | `vehicles/<id>.json`                | Vehicle mechanics document                                                                                   |
| `vehicle-listing` | Vehicle ID                                                                                  | `vehicle-listings/<id>.json`        | Vehicle listing document                                                                                     |
| `driving`         | `default`                                                                                   | `driving/<id>.json`                 | Game-wide driving definition                                                                                 |
| `material`        | `surface`                                                                                   | `materials/<id>.json`               | Surface-material document                                                                                    |
| `engine-sound`    | Sound ID                                                                                    | `engine-sounds/<id>.json`           | Engine-sound document ([Audio](audio.md#observations-and-engine-sounds))                                     |
| `surface-sound`   | `default`                                                                                   | `surface-sounds/<id>.json`          | Surface-sound document ([Tire audio](tire-audio.md#surface-sounds))                                          |
| `audio`           | `default`                                                                                   | `audio/<id>.json`                   | Game-wide sound settings ([Audio](audio.md#audio-document))                                                  |
| `free-play`       | `default`                                                                                   | `free-play/<id>.json`               | FREE PLAY rules ([Content and gameplay](content-and-gameplay.md#free-play-document))                         |
| `recording`       | `<group>/<name>`: `music/<id>`, `effects/<name>` or `impacts/<name>`                        | `recordings/<id>.m4a`               | Recording, AAC-LC in MP4 ([Audio](audio.md#recordings-and-music-documents))                                  |
| `music`           | Track ID                                                                                    | `music/<id>.json`                   | Music document ([Audio](audio.md#recordings-and-music-documents))                                            |
| `wall-sound`      | `default`                                                                                   | `wall-sounds/<id>.json`             | Wall-sound document ([Tire audio](tire-audio.md#wall-sounds))                                                |
| `envelope`        | Vehicle ID                                                                                  | `envelopes/<id>.json`               | Rival driving envelope (`superoutride.rival-envelope` v1: vehicle identity, maximum speed and measured rows) |
| `budget`          | `<course>/<vehicle>`                                                                        | `budgets/<course>/<vehicle>.json`   | Timed Session budgets (`superoutride.course-time-budgets` v1)                                                |
| `schedule`        | `<course>/<vehicle>`                                                                        | `schedules/<course>/<vehicle>.json` | ARCADE pace schedule (`superoutride.pace-schedule` v1)                                                       |

The manifest format ([`content-manifest.ts`](../src/content/content-manifest.ts)) admits the index through the
admission toolkit as document `manifest.json` (format and version first, exact fields, unique kind/id identities and
paths) and owns the delivered JSON encoding; it knows no transport. Delivery
([`content-delivery.ts`](../src/content/content-delivery.ts)) reads the index through it, resolves each logical
identity to its relative path, and verifies the exact downloaded/read bytes against SHA-256 before JSON decoding. The
build's manifest writer uses only the format. Missing entries
or digest mismatches stop loading. Loaders report expected content and build errors as one
`ContentLoadError` whose `diagnostics` keep their structure: the admission diagnostics of the loaded
documents, and for an absent manifest entry a `content_missing` diagnostic naming `manifest.json`, the
`contentKind` and the `id`. Its message is the diagnostics' JSON text. A digest mismatch means the
transported bytes are not the ones the build indexed, so it is an integrity failure thrown as `Error`;
transport and file-read failures propagate unchanged. Each composition loads the material catalog once
and passes it to the course and the Session vehicle. The manifest itself is the bootstrap index inside the commit-versioned
build; it cannot contain its own digest. Browser course selection reads the course index.

Only the manifest writer owns output naming. Browsers, Node consumers, startup smoke and public-site
verification read indexed content through the shared reader, never by reconstructing output paths.
Authoring inputs under `content/` still use explicit source filenames and image directories.
The browser-tools build writes only `dist/tools`: the bundled tools, the Sprite Tool's PNG example and
the LOD filter sample. The content build writes `dist/delivery` with the authoring core ([Architecture](architecture.md#layer-boundaries)):
`compileContent` reads `content/` through the Node content store and compiles every delivered file from authored
documents in one pass, in dependency order: the vehicle sprite library (compiled LOD and admitted), text tiles,
surface materials, surface sounds (resolved against those materials), wall sounds, audio settings, recordings and the
music documents (admitted against those recordings), FREE PLAY rules, engine sounds, vehicle and driving definitions
(admitted against that library and engine-sound catalog), courses (their solid walls admitted against the wall
sounds) and their images, the course index, then series (admitted against those courses and the vehicle catalog).
Each stage receives earlier products directly, and a course and its images are delivered only after the course
compiles. Last, the core admits the saved measured products against this content and delivers each catalog vehicle's
envelope, which FREE PLAY rivals and runout admission read, and for each series course its candidate vehicles' time
budgets (the saved times with the series' time margin) and pace schedules; only series courses are timed, since only
ARCADE has the clock and rival pace. A stale, absent or unowned saved product fails the build
([Measured products](content-and-gameplay.md#measured-products)). The build stages the returned files through the
manifest writer and saves the manifest.

| Output                        | Use                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `dist/delivery/manifest.json` | Delivery index and digest authority                                           |
| `dist/delivery/<path>`        | Each manifest entry above                                                     |
| `dist/authored/index.json`    | Index of the build's authored files (`superoutride.authored-index` version 1) |
| `dist/authored/<path>`        | Each authored file under `content/`, byte for byte                            |
| `_site/build/<commit>/`       | Complete commit-versioned Pages build                                         |
| `_site/version.txt`           | Published build identifier                                                    |

The build also publishes the documents it was built from, for the workbench: every file under `content/` that belongs
to the repository (tracked, or new and not ignored, as `git ls-files --cached --others --exclude-standard` lists them)
is copied to `dist/authored/` under its `content/` path, with `index.json` (`superoutride.authored-index` version 1:
the build's `commit` and each file's `path` and `sha256`, in path order). Readers take paths from the index, never from
a directory listing, and verify each file's bytes against its digest. The game never reads them, and the delivery and
its manifest are unchanged by them.

Dependencies, caches, dist, previews and Pages staging are generated rather than committed source.
Pages serves one complete commit-versioned ESM build, including its relative module URLs.
After `npm ci`, `node --import tsx tools/build/verify-published-site.ts <Pages URL> <commit>` checks the public
version, verifies every indexed payload through the manifest and starts the served game in headless Chrome with a URL
naming the course index's first course, so its run starts directly, and `dev=1`, whose performance HUD only rendered
frames fill: the check passes once it has text. `CHROME_BIN` selects a local Chromium executable.
