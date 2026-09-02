# 102 — M9.11A Steering Selector Test Range

Status: current scoped DEV steering-selector authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope

This document supersedes M9.11 only for the browser-exposed DEV comparison tables for `M`, `D`
and symmetric steering traversal `T`.

It does **not** change:

- the M9.11 steering law;
- `A = M - D` derived-only ownership;
- vehicle profile defaults;
- the physical rack or actuator model;
- any tire constitutive behavior or `SLIDE` selector;
- any final D limit or final handling calibration.

The purpose is only to widen and refine the current player evaluation domain while handling remains
unfrozen.

## 2. Current DEV selector domain

```text
M = 45 / 50 / 55 / 60 / 65 deg
D = 9 / 9.5 / 10 / 11 / 12 / 13 / 14 deg
T = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 / 0.325 / 0.35 s
```

Defaults remain:

```text
M = 45 deg
D = 9.5 deg CAR / 9 deg BIKE
T = 0.25 s
```

The 9.5-degree D entry is retained because it is the current CAR profile seed and therefore must be
an explicit selector value rather than an off-table initial condition.

The T table is intentionally finer because steering traversal response is currently under direct
player evaluation.

## 3. Derived automatic authority

No automatic steering authority is stored. For every exposed pair:

```text
A = M - D
```

The minimum exposed automatic authority is therefore:

```text
A_min = 45 - 14 = 31 deg
```

This is a consequence of the DEV comparison domain, not a newly frozen design target.

## 4. D-limit status

No speed-dependent or tire-dependent runtime D limiter is introduced here.

The final useful D range remains intentionally open until tire behavior is evaluated. In particular,
this selector expansion does not decide whether final D should be bounded by a useful front-tire
slip range. That remains a later handling-calibration decision.

## 5. Executable acceptance

1. Browser `M` choices are exactly `45 / 50 / 55 / 60 / 65 deg`.
2. Browser `D` choices are exactly `9 / 9.5 / 10 / 11 / 12 / 13 / 14 deg`.
3. Browser `T` choices are exactly `0.20 / 0.225 / 0.25 / 0.275 / 0.30 / 0.325 / 0.35 s`.
4. Every exposed M/D pair satisfies `0 < D < M < pi/2` and derives `A=M-D`.
5. The smallest-M/largest-D/slowest-T corner remains finite for all nine production profiles.
6. Profile defaults and the steering/tire solver remain unchanged.
