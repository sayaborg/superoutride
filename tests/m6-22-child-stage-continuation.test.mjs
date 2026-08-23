import test from 'node:test';
import assert from 'node:assert/strict';

import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM622LiveStageRuntimeRegistry } from '../dist/dev/m6-22-live-runtime-content.js';
import { createM620LivePointToPointRuntime } from '../dist/dev/m6-20-live-point-to-point-runtime.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import { resolveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

function near(actual, expected, epsilon = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

function crossing(gate, distance = 1) {
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

function createFixture() {
  const guide = createM2StadiumGuide();
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const spriteAssets = createM4SpriteAssets();
  const parent = createM620LivePointToPointRuntime(
    guide,
    {
      heightProfile,
      surfaceMap,
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
      groundProfile: {
        groundLeft: 12,
        groundRight: 12,
        roadLeft: 4.5,
        roadRight: 4.5,
        shoulderWidth: 1,
        junction: M6_13_JUNCTION,
        logical: compiled.groundMap,
      },
      selectFarBackground: () => createM3FarBackground(),
      worldSprites: [],
    },
    spriteAssets,
  );
  const continuation = createM622ChildStageContinuation(guide, M6_13_JUNCTION);
  const registry = createM622LiveStageRuntimeRegistry(
    parent.manifest,
    continuation,
    parent.runtimeContent,
  );
  return { guide, parent, continuation, registry };
}

test('M6.22 child charts share exact overlap geometry through D_cam around the handoff seam', () => {
  const { continuation } = createFixture();
  for (const child of [continuation.left, continuation.right]) {
    const sourceOrigin = child.sourceStartS;
    for (const localS of [0, child.handoffLocalS - 5, child.handoffLocalS, child.handoffLocalS + 5]) {
      const parentS = sourceOrigin + localS;
      const parent = child.sourceGuide.sample(parentS);
      const target = child.guide.sample(localS);
      near(parent.x, target.x, 1e-6);
      near(parent.z, target.z, 1e-6);
      near(parent.heading, target.heading, 1e-7);
    }
  }
});

test('M6.22 child Guides are independent long courses and diverge after the shared prefix', () => {
  const { continuation } = createFixture();
  assert.notEqual(continuation.left.guide, continuation.right.guide);
  assert.ok(continuation.left.guide.length > 250);
  assert.ok(continuation.right.guide.length > 250);

  const probe = 150;
  const left = continuation.left.guide.sample(probe);
  const right = continuation.right.guide.sample(probe);
  assert.ok(Math.hypot(left.x - right.x, left.z - right.z) > 1);
});

test('M6.22 translated procedural GroundMap keeps child road centered and preserves seam phase', () => {
  const { continuation } = createFixture();
  for (const child of [continuation.left, continuation.right]) {
    for (const localS of [2, child.handoffLocalS, child.handoffLocalS + 8]) {
      assert.equal(child.groundProfile.logical.sample(localS, 0), 'ROAD');
      assert.equal(child.groundProfile.logical.sample(localS, 4.25), 'SHOULDER');
      assert.equal(child.groundProfile.logical.sample(localS, 5.25), 'GROUND');
    }
  }
});

test('M6.22 runtime packages retain independent child Guide/SurfaceMap while later milestones add child-owned visuals', () => {
  const { parent, continuation, registry } = createFixture();
  const left = resolveStageRuntimeContent(registry, 'CONTENT_GOAL_L');
  const right = resolveStageRuntimeContent(registry, 'CONTENT_GOAL_R');

  assert.equal(left.coordinateFrame.guide, continuation.left.guide);
  assert.equal(right.coordinateFrame.guide, continuation.right.guide);
  assert.equal(left.surfaceMap, continuation.left.surfaceMap);
  assert.equal(right.surfaceMap, continuation.right.surfaceMap);
  assert.ok(left.worldSprites.length > 0);
  assert.ok(right.worldSprites.length > 0);
  assert.ok(left.worldSprites.every((sprite) => sprite.id.startsWith('COAST_')));
  assert.ok(right.worldSprites.every((sprite) => sprite.id.startsWith('MOUNTAIN_')));
  assert.notEqual(left.selectFarBackground(0), right.selectFarBackground(0));
  assert.notEqual(left.coordinateFrame, parent.runtimeContent.coordinateFrame);
  assert.notEqual(right.coordinateFrame, parent.runtimeContent.coordinateFrame);
});

test('M6.22 physical route choice commits an independent child chart and finishes on that child course', () => {
  const { parent, continuation } = createFixture();
  const route = parent.route;
  const gates = parent.gates;
  const handoffs = parent.handoffs;
  const routeState = createRouteDagState(route);
  const handoffState = createRouteStageHandoffState(
    parent.manifest,
    continuation.charts,
    route.startStageId,
    parent.runtimeContent.coordinateFrame.toWorld(0, 0),
  );

  const routeGate = gates.gates.find((gate) => gate.kind === 'TRANSITION' && gate.choiceId === 'S1_LEFT');
  assert.ok(routeGate);
  const selectionMotion = crossing(routeGate);
  const selectionObservation = observeRouteBoundaryCrossing(
    route,
    routeState,
    gates,
    selectionMotion.previous,
    selectionMotion.current,
  );
  const routeUpdate = updateRouteDag(routeState, route, selectionObservation.boundary);
  queueRouteStageHandoff(handoffState, handoffs, routeUpdate);
  assert.equal(handoffState.pending?.targetChartId, continuation.left.chart.id);

  const seam = handoffs.seams.find((candidate) => candidate.choiceId === 'S1_LEFT');
  assert.ok(seam);
  const seamMotion = crossing(seam);
  const handoffObservation = observePendingRouteStageHandoff(
    handoffState,
    handoffs,
    seamMotion.previous,
    seamMotion.current,
  );
  const event = commitRouteStageHandoff(
    handoffState,
    routeState,
    parent.manifest,
    continuation.charts,
    handoffObservation.seam,
    seamMotion.current,
  );
  assert.equal(event, 'COMMITTED');
  assert.equal(handoffState.activeChartId, continuation.left.chart.id);
  assert.equal(handoffState.coordinate.s > continuation.left.handoffLocalS, true);

  const finishGate = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === 'GOAL_L');
  assert.ok(finishGate);
  const expectedFinish = continuation.left.guide.sample(250);
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

test('M6.22 fixture stays validated while browser live wiring consumes the M6.27 assembly through the M6.42 actor transaction', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /createM627LiveRouteRuntime/);
  assert.match(mainSource, /const playerTraveler = createLiveRouteTravelerState\(liveRoute/);
  assert.match(mainSource, /const routeHandoffState = playerTraveler\.handoffState/);
  assert.match(mainSource, /advanceLiveRouteMultiActorTick/);
  assert.match(mainSource, /camera\.courseLength/);
  assert.doesNotMatch(mainSource, /createM626LiveContinuation|createM626LiveGateSet|createM626LiveStageRuntimeRegistry/);
  assert.doesNotMatch(mainSource, /createM622LivePointToPointGateSet|createM622ChildStageContinuation/);
  assert.doesNotMatch(rendererSource, /M6_22|M6_26|M6_27|M6_42|CONTENT_GOAL_[LR]|S2[LR]_CONTINUE/);
});