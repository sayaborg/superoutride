# M6.36 — Reusable Fork-Stage Route Authoring

## Purpose

M6.35 proved that a later stage can own a second real physical fork. M6.36 removes the milestone-specific assembly that was still required to build that fork.

The new generic compiler promotes one existing terminal stage into an ordinary fork stage, attaches an M6.34 stage-local junction, generates two independent M6.29 Raster successors, derives physical transition/handoff/FINISH geometry, and returns ordinary declarative route authoring for the unchanged M6.28 compiler.

Renderer Core, camera and vehicle physics remain outside this layer.

## Compiler

```text
compileRasterForkStageRoute(authoring)
```

Input authority consists of:

```text
upstream declarative route
terminal stage to replace
new fork stage/package identity
StageJunctionAuthoring
route-gate chainage
two branch identities + Raster successor authoring
runtime-content callback for each generated child
```

The branch rows do **not** author:

```text
sourceLocalL
roadHalfWidth
physical transition center/heading/width
physical handoff center/heading/width
physical FINISH center/heading/width
```

Those values are derived from compiled geometry.

## Terminal promotion

The source stage must:

- exist exactly once;
- be `TERMINAL`;
- own no outgoing transition;
- own exactly one physical FINISH;
- own a `StageRoadView`.

The old runtime is repackaged with a new opaque package id. This changes package identity only; it performs no coordinate or world transform.

The old terminal row is replaced by an ordinary fork-stage row. Every upstream transition that previously targeted the terminal is retargeted to the fork stage, and only that terminal's old FINISH row is removed.

## Junction-derived branch geometry

M6.36 delegates the visible/physical cross-section to M6.34:

```text
compileStageJunction(...)
```

The fork route gate must lie on or after `sSeparatedStart` and before the active Guide closes.

For each branch:

```text
sourceLocalL = junction.separatedChildCenterL(side)
childHalfWidth = childRoadWidth / 2
```

Therefore the route author cannot independently drift the physical gate away from the visible child road or give it a different width.

For the current M6.35 content this still derives:

```text
LEFT  sourceLocalL = -7.5 m
RIGHT sourceLocalL = +7.5 m
child half-width    = 3.5 m
required ground     = +/-12 m
```

## Successor construction

Each branch delegates structural continuation to the existing fork coordinate adapter and M6.29 factory:

```text
createRasterForkStageSuccessor()
  → createRasterStageSuccessor()
  → compileRasterCourse()
```

The generic fork-stage compiler injects `roadHalfWidth = childRoadWidth / 2`; branch authoring cannot provide a conflicting road width.

The public continuation link remains:

```text
source child center -> target local l=0
```

and must validate the complete `D_cam` overlap in world position and heading.

The frozen Raster authority remains unchanged:

```text
absolute turn at one Raster vertex <= 10 degrees
```

## Physical route geometry

For each branch M6.36 derives:

```text
transition gate = fork chart at routeGateS, sourceLocalL
handoff seam    = fork chart at sourceSeamS, sourceLocalL
FINISH gate     = target chart at finishS, l=0
```

All three use the derived child road half-width.

The successor handoff seam must be strictly after the route-selection gate.

## Runtime ownership validation

The caller remains responsible for child environment/content through a callback, because geometry compilation must not own coast/mountain/background choices.

The returned runtime must satisfy:

```text
runtime.packageId      == authored branch package id
runtime.coordinateFrame === generated successor chart
runtime.worldFrameId   == fork-stage world frame
```

Any mismatch is rejected before final Route DAG compilation.

## Composition

M6.36 composes the promoted upstream route and generated fork fragment with M6.32:

```text
upstream declarative authoring
→ terminal promotion
→ fork stage + LEFT/RIGHT child rows
→ composeDeclarativeLiveRouteAuthoring()
→ M6.28 compileDeclarativeLiveRoute()
```

All existing M6.28 validation remains authoritative for cycles, reachability, package bindings, physical gate coverage and handoff coverage.

## M6.35 after extraction

`src/dev/m6-35-second-live-fork.ts` now supplies only:

- concrete stage/package/choice/gate ids;
- junction chainages and metric widths;
- successor deformation/overlap values;
- LEFT versus RIGHT environment authoring.

It no longer manually calls `compileStageJunction()`, `createRasterForkStageSuccessor()`, constructs replacement stage arrays, retargets transitions, or computes physical gate/seam/FINISH geometry.

`main.ts` still calls the stable M6.27 live-route entry, and renderer Core still contains no knowledge of the second fork.

## Validation

M6.35 baseline: 309 tests.

M6.36 adds six dedicated regressions:

1. generic terminal promotion and two-child declarative fragment generation;
2. child centers/gate widths derived from junction authority;
3. source child center -> target local-zero `D_cam` continuation links;
4. rejection of invalid terminal promotion, missing FINISH, duplicate side and pre-separation gate;
5. rejection of runtime package/chart ownership mismatches;
6. dependency isolation and proof that M6.35 delegates to the generic compiler.

Expected complete suite:

```text
315 tests
315 pass
0 fail
```

CI history during implementation:

- first run: TypeScript nullable `roadView` narrowing only; fixed by preserving the already-validated source `StageRoadView` reference;
- second run: 314/315, with all M6.35/M6.36 tests green; the only failure was an obsolete M6.28 static assertion expecting the pre-M6.36 M6.35 entry shape;
- corrected structural head `37aadff76ad70b22d3ba8e8009b94d4e0f5bd83e`: 315/315 pass.

## Frozen authorities preserved

M6.36 does not change:

- world-space vehicle physics authority;
- chainage-only pseudo-depth;
- one-chainage/one-scanline road renderer;
- 2.0 m = 80 px metric player authority at `D_cam=5 m`;
- Raster vertex turn limit <=10 degrees;
- Terrain/WorldSprite far-to-near Painter;
- no z-buffer/polygon road/perspective-correct texture path;
- no arbitrary runtime sprite rotation;
- 0/1 transparency;
- camera roll = 0;
- GroundMap visual / SurfaceMap physical independence;
- physical gate -> PENDING -> forward seam -> COMMIT route transaction.
