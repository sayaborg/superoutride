# M6.13 — Visible Junction

## Purpose

M6.13 makes the branch junction visible without teaching the renderer about a route graph.

The existing chainage-driven GroundMap/SurfaceMap cross-section widens one parent road, opens a median, then exposes two separated 7 m child roads inside the same authored lateral strip.

## DEV authority

```text
sWidenStart      = 390 m
sMedianStart     = 430 m
sSeparatedStart  = 530 m
parent road      = 9 m
child road       = 7 m each
final median     = 8 m
shoulder         = 1 m
```

The final separated cross-section exactly fits the existing ±12 m GroundMap envelope.

## Invariants

- still one chainage source per horizontal scanline
- still one Raster Course depth path
- junction variation is GroundMap/SurfaceMap source content, not a second projected road
- GroundMap and SurfaceMap share the junction cross-section authority but remain semantically independent
- the rival branch target is AI-only and is never route-selection authority

M6.13 therefore creates a visible fork while preserving the frozen pseudo-3D renderer model.
