# SUPER OUTRIDE — M6.28 Declarative Live Route Compilation

## Purpose

M6.28 makes the current point-to-point route declarative without changing browser simulation semantics or renderer mathematics.

M6.27 gave `main.ts` one validated browser-facing `LiveRouteRuntimeAssembly`. M6.28 moves the construction behind that assembly from milestone-specific calls to stage / transition / finish rows compiled by one generic route compiler.

The live route remains:

```text
              ┌→ STAGE_2_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R → GOAL_R
```

## Declarative authority

A stage row owns only:

```text
id
kind
runtime package
```

A transition row owns:

```text
id
fromStageId
toStageId
physical transition-gate geometry
deferred handoff-seam geometry
```

A terminal finish row owns:

```text
stageId
physical FINISH-gate geometry
```

The authoring therefore states topology and physical boundary geometry directly, but does not repeat references that can be derived safely.

## Derived references

`compileDeclarativeLiveRoute()` derives:

```text
Route choiceId        = transition.id
handoff targetChartId = target stage runtime.coordinateFrame.id
content packageId     = stage.runtime.packageId
chart set             = unique stage runtime GuideChart objects
initialChart          = start stage runtime coordinateFrame
```

This removes three common classes of route-authoring mismatch:

- edge ID and physical gate choice ID drifting apart,
- handoff target chart disagreeing with the target stage runtime package,
- Route Stage content binding disagreeing with the package actually supplied for the stage.

## Compilation chain

The generic compiler still uses the existing specialized validators rather than replacing them:

```text
DeclarativeLiveRouteAuthoring
→ compileRouteDag()
→ compileRouteStageContentManifest()
→ compileStageRuntimeContentRegistry()
→ compileRouteBoundaryGateSet()
→ compileRouteStageHandoffManifest()
→ compileLiveRouteRuntimeAssembly()
```

Thus the declarative layer reduces duplicated authoring while retaining the lower-level invariants already proven by M6.8–M6.27.

## Exact geometry preservation

M6.28 does not redesign the current route geometry. The current authoring reuses the same M6.26 child/successor coordinate sources and calculates physical transition gates, handoff seams, and FINISH gates from the same world-space points.

The M6.28 regression suite directly compares the declaratively compiled route against the M6.26 compiled route and verifies, for every gate/seam:

- ID,
- world X,
- world Z,
- heading,
- half width,
- route choice association,
- handoff target chart.

This comparison is numerical, not merely structural.

## Runtime package ownership

M6.26 runtime content construction now exposes the complete five runtime package objects before content-manifest compilation:

```text
CONTENT_STAGE_1
CONTENT_STAGE_2_L
CONTENT_STAGE_2_R
CONTENT_GOAL_L
CONTENT_GOAL_R
```

Legacy M6.26 registry compilation remains a thin wrapper around the same package source, so historical tests and the new declarative compiler share one package authority.

Each stage row owns one of those complete runtime packages. Content bindings are then derived from that ownership instead of being authored separately.

## Stable browser boundary

`main.ts` still imports and calls only:

```text
createM627LiveRouteRuntime(...)
```

M6.28 changes the implementation behind that stable entry point:

```text
createM627LiveRouteRuntime(...)
→ createM628DeclarativeLiveRouteRuntime(...)
→ compileDeclarativeLiveRoute(...)
→ LiveRouteRuntimeAssembly
```

No M6.28 topology knowledge enters the browser simulation loop.

## Handoff semantics unchanged

For either route, execution is still:

```text
physical fork gate
→ validated RouteDag transition
→ PENDING
→ parent→child seam COMMIT
→ child physical transition gate
→ PENDING
→ child→successor seam COMMIT
→ successor physical FINISH
```

Declarative compilation does not collapse route selection and content/chart handoff into one event.

Vehicle world pose and motion remain authoritative across COMMIT. Only the active coordinate/chart expression and stage content package change.

## Generic dependency boundary

`src/runtime/declarative-live-route.ts` contains no dependency on:

- renderer Core,
- camera code,
- car physics,
- motorcycle physics,
- M6.26, M6.27, or M6.28 implementation modules.

It is a generic runtime compiler over existing route/content/chart/gate/handoff primitives.

Current route-specific geometry remains in the DEV authoring adapter `src/dev/m6-28-declarative-live-route.ts`.

## Frozen renderer and physics invariants

M6.28 changes none of the frozen rules:

- world X/Y/Z remains physics authority,
- vehicle motion is not snapped to the road centerline,
- one chainage maps to one horizontal scanline,
- pseudo-depth is signed cyclic chainage difference only,
- Euclidean or lateral distance does not change renderer depth,
- same depth means same scale,
- Raster Segment road remains authoritative,
- absolute turn at one Raster vertex remains at most 10°,
- Guide Curve remains coordinate/camera support only,
- Terrain and World Sprite use the same far-to-near Painter,
- no z-buffer,
- no polygon road,
- no perspective-correct ground texture mapping,
- no arbitrary runtime sprite rotation,
- transparency remains binary,
- camera roll remains zero,
- metric player authority remains 2.0m = 80px at player depth.

## Regression authority

M6.28 adds five dedicated tests to the M6.27 baseline of 269, giving a full target of 274 tests.

The dedicated tests prove:

1. the declarative rows compile the same route topology and derived content bindings,
2. physical gates and handoff seams reproduce M6.26 world geometry exactly,
3. `choiceId` and `targetChartId` are derived rather than duplicated,
4. `main.ts` remains behind the M6.27 stable assembly entry,
5. the generic compiler remains renderer/camera/vehicle/milestone independent.

## Next architectural direction

The route graph itself is now declarative, but construction of the stage runtime packages and independent successor geometry still begins from M6.26-specific helpers. A next step can make stage continuation/content factories reusable enough that adding another stage depth requires mostly new stage rows and geometry/content authoring, rather than another milestone-specific route constructor.

That work must continue to preserve the same world-space overlap validation and the frozen raster renderer.
