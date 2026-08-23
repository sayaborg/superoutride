# SUPER OUTRIDE — M5.6 Target GroundMap kMax Proof

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
- **M5.6 Target GroundMap kMax Proof — complete**

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
89 tests
89 pass
0 fail
```

See `M5_6_VALIDATION.txt`.

GitHub Pages runs the complete regression suite before deployment. Pull requests run test/build only; pushes to `main` run test/build and then deploy.

## Controls

Desktop:

- Left / Right: analogized steering
- Up: throttle ON/OFF
- Down: brake ON/OFF
- V: Car / Motorcycle
- R: manual recovery

Touch:

- landscape: steering in left margin, pedals in right margin
- portrait: controls below the 320×240 display
- steering analog; throttle/brake digital
- no gyro

## Renderer invariants

- world X/Y/Z is authoritative for physics
- vehicle is not snapped to road center
- one chainage maps to one horizontal scanline
- pseudo-depth is signed cyclic chainage difference only
- no camera-space-Z / Euclidean / lateral depth correction
- same `d` means same scale
- Raster Course remains straight-segment raster geometry
- Guide Curve is coordinate / camera support only
- TerrainLine and World Sprite share far-to-near Painter ordering
- no z-buffer
- no polygon road
- no perspective-correct texture mapping
- no arbitrary runtime sprite rotation
- sprite transparency is 0/1
- camera roll remains zero
- GroundMap is an `(s,l)` course-section texture
- SurfaceMap physics is `(s,l)` but never samples GroundMap pixels
- GroundBase transparency and SurfaceMap VOID are independent
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

Changing FOV changes camera distance, never the 2m=80px player reference. Sprite scale is physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## Surface Region compiler

One authoring authority compiles to three independent runtime products:

```text
Surface Region
   ├─ GroundMap logical profile
   ├─ GroundBase visual profile
   └─ SurfaceMap physical profile
```

Shared authoring does not make those meanings identical. A cliff may simultaneously compile as:

```text
GroundMap left = ROCK
GroundBase left = TRANSPARENT
SurfaceMap far-left = VOID
```

## GroundMap density / anisotropic pyramid

Current base density is derived from `d0 = D_cam`:

```text
q_l = d0 / f
q_s = f q_l^2 / (h cos Phi_ref)

q_l = 0.025 m/texel
q_s = 0.051106653147800385 m/texel
```

One shared anisotropic pyramid is used:

```text
q_l(k) = q_l × 2^k
q_s(k) = q_s × 4^k
```

Compiler prefilter step:

```text
lateral  2 → 1
chainage 4 → 1
```

Shared runtime LOD authority is chainage footprint only:

```text
k_s = max(ceil(log4(Delta_s_eff / q_s)), 0)
k   = clamp(k_s, 0, k_max)
```

Lateral `k_l` is diagnostic only and never raises the shared level.

## TerrainLine footprint instrumentation

Every generated TerrainLine carries:

```text
Delta_s
Delta_s_collapse
Delta_s_eff = max(Delta_s, Delta_s_collapse)
Delta_l
collapsed
```

Ordinary `Delta_s` uses the exact inverse vertical mapping at pixel boundaries. `Delta_l` is the exact one-pixel footprint of the existing horizontal affine mapping.

M5.6 also makes Core §64 thin-span collapse explicit:

```text
epsilon_span = 1 destination row
Delta_y = |bY| |1/d0 - 1/d1|
Delta_y < 1 → one-row collapse
```

The representative depth is the midpoint in `u=1/d`, where screen Y is affine. The complete clipped interval is retained in `Delta_s_collapse`.

## M5.6 final target kMax

For both ordinary and collapsed TerrainLines, the represented source interval is a subset of the forward depth clip. Therefore:

```text
Delta_s_eff <= d_max - d_min
             = 150 - 2.5
             = 147.5 m
```

Current pyramid capacities are:

```text
level 5:  52.33321282334759 m
level 6: 209.33285129339035 m
```

The M5.6 Road Generator sweep measured:

```text
TerrainLines              27,626
collapsed lines              528
max Delta_s_eff      141.01635292107866 m
max Delta_s_collapse  50.0 m
max Delta_l           26.195567174687216 m
required k_s                  6
diagnostic max k_l           11
```

So level 5 is demonstrably insufficient, while level 6 covers the absolute 147.5m proof bound. For the current target profile:

```text
k_max = 6
necessityProven   = true
sufficiencyProven = true
```

This is now compiler-authoritative rather than a visual tuning value.

Primary compiler/LOD files:

```text
src/compiler/ground-map-lod.ts
src/compiler/ground-map-prefilter.ts
src/compiler/terrain-footprint-analysis.ts
src/compiler/ground-map-target-envelope.ts
src/road/terrain-line.ts
tests/m5-4-ground-map-lod.test.mjs
tests/m5-5-terrain-footprint.test.mjs
tests/m5-6-target-kmax.test.mjs
docs/12_m5_4_ground_map_lod_foundation.md
docs/13_m5_5_terrain_footprint.md
docs/14_m5_6_target_kmax.md
M5_4_VALIDATION.txt
M5_5_VALIDATION.txt
M5_6_VALIDATION.txt
```

## Vehicle / SurfaceMap boundary

Current DEV materials:

```text
ASPHALT
SHOULDER
GRASS
DIRT
SAND
VOID
```

`VOID` means no supporting vehicle surface at `(s,l)`. Falling, crash handling and recovery remain gameplay/physics rules, not renderer rules.

## Next

The next compiler/performance block is now baked GroundMap integration:

1. compile a deterministic level-0 GroundMap source from the logical course profile
2. split/reuse it as bounded chunks rather than one all-course unique 56M-texel image
3. generate the complete anisotropic pyramid through `k_max=6`
4. select level per TerrainLine from `Delta_s_eff`
5. connect baked sampling to the existing affine horizontal span path
6. verify level-0 semantic equivalence against the procedural GroundMap source
7. add terrain/sprite frame and scanline performance budgets
8. special visual cases such as tunnel/portal
9. M6 gameplay layer

Do not introduce a 2D LOD table, lateral-driven shared LOD promotion, arbitrary texture-density knob, or new polygon/depth renderer while doing this work.
