# SUPER OUTRIDE — M6.18 Stage-local Road View

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by the Super Scaler era.

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
- **M6.18 Stage-local Single-road View — complete**

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

Current verified result:

```text
218 tests
218 pass
0 fail
```

GitHub Pages runs the complete suite before a `main` deployment. Pages uses a commit-versioned complete ESM build path so a deployment cannot mix old and new modules.

## Controls

- Left / Right: analogized steering
- Up: throttle
- Down: brake
- V: Car / Motorcycle
- R: manual recovery
- touch steering: analog
- touch throttle / brake: digital

## Frozen renderer authority

- world X/Y/Z is authoritative for physics
- one chainage maps to one horizontal scanline
- pseudo-depth is signed cyclic chainage difference only
- same `d` means same scale
- Raster Course remains straight-segment raster geometry
- Guide Curve is coordinate / camera support only
- TerrainLine and World Sprite share one far-to-near Painter
- no z-buffer or polygon road
- no perspective-correct texture mapping
- no arbitrary runtime sprite rotation
- camera roll remains zero
- GroundMap, GroundBase and SurfaceMap remain semantically independent
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
player car screen width   = 80 px
player-depth scale        = 40 px/m
f                         = 200 px
D_cam                     = 5.0 m
d_min                     = 2.5 m
```

Sprite scale remains physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## GroundMap / workload authority

GroundMap base density is derived from `d0=D_cam`. The shared anisotropic pyramid grows ×2 laterally and ×4 in chainage per level; runtime LOD authority remains `Delta_s_eff` only.

```text
k_max = 6
Delta_s_eff absolute upper bound = 147.5 m
```

Current baked asset:

```text
course length        776.5128086698837 m
base size            960 × 16384 texels
actual q_l           0.025 m/texel
actual q_s           0.04739458060729271 m/texel
binary size          20,220,870 bytes
raw RGBA pyramid     71,902,320 bytes
```

M5.8/M5.9 content-validation budget keeps explicit terrain/sprite workload bounds. M6 work does not replace the Painter or create a second depth road path.

## Route / stage architecture

The gameplay-only route DAG is:

```text
                 ┌─ STAGE_2_L ─┬─ GOAL_LL
STAGE_1 ─────────┤              └─ GOAL_LR
                 └─ STAGE_2_R ─┬─ GOAL_RL
                                └─ GOAL_RR
```

A terminal node alone is not a finish. Completion still requires its explicit validated physical FINISH.

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

## M6.12–M6.15 visible branch

The visible fork is authored as one chainage-driven lateral cross-section, not two 3D roads.

```text
single 9 m road
   ↓ widen
wide single asphalt region
   ↓ median opens
7 m left road | 8 m median | 7 m right road
```

M6.14 makes fixed-l raster strips meet at exact offset-line miter intersections, removing corner seams without adding runtime curves or a tuning knob.

M6.15 places the actual route gates on the two visible separated asphalt roads. Crossing the median chooses nothing.

## M6.16–M6.17 chart and handoff

A child road can call its own center `l=0` without changing world state:

```text
parent left road  l=-7.5  → LEFT_CHILD  l=0
parent right road l=+7.5  → RIGHT_CHILD l=0
```

World position, yaw and velocity remain untouched.

Route selection and package replacement are intentionally separated:

```text
visible route gate
    ↓
LEFT / RIGHT validated
    ↓
PENDING
    ↓
authored overlap / occlusion interval
    ↓
world-space handoff seam
    ↓
atomic chart + content-reference commit
```

This prevents an immediate visual cut at the choice point.

## M6.18 stage-local single-road view

A committed child can now be expressed as one self-contained road:

```text
OUTSIDE | 1 m SHOULDER | 7 m ASPHALT | 1 m SHOULDER | OUTSIDE
```

Child source origins are ±7.5 m. Its local drawable/physical corridor is ±4.5 m, so the sibling road center is 15 m away and structurally outside the selected stage.

Reusable source content uses exactly one transform:

```text
source_l = local_l + sourceLateralOrigin
```

The existing baked GroundMap is reused rather than duplicated. Both child shoulders are stage-local authority so the former median-facing edge becomes a normal shoulder after handoff. SurfaceMap outside the child corridor is VOID.

The renderer may receive an optional `StageRoadView`. It re-expresses only the TerrainLine horizontal strip before the unchanged Painter. It does **not** alter:

```text
s
d
y scanline
render height
Delta_s_eff
Painter order
sprite depth
player scale
```

Only horizontal endpoints / local lateral samples change; `Delta_l` is recomputed from the new span.

The current closed stadium deliberately reuses the same fork on a later DEV lap to exercise a second DAG choice. M6.18 therefore does not add a lap-specific hack that permanently applies the child view to that repeated fixture. A true child runtime package/continuation is the next step.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Car and motorcycle handling remain replaceable integration scaffolding. M6.4–M6.6 preserve narrow read-only world contracts, deterministic telemetry and exact DrivingInput replay for later A/B tuning.

Vehicle-to-vehicle collision remains deferred until handling/body dynamics are ready.

## Primary route/stage files

```text
src/course/junction-cross-section.ts
src/course/stage-road-view.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-content.ts
src/gameplay/route-stage-handoff.ts
src/road/stage-terrain-view.ts
src/visual/stage-ground-map-view.ts
src/physics/stage-surface-map-view.ts
src/render/m5-renderer.ts
```

Design notes are `docs/26_m6_8_route_dag.md` through `docs/36_m6_18_stage_local_road_view.md`.

## Next

Build the **stage runtime content package** that binds a committed Route DAG stage to its Guide/chart, StageRoadView, visual source, SurfaceMap view and stage world-sprite set. Then author a genuine child continuation / next junction so the M6.17 handoff can drive the live renderer and physics without relying on the closed DEV course repeating the same parent fork.
