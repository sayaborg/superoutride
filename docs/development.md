# Development, validation and release

## Local workflow

Use Node.js 24 (package engines enforce the supported major). `npm ci` installs the lockfile; `npm run check` checks types; `npm run build` clears dist, compiles TypeScript ESM and bakes GroundMap; `npm test` rebuilds and runs the complete test suite. Serve the repository over HTTP, for example `python3 -m http.server 8000`. Generated dist, dependencies and Pages staging are not source files.

Use the canonical repository workspace for the next task; inspect `git status`, `git worktree list`, branch and remote before editing. Preserve unrelated changes. Fetch main, record its SHA, branch from it with a `codex/` name. Never edit main directly. Inspect the appropriate source and topic contract; [AGENTS](../AGENTS.md) contains the mandatory architecture gate.

## Validation contracts

Causal regressions exercise real physics, physical gates, handoffs, recovery, camera, rendering and input lifecycle. Boundary tests enforce the DEV dependency direction and forbidden alternate coordinate authorities. Document hygiene discovers all maintained Markdown files and validates local links. Current specifications are checked, not the preservation of chronological reports.

Some tests use explicitly fixed calibration fixtures so a failure can be reproduced after player defaults change. That does not make the old values product defaults. Do not rewrite such fixtures merely to improve their outcomes. A removed obsolete renderer or archived-document hash is different: preserve current primitive/integration coverage and delete the superseded implementation/preservation requirement.

The [workflow](../.github/workflows/pages.yml) builds a pinned, immutable released reference on the same Node/host and supplies `HOT_PATH_BASELINE_BUILD` to tests. [Exact-trace comparison](../tools/hot-path-probe.mjs) covers signed wheel solves and nine-profile steering/pedal sequences at 60/120/240 Hz; it compares serialized results without tolerances or schema masking. Local runs without that environment test determinism only; they are not historical equivalence evidence. Intentional law changes must explicitly revise the baseline/contract after review, not normalize away differences.

Useful diagnostics:

```sh
node tools/hot-path-probe.mjs dist
node tools/torque-protection-terrain-probe.mjs --hz 120 --out /tmp/terrain.json
node tools/braking-yaw-probe.mjs
node tools/bike-cg-probe.mjs dist /tmp/bike-cg.json
node tools/steering-input-stop-probe.mjs
```

[Browser performance page](../tools/browser-performance.html) runs target-browser workload diagnostics. Compare warmed paired runs on the same engine. Optional instrumentation and full-suite wall time do not measure ordinary frame cost. [Workload reduction](../src/render/render-workload.ts) reports current observations; no copied milestone maxima or arbitrary headroom multiplier establishes a device budget. Enforce actual clipping/accounting invariants and compare reference pixels, then measure on the target device. Keep generated reports outside the source tree unless a current test needs a small authored fixture.

## Exact-commit release

1. Open a PR to main and push the complete implementation/documentation candidate.
2. Require complete green CI on that exact PR head; the workflow checks out and verifies the SHA explicitly.
3. Inspect final diff and relevant artifact/runtime behavior. Update current audit/restart notes as needed and rerun CI if anything changed.
4. Re-fetch main. Require candidate ahead > 0, behind = 0, merge base = current main. If main moved, rebase/reconstruct and revalidate.
5. Advance main to the validated feature SHA using the Git reference API with `force=false`. Do not introduce a new merge commit or release a different SHA.
6. Verify main SHA = PR head SHA = PR merge SHA, then wait for green main-push test/build/Pages jobs on that SHA.
7. Inspect deployed version/artifact before claiming Pages verification.

GitHub Actions checkout logs/artifacts and Git/PR refs are release evidence. Keep one current [audit](AUDIT.md) and [restart checkpoint](NEXT.md), not immutable reports for every milestone. No self-referential source SHA is required. The final release evidence can be reported from external CI/PR state after the exact commit is validated.

## Browser delivery

Pages stages complete ESM builds under `build/<commit>/` and publishes version.txt. Index loads that versioned boot path; all relative imports remain within the same build. The legacy dist path is an explicit fallback for cached index/fetch failure. Preserve this coherent-build design. Do not strip modules based only on direct boot imports: course roots are dynamically selected and assets/diagnostics have separate consumers.

For a reported failure, distinguish source logic, emitted build, deployed artifact and browser/cache state. Do not blame cache without evidence, and do not claim public endpoint verification from local tests alone.
