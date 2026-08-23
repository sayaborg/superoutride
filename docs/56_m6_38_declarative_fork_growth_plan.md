# M6.38 — Declarative Fork-Stage Growth Plan

## Purpose

M6.35 and M6.37 proved that the M6.36 fork-stage compiler can construct the same physical second fork on either major route branch. Their live construction, however, still nested milestone-specific constructors:

```text
M6.37
→ M6.35
→ M6.30
```

M6.38 removes that nesting without inventing another geometry system. The new generic layer is deliberately only an ordered fold over the unchanged M6.36 compiler:

```text
base DeclarativeLiveRouteAuthoring
+ ordered terminal→fork steps[]
→ compileRasterForkGrowthPlan()
→ final DeclarativeLiveRouteAuthoring
```

Every physical fork step still flows through `compileRasterForkStageRoute()` and therefore retains the existing stage-local junction, Raster successor, package/chart validation, physical gate, handoff seam and FINISH authorities.

## Generic fold

`src/runtime/raster-fork-growth-plan.ts` exposes:

```text
RasterForkGrowthStep
CompiledRasterForkGrowthPlan
compileRasterForkGrowthPlan(upstream, steps)
```

The implementation owns no geometry mathematics. It only executes:

```text
authoring = upstream
for step in steps:
    result = compileRasterForkStageRoute({ ...step, upstream: authoring })
    authoring = result.authoring
return { authoring, compiled steps }
```

A zero-step plan is identity: it returns the exact same upstream authoring object and an empty compiled-step list.

This means validation remains located where it already belongs. M6.38 does not duplicate:

- terminal-promotion checks;
- stage-local junction compilation;
- child-road center derivation;
- Raster successor generation;
- <=10° Raster vertex validation;
- package/chart/world-frame ownership checks;
- transition gate geometry;
- handoff seam geometry;
- terminal FINISH geometry;
- RouteDag / fragment validation.

## Live M6.38 authoring

`src/dev/m6-38-declarative-fork-growth-plan.ts` starts directly from the M6.30 declarative base:

```text
createM630ThirdLiveSuccessorAuthoring(...)
```

It then declares exactly two ordered fork-growth rows:

```text
1. GOAL_L → STAGE_4_L_FORK → GOAL_LA / GOAL_LB
2. GOAL_R → STAGE_4_R_FORK → GOAL_RA / GOAL_RB
```

The live route therefore remains exactly:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

M6.38 changes authoring composition only. It does not change route behavior or route geometry.

## Shared second-fork recipe

The two live rows share one stage-local metric recipe:

```text
incoming road width = 7 m
child road width    = 7 m
final median width  = 8 m
shoulder width      = 1 m
widen start         = s 80
median start        = s 110
separated start     = s 170
physical route gate = s 195
source seam minimum = s 235
```

M6.34/M6.36 continue to derive:

```text
LEFT child center    = local l -7.5 m
RIGHT child center   = local l +7.5 m
child gate halfwidth = 3.5 m
stage ground envelope = +/-12 m
```

The successor recipe also remains the already validated M6.29/M6.35 recipe:

```text
overlap margin           = 30 m
transition lead          = 20 m
finish after seam        = 140 m
deformation              = 2.5 m
gentle source-turn limit = 5°
minimum deformation run  = 5 vertices
D_cam                    = 5 m
d_max                    = 150 m
finish closure margin    = 20 m
GroundMap half-width     = 12 m
single-road ground half  = 4.5 m
shoulder                 = 1 m
```

Final Raster validity is still decided only by `compileRasterCourse()` and the frozen <=10° one-vertex rule.

## Content ownership

The fold does not own environment selection. The live authoring supplies one M6.24 runtime callback. Each generated branch receives ordinary stage-local authored environment content:

```text
branch side LEFT  → authored.left
branch side RIGHT → authored.right
```

This is only package content selection. It does not affect route validation, world-space physics, pseudo-depth or renderer behavior.

## Stable browser entry

The public browser-facing dev entry remains:

```text
createM627LiveRouteRuntime(...)
```

Its delegate advances to:

```text
createM638DeclarativeForkGrowthRuntime(...)
```

`main.ts` remains unchanged. Renderer Core remains unchanged. Neither knows M6.38 route identities or the growth-plan abstraction.

## Exact M6.37 preservation proof

M6.38 adds six dedicated regressions. Rather than merely checking a few counts, the new runtime is compared directly with the already validated M6.37 runtime.

The tests prove exact equality of:

1. RouteDag stage ids/kinds and transition topology;
2. stage→package bindings and package→GuideChart identities;
3. every physical transition and FINISH gate id, owner, center, heading and half-width;
4. every handoff seam id, choice, target chart, center, heading and half-width;
5. the two-step fold order and zero-step identity behavior;
6. dependency isolation and removal of M6.35/M6.37 constructor nesting from the live path.

Therefore M6.38 is an authoring simplification with no intended runtime behavior change.

## CI history

M6.37 baseline:

```text
321 tests
```

M6.38 adds six regressions for:

```text
327 tests
```

Implementation history:

- initial PR candidate failed TypeScript because the two branch rows widened from a readonly 2-tuple to a general readonly array;
- tuple typing was fixed with no behavior change;
- next candidate reached 323/327: all six M6.38 regressions passed, while four historical static assertions still named the previous M6.37 stable-entry target;
- those four assertions were updated to validate the current layering while preserving all historical runtime/geometry fixtures;
- structural head `c086ec6ed3dfb7f461e9b284284e8032b2b3fe48` passed **327/327 / 0 fail**.

A documentation-inclusive exact head must independently reproduce the same result before main fast-forward.

## Frozen authorities preserved

M6.38 does not change:

- world-space vehicle physics authority;
- free lateral/diagonal vehicle motion;
- one-chainage→one-scanline raster road;
- chainage-only pseudo-depth;
- same-depth scale and height/Y invariants;
- fixed metric 2.0 m = 80 px player reference at `D_cam=5 m`;
- Raster vertex turn <=10°;
- Terrain + WorldSprite far→near Painter;
- no z-buffer / polygon-road / perspective-correct texture path;
- no arbitrary runtime sprite rotation;
- 0/1 transparency;
- camera roll = 0;
- GroundMap / SurfaceMap independence;
- full-image Far Background authority;
- world-space physical branch gates;
- physical gate → PENDING → forward seam → COMMIT;
- explicit physical FINISH requirement.
