# SUPER OUTRIDE — M5.3 Compiler Foundation

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by the Super Scaler era.

The architectural rule remains:

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
- **M5.3 Compiler / Asset Pipeline Foundation — complete**

## Run

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/
```

## Test

```bash
npm test
```

Current verified result:

```text
71 tests
71 pass
0 fail
```

M5.3 was independently verified by GitHub Actions pull-request CI on 2026-08-23. See `M5_3_VALIDATION.txt`.

GitHub Pages now runs the complete regression suite before deployment. Pull requests run test/build only; pushes to `main` run test/build and then deploy.

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
- steering is analog
- throttle / brake are digital
- no gyro

## Renderer invariants

The following are intentional rules, not approximation bugs:

- world X/Y/Z is authoritative for physics
- vehicle is not snapped to road center
- one chainage maps to one horizontal scanline
- pseudo-depth is signed cyclic chainage difference only
- no camera-space-Z depth correction
- no Euclidean-distance sprite scaling
- no lateral depth correction
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
- SurfaceMap physics is also `(s,l)` but does not sample GroundMap pixels
- GroundBase transparency and SurfaceMap VOID are independent meanings
- Far Background is a full image including below-horizon pixels

Final renderer order remains:

```text
Optional Clear
→ Full Far Background
→ Terrain + World Sprite far→near
→ Player Sprite
→ HUD
```

## M5.2 fixed metric sprite authority

This relation is non-negotiable:

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

Current values:

```text
f = 200 px
D_cam = 5.0 m
d_min = 2.5 m
```

Changing FOV changes camera distance; it does not change the 2m=80px presentation reference.

A sprite owns physical metadata. Source texels are not world meters:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

There is no arbitrary `visualScale` multiplier.

## M5.3 Surface Region compiler foundation

M5.3 removes duplicated debug-course surface definitions. One authoring source now compiles to three independent runtime products:

```text
Surface Region
   ├─ GroundMap logical profile
   ├─ GroundBase visual profile
   └─ SurfaceMap physical profile
```

The shared source does not make those meanings identical. For example the cliff section can simultaneously mean:

```text
GroundMap left = ROCK
GroundBase left = TRANSPARENT
SurfaceMap far-left = VOID
```

Adjacent authoring regions are coalesced independently for each runtime consumer. A physics-only boundary therefore does not create unnecessary visual runtime boundaries.

Primary files:

```text
src/course/surface-region.ts
src/dev/m5-surface-authoring.ts
src/compiler/surface-region-compiler.ts
src/compiler/course-validation.ts
src/compiler/sprite-metadata.ts
docs/11_m5_3_compiler_foundation.md
```

## Compiler validation foundation

M5.3 introduces shared validation for:

```text
dMax < Lcourse/2
supported SurfaceMap envelope strictly inside supplied Guide chart lateral limit
```

Existing Raster 10° turn-limit and Guide continuity validation stay in their geometry owners rather than being duplicated.

## Sprite metadata validation

External asset metadata must provide:

```text
name
sourceWidthTexels
sourceHeightTexels
worldWidthMeters
```

`visualScale` is rejected.

The runtime `createSpriteAsset()` API likewise no longer has the accidental `worldWidthMeters = source width` default. Physical width must be explicit.

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

`VOID` means no supporting vehicle surface at `(s,l)`. Falling, crash handling and recovery remain gameplay/physics rules rather than renderer rules.

Car and motorcycle physics remain replaceable DEV models. `V` transfers world kinematics between models instead of teleporting the vehicle.

## Camera / recovery

M5 vertical framing is bounded rather than perfectly screen-locked. M5.1 additionally provides:

- gameplay-side recovery from prolonged unsupported states
- an extreme-spin safety camera that changes whole-world camera yaw
- manual recovery with `R`

The player sprite itself is never independently screen-clamped.

## GitHub Pages

Workflow:

```text
.github/workflows/pages.yml
```

Behavior:

```text
pull request → npm install → npm test
main push    → npm install → npm test → stage → deploy
```

This prevents a regression from being published merely because TypeScript compilation succeeds.

## Next

The next implementation block remains compiler/performance work rather than gameplay expansion:

1. aggregate course-compiler validation/reporting
2. GroundMap base density derivation using `d0 = D_cam`
3. compiler-side anisotropic GroundMap prefilter levels from chainage footprint
4. asset-manifest ingestion through physical metadata validation
5. terrain/sprite performance instrumentation and stress budgets
6. special visual cases such as tunnel/portal
7. M6 gameplay layer

Do not finalize currently-unfrozen gameplay values merely to progress implementation.
