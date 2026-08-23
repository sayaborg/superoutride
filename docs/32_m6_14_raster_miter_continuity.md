# M6.14 — Raster Fixed-l Miter Continuity

## Purpose

M6.14 fixes the geometric continuity of fixed-l raster strips at Raster Course vertices without changing the renderer model.

For every turn vertex, both adjacent straight segments now use the exact intersection of their constant-offset lines. The same authored `l` therefore converges to one world point from either side of the vertex.

## Why this matters

A branch road center or edge can be several metres from the parent Guide. Using a naive per-segment normal offset creates a small discontinuity at every corner. At branch widths that error becomes visible and also contaminates world-space gate/chart comparisons.

The exact miter removes that seam.

## Bounds

The existing hard turn limit remains the authority:

```text
|turn| <= 10 degrees
```

Therefore the miter factor remains tightly bounded. No arbitrary miter limit or runtime tuning parameter is introduced.

## Invariants

- Raster Course remains straight segments
- no curve tessellation is added to the runtime renderer
- chainage is unchanged
- only the world position of a fixed-l strip at a segment boundary is corrected
- world→Guide and Guide→world continuity tests cover the full closed DEV course
