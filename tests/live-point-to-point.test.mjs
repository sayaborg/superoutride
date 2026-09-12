import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';

import { createChildGuideCharts } from '../dist/dev/courses/child-guide-charts.js';
import { createStadiumRouteStageHandoffManifest, STADIUM_HANDOFF_SEAM_S } from '../dist/dev/courses/stadium-handoff.js';
import { STADIUM_JUNCTION } from '../dist/dev/courses/stadium-junction.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { createSingleForkStageRegistry } from '../dist/dev/fixtures/single-fork-registry.js';
import {
  createSingleForkGateSet,
  createSingleForkRouteDag,
  SINGLE_FORK_FINISH_GATE_S,
} from '../dist/dev/fixtures/single-fork-route.js';
import { createStageRoadViews } from '../dist/dev/fixtures/stage-road-views.js';

import { createCameraRig } from '../dist/camera/camera.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import {
  createRunObjectiveState,
  createValidatedRunFinishFromRoute,
  updateRunObjectiveFromValidatedFinish,
} from '../dist/gameplay/run-objective.js';

import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createFarBackground } from '../dist/visual/far-background.js';

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
  const guide = createStadiumGuide();
  const route = createSingleForkRouteDag();
  const routeState = createRouteDagState(route);
  const gates = createSingleForkGateSet(route, guide);
  const content = createMinimalStageContentManifest(route);
  const charts = createChildGuideCharts(guide);
  const chartList = [charts.parent, charts.left, charts.right];
  const roadViews = createStageRoadViews(charts);
  const handoffManifest = createStadiumRouteStageHandoffManifest(route, guide, charts);
  const { surfaceMap, heightProfile, groundProfile, terrainProfile } = parentShared(guide);

  const background = createFarBackground();
  const registry = createSingleForkStageRegistry(content, charts, roadViews, {
    heightProfile,
    surfaceMap,
    terrainProfile,
    groundProfile,
    selectFarBackground: () => background,
    worldSprites: [],
  });
  const handoffState = createRouteStageHandoffState(route, content, charts.parent, { x: 0, z: 0 });
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

test('live DAG is one physical fork into two terminal child stages', () => {
  const { route } = setup();
  assert.equal(route.startStageId, 'STAGE_1');
  assert.deepEqual(
    route.stages.map((stage) => [stage.id, stage.kind]),
    [
      ['STAGE_1', 'STAGE'],
      ['GOAL_L', 'TERMINAL'],
      ['GOAL_R', 'TERMINAL'],
    ],
  );
  assert.deepEqual(
    route.choices.map((choice) => choice.id),
    ['S1_LEFT', 'S1_RIGHT'],
  );
});

test('child FINISH lies after handoff and before the open Guide endpoint', () => {
  const { guide, gates } = setup();
  assert.ok(SINGLE_FORK_FINISH_GATE_S > STADIUM_HANDOFF_SEAM_S);
  assert.ok(SINGLE_FORK_FINISH_GATE_S < guide.length);
  const finishes = gates.gates.filter((gate) => gate.kind === 'FINISH');
  assert.equal(finishes.length, 2);
  assert.deepEqual(finishes.map((gate) => gate.stageId).sort(), ['GOAL_L', 'GOAL_R']);
  const dx = finishes[0].center.x - finishes[1].center.x;
  const dz = finishes[0].center.z - finishes[1].center.z;
  assert.ok(Math.hypot(dx, dz) > STADIUM_JUNCTION.authoring.finalMedianWidth);
});

for (const side of ['LEFT', 'RIGHT']) {
  test(`${side.toLowerCase()} path selects, commits child runtime and physically finishes without a second fork`, () => {
    const { route, routeState, gates, content, chartList, handoffManifest, registry, handoffState } = setup();
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
      commitRouteStageHandoff(handoffState, routeState, content, chartList, handoffObservation.seam, seam.center),
      'COMMITTED',
    );
    const runtime = resolveActiveStageRuntimeContent(registry, handoffState);
    assert.equal(runtime.packageId, expectedPackage);
    assert.equal(runtime.roadView.id, side === 'LEFT' ? 'LEFT_CHILD_ROAD_VIEW' : 'RIGHT_CHILD_ROAD_VIEW');
    assert.equal(runtime.surfaceMap.sample(SINGLE_FORK_FINISH_GATE_S, 0).type, 'ASPHALT');

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
    const objectiveUpdate = updateRunObjectiveFromValidatedFinish(objective, finish, 12.5);
    assert.equal(objectiveUpdate.justFinished, true);
    assert.equal(objective.status, 'FINISHED');
    assert.equal(objective.finishId, goalId);
  });
}

test('camera rig carries no chart-local lateral authority through child handoff', () => {
  assert.deepEqual(createCameraRig(), {
    yawMode: 'BODY_FIXED',
    yaw: 0,
    movementYaw: 0,
    verticalCorrection: 0,
    initialized: false,
  });
});

test('live runtime has only parent plus two terminal child packages', () => {
  const { registry } = setup();
  assert.deepEqual(
    registry.packages.map((entry) => entry.packageId),
    ['CONTENT_STAGE_1', 'CONTENT_GOAL_L', 'CONTENT_GOAL_R'],
  );
});

test('fixture stays validated while browser live authority consumes the route assembly', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');

  assert.match(source, /createDeclarativeForkGrowthRuntime/);
  assert.match(source, /const liveRoute = createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(
    source,
    /createLiveRouteDag|createLiveContinuation|createLiveGateSet|createSuccessorStageRegistry/,
  );
  assert.doesNotMatch(source, /createSingleForkRouteDag/);
  assert.doesNotMatch(source, /createChildStageContinuation/);
  assert.match(source, /resolveLiveRouteTravelerRuntime/);
  assert.doesNotMatch(source, /POINT_TO_POINT_OBJECTIVE|REPEATABLE_DEV/);
  assert.doesNotMatch(source, /createMinimalRouteDag/);
  assert.doesNotMatch(source, /createStadiumRouteBoundaryGateSet/);
  assert.match(source, /world: \(\) => stageVehicleWorld\(activeRuntime\(\)\)/);
  assert.match(source, /advanceRouteDrivingTick/);
  assert.match(source, /runtime\.roadView \?\? undefined/);
});
