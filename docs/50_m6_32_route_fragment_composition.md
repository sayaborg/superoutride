# M6.32 — Declarative Route Fragment Composition

## Goal

M6.31 can generate arbitrary linear Raster successor chains. A real point-to-point route also needs explicit fork/junction transitions and independently authored branch pieces.

M6.32 adds a small composition layer above the existing M6.28 declarative route compiler:

```text
DeclarativeRouteFragment[]
→ composeDeclarativeLiveRouteAuthoring()
→ DeclarativeLiveRouteAuthoring
→ compileDeclarativeLiveRoute()
→ validated LiveRouteRuntimeAssembly
```

The new layer does not replace RouteDag, route-gate validation, handoff validation, runtime content validation, the browser loop, renderer Core or vehicle physics.

## Fragment contract

A fragment is only a bundle of already-declarative rows:

```text
stages?
transitions?
finishes?
```

Fragments may intentionally repeat a stage where independently authored route pieces join.

A repeated stage id is canonicalized only when both are true:

```text
same RouteStageKind
same runtime object identity
```

This deliberately uses exact runtime identity rather than package-id similarity. Two independently constructed packages with the same opaque id are not silently treated as the same stage definition.

Conflicting shared stages are rejected before RouteDag compilation.

## Id collision policy

Stage rows are the only mergeable identities.

The following are never merged and must remain globally unique across all fragments:

```text
transition id
physical transition-gate id
physical handoff-seam id
physical FINISH-gate id
```

A terminal stage may own only one FINISH row.

The composed startStageId must resolve to an authored canonical stage.

These checks are composition-time hygiene. They do not weaken or replace lower validators.

## Downstream authority remains M6.28

After canonicalization, M6.32 always calls the established compiler:

```text
compileDeclarativeLiveRoute(...)
```

Therefore final authority remains:

```text
RouteDag cycle/reachability checks
RouteStageContentManifest package binding checks
StageRuntimeContentRegistry checks
physical RouteBoundaryGateSet checks
RouteStageHandoffManifest checks
LiveRouteRuntimeAssembly cross-checks
```

M6.32 does not duplicate these rules.

## Current live route composition

The live topology remains unchanged from M6.30:

```text
              ┌→ STAGE_2_L → STAGE_3_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R ─────────────→ GOAL_R
```

M6.30 now builds it from four fragments:

```text
1. root fork
   STAGE_1 + STAGE_2_L + STAGE_2_R
   S1_LEFT + S1_RIGHT

2. LEFT bridge
   shared STAGE_2_L + shared STAGE_3_L
   S2L_CONTINUE

3. M6.31 LEFT successor chain
   shared STAGE_3_L + GOAL_L
   S3L_CONTINUE + GOAL_L FINISH

4. RIGHT terminal fragment
   shared STAGE_2_R + GOAL_R
   S2R_CONTINUE + GOAL_R FINISH
```

The repeated shared stage rows are intentionally the exact same row/runtime objects. The composition path is therefore exercised by the real browser-facing route rather than only by an isolated test fixture.

## Source-chart cleanup

While moving M6.30 into fragments, transition/handoff helper calls were made explicit about the concrete GuideChart of the stage being left.

For a successor:

```text
source GuideChart + sourceTransitionS → physical transition gate
source GuideChart + sourceSeamS       → physical handoff seam
```

This matches the M6.31 rule and avoids treating the generic `StageContinuationLink.sourceFrame` interface as if it were necessarily a GuideChart.

## Renderer status

Unchanged.

The fragment composer imports no renderer or vehicle-physics module. `main.ts` and `m5-renderer.ts` contain no fragment/topology decision and no `STAGE_3_L` / `S3L_CONTINUE` branch special case.

Frozen Core remains:

```text
world-space physics
one chainage → one horizontal scanline
pseudo-depth from signed cyclic chainage only
same d → same scale
Raster Segment road, <=10° per vertex
shared Terrain + World Sprite far→near Painter
no z-buffer / polygon road / perspective-correct texture
0/1 transparency
camera roll 0
```

## Regression coverage

M6.32 adds five dedicated regressions:

1. identical shared stage is canonicalized exactly once;
2. conflicting same-id stage definitions are rejected;
3. cross-fragment transition and physical geometry id collisions are rejected;
4. duplicate FINISH ownership and missing start stage are rejected;
5. the actual M6.30 live route composes from fragments without changing topology, while M6.28 remains the downstream compiler and renderer/main stay route-agnostic.

The permanent real-browser fork-render regression remains active.

## Next

With linear successor chains (M6.31) and safe route-fragment composition (M6.32) available, the next concrete proof should extend the currently shorter RIGHT branch with another independent successor using the same generic primitives. That demonstrates that both branches can grow independently without adding route decisions to the browser loop or renderer.
