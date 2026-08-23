import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import {
  createM626LiveContinuation,
  createM626LiveGateSet,
  createM626LiveHandoffManifest,
  createM626LiveRouteDag,
} from '../dist/dev/m6-26-live-successor-stage.js';
import { createM626LiveStageRuntimeRegistry } from '../dist/dev/m6-26-live-runtime-content.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import { createGuideChart } from '../dist/gameplay/guide-chart.js';
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
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

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

function crossing(gate, distance = 2) {
  const nx = Math.sin(gate.heading);
  const nz = Math.cos(gate.heading);
  return {
    previous: { x: gate.center.x - nx * distance, z: gate.center.z - nz * distance },
    current: { x: gate.center.x + nx * distance, z: gate.center.z + nz * distance },
  };
}

function setup() {
  const parent = createM2StadiumGuide();
  const route = createM626LiveRouteDag();
  const continuation = createM626LiveContinuation(parent);
  const gates = createM626LiveGateSet(route, continuation);
  const handoffs = createM626LiveHandoffManifest(route, continuation);
  const content = createM6DebugRouteStageContentManifest(route);
  const assets = createM4SpriteAssets();
  const registry = createM626LiveStageRuntimeRegistry(content, continuation, parentShared(parent), assets);
  return { parent, route, continuation, gates, handoffs, content, registry };
}

test('M6.26 live route is one fork followed by one successor stage on each selected side', () => {
  const { route } = setup();
  assert.deepEqual(route.nodes.map((node) => node.id), ['STAGE_1', 'STAGE_2_L', 'STAGE_2_R', 'GOAL_L', 'GOAL_R']);
  assert.equal(route.choices.length, 4);
  assert.equal(route.nodes.filter((node) => node.kind === 'TERMINAL').length, 2);
});

test('M6.26 successor Guides share a validated D_cam overlap then become independent courses', () => {
  const { continuation } = setup();
  for (const successor of [continuation.leftSuccessor, continuation.rightSuccessor]) {
    assert.equal(successor.link.overlapBehind, 5);
    assert.equal(successor.link.overlapAhead, 5);
    assert.ok(successor.sourceTransitionS < successor.sourceSeamS);
    assert.ok(successor.sourceTransitionS > 300);
    assert.ok(successor.finishS > successor.targetSeamS);
    assert.notEqual(successor.chart.guide, successor.link.sourceFrame.guide);
  }
});

test('M6.26 gate/handoff manifests cover all four route choices and finish only on successor charts', () => {
  const { route, continuation, gates, handoffs } = setup();
  assert.equal(handoffs.seams.length, route.choices.length);
  assert.equal(gates.gates.filter((gate) => gate.kind === 'TRANSITION').length, 4);
  assert.equal(gates.gates.filter((gate) => gate.kind === 'FINISH').length, 2);
  const leftFinish = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === 'GOAL_L');
  assert.ok(leftFinish);
  assert.ok(Math.hypot(
    leftFinish.center.x - continuation.leftSuccessor.chart.guide.raster.vertices[0].x,
    leftFinish.center.z - continuation.leftSuccessor.chart.guide.raster.vertices[0].z,
  ) > 1);
});

test('M6.26 runtime registry owns parent, intermediate children and independent successor packages', () => {
  const { continuation, registry } = setup();
  assert.equal(registry.packages.length, 5);
  const child = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_STAGE_2_L' });
  const goal = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  assert.equal(child.coordinateFrame, continuation.base.left.chart);
  assert.equal(goal.coordinateFrame, continuation.leftSuccessor.chart);
  assert.notEqual(child.coordinateFrame.guide, goal.coordinateFrame.guide);
  assert.ok(child.worldSprites.some((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(goal.worldSprites.some((sprite) => sprite.name.startsWith('COAST_')));
});

test('M6.26 left path can commit parent->child, child->successor, then physically FINISH without world teleport', () => {
  const { route, continuation, gates, handoffs, content } = setup();
  const state = createRouteDagState(route);
  const handoffState = createRouteStageHandoffState(
    route,
    content,
    continuation.base.charts.parent,
    { x: 0, z: -55 },
  );

  const sequence = [
    { choiceId: 'S1_LEFT', targetPackage: 'CONTENT_STAGE_2_L' },
    { choiceId: 'S2L_CONTINUE', targetPackage: 'CONTENT_GOAL_L' },
  ];
  for (const step of sequence) {
    const gate = gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === step.choiceId);
    assert.ok(gate);
    const motion = crossing(gate);
    const observation = observeRouteBoundaryCrossing(route, state, gates, motion.previous, motion.current);
    const update = updateRouteDag(state, route, observation.boundary);
    assert.equal(update.event, 'TRANSITION_ACCEPTED');
    assert.equal(queueRouteStageHandoff(handoffState, handoffs, update), 'PENDING');

    const seam = handoffs.seams.find((entry) => entry.choiceId === step.choiceId);
    assert.ok(seam);
    const seamMotion = crossing(seam);
    const seamObservation = observePendingRouteStageHandoff(
      handoffState,
      handoffs,
      seamMotion.previous,
      seamMotion.current,
    );
    const worldBefore = { ...seam.center };
    assert.equal(commitRouteStageHandoff(
      handoffState,
      state,
      content,
      continuation.charts,
      seamObservation.seam,
      seam.center,
    ), 'COMMITTED');
    assert.deepEqual(seam.center, worldBefore);
    assert.equal(handoffState.activePackageId, step.targetPackage);
  }

  const finish = gates.gates.find((entry) => entry.kind === 'FINISH' && entry.stageId === 'GOAL_L');
  assert.ok(finish);
  const finishMotion = crossing(finish);
  const finishObservation = observeRouteBoundaryCrossing(route, state, gates, finishMotion.previous, finishMotion.current);
  const finishUpdate = updateRouteDag(state, route, finishObservation.boundary);
  assert.equal(finishUpdate.event, 'FINISHED');
  assert.equal(state.status, 'FINISHED');
  assert.equal(handoffState.commitCount, 2);
});

test('M6.26 browser/runtime additions do not add successor-stage knowledge to renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [rendererSource, liveSource] = await Promise.all([
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-26-live-successor-stage.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(liveSource, /S2L_CONTINUE/);
  assert.match(liveSource, /StageContinuationLink/);
  assert.doesNotMatch(rendererSource, /M6_26|STAGE_2_[LR]|S2[LR]_CONTINUE|SUCCESSOR/);
});
