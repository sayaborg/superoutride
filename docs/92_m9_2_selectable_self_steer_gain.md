# M9.2 — Selectable Steering Calibration

Status: normative vehicle-control calibration and browser-debug composition authority.

## 1. Scope

M9.2 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, M9.1 six compiled vehicle
profiles, tire/contact/wheel chain, camera modes and renderer. It preserves the current steering law
and exposes its two feedback coefficients plus the symmetric driver-steering actuator response as
three independent calibration selectors.

It supersedes the M9.0 implicit unit coefficient on travel-direction steering feedback and the
M9.0 asymmetric common steering-actuator rates. It does not merge input arbitration, tire forces,
final road-wheel response or camera behavior into calibration.

## 2. Unchanged steering law

The common road-wheel target remains:

```text
betaTravel = atan2(Vlateral, sqrt(Vlongitudinal^2 + v0^2))

target = clamp(
  travelDirectionGain * betaTravel
  - yawRate * yawPreviewTime
  + steeringActuator * steeringOffsetMax,
  -maxRoadWheelSteer,
  +maxRoadWheelSteer
)
```

The three additive terms remain separate:

- `travelDirectionGain` scales only the CG travel-direction error `betaTravel`;
- `yawPreviewTime` converts measured yaw rate to a predicted yaw angle and subtracts it;
- `steeringActuator * steeringOffsetMax` is only the finite-response driver request.

The selector does not apply one shared gain to both feedback terms. Doing so would prevent their
effects from being calibrated independently and would change the accepted current formula.

The final target is still followed through the existing first-order road-wheel response
`steeringResponseTau`. The actuator selector below does not replace or alter that response.

## 3. Browser calibration choices

The browser player begins with:

```text
travelDirectionGain = 0.4
yawPreviewTime      = 0.12 s
steering traversal  = 0.375 s
```

The travel-direction choices are:

```text
0.0  0.2  0.4  0.6  0.8  1.0
```

The yaw-preview choices are:

```text
0.00  0.06  0.12  0.18  0.24  0.30 s
```

The symmetric steering-actuator choices are expressed as normalized zero-to-full traversal time:

```text
0.250  0.375  0.500  0.625 s
```

Their exact rates are:

```text
4       normalized/s
8/3     normalized/s
2       normalized/s
1.6     normalized/s
```

For every choice:

```text
applyRate = releaseRate
```

Thus driver steering application and neutral release remain symmetric by construction. There is no
independent apply/release selector and no direction-specific response.

## 4. Mechanics defaults and domains

Ordinary common-mechanics construction retains:

```text
travelDirectionGain = 1.0
yawPreviewTime      = compiled profile value
steering response   = compiled profile actuator value
```

This keeps rivals and non-browser fixtures from silently inheriting the browser-player calibration.
The common mechanics validates:

```text
0 <= travelDirectionGain <= 1
0 <= yawPreviewTime < infinity
0 < applyRate < infinity
0 < releaseRate < infinity
```

The browser selector always supplies equal finite positive steering rates.

## 5. One vehicle-instance authority

Each common vehicle instance owns exactly one `steeringCalibration` state containing the three
current values. The browser presentation owns no duplicate active value.

Player selections:

- apply immediately without resetting world pose or motion;
- survive manual and automatic recovery because recovery does not reconstruct calibration;
- are passed as one unit through DEV safe-spawn reconstruction when selecting another profile;
- apply identically to FR, MR, RR, AWD, BIKE1 and BIKE2 through the common solver.

Ordinary rivals retain the mechanics defaults. Calibration is not a vehicle-kind, camera, course,
route, topology, input-source or tire branch.

## 6. Browser controls

One browser selection module owns keyboard, touch labels, defaults, cycling and HUD formatting.

```text
[4] 0.0   [5] 0.2   [6] 0.4   [7] 0.6   [8] 0.8   [9] 1.0
[Y] cycle yaw preview
[T] cycle symmetric steering traversal time
```

Numpad `4` through `9` mirror the gain keys. Touch exposes every value directly. All three top-level
compositions consume the same selection authority, while the shared HUD reads only the current
vehicle state.

Keys `1` through `3` remain the existing course-mode authority.

## 7. Explicit non-goals

M9.2 adds no:

- new steering formula or term;
- speed-dependent curve, dead zone, hysteresis or timer;
- camera-dependent steering correction;
- tire, slip or grip change;
- final road-wheel response change;
- asymmetric application/release behavior;
- vehicle/profile-specific calibration branch;
- route, course or topology dependency;
- automatic calibration selection.

These are controlled DEV calibration comparisons. Vehicle handling remains `DEV_UNCALIBRATED`
until a later authority chooses final product values.

## 8. Acceptance

Executable acceptance must prove:

1. Keys/numpad `4` through `9` map to the six exact travel-direction gains.
2. `Y` and `T` cycle their canonical tables and touch exposes the same exact values.
3. The common formula keeps gain, yaw preview and driver offset as independent additive terms.
4. Invalid or non-finite mechanics calibration is rejected before state mutation.
5. All three values survive recovery and profile reconstruction as one vehicle-instance state.
6. Every actuator choice has identical apply and release rates and is consumed only by the ordinary
   shared steering actuator channel.
7. Keyboard, touch and HUD derive from one browser selection module.
8. Every profile remains on the same common mechanics path.
9. Deterministic sweeps cover every gain, yaw-preview and symmetric-response choice.
10. Input arbitration, tire/contact/wheel behavior, final road-wheel response, camera, renderer,
    route and topology invariants remain unchanged.

M9.2 release evidence is recorded in
`docs/validation/M9_2_SELECTABLE_STEERING_CALIBRATION_VALIDATION.txt`; immutable Git/PR/main/workflow
history supplies the validation-inclusive exact-head and Pages identities.
