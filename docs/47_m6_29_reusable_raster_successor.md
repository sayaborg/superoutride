# SUPER OUTRIDE — M6.29 Reusable Raster Stage Successor Factory

## Purpose

M6.29 extracts the independent-successor Raster/Guide construction algorithm from M6.26 into a reusable runtime-stage factory.

M6.26 proved that a committed child stage could transition into another independently compiled stage while preserving a complete `D_cam` overlap and the frozen raster pseudo-3D constraints. Before M6.29, the geometry-editing algorithm that made that successor still lived inside the M6.26 DEV module.

M6.29 moves that algorithm to:

```text
src/runtime/raster-stage-successor.ts
```

The current M6.26 LEFT/RIGHT route now supplies only authoring parameters.

## Factory contract

The generic entry is:

```text
createRasterStageSuccessor(source, authoring)
```

The source contains an already compiled:

```text
GuideCurve
GuideChart
GroundMapProfile
```

The authoring provides the successor-specific values:

```text
continuation/chart/view IDs
source seam minimum chainage
overlap margin
transition lead
finish distance after seam
deformation distance
deformation direction
gentle-turn threshold
minimum deformation-run length
D_cam / dMax
closure margin
GroundMap half width
stage ground/road/shoulder widths
```

The result contains the complete structural runtime source for one next stage:

```text
GuideCurve
GuideChart
StageRoadView
StageSurfaceMapView
GroundMapProfile
StageContinuationLink
sourceTransitionS
sourceSeamS
targetSeamS
finishS
```

This is deliberately below RouteDag and declarative-route authoring. It builds a stage successor, not a route choice.

## Geometry construction

The factory preserves the M6.26 algorithm that was validated against the Core hard limit.

For one source stage:

1. choose the first Raster vertex at or after the authored source seam minimum,
2. locate a source start before the seam and a shared end after it so the copied interval covers the requested overlap,
3. copy that overlap interval exactly,
4. append the remaining source Raster vertices in cyclic order,
5. find the longest run whose original per-vertex turn is below an explicitly conservative threshold,
6. apply a smooth lateral normal displacement only inside that run,
7. compile the complete candidate through the ordinary `compileRasterCourse()`,
8. compile its Guide,
9. validate source/target overlap through the ordinary `StageContinuationLink` compiler.

The deformation envelope remains:

```text
smooth = sin(pi * phase)^2
```

so displacement is zero at both boundaries of the modified run.

## The 10° rule remains outside author control

The Core Raster rule is unchanged:

```text
absolute turn at one Raster vertex <= 10°
```

M6.29 does not expose that limit as a configurable factory tolerance.

The authoring field `gentleTurnLimitDegrees` is only a preselection threshold for deciding which existing source vertices are safe to deform. It is required to be strictly less than 10°.

Even if authoring selects a poor deformation, the final candidate must still pass the existing `compileRasterCourse()` validation. Therefore the generic successor factory cannot weaken or bypass the Core geometry authority.

## Exact overlap authority

The factory requires the authored overlap margin to cover at least `D_cam`.

After successor compilation it creates a normal `StageContinuationLink` with:

```text
overlapBehind = D_cam
overlapAhead  = D_cam
```

The link compiler checks source and target world position/heading across that interval. This is the same continuity requirement used by M6.25/M6.26.

No world-state transformation is introduced. The factory only constructs two coordinate descriptions that share the same physical road locus around a seam.

## Ground and surface ownership

The successor factory also constructs the structural stage-local road/surface envelope:

```text
shoulder
asphalt
shoulder
```

from authored metric dimensions.

The GroundMap's wider sampling span is separately configurable through `groundMapHalfWidth`; it is no longer hardcoded to the current ±12m DEV value inside the generic factory.

The resulting GroundMap profile inherits source chainage phase:

```text
new chainageOffsetS
= source chainageOffsetS + sourceStartS
```

so procedural road markings/material phase remains continuous with the portion of source Raster reused by the successor.

## M6.26 after extraction

M6.26 now retains only route/content-specific decisions such as:

```text
LEFT deformation direction  = -1
RIGHT deformation direction = +1
deformation magnitude       = 3m
source seam minimum         = 340m
transition lead             = 20m
finish after seam           = 150m
current GroundMap span      = ±12m
```

It delegates the actual Raster copy/deform/recompile/link algorithm to `createRasterStageSuccessor()`.

M6.26 also retains its product/content-specific assertion that the second transition occurs after the child terrain profile has returned to its safe datum. That check appropriately remains outside the generic geometry factory.

## Regression equivalence

M6.29 directly constructs a successor from the M6.22 child using the generic factory and compares it against the M6.26 live successor.

The regression verifies:

- Guide length,
- source transition chainage,
- source seam chainage,
- target seam chainage,
- FINISH chainage,
- every Raster vertex X/Z coordinate.

Thus the extraction is required to reproduce the already validated M6.26 geometry, not merely to create another plausible successor.

A second test samples `-5, -2.5, 0, +2.5, +5m` around the seam and checks source/target world X/Z/heading equality.

## Dependency boundary

The generic factory has no dependency on:

- RouteDag,
- route boundary gates,
- route-stage handoff transaction,
- renderer modules,
- camera implementation,
- car physics,
- motorcycle physics,
- milestone-specific DEV modules.

It depends only on core course/Guide/math, stage-road/surface structures, GroundMap profile data, and the generic `StageContinuationLink`.

This keeps the factory usable when route topology grows beyond the current two-handoff example.

## Frozen runtime semantics

M6.29 changes none of the driving/runtime authority:

```text
physical route gate
→ validated RouteDag transition
→ PENDING
→ physical handoff seam
→ COMMIT chart/content
```

Vehicle world X/Y/Z, yaw and velocity remain authoritative and unchanged at COMMIT.

Renderer invariants remain frozen:

- pseudo-depth is signed chainage difference only,
- lateral/Euclidean distance does not affect depth,
- one chainage maps to one horizontal scanline,
- same depth means same scale,
- Raster Segment road,
- no polygon road,
- no z-buffer,
- no perspective-correct ground mapping,
- one far-to-near Terrain + World Sprite Painter,
- binary transparency,
- no arbitrary sprite rotation,
- camera roll zero,
- player metric authority 2.0m = 80px at player depth.

## Regression authority

M6.29 adds five dedicated tests to the M6.28 baseline of 274, giving a full suite of 279 tests.

The tests prove:

1. exact reproduction of M6.26 successor geometry,
2. exact `D_cam` overlap around the successor seam,
3. reusable positive/negative deformation directions without modifying the source chart,
4. refusal to permit a gentle-turn threshold at or above the frozen 10° limit,
5. dependency isolation and actual M6.26 delegation to the generic factory.

## Next architectural direction

With M6.28, route topology is declarative. With M6.29, successor Raster/Guide construction is reusable.

The next useful proof is to combine these two layers by extending one current terminal path through another independently generated stage without adding a new successor-construction algorithm. That would demonstrate that deeper point-to-point routes can be built by composing the generic successor factory with declarative stage/transition rows while leaving `main.ts`, renderer Core, and the handoff transaction unchanged.
