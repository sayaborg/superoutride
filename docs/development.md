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
node --test tests/audio*.test.mjs tests/exhaust-*.test.mjs tests/tire-synthesis.test.mjs tests/tire-contact*.test.mjs tests/tire-sound-switch.test.mjs tests/tire-spectral*.test.mjs
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

`node tools/tire-response-render.mjs /absolute/output [BASELINE_BUILD] [48000]` writes fixed-gain R/S/Q/mix
WAVs for an angular-speed sweep and grip recovery. An optional older build receives exactly the same
synthetic observation trace. No recorded-driving or loudness-equivalence claim is made. At 44100/96000,
supply that rate as the third argument after the baseline build. Generated outputs stay outside source.

In the game, select SPECTRAL and use R (rolling), S (scrub) and Q (squeal) ON/OFF buttons to isolate
components. These switches preserve synthesis state and do not normalize the remaining output.
Wheel angular speed is live accepted telemetry; the standalone synthetic S/Q scenarios use an explicit
0.3 m audition radius, not a production fallback. The dynamic Q revision intentionally replaces its old
whole-replay PCM expectation; unchanged S remains pinned independently. See the
[rolling and response contract](audio.md#spectral-game-synthesis).

Retain both reference toolchains; they exercise different models rather than duplicate implementations.
Build first and serve the repository over HTTP. These tools are local diagnostics, not published Pages
HTML or required saved audio assets. [Audio](audio.md#player-tire-synthesis) owns model/input semantics;
[NEXT](NEXT.md#next-decision-a-third-tire-sound-method) owns the next design decision.

| Reference                | Interactive page                                                | Reproducible output                                                 |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| CURRENT                  | [tire-browser.html](../tools/tire-browser.html)                 | `node tools/tire-render.mjs /absolute/current.wav`                  |
| CONTACT                  | [tire-contact-browser.html](../tools/tire-contact-browser.html) | `node tools/tire-contact-render.mjs /absolute/contact-output 48000` |
| CONTACT characterization | Same kernel, no alternate synthesis                             | `node tools/tire-contact-characterize.mjs dist`                     |

The separate [SPECTRAL page](../tools/tire-spectral-browser.html) retains the one-contact asphalt
S/Q listening reference, while gameplay uses both axles and the full road/surface model. It offers manual observations, S-only/Q-only/mix listening and shared diagnostic replays.
Use `http://localhost:8000/tools/tire-spectral-browser.html` after building. The game now also offers SPECTRAL; this separate diagnostic HTML is not published to Pages.

```sh
node --test tests/tire-spectral*.test.mjs
node tools/tire-spectral-render.mjs /absolute/spectral-output 48000
node tools/tire-spectral-render.mjs /absolute/spectral-output-44100 44100
```

The [shared SPECTRAL scenarios](../tools/tire-spectral-scenarios.mjs) feed one synthetic macro trace
into each model's adapter. Outputs include SPECTRAL mix/scrub/squeal, unchanged CURRENT and CONTACT
friction-only (existing 0.5 listening gain), plus unclipped peak/RMS and per-second measurements.
These particular WAVs omit road and use synthetic observations; they retain the approved S/Q reference
without automatic gain matching. The new game mix/road/surface stage requires separate listening.
Browser automation is k-rate and can quantize scheduled events to native render blocks; saved native
kernel replays and actual browser/device playback remain distinct verification claims.

Repeat CONTACT rendering at 44100 for native-rate comparison. Its four-tap page solos either axle or
road/friction component. CONTACT scenarios use representative local-model controls; CURRENT scenarios
use their own observation mapping. Identical slider numbers or unrelated scenario files are not a
matched physical-input A/B test. For listening, the game's selector compares each model with live
observations; the integrated probe below replays one completed observation trace through each adapter without
changing the vehicle trajectory.

Offline rendering reports elapsed time and a maximum iteration count, but is not a warmed paired tire
benchmark. Keep throughput, iteration distributions, spectra, listening and simultaneous device gameplay
separate. See [cost limits](audio.md#interpretation-and-cost-limits); do not report estimated speedups as
measurements. Generated files stay outside tracked source.

## Exact-commit release

Follow the exact-head, fast-forward and CI/Pages gates in [AGENTS](../AGENTS.md). Advance main through the Git reference API with `force=false` after validation; the exact checkout assertion and versioned artifact are implemented in the [workflow](../.github/workflows/pages.yml).

GitHub Actions checkout logs/artifacts and Git/PR refs are release evidence. Keep one current [restart checkpoint](NEXT.md); audit change logs and measured run results belong in the PR and workflow evidence. No self-referential source SHA is required. The final release evidence can be reported from external CI/PR state after the exact commit is validated.

## Browser delivery

Pages stages complete ESM builds under `build/<commit>/` and publishes version.txt. Index loads that versioned boot path; all relative imports remain within the same build. The dist path is an explicit fallback for cached index/fetch failure. Each deployment contains only its current SHA under build/, plus the same build under dist/; versioned paths isolate caches and are not a retained rollback history. Preserve this coherent-build design. Do not strip modules based only on direct boot imports: course roots are dynamically selected and assets/diagnostics have separate consumers.

For a reported failure, distinguish source logic, emitted build, deployed artifact and browser/cache state. Do not blame cache without evidence, and do not claim public endpoint verification from local tests alone.

## Integrated tire replay probe

`node tools/tire-game-audio-probe.mjs 48000` captures one completed five-second mechanics trace and
replays it through CURRENT, CONTACT and SPECTRAL with both axles. It warms each, alternates order over
five runs and reports fixed-gain peak/RMS and median host time. It includes audio updates and measurement
bookkeeping, excludes capture/engine/browser/render cost, and is not a phone budget. Use 44100 or 96000
for other supported diagnostic rates. This complements, never replaces, full tests and real device play.
