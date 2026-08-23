# SUPER OUTRIDE — M6.11 Validated Route / Stage Foundation

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D.**

The repository `main` branch is the implementation authority. Core renderer mathematics remain defined by `docs/00_core_design_freeze.md` plus the M5.2 sprite-metric addendum.

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
- **M6.11 Route Stage Content Manifest Boundary — complete**

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
177 tests
177 pass
0 fail
```

See `M6_4_VALIDATION.txt` through `M6_11_VALIDATION.txt` and docs 22–29.

GitHub Pages runs the complete regression suite before deployment. Pull requests run test/build only; pushes to `main` run test/build and then deploy. Pages uses a commit-versioned complete ESM build path so a new deployment cannot mix stale and current modules.

## Controls

- Left / Right: analogized steering
- Up: throttle
- Down: brake
- V: Car / Motorcycle
- R: manual recovery
- touch steering is analog; touch throttle/brake are digital

## Architecture authority

```text
DrivingInput
    ↓
replaceable vehicle physics
    ↓
authoritative world state
    ├─→ world→Guide chart
    │       └─→ ordered physical race gates
    │               └─→ validated closed-course progress / DEV timing
    │
    ├─→ world-space route boundary gates
    │       └─→ ValidatedRouteBoundary
    │               └─→ Route DAG
    │                       ├─→ active stage / selected route
    │                       ├─→ terminal validated FINISH
    │                       │       └─→ generic ValidatedRunFinish
    │                       │               └─→ POINT_TO_POINT objective
    │                       └─→ stage-content manifest
    │                               └─→ exactly one opaque active package
    │
    ├─→ camera
    ├─→ dynamic vehicle sprite adapter → existing Painter
    └─→ calibration telemetry

fixed DrivingInput trace ─→ replay same commands against physics A/B
```

Every moving vehicle remains world-physics authoritative. Raw `s_car`, screen position, steering input and sprite overlap are never direct route/finish authority.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Current car and motorcycle handling equations/parameters are integration scaffolding, **not product handling authority**. They may be substantially retuned or replaced later.

M6.4 ensures upper layers consume narrow read-only world-state contracts instead of concrete `M5CarState` internals. M6.5/M6.6 provide deterministic telemetry and exact input replay for later A/B tuning. Current tire stiffness, steering response, grip, drive/brake force, yaw response, drag, top speed and motorcycle bank behavior are deliberately not frozen.

**Vehicle-to-vehicle collision remains deferred until handling/body dynamics are ready.**

## Renderer invariants

- world X/Y/Z is authoritative for physics
- one chainage maps to one horizontal scanline
- pseudo-depth is signed cyclic chainage difference only
- same `d` means same scale
- Raster Course remains straight-segment raster geometry
- Guide Curve is coordinate / camera support only
- TerrainLine and World Sprite share far-to-near Painter ordering
- no z-buffer or polygon road
- no perspective-correct texture mapping
- no arbitrary runtime sprite rotation
- camera roll remains zero
- GroundMap, GroundBase and SurfaceMap remain semantically independent
- Far Background is a full image including below-horizon pixels

Final renderer order:

```text
Optional Clear
→ Full Far Background
→ Terrain + World Sprite far→near
→ Player Sprite
→ HUD
```

Core Design Freeze §0.1 explicitly excludes `branch / route DAG` from renderer Core. M6.8+ therefore implement routing above the renderer rather than turning the renderer into a road graph or general 3D scene.

## Fixed metric authority

```text
player car physical width = 2.0 m
player car screen width = 80 px
player-depth scale = 40 px/m
f = 200 px
D_cam = 5.0 m
d_min = 2.5 m
```

Sprite scale remains physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## GroundMap / renderer workload authority

GroundMap base density is derived from `d0=D_cam`. The shared anisotropic pyramid uses ×2 lateral and ×4 chainage footprint per level; runtime level authority is `Delta_s_eff` only.

M5.6 proved:

```text
k_max = 6
Delta_s_eff upper bound = 147.5 m
```

M5.7 baked asset:

```text
course length           776.5128086698837 m
base size               960 × 16384 texels
actual q_l              0.025 m/texel
actual q_s              0.04739458060729271 m/texel
binary size             20,220,030 bytes
raw RGBA pyramid        71,902,320 bytes
storage ratio           28.12%
```

M5.8/M5.9 combined content-validation budget with 25% headroom:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame 104,569
sprite output samples max / scanline  757
```

## M5.9 tunnel / portal

Current debug tunnel remains implemented entirely through the existing paths:

```text
Far Background + ordinary World Sprites + existing Painter
```

No tunnel-specific 3D pass was introduced.

## M6.0–M6.7 closed DEV progress / physics-ready gameplay

The current closed stadium is a validation fixture, not a product lap-race requirement.

Ordered physical gates validate progress. Continuous `sProgress` remains bounded between validated gates. Timing uses fixed simulation dt. Ranking consumes validated continuous progress, not raw local chainage or screen position.

M6.7 separates point-to-point completion from repeated DEV closed-course boundaries.

M6.4–M6.6 keep vehicle handling replaceable and measurable:

```text
same deterministic DrivingInput trace
   ├─→ physics A → telemetry A
   └─→ physics B → telemetry B
```

## M6.8 route DAG

The detached DEV route topology is:

```text
                 ┌─ STAGE_2_L ─┬─ GOAL_LL
STAGE_1 ─────────┤              └─ GOAL_LR
                 └─ STAGE_2_R ─┬─ GOAL_RL
                                └─ GOAL_RR
```

The graph is gameplay-only. Compiler validation rejects cycles, unreachable stages, self-loops, broken references and invalid terminal topology.

A terminal node alone is not completion; its explicit validated physical FINISH is still required.

## M6.9 world-space route gates

Every route edge owns one explicit world-space transverse `TRANSITION` gate and every terminal owns one `FINISH` gate.

```text
previous world XZ → current world XZ
        ↓
test only gates legal for active stage
        ↓
exactly one forward crossing inside physical width
        ↓
ValidatedRouteBoundary
```

Reverse crossings never validate. Passing between branch gates selects nothing. An abnormal tick crossing multiple legal branch gates is rejected as ambiguous rather than resolved by steering, screen X or arbitrary ordering.

The current M6.9 gate coordinates are detached test geometry only. **The visible current course does not yet contain a real fork.**

## M6.10 generic routed finish

`RunObjective` now consumes a generic already-validated finish signal rather than requiring closed-course `RaceProgressUpdate` semantics.

```text
closed DEV race FINISH ─→ CLOSED_RACE ─┐
                                       ├─→ ValidatedRunFinish → RunObjective
terminal route FINISH ───→ ROUTE_DAG ──┘
```

CI proves the complete routed path:

```text
physical branch gate
→ Route DAG transition
→ terminal stage
→ matching physical terminal FINISH
→ Route DAG FINISHED
→ generic ROUTE_DAG finish
→ POINT_TO_POINT FINISHED
```

No lap counter or `RaceProgressUpdate` participates in the routed completion path.

A route finish deliberately carries no invented closed-course numeric `s_progress` value.

## M6.11 route stage content manifest

Every Route DAG node now binds to exactly one **opaque content package reference**:

```text
activeStageId
→ RouteStageContentManifest
→ packageId + worldFrameId
```

The package is intentionally opaque to gameplay. A future loader may resolve it into the complete Guide/Raster Course/GroundMap/SurfaceMap/Far Background/world-sprite package.

M6.11 does not switch real renderer assets yet. It only establishes selection authority.

All currently authored stage packages must share one explicit `worldFrameId`. Mixed frames are rejected because stage selection must not silently reinterpret or teleport world-authoritative vehicle coordinates.

A validated route transition therefore changes only the selected content reference, not vehicle pose, velocity, camera or renderer state.

## Primary M6 route files

```text
src/gameplay/run-objective.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/route-stage-content.ts
tests/m6-8-route-dag.test.mjs
tests/m6-9-route-boundary-gates.test.mjs
tests/m6-10-generic-run-finish.test.mjs
tests/m6-11-stage-content-binding.test.mjs
docs/26_m6_8_route_dag.md
docs/27_m6_9_route_boundary_gates.md
docs/28_m6_10_generic_run_finish.md
docs/29_m6_11_route_stage_content.md
```

## Next

**Do not implement a fake visible fork by making the renderer understand a DAG.**

Before real stage switching, design the branch-junction continuity rule: how outgoing stage packages overlap around a physical fork so the player can see and drive a continuous left/right junction while physics stays in one world frame and the renderer still processes one chainage-driven course at a time.

That junction/content handoff is the next architecture problem. Final vehicle handling calibration and vehicle-to-vehicle collision remain intentionally deferred.
