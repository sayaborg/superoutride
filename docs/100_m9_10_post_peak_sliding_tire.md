# M9.10 — Post-Peak Sliding Tire

Status: current normative post-peak tire-law and browser sliding-ratio selector authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.10 adds one stateless post-peak sliding characteristic to the retained one-k combined-slip tire
and exposes that one characteristic as a DEV browser comparison.

It supersedes only:

1. M9.5's exact browser `TIRE 1 / 2 / 3` comparison table and its current `G`/touch/HUD labels.
2. M9.9's explicit non-goal that excluded a post-peak tire-force drop. M9.10 supersedes that
   non-goal only for the tire constitutive law described here.

M9.10 deliberately retains:

- M9.9's compiled common reference tire seed exactly:
  `muRef=1.35`, `rhoKnee=0.74`, `lowSpeedRegularization=1.0 m/s`,
  `frontNormalizedStiffness=9.75`, `rearNormalizedStiffness=9.75`;
- M9.9's axle-neutral common profile and controllable-slide acceptance;
- M9.7's unit-coefficient travel-direction steering and bounded zero-DC yaw washout in full;
- the common two-station CAR/BIKE solver, one scalar wheel solve, combined-slip direction,
  suspension, SurfaceMap, powertrain, input, camera, renderer, route and topology authorities.

No drift mode, drift assist, target sideslip, yaw/beta feedback, tire memory, hysteresis, vehicle-kind
branch, drive-layout handling branch or second tire package is introduced.

## 2. Architecture Decision Gate

1. **Owner:** post-peak force belongs to the existing tire constitutive law in
   `src/physics/tire-wheel.ts`; selectable tire characteristic state belongs to the existing
   vehicle-owned tire calibration.
2. **Existing primitives:** the one-k demand, radial combined-slip shoulder, `fmax`, wheel scalar
   solve and existing browser tire calibration already express the required behavior.
3. **One new scalar only:** `slidingFrictionRatio` is the sole new independent value. It is not a
   mode or a duplicate slip/yaw state.
4. **No lower-layer branch:** tire mechanics contain no vehicle/profile/drive-layout/course/route
   branch and no drift detection.
5. **Simpler rule:** all browser comparisons use one identical peak characteristic; only the
   large-angle sliding plateau changes.
6. **Frozen invariants:** world-space physics, two-station contact, chainage renderer depth, fixed
   metric presentation, open runtime and topology boundaries are unchanged.
7. **Proof:** regressions cover exact peak identity, C1 falloff, requested plateau ratios, pure
   longitudinal invariance, deterministic scalar wheel solve, calibration atomicity, shared
   selector authority and absence of drift/vehicle mode logic.

## 3. Browser reference characteristic

The user-evaluated M9.9 `TIRE 2` characteristic becomes the fixed peak reference for every M9.10
browser comparison. It is not copied into the compiled vehicle profile; it remains one ordinary
vehicle-instance calibration applied through the common wheel path.

Exact retained peak calibration:

```text
referenceFrictionMultiplier = 1.2870855880077763
linearStiffnessMultiplier   = 10.3 / 9.75
```

Against the retained M9.9 compiled seed this gives:

```text
effective normalized initial slope = 10.3
pure-lateral peak start            = 12 deg
peak force magnitude               = fmax
```

Thus every M9.10 browser choice is identical through the former `TIRE 2` peak.

## 4. Selectable sliding plateau

The sole browser comparison is the ratio of large-angle sliding friction magnitude to peak
friction magnitude:

| Selector | `slidingFrictionRatio` | Peak characteristic |
|---|---:|---|
| `100` | `1.00` | former M9.9 `TIRE 2` exactly |
| `85` | `0.85` | identical through peak |
| `80` | `0.80` | identical through peak |
| `75` | `0.75` | identical through peak |
| `70` | `0.70` | identical through peak |

Browser authority:

```text
SLIDE [G] 100 / 85 / 80 / 75 / 70 %
default = 100 %
```

Keyboard `G` cycles the table. Desktop/touch selector buttons expose every value directly. One
vehicle-instance calibration survives recovery and profile reconstruction exactly as the earlier
tire calibration did.

`SLIDE 100%` is the exact no-drop former `TIRE 2` result and is the default comparison baseline.
Lower values change only post-peak large-lateral-slip force.

## 5. Stateless post-peak law

The retained linear demand is unchanged:

```text
sx = (R*Omega - Vx) / Vref
sy = -Vy / Vref
Dx = C * kLinear * sx
Dy = C * kLinear * sy
rho = hypot(Dx,Dy) / fmax
```

The retained radial C1 shoulder still determines the ordinary combined-slip force magnitude:

```text
F_radial = radialC1Magnitude(rho, rhoKnee) * fmax
```

M9.10 then derives a post-peak scale only from the pure lateral demand ratio:

```text
rhoLat = abs(Dy) / fmax

a       = rhoKnee
peak    = 2 - a
width   = peak - a
plateau = peak + width
```

For the current `rhoKnee=0.74`:

```text
peak    = 1.26
width   = 0.52
plateau = 1.78
```

The scale is:

```text
rhoLat <= peak:
  slideScale = 1

peak < rhoLat < plateau:
  t = (rhoLat - peak) / width
  h = t^2 * (3 - 2t)
  slideScale = 1 - (1 - slidingFrictionRatio) * h

rhoLat >= plateau:
  slideScale = slidingFrictionRatio
```

The final combined-slip force vector remains in the same demand direction:

```text
F = slideScale * F_radial * normalize(Dx, Dy)
```

The transition is C1 at both endpoints. There is no state, latch, drift flag or hysteresis.

For the fixed browser reference, the force is unchanged through the 12 degree peak and reaches its
selected sliding plateau at approximately 16.7 degrees of pure lateral slip. Larger slip retains
that selected plateau rather than returning toward zero force.

## 6. Why the drop is lateral-demand driven

A naive post-peak function of total `rho` would depend on longitudinal slip and therefore on wheel
angular speed `Omega` while solving the implicit wheel equation. A falling total-rho magnitude can
make tire longitudinal force non-monotone in the scalar root variable and would invalidate the
retained unique backward-Euler wheel-root proof.

M9.10 instead derives `slideScale` from `abs(Dy)/fmax`. For one wheel solve, `Vy`, normal load,
surface grip and the linear calibration are fixed observations, so this scale is independent of
`Omega`.

Therefore:

- the retained no-brake scalar residual remains monotone;
- the same finite root bracket and bisection remain valid;
- `fmax` remains a safe upper bound because `0 < slideScale <= 1`;
- pure longitudinal slip has `Dy=0`, so M9.10 changes no pure longitudinal tire result;
- combined longitudinal/lateral demand keeps one ordinary force direction and receives the same
  large-lateral-slip magnitude scale without a drive-layout branch.

This numerical property is part of the architecture, not an implementation accident.

## 7. Intended physical/product effect

M9.9 established that controllable drift is allowed but retained a no-drop sliding tire. Under
large sideslip that tire could continue applying peak friction magnitude, creating strong scrub,
rapid kinetic-energy loss and quick convergence.

M9.10 allows the same strong approach-to-peak response while reducing large-angle sliding force.
The intended causal effect is lower deep-slide scrub and more room for ordinary combined-slip drive
torque, yaw inertia and player steering to sustain or redirect a slide.

This milestone does **not** claim that drift handling is calibrated or complete. The five ratios
are DEV comparisons for player evaluation. `DEV_UNCALIBRATED` remains the handling status.

## 8. Explicit non-goals

M9.10 does not add:

- tire relaxation length, memory or hysteresis;
- temperature, pressure, wear or load sensitivity;
- separate longitudinal and lateral friction coefficients;
- left/right wheel contacts or body roll;
- handbrake, clutch or simultaneous canonical throttle+brake;
- TCS/ABS or hidden stability intervention;
- drift state, target beta, drift scoring or drift-specific control authority;
- any change to M9.7 steering allocation/default selectors;
- any vehicle-specific tire branch;
- any camera, route, topology or renderer change.

## 9. Executable acceptance

Release requires all of the following:

1. M9.9 compiled common tire remains exactly `1.35 / 0.74 / 1.0 / 9.75 / 9.75`.
2. All five browser values use the exact former `TIRE 2` peak calibration.
3. `SLIDE 100%` exactly reproduces former `TIRE 2` force behavior.
4. All five values are identical through the 12 degree pure-lateral peak.
5. The post-peak shoulder is C1 and reaches exactly the selected `85/80/75/70%` plateau.
6. Pure longitudinal tire force is identical across every slide-ratio choice.
7. The scalar implicit wheel solve remains finite, deterministic and uniquely bracketed for all
   choices under representative combined slip.
8. Calibration mutation remains atomic and recovery/profile reconstruction preserve it.
9. `G`, direct selector buttons and HUD derive from one common five-value table.
10. Tire/calibration/browser layers contain no drift, profile, drive-layout, yaw or beta authority.
11. M9.7 all-nine steering/deep-beta acceptance and M9.9 axle-neutral/reference acceptance remain
    green.
12. Full repository CI and same-SHA Pages release succeed under `AGENTS.md`.

Because M9.10 changes the current tire constitutive law and browser calibration authority, it
requires a standalone validation record before release.
