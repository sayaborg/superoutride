# SUPER OUTRIDE — M6.51 Circuit Live Runtime Integration

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Open is the general runtime model.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative metric/open-path addenda. Detailed milestone decisions live in `docs/` rather than being duplicated here.

## Current milestone state

```text
M0–M5     browser / geometry / visual / driving foundations      complete
M6.0–43   race progress / route / runtime / rival foundations    complete
M6.44      Open Path Core                                        complete
M6.45      Open Source Profiles                                  complete
M6.46      Branch Violation Recovery                             complete
M6.47      Open Parent Stage Integration                         complete
M6.48      Explicit Circuit Topology Foundation                  complete
M6.49      Circuit Runtime Window Integration                    complete
M6.50      Circuit Race Progress                                 complete
M6.51      Circuit Live Runtime Integration                      complete candidate
```

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open the existing BRANCHING live fixture:

```text
http://localhost:8000/
```

Open the M6.51 three-lap CIRCUIT live fixture:

```text
http://localhost:8000/?mode=circuit
```

The query parameter selects only the top-level browser composition. Lower engine layers do not receive a `routeKind` flag.

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
M6.50  420 tests
M6.51  428 tests at code-green checkpoint
```

Pull-request CI explicitly checks out the feature-head SHA, asserts that actual checkout equals that SHA, and runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

Current package:

```text
super-outride-m6-51@0.6.51
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
- route topology, branch policy, rival count, circuit winding and race-lap state are not renderer Core.

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
CIRCUIT    → CIRCUIT_LOOP / physical ordered LAPS finish
```

The acyclic RouteDag remains the correct structure for point-to-point routes. CIRCUIT does not weaken it or turn it into a hidden lap graph.

## BRANCHING live authority

The default Pages fixture remains the current branching route:

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

The engine path supports:

```text
PLAYER + 0..16 rivals
```

Current BRANCHING DEV fixture:

```text
routeKind               = BRANCHING
rivalCount              = 1
sharedRouteChoiceMode   = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy   = RECOVER_TO_LOCKED_BRANCH
```

## CIRCUIT architecture

### M6.48 — explicit topology

One lap is authored as one ordinary open RasterPath whose final authored vertex explicitly returns to the first world point:

```text
P0 → P1 → ... → Pn-1 → Pn
                         Pn.world == P0.world
```

There is still no hidden `Pn → P0` Core segment.

`CircuitTopology` owns:

```text
s_unwrapped = winding * L + s_local
0 <= s_local < L
```

`winding` is topology coordinate state only. It is not race-lap authority.

### M6.49 — finite open runtime window

CIRCUIT topology is unfolded before ordinary runtime consumers:

```text
CircuitTopology
+ one-lap open sources
+ startWinding
+ repeatCount
        │
        ▼
finite ordinary open Raster / Guide / source window
        │
        ▼
existing camera / physics / TerrainLine / renderer
```

For `N` copies:

```text
0 <= s_window <= N*L
s_unwrapped = startWinding*L + s_window
```

Lower consumers perform no modulo addressing.

### M6.50 — physical lap authority

Circuit race authoring expands into one strictly increasing finite sequence:

```text
L1_CP1 → ... → L1_FINISH
L2_CP1 → ... → L2_FINISH
...
```

A lap is awarded only by:

```text
required ordered physical checkpoints
+ forward physical FINISH crossing
```

These are not lap authority:

```text
winding change
raw s_window crossing kL
premature FINISH
reverse FINISH
recovery/resync
raw chainage mutation
```

The validated lap count is `acceptedFinishCount`.

Normative runout rule:

```text
N scored laps → at least N+1 finite runtime copies
```

Therefore every scored FINISH, including the final one, remains an ordinary internal Guide seam with normal forward lookahead.

### M6.51 — live integration without a new tracker

M6.51's main architectural result is that no new live circuit-position subsystem is necessary.

The M6.49 window is already one ordinary open Guide. Existing car/bike physics already maintains:

```text
course.s
course.l
course.segmentIndex
```

and uses a local Guide search around the previous segment. Repeated lap copies are adjacent segments in the finite unfolded Guide, so the ordinary open search naturally advances through an internal circuit seam:

```text
... L-epsilon → L → L+epsilon ...
```

Thus:

```text
vehicle.course.s == s_window
```

for live CIRCUIT driving.

There is no:

```text
circuit chainage tracker
physics modulo
physics winding counter
seam snap
renderer circuit branch
camera circuit branch
```

The same finite ruler is passed directly to:

```text
updateM5Car / updateM5Bike
updateM5Camera
renderM5Driving
```

Physical M6.50 checkpoints/FINISH consume `vehicle.course.s` only as bounded finite `s_window` candidate/disambiguation data. Actual world-segment gate crossing remains mandatory.

## M6.51 browser composition

M6.51 keeps route-shape selection at the composition root:

```text
src/main.ts          BRANCHING
src/main-circuit.ts  CIRCUIT
```

Pages/local boot:

```text
/               → BRANCHING
/?mode=circuit  → CIRCUIT
```

The CIRCUIT DEV fixture is:

```text
routeKind     = CIRCUIT
rivalCount    = 0
lapCount      = 3
checkpoints   = 1/4 L, 1/2 L, 3/4 L
runtime copies= 4
```

The fourth copy is unscored runout/lookahead. Race completion records the final physical boundary time but does not freeze world simulation.

## M6.51 direct validation

Eight direct regressions cover:

1. `lapCount + 1` runtime-copy derivation;
2. CIRCUIT mode owns no branch policy/shared lock;
3. explicit duplicated lap endpoint unfolds into an ordinary open runtime;
4. real 60 Hz M5 car physics crosses an internal circuit seam and continues onto `s > L`;
5. unchanged M5 camera follows the second unfolded copy after that real seam crossing;
6. unchanged M5 renderer draws normally after that real seam crossing;
7. generic live compiler owns no browser/renderer/vehicle/RouteDag dependency;
8. CIRCUIT browser composition reuses existing open engine paths and imports no point-to-point route authority.

Code-green checkpoint before package/docs synchronization:

```text
feature head: 71f75b271a8be30d352557ffad59560f95899049
GitHub Actions: #486
exact checkout: 71f75b271a8be30d352557ffad59560f95899049
428 tests / 428 pass / 0 fail
```

Package/docs-inclusive and validation-file-inclusive heads must independently reproduce the complete 428/428 suite before `main` is fast-forwarded.

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
src/runtime/circuit-live-runtime.ts
src/gameplay/physical-race-gate.ts
src/gameplay/ordered-race-progress.ts
src/gameplay/circuit-race-progress.ts
src/gameplay/race-session.ts
src/gameplay/branch-violation.ts
src/gameplay/route-dag.ts
src/render/m5-renderer.ts
src/main.ts
src/main-circuit.ts
tests/m6-48-explicit-circuit-topology.test.mjs
tests/m6-49-circuit-runtime-window.test.mjs
tests/m6-50-circuit-race-progress.test.mjs
tests/m6-50-circuit-race-session.test.mjs
tests/m6-51-circuit-live-runtime.test.mjs
```

Detailed milestone authority:

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
```
