# M6.44 — Open Path Core

## Purpose

M6.43 separated product route shape from generic route/runtime machinery, but the oldest geometry layer still carried a historical assumption that every Raster/Guide course eventually wrapped from its last point back to its first point.

That assumption was convenient for the original closed DEV course, but it was the wrong general primitive for the actual product:

```text
LINEAR     point-to-point
BRANCHING  Out Run-style point-to-point
CIRCUIT    future explicit closed topology
```

M6.44 removes cyclic topology from the renderer/geometry primitive itself.

The general rule is now:

> **RasterPath / GuidePath / pseudo-depth are open and topology-neutral. Closure is an explicit higher-layer special case.**

## Open RasterPath

`src/core/course.ts` now compiles only consecutive authored vertices:

```text
v0 -> v1 -> ... -> vN
```

It no longer creates an implicit:

```text
vN -> v0
```

The path chainage domain is:

```text
0 <= s <= L
```

Sampling outside that domain is invalid instead of being modulo-wrapped.

### Endpoint geometry

Only interior Raster vertices have two incident segments and therefore an actual turn/miter.

The endpoint rule is now explicit:

```text
first turn = 0
last turn  = 0
endpoint basis = adjacent segment basis
```

The frozen interior hard limit remains:

```text
|turn| <= 10 degrees
```

No limit was widened to make open paths easier to author.

## Open GuidePath

`src/core/guide-curve.ts` follows the same open-domain rule.

Interior fillets remain exactly the existing Guide construction. Endpoints have no synthetic neighbor across a hidden wrap seam, so they receive no wrap fillet.

Guide sampling is non-cyclic. Local world-to-Guide search clips its candidate segment window at the real beginning/end rather than wrapping indices to the opposite side of the course.

This keeps Guide a coordinate/camera helper and prevents topology from leaking into geometric nearest-point logic.

## Topology-neutral pseudo-depth

The canonical renderer depth is now mechanically simple:

```text
d = s_render - s_camera
```

`src/core/projection.ts` no longer needs a course length to decide whether an object is in front of the camera.

The same authority is used by terrain and world sprites.

Nothing changed about the projection invariants:

```text
same d -> same scale
same d + same height -> same screen Y
```

The renderer still does not use:

- Euclidean camera distance;
- camera-space Z;
- lateral displacement as a depth correction;
- route identity;
- lap/circuit state.

## Camera chainage

M2/M3/M4/M5 camera implementations no longer apply `wrapPositive()` to:

```text
s_vehicle - D_cam
```

The camera equation is therefore always the same:

```text
s_camera = s_vehicle - D_cam
```

The authoring/compiler layer owns sufficient run-in/runout around normal play.

The fixed metric authority is unchanged:

```text
player width = 2.0 m = 80 px
player-depth scale = 40 px/m
D_cam = f / 40
```

## Terrain endpoint behavior

`src/road/terrain-line.ts` intersects the forward visible interval with the real open path interval.

Near an authored endpoint:

```text
visible terrain interval becomes shorter
```

It does not:

```text
end -> beginning
```

No renderer branch asks whether the current course is LINEAR, BRANCHING or CIRCUIT.

## Open SurfaceMap

The same architectural correction was applied to physical surface lookup.

`src/physics/surface-map.ts` now has:

```text
SurfaceMap        general open [0,L] authority
CyclicSurfaceMap  explicit closed-course adapter
```

Generated point-to-point successor stages use `SurfaceMap`.

The existing closed DEV surface fixture can still deliberately select `CyclicSurfaceMap`, but cyclic physical addressing is no longer silently inherited by every stage.

## Successor factory cleanup

The most important hidden cyclic dependency outside Core was in `src/runtime/raster-stage-successor.ts`.

Before M6.44 it could obtain a successor tail by walking to the source endpoint and then wrapping into the source beginning. It also contained endpoint-turn modulo logic and a `finishClosureMargin` constraint whose only purpose was to keep FINISH before the manufactured closure seam.

M6.44 removes all three assumptions.

### New successor construction

A successor now:

1. copies only the exact source overlap required for the physical handoff;
2. takes the ordinary source forward tangent at the overlap cut;
3. authors an independent open forward runout;
4. optionally applies a smooth `sin^2` lateral excursion to distinguish generated geometry;
5. returns to the same forward tangent without closing a loop;
6. retains enough forward envelope to itself become the source of another successor.

Runout vertices are spaced no farther apart than the authored overlap margin so a later successor seam always has an ordinary forward segment available.

The existing Core 10-degree Raster limit still validates the generated result.

FINISH now has the direct invariant:

```text
finishS < guide.length
```

There is no closure margin because there is no closure seam.

## Deep route preservation

Removing hidden closure was not allowed to weaken the existing deep live route.

The current route still validates:

```text
STAGE_1
  -> STAGE_2
  -> STAGE_3
  -> STAGE_4 fork
  -> terminal goal
```

on both LEFT and RIGHT families.

Successor-of-successor construction, route fragments, stage-local forks, multi-actor arbitration, rival traversal and browser-order integration all continue to run through ordinary open stage geometry.

This is the key architectural result: deep point-to-point content no longer depends on a fake loop underneath it.

## M5.9 workload re-observation

Removing topology-aware projection changed one observed tunnel stress measurement by one destination pixel:

```text
maxSpriteWrittenPixelsPerScanline
277 -> 278
```

The renderer was not modified to preserve the old measurement. The M5.9 observed baseline was re-recorded at 278 while all workload limits and projection rules remain intact.

## M6.44 hardening follow-up

The post-merge review identified two places where the implementation could enforce the new authority more strongly without changing runtime behavior.

First, `pseudoDepth()` is now strictly a two-argument API:

```text
pseudoDepth(s_render, s_camera)
```

The temporary ignored rest parameter is removed, and the M5 DEV camera state no longer carries a compatibility `courseLength` field. A stale three-argument topology-aware call therefore fails at TypeScript compile time instead of being silently accepted.

Second, the general/open versus explicit/cyclic SurfaceMap split is directly regression-tested:

```text
SurfaceMap        out-of-domain s -> RangeError
CyclicSurfaceMap  wrap only when explicitly selected
```

The CI workflow is also hardened. Pull-request validation explicitly checks out `pull_request.head.sha` rather than GitHub's synthetic merge ref and then asserts:

```text
git rev-parse HEAD == expected source SHA
```

This makes the repository's “validated exact head” rule mechanical rather than procedural.

## M6.44 dedicated regressions

M6.44 now has ten direct regressions:

1. RasterPath has no last-to-first segment;
2. Raster endpoints have no synthetic closure turn/miter;
3. Raster sampling does not wrap out-of-range chainage;
4. Guide endpoints have no wrap fillet and Guide sampling is non-cyclic;
5. local world-to-Guide search clips instead of wrapping indices;
6. renderer pseudo-depth is render-chainage difference only;
7. same pseudo-depth preserves identical scale without topology input;
8. forward terrain visibility clips at the open endpoint rather than wrapping;
9. general `SurfaceMap` rejects chainage outside `[0,L]`;
10. cyclic surface wrapping exists only through explicit `CyclicSurfaceMap` selection.

The suite count after the hardening follow-up is:

```text
369 tests
```

## Preserved boundaries

M6.44 does not move route topology into the renderer. It does the opposite.

The following remain outside renderer Core:

- RouteDag;
- physical branch selection;
- shared field branch locks;
- PENDING/COMMIT handoffs;
- mode choice;
- rival cardinality;
- future circuit/lap topology.

A future circuit implementation must explicitly own its closed topology and may use named cyclic adapters where appropriate. It must not restore implicit modulo behavior to RasterPath, GuidePath, camera pseudo-depth or Painter ordering.

## Primary files

```text
src/core/course.ts
src/core/guide-curve.ts
src/core/projection.ts
src/road/terrain-line.ts
src/physics/surface-map.ts
src/physics/stage-surface-map-view.ts
src/runtime/raster-stage-successor.ts
src/dev/m2-camera.ts
src/dev/m3-camera.ts
src/dev/m4-camera.ts
src/dev/m5-camera.ts
src/main.ts
.github/workflows/pages.yml
tests/m1-core-geometry.test.mjs
tests/m6-44-open-path-core.test.mjs
```

Normative freeze delta is recorded in:

```text
docs/00b_core_design_freeze_addendum_m6_44.md
```
