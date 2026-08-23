# M6.35 — Second Live Physical Fork

## Purpose

M6.35 turns the reusable M6.34 stage-local junction into a real downstream route decision without changing renderer Core or the browser simulation transaction.

The old LEFT terminal is promoted into an ordinary stage and becomes the source of a second visible fork. The two separated roads are selected only by physical world-space gate crossing and each commits into its own independent successor chart.

## Live topology

```text
STAGE_1
  ├→ STAGE_2_L → STAGE_3_L → STAGE_4_L_FORK
  │                              ├→ GOAL_LA
  │                              └→ GOAL_LB
  └→ STAGE_2_R → STAGE_3_R → GOAL_R
```

The previous `GOAL_L` stage no longer exists in the M6.35 live route. Its validated runtime geometry is repackaged as `CONTENT_STAGE_4_L_FORK`; no world transform is performed by that promotion.

## Second-fork cross-section

`STAGE_4_L_FORK` owns an M6.34 `StageJunction` in active-stage-local coordinates:

```text
incoming road width = 7 m
child road width    = 7 m
final median width  = 8 m
shoulder width      = 1 m
widen start         = s 80
median start        = s 110
fully separated     = s 170
route gates         = s 195
successor seam min  = s 235
```

The derived final child-road centers are:

```text
LEFT  = l -7.5 m
RIGHT = l +7.5 m
```

The required local ground half-envelope is therefore exactly 12 m. GroundMap and SurfaceMap consume the same stage-local `JunctionCrossSectionProfile`; the center median is GRASS and is not a route gate.

## Physical route selection

The second fork adds two declarative transitions:

```text
S4L_FORK_A : STAGE_4_L_FORK → GOAL_LA
S4L_FORK_B : STAGE_4_L_FORK → GOAL_LB
```

Each transition owns a 7 m-wide physical world-space gate centered on its separated child road. The gates do not overlap. Crossing the median creates no route boundary event.

Selection remains:

```text
physical gate crossing
→ TRANSITION_ACCEPTED
→ PENDING
→ old chart/content remains active
→ physical handoff seam crossing
→ COMMIT
→ target chart/content becomes active
```

Steering value, screen X, sprite overlap and renderer state cannot select the branch.

## Fork successor coordinate adapter

The existing M6.29 `createRasterStageSuccessor()` assumes the structural source road is local `l=0`. A second fork needs to start from source child centers at `l=±7.5` while each target chart should again use its own road center as local `l=0`.

M6.35 adds the small reusable adapter:

```text
createRasterForkStageSuccessor(source, {
  sourceLocalL,
  successor
})
```

The adapter does not implement another Raster generator. It temporarily creates a source chart whose lateral origin is shifted onto the chosen child center, delegates all successor geometry to the ordinary M6.29 factory, then recompiles the public `StageContinuationLink` against the real source chart:

```text
source local l = child center (-7.5 or +7.5)
target local l = 0
```

The full `D_cam` overlap is still validated in world position and heading by `compileStageContinuationLink()`.

The frozen Raster rule remains unchanged:

```text
absolute turn at one Raster vertex <= 10°
```

No fork-specific tolerance is introduced.

## Runtime content

`GOAL_LA` and `GOAL_LB` are complete independent `StageRuntimeContentPackage`s compiled through the ordinary M6.24 stage-authoring path. They own separate Guide/Raster charts and FINISH gates.

The existing RIGHT route is unchanged and still terminates at `GOAL_R`.

All current terminal stages therefore own exactly one physical FINISH:

```text
GOAL_LA
GOAL_LB
GOAL_R
```

Entering a terminal Route DAG stage is not sufficient to finish; a forward physical FINISH crossing remains mandatory.

## Full LEFT-A transaction proof

The dedicated integration regression validates four complete deferred handoffs:

```text
S1_LEFT
→ PENDING → COMMIT CONTENT_STAGE_2_L
→ S2L_CONTINUE
→ PENDING → COMMIT CONTENT_STAGE_3_L
→ S3L_CONTINUE
→ PENDING → COMMIT CONTENT_STAGE_4_L_FORK
→ S4L_FORK_A
→ PENDING → COMMIT CONTENT_GOAL_LA
→ physical GOAL_LA FINISH
```

No handoff changes vehicle world X/Y/Z, yaw or velocities.

## Authoring composition

M6.35 consumes `createM630ThirdLiveSuccessorAuthoring()` rather than reconstructing the already validated first fork and LEFT/RIGHT chains. It promotes only the old LEFT terminal row, preserves all unrelated authoring, then adds the second-fork fragment through the existing M6.32 route-fragment compiler.

`main.ts` still calls only the stable M6.27 browser entry. `src/main.ts` and `src/render/m5-renderer.ts` contain no `STAGE_4_L_FORK`, `GOAL_LA`, `GOAL_LB` or `S4L_FORK_*` topology knowledge.

## Regression coverage

M6.34 baseline: 303 tests.

M6.35 adds six dedicated regressions:

1. old LEFT terminal is promoted and the live DAG has two new terminal outcomes;
2. fork runtime owns the visible/physical local junction and derived ±12 m ground envelope;
3. two physical gates do not overlap and the median selects nothing;
4. fork handoff seams map source child centers to target local `l=0`;
5. complete LEFT-A route performs four PENDING/COMMIT handoffs and physically FINISHes;
6. topology stays outside main/renderer while generic M6.34/M6.29 layers remain the implementation authority.

Expected complete suite:

```text
309 tests
309 pass
0 fail
```

An initial PR run produced 304/309 because five historical tests asserted obsolete live-entry names or a fixed two-terminal count. The M6.35 tests themselves were already all green. Those historical regressions were updated to validate their architectural contracts rather than freeze a later live topology.

## Frozen authorities preserved

M6.35 does not change:

- world-space vehicle physics authority;
- chainage-only pseudo-depth;
- one-chainage/one-scanline raster road model;
- 2.0 m = 80 px player metric authority at `D_cam=5 m`;
- Raster vertex turn limit ≤10°;
- far→near Terrain/WorldSprite Painter;
- no z-buffer/polygon road/perspective texture path;
- no arbitrary runtime sprite rotation;
- 0/1 transparency;
- camera roll = 0;
- GroundMap visual / SurfaceMap physical independence;
- physical gate → PENDING → seam COMMIT route transaction.
