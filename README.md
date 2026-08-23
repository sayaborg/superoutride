# SUPER OUTRIDE — M5.9 Tunnel / Portal Stress + Render Budget

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
- **M5.9 Tunnel / Portal Stress Content — complete**

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
106 tests
106 pass
0 fail
```

See `M5_9_VALIDATION.txt` and `docs/17_m5_9_tunnel_portal.md`.

GitHub Pages runs the complete regression suite before deployment. Pull requests run test/build only; pushes to `main` run test/build and then deploy.

## Controls

- Left / Right: analogized steering
- Up: throttle
- Down: brake
- V: Car / Motorcycle
- R: manual recovery
- touch steering is analog; touch throttle/brake are digital

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

## M5.8 normal-content workload baseline

The renderer reports exact workload counters without changing any draw or cull decision.

The normal/debug stress sweep measured:

```text
TerrainLine count / frame             171
TerrainLine count / screen row          9
terrain output samples / frame      54,720
terrain output samples / screen row   2,880
visible world sprites / frame           17
sprite output samples incl player   18,364 / frame
sprite output samples / scanline        268
sprite written pixels incl player   12,938 / frame
sprite written pixels / scanline        268
GroundMap max level used                  6
```

The historical M5.8 provisional 25% budget is retained in code so the stronger tunnel stress can be demonstrated rather than hidden by pre-tuning.

## M5.9 tunnel / portal path

The current debug tunnel occupies:

```text
player interval            s=130..180 m
camera background interval s=125..175 m
```

It uses only existing Core mechanisms:

```text
far tunnel interior -> tunnel Far Background
entry/exit portal   -> ordinary World Sprite
near structural ribs -> ordinary World Sprite
portal opening      -> 0/1 transparent aperture
```

World-sprite structures are only:

```text
s=130 entry portal
s=142 near rib A
s=168 near rib B
s=180 exit portal
```

The portal is physically 12m wide. At `d=5m`, normal metric scaling produces `480×360px`, so the portal can hide the discrete Far Background transition without any special scale or tunnel projection path.

There is no dedicated tunnel 3D pass.

## M5.9 required tunnel stress

The close portal/interior sweep measured:

```text
frames                                  51
TerrainLine count / frame              160
TerrainLine count / screen row           6
terrain output samples / frame       51,200
terrain output samples / row          1,920
visible world sprites / frame            13
sprite output samples incl player    83,655 / frame
sprite output samples / scanline         605
sprite written pixels incl player    33,017 / frame
sprite written pixels / scanline         275
GroundMap max level used                   6
```

This intentionally exceeded only the old M5.8 sprite-sample limits:

```text
83,655 > 22,955 samples/frame
605    > 335    samples/scanline
```

Terrain maxima remained lower than the existing normal-content maxima, so no renderer architecture change was needed.

## Current combined content-validation budget

M5.8 normal content and M5.9 tunnel stress are combined as an envelope by taking each metric's maximum; the maxima are not falsely treated as one observed frame.

Combined evidence:

```text
frames represented                    121
TerrainLine count / frame             171
TerrainLine count / screen row          9
terrain output samples / frame      54,720
terrain output samples / screen row   2,880
visible world sprites / frame           17
sprite output samples / frame        83,655
sprite output samples / scanline        605
sprite written pixels / frame        33,017
sprite written pixels / scanline        275
GroundMap max level used                  6
```

Using the same explicit 25% headroom:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame 104,569
sprite output samples max / scanline  757
```

This is a renderer-work **content-validation budget**, not a CPU-cycle proof for a named historical machine. Runtime counters never gain permission to discard required TerrainLines merely because a budget is crossed.

## Primary M5.4–M5.9 files

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
tools/build-ground-map.mjs
tests/m5-4-ground-map-lod.test.mjs
tests/m5-5-terrain-footprint.test.mjs
tests/m5-6-target-kmax.test.mjs
tests/m5-7-baked-groundmap.test.mjs
tests/m5-8-performance-budget.test.mjs
tests/m5-9-tunnel-portal.test.mjs
docs/12_m5_4_ground_map_lod_foundation.md
docs/13_m5_5_terrain_footprint.md
docs/14_m5_6_target_kmax.md
docs/15_m5_7_baked_groundmap.md
docs/16_m5_8_performance_budget.md
docs/17_m5_9_tunnel_portal.md
M5_4_VALIDATION.txt
M5_5_VALIDATION.txt
M5_6_VALIDATION.txt
M5_7_VALIDATION.txt
M5_8_VALIDATION.txt
M5_9_VALIDATION.txt
```

## Next

The renderer/compiler M5.x block now includes the required tunnel/portal special case and measured workload envelope. The next main block is **M6 gameplay**.

The first gameplay foundation should keep Core separation between geometric position and validated race progress:

```text
s_car        = geometric chainage from world→course chart
s_progress   = gameplay-validated race progress
```

M6 starts with checkpoint sequence, lap validation, reverse/shortcut handling and race progress state. Raw `s_car` must not directly become ranking/lap authority.

Do not add renderer complexity to implement gameplay state.
