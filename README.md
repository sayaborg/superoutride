# SUPER OUTRIDE — M6.21 Child Visual Identity

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
- **M6.21 Child Visual Identity — complete**

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

M6.21 adds three regressions to the previous 232-test suite. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned ESM build path so a deployment cannot mix old and new modules.

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

Current M6.13 junction-aware baked asset:

```text
course length        776.5128086698837 m
base size            960 × 16384 texels
actual q_l           0.025 m/texel
actual q_s           0.04739458060729271 m/texel
binary size          20,220,870 bytes
raw RGBA pyramid     71,902,320 bytes
```

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

## Visible fork and handoff

The visible fork is one chainage-driven lateral cross-section, not two 3D roads:

```text
single 9 m road
   ↓ widen
wide single asphalt region
   ↓ median opens
7 m left road | 8 m median | 7 m right road
```

Current DEV authority:

```text
widening start       s=390
median start         s=430
fully separated      s=530
route choice         s=545
handoff seam         s=600
child FINISH         s=700
closed raster seam   s=776.5128086698837
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

A child road can call its own center `l=0` without changing world state:

```text
parent left road  l=-7.5  → LEFT_CHILD  l=0
parent right road l=+7.5  → RIGHT_CHILD l=0
```

Route selection and package replacement are separate:

```text
visible route gate
    ↓
LEFT / RIGHT validated
    ↓
PENDING
    ↓
authored overlap
    ↓
world-space handoff seam
    ↓
atomic chart + content-reference COMMIT
```

At COMMIT only the road-coordinate expression and camera local coordinate frame are rebased. Vehicle world X/Y/Z, yaw and velocities are unchanged.

## Stage-local child runtime

A committed child is expressed as one self-contained road:

```text
OUTSIDE | 1 m SHOULDER | 7 m ASPHALT | 1 m SHOULDER | OUTSIDE
```

Child source origins are ±7.5 m. Its local physical/draw corridor is ±4.5 m, so the sibling road center is structurally outside the selected stage.

Reusable source content uses one lateral transform:

```text
source_l = local_l + sourceLateralOrigin
```

The baked GroundMap is reused rather than duplicated. Both child shoulders are stage-local authority; SurfaceMap outside the child corridor is VOID.

## Runtime content registry

M6.11's opaque package reference resolves into a complete runtime package without contaminating Route DAG with renderer/physics types:

```text
RouteStageContentManifest
       packageId only
            ↓
StageRuntimeContentRegistry
            ↓
StageRuntimeContentPackage
  ├─ Guide coordinate frame
  ├─ StageRoadView
  ├─ SurfaceMapReader
  ├─ Height / Terrain / Ground profiles
  ├─ Far Background selector
  └─ stage world sprites
```

Runtime selection authority is M6.17's `activePackageId`, not `RouteDagState.activeStageId`. Route choice can therefore be known while parent overlap content remains active, and concrete content changes only at the validated handoff seam.

Registry compilation requires:

```text
coordinateFrame.lateralOrigin
== roadView.sourceLateralOrigin
```

The live package set is:

```text
CONTENT_STAGE_1
CONTENT_GOAL_L
CONTENT_GOAL_R
```

Before the seam all player systems use parent content. After COMMIT, the selected child package simultaneously drives physics coordinate frame, SurfaceMap, camera coordinate frame, Terrain/Ground source, Far Background selector, world-sprite source and StageRoadView.

The selected terminal child has its own physical FINISH at `s=700`. FINISH validates and records the point-to-point result, but the DEV simulation, input, camera and renderer continue to run for inspection. The objective is not a simulation-pause authority.

## M6.21 child visual identity

M6.21 proves that child package replacement is visibly real without adding a branch renderer.

`CONTENT_GOAL_L` owns a coast/ocean full Far Background. `CONTENT_GOAL_R` owns a mountain/valley full Far Background. Both are ordinary opaque `FarBackground` values generated once at startup.

The data flow is only:

```text
activePackageId
   ↓
StageRuntimeContentPackage
   ↓
package.selectFarBackground(camera.s)
   ↓
existing drawFarBackground path
```

There is no LEFT/RIGHT test in renderer Core, no second road renderer, no camera-space Z, and no change to pseudo-depth, scanline Y, Painter order or sprite metric scale.

M6.21 intentionally changes only the Far Background first. Child-specific terrain/world-sprite identity can be layered through the same package ownership later without changing renderer architecture.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Car and motorcycle handling remain replaceable integration scaffolding. Grip, steering, high-speed steering, understeer/oversteer, braking, acceleration, top speed, slip/drift, inertia, car/bike differences and surface μ are not frozen product handling.

Vehicle-to-vehicle collision remains deferred until final handling/body dynamics are ready.

## Primary route/stage files

```text
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
src/dev/m6-20-live-runtime-content.ts
src/dev/m6-21-child-visual-identity.ts
src/road/stage-terrain-view.ts
src/visual/stage-ground-map-view.ts
src/physics/stage-surface-map-view.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/39_m6_21_child_visual_identity.md`.

## Next

The current child still follows the same closed DEV stadium geometry after handoff. The next major stage problem is **true child stage continuation**: the selected child must continue as a genuinely different course while preserving world-pose continuity, one-chainage-to-one-scanline raster projection, and the simple Super Scaler renderer model. Do not solve this by switching to ordinary 3D branching geometry.
