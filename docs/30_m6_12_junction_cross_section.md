# M6.12 — Widening / Median Junction Cross-Section

## Purpose

Represent an OutRun-style visible split without introducing a second perspective road or changing the raster renderer.

The junction is one ordinary `(s,l)` lateral strip. At every chainage there is still exactly one horizontal scanline source. Only the lateral material boundaries move with `s`.

## Authored sequence

```text
single road
  -> widen one asphalt band
  -> open a center median
  -> widen the median while moving both outer edges outward
  -> two separated child-road bands
```

Phase A grows one asphalt band from `parentRoadWidth` to `2 * childRoadWidth`.

Phase B grows the median. The two outer road edges move outward by the same half-median growth, therefore each child road remains exactly `childRoadWidth` instead of being squeezed by the divider.

All cross-section boundaries are linear in `s`. This is deliberately compatible with the existing raster / GroundMap model and requires no branch-specific depth.

## Authority

`src/course/junction-cross-section.ts` is geometric authoring only. It does not import renderer or vehicle physics.

It exposes:

- phase
- outer half-width
- median half-width
- one or two asphalt lateral intervals
- median interval
- outer shoulder intervals
- fully separated left/right child-center lateral offsets

The child-center offsets are expressed relative to the parent Guide in the same world frame. They are intended for a later Guide-chart handoff; they do not move the vehicle.

## Runtime invariants preserved

- physics remains world-space
- one chainage remains one scanline
- pseudo-depth remains chainage-only
- no second perspective road
- no z-buffer or polygon junction
- no runtime screen-X route selection
- renderer remains unaware of Route DAG topology

## DEV proof geometry

The regression fixture uses:

```text
parent road width  9 m
child road width   9 m each
final median width 12 m
widen start        s=100
median start       s=130
separated          s=190
```

At full separation:

```text
left road   -15 .. -6 m
median       -6 .. +6 m
right road   +6 .. +15 m
child centers       +/-10.5 m
```

These numbers prove the geometry only. They are not yet final product junction dimensions.

## Next seam rule

The visible junction itself belongs to the parent stage. A validated route choice selects the future child stage, but the content/Guide handoff occurs later, only after an authored overlap corridor makes the selected parent branch and child stage visually and geometrically identical across the renderer's visible depth window.

The sibling road becoming irrelevant/occluded is therefore an authoring property, never a screen-pixel gameplay test.
