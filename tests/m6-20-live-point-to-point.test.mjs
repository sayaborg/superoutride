import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCoordinateLateralOrigin } from '../dist/core/guide-coordinate-frame.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import { createM617RouteStageHandoffManifest } from '../dist/dev/m6-17-handoff-seams.js';
import { createM618StageRoadViews } from '../dist/dev/m6-18-stage-road-views.js';
import {
  M6_20_FINISH_GATE_S,
  createM620LivePointToPointGateSet,
  createM620LivePointToPointRouteDag,
} from '../dist/dev/m6-20-live-point-to-point.js';
import { createM620LiveStageRuntimeRegistry } from '../dist/dev/m6-20-live-runtime-content.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { M6_17_HANDOFF_SEAM_S } from '../dist/dev/m6-17-handoff-seams.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { rebaseM5CameraRigCoordinateFrame } from '../dist/dev/m5-camera.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import {
  POINT_TO_POINT_OBJECTIVE,
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

function crossing(gate, distance = 2) {
  return {
    previous: {
      x: gate.center.x - gate.tangent.x * distance,
      z: gate.center.z - gate.tangent.z * distance,
    },
    current: {
      x: gate.center.x + gate.tangent.x * distance,
      z: gate.center.z + gate.tangent.z * distance,
    },
  };
}

function setup() {
  const guide = createM2StadiumGuide();
  const route = createM620LivePointToPointRouteDag();
  const routeState = createRouteDagState(route);
  const gates = createM620LivePointToPointGateSet(route, guide);
  const content = createM6DebugRouteStageContentManifest(route);
  const charts = createM616ChildGuideCharts(guide);
  const chartList = [charts.parent, charts.left, charts.right];
  const roadViews = createM618StageRoadViews(charts);
  const handoffManifest = createM617RouteStageHandoffManifest(route, guide, charts);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  const terrainProfile = {
    screenHeight: 240,
    dMin: 2.5,
    dMax: 150,
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    height: heightProfile,
    visual: visualProfile,
    thinSpanScreenRows: 1,
  };
  const background = createM3FarBackground();
  const registry = createM620LiveStageRuntimeRegistry(
    content,
    charts,
    roadViews,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => background,
      worldSprites: [],
    },
  );
  const handoffState = createRouteStageHandoffState(
    route,
    content,
    charts.parent,
    { x: 0, z: 0 },
  );
  return {
    guide,
    route,
    routeState,
    gates,
    content,
    charts,
    chartList,
    roadViews,
    handoffManifest,
    registry,
    handoffState,
  };
}

test('M6.20 live DAG is one physical fork into two terminal child stages', () => {
  const { route } = setup();
  assert.equal(route.startStageId, 'STAGE_1');
  assert.deepEqual(route.stages.map((stage) => [stage.id, stage.kind]), [
    ['STAGE_1', 'STAGE'],
    ['GOAL_L', 'TERMINAL'],
    ['GOAL_R', 'TERMINAL'],
  ]);
  assert.deepEqual(route.choices.map((choice) => choice.id), ['S1_LEFT', 'S1_RIGHT']);
});

test('M6.20 child FINISH lies after handoff and before the closed raster seam', () => {
  const { guide, gates } = setup();
  assert.ok(M6_20_FINISH_GATE_S > M6_17_HANDOFF_SEAM_S);
  assert.ok(M6_20_FINISH_GATE_S < guide.length);
  const finishes = gates.gates.filter((gate) => gate.kind === 'FINISH');
  assert.equal(finishes.length, 2);
  assert.deepEqual(finishes.map((gate) => gate.stageId).sort(), ['GOAL_L', 'GOAL_R']);
  const dx = finishes[0].center.x - finishes[1].center.x;
  const dz = finishes[0].center.z - finishes[1].center.z;
  assert.ok(Math.hypot(dx, dz) > M6_13_JUNCTION.authoring.finalMedianWidth);
});

for (const side of ['LEFT', 'RIGHT']) {
  test(`M6.20 ${side.toLowerCase()} path selects, commits child runtime and physically finishes without a second fork`, () => {
    const {
      route,
      routeState,
      gates,
      content,
      chartList,
      handoffManifest,
      registry,
      handoffState,
    } = setup();
    const choiceId = side === 'LEFT' ? 'S1_LEFT' : 'S1_RIGHT';
    const goalId = side === 'LEFT' ? 'GOAL_L' : 'GOAL_R';
    const expectedPackage = `CONTENT_${goalId}`;

    const choiceGate = gates.gates.find((gate) => gate.kind === 'TRANSITION' && gate.choiceId === choiceId);
    assert.ok(choiceGate);
    const choiceMotion = crossing(choiceGate);
    const routeObservation = observeRouteBoundaryCrossing(
      route,
      routeState,
      gates,
      choiceMotion.previous,
      choiceMotion.current,
    );
    const routeUpdate = updateRouteDag(routeState, route, routeObservation.boundary);
    assert.equal(routeUpdate.event, 'TRANSITION_ACCEPTED');
    assert.equal(routeState.activeStageId, goalId);
    assert.equal(queueRouteStageHandoff(handoffState, handoffManifest, routeUpdate), 'PENDING');
    assert.equal(resolveActiveStageRuntimeContent(registry, handoffState).packageId, 'CONTENT_STAGE_1');

    const seam = handoffManifest.seams.find((candidate) => candidate.choiceId === choiceId);
    assert.ok(seam);
    const seamMotion = crossing(seam);
    const handoffObservation = observePendingRouteStageHandoff(
      handoffState,
      handoffManifest,
      seamMotion.previous,
      seamMotion.current,
    );
    assert.equal(
      commitRouteStageHandoff(
        handoffState,
        routeState,
        content,
        chartList,
        handoffObservation.seam,
        seam.center,
      ),
      'COMMITTED',
    );
    const runtime = resolveActiveStageRuntimeContent(registry, handoffState);
    assert.equal(runtime.packageId, expectedPackage);
    assert.equal(runtime.roadView.id, side === 'LEFT' ? 'LEFT_CHILD_ROAD_VIEW' : 'RIGHT_CHILD_ROAD_VIEW');
    assert.equal(runtime.surfaceMap.sample(M6_20_FINISH_GATE_S, 0).type, 'ASPHALT');

    const finishGate = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === goalId);
    assert.ok(finishGate);
    const finishMotion = crossing(finishGate);
    const finishObservation = observeRouteBoundaryCrossing(
      route,
      routeState,
      gates,
      finishMotion.previous,
      finishMotion.current,
    );
    const finishUpdate = updateRouteDag(routeState, route, finishObservation.boundary);
    assert.equal(finishUpdate.event, 'FINISHED');
    assert.equal(routeState.status, 'FINISHED');

    const finish = createValidatedRunFinishFromRoute(routeState, finishUpdate);
    const objective = createRunObjectiveState();
    const objectiveUpdate = updateRunObjectiveFromValidatedFinish(
      objective,
      POINT_TO_POINT_OBJECTIVE,
      finish,
      12.5,
    );
    assert.equal(objectiveUpdate.justFinished, true);
    assert.equal(objective.status, 'FINISHED');
    assert.equal(objective.finishId, goalId);
  });
}

test('M6.20 camera frame rebasing preserves world lateral through child handoff', () => {
  const { charts } = setup();
  const rig = { yaw: 0.3, lateral: -6.8, verticalCorrection: 0.4, initialized: true };
  const beforeWorldL = rig.lateral + guideCoordinateLateralOrigin(charts.parent);
  rebaseM5CameraRigCoordinateFrame(rig, charts.parent, charts.left);
  const afterWorldL = rig.lateral + guideCoordinateLateralOrigin(charts.left);
  assert.ok(Math.abs(beforeWorldL - afterWorldL) < 1e-12);
  assert.ok(Math.abs(rig.lateral - 0.7) < 1e-12);
  assert.equal(rig.yaw, 0.3);
  assert.equal(rig.verticalCorrection, 0.4);
});

test('M6.20 live runtime has only parent plus two terminal child packages', () => {
  const { registry } = setup();
  assert.deepEqual(
    registry.packages.map((entry) => entry.packageId),
    ['CONTENT_STAGE_1', 'CONTENT_GOAL_L', 'CONTENT_GOAL_R'],
  );
});
