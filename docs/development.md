# Development, validation and release

## Local workflow

Use Node.js 24 (package engines and engine-strict enforce the supported major). Run `npm install` and complete `npm test` at every implementation milestone and release candidate; CI uses `npm ci` for the lockfile. `npm run check` runs lint, formatting and strict type checks; `npm run format` applies the shared formatting rules. `npm run build` clears dist, compiles TypeScript ESM and bakes GroundMap; `npm test` runs lint, formatting, the build and the complete executable suite. Serve the repository over HTTP, for example `python3 -m http.server 8000`. Generated dist, dependencies and Pages staging are not source files.

Follow [AGENTS](../AGENTS.md) for the branch, architecture and release gates.

For engine tuning, open `http://localhost:8000/?mode=circuit` to adjust the eight ENGINE
TUNING minus/plus controls while driving. VOL also uses minus/plus buttons. TIRES: CURRENT / CONTACT / SPECTRAL
compares the three tire models in all courses; the session choice survives mute and vehicle replacement.
CONTACT is experimental and its axle-to-representative mapping remains uncalibrated. The separate audition/verification page is
`http://localhost:8000/tools/audio-browser.html`. Use the same HTTP server and freshly built
checkout for both; opening the HTML directly with `file://` is not the supported module/worklet
delivery path. Rebuild after TypeScript edits, then reload the target page. Reload resets
session-local tuning. See [audio](audio.md) for signal order and parameter ownership.

## Validation contracts

Causal regressions exercise real physics, physical gates, handoffs, recovery, camera, rendering and input lifecycle. Boundary tests enforce the DEV dependency direction and forbidden alternate coordinate authorities. Document hygiene discovers all maintained Markdown files and validates local links. Current specifications are checked, not the preservation of chronological reports. Source exports must have named consumers resolved by TypeScript across source, tests and tools (including inline HTML modules); unused signature types remain module-local. Dynamic whole-module enumeration alone does not justify a named public API.

Geometry regressions are organized by projection, terrain generation, Raster/Guide geometry, sprites and key ownership rather than development milestones. Primitive, adapter and full-renderer checks retain their distinct causal scenarios. Shared numerical assertions require explicit tolerances; relative scaling and strict comparison remain call-site choices.

Some tests use explicitly fixed calibration fixtures so a failure can be reproduced after player defaults change. That does not make the old values product defaults. Do not rewrite such fixtures merely to improve their outcomes. A removed obsolete renderer or archived-document hash is different: preserve current primitive/integration coverage and delete the superseded implementation/preservation requirement.

The [workflow](../.github/workflows/pages.yml) builds a pinned, immutable released reference on the same Node/host and supplies `HOT_PATH_BASELINE_BUILD` to tests. [Exact-trace comparison](../tools/hot-path-probe.mjs) covers signed wheel solves and nine-profile steering/pedal sequences at 60/120/240 Hz; it compares serialized results without tolerances or schema masking. Diagnostic input adapters accept the pinned constructor and update signatures; the renderer comparison similarly adapts the old module/function name and call shape. These bridges change inputs only, never reference outputs, state hashes, pixels or result metrics. Local runs without that environment test determinism only; they are not historical equivalence evidence. The immutable reference pins the accepted vehicle force/control law and renderer output before structural cleanup. It is a regression oracle, not a release archive. Keep its SHA in one workflow variable; advance it only with an explicitly reviewed mechanics/rendering contract revision and independent causal tests for the revision. Refactors, API cleanup and tuning must not silently reset this oracle or normalize away differences.

Focused audio verification after building uses:

```sh
node --test tests/audio*.test.mjs tests/exhaust-*.test.mjs tests/tire-synthesis.test.mjs tests/tire-contact*.test.mjs tests/tire-sound-switch.test.mjs tests/tire-response.test.mjs tests/tire-spectral*.test.mjs
```

This is a focused diagnostic, not a replacement for full `npm test`. The [browser audio probe](../tools/audio-browser.html) checks the real worklet graph over HTTP. Acoustic profile switches preserve bounded voice counts. The architecture checks recognize static worker-module URLs. Tire audio subscriptions must preserve the complete physical snapshot; the fixed historical equivalence oracle is unchanged. Presentation-anchor checks permit the optional rival observation argument without changing the anchor requirement.

For a paired host timing comparison, run `node tools/hot-path-probe.mjs REFERENCE_BUILD dist`. It warms both builds, alternates five pairs and rejects different traces before reporting medians. It includes serialization overhead and does not certify a browser or device frame budget.

Useful diagnostics:

```sh
node tools/hot-path-probe.mjs dist
node tools/torque-protection-terrain-probe.mjs --hz 120 --out /tmp/terrain.json
node tools/braking-yaw-probe.mjs
node tools/bike-cg-probe.mjs dist /tmp/bike-cg.json
node tools/steering-input-stop-probe.mjs
node tools/torque-protection-probe.mjs --hz 120 --out /tmp/protection.json
node tools/steering-input-stop-benchmark.mjs /path/to/reference/dist /tmp/steering-timing.json
```

The [torque protection probe](../tools/torque-protection-probe.mjs) compares protected and unprotected drive/brake behavior. The [steering limiter benchmark](../tools/steering-input-stop-benchmark.mjs) measures identical input groups against a supplied build. Retain these reproducible tools rather than copying generated reports into documentation.

[Browser performance page](../tools/browser-performance.html) runs target-browser workload diagnostics. Compare warmed paired runs on the same engine. Optional instrumentation and full-suite wall time do not measure ordinary frame cost. [Workload reduction](../src/render/render-workload.ts) reports current observations; no copied milestone maxima or arbitrary headroom multiplier establishes a device budget. Enforce actual clipping/accounting invariants and compare reference pixels, then measure on the target device. If device traces show allocation pressure, inspect TerrainLine/source-footprint construction and the per-line sampler closure before choosing a measured optimization; these are candidates, not demonstrated bottlenecks. Keep generated reports outside the source tree unless a current test needs a small authored fixture.

## Tire comparison tools

Build before listening. Serve over HTTP (for example `python3 -m http.server 8000`); numeric tire timbre
settings are source data, not live sliders. [Calibration](calibration.md#tire-audio-tuning) maps their
owners, [audio](audio.md#spectral-game-synthesis) defines signals, and
[NEXT](NEXT.md#next-work-spectral-tuning) records feedback and tuning priorities.

In the game, cycle CURRENT -> CONTACT -> SPECTRAL and use R/S/Q to isolate both axles' rolling, scrub
and squeal. The buttons change output only: state continues, other components are not boosted, and
muted components still cost CPU. Keep physical calibration, engine settings and playback volume fixed
when diagnosing tire sound. Rebuild/reload after a source tune; reload resets model/component choices.

| Tool                     | Scope                                                                                         | Command / page                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Game                     | Live mechanics, both axles, all surfaces and R/S/Q output controls                            | `http://localhost:8000/?mode=circuit`                                                                                                |
| SPECTRAL S/Q audition    | One asphalt contact, manual observations or shared synthetic replays; omits R                 | [tire-spectral-browser.html](../tools/tire-spectral-browser.html)                                                                    |
| SPECTRAL R/S/Q render    | One synthetic contact, rotation sweep and grip recovery, separate R/S/Q/mix WAVs              | `node tools/tire-response-render.mjs /absolute/rsq-output - 48000`                                                                   |
| Three-model S/Q render   | Same synthetic macro trace through all adapters; CURRENT, CONTACT friction-only, SPECTRAL S/Q | `node tools/tire-spectral-render.mjs /absolute/sq-output 48000`                                                                      |
| CURRENT reference        | Original tire audition and regeneration                                                       | [tire-browser.html](../tools/tire-browser.html); `node tools/tire-render.mjs /absolute/current.wav`                                  |
| CONTACT reference        | Four road/friction/axle taps with representative controls                                     | [tire-contact-browser.html](../tools/tire-contact-browser.html); `node tools/tire-contact-render.mjs /absolute/contact-output 48000` |
| CONTACT characterization | Steady pitch/harmonics and interference windows                                               | `node tools/tire-contact-characterize.mjs dist`                                                                                      |

The diagnostic HTML pages are local tools, **not published Pages HTML**. They import the same compiled
kernels as the game, not frozen historical copies. In particular the SPECTRAL S/Q page includes current
Q response changes; earlier WAV approval does not mean it still produces old transient PCM.
`mix` in the S/Q renderer means S+Q, whereas `mix` in the R/S/Q renderer includes R. Neither is the
full game/engine mix. The standalone manual controls are raw observations, not acoustic coefficient sliders.

[Shared scenarios](../tools/tire-spectral-scenarios.mjs) own the synthetic S/Q and R/S/Q traces. Their
explicit 0.3 m audition radius supplies angular speed for these fixtures only; live gameplay uses
accepted wheel angular/peripheral observations. CONTACT's own scenarios use representative controls;
identical slider numbers across different tools are not a matched physical-input comparison.

For an intentional tune, retain a separately built pre-edit reference and compare the same observations:

```sh
node tools/tire-response-render.mjs /absolute/rsq-comparison /absolute/reference/dist 48000
node tools/tire-response-render.mjs /absolute/rsq-44100 - 44100
node tools/tire-spectral-render.mjs /absolute/sq-44100 44100
```

The R/S/Q renderer accepts `OUTPUT_DIRECTORY [REFERENCE_BUILD|-] [RATE]`, with rates 44100/48000/96000.
`-` explicitly omits a reference. Fixed gains preserve level differences; no automatic normalization or
limiter is used. Generated WAVs/JSON stay outside tracked source. They are synthetic replays, not recorded
driving or phone playback evidence. Native k-rate automation may quantize events to browser blocks.

### Sound-preserving cleanup

Before a structural edit, save a separate build of the inspected source. After the edit and rebuild:

```sh
node tools/tire-spectral-equivalence.mjs /absolute/reference/dist
```

The [exact comparison](../tools/tire-spectral-equivalence.mjs) checks every finite Float64 R/S/Q sample
and their sum on the shared traces plus surface/reverse/support transitions, both seeds and 44.1/48 kHz.
It requires the same eight-input kernel/surface contract; it does not reinterpret old APIs, normalize
outputs or use tolerances. This is a same-model cleanup check, **not** a condition that an intentional
sound tune or replacement must preserve obsolete PCM. Keep causal mechanics, observation, lifecycle,
component controls and numerical tests even when a reviewed tune deliberately changes waveforms.

### Integrated tire replay probe

`node tools/tire-game-audio-probe.mjs 48000` captures one five-second completed mechanics trace and
replays it through all three adapters with both axles. It warms each model, alternates order over five
runs and reports fixed-gain peak/RMS and median host time. It includes updates and measurement bookkeeping,
not observation capture, engine, browser graph or rendering cost. Use 44100/96000 for other probe rates.
It outputs metrics, not a WAV or a comprehensive understeer/oversteer listening set. No single trajectory,
renderer elapsed time or iteration ceiling certifies target-device performance or perceived loudness.

Focused spectral/response tests are `node --test tests/tire-spectral*.test.mjs tests/tire-response.test.mjs`.
They supplement the complete `npm test` and unchanged historical mechanics/render oracle; listening,
measured spectrum/transients, exact cleanup equality, host throughput and device play remain separate evidence.

## Exact-commit release

Follow the exact-head, fast-forward and CI/Pages gates in [AGENTS](../AGENTS.md). Advance main through the Git reference API with `force=false` after validation; the exact checkout assertion and versioned artifact are implemented in the [workflow](../.github/workflows/pages.yml).

GitHub Actions checkout logs/artifacts and Git/PR refs are release evidence. Keep one current [restart checkpoint](NEXT.md); audit change logs and measured run results belong in the PR and workflow evidence. No self-referential source SHA is required. The final release evidence can be reported from external CI/PR state after the exact commit is validated.

## Browser delivery

Pages stages complete ESM builds under `build/<commit>/` and publishes version.txt. Index loads that versioned boot path; all relative imports remain within the same build. The dist path is an explicit fallback for cached index/fetch failure. Each deployment contains only its current SHA under build/, plus the same build under dist/; versioned paths isolate caches and are not a retained rollback history. Preserve this coherent-build design. Do not strip modules based only on direct boot imports: course roots are dynamically selected and assets/diagnostics have separate consumers.

For a reported failure, distinguish source logic, emitted build, deployed artifact and browser/cache state. Do not blame cache without evidence, and do not claim public endpoint verification from local tests alone.
