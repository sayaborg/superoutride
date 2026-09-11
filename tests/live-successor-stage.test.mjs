import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createSuccessorStageRegistry } from '../dist/dev/courses/successor-stage-content.js';
import {
  createLiveContinuation,
  createLiveGateSet,
  createLiveHandoffManifest,
  createLiveRouteDag,
} from '../dist/dev/courses/successor-stage-continuation.js';

import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';

import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function crossing(gate, distance = 2) {
  const nx = Math.sin(gate.heading);
  const nz = Math.cos(gate.heading);
  return {
    previous: { x: gate.center.x - nx * distance, z: gate.center.z - nz * distance },
    current: { x: gate.center.x + nx * distance, z: gate.center.z + nz * distance },
  };
}

function setup() {
  const parent = createStadiumGuide();
  const route = createLiveRouteDag();
  const continuation = createLiveContinuation(parent);
  const gates = createLiveGateSet(route, continuation);
  const handoffs = createLiveHandoffManifest(route, continuation);
  const content = createMinimalStageContentManifest(route);
  const assets = createSpriteAssets();
  const registry = createSuccessorStageRegistry(content, continuation, parentShared(parent), assets);
  return { parent, route, continuation, gates, handoffs, content, registry };
}

test('live route is one fork followed by one successor stage on each selected side', () => {
  const { route } = setup();
  assert.deepEqual(
    route.stages.map((stage) => stage.id),
    ['STAGE_1', 'STAGE_2_L', 'STAGE_2_R', 'GOAL_L', 'GOAL_R'],
  );
  assert.equal(route.choices.length, 4);
  assert.equal(route.stages.filter((stage) => stage.kind === 'TERMINAL').length, 2);
});

test('successor Guides share a validated D_cam overlap then become independent courses', () => {
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

test('gate/handoff manifests cover all four route choices and finish only on successor charts', () => {
  const { route, continuation, gates, handoffs } = setup();
  assert.equal(handoffs.seams.length, route.choices.length);
  assert.equal(gates.gates.filter((gate) => gate.kind === 'TRANSITION').length, 4);
  assert.equal(gates.gates.filter((gate) => gate.kind === 'FINISH').length, 2);
  const leftFinish = gates.gates.find((gate) => gate.kind === 'FINISH' && gate.stageId === 'GOAL_L');
  assert.ok(leftFinish);
  assert.ok(
    Math.hypot(
      leftFinish.center.x - continuation.leftSuccessor.chart.guide.raster.vertices[0].x,
      leftFinish.center.z - continuation.leftSuccessor.chart.guide.raster.vertices[0].z,
    ) > 1,
  );
});

test('runtime registry owns parent, intermediate children and independent successor packages', () => {
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

test('left path can commit parent->child, child->successor, then physically FINISH without world teleport', () => {
  const { route, continuation, gates, handoffs, content } = setup();
  const state = createRouteDagState(route);
  const handoffState = createRouteStageHandoffState(route, content, continuation.base.charts.parent, { x: 0, z: -55 });

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
    assert.equal(
      commitRouteStageHandoff(handoffState, state, content, continuation.charts, seamObservation.seam, seam.center),
      'COMMITTED',
    );
    assert.deepEqual(seam.center, worldBefore);
    assert.equal(handoffState.activePackageId, step.targetPackage);
  }

  const finish = gates.gates.find((entry) => entry.kind === 'FINISH' && entry.stageId === 'GOAL_L');
  assert.ok(finish);
  const finishMotion = crossing(finish);
  const finishObservation = observeRouteBoundaryCrossing(
    route,
    state,
    gates,
    finishMotion.previous,
    finishMotion.current,
  );
  const finishUpdate = updateRouteDag(state, route, finishObservation.boundary);
  assert.equal(finishUpdate.event, 'FINISHED');
  assert.equal(state.status, 'FINISHED');
  assert.equal(handoffState.commitCount, 2);
});

test('browser/runtime additions stay outside renderer Core while owns continuation construction', async () => {
  const { readFile } = await import('node:fs/promises');
  const [rendererSource, liveSource, successorFactorySource] = await Promise.all([
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/successor-stage-continuation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/raster-stage-successor.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(liveSource, /S2L_CONTINUE/);
  assert.match(liveSource, /createRasterStageSuccessor/);
  assert.match(successorFactorySource, /compileStageContinuationLink|StageContinuationLink/);
  assert.doesNotMatch(successorFactorySource, /route-dag|route-boundary|route-stage-handoff|render\//);
  assert.doesNotMatch(rendererSource, /M[0-9]+(?:[._][0-9]+)?|STAGE_2_[LR]|S2[LR]_CONTINUE|SUCCESSOR/);
});
