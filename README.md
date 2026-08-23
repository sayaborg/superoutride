# SUPER OUTRIDE — M5.7 Baked GroundMap Runtime

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
- **M5.7 Baked GroundMap Runtime Integration — complete**

## Run / test

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

`npm run build` now compiles TypeScript and bakes the M5 GroundMap asset into `dist/assets/`.

Full regression:

```bash
npm test
```

Current verified result:

```text
95 tests
95 pass
0 fail
```

See `M5_7_VALIDATION.txt`.

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

## GroundMap density and LOD

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

M5.6 proved for the current target:

```text
Delta_s_eff <= d_max - d_min = 147.5 m
level 5 capacity = 52.3332 m
level 6 capacity = 209.3329 m
k_max = 6
```

The actual Road Generator sweep measured `max Delta_s_eff = 141.01635292107866m`, so k6 is both necessary and sufficient.

## Explicit thin-span rule

Core §64 is implemented directly in screen space:

```text
epsilon_span = 1 destination row
Delta_y = |bY| |1/d0 - 1/d1|
Delta_y < 1 → one-row collapse
```

Collapsed rows retain the complete clipped chainage interval as `Delta_s_collapse`.

## M5.7 baked GroundMap runtime

The M5 runtime no longer evaluates the procedural GroundMap for normal terrain pixels.

Build path:

```text
Surface Region logical GroundMap
→ cyclic dense level 0
→ compiler 2×4 anisotropic prefilter
→ levels k0..k6
→ bounded row chunks
→ duplicate payload sharing
→ binary asset
```

Current build result:

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

The aligned base grid is slightly finer than the M5.4 density authority, never coarser.

Storage:

```text
level 0    palette8
levels 1-6 RGB555
```

Runtime behavior:

```text
TerrainLine Delta_s_eff
→ choose one level once per line
→ horizontal affine span samples that baked level
```

No runtime anisotropic filtering is performed. Level-0 texel centers are regression-tested for exact semantic equivalence with the procedural authoring source, and cyclic addressing is tested at every level.

Primary M5.4–M5.7 files:

```text
src/compiler/ground-map-lod.ts
src/compiler/ground-map-prefilter.ts
src/compiler/terrain-footprint-analysis.ts
src/compiler/ground-map-target-envelope.ts
src/compiler/ground-map-asset-compiler.ts
src/visual/baked-ground-map.ts
src/render/rgb555.ts
src/road/terrain-line.ts
tools/build-ground-map.mjs
tests/m5-4-ground-map-lod.test.mjs
tests/m5-5-terrain-footprint.test.mjs
tests/m5-6-target-kmax.test.mjs
tests/m5-7-baked-groundmap.test.mjs
docs/12_m5_4_ground_map_lod_foundation.md
docs/13_m5_5_terrain_footprint.md
docs/14_m5_6_target_kmax.md
docs/15_m5_7_baked_groundmap.md
M5_4_VALIDATION.txt
M5_5_VALIDATION.txt
M5_6_VALIDATION.txt
M5_7_VALIDATION.txt
```

## Next

The next block is performance/compiler budget validation rather than new gameplay:

1. measure TerrainLine count per frame
2. measure terrain output samples per frame and per screen row
3. measure sprite output samples per frame and per scanline
4. record GroundMap LOD distribution
5. sweep normal and stress camera/course states
6. define target budgets from observed data plus explicit margin
7. validate content against those budgets without runtime-dropping non-optional terrain
8. add tunnel/portal stress content
9. then proceed toward M6 gameplay

Do not add a 2D LOD table, lateral-driven shared LOD promotion, arbitrary texture-density knob, or polygon/depth renderer while doing this work.
