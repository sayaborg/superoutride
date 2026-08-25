# SUPER OUTRIDE — M6.50 Circuit Race Progress

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Race laps require validated physical gates.**

`main` is the implementation authority. Frozen renderer mathematics are defined by `docs/00_core_design_freeze.md` plus the normative metric/open-path addenda. M6.44–M6.47 made the general geometry/runtime source stack open. M6.48 added explicit upper-level CIRCUIT topology. M6.49 compiles that topology into a finite ordinary open runtime window. M6.50 adds physical CIRCUIT race progress on that same finite open ruler without adding cyclic behavior to renderer, camera or vehicle physics.

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
M6.50      Circuit Race Progress                                 complete candidate
```

The current live Pages fixture remains **BRANCHING**. M6.50 establishes CIRCUIT race authority without switching the current product fixture.

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
M6.50  420 tests expected after timing integration
```

Pull-request CI explicitly checks out the feature-head SHA, asserts that actual checkout equals that SHA, and runs the complete suite. GitHub Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

Current package:

```text
super-outride-m6-50@0.6.50
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

## M6.48 explicit CIRCUIT topology

One lap is authored as one ordinary open RasterPath whose final authored vertex explicitly returns to the first world point:

```text
P0 → P1 → ... → Pn-1 → Pn
                         Pn.world == P0.world
```

There is still no extra hidden `Pn → P0` Core segment.

`CircuitTopology` owns continuous topology chainage:

```text
s_unwrapped = winding * L + s_local
0 <= s_local < L
```

Seam turn/miter validity is not reimplemented. M6.48 unfolds copies and sends the resulting ordinary open path through `compileRasterPath()`, leaving Core as the single geometry authority.

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

Internal seam ownership:

```text
s_window = kL, 0 < k < N
→ one-lap source s = 0
```

Final finite open endpoint:

```text
s_window = NL
→ one-lap source s = L
```

A circuit height source must physically return to the same render/physics/camera height datum at `0` and `L`.

The virtual baked GroundMap repeats finite metadata rows/chunk references while reusing one-lap payload IDs and bytes.

## M6.50 shared physical race gate

The old M6.0 closed DEV race and the new finite-open race now share one physical gate primitive:

```text
PhysicalRaceGate
  index
  kind
  name
  s
  center
  tangent
  normal
  halfWidth
```

The crossing authority is actual world motion:

```text
previous world position
→ current world position
→ transverse gate-plane intersection
→ Guide-envelope width test
→ forward/reverse classification
```

Raw chainage alone cannot satisfy this physical crossing test.

Legacy `race-progress.ts` keeps its old wrapped DEV semantics but delegates gate compilation/crossing geometry to this shared primitive.

## M6.50 generic finite ordered progress

The general runtime primitive is topology-free:

```text
OrderedRaceCourseRules
  open Guide
  strictly increasing physical gates[]

OrderedRaceProgressState
  status
  nextGateIndex
  validatedProgressFloor
  sProgress
  acceptedGateCount
  acceptedFinishCount
  reverseCrossingCount
  shortcutViolationCount
```

It contains no:

```text
lapLength
wrapPositive
wrapSigned
CircuitTopology
routeKind
```

Continuous ranking progress remains bounded:

```text
validatedProgressFloor <= sProgress <= nextRequiredGate.s
```

## Repeated world geometry is not duplicate race authority

Circuit checkpoint/finish copies share world geometry:

```text
L1_CP1.center == L2_CP1.center == L3_CP1.center
```

M6.50 uses the finite previous/current `s_window` interval only to select which logical repeated gate copy is eligible for the current physics step. The interval is padded by actual planar world travel to tolerate small Guide projection lag.

Then the candidate must still pass the normal physical world-segment crossing test.

Therefore:

```text
s_window candidate selection != physical gate validation
```

## Circuit race authoring

A circuit race is authored once per lap:

```text
CircuitRaceAuthoring
  id
  lapCount
  checkpointChainages[]
```

with:

```text
0 < CP1 < CP2 < ... < L
```

At least one physical checkpoint per lap is required.

For three laps with three checkpoints:

```text
L1_CP1 → L1_CP2 → L1_CP3 → L1_FINISH
L2_CP1 → L2_CP2 → L2_CP3 → L2_FINISH
L3_CP1 → L3_CP2 → L3_CP3 → L3_FINISH
```

The circuit compiler expands that into one strictly increasing finite-open gate sequence. The generic ordered progress runtime does not need lap/modulo logic.

## N scored laps require N+1 runtime copies

Normative M6.50 rule:

> **An N-lap CIRCUIT race requires an M6.49 runtime window containing at least N+1 lap copies.**

```text
raceDistance = N * L
window.length >= (N+1) * L
raceDistance < window.length
```

This deliberately places every scored FINISH at an ordinary **internal** Guide seam:

```text
L, 2L, ... NL
```

rather than making the last FINISH coincide with the finite open endpoint.

Benefits:

- every lap uses identical physical FINISH center/tangent/normal authority;
- renderer/camera retain normal forward lookahead after the final FINISH;
- no endpoint-specific finish tangent;
- no synthetic closure;
- no special final-lap runtime path.

The extra lap is unscored runtime/runout content, not an extra race lap.

## Validated circuit lap authority

The authoritative lap count is:

```text
acceptedFinishCount
```

One lap requires:

```text
required ordered checkpoints
+ forward physical FINISH crossing inside Guide envelope
```

These do **not** award a lap:

```text
CircuitTopology winding change
raw s_window crossing kL
FINISH crossing before required checkpoints
reverse FINISH crossing
recovery/resync
teleport/raw chainage mutation
```

`startWinding` is topology identity only. A race beginning at winding 137 still starts at validated lap 0 and progress 0.

Intermediate validated FINISH gates produce a race boundary; only the final authored FINISH changes circuit race state to `FINISHED`.

## Race timing and ranking reuse

`race-session.ts` now consumes the minimum shared contract:

```text
validatedProgressFloor
acceptedGate: PhysicalRaceGate | null
```

Both legacy closed DEV progress and CIRCUIT progress can therefore use the same deterministic timing system. No circuit-only timer is introduced.

Ranking remains:

```text
primary   = sProgress
secondary = validatedProgressFloor
exact equality = true tie
```

Because CIRCUIT progress is finite/open, no modulo ranking is needed.

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

## M6.50 direct validation

Fourteen direct regressions cover:

1. finite strictly ordered N-lap physical gate expansion;
2. required unscored lookahead lap / internal final FINISH;
3. invalid checkpoint authoring rejection;
4. `startWinding` / validated-lap separation;
5. raw `s_window` movement cannot score;
6. premature physical FINISH shortcut rejection;
7. lap increments only at ordered physical FINISH;
8. repeated world-gate disambiguation without duplicate acceptance;
9. identical physical FINISH seam plane across scored laps;
10. reverse FINISH cannot award lap;
11. recovery resync cannot move validated race progress;
12. exact completion at final validated third FINISH;
13. shared physical-gate math and topology/renderer dependency isolation;
14. generic race-session timing directly consumes CIRCUIT progress.

First code-only checkpoint before timing/version/docs completion:

```text
feature head: 8ddbef9edb0b9c0f221b789db8577741cb6b6ef2
GitHub Actions: #474
run id: 32807659262
build job: 97680801851
exact checkout: 8ddbef9edb0b9c0f221b789db8577741cb6b6ef2
419 tests / 419 pass / 0 fail
```

The timing integration adds one direct regression, so the docs/version-inclusive and final validation-file-inclusive heads must independently reproduce:

```text
420 tests / 420 pass / 0 fail
```

before `main` is fast-forwarded.

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
src/gameplay/physical-race-gate.ts
src/gameplay/race-progress.ts
src/gameplay/ordered-race-progress.ts
src/gameplay/circuit-race-progress.ts
src/gameplay/race-session.ts
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
tests/m6-50-circuit-race-progress.test.mjs
tests/m6-50-circuit-race-session.test.mjs
```

Detailed M6.50 authority is recorded in `docs/68_m6_50_circuit_race_progress.md`.
