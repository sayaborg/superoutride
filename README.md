# SUPER OUTRIDE — M6.31 Reusable Raster Successor Chain Authoring

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
- M6.27 Live Route Runtime Assembly — complete
- M6.28 Declarative Live Route Compilation — complete
- M6.29 Reusable Raster Stage Successor Factory — complete
- M6.30 Third Live Successor Stage — complete
- **M6.31 Reusable Raster Successor Chain Authoring — complete**

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

M6.30 ended at **284 tests**. M6.31 adds five dedicated successor-chain regressions for a target of **289 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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
              ┌→ STAGE_2_L → STAGE_3_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R ─────────────→ GOAL_R
```

The opening visible fork is still one chainage-driven lateral cross-section. Route selection is validated from physical world-space gate crossing; steering, screen X and sprite overlap cannot choose a branch.

A route transition only creates a pending handoff. The old chart/content remain active until the corresponding physical seam is crossed forward and COMMIT succeeds.

The LEFT live sequence is:

```text
physical fork
→ S1_LEFT
→ PENDING
→ parent→STAGE_2_L seam COMMIT
→ S2L_CONTINUE physical transition
→ PENDING
→ STAGE_2_L→STAGE_3_L seam COMMIT
→ S3L_CONTINUE physical transition
→ PENDING
→ STAGE_3_L→GOAL_L seam COMMIT
→ physical GOAL_L FINISH
```

The RIGHT route retains the previous depth:

```text
physical fork
→ S1_RIGHT
→ PENDING
→ parent→STAGE_2_R seam COMMIT
→ S2R_CONTINUE physical transition
→ PENDING
→ STAGE_2_R→GOAL_R seam COMMIT
→ physical GOAL_R FINISH
```

Vehicle world X/Y/Z, yaw and velocities are never teleported by a handoff.

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

`main.ts` consumes one validated `LiveRouteRuntimeAssembly` containing:

```text
route
content
charts
gates
handoffs
registry
initialChart
```

The assembly compiler validates route/content/chart/runtime identity before simulation starts. The browser simulation loop performs the same generic physical-gate → PENDING → seam COMMIT transaction regardless of route topology.

## M6.28 declarative live route

Route topology is authored as stage, transition and finish rows. A stage owns its complete runtime package; a transition owns only its topology and physical gate/seam geometry; a terminal finish owns only its physical FINISH geometry.

The generic compiler derives references that previously had to be repeated:

```text
Route choiceId        = transition.id
handoff targetChartId = target stage runtime.coordinateFrame.id
content packageId     = stage.runtime.packageId
chart set             = unique stage runtime GuideChart objects
initialChart          = start stage runtime coordinateFrame
```

Compilation still flows through the established validators:

```text
DeclarativeLiveRouteAuthoring
→ RouteDag
→ RouteStageContentManifest
→ StageRuntimeContentRegistry
→ physical RouteBoundaryGateSet
→ RouteStageHandoffManifest
→ LiveRouteRuntimeAssembly
```

M6.28 therefore reduces duplicated route authoring without weakening any lower-level check.

## M6.29 reusable Raster stage successor

The Raster/Guide construction algorithm used by the M6.26 successor stages lives in the generic runtime factory:

```text
createRasterStageSuccessor(source, authoring)
```

The factory accepts an already compiled Guide/chart plus metric authoring, copies a complete overlap interval exactly, finds a low-curvature source run, applies smooth `sin(pi*phase)^2` lateral deformation only inside that run, and always sends the result through the ordinary `compileRasterCourse()` authority.

The frozen 10° Raster rule is not exposed as a configurable tolerance. `gentleTurnLimitDegrees` is only a conservative source-run selector and must remain strictly below 10°. Any final candidate must still pass the normal Raster compiler.

The factory produces the complete structural successor source in one operation:

```text
GuideCurve
GuideChart
StageRoadView
StageSurfaceMapView
GroundMapProfile
StageContinuationLink
sourceTransitionS
sourceSeamS
targetSeamS
finishS
```

GroundMap sampling width is an explicit authoring value rather than a hardcoded current-course constant. The generic factory imports no RouteDag, route gates, renderer, camera, car physics, motorcycle physics, or milestone implementation.

## First-fork render continuity fix

A real browser-order integration test exposed that the apparent "stop at the fork" was not an intentional simulation stop. Immediately after the first child COMMIT, the renderer could throw:

```text
RangeError: stage GroundMap sample is outside the local ground envelope
```

The cause was a continuous-strip versus raster-pixel edge condition. `xGroundL/xGroundR` are projected strip edges, while source sampling is evaluated at pixel centers `x + 0.5`. The final included pixel center can therefore lie by at most half a pixel beyond the continuous local corridor.

The renderer now clamps only the **stage-local GroundMap raster sample** to the already-authored local corridor before sampling. It does not change strip projection, pseudo-depth, chainage, affine horizontal mapping, road geometry, camera, route logic or physics.

A permanent regression drives an actual car through the visible LEFT fork using the browser update order, performs the physical seam COMMIT, rebases the camera coordinate frame and successfully renders at least 30 child frames afterward.

## M6.30 third live successor

M6.30 applies the M6.29 factory recursively to the actual live route.

The old LEFT terminal runtime geometry is retained and promoted from:

```text
CONTENT_GOAL_L
```

to:

```text
CONTENT_STAGE_3_L
```

A new independent `CONTENT_GOAL_L` is generated from that promoted stage. Its environment is compiled through the existing M6.24 stage authoring compiler, while route topology is compiled through the existing M6.28 declarative compiler.

This proves that route depth can differ between branches without changing `main.ts`, the simulation loop or renderer Core. `main.ts` still calls only the stable browser entry:

```text
createM627LiveRouteRuntime(...)
```

The M6.30 layer contains the new topology data; the browser and renderer do not contain `STAGE_3_L`, `S3L_CONTINUE`, LEFT/RIGHT depth rules, or another road rendering path.

## M6.31 reusable Raster successor chain

M6.31 generalizes the repeated M6.30 continuation pattern into:

```text
compileRasterSuccessorChain(source)
```

A chain begins with one existing stage/runtime/structural source and an ordered list of successor steps. For each step the compiler:

```text
current structural source
→ createRasterStageSuccessor(...)
→ generated Guide/Raster/link
→ caller createRuntime(...) callback
→ declarative transition + handoff rows
→ next source
```

Only the final generated stage is marked `TERMINAL`; all earlier generated stages remain ordinary `STAGE` nodes. The final physical FINISH is derived from the final generated GuideChart and `finishS`.

Transition and handoff geometry are derived from the concrete **source GuideChart active before each successor is generated**:

```text
sourceTransitionS -> physical transition gate
sourceSeamS       -> physical handoff seam
```

The chain compiler therefore does not duplicate chainage positions and does not inspect renderer state.

Environment/runtime content remains a caller responsibility through:

```text
createRuntime(structural, packageId, stageId, stepIndex)
```

The callback must return the exact generated GuideChart as its coordinate frame. Package/chart mismatches are rejected before declarative Route DAG compilation.

M6.31 also adds `repackageGuideChartRuntime()`, used when an already validated terminal runtime is promoted into an intermediate stage. This changes only its opaque package identity and preserves all owned geometry/content object references.

M6.30 now delegates its deep LEFT continuation to the M6.31 chain compiler and no longer calls `createRasterStageSuccessor()` directly for that step. The current live route is unchanged; M6.31 is an authoring generalization rather than a new route-depth milestone.

A dedicated two-step regression proves the helper is genuinely recursive: one source produces an intermediate stage and then a distinct terminal successor with two independently generated charts.

## FINISH authority

`GOAL_L` and `GOAL_R` are terminal Route DAG stages, but entering them does not finish the run. Completion still requires a validated forward crossing of the physical FINISH gate owned by that terminal stage.

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
src/runtime/declarative-live-route.ts
src/runtime/raster-stage-successor.ts
src/runtime/raster-successor-chain.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-24-stage-authoring.ts
src/dev/m6-24-live-runtime-content.ts
src/dev/m6-26-live-successor-stage.ts
src/dev/m6-26-live-runtime-content.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-28-declarative-live-route.ts
src/dev/m6-30-third-live-successor.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/49_m6_31_successor_chain_authoring.md`.

## Next

M6.31 can compile arbitrary linear successor depth. The next architectural proof should compose multiple successor-chain fragments with explicit fork/junction transitions into higher-level branch authoring, while still emitting the established M6.28 declarative Route DAG rows and keeping exactly one active Raster road domain at a time.
