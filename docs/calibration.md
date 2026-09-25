# Calibration values

These tables describe the authored settings. [Vehicle physics](vehicle-physics.md),
[Audio](audio.md) and [Tire audio](tire-audio.md) define their models;
[Browser](browser.md#dev-controls) defines the controls.

## Vehicle settings

The [game-wide driving definition](../content/driving/default.json) is the single value authority
for cars and bikes in browser, race and tools. The table documents that definition; it does not
supply another set of defaults. The immutable record contains only authored numbers and choices,
stored as versioned JSON. Derived radians, actuator rates and tire coefficients belong to admission.
[Vehicle definitions](../content/vehicles/) contain the per-vehicle mechanical data.

| Key | Meaning                                      | Default | Selector range / step      |
| --- | -------------------------------------------- | ------- | -------------------------- |
| GX  | Longitudinal reference friction              | 5       | 2–8 / 0.05                 |
| PX  | Longitudinal pure-slip plateau start         | 20%     | 2–40% / 1 percentage point |
| GY  | Lateral reference friction                   | 2.5     | 1–4 / 0.05                 |
| PY  | Lateral pure-slip plateau start              | 10%     | 2–20% / 1 percentage point |
| KN  | Normalized radial knee start                 | 0.74    | 0.10–0.95 / 0.01           |
| D   | Maximum driver road-wheel offset             | 20°     | 10–30° / 1°                |
| M   | Mechanical road-wheel rack bound             | 65°     | 50–80° / 5°                |
| ACT | Symmetric normalized steering traversal time | 0.30 s  | 0.20–0.40 s / 0.025 s      |

PX and PY are dimensionless slips. The defaults give `kX = kY = 31.5` under the
[tire law](vehicle-physics.md#tire-law). Automatic steering has the derived budget `M-D`.
The [tire selector](../src/shell/tire-friction-selection.ts) and
[steering selector](../src/shell/steering-calibration-selection.ts) own only DEV choices and grid checks;
they check the raw driving definition against those grids. The controls display the player's current
vehicle model. A DEV adjustment builds a retuned model and replaces the player's model, which the next
step uses; a vehicle switch carries the adjusted values into the new vehicle's model. Tires are dimensionless coefficients per unit normal load and
share one authored set for front and rear. Driving assists are not difficulty controls.

The same definition selects travel-direction automatic steering and `wheelSlip=true` (TCS, MSR and
ABS). TCS, MSR (engine-braking slip) and the drive side of support protection act only through the
engine's effective opening; ABS and the brake side of support protection act on the pedal brake. The
driver's throttle actuator keeps its traversal time as the requested opening, and the opening's
bounds take effect within each mechanics substep. Drive is split by the fixed front drive fraction,
so a bound from either axle changes drive to both.
Throttle traversal is 0.25 s apply / 0.125 s release; brake traversal is 0.15 s apply / 0.10 s release.
Rates are their reciprocals. `fuelCutRedlineMargin=0.02` is dimensionless: fuel cuts above 1.02 times
redline and returns at redline. Engine friction uses provisional game-wide friction mean effective
pressures of 1.0 bar at idle (`idleFrictionMeanEffectivePressureBar`) and 2.5 bar at redline
(`redlineFrictionMeanEffectivePressureBar`), linear in RPM between them and held outside that range;
a 4-stroke engine's friction torque is `FMEP * displacement / (4*pi)` and a 2-stroke engine's is
`FMEP * displacement / (2*pi)`. `drivelineEfficiency=0.9` applies to every vehicle and to positive
and negative engine torque alike. `engineInertiaKilogramSquareMetersPerLitre=0.04` gives each engine
a rotor inertia of 0.04 kg m² per litre of displacement. A slipping clutch locks when the
wheel-derived RPM reaches engine speed and at least `clutchLockIdleMargin=0.02` above idle, and a
locked clutch slips below idle; the curve's peak-torque RPM limits a slipping engine.
`clutchCapacityFactor=1.5` sets the slipping clutch's fixed capacity to 1.5 times the curve's
maximum torque; it must exceed 1 so an ordinary launch transmits the full engine torque. None of these
is a vehicle value. Two-wheel support reserve
remains a form-specific 0.08 until 8-7; four-wheel support reserve is null.
Tire and steering low-speed regularization are engine constants of 1.0 m/s.

The full driving record participates in vehicle identity for generated envelopes, reference caches
and time budgets. Top-speed envelope measurement ends at steady-speed convergence or at the first
top-gear fuel-cut recovery; after a recovery the maximum is the greatest speed observed during the run.

| Setting               | Value | Meaning                                                      |
| --------------------- | ----- | ------------------------------------------------------------ |
| Handwheel ratio       | 18:1  | HUD road-wheel-to-handwheel conversion                       |
| Rival utilization     | 0.75  | Session driver's fraction of the measured envelope           |
| Reference utilization | 0.9   | Offline reference driver's fraction of the measured envelope |

## Vehicle values

[Vehicle definitions](../content/vehicles/) are the sole authority for per-vehicle values.
Production gameplay tuning edits those definitions directly. [Vehicle physics](vehicle-physics.md)
owns document admission and structural/domain validation.

Mass (kg) and CG height (m) describe one running rigid body including a 75 kg occupant and fuel.
The provisional bike CG height is wheelbase × 0.3 for gameplay, including occupant and fuel in that
same rigid body. Car CG heights are provisional estimates. These values are gameplay parameters,
not claims of measured physical specifications.

Torque-curve points contain RPM and torque in N m, joined linearly from idle through redline.
Vehicle compilation derives peak-power RPM from the maximum of `rpm * torque` over the complete
piecewise-linear curve, including any segment-interior maximum; that RPM must be below redline.
Upshift occurs at redline. Downshift occurs when the next lower ratio would place the engine at or
below that derived peak-power RPM. Shift RPM thresholds are not vehicle values.
Displacement is in cc and cycle is 2 or 4 strokes. Gear ratios and final drive are dimensionless.

## Engine settings

[Exhaust acoustics](../src/audio/exhaust-acoustics.ts) supplies the defaults and domains.
Values are authored sound-model coefficients; the reference-derived pipe coefficients use the
[reference conditions](audio.md#reference-coefficients).

| Key                   | Meaning                                | Default   | UI range / step         |
| --------------------- | -------------------------------------- | --------- | ----------------------- |
| `outletReflection`    | Outlet pressure-reflection coefficient | -1        | -1–0 / 0.01             |
| `returnCutoffHz`      | Boundary return-filter cutoff          | 3100 Hz   | 500–10000 Hz / 100 Hz   |
| `attenuationPerMeter` | Pipe amplitude loss per metre          | 0.03 Np/m | 0–0.30 Np/m / 0.01 Np/m |
| `closedExcitation`    | Closed-throttle excitation             | 0.22      | 0.01–1 / 0.01           |
| `outputCutoffHz`      | Final listening-filter cutoff          | 7300 Hz   | 100–12000 Hz / 100 Hz   |
| `pulseVariation`      | Absolute event-strength variation      | 0.20      | 0–0.40 / 0.01           |
| `pulseRiseMs`         | Full-excitation pulse rise time        | 0.20 ms   | 0.01–2 ms / 0.01 ms     |
| `pulseDecayMs`        | Pulse decay time                       | 5 ms      | 0.1–30 ms / 0.1 ms      |

Kernel domains equal these UI ranges except `returnCutoffHz` starts at 100 Hz,
`attenuationPerMeter` extends to 1 Np/m, and `closedExcitation` accepts `(0,1]`.

## UNIFIED tire settings

[UNIFIED acoustics](../src/audio/tire-unified-acoustics.ts) supplies these friction-model values.
`powerReferenceWatts` is the accepted-work half-response point; output gain independently sets level.

| Key                        | Meaning                            | Default  | Range / step           |
| -------------------------- | ---------------------------------- | -------- | ---------------------- |
| `feedbackMaximumPerSecond` | Maximum positive friction feedback | 8500 s⁻¹ | 2000–12000 / 100       |
| `saturationPerSecond`      | Cubic feedback dissipation         | 6000 s⁻¹ | 3000–12000 / 100       |
| `powerReferenceWatts`      | Work half-response                 | 12000 W  | 3000–30000 W / 500 W   |
| `slipHalfMps`              | Feedback slip half-response        | 3 m/s    | 1–12 m/s / 0.25 m/s    |
| `slipRolloffMps`           | High-slip feedback rolloff         | 45 m/s   | 20–80 m/s / 1 m/s      |
| `noiseBandwidthHz`         | Colored-force bandwidth            | 600 Hz   | 100–2000 Hz / 25 Hz    |
| `noiseForcePerSecond`      | Colored-force scale                | 1200 s⁻¹ | 0–2400 / 25            |
| `lowFrequencyHz`           | Low passive-mode frequency         | 300 Hz   | 275–600 Hz / 5 Hz      |
| `highFrequencyHz`          | High passive-mode frequency        | 1000 Hz  | 800–2400 Hz / 25 Hz    |
| `outputGainPerSecond`      | Displacement-pickup gain           | 900 s⁻¹  | 0–1800 / 25            |
| `outputCutoffHz`           | Friction output-filter cutoff      | 8000 Hz  | 1000–12000 Hz / 100 Hz |

Both modes have damping `2*pi*500 s⁻¹`. Their participation values are `0.45` and
`sqrt(1-0.45²)`. Control following is 0.025 s and DC removal is 18 Hz.
Rolling coefficients are supplied by [rolling acoustics](../src/audio/tire-rolling-acoustics.ts).

| Surface  | Friction roughness | Friction susceptibility |
| -------- | ------------------ | ----------------------- |
| ASPHALT  | 1                  | 1                       |
| SHOULDER | 1.3                | 0.4                     |
| GRASS    | 0.75               | 0.04                    |
| DIRT     | 1.5                | 0.12                    |
| SAND     | 1.1                | 0.02                    |

## Mix settings

| Control | Default | Range / meaning                           |
| ------- | ------- | ----------------------------------------- |
| MASTER  | 35%     | 0–100%; complete audio output             |
| ENG     | 100%    | 0–100%; player and selected rival engines |
| TIRE    | 100%    | 0–100%; player tire output                |
| R       | ON      | Rolling output tap for both axles         |
| Q       | ON      | Friction output tap for both axles        |
