import assert from 'node:assert/strict';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';
import { parentShared } from './helpers/stage-parent-fixture.mjs';

import { guidePathToWorld } from '../dist/core/guide-curve.js';
import {
  CHILD_FINISH_S,
  createChildStageContinuation,
  createLivePointToPointGateSet,
  createRouteStageHandoffManifest,
} from '../dist/dev/courses/child-stage-continuation.js';
import { STADIUM_HANDOFF_SEAM_S } from '../dist/dev/courses/stadium-handoff.js';
import { STADIUM_JUNCTION } from '../dist/dev/courses/stadium-junction.js';
import { createAuthoredStageRegistry } from '../dist/dev/fixtures/authored-stage-registry.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { createSingleForkRouteDag } from '../dist/dev/fixtures/single-fork-route.js';

import { guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';

import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';

const near = (actual, expected, tolerance = 2e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

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

test('child charts share exact overlap geometry through D_cam around the handoff seam', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);

  for (const [side, chart] of [
    ['LEFT', continuation.charts.left],
    ['RIGHT', continuation.charts.right],
  ]) {
    const origin = STADIUM_JUNCTION.separatedChildCenterL(side);
    for (const delta of [-5, 0, 20]) {
      const parentWorld = guidePathToWorld(parent, STADIUM_HANDOFF_SEAM_S + delta, origin);
      const childWorld = guideChartToWorld(chart, continuation.handoffLocalS + delta, 0);
      near(childWorld.x, parentWorld.x, 1e-5);
      near(childWorld.z, parentWorld.z, 1e-5);
      near(childWorld.heading, parentWorld.heading, 1e-8);
    }
  }
});

test('child Guides are independent long courses and diverge after the shared prefix', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);

  assert.ok(continuation.left.guide.length > 300);
  assert.ok(continuation.right.guide.length > 300);
  assert.notEqual(continuation.left.guide, continuation.right.guide);
  assert.notEqual(continuation.left.guide.length, continuation.right.guide.length);
  assert.notEqual(continuation.left.guide.length, parent.length);
  assert.notEqual(continuation.right.guide.length, parent.length);

  const leftFinish = guideChartToWorld(continuation.charts.left, CHILD_FINISH_S, 0);
  const rightFinish = guideChartToWorld(continuation.charts.right, CHILD_FINISH_S, 0);
  assert.ok(Math.hypot(leftFinish.x - rightFinish.x, leftFinish.z - rightFinish.z) > 10);
});

test('translated procedural GroundMap keeps child road centered and preserves seam phase', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const leftCenter = STADIUM_JUNCTION.separatedChildCenterL('LEFT');
  const childProfile = continuation.left.groundProfile;

  const onRoad = sampleGroundMap(8, leftCenter + 1, childProfile);
  const oldParentCenter = sampleGroundMap(8, 0, childProfile);
  assert.ok(onRoad === GROUND_COLORS.asphaltA || onRoad === GROUND_COLORS.asphaltB);
  assert.ok(oldParentCenter === GROUND_COLORS.grassA || oldParentCenter === GROUND_COLORS.grassB);

  const parentProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
    junction: STADIUM_JUNCTION,
  };
  const parentAtSeam = sampleGroundMap(STADIUM_HANDOFF_SEAM_S, leftCenter, parentProfile);
  const childAtSeam = sampleGroundMap(continuation.handoffLocalS, leftCenter, childProfile);
  assert.equal(childProfile.chainageOffsetS, continuation.parentSourceStartS);
  assert.equal(parentAtSeam, GROUND_COLORS.marking);
  assert.equal(childAtSeam, parentAtSeam);
});

test('runtime packages retain independent child Guide/SurfaceMap and child-owned visuals', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const route = createSingleForkRouteDag();
  const manifest = createMinimalStageContentManifest(route);
  const registry = createAuthoredStageRegistry(manifest, continuation, parentShared(parent), createSpriteAssets());
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(left.coordinateFrame.guide, continuation.left.guide);
  assert.equal(right.coordinateFrame.guide, continuation.right.guide);
  assert.equal(left.surfaceMap.sample(CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(right.surfaceMap.sample(CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(left.surfaceMap.sample(CHILD_FINISH_S, 5).type, 'VOID');
  assert.equal(right.surfaceMap.sample(CHILD_FINISH_S, -5).type, 'VOID');
  assert.ok(left.worldSprites.length > 0);
  assert.ok(right.worldSprites.length > 0);
  assert.ok(left.worldSprites.every((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(right.worldSprites.every((sprite) => sprite.name.startsWith('MOUNTAIN_')));
  assert.notEqual(left.selectFarBackground(50), right.selectFarBackground(50));
});

test('physical route choice commits an independent child chart and finishes on that child course', () => {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const route = createSingleForkRouteDag();
  const routeState = createRouteDagState(route);
  const content = createMinimalStageContentManifest(route);
  const gates = createLivePointToPointGateSet(route, parent, continuation);
  const handoffs = createRouteStageHandoffManifest(route, parent, continuation);
  const charts = [continuation.charts.parent, continuation.charts.left, continuation.charts.right];
  const handoffState = createRouteStageHandoffState(route, content, continuation.charts.parent, { x: 0, z: -55 });

  const choiceGate = gates.gates.find((gate) => gate.kind === 'TRANSITION' && gate.choiceId === 'S1_LEFT');
  assert.ok(choiceGate);
  const choiceMotion = crossing(choiceGate);
  const choiceObservation = observeRouteBoundaryCrossing(
    route,
    routeState,
    gates,
    choiceMotion.previous,
    choiceMotion.current,
  );
  const choiceUpdate = updateRouteDag(routeState, route, choiceObservation.boundary);
  assert.equal(choiceUpdate.event, 'TRANSITION_ACCEPTED');
  assert.equal(queueRouteStageHandoff(handoffState, handoffs, choiceUpdate), 'PENDING');
  assert.equal(handoffState.activePackageId, 'CONTENT_STAGE_1');

  const seam = handoffs.seams.find((entry) => entry.choiceId === 'S1_LEFT');
  assert.ok(seam);
  const seamMotion = crossing(seam);
  const seamObservation = observePendingRouteStageHandoff(
    handoffState,
    handoffs,
    seamMotion.previous,
    seamMotion.current,
  );
  assert.equal(
    commitRouteStageHandoff(handoffState, routeState, content, charts, seamObservation.seam, seam.center),
    'COMMITTED',
  );
  near(handoffState.coordinate.s, continuation.handoffLocalS, 1e-5);
  near(handoffState.coordinate.l, 0, 1e-5);
  assert.equal(handoffState.activePackageId, 'CONTENT_GOAL_L');

  const finishGate = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === 'GOAL_L');
  assert.ok(finishGate);
  const expectedFinish = guideChartToWorld(continuation.charts.left, CHILD_FINISH_S, 0);
  near(finishGate.center.x, expectedFinish.x, 1e-6);
  near(finishGate.center.z, expectedFinish.z, 1e-6);
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
});

test('fixture stays validated while browser live wiring consumes the assembly through batching', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /createDeclarativeForkGrowthRuntime/);
  assert.match(mainSource, /const playerTraveler = createLiveRouteTravelerState\(liveRoute/);
  assert.match(mainSource, /traveler: playerTraveler/);
  assert.match(mainSource, /advanceRouteDrivingTick/);
  assert.match(mainSource, /shell\.present\(/);
  assert.doesNotMatch(mainSource, /camera\.courseLength/);
  assert.doesNotMatch(mainSource, /createLiveContinuation|createLiveGateSet|createSuccessorStageRegistry/);
  assert.doesNotMatch(mainSource, /createLivePointToPointGateSet|createChildStageContinuation/);
  assert.doesNotMatch(rendererSource, /M[0-9]+(?:[._][0-9]+)?|CONTENT_GOAL_[LR]|S2[LR]_CONTINUE/);
});
