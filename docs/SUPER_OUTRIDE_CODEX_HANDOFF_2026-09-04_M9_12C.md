# SUPER OUTRIDE — M9.12C Current Takeover Handoff

Status: current takeover checkpoint after the M9.12C extended PEAK diagnostic release.

This file is navigation and continuation context only. It is not a second design authority and does
not supersede numbered milestone documents, source, types, compilers, regression tests, Git/PR state
or exact-head workflow evidence.

The repository—not a previous chat transcript—is the continuing project memory.

## 0. Minimal instruction for the next thread

A fresh thread can start with:

```text
Treat the current SUPER OUTRIDE repository as the only authority and continuation memory.

Read completely, in this order:
1. AGENTS.md
2. README.md
3. docs/README.md
4. docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md
5. the latest numbered authority documents relevant to the requested task
6. the related implementation, types, compilers and causal regression tests

Before changing anything, re-fetch and confirm current main, open PRs, exact latest CI and the
current Pages deployment. Do not implement directly on main. Do not edit historical validation
evidence. Apply the AGENTS.md Architecture Decision Gate, use a dedicated branch and follow the
exact-head release contract.

For the current handling investigation, continue from the M9.12C diagnostic state below rather
than reconstructing older M9.6–M9.11 selector history from chat.
```

## 1. Released checkpoint at handoff authoring

Repository:

```text
sayaborg/superoutride
```

Current released main at the start of this handoff work:

```text
32796e9c9f0b75947ae21c87d297dc79844d248f
```

That SHA is the released M9.12C exact head from PR #123. At that release:

```text
PR #123 head SHA  = 32796e9c9f0b75947ae21c87d297dc79844d248f
PR #123 merge SHA = 32796e9c9f0b75947ae21c87d297dc79844d248f
main SHA           = 32796e9c9f0b75947ae21c87d297dc79844d248f
main-push CI       = success
GitHub Pages build = success
GitHub Pages deploy= success
```

The standalone M9.12C validation evidence is:

```text
docs/validation/M9_12C_EXTENDED_PEAK_DIAGNOSTIC_VALIDATION.txt
```

That file is immutable historical release evidence. This navigation-only handoff will itself be
released on a later descendant SHA; resolve that identity from current Git/PR/workflow history, not
from a self-reference in this file.

## 2. Current product and handling status

SUPER OUTRIDE remains a browser-based 320x240 raster pseudo-3D high-speed driving game with one
shared world-space vehicle architecture for cars and motorcycles.

Current handling status remains:

```text
DEV_UNCALIBRATED
```

Current browser course selections remain:

```text
1 / ?mode=linear    -> LINEAR
2 / ?mode=branching -> BRANCHING
3 / ?mode=circuit   -> CIRCUIT / TSUKUBA
4 / ?mode=fisco     -> CIRCUIT / FISCO
```

The nine production vehicle identities remain owned by the M9.8 catalog. The current handling work
does not create vehicle-specific solver branches or vehicle-specific tire laws.

## 3. Current steering authority — M9.11 + M9.12A range

The current steering law is the simplified travel-direction law from document 101:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

Where:

```text
M = maximum physical front road-wheel steer
D = Driver travel-relative steering reserve/offset
A = automatic travel-direction authority, derived only as M-D
T/ACT = symmetric steering actuator traversal time
```

`A` is never stored and must not become a profile field, selector or second authority.

Current browser DEV steering comparison domain is:

```text
D   = 10 / 11 / 12 / 13 / 14 deg
M   = 50 / 55 / 60 / 65 / 70 deg
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s
```

Browser starting point:

```text
D   = 12 deg
M   = 60 deg
ACT = 0.25 s
```

Compiled production-profile steering seeds remain separate and unchanged. The browser DEV adapter
applies the comparison starting point to the player instance.

No current steering architecture contains:

```text
yaw-rate feedback
yaw washout memory
drift mode
drift assist
target sideslip
speed-dependent D
tire-dependent steering authority
second rack / second steering state
```

## 4. Current tire authority — M9.12 independent axes

The existing vehicle-owned three-scalar tire calibration is interpreted in the browser as three
independent physical characteristics:

```text
GRIP  = peak force height
PEAK  = common normalized slip at peak
SLIDE = large-lateral-slip plateau / peak
```

Changing one browser axis preserves the other two displayed characteristics.

The underlying physics state remains only the existing calibration scalars:

```text
referenceFrictionMultiplier
linearStiffnessMultiplier
slidingFrictionRatio
```

There is no stored GRIP/PEAK/SLIDE ID in physics, no tire memory and no drift state.

M9.10 remains the constitutive authority for the stateless C1 lateral post-peak falloff and the
monotone scalar implicit wheel solve. SLIDE remains lateral-post-peak only; pure longitudinal wheel
solve behavior is unchanged by SLIDE.

The current tire model still uses one common one-k normalized demand law for longitudinal and
lateral demand. Longitudinal and lateral PEAK have not yet been split.

## 5. Current DEV tire selector domain — M9.12C

Current browser selector domain:

```text
GRIP  = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00
PEAK  = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 %
SLIDE = 70 / 75 / 80 / 85 / 90 %
```

Browser stable A/B default remains:

```text
GRIP  = 2.00
PEAK  = 20%
SLIDE = 80%
```

The exposed selector product is:

```text
6 x 11 x 5 = 330 tire calibrations
```

All 330 combinations were exercised by regression through the retained scalar wheel solve and kept
finite at the released M9.12C candidate.

The extended PEAK values are diagnostic probes. They are not frozen claims that a real production
tire should peak at 30–40% common normalized slip.

## 6. Most important current handling observation

The latest hands-on finding is:

> At fixed `GRIP=2.00`, larger PEAK values feel better, and `PEAK=30%` is preferred to lower PEAK
> values. The user wants to test beyond 30%.

This result is more informative than the earlier observation that GRIP could also be raised.

At fixed GRIP, increasing PEAK leaves peak force height unchanged but lowers the initial tire-force
slope. Conceptually:

```text
initial tire force slope ~ GRIP / PEAK

G2.00 / P20 -> 10.00
G2.00 / P30 ->  6.67
G2.00 / P40 ->  5.00
```

Thus P20 -> P30 lowers the initial slope by about one third while keeping the same peak force ceiling.

The current interpretation is therefore:

> The reduced model appears to benefit from a softer force build-up and a wider usable slip domain,
> not simply from a higher maximum tire-force ceiling.

For lateral interpretation:

```text
P30 -> atan(0.30) = 16.7 deg
P40 -> atan(0.40) = 21.8 deg
```

But because PEAK is common one-k, those values also imply 30–40% longitudinal slip at peak. That is
why they must be treated as diagnostic effective parameters rather than literal road-tire targets.

## 7. Architecture diagnosis currently under test

If handling continues to improve monotonically as PEAK rises toward 40% at fixed GRIP, the strongest
current hypothesis is that PEAK is compensating for omitted or compressed lateral transient /
compliance behavior in the reduced architecture.

Candidate omitted effects include:

```text
tire relaxation / carcass force-build transient
body-roll transient / roll compliance
left-right load-transfer dynamics
suspension / bushing compliance effects
```

Current CAR mechanics has no roll DOF. In that sense roll response is effectively infinitely stiff /
instantaneous at the body-model level. Tire force is also algebraic/stateless rather than carrying a
relaxation-length state. Therefore steering angle can convert to tire force and yaw more directly
than in a real vehicle.

M9.11 may reinforce the same observation because Driver offset D directly creates front-wheel angle
relative to travel direction. Lower effective tire stiffness lets that angle create force/yaw more
gradually without reducing the GRIP ceiling.

Important: this diagnosis is not yet a decision to add roll DOF or tire relaxation. Under the project
simplicity rule, first falsify the existing one-k reduced model with the extended PEAK range.

## 8. Immediate next handling experiment

The clean next experiment is:

```text
hold GRIP = 2.00
hold SLIDE = 80% initially
hold D = 12 deg
hold M = 60 deg
hold ACT = 0.25 s

sweep PEAK:
30 -> 32 -> 34 -> 36 -> 38 -> 40%
```

Primary question:

> Does the handling eventually become too dull / too weak / unwilling to turn, producing a clear
> reversal point, or does improvement continue all the way to P40?

Interpretation:

```text
clear reversal before/at P40
-> current reduced model has an identifiable preferred effective stiffness region

monotonic improvement through P40
-> do not simply keep promoting larger literal tire PEAK values
-> perform architecture-level diagnosis of omitted transient/compliance
```

Only after that should longitudinal/lateral PEAK separation, tire relaxation or another mechanics
change be considered.

## 9. Current authority reading order for handling work

Read these in order after AGENTS/README/docs index:

```text
docs/106_m9_12c_extended_peak_diagnostic.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/99_m9_9_controllable_drift_foundation.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
```

Document 102 is historical prior steering-selector-range authority and is superseded for current
browser range/default scope by document 104.

## 10. Current owning implementation

For current handling work, inspect at minimum:

```text
src/browser/tire-friction-selection.ts
src/browser/tire-friction-controls.ts
src/browser/steering-calibration-selection.ts
src/browser/steering-calibration-controls.ts
src/physics/tire-friction-calibration.ts
src/physics/tire-wheel.ts
src/physics/vehicle-calibration.ts
src/physics/arcade-vehicle-physics.ts
src/physics/vehicle-profiles.ts
src/physics/driving-actuator.ts
```

Key implementation facts:

- one common two-station solver is used by all nine profiles;
- tire linear demand uses the same underlying one-k stiffness for X and Y before browser calibration;
- GRIP changes peak force and co-scales stiffness to preserve displayed PEAK;
- PEAK changes stiffness while preserving displayed GRIP and SLIDE;
- SLIDE changes only the retained lateral post-peak plateau ratio;
- the wheel solver remains the unique monotone scalar implicit solve;
- no longitudinal post-peak drop has been added because wheel-omega-dependent post-peak scaling
  could threaten monotonicity/uniqueness;
- no tire-memory state exists;
- M9.11 steering remains pure travel-direction geometry plus Driver offset and one physical rack.

## 11. Causal regression tests to read before changing handling

At minimum:

```text
tests/m9-12-independent-tire-calibration-axes.test.mjs
tests/m9-11-simplified-travel-direction-steering.test.mjs
tests/m9-10-post-peak-sliding-tire.test.mjs
tests/m9-9-controllable-drift-foundation.test.mjs
tests/m9-1-mobile-selector-controls.test.mjs
tests/m9-5-debug-tire-presets.test.mjs
```

Also inspect broader common-physics and source-boundary regressions when a proposed change touches
mechanics rather than DEV selector scope.

## 12. Last complete released verification

The M9.12C implementation/documentation-inclusive candidate completed:

```text
npm test
599 tests
599 pass
0 fail
0 skipped
```

The M9.12C tire regression covered all 330 exposed GRIP x PEAK x SLIDE combinations and verified
finite scalar wheel-solve outputs.

The validation-inclusive exact head was then released by pure fast-forward. The same SHA succeeded
on main-push build and GitHub Pages deploy.

A future candidate must run its own complete exact-head validation. Historical 599/599 evidence does
not validate a later SHA.

## 13. Completed work that must not be repeated

Already completed/released:

- M9.8 nine-production-vehicle catalog and profile separation;
- M9.9 axle-neutral common tire seed and controllable-drift foundation;
- M9.10 stateless lateral post-peak falloff and SLIDE selector lineage;
- M9.11 removal of yaw washout and simplified travel-direction steering law;
- M9.11A/M9.12A browser steering comparison recentering;
- M9.12 independent GRIP / PEAK / SLIDE browser axes without new physics state;
- M9.12B upward GRIP/PEAK diagnostic expansion;
- M9.12C PEAK-only diagnostic extension through 40%;
- exact-head CI, validation evidence, main fast-forward and Pages deployment for M9.12C.

Do not recreate retired M9.2 gain/yaw-preview or M9.7 washout paths. Do not edit immutable numbered
historical documents simply to use current terminology. Add a later scoped authority if a new design
decision supersedes them.

## 14. Required start procedure for the next thread

1. Read `AGENTS.md` completely.
2. Read `README.md` and `docs/README.md` completely.
3. Read this handoff completely.
4. Re-fetch current main/open PR/latest CI/Pages before assuming the SHA above is still current.
5. Read the newest relevant numbered authority documents and owning implementation/tests.
6. Apply the Mandatory Architecture Decision Gate before adding any mechanics/state/authority.
7. For the current handling task, resume with the PEAK sweep described in section 8 unless the user
   gives a newer concrete instruction.
8. If the PEAK sweep falsifies the current reduced model, diagnose the smallest missing causal
   mechanism before adding state. Prefer the simplest architecture that explains the behavior.
9. Use a dedicated branch; never implement directly on main.
10. Follow the exact-head CI -> validation-record rule -> record-inclusive exact-head CI -> main
    recheck -> ahead-only `force=false` fast-forward -> same-SHA main/Pages verification contract.

There is no hidden partially implemented physics feature in this handoff. The current unresolved work
is empirical handling diagnosis, with the extended PEAK selector already released and ready to test.
