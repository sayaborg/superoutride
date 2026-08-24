# M6.47 — Open Parent Stage Integration

## 0. Status

**Complete candidate; release requires docs-inclusive exact-head CI and validation-file-inclusive exact-head CI before main fast-forward.**

Package:

```text
super-outride-m6-47@0.6.47
```

Implementation-green checkpoint:

```text
feature head: 2f9330e658bfc3aabb1bb43bed7672b1633ed431
GitHub Actions: #445
build job: 97529084769
389 tests / 389 pass / 0 fail
```

M6.47 does not redefine renderer Core. It applies the already-frozen M6.44/M6.45 open-path/open-source architecture to the remaining live BRANCHING parent-stage integration.

---

## 1. Why M6.47 exists

M6.44 established that general Raster/Guide geometry is open.

M6.45 established that general source profiles are open:

```text
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

and that closed-course behavior exists only through explicitly named adapters:

```text
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
CyclicSurfaceMap
```

M6.46 then removed the remaining hidden wrap from general recovery.

However, the live BRANCHING parent stage still explicitly selected two cyclic adapters in `main.ts`:

```text
CyclicVisualProfile
CyclicSurfaceMap
```

and M5.9 tunnel Far Background selection still normalized camera chainage with `wrapPositive()`.

Several consumer type signatures also still named `CyclicHeightProfile` even though those consumers only called the ordinary sampling interface.

So the general architecture was open, but the actual point-to-point parent integration still claimed periodicity in several places.

M6.47 removes that mismatch.

---

## 2. Governing rule

The rule remains the M6.45 rule:

> **Open is the general data model. Cyclic is an explicit topology adapter. Renderer Core is neither.**

For the current LINEAR/BRANCHING family, the live runtime must consume ordinary open sources unless a higher topology layer explicitly requires something else.

M6.47 therefore does not add a `closed` boolean, a renderer branch or a hidden normalization helper.

It simply stops selecting cyclic adapters where the current topology is point-to-point.

---

## 3. Live parent-stage source stack

After M6.47 the live `STAGE_1` integration is consistently open:

```text
Raster / Guide       open
HeightProfile         open
VisualProfile         open
SurfaceMap            open
logical GroundMap     open
baked GroundMap       open
M5.9 tunnel interval  open
```

The parent runtime now constructs:

```ts
new VisualProfile(...)
new SurfaceMap(...)
```

rather than:

```ts
new CyclicVisualProfile(...)
new CyclicSurfaceMap(...)
```

The current junction remains the same authored `M6_13_JUNCTION`; only the addressing authority changes from cyclic opt-in to the ordinary open map.

No renderer code is changed to achieve this.

---

## 4. M5.9 tunnel presentation is an open interval

The tunnel entry/exit are ordinary finite chainages on the current parent stage.

Far Background selection now uses:

```text
cameraTransitionStartS <= cameraS < cameraTransitionEndS
```

with an explicit valid input domain:

```text
0 <= cameraS <= courseLength
```

Out-of-domain camera chainage is invalid and throws. It is not modulo-normalized.

The tunnel presentation module therefore contains neither:

```text
wrapPositive
cyclicIntervalContains
```

The existing portal alignment rule is unchanged:

```text
cameraTransitionStartS = tunnelEntryS - D_cam
cameraTransitionEndS   = tunnelExitS  - D_cam
```

So the portal still hides the Far Background switch at the correct player crossing without any renderer scale or depth special case.

A future CIRCUIT topology may explicitly map its topology chainage into a finite source domain before invoking source/presentation readers. The tunnel reader itself does not own that topology.

---

## 5. Height contracts become reader contracts

The following modules do not need to know whether a source is cyclic:

```text
src/dev/m3-camera.ts
src/dev/m4-camera.ts
src/dev/m5-camera.ts
src/physics/car-physics.ts
src/physics/motorcycle-physics.ts
src/world/m4-debug-world.ts
src/world/m5-9-tunnel-world.ts
```

They only require:

```ts
HeightProfileReader
```

M6.47 changes their type contracts accordingly.

This is not a physics or camera algorithm change. It removes a false requirement from the API surface.

The ordinary open `HeightProfile` can now be passed directly by type, rather than merely being structurally compatible with a consumer that was incorrectly named as cyclic.

---

## 6. Shared runtime source boundary becomes open

The same hidden assumption existed one level above the browser wiring.

`M620SharedRuntimeContent` previously required a cyclic surface/height source even though the runtime package system and stage views did not require periodicity.

M6.47 changes the shared parent boundary to:

```text
heightProfile : HeightProfileReader
surfaceMap    : SurfaceMap
```

`StageSurfaceMapView` continues to derive child-local surface views from the ordinary source map.

This means the actual live runtime assembly can carry the open parent map without pretending it is a closed course.

---

## 7. Explicit cyclic adapters are retained

M6.47 does **not** delete the `Cyclic*` classes.

They remain deliberate opt-in primitives for topology that actually needs finite-domain periodic addressing.

Direct regression explicitly proves that cyclic adapters still wrap when chosen:

```text
CyclicVisualProfile
CyclicSurfaceMap
```

The architectural distinction is therefore preserved:

```text
open source primitive
        ↑ ordinary LINEAR / BRANCHING

explicit cyclic adapter
        ↑ future CIRCUIT topology only when deliberately selected
```

There is no global `isClosed` switch propagating through Core.

---

## 8. What remains unchanged

M6.47 preserves all frozen renderer/gameplay boundaries:

- world X/Y/Z remains physics authority;
- pseudo-depth remains exactly `s_render - s_camera`;
- same pseudo-depth means same scale;
- player metric remains 2.0m = 80px at player depth;
- `f = 200px`, `D_cam = 5m` remain current values;
- Raster interior turn hard limit remains 10°;
- Guide remains coordinate/camera support;
- TerrainLine and World Sprite retain one far→near Painter;
- no z-buffer or polygon road is introduced;
- no perspective-correct road texture path is introduced;
- route topology remains outside renderer Core;
- RouteDag remains acyclic for point-to-point route logic;
- physical gate crossing remains route authority;
- PENDING → physical seam → COMMIT remains unchanged;
- COMMIT does not transform world pose/yaw/velocity;
- M6.46 first-physical-crossing field lock and losing-sibling recovery remain unchanged;
- rival cardinality remains 0..16 at mode authoring level.

---

## 9. Direct regression coverage

M6.47 adds seven direct regressions:

1. live parent stage constructs open `VisualProfile` and `SurfaceMap` rather than cyclic adapters;
2. parent visual/surface sources accept endpoints and reject chainage outside `[0,L]`;
3. M5.9 tunnel background is one ordinary open interval and never wraps endpoints;
4. ordinary car, bike and M5 camera consume the open `HeightProfile` reader directly;
5. camera/physics/world/shared-runtime contracts no longer require cyclic height or surface types;
6. tunnel presentation contains no implicit modulo/wrap topology;
7. explicit cyclic adapters remain usable for a future upper-level CIRCUIT choice.

The full implementation checkpoint is:

```text
389 tests
389 pass
0 fail
0 cancelled
0 skipped
0 todo
```

---

## 10. Files changed

Primary implementation files:

```text
src/main.ts
src/visual/m5-9-tunnel.ts
src/dev/m3-camera.ts
src/dev/m4-camera.ts
src/dev/m5-camera.ts
src/dev/m6-20-live-runtime-content.ts
src/physics/car-physics.ts
src/physics/motorcycle-physics.ts
src/world/m4-debug-world.ts
src/world/m5-9-tunnel-world.ts
```

Regression files:

```text
tests/m6-13-visible-junction.test.mjs
tests/m6-47-open-parent-stage-integration.test.mjs
```

Release/docs files:

```text
package.json
package-lock.json
index.html
README.md
docs/65_m6_47_open_parent_stage_integration.md
M6_47_VALIDATION.txt   # added only after docs-inclusive CI is green
```

---

## 11. Future CIRCUIT boundary

After M6.47, the next clean architectural step is not more hidden wrapping in point-to-point code.

A future explicit CIRCUIT topology layer must own at least:

```text
endpoint connection / physical seam authority
unwrapped lap-progress chainage
mapping between topology chainage and one finite open stage/source domain
explicit cyclic source-adapter selection where appropriate
```

That layer must remain above:

```text
RasterPath
GuidePath
renderer pseudo-depth
TerrainLine
World Sprite Painter
open source primitives
ordinary recovery
point-to-point RouteDag
```

The desired architecture is therefore:

```text
CIRCUIT topology/compiler
        ↓ explicit mapping/adapters
finite open geometry + source domains
        ↓
topology-neutral renderer Core
```

not:

```text
renderer/general source code
        ↓
implicit modulo everywhere
```

---

## 12. Release rule

The implementation-green checkpoint is not sufficient by itself.

Release sequence remains:

```text
implementation exact head → full CI green
docs/version exact head   → full CI green
add validation record
validation-inclusive head → full CI green
verify main unchanged and candidate is pure fast-forward
main → exact validation-inclusive CI-green SHA with force=false
```

Only the final validation-inclusive exact feature SHA may become `main`.