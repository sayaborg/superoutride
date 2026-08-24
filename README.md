# SUPER OUTRIDE — M6.49 Circuit Runtime Window Integration

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative metric/open-path addenda. M6.44–M6.47 made the general geometry and runtime source stack open. M6.48 added explicit upper-level CIRCUIT topology. M6.49 compiles that topology into a finite ordinary open runtime window so the existing Guide, source readers, TerrainLine generator and renderer remain topology-blind.

## Current milestone state

```text
M0–M5    browser / geometry / visual / driving foundations       complete
M6.0–43  race progress / route / runtime / rival foundations     complete
M6.44     Open Path Core                                         complete
M6.45     Open Source Profiles                                   complete
M6.46     Branch Violation Recovery                              complete
M6.47     Open Parent Stage Integration                          complete
M6.48     Explicit Circuit Topology Foundation                   complete
M6.49     Circuit Runtime Window Integration                     complete candidate
```

The current live Pages fixture remains **BRANCHING**. M6.49 establishes CIRCUIT runtime infrastructure without changing the current product fixture.

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
M6.49  406 tests
```

Pull-request CI explicitly checks out the feature-head SHA, asserts that actual checkout equals that SHA, and runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

Current package:

```text
super-outride-m6-49@0.6.49
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
- GroundMap visual data and SurfaceMap physical data remain independent;
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
```

Sprite scale remains physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale`. A future FOV change must move `D_cam` so the 40 px/m player-depth reference remains fixed.

## Open geometry and source authority

The canonical general domain is open:

```text
0 <= s <= L
P0 → P1 → ... → Pn
```

Core never manufactures `Pn → P0`.

General source forms are also open:

```text
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Explicit `Cyclic*` adapters remain available only where an upper-level topology deliberately selects them.

Governing rule:

> **Open is the general data model. Cyclic is an explicit topology adapter. The renderer is neither.**

## Product route structures

```text
LINEAR     long single-route point-to-point
BRANCHING  Out Run-style branching point-to-point
CIRCUIT    closed lap route
```

Their authorities remain distinct:

```text
LINEAR     → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
BRANCHING  → POINT_TO_POINT_GRAPH / POINT_TO_POINT finish
CIRCUIT    → CIRCUIT_LOOP / LAPS finish
```

The acyclic RouteDag remains the correct structure for point-to-point routes. CIRCUIT does not weaken it or turn it into a hidden lap graph.

## M6.48 explicit CIRCUIT topology

One lap is authored as one ordinary open RasterPath whose final authored vertex explicitly returns to the first world point:

```text
P0 → P1 → ... → Pn-1 → Pn
                         Pn.world == P0.world
```

There is still no extra hidden `Pn → P0` Core segment.

`CircuitTopology` identifies the two authored endpoints as one topology seam and owns continuous topology chainage:

```text
s_unwrapped = winding * L + s_local
0 <= s_local < L
```

Seam turn/miter validity is not reimplemented. M6.48 unfolds two copies and sends the resulting ordinary open path through `compileRasterPath()`, leaving Core as the single geometry authority.

`winding` is coordinate state only. It is not race-lap authority.

## M6.49 finite circuit runtime window

M6.49 resolves CIRCUIT topology once before ordinary runtime consumers:

```text
CircuitTopology
+ one-lap open Height / Visual / Surface / Ground sources
+ startWinding
+ repeatCount
        │
        ▼
compileCircuitRuntimeWindow(...)
        │
        ├─ open RasterPath
        ├─ open GuidePath
        ├─ finite HeightProfileReader
        ├─ finite VisualProfileReader
        ├─ finite SurfaceMapReader
        └─ finite virtual BakedGroundMapReader
        │
        ▼
existing camera / physics / TerrainLine / renderer
```

For `N` lap copies of length `L`:

```text
0 <= s_window <= N*L
s_unwrapped_start = startWinding * L
s_unwrapped = s_unwrapped_start + s_window
```

No lower consumer performs modulo addressing.

### Deterministic seam ownership

Internal finite-window seam:

```text
s_window = kL, 0 < k < N
→ one-lap source s = 0
```

Final finite open endpoint:

```text
s_window = NL
→ one-lap source s = L
```

Thus internal seams are ordinary continuation points while the finite runtime window still has a real inspectable endpoint.

### Height continuity

A circuit source must return to the same physical height datum:

```text
Y_render(0) == Y_render(L)
Y_phys(0)   == Y_phys(L)
Y_camera(0) == Y_camera(L)
```

Invalid authoring is rejected rather than corrected ad hoc.

### Virtual baked GroundMap

Existing stage validation requires truthful `BakedGroundMapReader.metadata`. M6.49 does not add an exception.

Instead the circuit GroundMap window is a virtual finite baked asset:

```text
window chainage rows = source rows * repeatCount
chunk rowStart       = source rowStart + lap * sourceRows
payloadId            = unchanged
```

The window therefore has truthful finite course metadata while reusing the one-lap payload bytes. Runtime texture data is not duplicated merely because the coordinate window contains repeated laps.

### Terrain reader boundary

`TerrainVisualProfile` now requires only:

```text
HeightProfileReader
VisualProfileReader
```

not concrete `CyclicHeightProfile / CyclicVisualProfile` types. This completes the open-reader boundary needed for ordinary TerrainLine generation to cross a circuit seam.

## Race lap remains separate

Topological/runtime-window seam passage does not validate a race lap.

```text
cross topology seam
→ winding / source-address state may change

complete required checkpoints + validated physical FINISH
→ race lap may change
```

Teleport, reverse crossing, recovery or coordinate conversion cannot manufacture validated race progress.

## Current live branching route

The current Pages/DEV route remains:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

A legal transition remains:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ old chart/content remain active
→ forward physical seam crossing
→ COMMIT target chart/content
```

World X/Y/Z, yaw and velocity do not change through COMMIT. Entering a terminal stage is not FINISH; the physical FINISH gate must still be crossed forward.

For BRANCHING, the first vehicle to physically cross one sibling branch gate locks that branch for the field. A losing sibling crossing produces no illegal route progress and recovers toward the locked legal branch.

## Multi-actor / rival authority

The engine path supports:

```text
PLAYER + 0..16 rivals
```

Current DEV fixture:

```text
routeKind               = BRANCHING
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

The renderer receives only a variable-length sprite list and owns no rival-count or route policy.

## M6.49 direct validation

Ten direct regressions cover:

1. finite circuit Raster/Guide unfolding;
2. forward visibility through an internal circuit seam;
3. bounded explicit window/unwrapped conversion;
4. internal seam `s=0` versus final endpoint `s=L` ownership;
5. finite Height/Visual reader semantics;
6. rejection of mismatched seam height;
7. finite SurfaceMap source repetition;
8. virtual baked GroundMap metadata row repetition with shared payload identity;
9. ordinary TerrainLine generation across a circuit seam;
10. topology-neutral TerrainVisualProfile and renderer/RouteDag isolation.

Code-green checkpoint:

```text
feature head: e41bee83c8d3925d5646787b17b2d98c3ea09023
GitHub Actions: #466
run id: 32788978408
build job: 97626621991
exact checkout: e41bee83c8d3925d5646787b17b2d98c3ea09023
406 tests / 406 pass / 0 fail
```

Docs/version-inclusive and final validation-file-inclusive heads must independently reproduce **406/406 / 0 fail** before `main` is fast-forwarded.

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
src/visual/height-profile.ts
src/visual/visual-profile.ts
src/visual/baked-ground-map.ts
src/gameplay/course-mode.ts
src/gameplay/circuit-topology.ts
src/runtime/circuit-runtime-window.ts
src/gameplay/branch-violation.ts
src/gameplay/route-dag.ts
src/runtime/stage-runtime-content.ts
src/render/m5-renderer.ts
src/main.ts
tests/m6-44-open-path-core.test.mjs
tests/m6-45-open-source-profiles.test.mjs
tests/m6-46-branch-violation-recovery.test.mjs
tests/m6-47-open-runtime-integration.test.mjs
tests/m6-48-explicit-circuit-topology.test.mjs
tests/m6-49-circuit-runtime-window.test.mjs
```

Detailed M6.49 authority is recorded in `docs/67_m6_49_circuit_runtime_window.md`.
