# M6.34 — Reusable Stage-Local Junction

## Goal

M6.34 makes the existing M6.12 two-way `JunctionCrossSectionProfile` reusable inside an arbitrary committed successor stage.

This milestone does **not** add another live Route DAG branch yet. It supplies the stage-local visual/physical cross-section authority required for M6.35 to place a second visible fork inside the current point-to-point route.

The frozen renderer model is unchanged:

```text
one chainage
→ one lateral cross-section
→ one horizontal raster scanline
```

A junction remains one widening Raster road. It is never represented as two perspective roads.

## Existing authority retained

`src/course/junction-cross-section.ts` was already generic. M6.34 deliberately reuses it rather than introducing a second junction model.

Its phases remain:

```text
SINGLE
→ WIDENING
→ MEDIAN_GROWTH
→ SEPARATED
```

At full separation the required local half-width through the outer shoulder is:

```text
requiredGroundHalfWidth
  = childRoadWidth
  + finalMedianWidth / 2
  + shoulderWidth
```

`compileStageJunction()` expands only the active stage ground envelope to at least this value. The incoming road width and the Raster source lateral origin do not change.

## Two distinct GroundMap junction authorities

A critical M6.34 distinction is that two coordinate meanings must not be conflated.

### `GroundMapProfile.junction`

This remains the pre-existing **source-coordinate** cross-section authority.

It is used by the original M6.13 parent junction and by later stage-local adapters when they translate local `l` back into reusable source authoring.

### `GroundMapProfile.stageJunction`

M6.34 adds a separate **active-stage-local** overlay authority.

Its coordinates are:

```text
s = active stage chainage
l = active stage local lateral coordinate
```

Therefore its incoming road is centered at local `l = 0` even when the underlying Raster source has a non-zero `sourceLateralOrigin`.

This distinction prevents a successor stage derived from the original LEFT or RIGHT branch from accidentally evaluating its new fork around the parent-source lateral origin.

## GroundMap sampling order

`sampleStageGroundMapRuntime()` now follows this semantic order:

```text
1. reject samples outside the expanded StageRoadView ground envelope
2. evaluate stageJunction in active-stage local (s,l)
3. if the stage junction owns that point, paint its asphalt / median / shoulder
4. otherwise preserve the ordinary stage-local shoulder override
5. translate local l once into source l
6. sample the reusable source GroundMap, including any source-coordinate junction
```

The local fork therefore takes priority over the old fixed single-road classification without destroying the source authoring underneath it.

The cross-section chainage and visual pattern chainage are explicitly separate in `sampleJunctionGroundMap()`:

```text
junctionS → road/median geometry
patternS  → asphalt/checker/dash visual phase
```

This allows a rebased stage to own a local fork while preserving inherited longitudinal GroundMap phase.

## SurfaceMap sampling

`StageJunctionSurfaceMap` consumes the same stage-local `JunctionCrossSectionProfile`.

Inside the expanded stage corridor:

```text
ASPHALT_SINGLE / ASPHALT_LEFT / ASPHALT_RIGHT → ASPHALT
SHOULDER                                      → SHOULDER
MEDIAN                                        → GRASS
junction OUTSIDE                              → authored outer surface
```

Outside the expanded stage corridor:

```text
VOID
```

The default outer surface is `GRASS`; the reusable adapter also permits `DIRT`, `SAND` or `VOID`.

GroundMap pixels and SurfaceMap physics remain separate data products. They only share the same geometric junction authority.

## Coordinate invariants

M6.34 does not alter the single rebase rule for an ordinary stage:

```text
l_source = l_local + sourceLateralOrigin
```

The new junction is intentionally evaluated **before** this rebase because it belongs to the active stage chart.

The source GroundMap, when reached after junction classification, continues to use the existing rebase exactly once.

## No renderer or route topology changes

The reusable compiler/SurfaceMap layer imports no:

- Route DAG
- physical route-boundary logic
- handoff transaction logic
- renderer
- camera
- car physics
- motorcycle physics
- milestone-specific route topology

M6.34 adds no new pseudo-depth rule, no camera-space Z, no polygon road, no second draw path and no branch-specific renderer code.

## Validation

M6.33 ended at 298 tests. M6.34 adds five dedicated regressions for a total of 303.

The dedicated tests prove:

1. the expanded stage corridor is derived exactly from child-road/median/shoulder dimensions;
2. GroundMap junction geometry is stage-local even with a non-zero source lateral origin;
3. SurfaceMap uses the same stage-local junction authority;
4. an incoming road width mismatch is rejected;
5. the reusable layer has no renderer/route/vehicle dependency.

The complete suite also retains the browser-order regression that physically drives through the original visible fork, commits the child chart and renders subsequent child frames without the historical GroundMap edge exception.

## Next milestone

M6.35 will use this reusable stage junction to create a **second live physical fork** inside a successor stage.

The intended structure is conceptually:

```text
STAGE_1
  ├─ LEFT ... → FORK_STAGE
  │              ├─ child A
  │              └─ child B
  └─ RIGHT ... → existing terminal path
```

Route selection will remain a validated physical world-space gate crossing followed by PENDING → seam COMMIT. Steering direction alone will never select a route.
