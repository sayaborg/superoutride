# Next task checkpoint

## Restart

1. Inspect the canonical workspace, worktrees and local changes. Fetch main and inspect active PRs and exact-main CI/Pages evidence.
2. Read [AGENTS](../AGENTS.md), the [specification index](README.md) and the relevant topic/source/tests. Create a `codex/` branch from the inspected main SHA.
3. Follow [development](development.md). PR refs, workflow logs and deployed version.txt establish exact release state; do not infer it from this file or prior conversations.

## Next implementation areas

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts), [camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts). [Tunnel content](../src/dev/courses/tunnel.ts) owns concrete placements and materials. Presentation consumes vehicle/course observations without adding another physical state or depth rule.

The [procedural audio layer](audio.md) currently connects player and nearest-rival engines only. Tire/squeal and wind prototypes are disconnected; their refinement/reconnection is the next sound task. No sampled audio is used. Game and audition selectors temporarily compare optimized simple reflection
and waveguide with provisional shared coefficients. Both expose the same four tuning sliders;
the game commits changes on release. D/M/ACT use compact minus/value/plus controls with unchanged ranges. Adopt only one and remove the other using
the procedure in [audio](audio.md). Speaker listening, acoustic tuning and Safari/iOS/target-phone performance acceptance remain open. Game-event sounds and music are not implemented. Start/end/scoring rules belong in [sessions](../src/gameplay/race-session.ts), [objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and supported-envelope checks do not certify a new course's complete band geometry. Preserve the [validity requirement](architecture.md#raster-and-guide) and distinguish intentional coincident circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear tire calibration, coast/turn oscillation, combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain open. Exiting finite suspension travel invokes gameplay recovery; this does not establish physical stability over arbitrary terrain.

The executable checks cover their stated scenarios and boundaries, not every possible state. Correct a future structural defect with a causal regression and explicit specification revision; never conceal it through parameter tuning.
