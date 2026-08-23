# SUPER OUTRIDE — M5.4 GroundMap LOD Foundation

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
- **M5.4 GroundMap Density / Anisotropic LOD Foundation — complete**

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
78 tests
78 pass
0 fail
```

See `M5_4_VALIDATION.txt`.

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

## M5.2 fixed metric sprite authority

```text
player car physical width = 2.0 m
player car screen width = 80 px
player-depth scale = 40 px/m
```

Therefore:

```text
f / D_cam = 40
D_cam = f / 40
```

Current:

```text
f = 200 px
D_cam = 5.0 m
d_min = 2.5 m
```

Changing FOV changes camera distance, never the 2m=80px player reference.

Sprite scale is physical:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## M5.3 Surface Region compiler foundation

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

Adjacent regions are coalesced independently for each consumer so physics-only boundaries do not create unnecessary visual runtime boundaries.

Compiler validation includes `dMax < Lcourse/2` and the supported SurfaceMap envelope remaining strictly inside the supplied Guide chart lateral limit. Sprite metadata requires `worldWidthMeters` and rejects `visualScale`.

## M5.4 GroundMap density authority

Core GroundMap base density is derived from one default authority:

```text
d0 = D_cam
```

with:

```text
q_l = d0 / f
q_s = f q_l^2 / (h cos Phi_ref)
rho_l = 1/q_l
rho_s = 1/q_s
```

Using the current flat-road camera reference:

```text
d0      = 5.0 m
f       = 200 px
h       = 2.469902425419539 m
Phi_ref = 8 deg

q_l     = 0.025 m/texel
q_s     = 0.051106653147800385 m/texel
rho_l   = 40 texels/m
rho_s   = 19.566924038402615 texels/m
```

For the Core illustrative all-unique envelope `W=24m`, `L_unique=3000m`, the base-level upper bound is about **56.35 million texels**. This is deliberately exposed rather than hidden; later chunk reuse and compile-time optimization must address it.

## One anisotropic GroundMap pyramid

M5.4 implements the Core single-pyramid rule:

```text
q_l(k) = q_l × 2^k
q_s(k) = q_s × 4^k
```

Compiler prefilter step:

```text
lateral  2 → 1
chainage 4 → 1
```

Runtime shared-pyramid level authority is **chainage footprint only**:

```text
k_s = max(ceil(log4(Delta_s_eff / q_s)), 0)
k   = clamp(k_s, 0, k_max)
```

Lateral minification is diagnostic only:

```text
k_l = max(ceil(log2(Delta_l / q_l)), 0)
```

A larger `k_l` must not raise the shared pyramid level because that would over-blur chainage by ×4 for every extra level.

M5.4 provides deterministic 2×4 RGBA prefilter primitives and requires exact compiler padding/divisibility for requested levels. It does **not** yet invent `Delta_s_eff_max` or switch the runtime to baked GroundMap assets.

Primary M5.4 files:

```text
src/compiler/ground-map-lod.ts
src/compiler/ground-map-prefilter.ts
tests/m5-4-ground-map-lod.test.mjs
docs/12_m5_4_ground_map_lod_foundation.md
M5_4_VALIDATION.txt
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

Car and motorcycle physics remain replaceable DEV models. `V` transfers world kinematics instead of teleporting.

## Camera / recovery

Vertical framing is bounded rather than perfectly screen-locked. M5.1 additionally provides gameplay-side recovery, an extreme-spin whole-world safety camera, and manual recovery with `R`. The player sprite itself is never independently screen-clamped.

## Next

The next compiler/performance block is now concrete:

1. derive/instrument actual `Delta_s_eff` and `Delta_l` from TerrainLine/Road Generator output
2. stress hill/crest/dip, yaw and thin-span collapse
3. obtain the actual `Delta_s_eff,max`
4. derive the required real `k_max`
5. connect baked GroundMap chunks and pyramid levels to runtime sampling
6. add terrain/sprite frame and scanline performance budgets
7. special visual cases such as tunnel/portal
8. M6 gameplay layer

Do not introduce a guessed LOD depth or arbitrary texture-density tuning parameter merely to progress implementation.
