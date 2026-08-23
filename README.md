# SUPER OUTRIDE — M6.39 Deep Route Browser-Order Integration

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
- M6.35 Second Live Physical Fork — complete
- M6.36 Reusable Fork-Stage Route Authoring — complete
- M6.37 Symmetric RIGHT Second Live Fork — complete
- M6.38 Declarative Fork-Stage Growth Plan — complete
- **M6.39 Deep Route Browser-Order Integration — complete**

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

M6.38 ended at **327 tests**. M6.39 adds two deep browser-order route regressions for **329 tests** total. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

## Frozen renderer authority

The implementation preserves all of the following:

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
- absolute turn at one Raster vertex remains at most 10°
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

There is no arbitrary `visualScale` multiplier. A future FOV change must move `D_cam` so the 40 px/m player-depth reference remains fixed.

## Current live point-to-point route

M6.39 preserves the M6.38 topology and physical geometry:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

Every visible fork remains one chainage-driven lateral cross-section, never two independently projected roads.

Route selection comes only from a validated world-space physical gate crossing. Steering direction, screen X and sprite overlap cannot select a branch. The grass median owns no gate and selects nothing.

A transition only queues a pending stage handoff:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ old chart/content remain active
→ forward physical seam crossing
→ COMMIT target chart/content
```

World X/Y/Z, yaw and velocities are not transformed by COMMIT. Entering a terminal stage does not finish the run; a validated forward crossing of that terminal's physical FINISH gate is still required.

## Second-fork metric authority

LEFT and RIGHT second forks share one stage-local metric recipe:

```text
incoming road width = 7 m
child road width    = 7 m
final median width  = 8 m
shoulder width      = 1 m
widen start         = s 80
median start        = s 110
separated start     = s 170
route gate          = s 195
source seam minimum = s 235
```

M6.34/M6.36 derive:

```text
LEFT child center     = local l -7.5 m
RIGHT child center    = local l +7.5 m
child gate halfwidth  = 3.5 m
stage ground envelope = +/-12 m
```

## Reusable route/stage compiler chain

```text
M6.24 stage environment compiler
M6.25 StageContinuationLink
M6.29 Raster successor factory
M6.31 Raster successor chain
M6.32 declarative route-fragment composition
M6.34 stage-local junction compiler
M6.36 generic fork-stage route compiler
M6.38 ordered fork-growth fold
M6.28 final declarative live-route compiler
M6.27 stable browser-facing runtime entry
```

The renderer is downstream of the selected runtime package and does not know route identities.

### Stage-local coordinate authority

A stage package owns a `GuideCoordinateFrame`. Its local `l=0` may correspond to a non-zero lateral origin in the underlying source Guide geometry.

Raster-attached content performs the single source conversion:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

World physics remains authoritative; a coordinate-frame change only changes the road chart used to describe the same world pose.

### Successor geometry authority

M6.29 creates an independent Raster/Guide successor while preserving exact overlap around the handoff seam. Final geometry always flows through `compileRasterCourse()`, so the frozen <=10° Raster vertex rule remains final authority.

M6.25 validates the source/target coordinate relation across `D_cam` overlap:

```text
s_target = targetSeamS + (s_source - sourceSeamS)
l_target = targetLocalL + (l_source - sourceLocalL)
```

These relations never transform vehicle world state.

### Declarative route authority

M6.28 produces the complete runtime bundle:

```text
RouteDag
RouteStageContentManifest
StageRuntimeContentRegistry
RouteBoundaryGateSet
RouteStageHandoffManifest
LiveRouteRuntimeAssembly
```

M6.32 composes route fragments before final compilation. M6.38 applies ordered terminal→fork growth steps through the unchanged M6.36 compiler, removing milestone-constructor nesting while preserving M6.37 behavior exactly.

## M6.39 deep browser-order proof

M6.39 validates two opposite complete outcomes through the stable browser entry:

```text
LEFT-A  → GOAL_LA
RIGHT-B → GOAL_RB
```

Each path keeps one cumulative RouteDag state, handoff state, objective state, runtime registry and camera rig while performing four physical transactions:

```text
ordinary M5 physics
→ physical transition gate
→ PENDING
→ physical seam
→ COMMIT
→ vehicle.course rebase
→ camera frame rebase
→ active package render
```

Between completed handoffs only, the test fixture places the car 8 m before the actual authored physical gate. From that point through the seam there is no position rewrite. This deliberately validates the browser transaction without turning current `DEV_UNCALIBRATED` full-course AI behavior into a frozen requirement.

For all eight COMMITs across LEFT-A and RIGHT-B, world x/y/z, yaw and velocity state are exact-compared immediately before and after COMMIT and must remain unchanged. Every local physical probe must stay supported without recovery and remain above 8 m/s at COMMIT.

After the selected terminal's physical FINISH, physics, camera and renderer continue for another 30 frames. FINISH records the point-to-point result; it does not freeze the live loop.

## Coordinate-aware rival driver

The deep integration test exposed a real coordinate-boundary bug in the DEV rival controller.

Previously:

```text
sampleRivalDrivingInput(GuideCurve, car, targetL)
```

A child stage could therefore lose its `GuideCoordinateFrame.lateralOrigin` while `car.course.l` remained stage-local. For the existing ±7.5 m child origins, local `l=0` could be steered toward the wrong world-space line.

M6.39 changes the API to:

```text
sampleRivalDrivingInput(GuideCoordinateSource, car, targetL)
```

Lookahead now uses `guideCoordinateToWorld()`. Plain `GuideCurve` callers remain exactly compatible as zero-origin sources, while child/successor callers can preserve stage-local coordinates by passing the full frame.

This is a gameplay/coordinate-boundary correction only; renderer projection and vehicle physics equations are unchanged.

## Validation status

Structural implementation head before documentation synchronization:

```text
0c1865ff45fd3e527aeb8393ea156fbb128d3d23
workflow 32656017720
329 tests
329 pass
0 fail
```

Earlier M6.39 CI failures were work-in-progress diagnostics. They first showed that a full-route autonomous run depended on uncalibrated AI/handling, then exposed the real stage-local lateral-origin mismatch. Those runs are not milestone validation.

The documentation-inclusive exact head must independently reproduce **329/329 / 0 fail** before main fast-forward.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Handling values remain replaceable scaffolding. Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are established.

## Primary route/runtime files

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/guide-coordinate-frame.ts
src/gameplay/rival-driver.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-handoff.ts
src/runtime/stage-runtime-content.ts
src/runtime/stage-continuation-link.ts
src/runtime/declarative-live-route.ts
src/runtime/declarative-route-fragment.ts
src/runtime/raster-stage-successor.ts
src/runtime/raster-fork-stage-route.ts
src/runtime/raster-fork-growth-plan.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-38-declarative-fork-growth-plan.ts
src/render/m5-renderer.ts
src/main.ts
tests/m6-39-deep-browser-order-integration.test.mjs
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/57_m6_39_deep_browser_order_integration.md`.

## Next

**M6.40 — Rival Live Route Traversal.** The player already traverses package/chart handoffs, while the current DEV rival remains deliberately fixed to the parent course domain and disappears after the player commits to child content. M6.39 makes the rival steering boundary coordinate-frame aware. The next useful step is to give the rival its own RouteDag/handoff/runtime state, drive a deterministic authored route through the same physical gate/seam machinery, and render it only when its active runtime package is compatible with the player's visible stage. This should reuse the existing world-physics vehicle, route runtime and ordinary sprite path rather than introduce rival-specific renderer topology.
