# Development, validation and release

## Local workflow

Use Node.js 24 (package engines and engine-strict enforce the supported major). Run `npm install` and complete `npm test` at every implementation milestone and release candidate; CI uses `npm ci` for the lockfile. `npm run check` runs lint, formatting and strict type checks; `npm run format` applies the shared formatting rules. `npm run build` clears dist and compiles TypeScript ESM; `npm test` runs lint, formatting, the build, test-asset baking and the complete executable suite. [Build outputs](#build-outputs) separates production modules from generated fixtures. Serve the repository over HTTP, for example `python3 -m http.server 8000`. Generated dist, dependencies and Pages staging are not source files.

Follow [AGENTS](../AGENTS.md) for the branch, architecture and release gates.

For engine tuning, open `http://localhost:8000/?mode=circuit` and open DEV to adjust ENGINE
TUNING controls while driving. MASTER also uses minus/plus buttons. [Tire audio](tire-audio.md#shared-comparison-and-transport) defines the selectable methods and their session behavior.
The separate audition/verification page is
`http://localhost:8000/tools/audio/audio-browser.html`. Use the same HTTP server and freshly built
checkout for both; opening the HTML directly with `file://` is not the supported module/worklet
delivery path. Rebuild after TypeScript edits, then reload the target page. Reload resets
session-local tuning. See [audio](audio.md) for signal order and parameter ownership.

## Validation contracts

Causal regressions exercise real physics, physical gates, handoffs, recovery, camera, rendering and input lifecycle. Boundary tests enforce the DEV dependency direction and forbidden alternate coordinate authorities. Document hygiene discovers all maintained Markdown files and validates local links. Current specifications are checked, not the preservation of chronological reports. General implementations must be reachable from a browser composition root or a declared asset-compiler entry. The current offline compiler entry is `build:test-assets`; its stadium output remains a regression fixture pending production GroundMap integration. Tests do not establish production use. Diagnostics and fixtures belong to their explicit DEV owners and need real test/tool consumers. Independently, exports must have named consumers resolved by TypeScript across source, tests and tools (including inline HTML modules); unused signature types remain module-local. This export check detects unused API but does not authorize a second implementation. Dynamic whole-module enumeration alone does not justify a named public API.

Geometry regressions are organized by projection, terrain generation, Raster/Guide geometry, sprites and key ownership rather than development milestones. Primitive, adapter and full-renderer checks retain their distinct causal scenarios. Shared numerical assertions require explicit tolerances; relative scaling and strict comparison remain call-site choices.

Some tests use explicitly fixed calibration fixtures so a failure can be reproduced after player defaults change. That does not make the old values product defaults. Do not rewrite such fixtures merely to improve their outcomes. A removed obsolete renderer or archived-document hash is different: preserve current primitive/integration coverage and delete the superseded implementation/preservation requirement.

The [workflow](../.github/workflows/pages.yml) builds a pinned, immutable released reference on the same Node/host and supplies `HOT_PATH_BASELINE_BUILD` to tests. [Exact-trace comparison](../tools/performance/hot-path-probe.mjs) covers signed wheel solves and nine-profile steering/pedal sequences at 60/120/240 Hz; it compares serialized results without tolerances or schema masking. Diagnostic input adapters accept the pinned constructor and update signatures; the renderer comparison similarly adapts the old module/function name and call shape. These bridges change inputs only, never reference outputs, state hashes, pixels or result metrics. Local runs without that environment test determinism only; they are not historical equivalence evidence. The immutable reference pins the accepted vehicle force/control law and renderer output before structural cleanup. It is a regression oracle, not a release archive. Keep its SHA in one workflow variable; advance it only with an explicitly reviewed mechanics/rendering contract revision and independent causal tests for the revision. Refactors, API cleanup and tuning must not silently reset this oracle or normalize away differences.

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

[Browser performance page](../tools/performance/browser-performance.html) runs target-browser workload diagnostics. Compare warmed paired runs on the same engine. Optional instrumentation and full-suite wall time do not measure ordinary frame cost. [Workload reduction](../src/dev/diagnostics/render-workload.ts) reports current observations; no copied milestone maxima or arbitrary headroom multiplier establishes a device budget. Enforce actual clipping/accounting invariants and compare reference pixels, then measure on the target device. If device traces show allocation pressure, inspect TerrainLine/source-footprint construction and the per-line sampler closure before choosing a measured optimization; these are candidates, not demonstrated bottlenecks. Keep generated reports outside the source tree unless a current test needs a small authored fixture.

## GroundMap capacity measurement

After building, run:

```sh
node tools/performance/ground-map-capacity.mjs /tmp/ground-map-capacity.json
node tools/performance/ground-map-capacity.mjs --inventory
```

The host-only probe runs stadium, one Tsukuba lap, the linear highway and the branching parent
through the current compiler in separate Node processes. Absent logical profiles receive the
existing grass fallback explicitly; road paint, dimensions and density remain unchanged.
It writes an incomplete checkpoint after each course and removes temporary binary assets afterward.
Generated measurements belong outside the source tree.

The report separates packed binary and metadata bytes, encoded bytes before payload sharing,
alignment overhead, gzip level-9 bytes, compiler time/peak RSS (including temporary-file I/O, before full binary readback) and independent reader-process
observations. Peak RSS includes the worker's baseline; ArrayBuffer, external, heap and RSS values
overlap and must not be added. Reader measurements allow an event-loop turn and GC after releasing
the input buffer. These are host observations, not smartphone residency or frame-time certification.
Gzip sizes assume separately compressed binary and JSON responses; actual Pages response encoding
must be checked independently.

Synthetic repeated-16-color and RGB555-noise images exercise the existing prefilter/encoder.
They are sensitivity bounds, not imported art, complete course bakes or estimates of chunk dedup.
The stage inventory compares a finite sample grid of actual stage paint with translated source paint,
and reports authored handoff chainages. A zero mismatch count does not establish full equivalence.
The current compiler does not consume StageRoadView or its stage-local junction/shoulder overrides;
no child-stage output or end-to-end transition residency is claimed.

Before production integration, resolve finite asset domains and stage paint input, avoid duplicate
circuit/actor readers, and measure completed-asset handoff residency on a target device. Budget the
whole application separately from GroundMap. Compiler pixel buffers are now bounded and intermediate levels use scratch disk; the reader still
makes its defensive input copy. Compiler capacity gains do not reduce packed reader residency
or transfer size. Temporary storage must have room for intermediate levels and the final payloads.

## Tire comparison tools

Build before listening. Serve over HTTP (for example `python3 -m http.server 8000`); DEV exposes model-specific friction controls plus independent ENG/TIRE mix levels.
Other numeric tire timbre settings remain source data. [Calibration](calibration.md#tire-audio-tuning) maps their
owners, [audio](tire-audio.md#player-tire-synthesis) defines each method, and
[NEXT](NEXT.md#deferred-tuning) records feedback and tuning priorities.

In the game, select MODAL for the Q-only method or HYBRID for the listening reference.
HYBRID and SPECTRAL expose R/S/Q buttons. MODAL exposes only Q; R/S sources are absent. Compare its Q with HYBRID Q (R and S off)
for timbre and onset. The buttons change output only:
state continues, other components are not boosted, and
muted components still cost CPU. Keep physical calibration, engine settings and playback volume fixed
when diagnosing tire sound. Rebuild/reload after a source tune; DEV edits apply through a tire-only fade.
Reload resets model/component/tuning/mix choices.

| Tool                        | Scope                                                                                                     | Command / page                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game                        | Live mechanics, both axles, all surfaces and model-specific component controls                            | `http://localhost:8000/?mode=circuit`                                                                                                            |
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

Focused spectral/response tests are `node --test tests/tire-spectral*.test.mjs tests/audio/tire-response.test.mjs`.
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

`npm run build` cleans and compiles the complete ESM tree into `dist/` for local play and Pages.
`npm run build:test-assets` separately bakes the stadium GroundMap regression fixture into
`.test-assets/`; `npm test` runs both steps before the suite. The roughly 43 MB binary is consumed
only by ground-map/render tests, never by a browser composition root. Pages stages `dist/`, so neither
copy of the published build contains this fixture. To run individual asset tests after a clean build,
run `npm run build:test-assets` first. Both output directories are ignored generated files.

## Tool and test layout

`tools/build/` owns build inputs and immutable-reference bridges; `tools/physics/` owns mechanics
probes; `tools/audio/` owns sound audition/rendering; `tools/performance/` owns frame and hot-path
measurements. `tools/helpers/` contains shared probe setup. These directories do not introduce new
runtime entry points. Tool-only general implementations belong to explicit diagnostics instead.

Tests are grouped by responsibility under `tests/`; helpers and small authored fixtures remain
separate. `npm test` discovers `tests/**/*.test.mjs` recursively, so grouping does not remove tests
from the suite. Stage depth and child-side names describe actual topology scenarios, not milestones.

## GroundMap migration gates

The [architecture design](architecture.md#groundmap-integration-design-compiler-implemented-runtime-pending) and
[content lifecycle](content-and-gameplay.md#groundmap-loading-and-handoff-design-not-active) are
implementation targets. Compiler step 1 is implemented; remaining steps are pending. Keep these changes separate; do not advance the immutable
reference as part of compiler or storage cleanup.

| Step | Change and owner                                                                  | Required evidence                                                                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | GroundMap compiler: bounded row generation and output sink                        | Existing source metadata/binary equality; deterministic output for different buffer sizes; measured working memory bounded with increasing length; correct 256/257-color selection and exact dedup                    |
| 2    | Runtime/course compilation: final stage-local color source                        | Compare ordinary and stage source colors at road/shoulder edges, local fork intervals, source offsets, endpoints and overlap; preserve physical boundaries and all gate traces                                        |
| 3    | GroundMap storage/browser loader: versioned payload delivery and shared residency | Exact texel-center, endpoint and per-level reads; page-boundary filtering parity; single shared load/buffer; pin/eviction/cancellation/corruption/capacity failures; observed simultaneous buffer accounting          |
| 4    | Browser/runtime integration: ready-frame loading, real handoff and circuit reuse  | Delayed/failed loads, retry, reverse/recovery, multiple actors and course replacement; unchanged mechanics; explicit pixel revision with independent image tests; no procedural production paint or runtime prefilter |
| 5    | Product build and device acceptance                                               | Every shipped course has complete manifests/assets; clean immutable deployment; verified delivery encoding; peak load/transition memory and frame timing on target devices within agreed budgets                      |

Step 1 retains the current whole-source lattice and sequential rounding. The old eager compiler/pyramid assembly has been removed.
[Compiler regressions](../tests/rendering/ground-map-compiler.test.mjs) preserve small exact
pre-refactor outputs and the full stadium digest, compare several batch sizes, independently check
L0 colors, bound I/O requests as length grows, and exercise capacity/I/O failure cleanup. The shared
2-by-4 averaging kernel remains the only filter implementation. Do not revive an alternate compiler
to compare implementations indefinitely.
Tests for step 2 must include the actual later forks: a coarse sampling grid is diagnostic evidence,
not proof of all boundary behavior. Steps 1-3 need no update to deployed pixels.

A missing numeric device budget does not block compiler parity or ownership work. It does block a
claim of smartphone acceptance. Choose limits using measured payload working sets and total
application headroom, record them in the integration profile, and reject unsupported content
explicitly. A guessed speed/network lead distance is not a guarantee that future pages will arrive.
