# SUPER OUTRIDE — M6.26 Live Child → Successor Stage

## Purpose

M6.26 extends the browser's live point-to-point route beyond the first committed child stage. The selected child now hands off into a second, independently compiled stage and reaches a physical terminal FINISH there.

The live route is:

```text
              ┌→ STAGE_2_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R → GOAL_R
```

This is still a Route DAG, not a lap graph.

## Runtime sequence

For either selected side the browser performs:

```text
physical fork gate
→ validated route transition
→ PENDING
→ parent/child handoff seam
→ COMMIT child package/chart
→ child physical transition gate
→ PENDING
→ child/successor handoff seam
→ COMMIT successor package/chart
→ successor physical FINISH gate
```

Route transition and package/chart handoff remain separate events. A validated route choice cannot switch renderer/physics content early.

## World authority

Both handoffs preserve the authoritative world state:

- X/Y/Z
- yaw
- longitudinal/lateral motion
- vertical state

Only the active Guide coordinate expression and complete stage content package change at COMMIT.

No teleport, hidden road snapping or screen-space branch decision is introduced.

## Successor overlap

Each successor uses the M6.25 `StageContinuationLink`.

The source child and target successor contain identical road geometry across the complete overlap around the seam. Validation covers `D_cam` behind and ahead of the seam, so camera/player depth support does not cross an unvalidated geometry discontinuity.

Child and successor use local `l=0` on the same physical road center, while the earlier parent/child handoff still demonstrates the more general different-local-origin case.

## Successor Raster construction

The Core Raster rule remains unchanged:

```text
absolute turn at one Raster vertex <= 10 degrees
```

Early M6.26 prototypes exceeded this limit. The constraint was not relaxed.

The final construction instead:

1. reuses the already valid selected-child Raster as the structural base,
2. cuts/reorders it so the new course begins before the successor seam,
3. copies the seam overlap exactly,
4. identifies a safe low-curvature run away from vertices near the Core limit,
5. applies a smooth lateral deformation only inside that run,
6. recompiles through the ordinary `compileRasterCourse()` authority.

Thus authored successor independence is achieved without weakening renderer geometry invariants.

## Stage content

The intermediate child and terminal successor packages are compiled through the M6.24 reusable stage authoring path. Each active package owns its ordinary runtime sources:

- Guide/chart
- stage-local road view
- SurfaceMap
- GroundMap profile
- HeightProfile
- TerrainProfile / visual sections
- World Sprites
- Far Background selector

The LEFT route retains coast identity and the RIGHT route retains mountain identity while moving into independent successor Guides.

## FINISH authority

`GOAL_L` and `GOAL_R` are terminal Route DAG stages, but entering them is still not sufficient to finish the run.

Completion requires a forward physical crossing of the successor-local FINISH gate. Only that validated event feeds the generic point-to-point objective.

## Renderer invariants

M6.26 changes no renderer mathematics:

- one chainage → one horizontal scanline,
- pseudo-depth is signed chainage difference only,
- no camera-space Z,
- no Euclidean or lateral depth correction,
- same depth → same scale,
- Raster Segment road,
- shared far-to-near Terrain + World Sprite Painter,
- no z-buffer,
- no polygon road,
- no perspective-correct texture mapping,
- no arbitrary runtime sprite rotation,
- 0/1 transparency,
- camera roll zero,
- fixed metric player authority remains 2.0m = 80px at player depth.

Renderer Core contains no `STAGE_2_L/R`, successor, route choice or handoff decision logic.

## Regression authority

M6.26 adds six dedicated regressions on top of the previous 258-test suite, producing a target of 264 tests.

The dedicated tests cover route shape, overlap validity, gate/handoff coverage, complete package ownership, two world-pose-continuous COMMITs before FINISH, and renderer independence.

Legacy M6.20 and M6.22 fixtures remain regression-tested as historical architecture layers; they no longer define browser live authority.
