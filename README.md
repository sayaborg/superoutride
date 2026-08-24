# SUPER OUTRIDE — M6.43 Course Mode / Rival Roster Foundation

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
- M6.39 Deep Route Browser-Order Integration — complete
- M6.40 Rival Live Route Traversal — complete
- M6.41 Shared Route Choice Authority — complete
- M6.42 Multi-Actor Route Tick Arbitration — complete
- **M6.43 Course Mode / Rival Roster Foundation — complete**

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

M6.42 ended at **353 tests**. M6.43 adds six course-mode / roster regressions for **359 tests** total. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

## Frozen renderer authority

The implementation preserves all of the following:

- world X/Y/Z is authoritative for physics;
- vehicle motion is not snapped to the road centerline;
- one chainage maps to one horizontal scanline;
- pseudo-depth is signed cyclic chainage difference only;
- camera-space Z is not introduced;
- Euclidean distance is not used as renderer depth;
- lateral position does not modify depth;
- same `d` means same scale;
- same `d` + same height means same screen Y;
- road remains Raster Segment geometry;
- absolute turn at one Raster vertex remains at most 10°;
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
- branch / RouteDag / course-mode / rival-count logic is not renderer Core.

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

## Course route structures

M6.43 makes three future product route structures explicit:

```text
LINEAR     long single-route point-to-point
BRANCHING  Out Run-style branching point-to-point
CIRCUIT    closed lap route
```

The first two currently belong to the point-to-point graph authority family:

```text
LINEAR     → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
BRANCHING  → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
```

`CIRCUIT` is deliberately reserved as a separate future authority:

```text
CIRCUIT → CIRCUIT_LOOP / LAPS finish
```

This is an architectural boundary, not a circuit implementation yet. The existing `RouteDag` remains acyclic. Circuit support must not be obtained by weakening the DAG into a cyclic graph merely to represent laps.

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

For a `BRANCHING` course, the product rule is now fixed:

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

### Losing sibling-road behavior is intentionally undecided

The route decision is fixed, but the physical response when a trailing vehicle attempts the forbidden sibling road is not.

M6.43 records:

```text
branchViolationPolicy = UNDECIDED
```

Possible later rules include an invisible/physical barrier or `WRONG COURSE` followed by forced recovery. No such behavior is implemented yet. The losing sibling road therefore remains normal authored terrain/visual content; branch locking only controls legal route progression.

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

It already validates both:

```text
PLAYER + 0 rivals  → 1 actor
PLAYER + 16 rivals → 17 actors
```

The engine-level route transaction therefore contains no one-rival assumption and no literal product cap.

## Mode-owned rival count

M6.43 moves opponent cardinality into `CourseModeAuthoring`.

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

so the visible fixture remains familiar while the architecture is no longer singular.

## Rival roster

`src/runtime/rival-roster.ts` compiles a stable variable-length roster:

```text
0 rivals  → []
3 rivals  → RIVAL_01, RIVAL_02, RIVAL_03
16 rivals → RIVAL_01 ... RIVAL_16
```

There is no `null rival` special case.

`main.ts` now builds `rivals[]` and iterates every opponent through ordinary:

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

Zero rivals means those loops are empty. Sixteen rivals means the same loops have sixteen entries. The renderer only receives an ordinary variable-length sprite list.

The current M6.40 RIGHT-B route plan is still a DEV AI intent. Under the new BRANCHING field rule it does not possess route authority: whichever physical vehicle first crosses a sibling branch gate determines the shared legal branch.

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

The renderer remains downstream of the selected runtime package and knows no route identity.

## Stage-local coordinate authority

A stage package owns a `GuideCoordinateFrame`. Its local `l=0` can correspond to a non-zero lateral origin in source Guide geometry.

Raster-attached content performs the single source conversion:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

World physics remains authoritative. A chart handoff only re-expresses the same world pose in another local road coordinate system.

## Validation status

M6.43 dedicated regressions cover:

1. `LINEAR / BRANCHING / CIRCUIT` as distinct route structures;
2. BRANCHING first-physical-crossing field locking plus `UNDECIDED` wrong-branch response;
3. integer rival cardinality across the full 0..16 product envelope;
4. stable variable-length roster identity with no null-rival special case;
5. browser consumption of a one-rival roster and mode-derived shared locking;
6. preservation of the acyclic RouteDag and renderer dependency boundary.

The first M6.43 CI candidates each reached **358/359**. Both failures were static regression wording problems, not implementation failures: first a dependency regex matched documentation comments, then `/cycle/` failed to match the existing word `acyclic`. The regressions were corrected to inspect import specifiers and the actual `assertAcyclicAndReachable()` guard. No implementation requirement or dependency boundary was weakened.

The documentation-inclusive exact head must independently reproduce **359/359 / 0 fail** before main fast-forward.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Handling values remain replaceable scaffolding. Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are established.

## Primary current files

```text
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
tests/m6-42-browser-wiring.test.mjs
tests/m6-43-course-mode-rival-roster.test.mjs
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/61_m6_43_course_mode_rival_roster.md`.

## Next

A useful next milestone is to separate the current shared DEV AI route plan from per-rival roster authoring and add deterministic **spawn / AI profile / intended route plan per roster entry**, while keeping field branch authority independent from AI intent. Circuit runtime construction remains a later milestone and should enter through its reserved `CIRCUIT_LOOP` authority rather than by changing RouteDag semantics.
