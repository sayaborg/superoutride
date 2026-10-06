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

The build and the command-line tools end an expected content or input error by printing its diagnostics as JSON alone
and exiting with code 1; only an internal fault prints a stack.

All authoring implementations are TypeScript. Browser entries and worklet adapters are bundled from
source with pinned esbuild; bundling does not replace type checking. The browser build uses pngjs's
pinned browser distribution for the same PNG codec API the sprite command uses in Node.

### Course commands

The course commands compile the content through the authoring core and need no build: the named course document
stands in for the content course of its file name (or joins the content under it), and its images are read from
`--images` (by default the `images` directory beside its directory), then from `content/images/`. Vehicles, materials
and series come from the same compiled content.

```sh
npm run course -- compile content/courses/ribbon-coast.course.json
npm run course -- render content/courses/ribbon-coast.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/ribbon-coast.course.json --step 25 --out /tmp/course-report
npm run course -- structure content/courses/ribbon-coast.course.json --section coast-wide
npm run course -- move content/courses/ribbon-coast.course.json --element /sections/0/sprites/0/elements/0 --ds 5 --step 0.5
npm run course -- set content/courses/ribbon-coast.course.json --values /sections/0/pis/1/radius=420 --out content/courses/ribbon-coast.course.json
node --import tsx tools/course/measure.ts request.json --out observations.json
```

`compile` reports the compiled course: its identity, type, entry Section, Sections, forks and ground metrics.
`structure` prints the document's form as JSON
([Course authoring operations](content-and-gameplay.md#course-authoring-operations)), read alone without compiling
the content, so a document that does not compile still shows; `--section` keeps one Section.
`set`, `move`, `add-pi` and `remove-pi` make the
[edits that keep form](content-and-gameplay.md#course-authoring-operations) on the document as saved (`--values` takes
`/pointer=number` pairs, `--element` an element's Pointer, `--section` a Section's and `--pi` a PI's), print the
changed values, and with `--out` write the edited document in the saved layout.
[Content and gameplay](content-and-gameplay.md#observation-formats) owns saved tool formats.
`report` and `render` write what two core functions in
[`course-views.ts`](../tools/authoring/course-views.ts) return from the compiled course: `courseReport` (a Section's
plan position, curvature, height and Boundary positions at regular and knot stations, its sprites, environments and
plan segments) and `createCourseFrameRenderer` (the game's logical frame in RGB555 through the shared product scene,
a vehicle at rest at `s` and `l`). The commands add the JSON, text and SVG files and the PNG; reports and preview
images are disposable outputs.

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
optional), to a disposable file. Vehicles are measured in parallel on up to four workers. The measurement itself
(which products are stale, the jobs, the saved files) is one implementation in
[`tools/authoring/measure.ts`](../tools/authoring/measure.ts), free of Node and the browser; the tool and the
workbench differ only in how they start workers and write files.

### Browser tools

Run `npm run build`, then serve the repository root with `python3 -m http.server 8000`.
Open the generated pages, not the source HTML templates:

| Tool      | Local URL                              |
| --------- | -------------------------------------- |
| Workbench | `http://localhost:8000/workbench.html` |

On Pages these same `tools/...` paths live beneath `build/<commit>/`, where `<commit>` is the
published `version.txt` value. Each tool, its shared chunks, worklets, stylesheet and sample assets
resolve within that one build. The ordinary build command is the only generation step.

### Workbench

The workbench has one address: `workbench.html` at the site root (on Pages beside `index.html`, locally the repository
root). Like the game, it reads `version.txt` and opens the workbench of that build,
`build/<commit>/tools/workbench/workbench.html`; without `version.txt` it opens `dist/tools/workbench/workbench.html`.
The game's DEV panel links to it. The page works on the build it belongs to: its store is that build's published
authored files ([Build outputs](#build-outputs)) under the session's changes, and the authoring core compiles it in a
worker, so the page never waits on a compile, and each compile reuses the unchanged stages of the one before
([Architecture](architecture.md#layer-boundaries)); an older compile's result never replaces a newer one's. The
worker also answers the page's course queries, a Section's report or a frame at a position (the course commands' core
functions), from the latest compile that succeeded; each answer carries that compile's step. The header
always shows the build's commit, the number of changes and the compile's state; a failed compile lists its
diagnostics (document, JSON Pointer, code and message) and keeps the last products that compiled, marked stale. The
products of the last compile are listed with their digests; both lists are in one panel under the module tabs, seen
from every module, which a newly failed compile opens. Modules are screens of the same page, each using the full width
below that panel; each receives only the store, the compile and the one edit. An edit in progress, a field being typed
or a drag, is the screen's alone until it is confirmed (Enter, leaving the field or releasing the pointer), which
replaces the document once: one step. Escape drops a drag.

Every edit is one step of the session's history: a document replaced (saved with `formatSavedJson`), a file's bytes set
or a file deleted. A file equal to the build's own is no change. Undo and redo (the header's buttons, Ctrl+Z,
Ctrl+Shift+Z or Ctrl+Y outside text fields) move through the history, which the workbench keeps: at most 200 steps and
128 MiB of distinct file versions, the oldest steps going first. The Changes module lists every changed, added and
deleted path with its difference from the build, each with a revert; it also sets a file's bytes from a file on disk
and deletes a file by path.

The workbench keeps nothing in the browser. **Save archive** downloads one stored (uncompressed) zip: each changed or
added file at its `content/` path, and `workbench-changes.json` (`superoutride.workbench-changes` version 1: the
build's `commit` and, for each changed path, the digest it had in that build, `null` for an added file, and whether it
is deleted). **Open archive** restores the changes as one step. When the archive was made on another build and a file
it changes was changed by this build too, the workbench names the file and asks which version to keep; it never merges.
Leaving the page with unsaved changes asks first.

The Documents module is the one view of every kind of document. It lists the store's files by directory, marking
changed files and files with diagnostics, and shows a document's JSON tree: numbers, strings, booleans and null are
edited in place, confirmed with Enter or by leaving the field (text that is not a value stays in the field and is not
saved), and an RGB555 color field shows its color. Adding, removing and reordering entries edit a container's JSON
text, shown in the saved layout. Each confirmed edit replaces the document, one step, and compiles. Diagnostics show at
their JSON Pointer, or at the nearest existing parent with the pointer named; choosing a diagnostic in the list opens
its document there. Containers open on demand, a long one 200 entries at a time, so large image documents open
without expanding.

When only measured products are stale, the header says so and the workbench also compiles the content without them,
so editing and previews go on. The Measure module lists the stale envelopes and course entries and measures them with
the measurement tool's implementation, on up to four workers off the page's thread, showing which vehicle and phase it
is on; it can be cancelled. The results are preview measurements for this build only: they are not changes, not a
history step and not in the archive, and they are used only while their vehicle, course and procedure identities match
the current documents, then discarded. The header and the Measure module always show whether the build uses the saved
measurements, preview measurements (not saved) or stale ones.

The Run module opens the game in a new tab on the current compile, with a chosen course, vehicle and mode, `dev=1` and
`workbench=<commit>` ([Browser](browser.md#selection-and-url-parameters)): the game imports this build and takes the
compile's products, laid out by the build's delivery layout when the tab opened. Later edits do not reach an open game.
With saved or preview measurements every mode runs, ARCADE with its time limit. While measurements are stale the game
opens in FREE PLAY without rivals, traffic or a time limit. A failed compile cannot run.

The Music module plays a track's recording with the product's recording playback (`createRecordingPlayback`) and the
authored sound settings' timing: from the start, or from 3 s before `loop.end` to hear the seam. `loop.start` and
`loop.end` are set by number or on the waveform, where a press moves the nearer point and its release saves it;
`title` and `selectionOrder` are fields too. Each confirmed change replaces the music document: one step. A chosen
file sets a recording's bytes at `<group>/<name>.m4a` in the music, effects or impacts group, adding or replacing it;
the next compile admits its name and format as the build does. The browser decodes recordings (`decodeAudioData`); a
recording it cannot decode is not played and the module says so.

The Sprites module edits through the [sprite operations](image-assets.md#sprite-operations), each edit one
step, on three screens chosen by tab. **Import** opens a source of `content/sprite-sources/` or adds one (a named PNG and a recipe over the whole
image); the source shows its crop, mask, lamp rectangles and anchor, and dragging on it with the crop, hide, show, lamp
or anchor tool edits the recipe, as do its fields. The master is imported as the build would and previewed with the
product's sprite drawing and LOD at a chosen depth, a vehicle image with its lamp off and on; a course image is written
as its content-addressed file. **Sets** shows the open set's yaw × bank grid: a chosen cell shows any of the set's
images, the imported image is added or replaces an image, an image no cell shows is removed, and a new set starts from
the imported image. The set preview draws the compiled library's set, turned and leaned by cell and moved away by
depth. **Palettes** lists the open set's named palettes, copied, renamed or removed for every image at once. An
adjustment chooses a source palette, slots 1 to 14 and the hue, saturation, lightness and tint sliders; every image of
the set is previewed with the adjusted colors as the sliders move, and saving makes a new named palette, one step. One
slot of one image's palette is set by number; the lamp slot's off and on colors are the set's. A preview shows the
chosen cell's image in every color with the lamp off and on. Lighting palettes are not authored yet.

The Course module shows a course document as written ([form](content-and-gameplay.md#course-authoring-operations)),
one Section at a time, with the Sections and their Links (entry, forks, merges) beside it. Four views are seen
together and share one cursor (the Section and a station s) and one selection:

- the plan, north up, with the Strips, Boundaries, lane centres, walls, limits, centreline, gates, sprites, objects and
  PIs, zoomed with the wheel and panned by dragging;
- the profile, the road height across s, with the PVIs and the PI and gate stations;
- the cross section at the cursor, with the Boundaries, the Strips covering it in order with their materials, walls,
  lane centres and nearby objects;
- the game's frame at the cursor, at a chosen lateral and vehicle.

The plan, profile and cross section are drawn from the document through the course compiler's own functions, so they
follow every edit at once, and draw written points filled and derived points hollow; layers can be hidden, and
"Color by form" colours repeat originals, repeat copies, single elements by reference and absolute ones apart. The
game's frame is the compile worker's answer for the latest compile that succeeded, marked stale when that compile is
older than the document. A click on an element in any view selects it and opens its record in the Documents module's
tree, which selects it back; a click away from elements moves the cursor. A selected repeat shows what it holds and
every copy, a reference its line to the Boundary it reads, a Position the centreline from its PI, and the compile's
diagnostics show on the element their Pointer falls in.

The selected element is edited on the plan by the [edits that keep form](content-and-gameplay.md#course-authoring-operations):
dragging a PI moves its `x` and `z`, dragging an end of its arc sets its `radius`, dragging a near end of a wall, curb or
open limit moves that Position, and dragging anything else moves its Positions and laterals along and across the
Section; a repeat copy drags its original, and every copy with it. On the profile, dragging a PVI moves its Position's
`offset` and its `y`, and dragging an end of its vertical curve sets its `curveLength`. While dragging, only the plan and
profile change: they are read again from the pending document through the product's functions, with what moves ringed
and the changed values listed, and the release replaces the document, one step (Escape drops it). The selection lists
each written number as a field, including each enclosing repeat's `every` and `count`. Changed values snap to a chosen
step (off, 0.01 to 10 m). "Add PI at cursor" inserts a PI with the chosen radius at the cursor's plan point, after the
PIs before it, and "Remove selected PI" removes one no Position measures from. An edit is committed even when the course
then fails to compile; the plan still shows the PIs and their polygon, and the diagnostics say why.

To apply an archive to the repository, extract it at the repository root, delete the files `workbench-changes.json`
marks `deleted`, delete `workbench-changes.json`, then run `npm run measure -- generate`, `npm run check` and
`npm run build`. Authors without a
checkout hand the archive to the implementer.

The sprite command runs the [sprite operations](image-assets.md#sprite-operations) on `content/`, printing one JSON
result (or the diagnostics, exiting 1):

```sh
npm run sprite -- import tree
npm run sprite -- import car-front --set coupe --cells 0:0,12:0
npm run sprite -- new-set van --image van-0 --yaw 24 --bank 1 --lamp 12321,32038
npm run sprite -- adjust --set coupe --from original --to blue --slots 1,3 --hue 120
```

`import` makes the master of `content/sprite-sources/<name>.png` and its recipe: a course image is written as
`content/images/<sha256>.json`; a vehicle image replaces the set's image of that name or is added, and fills the given
`yaw:bank` cells. `new-set` starts a set whose every cell shows one imported image. `adjust` derives a named palette
for every image of a set (`--saturation`, `--lightness`, `--tint-hue` and `--tint-amount` too).

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
format/version. The delivery layout (`layoutDelivery` in
[`delivery-layout.ts`](../tools/authoring/delivery-layout.ts)) is the only authority for these kinds, IDs and paths under
`dist/delivery/`:

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
delivery layout uses only the format. Missing entries
or digest mismatches stop loading. Loaders report expected content and build errors as one
`ContentLoadError` whose `diagnostics` keep their structure: the admission diagnostics of the loaded
documents, and for an absent manifest entry a `content_missing` diagnostic naming `manifest.json`, the
`contentKind` and the `id`. Its message is the diagnostics' JSON text. A digest mismatch means the
transported bytes are not the ones the build indexed, so it is an integrity failure thrown as `Error`;
transport and file-read failures propagate unchanged. Each composition loads the material catalog once
and passes it to the course and the Session vehicle. The manifest itself is the bootstrap index inside the commit-versioned
build; it cannot contain its own digest. Browser course selection reads the course index.

Only the delivery layout owns output naming. Browsers, Node consumers, startup smoke and public-site
verification read indexed content through the shared reader, never by reconstructing output paths.
Authoring inputs under `content/` still use explicit source filenames and image directories.
The browser-tools build writes only `dist/tools`: the bundled workbench and the license of the PNG codec it bundles. The content build writes `dist/delivery` with the authoring core ([Architecture](architecture.md#layer-boundaries)):
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
([Measured products](content-and-gameplay.md#measured-products)). The build lays the returned files out with the
delivery layout and writes them, the manifest last.

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
frames fill: the check passes once it has text. It then follows the workbench's address to that build's workbench page
and script, and compiles the build's published authored files over HTTP with the authoring core and the workbench's own
store: the compile must succeed and every product must equal the published delivery (Chrome's `--dump-dom` does not
finish a page with a worker, so this part runs the core in Node). `CHROME_BIN` selects a local Chromium executable.
