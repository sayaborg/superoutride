# SUPER OUTRIDE — M9.12B Upward Tire Range Expansion

## 0. Status

Current scoped DEV tire-selector authority.

This document supersedes M9.12A only for the browser-exposed GRIP and PEAK comparison tables.
It changes no tire constitutive law, steering law, state ownership, production vehicle profile, or
SLIDE behavior.

Handling remains `DEV_UNCALIBRATED`.

## 1. Reason

Current hands-on evaluation reached the upper edge of the M9.12A tire comparison window:

- higher GRIP consistently felt preferable through the exposed range;
- higher PEAK consistently felt preferable through the exposed range.

Therefore the previous lower values no longer provide useful local discrimination. The correct next
falsification step is to move the comparison window upward rather than freeze the former maximum.

This is an exploration-range change, not a claim that effective mu up to 3.00 or common peak slip up
to 30% is a production-real tire specification.

## 2. Current browser tire comparison tables

```text
GRIP  = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00
PEAK  = 20 / 22 / 24 / 26 / 28 / 30 %
SLIDE = 70 / 75 / 80 / 85 / 90 %
```

Browser defaults remain:

```text
GRIP  = 2.00
PEAK  = 20%
SLIDE = 80%
```

Keeping the prior working point as the default preserves a stable A/B reference while exposing only
the newly useful upward direction.

## 3. Independence contract

M9.12 remains authoritative for the three-axis interpretation:

```text
GRIP  = peak force height
PEAK  = common normalized slip at peak
SLIDE = large-lateral-slip plateau / peak
```

Changing GRIP must preserve displayed PEAK and SLIDE.
Changing PEAK must preserve displayed GRIP and SLIDE.
Changing SLIDE must preserve displayed GRIP and PEAK.

The implementation continues to use the existing three-scalar vehicle-owned tire calibration only:

- `referenceFrictionMultiplier`
- `linearStiffnessMultiplier`
- `slidingFrictionRatio`

No browser selector ID enters physics state.

## 4. Retained tire architecture

The following are unchanged:

- one common one-k tire law;
- front/rear normalized stiffness seed ownership;
- M9.10 stateless C1 lateral post-peak law;
- pure-longitudinal behavior unaffected by SLIDE;
- scalar implicit wheel solve;
- no tire memory;
- no drift mode;
- no target sideslip;
- no longitudinal/lateral tire-profile split yet.

The complete exposed product is now 6 GRIP x 6 PEAK x 5 SLIDE = 180 tire calibrations and must remain
finite under the retained wheel solve.

## 5. Steering scope

M9.12A remains current for the browser steering comparison range and starting point:

```text
D   = 10 / 11 / 12 / 13 / 14 deg       default 12 deg
M   = 50 / 55 / 60 / 65 / 70 deg       default 60 deg
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s default 0.25 s
```

M9.11 remains the steering-law authority:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

M9.12B introduces no steering/tire coupling and no runtime limiter.

## 6. Interpretation rule

If handling again improves monotonically all the way to GRIP=3.00 and PEAK=30%, those values must
not automatically become final tire specifications. Hitting the new upper boundary is evidence that
the reduced vehicle model may still be using the tire curve to compensate for omitted lateral
transient/body behavior. That result should trigger another architecture-level diagnosis before the
range is extended or frozen again.
