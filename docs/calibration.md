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
| Tires      | LS    | `tire.loadSensitivity`                      | Tire force's sublinearity in load (r)        | 0.15    | 0.00–0.50 / 0.01           |
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

`fuelCutEnterRedlineRatio` (1.05), `fuelCutClearRedlineRatio` (1.03) and `clutchLockIdleMargin` (0.02) set the
latches' thresholds and keep them from chattering; they are edited only in the file. `suspensionProgression` (9.8) is the
game-wide suspension stiffness at full travel as a multiple of each ride spring rate
([Vehicle physics](vehicle-physics.md#suspension)); it is also edited only in the file. It must be finite and at
least 1; each vehicle model admits it through [suspension stability](vehicle-physics.md#suspension-stability).
`steeringReference` (`center`; `front` or `center`) and `steeringUtilization` (0.95, in `(0, 1]`) are the default
steering rule, a driver's rule rather than a vehicle value ([Vehicle physics](vehicle-physics.md#actuators-and-steering));
DEV does not tune them, so they too are edited only in the file.

PX and PY are dimensionless slips. The defaults give `kX = kY = 31.5` under the
[tire law](vehicle-physics.md#tire-law). Full steering input sets the front tire's pure-lateral slip at which its lateral force reaches the fraction X of its
bound on the material under the front wheel (at X = 100%, the plateau's start), measured from the front wheel's travel
direction turned back by the steering rule's lever times the yaw rate's departure from the steady turn asked for. The
travel direction has the rest of the rack, `M` minus that slip angle ([Vehicle physics](vehicle-physics.md#actuators-and-steering)); neither angle is an
authored value. The [DEV tuning registry](../src/shell/driving-tuning.ts) owns only these choices and
step positions. From any finite value, + moves to the smallest grid value above it and − to the largest below
it, wrapping from the last grid value to the first and back, also from outside the range; values off the grid are
shown exactly. A DEV adjustment steps the
player's tuned driving definition, admits it with the driving-document compiler (a rejected candidate
leaves the definition unchanged) and rebuilds the Session around a Session vehicle driving it
([Browser](browser.md#dev-controls)).

Tuned values reach the product only through the definition files. DEV EXPORT downloads the tuned
driving source document as `default.json` and the selected vehicle's source document as
`<vehicle id>.json`, written from the admitted documents, never from runtime values. Both use the
saved layout of [`formatSavedJson`](../src/content/saved-json.ts), which Prettier leaves unchanged: admission's field
order, two-space indentation, 120 columns, a below-root value on one line when it fits unless it is an object holding
more than primitives or an array Prettier always breaks, otherwise one entry per line with an array of numbers filling
each line, and JSON's own number and string spelling. The files in
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
Rates are their reciprocals. The fuel-cut ratios are dimensionless: fuel cuts above 1.05 times redline
and returns at 1.03 times redline. Engine friction uses provisional game-wide friction mean effective
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
`barrierFriction` is the dimensionless ratio of the friction along a wall or course limit to its push (0.3 is a
provisional value, to be judged on devices).

The full driving source document participates in vehicle identity for measured envelopes, reference times and
time budgets. Top-speed envelope measurement ends at steady-speed convergence or at the first
top-gear fuel-cut recovery; after a recovery the maximum is the greatest speed observed during the run.
Envelopes are measured on the envelope procedure's own reference surface, `ENVELOPE_REFERENCE_SURFACE`
in `tools/course/rival-envelope-measurement.ts`: grip factor 1 and rolling resistance 0 everywhere. It is not a
catalog material, so material IDs and values do not move the envelope; the reference is the vehicle's
capability on unit grip without surface drag.

A driver's utilization is the fraction of its tires' friction ellipses it plans to use: it scales the lateral and
longitudinal semi-axes of every axle alike, and the brake torques, so it acts on cornering, braking and acceleration
alike; its steering rule uses the same fraction of the front tire. Rival pace reads it as before. A vehicle's speed cap
is its steady speed on a level straight of unit grip without rolling resistance, at full utilization.

| Setting               | Value | Meaning                                                                                             |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Rival utilization     | 0.75  | Utilization of unpaced rivals, traffic and the player's Session driver (the takeover after GOAL)    |
| Reference utilization | 0.9   | Offline reference driver's utilization                                                              |
| Following time        | 1.5 s | Drivers' following time (`PLANNED_DRIVER.followSeconds`)                                            |
| Terminal clearance    | 2 m   | Left before a terminal, or behind the vehicle ahead, at a stop (`PLANNED_DRIVER.terminalClearance`) |

Drivers' rules read the following time and the terminal clearance
([Content and gameplay](content-and-gameplay.md#drivers)).

`PLANNED_DRIVER.version` identifies the driver policy: the record's values and the driving law that reads them —
planning, following, lane choice and merging, pedals and steering. It rises by one with every change that alters a
driver's input for the same vehicle state and observations, whether the change is to a value or to that law, and with
every field added to or removed from the record; a change that leaves every input the same keeps it. The reference
driver's record, part of the reference run's procedure record, contains it. It is 1: the planned driver.

## Camera settings

The [camera definition](../src/view/camera-definition.ts) holds the camera's values; DEV camera controls replace
the horizon row and the height frequency for the session without saving, and a reload restores them. The focal length
(240 px), the camera height (2 m above the player's base point with a level body), the critically damped height
spring and the yaw limit (45° about the road heading at the car, taken at once) are fixed; what the yaw follows is the
player's setting ([Architecture](architecture.md#camera-and-fixed-metric)). The horizon row moves the whole view up
or down the screen, the background with it, and the player's base point stays `f*h/D_cam` = 80 rows below it. The
background scrolls `f` pixels per radian of yaw, as distant road and sprites do; vertically it keeps one image row per
screen row ([Image assets](image-assets.md#infinite-tiled-background)).

| Setting          | Value | DEV choices                   | Meaning                                           |
| ---------------- | ----- | ----------------------------- | ------------------------------------------------- |
| Horizon row      | 120   | 60, 70, 80, 90, 100, 110, 120 | The horizon's screen row with a level body        |
| Height frequency | 2 Hz  | 0.5, 1, 2, 3, 5, 10 Hz        | Natural frequency of the sprung base point height |

## Vehicle values

The [vehicle mechanics documents](../content/vehicles/) and [vehicle listings](../content/vehicle-listings/)
are the sole authority for per-vehicle values. Production gameplay tuning edits those documents directly. [Vehicle physics](vehicle-physics.md)
owns document admission and structural/domain validation.

Mass (kg) and CG height (m) describe one running rigid body including a 75 kg occupant and fuel.
The provisional bike CG height is wheelbase × 0.3 for gameplay, including occupant and fuel in that
same rigid body. Car CG heights are provisional estimates. These values are gameplay parameters,
not claims of measured physical specifications.
Overall length, width and height are the real vehicle's body dimensions (mirrors excluded), not tuning values; the
width is also the side of the vehicle's square footprint ([Vehicle physics](vehicle-physics.md)).

Each torque curve has five points of RPM and torque in N m, joined linearly: A at idle; B, the knee between A and
C where the slope changes markedly; C, the maximum torque; D, the maximum power; and E at redline. C and D are the
vehicle's rated figures where they are known (D's torque is rated power / ω); B and the curve's shape follow published
descriptions of the engine; A and E are estimates, with E low enough that D stays the power peak
([Vehicle physics](vehicle-physics.md#wheel-and-powertrain) admits the curve). Upshift occurs at redline. Downshift
occurs when the next lower ratio would place the engine at or below D's RPM. Shift RPM thresholds are not vehicle values.
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

## SCRAPE settings

[Wall scrape acoustics](../src/audio/wall-scrape-acoustics.ts) supplies the walls' scraping settings
(`ScrapeSettings`): the items, meanings and ranges of the UNIFIED table above, except the work half-response, whose
range is about a quarter to four times its default. The defaults are the implementer's, not chosen by listening: the
UNIFIED defaults, a work half-response of 90 kW, set near the median wall-rub power measured on departures from a road
at about 30 m/s (peaks about 12 MW), and slip half-response and rolloff for wall speeds.

| Key                   | Default   | Range / step            |
| --------------------- | --------- | ----------------------- |
| `powerReferenceWatts` | 90000 W   | 22500–360000 W / 2500 W |
| `slipHalfMps`         | 8 m/s     | 1–12 m/s / 0.25         |
| `slipRolloffMps`      | 80 m/s    | 20–80 m/s / 1           |
| Every other key       | UNIFIED's | UNIFIED's               |

## IMPACT settings

[Impact acoustics](../src/audio/impact-acoustics.ts) supplies each counterpart's impact reference work
(`ImpactSettings`): an impact sounds at `W / (W + reference)`. Ranges are about a quarter to four times each default.
The defaults are the implementer's, not chosen by listening: about a 10 m/s closing of two cars (about 45 kJ), a hard
hit of a wall or object (wall starts measured on departures from a road ran from about 300 J to 1.6 MJ) and a cone at race
speed (about 7 kJ).

| Key             | Counterpart                       | Default  | Range / step            |
| --------------- | --------------------------------- | -------- | ----------------------- |
| `vehicleJoules` | Another vehicle                   | 50000 J  | 12500–200000 J / 500 J  |
| `wallJoules`    | Wall, course limit, wall free end | 100000 J | 25000–400000 J / 1000 J |
| `objectJoules`  | Fixed object                      | 100000 J | 25000–400000 J / 1000 J |
| `movableJoules` | Movable object                    | 7000 J   | 1750–28000 J / 50 J     |

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

| Surface     | Rolling low | Rolling high | Texture length | Texture depth | Friction roughness | Friction susceptibility |
| ----------- | ----------- | ------------ | -------------- | ------------- | ------------------ | ----------------------- |
| ASPHALT     | 0.9         | 0.18         | 0.3 m          | 0.12          | 1                  | 1                       |
| WET_ASPHALT | 0.9         | 0.36         | 0.3 m          | 0.12          | 1                  | 0.7                     |
| SHOULDER    | 0.85        | 0.7          | 0.6 m          | 0.4           | 1.3                | 0.4                     |
| GRASS       | 0.85        | 0.12         | 1.4 m          | 0.45          | 0.75               | 0.04                    |
| DIRT        | 1           | 0.55         | 0.8 m          | 0.8           | 1.5                | 0.12                    |
| SAND        | 0.3         | 0.8          | 0.12 m         | 0.2           | 1.1                | 0.02                    |

WET_ASPHALT's surface sound is ASPHALT's with two physical changes: a water film adds spray and drainage noise above
about 1 kHz, by several decibels on wet surfaces (Sandberg and Ejsmont, _Tyre/Road Noise Reference Book_, 2002), taken
as 6 dB on the high band (0.18 × 2); and its friction susceptibility, the tendency of sliding to excite the tire,
scales with the friction it lubricates away, by the wet-road friction ratio 0.7 ([Surface materials](#surface-materials)).
The texture, a property of the asphalt under the water, is unchanged.

The [wall-sound document](../content/wall-sounds/default.json) holds the walls' friction inputs. They are the
implementer's values, not chosen by listening. Course limits use `limit`.

| Wall sound  | Meant for            | Friction roughness | Friction susceptibility |
| ----------- | -------------------- | ------------------ | ----------------------- |
| `limit`     | Every course limit   | 1                  | 0.5                     |
| `guardrail` | Guardrails           | 1                  | 1                       |
| `rock`      | Rock and cliff faces | 2                  | 0.2                     |
| `wall`      | Low walls            | 1.5                | 0.5                     |

The only tire constants are structural: the random seeds (`UNIFIED_SYNTHESIS`), the rolling noise stream indices
and the internal rolling control rate (`ROLLING_SYNTHESIS`), and the noise band's numerical domain
(`NOISE_BAND_DOMAIN`).

## Surface materials

The [material catalog](../content/materials/surface.json) holds each surface's grip factor (its scale on the tire
law's friction) and rolling resistance coefficient.

| Material    | Grip factor | Rolling resistance |
| ----------- | ----------- | ------------------ |
| ASPHALT     | 1           | 0.014              |
| WET_ASPHALT | 0.7         | 0.014              |
| SHOULDER    | 0.78        | 0.025              |
| GRASS       | 0.43        | 0.065              |
| DIRT        | 0.52        | 0.045              |
| SAND        | 0.33        | 0.11               |

WET_ASPHALT is ASPHALT with a water film: its grip factor is the wet-road friction ratio, 0.7, from the typical peak
adhesion of asphalt dry (0.8–0.9) and wet (0.5–0.7) (J. Y. Wong, _Theory of Ground Vehicles_, 4th ed., 2008, Table 1.1),
the ratio of the ranges' midpoints (0.6 / 0.85 ≈ 0.71) rounded. Its rolling resistance is ASPHALT's: the film's extra
resistance at speed is not modelled.

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
each range is about a quarter to four times its default, with step 0.001 s (0.1 s for `musicFadeSeconds`, the
implementer's value, not chosen by listening).

| Key                  | Meaning                                   | Default | Range        |
| -------------------- | ----------------------------------------- | ------- | ------------ |
| `observationSeconds` | Kernel following of acoustic observations | 0.025 s | 0.006–0.1 s  |
| `gainSeconds`        | Voice output gain following               | 0.025 s | 0.006–0.1 s  |
| `mixSeconds`         | Bus and master gain following             | 0.015 s | 0.004–0.06 s |
| `panSeconds`         | Rival pan following                       | 0.06 s  | 0.015–0.24 s |
| `fadeSeconds`        | Fade before replacement and on silence    | 0.01 s  | 0.003–0.04 s |
| `componentSeconds`   | R/Q output switching in the tire kernel   | 0.005 s | 0.001–0.02 s |
| `transitionSeconds`  | Wait after a fade before a discontinuity  | 0.09 s  | 0.023–0.36 s |
| `musicFadeSeconds`   | Run's track fade at GOAL and GAME OVER    | 2 s     | 0.5–8 s      |

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
| MUSIC   | 100%    | 0–100%; the `music` bus                   |
| EFFECTS | 100%    | 0–100%; the `effects` bus                 |
| ENG     | 100%    | 0–100%; player and selected rival engines |
| TIRE    | 100%    | 0–100%; player tire output                |
| R       | ON      | Rolling output tap for both axles         |
| Q       | ON      | Friction output tap for both axles        |
