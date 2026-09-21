# Next task checkpoint

## Current state

- Four modes share one compiled graph scene, all-Section resident RGB555 and a complete Session flow.
- Compiled readers are immutable; occurrence, actor, field lock and Session state are separate.
- The unchanged allocation regression ceiling is 650,000 bytes/frame; the 200,000-byte product target is open.
- Fixed-step median and frame p95 have met CI targets; current-candidate validation and device checks are separate.
- The measured-envelope driver is shared by references and rivals; K's CIRCUIT acceptance is pending.
- Indexed sprites, build-generated LOD, immutable palette variants and one tiled BG are implemented; K acceptance is pending.
- Vehicle parameters remain `DEV_UNCALIBRATED`; physics/audio references, input, camera and render distances are unchanged.
- Generated image/ground/envelope/reference products are disposable; only authoring inputs are committed.

## Milestones

- **Shared scene, Sessions, allocation reduction and envelope driver — Implemented:** existing public flow; K checks CIRCUIT rivals.
- **Background and indexed images — Implemented, acceptance pending:** release requires full Node 24 tests,
  immutable comparisons, exact-head CI and verified Pages delivery. K checks all four public modes for
  per-tile palettes, distant scenery stability and Testarossa braking lamps; ground feasibility is independent.
- **Ground feasibility — Resolved-slab preflight implemented:** draft PR #238 has ordered slabs, span interiors,
  a polygon oracle and packed near dictionaries. Far rows and whole-plane scene comparison remain pending.
  Compare resident, prior filtered
  intervals and resolved-slab/row-raster ground using the common filter. Replace the whole plane, including
  open sides; prove ordered arrows/cliffs, exact-oracle bounds, Section ownership and <1 px transitions.
  [Runtime target](architecture.md#colored-ground-runtime-target) and [budgets](development.md#colored-ground-trial-budgets)
  own the design and unchanged qualification gates. Report three fresh-process repetitions and packed bytes.
  Failure leaves the resident baseline unchanged and presents the cause and options to K.
- **Ground replacement — Gated:** only after all feasibility conditions pass, admit colored optional-role/open
  Bands, convert four courses and remove resident ground, old images, source appearance, build/delivery/HUD,
  stale capacity/quantization targets and corresponding tests together. Publish arrow/cliff/marking checks.
- **Rendering ownership — With replacement:** consolidate image/presentation owners and duplicate names;
  remove groundmap entirely unless a surviving responsibility is justified.
- **Remaining performance — After ground decision:** remeasure allocation, fixed-step median, frame p95 and GC;
  move seam timing outside engine state or inject its clock. Never simplify rival physics or substeps.
- **Structural cleanup — Separate changes:** split driving-source responsibilities, split Content by owner,
  and inventory test-only exports without changing behavior or measurement.
- **Three-way fork — Pending:** ordinary Left/Middle/Right rules and a public start-to-results route.
- **Video reconstruction — Pending:** timeline observations, template-free fit and current-envelope replay;
  synthetic tools first without footage, utilization 0.55/0.75/0.95, save observations and fit inputs only.
- **After reconstruction:** produce content, K reviews time margins/rival speed, then implement traffic and
  movable/fixed-object interactions, followed by an inspection/fine-adjustment GUI.

## Open decisions

- **Audio — K:** all six selectable models (`hopf`, `contact`, `hybrid`, `spectral`, `modal`, `unified`) reach the production worklet; reconcile this with `audio.md`'s "no inactive legacy model" contract. Choose an explicitly supported model set or retire alternatives; recommend K selects the supported set before a separate audio change. Audio and its hashes remain frozen.
- **Progress — Separate PR:** `src/runtime/course-race-progress.ts` branches between circuit and ordered progress. Retain separate engines or represent loops with ordered progress; recommend proving lap, gate, recovery and clock equivalence before removing the topology-specific branch.
- **Pages — Separate PR:** retain or remove `_site/dist` fallback and published `dist/dev`, and choose rebuilt-output or uploaded-artifact verification. Recommend commit-versioned product-only delivery and verification of the uploaded artifact, without deploy-time `npm ci && npm run build`; CI/Pages are unchanged here.
- **UI language — K:** choose English throughout or permit Japanese in DEV panels only; recommend English for consistent labels, tooltips and accessibility text. Current mixed-language strings remain unchanged until that decision.
