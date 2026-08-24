# SUPER OUTRIDE — M6.42 Multi-Actor Route Tick Arbitration

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
- **M6.42 Multi-Actor Route Tick Arbitration — complete**

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

M6.41 ended at **343 tests**. M6.42 adds ten route/browser regressions, including the 0- and 16-rival cardinality extremes, for **353 tests** total. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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
- branch / RouteDag / race-mode logic is not renderer Core.

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

M6.42 preserves the M6.38–M6.41 topology and geometry:

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

`src/runtime/live-route-traveler.ts` provides actor-independent route state:

```text
LiveRouteTravelerState
  RouteDagState
  RouteStageHandoffState
  previous world XZ
```

The player and opponents share one immutable `LiveRouteRuntimeAssembly` but own independent mutable route/handoff state.

The current single DEV rival's steering intent is RIGHT-B, but that intent cannot directly select a branch. Actual route selection remains physical gate authority.

Each opponent tick resolves its own active runtime package and uses that package's `GuideCoordinateSource`, `HeightProfile` and `SurfaceMap` for ordinary M5 vehicle physics. Course coordinates are mirrored to a new chart only after a validated COMMIT.

Dynamic opponents remain ordinary `CourseSprite`s and should be submitted to the player's Painter only when their committed `packageId` is compatible with the player's current package. Renderer Core contains no opponent-route logic.

## M6.41 optional shared route choice

M6.41 adds a race/session policy layer above independent route travelers.

```text
INDEPENDENT
FIRST_PHYSICAL_CROSSING_LOCKS
```

`INDEPENDENT` is still the current browser behavior.

`FIRST_PHYSICAL_CROSSING_LOCKS` can implement a Cool Riders-style rule where the first vehicle to physically cross one branch gate locks that branch for the field. It does not rewrite every actor's RouteDag; every vehicle still performs its own gate → PENDING → seam → COMMIT transaction.

`RouteBoundaryObservation.crossingFraction = u ∈ [0,1]` exposes the already-computed physical segment/gate intersection fraction. Smaller `u` wins when sibling gates are crossed during the same simulation tick, so the result cannot depend on JavaScript actor update order. Exact same-`u` ties can use supplied existing race order only as the final deterministic tie-break.

A deterministic one-successor stage consumes no shared lock. Authored gate geometry remains immutable; an existing lock only narrows which transition choice is considered legal by the observer.

Whether shared locking becomes the final game rule remains a product/mode decision.

## M6.42 multi-actor route tick

M6.42 makes the 60 Hz route transaction explicitly two-phase:

```text
all participating actor physics
→ observe every actor physical route-boundary motion
→ arbitrate shared/session policy once
→ apply accepted per-actor RouteDag transitions
→ queue PENDING
→ process per-actor physical handoff seams / COMMIT
→ camera / render
```

The new generic `advanceLiveRouteMultiActorTick()` accepts a variable-length actor array and owns no vehicle physics, camera, renderer or input dependency.

Observation for the whole actor set happens before any actor RouteDag is mutated. Therefore M6.41 shared arbitration can never be decided merely because player or AI code ran first in the frame.

Recovery/resync ticks can suppress route-boundary validation for one actor while still preserving handoff/chart coordinate synchronization.

### Rival/opponent cardinality

The architecture does **not** assume one rival.

```text
PLAYER + rivals[0..N]
```

The current product direction expects individual game modes to choose roughly **0 through 16 rivals**, but that cap belongs to the future game-mode / roster layer. `advanceLiveRouteMultiActorTick()` itself has no literal 16 and no fixed two-actor tuple.

M6.42 validates both extremes through the same batching path:

```text
PLAYER + 0 rivals  → 1 actor
PLAYER + 16 rivals → 17 actors
```

The browser still creates one DEV rival only. That is now explicitly a temporary fixture, not an architectural limit.

Future multiple opponents should be represented as a roster and iterated for:

```text
physics / AI
recovery
route traveler sample
per-actor session state
package-compatible dynamic CourseSprite generation
```

The renderer should receive an ordinary variable-length sprite list and remain ignorant of the configured rival count.

M6.42 also deliberately does **not** invent a route-global ranking metric for vehicles that have taken different branches. Raw stage-local chainage is not sufficient to compare them.

## Validation status

Structural exact head before documentation synchronization:

```text
e87690d2ba72ce494e9e0fa7549173681eb2f3d5
workflow 32688668066
build job 97318267946
353 tests
353 pass
0 fail
```

The first browser-wired candidate exposed two obsolete static `main.ts` assertions from M6.22/M6.40. The behavioral route/geometry tests were green. A subsequent file-update mistake temporarily replaced larger historical fixture sections; both files were restored from `main` and only their obsolete layering assertions were updated. No historical geometry, route, handoff or traveler behavioral requirement was weakened.

The documentation-inclusive exact head must independently reproduce **353/353 / 0 fail** before main fast-forward.

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
src/runtime/live-route-multi-actor-tick.ts
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
tests/m6-42-multi-actor-route-tick-arbitration.test.mjs
tests/m6-42-browser-wiring.test.mjs
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/60_m6_42_multi_actor_route_tick_arbitration.md`.

## Next

**M6.43 — Mode-Aware Opponent Roster.** Replace the temporary singular browser `rival` fixture with a deterministic variable-length opponent roster. The game-mode/roster layer owns the selected rival count and current product cap (expected 0..16); route batching, vehicle physics interfaces and renderer remain cardinality-agnostic. The current DEV mode can still instantiate one opponent until actual mode selection UI is authored.
