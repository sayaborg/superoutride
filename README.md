# SUPER OUTRIDE — M6.48 Explicit Circuit Topology Foundation

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative M5.2 metric-sprite, M6.44 open-path and M6.45 open-source-profile addenda. M6.46 defined branch-violation recovery, M6.47 completed open-source integration in the live BRANCHING parent stage, and M6.48 introduces an explicit upper-level CIRCUIT topology without making Core cyclic.

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
- M6.46 Branch Violation Recovery — complete
- M6.47 Open Parent Stage Integration — complete
- **M6.48 Explicit Circuit Topology Foundation — complete candidate**

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

Regression history:

```text
M6.43  359 tests
M6.44  369 tests after post-merge hardening
M6.45  375 tests
M6.46  382 tests
M6.47  389 tests
M6.48  396 tests
```

Pull-request CI explicitly checks out the feature-head SHA, asserts that actual checkout equals that SHA, and runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

Current package:

```text
super-outride-m6-48@0.6.48
```

## Frozen renderer authority

The implementation preserves all of the following:

- world X/Y/Z is authoritative for physics;
- vehicle motion is not snapped to the road centerline;
- one chainage maps to one horizontal scanline;
- pseudo-depth is exactly `s_render - s_camera`;
- renderer depth contains no course-length modulo or topology decision;
- camera-space Z is not introduced;
- Euclidean distance is not renderer depth;
- lateral position does not modify depth;
- same `d` means same scale;
- same `d` + same height means same screen Y;
- road remains Raster Segment geometry;
- absolute turn at one interior Raster vertex remains at most 10°;
- Guide is coordinate / camera support only;
- TerrainLine and World Sprite share one far-to-near Painter;
- no z-buffer or polygon road;
- no perspective-correct texture mapping;
- no arbitrary runtime sprite rotation;
- transparency is 0/1; no alpha blending;
- camera roll remains zero;
- GroundMap `(s,l)` visual data and SurfaceMap `(s,l)` physics data remain independent;
- GroundBase TRANSPARENT and SurfaceMap VOID remain independent;
- Far Background is one full image including below-horizon pixels;
- route topology, branch policy, rival count and circuit winding are not renderer Core.

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

There is no arbitrary `visualScale`. A future FOV change must move `D_cam` so the 40 px/m player-depth reference remains fixed.

## Open path geometry authority

M6.44 makes the canonical Raster/Guide primitive open:

```text
0 <= s <= L
v0 → v1 → ... → vN
```

Core does not manufacture `vN → v0`.

Therefore:

- RasterPath has no implicit closing segment;
- first/last Raster vertices have no synthetic closing turn or miter;
- GuidePath has no endpoint wrap fillet;
- Raster/Guide sampling never modulo-wraps out-of-range chainage;
- local world-to-Guide search clips at real endpoints;
- TerrainLine visibility clips at the actual path end;
- camera chainage uses `s_vehicle - D_cam` without wrapping;
- world-sprite and terrain depth both use direct `s_render - s_camera`.

LINEAR and BRANCHING authoring provide ordinary run-in/runout so the renderer needs no endpoint special case.

## Open source profile authority

M6.45 applies the same rule to non-geometry sources.

General forms are open:

```text
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Closed addressing is available only through explicitly named adapters:

```text
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
CyclicSurfaceMap
```

Governing rule:

> **Open is the general data model. Cyclic is an explicit topology adapter. The renderer is neither.**

M6.47 applies this consistently to the live BRANCHING parent-stage stack, including the M5.9 tunnel interval and reader contracts.

## M6.48 explicit CIRCUIT topology

M6.48 adds `src/gameplay/circuit-topology.ts` above Core.

A circuit lap is authored as one ordinary open RasterPath whose last authored vertex explicitly returns to the first world point:

```text
P0 → P1 → ... → Pn-1 → Pn
                         where Pn.world == P0.world
```

This is intentionally different from hidden closure.

Core sees only the authored segments:

```text
P0 → P1
P1 → P2
...
Pn-1 → Pn
```

Core still does **not** create another `Pn → P0` segment.

The upper-level `CircuitTopology` merely declares that the two authored endpoint coordinates identify the same topology seam.

### Seam geometry has no second rule set

M6.48 does not reproduce the Raster 10° turn rule or miter mathematics in a circuit-specific compiler.

Instead the topology compiler builds a two-copy proof path:

```text
lap 0
→ seam
→ lap 1
```

and sends it back through ordinary:

```ts
compileRasterPath(...)
```

The former endpoint becomes a normal interior Raster vertex in that finite unfolded path. Therefore existing Core alone validates:

- seam turn ≤ 10°;
- interior miter validity;
- segment non-degeneracy;
- ordinary open-path geometry invariants.

There is no duplicated circuit geometry authority.

### Finite unfolding

`unfoldCircuitRasterPath(topology, repeatCount)` materializes any finite number of lap copies as one ordinary open RasterPath:

```text
lap 0 → lap 1 → lap 2 → ...
0 --------------------------> increasing open chainage
```

The renderer can therefore consume a circuit-derived window using exactly the same open-path machinery as any other course. It never needs to know that the geometry originated from a circuit.

### Explicit topology chainage

M6.48 introduces explicit topology-owned helpers:

```text
decomposeCircuitChainage
wrapCircuitChainage
liftCircuitLocalChainageNear
```

The coordinate model is:

```text
s_unwrapped = winding * L + s_local
0 <= s_local < L
```

`winding` is only a topological coordinate count. It is **not** race-lap authority.

This separation is mandatory:

```text
cross topology seam
→ coordinate winding may change

complete required checkpoints + validated physical FINISH
→ race lap may change
```

A teleport, reverse crossing or shortcut can never gain a race lap merely because a chainage helper changes winding.

### Endpoint metadata authority

Because the first and final lap vertices identify one seam point, seam endpoint authoring metadata must agree. M6.48 currently enforces exact agreement for `sourceRadius`; conflicting endpoint definitions are rejected rather than silently choosing one.

## Course route structures

M6.43 established three product structures:

```text
LINEAR     long single-route point-to-point
BRANCHING  Out Run-style branching point-to-point
CIRCUIT    closed lap route
```

Their topology authorities remain distinct:

```text
LINEAR     → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
BRANCHING  → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
CIRCUIT    → CIRCUIT_LOOP / LAPS finish
```

The acyclic RouteDag remains the correct structure for point-to-point routes. M6.48 does not weaken it or force a loop into it.

## Current live branching route

The current Pages/DEV course mode remains `BRANCHING`:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

Every visible fork is one chainage-driven lateral cross-section, never two independently projected depth roads.

A legal transition remains:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ old chart/content remain active
→ forward physical seam crossing
→ COMMIT target chart/content
```

World X/Y/Z, yaw and velocity do not change through COMMIT. Entering a terminal stage is not FINISH; the terminal physical FINISH gate must still be crossed forward.

## Branching field authority

For BRANCHING:

> **At each real fork, the first vehicle to physically cross one sibling branch gate locks that branch for the race field.**

```text
all vehicle physics
→ observe all physical gate crossings
→ arbitrate once using physical sub-tick crossingFraction u
→ earliest crossing selects branch
→ store field lock
→ accepted actors perform their own PENDING / seam / COMMIT
```

A losing sibling crossing produces no illegal route progress and recovers toward the already-locked legal branch. Steering direction, AI intent, screen X, sprite overlap and JavaScript update order never select the route.

## Multi-actor / rival authority

The engine path supports:

```text
PLAYER + 0..16 rivals
```

Current DEV mode:

```text
routeKind               = BRANCHING
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

The renderer receives only a normal variable-length sprite list and owns no rival-count or route policy.

## M6.48 direct validation targets

Seven direct regressions cover:

1. a circuit seam exists only when the open lap explicitly repeats its first world vertex at the end;
2. an ordinary open path is rejected rather than implicitly closed;
3. conflicting seam endpoint `sourceRadius` metadata is rejected;
4. finite unfolding produces one ordinary open RasterPath with normal interior seam turns;
5. positive and negative unwrapped chainage decompose into canonical local chainage plus winding;
6. local source chainage lifts continuously through the seam without giving modulo authority to Core;
7. circuit topology remains outside renderer, projection and RouteDag authority and delegates geometry proof to `compileRasterPath()`.

Code-green checkpoint:

```text
feature head: d320e8635cd2e5a42000ff785f2be837b5eb7f9a
GitHub Actions: #453
build job: 97620478759
exact checkout: d320e8635cd2e5a42000ff785f2be837b5eb7f9a
396 tests / 396 pass / 0 fail
```

The docs/version-inclusive head and final validation-file-inclusive head must each independently reproduce **396/396 / 0 fail** before `main` is fast-forwarded.

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
src/physics/car-physics.ts
src/physics/motorcycle-physics.ts
src/visual/height-profile.ts
src/visual/visual-profile.ts
src/visual/baked-ground-map.ts
src/gameplay/course-mode.ts
src/gameplay/circuit-topology.ts
src/gameplay/branch-violation.ts
src/gameplay/recovery.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/shared-route-choice-authority.ts
src/gameplay/route-stage-handoff.ts
src/runtime/raster-stage-successor.ts
src/runtime/rival-roster.ts
src/runtime/live-route-multi-actor-tick.ts
src/runtime/stage-runtime-content.ts
src/render/m5-renderer.ts
src/main.ts
tests/m6-44-open-path-core.test.mjs
tests/m6-45-open-source-profiles.test.mjs
tests/m6-46-branch-violation-recovery.test.mjs
tests/m6-47-open-parent-stage-integration.test.mjs
tests/m6-48-explicit-circuit-topology.test.mjs
```

Normative renderer/Core design authority remains in:

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

M6.48 does not modify those frozen renderer rules; it implements the upper-level circuit direction already required by M6.44/M6.45.

Milestone notes run through `docs/66_m6_48_explicit_circuit_topology.md`.

## Next

M6.48 establishes circuit geometry identity and continuous topology chainage without integrating a live circuit into the renderer.

The next clean step is **M6.49 Circuit Guide / Source Window Integration**:

```text
CircuitTopology
→ finite unfolded Raster window
→ ordinary Guide compilation across the interior lap seam
→ explicit mapping of one-lap Height / Visual / Ground / Surface sources
→ finite topology-neutral runtime package
```

That step must preserve the same rule: topology transforms coordinates and selects adapters **before** ordinary Core/source consumers run. RasterPath, GuidePath, pseudo-depth, Painter order, general source profiles and the point-to-point RouteDag remain topology-neutral.