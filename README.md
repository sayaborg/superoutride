# SUPER OUTRIDE — M6.35 Second Live Physical Fork

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
- M6.31 Reusable Raster Successor Chain Authoring — complete
- M6.32 Declarative Route Fragment Composition — complete
- M6.33 Symmetric RIGHT Third Successor — complete
- M6.34 Reusable Stage-Local Junction — complete
- **M6.35 Second Live Physical Fork — complete**

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

M6.34 ended at **303 tests**. M6.35 adds six dedicated second-live-fork regressions for a target of **309 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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

The browser route now contains a real second physical fork on the LEFT path:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → GOAL_R
```

Both visible forks are one chainage-driven lateral cross-section at a time. Route selection is validated from physical world-space gate crossing; steering, screen X and sprite overlap cannot choose a branch.

A route transition only creates a pending handoff. The old chart/content remain active until the corresponding physical seam is crossed forward and COMMIT succeeds.

One complete LEFT-A live sequence is:

```text
physical first fork
→ S1_LEFT
→ PENDING
→ parent→STAGE_2_L seam COMMIT
→ S2L_CONTINUE physical transition
→ PENDING
→ STAGE_2_L→STAGE_3_L seam COMMIT
→ S3L_CONTINUE physical transition
→ PENDING
→ STAGE_3_L→STAGE_4_L_FORK seam COMMIT
→ physical second fork / S4L_FORK_A
→ PENDING
→ STAGE_4_L_FORK→GOAL_LA seam COMMIT
→ physical GOAL_LA FINISH
```

`S4L_FORK_B` performs the same transaction into `GOAL_LB`. The RIGHT route remains:

```text
physical first fork
→ S1_RIGHT
→ PENDING
→ parent→STAGE_2_R seam COMMIT
→ S2R_CONTINUE physical transition
→ PENDING
→ STAGE_2_R→STAGE_3_R seam COMMIT
→ S3R_CONTINUE physical transition
→ PENDING
→ STAGE_3_R→GOAL_R seam COMMIT
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

M6.26 deliberately does **not** relax this constraint. The construction reuses an already valid child Raster as the structural base, copies the overlap exactly, then applies a smooth lateral deformation only over a safe low-curvature run. Vertices near the Core turn limit are left untouched, and `compileRasterCourse()` remains the final authority.

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

M6.28 remains the downstream route compiler underneath later authoring layers.

## M6.29 reusable Raster stage successor

The Raster/Guide construction algorithm lives in the generic runtime factory:

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

GroundMap sampling width is explicit authoring. The generic factory imports no RouteDag, route gates, renderer, camera, car physics, motorcycle physics, or milestone implementation.

## First-fork render continuity fix

A real browser-order integration test exposed that the apparent "stop at the fork" was not an intentional simulation stop. Immediately after the first child COMMIT, the renderer could throw:

```text
RangeError: stage GroundMap sample is outside the local ground envelope
```

The cause was a continuous-strip versus raster-pixel edge condition. `xGroundL/xGroundR` are projected strip edges, while source sampling is evaluated at pixel centers `x + 0.5`. The final included pixel center can therefore lie by at most half a pixel beyond the continuous local corridor.

The renderer now clamps only the **stage-local GroundMap raster sample** to the already-authored local corridor before sampling. It does not change strip projection, pseudo-depth, chainage, affine horizontal mapping, road geometry, camera, route logic or physics.

A permanent regression drives an actual car through the visible LEFT fork using the browser update order, performs the physical seam COMMIT, rebases the camera coordinate frame and successfully renders at least 30 child frames afterward.

## M6.30 third live successor

M6.30 made the LEFT route one stage deeper than RIGHT. The old LEFT terminal runtime geometry was promoted from `CONTENT_GOAL_L` to `CONTENT_STAGE_3_L`, and a new independent `CONTENT_GOAL_L` was generated from it.

This proved that route depth can differ between branches without changing `main.ts`, the simulation loop or renderer Core. `main.ts` still calls only the stable browser entry:

```text
createM627LiveRouteRuntime(...)
```

## M6.31 reusable Raster successor chain

M6.31 generalizes repeated continuation into:

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

Only the final generated stage is `TERMINAL`; all earlier generated stages remain ordinary `STAGE` nodes. Final FINISH is derived from the final generated GuideChart and `finishS`.

Transition and handoff geometry are derived from the concrete source GuideChart active before each successor is generated:

```text
sourceTransitionS → physical transition gate
sourceSeamS       → physical handoff seam
```

The callback must return the exact generated GuideChart as its coordinate frame. Package/chart mismatches are rejected before declarative Route DAG compilation.

`repackageGuideChartRuntime()` changes only opaque package identity when a validated terminal runtime is promoted to an intermediate stage; it performs no coordinate transformation.

A dedicated two-step regression proves that the helper is genuinely recursive.

## M6.32 declarative route fragments

M6.32 composes independently authored pieces before passing them to the unchanged M6.28 compiler:

```text
DeclarativeRouteFragment[]
→ composeDeclarativeLiveRouteAuthoring()
→ compileDeclarativeLiveRoute()
→ LiveRouteRuntimeAssembly
```

A repeated stage id may be canonicalized only when it has the same `RouteStageKind` and references the exact same runtime object. Conflicting definitions are rejected rather than silently choosing one fragment.

Stage rows are the only mergeable identity. Transition ids and all physical transition-gate, handoff-seam and FINISH-gate ids must remain globally unique. A terminal stage may own only one FINISH row.

M6.32 only canonicalizes joins and detects cross-fragment identity collisions. Final cycle/reachability, package binding, runtime registry, physical gate and handoff checks remain M6.28 and the existing lower-level validators.

No fragment/topology logic is imported by `main.ts` or renderer Core.

## M6.33 symmetric RIGHT third successor

M6.33 applies the already generic M6.31/M6.32 path to RIGHT instead of introducing a RIGHT-specific mechanism.

The validated old terminal package is promoted by opaque identity only:

```text
CONTENT_GOAL_R
→ CONTENT_STAGE_3_R
```

A new independent `CONTENT_GOAL_R` is then generated from `continuation.rightSuccessor` through `compileRasterSuccessorChain()`.

The new transition is:

```text
STAGE_3_R
→ S3R_CONTINUE
→ PENDING
→ H_S3R_CONTINUE COMMIT
→ GOAL_R
→ G_LIVE_FINISH_R
```

The new GOAL_R environment is compiled through the ordinary M6.24 stage compiler using `authored.right`. Thus the mountain/Far Background identity remains package-owned while the new GOAL_R owns a distinct Guide/Raster.

The structural successor recipe is symmetric except for deformation direction (`LEFT=-1`, `RIGHT=+1`). Final Raster validity still comes only from `compileRasterCourse()` and the frozen <=10° one-vertex rule.

`main.ts`, the browser simulation loop and renderer Core are unchanged.

## M6.34 reusable stage-local junction

M6.34 reuses the existing M6.12 `JunctionCrossSectionProfile` inside an arbitrary successor-stage chart.

The key distinction is explicit coordinate authority:

```text
GroundMapProfile.junction      = source-coordinate junction
GroundMapProfile.stageJunction = active-stage-local junction overlay
```

The two are deliberately separate. A successor stage can therefore evaluate a new fork around local `l=0` while its reusable source data continues to use the original `sourceLateralOrigin`.

The required expanded ground half-width is derived rather than hand-sized:

```text
childRoadWidth + finalMedianWidth/2 + shoulderWidth
```

`compileStageJunction()` expands only the stage ground corridor. It preserves incoming road width and source lateral origin. `StageJunctionSurfaceMap` and the stage GroundMap adapter consume the same stage-local cross-section authority for asphalt, median and shoulder semantics.

GroundMap checks `stageJunction` before the fixed single-road classification, then rebases to reusable source `l` only when the local junction does not own the sample. Source-coordinate `junction` semantics remain unchanged, preserving M6.13/M6.18 behavior.

M6.35 now consumes this reusable layer for the second live fork; the compiler itself still imports no Route DAG, renderer, camera or vehicle-physics logic.

## M6.35 second live physical fork

M6.35 promotes the validated old LEFT terminal into `STAGE_4_L_FORK` and attaches one M6.34 stage-local junction:

```text
incoming road width = 7 m
child road width    = 7 m
final median width  = 8 m
widen start         = s 80
median start        = s 110
separated start     = s 170
physical gates      = s 195
```

The fully separated child-road centers are local `l=-7.5m` and `l=+7.5m`. With 1m outer shoulders the stage-local GroundMap/Terrain corridor is derived to exactly `±12m`.

Two non-overlapping world-space route gates cover those roads:

```text
S4L_FORK_A → GOAL_LA
S4L_FORK_B → GOAL_LB
```

The grass median owns no gate and selects nothing.

Fork continuation reuses the ordinary M6.29 successor generator through `createRasterForkStageSuccessor()`. That adapter only shifts the structural source chart onto the chosen source child center and recompiles the public continuation link so:

```text
source local l = -7.5 or +7.5
target local l = 0
```

The target still receives an independent Raster/Guide, the overlap is still validated across `D_cam`, and `compileRasterCourse()` still enforces the frozen <=10° Raster-vertex rule.

The old M6.33 route authoring is exposed as `createM630ThirdLiveSuccessorAuthoring()`. M6.35 reuses that exact validated authoring, promotes only `GOAL_L`, removes only its old FINISH row, and appends the fork fragment through the M6.32 compiler. Existing first-fork and RIGHT-route structure therefore do not need to be re-authored.

A dedicated integration regression proves the complete LEFT-A route performs four physical transition → PENDING → seam COMMIT transactions before a physical FINISH. `main.ts` and renderer Core still know none of `STAGE_4_L_FORK`, `GOAL_LA`, `GOAL_LB` or `S4L_FORK_*`.

## FINISH authority

`GOAL_LA`, `GOAL_LB` and `GOAL_R` are terminal Route DAG stages, but entering any terminal stage does not finish the run. Completion still requires a validated forward crossing of the physical FINISH gate owned by that terminal stage.

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
src/course/junction-cross-section.ts
src/course/stage-road-view.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-content.ts
src/gameplay/route-stage-handoff.ts
src/physics/stage-junction-surface-map.ts
src/runtime/stage-runtime-content.ts
src/runtime/stage-authoring-compiler.ts
src/runtime/stage-continuation-link.ts
src/runtime/stage-junction-compiler.ts
src/runtime/live-route-runtime.ts
src/runtime/declarative-live-route.ts
src/runtime/declarative-route-fragment.ts
src/runtime/raster-stage-successor.ts
src/runtime/raster-fork-successor.ts
src/runtime/raster-successor-chain.ts
src/visual/stage-ground-map-view.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-24-stage-authoring.ts
src/dev/m6-24-live-runtime-content.ts
src/dev/m6-26-live-successor-stage.ts
src/dev/m6-26-live-runtime-content.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-28-declarative-live-route.ts
src/dev/m6-30-third-live-successor.ts
src/dev/m6-35-second-live-fork.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/53_m6_35_second_live_physical_fork.md`.

## Next

**M6.36 — Reusable Fork-Stage Route Fragment Authoring.** M6.35 proves the second physical fork works, but its terminal-promotion and two-child route-row assembly are still milestone-specific. The next architectural step is to extract that composition into a generic fork-stage authoring helper while keeping M6.34 junction geometry, M6.29 successor construction, M6.32 fragment validation, world-space gate selection and the frozen raster renderer unchanged.
