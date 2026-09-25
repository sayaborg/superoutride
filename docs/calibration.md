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
they check the raw driving definition against those grids. The controls display the vehicle's current
values without writing to it at startup. DEV adjustments and their transfer on
vehicle switches remain unchanged. Tires are dimensionless coefficients per unit normal load and
share one authored set for front and rear. Driving assists are not difficulty controls.

The same definition selects travel-direction automatic steering and `wheelSlip=true` (TCS and ABS).
Throttle traversal is 0.25 s apply / 0.125 s release; brake traversal is 0.15 s apply / 0.10 s release.
Rates are their reciprocals. Two-wheel support reserve
remains a form-specific 0.08 until 8-7; four-wheel support reserve is null.
Tire and steering low-speed regularization are engine constants of 1.0 m/s.

The full driving record participates in vehicle identity for generated envelopes, reference caches
and time budgets.

| Setting               | Value | Meaning                                                      |
| --------------------- | ----- | ------------------------------------------------------------ |
| Handwheel ratio       | 18:1  | HUD road-wheel-to-handwheel conversion                       |
| Rival utilization     | 0.75  | Session driver's fraction of the measured envelope           |
| Reference utilization | 0.9   | Offline reference driver's fraction of the measured envelope |

## Vehicle evidence and estimates

`tools/vehicle/data/<id>.json` is production-only JSON, excluded from build staging and the delivery
manifest. Each `published` field stores `value`, `status`, `source` (URL or bibliographic reference,
null while unconfirmed), and a contextual `note`. `unconfirmed-provisional` explicitly means the
value or source is unverified; `sourced` requires a nonempty reference. Agreement with a definition
is independent of source verification. K's 2026-09-25 table supplies the selected power, torque,
displacement, cycle and specified geometry/gearing values; its research URLs are pending.
Full-power VFR750R uses provisional 73 Nm at 10000 RPM, not restricted-market 70 Nm at 7000 RPM.
PX200E torque comes provisionally from the 9.5 PS specification and its power RPM is provisional.
FXRT's provisional redline is 5800 RPM because the previous 5200 excluded its 5400 RPM power point.

`npm run check:vehicle-values` checks maximum torque/RPM, maximum power/RPM (including every
quadratic interior extremum of RPM times linear torque), the authored peak-power point, idle-to-redline
coverage, displacement, cycle, idle, redline and all gear/final ratios. Numerical equality uses relative
1e-9 roundoff tolerance, not a specification allowance. All vehicles are checked; discrepancies are
listed and return exit code 1. Optional arguments are vehicle and evidence directories, for disposable
checks. The command participates in `check` and CI. It requires installed dependencies, not a build.

`estimates` records one rigid body with a 75 kg occupant. An equipped base includes fuel and operating
fluids; dry bases add the explicitly recorded fuel litres × 0.75 kg/litre and other-fluid mass.
Equipped interpretation, inferred base masses, fuel fills, fluid masses and all component CG heights
remain provisional. No fuel mass is counted twice. Unspecified equipped masses retain the previous
running mass by subtracting the occupant when documenting the base. CG is the mass-weighted sum of
base, occupant and added fuel heights; other fluids use base height. Sports-car seating, hatchback
height and seated motorcycle posture motivate the vehicle-specific estimates, not measured CG data.
Axle fractions are preserved when correcting wheelbase; named tire dimensions supply nominal unloaded
radii. Unknown nominal tire sizes retain documented provisional rolling radii.

| Vehicle            | Base kg / basis | Added fuel / other fluids kg | Running kg | Running CG m |
| ------------------ | --------------- | ---------------------------- | ---------- | ------------ |
| TESTAROSSA         | 1550 equipped   | 0 / 0                        | 1625       | 0.478308     |
| 911_TURBO_3_3      | 1335 equipped   | 0 / 0                        | 1410       | 0.489043     |
| CORVETTE_C4        | 1510 equipped   | 0 / 0                        | 1585       | 0.458044     |
| DELTA_HF_INTEGRALE | 1215 equipped   | 0 / 0                        | 1290       | 0.533372     |
| GOLF_GTI_16V       | 960 equipped    | 0 / 0                        | 1035       | 0.527391     |
| VFR750R            | 180 dry         | 13.5 / 5                     | 273.5      | 0.617276     |
| PX200E_ARCOBALENO  | 115 equipped    | 0 / 0                        | 190        | 0.635263     |
| R80_GS_PARIS_DAKAR | 205 dry         | 24 / 4                       | 308        | 0.691234     |
| FXRT_SPORT_GLIDE   | 310 equipped    | 0 / 0                        | 385        | 0.561818     |

The curve retains idle torque, uses the supplied torque peak and derives the power-point torque.
The final segment falls at 1.1 times the magnitude of the constant-power tangent slope at peak power,
so its power decreases continuously up to redline. Final gameplay tuning remains open.

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
