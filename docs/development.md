# Development commands and build outputs

Use Node.js 24. [AGENTS](../AGENTS.md) owns checks and release procedure.

## Commands

| Command                       | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `npm ci`                      | Install locked dependencies                                           |
| `npm run check`               | Lint, format, strict product/tool type checks, dependencies and links |
| `npm run check:static`        | `check` without the product type check, which `npm test`'s build does |
| `npm run lint`                | Lint source, tests and tools                                          |
| `npm run format`              | Format maintained files                                               |
| `npm run format:check`        | Check formatting; `content/` JSON has its own layout owner            |
| `npm run check:links`         | Check the Markdown's relative links and their headings' fragments     |
| `npm run build`               | Clear dist, compile TypeScript, build tools and generate content      |
| `npm test`                    | All checks, build, startup and screens smoke and driving scenarios    |
| `npm run pictures -- <set>`   | Generate a vehicle sprite set from its views and recipe               |
| `npm run hud-tiles`           | Draw the HUD part tiles and pictures into the text tiles              |
| `npm run skies`               | Draw the course skies that have sources into course images            |
| `python3 -m http.server 8000` | Serve the checkout, game and tools                                    |

### Driving scenarios

`tests/scenarios/race.test.mjs` and `driving.test.mjs` define the scenarios, by course, on the product course
TSUKUBA; `driving-harness.mjs` assembles the same scene, race,
vehicle physics, route readers, camera and rival sprite rendering as the browser, and prepares each run from a request
through the browser's path (`prepareRun`: the run admission, the products it needs from delivery, and resolution).
The player is driven by the product's driver: an advance without input hands the player to its run driver (the
driver of the takeover after GOAL), which plans, follows, passes and merges by the drivers' rules toward the
scenario's target exit at every fork. Policies that need other inputs script them: the course limit and broadside
policies hold pedals and steering. `npm test` runs them on every
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
entries, movable objects and forks have no driving scenario. Each row checks a situation no other row does:

| Row (course)                                       | Policy                                                                             | Passes when                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| course limit pushes back (TSUKUBA)                 | steering −0.12 for 4 s from 30 m/s on the home straight, then its driver           | the left course limit pushes the player, which neither recovers nor leaves the domain, returns to the road and drives on above 20 m/s                |
| stopped broadside against a course limit (TSUKUBA) | stood a quarter turn toward the left course limit, its front contact 0.6 m past it | a course limit pushes the player, both contacts stay loaded on ground behind the limit for every step, and it neither recovers nor leaves the domain |

Three rows cover run rules. The RACE rows name their class: of a test-only series document,
`tests/scenarios/run-rules.series.json` (never delivered, standing on TSUKUBA CLUBMAN's picture), with the build's
delivered reference times and pace schedules. The player drives the class's first vehicle, TESTAROSSA elsewhere. Rows
that run to their ending add `rules` evidence: outcome, cause, ending time, position, distance past the finish, player
speed, rival travel after the ending, and appearances and departures. After the ending, race time, progress, events and
the position hold.

| Row (course)                                                                    | Passes when                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RACE lap from the grid ahead of rivals, then the takeover stops (TSUKUBA)       | 911 TURBO 3.3 from the pole ahead of two paced GOLF GTI 16V rivals (p = 1) at the back of the grid: one lap to GOAL at P1/3; over the 16 seconds after it the takeover stops the player within its runout and the rivals keep driving |
| TIME ATTACK lap without a finish from the last slot (TSUKUBA, the quickest lap) | from the last grid slot, without rivals, traffic or clock; the lap's finish line does not finish the run, which the player ends after one lap: ENDED at P1/1 with that lap as its best                                                |
| RACE with the test series traffic (TSUKUBA, seed 7, 30 s bounded stretch)       | traffic appears ahead and leaves the view, at most sixteen at once (its states join the digest and the `traffic` evidence); the outcome is open                                                                                       |

To add a scenario, add a policy/outcome record to the course's list, with a finite simulated work limit.
Compose ordinary inputs in the harness, and require evidence that the intended situation occurred.
Use authored grid slots, fork intervals, lanes and crossing stations rather than world positions
or fixed ticks to locate course features.
When course shapes change, adapt these semantic targets and bounds instead of recording a new trace hash.
Expected results are compared between fresh runs, not committed as golden hashes. A defect regression
should fail when the original failure is temporarily reintroduced; never retain that mutation.
Visual correctness remains a manual check.

### Field runs

`npm run field-runs` runs FREE PLAY on every delivered course, after `npm run build`, through the same path from a
request to a race as the scenarios: the player driven by its run driver from GO with 11 rivals (as many as the course's
grid holds) and HIGH traffic, for 300 s or until its race ends, seed 0, three courses at once. `--course`, `--vehicle`,
`--rivals`, `--traffic`, `--seconds` and `--seed` change one of these. It prints one JSON result: each course's run (its
rivals, the seconds run, its status, the recoveries of the player and of the rivals), the fixed step where a race threw
and what threw, and the first vehicle whose state held a number that is not finite and where; it exits 1 when any course
has either. It is not part of `npm test`: the field is larger and the runs longer than the scenarios', about an hour for
every course.

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
npm run course -- compile content/courses/tsukuba.course.json
npm run course -- render content/courses/tsukuba.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/tsukuba.course.json --step 25 --out /tmp/course-report
npm run course -- structure content/courses/tsukuba.course.json --section sector-1
npm run course -- move content/courses/tsukuba.course.json --element /sections/0/sprites/0/elements/0 --ds 5 --step 0.5
npm run course -- set content/courses/tsukuba.course.json --values /sections/0/pis/1/radius=420 --out content/courses/tsukuba.course.json
npm run course -- unbind content/courses/tsukuba.course.json --lateral /sections/0/boundaries/1/knots/0/lateral
npm run course -- remove-knots content/courses/tsukuba.course.json --tolerance 0 --apply all --out content/courses/tsukuba.course.json
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
npm run measure -- trace --course tsukuba --vehicle TESTAROSSA --route 0 --out /tmp/reference.json
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

| Tool          | Local URL                                  |
| ------------- | ------------------------------------------ |
| Workbench     | `http://localhost:8000/workbench.html`     |
| Course viewer | `http://localhost:8000/course-viewer.html` |

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

The Sprites module edits course images through the [sprite operations](image-assets.md#sprite-operations), each edit one
step. Its import screen opens a source of `content/sprite-sources/` or adds one (a named PNG and a recipe over the whole
image); the source shows its crop, mask and anchor (across, on the crop's bottom edge), and dragging on it with the
crop, hide, show or anchor tool edits the recipe, as do its fields. The master is imported as the build would and
previewed with the product's sprite drawing and LOD at a chosen depth; it is written as its named file, replacing one of
that name.

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
alone; dragging a near end of a wall or
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

### Course viewer

The course viewer shows a course in true perspective, from any angle, so its structure (a band repeating sideways, a
picture folding at its anchor, a road coming near itself) can be judged; it edits nothing and is apart from the
workbench. It has one address, `course-viewer.html` at the site root, which opens the course viewer of the build
`version.txt` names, `build/<commit>/tools/course-viewer/course-viewer.html` (without `version.txt`,
`dist/tools/course-viewer/course-viewer.html`). It offers every course the build's manifest delivers and loads only the
chosen one, through the game's delivery (`loadDeliveredCourse`); how a course's elements are written (a repeat's
original and copies) it reads from the authored document the build publishes for the workbench, and it adds nothing to
the delivery. It lays the course out as the course map does (`firstExitRoute`: from the entry, one lap of a circuit,
each fork's first exit, each occurrence placed by its transform to the world).

Every position, height and direction comes from the functions physics and the game read: the plan (`toWorld`), the
profile, the occurrences' transforms, the resolved Strips (`readSlab`), the sprites' placement and their repeats'
expansion, a band's period, the camera definition and the compiler's clearance (`sampleClearance`). The viewer adds its
camera and the rules below. It draws with the GPU's perspective (or parallel) projection and a depth buffer, at true
scale in metres, in the game's colors (unlit, unless the light shades them: **Light** below): ground and walls in the
resolved Strips' colors, without the preblend; pictures by nearest texel, each at the level of its picture (LOD) the
game's nearest-octave rule (`selectSpriteLevel`) picks for its scale at its base point (a board repeating sideways, at
each repetition's centre), with palette index 0 cut away. Depth is written on a logarithmic scale of the distance, so
one buffer holds the whole course and the ground at one's feet; what lies on the ground draws with a bias toward the eye
that grows with its depth slope, so it never flickers against the ground. Curves and the profile's curves are drawn as
straight pieces within 1 cm.

A picture in the game is one base point and one flat picture on the screen; its rows below the anchor lie on the
ground only in how they overlap, neither shortened by perspective nor bent by a curve. The viewer places each picture as
one flat board that does not bend:

- **Base point.** Every picture stands at its base point: `toWorld(s, l)` carried by its occurrence's transform, at
  `Y(s) + groundOffset`. A master texel is 1/40 m across and down alike.
- **Which rows stand.** The picture's own data decide which rows stand and which lie, as the game reads them: the rows
  on and above its anchor stand and the rows below it lie, and an image that declares it all lies (`lies`) has no
  standing row. The viewer decides nothing.
- **The lying plane** is the road's plane at the anchor's station: tilted to the profile's grade there, level across.
  It is not bent to the ground. A lying picture's top faces +s, its bottom −s.
- **Standing rows** stand upright from the base point in the cross section at its station (the plane of its right
  normal and the vertical), facing the coming cars (−s). Seen from behind, a board shows its mirror image, darker.
- **Rows below the anchor** fold at the anchor toward −s and lie flat on the lying plane.
- **A picture that all lies** (`lies`) lies whole and flat on the lying plane, its anchor at the base point: its rows
  above the anchor toward +s, those below it toward −s, in the picture's colors.
- **A board reaching below the ground** (a negative `groundOffset`) is not treated apart: it passes through the ground,
  which hides what lies under it, and transparent ground shows it.
- **Shadows.** Whatever casts a shadow in the game casts one: every picture whose image has a shadow frame, fixed
  objects and movable ones alike. The shadow's anchor is the game's (`compileCourseSprite`'s): on the road beneath the base
  point, for a floating picture too, its frame flat on the
  lying plane, at the level the picture is drawn at; the ground within its outline is drawn at half brightness, as the
  game draws it, once however many shadows overlap.
- **Boards repeating sideways** (`extend`) repeat within their plane toward the side the game repeats them, every
  `W / 40` m, and stop at the edge of the ground drawn at their station (the outer edge of its opaque colors, or the
  display width where that cuts it). The picture itself is always drawn; each repetition folds as above. Each
  repetition, the picture itself included, is one board at one depth, as the game draws a picture: it is drawn at the
  level its scale at its own centre picks (across what it shows, and halfway up the picture as it would stand).
- **Ground.** The resolved Strips are drawn as they are, as cross sections along s; transparent ones are not drawn.
  The ground within the course limits is always drawn, and beyond them out to the display width, which the page sets.
  Where ground from two parts of the course lies at one place and one height, the ground nearer its own course limit
  shows.
- **One-to-one.** The compiler's clearance (where a Section's plan stops being one-to-one) is shown as a line, and the
  colored ground beyond it can be marked. The viewer finds no overlap of its own.
- **Sky.** The sky lies on a sphere at infinity, by the game's mapping: a direction of yaw ψ shows image x
  `f · (ψ − yawOrigin) + centerX` (`backgroundYawX`), repeating at the image's width, and of elevation e image row
  `imageHorizonY − f · tan e`, edge rows repeating, at the camera definition's focal length `f`. The sky is the one of
  the environment at the point of interest, as the game's is the one at the point its camera follows.

The **course map** (the Map button) draws the whole course on the land around it, a picture the game does not use.
Each placed Section is a ribbon: its road and ground out to its course limits, at its profile's height Y(s), level
across. The map's grid covers the ribbons' rectangle seen from above and a margin around it (100 m at first) with nodes
a spacing apart (2 m at first); a grid of more than 4,000,000 nodes is coarsened to the finest quarter metre that holds
no more. A node lies on each ribbon that covers it, edges included.

1. **Terrain.** The terrain's heights H at the nodes and its walls J minimise
   `E(H, J) = Σ [(1 − t) |∇²H|² + t |∇H|²] + λ Σ_ribbon n (Y − H) + μ Σ_sides ℓ |J|` under `H ≤ Y` on every ribbon
   node, where `∇²H` is the Hessian (a thin plate, free at the grid's edges), Y the lowest covering ribbon's height and
   n how many ribbons cover the node, each sum taken over the grid's area with differences between neighbouring nodes.
   A wall stands on each grid edge a ribbon's left or right edge crosses between a node it covers and one it does not,
   unless another ribbon covering the second carries the road on within 1 m of its height (as at a seam or a fork); ℓ
   is the length of side the edge stands for, `spacing / (|n_x| + |n_z|)` for the side's normal n. Its J is how far the
   ground beyond it stands above the ground before it carried across: each difference of E across the edge counts the
   far node's height less J, so the ground beyond continues the near side's surface shifted by J, and where J is 0 the
   ground runs on across the edge as without a wall (a difference along a line counts its nodes from its first node's
   side; a cell's twist counts each node across from that side by its own walls there, their mean, and any other as its
   neighbours). J may be either way: up, a cutting beside the road; down, the road on a wall above the ground. The
   tension t (0.3 at first) weighs the membrane against the plate; λ (1 per metre at first) is how hard each covering
   ribbon pulls the ground up to it; μ (1 at first) is each square metre of wall's cost, so a wall stands only where it
   saves more bending, stands upright and is as high as it must be. E is convex and has one minimum. Where ribbons
   overlap, the ground stays at or under the lower one: the lower road runs between walls under the higher one, which
   stays on the ground and bridges only the lower road's width, and roads close beside one another at different heights
   are parted by a wall. The terrain is solved off the page's thread, coarse to fine: at each spacing from the coarsest
   of 8 m or less down to the grid's own (a coarser edge has a side where an odd number of its finer edges have one;
   each finer wall starts from the nearest coarser one along its axis), the ribbon nodes the coarser solution held are held at Y, the walls it stood stand,
   and the free nodes and standing walls are solved together by conjugate gradients (to 0.1 mm), each standing wall
   pushing back by its cost `μ ℓ`; then a held node the ground pulls down harder than its ribbons pull it up is let go, a
   free node above its ribbon held, a wall whose J crossed zero laid down and a laid wall the ground pushes harder than
   `μ ℓ` stood, until neither set changes (the primal–dual active set method). The solve is preconditioned by a
   Galerkin multigrid V-cycle of the heights with each standing wall's J counted from the heights across it (so the
   ground beyond a wall moves with it) and each wall's own share. Ground that standing walls cut off from every held
   node, which nothing in E holds, is first moved to where it costs least, its ribbons' pull against its walls' costs,
   and the wall or node there laid down or held. The page shows the progress, the time and the terrain's range of
   heights; the same course and settings give the same terrain.
2. **Stripes.** The terrain is striped by a phase θ: bright where `cos θ > 0`. On each side of a ribbon, the outermost
   ground color's switches along s bound its bands: a band lies between two switches of one pair of colors (the colors
   before and after it the same, its own the other). On a band θ runs linearly in s by π, from `−π/2` on the brighter
   color's bands and from `π/2` on the darker's, so its switches are where `cos θ` changes sign; where the colors do not
   switch so, nothing holds θ. Off the bands θ follows a target gradient ω: the nearby road's direction, as a line
   field `e^{2iα}`, times `2π` over the nearby bands' period (twice a band's length along its outer edge), so the
   stripes keep their spacing. The direction (known on every ribbon node) and the period (on every band node) are
   carried over the grid as the membrane carries them (the terrain's energy with t = 1 and no pull, on a grid of 16 m
   or less), and `ψ = e^{iθ}` minimises `Σ_edges |ψ_j − ρ_ij ψ_i|²` over the grid's edges with ψ fixed on the bands,
   where `ρ_ij` turns by `ω · (x_j − x_i)` (ω averaged over the edge) and conjugates across an edge where the line
   field's chosen direction flips (Knöppel, Crane, Pinkall and Schröder, _Stripe Patterns on Surfaces_, 2015). Where the
   directions cannot close, ψ falls to zero: a small branch point. ψ is solved coarse to fine, every other node's
   solution carried to the next finer by ω, each by conjugate gradients with a symmetric Gauss–Seidel preconditioner to
   10⁻³. Within each triangle of the grid the phase is the paper's: from its first corner's `arg ψ` along each edge by
   ω and the turn left to the other corner's ψ, linear between them, so a stripe may be narrower than a cell.
3. **Colors.** Each band's pair is its two colors. Each pair's share (1 on its bands, 0 on the others) is carried over
   the grid as the period is, and every point takes the pair whose share is largest (a random walker's rule): each node
   keeps its two largest shares, and within a triangle each pair's share runs linearly between its corners (none where
   a corner does not keep it), so the boundaries between pairs are straight within a cell, not its edges. Without
   bands, the terrain is drawn in one color.

The course map draws the ribbons' ground as the viewer draws it, ending at the course limits (so boards repeating
sideways stop there), and the terrain beyond, which takes the place of the ground beyond the limits and the display
width. The terrain gives way to the ribbons where it meets them, as ground beyond its limit does, so the ribbons lie on
top and a bridge's ground shows beneath it. A wall stands upright where its side crosses the grid: each cell a wall
crosses is cut along the side (straight across where one side crosses it, else each corner's quarter about its centre),
each part drawn at its own side's heights, the ground beyond a wall carried on from its top or foot, and the wall
between them in the darker color of its ground's pair; the cut cells keep their triangles' stripes and pairs. Seen
whole, the terrain is drawn at every second node (or fourth, …) so that no more than about a million cells are drawn
(and the walls only at every node); where a stripe is narrower than a pixel its pair's colors blend to their mean. The
course map's settings are the grid's spacing and margin, t, λ, μ, the height scale and the stripes (on at first; off,
each pair's mean). The height scale (1 at first) stretches the heights of the ground, the ribbons and the terrain alone:
what stands on the ground (a wall, a standing board, a curtain) keeps its height above it and a picture its size, what
lies on it lies on the stretched ground, the lines are stretched whole, and the game's camera stands as high above the
stretched road as above the road.

**Light** is the viewer's own, read by every drawing it lights. Shading (off at first) lights the ground (in colors or
materials, beyond the limits too), the course map's terrain and walls and the visible walls: each one's color times `a +
(1 − a) · max(n · l, 0)`, where n is its facet's normal (an upright facet's toward the eye, one seen from below turned
up), l the direction toward the sun and a the share the light gives everywhere (Ambient, 0.25 at first). The sun stands
at an azimuth, in degrees from +z (Top's up) toward +x (Top's right) as the camera's yaw turns, 315° at first, and an
elevation, 45° at first: from Top's upper left at 45°, as a map's relief is lit (lit from the lower left, relief reads
inverted). Changing the light only draws again. With Cast shadows (on at first, with Shading) the light reaching a
point, v from 0 to 1, multiplies the light's own share: `a + (1 − a) · max(n · l, 0) · v`. The ground (in colors or
materials, beyond the limits too), the course map's terrain and walls and the visible walls cast shadows and receive
them, as they are drawn: the heights stretched, the terrain at the detail the view draws it and the course map's walls
only where it draws every node. Lines and marks, the translucent curtains (the ground beyond the clearance, the course
limits, the invisible walls) and the sky neither cast nor receive. A picture is not lit by its board's facing: every
standing one faces −s, and lit so a tree with its back to the sun would be black. Standing or lying, it is lit as its
lying plane (the road's plane at its anchor's station), `a + (1 − a) · max(n · l, 0) · v` with n that plane's normal and
v found for each pixel (read off the maps from a texel and a half toward the sun, off its own board), so in sunlight it
is as bright as the road at its feet; a board seen from behind is darkened as before, under the light. The standing rows
(standing rows, boards repeating sideways, movable objects) cast shadows in the shape of the picture's level they are
drawn at, palette index 0 cut away: as flat as the board, broad toward the sun and thin edge-on. The lying rows (folds
and pictures that all lie among them) receive shadows but do not cast them. The shadow pictures stay apart from the
light's shadows. v is read from shadow maps the sun draws, each a depth map seen along its rays: four cascades (one in a
parallel view, whose scale is the same throughout) of 2048 texels a side, splitting the view's depth from its nearest to
its farthest shown ground, not its near and far planes, each split leaning toward geometric (0.8). Each map covers the
sphere about its piece of the view, its splits and radius held to steps and its centre to whole texels so that it holds
still as the view moves, and reaches toward the sun as far as anything that casts, so what lies outside the view casts
into it. A point is moved a texel and a half along its facet's normal and compared, half a texel toward the sun, with
the map over 3 by 3 texels, each a bilinear comparison; a cascade's last tenth blends into the next.

**Export PNG** draws the current view again as a picture of its own, of the screen's shape and the width the page sets
(4096 pixels at first, at most what the GPU draws), and saves it as a PNG file. It draws what the screen shows, by the
same layers and settings, with the lines and labels as wide against the picture as on the screen, before the sky (where
its layer is shown), a solid color or nothing (transparent), with shadow maps as fine against its pixels as the screen's
against the screen's (at most 4096 texels a side); the terrain may draw one cell for every two of its pixels. The same
course, view and settings give the same picture on one GPU.

Layers turn on and off one by one: the ground (colors or materials, beyond the limits, the clearance line, the ground
beyond it), the road (centreline and distances, lanes, Boundaries, the plan's straights and arcs with their radii, the
profile's PVIs, vertical curves and grades, whose colors step at ±20 % and ±25 %), the walls (visible, invisible and the
course limits, the unseen ones as translucent curtains), the boards (standing rows, lying rows, pictures that all lie
among them, boards repeating sideways, movable objects, the contact lines, base points, and outlines and folds, which
show each repetition), the shadows (the shadow pictures, every shadow the game casts, apart from any other layer), the
marks (Section ends, start, checkpoints and finish, the grid), the sky, and the boards colored by how they are written
(a repeat's original or copy, one element by reference or by number). At first only what the game shows is on: the
ground, the visible walls, the boards, the shadow pictures and the sky.

The camera is a first-person one: it has a place and a direction (yaw and pitch) and no point it turns about; its pitch
stays within ±89° (straight down for Top), and it may go under the ground to see what is hidden. With a mouse, the first
button's drag turns it where it stands (across for yaw, up and down for pitch), and a double click on the view holds the
pointer, so the mouse turns it without a drag until Esc lets go; W and S move it along its view (rising or falling with
it), A and D sideways, E and Q straight up and down, five times as fast while Shift is held; the wheel sets the speed
(30 m/s at first, by 1.25 a notch, shown on the page), or in a parallel view the scale. On a touch screen, one finger
on the right half turns it, the left half is a stick whose direction and distance from where it touched move it (its
speed in proportion to the distance), and two fingers moving up or down together raise or lower it. A tap or click
that does not move shows the board under it.

A slider moves the camera along the Route: to its station, keeping where the camera stands relative to the road (along
it, across it from the centreline and above the road) and how it looks against the road's heading and grade; so does a
change of the height scale. Three views are offered, each then moved by hand as any other: Top looks straight down from
as high as shows the whole course; Side looks across at the road at the slider's station from 200 m to its right and
20 m above it; and the game's camera (the camera definition's place and field of view behind a car standing in the
drive's lane at that station, facing along it and pitched to the road's grade there, the lying plane's, the camera
fixed to the body as in the game); and the projection is perspective or parallel.

**Drive** sends one car along a lane of the Route with the camera on it, where the camera stood relative to the car
when it set out (the game's camera's place, D_cam behind and h above its base point, when it starts from the game's
camera); the car keeps to its lane's centre, along it and pitched to the road's grade, with no spring, and the camera
keeps its height above the road and its direction against the road. Its lane is one of those at the slider's station,
numbered from the left (the one nearest the centreline that has room for a car 1.8 m wide at first), carried along the
Route by the race's rule for a driver's lane (`createCourseForkField`'s `carry` and `targetL`: across each seam the
lane continues; at a fork the first exit, as the map lays the course out); where its lane ends ahead (narrower than the
car, or at a seam it does not continue across) it moves to the lane beside it that continues, as a driver's path
offset moves, by a cosine blend over `max(30 m, speed × 1.5 s)` (`PATH_OFFSET`). Its speed is set in km/h (120 at
first, 0 to 400). A circuit's car laps on, any other stops at the Route's end; the slider and its station follow the
car. Looking round and moving by hand while it goes change the camera's place on the car, which it then keeps. In the
course map and under a height scale it rides the stretched road. A tap on a board shows its data (kind,
position, height, image and palette, its placement and repeat, its Section), and "Look here" puts it at the middle of
the view, the camera looking as it does, 20 m before it. The view is fitted to the game's 320 by 240 frame at its
focal length; touch selects no text and opens no menu.

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

### Road data commands

The road data tool reads an original's road data from its program ROMs ([Original road data](original-road-data.md)). It
runs as `npm run road-data -- <command>` (each original's commands are its `<original>-commands` module's, what they
share `road-data-commands`'); it reads K's ROM zip in `reference-media/outrun/rom/` (TURBO OUTRUN's in
`reference-media/turbo-outrun/rom/`, SUPER HANG-ON's in `reference-media/super-hang-on/rom/`, ENDURO RACER's two in
`reference-media/enduro-racer/rom/`, SUPER MONACO GP's in `reference-media/super-monaco-gp/rom/`) and writes dumps under `rom-data/` beside it, which Git ignores, and what it raises
from the ROMs under `content/`. Every command finds each ROM of a set by its CRC-32 and size, whatever the zip names it,
and refuses a set missing one ([Rules of the originals](original-road-data.md#rules-of-the-originals)):

| Command                  | Purpose                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outrun-read`            | Check the ROM zip (`--zip`, else the one zip in the ROM directory) and write every stage's, the fork's and the goals' tables to the dump (`--out`)                                                                                                                                                                                           |
| `outrun-hills`           | Write each stage's (or `--stage`'s) road top by the original's hills from the dump, the holds counted at `--kmh`                                                                                                                                                                                                                             |
| `outrun-course`          | Write OUTRUN's roads, raised from the ROM zip (`--zip`), to `content/courses/`, and the boards of the sprites its stages and start show, in the ROMs' pixels, and its stage skies to `content/images/`, or with `--check` fail where one differs                                                                                             |
| `outrun-sounds`          | Write the local originals of the recordings the original plays from its PCM ROMs, from the ROM zip (`--zip`), with ffmpeg                                                                                                                                                                                                                    |
| `turbo-outrun-read`      | Check TURBO OUTRUN's ROM zip (`--zip`) and write every table its course uses to the dump (`--out`), the tables described as OUTRUN's checked against OUTRUN's zip (`--outrun-zip`)                                                                                                                                                           |
| `turbo-outrun-course`    | Write TURBO OUTRUN's four courses, a leg each, raised from its ROM zip (`--zip`), to `content/courses/`, and the pictures their objects show and the skies to `content/images/`, or with `--check` fail where one differs                                                                                                                    |
| `super-hang-on-read`     | Check SUPER HANG-ON's ROM zip (`--zip`, else the one zip in its ROM directory) and write its courses' tables to its dump                                                                                                                                                                                                                     |
| `super-hang-on-course`   | Write SUPER HANG-ON's four courses, raised from its ROM zip (`--zip`), to `content/courses/`, and the pictures their objects show and their skies to `content/images/`, or with `--check` fail where one differs                                                                                                                             |
| `enduro-racer-read`      | Read ENDURO RACER's two ROM zips (`--zip`, else `enduror.zip`, and `--bootleg-zip`, else `endurobl.zip`, in its ROM directory), and write every table its course uses to its dump (`--out`)                                                                                                                                                  |
| `enduro-racer-course`    | Write ENDURO RACER's course, raised from its two ROM zips (`--zip`, `--bootleg-zip`), to `content/courses/`, and its skies to `content/images/`, or with `--check` fail where one differs                                                                                                                                                    |
| `super-monaco-gp-read`   | Read SUPER MONACO GP's ROM zip (`--zip`, else the one zip in its ROM directory), and write every table its courses use to its dump (`--out`)                                                                                                                                                                                                 |
| `super-monaco-gp-course` | Write SUPER MONACO GP's two circuits, raised from its ROM zip (`--zip`), to `content/courses/`, and their skies and boards to `content/images/`, or with `--check` fail where one differs                                                                                                                                                    |
| `originals`              | Raise every original again from its zips in its ROM directory: OUTRUN's boards and courses, then each other original's courses, one line of JSON each, or with `--check` compare them all and write nothing; a failure is reported and the rest still run ([Raising the originals again](original-road-data.md#raising-the-originals-again)) |
| `screen-pieces`          | Solve the grades' pieces from the ROM zips (all, or those `--table`, `--kmh`, `--cycle` and `--hill` name) and write `tools/road-data/screen-pieces.json`, or with `--check` fail naming each that differs and by how much; `--sensitivity` names those a ±1e-9 row shift moves; over half an hour                                           |
| `positions-at-speed`     | Run OUTRUN's, TURBO OUTRUN's and SUPER HANG-ON's objects tick by tick at `--kmh` (15) as their programs do and compare each with the speed-0 limit ([Time made into position](original-road-data.md#time-made-into-position)): by road, stage or course, the pairs within a tick's advance, the most apart, the unpaired; it writes nothing  |
| `height-ticks`           | Check the heights' procedure (`procedureTick`) against each original's sub program run tick by tick by `cpu-68000`, from the ROM zips: every table the courses name at the original's top speed (or `--kmh`; `--table` one), failing at each table's first tick and line whose word differs; writes nothing                                  |

### Local originals

A local build can play an original's own voices and effects, converted from its ROMs, in place of the published
recordings. They are for K's own runs only: they never reach Git, a PR or Pages.

- **Where.** A local original is a file under `reference-media/originals/` (which Git ignores) at the path, under
  `content/`, of the published file it replaces. A file with no published counterpart is left out.
- **Identity.** An original keeps the published file's name; only its sound differs, so nothing the course identity
  reads changes and the measured products saved for the published content stay valid.
- **Conversion.** The conversion is deterministic: `npm run road-data -- outrun-sounds` writes the originals of the recordings
  the original plays from its PCM ROMs, with ffmpeg ([Voices and effects](outrun-road-data.md#voices-and-effects)).
- **Build.** `npm run build:originals` runs `npm run build` with the originals in place of the published files of their
  paths. It writes `dist/originals.json` listing them, and DEV's toggle reads `LOCAL ORIGINALS`. The workbench's
  authored files carry the originals too. A build with `CI` set refuses it, so CI and Pages never use them.

To run them: put K's ROM zip in `reference-media/outrun/rom/`, run `npm run road-data -- outrun-sounds`, then
`npm run build:originals`, serve the repository root (`python3 -m http.server 8000`)
and open the game with `dev=1`.
`npm run build` returns to the published files.

### Research tools

`tools/research/` holds small Python scripts for researching an original's ROMs before the road data tool reads its
tables. They are research aids, not authoring implementations: they write no content, and the build, the lint, the tests
and CI never run them. They need Python 3.11 or later, and `dis68.py` needs capstone 5 (`python3 -m pip install -r
tools/research/requirements.txt`; it needs capstone even for `-h`). They run as `python3 -I tools/research/<script> …`,
so that they import nothing from the current directory or a zip's folder. Each prints its usage with `-h`; an error ends
it with a message or a Python traceback, outside the command-line tools' JSON diagnostics. What they print or write
(program images, listings, string lists) is research output under the [rules of the
originals](original-road-data.md#rules-of-the-originals): it never enters Git, a PR body or a PR image. None of them
decrypts a program, and a MAME driver source is read for its ROM lists and set names alone. The procedure they serve is
[Raising an original from its ROMs](original-road-data.md#raising-an-original-from-its-roms).

| Script             | Use                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `zip_list.py`      | Each entry of a zip: name, size and CRC-32, checked against its data; the zip's SHA-256                              |
| `rom_set_check.py` | A zip against a set's ROM list in a MAME driver source: missing, extra, renamed and bad ROMs                         |
| `interleave.py`    | A 68000 program image from its even-byte and odd-byte ROMs, written outside the checkout or under `reference-media/` |
| `dis68.py`         | A 68000 listing of an image's address range                                                                          |
| `listing_range.py` | The lines of a listing in an address range                                                                           |
| `callers.py`       | The routine holding an address and its direct callers                                                                |
| `rom_strings.py`   | Printable text in an image, with addresses                                                                           |

### Skies command

The skies command draws every course sky that has a source, `content/sky-sources/<name>.png` with its entry in that
directory's `recipes.json`, as a tile picture 80 tiles high and opaque, and writes it as the course image
`content/images/<name>.json`, printing one JSON result (or the diagnostics, exiting 1):

```sh
npm run skies
```

Skies without a source are left as they are; with no `recipes.json` it draws none.

### Screens smoke

`npm test` renders the front end's screens headlessly through the same screens the page shows, from the delivered
content and the driving scenarios' test series, a DEV series with race tracks whose SELECT MUSIC and series change
it draws (`tests/infrastructure/screens-smoke.test.mjs`), and saves each drawn frame to `dist/screens/<name>.png` at
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
| `outrun-course`   | Course file name stem (the course selection key)                                                        | `courses/<id>.course.json`                | Course document                                                                                                                 |
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
The browser-tools build writes only `dist/tools`: the bundled workbench and course viewer, and the license of the PNG codec the workbench bundles. The content build writes `dist/delivery` with the authoring core ([Architecture](architecture.md#layer-boundaries)):
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

## Racing vehicle authoring

`npm run racing-pictures -- <vehicle ID|all> [replace]` bakes the original procedural provisional shapes in
`tools/graphics/racing-vehicle-shapes.ts` through the shared vehicle picture camera. It refuses to overwrite a saved
set without `replace`, and writes six complete direction/bank check sheets to `dist/racing-pictures/`.
The five IDs, historic evidence and visual limitations are in the [racing vehicle ledger](racing-vehicles.md).

`npm run racing-validation` compiles the authored catalog and measures all five through the ordinary solver on a flat 60 km dry straight
from rest for 240 seconds, then brakes and restarts, and checks a separate cornering transient. It writes
`dist/racing-validation/measurements.json`; no measurements alter the vehicle data. The racing-vehicle scenario tests
also save actual shared-scene driving frames to that directory.

## Production road motorcycle authoring

`npm run road-bike-pictures -- <vehicle ID|all> [replace]` bakes the five selections in the
[road motorcycle ledger](road-bikes.md). `tools/graphics/road-bike-shapes.ts` supplies their provisional geometry,
surface classifications and palettes to the existing common picture baker. Its `all` selects only these five
road motorcycles, leaving the racing sets untouched. Saved sets require `replace` to overwrite.

`npm run road-bike-validation` measures these five admitted vehicles through the shared solver and writes
`dist/road-bike-validation/measurements.json`. It records 240 seconds of acceleration, the final speed range and
whether it has settled, actual upshifts and downshifts, braking, an eight-second restart, left/right steering
transients and a separate braking run starting at exactly 100 km/h. The report states the surface, inputs,
initial conditions and stop criteria. The delivered-catalog tests save actual game frames to the same directory.
The racing validation command keeps its original targets. Neither measurement command edits vehicle data.

## CHASE H.Q. and Turbo OutRun vehicle authoring

`npm run chase-turbo-pictures -- <vehicle ID|all|review> [replace]` uses the fourteen selections in the
[arcade car ledger](chase-turbo-vehicles.md). Its original provisional geometry goes through the existing common
picture baker. `review` reads the saved sets and exports labelled PNGs without rebaking; `replace` permits an
explicit overwrite. Outputs, including all directions, six LODs, palette/brake sheets and per-game overviews,
are written to `dist/chase-turbo-pictures/`.

`npm run chase-turbo-validation` observes those fourteen admitted vehicles through the existing acceleration,
braking, restart and cornering observer. It writes conditions and traces to
`dist/chase-turbo-validation/measurements.json`. It does not edit vehicle data or create series reference times.
