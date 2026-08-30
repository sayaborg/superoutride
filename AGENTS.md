# SUPER OUTRIDE — Agent Development Contract

This file is the persistent working contract for coding agents operating in this repository.

It is intentionally **not** a second design document. Normative game/rendering mathematics live in the Core Freeze documents and their explicit addenda. Milestone-specific decisions live in the corresponding milestone documents and regression tests.

Before changing code, read this file, the repository entry/authority documents listed below, and the current active handoff checkpoint when takeover context is relevant.

---

## 1. Project identity

SUPER OUTRIDE is a browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

Product route forms are:

```text
LINEAR
BRANCHING
CIRCUIT
```

Cars and motorcycles share the same world-space driving architecture. Vehicle handling is currently `DEV_UNCALIBRATED` unless a later normative document explicitly changes that status.

---

## 2. Authority map

Use each source only for the authority it owns.

### Frozen design authority

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

The addenda supersede only the specific earlier assumptions they explicitly replace.

The current vehicle-physics architecture authority is:

```text
docs/88_m9_1_six_profile_debug_hud.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

M9.1 preserves the M9.0 common mechanics and supersedes only the initial browser-profile identity,
drive-station distribution assumption, accumulated per-course debug overlays and the M9.0
simultaneous-pedal request rule. It owns
FR/MR/RR/AWD/BIKE1/BIKE2 compiled-profile selection, the normalized station drive-torque split and
the shared presentation-only HUD boundary. The four car profiles share one engine/tire/chassis
package; FR/MR/RR differ only by weight distribution/inertia, while AWD additionally uses 50:50
front/rear drive torque. The common `18:1` steering ratio is a HUD-only handwheel conversion and
must never be consumed by steering mechanics. Canonical ACCEL/BRAKE requests are exclusive; one
input-layer arbiter gives priority to the latest source that remains held across keyboard aliases
and touch pointers. Actuators own finite response only and must not own pedal order or arbitration.

M9.0 supersedes the separate M8.0 CAR/BIKE solver architecture and the scoped M8.1 immediate
steering-release rule. It preserves the M8.0 contact/tire/wheel chain and M8.1 travel-direction
steering concept inside one Two-Station Arcade Vehicle Dynamics solver with compiled profiles and
three finite normalized actuators. The M8 documents remain historical authority for retained and
superseded details within the exact boundary stated by M9.0.

It explicitly supersedes conflicting vehicle-physics architecture decisions in M7.0/M7.3/M7.4 within its stated scope. Earlier milestone documents remain historical records and must not be rewritten merely to use current terminology.
Historically, M8.1 superseded only the M8.0 CAR Driver raw-angle/useful-steer/no-countersteer
decisions. M9.0 now owns the shared CAR/BIKE mechanics and input-response boundary while retaining
the M8.0 contact/tire/wheel chain and M8.1 travel-direction steering concept explicitly listed in
its scope.
M8.2 supersedes the M5 Guide-lateral/yaw-lag camera decisions within its stated scope; frozen
renderer depth/metric authority and the current M9.0 vehicle authority remain unchanged.
M8.5 supersedes only the M8.2 initial base-pitch/camera-height tuning. M9.1 dual-yaw-camera mode
authority supersedes M8.2's mandatory movement-yaw default while retaining its movement-yaw
derivation as an alternate; M8.2 body-pitch follow and centering architecture remain authoritative.
M8.6 supersedes only the M8.5 150 m far-depth value; frozen chainage depth and the M8.2/M8.5
camera architecture and pitch/height tuning remain authoritative.
The current browser course-debug composition authority is:

```text
docs/82_m8_3_three_mode_course_debug.md
docs/88_m9_1_six_profile_debug_hud.md
docs/90_m9_1_mobile_touch_selectors.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

The current CIRCUIT DEV course-authoring authority is:

```text
docs/89_m9_1_low_mid_speed_mountain_circuit.md
```

M9.1 mountain-circuit authoring supersedes only the M8.7 public CIRCUIT geometry and elevation.
It replaces the medium/high-speed sweep-and-jump composition with one 95–240 m low/mid-speed lap
and a frequent smooth mountain HeightProfile. It adds no drift mode, grip change, physics branch,
camera branch or renderer branch.

### Milestone design authority

Detailed post-freeze decisions live in the numbered milestone documents under `docs/`.

For current topology/runtime architecture, read this sequence:

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
docs/70_m6_52_field_route_progress.md
docs/71_m6_53_branching_session_normalization.md
docs/72_m6_54_circuit_multi_actor_integration.md
```

For vehicle-physics lineage/current authority, read:

```text
docs/73_m7_0_vehicle_dynamics_architecture_freeze.md
docs/74_m7_1_highway_calibration_course_authoring.md
docs/75_m7_2_default_branching_highway_integration.md
docs/76_m7_3_grip_and_instrument_hud.md
docs/77_m7_4_transient_tire_response.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/82_m8_3_three_mode_course_debug.md
docs/83_m8_4_dual_low_speed_circuit_complex.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/86_m8_7_varied_elevation_circuit.md
docs/89_m9_1_low_mid_speed_mountain_circuit.md
docs/90_m9_1_mobile_touch_selectors.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

### Executable implementation contract

Types, compilers and regression tests are the executable contract. If documentation and implementation appear inconsistent, do not silently choose one. Identify the conflict, determine which authority owns the topic, and resolve it explicitly.

### Documentation authority index

`docs/README.md` distinguishes normative authority, chronological milestone history, active takeover context and immutable validation evidence. Use it when interpreting historical statements or supersession.

### M8.0 finalization handoff state

The implementation/finalization checkpoint for M8.0 PR #88 is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

That file is navigation/finalization context only. After release it is historical. It does not replace the Core Freeze/addenda, `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md`, source/types/compilers, regression tests, or `docs/validation/M8_0_PHASE9_VEHICLE_PHYSICS_VALIDATION.txt` as release evidence.

The older:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md
```

is historical repository-migration handoff context. It records the PR-C/final-migration lineage and must not be mistaken for the active PR #88 work checkpoint.

The original mandatory first read-only Codex takeover audit was completed before PR-C. That one-time audit is distinct from the later final clean-room audit and final exact-head migration freeze. The released FINAL CODEX MIGRATION POINT is established by `docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt` together with Git/PR/main-ref and Pages workflow identity. Do not infer the final migration SHA from an embedded self-reference in an entry document.

At and after that released final migration point, do not repeat the migration cleanup ceremony merely because a fresh session reads historical migration context. For active work, resolve current status from `README.md`, `docs/README.md`, the active handoff, Git/PR state, and exact-head CI.

### README

`README.md` is an entry point and current-state index. It is informative and must not override a freeze/addendum, milestone authority or executable regression contract.

---

## 3. Design priority

When several implementations are possible, optimize in this order:

1. architectural simplicity;
2. one clear authority per concept;
3. mathematical consistency with the frozen pseudo-3D model;
4. implementation simplicity and period-plausible computation;
5. feature convenience.

Do not preserve a complicated feature interpretation if a simpler product/design rule keeps the architecture clean.

Prefer deleting duplicate authority, generalizing an existing primitive, or changing an upper-level composition over introducing a lower-level special case.

Do not apply an ad hoc patch merely because it makes a visible symptom disappear.

### Mandatory architecture decision gate

Before implementing any non-trivial feature, bug fix, refactor, integration change or design-affecting maintenance change, answer all of the following from the current repository evidence:

1. Which existing layer owns this decision?
2. Is there already a primitive or authority that can express it without a new abstraction?
3. Would the proposed solution create duplicate state, duplicate coordinate truth or a second authority for one concept?
4. Would it add a product-, mode-, vehicle-, route- or stage-specific branch to a lower engine layer?
5. Can the same result be obtained more cleanly through authoring, topology, compilation, runtime composition, or a simpler product rule?
6. Does the solution preserve every applicable frozen renderer, physics, metric and topology invariant?
7. What regression or architecture check proves the real causal behavior and prevents the boundary from drifting later?

This gate is mandatory. A feature request is not implicit permission to weaken frozen invariants or bypass current authority boundaries. If the requested behavior conflicts with them, identify the conflict and prefer an upper-level or explicit normative design change rather than silently inserting a lower-level exception.

If a proposed solution requires a lower-layer special case, duplicated state, duplicated coordinate authority, hidden wrapping, compatibility authority, or an ad hoc exception, do not implement it merely because it is locally convenient. Reconsider the design first.

The preferred transformation is:

```text
complex product requirement
-> explicit upper-level authoring / topology / compilation / composition
-> simple ordinary runtime representation
-> unchanged or more-general lower engine primitives
```

When a stable architectural boundary or invariant can reasonably be checked mechanically, add or extend a regression/architecture test so CI enforces it. Do not rely on prose alone for a rule that can be made executable. Purely procedural or non-mechanizable rules may remain contract-only.

---

## 4. Frozen renderer and geometry invariants

The following are not negotiable unless a new explicit normative addendum is authored and validated.

- World X/Y/Z is authoritative for vehicle physics.
- Vehicle movement is free in world space; it is not snapped to the road centerline.
- Renderer depth is chainage pseudo-depth, exactly:

```text
d = s_render - s_camera
```

- Renderer depth contains no course-length modulo, winding, route identity or topology decision.
- Euclidean distance is not renderer depth.
- Camera-space Z is not introduced as a replacement depth authority.
- Lateral displacement does not modify renderer depth.
- Same `d` means same scale.
- Same `d` plus same height means same screen Y.
- One chainage corresponds to one horizontal raster scanline.
- Road geometry remains Raster Segment geometry.
- Absolute turn at every interior Raster vertex remains `<= 10 degrees`.
- Guide geometry is coordinate/camera support; it is not a polygon-road renderer.
- Terrain and World Sprites share one far-to-near Painter.
- Do not add a z-buffer.
- Do not convert the road renderer into a normal polygon/perspective road renderer.
- Do not add perspective-correct texture mapping.
- Do not add arbitrary runtime sprite rotation.
- Transparency remains 0/1; no alpha blending.
- Camera roll remains zero.
- GroundMap visual semantics and SurfaceMap physical semantics remain independent.
- GroundBase `TRANSPARENT` and SurfaceMap `VOID` remain independent.
- Far Background is a full image, including meaningful pixels below the horizon.

Final renderer order remains:

```text
Optional Clear
-> Full Far Background
-> Terrain + World Sprite far-to-near
-> Player Sprite
-> HUD
```

---

## 5. Fixed metric presentation authority

The canonical sprite/world scale is fixed at player pseudo-depth:

```text
player car physical width = 2.0 m
player car source width   = 80 px
player-depth scale        = 40 px/m
```

Current camera values are:

```text
f     = 200 px
D_cam = 5.0 m
```

The invariant is:

```text
D_cam = f / 40
```

If focal length/FOV changes in the future, change `D_cam` so the 40 px/m player-depth reference is preserved.

There is no arbitrary `visualScale` authority.

---

## 6. Open geometry and source model

The general runtime model is open:

```text
0 <= s <= L
```

Core does not manufacture a last-to-first segment.

General forms are open:

```text
RasterPath
GuidePath
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Out-of-range chainage must not silently wrap into another endpoint.

The governing rule is:

> **Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.**

Explicit `Cyclic*` adapters may exist for a deliberate upper-level topology, but ordinary LINEAR/BRANCHING runtime consumers must not select them for historical convenience.

---

## 7. Point-to-point route authority

The acyclic RouteDag is the point-to-point authority for LINEAR/BRANCHING.

Route choice is physical. AI steering intent, screen X, desired branch, visual proximity or guessed road center must never manufacture route progress.

A legal stage transition is:

```text
physical route-gate crossing
-> validated RouteDag transition
-> PENDING
-> old chart/content remain authoritative
-> forward physical handoff-seam crossing
-> COMMIT target chart/content
```

COMMIT changes chart/content authority only.

It must not teleport or rewrite:

```text
world X/Y/Z
yaw
world velocity
```

Entering a terminal stage is not FINISH. A validated physical FINISH crossing is still required.

For the current BRANCHING product rule:

```text
sharedRouteChoiceMode = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

The first physical vehicle crossing of a sibling route gate locks that choice for the field. A losing sibling crossing creates no illegal progress and uses the explicit recovery policy.

---

## 8. CIRCUIT authority

CIRCUIT must not weaken the open Core or acyclic RouteDag.

One circuit lap is authored explicitly above Core. Runtime topology is unfolded into a finite ordinary open window before lower consumers see it.

Current architecture:

```text
explicit closed-lap authoring
        |
        v
CircuitTopology
        |
        v
finite ordinary open runtime window
        |
        +--> ordinary car/bike physics
        +--> ordinary camera
        +--> ordinary renderer
        |
        v
ordered physical checkpoints + forward FINISH
        |
        v
validated lap race
```

Topological winding is not race-lap authority.

Race laps are awarded only by the ordered physical checkpoint/FINISH contract.

For `N` scored laps, runtime must provide at least `N + 1` finite lap copies so the final scored FINISH is still an ordinary internal seam with normal runout/lookahead.

Do not add a separate renderer/physics/camera circuit mode branch merely to handle winding.

---

## 9. Recovery rules

Recovery is gameplay/physics reset, not route/race manufacture.

Recovery/resync must not:

- manufacture a route transition;
- award a checkpoint;
- award a lap;
- erase validated progress;
- imply topology through wrapping.

Wrong-branch recovery geography derives from the locked legal physical route gate, not screen coordinates or AI intent.

---

## 10. Browser composition and Pages

Current top-level browser composition is explicit:

```text
src/boot.ts          -> one browser course-mode selector
src/main-linear.ts   -> LINEAR
src/main.ts          -> BRANCHING
src/main-circuit.ts  -> CIRCUIT
```

Boot selection belongs only at the composition root:

```text
/              -> BRANCHING
/?mode=linear    -> LINEAR
/?mode=branching -> BRANCHING
/?mode=circuit   -> CIRCUIT
```

Do not distribute `if (CIRCUIT)` / `routeKind` decisions through lower engine layers when composition can select the correct ordinary runtime objects once.

`src/dev` is not a general runtime authority. General layers must not import it. The only current non-DEV TypeScript files allowed to assemble DEV fixtures are the three explicit top-level browser composition roots:

```text
src/main-linear.ts
src/main.ts
src/main-circuit.ts
```

`src/dev/**` may depend on ordinary general layers, but that dependency direction must not be reversed. `src/dev/README.md` defines the DEV fixture categories, and `tests/source-boundary-normalization.test.mjs` enforces the boundary across all `src/**/*.ts` files.

GitHub Pages uses a commit-versioned complete ESM build path. Do not weaken that cache-coherency design.

Visible milestone labels must remain synchronized with package milestone metadata; regression coverage exists for this.

---

## 11. Testing rules

Run the complete suite for every implementation milestone and every release candidate:

```bash
npm install
npm test
```

A bug fix must add a regression that reproduces the real causal failure, not merely assert the desired final screen state.

Do not weaken a valid regression to make a new design pass. If a legacy test encodes an obsolete authority, update it only after identifying and documenting the newer authority that supersedes it.

Prefer real integration sequences for failures involving route transitions, recovery, physics, camera, rendering or deployment boundaries.

When a user reports a Pages/runtime bug, distinguish among:

```text
source defect
build artifact defect
deployment defect
browser/cache display defect
```

Do not attribute a problem to cache without evidence.

---

## 12. Git / PR / release contract

Never implement directly on `main`.

For each milestone or hotfix:

1. Fetch/inspect current `main` and record its exact SHA.
2. Create a feature/hotfix branch from that exact SHA.
3. Inspect existing architecture before adding an abstraction.
4. Implement the smallest coherent change.
5. Add/update regression coverage.
6. Open a PR targeting `main`.
7. Obtain a complete green CI run on the exact feature-head SHA.
8. Apply the standalone-record decision rule in `docs/validation/README.md`; add/update a record
   only when that policy requires one.
9. Run the complete CI suite again on the **validation-inclusive exact head**.
10. Re-fetch `main` before release.
11. Compare `main` to the validated candidate. Release only when the candidate is a pure fast-forward:

```text
ahead_by > 0
behind_by = 0
merge base = current main
```

12. Move `main` to the validated exact SHA with `force=false`.
13. Verify:

```text
main SHA == validated feature SHA
PR head SHA == PR merge SHA == validated feature SHA
```

14. Verify the main-push workflow on the same SHA, including Pages build/deploy when applicable.

Do not use an extra merge commit as the released `main` state.

Do not release a SHA that did not itself receive the required complete green CI.

If `main` moved after validation, do not force the release. Rebase/reconstruct from the new main and revalidate the new exact head.

GitHub Actions exact checkout is authoritative for release evidence.

---

## 13. Working style for coding agents

Before implementing:

- read the relevant source and tests;
- search for existing primitives before creating new ones;
- classify apparent legacy behavior as deliberate authority vs accidental residual assumption;
- identify the smallest layer that actually owns the decision.

During implementation:

- keep topology above Core;
- keep gameplay decisions out of renderer/physics unless they genuinely belong there;
- avoid duplicate state and duplicate coordinate authorities;
- preserve world-state continuity through chart/content changes;
- prefer finite/open composition over implicit wrapping;
- keep DEV fixtures clearly separate from product authority;
- do not introduce dependencies from general `src/*` layers into `src/dev`; only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` may assemble DEV fixtures as explicit top-level composition roots;
- do not recreate retired authority paths as compatibility re-export shims.

After implementation:

- inspect the final diff for accidental broad rewrites;
- run the complete suite;
- verify the exact SHA in CI logs;
- update only the documentation whose authority actually changed.

Do not claim a public Pages deployment was personally verified unless the deployed artifact/workflow/public endpoint was actually inspected.

---

## 14. Explicit prohibitions

Do **not** do any of the following without a new explicit normative design decision:

- make `RasterPath` or `GuidePath` implicitly cyclic again;
- add course-length modulo to renderer pseudo-depth;
- infer route choice from steering or AI branch intent;
- teleport world pose on route handoff;
- add arbitrary sprite `visualScale`;
- replace raster road rendering with ordinary 3D/polygon projection;
- add a z-buffer;
- add arbitrary runtime sprite rotation;
- couple GroundMap pixels to physical SurfaceMap support;
- make topological winding equal validated race laps;
- make RouteDag cyclic to implement CIRCUIT;
- add a renderer CIRCUIT special path when finite open composition is sufficient;
- introduce a general-layer dependency on `src/dev`;
- recreate a retired authority path as a compatibility shim;
- hide a runtime defect by removing a rival/feature unless the product rule itself is intentionally changed;
- bypass a failing physical-gate regression by widening gates without validating authored road geometry;
- merge an unvalidated SHA;
- force-update `main` as a normal release procedure.

---

## 15. Takeover procedure

When starting from a fresh Codex/agent context:

1. Read this file completely.
2. Read `README.md` for repository entry points and current status.
3. Read `docs/README.md` for authority/supersession and evidence policy.
4. Read the four Core freeze/addendum files listed in section 2.
5. If draft PR #88 / branch `feature/phase9-vehicle-physics-freeze` is still active, read `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md` and `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` before touching vehicle physics.
6. Otherwise, identify the current task/handoff from repository/PR history and the latest relevant milestone authority; do not assume a dated handoff is still active.
7. Read current source/types/compilers and the tests relevant to the task.
8. Confirm current `main`, active branch/PR head, and exact latest CI state before changing anything.
9. Use `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md` only when historical final-migration lineage is relevant; do not treat it as current M8.0 authority.
10. Verify the FINAL CODEX MIGRATION POINT against `docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt` and Git/PR history rather than expecting a self-referential SHA in this file.
11. Do not repeat the original migration cleanup/takeover ceremony when current `main` is at or descended from the validated FINAL CODEX MIGRATION POINT.
12. Run/inspect the complete test suite required by the current task and relevant validation contract; historical known-red checkpoints are not release evidence.
13. Only then continue the scoped task under the Mandatory Architecture Decision Gate.

At and after the FINAL CODEX MIGRATION POINT, the repository—not a previous ChatGPT transcript—is the continuing project memory.
