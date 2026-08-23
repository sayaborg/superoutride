# SUPER OUTRIDE — M6.27 Live Route Runtime Assembly

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
- M6.25 Successor Stage Continuation Link — complete
- M6.26 Live Child → Successor Stage — complete
- **M6.27 Live Route Runtime Assembly — complete**

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

M6.27 adds five dedicated regressions to the M6.26 264-test suite, for a target of **269 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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
              ┌→ STAGE_2_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R → GOAL_R
```

The opening visible fork is one chainage-driven lateral cross-section. Route selection is validated from physical world-space gate crossing; steering, screen X and sprite overlap cannot choose a branch.

A route transition only creates a pending handoff. The old chart/content remain active until the corresponding physical seam is crossed forward and COMMIT succeeds.

For either route the live sequence is:

```text
physical fork
→ route choice
→ PENDING
→ parent→child seam COMMIT
→ child physical transition
→ PENDING
→ child→successor seam COMMIT
→ successor physical FINISH
```

Vehicle world X/Y/Z, yaw and velocities are never teleported by either handoff.

## Reusable stage authoring

Stage environment content is declared in its own local chart:

```text
heightNodes
visualSections
sprites { s, local l, asset }
Far Background
optional terrain overrides
```

The M6.24 compiler derives active Guide length and performs the single source conversion for raster-attached sprites:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

It produces the ordinary `HeightProfile`, `TerrainProfile`, `CourseSprite`s and complete `StageRuntimeContentPackage` without route or renderer special cases.

## Generic successor-stage link

M6.25 `StageContinuationLink` states that source and target charts describe the same physical road locus across a validated overlap interval. Compilation checks world position and heading across the complete overlap around the seam.

Within a valid link:

```text
s_target = targetSeamS + (s_source - sourceSeamS)
l_target = targetLocalL + (l_source - sourceLocalL)
```

These equations only express coordinates. They do not modify world pose, pseudo-depth rules, camera projection or vehicle physics.

## M6.26 successor geometry

The successor Guide is independent after the shared handoff overlap, but the Core hard limit remains unchanged:

```text
absolute Raster turn at one vertex <= 10°
```

M6.26 deliberately does **not** relax this constraint. The final construction reuses an already valid child Raster as the structural base, copies the overlap exactly, then applies a smooth lateral deformation only over a safe low-curvature run. Vertices near the Core turn limit are left untouched, and `compileRasterCourse()` remains the final authority.

## M6.27 live route runtime assembly

`main.ts` no longer constructs the current M6.26 route pieces individually. It consumes one validated `LiveRouteRuntimeAssembly` containing:

```text
route
content
charts
gates
handoffs
registry
initialChart
```

The generic assembly compiler validates the cross-layer relationships before simulation begins. For each route choice, its target stage must resolve through the content binding and runtime package to the **exact same GuideChart object** named by the handoff seam. The start package must use the declared initial chart, every route choice must have a physical TRANSITION gate, every terminal stage must have a physical FINISH gate, and all charts must be reachable.

This layer imports no renderer, camera, car physics, motorcycle physics, or M6.26 milestone implementation. Current-route-specific construction is isolated in `createM627LiveRouteRuntime()`.

The browser simulation loop still performs the same generic physical-gate → PENDING → seam COMMIT transaction; M6.27 changes assembly, not runtime driving semantics.

## FINISH authority

`GOAL_L` and `GOAL_R` are terminal Route DAG stages, but entering them does not finish the run. Completion still requires a validated forward crossing of the physical successor FINISH gate.

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
src/runtime/live-route-runtime.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-24-stage-authoring.ts
src/dev/m6-24-live-runtime-content.ts
src/dev/m6-26-live-successor-stage.ts
src/dev/m6-26-live-runtime-content.ts
src/dev/m6-27-live-route-runtime.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/45_m6_27_live_route_runtime_assembly.md`.

## Next

`main.ts` is now insulated from the current route topology, but `createM627LiveRouteRuntime()` still explicitly invokes M6.26-specific constructors. The next architectural step is to make the route/stage sequence itself declarative enough for a generic compiler to assemble longer point-to-point routes without adding milestone-specific construction calls, while preserving world-space physics and the frozen raster pseudo-3D renderer unchanged.
