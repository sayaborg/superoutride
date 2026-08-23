# M6.39 — Deep Route Browser-Order Integration

## Purpose

M6.38 proved that the complete two-second-fork route can be authored declaratively without changing its RouteDag, packages, Guide charts, physical gates or handoff seams. M6.39 moves the proof one layer down: the assembled live route must survive the same state-update ordering used by the browser while repeatedly crossing real physical route gates and physical handoff seams.

This milestone does **not** calibrate vehicle handling and does not make full-course autonomous AI performance an invariant. Vehicle physics remains `DEV_UNCALIBRATED`.

## Browser-order transaction under test

Each probe follows the live order:

```text
resolve active StageRuntimeContent
→ ordinary M5 car physics
→ recovery observation
→ world-space route-gate observation
→ RouteDag update
→ queue PENDING handoff
→ physical seam observation
→ COMMIT chart/content
→ mirror committed Guide coordinate into vehicle.course
→ camera coordinate-frame rebase
→ objective update
→ camera update
→ ordinary M5 renderer
```

No renderer-specific route decision is introduced.

## Deep paths

Two opposite terminal outcomes are exercised through the stable browser-facing entry `createM627LiveRouteRuntime(...)`:

```text
LEFT-A:
STAGE_1
→ STAGE_2_L
→ STAGE_3_L
→ STAGE_4_L_FORK
→ GOAL_LA
→ physical FINISH

RIGHT-B:
STAGE_1
→ STAGE_2_R
→ STAGE_3_R
→ STAGE_4_R_FORK
→ GOAL_RB
→ physical FINISH
```

Each path therefore performs four independent route-gate → PENDING → seam → COMMIT transactions before its terminal FINISH.

## Checkpointed physical probes

A single long autonomous drive would make the regression depend on the current uncalibrated handling and DEV AI quality. That is intentionally avoided.

Between completed handoffs only, the test fixture places the vehicle eight metres before the **actual authored physical gate** on the active stage's Guide coordinate frame. Route state, handoff state, objective state, runtime registry and camera rig remain cumulative for the whole path.

After fixture staging, there is no position rewrite between the gate and handoff seam. Ordinary M5 physics must physically cross both boundaries.

This isolates the state transaction being validated while leaving future handling calibration replaceable.

## Coordinate-frame bug found by the integration test

The first deep attempts exposed a real boundary mismatch in `sampleRivalDrivingInput()`.

The driver previously accepted only a bare `GuideCurve`. Once a child stage had a non-zero `GuideCoordinateFrame.lateralOrigin`, stripping the frame via `guideCoordinateCurve(frame)` caused two coordinate systems to be mixed:

```text
car.course.l       = stage-local l
lookahead target l = underlying Guide l
```

For a child whose local road center is represented by an underlying source offset of ±7.5 m, target local `l=0` was therefore aimed at the wrong world-space line.

M6.39 changes the driver boundary to:

```ts
sampleRivalDrivingInput(
  guide: GuideCoordinateSource,
  car: VehicleCameraReadState,
  targetL = 0,
): DrivingInput
```

The lookahead target now uses `guideCoordinateToWorld()`. A plain `GuideCurve` still behaves exactly as before because it is a valid zero-origin `GuideCoordinateSource`; child-stage callers can pass the complete coordinate frame and retain their local-l semantics.

Curvature-based speed estimation similarly unwraps the source with `guideCoordinateCurve()` only for curvature sampling, where lateral origin is irrelevant.

## World authority at COMMIT

For all eight tested COMMITs (four LEFT-A, four RIGHT-B), the regression snapshots and exact-compares:

```text
world x/y/z
yaw
longitudinal speed
lateral speed
vertical speed
yaw rate
```

immediately before and after `commitRouteStageHandoff()`.

All must remain byte-for-byte unchanged. Only road-coordinate/chart/package authority changes.

## Additional assertions

For both deep paths the regression requires:

- exact authored route-choice order;
- exact committed package order;
- exactly four COMMITs;
- no recovery inside any gate/seam physical probe;
- vehicle speed above 8 m/s at every COMMIT;
- terminal RouteDag status `FINISHED` only after the physical FINISH gate;
- point-to-point objective FINISH identity equal to the selected terminal;
- FINISH recorded exactly once;
- renderer consumption of the parent and every committed package;
- thirty additional physics/camera/render frames after validated FINISH, proving FINISH does not freeze presentation/simulation.

## Frozen architecture preserved

M6.39 does not alter:

- chainage-only pseudo-depth;
- one-chainage/one-scanline raster road model;
- <=10° Raster vertex limit;
- metric sprite authority;
- Painter ordering;
- world-space vehicle authority;
- physical route-gate selection;
- PENDING-before-COMMIT semantics;
- package-owned child visuals;
- renderer route opacity.

## Validation

Structural implementation head before documentation synchronization:

```text
0c1865ff45fd3e527aeb8393ea156fbb128d3d23
329 tests
329 pass
0 fail
```

The earlier M6.39 workflow failures were work-in-progress diagnostics. They exposed the coordinate-frame problem described above and were not accepted as milestone validation.

The documentation-inclusive final head must independently reproduce 329/329 before main is advanced.
