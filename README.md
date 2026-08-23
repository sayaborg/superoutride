# SUPER OUTRIDE — M6.38 Declarative Fork-Stage Growth Plan

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
- **M6.38 Declarative Fork-Stage Growth Plan — complete**

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

M6.37 ended at **321 tests**. M6.38 adds six dedicated fork-growth equivalence regressions for a target of **327 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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

M6.38 intentionally preserves the complete M6.37 topology and physical geometry:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

Every visible fork is still one chainage-driven lateral cross-section. It is never rendered as two independent 3D roads.

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

World X/Y/Z, yaw and velocities are not transformed by COMMIT.

Entering a terminal stage does not finish the run. Completion still requires a validated forward crossing of that terminal's physical FINISH gate.

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

M6.34/M6.36 derive rather than duplicate:

```text
LEFT child center     = local l -7.5 m
RIGHT child center    = local l +7.5 m
child gate halfwidth  = 3.5 m
stage ground envelope = +/-12 m
```

The physical route gate, handoff seam and terminal FINISH width all derive from the authored child-road width.

## Reusable route/stage compiler chain

Current route growth is intentionally layered:

```text
M6.24 stage environment compiler
M6.25 StageContinuationLink
M6.29 Raster successor factory
M6.31 Raster successor chain
M6.32 declarative route-fragment composition
M6.34 stage-local junction compiler
M6.35 fork coordinate adapter
M6.36 generic fork-stage route compiler
M6.38 ordered fork-growth fold
M6.28 final declarative live-route compiler
M6.27 stable browser-facing runtime entry
```

The renderer is downstream of the selected runtime package and does not know route identities.

### Stage environment authority

Stage content is authored in its own local chart:

```text
heightNodes
visualSections
sprites { s, local l, asset }
Far Background
optional terrain overrides
```

M6.24 performs the single source conversion for raster-attached sprites:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

It produces ordinary `HeightProfile`, `TerrainProfile`, `CourseSprite`s and `StageRuntimeContentPackage` objects.

### Successor geometry authority

M6.29 creates an independent Raster/Guide successor while preserving an exact overlap around the handoff seam. Final geometry always flows through ordinary `compileRasterCourse()`, so the frozen <=10° Raster vertex rule remains the final authority.

M6.25 validates that source and target charts describe the same physical road locus across `D_cam` overlap:

```text
s_target = targetSeamS + (s_source - sourceSeamS)
l_target = targetLocalL + (l_source - sourceLocalL)
```

These are coordinate relations only; they do not transform vehicle world state.

### Declarative route authority

M6.28 compiles stage, transition and FINISH rows into:

```text
RouteDag
RouteStageContentManifest
StageRuntimeContentRegistry
RouteBoundaryGateSet
RouteStageHandoffManifest
LiveRouteRuntimeAssembly
```

M6.32 composes independently authored route fragments before this final compilation. Duplicate or conflicting identity is rejected rather than silently resolved.

### Generic fork-stage authority

M6.36 exposes:

```text
compileRasterForkStageRoute(authoring)
```

Given one existing terminal, it validates the source, promotes only opaque package identity, attaches the M6.34 stage-local junction, derives child centers and widths, creates both M6.29 Raster successors, validates caller-supplied package/chart ownership, derives transition gates/handoff seams/FINISH gates, and composes through M6.32.

Branch authoring does **not** repeat `sourceLocalL`, `roadHalfWidth` or physical gate/seam centers.

## M6.38 declarative fork-growth plan

M6.38 adds one deliberately thin generic composition helper:

```text
compileRasterForkGrowthPlan(upstream, steps)
```

It owns only this operation:

```text
authoring = upstream
for each ordered step:
    compiled = compileRasterForkStageRoute({ ...step, upstream: authoring })
    authoring = compiled.authoring
```

It does not calculate roads, junctions, branch centers, gates, seams or FINISH geometry. All of those remain M6.36 and lower-layer authority.

The live route now starts directly from the M6.30 authoring and applies two data rows:

```text
M6.30 base authoring
→ [GOAL_L → STAGE_4_L_FORK → GOAL_LA / GOAL_LB]
→ [GOAL_R → STAGE_4_R_FORK → GOAL_RA / GOAL_RB]
→ unchanged M6.28 final compiler
```

This removes the live constructor nesting `M6.37 → M6.35 → M6.30`. M6.35 and M6.37 remain executable historical fixtures and their physical regressions stay green.

A zero-step growth plan is exact identity: it returns the same upstream authoring object and no compiled steps.

## Exact behavior-preservation proof

M6.38 does not merely compare stage counts with M6.37. Dedicated regressions compare the two complete runtime assemblies and prove exact preservation of:

- RouteDag stage ids/kinds and transition topology;
- stage→package bindings;
- package→GuideChart identities;
- every physical transition/FINISH gate id, owner, center, heading and half-width;
- every physical handoff seam id, choice, target chart, center, heading and half-width.

Thus M6.38 changes authoring composition, not live route behavior.

The stable browser entry remains:

```text
createM627LiveRouteRuntime(...)
```

Its dev-layer delegate now calls `createM638DeclarativeForkGrowthRuntime(...)`. `main.ts` and renderer Core remain unchanged and contain no second-fork topology identities.

## Validation status

Structural M6.38 head before documentation synchronization:

```text
c086ec6ed3dfb7f461e9b284284e8032b2b3fe48
workflow 32634523257
327 tests
327 pass
0 fail
```

CI history before that green head:

- initial candidate: TypeScript rejected a widened readonly branch array where M6.36 requires an exact readonly two-branch tuple; explicit tuple typing fixed it without behavior change;
- tuple-fixed candidate: 323/327, with all six M6.38 regressions already green; only four historical static layering assertions still named the prior M6.37 stable-entry target;
- those assertions were updated to the actual M6.38 layering while all historical runtime/geometry fixture assertions were preserved.

The documentation-inclusive exact head must independently reproduce **327/327 / 0 fail** before main fast-forward.

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
src/runtime/raster-fork-stage-route.ts
src/runtime/raster-fork-growth-plan.ts
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
src/dev/m6-37-symmetric-right-second-live-fork.ts
src/dev/m6-38-declarative-fork-growth-plan.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/56_m6_38_declarative_fork_growth_plan.md`.

## Next

**M6.39 — Deep Route Browser-Order Integration.** Route authoring is now sufficiently generic. The next useful step is not another abstraction: drive the actual 60 Hz browser update order through the deeper point-to-point route, including repeated physical route gates, PENDING/COMMIT handoffs, camera chart rebasing and renderer calls across a second fork. The regression must prove continuous rendering through the deep route without adding renderer-specific route logic.
