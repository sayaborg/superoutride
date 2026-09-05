# M9.20 — Five-Parameter Monotone Two-Axis Tire

Status: current scoped tire-law, authoring, calibration and diagnostic contract.
Handling remains `DEV_UNCALIBRATED`. This milestone does not certify human drift feel.

## 1. Decision and explicit supersession

Replace the M9.18 one-k isotropic law and M9.15 lateral post-peak multiplier with one
load-proportional two-axis demand and one monotone C1 saturation. Remove S, P-to-2P,
old friction/stiffness/slide multiplier APIs and the old browser G/P/S selectors. No runtime
old/new switch, compatibility model or hidden controller is retained. Earlier numbered
milestones and released validation records remain historical, unchanged.

The five independent UI/authoring values are Gx, Px, Gy, Py and a shared X/Y knee.
The user's final five-selector decision supersedes the preceding four-parameter proposal's
fixed-knee decision. kx and ky are independent derived coefficients, not forced equal.

M9.18's current-load homogeneity, one-sided contact, wheel-lift permission and recovery guards
remain. M9.17 engine curves, ratios, actual-wheel-RPM shifting, limiter and ENG lifecycle remain.
M9.11 steering, D12/M60/ACT0.25 browser defaults, physical profiles other than tire schema,
input gestures, camera, renderer, metric and topology remain unchanged.

Front/rear equality is the current *composition choice*, not a force-law restriction. The
browser edits one linked pair; the vehicle holds two immutable station characteristic slots.
Stock profile authoring also uses the same tire at both ends. Compiler and tire function accept
different station characteristics without inspecting station identity, vehicle or drive layout.

## 2. Architecture Decision Gate

1. Tire-wheel owns slip, constitutive force and wheel roots. Tire-characteristic compilation owns
   the five resolved coefficients. Vehicle instances own current immutable front/rear slots.
   Browser registry owns five discrete selector ranges and display only.
2. Reuse current contact observation, wheel integration, rolling resistance, Coulomb brake atom,
   C1 saturation and ordinary input/physics lifecycle. No new tire memory is necessary.
3. Store only resolved muX, muY, kX, kY, rhoKnee per effective tire. G/P displays are inverse
   derivations; no UI copy, stored saturation slips or overlapping multipliers are authority.
4. No CAR/BIKE, RWD/FWD/AWD, course, mode, drift-angle or device branch is added to the force law.
5. Replace old abstractions rather than layering a falloff upon a saturation. Front/rear equality
   is expressed by composition; TCS is not smuggled into tire coefficients.
6. Preserve dissipative slip work, bounded shared capacity, zero unloaded force, N homogeneity,
   unique scalar wheel roots, suspension guards and all frozen rendering/geometry constraints.
7. Dedicated constitutive/selector/lifecycle/source-boundary/transient tests replace explicitly
   retired old-law tests below; other regressions remain enabled with their physical assertions.

## 3. Five quantities, one resolved authority

| Axis | Meaning | Default | Browser range | Step | Key (forward cycle) |
|---|---|---:|---|---:|---|
| GX | pure longitudinal capacity / load at material=1 | 2.50 | 0.50..4.00 | .05 | H |
| PX | pure longitudinal full-capacity onset slip | 8% | 1..60% | 1 point | J |
| GY | pure lateral capacity / load at material=1 | 2.20 | 0.50..4.00 | .05 | G |
| PY | pure lateral full-capacity onset slip | 10% | 1..60% | 1 point | L |
| KNEE | shared dimensionless linear-to-shoulder knee | .74 | .10...95 | .01 | N |

PX/PY are positive dimensionless fractions internally. PY is not a vehicle sideslip angle;
atan(PY) is only a high-forward-speed pure-lateral tire-angle equivalent. The monotone model has
no descending peak: P names *full-capacity onset*, not an isolated maximum followed by a drop.
These approved defaults are a diagnostic starting point, NOT a certified measurement of a real
Continental/Hoosier tire and NOT a promise of a usable drift at ENG1.

UI uses five compact minus/value/plus groups, plus the retained ENG button. Keyboard keys cycle forward; the explicit minus button is the reverse operation.
Responsive groups fit the current portrait/landscape panel. Canvas CSS uses object-fit:contain
inside the remaining grid cell: preserve the 320x240 backing image and its 4:3 presentation,
not stretch or crop it as the selector panel grows. This is CSS layout only; no renderer metric,
projection, camera, FOV or physical-scale formula changes. Plus/minus operations
wrap at endpoints. The registry uses integer hundredths to avoid cumulative step drift.
Changing any axis preserves the other four displayed axes. knee changes therefore recompile
both stiffnesses. Explicit off-grid browser requests reject; the lower compiler accepts finite
positive physical values independent of this finite diagnostic grid.

For authoring values (Gx,Px,Gy,Py,a):

```text
muX = Gx; muY = Gy; rhoKnee = a
kX = (2-a)*Gx/Px
kY = (2-a)*Gy/Py
```

The compiler validates finite positive G/P and 0<a<1 and finite derived coefficients. The
runtime pair contains only frozen compiled characteristics; live editing atomically replaces
both slots after full validation. Recovery and vehicle replacement retain selected values.
No state position, velocity, wheel rotation, gear or actuator is overwritten by selection.
Rivals and profile construction retain the old non-dropping isotropic reference mu=1.35,
k=9.75,a=.74; this is distinct from browser player default. Tire authoring represents that
reference through G/P, with no duplicate old muRef/normalizedStiffness fields.

## 4. Constitutive law

Retain existing contact-frame signs and v0=profile low-speed regularization:

```text
Vref = hypot(Vx,v0)
sx = (R*Omega-Vx)/Vref
sy = -Vy/Vref
Dx = N*kX*sx; Dy = N*kY*sy
Bx = materialGrip*muX*N; By = materialGrip*muY*N
rho = hypot(Dx/Bx,Dy/By)
(Fx,Fy) = (Dx,Dy)*H(rho)/rho
```

Compute rho after algebraically cancelling N. Zero N or zero material capacity returns zero
force, not a positive floor. Zero demand uses the linear limit. Nonfinite coefficients/inputs
are rejected, not silently turned into a different tire. Negative geometric contact load is
clipped to zero by the retained non-tension contact convention; no stored load authority.

For a=knee, b=2-a:

```text
H(rho) = rho                                0<=rho<=a
       = rho-(rho-a)^2/[4(1-a)]             a<rho<b
       = 1                                  rho>=b
```

This quadratic shoulder equals the previous Hermite expression. H is C1 and nondecreasing;
H/rho is nonincreasing. a is now user-selectable but still shared by both axes. No extra shape
exponent, tail width, postpeak magnitude or vehicle-specific shoulder is added.

At fixed material m, capacity onset slips are m*Px and m*Py. Changing N scales the whole force;
changing m changes capacity without scaling elastic stiffness, as in the retained surface law.
The force is parallel to the demand vector. If kX!=kY it need not be parallel to slip itself.
This is a reduced phenomenological tire, not a full contact-patch Coulomb/brush model.

## 5. Mathematical and numerical contract

```text
(Fx/Bx)^2+(Fy/By)^2 = H(rho)^2 <= 1
Fx*(Vx-R*Omega)+Fy*Vy
  = -N*[H(rho)/rho]*Vref*(kX*sx^2+kY*sy^2) <= 0
F(c*N)=c*F(N)
```

For fixed contact geometry/load/material and trial wheel speed, Fx is nondecreasing even with
unequal stiffnesses. Writing x=Dx/Bx,y=Dy/By gives

```text
dFx/dx = Bx*[H'(rho)*x*x/rho^2 + H(rho)*y*y/rho^3] >= 0.
```

The wheel backward-Euler residual is strictly increasing because I/dt>0. Retain signed motion,
Coulomb brake atom at Omega=0, rolling-resistance torque and unique bracketed bisection. Use
R*Bx for the tire contribution to the finite bracket (not a renamed isotropic fmax). Expose
capacityX and capacityY separately in the result. This is not a proof of whole-car/gearbox
stability or of human control, nor a guarantee against physical spins and permitted wheel lift.

## 6. TCS preparation only

No active TCS, no TCS selector, no hidden torque attenuation, no new control memory, target
beta, slip cutoff, callback skeleton or artificial yaw force is shipped. deriveTireSlip is the
shared stateless observation for tire, diagnostics and future drive control. Current requested
powertrain torque equals delivered control torque before the existing fixed front/rear split.
The wheel input driveTorque names the actual delivered torque; future intervention must remain
on that boundary, never modify tire coefficients, wheel state or body speed directly.

Future single-driven-station TCS may make delivered torque nonincreasing in trial Omega inside
the existing root. With engine requested torque/gear held constant during that solve, the
monotonicity proof can include -Tdrive(Omega). The finite bracket must include the maximum
requested torque. Do NOT reevaluate a non-monotone engine curve or discrete gear inside that
root and assume the proof survives. Implicit feedback removes one explicit sampling lag, not
all possible coupled vehicle/gear hunting.

AWD must explicitly choose a shared engine reduction consistent with fixed split (coupled
station roots / possible outer scalar q solve) or an explicitly authorized independent actuator
architecture. Quietly multiplying each station by a different q changes delivered split.
This is a future drive-control Decision Gate, not a missing tire parameter or vehicle branch.

TCS cannot supply missing force/energy. Torque-only intervention is locally grip-preserving;
its dynamic stabilizing/capture benefit is not equivalent to claiming beta always decreases.
No claim that TCS by itself makes 4:1 capacity anisotropy unnecessary is established.

## 7. Acceptance: structure first, transient product behavior next

Automated release gates here verify the new law, five-axis independence, selectors, lifecycle,
ordinary vehicle compatibility, no active TCS, and reproducible read-only transient/sweep tools.
They do not declare finished drift handling at the uncalibrated browser default. A previously
observed anisotropic research trajectory is a capability regression, never a default or a real
measurement. All nine stock profiles remain on common mechanics and retained profile references.

Product handling evaluation is entry -> useful sliding interval -> angle correction -> exit,
recording initial/minimum/exit speed, beta and yaw transients, curvature, displacement, wheel
slip, loads, gear and drive torque. Transient deceleration is permitted but must be measured;
large unbounded loss is not made a success merely by dropping the steady-speed requirement.
Steady circles and equilibrium seeds remain diagnostics, not a compulsory endless powered drift.
Increasing/decreasing throttle sweeps record hysteresis and finite-time min/max, not just a
long-window mean. A few samples do not prove globally continuous equilibria or basin coverage.

Pure constitutive comparisons hold the appropriate G/P/knee fixed; knee changes at fixed P
change initial k and shoulder width. Tests explicitly distinguish that from fixed-k comparisons.
The low-G/low-P historical benefit, abrupt spin boundary and high-speed energy/braking tradeoffs
are retained in the research decision history. Do not modify renderer metrics or HUD speed to
meet physical acceptance. Actual human keyboard/touch feel and real-course flight distance
remain open after this implementation release.

## 8. Explicit regression migration

Old released tests remain recoverable at baseline 75b225c. The six following files asserted the
retired G/P/S APIs, S-to-2P curve, static curve constants and/or old seeded/calibrated steady
trajectories. They are replaced, not skipped or relaxed to fit the new law. Their exact old test
names and SHA256 are recorded below. New M9.20 suites cover compile/atomic ownership, every
axis transition, pure/combined forces, dissipation/homogeneity, wheel root/brake, lifecycle,
common station composition, retained non-drop reference, source boundaries and transient/sweep
reproducibility. The old *postpeak* trajectories are historical observations, not assertions that
a different force law must replay identical beta values. Unrelated tests are not retired. The M9.8 CSS-fit assertion is updated from auto-width to
explicit contain-fit to preserve the full 4:3 backing image when the selector area changes.

### `m9-10-post-peak-sliding-tire.test.mjs`

Baseline SHA256 `bd3b79c2269c1de60ee129a2d22f440db31ce3187f5e4266dce66349967d5af2`.

- retained TIRE 2 peak is exactly 12 degrees before post-peak scaling
- M9.15 falls C1 from peak P to the selected sliding plateau at exactly 2P
- M9.15 broad falloff reaches the internal ratio while preserving vector direction
- lateral post-peak scale leaves pure longitudinal tire behavior unchanged
- M9.15 slide ratio remains compatible with the unique scalar implicit wheel solve
- calibration remains atomic and rejects invalid sliding ratios without partial mutation
- M9.15 post-peak law remains constitutive tire behavior not a drift or vehicle mode

### `m9-12-independent-tire-calibration-axes.test.mjs`

Baseline SHA256 `ee5320e6ce33d854b60fca2d4b0cfb88c29d2e17893dd6ce21ac2eb1313adf9e`.

- M9.19 adds lower G/P choices while retaining absolute S and existing high comparisons
- M9.19 browser starts at the G1.20 P8 S1.00 entry calibration
- G P and absolute S remain independent at the M9.15 diagnostic extremes
- G changes peak height P changes location and absolute S fixes deep-slide force
- complete valid M9.19 G/P/S domain stays finite and invalid pairs are rejected
- keyboard and compact touch buttons cycle the same three tire authorities
- M9.15 selector reuses the existing ratio scalar without tire state or drift branches
- M9.15 selector cycles wrap deterministically from expanded maxima

### `m9-15-absolute-slide-one-k-tire.test.mjs`

Baseline SHA256 `f5dfd6608e2aaeb6699cb7b2b80c404207216a95e81d69d85adec2fe76b9217d`.

- M9.19 default retains the M9.15 three-axis law with G1.20 P8 S1
- pure lateral peak occurs at P and absolute slide plateau occurs at 2P
- deep combined slide keeps magnitude S while wheel speed rotates force from lateral to longitudinal
- M9.15 adds no tire memory drift mode or second force authority

### `m9-18-load-proportional-tire.test.mjs`

Baseline SHA256 `90770075eb0c9e7885e6254498d5c4b20822cb36e2728b5948d540bc679b0ad8`.

- M9.18 compiled tires own normalized stiffness, not a second static-load stiffness
- M9.18 one-k linear demand uses current load in both directions and rejects missing load
- M9.18 force and demand scale linearly with load throughout grip shoulder and deep combined slip
- M9.18 load no longer shifts P or 2P and the retained surface factor still does
- M9.18 preserves the old one-k force exactly at each station static reference load
- M9.18 unloaded and separated tires release force without a stale stiffness floor
- M9.18 wheel residual stays monotone finite and deterministic through load changes
- M9.18 ordinary solver sustains a seeded 54 km/h 25-degree power drift for 30 seconds
- M9.18 one-point throttle changes have opposite controllable short-horizon responses
- M9.18 small drift perturbations recover under unchanged player input
- M9.18 input-only 25-to-30-to-25-degree transition preserves speed without feedback or resets
- M9.18 seeded hold and throttle direction survive time-step refinement
- M9.18 normalization introduces no tire memory or second force/control authority

### `m9-19-progressive-drift-calibration.test.mjs`

Baseline SHA256 `33406fd6ef618c7336c238c805514dfaa06c59bb34e4a78a711026c47f5c856c`.

- M9.19 preserves old G3/P20 small-slip response while lowering peak, not changing deep S
- M9.19 every valid selector transition preserves the other axes and skips S greater than G
- M9.19 ordinary input enters, traverses 10-15-10 and exits in both directions at refined steps
- M9.19 entry tolerates the stated brake rectangle, not only one pulse
- M9.19 reached drift retains bounded slip under +/-2 percentage-point input errors and release decay
- M9.19 default stays finite on all nine profiles under ordinary digital inputs and recovery

### `m9-5-debug-tire-presets.test.mjs`

Baseline SHA256 `2245f27e1036c6e48a7d4a0ed8aba160fc64441fe420fe0dacb3846f169d70a9`.

- M9.10 historical TIRE 2 anchors remain exact beneath the M9.19 diagnostic default
- vehicle-owned tire calibration remains atomic and survives recovery and profile reconstruction
- retained tire calibration remains one vehicle-owned state consumed only by common tire mechanics

## 9. Release and continuation

Follow AGENTS.md: feature branch, complete exact implementation-head CI, then a standalone
validation record, complete record-inclusive CI, re-fetch main, pure fast-forward force=false,
main=PR head=merge SHA and same-SHA main CI/Pages. Historical validation records are immutable.
The continuation handoff names current authority and known limitations; this document and
executable source/tests, not the conversation or sandbox packages, are project authority.

Read `docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md` for the discussion, rejected approaches,
withdrawn claims, provenance limitations and next experiments. Imported research snapshots are
explicitly non-normative and are not new release validation.
