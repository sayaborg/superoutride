# Next task checkpoint

Vehicle mechanics and control laws are frozen; parameter calibration remains open and handling is `DEV_UNCALIBRATED`. Continue with visuals, sound and game systems above the existing coordinate, rendering, vehicle, route, lap and recovery contracts.

All repository documentation must be maintained in English. Prefer architectural elegance, simplicity, a single authority per concept and ordinary data over ad hoc exceptions.

## Restart

1. Inspect status, branch, remotes and worktrees in the canonical workspace. Fetch main; previous conversations and attachments are unnecessary.
2. Read [AGENTS](../AGENTS.md), the [current specifications](README.md) and the [current audit](AUDIT.md).
3. Inspect exact-main CI and Pages evidence. Create a new `codex/` branch from the inspected SHA.
4. Read the relevant topic, implementation and causal tests; follow [development](development.md).

## Current foundation

- [Architecture](architecture.md): 320×240 Raster roads, chainage-difference depth, 40 px/m, a single Painter and explicit physical/render height mapping.
- [Vehicle physics](vehicle-physics.md): one two-contact solver for cars and bikes, elliptical tires, implicit signed wheel balance, torque protection, automatic steering and the driver-offset limiter. No power multiplier.
- [Calibration](calibration.md): GX=5 / PX=20%, GY=2.5 / PY=10%, KN=0.74, D=20°, M=65°, ACT=0.30 s. These common initial comparison values do not require identical finished tires across vehicles.
- Bike CG is 30% of wheelbase. Lean is lateral-acceleration-driven presentation, with a debug line from the contact anchor. Physical roll and rider motion are not modeled.
- [Gameplay](content-and-gameplay.md): physical branch gates, finite circuit unfolding, ordered checkpoints and FINISH. Recovery never awards progress.
- The [current audit](AUDIT.md) resolves the external review: live strict supported-chart validation, shared profile/validation primitives, explicit terrain boundaries, one browser scheduler and common actor lifecycles. General APIs use role names and named options. Lint and formatting are part of the mandatory full test command.

## Next implementation areas

[Tunnel fixtures](../src/dev/tunnel.ts) own concrete placements and materials. General profiles remain finite; topology unfolding belongs above them. Course data explicitly authors road paint.

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts), [camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts). Derive presentation from vehicle/course observations without introducing another physical state or depth rule.

There is no sound engine yet. Design a presentation layer that consumes existing RPM, pedals, tire observations and game events. Start/end/scoring rules belong in [sessions](../src/gameplay/race-session.ts), [objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Existing vertex/fillet tests cannot certify new courses. Preserve the validity requirement and distinguish intentional coincident circuit copies above Core.

Per-vehicle/front/rear tire calibration, coast/turn oscillation, combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain open. Exiting finite suspension travel invokes gameplay recovery; this is not a guarantee of physical stability over arbitrary terrain.

This checkpoint supports further development, not a defect-free proof or a real-vehicle fidelity certification. Correct any future structural defect with a causal regression and an explicit specification revision; never conceal it through tuning.
