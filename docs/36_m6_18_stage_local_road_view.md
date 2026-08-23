# M6.18 — Stage-local Single-road View

## Purpose

After a branch handoff, a selected child must be representable as one self-contained road without drawing or physically retaining the unselected sibling road.

M6.18 introduces `StageRoadView`, a single lateral source transform shared by visual and physical adapters.

## Child cross-section

Each separated child uses:

```text
OUTSIDE | 1 m SHOULDER | 7 m ASPHALT | 1 m SHOULDER | OUTSIDE
```

Its own road center is local `l=0` and its drawable/physical corridor is `-4.5 .. +4.5 m`.

The DEV source origins are:

```text
LEFT_CHILD   sourceLateralOrigin = -7.5 m
RIGHT_CHILD  sourceLateralOrigin = +7.5 m
```

The sibling road center is therefore 15 m away in child-local coordinates and lies structurally outside the stage corridor.

## Shared source transform

For reusable parent-authored content:

```text
source_l = local_l + sourceLateralOrigin
```

The existing baked GroundMap is reused. No left/right duplicate pyramid is created.

The two local shoulders are explicit child-stage authority. This is necessary because the median-facing source coordinate in the parent package is grass/median; after handoff it must become an ordinary shoulder of the independent child road.

Surface semantics are:

```text
ROAD      -> translated parent SurfaceMap
SHOULDER  -> stage-local SHOULDER
TERRAIN   -> translated parent source when present
OUTSIDE   -> VOID
```

## Renderer bridge

`renderM5Driving` accepts an optional `StageRoadView`.

When present, existing TerrainLines are re-expressed horizontally through the selected stage view before entering the unchanged Painter.

The following values do **not** change:

- TerrainLine chainage `s`
- pseudo-depth `d`
- output scanline `y`
- render height
- vertical source footprint / `Delta_s_eff`
- terrain/sprite Painter order
- sprite depth rules
- player metric scale

Only horizontal world strip endpoints and the corresponding local GroundMap lateral sample coordinate change. `Delta_l` is recomputed from that horizontal span.

Thus M6.18 does not introduce a second road renderer, graph traversal, camera-space Z or general 3D projection.

## DEV live limitation

The current closed stadium reuses the same visible fork on a later lap solely to exercise a second Route DAG choice. Permanently applying a child single-road view there would erase the next DEV fork.

Therefore M6.18 makes the renderer and SurfaceMap *capable* of consuming the child view, but does not hack the current live loop to reset the view for the repeated fixture.

The next stage-content milestone must give child stages their own continuation/package. At that point the M6.17 handoff transaction can switch the real runtime road view without any lap-specific exception.

## Validation

Tests prove:

- selected child center is inside its projected road span
- sibling center is outside its projected ground span
- both local shoulders are SHOULDER visually and physically
- outside child corridor is physical VOID
- baked GroundMap source is reused through one scalar lateral translation
- renderer has no Route DAG dependency
- existing no-view renderer path remains unchanged
