# M9.2 — Selectable Travel-Direction Self-Steer Gain

Status: normative vehicle-control calibration and browser-debug composition authority.

## 1. Scope

M9.2 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, M9.1 six compiled vehicle
profiles, three finite actuators, yaw-rate preview, tire model, camera modes and renderer.

It supersedes only the implicit unit coefficient on the retained M8.1/M9.0 travel-direction
steering term. The user may compare six explicit gains without changing any other steering or
vehicle parameter.

## 2. Steering law

The common road-wheel target is:

```text
betaTravel = atan2(Vlateral, sqrt(Vlongitudinal^2 + v0^2))

target = clamp(
  travelDirectionGain * betaTravel
  - yawRate * steeringYawPreviewTime
  + steeringActuator * steeringOffsetMax,
  -maxRoadWheelSteer,
  +maxRoadWheelSteer
)
```

`travelDirectionGain` scales only `betaTravel`. It must not scale, replace or condition the
yaw-rate preview or driver offset.

The ordinary mechanics domain is one finite scalar:

```text
0 <= travelDirectionGain <= 1
```

The browser calibration choices are exactly:

```text
0.5  0.6  0.7  0.8  0.9  1.0
```

The default is `1.0`, preserving the released M9.0 behavior until the user selects another value.

## 3. Authority and lifetime

Each common vehicle instance owns exactly one current `travelDirectionSteeringGain`. It is not a
camera value, tire property, vehicle-kind branch, course rule or input-source state.

The player selection:

- applies immediately without resetting world pose or motion;
- survives manual/automatic recovery;
- is copied through DEV safe-spawn reconstruction when selecting another vehicle profile;
- applies identically to FR, MR, RR, AWD, BIKE1 and BIKE2 through the common solver.

Ordinary rivals retain the default `1.0`; the browser selector is a player calibration control,
not a global AI handling mutation.

## 4. Browser selection

One browser selection table owns keyboard, numpad, touch labels and HUD formatting:

```text
[4] 0.5
[5] 0.6
[6] 0.7
[7] 0.8
[8] 0.9
[9] 1.0
```

All three top-level compositions consume that table. Touch buttons publish the same values and
the shared HUD reads the current vehicle value. Presentation owns no second gain state.

## 5. Explicit non-goals

M9.2 adds no:

- speed-dependent curve;
- dead zone, hysteresis or timer;
- camera-dependent steering correction;
- tire/grip change;
- actuator-rate or yaw-preview change;
- vehicle/profile-specific gain branch;
- route, course or topology dependency;
- automatic gain selection.

The six values are a controlled calibration comparison. Vehicle handling remains
`DEV_UNCALIBRATED` until a later authority chooses a final product value.

## 6. Acceptance

Executable acceptance must prove:

1. `4` through `9` and their numpad equivalents map to the six exact values.
2. The common formula scales only `betaTravel`.
3. Invalid or non-finite mechanics gains are rejected before state mutation.
4. The selected value survives profile reconstruction and recovery.
5. Keyboard, touch and HUD derive from one browser choice table.
6. Every profile remains on the same common mechanics path.
7. The deterministic 25 m/s FR calibration sweep records opposite steer, reverse yaw, settle time
   and tire utilization for all six values.
8. Camera, tire, actuator, renderer, route and topology invariants remain unchanged.
