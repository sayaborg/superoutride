# SUPER OUTRIDE — Agent Development Contract

This is the persistent working contract for coding agents operating in this repository. It is not a
second design specification. Normative decisions live in the frozen Core documents and numbered
milestone documents; executable behavior lives in source, compilers and regression tests.

The repository is the continuing project memory. Conversation history is never authority.

---

## 1. Project identity and status

SUPER OUTRIDE is a browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out
Run, Super Hang-On, OutRunners and the Super Scaler era.

Product route forms are:

```text
LINEAR
BRANCHING
CIRCUIT
```

Cars and motorcycles share one world-space driving architecture. Vehicle handling remains:

```text
DEV_UNCALIBRATED
```

unless a later numbered authority explicitly changes that status.

---

## 2. Authority map

Use each source only for the concept it owns.

### Frozen renderer, metric and open-model authority

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

Each addendum supersedes only its stated scope.

### Current touch authority

```text
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/107_m9_13_full_screen_analog_touch.md
```

M9.14 owns the current fixed full-scale travel:

```text
L = 64 CSS px
```

M9.13 owns full-viewport relative-origin touch: a pointer beginning in the left half owns STEERING;
a pointer beginning in the right half owns the exclusive ACCEL/BRAKE axis for its lifetime.
Pointer-down is neutral origin. Held analog displacement may use the existing generic `DIRECT`
apply mode. Release/cancel publishes neutral, and the existing vehicle actuator `releaseRate` owns
physical decay. Keyboard remains digital and rate-limited. Touch adds no vehicle state, rack, pedal
state, tire law, route branch or renderer authority.

### Current vehicle, steering and tire authority

```text
docs/109_m9_15_absolute_slide_one_k_tire.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
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
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

#### Current tire law: M9.15

M9.15 retains the state-free one-k demand vector, radial C1 saturation, friction-circle bound,
force direction, scalar implicit wheel solve and the existing vehicle-owned three-scalar tire
calibration. It changes only the browser meaning of S and the lateral post-peak width.

Browser characteristics are:

```text
G = absolute peak friction coefficient at gripFactor=1
P = common normalized slip at peak
S = absolute deep-slide friction coefficient at gripFactor=1
```

Physics still stores:

```text
referenceFrictionMultiplier
linearStiffnessMultiplier
slidingFrictionRatio
```

Absolute S is derived, not stored as a fourth scalar:

```text
slidingFrictionRatio = S / G
```

The lateral post-peak C1 scale begins at P and reaches the S plateau at exactly 2P. During one wheel
solve the post-peak scale remains independent of wheel Omega, preserving the monotone backward-Euler
residual, finite bracket and unique bisection root.

Current tire selector domain is:

```text
G = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00 /
    3.20 / 3.40 / 3.60 / 3.80 / 4.00

P = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 /
    42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 %

S = 1.00 / 1.20 / 1.40 / 1.60 / 1.80 / 2.00
```

Current browser starting candidate:

```text
G=3.00 / P=20% / S=1.00
```

Its internal `S/G=1/3` is an explicit falsification probe, not a production-tire realism claim. The
complete current product is `11 x 21 x 6 = 1,386` calibrations.

Changing G must preserve displayed P and absolute S. Changing P must preserve G and S. Changing S
must preserve G and P. Do not add tire memory, a fourth calibration scalar, a drift mode, target
sideslip, hidden yaw torque, vehicle-specific tire logic or a drive-layout branch merely to improve
a hands-on result.

M9.10 remains historical/current foundation for the lateral-demand-only post-peak scale and scalar
wheel-root proof; M9.15 supersedes only its transition width and percentage-S browser meaning.
M9.12 remains the independent three-characteristic mapping foundation within that supersession.
M9.9 remains axle-neutral tire balance and controllable-slide acceptance:

> **Uncontrollable slide is forbidden. Controllable drift is allowed.**

Explicit recovery input must recover. Neutral, wrong or deliberately sustaining input is not
required to self-recover.

#### Current steering law: M9.11 with M9.14 ranges

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only. It must never become a stored state, profile field or selector.

Current browser steering domain is:

```text
D   = 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 deg  default 12
M   = 50 / 55 / 60 / 65 / 70 deg                                default 60
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s                      default 0.25
```

The complete M/D product preserves `A>=30 deg`. Compiled production-profile construction seeds are
separate and unchanged. Do not recreate yaw-washout state, a travel-direction gain, drift steering
mode, D limiter or tire/speed-dependent steering authority without a new explicit normative
milestone.

#### Vehicle/catalog boundary

M9.0 owns one common Two-Station Arcade Vehicle Dynamics solver and state shape for CAR and BIKE.
M9.8 owns nine production identities and profile selection. Profiles own numeric mechanics;
common mechanics may not branch on identity, presentation family or drive layout. The common `18:1`
steering ratio is HUD-only and must never feed mechanics.

### Current camera authority

```text
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

`BODY_FIXED` is default yaw; `MOVEMENT_FOLLOW` is the retained alternate. Camera pitch follows
physical body pitch. Camera roll remains zero.

### Current circuit authoring

```text
docs/93_m9_3_tsukuba_circuit.md
docs/96_m9_6_fisco_circuit.md
```

Course `3` is Tsukuba and course `4` is FISCO through one CIRCUIT composition root.

### Documentation and evidence indexes

`README.md` is the repository entry/current-state index. `docs/README.md` distinguishes current
normative authority, chronological records, takeover context and immutable validation evidence.
Neither replaces source/tests or a newer scoped authority.

---

## 3. Mandatory Architecture Decision Gate

Before any non-trivial feature, fix, refactor, integration or design-affecting maintenance change,
answer from current repository evidence:

1. Which existing layer owns the decision?
2. Is there already a primitive or authority that can express it without a new abstraction?
3. Would the solution create duplicate state, coordinate truth or a second authority?
4. Would it add a product-, mode-, vehicle-, route- or stage-specific branch to a lower layer?
5. Can authoring, topology, compilation, composition or a simpler product rule achieve it instead?
6. Does it preserve every applicable frozen renderer, physics, metric and topology invariant?
7. Which causal regression proves the behavior and prevents boundary drift?

Priority order:

1. architectural simplicity;
2. one clear authority per concept;
3. mathematical consistency with the frozen model;
4. implementation simplicity and period-plausible computation;
5. feature convenience.

Prefer deleting duplicate authority, generalizing an existing primitive or changing upper-level
composition over adding a lower-layer special case. Do not apply an ad hoc visible-symptom patch.

Preferred transformation:

```text
complex product requirement
-> explicit upper-level authoring / topology / compilation / composition
-> simple ordinary runtime representation
-> unchanged or more-general lower engine primitives
```

Mechanizable stable boundaries must receive executable regression coverage.

---

## 4. Frozen renderer and geometry invariants

These are not negotiable without a new explicit normative addendum:

- World X/Y/Z is authoritative for vehicle physics.
- Vehicle movement is free in world space and is not snapped to road center.
- Renderer depth is exactly `d = s_render - s_camera`.
- Renderer depth contains no course-length modulo, winding, route identity or topology decision.
- Euclidean distance and camera-space Z are not renderer-depth authorities.
- Lateral displacement does not change renderer depth.
- Same `d` means same scale; same `d` plus same height means same screen Y.
- One chainage corresponds to one horizontal raster scanline.
- Road geometry remains Raster Segment geometry.
- Absolute turn at every interior Raster vertex remains `<=10 degrees`.
- Guide geometry supports coordinates/camera; it is not a polygon-road renderer.
- Terrain and World Sprites share one far-to-near Painter.
- No z-buffer, perspective-correct texture mapping or arbitrary runtime sprite rotation.
- Transparency is 0/1; no alpha blending.
- Camera roll remains zero.
- GroundMap visual semantics and SurfaceMap physical semantics remain independent.
- GroundBase `TRANSPARENT` and SurfaceMap `VOID` remain independent.
- Far Background is a full image with meaningful pixels below the horizon.

Final renderer order:

```text
Optional Clear
-> Full Far Background
-> Terrain + World Sprite far-to-near
-> Player Sprite
-> HUD
```

---

## 5. Fixed metric presentation authority

```text
player car physical width = 2.0 m
player car source width   = 80 px
player-depth scale        = 40 px/m
f                         = 200 px
D_cam                     = 5.0 m
D_cam                     = f / 40
```

A future FOV change must move `D_cam` to preserve 40 px/m. There is no arbitrary `visualScale`
authority.

---

## 6. Open geometry and topology

The general runtime model is open:

```text
0 <= s <= L
```

Core does not manufacture a last-to-first segment. Ordinary RasterPath, GuidePath, HeightProfile,
VisualProfile, GroundMap and SurfaceMap readers do not wrap out-of-range chainage.

Governing rule:

> **Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer
> is neither.**

Explicit cyclic adapters may exist only where an upper-level topology deliberately selects them.

### Point-to-point

The acyclic RouteDag is LINEAR/BRANCHING route authority. Route choice is physical. AI intent,
steering, screen X, desired branch or visual proximity may not manufacture route progress.

```text
physical route-gate crossing
-> validated RouteDag transition
-> PENDING
-> source chart/content remain authoritative
-> forward physical handoff-seam crossing
-> COMMIT target chart/content
```

COMMIT changes chart/content authority only. It must not teleport or rewrite world X/Y/Z, yaw or
world velocity. Entering a terminal stage is not FINISH; a validated physical FINISH crossing is
still required.

Current BRANCHING policy:

```text
sharedRouteChoiceMode = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

### CIRCUIT

CIRCUIT must not weaken open Core or acyclic RouteDag. One authored closed lap is unfolded above
Core into a finite ordinary open runtime window. Physics, camera and renderer consume that open
window without circuit-specific branches.

Topological winding is not race-lap authority. Laps are awarded only by ordered physical
checkpoints plus forward FINISH. For N scored laps, runtime supplies at least N+1 finite copies so
the final FINISH remains an ordinary internal seam with runout/lookahead.

---

## 7. Recovery rules

Recovery is gameplay/physics reset, never route/race manufacture. It must not:

- manufacture a route transition;
- award a checkpoint or lap;
- erase validated progress;
- imply topology through wrapping.

Wrong-branch recovery derives from the locked legal physical gate, not screen coordinates or AI
intent.

---

## 8. Browser composition and Pages

Current composition roots:

```text
src/boot.ts          -> course selection
src/main-linear.ts   -> LINEAR
src/main.ts          -> BRANCHING
src/main-circuit.ts  -> CIRCUIT
```

```text
/                -> BRANCHING
/?mode=linear    -> LINEAR
/?mode=branching -> BRANCHING
/?mode=circuit   -> CIRCUIT / TSUKUBA
/?mode=fisco     -> CIRCUIT / FISCO
```

Select composition once at the top. Do not distribute `if (CIRCUIT)` or route-kind branches through
lower engine layers.

`src/dev` is not general runtime authority. Only these non-DEV files may assemble DEV fixtures:

```text
src/main-linear.ts
src/main.ts
src/main-circuit.ts
```

General layers must never import `src/dev`.

GitHub Pages uses one commit-versioned complete ESM build path. Do not weaken cache coherency.
Visible milestone labels must match package milestone metadata.

---

## 9. Testing rules

Run the complete suite for every implementation milestone and every release candidate:

```bash
npm install
npm test
```

A bug fix must reproduce the causal failure. Do not weaken a valid regression merely to make a new
design pass. A legacy test may be updated only after identifying the newer authority that explicitly
supersedes its old assumption.

Prefer real integration sequences for route, recovery, physics, camera, renderer and deployment
boundaries. For Pages/runtime reports, distinguish source, build artifact, deployment and browser
cache failures using evidence.

---

## 10. Git / PR / release contract

Never implement directly on `main`.

For every milestone or hotfix:

1. Fetch current `main` and record its exact SHA.
2. Create a feature/hotfix branch from exactly that SHA.
3. Inspect current authority, source and tests before adding abstractions.
4. Implement the smallest coherent change.
5. Add/update causal regressions.
6. Open a PR targeting `main`.
7. Obtain complete green CI on the exact implementation/documentation head.
8. Apply `docs/validation/README.md`; normative authority changes require a standalone record.
9. Obtain complete green CI again on the validation-inclusive exact head.
10. Re-fetch `main` immediately before release.
11. Release only when comparison proves:

```text
ahead_by > 0
behind_by = 0
merge base = current main
```

12. Move `main` to the validated exact SHA using `force=false`.
13. Verify:

```text
main SHA == validated feature SHA
PR head SHA == PR merge SHA == validated feature SHA
```

14. Verify the same-SHA main-push workflow, Pages artifact and Pages deployment.

Do not use an extra merge commit as released main. Do not release a SHA that did not receive the
required complete CI. If main moved, reconstruct from current main and revalidate. Never force-update
main as normal release procedure.

GitHub Actions exact checkout is release evidence. Do not claim public Pages verification without
inspecting the actual workflow/deployment or public endpoint.

---

## 11. Working style

Before implementation:

- read relevant authority, source and tests;
- search for existing primitives;
- distinguish deliberate current behavior from residual historical assumptions;
- identify the smallest owning layer.

During implementation:

- preserve one authority per concept;
- keep topology above Core;
- keep gameplay decisions out of renderer/physics unless they genuinely belong there;
- avoid duplicate state and coordinate truth;
- preserve world-state continuity through chart/content changes;
- prefer finite/open composition over implicit wrapping;
- keep DEV fixtures separate;
- do not recreate retired authority paths as compatibility re-export shims.

After implementation:

- inspect the final diff for accidental broad changes;
- run the complete suite;
- verify exact SHA in CI;
- update only documentation whose current authority changed.

---

## 12. Explicit prohibitions

Without a new explicit normative decision, do not:

- make RasterPath/GuidePath implicitly cyclic;
- add course-length modulo to renderer depth;
- infer route choice from steering or AI intent;
- teleport world pose during route handoff;
- add arbitrary visual scale, z-buffer, polygon-road replacement, perspective-correct texture
  mapping, alpha blending or arbitrary runtime sprite rotation;
- couple GroundMap pixels to SurfaceMap support;
- equate winding with validated race laps;
- make RouteDag cyclic to implement CIRCUIT;
- add renderer/physics/camera CIRCUIT special paths when finite open composition suffices;
- introduce general-layer imports from `src/dev`;
- recreate retired authority as a compatibility shim;
- hide a runtime defect by removing a rival/feature unless the product rule intentionally changes;
- bypass physical-gate regressions by widening gates without validating authored geometry;
- merge an unvalidated SHA;
- force-update `main` as normal release procedure.

---

## 13. Takeover procedure

For a fresh session:

1. Read this file completely.
2. Read `README.md`.
3. Read `docs/README.md`.
4. Read the latest named handoff only as navigation context.
5. Read the frozen Core/addenda when the task can affect renderer, metric, open-model or topology
   invariants.
6. Read the newest numbered authority for the requested topic. For current tire work begin with
   M9.15; for touch begin with M9.14 then M9.13; for steering begin with M9.11 plus M9.14 ranges.
7. Read relevant source/types/compilers and causal tests.
8. Re-fetch current main, open PRs, latest exact-head CI and Pages status.
9. Treat older handoffs and milestones as historical unless their retained scope is directly
   relevant.
10. Continue only after applying the Mandatory Architecture Decision Gate.

The current named handling-navigation checkpoint is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md
```

It predates M9.13–M9.15 and is not current tire/touch authority.
