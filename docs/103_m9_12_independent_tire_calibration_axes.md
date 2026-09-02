# M9.12 — Independent Tire Calibration Axes

Status: current normative DEV browser tire-calibration authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.12 supersedes M9.10 only for the current browser tire-calibration selector shape and default
calibration. M9.10 remains the tire constitutive-law authority for the stateless lateral post-peak
falloff and the monotone scalar implicit wheel solve.

M9.12 exposes three physically interpretable comparison axes:

```text
GRIP  = peak force height
PEAK  = slip magnitude at which peak force is reached
SLIDE = retained large-lateral-slip force relative to peak
```

It does not add a tire mode, a second tire package, tire memory, temperature, pressure, wear,
vehicle-specific tire behavior, or separate longitudinal/lateral tire laws.

## 2. Architecture Decision Gate

1. The existing vehicle-owned tire calibration already stores exactly three independent numeric
   values: `referenceFrictionMultiplier`, `linearStiffnessMultiplier`, and
   `slidingFrictionRatio`.
2. No new persistent physics state is required. Browser GRIP/PEAK/SLIDE IDs are presentation and
   comparison choices only and are never stored in the vehicle state.
3. GRIP is represented by the existing reference-friction multiplier.
4. PEAK is represented by the ratio between friction capacity and the existing linear-stiffness
   multiplier. No new tire-force equation is introduced.
5. SLIDE remains the existing M9.10 lateral post-peak ratio.
6. When one browser axis changes, the selector layer co-adjusts the underlying calibration only as
   needed to preserve the other two displayed physical characteristics.
7. The common tire law, combined-slip direction, scalar wheel solve, suspension, vehicle solver,
   route, camera and renderer boundaries are unchanged.

## 3. Current exact baseline

M9.12 retains the current M9.10 peak characteristic exactly:

```text
referenceFrictionMultiplier = 1.2870855880077763
linearStiffnessMultiplier   = 10.3 / 9.75
compiled muRef              = 1.35
rhoKnee                     = 0.74
```

This gives, at `gripFactor=1` and reference load:

```text
GRIP effective mu = 1.737565543810498
PEAK slip         = 0.21255656167002204
lateral angle     = atan(PEAK) = 12.0 deg
```

The evaluated M9.10 `SLIDE=0.80` setting becomes the M9.12 default. Therefore the current browser
default is:

```text
GRIP  = current exact value (display 1.74)
PEAK  = current exact value (display 21.3% / 12.0 deg lateral equivalent)
SLIDE = 80%
```

The change from the old M9.10 browser default `SLIDE=100%` to `80%` is an explicit DEV handling
calibration choice. It does not alter the post-peak law itself.

## 4. DEV comparison tables

### GRIP

The GRIP selector is effective peak friction coefficient at `gripFactor=1`:

```text
GRIP = 1.74(current exact) / 1.80 / 1.90 / 2.00
```

The upper end is intentionally a racing-tire exploration boundary, not a claim that every road tire
or every vehicle in the catalog can physically realize `mu=2.0` under all loads and conditions.

### PEAK

PEAK is a common normalized slip magnitude. The lateral-angle column is only a readable pure-lateral
conversion `atan(PEAK)`:

| Selector | Exact/target slip | Pure-lateral equivalent |
|---|---:|---:|
| `21.3` | `0.21255656167002204` | `12.0 deg` |
| `18` | `0.18` | `10.2 deg` |
| `15` | `0.15` | `8.5 deg` |
| `12` | `0.12` | `6.8 deg` |
| `9` | `0.09` | `5.1 deg` |
| `6` | `0.06` | `3.4 deg` |

The lower-slip choices explore the response range associated with very stiff high-performance and
racing tires while keeping peak force height independently selectable.

### SLIDE

```text
SLIDE = 70 / 75 / 80 / 85 / 90 %
default = 80 %
```

SLIDE remains specifically the M9.10 large-lateral-slip plateau. Pure longitudinal tire force is
still unchanged by this axis because the retained scalar wheel-root proof depends on the post-peak
scale being independent of wheel angular speed.

## 5. Independence contract

For one vehicle calibration, define the displayed peak-slip ratio as:

```text
peakSlip = baselinePeak
         * (referenceFrictionMultiplier / baselineReferenceFrictionMultiplier)
         / (linearStiffnessMultiplier / baselineLinearStiffnessMultiplier)
```

Changing GRIP changes `referenceFrictionMultiplier` and scales `linearStiffnessMultiplier` by the
same ratio. Therefore PEAK and SLIDE remain unchanged.

Changing PEAK changes only the stiffness multiplier required to reach the requested peak slip at the
current GRIP. Therefore GRIP and SLIDE remain unchanged.

Changing SLIDE changes only `slidingFrictionRatio`.

This is the browser calibration matrix:

```text
GRIP  -> force height
PEAK  -> force-curve horizontal scale
SLIDE -> post-peak lateral plateau
```

No axis is allowed to silently move another displayed axis.

## 6. Browser ownership

Keyboard:

```text
H -> GRIP
J -> PEAK
G -> SLIDE
```

The existing TIRE selector area contains three compact cycle buttons so the selector zone does not
grow vertically. Touch and keyboard call the same browser adapter and mutate the same vehicle-owned
calibration.

The 320x240 HUD preserves its existing vertical footprint by reporting the three independent values
on one compact summary line:

```text
TIRE G<grip> P<peak-percent> S<slide-percent>
```

The full keyboard labels remain available through the individual formatter/model observations:
`GRIP [H]`, `PEAK [J]`, and `SLIDE [G]`.

Recovery and vehicle-profile reconstruction preserve the complete calibration as before.

## 7. Explicit non-goals

M9.12 does not yet decide whether real-product calibration should use:

```text
Cx != Cy
longitudinal peak slip != lateral peak slip
longitudinal post-peak != lateral post-peak
```

Those remain later tire-model questions. This milestone first tests whether the retained single
combined-slip law is satisfactory when peak height, peak position and lateral sliding plateau can be
evaluated independently.

It also does not add load-sensitive mu, relaxation length, aligning torque, temperature, pressure,
wear, camber thrust, ABS/TCS, or vehicle-specific tire branches.

## 8. Executable acceptance

Release requires:

1. Current exact M9.10 GRIP and PEAK remain the M9.12 defaults.
2. Default SLIDE is exactly `0.80`.
3. Browser GRIP choices are `current / 1.80 / 1.90 / 2.00` effective mu.
4. Browser PEAK choices are `current / 18 / 15 / 12 / 9 / 6%`.
5. Browser SLIDE choices are `70 / 75 / 80 / 85 / 90%`.
6. Changing any one axis preserves the other two displayed characteristics to numerical precision.
7. Every GRIP x PEAK x SLIDE combination remains finite in the retained scalar wheel solve.
8. M9.10 pure-longitudinal invariance with respect to SLIDE remains green.
9. No GRIP/PEAK/SLIDE browser ID is added to persistent vehicle physics state.
10. Touch and keyboard use one common tire-calibration adapter.
11. Existing M9.9/M9.10/M9.11/M9.11A regressions remain green except where browser-default wording
    is explicitly superseded here.
12. Full exact-head CI and same-SHA Pages release succeed under `AGENTS.md`.
