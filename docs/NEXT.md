# Next task checkpoint

## Current state

- LINEAR, SEAM, CIRCUIT and BRANCH share one graph scene with all-Section resident RGB555.
- Static compiled readers are shared; occurrences, actors, field locks and Session state are separate.
- Caller-owned Guide/Raster/tire workspaces preserve the exact immutable mechanics reference.
- All four modes meet the unchanged 650,000-byte regression ceiling; the 200,000-byte product target remains open.
- Fixed-step median and frame p95 meet the 3 ms and 10 ms targets in CI; device performance is unqualified.
- The measured-envelope driver supplies reference and rival inputs; K's CIRCUIT device acceptance is pending.
- DEV_UNCALIBRATED vehicle values, physics results, audio, input, camera, sprites and their immutable references remain frozen.
- Build generates disposable per-vehicle envelopes, continuous references and compact Session budgets.
- The existing standing-start-to-results flow was accepted by K; phone performance remains unqualified.

## Milestones

- **Allocation reduction — Complete:** caller-owned outputs/workspaces pass the unchanged regression gate; no rebaseline.
- **Envelope driver — Awaiting device acceptance:** K competes against Testarossa rivals in public CIRCUIT;
  Session utilization is 0.75 and reference utilization is 0.9. The shared driver retains its 5 m rolling cache.
- **Ground feasibility — Blocked on the prerequisites above:** extend the offline Band trial with a
  cross-section pyramid before changing product formats. Compare resident, direct Band and filtered Band
  rendering in three uncontended repetitions. All four modes must equal or improve current render
  median, p95 and render allocation; otherwise record the cause in Open decisions and stop replacement.
  Report 50/100/200 m interval counts, dictionary bytes/levels, count distributions and distant stills.
  Prove cross-Section footprint composition and open sides causally before implementing replacement.
- **Ground replacement — Pending feasibility:** ordered colored Bands own all ground, with RGB555 or
  transparency, optional physical role, and explicit open outer sides. Role-bearing Bands retain the
  current gap-free/nonoverlapping partition admission; visual-only Bands may overlap in paint order.
  GroundBase disappears. No runtime patterns, textures, palettes, polygons or 2D tile dictionaries.
  Authoring may expand longitudinal repetition and metre-scale polygons into monotone Bands at compile
  time; only authored inputs are committed. Schema/recipe versions may advance without migration.
  Near rows integrate exact Band/footprint rectangle area, including both longitudinal and lateral
  coverage. Far rows read dictionary-backed averaged lateral interval sections in buckets beginning at
  1.6 m and doubling until the largest 200 m footprint is covered. Equality selects the coarser level;
  adjacent-level displacement must stay below one destination pixel. Integrate lateral area exactly.
  Mix expanded 8-bit RGB555 channels and round back to RGB555; new mixed colors are allowed. A transparent
  fraction >= 0.5 preserves BG; otherwise normalize the opaque contribution. No intermediate alpha.
  Skip entirely transparent rows. Initial admission budgets are 64 point-active near Bands and 32
  intervals per pyramid section/level; measure whole-course maxima/distributions and establish effective
  values in the feasibility report. Dictionary size is measured, not assumed to fit tens of KB.
  Convert all four courses, include a polygon arrow and a transparent cliff, and remove the resident
  ground compiler/readers, recipes/limits, images, manifests/payloads, delivery checks and HUD together.
- **Background and indexed images — Pending ground:** BG is an authored far-to-near plane list, initially
  one 80x28 map of 16x16 tiles (1280x448 pixels). Each tile selects a 4bpp pattern and RGB555 palette.
  Planes author horizon, pixels/radian (1280 / 2pi) and parallax distance D; horizontal camera displacement
  contributes 200*dx/D, yaw wraps through 360 degrees and vertical rows follow existing pitch projection.
  Environment selection uses the existing background binding. Compose BG planes, ground and sprites.
  Sprites and tiles share 0..15 indices with transparent 0 and a 16-entry palette whose slot 0 is unused;
  there are 15 opaque colors per pattern, unlimited palettes, and immutable per-instance palette selection.
  Keep sprite area-filtered nearest-palette LOD; BG has no LOD. Demonstrate braking palette selection on
  one vehicle. Replace procedural and old full-image backgrounds, update image references with reasons,
  and remove the superseded implementations/assets/tests in the same change.
- **Rendering ownership — With replacement:** consolidate graphics/visual/terrain/render ownership and
  duplicate presentation names; remove groundmap entirely unless a surviving responsibility is justified.
  Band semantics belong to Content, filtering to Architecture, indexed/BG images to Image assets, and
  admission budgets to Development. Remove superseded target and capacity descriptions at their owners.
- **Remaining performance — After replacement:** remeasure all product targets and GC; move seam timing
  out of engine state or inject the clock consistently. Never reduce rival physics updates or substeps.
- **Structural cleanup — Before three-way content:** split the driving-source responsibilities, split
  Content by authority with index updates, and inventory test-only exports (physics primitives/fixtures
  may remain). Preserve behavior and timing; keep new integration coverage to one or two vehicles.
- **Three-way fork — Pending:** ordinary Left/Middle/Right lock, median, recovery, exit, merge and retarget
  rules; publish a start-to-results course without a three-way special case.
- **Video reconstruction — Pending:** timeline observations, template-free fit and current-envelope replay;
  synthetic tools first if footage is absent. Save observations/fit inputs, use provisional utilization
  0.55/0.75/0.95, and evaluate times and same-time images before human acceptance.
- **Shared scene, Sessions and generated references — Complete:** published flow and disposable budgets.

Direct Band trial (#235, host evidence; prototype code is not merged):

| Mode    | Resident render median / p95 ms | Direct Band median / p95 ms | Render MB/frame resident → Band |
| ------- | ------------------------------: | --------------------------: | ------------------------------: |
| LINEAR  |                   1.567 / 1.966 |               2.796 / 3.478 |                   0.332 → 1.538 |
| SEAM    |                   1.315 / 1.593 |               2.583 / 3.122 |                   0.115 → 2.158 |
| CIRCUIT |                   2.969 / 3.440 |               3.865 / 4.357 |                   0.102 → 0.983 |
| BRANCH  |                   2.943 / 3.314 |               3.708 / 4.251 |                   0.102 → 0.921 |

Point-active maximum was 7; one distant footprint crossed 82 longitudinal intervals. A point-active
budget alone cannot bound far-row cost. The trial is retired without merging; use its Git history for
the later independent filtered trial.

Playable completion requires public Pages and K's device check. After reconstruction: real content →
K reviews time margins/rival speed → traffic, collisions and movable/fixed object interactions → GUI.

## Open decisions

- **Audio — K:** all six selectable models (`hopf`, `contact`, `hybrid`, `spectral`, `modal`, `unified`) reach the production worklet; reconcile this with `audio.md`'s "no inactive legacy model" contract. Choose an explicitly supported model set or retire alternatives; recommend K selects the supported set before a separate audio change. Audio and its hashes remain frozen.
- **Progress — Separate PR:** `src/runtime/course-race-progress.ts` branches between circuit and ordered progress. Retain separate engines or represent loops with ordered progress; recommend proving lap, gate, recovery and clock equivalence before removing the topology-specific branch.
- **Pages — Separate PR:** retain or remove `_site/dist` fallback and published `dist/dev`, and choose rebuilt-output or uploaded-artifact verification. Recommend commit-versioned product-only delivery and verification of the uploaded artifact, without deploy-time `npm ci && npm run build`; CI/Pages are unchanged here.
- **UI language — K:** choose English throughout or permit Japanese in DEV panels only; recommend English for consistent labels, tooltips and accessibility text. Current mixed-language strings remain unchanged until that decision.
