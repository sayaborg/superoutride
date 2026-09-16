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

The available [terrain probe](../tools/torque-protection-terrain-probe.mjs), [braking/yaw probe](../tools/braking-yaw-probe.mjs) and [drift control probe](../tools/drift-control-probe.mjs) use the production solver. Check each tool's arguments in source. Diagnostic probes intentionally omit gameplay recovery when measuring raw model-domain exits. Tests with explicit coefficients are fixed causal fixtures, not assertions that those values are the current browser default.

Open calibration and device acceptance work is tracked only in [NEXT](NEXT.md#remaining-limits).

## Tire audio tuning

Tire sound is a separate presentation calibration, not the GX/PX/GY/PY/KN physical tire law above.
The [audio contract](audio.md#spectral-game-synthesis) owns equations and signal paths; the
[checkpoint](NEXT.md#next-work-spectral-tuning) owns feedback, tuning order and listening acceptance.
[Development](development.md#tire-comparison-tools) owns reproducible commands. Do not duplicate
numerical defaults here: [spectral acoustics](../src/audio/tire-spectral-acoustics.ts) is their sole owner.

| Tuning concern                | Named settings / owner                                                                                                                                                      | Coupling and limits                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R pitch and color             | `roadLowOrder`, `roadHighOrder`, `roadMinimumHz`, `roadBandwidthRatio`, `roadOutputHz`                                                                                      | Wheel angular speed drives the broad centers; the two R-only low-pass stages do not filter S/Q.                                               |
| R level and texture           | `roadGain`, `loadScaleNewtons`, `roadHalfSpeed`, `roadSpeedExponent`, `roadTextureOrders`, `roadTextureDepth`                                                               | Angular speed gates rolling; peripheral speed and load set its level. Neither is inferred from car speed.                                     |
| S spectrum and texture        | `scrubBands`, `scrubGain`, `scrubTextureMaximumHz`                                                                                                                          | Two broad bands have independent center/slip/width data. Preserve S as a reference when changing Q alone.                                     |
| Q color and response          | `harmonicWeights`, `harmonicShapeReference`, `squealBaseHz`, `squealSlipHz`, `squealSlipHalfSpeed`, `squealLongitudinalHz`, `squealGain`                                    | Palette/shape alter harmonics; frequency settings alter pitch. They are not interchangeable fixes for loudness.                               |
| Q width and wander            | `squealBaseBandwidthHz`, `squealSlipBandwidthHz`, `squealBandwidthSlipHalfSpeed`, `squealWheelBandwidthHz`, `squealBandwidthWheelHalfSpeed`, `wanderSeconds`, `wanderDepth` | Finite bandwidth and random wander are sound-design controls, not measured tread geometry or grip state.                                      |
| Shared excitation / filtering | `powerScaleWatts`, `directionScaleWatts`, `attackSeconds`, `releaseSeconds`, `toneSeconds`, `dcHz`, `outputHz`                                                              | Work scale affects S/Q; following affects more than one component; `outputHz` filters S/Q, not R. Support loss overrides normal following.    |
| Material balance              | `SPECTRAL_TEXTURES`: `roadLow/High`, `scrubLow/High`, `squeal`, `scaleMeters`, `depth`                                                                                      | Weights are component-specific; texture scale/depth affect R and S. Catalog identities are discrete; coefficients follow without state reset. |

`SPECTRAL_BAND_DOMAIN` owns numerical frequency/bandwidth limits, independently of similarly valued
sound settings. `SPECTRAL_INPUTS` owns bounded transport and standalone control defaults, not replacement
physics. Do not widen these domains or change native/control rates as an ordinary timbre adjustment;
revalidate domain, spectra, modulation traversal and block invariance when revising them.

R/S/Q output switches are defined by [tire controls](../src/audio/tire-sound-controls.ts) and applied
by the existing voice/worklet. They are listening selectors, not synthesis coefficients or normalization.
The UI does not expose numeric tire settings; change source settings, rebuild and reload. Keep the
accepted engine, playback volume and physical calibration fixed for the first acoustic comparisons.
