# M9.2 — Selectable Travel-Direction Self-Steer Gain

Status: normative vehicle-control calibration and browser-debug composition authority.

## 1. Scope

M9.2 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, M9.1 six compiled vehicle
profiles, three finite actuators, yaw-rate preview, tire model, camera modes and renderer.

It supersedes only the implicit unit coefficient on the retained M8.1/M9.0 travel-direction
steering term and the M9.0 common steering-actuator neutral-release rate. The user may compare five
explicit gains while the driver steering offset returns to neutral faster than it did in M9.0.

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
0.3  0.4  0.5  0.6  0.7
```

The browser-player default is `0.5`, selected from the user calibration result. The general vehicle
mechanics default remains `1.0`, so ordinary construction and rivals are not silently redefined by
the browser-player calibration control.

## 3. Steering actuator release

The retained finite steering actuator continues to apply driver steering at `1.6 normalized/s`,
equivalent to `24 deg/s` over the `15 deg` maximum driver road-wheel offset. Its neutral release is:

```text
8 normalized/s = 120 deg/s = 0.125 s full-scale-to-neutral
```

This supersedes the M9.0 `4 normalized/s` (`60 deg/s`, `0.25 s`) release only. It removes the
driver-offset term sooner after every steering source is neutral; it does not scale the
travel-direction or yaw-preview terms and does not alter the final road-wheel response time.

## 4. Authority and lifetime

Each common vehicle instance owns exactly one current `travelDirectionSteeringGain`. It is not a
camera value, tire property, vehicle-kind branch, course rule or input-source state.

The player selection:

- applies immediately without resetting world pose or motion;
- survives manual/automatic recovery;
- is copied through DEV safe-spawn reconstruction when selecting another vehicle profile;
- applies identically to FR, MR, RR, AWD, BIKE1 and BIKE2 through the common solver.

Ordinary rivals retain the mechanics default `1.0`; the browser selector is a player calibration control,
not a global AI handling mutation.

## 5. Browser selection

One browser selection table owns keyboard, numpad, touch labels and HUD formatting:

```text
[4] 0.3
[5] 0.4
[6] 0.5
[7] 0.6
[8] 0.7
```

All three top-level compositions consume that table. Touch buttons publish the same values and
the shared HUD reads the current vehicle value. Presentation owns no second gain state.

Keys `1` through `3` remain the existing course-mode authority. The gain table begins at `4` to
avoid creating a second meaning for `3`.

## 6. Explicit non-goals

M9.2 adds no:

- speed-dependent curve;
- dead zone, hysteresis or timer;
- camera-dependent steering correction;
- tire/grip change;
- steering apply-rate, final road-wheel response or yaw-preview change;
- vehicle/profile-specific gain branch;
- route, course or topology dependency;
- automatic gain selection.

The five values are a controlled calibration comparison. Vehicle handling remains
`DEV_UNCALIBRATED` until a later authority chooses a final product value.

## 7. Acceptance

Executable acceptance must prove:

1. `4` through `8` and their numpad equivalents map to the five exact values.
2. The common formula scales only `betaTravel`.
3. Invalid or non-finite mechanics gains are rejected before state mutation.
4. The selected value survives profile reconstruction and recovery.
5. Keyboard, touch and HUD derive from one browser choice table.
6. Every profile remains on the same common mechanics path.
7. The deterministic 25 m/s FR calibration sweep records opposite steer, reverse yaw, settle time
   and tire utilization for all five values.
8. Steering apply remains `1.6 normalized/s`; neutral release is exactly `8 normalized/s` and
   reaches zero through the ordinary shared actuator path.
9. Camera, tire, final road-wheel response, renderer, route and topology invariants remain unchanged.
