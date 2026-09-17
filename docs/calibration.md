# Calibration and tuning ownership

The vehicle values below are a playtest starting point for the [common vehicle model](vehicle-physics.md). [NEXT](NEXT.md#remaining-limits) owns handling status and acceptance limits; the values are not a real-vehicle claim.

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

D, M, ACT and the tire axes share a compact minus/value/plus control. Both directions wrap
at the existing range endpoints; ACT steps traversal time (seconds), not rate. Keyboard
Y/U/T still step D/M/ACT forward through the same canonical choice lists. This replaces the
full numeric button grids without changing defaults, ranges, units or vehicle-owned setters.

[Tire selector](../src/browser/tire-friction-selection.ts), [steering selector](../src/browser/steering-calibration-selection.ts) and [driving shell](../src/browser/driving-shell.ts) own browser initialization. Raw vehicle construction and rivals use compiled profile defaults unless composition explicitly supplies calibration. Do not silently replace profile seeds with browser debug settings.

PX is longitudinal, PY lateral. At fixed friction and KN, a larger P lowers initial stiffness while keeping force capacity. The present baseline has GX/PX=GY/PY=25, hence kX=kY=31.5. Easier handling with larger PX can follow from gentler wheel longitudinal force build-up and changed combined-slip/load-transfer response; it is not explained by wheelbase alone and does not establish universal dynamic stability.

There is no PWR selector or multiplier. Engine torque is unscaled profile data. There is no LP exponent: combined slip uses the ellipse. KN is a tire-law shape parameter, not a steering gain. The automatic steering budget is derived as M-D and has no separate selector. The HUD-only handwheel ratio is 18:1.

Bike CG is 30% of wheelbase in the four profiles. Lean is lateral-acceleration-driven presentation, not physical roll. Physical behavior still depends on profile mass, inertia, CG/axle geometry, suspension, tires, torque and brakes through the shared solver.

## Ownership and acceptance

Change profile authoring for persistent vehicle differences. Change the browser selector only for the common playtest starting point/range. Calibrated front/rear tire coefficients live in one atomic instance state; recovery preserves them. Do not add speed schedules, tire-ID branches, force clamps or an alternate steering law just to improve one vehicle.

Before accepting a tune, compare coast, acceleration, braking, held turns, reversal and neutral release over multiple speeds and time steps; include both turn directions, low grip, crests and recontact. Record input schedules and actual quantities (speed, sideslip, yaw/pitch rate, loads and delivered torques), not only a subjective final screenshot.

The available [terrain probe](../tools/physics/torque-protection-terrain-probe.mjs), [braking/yaw probe](../tools/physics/braking-yaw-probe.mjs) and [drift control probe](../tools/physics/drift-control-probe.mjs) use the production solver. Check each tool's arguments in source. Diagnostic probes intentionally omit gameplay recovery when measuring raw model-domain exits. Tests with explicit coefficients are fixed causal fixtures, not assertions that those values are the current browser default.

Open calibration and device acceptance work is tracked only in [NEXT](NEXT.md#remaining-limits).

## Tire audio tuning

Tire sound is presentation calibration, separate from the GX/PX/GY/PY/KN physical tire law above.
The [audio contract](tire-audio.md#player-tire-synthesis) owns equations and signal paths;
[NEXT](NEXT.md#deferred-tuning) owns feedback and listening acceptance;
[development](development.md#tire-comparison-tools) owns reproducible commands. [Tire audio](tire-audio.md#shared-comparison-and-transport) owns method selection and the reload default.

Every non-derived acoustic coefficient and material value is an authored magic number, not a measured
tire property. Units make a surrogate interpretable without establishing physical validity. Accepted
slip work is an available-energy cue, not sound power; do not multiply friction excitation by load
again. Computed MODAL modal energy and HYBRID's scalar energy state are diagnostics in their own
normalized models, not joules or mutually calibrated quantities.

### MODAL Q-only candidate

[MODAL settings](../src/audio/tire-modal-acoustics.ts) own all coefficients, surface values and validated DEV sliders. These are authored parameters, not measured tire properties.
[Audio](tire-audio.md#modal-game-synthesis) owns the equations and numerical limits.

| Tuning concern       | Settings                                               | Coupling                                                                                                                |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Onset and saturation | `feedbackMaximum`, `saturation`                        | Feedback/loss ratio determines instability; saturation bounds the same sound states.                                    |
| Work/slip response   | `powerReferenceWatts`, `slipHalfMps`, `slipRolloffMps` | Work controls forcing and feedback; slip shapes feedback. No vehicle-speed gate or second load multiplier.              |
| Irregularity         | `noiseRms`, `bandwidthHz`                              | Noise excites the same resonators during rubbing and squeal. Bandwidth changes damping, noise scaling and growth speed. |
| Pitch                | `pitchBaseHz`, `wanderDepth`                           | Four harmonic centers track an explicitly authored slip/directional-work curve, with shared slow wander.                |
| Listening level      | `outputGain`                                           | Output level only, not instability. TIRE bus volume is separate.                                                        |

Source-only values include harmonic weights, pitch excursions, slip/wheel bandwidth response, surface
roughness/susceptibility, control timing and output filters. Weak-work forcing is linear near zero.
Positive controls follow; zero support/slip/work immediately releases forcing without clearing vibration.
Compare Q with HYBRID Q at fixed volume. No measurement establishes correct tire parameters or realism.

### UNIFIED friction

[UNIFIED acoustics](../src/audio/tire-unified-acoustics.ts) owns all new friction coefficients.
Both modal states receive one nonlinear friction input. Do not create separate rubbing/squeal gains,
extra onset gates or a second amplitude envelope when tuning their continuous transition.

[UNIFIED synthesis](tire-audio.md#unified-game-synthesis) owns the mode frequencies and work-response
law. `powerReferenceWatts` controls the work half-response point; it is not an acoustic efficiency
or a replacement for output gain.

[Tire observation](../src/audio/tire-sound-observation.ts) owns bounded transport and audition defaults,
not replacement physics. [Spectral noise](../src/audio/spectral-noise.ts) owns numerical band support;
The [stochastic resonator](../src/audio/stochastic-resonator.ts) reuses the supported band rate/frequency domain.
Do not widen domains or alter rates as an ordinary timbre adjustment.

[Tire component controls](tire-audio.md#component-output-controls) own output switching;
[session tuning](tire-audio.md#session-tuning) owns replacement, reset and reload semantics.
Numeric defaults and ranges remain in the linked acoustic source owners.
