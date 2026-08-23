# SUPER OUTRIDE — M6.1 Bounded Continuous Race Progress

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
- **M6.1 Bounded Continuous Race Progress — complete**

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
123 tests
123 pass
0 fail
```

See `M6_1_VALIDATION.txt` and `docs/19_m6_1_continuous_race_progress.md`.

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
Vehicle world state
    ├─> world→Guide chart ─> s_car / GeometricCoursePosition
    ├─> ordered physical race gates ─> validated race state ─> bounded s_progress
    └─> camera ─> chainage pseudo renderer
```

`GeometricCoursePosition` is geometry authority. Physical ordered race gates are checkpoint/lap authority. `s_progress` is continuous ranking progress bounded by those validated gates. Raw `s_car` is never direct lap authority.

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

M5.6 proved the current target requires and is covered by:

```text
k_max = 6
Delta_s_eff upper bound = 147.5 m
```

M5.7 bakes the full k0..k6 GroundMap at build time. Current asset:

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

Runtime only chooses an already-prefiltered level and performs affine span sampling. No runtime anisotropic filter or 2D LOD table exists.

## M5.8 / M5.9 renderer workload evidence

Normal-content observed maxima:

```text
TerrainLine count / frame             171
TerrainLine count / screen row          9
terrain output samples / frame      54,720
terrain output samples / screen row   2,880
visible world sprites / frame           17
sprite output samples incl player   18,364 / frame
sprite output samples / scanline        268
GroundMap max level used                  6
```

Tunnel/portal stress observed maxima:

```text
TerrainLine count / frame              160
TerrainLine count / screen row           6
terrain output samples / frame       51,200
terrain output samples / row          1,920
visible world sprites / frame            13
sprite output samples incl player    83,655 / frame
sprite output samples / scanline         605
GroundMap max level used                   6
```

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

This is a renderer-work content-validation budget, not a CPU-cycle proof for a named historical machine. Runtime counters never gain permission to discard required TerrainLines merely because a budget is crossed.

## M5.9 tunnel / portal path

The current debug tunnel occupies:

```text
player interval            s=130..180 m
camera background interval s=125..175 m
```

It uses only existing Core mechanisms:

```text
far tunnel interior   -> tunnel Far Background
entry/exit portal     -> ordinary World Sprite
near structural ribs -> ordinary World Sprite
portal opening        -> 0/1 transparent aperture
```

World-sprite structures are only:

```text
s=130 entry portal
s=142 near rib A
s=168 near rib B
s=180 exit portal
```

The portal is physically 12m wide. At `d=5m`, normal metric scaling produces `480×360px`, so the portal can hide the discrete Far Background transition without any special scale or tunnel projection path. There is no dedicated tunnel 3D pass.

## M6.0 physical race authority

Current DEV race sequence:

```text
CP1    L/4
CP2    L/2
CP3    3L/4
FINISH 0
```

Each checkpoint is a physical transverse world-space gate compiled from the Guide center/tangent/right-normal at its chainage. Gate half-width reuses the existing Guide `lMax` envelope.

A checkpoint is accepted only when:

```text
actual world movement crosses gate
+ crossing is inside lateral envelope
+ crossing is forward
+ gate is the next authored checkpoint
```

Thus reverse crossing does not validate, out-of-order crossing is a shortcut violation, lap advances only after CP1→CP2→CP3→FINISH, and recovery/teleport cannot award gates.

## M6.1 bounded continuous s_progress

M6.1 separates:

```text
validatedProgressFloor = last physically accepted gate
sProgress              = continuous ranking progress
```

The legal ranking window is always:

```text
validatedProgressFloor <= sProgress <= nextRequiredGateProgress
```

Raw cyclic chainage delta may interpolate only inside this window, and only when its sign agrees with actual world motion direction. Therefore:

- ordinary forward driving produces smooth ranking progress;
- reverse driving can reduce progress only down to the last validated gate;
- a stationary world position cannot gain progress from a projection jump;
- an invalid shortcut can at most saturate at the next gate ceiling;
- crossing a checkpoint/lap boundary still requires the M6.0 physical gate.

At a valid gate crossing, only the post-intersection fraction of the current physics tick is carried into the newly opened sector, avoiding a one-tick ranking stall without weakening gate authority.

The runtime HUD exposes:

```text
RACE = continuous validated ranking progress
WIN  = current legal floor..ceiling
GEO  = raw geometric local chainage
```

## Primary M5.4–M6.1 files

```text
src/compiler/ground-map-lod.ts
src/compiler/ground-map-prefilter.ts
src/compiler/terrain-footprint-analysis.ts
src/compiler/ground-map-target-envelope.ts
src/compiler/ground-map-asset-compiler.ts
src/compiler/render-budget.ts
src/visual/baked-ground-map.ts
src/visual/m5-9-tunnel.ts
src/world/m5-9-tunnel-world.ts
src/render/rgb555.ts
src/render/sprite.ts
src/render/m5-renderer.ts
src/road/terrain-line.ts
src/gameplay/race-progress.ts
tools/build-ground-map.mjs
tests/m5-4-ground-map-lod.test.mjs
tests/m5-5-terrain-footprint.test.mjs
tests/m5-6-target-kmax.test.mjs
tests/m5-7-baked-groundmap.test.mjs
tests/m5-8-performance-budget.test.mjs
tests/m5-9-tunnel-portal.test.mjs
tests/m6-race-progress.test.mjs
docs/18_m6_0_race_progress.md
docs/19_m6_1_continuous_race_progress.md
M6_0_VALIDATION.txt
M6_1_VALIDATION.txt
```

## Next

**M6.2 — race session timing and ranking consumer layer.**

The next gameplay layer should consume `sProgress` rather than reconstructing progress from raw geometry. Lap timing must trigger from validated FINISH events. Ranking must compare validated continuous race progress and never bypass the ordered physical gate sequence.

Do not add renderer complexity to implement gameplay state.
