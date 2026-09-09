# SUPER OUTRIDE — Development contract

Read this file, [README](README.md), [documentation index](docs/README.md), [architecture](docs/architecture.md) and [NEXT](docs/NEXT.md) before changing code. Then read the topic specification, source, types, compiler and tests relevant to the task. Current repository evidence is the continuing project memory.

## Authority and priorities

- [Architecture](docs/architecture.md): frozen rendering, coordinate, metric and topology invariants.
- [Vehicle physics](docs/vehicle-physics.md): common CAR/BIKE mechanics and control.
- [Content and gameplay](docs/content-and-gameplay.md): authoring, route/race progress and recovery.
- [Calibration](docs/calibration.md): current settings and remaining handling work.
- [Development](docs/development.md): validation and release.

Optimize for architectural simplicity, one authority per concept, mathematical consistency, simple period-plausible computation, then convenience. Prefer authored/compiled ordinary data and upper-level composition over lower-layer special cases. Do not patch visible symptoms with hidden force, velocity, coordinate or progress corrections.

Before any nontrivial change, answer from repository evidence:

1. Which layer owns the decision?
2. Can an existing primitive express it?
3. Does it duplicate state, coordinates or authority?
4. Does it add a product/mode/vehicle/route/stage branch to a general engine layer?
5. Can authoring, compilation or composition express it more simply?
6. Which frozen invariants apply, and are they preserved?
7. Which causal regression or architecture check proves the behavior and boundary?

An explicit design revision is required to change an invariant. A feature request alone does not authorize silently weakening one. Update the responsible topic document and executable contract together. Historical test names do not establish current authority; preserve their still-valid causal coverage.

## Non-negotiable boundaries

- World X/Y/Z is physical authority; vehicles move freely, never snap to the road during integration.
- Renderer depth is exactly `s_render - s_camera`, without modulo, Euclidean distance, camera-space Z, lateral correction, route identity or winding.
- Same depth means same scale; same depth and height mean same screen Y. Terrain height is independent of lateral position. Camera roll is zero.
- Road is Raster Segment geometry; every interior vertex turns at most 10°. Guide is coordinate support, not polygon-road rendering.
- One far-to-near Painter merges terrain and world sprites, then player, then HUD. No z-buffer, perspective-correct texture mapping, runtime bitmap rotation or alpha blending. Transparency is 0/1.
- Player metric is 2 m = 80 px, 40 px/m; `D_cam = f/40`. No arbitrary visualScale.
- GroundMap visual pixels and SurfaceMap physical materials are independent. TRANSPARENT does not imply VOID.
- General paths and source profiles are open `[0,L]`. No invented closing segment or hidden wrapping. Circuit topology is unfolded above Core before constructing ordinary open sources.
- Physical route gate -> PENDING -> forward handoff seam -> COMMIT. COMMIT changes the chart/content only, preserving world pose/yaw/velocity.
- Circuit laps require ordered physical checkpoint/FINISH crossings. Winding and recovery never award progress. Recovery/resync preserve validated progress.
- General layers must not import `src/dev`. Only `src/main-linear.ts`, `src/main.ts`, `src/main-circuit.ts` assemble DEV fixtures. Tests enforce this boundary.
- Car and bike use one solver. Profile data owns differences; presentation may choose car/bike sprites. HUD observes mechanics, never feeds them.

## Work and release

Never implement directly on main. Inspect/fetch exact main and active PR/CI before changing code. Preserve unrelated local changes; use a feature branch (`codex/` prefix) from the inspected main SHA. Inspect the final diff for unrelated edits.

Run `npm install` and the complete `npm test` for every implementation milestone and release candidate. CI uses `npm ci`. Bug fixes need a regression of the causal failure. Do not weaken a valid test to pass a redesign; document supersession before replacing an obsolete requirement. Retain reproducible diagnostics rather than copied historical results.

Open a PR targeting main. Obtain complete green CI on the exact feature head, including documentation and validation changes. Re-fetch main. Release only when ahead > 0, behind = 0 and merge base is current main. Move main to the validated SHA with `force=false`; never manufacture an extra merge commit. Verify main SHA = PR head SHA = PR merge SHA, then verify main-push CI and Pages on that SHA. Rebase/revalidate if main moved. Never force main or release an unvalidated SHA.

CI workflow checkout and artifacts are release evidence. The working tree keeps current specifications and the current audit/restart checkpoint, not an accumulating release archive. A documentation-only follow-up is still a new SHA and needs CI before release. Do not embed a commit's own SHA in its source as a supposed exact-head record.

When investigating a browser problem, distinguish source, build artifact, deployment and browser display/cache evidence. Preserve complete commit-versioned ESM builds. Do not claim a public deployment was inspected unless its workflow, artifact or endpoint was actually checked.

## Restart

Use [NEXT](docs/NEXT.md), current Git/PR/CI state and current specifications. Do not repeat old migration ceremonies or require previous chat attachments. Keep one current checkpoint. Past design/release records are retrievable from Git; do not reconstruct a history directory.
