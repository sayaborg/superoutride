# M6.5 — Deterministic Vehicle Physics Telemetry

## Purpose

Vehicle handling is not tuned yet. This milestone therefore does **not** tune or freeze current car/bike behavior. It creates a deterministic measurement path that can be used later when handling work begins.

Current status is explicit:

```text
DEV_UNCALIBRATED
```

## Observer-only design

`src/dev/vehicle-telemetry.ts` reads the M6.4 vehicle output contract after each fixed physics tick.

It records:

```text
tick
DrivingInput
world x/y/z
yaw
Guide s/l
longitudinal speed
lateral speed
```

It never writes vehicle state and never participates in physics integration.

## Summary metrics

The recorder derives:

- simulated duration;
- planar world distance;
- signed chainage travel, seam-safe on a closed course;
- maximum resultant speed;
- maximum absolute lateral Guide excursion;
- maximum absolute sideslip angle;
- maximum absolute yaw rate, angle-wrap safe.

These are measurement channels, not target values.

## Historical baseline

The validated implementation produced this three-second DEV probe:

```text
planar distance       146.61675053161213 m
signed chainage       146.5840739686775 m
max speed              50.91715773929218 m/s
max |l|                 1.3569373205385356 m
max |sideslip|          2.35110874660764 deg
max |yaw rate|          9.238084564698875 deg/s
```

This baseline is recorded only so later tuning changes can be inspected. CI does **not** require these numbers to remain unchanged.

## What CI actually freezes

CI requires only architectural/measurement properties:

```text
same initial state + same fixed-tick inputs + same physics implementation
    -> same telemetry summary
```

and:

- finite metrics;
- no observer mutation;
- seam-safe chainage accumulation;
- wrap-safe yaw-rate derivation.

Therefore future intentional changes to grip, steering, yaw response, acceleration, braking, drift or motorcycle behavior are allowed.

Validated result:

```text
143 tests
143 pass
0 fail
```

## Next use

The telemetry channel is intended to support repeatable A/B handling experiments. The next useful layer is a deterministic input-trace format so the exact same driver command sequence can be replayed against two different physics parameter sets or implementations.
