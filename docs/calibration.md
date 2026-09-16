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

Tire sound is presentation calibration, separate from the GX/PX/GY/PY/KN physical tire law above.
The [audio contract](audio.md#player-tire-synthesis) owns equations and signal paths;
[NEXT](NEXT.md#next-work-unified-listening) owns feedback and listening acceptance;
[development](development.md#tire-comparison-tools) owns reproducible commands. HYBRID remains the
accepted/default method. UNIFIED is a new R+Q comparison, not an automatically adopted replacement.

Every non-derived acoustic coefficient and material value is an authored magic number, not a measured
tire property. Units make a surrogate interpretable without establishing physical validity. Accepted
slip work is an available-energy cue, not sound power; do not multiply friction excitation by load
again. Computed UNIFIED modal energy and HYBRID's scalar energy state are diagnostics in their own
normalized models, not joules or mutually calibrated quantities.

### UNIFIED friction

[UNIFIED acoustics](../src/audio/tire-unified-acoustics.ts) owns all new friction coefficients.
Both modal states receive one nonlinear friction input. Do not create separate rubbing/squeal gains,
extra onset gates or a second amplitude envelope when tuning their continuous transition.

| Tuning concern                     | Named settings                                                                          | Coupling and limits                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Feedback versus loss               | `feedbackMaximumPerSecond`, `modes[].dampingPerSecond`, `slipHalfMps`, `slipRolloffMps` | Changes instability, subcritical response, saturation level and recovery together; not an onset-only switch.                                  |
| Accepted work and forcing          | `powerReferenceWatts`, `noiseForcePerSecond`, `noiseBandwidthHz`                        | Work controls both forcing and feedback. Noise enters the same friction port, without direct output feedthrough.                              |
| Modal color and nonlinear response | `modes[].frequencyHz`, `modes[].participation`, `saturationPerSecond`                   | Fixed modal data and one cubic law produce the response. Participation is normalized once; modes are not S/Q sources.                         |
| Surfaces and following             | `UNIFIED_SURFACES`, `controlSeconds`                                                    | Roughness changes forcing, susceptibility changes feedback. Zero support/work/slip bypasses following to stop new friction input immediately. |
| Pickup and output                  | `outputGainPerSecond`, `outputCutoffHz`, `dcHz`                                         | Fixed displacement pickup/filtering changes audibility, not the underlying instability. No automatic normalization.                           |

Compare mild slip, strong slip and recovery before the complete mix. Hold physical calibration, engine
settings and playback volume fixed. A lower output gain can delay perceived squeal without changing
instability; distinguish that from the requested change in the rubbing-to-squeal response. Numerical
thresholds, energy and RMS do not replace listening. Altering fixed modal data requires renewed
passivity, supported-rate and convergence checks.

### Shared rolling and retained comparisons

[Rolling acoustics](../src/audio/tire-rolling-acoustics.ts) is the sole owner of R for HYBRID and UNIFIED.
Its extraction preserves HYBRID's waveform; changing these settings later changes both models.

| Tuning concern          | Named shared R settings                                                                       | Coupling and limits                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Rotation and color      | `orders`, `minimumHz`, `bandwidthRatio`, `outputHz`                                           | Angular speed sets band centers; filtering remains road-only.                                                     |
| Level and response      | `loadHalfNewtons`, `speedHalfMps`, `speedExponent`, `attackSeconds`, `releaseSeconds`, `gain` | Peripheral speed and support set excitation; locked translation has no active rolling forcing.                    |
| Material and modulation | `ROLLING_SURFACES`, `textureMinimumDepth`, `textureMaximumHz`, `toneSeconds`                  | Peripheral distance sets texture traversal; authored texture lengths and wheel orders are not measured tire data. |
| Numerical behavior      | `controlHz`, `dcHz`; generic `SPECTRAL_BAND_DOMAIN`                                           | Rate/domain changes require numerical and block-partition validation, not just listening.                         |

[HYBRID acoustics](../src/audio/tire-hybrid-acoustics.ts) continues to own its unchanged S/Q mapping.

| Tuning concern          | Named HYBRID settings                                                                                                                                                                                                          | Coupling and limits                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Q onset and recovery    | `powerReferenceWatts`, `demandStart`, `demandFull`, `slipStartMps`, `slipFullMps`, `slipRolloffMps`, `excitationThreshold`, `growthPerSecond`, `saturationPerSecond`, `seedEnergyPerSecond`, `attackSeconds`, `releaseSeconds` | Power also affects S. Raising the growth threshold changes sustained amplitude and recovery. |
| Q pitch and color       | `pitchBaseHz`, `pitchSlipHz`, `pitchSlipHalfMps`, `pitchLongitudinalHz`, `squeal*Bandwidth*`, `wanderSeconds`, `wanderDepth`, `harmonicWeights`, `harmonicAmplitudeReference`, `squealGain`, `squealOutputHz`                  | Separate authored pitch, finite-width harmonic palette and gain, retained for comparison.    |
| S and material response | `powerReferenceWatts`, `scrubBands`, `scrubSlipHalfMps`, `scrubGain`, `scrubOutputHz`, `HYBRID_SURFACES`, `textureMaximumHz`, `toneSeconds`                                                                                    | S and Q add without ducking/crossfade. Its material values configure friction, not shared R. |
| Numerical behavior      | `controlHz`, `dcHz`                                                                                                                                                                                                            | Revalidate supported-domain behavior and block invariance if revised.                        |

The reference [SPECTRAL settings](../src/audio/tire-spectral-acoustics.ts) and `SPECTRAL_TEXTURES` remain
its sole acoustic owners; CURRENT and CONTACT also retain their own mappings. None configures UNIFIED.
Existing comparison waveforms are preserved for this addition; retuning them requires a separate,
explicit revision rather than obscuring the comparison.

[Tire observation](../src/audio/tire-sound-observation.ts) owns bounded transport and audition defaults,
not replacement physics. [Spectral noise](../src/audio/spectral-noise.ts) owns numerical band support;
UNIFIED's domain and [resonator](../src/audio/friction-resonator.ts) enforce their own rate/modal limits.
Do not widen domains or alter rates as an ordinary timbre adjustment.

Component switches are defined by [tire controls](../src/audio/tire-sound-controls.ts) and applied by
the existing voice/worklet. HYBRID/SPECTRAL expose R/S/Q; UNIFIED exposes R/Q with S hidden. They change
output only, not synthesis coefficients or normalization. Numeric tire settings are source-owned;
rebuild and reload after changing them.
