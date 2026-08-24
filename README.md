# SUPER OUTRIDE — M6.46 Branch Violation Recovery

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative M5.2 metric-sprite, M6.44 open-path and M6.45 open-source-profile addenda. M6.46 changes gameplay/session policy only; renderer Core is unchanged.

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
- M6.44 Open Path Core — complete
- M6.45 Open Source Profiles — complete
- **M6.46 Branch Violation Recovery — complete**

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

M6.43 ended at **359 tests**. M6.44 plus its post-merge hardening raised the suite to **369 tests**. M6.45 raised it to **375 tests**. M6.46 adds seven direct branch/recovery regressions for a total of **382 tests**. Pull-request CI explicitly checks out the feature head SHA, asserts that the actual checkout equals that SHA, and then runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

Current package:

```text
super-outride-m6-46@0.6.46
```

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

## Open source profile authority

M6.45 extends the same architecture from geometry into non-geometry stage sources.

General source forms are open:

```text
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Closed-course addressing is never implicit. It exists only through explicitly named adapters:

```text
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
CyclicSurfaceMap
```

The governing rule is:

> **Open is the general data model. Cyclic is a named topology adapter. The renderer is neither.**

Ordinary LINEAR and BRANCHING stages use open sources. The stage compiler deliberately extends an authored final height change-point to the real Guide endpoint when needed; that expansion belongs to compilation, not to hidden runtime wrapping or clamping.

The baked GroundMap format itself remains finite and unchanged. M6.45 changes the sampling contract, not the proven anisotropic LOD/palette asset layout. A future CIRCUIT may explicitly opt into cyclic adapters without changing the renderer or the general source interfaces.

## Topology-neutral recovery authority

M6.46 removes the remaining hidden closed-course assumption from the general recovery path.

Ordinary recovery now works in the current open stage domain:

```text
lastSafeS
→ subtract gameplay backtrack distance
→ stop at real s=0 if necessary
```

It never wraps from the start back to the path end. `recovery.ts` therefore depends on `HeightProfileReader`, not `CyclicHeightProfile`, and contains no `wrapPositive()` topology operation.

A second primitive applies the same reset semantics at one explicit supported Guide coordinate:

```text
recoverM5VehicleToGuideCoordinate(..., { s, l }, reason)
```

This primitive does not know about branches, laps, screens or AI. M6.46 branch policy merely chooses a legal target and passes it to the general recovery operation.

## Course route structures

M6.43 established three product route structures:

```text
LINEAR     long single-route point-to-point
BRANCHING  Out Run-style branching point-to-point
CIRCUIT    closed lap route
```

The first two belong naturally to open geometry and open source profiles:

```text
LINEAR     → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
BRANCHING  → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
```

`CIRCUIT` remains a separate future topology authority:

```text
CIRCUIT → CIRCUIT_LOOP / LAPS finish
```

This does not weaken the existing acyclic RouteDag and does not change RasterPath/GuidePath or general source profiles into cyclic primitives. A future circuit implementation must explicitly own endpoint connection/wrapping above Core, using named adapters where needed.

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

A legal route transition remains:

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

### M6.46 losing sibling-road policy

The physical response is now explicit:

```text
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

A forbidden sibling crossing does **not** advance RouteDag and does **not** queue a handoff.

The multi-actor route tick keeps two observations conceptually separate:

```text
physicalObservation = what authored route gate was physically crossed
legalObservation    = what current shared lock permits as route progress
```

Only `legalObservation` may reach route arbitration/RouteDag. The unrestricted physical observation exists so the game can detect a forbidden sibling crossing rather than leaving an actor stranded in an unowned road.

There are two equivalent violation cases:

```text
same deciding tick:
  sibling loses arbitration → explicit LiveRouteBranchViolation

later tick after lock already exists:
  physical sibling crossing observed
  legal observation remains narrowed to locked gate
  → explicit LiveRouteBranchViolation
```

The recovery point is not a screen-space or AI heuristic. It is derived from the already-authorized physical route gate:

```text
locked gate center
- locked gate forward tangent × recovery backtrack distance
→ map world point into current Guide frame
→ recover to that supported {s,l}
→ resync traveler observation origin
```

This keeps the rule entirely above renderer Core and makes the physical route gate the single geographic authority.

## AI after a shared lock

The M6.40 RIGHT-B route plan remains DEV AI intent only.

Before a field lock exists:

```text
AI route plan → steering target only
physical crossing → actual route authority
```

After a shared lock already exists on the actor's committed stage:

```text
shared lock choice → AI steering target
physical crossing → still actual route authority
```

Thus AI does not create or override route authority by steering intent. It merely stops fighting a route decision the race field has already made.

## Multi-actor route tick

M6.42 established one variable-length route transaction per 60 Hz physics tick:

```text
all actor physics
→ observe every actor
→ arbitrate shared/session route policy once
→ apply accepted per-actor transitions
→ PENDING
→ per-actor seam / COMMIT
→ branch-violation recovery if required
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

The current DEV mode is again:

```text
routeKind              = BRANCHING
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

The M6.45 Pages hotfix temporarily used zero rivals only while the losing-sibling physical response was undefined. M6.46 defines that response and restores the one-rival fixture without adding a renderer or route-topology special case.

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
per-actor COMMIT / branch-violation recovery
package-compatible dynamic CourseSprite generation
standings
```

The renderer only receives an ordinary variable-length sprite list.

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

## M6.44 / M6.45 / M6.46 validation targets

M6.44 dedicated regressions cover open Raster/Guide geometry, topology-neutral pseudo-depth, terrain endpoint clipping, open SurfaceMap and explicit cyclic surface selection.

M6.45 direct regressions cover open HeightProfile, VisualProfile, logical GroundMap and baked GroundMap addressing plus explicitly named cyclic adapters and compiler-owned endpoint extension.

M6.46 direct regressions cover:

1. ordinary recovery backtracks to the real open start and never wraps;
2. explicit supported Guide-coordinate recovery can represent `wrong-course`;
3. a same-tick losing sibling crossing becomes an explicit branch violation;
4. a later forbidden sibling crossing remains illegal for progress but is still physically surfaced;
5. locked-branch recovery geometry derives from the legal physical gate and lands on supported content;
6. an existing lock can replace AI plan intent without becoming route authority;
7. branch-violation recovery geometry remains gameplay-only with no physics/render/camera dependency.

The implementation-green M6.46 checkpoint `3673c0b629b7e2b437aaeca524fd69d735844423` passed exact-checkout GitHub Actions run #433 with:

```text
382 tests
382 pass
0 fail
```

The docs/version-inclusive head and then the final validation-file-inclusive M6.46 head must each independently reproduce **382/382 / 0 fail** before `main` is fast-forwarded.

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
src/visual/height-profile.ts
src/visual/visual-profile.ts
src/visual/baked-ground-map.ts
src/compiler/surface-region-compiler.ts
src/runtime/stage-authoring-compiler.ts
src/runtime/raster-stage-successor.ts
src/gameplay/course-mode.ts
src/gameplay/branch-violation.ts
src/gameplay/recovery.ts
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
tests/m6-45-open-source-profiles.test.mjs
tests/m6-46-branch-violation-recovery.test.mjs
```

Normative renderer/Core design authority remains in `docs/00_core_design_freeze.md`, `docs/00a_core_design_freeze_addendum_m5_2.md`, `docs/00b_core_design_freeze_addendum_m6_44.md` and `docs/00c_core_design_freeze_addendum_m6_45.md`.

Milestone notes run through `docs/64_m6_46_branch_violation_recovery.md`.

## Next

Further work should continue removing DEV-only cyclic assumptions from point-to-point integration where they remain, while keeping cyclic behavior an explicit upper-layer choice. A future CIRCUIT implementation must explicitly own endpoint connection, lap/unwrapped chainage and cyclic source adapters above Core. LINEAR and BRANCHING should continue to consume ordinary open Raster/Guide geometry, open stage source profiles and topology-neutral recovery.