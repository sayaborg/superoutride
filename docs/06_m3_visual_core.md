# SUPER OUTRIDE — M3 Visual Core

## Status

M3 is implemented as the first general visual renderer milestone on top of the M2 free-world driving prototype.

The Core Design Freeze remains the source of truth. This document records implementation choices only; it does not restate or replace Core formulas.

## Implemented runtime path

```text
320x240 Uint32 software framebuffer
  -> Full Far Background bitmap
  -> TerrainLine generation from piecewise-linear Y_render
  -> TerrainLine far-to-near Painter draw
       left GroundBase paint rule
       GroundMap horizontal affine sampling
       right GroundBase paint rule
  -> player
  -> HUD
  -> ImageData -> Canvas
```

No z-buffer, polygon road, perspective-correct texture mapper, camera-space-Z depth correction, or lateral depth correction is used.

## Height

The DEV course now has hill and dip sections.

- `Y_render(s)` is cyclic and piecewise linear.
- the terrain generator splits work at the union of Raster heading, render-height, and GroundBase/visual-section breakpoints.
- within one such interval, screen Y has the Core `a + b/d` form and is inverted per output scanline.
- multiple chainages may therefore emit TerrainLines to the same screen row.
- the final TerrainLine list is sorted by descending pseudo-depth before drawing.

A separate DEV `Y_camera(s)` is generated with cosine interpolation between height nodes. It is C1 at those nodes and is used only for camera vertical guidance. It does not alter `Y_render`.

## GroundMap

M3 implements a level-0 source sampler in `(s,l)`.

The current programmer-art source includes:

- asphalt
- center marking
- shoulder
- grass
- cliff rock

Within one TerrainLine, lateral source position is initialized once and then incremented by a constant `lateralStep` for each destination pixel. This preserves the affine horizontal inner loop.

Filtering/prefilter levels are intentionally not implemented yet; Core allows level-0 geometry first, with prefilter/LOD added later.

## GroundBase

GroundBase is not a separate layer.

Each TerrainLine independently applies:

```text
screen left .. xGroundL     GroundBase_L
xGroundL .. xGroundR        GroundMap
xGroundR .. screen right    GroundBase_R
```

`TRANSPARENT` means no framebuffer write.

The DEV cliff section uses:

```text
GroundBase_L = TRANSPARENT
GroundBase_R = rock COLOR
```

so the already-drawn Far Background remains visible on the left side.

## Full Far Background

The M3 DEV background is one full bitmap with meaningful content both above and below its source horizon:

```text
sky
mountain silhouette
---------------- source horizon
sea
far island
```

The source horizon is vertically anchored to the camera horizon. Horizontal pan uses the Core baseline effective angular scale `K_bg = f`.

The bitmap is currently generated once at startup as programmer art; runtime treats it as a bitmap surface.

## Software framebuffer

The visual core now writes into a 320x240 `Uint32Array` framebuffer. Canvas 2D is only the presentation endpoint via `ImageData`/`putImageData`; road/terrain drawing does not use Canvas path geometry.

## M3 acceptance validation

Automated validation covers:

- software framebuffer span writes
- piecewise-linear `Y_render`
- C1 DEV `Y_camera` node behavior
- globally far-to-near TerrainLine ordering
- hill/dip same-row overdraw
- TerrainLine vertical agreement with the single Core pseudo projection
- GroundMap material sampling
- cliff `GroundBase_L=TRANSPARENT` preserving the Far Background pixel
- right GroundBase COLOR overwriting the background
- meaningful Far Background pixels below the source horizon

M0/M1/M2 tests remain active and must continue to pass.

## Deliberately deferred

M3 does not yet implement:

- anisotropic GroundMap prefilter pyramid
- texture chunks/decal compiler
- World Sprite list
- sprite scaler/variant system
- real player art
- SurfaceMap physics
- final camera tuning
- target hardware content budgets

Those belong to following milestones.
