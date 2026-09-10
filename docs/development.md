# Development, validation and release

## Local workflow

Use Node.js 24 (package engines and engine-strict enforce the supported major). Run `npm install` and complete `npm test` at every implementation milestone and release candidate; CI uses `npm ci` for the lockfile. `npm run check` runs lint, formatting and strict type checks; `npm run format` applies the shared formatting rules. `npm run build` clears dist, compiles TypeScript ESM and bakes GroundMap; `npm test` runs lint, formatting, the build and the complete executable suite. Serve the repository over HTTP, for example `python3 -m http.server 8000`. Generated dist, dependencies and Pages staging are not source files.

Follow [AGENTS](../AGENTS.md) for the branch, architecture and release gates.

## Validation contracts

Causal regressions exercise real physics, physical gates, handoffs, recovery, camera, rendering and input lifecycle. Boundary tests enforce the DEV dependency direction and forbidden alternate coordinate authorities. Document hygiene discovers all maintained Markdown files and validates local links. Current specifications are checked, not the preservation of chronological reports.

Some tests use explicitly fixed calibration fixtures so a failure can be reproduced after player defaults change. That does not make the old values product defaults. Do not rewrite such fixtures merely to improve their outcomes. A removed obsolete renderer or archived-document hash is different: preserve current primitive/integration coverage and delete the superseded implementation/preservation requirement.

The [workflow](../.github/workflows/pages.yml) builds a pinned, immutable released reference on the same Node/host and supplies `HOT_PATH_BASELINE_BUILD` to tests. [Exact-trace comparison](../tools/hot-path-probe.mjs) covers signed wheel solves and nine-profile steering/pedal sequences at 60/120/240 Hz; it compares serialized results without tolerances or schema masking. Diagnostic input adapters accept the pinned constructor and update signatures; the renderer comparison similarly adapts the old module/function name and call shape. These bridges change inputs only, never reference outputs, state hashes, pixels or result metrics. Local runs without that environment test determinism only; they are not historical equivalence evidence. The immutable reference pins the accepted vehicle force/control law and renderer output before structural cleanup. It is a regression oracle, not a release archive. Keep its SHA in one workflow variable; advance it only with an explicitly reviewed mechanics/rendering contract revision and independent causal tests for the revision. Refactors, API cleanup and tuning must not silently reset this oracle or normalize away differences.

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

[Browser performance page](../tools/browser-performance.html) runs target-browser workload diagnostics. Compare warmed paired runs on the same engine. Optional instrumentation and full-suite wall time do not measure ordinary frame cost. [Workload reduction](../src/render/render-workload.ts) reports current observations; no copied milestone maxima or arbitrary headroom multiplier establishes a device budget. Enforce actual clipping/accounting invariants and compare reference pixels, then measure on the target device. Keep generated reports outside the source tree unless a current test needs a small authored fixture.

## Exact-commit release

Follow the exact-head, fast-forward and CI/Pages gates in [AGENTS](../AGENTS.md). Advance main through the Git reference API with `force=false` after validation; the exact checkout assertion and versioned artifact are implemented in the [workflow](../.github/workflows/pages.yml).

GitHub Actions checkout logs/artifacts and Git/PR refs are release evidence. Keep one current [restart checkpoint](NEXT.md); audit change logs and measured run results belong in the PR and workflow evidence. No self-referential source SHA is required. The final release evidence can be reported from external CI/PR state after the exact commit is validated.

## Browser delivery

Pages stages complete ESM builds under `build/<commit>/` and publishes version.txt. Index loads that versioned boot path; all relative imports remain within the same build. The legacy dist path is an explicit fallback for cached index/fetch failure. Preserve this coherent-build design. Do not strip modules based only on direct boot imports: course roots are dynamically selected and assets/diagnostics have separate consumers.

For a reported failure, distinguish source logic, emitted build, deployed artifact and browser/cache state. Do not blame cache without evidence, and do not claim public endpoint verification from local tests alone.
