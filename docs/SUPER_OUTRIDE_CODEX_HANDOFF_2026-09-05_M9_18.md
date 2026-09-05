# SUPER OUTRIDE — M9.18 Continuation Handoff

Date: 2026-09-05

Status: takeover/navigation context only. **This document is not project authority.**

SUPER OUTRIDE project authority is the repository itself: current `main`, `AGENTS.md`, the newest
applicable numbered authority documents, current source/compilers/tests, Git/PR history and exact-SHA
CI/Pages evidence. If this handoff conflicts with newer repository evidence, the newer repository
evidence wins.

---

## 0. Purpose

This checkpoint exists so a fresh ChatGPT/Codex thread can continue the current vehicle-handling
work without relying on a previous conversation transcript.

The repository was re-audited across root configuration, `src`, `tests`, `docs`, validation records,
workflow/release state and the current handling implementation before this checkpoint was prepared.
No runtime/physics change is introduced by this handoff.

The last released functional M9.18 baseline audited here is:

```text
main / PR #131 head / PR #131 merge SHA
1849212b9600fd2afce7f86a8858981d7173d8b5
```

A later documentation-only takeover-sync commit may therefore be newer than that SHA. **At the start
of every fresh thread, re-fetch `main`; never treat the SHA above as a timeless baseline.**

---

## 1. Required fresh-thread start procedure

Before changing anything:

1. Re-fetch current `main` and record its exact SHA.
2. Check open PRs, current branches only as needed, the latest exact-head CI and Pages deployment.
3. Read root `AGENTS.md` completely and apply its Mandatory Architecture Decision Gate and
   Git/PR/release contract.
4. Read root `README.md` and `docs/README.md`.
5. For current vehicle handling, read the newest applicable authority in this order:

```text
docs/112_m9_18_load_proportional_one_k_tire.md
docs/111_m9_17_direct_robotized_mt.md
docs/110_m9_16_engine_power_diagnostic_selector.md
docs/109_m9_15_absolute_slide_one_k_tire.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/107_m9_13_full_screen_analog_touch.md
docs/106_m9_12c_extended_peak_diagnostic.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/102_m9_11a_steering_selector_test_range.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/99_m9_9_controllable_drift_foundation.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
```

6. If the requested work can affect renderer projection, metric presentation, open/cyclic semantics,
   Guide/Raster geometry or topology, also read all four frozen Core files before proposing a change:

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

7. Read the current implementation and causal tests for the requested scope, not just this handoff.
8. Only then make an architecture decision and create a feature branch from the exact current main.

Important navigation note: at the audited M9.18 functional release, some descriptive vehicle/takeover
lists inside `AGENTS.md` still ended at M9.15. `AGENTS.md` remains binding for development/process
rules, but current vehicle authority is documents 112 -> 111 -> 110 -> 109 and current source/tests.
Do not let an older navigation list override later numbered authority.

---

## 2. Released M9.18 evidence

M9.18 was released through PR #131.

Released functional SHA:

```text
1849212b9600fd2afce7f86a8858981d7173d8b5
```

Release evidence at that SHA:

- PR #131 merged/closed;
- `main == PR head == PR merge SHA`;
- implementation/documentation/test-inclusive head `df3bbea45ea123189a1db5ab238653fff14bf939`
  passed complete exact-head CI #821;
- CI #821 result: **653 tests / 653 pass / 0 fail / 0 skipped / 0 cancelled**;
- standalone immutable release evidence:
  `docs/validation/M9_18_LOAD_PROPORTIONAL_ONE_K_TIRE_VALIDATION.txt`;
- record-inclusive exact head `1849212...` passed CI #822;
- main-push workflow #823 used the same SHA and succeeded through build, static staging, Pages
  artifact creation and deployment;
- Pages deployment log reported
  `pages_build_version=1849212b9600fd2afce7f86a8858981d7173d8b5` and success.

M9.17 also has retained immutable evidence:

```text
docs/validation/M9_17_DIRECT_ROBOTIZED_MT_VALIDATION.txt
```

Validation files are evidence, not design authority, and must not be rewritten after release.

---

## 3. Current vehicle architecture

All nine production vehicles share the same **Two-Station Arcade Vehicle Dynamics** architecture.
CAR/BIKE product differences are compiled profile data; common mechanics must not branch on product
identity, drive layout, course, input device or drift mode.

Authoritative persistent mechanics remain essentially:

```text
CG world position xyz
CG world velocity xyz
yaw / pitch
yawRate / pitchRate
frontSteerAngle
frontWheelOmega / rearWheelOmega
steering / throttle / brake actuator state
powertrain gear state
vehicle-owned steering calibration
vehicle-owned three-scalar tire calibration
engine torque multiplier
```

Guide coordinates, support/load observations, tire slips/utilization, handwheel, camera observations
and presentation lean are derived/cache values, not duplicate physical authority.

There is no mechanical roll DOF in the common two-station solver. BIKE visual lean remains derived
presentation only.

---

## 4. M9.18 tire load law

M9.18 changed the one-k stiffness load rule from static-load stiffness to current-load proportional
stiffness:

```text
old: C = k * Nstatic
new: C = k * max(0, Nactual)
```

The same current contact load scales both longitudinal and lateral one-k demand. Friction capacity
also uses current load. Therefore, at positive load and fixed material/calibration:

```text
F(N, slip) = N * f(slip)
```

A load change scales force but no longer also moves the tire to a different normalized slip region.
The obsolete compiled `cornerStiffness` product is removed; `normalizedStiffness` is the sole compiled
stiffness coefficient.

Current demand remains:

```text
Vref = sqrt(Vx^2 + v0^2)
sx = (R*Omega - Vx) / Vref
sy = -Vy / Vref
C  = k * max(0,N) * linearStiffnessMultiplier
Dx = C*sx
Dy = C*sy
```

The radial C1 saturation, M9.15 P-to-2P post-peak function, force-vector direction and monotone
scalar implicit wheel solve remain unchanged.

No tire relaxation state, tire memory, drift detector, target beta, hidden yaw torque or fourth tire
calibration scalar was added.

---

## 5. Current G / P / S calibration

Browser tire meaning is:

```text
G = absolute peak friction coefficient at gripFactor=1
P = common normalized slip at peak
S = absolute deep-slide friction coefficient at gripFactor=1
```

Physics still stores three scalars only. Browser absolute S derives:

```text
slidingFrictionRatio = S / G
```

Current browser ranges:

```text
G = 2.00 .. 4.00 in 0.20 steps
P = 20 .. 60% in 2% steps
S = 1.00 .. 2.00 in 0.20 steps
```

Browser defaults remain:

```text
G3.00 / P20 / S1.00
```

This default remains a diagnostic/falsification candidate, not a claim about a representative real
tire. The complete browser tire product is `11 x 21 x 6 = 1,386` calibrations.

The numerical M9.18 drift regression comparison point is:

```text
Testarossa
G3 / P24 / S1
ENG3
D12 / M60
~15 m/s = 54 km/h
```

It is test evidence, not a changed product default.

---

## 6. What M9.18 actually proves about drift

Using the ordinary production vehicle solver after one documented initial drift seed, current tests
show that the Testarossa comparison point above can:

- sustain about 25 degrees of body sideslip for 30 seconds;
- retain meaningful driven-wheel longitudinal slip;
- respond in opposite angle directions to +/-1 percentage-point throttle changes;
- return near the 25-degree branch after +/-1-degree initial perturbations under unchanged input;
- traverse approximately 25 -> 30 -> 25 degrees using only a time-scheduled steering/throttle input;
- retain approximately 54 km/h during that traverse;
- preserve the same qualitative result under 60/120/240-Hz refinement.

After the initial seed, those tests do **not** overwrite speed, beta, wheel speed, tire load or yaw
rate, do not lock a gear, and do not use a new drift feedback controller.

This is important evidence that the current two-station model can represent a usable deep-drift
branch. It is **not** proof that the complete game already has easy GT2-like drift handling.

---

## 7. Primary unresolved handling problem

The most important remaining handling work is **entry and human control of the drift branch**, not
another blind G/P/S range expansion.

Not yet proven:

- easy transition from ordinary cornering into the stable deep-drift branch;
- a broad, non-peaky path through the previously observed approximately 20-23 degree transition
  region for the cited comparison setup;
- robust recovery from larger disturbances such as +/-5 degrees;
- pleasant touch/keyboard control by a human;
- sustained deep power drift when G=S;
- GT2-era intuitive drift entry/maintenance/exit as a complete experience;
- that the two-station model must be abandoned or replaced by a four-wheel model.

Do not infer “two stations cannot drift” from earlier difficulty. Conversely, do not infer “handling
is solved” from the seeded 25-30-degree regression. The next investigation must isolate a concrete
missing cause before adding DOFs or assists.

Recommended next analytical direction:

1. Reproduce a normal shallow-cornering -> deep-drift entry under ordinary player inputs.
2. Record/inspect beta, yaw rate, actual front steer, front/rear load, sx/sy, Fx/Fy, wheel omega,
   engine RPM/gear and speed through the transition.
3. Determine whether the failure is a vehicle equilibrium/basin issue, control bandwidth issue,
   power allocation issue, or mainly perceptual/rendering difficulty.
4. Do not alter the tire law until the failing transition is causally attributed.
5. Keep architecture minimal: one concept, one authority, no vehicle/drift special branches unless
   a generic upper-layer controller is explicitly justified by evidence.

---

## 8. Powertrain state after M9.17

The current automatic transmission is conceptually an idealized **robotized MT**, not a torque-
converter automatic.

M9.17 removed:

- artificial launch coupling slip;
- independent engine-RPM lag;
- timed shift state;
- shift-time drive cut;
- synthetic torque-curve point that falls to zero at redline.

Current rules:

- engine RPM derives directly from driven-wheel omega and current total ratio;
- gear is the only dynamic powertrain memory;
- upshift and downshift thresholds are separate and ratio-safe;
- ratio changes are instantaneous and continue driving in the same substep;
- below idle, torque lookup uses an idle floor so there is no clutch/stall gameplay;
- one C1 rev limiter reduces positive drive from upshift RPM to zero at redline;
- wheel speed is never clamped by the rev limiter.

The former low-speed wheelspin shift-hunting case was removed by M9.17 and remains covered by
regression. Do not reintroduce clutch/torque-converter state unless a later explicit architecture
decision requires it.

ENG remains a diagnostic torque-curve multiplier:

```text
1.0 / 1.5 / 2.0 / 3.0 / 4.0
```

Key: `K`. Default: `1.0`.

---

## 9. Steering and input state

Current steering law remains M9.11:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and must not become stored state.

Browser comparison ranges:

```text
D   = 10..20 deg, step 1, default 12
M   = 50 / 55 / 60 / 65 / 70 deg, default 60
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s, default 0.25
```

Touch driving remains full-viewport relative analog input:

- pointer starts in left half -> steering role;
- pointer starts in right half -> shared ACCEL/BRAKE role;
- pointer-down position is neutral origin;
- role is fixed for pointer lifetime;
- steering = horizontal relative displacement;
- pedal = signed vertical relative displacement;
- held analog touch uses the existing actuator through DIRECT apply mode;
- release/cancel returns through the ordinary actuator release rate;
- full-scale displacement is a fixed **64 CSS px**.

The 64 CSS-px choice is independent of native backing-store/device-pixel density and viewport size,
but is not an exact physical-mm guarantee.

---

## 10. Wheelies, stoppies, ABS and TCS

The current product decision explicitly **permits wheelies and stoppies for now**.

Their future control is to be considered together with ABS/TCS. M9.18 does not add:

- wheelie control;
- stoppie control;
- ABS intervention;
- TCS intervention;
- pitch clamp/damping;
- torque reduction for lift;
- vehicle-specific anti-lift branches.

Single-wheel support is ordinary physics. An inverted body is outside the reduced suspension-contact
interpretation: inverted suspension rays cannot support the road, and gameplay uses the existing
recovery path after the local body-up/surface-normal orientation has overturned.

A VFR can still lift and overturn repeatedly under sustained full-throttle conditions. That is a
known deferred control limitation, not evidence of a numerical success or a solved motorcycle model.

---

## 11. Renderer/camera constraint relevant to drift control

The renderer remains a frozen raster pseudo-3D design, not ordinary camera-space 3D perspective.

Core depth remains:

```text
d = s_render - s_camera
scale = focalLength / d
```

Horizontal displacement can depend on camera yaw, but depth/scale remains chainage-driven. Objects at
the same chainage share the same renderer depth/scanline semantics.

Current camera modes:

```text
BODY_FIXED       default
MOVEMENT_FOLLOW  alternate
```

Camera pitch follows body pitch and camera roll remains zero.

Product observation: at large vehicle/camera yaw, the pseudo-perspective can make drift orientation
and correction harder to read. This is a legitimate open human-control/perception issue. However,
changing renderer depth to camera-forward Euclidean/camera-space depth would conflict with frozen
Core invariants. Do not “fix” it inside camera/physics or quietly replace the projection formula.
Any change to that invariant requires an explicit new Core/addendum decision after comparing simpler
presentation/camera solutions.

---

## 12. Repository hygiene verified for this takeover

At the audited M9.18 release:

- no open PR remained after #131 release;
- current runtime/source search found no active `TODO` or `FIXME` markers;
- retired `cornerStiffness` is absent from current default-branch code;
- retired `yawWashout` authority is absent;
- retired `launchCouplingSlipRpm` and `engineResponseTau` are absent;
- no current `driftMode` authority exists;
- source-boundary regressions still protect general `src/*` from depending on DEV fixtures;
- historical feature/Codex branches exist but are not project authority;
- current main and exact-SHA CI/Pages history remain the release authority.

Do not perform cleanup merely because old branches or historical documents exist. Historical
numbered documents and immutable validation evidence are intentionally retained.

---

## 13. Repository structure landmarks

Current root:

```text
.github/
AGENTS.md
README.md
docs/
index.html
package.json / package-lock.json
src/
styles.css
tests/
tools/
tsconfig.json
```

Important implementation areas:

```text
src/boot.ts
src/main-linear.ts
src/main.ts
src/main-circuit.ts
src/browser/
src/camera/
src/core/
src/gameplay/
src/input/
src/physics/
src/render/
src/runtime/
src/vehicle/
src/visual/
```

Current vehicle landmarks:

```text
src/physics/arcade-vehicle-physics.ts
src/physics/vehicle-dynamics.ts
src/physics/tire-wheel.ts
src/physics/tire-friction-calibration.ts
src/physics/automatic-powertrain.ts
src/physics/vehicle-profiles.ts
src/physics/vehicle-calibration.ts
src/physics/driving-actuator.ts
src/gameplay/recovery.ts
src/input/touch-input.ts
src/browser/tire-friction-selection.ts
src/browser/steering-calibration-selection.ts
src/browser/engine-power-controls.ts
src/camera/m5-camera.ts
src/core/projection.ts
```

Relevant current regression files include the M9.18 tire/wheel-lift tests plus retained M9.17,
M9.16, M9.15, M9.11, course-integration and source-boundary tests. Run the **entire** suite for every
implementation milestone; do not treat a small focused test set as release evidence.

---

## 14. Git / PR / release contract for the next thread

Never implement directly on `main`.

For any new implementation milestone:

1. fresh-fetch exact main;
2. create feature branch from that exact SHA;
3. apply Mandatory Architecture Decision Gate;
4. make the smallest coherent change;
5. add causal regression evidence;
6. open PR;
7. complete green CI on exact feature head;
8. apply `docs/validation/README.md` standalone-record policy;
9. if a record is required, add it and run complete CI again on the record-inclusive exact head;
10. re-fetch main;
11. require pure fast-forward candidate (`ahead_by>0`, `behind_by=0`, merge base=current main`);
12. move main with `force=false`;
13. verify `main == PR head == PR merge SHA`;
14. verify same-SHA main-push build and Pages deployment.

A documentation-only navigation cleanup under unchanged normative authority normally requires full
CI but not a new immutable standalone validation record. Do not invent validation evidence simply
because a handoff file was added.

---

## 15. Fresh-thread continuation prompt

A new thread does not need the previous conversation transcript. A sufficient instruction is:

> SUPER OUTRIDEの作業を継続してください。repositoryを唯一のauthorityとして扱い、まず
> `AGENTS.md`、`README.md`、`docs/README.md`、最新のM9.18 continuation handoff、今回の作業に
> 関係する最新番号付きauthority、実装・回帰を読み、main/PR/CI/Pagesを再確認してから作業を
> 継続してください。過去ChatGPT会話をauthorityにしないでください。

Then state the next concrete task. The fresh thread should use the repository to recover all project
state rather than asking the user to restate prior design decisions.
