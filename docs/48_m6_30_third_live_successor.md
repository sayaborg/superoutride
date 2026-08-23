# M6.30 — Third Live Successor Stage

## Purpose

M6.30 proves that the M6.28 declarative route compiler and M6.29 reusable Raster successor factory can deepen the live point-to-point route without adding route-specific logic to `main.ts` or renderer Core.

The live route becomes:

```text
              ┌→ STAGE_2_L → STAGE_3_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R ─────────────→ GOAL_R
```

Only the LEFT path is extended by one additional independent stage. The RIGHT path intentionally remains at the previous depth so the live graph demonstrates unequal route depth.

## Structural method

M6.30 does not create a new branching renderer or a second road-depth model.

The existing M6.26 LEFT successor package, which had previously been terminal `CONTENT_GOAL_L`, is promoted to the intermediate package:

```text
CONTENT_STAGE_3_L
```

A new LEFT terminal successor is generated from that stage through the generic M6.29 factory:

```text
createRasterStageSuccessor(source, authoring)
```

The factory retains the frozen geometry authority:

- exact shared overlap around the physical seam
- `D_cam = 5m` covered by the overlap
- source Raster reused as the structural base
- smooth deformation restricted to a low-curvature run
- final candidate always validated by `compileRasterCourse()`
- absolute per-vertex Raster turn remains <= 10 degrees

The new successor uses its own GuideChart, StageRoadView, SurfaceMap view, GroundMap profile and runtime content package.

## Live topology

The declarative route rows are:

```text
STAGE_1    --S1_LEFT-------> STAGE_2_L
STAGE_1    --S1_RIGHT------> STAGE_2_R
STAGE_2_L  --S2L_CONTINUE--> STAGE_3_L
STAGE_3_L  --S3L_CONTINUE--> GOAL_L
STAGE_2_R  --S2R_CONTINUE--> GOAL_R
```

`GOAL_L` and `GOAL_R` remain terminal Route DAG nodes, but route entry alone is not a run finish. Each still requires a physical forward crossing of its FINISH gate.

For the LEFT route, the live transaction is now:

```text
visible fork
→ S1_LEFT accepted
→ PENDING
→ parent/child seam COMMIT
→ STAGE_2_L physical transition
→ PENDING
→ STAGE_2_L/STAGE_3_L seam COMMIT
→ STAGE_3_L physical transition
→ PENDING
→ STAGE_3_L/GOAL_L seam COMMIT
→ physical GOAL_L FINISH
```

At every COMMIT, only the coordinate/content chart changes. Vehicle world X/Y/Z, yaw and velocity are not teleported.

## Browser boundary

`main.ts` is unchanged. It continues to consume one stable entry:

```text
createM627LiveRouteRuntime(...)
```

That stable entry now delegates to M6.30 authoring. The browser simulation loop still knows only the generic sequence:

```text
physical transition gate
→ route update
→ PENDING handoff
→ physical seam
→ COMMIT
```

The renderer receives the currently active runtime package and contains no `LEFT`, `RIGHT`, `STAGE_3_L`, `S3L_CONTINUE` or M6.30 topology decision.

## Fork-stall regression fixed before M6.30

During M6.29 validation the real browser path exposed a previously missed freeze immediately after the first child COMMIT.

The simulation and physics were not intentionally stopping. Instead, the first child render threw:

```text
RangeError: stage GroundMap sample is outside the local ground envelope
```

`xGroundL` and `xGroundR` describe continuous projected strip edges, while raster sampling evaluates pixel centers at `x + 0.5`. On an integer projected edge, the final included pixel center can sit by at most half a pixel beyond the continuous stage-local corridor. The strict stage sampler interpreted that rasterization artifact as a true outside-corridor request and threw before the next `requestAnimationFrame` was scheduled.

The fix clamps only the stage-local lateral GroundMap raster sample to the already authored local corridor before sampling. It does not change:

- projected strip edges
- horizontal scanline ownership
- chainage
- pseudo-depth
- affine horizontal mapping
- road geometry
- physics
- route choice
- world pose

A browser-order 60 Hz regression now drives an actual car through the visible LEFT fork, performs the child handoff and executes 30 rendered child frames. This test remains part of the M6.30 suite.

## Regression authority

M6.29 had 279 tests. The fork-stall renderer regression raised the validated baseline to 280 tests. M6.30 adds four dedicated route-depth regressions, for a total target of 284 tests.

The M6.30 regressions verify:

1. the live route contains six stages with one extra LEFT depth;
2. the old LEFT terminal geometry is promoted to `STAGE_3_L` while new `GOAL_L` owns a different Guide/Raster;
3. `S3L_CONTINUE` resolves through the handoff target chart and content manifest to the new terminal package;
4. renderer and browser loop remain topology-agnostic;
5. historical M6.27/M6.28 fixtures remain valid without freezing the current live route depth;
6. the real browser-order first-fork renderer regression remains green.

## Frozen renderer authority

M6.30 does not alter any frozen pseudo-3D invariant:

- physics remains world-space authority
- no vehicle snap to road center
- one chainage maps to one horizontal scanline
- pseudo-depth remains `wrapSigned(s_obj - s_cam)` only
- no camera-space Z
- no Euclidean-distance depth
- no lateral depth correction
- same depth means same scale
- Raster Segment road remains authoritative
- per-vertex Raster turn remains <=10 degrees
- Guide remains coordinate/camera support
- shared far-to-near Painter remains unchanged
- no z-buffer, polygon road or perspective-correct texturing
- no arbitrary runtime sprite rotation
- no alpha blending
- camera roll remains zero

## Next architectural step

M6.30 proves unequal route depth using reusable primitives, but the live authoring function still manually promotes the old LEFT terminal package and lists each deep successor row. The next step should express a chain of successor-stage authoring records so arbitrary point-to-point depth can be compiled without milestone-specific promotion code, while retaining the same world-space overlap validation and declarative route compiler.
