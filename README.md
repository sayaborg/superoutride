# SUPER OUTRIDE — M6.25 Successor Stage Continuation Link

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D.**

`main` is the implementation authority. Frozen renderer mathematics remain defined by `docs/00_core_design_freeze.md` and the M5.2 metric-sprite addendum.

## Current milestone state

- M0 Browser Shell — complete
- M1 Core Geometry — complete
- M2 Road Running — complete / GO
- M3 Visual Core — complete
- M4 Super Scaler — complete
- M5 Driving — complete (Car + Motorcycle DEV physics)
- M5.1 Player visibility / recovery — complete
- M5.2 Fixed metric sprite scale — complete
- M5.3 Compiler / Asset Pipeline Foundation — complete
- M5.4 GroundMap Density / Anisotropic LOD Foundation — complete
- M5.5 TerrainLine Footprint Instrumentation — complete
- M5.6 Target GroundMap kMax Proof — complete
- M5.7 Baked GroundMap Runtime Integration — complete
- M5.8 Render Performance Budget Instrumentation — complete
- M5.9 Tunnel / Portal Stress Content — complete
- M6.0 Validated Race Progress Foundation — complete
- M6.1 Bounded Continuous Race Progress — complete
- M6.2 Deterministic Run Timing / Ranking Consumer — complete
- M6.3 Independent Moving Rival Foundation — complete
- M6.4 Vehicle Physics Replaceability Boundary — complete
- M6.5 Deterministic Vehicle Physics Telemetry — complete
- M6.6 Deterministic Driving Input Trace Replay — complete
- M6.7 Validated Run Objective / Point-to-Point Completion — complete
- M6.8 Gameplay-only Validated Route DAG — complete
- M6.9 World-space Validated Route Boundary Gates — complete
- M6.10 Generic Validated Run Finish — complete
- M6.11 Route Stage Content Manifest Boundary — complete
- M6.12 Junction Cross-section Authority — complete
- M6.13 Visible Junction GroundMap / SurfaceMap — complete
- M6.14 Raster Fixed-l Miter Continuity — complete
- M6.15 Visible World-space Route Gates — complete
- M6.16 Child Guide Chart Handoff — complete
- M6.17 Deferred Stage Handoff Transaction — complete
- M6.18 Stage-local Single-road View — complete
- M6.19 Stage Runtime Content Registry — complete
- M6.20 Live Point-to-Point Stage Runtime — complete
- M6.21 Child Visual Identity — complete
- M6.22 True Child Stage Continuation — complete
- M6.23 Child Environment Content — complete
- M6.24 Reusable Stage Authoring / Compiler — complete
- **M6.25 Successor Stage Continuation Link — complete**

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

Full regression:

```bash
npm test
```

M6.25 adds six regressions to the M6.24 252-test suite, for a target of **258 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

## Frozen renderer authority

The implementation must preserve all of the following:

- world X/Y/Z is authoritative for physics
- vehicle motion is not snapped to the road centerline
- one chainage maps to one horizontal scanline
- pseudo-depth is signed cyclic chainage difference only
- camera-space Z is not introduced
- Euclidean distance is not used as renderer depth
- lateral position does not modify depth
- same `d` means same scale
- same `d` + same height means same screen Y
- road remains Raster Segment geometry
- one-vertex turn remains at most 10°
- Guide Curve is coordinate / camera support only
- TerrainLine and World Sprite share one far-to-near Painter
- no z-buffer or polygon road
- no perspective-correct texture mapping
- no arbitrary runtime sprite rotation
- transparency is 0/1; no alpha blending
- camera roll remains zero
- GroundMap `(s,l)` visual data and SurfaceMap `(s,l)` physics data remain independent
- GroundBase TRANSPARENT and SurfaceMap VOID remain independent
- Far Background is one full image including below-horizon pixels
- branch / Route DAG logic is not renderer Core

Final renderer order:

```text
Optional Clear
→ Full Far Background
→ Terrain + World Sprite far→near
→ Player Sprite
→ HUD
```

## Fixed metric authority

```text
player car physical width = 2.0 m
player car source width   = 80 px
player-depth scale        = 40 px/m
f                         = 200 px
D_cam                     = 5.0 m
d_min                     = 2.5 m
camera pitch              = 8°
base camera height        = 2.469902425419539 m
player target Y           ≈ 190
```

Sprite scale remains physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## Live point-to-point architecture

The browser route remains:

```text
           ┌─ GOAL_L
STAGE_1 ───┤
           └─ GOAL_R
```

The visible fork is still one chainage-driven lateral cross-section. Route selection is validated from physical world-space gate crossing; steering, screen X and sprite overlap cannot choose a branch.

At handoff, vehicle world X/Y/Z, yaw and velocities are never teleported. Only the road-coordinate expression and active content package change after a validated world-space seam.

Current child geometry begins from a shared parent overlap around the `s=600` handoff and continues on independent child Raster/Guide courses. Each child FINISH is authored at child-local `s=250`.

## M6.24 reusable stage authoring

Stage environment content is declared in its own local chart:

```text
heightNodes
visualSections
sprites { s, local l, asset }
Far Background
optional terrain overrides
```

The compiler derives active Guide length and performs the single source conversion for raster-attached sprites:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

It produces the ordinary `HeightProfile`, `TerrainProfile`, `CourseSprite`s and complete `StageRuntimeContentPackage` without route or renderer special cases.

## M6.25 generic successor-stage link

M6.25 extracts the M6.22 overlap-continuity rule into a reusable runtime primitive: `StageContinuationLink`.

A link states that a source chart and a target chart describe the same physical road locus across a validated overlap interval. Source and target local lateral coordinates may differ. The existing fork proves both cases:

```text
parent LEFT  l=-7.5m  ↔ child LEFT  l=0
parent RIGHT l=+7.5m  ↔ child RIGHT l=0
```

Compilation checks world position and heading across five points spanning the complete overlap. The current fixture validates `D_cam=5m` both behind and ahead of the seam. Mismatched successor geometry is rejected before runtime handoff.

Within a valid link, chainage is a pure seam-relative rebase:

```text
s_target = targetSeamS + (s_source - sourceSeamS)
```

Signed lateral displacement from the linked road center is preserved:

```text
l_target = targetLocalL + (l_source - sourceLocalL)
```

These equations only express coordinates. They do not modify world pose, pseudo-depth rules, camera projection or vehicle physics.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Handling values remain replaceable scaffolding. Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are established.

## Primary route/stage files

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/guide-coordinate-frame.ts
src/course/stage-road-view.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-content.ts
src/gameplay/route-stage-handoff.ts
src/runtime/stage-runtime-content.ts
src/runtime/stage-authoring-compiler.ts
src/runtime/stage-continuation-link.ts
src/dev/m6-20-live-point-to-point.ts
src/dev/m6-21-child-visual-identity.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-22-live-runtime-content.ts
src/dev/m6-24-stage-authoring.ts
src/dev/m6-24-live-runtime-content.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/43_m6_25_successor_stage_link.md`.

## Next

Use the M6.24 package compiler and M6.25 validated continuation link to extend the live route from the selected child into a real successor stage. The next implementation should prove **child → next stage** world-pose-continuous handoff in the browser without adding 3D branching geometry or route logic to renderer Core.
