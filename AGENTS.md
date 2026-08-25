# SUPER OUTRIDE — Agent Development Contract

This file is the persistent working contract for coding agents operating in this repository.

It is intentionally **not** a second design document. Normative game/rendering mathematics live in the Core Freeze documents and their explicit addenda. Milestone-specific decisions live in the corresponding milestone documents and regression tests.

Before changing code, read this file, the authority documents listed below, and the latest takeover/handoff document.

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

### Milestone design authority

Detailed post-freeze decisions live in the numbered milestone documents under `docs/`.

For the current topology/runtime architecture, the important sequence is:

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
```

### Executable implementation contract

Types, compilers and regression tests are the executable contract. If documentation and implementation appear inconsistent, do not silently choose one. Identify the conflict, determine which authority owns the topic, and resolve it explicitly.

### Current takeover state

The latest `docs/SUPER_OUTRIDE_CODEX_HANDOFF_*.md` records the takeover baseline, current architecture, known issues and recommended first task. It is a snapshot, not a replacement for normative design documents.

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
src/main.ts          -> BRANCHING
src/main-circuit.ts  -> CIRCUIT
```

Boot selection belongs only at the composition root:

```text
/              -> BRANCHING
/?mode=circuit -> CIRCUIT
```

Do not distribute `if (CIRCUIT)` / `routeKind` decisions through lower engine layers when composition can select the correct ordinary runtime objects once.

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
8. Add/update the milestone/validation record if the milestone uses one.
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
- keep DEV fixtures clearly separate from product authority.

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
- hide a runtime defect by removing a rival/feature unless the product rule itself is intentionally changed;
- bypass a failing physical-gate regression by widening gates without validating authored road geometry;
- merge an unvalidated SHA;
- force-update `main` as a normal release procedure.

---

## 15. Takeover procedure

When starting from a fresh Codex/agent context:

1. Read this file completely.
2. Read `README.md` for repository entry points.
3. Read the four freeze/addendum files listed in section 2.
4. Read the latest relevant milestone documents, especially M6.44 onward for current topology/runtime work.
5. Read the latest `docs/SUPER_OUTRIDE_CODEX_HANDOFF_*.md`.
6. Confirm current `main` SHA and compare it with the handoff snapshot.
7. Run the complete test suite before changing anything.
8. Perform a read-only architecture/takeover audit first if the handoff requests it.
9. Only then propose or implement the next milestone.

The repository, not a previous chat transcript, is the continuing project memory.
