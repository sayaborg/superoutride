# M9.7 — Bounded Zero-DC Washout Steering Assist

Status: current normative common steering-control and browser steering-calibration authority.
Vehicle handling values remain `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.7 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, canonical `DrivingInput`, one
finite normalized steering actuator, one physical front road-wheel angle, the first-order rack,
the contact/tire/wheel chain and all renderer, camera, route and topology authorities.

It supersedes only these earlier steering decisions:

- M8.1's stateless `betaTravel - yawRate*T_preview` prediction and its provisional `15 deg`
  driver-offset seed;
- M8.1's provisional general DEV rival controller calibration, which must be recalibrated as an
  ordinary canonical-input publisher for the new steering law;
- M9.0's stateless yaw-preview statement, common steering formula and authoritative-state list to
  the extent that the new Driver filter adds one scalar memory;
- M9.2 in full as the current steering-calibration and browser-selector authority.

M9.7 explicitly retains M9.2's symmetric normalized steering-actuator traversal choices, but
restates them here so M9.2 need not remain a partially current selector authority. M8.1, M9.0 and
M9.2 remain immutable chronological records.

The following remain unchanged:

- CG world pose, velocity and physical yaw/yaw-rate authority;
- travel-direction steering derived from CG velocity in the body frame;
- front-station slip as tire-force and telemetry authority, never Driver feedback;
- finite actuator response in `src/physics/driving-actuator.ts`;
- final road-wheel response through one `frontSteerAngle` and one rack time constant;
- CAR and BIKE use of one common solver without vehicle-kind branches;
- Guide, SurfaceMap, camera, route and topology independence;
- the HUD-only `18:1` handwheel presentation conversion.

## 2. Architecture decision gate

1. Common Driver control owns interpretation of canonical steering intent and transient yaw
   damping. Input devices publish normalized request only.
2. Existing authoritative CG velocity and yaw rate already express the required control. The only
   new state is one Driver-private low-frequency yaw-rate baseline.
3. Physical yaw remains solely `ArcadeVehicleState.yawRate`. The baseline is filter memory, not a
   second yaw, target yaw, force observation or presentation cache.
4. No CAR/BIKE, drive-layout, course, route-kind, stage, contact, camera or tire-material branch is
   added.
5. A bounded automatic-steering allocation and compiled-profile calibration express the result
   without a mode, hidden grip, speed-indexed map or second rack.
6. Frozen world-space, renderer-depth, metric, open-runtime and topology invariants are unchanged.
7. Unit, architecture, steady-envelope, deep-seed, recovery and integrated-course regressions
   protect both the causal behavior and the authority boundary.

## 3. Corrected diagnosis and design choice

The retired absolute-yaw preview was:

```text
betaPreview = betaTravel - yawRate*T_preview
```

Its prediction assumes that the body continues rotating while the world velocity direction stays
fixed. In a steady turn the velocity direction also rotates. The old term therefore has its largest
model error precisely where a preview should have no steady correction: nonzero constant yaw rate.
It permanently consumes road-wheel authority and creates steady understeer rather than supplying
only transient damping.

The physically completed short-horizon diagnosis would use:

```text
betaDot = velocityDirectionRate - yawRate
betaPredicted = betaTravel + betaDot*T
```

That diagnosis is accepted as the reason the old absolute-yaw term is superseded. It is not the
implemented repair. Observing `velocityDirectionRate` through `a_lat/v` would make Common Driver
consume total tire-force acceleration determined after steering in the current substep. It would
therefore expand the Driver input contract, require a delayed force observation to become mechanics
input and reopen the deliberate tire/Driver boundary.

M9.7 instead applies a zero-DC high-pass washout to the already-authoritative yaw rate. This keeps
the useful transient-damping role while converging to exactly zero correction for constant yaw
rate. The adoption reason is the smaller and cleaner authority boundary, not a claim that washout
is intrinsically faster than every force-observing predictor.

The earlier apparent `6.8 deg/s` versus `2.1 deg/s` threefold comparison was confounded: the
beta-dot candidate used `T=0.12 s` while washout used `T_w=0.18 s`. With equal `0.18 s` gain, the
measured reverse-yaw peaks were approximately `3.6/4.1 deg/s` for the beta-dot candidate and
`2.1/2.0 deg/s` for washout, with similar settling. This corrected comparison must not be used as
the architectural selection proof.

## 4. Parameter and state ledger

M9.7 separates structural rules, compiled-profile calibration, selectable vehicle calibration,
persistent Driver memory and derived values.

### Structural, not selectable

```text
travel-direction coefficient = exactly 1
```

`betaTravel` is a coordinate transformation from body heading to CG travel direction, not an
assist-strength knob. No `travelDirectionGain` type, state, setter, key, touch button, HUD value or
compatibility export remains. In particular, the retired `0 / 0.2 / ... / 1.0` selector must not be
recreated as a DEV comparison control.

### Compiled vehicle-profile parameters

```text
M     = maxRoadWheelSteer
D     = steeringOffsetMax
tauR  = steeringResponseTau
v0s   = steeringLowSpeedRegularization
Tw0   = steeringYawTransientGain       // ordinary construction default
tauW0 = steeringYawWashoutTime         // ordinary construction default
```

`steeringLowSpeedRegularization` is a new positive finite Driver parameter. It begins at
`1.0 m/s`, independently of the tire profile's low-speed regularization. A tire-law calibration
must not silently change the meaning of `betaTravel`.

`steeringYawWashoutTime` is also a new positive finite profile parameter. It is not hidden inside
the existing transient gain. `steeringYawTransientGain` is finite and nonnegative.

The automatic-steering allocation is derived rather than separately authored:

```text
A = steeringAutomaticMax = M - D
```

Compilation requires finite values and:

```text
0 < D < M < pi/2
v0s > 0
Tw0 >= 0
tauW0 > 0
steering applyRate = steering releaseRate > 0
```

The current provisional shared steering seed is:

```text
M     = 31 deg
tauR  = 0.01 s
v0s   = 1.0 m/s
Tw0   = 0.18 s
tauW0 = 0.35 s
```

Driver offset and its derived automatic allocation currently use two provisional profile-family
seeds without a mechanics branch:

| Profiles | `D` | `A=M-D` |
|---|---:|---:|
| `FR / MR / RR / AWD` | `9.5 deg` | `21.5 deg` |
| `BIKE1 / BIKE2` | `9 deg` | `22 deg` |

The four CAR profiles retain one shared steering package and the existing rule that their ordinary
differences are weight distribution/inertia plus AWD drive split. The two BIKE profiles share their
current seed through the same compiled-profile field and solver; no vehicle-kind branch is added.

The `9.5/9 deg` profile-family offsets have controlled evidence, including removal of the prior
15-to-16 m/s deep-plough transition. The final basin audit crosses every calm/deep `+/-43 deg` seed
with both full input signs at `12/15/16/20/25 m/s` for every profile. The earlier `10.5 deg`
candidate failed
that stronger protocol at `25 m/s`; it is evidence lineage, not an accepted M9.7 value.
BIKE1/BIKE2 flat-course steady and pulse probes have also been measured and remained inside the
current automatic allocation.
Those isolated results initially exposed approximately `87 deg` sideslip and metric/`qTravel`
failures when the pre-M9.7 rival controller was applied to mountain, Tsukuba and FISCO. The one
general rival controller is now recalibrated in section 7. Recovery-free full-lap regressions for
`FR / BIKE1 / BIKE2` on all three courses remain inside authored asphalt width, below `15 deg`
measured sideslip and at zero unsupported ticks. This is integration evidence, not a final
motorcycle handling freeze; all values remain `DEV_UNCALIBRATED`.

### Selectable vehicle-instance calibration

Exactly three values are runtime-adjustable and therefore exactly three steering selectors remain:

```text
yawTransientGain
yawWashoutTime
symmetric steering-actuator response
```

One `steeringCalibration` state owns them. Their selected values survive ordinary recovery and are
copied as one unit through DEV safe-spawn profile reconstruction. The Driver filter state is reset
separately and is not calibration.

### Persistent Driver memory

```text
SteeringAssistState.yawRateBaseline
```

This is the only new persistent dynamic value. It is owned by Common Driver, not by HUD telemetry,
tire state, contact state or input presentation.

### Derived-only values

```text
betaTravel
transientYawRate
automaticRaw
automaticSteer
roadWheelTarget
```

None is stored as a second angle, target or coordinate authority.

## 5. Normative steering law

For each physics substep of length `h`:

```text
Vlong = dot(V_CG, body_forward)
Vlat  = dot(V_CG, body_right)
betaTravel = atan2(Vlat, sqrt(Vlong^2 + v0s^2))

lambdaW = 1 - exp(-h/tauW)
yawRateBaseline_next = yawRateBaseline
                     + (yawRate - yawRateBaseline)*lambdaW
transientYawRate = yawRate - yawRateBaseline_next

driverOffset = steeringActuator*D

automaticRaw = betaTravel - Tw*transientYawRate
automaticSteer = clamp(automaticRaw, -A, +A)

roadWheelTarget = clamp(automaticSteer + driverOffset, -M, +M)

lambdaR = 1 - exp(-h/tauR)
frontSteerAngle_next = clamp(
  frontSteerAngle + (roadWheelTarget - frontSteerAngle)*lambdaR,
  -M,
  +M
)
```

The washout transfer from yaw rate to transient observation is:

```text
tauW*s / (1 + tauW*s)
```

Thus a yaw-rate change produces a temporary opposing correction, while any finite constant yaw
rate converges to zero correction. Direct `dr/dt`, a target-yaw model and force-derived lateral
acceleration are not consumed.

The washout is deliberately inside the `automaticSteer` clamp. While `automaticRaw` is saturated,
changing its yaw component has no rack effect. The filter nevertheless advances on every substep,
including saturation and flight, so damping re-enters continuously when the automatic allocation
leaves saturation. Moving the yaw term outside this clamp would break the reserved driver
allocation and is not an equivalent refactor.

## 6. Driver reservation and attractor safety

`A=M-D` reserves the complete authored driver offset before the final mechanical rack stop. At an
automatic limit, neutral, correct and opposite requests can therefore still produce distinct rack
targets instead of losing driver request to an already saturated automatic term.

This algebraic reservation is necessary but not sufficient. When `|betaTravel| > A`, the
uncompensated remainder can again create the same kind of saturated deep-plough equilibrium that
`travelDirectionGain < 1` produced. `A=M-D` is therefore safe only together with the compiled `D`
and its dynamic envelope.

The known-bad controlled mutation is:

```text
M = 31 deg
D = 15 deg
A = 16 deg
```

It is already unhealthy at or below `12 m/s` (`beta` approximately `-12.7 deg`, rear utilization
approximately `2.8`) and can converge at higher speeds to `-32` through `-55 deg` deep-sideslip
states with extreme tire demand. It can also reverse the apparent correct/incorrect recovery order
because drag, rather than driver authority, ends the slide. This configuration is a required
negative regression fixture and must never be cited as proof that the algebraic bound alone is
safe.

The controlled `D=10.5 deg / A=20.5 deg` predecessor is not the known-bad fixture, but it is also
not accepted. A Cartesian deep-seed audit found a `25 m/s` outer basin under one held-input sign.
The final executable protocol therefore crosses each seed with both signs rather than pairing each
seed with only one nominal recovery request.

The dynamic acceptance condition is intentionally stated as absence of the bad attractor, not
existence of one good equilibrium:

> On ordinary wide flat ASPHALT across the accepted speed range, no combination of a prescribed
> deep-beta initial seed and either full steering sign may remain in or converge to a stable
> equilibrium with `|betaTravel| >= A`.

The executable protocol must start from both calm and deep sideslip. A gentle turn-in that finds
only a healthy basin cannot satisfy this condition by itself.

## 7. Browser calibration authority

The browser exposes only the three genuinely adjustable vehicle-instance values:

| Control | Exact choices | Default | Keyboard |
|---|---|---:|---|
| Yaw transient gain `Tw` | `0 / 0.06 / 0.12 / 0.18 / 0.24 / 0.30 s` | `0.18 s` | `Y` cycles |
| Yaw washout time `tauW` | `0.20 / 0.35 / 0.50 / 0.65 s` | `0.35 s` | `U` cycles |
| Symmetric steering traversal | `0.25 / 0.375 / 0.50 / 0.625 s` | `0.375 s` | `T` cycles |

Touch exposes every exact choice directly. The common HUD formats the same vehicle-owned state.
All three top-level browser compositions use one selection table and one adapter.

Keys and numpad `4` through `9` have no steering-calibration meaning. In particular, `4` remains
unambiguously the FISCO course selector. There is no `SELF` selector or textual gain row.

Ordinary player and rival construction both begin from compiled-profile defaults. An explicit DEV
selection is a visible player-instance calibration override, not a hidden alternate default. Every
selectable actuator response has equal positive finite apply and release rates and affects only the
ordinary steering actuator channel.

The DEV rival remains an upper-level publisher of normalized canonical steering/throttle/brake
request. It publishes through the ordinary vehicle actuator and may not publish road-wheel angle,
read Driver filter memory or add course-, profile- or vehicle-kind branches. M9.7 retains the M8.1
`36 m` steering lookahead and `1.7 / 0.075 / 0.020` heading/cross-track/lateral-
speed feedback coefficients and `0.25 m/s` pedal deadband. The unmodelled absolute `-0.50*yawRate`
request term is removed; transient yaw damping belongs to the common bounded washout law.

The one general maximum request is recalibrated to `0.72`. It is derived from preserving the
pre-audit CAR driver-offset envelope after `D` changed: `0.65*10.5/9.5 = 0.718...`, rounded to the
two-decimal DEV control table. It stays below the player's full request and introduces no
course/profile branch. Recovery-free fork and full-course regressions own its acceptance.

The accepted general speed planner is:

```text
curve samples: contiguous 10 m spans from d=0 through a 400 m covered horizon
vCurve(kappa) = clamp(sqrt(0.42*g/abs(kappa)), 12 m/s, 56 m/s)
vAllow(d)     = sqrt(vCurve^2 + 2*(4 m/s^2)*d)
vTarget       = min(56 m/s, every finite vAllow)
vControl      = hypot(Vlong, Vlat)
```

The horizon is derived rather than course-tuned: braking from `56` to `12 m/s` at the provisional
`4 m/s^2` envelope requires `374 m`; rounding up to the `10 m` lattice and retaining two complete
probe spans gives `400 m`. The former planner instead imposed a distant curve's final speed
immediately throughout one sparse fixed window. On the M7.2 fork that combined a `43 -> 13 m/s`
braking demand with the physical lateral route choice and manufactured a deep slide.

Throttle and brake compare planar speed to `vTarget +/- 0.25 m/s`; no controller state or separate
path-settled throttle gate is added. `GuideCoordinateSource` must be passed intact so a committed
child frame retains its lateral origin. Converting it to a bare Guide before Driver sampling is not
equivalent and is rejected by the recovery-free fork regression.

## 8. Construction, recovery and profile reconstruction

Vehicle construction initializes:

```text
yawRateBaseline = current yawRate
```

Recovery reconstructs physical yaw rate first and then resets the Driver baseline to that same
value. This prevents an artificial one-substep steering kick. Recovery preserves the three
selected calibration values but does not preserve crash-era filter memory.

DEV profile switching performs the existing safe-spawn reconstruction, carries the three selected
calibration values as one copied unit and creates a fresh baseline from the reconstructed yaw rate.
No selector or recovery path may copy the baseline as calibration.

Changing `Tw`, `tauW` or actuator traversal during ordinary running does not reset world pose,
physical yaw, rack angle or the yaw baseline. The next substep consumes the new calibration through
the same common law.

## 9. Rejected alternatives and audit corrections

The following are explicitly not M9.7 authority:

- **Absolute `-yawRate*T`:** rejected because it permanently removes steady-turn authority.
- **Beta-dot prediction through `a_lat/v`:** valuable diagnosis, rejected implementation because it
  promotes a delayed total-tire-force observation into Driver mechanics input.
- **`yawRate - v*tan(delta)/wheelbase`:** rejected because target yaw contains the control's own
  steer angle; loop gain exceeds one near `v >= wheelbase/T` and the measured candidate saturated
  permanently at the mechanical stop.
- **General `yawRate-yawRateTarget`:** rejected because it needs a second model of achievable yaw
  rate and duplicates tire/body dynamics authority.
- **Raw `dr/dt`:** rejected because it has unbounded high-frequency gain and is sensitive to
  contact/substep discontinuity.
- **Zero transient gain as the product fix:** retained as a selectable diagnostic endpoint, not the
  default; it restores steady authority but reintroduces reverse-yaw overshoot and slower settling.
- **`travelDirectionGain < 1`:** rejected because it changes coordinate meaning and creates the
  deep-plough attractor. The gain state and selector are deleted rather than deprecated.
- **Automatic-angle bound without `D` envelope validation:** rejected because the `D=15/A=16`
  mutation proves the bound can recreate a bad saturated equilibrium and invert recovery meaning.

## 10. Executable acceptance

### Unit and architecture

Regression coverage must prove:

1. A constant yaw rate makes `transientYawRate` decay by the exact exponential law to zero.
2. A yaw-rate step initially produces the opposite steering correction and then decays; left and
   right are symmetric, finite and deterministic.
3. Construction and recovery initialize `yawRateBaseline=yawRate` and produce no artificial kick.
4. The washout state advances while automatic steering is saturated and while contacts are absent.
5. Clamp order is exact: beta and washout combine inside `A`; driver offset is added afterward;
   the final result alone is clamped by `M`.
6. `travelDirectionGain` state, setter, selection table, key handling, touch presentation, HUD
   field and compatibility export are absent.
7. Driver steering consumes no lateral-acceleration cache, tire slip/utilization, Guide heading,
   camera, route or screen observation.
8. Changing only tire low-speed regularization cannot change `betaTravel`; changing the separate
   steering regularizer can.
9. Profile compilation rejects invalid `D/M/v0s/Tw0/tauW0` and asymmetric steering response before
   construction, and derives exactly `A=M-D`.

### Browser and persistence

Regression coverage must prove:

1. The three exact tables, defaults, `Y/U/T` cycles, touch labels, accessible names, single-active
   states and HUD rows derive from one browser authority.
2. Steering controls reject digits/numpad `4` through `9`; course `4` remains FISCO.
3. Recovery and profile reconstruction preserve exactly the three selectable values, clone nested
   actuator response and reset only the Driver baseline.
4. Player and rival ordinary construction use identical profile defaults.
5. Every selectable combination remains finite, symmetric and deterministically replayable. Only
   the default combination owns the product-envelope thresholds; diagnostic endpoints need not
   equal its handling.
6. The general DEV rival remains a canonical-input publisher, consumes an intact coordinate frame
   and contains no course, route-kind, profile or CAR/BIKE branch.

### Causal handling envelope

The accepted default must be exercised on wide flat ASPHALT with both steering signs:

- steady full input across at least `12/15/16/20/25 m/s`, recording radius, beta and front/rear
  utilization, with no abrupt 15-to-16 m/s deep-plough transition;
- calm and deep-beta seeds of both signs, each crossed with both full input signs under constant-
  speed diagnostic control, proving no sampled stable `|betaTravel| >= A` attractor;
- the known-bad `D=15/A=16` mutation, proving the same deep-seed harness detects the forbidden
  attractor rather than merely finding a good basin;
- `25/35 m/s` steering pulses of `0.35/0.60 s`, bounding reverse yaw, return steer and settling for
  the default without comparing unequal controller gains;
- correct, neutral and wrong deep-slide recovery using time, integral `|beta|` and retained speed,
  so extreme drag cannot manufacture a false pass.

Current controlled evidence shows correct input and neutral are often equal within measurement
resolution; it does not prove a general correct-input time advantage. Acceptance therefore uses a
declared numerical tolerance: correct must not be worse than neutral, while wrong input must be
measurably worse. The tolerance must cover fixed-step quantization and must not be weakened until a
known-bad recovery ordering passes.

All six current profiles must continue to run the same flat protocol. The FR/BIKE1/BIKE2
recovery-free full-lap integration on mountain, Tsukuba and FISCO must remain inside authored road
width, below `15 deg` sideslip and at zero unsupported ticks while using the one ordinary canonical-
input publisher. Default tire preset behavior receives the performance thresholds; all tire
presets and selector combinations receive finite/deterministic coverage. Tsukuba, FISCO and the
low-speed hairpin integration remain ordinary uses of the same common solver.

## 11. Explicit non-goals

M9.7 adds no:

- target-yaw or target-curvature model;
- tire-force, slip-angle, utilization or SurfaceMap feedback in Driver control;
- speed-indexed steering map, TCS, drift mode or recovery assist;
- second rack, stored target angle or hidden player/rival default split;
- CAR/BIKE or drivetrain branch in common mechanics;
- renderer, camera, route, topology or race-progress change;
- final production handling calibration for the planned selectable vehicles.

## 12. Validation-record decision

This milestone changes a normative authority boundary. Under
`docs/validation/README.md`, release therefore requires a standalone M9.7 validation record. That
record is added only after the implementation-inclusive candidate receives complete exact-head CI,
then the validation-inclusive exact head must receive the complete suite again. No retrospective
or historical validation artifact is edited.
