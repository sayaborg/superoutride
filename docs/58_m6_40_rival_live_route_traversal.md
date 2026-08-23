# M6.40 — Rival Live Route Traversal

## Purpose

M6.39 proved that the deep live route survives repeated physical gate/handoff transactions in browser update order, and made the DEV rival steering boundary aware of `GuideCoordinateSource` so stage-local lateral coordinates remain valid after chart rebasing.

M6.40 takes the next step: the rival is no longer a parent-course-only object. It owns an **independent route state, handoff state and active runtime package** over the exact same compiled `LiveRouteRuntimeAssembly` used by the player.

The milestone deliberately does not add rival-specific renderer topology, a second road model, or a second route system.

Vehicle handling remains `DEV_UNCALIBRATED`.

## Generic live-route traveler

`src/runtime/live-route-traveler.ts` introduces an actor-independent state wrapper:

```text
LiveRouteTravelerState
  RouteDagState
  RouteStageHandoffState
  previous world XZ
```

It owns no vehicle, camera or renderer state.

For each authoritative world-motion sample:

```text
physical route gate observation
→ RouteDag update
→ queue PENDING handoff
→ physical handoff seam observation
→ COMMIT if validated
→ otherwise synchronize active chart coordinate
```

The caller owns ordinary physics and only mirrors `handoffState.coordinate` into its vehicle's cached `course` coordinate after a returned `COMMITTED` event.

Recovery uses `resyncLiveRouteTraveler()`: it moves only the observation origin / chart coordinate and cannot manufacture a route transition.

## Independent player and rival route state

The player retains the existing browser transaction introduced before M6.40.

The rival now separately owns:

```text
rivalTraveler.routeState
rivalTraveler.handoffState
rivalTraveler.previousWorldPoint
```

Therefore one actor can select or commit a branch without mutating the other actor's route history, package or chart.

Both actors still share the immutable compiled route assembly:

```text
RouteDag
RouteStageContentManifest
Guide charts
physical RouteBoundaryGateSet
physical RouteStageHandoffManifest
StageRuntimeContentRegistry
```

No duplicated rival route topology exists.

## DEV route-driving intent

`src/dev/m6-40-rival-live-route.ts` defines one deterministic test/gameplay intent:

```text
S1_RIGHT
→ S2R_CONTINUE
→ S3R_CONTINUE
→ S4R_FORK_B
→ GOAL_RB
```

This list is **not route authority**. It is only a steering plan. A route transition still occurs only when the rival's actual world-motion segment crosses the corresponding validated physical gate.

The plan compiler verifies that each choice leaves the previous stage and that the sequence ends at a terminal stage.

## Junction-aware steering target

The rival does not snap directly from local `l=0` to a final branch center.

`sampleLiveRouteChoicePlanTargetL()` derives the intended physical gate center in the active coordinate source, then follows the active package's authored junction geometry:

```text
before widening       → l = 0
road widening         → smooth movement toward half child-road width
median growth         → actual authored child-center progression
fully separated road  → final physical gate center
```

For the current parent RIGHT branch this reproduces the established progression, including the final local/source target of +7.5 m.

The same logic works in `STAGE_4_R_FORK`, whose coordinate frame has a non-zero lateral origin. Stage-local `l` remains the AI contract; source-origin conversion stays inside the coordinate source.

## PENDING chart authority

A subtle ordering rule is explicit in M6.40:

```text
physical route gate crossed
→ RouteDag activeStageId advances
→ handoff remains PENDING
→ old chart/package remains active
→ later seam COMMIT
→ handoff activeStageId/chart/package advances
```

Therefore steering geometry during PENDING must use:

```text
handoffState.activeStageId
```

not the already-advanced:

```text
routeState.activeStageId
```

This preserves the same old-chart-until-COMMIT authority already used by physics and rendering.

## Browser rival integration

`src/main.ts` now performs the rival tick using its own active package:

```text
resolve rival runtime
→ sample stage-local route-plan target l
→ sampleRivalDrivingInput(active coordinate source)
→ ordinary M5 car physics using active HeightProfile + SurfaceMap
→ recovery or physical route traveler update
→ on COMMIT only: rival.course = committed coordinate
```

The player path is not rewritten by M6.40.

The old parent-only code path:

```text
sampleM613RightBranchTargetL(rival.course.s)
updateM5Car(parent guide, parent height, parent surface, rival, ...)
```

is removed from the browser rival loop.

The legacy parent closed-course `RaceProgress` remains a diagnostic only. Once the rival leaves the parent runtime, that diagnostic is not allowed to reinterpret child-stage chainage as parent chainage.

## Rival rendering

The rival remains an ordinary dynamic `CourseSprite` generated from authoritative world pose.

Its `sRender` is meaningful to the player's renderer only if both actors currently occupy the same runtime package. M6.40 therefore uses one compatibility rule:

```text
playerRuntime.packageId === rivalRuntime.packageId
```

If package identities differ, the rival sprite is not injected into that package's Painter input. No world-proximity heuristic and no route-choice identity is used.

Renderer Core remains unchanged and contains no M6.40, RIGHT-B or rival-route topology logic.

## Dedicated regressions

M6.40 adds six tests:

1. the DEV RIGHT-B plan is a valid ordered route ending at `GOAL_RB`;
2. steering target follows authored junction growth and preserves old-chart authority while PENDING;
3. two travelers are state-independent and one can COMMIT without mutating the other;
4. RIGHT-B traversal preserves stage-local target semantics through continuations and the non-zero-origin second fork;
5. rival render compatibility depends only on active package identity;
6. the generic traveler has no renderer/vehicle-physics dependency and the browser is statically locked to the new traveler wiring while renderer Core remains route-opaque.

M6.39 ended at 329 tests. M6.40 therefore targets 335 total tests.

## Frozen architecture preserved

M6.40 does not alter:

- world-space vehicle authority;
- chainage-only pseudo-depth;
- one-chainage/one-scanline road rendering;
- Raster <=10° vertex rule;
- Guide Curve coordinate/camera role;
- fixed metric sprite authority;
- Painter ordering;
- physical world-gate route selection;
- PENDING-before-COMMIT semantics;
- COMMIT world-pose invariance;
- package-owned visual/runtime content;
- renderer route opacity.

## Validation

Browser-integrated structural head before documentation synchronization:

```text
27738b46a1e639d6ccebcb786c607a17f7388438
workflow 32658502113
build job 97240954614
335 tests
335 pass
0 fail
```

An earlier M6.40 CI run failed only because the new generic code directly accessed `lateralOrigin` on the backwards-compatible `GuideCoordinateSource` union. The fix uses the existing `guideCoordinateLateralOrigin()` helper, preserving plain-`GuideCurve` compatibility.

The documentation-inclusive final exact head must independently reproduce **335/335 / 0 fail** before main is fast-forwarded.

## Next

**M6.41 — Route-Aware Point-to-Point Progress / Ranking.**

The old M6.0–M6.2 `RaceProgress` remains tied to the parent closed-course diagnostic ruler. Now that player and rival can independently occupy different stage packages, the next useful layer is a route-aware point-to-point progress/ranking coordinate that compares competitors across different local Guide charts without treating raw local chainage as globally comparable.
