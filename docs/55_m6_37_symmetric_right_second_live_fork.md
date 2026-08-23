# M6.37 — Symmetric RIGHT Second Live Fork

## Purpose

M6.36 extracted the complete terminal-to-fork route operation into the reusable `compileRasterForkStageRoute()` compiler. M6.37 proves that extraction is genuinely branch-agnostic by applying the same compiler, unchanged, to the surviving RIGHT terminal.

The live browser route now owns a second physical fork on both major paths:

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → STAGE_4_R_FORK
                                 ├→ GOAL_RA
                                 └→ GOAL_RB
```

No new renderer, camera, input or vehicle-physics mechanism is introduced.

## Authoring composition

M6.35 now exposes its validated LEFT-fork topology as declarative authoring:

```text
createM635SecondLiveForkAuthoring(...)
```

M6.37 consumes that authoring as its upstream source and invokes the existing M6.36 compiler once more:

```text
M6.35 complete LEFT-fork authoring
→ compileRasterForkStageRoute(terminal = GOAL_R)
→ STAGE_4_R_FORK
→ GOAL_RA / GOAL_RB
→ compileDeclarativeLiveRoute()
```

The historical M6.35 runtime fixture remains available and still compiles only the LEFT second fork. M6.37 therefore extends rather than rewrites the earlier milestone.

## RIGHT fork metric authority

The RIGHT fork intentionally uses the same metric cross-section as the validated LEFT fork:

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

M6.34/M6.36 derive:

```text
LEFT child center   = local l -7.5 m
RIGHT child center  = local l +7.5 m
child gate halfwidth = 3.5 m
stage ground envelope = +/-12 m
```

The median is a physical/visual grass region and owns no route gate. Crossing the median therefore selects no branch.

## Route identities

The old RIGHT terminal is promoted without a world transform:

```text
GOAL_R / CONTENT_GOAL_R
→ STAGE_4_R_FORK / CONTENT_STAGE_4_R_FORK
```

Its two physical choices are:

```text
S4R_FORK_A → GOAL_RA / CONTENT_GOAL_RA
S4R_FORK_B → GOAL_RB / CONTENT_GOAL_RB
```

The terminal FINISH gates are:

```text
G_LIVE_FINISH_RA
G_LIVE_FINISH_RB
```

Entering either terminal stage still does not finish the run by itself. Completion requires the normal validated forward physical FINISH crossing.

## Successor and handoff authority

Both RIGHT-fork children use the unchanged M6.29 structural successor path through M6.36:

```text
M6.34 StageJunction
→ M6.35 fork-coordinate adapter
→ M6.29 Raster successor factory
→ compileRasterCourse()
→ StageContinuationLink validation
→ M6.24 environment/runtime package
```

The source branch centers are not repeated in M6.37 authoring. M6.36 derives them from the junction, and each continuation link must preserve:

```text
source local l = -7.5 or +7.5
target local l = 0
```

across the full `D_cam` overlap in world position and heading.

The frozen Raster limit remains authoritative:

```text
absolute turn at one Raster vertex <= 10 degrees
```

## Runtime environment ownership

M6.37 does not move visual identity into the route compiler. The generated child package still receives environment content from the ordinary M6.24 stage-authoring compiler.

Current proof content maps the fork branch side to the existing LEFT/RIGHT authored environments only as content selection:

```text
branch side LEFT  → authored.left
branch side RIGHT → authored.right
```

This does not change geometry, depth, route validation or the renderer.

## Browser entry

`src/dev/m6-27-live-route-runtime.ts` remains the stable browser-facing entry point. It now delegates to:

```text
createM637SymmetricSecondLiveForkRuntime(...)
```

`main.ts` itself is unchanged and contains no `STAGE_4_*`, `GOAL_*A/B` or `S4*_FORK_*` topology identity.

Renderer Core likewise contains none of those identities.

## Full physical RIGHT-B transaction

The dedicated integration regression validates:

```text
S1_RIGHT physical gate
→ PENDING
→ parent → STAGE_2_R seam COMMIT
→ S2R_CONTINUE physical gate
→ PENDING
→ STAGE_2_R → STAGE_3_R seam COMMIT
→ S3R_CONTINUE physical gate
→ PENDING
→ STAGE_3_R → STAGE_4_R_FORK seam COMMIT
→ S4R_FORK_B physical gate
→ PENDING
→ STAGE_4_R_FORK → GOAL_RB seam COMMIT
→ physical GOAL_RB FINISH
```

The handoff commit count is exactly four. No handoff teleports world X/Y/Z, yaw or velocity.

## Validation

M6.36 baseline: 315 tests.

M6.37 adds six dedicated regressions:

1. both LEFT and RIGHT second forks exist in the live topology;
2. RIGHT fork owns the same derived +/-12 m stage-local junction envelope;
3. RIGHT fork has two non-overlapping 3.5 m half-width physical gates and a non-selecting median;
4. RIGHT fork seams map source child centers to target local `l=0`;
5. a complete RIGHT-B route performs four PENDING/COMMIT handoffs and then a physical FINISH;
6. M6.37 reuses M6.36 while stable browser entry, `main.ts` and renderer remain topology-isolated.

Expected complete suite:

```text
321 tests
321 pass
0 fail
```

Implementation CI history:

- first PR candidate: 319/321; all six M6.37 tests passed, and the only two failures were obsolete M6.28/M6.30 static assertions naming the previous M6.35 stable-entry target;
- corrected structural head `1b02995a133f3a4d9502745e1c35671b14920dcb`: 321/321 pass.

## Frozen authorities preserved

M6.37 does not change:

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
- physical gate → PENDING → forward seam → COMMIT transaction;
- explicit physical FINISH authority.
