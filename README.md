# SUPER OUTRIDE — M6.3 Independent Moving Rival

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
- **M6.3 Independent Moving Rival Foundation — complete**

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
137 tests
137 pass
0 fail
```

See `M6_3_VALIDATION.txt` and `docs/21_m6_3_rival_foundation.md`.

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
Player world state ─┐
                    ├─> own world→Guide chart
Rival world state ──┘       └─> own validated race state
                                  └─> shared timing / ranking

Player camera ─> chainage pseudo renderer
Rival physical anchor ─> ordinary CourseSprite / Painter path
```

Every moving vehicle remains world-physics authoritative. `GeometricCoursePosition` is geometry authority. Physical ordered race gates are checkpoint/FINISH authority. `s_progress` is continuous ranking progress bounded by those validated gates. Raw `s_car` is never direct FINISH/ranking authority.

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

## M6.0 physical race authority

Current closed DEV validation sequence:

```text
CP1    L/4
CP2    L/2
CP3    3L/4
FINISH 0
```

A gate is accepted only when actual world movement physically crosses it inside the lateral envelope, in the forward direction, and in the required authored order. Recovery/teleport cannot award gates.

The closed DEV course is a test bed. Its repeated FINISH crossing must not be interpreted as a product requirement for lap-race gameplay.

## M6.1 bounded continuous s_progress

M6.1 separates:

```text
validatedProgressFloor = last physically accepted gate
sProgress              = continuous ranking progress
```

Always:

```text
validatedProgressFloor <= sProgress <= nextRequiredGateProgress
```

Raw cyclic chainage can interpolate only inside this validated window and only when its sign agrees with actual world motion. It cannot independently cross a checkpoint/FINISH boundary.

## M6.2 deterministic run timing / ranking

Timing authority is fixed simulation time:

```text
elapsedSeconds += SIM_DT
```

Browser wall-clock and animation timestamps are not gameplay timing authority. Recovery consumes time and cannot produce false gate/FINISH records.

Only accepted physical gates create timing records. The current closed DEV FINISH produces a generic **course-boundary** interval record so the same consumer can later support point-to-point/branching gameplay without embedding lap semantics.

Active ranking consumes only:

```text
sProgress
validatedProgressFloor
```

Ordering is:

```text
1. larger sProgress
2. if equal, larger validatedProgressFloor
3. exact equality = true tie
```

Raw `sLocal`, world distance, screen position, and arbitrary competitor IDs are not ranking tie-breakers.

## M6.3 independent moving rival

The DEV rival is a second ordinary `M5CarState` with independent world position, velocity, yaw, SurfaceMap contact, recovery, validated progress and session state.

Its AI produces only canonical `DrivingInput`; it never writes world position, yaw, velocity, `course.s/l`, camera state or renderer state.

Current straight target:

```text
56 m/s = 201.6 km/h
```

The 60m-radius DEV bend cannot physically sustain that speed, so the AI samples upcoming Guide curvature and produces ordinary braking input from a conservative lateral-acceleration target. This preserves the 200+ km/h straight character without bypassing world physics on tight test geometry.

Rendering remains the existing path:

```text
rival physical x/y/z + sRender
→ CourseSprite adapter
→ existing discrete car yaw asset
→ existing far→near Painter
```

There is no runtime bitmap rotation, rival-specific scale, rival pseudo-depth rule or separate 3D vehicle renderer.

Player and rival are ranked by their independent validated M6.2 progress states. The HUD now exposes `POS`, `YOU`, and `RIVAL` progress.

Current stress proof:

```text
360 fixed physics ticks
6 seconds
start s=95m
crosses into first 60m-radius bend
no recovery helper
supported on every tick
```

The first M6.3 attempt intentionally failed this stronger test because the constant high-speed AI left the supported SurfaceMap. The controller was corrected with curvature-aware braking rather than weakening the physics test.

**Vehicle-to-vehicle collision is not implemented yet.**

## Primary M6 files

```text
src/gameplay/race-progress.ts
src/gameplay/race-session.ts
src/gameplay/rival-driver.ts
src/world/dynamic-vehicle-sprite.ts
tests/m6-race-progress.test.mjs
tests/m6-2-race-session.test.mjs
tests/m6-3-rival-foundation.test.mjs
tests/m6-3-rival-sim.test.mjs
docs/18_m6_0_race_progress.md
docs/19_m6_1_continuous_race_progress.md
docs/20_m6_2_run_timing_ranking.md
docs/21_m6_3_rival_foundation.md
M6_0_VALIDATION.txt
M6_1_VALIDATION.txt
M6_2_VALIDATION.txt
M6_3_VALIDATION.txt
```

## Next

**M6.4 — minimal world-space vehicle contact/collision foundation.**

Any collision implementation must use physical world-space vehicle footprints/velocities, never sprite pixels, screen overlap or pseudo-depth. It should modify only physical vehicle state and then let the existing camera, race-progress and Painter systems observe the result.
