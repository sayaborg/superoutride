# SUPER OUTRIDE — M5.8 Render Performance Budget

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
- **M5.8 Render Performance Budget Instrumentation — complete**

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

`npm run build` compiles TypeScript and bakes the M5 GroundMap asset into `dist/assets/`.

Full regression:

```bash
npm test
```

Current verified result:

```text
99 tests
99 pass
0 fail
```

See `M5_8_VALIDATION.txt` and `docs/16_m5_8_performance_budget.md`.

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

## Surface Region authority

One authoring source compiles independently to:

```text
Surface Region
   ├─ GroundMap logical profile
   ├─ GroundBase visual profile
   └─ SurfaceMap physical profile
```

For example, a cliff can simultaneously mean:

```text
GroundMap left = ROCK
GroundBase left = TRANSPARENT
SurfaceMap far-left = VOID
```

## GroundMap density, footprint and baked runtime

M5.4 density authority:

```text
q_l = 0.025 m/texel
q_s = 0.051106653147800385 m/texel
```

One anisotropic pyramid:

```text
q_l(k) = q_l × 2^k
q_s(k) = q_s × 4^k
```

Shared level authority is chainage footprint only:

```text
k_s = max(ceil(log4(Delta_s_eff / q_s)), 0)
k   = clamp(k_s, 0, k_max)
```

Lateral `k_l` remains diagnostic only.

Every TerrainLine carries `Delta_s`, `Delta_s_collapse`, `Delta_s_eff`, `Delta_l`, and a collapsed flag. Core §64 thin-span collapse is explicit in screen space:

```text
epsilon_span = 1 destination row
Delta_y = |bY| |1/d0 - 1/d1|
Delta_y < 1 → one-row collapse
```

M5.6 proved for the current target:

```text
Delta_s_eff <= d_max - d_min = 147.5 m
level 5 capacity = 52.3332 m
level 6 capacity = 209.3329 m
k_max = 6
```

The measured Road Generator maximum was `141.01635292107866m`, so k6 is both necessary and sufficient.

M5.7 moves GroundMap filtering to build time:

```text
Surface Region logical GroundMap
→ cyclic dense level 0
→ compiler 2×4 anisotropic prefilter
→ levels k0..k6
→ bounded row chunks
→ duplicate payload sharing
→ binary asset
```

Current bake:

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

Storage is level-0 palette8 and levels 1–6 RGB555. Runtime chooses one already-prefiltered level per TerrainLine and performs only affine span sampling; there is no runtime anisotropic filter.

## M5.8 render workload telemetry

The renderer now reports exact content/compiler workload counters without changing any draw or cull decision:

```text
TerrainLine count / frame
TerrainLine count / screen row
terrain output samples / frame
terrain output samples / screen row
visible world sprites / frame
sprite output samples / frame
sprite output samples / scanline
sprite written pixels / frame
sprite written pixels / scanline
GroundMap level histogram
```

Player Sprite workload is included in the sprite sample/pixel totals because it uses the same scaler/blitter resource. `visibleSpriteCount` remains the world-sprite count.

Current 70-frame debug stress sweep measured:

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

GroundMap TerrainLine counts across the sweep:

```text
k0 3437
k1 3436
k2 1755
k3  979
k4  546
k5  173
k6   18
```

## Provisional current-debug-content budget

M5.8 uses one explicit mechanical margin:

```text
headroom = 1.25
budget   = ceil(observed maximum × 1.25)
```

Current provisional budget:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame  22,955
sprite output samples max / scanline  335
```

This is **not yet the final target-hardware budget** because the Core tunnel/portal close-up stress case is not present yet. Budget counters are compiler/content validation telemetry only. Runtime must never drop required TerrainLines merely because a counter crosses a budget.

## Primary M5.4–M5.8 files

```text
src/compiler/ground-map-lod.ts
src/compiler/ground-map-prefilter.ts
src/compiler/terrain-footprint-analysis.ts
src/compiler/ground-map-target-envelope.ts
src/compiler/ground-map-asset-compiler.ts
src/compiler/render-budget.ts
src/visual/baked-ground-map.ts
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
docs/12_m5_4_ground_map_lod_foundation.md
docs/13_m5_5_terrain_footprint.md
docs/14_m5_6_target_kmax.md
docs/15_m5_7_baked_groundmap.md
docs/16_m5_8_performance_budget.md
M5_4_VALIDATION.txt
M5_5_VALIDATION.txt
M5_6_VALIDATION.txt
M5_7_VALIDATION.txt
M5_8_VALIDATION.txt
```

## Next

The next block is **M5.9 tunnel / portal stress content**:

1. implement tunnel/portal presentation using the existing Core path only
2. use 0/1 transparent aperture + near sprite structure + Far Background transition rather than a dedicated 3D tunnel pass
3. ensure far tunnel interior/background work does not consume unnecessary sprite budget
4. make close portal/interior the required sprite stress case
5. rerun M5.8 workload telemetry and decide whether the provisional budget survives or must be explicitly rebased
6. then proceed toward M6 gameplay

Do not add a 2D GroundMap LOD table, lateral-driven shared LOD promotion, arbitrary texture-density knob, polygon/depth renderer, or runtime dropping of required terrain to solve performance problems.
