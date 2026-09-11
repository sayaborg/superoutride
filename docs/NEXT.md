# Next task checkpoint

Vehicle mechanics and control laws are frozen in [vehicle physics](vehicle-physics.md); parameters remain tunable and handling is `DEV_UNCALIBRATED`. [AGENTS](../AGENTS.md) owns project authority, architectural priorities and release gates. The repository is the continuing project memory.

## Restart

1. Inspect the canonical workspace, worktrees and local changes. Fetch main and inspect active PRs and exact-main CI/Pages evidence.
2. Read [AGENTS](../AGENTS.md), the [specification index](README.md) and the relevant topic/source/tests. Create a `codex/` branch from the inspected main SHA.
3. Follow [development](development.md). PR refs, workflow logs and deployed version.txt establish exact release state; do not infer it from this file or prior conversations.

## Current audit boundaries

- Core owns source endpoint normalization and geometric sampling tolerances. Lateral classifiers and supported envelopes share one boundary tolerance; residual, screen and control thresholds keep their own meanings and units. Guide compilation preserves micro-intervals that exceed the reader's join tolerance. Visual next-boundary queries use the same exact section lookup as sampling.
- All vehicles use the same mechanics. Wheel residual trials reuse one private temporary result per solve. Signed roots, full nine-profile traces at 60/120/240 Hz, force bounds and dissipativity remain executable regression contracts. Torque protection guarantees a feasible sampled candidate when it reports feasibility; it does not certify unsampled torque intervals or future terrain.
- Circuit height nodes and loaded baked assets preserve immutable source ownership. Malformed binary offsets, encodings and logical materials fail before rendering. Wrong-branch recovery uses the same actor-owned recovery profile as ordinary recovery, preserving validated progress.
- Browser input owns product shortcuts; content IDs remain independent of keyboard allocation. Numeric selector operations, test DOM behavior, straight/arc course authoring and second-fork authoring use shared primitives. Runtime and camera updates consume named world readers.
- Current topic documents own specifications; calibration values live in [calibration](calibration.md). Reproducible probes and exact reference comparisons replace copied timing/release archives. Audit change details belong in the PR.

## Next implementation areas

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts), [camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts). [Tunnel fixtures](../src/dev/courses/tunnel.ts) own concrete placements and materials. Presentation consumes vehicle/course observations without adding another physical state or depth rule.

There is no sound engine yet. A presentation layer can consume existing RPM, pedals, tire observations and game events. Start/end/scoring rules belong in [sessions](../src/gameplay/race-session.ts), [objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and supported-envelope checks do not certify a new course's complete band geometry. Preserve the [validity requirement](architecture.md#raster-and-guide) and distinguish intentional coincident circuit copies above Core.

Per-vehicle/front/rear tire calibration, coast/turn oscillation, combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain open. Exiting finite suspension travel invokes gameplay recovery; this does not establish physical stability over arbitrary terrain. The common model has no physical roll or rider motion.

The executable checks cover their stated scenarios and boundaries, not every possible state. Correct a future structural defect with a causal regression and explicit specification revision; never conceal it through parameter tuning.
