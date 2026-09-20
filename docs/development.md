# Development, validation and release

Current implementation is described below. The [Course Editor target](#course-editor-target-validation) is a separately scoped future contract. Activate each change only with its executable coverage; this document does not report that the target is already implemented.

## Local workflow

Use Node.js 24 (package engines and engine-strict enforce the supported major). Run `npm install` and complete `npm test` at every implementation milestone and release candidate; CI uses `npm ci` for the lockfile. `npm run check` runs lint, formatting and strict type checks; `npm run format` applies the shared formatting rules. `npm run build` clears dist and compiles TypeScript ESM; `npm test` runs lint, formatting, the build and the complete executable suite. [Build outputs](#build-outputs) separates production modules from generated fixtures. Serve the repository over HTTP, for example `python3 -m http.server 8000`. Generated dist, dependencies and Pages staging are not source files.

Follow [AGENTS](../AGENTS.md) for the branch, architecture and release gates.

For engine tuning, open `http://localhost:8000/?mode=linear` and open DEV to adjust ENGINE
TUNING controls while driving. MASTER also uses minus/plus buttons. [Tire audio](tire-audio.md#shared-comparison-and-transport) defines the selectable methods and their session behavior.
The separate audition/verification page is
`http://localhost:8000/tools/audio/audio-browser.html`. Use the same HTTP server and freshly built
checkout for both; opening the HTML directly with `file://` is not the supported module/worklet
delivery path. Rebuild after TypeScript edits, then reload the target page. Reload resets
session-local tuning. See [audio](audio.md) for signal order and parameter ownership.

## Numerical regression environment

Run acceptance on the supported Node 24 environment. For a numeric failure record the exact source,
lockfile, Node/V8 versions, OS/architecture, inputs and sample rate. A Node 22 failure is outside the
supported envelope, but environment causation remains a hypothesis until matched reproduction.
A green CI result does not prove bit-identical transcendental arithmetic across every host/runtime.

Fixed Float64 PCM hashes preserve an accepted trace in its reference environment; causal sound tests
and same-host paired replay establish different evidence. Keep those distinctions when updating the
execution environment. Reproduce baseline and candidate together before classifying a mismatch;
retain the failure evidence and review any replacement contract explicitly. Do not refresh a hash,
round samples or relax a valid assertion merely to make an unsupported run pass. This course-authoring
preparation neither changes synthesis nor resumes deferred method selection or calibration.

## Agent production tools

Use Node 24 and `npm run build`. The shared scene supplies the same camera/renderer in Node and the browser.
The current LINEAR can be rebuilt entirely from the saved analyzed-data observations and recipe
(run `npm run format` before committing generated JSON):

```sh
node tools/course/fit.mjs content/authoring/linear.observations.json content/authoring/linear.fit.json --out content/courses/linear.course.json --distance-scale 1.05 --curvature-scale 0.94 --height-scale 0.8
npm run course -- compile content/courses/linear.course.json
npm run course -- render content/courses/linear.course.json --s 1200 --l 0 --vehicle TESTAROSSA --out /tmp/course.png
npm run course -- render content/courses/linear.course.json --start 45 --end 2845 --step 400 --vehicle VFR750R --out content/authoring/linear-preview/frames
npm run course -- report content/courses/linear.course.json --step 25 --out content/authoring/linear-preview
```

`compile`, `render`, `report`, `fit.mjs` and `measure.mjs` return one JSON object on stdout and exit
nonzero with structured diagnostics on failure. Invoke `node` directly when parsing stdout.
`--images` overrides the sibling image directory; `--section` selects the canonical source Section.
Render takes `--s` or all of `--start/--end/--step` (at most 240 frames), plus optional `--l`,
`--vehicle` and `--exit` (canonical fork Link selection). It writes 320×240 PNGs; no preview renderer
or dynamics tuning exists. Report writes `report.json`, `report.txt`, five-panel `bands.svg` and
`plan.svg`; inactive Boundaries are null/NA. `--step` limits regular sampling to 4096 stations;
height/Boundary knots are also sampled. Node writes deterministic, self-contained SVG; report generation has no Python dependency.

For a calibrated video, extract PNGs with `ffmpeg -i input.mp4 -vf fps=2 frame-%04d.png`, then run
`node tools/course/measure.mjs request.json --out observations.json`. Preserve timestamps and source
edition; [Content](content-and-gameplay.md#agent-authoring) owns request/observation semantics and
fitting limits. Inspect measurements/residuals, classify scenery/environment/checkpoints, edit the
intermediate file, fit, compile, render, and compare. Video pixels never become game assets.
Verify extraction and image inspection in the actual environment; unavailable capabilities belong
in NEXT Open decisions. The checked-in LINEAR observations are synthetic analyzed data, not a claim
of video reconstruction. Its current preview directory is reproducible from the commands above.

Open `http://localhost:8000/?mode=linear` for the same assembly. Build stages course/image and completed-ground bytes
in `dist/content`; Pages verifies version, commit-versioned boot and every content SHA-256 digest.

## CourseDocument compiler

`npm run course -- compile content/courses/linear.course.json` reads saved JSON and exact image
bytes through the public admission/compiler boundary. It returns machine-readable identities,
counts, resident-ground capacity accounting or structured diagnostics and leaves source unchanged. `compile:course` remains a basic
compiler report for geometry-only inputs, accepting only the source and optional image directory.
[Content](content-and-gameplay.md#coursedocument-v8-implemented-compiler-boundary) owns schema v8,
compiler v15, canonical references, admission limits and failure semantics.

The product root's contact/step guard admission and local geometry checks are covered by direct
causal tests. Ground samples prefiltered resident images. Longer view consumers read source-owned spans.
Saved LINEAR/SEAM/CIRCUIT/BRANCH integration tests exercise the shared browser/headless assembly,
car and bike mechanics, frame commits, reversal, recovery, laps, field choice and merge identity.
Fork integration observes competing physical crossings, half-open median ownership, ordinary closure
recovery without progress, state-selected signs and both paths into the same successor. F110 and RC30
runs cover the provisional 400 m lock-to-closure transfer at ordinary driver speeds; these examples
are content checks, not production AI or universal lane-change qualification.

Capacity fixtures exercise large source loops and local geometry ambiguity without source copies.
The [window tests](../tests/runtime/course-geometry-window.test.mjs) cover the finite admitted intervals;
actual product sessions bound retained and selected occurrence history independently of source size.

## Course scene performance

After building, run `node tools/performance/course-scene.mjs --frames 300 --rivals 16`.
Optional `--mode linear|seam|circuit|branch` selects one scene. The probe uses the actual scene,
field, mechanics and renderer with a car profile, 30 warmup frames, then measured 60 Hz steps.
It reports setup, median/p95/max frame and fixed-step times, maximum successful seam commit time,
and V8 sampled allocation bytes in a separate 30-frame pass (including collected objects; 16 KiB sampling interval).
Allocation is an estimate, not retained heap growth. Setup and explicit repositioning are excluded.
This Node host measurement excludes browser, audio and compositor work and cannot certify a phone.

The browser HUD displays FPS, maximum CPU frame/step time and frame interval over each half-second,
plus the scene's lifetime maximum seam commit. Check LINEAR curves/hills, SEAM forward/reverse,
CIRCUIT lap seams and BRANCH lock/closure on an iPhone-class device. Acceptance requires sustained
60 fps and each seam commit within 16.67 ms, with actual browser/audio work included. Report host
measurements and human device evidence separately; an unmeasured device remains unqualified.

## Sprite LOD preview

After `npm run build`, serve the checkout and open `tools/graphics/sprite-lod.html`. The same page
is staged at `build/<commit>/tools/graphics/sprite-lod.html` for Pages; all imports stay within that
commit's complete build. It compares automatic LOD and master-only drawing through the common
product blitter, including continuous depth, subpixel anchor offsets and odd/thin synthetic frames.
It can load a completed LOD JSON and download the currently loaded record. The 8 MiB preview-file
limit is a local admission policy, not a production asset or smartphone memory budget.

[Architecture](architecture.md#sprite-lod-metric-and-read-contract) owns dimensions, mapping,
palette/index validation and the interchange schema. The preview neither filters imported images
nor certifies transition quality. Synthetic colors deliberately identify selected levels. The
product's current source-art pixels remain covered by the fixed reference; causal LOD tests cover
the new read/blit contract, including course sprites, dynamic vehicles and the player in one Painter.
The historical renderer input bridge maps a single level to its original `pixels` field and rejects
multi-level input. It never changes pixel values, reference outputs or reported workload.

## Sprite LOD file compiler

`build:sprite-lod` is a declared offline compiler entry. After a build, run:

```sh
npm run build:sprite-lod -- master.json recipe.json output.json
```

The master uses the completed-image schema with exactly one normalized level. A recipe explicitly
supplies, for example, `{"colorSpace":"linear-srgb","coverageThreshold":0.5}`. This is a comparison
example, not an approved default. `encoded-srgb` is the other implemented color-space choice.
[Architecture](architecture.md#offline-sprite-lod-authoring-recipe) owns the exact integration,
coverage and authored-palette rules. Save the recipe alongside source art; the runtime artifact
contains only completed images. Output must be a new path, preserving the source, recipe and prior
product on failure. The command reports the output digest, bytes and level count.

`npm run build` also compiles checker/coverage comparison samples for the preview using explicit
diagnostic recipes. Select either compiled checker in the preview to compare it with its master.
That diagnostic viewer performs no image filtering. The separate Sprite Tool below compiles
authoring inputs before play through the same source and LOD functions.

## Sprite PNG source compiler

After building, the declared `build:sprite-source` entry imports a static 8-bit PNG into an editable,
single-level master. Supply a PNG already prepared in sRGB; this adapter does not convert embedded
color profiles. The command uses the pinned `pngjs` decoder with checksum validation and checks
source size/dimensions before decoding. [Architecture](architecture.md#external-sprite-source-normalization)
owns metric rounding, crop, anchor, alpha, palette and admission rules.

For example, an existing 160 by 100 pixel crop representing 2 m can use this source recipe:

```json
{
  "format": "superoutride.sprite-source",
  "version": 1,
  "name": "example-object",
  "crop": { "x": 0, "y": 0, "width": 160, "height": 100 },
  "widthMeters": 2,
  "anchor": { "x": 79.5, "y": 99.5 },
  "paletteRgb555": [0, 32767, 31744],
  "filter": { "colorSpace": "linear-srgb", "coverageThreshold": 0.5 }
}
```

The palette and threshold above are illustrative, not production-art defaults. Choose the palette
for the actual image, and preserve the PNG and recipe separately from the normalized master.
Then run the two offline steps, using a separate explicit LOD recipe described above:

```sh
npm run build:sprite-source -- source.png source-recipe.json master.json
npm run build:sprite-lod -- master.json lod-recipe.json sprite-lod.json
```

Both commands refuse to overwrite input or existing output files and report dimensions, byte count,
level count and output digest. Review the master before generating derivatives. Load the completed
JSON in the existing Sprite LOD preview for the product blitter. Reimporting never silently replaces
manual edits to a prior master. This file workflow shares its image boundary with the Sprite Tool
below; course placement remains a separate responsibility.

## Sprite Tool

After `npm run build`, serve the checkout and open `tools/graphics/sprite-tool.html`. Pages stages
it at `build/<commit>/tools/graphics/sprite-tool.html`, with all modules, styles, example PNG and
bundled decoder inside that commit. The existing LOD comparison viewer stays read-only.

1. Open a prepared sRGB PNG or use **Load example PNG**. A new source/session replaces the current
   edit, so save it first. File opening never uploads the image.
2. Set the integer crop and its known width in meters. Anchors are source-image texel centers;
   **Use crop bottom center** sets a visible starting reference without changing physical data.
3. Drag or enter a rectangular selection, then hide/restore it. Undo/redo retains bounded mask
   history. Restore means original alpha, not forced opacity.
4. Generate a candidate palette and edit its RGB555 values as needed. Choose source and LOD color
   spaces and coverage separately. Generation is explicit; editing the crop/mask does not silently
   regenerate the palette. [Architecture](architecture.md#sprite-tool-authoring-session) owns the
   candidate algorithm, session format and admission limits.
5. Build the master and full LOD series, then inspect depth changes in the product-blitter preview.
   Any image/recipe edit clears the preview and disables old exports until rebuilding.
6. Save the editable session and export the master, LOD or either explicit recipe separately.
   Session reopening restores the original pixels, mask and settings and reproduces the products.
   Mask history is not serialized. The source recipe describes normalization of the **masked** image;
   applying it to the unmasked original PNG is not a replay of mask edits. Use the session for that
   replay, or feed the exported master and LOD recipe to `build:sprite-lod`.

The synthetic color study exercises PNG decoding, palette reduction, partial alpha and thin geometry;
it is not production art or real-art quality acceptance. The first GUI has rectangle masking, crop,
metric/anchor controls and palette editing. Freehand retouch, variant sets, course placement, image
Material/Decal composition and Course Editor are subsequent work, not hidden runtime features.

## Validation contracts

Causal regressions exercise real physics, physical gates, handoffs, recovery, camera, rendering and input lifecycle. Boundary tests enforce the DEV dependency direction and forbidden alternate coordinate authorities. Document hygiene discovers all maintained Markdown files and validates local links. Current specifications are checked, not the preservation of chronological reports. General implementations must be reachable from a browser composition root or a declared asset-compiler entry. The M3/M4 reservation is empty; retained general components have actual product consumers. The declared offline entries are `compile:course` for CourseDocument graphs, `build:sprite-source` for PNG normalization and `build:sprite-lod` for completed sprite images, plus `tools/graphics/sprite-tool.mjs` as the authoring-side image compiler. Tests do not establish production use. Diagnostics and fixtures belong to their explicit DEV owners and need real test/tool consumers. Independently, exports must have named consumers resolved by TypeScript across source, tests and tools (including inline HTML modules); unused signature types remain module-local. This export check detects unused API but does not authorize a second implementation. Dynamic whole-module enumeration alone does not justify a named public API.

Geometry regressions are organized by projection, terrain generation, Raster/Guide geometry, sprites and key ownership rather than development milestones. Primitive, adapter and full-renderer checks retain their distinct causal scenarios. Shared numerical assertions require explicit tolerances; relative scaling and strict comparison remain call-site choices.

Some tests use explicitly fixed calibration fixtures so a failure can be reproduced after player defaults change. That does not make the old values product defaults. Do not rewrite such fixtures merely to improve their outcomes. A removed obsolete renderer or archived-document hash is different: preserve current primitive/integration coverage and delete the superseded implementation/preservation requirement.

The [workflow](../.github/workflows/pages.yml) builds a pinned, immutable released reference on the same Node/host and supplies `HOT_PATH_BASELINE_BUILD` to tests. [Exact-trace comparison](../tools/performance/hot-path-probe.mjs) covers signed wheel solves and nine-profile steering/pedal sequences at 60/120/240 Hz; it compares serialized results without tolerances or schema masking. Diagnostic input adapters accept the pinned constructor and update signatures; the unchanged terrain framebuffer fixture separately preserves projection output. These bridges change inputs only, never reference outputs, state hashes, pixels or result metrics. Local runs without that environment test determinism only; they are not historical equivalence evidence. The immutable reference pins the accepted vehicle force/control law and renderer output before structural cleanup. It is a regression oracle, not a release archive. Keep its SHA fixed in the workflow variable throughout the playable-course milestones. Refactors, API cleanup and tuning must not silently reset this oracle or normalize away differences.

Focused audio verification after building uses:

```sh
node --test 'tests/audio/*.test.mjs'
```

This is a focused diagnostic, not a replacement for full `npm test`. The [browser audio probe](../tools/audio/audio-browser.html) checks the real worklet graph over HTTP. Acoustic profile switches preserve bounded voice counts. The architecture checks recognize static worker-module URLs. Tire audio subscriptions must preserve the complete physical snapshot; the fixed historical equivalence oracle is unchanged. Presentation-anchor checks permit the optional rival observation argument without changing the anchor requirement.

For a paired host timing comparison, run `node tools/performance/hot-path-probe.mjs REFERENCE_BUILD dist`. It warms both builds, alternates five pairs and rejects different traces before reporting medians. It includes serialization overhead and does not certify a browser or device frame budget.

Useful diagnostics:

```sh
node tools/performance/hot-path-probe.mjs dist
node tools/physics/torque-protection-terrain-probe.mjs --hz 120 --out /tmp/terrain.json
node tools/physics/braking-yaw-probe.mjs
node tools/physics/bike-cg-probe.mjs dist /tmp/bike-cg.json
node tools/physics/steering-input-stop-probe.mjs
node tools/physics/torque-protection-probe.mjs --hz 120 --out /tmp/protection.json
node tools/physics/steering-input-stop-benchmark.mjs /path/to/reference/dist /tmp/steering-timing.json
```

The [torque protection probe](../tools/physics/torque-protection-probe.mjs) compares protected and unprotected drive/brake behavior. The [steering limiter benchmark](../tools/physics/steering-input-stop-benchmark.mjs) measures identical input groups against a supplied build. Retain these reproducible tools rather than copying generated reports into documentation.

## Tire comparison tools

Build before listening. Serve over HTTP (for example `python3 -m http.server 8000`); DEV exposes model-specific friction controls plus independent ENG/TIRE mix levels.
Other numeric tire timbre settings remain source data. [Calibration](calibration.md#tire-audio-tuning) maps their
owners, [audio](tire-audio.md#player-tire-synthesis) defines each method, and
[NEXT](NEXT.md#current-state) records feedback and tuning priorities.

In the game, select MODAL for the Q-only method or HYBRID for the listening reference.
HYBRID and SPECTRAL expose R/S/Q buttons. MODAL exposes only Q; R/S sources are absent. Compare its Q with HYBRID Q (R and S off)
for timbre and onset. The buttons change output only:
state continues, other components are not boosted, and
muted components still cost CPU. Keep physical calibration, engine settings and playback volume fixed
when diagnosing tire sound. Rebuild/reload after a source tune; DEV edits apply through a tire-only fade.
Reload resets model/component/tuning/mix choices.

| Tool                        | Scope                                                                                                     | Command / page                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game                        | Live mechanics, both axles, all surfaces and model-specific component controls                            | `http://localhost:8000/?mode=linear`                                                                                                             |
| SPECTRAL S/Q audition       | One asphalt contact, manual observations or shared synthetic replays; omits R                             | [tire-spectral-browser.html](../tools/audio/tire-spectral-browser.html)                                                                          |
| SPECTRAL R/S/Q render       | One synthetic contact, rotation sweep and grip recovery, separate R/S/Q/mix WAVs                          | `node tools/audio/tire-response-render.mjs /absolute/rsq-output - 48000`                                                                         |
| Six-model comparison render | Same synthetic trace; HOPF, CONTACT friction, SPECTRAL S/Q, HYBRID R/S/Q, MODAL Q and UNIFIED R/Q outputs | `node tools/audio/tire-spectral-render.mjs /absolute/sq-output 48000`                                                                            |
| HOPF reference              | Original tire audition and regeneration                                                                   | [tire-browser.html](../tools/audio/tire-browser.html); `node tools/audio/tire-render.mjs /absolute/hopf.wav`                                     |
| CONTACT reference           | Four road/friction/axle taps with representative controls                                                 | [tire-contact-browser.html](../tools/audio/tire-contact-browser.html); `node tools/audio/tire-contact-render.mjs /absolute/contact-output 48000` |
| CONTACT characterization    | Steady pitch/harmonics and interference windows                                                           | `node tools/audio/tire-contact-characterize.mjs dist`                                                                                            |

The diagnostic HTML pages are local tools, **not published Pages HTML**. They import the same compiled
kernels as the game, not frozen historical copies. In particular the SPECTRAL S/Q page includes current
Q response changes; earlier WAV approval does not mean it still produces old transient PCM.
`mix` in the SPECTRAL S/Q renderer means S+Q, whereas `mix` in the R/S/Q renderer includes R.
HYBRID R/S/Q/mix outputs isolate rolling, sliding friction, squeal and their sum. `hybrid-friction`
is S+Q. `modal-friction` is the entire MODAL Q output; compare it with `hybrid-squeal` for Q-only listening.
UNIFIED retains `unified-road`, `unified-friction` and `unified-mix` taps.
There are no MODAL R/S or redundant mix taps. None is the full game/engine mix. The standalone manual controls are raw observations, not acoustic coefficient sliders.

[Shared scenarios](../tools/audio/tire-spectral-scenarios.mjs) own the synthetic S/Q and R/S/Q traces. Their
explicit 0.3 m audition radius supplies angular speed for these fixtures only; live gameplay uses
accepted wheel angular/peripheral observations. CONTACT's own scenarios use representative controls;
identical slider numbers across different tools are not a matched physical-input comparison.

For an intentional tune, retain a separately built pre-edit reference and compare the same observations:

```sh
node tools/audio/tire-response-render.mjs /absolute/rsq-comparison /absolute/reference/dist 48000
node tools/audio/tire-response-render.mjs /absolute/rsq-44100 - 44100
node tools/audio/tire-spectral-render.mjs /absolute/sq-44100 44100
```

The R/S/Q renderer accepts `OUTPUT_DIRECTORY [REFERENCE_BUILD|-] [RATE]`, with rates 44100/48000/96000.
`-` explicitly omits a reference. Fixed gains preserve level differences; no automatic normalization or
limiter is used. Generated WAVs/JSON stay outside tracked source. They are synthetic replays, not recorded
driving or phone playback evidence. Native k-rate automation may quantize events to browser blocks.

### Sound-preserving cleanup

Before a structural edit, save a separate build of the inspected source. After the edit and rebuild:

```sh
node tools/audio/tire-spectral-equivalence.mjs /absolute/reference/dist
node tools/audio/tire-spectral-equivalence.mjs /absolute/reference/dist hybrid
```

The [exact comparison](../tools/audio/tire-spectral-equivalence.mjs) defaults to SPECTRAL; the optional
`spectral|hybrid` argument selects the model. It checks every finite Float64 R/S/Q sample and their
sum on the shared traces plus surface/reverse/support transitions, both seeds and 44.1/48 kHz. Use
`hybrid` to verify a shared-R extraction against the retained pre-edit build. It requires the same
selected-model eight-input kernel/surface contract; it does not reinterpret old APIs, normalize
outputs or use tolerances. This is a same-model cleanup check, **not** a condition that an intentional
sound tune or replacement must preserve obsolete PCM. MODAL is an intentional new waveform,
not a target of reference equality. Keep causal mechanics, observation, lifecycle,
component controls and numerical tests even when a reviewed tune deliberately changes waveforms.

### Integrated tire replay probe

`node tools/audio/tire-game-audio-probe.mjs 48000` captures one five-second completed mechanics trace and
replays it through all six adapters with both axles. It warms each model, alternates order over five
runs and reports fixed-gain peak/RMS and median host time. It includes updates and measurement bookkeeping,
not observation capture, engine, browser graph or rendering cost. Use 44100/96000 for other probe rates.
It outputs metrics, not a WAV or a comprehensive understeer/oversteer listening set. No single trajectory,
renderer elapsed time or iteration ceiling certifies target-device performance or perceived loudness.

Focused spectral/response tests are `node --test 'tests/audio/tire-spectral*.test.mjs' tests/audio/tire-response.test.mjs`.
They supplement the complete `npm test` and unchanged historical mechanics/render oracle; listening,
measured spectrum/transients, exact cleanup equality, host throughput and device play remain separate evidence.

### Low-speed input probe

`node tools/audio/tire-input-probe.mjs modal 48000` and
`node tools/audio/tire-input-probe.mjs unified 48000` share the same one-second coast/held-steering
cases starting at 20 and 100 km/h. They use the first catalog vehicle, browser tire/steering
calibration and production torque protection/observation adapter, with 120 Hz mechanics and
60 Hz sound updates. Results include actual final speed, per-axle work/slip, surfaces and summed
Q RMS; UNIFIED additionally reports R RMS. MODAL does not construct a rolling source.

These are not constant-speed corners, the user's drive trace or perceptual loudness tests.
Mixed-surface cases are explicitly marked. Engines, browser compressor and playback are excluded.
Rates are 44100/48000/96000. An optional final frequency argument changes MODAL's base pitch or
UNIFIED's high mode, for example `node tools/audio/tire-input-probe.mjs modal 48000 1000`.
These are distinct tuning parameters, not matched acoustic frequencies. Forward speed is not a
separate Q gate; MODAL still uses wheel peripheral speed to color its HYBRID-derived bandwidth.

## Exact-commit release

Follow the exact-head, fast-forward and CI/Pages gates in [AGENTS](../AGENTS.md). Advance main through the Git reference API with `force=false` after validation; the exact checkout assertion and versioned artifact are implemented in the [workflow](../.github/workflows/pages.yml).

GitHub Actions checkout logs/artifacts and Git/PR refs are release evidence. Keep one current [restart checkpoint](NEXT.md); audit change logs and measured run results belong in the PR and workflow evidence. No self-referential source SHA is required. The final release evidence can be reported from external CI/PR state after the exact commit is validated.

## Browser delivery

Published HTML also links its stylesheet under `build/<commit>/styles.css`. Staging copies that same
source CSS into the immutable build and rewrites only the published link; local HTML keeps `styles.css`.
This prevents a newly deployed DEV layout from reading an independently cached older stylesheet.
The staging regression executes the actual workflow commands against temporary inputs and checks both
the versioned CSS link/content and complete ESM/fallback copies. Root CSS remains a fallback for cached clients.

Pages stages complete ESM builds under `build/<commit>/` and publishes version.txt. Index loads that versioned boot path; all relative imports remain within the same build. The dist path is an explicit fallback for cached index/fetch failure. Each deployment contains only its current SHA under build/, plus the same build under dist/; versioned paths isolate caches and are not a retained rollback history. Preserve this coherent-build design. Do not strip modules based only on direct boot imports: course roots are dynamically selected and assets/diagnostics have separate consumers.

For a reported failure, distinguish source logic, emitted build, deployed artifact and browser/cache state. Do not blame cache without evidence, and do not claim public endpoint verification from local tests alone.

## Build outputs

`npm run build` clears `dist`, compiles ESM, builds the Sprite Tool/preview and validates/stages saved
courses and images in `dist/content` with their exact-byte SHA-256 manifest. Pages publishes the
complete build under its commit version and a coherent local fallback. Deployment verification checks
version.txt, versioned boot/root and every course/image digest. Fixtures remain test inputs.

## Tool and test layout

`tools/build/` owns build inputs and immutable-reference bridges; `tools/physics/` owns mechanics
probes; `tools/audio/` owns sound audition/rendering; `tools/performance/` owns frame and hot-path
measurements. `tools/helpers/` contains shared probe setup. These directories do not introduce new
runtime entry points. Tool-only general implementations belong to explicit diagnostics instead.

Tests are grouped by responsibility under `tests/`; helpers and small authored fixtures remain
separate. `npm test` discovers `tests/**/*.test.mjs` recursively, so grouping does not remove tests
from the suite. Stage depth and child-side names describe actual topology scenarios, not milestones.

## Course Editor target validation

This target chapter defines Course Editor validation. The repository's existing full validation and
exact-head release commands remain mandatory. This chapter defines additional evidence and capacity
accounting; [NEXT](NEXT.md) alone owns implementation order. No new command or completed test is implied.

### Image and geometry acceptance

| Boundary         | Required causal evidence                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents        | Stable IDs/references, version rejection, units, invalid draft save, reopen and deterministic output.                                                                                                                                                                  |
| Plan primitives  | Identified line/arc round-trip, signed turns, compiled chord chainage and primitive anchors; rejected unsupported curves and failed compilation preserve source.                                                                                                       |
| Cross-section    | Constant/asymmetric/varying widths, one/two/three carriageways, shared edges, taper birth/death, continuous partition changes and invalid crossing/zero-width diagnostics; physical and visual bindings stay independent.                                              |
| Loop Links       | Noncoincident endpoints/headings align by the compiled transform and common overlap without snapping; one source lap, bounded view, positive lap span and unchanged ordered-gate scoring.                                                                              |
| Frames/views     | Source/view mapping, actual predecessor at a merge, inverse traversal, straddling contacts, complete consumer ranges and visible neighbouring actors regardless of package identity.                                                                                   |
| Seams            | Same-pose contact/physical state and continuous camera, ground, background and stable scenery identity.                                                                                                                                                                |
| Forks            | Two/three exits; 0/1/16 rivals; traffic exclusion; median-centre ties; unsupported crossings; same-tick arbitration; irreversible lock; separate per-actor commit.                                                                                                     |
| Fork coverage    | Each declared pre-lock consumer range fits common content; closure precedes each exit; each exit satisfies `parentSpecificVisibleEnd <= exit seam`, with no parent-specific pixels at the seam and only matching common overlap; distinct parents reuse one successor. |
| Transfer         | Product-physics scenarios for the admitted speed/pose/material/vehicle envelope, including outer-to-outer three-way movement.                                                                                                                                          |
| Progress/clock   | Physical gate history; no re-awards; exact expiry/checkpoint/finish ties; initial/later-lap budgets; continuous reference identity and invalidation.                                                                                                                   |
| Ground           | 15+1 source admission, mixed materials, opaque coverage, static A/B recipe, ordered stamps and negative/positive half-cell placement ties.                                                                                                                             |
| LOD              | Immediately below/at/above each threshold; equality coarsens; full collapsed footprints; direct-source integration; odd/partial edges; tile/Link/lap phase.                                                                                                            |
| Compilation      | Small whole-image oracle equals bounded output across batch/traversal orders; equality of complete tile records; deterministic publication/failure cleanup.                                                                                                            |
| Loading          | Whole-course completeness, malformed/digest/length failure, retry/exit, cancellation, stale builds and course-switch peak residency.                                                                                                                                   |
| Gameplay/quality | Reference-AI qualification, interactions, art review and named-device full-load acceptance as separate results.                                                                                                                                                        |

Check actual bands and supported envelopes, not only centrelines. A geometry pass is not vehicle,
art or device acceptance. Diagnostics identify the failed rule, location and input/envelope rather
than silently changing geometry, physics, image quality or progress.

Use small linear, three-way-fork, diamond-merge, loop and authored-overpass inputs for causal tests.
Include simultaneous and staggered actors around Links, reverse/recovery, diverse camera poses and
first/last checkpoint conditions. Ground art trials include fine paint/text, A/B seams, repaired
asphalt, grass boundaries, hills and collapsed crests. The product renderer is the visual oracle.

Keep the immutable mechanics reference. Intentional changed-ground pixels get an explicit rendering
contract revision and independent causal expectations; neither a rewritten golden image alone nor
resetting a mechanics baseline proves correctness. The current Sprite Tool and source/LOD tests remain.
Actual integration tests must cover the real roots/adapters as they are replaced.

### Capacity model

Whole-course residency is evaluated over every distinct stored Section domain, including required
guards and all alternatives in a BRANCH course. Count a shared successor and one lap source once.
Summing route lengths duplicates shared Sections; measuring only the driven route omits resident data.
The largest resident case depends on total domains, width, source diversity and deduplication, not on
which course has the longest single lap. No selected BRANCH course is claimed to have a measured length here.

For the implemented ground layout, let `U` be unique completed near records and `N` be actual map entries:

```text
near record bytes = 2 * (64*16 + 32*4 + 16*1) = 2,336
near dictionary bytes = 2,336 * U
map bytes = entryBytes * N
coarse bytes = 2 * sum(actual stored texel counts at all coarse levels)
ground bytes = map + dictionary + coarse + metadata
```

The following are arithmetic scenarios using a 30 m rectangular strip, four-byte map references,
coarse-level area approximations and no metadata/other assets. They are not measured courses or
accepted device budgets. MB denotes 1,000,000 bytes; exact edge allocations are obtained from compilation.

| Distinct source length                            | Unique records |     Map | Near dictionary | Coarse images | Ground subtotal |
| ------------------------------------------------- | -------------: | ------: | --------------: | ------------: | --------------: |
| 20.8 km, earlier illustration                     |          5,000 | 0.99 MB |        11.68 MB |       1.11 MB |         13.8 MB |
| 70 km, hypothetical multi-Section case with reuse |          5,000 | 3.33 MB |        11.68 MB |       3.75 MB |         18.8 MB |
| 70 km, same case with U proportional to length    |   About 16,827 | 3.33 MB |        39.31 MB |       3.75 MB |         46.4 MB |

A constant MB/km rate conflates length-dependent map/coarse data and content-dependent dictionary
size. Unique-record counts must come from actual composition, including stamps and boundary phase.
Compression and free-stamp area do not determine decoded residency or promise a reduction ratio.

The 2,336-byte RGB555 near record intentionally favours one completed-colour representation over
4-bit indices plus palettes: its pixel payload is four times the 584-byte indexed payload before
palette overhead. This avoids mixed-tile palette allocation and near/coarse colour interpretation
branches. Transport compression remains separate; a packed-palette redesign requires an explicit
contract revision and measured benefit, rather than changing this budget assumption silently.

For the 20.8 km scenario, the 40 × 40 source lattice has 998,400,000 texels, about 3.99 GB as RGBA.
Use this to test bounded generation rather than to allocate a whole-course intermediate. Pixel buffers,
metadata/index growth, scratch storage, codec internals and process peak are measured separately.

### Measurement and admission

The capacity report records actual grids, unique records, encoded/download bytes, resident reader
bytes, load/decode copies, peak compiler memory and scratch use. Account shared storage once; include
old/new course coexistence and in-flight data during switching. Report the retained representation
rather than assuming all texels expand to RGBA, or that RGB555 file size equals total runtime memory.

Qualify at least a long circuit, the highest-footprint authored BRANCH course, and an explicit stress
input with wide forks, diverse themes, dense stamps and scenery. Before production assets exist, use
parameterized multi-Section synthetic cases; label them synthetic. Increase total stored length and
unique-record count independently. Replace the assumed worst case with measured catalog results.

Full-scene device tests include renderer/framebuffer, sprites/backgrounds, 16 rivals, traffic,
interactions, audio, source metadata and loading transitions. Name device/browser, fixed step, frame
target, test inputs and separate resident/peak limits. Host throughput and compressed bytes are
supporting measurements, not smartphone certification. Oversized content receives a capacity error. `GROUND_LIMITS` admits at most 64 MiB of resident ground
buffers/encoded metadata and 128 MiB of load buffers. The accounting includes the shared 128 KiB color
lookup, payload bytes, UTF-8 manifest size and three payload copies during acquisition/ownership/digest.
These are engineering admission ceilings, not qualified phone budgets. VM object headers, browser HTTP
buffers and the rest of the application require process/device measurements. A full-page course switch
retires the old instance; it does not keep two live courses or stream ground during play.

`node tools/performance/course-scene.mjs --frames 180 --rivals 16` reports payload/resident/load accounting,
unique tiles and Section count alongside frame/step/seam timing and sampled allocations. The browser HUD
shows the admitted resident set. Build stages `ground/<course>.json` and `.bin`; the published-content
verifier hashes both along with source documents/images. The small independent source-area oracle,
actual browser root, and car/bike seam tests qualify this cutover. Named-device 60 fps remains separate.

### Remaining evidence gates

The Gate 1 CourseDocument schema and ranges are implemented and tested in their declared subset;
future wire additions require matching admission and causal coverage before GUI dependence. Implemented
LOD/filter/packing choices retain a separate real-art and device acceptance gate. Seam/consumer/transfer envelopes
require causal geometry/physics tests. Reference AI and timed presets require their three acceptance
stages. Interaction/traffic definitions and device budgets remain explicit prerequisites for complete
product-play acceptance, not blockers to independent file/compiler work.
