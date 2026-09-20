# Next task checkpoint

## Current state

- One graph scene serves LINEAR, SEAM, CIRCUIT and BRANCH, with all-Section resident RGB555.
- Static compiled readers are shared; occurrences, actors, field locks and Session state remain separate.
- P1 (1), host measurement with 16 rivals: allocation 18 → 0.99 MB/frame; rendering median 3.6 → 2.0 ms.
- Fixed-step median is 6.3 ms, above the 3 ms target; frame p95 is 13.8 ms and maximum is 23 ms. GC spikes remain.
- Performance acceptance is incomplete; retain the regression gate and K's public CUSTOM/device HUD check.
- Vehicle values, audio, input, camera, sprites and immutable mechanics/image references remain preserved.
- Build generates per-vehicle envelopes, continuous reference runs and compact Session budgets in disposable outputs.
- DEV_UNCALIBRATED courses and numeric observations are tool inputs, not reconstructed master content.

## Milestones

- **P1 (3) — Next:** one envelope-based reference driver with provisional rival utilization; retain the performance regression gate and distinguish generated budgets from qualified actual-vehicle driving.
- **P2 — Pending:** follow-on scope must be recorded before implementation. Reserved locations, unchanged in this cleanup: the capacity model in `development.md`; RGB555 capacity, near-record/wire and alternate (`paletteRgb555`/`spanS`/`spanL`) specifications in `image-assets.md` and `content-and-gameplay.md`; `src/visual/far-background.ts`, `content/images` far-background assets and ground source evaluation.
- **P3 — Pending:** record the completion requirement before implementation; no scope is established by this cleanup.
- **N4 — Pending:** a Left/Middle/Right fork course using ordinary lock, median, closure recovery, exit, merge and retarget rules; publicly drive start to results.
- **N5 — Pending:** timeline observations, template-free fit and current-envelope validation; synthetic tools first if footage is absent, then a public video-derived course with timing tables and same-time images.
- **N1–N3 — Complete:** published shared scene, resident ground, authored Sessions, checkpoint clocks and reference driving; K accepted the standing-start-to-results flow on device.
- **P1 (1) — Implementation complete, acceptance open:** physics/projection/progress/terrain storage reuse and completed-ground scanline batching; measurements above remain below the required acceptance.
- **P1 (4) — Complete:** automatic cached references, one envelope per vehicle, compact browser budgets and untracked previews.

Playable completion requires a publicly drivable Pages URL and human driving. After N5: real content production → K reviews reference difficulty/time margins/rival speed → collisions/interactions and traffic → inspection/fine-adjustment GUI.

## Open decisions

- **Audio — K:** all six selectable models (`hopf`, `contact`, `hybrid`, `spectral`, `modal`, `unified`) reach the production worklet; reconcile this with `audio.md`'s "no inactive legacy model" contract. Choose an explicitly supported model set or retire alternatives; recommend K selects the supported set before a separate audio change. Audio and its hashes remain frozen.
- **Progress — Separate PR:** `src/runtime/course-race-progress.ts` branches between circuit and ordered progress. Retain separate engines or represent loops with ordered progress; recommend proving lap, gate, recovery and clock equivalence before removing the topology-specific branch.
- **Pages — Separate PR:** retain or remove `_site/dist` fallback and published `dist/dev`, and choose rebuilt-output or uploaded-artifact verification. Recommend commit-versioned product-only delivery and verification of the uploaded artifact, without deploy-time `npm ci && npm run build`; CI/Pages are unchanged here.
