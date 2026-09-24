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
scene, race, vehicle physics, route readers, camera and rival sprite rendering as the browser.
`npm test` runs them on every CI build. After `npm run build`, use `npm run test:scenarios` alone.
The Node test runner reports total wall time and per-scenario times; these are observations, not timing gates.

Each scenario runs twice at the browser's fixed 1/60-second step and compares a digest of every
step's vehicle, recovery, progress and camera states plus outcome evidence. No pixel baselines or
wall-clock metrics enter the comparison. Rendering runs every simulated second, on recovery and finish,
and every tenth of a second outside the coordinate domain; it cycles through all three Band methods.
All live vehicle numeric leaves, camera values and route occurrence coordinates/transforms must remain
finite. Each actor's s may move at most the scene's 240 m/s loading allowance per step unless recovered.
The next pending crossing cannot move backward (an undiscovered fork successor is not a finish),
and accepted finish counts cannot decrease. Scenario-specific evidence requires actual entry/domain
exit, departure on the requested road side, selected fork, wrong-course recovery or completed laps.

The three provisional courses each exercise backward motion beyond the entry and both road sides.
Coast finishes with two rivals; fork finishes through each branch and attempts a rival-closed Carriageway;
ring finishes three laps with two rivals. A second closed-Carriageway scenario continues through player
finish and checks every actor for non-recovery s jumps. A third holds the recovered player on the brake
until the finished rival has stayed below 0.05 m/s for two seconds before the terminal, then finishes. Reverse starts with -20 m/s and neutral pedals (there is no
reverse input); lateral departures start at 30 m/s and hold steering and throttle. These are initial
conditions through the ordinary vehicle constructor, with no pose or progress edits during a run.

To add a scenario, add a policy/outcome record to the course's list, with a finite simulated work limit.
Compose ordinary inputs in the harness, and require evidence that the intended situation occurred.
Use authored grid slots, fork regions, Carriageways and crossing stations rather than world positions
or fixed ticks to locate course features. The closed-road policy lets a rival lead for three seconds,
then follows the other authored Carriageway until legal-route recovery.
When course shapes change, adapt these semantic targets and bounds instead of recording a new trace hash.
Expected results are compared between fresh runs, not committed as golden hashes. A defect regression
should fail when the original failure is temporarily reintroduced; never retain that mutation.
Visual correctness remains a manual check.

### TypeScript tools

Product and tool checking share `tsconfig.base.json`; `tsconfig.json` checks the browser product without
Node globals, and `tsconfig.tools.json` checks TypeScript tools with Node types and no emitted files.
Both roots use the same lint rules. `npm run check:dependencies` checks the boundaries described in
[Architecture](architecture.md#layer-boundaries); `check` and CI's `npm test` include it.

Run a TypeScript tool with `node --import tsx tools/<domain>/<name>.ts`. The pinned loader resolves the
product's `.js` module specifiers to TypeScript source without a tool compilation directory; it does
not replace the strict `tsc` check. Reference workers and tests consuming typed course helpers use the same loader.
Those tests import product source too, so a process has one module identity for compiled course objects.
Test files remain JavaScript. Build clears `dist`,
compiles the product, builds browser tools and sprite content, then generates course/reference content in that order.

All authoring implementations are TypeScript. Browser entries and worklet adapters are bundled from
source with pinned esbuild; bundling does not replace type checking. The browser build uses pngjs's
pinned browser distribution for the same PNG codec API used by Node file compilers.

### Course commands

Run after building the completed vehicle sprite library (read as content data, not imported code):

```sh
npm run course -- compile content/courses/ribbon-coast.course.json
npm run course -- render content/courses/ribbon-coast.course.json --s 100 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- report content/courses/ribbon-coast.course.json --step 25 --out /tmp/course-report
npm run course -- reference content/courses/ribbon-coast.course.json --out /tmp/reference.json
node --import tsx tools/course/measure.ts request.json --out observations.json
```

`npm run compile:course -- <source.json> [--images directory]` reports the compiled course.
[Content and gameplay](content-and-gameplay.md#observation-formats) owns saved tool formats.
The render command uses the shared product scene; reports and preview images are disposable outputs.

### Browser tools

Run `npm run build`, then serve the repository root with `python3 -m http.server 8000`.
Open the generated pages, not the source HTML templates:

| Tool            | Local URL                                                    |
| --------------- | ------------------------------------------------------------ |
| Sprite Tool     | `http://localhost:8000/dist/tools/graphics/sprite-tool.html` |
| LOD preview     | `http://localhost:8000/dist/tools/graphics/sprite-lod.html`  |
| Engine audition | `http://localhost:8000/dist/tools/audio/audio-browser.html`  |
| Tire audition   | `http://localhost:8000/dist/tools/audio/tire-browser.html`   |

On Pages these same `tools/...` paths live beneath `build/<commit>/`, where `<commit>` is the
published `version.txt` value. Each tool, its shared chunks, worklets, stylesheet and sample assets
resolve within that one build. The ordinary build command is the only generation step.

The file compilers are `npm run build:sprite-source -- <arguments>` and
`npm run build:sprite-lod -- <arguments>`; [Image assets](image-assets.md) owns their formats.

### Audio audition

Both auditions use production voices and render at 48 kHz with fixed playback gain; game audio uses
the device's supported native rate. [Browser tools](#browser-tools) gives the build and opening instructions.

For engine adjustment, select a catalog profile and compare steady RPM/excitation with acceleration
and coast. Commit settings before the next audition playback. Keep playback gain fixed when comparing
timbre or output level. For tire adjustment, use independent front/rear/both scenarios for rolling,
cornering, wheel lock, loose surfaces and release. R/Q output controls isolate the two components.
[Calibration](calibration.md) gives values; the audio specifications define their effect.

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

`dist/` contains compiled product ESM and bundled browser graphics/audio tools, not Node build-script output. `dist/content/` contains course JSON, compiled
images/sprites and the content manifest. Course JSON retains authored Strip constructs; the shared compiler expands them and builds immutable
preblend fields before browser driving or headless rendering. Expanded Strips and their profiles are
in-memory compiler products, not committed files or an additional delivered image format. Build also generates
vehicle envelopes, continuous reference runs and game time budgets. Matching disposable data under
`.cache/course-reference/` is reused; changed inputs regenerate it. Browsers load these products.

| Output                                         | Use                                      |
| ---------------------------------------------- | ---------------------------------------- |
| `dist/content/envelopes/<vehicle>.json`        | Rival driving envelopes                  |
| `dist/content/budgets/<course>/<vehicle>.json` | Timed Session budgets                    |
| `dist/offline/reference/<course>.json`         | Full reference runs, excluded from Pages |
| `_site/build/<commit>/`                        | Complete commit-versioned Pages build    |
| `_site/version.txt`                            | Published build identifier               |

Dependencies, caches, dist, previews and Pages staging are generated rather than committed source.
Pages serves one complete commit-versioned ESM build, including its relative module URLs.
After `npm ci`, `node --import tsx tools/build/verify-published-site.ts <Pages URL> <commit>` checks the public
version and starts the served game in headless Chrome. `CHROME_BIN` selects a local Chromium executable.
