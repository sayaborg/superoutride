# SUPER OUTRIDE — M6.23 Child Environment Content

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
- **M6.23 Child Environment Content — complete**

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

M6.23 adds six regressions to the M6.22 241-test suite, for a target of **247 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

## Controls

- Left / Right: analogized steering
- Up: throttle
- Down: brake
- V: Car / Motorcycle
- R: manual recovery
- touch steering: analog
- touch throttle / brake: digital

## Frozen renderer authority

The implementation must preserve all of the following:

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
- one-vertex turn remains at most 10°
- Guide Curve is coordinate / camera support only
- TerrainLine and World Sprite share one far-to-near Painter
- no z-buffer or polygon road
- no perspective-correct texture mapping
- no arbitrary runtime sprite rotation
- alpha blending is not part of the renderer; transparency is 0/1
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

There is no arbitrary `visualScale` multiplier. Future field-of-view changes must preserve the metric authority by adjusting camera distance, not sprite scale.

## GroundMap / workload authority

GroundMap base density is derived from `d0=D_cam`. The shared anisotropic pyramid grows ×2 laterally and ×4 in chainage per level; runtime LOD authority remains `Delta_s_eff` only.

```text
k_max = 6
Delta_s_eff absolute upper bound = 147.5 m
```

The M6.13 parent junction baked asset remains the parent-stage authority:

```text
course length        776.5128086698837 m
base size            960 × 16384 texels
actual q_l           0.025 m/texel
actual q_s           0.04739458060729271 m/texel
binary size          20,220,870 bytes
raw RGBA pyramid     71,902,320 bytes
```

M6.22+ child DEV stages use independent procedural GroundMap source data because their chainage domains differ from the parent course. The renderer sampling path remains the same.

## Route architecture

The older M6.8 two-level DAG remains a detached compiler/stress fixture. The browser live route is deliberately product-shaped and point-to-point:

```text
           ┌─ GOAL_L
STAGE_1 ───┤
           └─ GOAL_R
```

A terminal stage alone is not a finish. Completion requires an explicit validated physical FINISH gate.

Route choice authority is physical world motion:

```text
previous world XZ → current world XZ
        ↓
legal world-space route gates for active stage
        ↓
exactly one forward crossing inside gate width
        ↓
ValidatedRouteBoundary
        ↓
Route DAG transition
```

Steering, screen X, raw chainage and sprite overlap cannot choose a route.

## Visible fork and deferred handoff

The visible fork is still one chainage-driven lateral cross-section, not two simultaneously rendered 3D roads:

```text
single 9 m road
   ↓ widen
wide single asphalt region
   ↓ median opens
7 m left road | 8 m median | 7 m right road
```

Parent DEV authoring:

```text
widening start       s=390
median start         s=430
fully separated      s=530
route choice         s≈545
handoff seam         s=600
```

At full separation:

```text
left shoulder  -12..-11
left road      -11..-4
median          -4..+4
right road      +4..+11
right shoulder +11..+12
```

Fixed-l raster strips meet at offset-line miter intersections; with a maximum 10° vertex turn, the maximum miter factor is `1/cos(5°) ≈ 1.00382`.

Route selection and concrete runtime replacement remain separate:

```text
visible route gate
    ↓
LEFT / RIGHT validated
    ↓
PENDING
    ↓
shared world-space overlap
    ↓
world-space handoff seam
    ↓
atomic chart + content-reference COMMIT
```

At COMMIT, only the road-coordinate expression and camera local coordinate frame are rebased. Vehicle world X/Y/Z, yaw and velocities are unchanged.

## M6.22 independent child continuation

M6.18 established a child-local single-road **view** over parent-authored source data. M6.22 advances the live browser runtime beyond that historical fixture: a committed child owns an **independent Raster Course + Guide Curve**.

The child course begins before the parent handoff seam and copies an exact parent Raster prefix through more than `D_cam` beyond the seam.

Current DEV values:

```text
parent source start   s≈588.2564043349416
parent handoff seam   s=600
child-local handoff   s≈11.7435956650584
child-local FINISH    s=250
```

Therefore the camera's 5m-behind geometry is identical on both coordinate charts at COMMIT. Once the shared prefix ends, LEFT and RIGHT continue along different Raster/Guide geometry and have different course lengths.

The selected child remains one self-contained road:

```text
OUTSIDE | 1 m SHOULDER | 7 m ASPHALT | 1 m SHOULDER | OUTSIDE
```

Child-local road center is `l=0`; source lateral origins remain:

```text
LEFT  -7.5 m
RIGHT +7.5 m
```

## GroundMap rebase continuity

A coordinate handoff must not make road markings jump. Child visual addressing therefore carries both lateral and longitudinal source transforms:

```text
source_l = child_local_l + sourceLateralOrigin
source_s = child_local_s + chainageOffsetS
```

For the M6.22 overlap, `chainageOffsetS` equals the parent source-start chainage, so at the handoff seam:

```text
child_local_s + chainageOffsetS = parent_s
```

This preserves white-line dash, asphalt and checker phase across the rebase. The offset is visual-source addressing only; it does not change pseudo-depth or physics chainage.

## M6.23 package-owned environment content

M6.23 fills the independent M6.22 child stages with ordinary package-owned content while leaving renderer Core unchanged.

The handoff neighborhood stays on a common height datum:

```text
child s = 0..60m
height = 0m
```

Since the handoff occurs near child `s≈11.74m` and `D_cam=5m`, height/terrain identity begins well after the camera continuity neighborhood.

LEFT keeps the M6.21 coast/ocean Far Background and adds low coastal relief plus ordinary child-domain sprites:

```text
COAST_SIGN_1
COAST_GUARD_1
COAST_GUARD_2
COAST_BUILDING
COAST_GUARD_3
```

RIGHT keeps the M6.21 mountain/valley Far Background and adds stronger mountain relief plus:

```text
MOUNTAIN_TREE_1..5
MOUNTAIN_SIGN
MOUNTAIN_BUILDING
```

Each sprite is compiled against its selected child Guide and HeightProfile. Parent CourseSprites are still not copied or reinterpreted because their `sRender` belongs to the parent chainage domain.

The active child package now owns, as one atomic content unit:

```text
Guide / coordinate frame
StageRoadView
SurfaceMap
HeightProfile
TerrainProfile
GroundMapProfile
Far Background selector
child-domain World Sprites
```

The browser entry established in M6.22 remains as a compatibility facade and delegates concrete child package composition to the M6.23 composer. Route/handoff wiring is not duplicated.

## Physical FINISH and diagnostics

M6.20's legacy parent fixture placed child FINISH around parent `s=700`. M6.22+ no longer uses that as the live child finish. Each terminal FINISH is authored directly on the selected child Guide at **child-local `s=250`**, where LEFT and RIGHT occupy distinct world positions.

A forward crossing yields:

```text
child physical FINISH
→ RouteDag FINISHED
→ ValidatedRunFinish
→ POINT_TO_POINT_OBJECTIVE FINISHED
```

FINISH records the result but does **not** pause DEV simulation. Physics, input, camera and rendering continue for inspection.

The old parent closed-race progress/ranking remains a DEV diagnostic only. Player updates to that diagnostic stop once the child package is active, so child-local chainage is never misread as parent lap progress. Rival physics continues on the parent DEV Guide, but its parent-domain sprite is not reinterpreted after child COMMIT.

Each child Raster substrate is currently internally cyclic because the existing Core compiler is cyclic. Product completion does not use that closure seam; the point-to-point objective is already complete at the child physical FINISH.

## Renderer separation

The data flow is still:

```text
activePackageId
   ↓
StageRuntimeContentPackage
   ↓
active Guide + package-owned content sources
   ↓
existing renderM5Driving()
```

Renderer Core contains no M6.22/M6.23 LEFT/RIGHT/route decision. Child pseudo-depth wraps with the active camera's child `courseLength`, not the parent stadium length. M6.23 world sprites use the same ordinary CourseSprite visibility and shared far→near Painter path as all prior sprites.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Car and motorcycle handling remain replaceable integration scaffolding. Grip, steering, high-speed steering, understeer/oversteer, braking, acceleration, top speed, slip/drift, inertia, car/bike differences and surface μ are not frozen product handling.

Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are ready.

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
src/gameplay/run-objective.ts
src/runtime/stage-runtime-content.ts
src/dev/m6-20-live-point-to-point.ts
src/dev/m6-21-child-visual-identity.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-22-live-runtime-content.ts
src/dev/m6-23-child-environment-content.ts
src/dev/m6-23-live-runtime-content.ts
src/road/stage-terrain-view.ts
src/visual/ground-map.ts
src/visual/stage-ground-map-view.ts
src/physics/stage-surface-map-view.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/41_m6_23_child_environment_content.md`.

## Next

M6.23 proves that independent child stages can own geometry, physics surface, GroundMap addressing, Far Background, height/terrain and World Sprites without changing renderer architecture.

The next structural step should be **reusable stage authoring/compiler support**: replace the current DEV-specific child construction with a compact data-driven stage definition that compiles the same runtime package contracts. After that, terminal child stages can be generalized into child-to-next-stage continuation for a longer point-to-point route.
