# SUPER OUTRIDE — M6.9 Validated Branch / Route Foundation

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
- **M6.9 World-space Validated Route Boundary Gates — complete**

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
166 tests
166 pass
0 fail
```

See `M6_4_VALIDATION.txt` through `M6_9_VALIDATION.txt` and docs 22–27.

GitHub Pages runs the complete regression suite before deployment. Pull requests run test/build only; pushes to `main` run test/build and then deploy. Pages uses a commit-versioned build path so a new deployment cannot mix stale and current ES modules.

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
    │               └─→ validated race progress
    │                       ├─→ timing/ranking
    │                       └─→ DEV closed-course FINISH
    │
    ├─→ world-space route boundary gates
    │       └─→ ValidatedRouteBoundary
    │               └─→ gameplay Route DAG
    │                       └─→ active stage / chosen route / terminal outcome
    │
    ├─→ camera
    ├─→ dynamic vehicle sprite adapter → existing Painter
    └─→ calibration telemetry

fixed DrivingInput trace ─→ replay same commands against physics A/B
```

Every moving vehicle remains world-physics authoritative. `GeometricCoursePosition` is geometry authority. Physical ordered race gates are checkpoint/closed-course FINISH authority. `s_progress` is continuous ranking progress bounded by those validated gates. Raw `s_car` is never direct FINISH/ranking authority.

For future OutRun-style branching, route choice has a separate authority chain:

```text
actual world-motion segment
→ legal physical branch gate crossed forward
→ ValidatedRouteBoundary
→ Route DAG transition
```

Steering input, screen X, sprite overlap and raw chainage cannot choose a route.

## Vehicle physics status

```text
DEV_UNCALIBRATED
```

Current car and motorcycle handling equations/parameters are integration scaffolding, **not product handling authority**. They may be substantially retuned or replaced later.

M6.4 ensures camera, renderer, rival presentation and rival controller consume narrow read-only world-state contracts rather than concrete `M5CarState` internals. M6.5/M6.6 provide deterministic telemetry and exact input replay for later A/B tuning.

Therefore current values such as tire stiffness, steering response, grip, drive/brake force, yaw response, drag, top speed and motorcycle bank behavior are deliberately not frozen.

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

Core Design Freeze §0.1 explicitly excludes `branch / route DAG` from renderer Core. M6.8/M6.9 therefore add branching as gameplay/race-rule architecture without turning the renderer into a road graph or general 3D scene.

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

## GroundMap completion

GroundMap base density is derived from `d0=D_cam`. The one anisotropic pyramid uses ×2 lateral and ×4 chainage footprint per level; runtime shared level authority is `Delta_s_eff` only.

M5.6 proved:

```text
k_max = 6
Delta_s_eff upper bound = 147.5 m
```

M5.7 current baked asset:

```text
course length           776.5128086698837 m
base size               960 × 16384 texels
actual q_l              0.025 m/texel
actual q_s              0.04739458060729271 m/texel
logical chunk refs      141
unique payloads         124
binary size             20,220,030 bytes
raw RGBA pyramid        71,902,320 bytes
storage ratio           28.12%
```

Runtime only chooses an already-prefiltered level and performs affine span sampling.

## M5.8 / M5.9 renderer workload evidence

Current combined content-validation budget with 25% headroom:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame 104,569
sprite output samples max / scanline  757
```

This is a renderer-work content-validation budget, not a CPU-cycle proof for a named historical machine.

## M5.9 tunnel / portal path

Current debug tunnel:

```text
player interval            s=130..180 m
camera background interval s=125..175 m
entry portal               s=130
near rib A                 s=142
near rib B                 s=168
exit portal                s=180
```

Far tunnel interior is Far Background. Portals/ribs are ordinary World Sprites with 0/1 transparency. The 12m portal reaches screen-filling size through the normal metric scaler; there is no dedicated tunnel 3D pass.

## M6.0–M6.2 validated race progress

Current closed DEV validation sequence:

```text
CP1    L/4
CP2    L/2
CP3    3L/4
FINISH 0
```

A gate is accepted only when actual world movement physically crosses it inside the lateral envelope, in the forward direction, and in the required authored order. Recovery/teleport cannot award gates.

Continuous progress obeys:

```text
validatedProgressFloor <= sProgress <= nextRequiredGateProgress
```

Timing uses fixed simulation time only. Ranking consumes `sProgress` then `validatedProgressFloor`, never raw local chainage or screen position.

## M6.3 independent moving rival

The DEV rival is a second ordinary world-space vehicle with independent world position, velocity, yaw, SurfaceMap contact, recovery, validated progress and session state.

Its AI produces only canonical `DrivingInput`; it never writes world position, yaw, velocity, `course.s/l`, camera state or renderer state. Rendering remains the existing `CourseSprite → Painter` path with discrete yaw assets.

The current rival controller is itself DEV-only and will be retuned with future physics.

**Vehicle-to-vehicle collision remains deferred until handling/body dynamics are ready.**

## M6.4 physics replaceability boundary

`src/physics/vehicle-contract.ts` exposes only the read state needed by upper layers:

```text
VehicleWorldPoseRead
VehicleCameraReadState
VehicleRenderReadState
```

A regression constructs a plain structural world-state object, with no `M5CarState`, and successfully drives camera, rival input generation, dynamic sprite adaptation and renderer. This prevents the current temporary physics implementation from becoming a presentation/gameplay dependency.

Recovery is the intentional exception because respawn mutates velocity/steering/bank state; it may be rewritten together with a future physics model.

## M6.5 deterministic physics telemetry

The observer records fixed-tick input and authoritative world/Guide state and derives planar travel, signed chainage, max speed, lateral excursion, sideslip and yaw rate. The current DEV baseline is historical evidence only; CI does **not** assert those handling numbers as correct.

## M6.6 deterministic input trace replay

Input traces use `SUPER_OUTRIDE_INPUT_TRACE_V1` with fixed `dt` and run-length encoded canonical `DrivingInput` commands. JSON round-trip preserves the exact sequence; invalid steering is rejected instead of silently clamped.

The same immutable trace can be replayed against multiple physics candidates:

```text
same trace
   ├─→ physics A → telemetry A
   └─→ physics B → telemetry B
```

CI proves same trace + same physics is deterministic while physics changes remain measurable without changing the trace.

## M6.7 point-to-point run objective

The closed stadium remains a DEV validation fixture, not a product lap-race requirement.

Run completion is a separate consumer:

```text
validated FINISH event
    ├─→ POINT_TO_POINT   → FINISHED exactly once
    └─→ REPEATABLE_DEV  → boundary recorded, continue running
```

Raw chainage, continuous progress alone, checkpoints, reverse crossings, shortcut rejection, recovery/resync and screen state cannot finish a run.

## M6.8 gameplay route DAG

M6.8 adds a gameplay-only directed acyclic route graph.

The current detached DEV topology is:

```text
                 ┌─ STAGE_2_L ─┬─ GOAL_LL
STAGE_1 ─────────┤              └─ GOAL_LR
                 └─ STAGE_2_R ─┬─ GOAL_RL
                                └─ GOAL_RR
```

Compiler validation rejects cycles, unreachable stages, broken references, self-loops and invalid terminal topology. Runtime accepts only a validated transition leaving the current active stage; stale or skip transitions are rejected.

Entering a terminal stage does **not** finish the run by topology alone. A separate validated terminal FINISH is required.

This graph is gameplay validation content only. The current visible closed course is not claimed to contain these physical branches.

## M6.9 world-space route boundary gates

M6.9 supplies the physical producer for M6.8 route events.

Every route choice owns one explicit transverse `TRANSITION` gate in world XZ. Every terminal route stage owns one explicit `FINISH` gate.

For each physics step:

```text
previous world XZ → current world XZ
        ↓
test only gates legal for active stage
        ↓
exactly one forward crossing inside gate width
        ↓
ValidatedRouteBoundary
```

Reverse crossings never validate. Crossing between branch gates selects nothing. Gates from another route stage are not candidates. If an abnormal single physics step crosses multiple legal branch gates, route selection is rejected as `AMBIGUOUS_FORWARD_CROSSING` rather than choosing arbitrarily.

The M6.9 DEV gate coordinates are detached test geometry only; they are not yet visible/drivable branches in the current renderer course.

## Primary M6 files

```text
src/gameplay/race-progress.ts
src/gameplay/race-session.ts
src/gameplay/run-objective.ts
src/gameplay/route-dag.ts
src/gameplay/route-boundary-gates.ts
src/gameplay/rival-driver.ts
src/physics/vehicle-contract.ts
src/physics/vehicle-calibration.ts
src/dev/vehicle-telemetry.ts
src/dev/driving-input-trace.ts
src/world/dynamic-vehicle-sprite.ts
tests/m6-race-progress.test.mjs
tests/m6-2-race-session.test.mjs
tests/m6-3-rival-foundation.test.mjs
tests/m6-3-rival-sim.test.mjs
tests/m6-4-physics-boundary.test.mjs
tests/m6-5-physics-telemetry.test.mjs
tests/m6-6-input-trace.test.mjs
tests/m6-7-run-objective.test.mjs
tests/m6-8-route-dag.test.mjs
tests/m6-9-route-boundary-gates.test.mjs
docs/18_m6_0_race_progress.md
docs/19_m6_1_continuous_race_progress.md
docs/20_m6_2_run_timing_ranking.md
docs/21_m6_3_rival_foundation.md
docs/22_m6_4_vehicle_physics_boundary.md
docs/23_m6_5_vehicle_physics_telemetry.md
docs/24_m6_6_driving_input_trace.md
docs/25_m6_7_run_objective.md
docs/26_m6_8_route_dag.md
docs/27_m6_9_route_boundary_gates.md
```

## Next

Decouple product point-to-point completion/timing from the closed-course `RaceProgressUpdate` type so an M6.9 validated terminal route FINISH can become product run completion directly. After that, stage-specific course content can be attached to route nodes without contaminating renderer Core.

Deep vehicle collision and final handling calibration remain intentionally deferred until the vehicle model is ready.
