# M5.3 — Compiler / Asset Pipeline Foundation

## Status

M5.3 starts the compiler-side foundation recommended after M5.2. It does not change Core renderer mathematics or DEV vehicle dynamics.

## 1. Surface Region is the authoring authority

The debug course now owns one authoring representation:

```text
Surface Region
   ├─ GroundMap logical material
   ├─ GroundBase L/R
   └─ SurfaceMap lateral bands
```

`src/course/surface-region.ts` defines the authoring shape. `src/dev/m5-surface-authoring.ts` contains the current debug-course data.

`src/compiler/surface-region-compiler.ts` compiles that one source into three independent runtime profiles:

```text
GroundMap logical profile
Visual GroundBase profile
Physical SurfaceMap profile
```

Adjacent authoring regions that are identical for a particular runtime consumer are coalesced for that consumer. Thus a physics-only material boundary does not add a GroundBase or GroundMap runtime boundary.

## 2. Independence remains explicit

Compilation from a shared authoring source does **not** make visual and physical meanings identical.

In the cliff section:

```text
GroundMap left = ROCK
GroundBase left = TRANSPARENT
SurfaceMap far-left = implicit VOID
```

These are deliberately different outputs from the same authoring region.

## 3. Runtime connection

The browser debug course compiles Surface Region data once at startup. The resulting profiles feed:

- `GroundMapProfile.logical`
- `CyclicVisualProfile`
- `CyclicSurfaceMap`

The old debug factory functions remain as compatibility/test helpers, but they now compile from the same Surface Region source instead of owning duplicated definitions.

## 4. Course compiler validation foundation

`src/compiler/course-validation.ts` adds the first shared validation boundary:

- `dMax < Lcourse/2`
- supported SurfaceMap lateral envelope must remain strictly inside the supplied Guide chart lateral limit

Raster turn-limit and Guide continuity validation remain in their existing geometry compilers. Later compiler work can aggregate those reports without duplicating their mathematics.

## 5. Sprite physical metadata

`src/compiler/sprite-metadata.ts` validates external sprite metadata.

Required:

```text
name
sourceWidthTexels
sourceHeightTexels
worldWidthMeters
```

Forbidden:

```text
visualScale
```

The runtime `createSpriteAsset()` API also no longer provides an accidental `worldWidthMeters = width` default. Physical width must be supplied explicitly.

This preserves the M5.2 authority:

```text
screen texel scale
  = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

## 6. CI / Pages

GitHub Pages now runs `npm test` rather than build-only compilation. Deployment therefore occurs only after the full regression suite passes.

## 7. Next

M5.3 intentionally stops before expensive asset baking. Next compiler work is:

1. connect actual course-compiler aggregate validation/reporting
2. formalize GroundMap base density from `d0 = D_cam`
3. derive compiler-side anisotropic prefilter levels from chainage footprint
4. add asset manifest ingestion using the physical metadata validator
5. add terrain/sprite performance instrumentation
