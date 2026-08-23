# SUPER OUTRIDE — M6.24 Reusable Stage Authoring / Compiler

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
- **M6.24 Reusable Stage Authoring / Compiler — complete**

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

M6.24 adds five regressions to the M6.23 247-test suite, for a target of **252 tests**. GitHub Pages runs the complete suite before any `main` deployment. Pages uses a commit-versioned complete ESM path so a deployment cannot mix modules from different commits.

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

## Live route / fork

The browser route remains deliberately point-to-point:

```text
           ┌─ GOAL_L
STAGE_1 ───┤
           └─ GOAL_R
```

The visible fork is one chainage-driven lateral cross-section, not two simultaneously rendered 3D roads:

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

Route choice remains physical world motion through authored gates. Steering, screen X, raw chainage and sprite overlap cannot choose a route.

## Deferred handoff

Route selection and runtime replacement remain separate:

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

Current child geometry:

```text
parent source start   s≈588.2564043349416
parent handoff seam   s=600
child-local handoff   s≈11.7435956650584
child-local FINISH    s=250
```

Each selected child is one self-contained road:

```text
OUTSIDE | 1 m SHOULDER | 7 m ASPHALT | 1 m SHOULDER | OUTSIDE
```

## M6.23 package-owned environment

LEFT owns coast/ocean background, low coastal relief and coast sprites. RIGHT owns mountain/valley background, stronger mountain relief and mountain sprites.

Both keep child `s=0..60m` at height zero, preserving the handoff camera neighborhood.

The active child package owns:

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

## M6.24 reusable stage authoring compiler

M6.24 removes child-specific package construction boilerplate.

A stage environment is now authored declaratively in its own local chart:

```text
heightNodes
visualSections
sprites { s, local l, asset }
Far Background
optional terrain envelope overrides
```

The authoring definition contains no parent/source lateral origin. The reusable compiler derives the active Guide length and performs the one necessary raster-source conversion for sprites:

```text
l_source = l_local + coordinateFrame.lateralOrigin
```

It then compiles the ordinary `HeightProfile`, `TerrainProfile`, world-space `CourseSprite`s and complete `StageRuntimeContentPackage`.

The compiler has no RouteDag selection logic and no renderer special cases. The runtime path remains:

```text
activePackageId
→ StageRuntimeContentPackage
→ existing physics / camera / renderM5Driving
```

The browser entry established in M6.22 remains as a compatibility facade and now delegates to M6.24, so `main.ts` does not accumulate milestone-specific content wiring.

## Physical FINISH and diagnostics

Each terminal FINISH is authored directly on the selected child Guide at child-local `s=250`.

```text
child physical FINISH
→ RouteDag FINISHED
→ ValidatedRunFinish
→ POINT_TO_POINT_OBJECTIVE FINISHED
```

FINISH records the result but does **not** pause DEV simulation. Physics, input, camera and rendering continue for inspection.

Vehicle physics remains:

```text
DEV_UNCALIBRATED
```

Handling parameters are not frozen product values. Vehicle-to-vehicle collision remains deferred.

## Primary route/stage files

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/guide-coordinate-frame.ts
src/course/stage-road-view.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-content.ts
src/gameplay/route-stage-handoff.ts
src/runtime/stage-runtime-content.ts
src/runtime/stage-authoring-compiler.ts
src/dev/m6-20-live-point-to-point.ts
src/dev/m6-21-child-visual-identity.ts
src/dev/m6-22-child-stage-continuation.ts
src/dev/m6-22-live-runtime-content.ts
src/dev/m6-23-child-environment-content.ts
src/dev/m6-24-stage-authoring.ts
src/dev/m6-24-live-runtime-content.ts
src/render/m5-renderer.ts
src/main.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/42_m6_24_reusable_stage_authoring_compiler.md`.

## Next

M6.24 establishes the reusable authoring boundary needed for longer routes. The next structural step is to use the same package/compiler model for **child → next stage continuation**, proving a multi-stage point-to-point run without adding 3D branching geometry or renderer route logic.
