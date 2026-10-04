# Calibration values

These tables describe the authored settings. [Vehicle physics](vehicle-physics.md),
[Audio](audio.md) and [Tire audio](tire-audio.md) define their models;
[Browser](browser.md#dev-controls) defines the controls.

## Vehicle settings

The [game-wide driving definition](../content/driving/default.json) is the sole value authority
for cars and bikes in browser, race and tools. The table documents that definition; it does not
supply another set of defaults. The immutable record contains only authored numbers and choices,
stored as versioned JSON. Derived radians, actuator rates and tire coefficients belong to admission.
[Vehicle mechanics documents](../content/vehicles/) contain the per-vehicle mechanical data.

DEV tunes the author-facing values below in their saved units; each grid wraps at its ends. A grid only places
steps and never rejects a driving definition.

| Group      | Key   | Definition field                            | Meaning                                      | Default | DEV range / step           |
| ---------- | ----- | ------------------------------------------- | -------------------------------------------- | ------- | -------------------------- |
| Steering   | M     | `maxRoadWheelSteerDegrees`                  | Mechanical road-wheel rack bound             | 65°     | 50–80° / 5°                |
| Steering   | D     | `steeringOffsetDegrees`                     | Maximum driver road-wheel offset             | 20°     | 10–30° / 1°                |
| Steering   | ACT   | `steeringTraversalSeconds`                  | Symmetric normalized steering traversal time | 0.30 s  | 0.20–0.40 s / 0.025 s      |
| Pedals     | THR+  | `throttle.applySeconds`                     | Throttle apply time                          | 0.25 s  | 0.05–0.50 s / 0.025 s      |
| Pedals     | THR-  | `throttle.releaseSeconds`                   | Throttle release time                        | 0.125 s | 0.025–0.50 s / 0.025 s     |
| Pedals     | BRK+  | `brake.applySeconds`                        | Brake apply time                             | 0.15 s  | 0.05–0.50 s / 0.025 s      |
| Pedals     | BRK-  | `brake.releaseSeconds`                      | Brake release time                           | 0.10 s  | 0.025–0.50 s / 0.025 s     |
| Tires      | GX    | `tire.gripX`                                | Longitudinal reference friction              | 5       | 2–8 / 0.05                 |
| Tires      | PX    | `tire.peakSlipX`                            | Longitudinal pure-slip plateau start         | 20%     | 2–40% / 1 percentage point |
| Tires      | GY    | `tire.gripY`                                | Lateral reference friction                   | 2.5     | 1–4 / 0.05                 |
| Tires      | PY    | `tire.peakSlipY`                            | Lateral pure-slip plateau start              | 10%     | 2–20% / 1 percentage point |
| Tires      | KN    | `tire.knee`                                 | Normalized radial knee start                 | 0.74    | 0.10–0.95 / 0.01           |
| Powertrain | FMEP0 | `idleFrictionMeanEffectivePressureBar`      | Friction mean effective pressure at idle     | 1.0 bar | 0.5–3.0 bar / 0.1 bar      |
| Powertrain | FMEP1 | `redlineFrictionMeanEffectivePressureBar`   | Friction mean effective pressure at redline  | 2.5 bar | 1.0–5.0 bar / 0.1 bar      |
| Powertrain | J     | `engineInertiaKilogramSquareMetersPerLitre` | Engine inertia per litre (kg m²/L)           | 0.04    | 0.010–0.100 / 0.005        |
| Powertrain | ETA   | `drivelineEfficiency`                       | Driveline efficiency                         | 0.90    | 0.70–1.00 / 0.01           |
| Powertrain | CLU   | `clutchCapacityFactor`                      | Clutch capacity × maximum curve torque       | 1.5     | 1.1–3.0 / 0.1              |
| Rival pace | UMIN  | `rivalPace.minimumUtilization`              | ARCADE rival minimum driving utilization     | 0.55    | 0.30–1.00 / 0.05           |
| Rival pace | UMAX  | `rivalPace.maximumUtilization`              | ARCADE rival maximum driving utilization     | 0.95    | 0.30–1.00 / 0.05           |
| Rival pace | VMIN  | `rivalPace.minimumSpeedFraction`            | Rival speed cap at UMIN, × maximum speed     | 0.85    | 0.50–1.00 / 0.05           |
| Rival pace | BAND  | `rivalPace.bandSeconds`                     | Schedule difference from UMIN to UMAX target | ±2.0 s  | 0.5–10.0 s / 0.5 s         |
| Rival pace | RESP  | `rivalPace.responseSeconds`                 | Rival utilization response time constant     | 3.0 s   | 0.5–10.0 s / 0.5 s         |
| Contact    | BCF   | `bodyContact.frequencyHertz`                | Body contact natural frequency (Hz)          | 3.0 Hz  | 1.0–6.0 Hz / 0.5 Hz        |
| Contact    | BCZ   | `bodyContact.dampingRatio`                  | Body contact damping ratio                   | 1.0     | 0.2–1.5 / 0.1              |
| Contact    | BWF   | `bodyContact.barrierFriction`               | Wall friction, as a fraction of the push     | 0.30    | 0.00–1.00 / 0.05           |
| Assists    | —     | `wheelSlip`                                 | TCS, MSR and ABS                             | on      | on / off                   |

`fuelCutRedlineMargin` (0.02) and `clutchLockIdleMargin` (0.02) are numerical margins that keep
latches from chattering; they are edited only in the file. `suspensionProgression` (9.8) is the
game-wide suspension stiffness at full travel as a multiple of each ride spring rate
([Vehicle physics](vehicle-physics.md#suspension)); it is also edited only in the file. It must be finite and at
least 1; each vehicle model admits it through [suspension stability](vehicle-physics.md#suspension-stability).

PX and PY are dimensionless slips. The defaults give `kX = kY = 31.5` under the
[tire law](vehicle-physics.md#tire-law). Automatic steering has the budget `A = M-D`, derived once by driving compilation and shown
on the DEV HUD. The [DEV tuning registry](../src/shell/driving-tuning.ts) owns only these choices and
step positions. From any finite value, + moves to the smallest grid value above it and − to the largest below
it, wrapping from the last grid value to the first and back, also from outside the range; values off the grid are
shown exactly. A DEV adjustment steps the
player's tuned driving definition, admits it with the driving-document compiler (a rejected candidate
leaves the definition unchanged) and rebuilds the Session around a Session vehicle driving it
([Browser](browser.md#dev-controls)).

Tuned values reach the product only through the definition files. DEV EXPORT downloads the tuned
driving source document as `default.json` and the selected vehicle's source document as
`<vehicle id>.json`, written from the admitted documents, never from runtime values. Both use the
saved layout of [`formatSavedJson`](../src/content/saved-json.ts): admission's field order, two-space
indentation, 120 columns, containers broken except a primitive array or a below-root object of
primitives that fits on one line, and JSON's own number and string spelling. The files in
`content/driving/` and `content/vehicles/` are kept in that layout, so an untuned export is
byte-identical to its content file. To adopt tuned values, replace `content/driving/default.json`
(or a vehicle file) with the export and rebuild; admission, identity and generated references follow
the new file. Tires are dimensionless
coefficients per unit normal load; one game-wide set serves both stations. Driving assists are
not difficulty controls.

The same definition selects `wheelSlip=true` (TCS, MSR and
ABS). TCS, MSR (engine-braking slip) and the nose-up side of pitch protection act only through the
engine's effective opening; ABS and the nose-down side of pitch protection act on the pedal brake. The
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
is a vehicle value. `pitchLimitDegrees=15` is the game-wide pitch protection limit, nose up and nose
down, for both forms, against the road line under the wheels
([Vehicle physics](vehicle-physics.md#torque-protection)); it is edited only in the file. Torque
protection is the same for both forms.
Tire and steering low-speed regularization are engine constants of 1.0 m/s.
`bodyContact` is the spring-damper of every body contact: between two vehicles whose footprints overlap
([Vehicle physics](vehicle-physics.md#body-contact)), and against walls, course limits and roadside objects: `frequencyHertz` is the natural frequency of the pair's
relative motion in hertz, independent of the masses because the force scales with the pair's reduced mass, and
`dampingRatio` is dimensionless (1 is critical damping: no rebound). Every DEV grid point is stable at the 1/60 s step.
Walls, course limits and fixed objects push with the same spring-damper on the vehicle's own mass, and movable objects
on the pair's reduced mass, so they share its frequency and damping; `barrierFriction` scales that push into the friction slowing a vehicle that scrapes along them (0.3 is a
provisional value, to be judged on devices).

The full driving source document participates in vehicle identity for generated envelopes, reference
caches and time budgets. Top-speed envelope measurement ends at steady-speed convergence or at the first
top-gear fuel-cut recovery; after a recovery the maximum is the greatest speed observed during the run.
Envelopes are measured on the envelope procedure's own reference surface, `ENVELOPE_REFERENCE_SURFACE`
in `tools/course/rival-envelope-measurement.ts`: grip factor 1 and rolling resistance 0 everywhere. It is not a
catalog material, so material IDs and values do not move the envelope; the reference is the vehicle's
capability on unit grip without surface drag.

| Setting               | Value | Meaning                                                                                              |
| --------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| Rival utilization     | 0.75  | Fixed fraction of the measured envelope for unpaced rivals, traffic and the takeover after GOAL      |
| Reference utilization | 0.9   | Offline reference driver's fraction of the measured envelope                                         |
| Following time        | 1.5 s | Drivers' following time (`ENVELOPE_DRIVER.followSeconds`)                                            |
| Terminal clearance    | 2 m   | Left before a terminal, or behind the vehicle ahead, at a stop (`ENVELOPE_DRIVER.terminalClearance`) |

The following time sets the gap a driver keeps behind the vehicle ahead beyond its response distance, that vehicle's
speed times the following time; the free space a lane needs ahead, half the two lengths plus the driver's own speed
times it; and behind, the rear vehicle's speed times it
([Content and gameplay](content-and-gameplay.md#vehicle-envelopes-and-drivers)).

`ENVELOPE_DRIVER.version` identifies the driver policy: the record's values and the driving law that reads them —
planning, following, lane choice and merging, pedals and steering. It rises by one with every change that alters a
driver's input for the same vehicle state and observations, whether the change is to a value or to that law, and with
every field added to or removed from the record; a change that leaves every input the same keeps it. The reference
driver's identity (`REFERENCE_DRIVER_SHA256`) contains it. It is 10: since version 8, one implementation of the vehicle ahead,
lane occupancy and stopping followers, the steering path that decides the vehicle ahead, the escape gap (9), the
surface grip drivers plan with (10), standing objects that end a lane (11), and other
vehicles' route speeds (12).

## Camera settings

The [camera definition](../src/view/camera-definition.ts) holds the camera's values; DEV camera controls replace
them for the session without saving, and a reload restores them.

| Setting              | Value | DEV choices              | Meaning                                                                |
| -------------------- | ----- | ------------------------ | ---------------------------------------------------------------------- |
| Height frequency     | 2 Hz  | 0.5, 1, 2, 3, 5, 10 Hz   | Natural frequency of the sprung camera height                          |
| Height damping ratio | 1.0   | 0.5, 0.7, 1, 1.5, 2      | Damping ratio of the sprung camera height                              |
| Minimum clearance    | 0.3 m | 0, 0.3, 0.6, 1 m         | Lowest camera height above the rendered road at its station            |
| Yaw limit            | 45°   | 15, 30, 45, 60, 90, 180° | Camera yaw limit about the road heading at the car (stored in radians) |
| Yaw response         | 0 s   | 0, 0.1, 0.25, 0.5, 1 s   | Time constant following the limited body yaw; 0 follows it at once     |

## Vehicle values

The [vehicle mechanics documents](../content/vehicles/) and [vehicle listings](../content/vehicle-listings/)
are the sole authority for per-vehicle values. Production gameplay tuning edits those documents directly. [Vehicle physics](vehicle-physics.md)
owns document admission and structural/domain validation.

Mass (kg) and CG height (m) describe one running rigid body including a 75 kg occupant and fuel.
The provisional bike CG height is wheelbase × 0.3 for gameplay, including occupant and fuel in that
same rigid body. Car CG heights are provisional estimates. These values are gameplay parameters,
not claims of measured physical specifications.
Overall length, width and height are the real vehicle's body dimensions (mirrors excluded), not tuning values.

Torque-curve points contain RPM and torque in N m, joined linearly from idle through redline.
Vehicle compilation derives peak-power RPM from the maximum of `rpm * torque` over the complete
piecewise-linear curve, including any segment-interior maximum; that RPM must be below redline.
Upshift occurs at redline. Downshift occurs when the next lower ratio would place the engine at or
below that derived peak-power RPM. Shift RPM thresholds are not vehicle values.
Displacement is in cc and cycle is 2 or 4 strokes. Gear ratios and final drive are dimensionless.

## Exhaust topologies

[Engine-sound documents](../content/engine-sounds/) declare typical collector topologies; pipe lengths are rough
real-vehicle guides revised by listening. Junctions 0 and 1 are the cylinders' collectors unless noted.

| Vehicle            | Topology | Pipes (from → to, length)                                  |
| ------------------ | -------- | ---------------------------------------------------------- |
| TESTAROSSA         | 12-2     | 0 → open 0.85 m; 1 → open 0.85 m                           |
| 911_TURBO_3_3      | 6-2-1    | 0 → 2 0.3 m; 1 → 2 0.3 m (turbine inlet); 2 → open 0.9 m   |
| CORVETTE_C4        | 8-2-1-2  | 0 → 2 0.8 m; 1 → 2 0.8 m (X/H junction); 2 → open 1.2 m ×2 |
| GOLF_GTI_16V       | 4-1      | 0 → open 1.25 m                                            |
| DELTA_HF_INTEGRALE | 4-1      | 0 → open 1.65 m                                            |
| VFR750R            | 4-2-1    | 0 → 2 0.25 m; 1 → 2 0.25 m; 2 → open 0.55 m                |
| R80_GS_PARIS_DAKAR | 2-1      | 0 → 2 0.4 m; 1 → 2 0.4 m; 2 → open 0.85 m                  |
| FXRT_SPORT_GLIDE   | 2-1      | 0 → 2 0.35 m; 1 → 2 0.35 m; 2 → open 0.75 m                |
| PX200E_ARCOBALENO  | 1-1      | 0 → open 0.48 m                                            |

## Engine sound settings

Audio values are either [derived](#derived-values) or DEV listening settings. Every DEV default is the
implementer's initial value, not a value the owner chose by listening; the defaults are
[`DEFAULT_AUDIO_SETTINGS`](../src/audio/audio-defaults.ts) and the game reads the
[audio document](../content/audio/default.json), which holds the same values. [Exhaust acoustics](../src/audio/exhaust-acoustics.ts)
supplies the ENGINE group (`ExhaustSettings`) domains. Pulse rise is absolute time and pulse decay a crank angle (at 3000 RPM, 18° lasts 1 ms).

| Key                        | Meaning                                      | Default | UI range / step    |
| -------------------------- | -------------------------------------------- | ------- | ------------------ |
| `closedExcitation`         | Closed-throttle excitation                   | 0.22    | 0.01–1 / 0.01      |
| `pulseVariation`           | Absolute event-strength variation            | 0.20    | 0–0.40 / 0.01      |
| `pumpingExcitation`        | Firing strength during fuel cut              | 0.06    | 0.01–0.50 / 0.01   |
| `pulseRiseMs`              | Full-excitation pulse rise time              | 0.2 ms  | 0.05–2 ms / 0.01   |
| `pulseDecayDegrees`        | Pulse decay, crank angle                     | 90°     | 2–360° / 1°        |
| `outputCutoffHz`           | Final listening-filter cutoff                | 7300 Hz | 100–12000 Hz / 100 |
| `blipOpening`              | Downshift blip opening peak                  | 0.70    | 0–1 / 0.01         |
| `blipDecaySeconds`         | Downshift blip decay time                    | 0.08 s  | 0.02–0.30 s / 0.01 |
| `popProbability`           | Overrun pop probability per firing           | 0.12    | 0–1 / 0.01         |
| `popStrength`              | Overrun pop pulse strength                   | 0.50    | 0–1 / 0.05         |
| `cylinderWindowCycles`     | Cylinder-end boundary window, cycle fraction | 0.23    | 0.05–0.6 / 0.01    |
| `cylinderClosedReflection` | Closed cylinder-end pressure reflection      | 0.94    | 0.5–1 / 0.01       |
| `cylinderOpenReflection`   | Open cylinder-end pressure reflection        | -0.3    | -1–0.5 / 0.05      |
| `dcHz`                     | Output DC-removal corner                     | 18 Hz   | 5–60 Hz / 1        |
| `clipCeiling`              | Soft-clip bound and small-signal gain        | 0.65    | 0.2–1 / 0.01       |

Kernel domains equal these UI ranges except `closedExcitation` accepts `(0,1]` and `pumpingExcitation`
accepts `(0,0.5]`.

## UNIFIED tire settings

[UNIFIED acoustics](../src/audio/tire-unified-acoustics.ts) supplies these friction-model listening settings.
`powerReferenceWatts` is the accepted-work half-response point; output gain independently sets level.

| Key                         | Meaning                                                   | Default               | Range / step         |
| --------------------------- | --------------------------------------------------------- | --------------------- | -------------------- |
| `feedbackMaximumPerSecond`  | Maximum positive friction feedback                        | 8500 s⁻¹              | 2000–12000 / 100     |
| `powerReferenceWatts`       | Work half-response                                        | 12000 W               | 3000–30000 W / 500 W |
| `noiseForcePerSecond`       | Colored-force scale                                       | 1200 s⁻¹              | 0–2400 / 25          |
| `lowFrequencyHz`            | Low passive-mode frequency                                | 300 Hz                | 275–600 Hz / 5 Hz    |
| `highFrequencyHz`           | High passive-mode frequency                               | 1000 Hz               | 800–2400 Hz / 25 Hz  |
| `outputGainPerSecond`       | Displacement-pickup gain                                  | 900 s⁻¹               | 0–1800 / 25          |
| `saturationPerSecond`       | Cubic feedback dissipation                                | 6000 s⁻¹              | 3000–12000 / 100     |
| `slipHalfMps`               | Feedback slip half-response                               | 3 m/s                 | 1–12 m/s / 0.25      |
| `slipRolloffMps`            | High-slip feedback rolloff                                | 45 m/s                | 20–80 m/s / 1        |
| `noiseBandwidthHz`          | Colored-force bandwidth                                   | 600 Hz                | 100–2000 Hz / 25     |
| `outputCutoffHz`            | Friction output-filter cutoff                             | 8000 Hz               | 1000–12000 Hz / 100  |
| `resonanceDampingPerSecond` | Damping of both passive modes                             | `2*pi*500` ≈ 3142 s⁻¹ | 500–12000 / 50       |
| `lowParticipation`          | Low-mode participation; the high mode uses `sqrt(1-low²)` | 0.45                  | 0.05–0.95 / 0.01     |
| `dcHz`                      | Friction output DC removal                                | 18 Hz                 | 5–60 Hz / 1          |

Resolution also requires `resonanceDampingPerSecond/2 < 2*pi*lowFrequencyHz`, so both modes stay underdamped;
the DEV slider keeps its previous value when a change would break it. Control following uses the TIMING
`observationSeconds`.

## ROLLING tire settings

[Rolling acoustics](../src/audio/tire-rolling-acoustics.ts) supplies the rolling-model listening settings
(`RollingSettings`); ranges are about a quarter to four times each default. The orders are integers. The band
width is kept inside the noise band's numerical domain.

| Key                   | Meaning                               | Default | Range / step         |
| --------------------- | ------------------------------------- | ------- | -------------------- |
| `toneSeconds`         | Surface and wheel-frequency following | 0.02 s  | 0.005–0.08 / 0.001   |
| `lowOrder`            | Wheel order of the low band           | 4       | 1–24 / 1             |
| `highOrder`           | Wheel order of the high band          | 12      | 1–24 / 1             |
| `minimumHz`           | Lowest band centre                    | 35 Hz   | 9–140 Hz / 1         |
| `bandwidthRatio`      | Band width / centre                   | 0.8     | 0.2–3.2 / 0.05       |
| `loadHalfNewtons`     | Load half-response                    | 2000 N  | 500–8000 N / 50      |
| `speedHalfMps`        | Speed half-response                   | 15 m/s  | 4–60 m/s / 0.5       |
| `speedExponent`       | Speed-response exponent               | 1.5     | 0.4–6 / 0.1          |
| `attackSeconds`       | Level rise                            | 0.015 s | 0.004–0.06 / 0.001   |
| `releaseSeconds`      | Level fall                            | 0.01 s  | 0.0025–0.04 / 0.0005 |
| `textureMinimumDepth` | Minimum texture modulation depth      | 0.22    | 0.05–0.88 / 0.01     |
| `textureMaximumHz`    | Highest texture rate                  | 160 Hz  | 40–640 Hz / 5        |
| `gain`                | Rolling output gain                   | 0.04    | 0.01–0.16 / 0.005    |
| `outputHz`            | Rolling output low-pass cutoff        | 900 Hz  | 225–3600 Hz / 25     |
| `dcHz`                | Rolling output DC removal             | 18 Hz   | 5–60 Hz / 1          |

The [surface-sound document](../content/surface-sounds/default.json) holds these values.

| Surface  | Rolling low | Rolling high | Texture length | Texture depth | Friction roughness | Friction susceptibility |
| -------- | ----------- | ------------ | -------------- | ------------- | ------------------ | ----------------------- |
| ASPHALT  | 0.9         | 0.18         | 0.3 m          | 0.12          | 1                  | 1                       |
| SHOULDER | 0.85        | 0.7          | 0.6 m          | 0.4           | 1.3                | 0.4                     |
| GRASS    | 0.85        | 0.12         | 1.4 m          | 0.45          | 0.75               | 0.04                    |
| DIRT     | 1           | 0.55         | 0.8 m          | 0.8           | 1.5                | 0.12                    |
| SAND     | 0.3         | 0.8          | 0.12 m         | 0.2           | 1.1                | 0.02                    |

The only tire constants are structural: the random seeds (`UNIFIED_SYNTHESIS`), the rolling noise stream indices
and the internal rolling control rate (`ROLLING_SYNTHESIS`), and the noise band's numerical domain
(`NOISE_BAND_DOMAIN`).

## MIX settings

[Sound graph](../src/audio/sound-graph.ts) supplies the master compressor settings (`MixSettings`).

| Key              | Meaning              | Default | Range / step      |
| ---------------- | -------------------- | ------- | ----------------- |
| `thresholdDb`    | Compressor threshold | -6 dB   | -40–0 dB / 1      |
| `kneeDb`         | Compressor knee      | 6 dB    | 0–40 dB / 1       |
| `ratio`          | Compressor ratio     | 12      | 1–20 / 0.5        |
| `attackSeconds`  | Compressor attack    | 0.003 s | 0.001–0.1 / 0.001 |
| `releaseSeconds` | Compressor release   | 0.12 s  | 0.02–1 / 0.01     |

## TIMING settings

[Audio control](../src/audio/audio-control-policy.ts) supplies the control time constants (`ControlSettings`);
each range is about a quarter to four times its default, with step 0.001 s.

| Key                  | Meaning                                   | Default | Range        |
| -------------------- | ----------------------------------------- | ------- | ------------ |
| `observationSeconds` | Kernel following of acoustic observations | 0.025 s | 0.006–0.1 s  |
| `gainSeconds`        | Voice output gain following               | 0.025 s | 0.006–0.1 s  |
| `mixSeconds`         | Bus and master gain following             | 0.015 s | 0.004–0.06 s |
| `panSeconds`         | Rival pan following                       | 0.06 s  | 0.015–0.24 s |
| `fadeSeconds`        | Fade before replacement and on silence    | 0.01 s  | 0.003–0.04 s |
| `componentSeconds`   | R/Q output switching in the tire kernel   | 0.005 s | 0.001–0.02 s |
| `transitionSeconds`  | Wait after a fade before a discontinuity  | 0.09 s  | 0.023–0.36 s |

## RIVAL settings

[Audio scene](../src/audio/audio-scene.ts) supplies the rival settings (`RivalSettings`). The gain is the derived
inverse-distance law `referenceMeters/max(referenceMeters, distance)`; the audible cutoff is game policy.

| Key                   | Meaning                        | Default | Range / step      |
| --------------------- | ------------------------------ | ------- | ----------------- |
| `audibleMeters`       | Farthest selectable rival      | 100 m   | 20–300 m / 5      |
| `referenceMeters`     | Distance of unity gain         | 3 m     | 1–20 m / 0.5      |
| `panMinimumMeters`    | Pan denominator floor          | 3 m     | 1–20 m / 0.5      |
| `reassignmentSeconds` | Wait before a new rival sounds | 0.09 s  | 0.02–0.5 s / 0.01 |

## Derived values

These values follow from physics under the stated [assumptions](audio.md#derived-values); DEV controls never
change them.

| Value                                   | Derivation                                        | Value     |
| --------------------------------------- | ------------------------------------------------- | --------- |
| `ACOUSTICS.waveSpeed`                   | `sqrt(gamma*R*T)` at 573.15 K, rounded            | 480 m/s   |
| `PIPE_COEFFICIENTS.outletReflection`    | Unflanged open-end low-frequency limit            | -1        |
| `PIPE_COEFFICIENTS.returnCutoffHz`      | `c/(2*pi*radius)` at 25 mm radius, rounded        | 3100 Hz   |
| `PIPE_COEFFICIENTS.attenuationPerMeter` | Kirchhoff boundary-layer loss at 500 Hz, rounded  | 0.03 Np/m |
| Rival gain                              | Inverse distance, unity within `referenceMeters`  | —         |
| Rival pan                               | Lateral displacement / `max(panMinimumMeters, d)` | —         |

## Mix levels

| Control | Default | Range / meaning                           |
| ------- | ------- | ----------------------------------------- |
| MASTER  | 35%     | 0–100%; complete audio output             |
| ENG     | 100%    | 0–100%; player and selected rival engines |
| TIRE    | 100%    | 0–100%; player tire output                |
| R       | ON      | Rolling output tap for both axles         |
| Q       | ON      | Friction output tap for both axles        |
