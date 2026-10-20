# Development commands and build outputs

Use Node.js 24. [AGENTS](../AGENTS.md) owns checks and release procedure.

## Commands

| Command                       | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `npm ci`                      | Install locked dependencies                                           |
| `npm run check`               | Lint, format, strict product/tool type checks and dependency checks   |
| `npm run check:static`        | `check` without the product type check, which `npm test`'s build does |
| `npm run lint`                | Lint source, tests and tools                                          |
| `npm run format`              | Format maintained files                                               |
| `npm run format:check`        | Check formatting; `content/` JSON has its own layout owner            |
| `npm run build`               | Clear dist, compile TypeScript, build tools and generate content      |
| `npm test`                    | All checks, build, startup and screens smoke and driving scenarios    |
| `npm run pictures -- <set>`   | Generate a vehicle sprite set from its views and recipe               |
| `npm run hud-tiles`           | Draw the HUD part tiles and pictures into the text tiles              |
| `npm run outrun-test`         | Write the OUTRUN TEST course document from its generator              |
| `npm run skies`               | Draw the course skies that have sources into course images            |
| `python3 -m http.server 8000` | Serve the checkout, game and tools                                    |

### Driving scenarios

`tests/scenarios/race.test.mjs` and `driving.test.mjs` define the scenarios, by course, on the product courses
TSUKUBA and OUTRUN TEST and the trial course OUTRUN TRIAL A; `driving-harness.mjs` assembles the same scene, race,
vehicle physics, route readers, camera and rival sprite rendering as the browser, and prepares each run from a request
through the browser's path (`prepareRun`: the run admission, the products it needs from delivery, and resolution).
The player is driven by the product's driver: an advance without input hands the player to its run driver (the
driver of the takeover after GOAL), which plans, follows, passes and merges by the drivers' rules toward the
scenario's target exit at every fork. Policies that need other inputs script them: the course limit and broadside
policies hold pedals and steering, and the fork policy holds the player on the grid. `npm test` runs them on every
CI build. After `npm run build`, use `npm run test:scenarios` alone. The Node test runner reports total wall time and
per-scenario times; these are observations, not timing gates.

Each scenario runs twice at the browser's fixed 1/60-second step and compares a digest of every
step's vehicle, recovery, progress and camera states plus outcome evidence. No pixel baselines or
wall-clock metrics enter the comparison. Rendering runs every simulated second, on recovery and finish,
and every tenth of a second outside the coordinate domain, through the browser's scene, which draws ground and walls
by LEVEL-POINT alone.
All live vehicle numeric leaves, camera values and route occurrence coordinates/transforms must remain
finite. Each actor's s may move at most the loading coverage record's one-step allowance per step unless recovered.
The next pending crossing cannot move backward, and accepted finish counts cannot decrease. The course limit policy
starts at 30 m/s: initial conditions through the ordinary vehicle constructor, with no pose or progress edits during a
run (the broadside policy places the player once, before READY). In every row, rivals and traffic neither recover nor
meet a wall or course limit (the race's step observation names each vehicle a wall or course limit pushes); outside the
course limit and broadside policies, the player neither recovers nor meets one either. Leaving the pavement is not
checked: a lane change at speed can overshoot its lane a few centimetres off the pavement. Merges, rank limits, ahead
entries and movable objects have no driving scenario. Each of the six rows checks a situation no other row does:

| Row (course)                                                        | Policy                                                                               | Passes when                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| course limit pushes back (TSUKUBA)                                  | steering −0.12 for 4 s from 30 m/s on the home straight, then its driver             | the left course limit pushes the player, which neither recovers nor leaves the domain, returns to the road and drives on above 20 m/s                                                   |
| stopped broadside against a course limit (TSUKUBA)                  | stood a quarter turn toward the left course limit, its front contact 0.6 m past it   | a course limit pushes the player, both contacts stay loaded on ground behind the limit for every step, and it neither recovers nor leaves the domain                                    |
| a rival takes its intended exit's line through a fork (OUTRUN TEST) | one rival (seed 2) drives from the grid while the player, toward exit 0, waits there | the rival passes the first fork on its intended exit, the opposite exit to the player's, on the racing line and within 2 m of its line from the lock to the closure (`branch` evidence) |

Three rows cover run rules. The RACE rows name their class: of a test-only series document,
`tests/scenarios/run-rules.series.json` (never delivered), with the build's delivered reference times and pace
schedules, or of the delivered TRIAL series. The player drives the class's first vehicle, TESTAROSSA elsewhere. Rows
that run to their ending add `rules` evidence: outcome, cause, ending time, position, distance past the finish, player
speed, rival travel after the ending, and appearances and departures. After the ending, race time, progress, events and
the position hold.

| Row (course)                                                                      | Passes when                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RACE lap from the grid ahead of rivals, then the takeover stops (TSUKUBA)         | 911 TURBO 3.3 from the pole ahead of two paced GOLF GTI 16V rivals (p = 1) at the back of the grid: one lap to GOAL at P1/3; over the 16 seconds after it the takeover stops the player within its runout and the rivals keep driving |
| TIME ATTACK lap without a finish from the last slot (TSUKUBA, the quickest lap)   | from the last grid slot, without rivals, traffic or clock; the lap's finish line does not finish the run, which the player ends after one lap: ENDED at P1/1 with that lap as its best                                                |
| RACE with the TRIAL series traffic (OUTRUN TRIAL A, seed 7, 30 s bounded stretch) | traffic appears ahead and leaves the view, at most sixteen at once (its states join the digest and the `traffic` evidence); the outcome is open                                                                                       |

To add a scenario, add a policy/outcome record to the course's list, with a finite simulated work limit.
Compose ordinary inputs in the harness, and require evidence that the intended situation occurred.
Use authored grid slots, fork intervals, lanes and crossing stations rather than world positions
or fixed ticks to locate course features.
When course shapes change, adapt these semantic targets and bounds instead of recording a new trace hash.
Expected results are compared between fresh runs, not committed as golden hashes. A defect regression
should fail when the original failure is temporarily reintroduced; never retain that mutation.
Visual correctness remains a manual check.

### TypeScript tools

Product and tool checking share `tsconfig.base.json`; `tsconfig.json` checks the browser product without
Node globals, and `tsconfig.tools.json` checks TypeScript tools with Node types and no emitted files.
Both roots use the same lint rules. `npm run check:dependencies` checks the boundaries described in
[Architecture](architecture.md#layer-boundaries); `check` and `npm test` run it once. `npm test` type checks the product
once, in the build's compile, and runs every other check of `check` (`check:static`) before it. Saved JSON under
`content/` has one layout owner, [`formatSavedJson`](../src/content/saved-json.ts), through which every tool writes
it, so Prettier does not check it again; `npm run format` leaves it alone too.

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
npm run course -- compile content/courses/outrun-trial-a.course.json
npm run course -- render content/courses/outrun-trial-a.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/outrun-trial-a.course.json --step 25 --out /tmp/course-report
npm run course -- structure content/courses/outrun-trial-a.course.json --section stage-1
npm run course -- move content/courses/outrun-trial-a.course.json --element /sections/0/sprites/0/elements/0 --ds 5 --step 0.5
npm run course -- set content/courses/outrun-trial-a.course.json --values /sections/0/pis/1/radius=420 --out content/courses/outrun-trial-a.course.json
npm run course -- unbind content/courses/outrun-trial-a.course.json --lateral /sections/0/boundaries/1/knots/0/lateral
npm run course -- remove-knots content/courses/outrun-trial-a.course.json --tolerance 0 --apply all --out content/courses/outrun-trial-a.course.json
node --import tsx tools/course/measure.ts request.json --out observations.json
```

`compile` reports the compiled course: its identity, type, entry Section, Sections, forks and ground metrics.
`structure` prints the document's form as JSON
([Course authoring operations](content-and-gameplay.md#course-authoring-operations)), read alone without compiling
the content, so a document that does not compile still shows; `--section` keeps one Section.
`set`, `move`, `add-plan`, `remove-plan` and `normalize` make the
[edits that keep form](content-and-gameplay.md#course-authoring-operations) on the document as saved (`--values` takes
`/pointer=number` pairs, `--element` an element's Pointer, `--section` a Section's; `add-plan` takes `--index`,
`--kind` straight or arc, `--length` and an arc's `--radius` and `--turn`), and the lane edits `add-lane` (`--section`,
`--index`, `--kind` lane or median, `--width`), `remove-lane` and `remove-width` (`--element`), `move-lane`
(`--element`, `--step` −1 or 1), `center-lane` (`--section`, `--lane`) and `taper` (`--element`, `--start`, `--end`,
`--width`) print the changed values, and with `--out` write the edited document in the saved layout.
`explode` (`--repeat`), `combine` (`--elements` as comma-separated Pointers, `--tolerance`), `bind`
(`--lateral` as the lateral's Pointer, `--boundary`, or `--lane` and `--side` for a lane's line), and `unbind` (`--lateral`) make
the [operations that change form](content-and-gameplay.md#course-authoring-operations), printing the shift with the
changed values.
`round` (`--step`, `--values` from `length,radius,offset,lateral,width,height,curveLength,every`), `remove-knots`
(`--tolerance`, default 0), `join` (`--tolerance`, default 0.1 m) and `merge` (`--color-tolerance`, default 0) run the [cleaning operations](content-and-gameplay.md#course-authoring-operations) over the course or
a scope (`--section` id, `--elements` Pointers, `--kinds`): they print the candidates, and `--apply all` or
`--apply id,...` applies the chosen ones as one edit, printing the shift and each changed Section's centreline shift
and length change.
`same` prints the colours, reference groups and absolute values written alike, with their counts.
`findings` prints the course's [findings](content-and-gameplay.md#course-authoring-operations) and their counts by
kind (`--step`, default 0.001 m; `--tolerance`, default 0.1 m; `--color-tolerance`, default 1); findings never make
it fail.
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
npm run measure -- trace --course outrun-trial-a --vehicle TESTAROSSA --route 0 --out /tmp/reference.json
```

`generate` solves again each course's stale or absent racing lines first (a line is also stale when a vehicle that times
it changed), then measures again only the reference
times and the engine loudness whose identities are stale or that are absent (reference runs drive the racing lines, so a stale line makes its
course's reference times stale), writes them, removes saved products no course owns, and prints what it measured with each changed
time (`before`, `after` and `difference` by gate and lap). `regenerate` measures and writes everything. `compare`
measures everything, writes nothing, and fails listing the files that would change; CI does not run it. `trace` writes
one reference run of a course a class runs (route index and laps optional; laps default to the first class running
it) to a disposable file. Vehicles are measured in parallel on up to four workers, each vehicle's reference runs and
engine loudness on one. The measurement itself
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
functions), from the latest compile that succeeded; each answer carries that compile's step. A course document's
findings are answered from the document sent, compiled or not. The header
always shows the build's commit, the number of changes and the compile's state; a failed compile lists its
diagnostics (document, JSON Pointer, code and message) and keeps the last products that compiled, marked stale. A read
of the build that fails (a 503, say) is not kept: a compile that failed internally, and a build that did not open,
offer **Try again**, which reads again without reloading the page. The
products of the last compile are listed with their digests; both lists are in one panel under the module tabs, seen
from every module, which a newly failed compile opens. Modules are screens of the same page, each using the full width
below that panel; each receives only the store, the compile and the one edit. An edit in progress, a field being typed
or a drag, is the screen's alone until it is confirmed (Enter, leaving the field or releasing the pointer), which
replaces the document once: one step. Escape drops a drag. A change of the compile's state or of the changes never
replaces an edit in progress: a screen leaves a field being typed as it is (the Documents module, which redraws its
tree, waits while a value field is focused or holds text other than its value, or a JSON editor is open).

Every edit is one step of the session's history: a document replaced (saved with `formatSavedJson`), a file's bytes set
or a file deleted. Every path, in an edit or an archive, is a path under `content/` by one rule (`CONTENT_PATH`: relative
segments of letters, digits, `_`, `-` and `.`, none starting with a dot), the rule the authored index admits; an edit
at any other path is refused. A file equal to the build's own is no change. Undo and redo (the header's buttons, Ctrl+Z,
Ctrl+Shift+Z or Ctrl+Y outside text fields) move through the history, which the workbench keeps: at most 200 steps and
128 MiB of distinct file versions, the oldest steps going first. The Changes module lists every changed, added and
deleted path with its difference from the build, each with a revert; it also sets a file's bytes from a file on disk
and deletes a file by path. Edits, undo, redo, reverts, opening an archive and saving run in one order, each after
those asked for before it, so an archive holds every edit made before it was saved.

The workbench keeps nothing in the browser. **Save archive** downloads one stored (uncompressed) zip: each changed or
added file at its `content/` path, and `workbench-changes.json` (`superoutride.workbench-changes` version 1: the
build's `commit` and, for each changed path, the digest it had in that build, `null` for an added file, and whether it
is deleted). **Open archive** admits an archive whose every entry is the list or a changed file it names at its
`content/` path, and restores the changes as one step. When the archive was made on another build and a file
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
so editing and previews go on. The Measure module lists the stale course entries, racing lines and engine loudness and measures them with
the measurement tool's implementation, on up to four workers off the page's thread, showing which vehicle and phase it
is on; it can be cancelled. The results are preview measurements for this build only: they are not changes, not a
history step and not in the archive, and they are used only while their vehicle, course and procedure identities match
the current documents, then discarded. The header and the Measure module always show whether the build uses the saved
measurements, preview measurements (not saved) or stale ones.

The Run module opens the game in a new tab on the current compile: RACE or TIME ATTACK of a class (`<series>/<class>`,
driving its first vehicle), or FREE PLAY on a course with a vehicle, `dev=1` and
`workbench=<commit>` ([Browser](browser.md#selection-and-url-parameters)): the game imports this build and takes the
compile's products, laid out by the build's delivery layout when the tab opened. Later edits do not reach an open game.
With saved or preview measurements every run is offered, RACE with its time limit. While measurements are stale the game
opens in FREE PLAY without rivals, traffic or a time limit. A failed compile cannot run.

The Music module plays a track's recording with the product's recording playback (`createRecordingPlayback`) and the
authored sound settings' timing: from the start, or from 3 s before `loop.end` to hear the seam. Stop, another play
or another track ends the listening intent: a play still preparing (reading the sound settings, resuming the audio)
then starts nothing. `loop.start` and
`loop.end` are set by number or on the waveform, where a press moves the nearer point and its release saves it;
`title` and `selectionOrder` are fields too. Each confirmed change replaces the music document: one step. A chosen
file sets a recording's bytes at `<group>/<name>.m4a` in the music, effects or impacts group, adding or replacing it;
the next compile admits its name and format as the build does. The browser decodes recordings (`decodeAudioData`); a
recording it cannot decode is not played and the module says so.

The Sprites module edits course images through the [sprite operations](image-assets.md#sprite-operations), each edit
one step. Its import screen opens a source of `content/sprite-sources/` or adds one (a named PNG and a recipe over the
whole image); the source shows its crop, mask and anchor, and dragging on it with the crop, hide, show or anchor tool
edits the recipe, as do its fields. The master is imported as the build would and previewed with the product's sprite
drawing and LOD at a chosen depth; it is written as its named file, replacing one of that name.

The Course module shows a course document as written ([form](content-and-gameplay.md#course-authoring-operations)),
one Section at a time, with the Sections and their Links (entry, forks, merges) beside it. Four views are seen
together and share one cursor (the Section and a station s) and one selection:

- the plan, north up, with the Strips, Boundaries, lanes, walls, limits, centreline, gates, sprites, objects and
  plan joints, zoomed with the wheel and panned by dragging; each lane's centre (the centre lane's solid) with its name
  at the cursor, the lane and median edges and the roads' edges, all derived, and a width written as values at
  Positions as points at them;
- the profile, the road height across s, with the PVIs and the joint and gate stations;
- the cross section at the cursor, with the Boundaries, the Strips covering it in order with their materials, walls,
  the lanes (edges, centres, names and widths), medians, roads and nearby objects;
- the game's frame at the cursor, at a chosen lateral and vehicle.

The plan, profile and cross section are drawn from the document through the course compiler's own functions, so they
follow every edit at once, and draw written points filled and derived points hollow; layers can be hidden, and
"Color by form" colours repeat originals, repeat copies, single elements by reference and absolute ones apart. The
game's frame is the compile worker's answer for the latest compile that succeeded, marked stale when that compile is
older than the document. A click on an element in any view selects it and opens its record in the Documents module's
tree, which selects it back; a click away from elements moves the cursor. A selected repeat shows what it holds and
every copy, a reference its line to the Boundary it reads, a Position the centreline from its joint, and the compile's
diagnostics show on the element their Pointer falls in.

The selected element is edited on the plan by the [edits that keep form](content-and-gameplay.md#course-authoring-operations):
dragging a plan element's joint moves it along the Section, the element before it and the element taking up the move;
dragging where a selected arc's tangents meet (drawn with the tangents) along the line to the arc's middle sets its
radius, its turning angle and that meeting point kept, offered for an arc of less than half a circle between straights
alone; dragging a near end of a wall, curb or
open limit moves that Position, and dragging anything else moves its Positions and laterals along and across the
Section; a repeat copy drags its original, and every copy with it. On the profile, dragging a PVI moves its Position's
`offset` and its `y`, and dragging an end of its vertical curve sets its `curveLength`. While dragging, only the plan and
profile change: they are read again from the pending document through the product's functions, with what moves ringed
and the changed values listed, and the release replaces the document, one step (Escape drops it). The selection lists
each written number as a field, including each enclosing repeat's `every` and `count`. Changed values snap to a chosen
step (off, 0.01 to 10 m). A plan element's `length` and `radius` are also fields, an arc's turn a choice, and "Split
at cursor" splits the element where the cursor is, the two halves held until one changes. "Add plan element at cursor" inserts a straight, or an arc of the chosen radius and turn, of
the chosen length after the element the cursor is on, and "Remove selected plan element" removes one no Position
measures from. A selected lane or median moves along the order, is removed (a lane only when nothing names it), adds a
lane or median after it (3.5 m and 1 m wide, author values the author then edits), and tapers its width between two stations to a chosen width; its width, or each value of a
width written at Positions, is a field, and such a value moves on the plan and is removed by its own button. A lane that
is not the centre lane is made the centre lane by one button, with a note, before it is pressed, of how far the lanes
then move against the absolute laterals and how many those are. An edit is committed even when the course then fails
to compile; the diagnostics say why.

Under "Change form" the selection offers the [operations that change form](content-and-gameplay.md#course-authoring-operations)
that apply to it: explode the repeat it is or is in, bind an absolute lateral to a chosen Boundary or lane line or unbind a
reference, and combine the elements chosen together (the selection and those
shift-clicked on the plan) within a tolerance. Choosing one previews it on the plan and lists each changed Pointer with
its value before and after and the shift; Apply makes it one step, and Cancel or another selection drops it.

"Clean" runs the [cleaning operations](content-and-gameplay.md#course-authoring-operations) over the whole course,
the open Section or the selection: round values (a step and the kinds of value), remove unneeded knots (a tolerance),
join near things (a tolerance) or merge equal things (a colour tolerance). "Find candidates" lists each candidate
with what it changes and whether the driving changes (its shift), rings their elements on the plan, and selects one
when its row is clicked; applying any of them makes the measured products stale. "Preview chosen" draws the checked
candidates applied with their shift and each Section's centreline shift and length change, and "Apply chosen" makes
them one step. Candidates belong to the document they were found in: when the document changes (an edit, an undo, or
another course opened) they are discarded, while a change of selection keeps them. Below, what is written alike (colours with their uses, references and absolute laterals) is shown.
The compile worker finds the candidates off the page's thread, from the document as it stands (a `candidates`
query); only the latest search shows, and a course's unneeded knots take seconds. A search runs to its end in the
worker: it cannot be stopped midway, so a search asked for while one runs waits for it.

The course's [findings](content-and-gameplay.md#course-authoring-operations), apart from its diagnostics, are always
counted by kind above the views. The compile worker works them out after each change, from the document as it stands,
compiled or not (a `findings` query), with the chosen step and tolerances. A kind lists its findings; choosing one
selects its element and shows, in the Clean panel, the candidate it was found as, alone and checked, with the
operation, scope (the whole course) and amount it was found with; nothing is searched again. A value off the step is
held as round's proposal and measured when shown. The candidate belongs to the document the findings were found in, so
a document changed since shows none. "Find candidates" then searches the chosen scope as before.

"Underlay" lays a PNG or JPEG opened in the browser under the open Section's plan, to trace a course from; the image
is never saved, in the store or an archive. It is scaled by picking two points on it and giving their distance in
metres (the first point stays where it lies), moved by dragging (with "Move by dragging"; Escape or a lost pointer
puts it back where the drag began) or by number, turned by
number and shown at a chosen opacity. "Save alignment" saves the numbers, one step, as the course's
[underlay alignments](content-and-gameplay.md#course-authoring-operations); opening the same image again lays it
where it was saved, and an image whose SHA-256 differs from the saved one is named as different and laid with the
saved numbers.

To apply an archive to the repository, extract it at the repository root, delete the files `workbench-changes.json`
marks `deleted`, delete `workbench-changes.json`, then run `npm run measure -- generate`, `npm run check` and
`npm run build`. Authors without a
checkout hand the archive to the implementer.

The sprite command runs the [sprite operations](image-assets.md#sprite-operations) on `content/`, printing one JSON
result (or the diagnostics, exiting 1):

```sh
npm run sprite -- import tree
```

`import` makes the master of `content/sprite-sources/<name>.png` and its recipe and writes it, with every level of its
LOD, as `content/images/<name>.json` (replacing one of that name).

### Pictures command

The pictures command generates one vehicle sprite set by the
[vehicle picture generator](image-assets.md#vehicle-picture-generator), printing one JSON result (or the diagnostics,
exiting 1):

```sh
npm run pictures -- testarossa
```

It reads `content/vehicle-picture-sources/<set>.json` and the four views beside it, the mechanics document the recipe
names and the product camera definition, and writes `content/sprites/<set>.json`. A set already saved may be a finished
one ([Image assets](image-assets.md#vehicle-picture-generator)), so the command refuses to replace it unless `replace`
follows the set's name. It also writes a check
sheet, `dist/pictures/<set>.png`: every full-size picture over its shadow, eight directions a row, which nothing reads.
The build admits the saved set and generates nothing.

### HUD tiles command

The HUD tiles command writes the fonts, draws the HUD's drawn part tiles ([Image assets](image-assets.md#text-tiles)) and every HUD
picture by the [HUD picture generator](image-assets.md#hud-picture-generator), printing one JSON result (or the
diagnostics, exiting 1):

```sh
npm run hud-tiles
```

It reads the [HUD design sources](image-assets.md#hud-design-sources) and `content/hud-picture-sources/recipes.json`
with the sources beside it, writes the fonts, the part tiles (the tachometer's and the tire gauge's by their rules), the drawn named palettes, the pictures and their
palettes into `content/text-tiles/default.json`, keeping its authored named palettes, and
writes a check sheet of each
picture, `dist/hud-pictures/<name>.png`: its frames in order over a grey ground, which nothing reads. The build admits
the saved text tiles and draws nothing.

### Screen pictures command

The screen pictures command draws every [screen picture](image-assets.md#screen-pictures) from its source and recipe,
printing one JSON result (or the diagnostics, exiting 1):

```sh
npm run screen-pictures
```

It reads `content/screen-picture-sources/recipes.json` and the sources beside it, writes each picture as
`content/screen-pictures/<name>.json` and a check sheet of it, `dist/screen-pictures/<name>.png`, over a grey ground,
which nothing reads. The build admits the saved pictures and draws nothing.

### OUTRUN TEST commands

The [test course](content-and-gameplay.md#test-course) and its pictures come from production-only generators, each
deterministic, each printing one JSON result or its diagnostics:

```sh
npm run outrun-test
npm run outrun-test-pictures
npm run outrun-test-sheets -- [stage ...] [--crossing link ...] [--out directory]
```

`outrun-test` writes `content/courses/outrun-test.course.json` from the stage table in
[`tools/course/outrun-test.ts`](../tools/course/outrun-test.ts) and prints each stage's length and planning estimate;
the measured products then follow from `npm run measure -- generate`. `outrun-test-pictures` draws the sources of the
OUTRUN TEST pictures with the raster of [`tools/graphics/drawn/`](../tools/graphics/drawn) and writes them with their
recipes where the picture commands read them, then makes the pictures as those commands do: the series picture to
`content/screen-picture-sources/` (as `npm run screen-pictures`), sprites to `content/sprite-sources/` (as
`npm run sprite -- import <name>`) and skies to `content/sky-sources/` (as `npm run skies`); given names, it draws only
those. Any source can be replaced by another image of the same name and size, and made by its own command without
touching the course or this one. `outrun-test-sheets` compiles the content once and writes a contact sheet of each named stage (every stage by
default) under `dist/outrun-test-sheets/`: frames of the logical frame through the product scene from the stage's
start, every eighth of it and its fork or goal, each labelled with its station, and 150 m past each change of
environment within it, and for each Link named after
`--crossing` a sheet of a drive across its seam at 30 m/s through the scene's fixed steps, so its background
transition shows; nothing reads them.

### Puff pictures command

The [tire puffs](tire-puffs.md)' pictures come from a production-only generator, deterministic, printing one JSON
result or its diagnostics:

```sh
npm run puff-pictures
```

It draws every puff picture's source with the raster of [`tools/graphics/drawn/`](../tools/graphics/drawn)
([Image assets](image-assets.md#drawn-pictures)), writes it with its recipe and named palettes to
`content/sprite-sources/`, and makes its course image as `npm run sprite -- import <name>` does. Any source can be
replaced by another image of the same name and size and made by the sprite command without this one.

### Guidance pictures command

The guidance's boards where OUTRUN's roads part come from a production-only generator, deterministic, printing one
JSON result or its diagnostics:

```sh
npm run guidance-pictures
```

It draws each board ([Image assets](image-assets.md#drawn-pictures)), writes it with its recipe to
`content/sprite-sources/`, and makes its course image as `npm run sprite -- import <name>` does.

### Footage commands

The footage tool raises a course from videos of an original game ([Courses from footage](footage.md)). It runs as
`npm run footage -- <command>` and needs ffmpeg and ffprobe on the path. It reads videos and writes frames, features,
evidence and side-by-sides under `reference-media/`, which Git ignores. Stage VC stopped with these commands built
([NEXT](NEXT.md#stage-vc--courses-from-footage)); each takes `--out`, a root in place of `reference-media/`:

| Command     | Purpose                                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fake`      | Draw the fake original's videos and truth (`--video` names some; `--seconds` keeps their start; `--exact n` also writes every nth game frame and the next; `--no-video` skips encoding) |
| `ingest`    | Cut a video into game-pixel PNG frames and work out its capture values                                                                                                                  |
| `drive`     | Mark the stretch where the player drives (`--from`, `--to`) and the timing events the HUD does not read (`--go`, `--checkpoint`, `--goal`), seconds                                     |
| `colors`    | List the colors a video's frames are drawn in, for a person to give the ground's their roles                                                                                            |
| `features`  | Measure each frame's features (on as many worker threads as cores)                                                                                                                      |
| `noise`     | For fake footage: each feature's capture noise, the video's frames against the exact ones (`fake --exact`)                                                                              |
| `calibrate` | Measure the original's camera from its first course's videos (`--video` names every one) into its footage model                                                                         |
| `solve`     | Each video's plan and profile under the footage model's pitch rule, and the rows' check of that rule                                                                                    |

### Road data commands

The road data tool reads an original's road data from its program ROMs ([Original road data](original-road-data.md)). It
runs as `npm run road-data -- <command>`; it reads K's ROM zip in `reference-media/outrun/rom/` (TURBO OUTRUN's in
`reference-media/turbo-outrun/rom/`, SUPER HANG-ON's in `reference-media/super-hang-on/rom/`) and writes dumps under `rom-data/` beside it, which Git ignores, and what it raises
from the ROMs under `content/`:

| Command                | Purpose                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read`                 | Check the ROM zip (`--zip`, else the one zip in the ROM directory) and write every stage's, the fork's and the goals' tables to the dump (`--out`)                                                               |
| `hills`                | Write each stage's (or `--stage`'s) road top by the original's hills from the dump, the holds counted at `--kmh`                                                                                                 |
| `course`               | Write OUTRUN's roads, raised from the ROM zip (`--zip`), to `content/courses/`, and its stage skies and their [local originals](#local-originals) to `content/images/`, or with `--check` fail where one differs |
| `look`                 | For every stage, from the ROM zip (`--zip`): refit `c_look`, report its profile's heights, steepest grade and crossings, and each height table's road top on both screens and least load                         |
| `boards`               | Write the boards of the sprites OUTRUN's stages and start show from the ROM zip (`--zip`), in the ROMs' pixels, and their [local originals](#local-originals), or with `--check` fail where a board differs      |
| `player`               | Write the local original of TESTAROSSA's picture set, the original's Ferrari, from the ROM zip (`--zip`)                                                                                                         |
| `sounds`               | Write the local originals of the recordings the original plays from its PCM ROMs, from the ROM zip (`--zip`), with ffmpeg                                                                                        |
| `turbo-outrun-read`    | Check TURBO OUTRUN's ROM zip (`--zip`) and write every table its course uses to the dump (`--out`), the tables described as OUTRUN's checked against OUTRUN's zip (`--outrun-zip`)                               |
| `super-hang-on-read`   | Check SUPER HANG-ON's ROM zip (`--zip`, else the one zip in its ROM directory) and write its courses' tables to its dump                                                                                         |
| `super-hang-on-course` | Write SUPER HANG-ON's four courses, raised from its ROM zip (`--zip`), to `content/courses/`, and the pictures their objects show and their skies to `content/images/`, or with `--check` fail where one differs |

### Local originals

A local build can show an original's own pictures, converted from its ROMs, in place of the published ones. They are
for K's own runs only: they never reach Git, a PR or Pages.

- **Where.** A local original is a file under `reference-media/originals/` (which Git ignores) at the path, under
  `content/`, of the published file it replaces. A file with no published counterpart is left out.
- **Identity.** An original keeps everything the course identity reads: the same name, size in texels, foot position,
  palette names and level count as the published file. Only its pixels and colors differ, so the measured products
  saved for the published content stay valid.
- **Conversion.** Each conversion is deterministic and is rebuilt by the command that writes the published file:
  `npm run road-data -- boards` writes each board, in the ROMs' pixels, and beside it the same picture as its original.
  `npm run road-data -- course` writes each OUTRUN stage's sky and its original, the stage's background from the tile
  ROMs ([Backgrounds](original-road-data.md#backgrounds)). `npm run road-data -- player` writes the original of TESTAROSSA's picture set, the original's Ferrari
  ([The player's car](original-road-data.md#the-players-car)). `npm run road-data -- sounds` writes the originals of the recordings the original
  plays from its PCM ROMs, with ffmpeg ([Voices and effects](original-road-data.md#voices-and-effects)).
- **Build.** `npm run build:originals` runs `npm run build` with the originals in place of the published files of their
  paths. It writes `dist/originals.json` listing them, and DEV's toggle reads `LOCAL ORIGINALS`. The workbench's
  authored files carry the originals too. A build with `CI` set refuses it, so CI and Pages never use them.

To run them: put K's ROM zip in `reference-media/outrun/rom/`, run `npm run road-data -- boards`, `course`,
`player` and `sounds`, then `npm run build:originals`, serve the repository root (`python3 -m http.server 8000`)
and open the game with `dev=1`.
`npm run build` returns to the published files.

### Skies command

The skies command draws every course sky that has a source, `content/sky-sources/<name>.png` with its entry in that
directory's `recipes.json`, as a tile picture 40 tiles high and opaque, and writes it as the course image
`content/images/<name>.json`, printing one JSON result (or the diagnostics, exiting 1):

```sh
npm run skies
```

Skies without a source are left as they are.

### Screens smoke

`npm test` renders the front end's screens headlessly through the same screens the page shows, from the delivered
content (`tests/infrastructure/screens-smoke.test.mjs`), and saves each drawn frame to `dist/screens/<name>.png` at
twice the frame's size, as the reference mockups are drawn, for inspection by eye; no test compares their pixels.
FREE PLAY's SELECT VEHICLE is drawn for every offered vehicle, each of its pages, so a catalog that outgrows a line of
the screen fails there. A
single file runs after `npm run build` with `node --import tsx --test tests/infrastructure/screens-smoke.test.mjs`.

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
An underlay image traced in the course module is such a source: it is opened in the browser and never stored, and only
its alignment numbers are committed, under `content/course-underlays/`.
The one exception is an outline board ([Courses from footage](footage.md#outline-boards)): the outline of a sprite fixed
on an original's course, filled with one color, is committed as a sprite source and course image. Nothing inside the
outline (colors, patterns, lettering) is. An outline's evidence, the original-resolution texel shapes and each frame's
masks, stays in `reference-media/`, as do HUD templates and background mosaics.

## Build outputs

`dist/` contains compiled product ESM and bundled browser graphics/audio tools, not Node build-script output. `dist/delivery/` contains every delivered file
listed below and the content manifest. Product modules compile to `dist/<layer>/`, including the `content`
layer's modules in `dist/content/`; delivered files stay under `dist/delivery/` so modules and data never share a directory. Course JSON retains authored Strip constructs; the shared compiler expands them and builds immutable
preblend fields before browser driving or headless rendering. Expanded Strips are
in-memory compiler products, not committed files or an additional delivered image format. Build also delivers the
racing lines, game time budgets and pace schedules from the [measured products](#measured-products) saved under
`content/`; it runs no driving. Browsers load these products.

`dist/delivery/manifest.json` is the sole delivery index. Its own
`format: "superoutride.content-manifest", version: 1` identifies the index format; entries have only
`{kind, id, path, sha256}`. Every JSON file is delivered as compact JSON followed by a newline; vehicle
mechanics, vehicle listing, driving, material, surface-sound, puff, audio, engine-sound, music, series, screen picture and text tile documents are delivered exactly as authored in that
encoding, so the build knows their delivered digests before staging them. Recordings are not JSON: each is delivered
as the exact bytes its author placed under `content/`. Entries contain no payload
format/version. The delivery layout (`layoutDelivery` in
[`delivery-layout.ts`](../tools/authoring/delivery-layout.ts)) is the only authority for these kinds, IDs and paths under
`dist/delivery/`:

| Kind              | ID                                                                                                      | Path                                      | Content                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `course`          | Course file name stem (the course selection key)                                                        | `courses/<id>.course.json`                | Course document                                                                                                                 |
| `course-index`    | `courses`                                                                                               | `course-index.json`                       | Course index ([Content and gameplay](content-and-gameplay.md#course-index))                                                     |
| `series`          | Series file name stem                                                                                   | `series/<id>.series.json`                 | Series document ([Content and gameplay](content-and-gameplay.md#series-documents))                                              |
| `screen-picture`  | Screen picture name                                                                                     | `screen-pictures/<id>.json`               | Screen picture, a tile picture ([Image assets](image-assets.md#screen-pictures))                                                |
| `image`           | Course or puff image name, `vehicles` for the vehicle sprite library or `text-tiles` for the text tiles | `images/<sha256>.json`                    | Compiled course images, the vehicle sprite library and the text tiles                                                           |
| `vehicle`         | Vehicle ID                                                                                              | `vehicles/<id>.json`                      | Vehicle mechanics document                                                                                                      |
| `vehicle-listing` | Vehicle ID                                                                                              | `vehicle-listings/<id>.json`              | Vehicle listing document                                                                                                        |
| `driving`         | `default`                                                                                               | `driving/<id>.json`                       | Game-wide driving definition                                                                                                    |
| `material`        | `surface`                                                                                               | `materials/<id>.json`                     | Surface-material document                                                                                                       |
| `engine-sound`    | Sound ID                                                                                                | `engine-sounds/<id>.json`                 | Engine-sound document ([Audio](audio.md#observations-and-engine-sounds))                                                        |
| `surface-sound`   | `default`                                                                                               | `surface-sounds/<id>.json`                | Surface-sound document ([Tire audio](tire-audio.md#surface-sounds))                                                             |
| `audio`           | `default`                                                                                               | `audio/<id>.json`                         | Game-wide sound settings ([Audio](audio.md#audio-document))                                                                     |
| `free-play`       | `default`                                                                                               | `free-play/<id>.json`                     | FREE PLAY rules ([Content and gameplay](content-and-gameplay.md#free-play-document))                                            |
| `puffs`           | `default`                                                                                               | `puffs/<id>.json`                         | Puff document ([Tire puffs](tire-puffs.md#puff-document)); its pictures are `image` entries                                     |
| `recording`       | `<group>/<name>`: `music/<id>`, `effects/<name>` or `impacts/<name>`                                    | `recordings/<id>.m4a`                     | Recording, AAC-LC in MP4 ([Audio](audio.md#recordings-and-music-documents))                                                     |
| `music`           | Track ID                                                                                                | `music/<id>.json`                         | Music document ([Audio](audio.md#recordings-and-music-documents))                                                               |
| `reference-times` | `<course>/<vehicle>`                                                                                    | `reference-times/<course>/<vehicle>.json` | Reference times before the series margin, from which a timed run derives its budgets (`superoutride.course-reference-times` v1) |
| `schedule`        | `<course>/<vehicle>`                                                                                    | `schedules/<course>/<vehicle>.json`       | RACE pace schedule (`superoutride.pace-schedule` v1)                                                                            |
| `racing-line`     | Course ID                                                                                               | `racing-lines/<id>.json`                  | The course's racing lines (`superoutride.racing-line` v2)                                                                       |
| `engine-loudness` | `default`                                                                                               | `engine-loudness/<id>.json`               | Each vehicle's engine loudness, as saved (`superoutride.engine-loudness` v1, [Audio](audio.md#engine-loudness))                 |

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
and passes it to the course and the run vehicle. The manifest itself is the bootstrap index inside the commit-versioned
build; it cannot contain its own digest. Browser course selection reads the course index.

Only the delivery layout owns output naming. Browsers, Node consumers, startup smoke and public-site
verification read indexed content through the shared reader, never by reconstructing output paths.
Authoring inputs under `content/` still use explicit source filenames and image directories.
The browser-tools build writes only `dist/tools`: the bundled workbench and the license of the PNG codec it bundles. The content build writes `dist/delivery` with the authoring core ([Architecture](architecture.md#layer-boundaries)):
`compileContent` reads `content/` through the Node content store and compiles every delivered file from authored
documents in one pass, in dependency order: the vehicle sprite library (compiled LOD and admitted), text tiles,
surface materials, surface sounds (resolved against those materials), audio settings, recordings and the
music documents (admitted against those recordings), FREE PLAY rules, engine sounds, vehicle and driving definitions
(admitted against that library and engine-sound catalog), courses and their images (admitted with the levels they are saved with; none is compiled), the course index, then series (admitted against those courses and the vehicle catalog).
Each stage receives earlier products directly, and a course and its images are delivered only after the course
compiles. Last, the core admits the saved measured products against this content and delivers each course's racing
lines and, for each course a class runs, once for each vehicle a
class runs there, its reference times (before any margin; a run applies its series' margin) and pace schedule; only
courses a class runs are timed, since only RACE has the clock and rival pace. A stale, absent or unowned saved product fails the build
([Measured products](content-and-gameplay.md#measured-products)). A document whose bytes are not UTF-8 JSON is an
input error of that document (`parse_failure` at its root), as for course documents. The build lays the returned files
out with the delivery layout and writes them, the manifest last.

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
frames fill: the check passes once it has text, read over the DevTools protocol within 60 s of real time. It waits in
real time, not on a virtual-time budget: Chrome advances virtual time to the next timer whenever the page waits on real
I/O, so a budget's reach depends on the machine. The 60 s deadline ends every wait of the attempt: a protocol call
Chrome does not answer fails it, and Chrome, asked to exit, is killed if it has not exited by then. It then follows the workbench's address to that build's workbench
page and script, and compiles the build's published authored files over HTTP with the authoring core and the
workbench's own store: the compile must succeed and every product must equal the published delivery (this part runs
the core in Node). `CHROME_BIN` selects a local Chromium executable.
The Pages workflow runs it twice: every build, a pull request's included, stages the site under its exact source
commit and checks it served locally (`http://127.0.0.1:8000/`) before anything is deployed, so a build whose site
cannot start never reaches main; a push to main checks the deployed site again.
