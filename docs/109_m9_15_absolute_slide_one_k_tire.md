# M9.15 — Absolute-Slide One-K Vector Tire

Status: current scoped DEV tire-law and browser handling-comparison authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Why this milestone exists

M9.14 widened the existing browser parameter ranges far enough to falsify simple tuning as a
complete answer to controllable, sustained drift.

Hands-on observations on the released M9.14 build were:

```text
G=3 / P=60
  very slow response; a corner can be cleared with weak oversteer

G=3 / P=20 / SLIDE=60%
  rear breakaway is easy and large, but the vehicle either departs rapidly or loses speed quickly
```

Across the explored G/P/SLIDE range, no setting combined all of the desired properties:

1. prompt ordinary steering response;
2. progressive breakaway;
3. controllable sideslip;
4. useful drift distance without immediate scrub-induced speed loss.

The previous percentage selector coupled peak cornering capacity and deep-slide friction:

```text
mu_slide = G * SLIDE_ratio
```

For example `G=3 / SLIDE=60%` retained an absolute deep-slide resultant coefficient of `1.8`.
Raising G to obtain useful ordinary cornering therefore also raised deep-slide scrub. Increasing P
softened breakaway only by reducing the entire initial tire slope, producing the observed dullness.

M9.15 changes the smallest existing authorities that directly cause those two tradeoffs.

## 2. Scope and supersession

M9.15 supersedes:

1. M9.10 only for the width of the lateral post-peak transition;
2. M9.12/M9.14 only for the browser meaning, range and starting value of `SLIDE`;
3. M9.14 only for the browser tire starting calibration.

M9.15 retains:

- the state-free one-k tire demand;
- one common longitudinal/lateral demand vector;
- the existing radial C1 saturation and friction-circle bound;
- force direction parallel to the one-k demand vector;
- the existing vehicle-owned three-scalar calibration;
- the existing scalar implicit wheel-Omega solve and finite bisection;
- M9.14 G and P ranges;
- M9.9 axle-neutral tire seed and controllable-slide product rule;
- M9.11 travel-direction steering;
- the common two-station CAR/BIKE mechanics;
- every actuator, powertrain, suspension, camera, renderer, route and topology authority.

No tire memory, relaxation state, drift mode, target sideslip, yaw feedback, vehicle-specific tire
branch, drive-layout branch, separate front/rear law or fourth calibration scalar is introduced.

## 3. Architecture Decision Gate

1. **Owner:** peak/sliding force shape belongs to `src/physics/tire-wheel.ts`; browser G/P/S
   interpretation belongs to `src/browser/tire-friction-selection.ts`.
2. **Existing primitive:** the stored `slidingFrictionRatio` already expresses the ratio between
   deep-slide and peak force. An absolute browser S can be represented exactly as `S/G` without new
   state.
3. **No duplicate authority:** physics continues to store only reference-friction multiplier,
   linear-stiffness multiplier and sliding-friction ratio. Absolute S is derived browser meaning,
   not a second stored coefficient.
4. **No lower-layer branch:** tire mechanics remain independent of vehicle ID, drive layout, course,
   route, input device and drift state.
5. **Simpler product rule:** G owns peak force, P owns peak position and absolute S owns deep-slide
   force. Each visible characteristic is independent.
6. **Numerical invariants:** post-peak scale remains independent of wheel Omega, so the monotone
   scalar wheel residual and existing root solver remain valid.
7. **Proof:** causal regression checks P-to-2P transition, absolute deep-slide magnitude, force-vector
   rotation with wheel speed, axis independence, the complete selector product and absence of added
   state/modes.

## 4. Retained one-k demand and peak law

At each front/rear station:

```text
Vref = sqrt(Vx^2 + v0^2)
sx   = (R*Omega - Vx) / Vref
sy   = -Vy / Vref
Dx   = C*sx
Dy   = C*sy
D    = (Dx,Dy)
rho  = |D| / Fpeak
```

The selected peak coefficient is:

```text
G = mu_peak at gripFactor=1
Fpeak = G * gripFactor * N
```

The retained radial C1 law is unchanged. With:

```text
a = rhoKnee
p = 2 - a
```

its normalized magnitude is linear through `a`, C1-transitions from `a` to `p`, and equals one from
`p` onward. Browser P continues to adjust stiffness so pure lateral slip `P` reaches `rho=p` and
therefore reaches `Fpeak`.

## 5. Absolute SLIDE authority

Browser S is now:

```text
S = absolute deep-slide friction coefficient at gripFactor=1
```

The lower physics scalar remains:

```text
slidingFrictionRatio = S / G
```

This is derived whenever browser G or S changes. Therefore:

```text
change G -> preserve P and absolute S; recompute internal S/G
change P -> preserve G and absolute S
change S -> preserve G and P; recompute internal S/G
```

The browser domain guarantees `0 < S <= G`, so the internal scalar retains its existing `(0,1]`
contract and peak force remains the safe upper bound used by the wheel solver.

Current browser S choices are:

```text
S = 1.00 / 1.20 / 1.40 / 1.60 / 1.80 / 2.00
```

The current explicit hands-on starting candidate is:

```text
G=3.00 / P=20% / S=1.00
```

Its internal ratio is:

```text
S/G = 1/3
```

That 33.3% ratio is an intentionally strong diagnostic separation between ordinary peak capacity
and deep-slide scrub. It is **not** a claim that 33.3% is representative of a production tire.
Direct S choices through `2.00` remain available so hands-on evaluation can determine whether the
useful region lies at a materially higher ratio.

## 6. Broad C1 post-peak transition

M9.10 reached the sliding plateau at lateral demand ratio:

```text
p + (p-a)
```

For the common `rhoKnee=0.74`, that was `1.78`, only about `1.41` times the peak-demand position
`p=1.26`.

M9.15 uses no new width parameter or selector. The one rule is:

```text
post-peak starts at p
sliding plateau begins at 2p
```

Let:

```text
rhoLat = abs(Dy) / Fpeak
r       = S / G
```

Then:

```text
rhoLat <= p:
  slideScale = 1

p < rhoLat < 2p:
  t = (rhoLat - p) / p
  h = t^2 * (3 - 2t)
  slideScale = 1 - (1-r)*h

rhoLat >= 2p:
  slideScale = r
```

The first derivative is zero at both endpoints, so the transition is C1. Because P is the pure
lateral slip that maps to `rhoLat=p`, the selected sliding plateau begins at exactly pure-lateral
slip `2P`.

This broadens breakaway without using P as a substitute for transient response. P20 can retain its
prompt small-slip response while the force falls progressively from P20 to P40.

## 7. Final force and drift-control meaning

The final force remains one vector:

```text
F = Fpeak * radialC1Magnitude(rho,rhoKnee)
          * slideScale(rhoLat)
          * normalize(D)
```

In deep slide:

```text
radial magnitude = 1
slideScale       = S/G
```

therefore:

```text
F = S * gripFactor * N * normalize(D)
```

With the retained equal longitudinal/lateral one-k stiffness:

```text
Fx = S*gripFactor*N * sx / sqrt(sx^2+sy^2)
Fy = S*gripFactor*N * sy / sqrt(sx^2+sy^2)
```

Thus deep-slide resultant magnitude is fixed by absolute S, while wheel speed continuously rotates
that one resultant between lateral and longitudinal components:

```text
increase driven-wheel slip at fixed lateral slip
  -> |Fx| increases
  -> |Fy| decreases
  -> resultant magnitude remains S*N
```

This gives throttle a direct physical means to alter rear force direction without a drift detector,
target beta, hidden yaw torque or force injection.

## 8. Current browser comparison domain

```text
G     = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00 /
        3.20 / 3.40 / 3.60 / 3.80 / 4.00
P     = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 /
        42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 %
S     = 1.00 / 1.20 / 1.40 / 1.60 / 1.80 / 2.00
```

Starting calibration:

```text
G=3.00 / P=20% / S=1.00
```

The complete current product is:

```text
11 x 21 x 6 = 1,386 calibrations
```

Keyboard ownership remains:

```text
H -> G
J -> P
G -> S
```

HUD and touch selector labels show S as an absolute decimal, not a percentage.

## 9. Powertrain boundary

M9.15 changes only the tire law and browser tire calibration meaning. It does not change automatic
shift logic, engine RPM coupling, torque curve or redline behavior.

If sustained drift still loses drive torque after the tire-level force map is validated, wheelspin /
engine-RPM coupling must be investigated as a separate powertrain cause. Tire parameters must not be
used to hide a powertrain defect, and powertrain changes must not be used to hide a tire-law defect.

## 10. Executable acceptance

Release requires all of the following:

1. Browser S choices are exactly `1.00` through `2.00` in `0.20` steps.
2. Browser starting calibration is exactly `G3.00/P20/S1.00`.
3. Its stored `slidingFrictionRatio` is exactly `1/3` to numerical precision.
4. Changing G preserves displayed P and absolute S while recomputing the internal ratio.
5. Changing P preserves displayed G and absolute S.
6. Changing S preserves displayed G and P while recomputing the internal ratio.
7. Pure lateral force reaches G*N at P.
8. Pure lateral force reaches S*N at exactly 2P and remains at S*N deeper into slide.
9. The post-peak transition is C1 at P and 2P.
10. In deep combined slide, resultant magnitude is S*N and force direction remains the one-k demand
    direction.
11. At fixed deep lateral slip, increasing longitudinal wheel slip increases `|Fx|` and decreases
    `|Fy|` continuously.
12. Pure longitudinal tire behavior remains independent of S.
13. All 1,386 G/P/S combinations remain finite and deterministic in the retained scalar wheel solve.
14. Physics still stores only the same three calibration scalars and adds no tire memory, drift mode,
    target sideslip, vehicle branch or drive-layout branch.
15. Existing deep-beta explicit-recovery and all-nine vehicle regressions remain green.
16. Complete exact-head CI, validation-inclusive CI and same-SHA main/Pages release succeed under
    `AGENTS.md`.

Because M9.15 changes the current tire constitutive law and browser calibration authority, it
requires a standalone validation record before release.
