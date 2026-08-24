import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { M6_17_HANDOFF_SEAM_S } from '../dist/dev/m6-17-handoff-seams.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import {
  M6_22_CHILD_FINISH_S,
  createM622ChildStageContinuation,
  createM622LivePointToPointGateSet,
  createM622RouteStageHandoffManifest,
} from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM622LiveStageRuntimeRegistry } from '../dist/dev/m6-22-live-runtime-content.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

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

function parentShared(guide) {
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  return {
    heightProfile,
    surfaceMap,
    groundProfile,
    terrainProfile: {
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
    },
    selectFarBackground: () => createM3FarBackground(),
    worldSprites: [],
  };
}

test('M6.22 child charts share exact overlap geometry through D_cam around the handoff seam', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);

  for (const [side, chart] of [['LEFT', continuation.charts.left], ['RIGHT', continuation.charts.right]]) {
    const origin = M6_13_JUNCTION.separatedChildCenterL(side);
    for (const delta of [-5, 0, 20]) {
      const parentWorld = guideCourseToWorld(parent, M6_17_HANDOFF_SEAM_S + delta, origin);
      const childWorld = guideChartToWorld(chart, continuation.handoffLocalS + delta, 0);
      near(childWorld.x, parentWorld.x, 1e-5);
      near(childWorld.z, parentWorld.z, 1e-5);
      near(childWorld.heading, parentWorld.heading, 1e-8);
    }
  }
});

test('M6.22 child Guides are independent long courses and diverge after the shared prefix', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);

  assert.ok(continuation.left.guide.length > 300);
  assert.ok(continuation.right.guide.length > 300);
  assert.notEqual(continuation.left.guide, continuation.right.guide);
  assert.notEqual(continuation.left.guide.length, continuation.right.guide.length);
  assert.notEqual(continuation.left.guide.length, parent.length);
  assert.notEqual(continuation.right.guide.length, parent.length);

  const leftFinish = guideChartToWorld(continuation.charts.left, M6_22_CHILD_FINISH_S, 0);
  const rightFinish = guideChartToWorld(continuation.charts.right, M6_22_CHILD_FINISH_S, 0);
  assert.ok(Math.hypot(leftFinish.x - rightFinish.x, leftFinish.z - rightFinish.z) > 10);
});

test('M6.22 translated procedural GroundMap keeps child road centered and preserves seam phase', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const leftCenter = M6_13_JUNCTION.separatedChildCenterL('LEFT');
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
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
  };
  const parentAtSeam = sampleGroundMap(M6_17_HANDOFF_SEAM_S, leftCenter, parentProfile);
  const childAtSeam = sampleGroundMap(continuation.handoffLocalS, leftCenter, childProfile);
  assert.equal(childProfile.chainageOffsetS, continuation.parentSourceStartS);
  assert.equal(parentAtSeam, GROUND_COLORS.marking);
  assert.equal(childAtSeam, parentAtSeam);
});

test('M6.22 runtime packages retain independent child Guide/SurfaceMap while later milestones add child-owned visuals', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const registry = createM622LiveStageRuntimeRegistry(manifest, continuation, parentShared(parent));
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(left.coordinateFrame.guide, continuation.left.guide);
  assert.equal(right.coordinateFrame.guide, continuation.right.guide);
  assert.equal(left.surfaceMap.sample(M6_22_CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(right.surfaceMap.sample(M6_22_CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(left.surfaceMap.sample(M6_22_CHILD_FINISH_S, 5).type, 'VOID');
  assert.equal(right.surfaceMap.sample(M6_22_CHILD_FINISH_S, -5).type, 'VOID');
  assert.ok(left.worldSprites.length > 0);
  assert.ok(right.worldSprites.length > 0);
  assert.ok(left.worldSprites.every((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(right.worldSprites.every((sprite) => sprite.name.startsWith('MOUNTAIN_')));
  assert.notEqual(left.selectFarBackground(50), right.selectFarBackground(50));
});

test('M6.22 physical route choice commits an independent child chart and finishes on that child course', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const route = createM620LivePointToPointRouteDag();
  const routeState = createRouteDagState(route);
  const content = createM6DebugRouteStageContentManifest(route);
  const gates = createM622LivePointToPointGateSet(route, parent, continuation);
  const handoffs = createM622RouteStageHandoffManifest(route, parent, continuation);
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
    commitRouteStageHandoff(
      handoffState,
      routeState,
      content,
      charts,
      seamObservation.seam,
      seam.center,
    ),
    'COMMITTED',
  );
  near(handoffState.coordinate.s, continuation.handoffLocalS, 1e-5);
  near(handoffState.coordinate.l, 0, 1e-5);
  assert.equal(handoffState.activePackageId, 'CONTENT_GOAL_L');

  const finishGate = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === 'GOAL_L');
  assert.ok(finishGate);
  const expectedFinish = guideChartToWorld(continuation.charts.left, M6_22_CHILD_FINISH_S, 0);
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

test('M6.22 fixture stays validated while browser live wiring consumes the M6.27 assembly through M6.42 batching', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /createM627LiveRouteRuntime/);
  assert.match(mainSource, /const playerTraveler = createLiveRouteTravelerState\(liveRoute/);
  assert.match(mainSource, /const routeHandoffState = playerTraveler\.handoffState/);
  assert.match(mainSource, /advanceLiveRouteMultiActorTick/);
  assert.match(mainSource, /pseudoDepth\(vehicle\.course\.s, camera\.s\)/);
  assert.doesNotMatch(mainSource, /camera\.courseLength/);
  assert.doesNotMatch(mainSource, /createM626LiveContinuation|createM626LiveGateSet|createM626LiveStageRuntimeRegistry/);
  assert.doesNotMatch(mainSource, /createM622LivePointToPointGateSet|createM622ChildStageContinuation/);
  assert.doesNotMatch(rendererSource, /M6_22|M6_26|M6_27|M6_42|CONTENT_GOAL_[LR]|S2[LR]_CONTINUE/);
});
