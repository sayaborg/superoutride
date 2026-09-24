# Calibration values

These tables describe the authored settings. [Vehicle physics](vehicle-physics.md),
[Audio](audio.md) and [Tire audio](tire-audio.md) define their models;
[Browser](browser.md#dev-controls) defines the controls.

## Vehicle settings

The browser supplies this common starting calibration for cars and bikes.
[Vehicle definitions](../src/vehicle/production-vehicle-definitions.ts) contain the per-vehicle mechanical data.

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
[steering selector](../src/shell/steering-calibration-selection.ts) supply these browser values.

| Setting               | Value            | Meaning                                                      |
| --------------------- | ---------------- | ------------------------------------------------------------ |
| Bike CG position      | 30% of wheelbase | Longitudinal CG location in the bike definitions             |
| Handwheel ratio       | 18:1             | HUD road-wheel-to-handwheel conversion                       |
| Rival utilization     | 0.75             | Session driver's fraction of the measured envelope           |
| Reference utilization | 0.9              | Offline reference driver's fraction of the measured envelope |

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
