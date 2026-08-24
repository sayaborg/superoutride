# SUPER OUTRIDE — M6.44 Open Path Core

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative M5.2 metric-sprite and M6.44 open-path addenda.

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
- M6.39 Deep Route Browser-Order Integration — complete
- M6.40 Rival Live Route Traversal — complete
- M6.41 Shared Route Choice Authority — complete
- M6.42 Multi-Actor Route Tick Arbitration — complete
- M6.43 Course Mode / Rival Roster Foundation — complete
- **M6.44 Open Path Core — complete**

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

M6.43 ended at **359 tests**. M6.44 plus its post-merge hardening own ten direct open-path/topology-boundary regressions for **369 tests** total. Pull-request CI explicitly checks out the feature head SHA, asserts that the actual checkout equals that SHA, and then runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

## Frozen renderer authority

The implementation preserves all of the following:

- world X/Y/Z is authoritative for physics;
- vehicle motion is not snapped to the road centerline;
- one chainage maps to one horizontal scanline;
- pseudo-depth is exactly `s_render - s_camera`;
- renderer depth contains no course-length modulo or topology decision;
- camera-space Z is not introduced;
- Euclidean distance is not used as renderer depth;
- lateral position does not modify depth;
- same `d` means same scale;
- same `d` + same height means same screen Y;
- road remains Raster Segment geometry;
- absolute turn at one **interior** Raster vertex remains at most 10°;
- Guide Curve is coordinate / camera support only;
- TerrainLine and World Sprite share one far-to-near Painter;
- no z-buffer or polygon road;
- no perspective-correct texture mapping;
- no arbitrary runtime sprite rotation;
- transparency is 0/1; no alpha blending;
- camera roll remains zero;
- GroundMap `(s,l)` visual data and SurfaceMap `(s,l)` physics data remain independent;
- GroundBase TRANSPARENT and SurfaceMap VOID remain independent;
- Far Background is one full image including below-horizon pixels;
- branch / RouteDag / course-mode / rival-count / circuit topology is not renderer Core.

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

## Open path geometry authority

M6.44 makes the renderer geometry primitive independent from route topology.

The canonical Raster/Guide domain is:

```text
0 <= s <= L
```

Authored vertices mean only:

```text
v0 → v1 → ... → vN
```

Core does not manufacture a hidden:

```text
vN → v0
```

Therefore:

- RasterPath has no implicit closing segment;
- first/last Raster vertices have no synthetic closing turn or miter;
- GuidePath has no endpoint wrap fillet;
- Raster/Guide sampling does not modulo-wrap out-of-range chainage;
- local world-to-Guide search clips at real endpoints;
- TerrainLine forward visibility clips at the actual path end;
- camera chainage uses `s_vehicle - D_cam` without wrapping;
- world-sprite and terrain depth both use `s_render - s_camera`.

The authoring/compiler layer owns sufficient run-in/runout around ordinary play so endpoint clipping does not require renderer exceptions.

### Open SurfaceMap / explicit cyclic adapter

Physical surface addressing follows the same principle:

```text
SurfaceMap        = general open [0,L] physical map
CyclicSurfaceMap  = explicit closed-course adapter
```

Point-to-point successor stages use the general open `SurfaceMap`. Existing closed DEV content may deliberately opt into the cyclic adapter, but wrapping is no longer an inherited property of every stage.

### Open successor stages

The reusable Raster successor factory no longer obtains a tail by wrapping from the source endpoint back to its beginning.

A successor now:

```text
copy exact handoff overlap
→ continue from ordinary forward tangent
→ own an open forward runout
→ retain enough forward envelope for later successor seams/draw distance
```

Generated runout vertices remain inside the frozen 10° interior Raster limit. FINISH only needs to lie before the actual open endpoint; there is no manufactured closure seam or `finishClosureMargin` authority.

This allows the existing deep route to remain a true chain of point-to-point stage geometry rather than a chain built on fake loops.

## Course route structures

M6.43 established three product route structures:

```text
LINEAR     long single-route point-to-point
BRANCHING  Out Run-style branching point-to-point
CIRCUIT    closed lap route
```

The first two belong naturally to open geometry:

```text
LINEAR     → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
BRANCHING  → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
```

`CIRCUIT` remains a separate future topology authority:

```text
CIRCUIT → CIRCUIT_LOOP / LAPS finish
```

This does not weaken the existing acyclic RouteDag and does not change RasterPath/GuidePath into cyclic primitives. A future circuit implementation must explicitly own endpoint connection/wrapping above Core, using named adapters where needed.

## Current live branching route

The current DEV course mode is `BRANCHING` and uses the existing deep physical route:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

Every visible fork is still one chainage-driven lateral cross-section, never two independently projected roads.

A route transition remains:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ old chart/content remain active
→ forward physical seam crossing
→ COMMIT target chart/content
```

World X/Y/Z, yaw and velocities are not transformed by COMMIT. Entering a terminal stage is not FINISH; a forward crossing of that terminal's physical FINISH gate is still required.

## Branching field rule

For a `BRANCHING` course, the product rule remains:

> **At each real fork, the first vehicle to physically cross one sibling branch gate locks that branch for the race field.**

This reuses M6.41/M6.42 shared authority:

```text
all participating vehicle physics
→ observe all physical route-gate crossings
→ arbitrate once using physical sub-tick crossingFraction u
→ earliest crossing chooses the branch
→ store field lock
→ accepted vehicles still perform their own PENDING / seam / COMMIT
```

Steering direction, AI intent, screen X, sprite overlap and JavaScript actor update order cannot choose the route.

If multiple vehicles cross the same winning gate in the deciding tick, all may advance through that gate. A sibling crossing in that tick is rejected by session route authority.

### Losing sibling-road behavior remains undecided

The route decision is fixed, but the physical response when a trailing vehicle attempts the forbidden sibling road remains intentionally unresolved:

```text
branchViolationPolicy = UNDECIDED
```

Possible later rules include an invisible/physical barrier or `WRONG COURSE` followed by forced recovery. No such behavior is implemented yet. The losing sibling road remains normal authored terrain/visual content; branch locking only controls legal route progression.

## Multi-actor route tick

M6.42 established one variable-length route transaction per 60 Hz physics tick:

```text
all actor physics
→ observe every actor
→ arbitrate shared/session route policy once
→ apply accepted per-actor transitions
→ PENDING
→ per-actor seam / COMMIT
→ camera / render
```

`advanceLiveRouteMultiActorTick()` is cardinality-agnostic and owns no vehicle physics, camera, renderer or input dependency.

It validates both:

```text
PLAYER + 0 rivals  → 1 actor
PLAYER + 16 rivals → 17 actors
```

The engine-level route transaction contains no one-rival assumption and no literal product cap.

## Mode-owned rival count

`CourseModeAuthoring` owns opponent cardinality.

Current product envelope:

```text
rivalCount = integer 0..16
MAX_RIVAL_COUNT = 16
```

The upper bound belongs to mode validation only. It does not belong in physics, route batching, renderer or Painter logic.

The current DEV mode remains:

```text
routeKind  = BRANCHING
rivalCount = 1
```

so the visible fixture remains familiar while the architecture is not singular.

## Rival roster

`src/runtime/rival-roster.ts` compiles a stable variable-length roster:

```text
0 rivals  → []
3 rivals  → RIVAL_01, RIVAL_02, RIVAL_03
16 rivals → RIVAL_01 ... RIVAL_16
```

There is no `null rival` special case.

`main.ts` iterates `rivals[]` through ordinary:

```text
AI input
M5 vehicle physics
recovery
race progress/session
LiveRouteTravelerState
multi-actor route arbitration
per-actor COMMIT
package-compatible dynamic CourseSprite generation
standings
```

The renderer only receives an ordinary variable-length sprite list.

The current M6.40 RIGHT-B route plan remains DEV AI intent. Under the BRANCHING field rule it does not possess route authority: whichever physical vehicle first crosses a sibling branch gate determines the shared legal branch.

## Reusable route/stage compiler chain

```text
M6.24 stage environment compiler
M6.25 StageContinuationLink
M6.29 open Raster successor factory
M6.31 Raster successor chain
M6.32 declarative route-fragment composition
M6.34 stage-local junction compiler
M6.36 generic fork-stage route compiler
M6.38 ordered fork-growth fold
M6.28 final declarative live-route compiler
M6.27 stable browser-facing runtime entry
```

The renderer remains downstream of the selected runtime package and knows no route identity.

## Stage-local coordinate authority

A stage package owns a `GuideCoordinateFrame`. Its local `l=0` can correspond to a non-zero lateral origin in source Guide geometry.

Raster-attached content performs the single source conversion:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

World physics remains authoritative. A chart handoff only re-expresses the same world pose in another local road coordinate system.

## M6.44 validation targets

Dedicated regressions cover:

1. no Raster last-to-first segment;
2. no synthetic endpoint closing turn/miter;
3. non-wrapping Raster sampling;
4. no Guide endpoint wrap fillet and non-cyclic Guide sampling;
5. clipped local world-to-Guide search;
6. topology-neutral `s_render - s_camera` pseudo-depth;
7. same-depth scale invariance without topology input;
8. terrain endpoint clipping instead of wrap;
9. general `SurfaceMap` rejects chainage outside `[0,L]`;
10. cyclic surface wrapping requires explicit `CyclicSurfaceMap` selection.

The original M6.44 implementation-green checkpoint `ee675357afc27f27ebcb3c727f8011127d7e8858` passed GitHub Actions run #397 with:

```text
367 tests
367 pass
0 fail
```

The hardening follow-up raises the suite to **369 tests** and makes the exact source SHA an executable CI invariant. The validation-file-inclusive hardening head must independently reproduce **369/369 / 0 fail** with `git rev-parse HEAD` equal to the expected feature SHA before `main` is fast-forwarded.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Handling values remain replaceable scaffolding. Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are established.

## Primary current files

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/projection.ts
src/road/terrain-line.ts
src/physics/surface-map.ts
src/physics/stage-surface-map-view.ts
src/runtime/raster-stage-successor.ts
src/gameplay/course-mode.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/shared-route-choice-authority.ts
src/gameplay/route-stage-handoff.ts
src/gameplay/rival-driver.ts
src/runtime/rival-roster.ts
src/runtime/live-route-traveler.ts
src/runtime/live-route-multi-actor-tick.ts
src/runtime/live-route-runtime.ts
src/runtime/stage-runtime-content.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-38-declarative-fork-growth-plan.ts
src/dev/m6-40-rival-live-route.ts
src/dev/m6-43-course-mode.ts
src/render/m5-renderer.ts
src/main.ts
tests/m6-42-multi-actor-route-tick-arbitration.test.mjs
tests/m6-43-course-mode-rival-roster.test.mjs
tests/m6-44-open-path-core.test.mjs
```

Normative design authority is in `docs/00_core_design_freeze.md`, `docs/00a_core_design_freeze_addendum_m5_2.md` and `docs/00b_core_design_freeze_addendum_m6_44.md`.

Milestone notes run through `docs/62_m6_44_open_path_core.md`.

## Next

M6.45 should build route/topology integration on top of the new open primitive rather than adding topology back into Core. In particular, any future explicit circuit connection must remain a higher-layer authority while LINEAR and BRANCHING continue to consume ordinary open Raster/Guide geometry.