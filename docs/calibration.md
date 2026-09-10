# Calibration and remaining handling work

Handling remains `DEV_UNCALIBRATED`. The common mechanics/control structure is frozen in [vehicle physics](vehicle-physics.md); the following values are a playtest starting point, not a real-vehicle claim or a completed stability certification.

## Current player settings

Cars and bikes start with the same browser baseline. Player replacement carries the active tire settings to the next vehicle; there is no per-vehicle saved tuning store yet. Final tire parameters may differ by vehicle; front/rear specialization remains future tuning work.

| Selector | Meaning                                 | Default | Range / step          |
| -------- | --------------------------------------- | ------- | --------------------- |
| GX       | Longitudinal reference friction         | 5       | 2–8 / 0.05            |
| PX       | Longitudinal pure-slip plateau start    | 20%     | 2–40% / 1 point       |
| GY       | Lateral reference friction              | 2.5     | 1–4 / 0.05            |
| PY       | Lateral pure-slip plateau start         | 10%     | 2–20% / 1 point       |
| KN       | Normalized radial knee start            | 0.74    | 0.10–0.95 / 0.01      |
| D        | Maximum driver road-wheel offset        | 20°     | 10–30° / 1°           |
| M        | Mechanical road-wheel rack bound        | 65°     | 50–80° / 5°           |
| ACT      | Symmetric normalized steering traversal | 0.30 s  | 0.20–0.40 s / 0.025 s |

[Tire selector](../src/browser/tire-friction-selection.ts), [steering selector](../src/browser/steering-calibration-selection.ts) and [driving shell](../src/browser/driving-shell.ts) own browser initialization. Raw vehicle construction and rivals use compiled profile defaults unless composition explicitly supplies calibration. Do not silently replace profile seeds with browser debug settings.

PX is longitudinal, PY lateral. At fixed friction and KN, a larger P lowers initial stiffness while keeping force capacity. The present baseline has GX/PX=GY/PY=25, hence kX=kY=31.5. Easier handling with larger PX can follow from gentler wheel longitudinal force build-up and changed combined-slip/load-transfer response; it is not explained by wheelbase alone and does not establish universal dynamic stability.

There is no PWR selector or multiplier. Engine torque is unscaled profile data. There is no LP exponent: combined slip uses the ellipse. KN is a tire-law shape parameter, not a steering gain. The automatic steering budget is derived as M-D and has no separate selector. The HUD-only handwheel ratio is 18:1.

Bike CG is 30% of wheelbase in the four profiles. Lean is lateral-acceleration-driven presentation, not physical roll. Physical behavior still depends on profile mass, inertia, CG/axle geometry, suspension, tires, torque and brakes through the shared solver.

## Ownership and acceptance

Change profile authoring for persistent vehicle differences. Change the browser selector only for the common playtest starting point/range. Calibrated front/rear tire coefficients live in one atomic instance state; recovery preserves them. Do not add speed schedules, tire-ID branches, force clamps or an alternate steering law just to improve one vehicle.

Before accepting a tune, compare coast, acceleration, braking, held turns, reversal and neutral release over multiple speeds and time steps; include both turn directions, low grip, crests and recontact. Record input schedules and actual quantities (speed, sideslip, yaw/pitch rate, loads and delivered torques), not only a subjective final screenshot.

The available [terrain probe](../tools/torque-protection-terrain-probe.mjs), [braking/yaw probe](../tools/braking-yaw-probe.mjs) and [drift control probe](../tools/drift-control-probe.mjs) use the production solver. Check each tool's arguments in source. Diagnostic probes intentionally omit gameplay recovery when measuring raw model-domain exits. Tests with explicit coefficients are fixed causal fixtures, not assertions that those values are the current browser default.

Open work: per-vehicle/front-rear tuning, coast/turn oscillation acceptance, combined pedal/steering and changing-terrain envelope, and target-phone performance/input validation. The finite-domain recovery prevents a suspension exception from freezing play; it does not certify arbitrary-terrain physical accuracy. Next presentation/game-system work may proceed while these calibration and acceptance tasks remain open.
