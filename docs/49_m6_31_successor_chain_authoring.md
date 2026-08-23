# M6.31 — Reusable Raster Successor Chain Authoring

## Goal

M6.30 proved that the live LEFT route could be extended by promoting an old terminal stage into an intermediate stage and generating one more Raster successor.

M6.31 removes that milestone-specific repetition. It introduces a reusable runtime primitive:

```text
compileRasterSuccessorChain(source)
```

which compiles an arbitrary-length **linear chain** of independently generated Raster stages from one existing structural/runtime stage.

This is a route-authoring helper. It does not replace the Route DAG, browser loop, renderer, vehicle physics, Guide math, Raster compiler or stage environment compiler.

## Authority boundaries

The chain compiler owns only:

```text
existing source stage
+ ordered successor steps
→ generated structural successors
→ declarative stage rows
→ physical transition gate rows
→ physical handoff seam rows
→ one final physical FINISH row
```

Each successor step still delegates geometry construction to the M6.29 authority:

```text
createRasterStageSuccessor(currentStructural, successorAuthoring)
```

Therefore the frozen Raster rule remains unchanged:

```text
absolute turn at one Raster vertex <= 10°
```

`compileRasterCourse()` remains the final geometry authority. M6.31 adds no tolerance and no alternate geometry path.

## Environment/content ownership

The chain compiler does **not** invent stage scenery or route-side presentation policy.

For every generated structural stage it calls:

```text
createRuntime(structural, packageId, stageId, stepIndex)
```

The caller remains responsible for compiling ordinary `StageRuntimeContentPackage` content such as:

- height profile
- terrain profile
- GroundMap profile
- SurfaceMap
- Far Background
- world sprites

The callback must return a runtime package whose `packageId` matches the authored step and whose `coordinateFrame` is exactly the generated successor GuideChart. Mismatch is rejected before Route DAG compilation.

## Derived stage kinds

Given:

```text
SOURCE
step 0 -> MID
step 1 -> GOAL
```

the compiler derives:

```text
SOURCE  kind=STAGE
MID     kind=STAGE
GOAL    kind=TERMINAL
```

Only the last generated stage is terminal. The source stage is always emitted as a non-terminal stage because a non-empty chain necessarily leaves it.

Empty chains are rejected.

## Derived physical transition geometry

For each step, transition and handoff geometry are expressed in the **source GuideChart active at the beginning of that step**.

```text
source chart
  sourceTransitionS -> physical transition gate
  sourceSeamS       -> physical handoff seam
```

This is important: the gate/seam belongs physically to the stage being left. M6.31 does not infer it from renderer state or the target stage.

The generated successor itself supplies `sourceTransitionS` and `sourceSeamS`, so no duplicate chainage authoring is required.

The final FINISH is derived from:

```text
final generated GuideChart + finishS
```

## Coordinate continuity

M6.31 does not move the vehicle.

The established transaction remains:

```text
physical transition gate
→ Route DAG transition accepted
→ PENDING
→ physical handoff seam crossed forward
→ COMMIT target chart/runtime
```

Vehicle world X/Y/Z, yaw and velocities are not rewritten by the chain compiler.

The successor factory continues to validate overlap geometry through the existing `StageContinuationLink` mechanism, including the `D_cam` overlap requirement.

## Opaque package repackaging

M6.30 had one validated terminal runtime whose geometry needed to become an intermediate stage without changing its content objects.

M6.31 provides:

```text
repackageGuideChartRuntime(runtime, packageId)
```

This helper changes only opaque package identity. It keeps the same GuideChart, road view, SurfaceMap, GroundMap, height, terrain, Far Background and sprite references.

It is not a coordinate transformation.

## M6.30 delegation

M6.30 now uses the generic chain compiler for the deep LEFT section instead of directly calling `createRasterStageSuccessor()`.

The live route remains:

```text
              ┌→ STAGE_2_L → STAGE_3_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R ─────────────→ GOAL_R
```

Only the LEFT `STAGE_3_L -> GOAL_L` construction is delegated to a one-step M6.31 chain. The visible fork and RIGHT path remain ordinary declarative route authoring.

This demonstrates that the chain primitive composes with the existing M6.28 declarative DAG compiler rather than replacing it.

## Regressions

M6.31 adds five regressions:

1. two-step chain compilation derives source/intermediate/terminal stage kinds, transitions and final FINISH;
2. physical transition/handoff rows are derived from the correct source chart;
3. empty chains, duplicate IDs and runtime/chart mismatches are rejected;
4. the chain runtime primitive has no renderer, Route-DAG implementation or vehicle-physics dependency, and M6.30 delegates to it;
5. runtime repackaging changes only opaque package identity.

The two-step regression is intentionally deeper than the current one-step M6.30 delegation. It proves that the primitive is recursively reusable rather than merely a renamed one-stage helper.

## Frozen renderer status

Unchanged:

```text
world-space physics authority
one chainage -> one scanline
pseudo-depth = signed cyclic chainage difference only
same d -> same scale
no camera-space Z depth
no Euclidean renderer depth
no lateral depth correction
Raster Segment road
Terrain + World Sprite shared far->near Painter
no z-buffer
no polygon road
no perspective-correct texture
0/1 transparency
camera roll 0
```

The renderer imports no M6.31 topology information.

## Next

The next useful proof is to move from a helper that produces one linear chain fragment to a higher-level **route branch authoring composition** that can combine multiple successor chains with explicit junction/fork transitions while still compiling to the existing M6.28 declarative Route DAG and preserving one active Raster road domain at a time.
