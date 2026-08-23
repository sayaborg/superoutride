# SUPER OUTRIDE — M6.27 Live Route Runtime Assembly

## Purpose

M6.27 removes current-route construction knowledge from the browser entry point.

M6.26 proved that one physical fork can hand off into an independent child stage, then into an independent successor stage, while preserving world-space vehicle authority and the frozen raster pseudo-3D renderer. M6.27 packages those already-compiled route pieces behind one validated browser-facing runtime boundary.

The route itself is unchanged:

```text
              ┌→ STAGE_2_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R → GOAL_R
```

## Browser-facing assembly

`LiveRouteRuntimeAssembly` contains only compiled route/runtime tables:

```text
route
content
charts
gates
handoffs
registry
initialChart
```

`main.ts` receives this bundle from `createM627LiveRouteRuntime()` and no longer constructs the M6.26 Route DAG, continuation, gates, handoff manifest, or stage runtime registry directly.

The simulation loop remains unchanged in principle:

```text
world physics
→ physical route gate observation
→ validated Route DAG update
→ queue PENDING handoff
→ physical seam observation
→ COMMIT chart/content
→ continue world physics
→ physical FINISH
```

## Cross-layer compile validation

The generic `compileLiveRouteRuntimeAssembly()` is not merely a convenience wrapper. It validates assumptions that were previously distributed across separately compiled tables.

For every route choice:

1. a physical TRANSITION gate must exist,
2. a handoff seam must exist,
3. the handoff target chart must exist,
4. the choice target stage must have a content binding,
5. that package must have runtime content,
6. the runtime package's `coordinateFrame` must be the exact same GuideChart object as the handoff target chart.

The compiler also verifies:

- the initial chart belongs to the chart set,
- the route start stage has content/runtime,
- the start runtime coordinate frame is exactly the initial chart,
- content and runtime registry share one world frame,
- every terminal stage owns a physical FINISH gate,
- no extra unreachable chart is silently carried in the live bundle.

A broken cross-layer reference therefore fails before simulation starts rather than appearing later as a wrong-road handoff.

## Identity, not approximate equality

M6.27 deliberately checks GuideChart reference identity where ownership must be singular.

The target runtime package and handoff manifest are not permitted to contain two independently created charts that happen to have equal numbers. They must refer to the same compiled coordinate-frame object.

This keeps one authority for the active Guide chart and avoids hidden transformations or divergent state.

## Separation from renderer and physics

`src/runtime/live-route-runtime.ts` imports no:

- renderer module,
- camera module,
- car physics,
- motorcycle physics,
- M6.26 milestone implementation.

It is a gameplay/runtime consistency boundary only.

The current route-specific construction remains in the DEV authoring adapter `src/dev/m6-27-live-route-runtime.ts`. This allows later milestones to replace the authored route source without changing the browser loop or generic assembly contract.

## Frozen invariants

M6.27 changes none of the renderer or vehicle rules:

- authoritative vehicle state remains world X/Y/Z,
- vehicle motion is not snapped to a road centerline,
- one chainage maps to one horizontal scanline,
- pseudo-depth is signed chainage difference only,
- lateral position does not alter depth,
- same depth means same scale,
- Raster Segment turn remains at most 10° per vertex,
- Guide Curve remains coordinate/camera support,
- Terrain and World Sprite share one far-to-near Painter,
- no z-buffer,
- no polygon road,
- no perspective-correct ground texture mapping,
- no arbitrary runtime sprite rotation,
- transparency remains binary,
- camera roll remains zero,
- metric player scale remains 2.0m = 80px at player depth.

## Historical fixtures

M6.20 and M6.22 remain independently regression-tested. Their tests still validate the older architecture layers as fixtures, but no longer require `main.ts` to instantiate those milestone constructors directly.

This distinction lets architecture advance without deleting lower-level proofs.

## Regression authority

M6.27 adds five dedicated tests to the M6.26 baseline of 264, giving a target full suite of 269 tests.

The new tests cover:

- complete live-bundle cardinality,
- route target → content → runtime → handoff chart identity,
- rejection of start package/chart mismatch,
- browser consumption through one assembly call,
- dependency isolation of the generic assembly layer.

## Next architectural direction

M6.27 removes route construction details from `main.ts`, but `createM627LiveRouteRuntime()` still explicitly calls M6.26-specific constructors. The next useful simplification is to make the current route itself declarative enough that a generic compiler can assemble a longer stage sequence without adding one constructor call per milestone or route topology.

That change should remain entirely outside renderer Core and should preserve the same physical gate → pending handoff → seam COMMIT transaction.
