# SUPER OUTRIDE — M6.41 Shared Route Choice Authority

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
- **M6.41 Shared Route Choice Authority — complete**

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

M6.40 ended at **335 tests**. M6.41 adds eight shared-route authority regressions for **343 tests** total. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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
- branch / RouteDag logic is not renderer Core.

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

M6.41 preserves the M6.38–M6.40 topology and geometry:

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

Route selection comes only from a validated world-space physical gate crossing. Steering direction, screen X and sprite overlap cannot select a branch. The grass median owns no gate and selects nothing.

A transition remains deferred:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ old chart/content remain active
→ forward physical seam crossing
→ COMMIT target chart/content
```

World X/Y/Z, yaw and velocities are not transformed by COMMIT. Entering a terminal stage is not FINISH; a forward crossing of that terminal's physical FINISH gate is still required.

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

M6.39 extended the rival steering API from bare `GuideCurve` to `GuideCoordinateSource`, so lookahead also preserves these stage-local coordinates.

## M6.39 deep browser-order proof

M6.39 validates opposite complete outcomes:

```text
LEFT-A  → GOAL_LA
RIGHT-B → GOAL_RB
```

Each path performs four real physical gate → PENDING → seam → COMMIT transactions through ordinary M5 physics, followed by physical terminal FINISH and thirty continued physics/camera/render frames.

For every tested COMMIT, world x/y/z, yaw and velocity state are exact-preserved. The integration also exposed and fixed the old rival lookahead loss of `lateralOrigin`.

## M6.40 independent live-route rival

The browser rival no longer remains in the parent course domain.

`src/runtime/live-route-traveler.ts` provides actor-independent route state:

```text
LiveRouteTravelerState
  RouteDagState
  RouteStageHandoffState
  previous world XZ
```

The player and rival share one immutable `LiveRouteRuntimeAssembly` but own independent mutable route/handoff state.

The rival's current DEV steering intent is RIGHT-B, but that intent cannot directly select a branch. Actual route selection remains physical gate authority.

Each rival tick resolves its own active runtime package and uses that package's `GuideCoordinateSource`, `HeightProfile` and `SurfaceMap` for ordinary M5 car physics. `rival.course` is mirrored to a new chart only after a validated COMMIT.

The rival remains an ordinary dynamic `CourseSprite` and is submitted to the player's Painter only when player/rival `packageId` matches. Renderer Core contains no rival-route logic.

## M6.41 optional shared route choice

M6.41 adds a race/session policy layer above the independent M6.40 travelers.

Two policies exist:

```text
INDEPENDENT
FIRST_PHYSICAL_CROSSING_LOCKS
```

`INDEPENDENT` is the current browser behavior and preserves M6.40 exactly.

`FIRST_PHYSICAL_CROSSING_LOCKS` supports a Cool Riders-style rule:

> At a real branching stage, the first vehicle to physically cross one branch gate locks that branch for the race field. Trailing vehicles must then use the same branch.

This does **not** rewrite every actor's RouteDag state. Each vehicle still physically performs its own gate → PENDING → seam → COMMIT transaction.

The shared race/session layer constrains only which authored transition choice is legal.

### Physical first-crossing authority

`RouteBoundaryObservation` now exposes the already-computed world-segment/gate intersection fraction:

```text
crossingFraction = u ∈ [0,1]
```

When two vehicles cross sibling gates in the same 60 Hz tick, smaller `u` wins. Therefore the result cannot depend on player-vs-rival JavaScript update order.

Only an exact same-`u` tie uses supplied existing race order as the final deterministic tie-break. This allows a mathematically simultaneous crossing to follow the current leader without introducing an actor-ID rule.

If several vehicles cross the same winning gate during that tick, all of those crossings are accepted; only the sibling choice is rejected.

### Locks exist only for true forks

A stage with one outgoing continuation never consumes shared-choice state. For example:

```text
STAGE_2_R → STAGE_3_R
```

remains an ordinary deterministic per-actor transition.

### Authored geometry stays immutable

After a fork has been locked, the compiled gate set is not mutated. `observeRouteBoundaryCrossing()` may receive the one allowed transition choice and narrows its physical candidates before intersection testing.

The sibling road remains normal visible/physical terrain; it simply has no legal route transition for that race session.

This also prevents a large motion segment from becoming spuriously ambiguous by intersecting both the chosen and now-forbidden sibling gate.

### Browser status

M6.41 intentionally does **not** enable shared locking in `main.ts` yet:

```text
player route traveler: INDEPENDENT
rival route traveler:  INDEPENDENT
```

The capability is implemented and validated, but whether this becomes the final game rule remains a product decision.

## Validation status

Structural M6.41 head before documentation synchronization:

```text
ab53555f389e7f5456b935abfff10b1f28cdb105
workflow 32672424569
build job 97275141305
343 tests
343 pass
0 fail
```

The first M6.41 candidate reached 342/343. The only failure was an over-broad static regression regex matching the ordinary English word `input` in a comment. The test was corrected to inspect actual import specifiers. No gameplay rule, dependency boundary or implementation behavior was weakened.

The documentation-inclusive exact head must independently reproduce **343/343 / 0 fail** before main fast-forward.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Handling values remain replaceable scaffolding. Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are established.

## Primary route/runtime files

```text
src/core/guide-coordinate-frame.ts
src/gameplay/rival-driver.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/shared-route-choice-authority.ts
src/gameplay/route-stage-handoff.ts
src/runtime/live-route-runtime.ts
src/runtime/live-route-traveler.ts
src/runtime/stage-runtime-content.ts
src/runtime/declarative-live-route.ts
src/runtime/declarative-route-fragment.ts
src/runtime/raster-stage-successor.ts
src/runtime/raster-fork-stage-route.ts
src/runtime/raster-fork-growth-plan.ts
src/dev/m6-27-live-route-runtime.ts
src/dev/m6-38-declarative-fork-growth-plan.ts
src/dev/m6-40-rival-live-route.ts
src/render/m5-renderer.ts
src/main.ts
tests/m6-39-deep-browser-order-integration.test.mjs
tests/m6-40-rival-live-route-traversal.test.mjs
tests/m6-41-shared-route-choice-authority.test.mjs
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/59_m6_41_shared_route_choice_authority.md`.

## Next

**M6.42 — Multi-Actor Route Tick Arbitration.** Restructure the browser route portion of one 60 Hz tick into `physics → collect actor route observations → arbitrate session policy once → apply accepted actor transitions → process handoff seams → camera/render`. The browser can remain in `INDEPENDENT` mode while this two-phase order is proven, so the possible shared-route rule is supported without prematurely making it mandatory.
