import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createSecondLiveForkRuntime } from '../dist/dev/fixtures/left-second-fork.js';

import { handoffGuideChart } from '../dist/gameplay/guide-chart.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function setup() {
  const guide = createStadiumGuide();
  return createSecondLiveForkRuntime(guide, parentShared(guide), createSpriteAssets());
}

function crossing(gate, distance = 2) {
  const nx = Math.sin(gate.heading);
  const nz = Math.cos(gate.heading);
  return {
    previous: { x: gate.center.x - nx * distance, z: gate.center.z - nz * distance },
    current: { x: gate.center.x + nx * distance, z: gate.center.z + nz * distance },
  };
}

test('promotes the old LEFT terminal into a second physical fork with two terminal outcomes', () => {
  const live = setup();
  assert.deepEqual(
    live.route.stages.map((stage) => [stage.id, stage.kind]),
    [
      ['STAGE_1', 'STAGE'],
      ['STAGE_2_L', 'STAGE'],
      ['STAGE_2_R', 'STAGE'],
      ['STAGE_3_L', 'STAGE'],
      ['STAGE_4_L_FORK', 'STAGE'],
      ['STAGE_3_R', 'STAGE'],
      ['GOAL_R', 'TERMINAL'],
      ['GOAL_LA', 'TERMINAL'],
      ['GOAL_LB', 'TERMINAL'],
    ],
  );
  assert.deepEqual(
    live.route.choices.map((choice) => choice.id),
    ['S1_LEFT', 'S1_RIGHT', 'S2L_CONTINUE', 'S3L_CONTINUE', 'S2R_CONTINUE', 'S3R_CONTINUE', 'S4L_FORK_A', 'S4L_FORK_B'],
  );
  assert.equal(
    live.route.stages.some((stage) => stage.id === 'GOAL_L'),
    false,
  );
});

test('fork package owns a visible/physical local junction with a derived 12m half-envelope', () => {
  const live = setup();
  const fork = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_4_L_FORK');
  assert.ok(fork);
  assert.ok(fork.roadView);
  assert.equal(fork.roadView.groundLeft, 12);
  assert.equal(fork.roadView.groundRight, 12);
  assert.equal(fork.groundProfile.stageJunction !== undefined, true);
  assert.equal(fork.terrainProfile.groundLeft, 12);
  assert.equal(fork.terrainProfile.groundRight, 12);
  assert.equal(fork.surfaceMap.sample(195, -7.5).type, 'ASPHALT');
  assert.equal(fork.surfaceMap.sample(195, 7.5).type, 'ASPHALT');
  assert.equal(fork.surfaceMap.sample(195, 0).type, 'GRASS');
});

test('second fork has two non-overlapping physical gates and the median selects nothing', () => {
  const live = setup();
  const routeState = createRouteDagState(live.route);

  for (const choiceId of ['S1_LEFT', 'S2L_CONTINUE', 'S3L_CONTINUE']) {
    const gate = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === choiceId);
    assert.ok(gate);
    const motion = crossing(gate);
    const observed = observeRouteBoundaryCrossing(live.route, routeState, live.gates, motion.previous, motion.current);
    const update = updateRouteDag(routeState, live.route, observed.boundary);
    assert.equal(update.event, 'TRANSITION_ACCEPTED');
  }
  assert.equal(routeState.activeStageId, 'STAGE_4_L_FORK');

  const forkA = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === 'S4L_FORK_A');
  const forkB = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === 'S4L_FORK_B');
  assert.ok(forkA);
  assert.ok(forkB);
  assert.equal(forkA.halfWidth, 3.5);
  assert.equal(forkB.halfWidth, 3.5);
  assert.ok(Math.hypot(forkA.center.x - forkB.center.x, forkA.center.z - forkB.center.z) > 7);

  const center = {
    x: (forkA.center.x + forkB.center.x) * 0.5,
    z: (forkA.center.z + forkB.center.z) * 0.5,
  };
  const nx = Math.sin(forkA.heading);
  const nz = Math.cos(forkA.heading);
  const observedMedian = observeRouteBoundaryCrossing(
    live.route,
    routeState,
    live.gates,
    { x: center.x - nx * 2, z: center.z - nz * 2 },
    { x: center.x + nx * 2, z: center.z + nz * 2 },
  );
  assert.equal(observedMedian.boundary, null);
});

test('fork handoff seams map source child centers to target local l=0', () => {
  const live = setup();
  const forkRuntime = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_4_L_FORK');
  assert.ok(forkRuntime);
  for (const [choiceId, packageId, expectedSourceL] of [
    ['S4L_FORK_A', 'CONTENT_GOAL_LA', -7.5],
    ['S4L_FORK_B', 'CONTENT_GOAL_LB', 7.5],
  ]) {
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choiceId);
    const target = live.registry.packages.find((entry) => entry.packageId === packageId);
    assert.ok(seam);
    assert.ok(target);
    assert.equal(seam.targetChartId, target.coordinateFrame.id);
    const sourceCoordinate = handoffGuideChart(forkRuntime.coordinateFrame, seam.center);
    const targetCoordinate = handoffGuideChart(target.coordinateFrame, seam.center);
    assert.ok(Math.abs(sourceCoordinate.l - expectedSourceL) < 1e-6);
    assert.ok(Math.abs(targetCoordinate.l) < 1e-6);
  }
});

test('complete LEFT-A route performs four PENDING/COMMIT handoffs then physically FINISHes', () => {
  const live = setup();
  const routeState = createRouteDagState(live.route);
  const handoffState = createRouteStageHandoffState(live.route, live.content, live.initialChart, { x: 0, z: -55 });
  const sequence = [
    ['S1_LEFT', 'CONTENT_STAGE_2_L'],
    ['S2L_CONTINUE', 'CONTENT_STAGE_3_L'],
    ['S3L_CONTINUE', 'CONTENT_STAGE_4_L_FORK'],
    ['S4L_FORK_A', 'CONTENT_GOAL_LA'],
  ];

  for (const [choiceId, packageId] of sequence) {
    const gate = live.gates.gates.find((entry) => entry.kind === 'TRANSITION' && entry.choiceId === choiceId);
    assert.ok(gate);
    const motion = crossing(gate);
    const observation = observeRouteBoundaryCrossing(
      live.route,
      routeState,
      live.gates,
      motion.previous,
      motion.current,
    );
    const routeUpdate = updateRouteDag(routeState, live.route, observation.boundary);
    assert.equal(routeUpdate.event, 'TRANSITION_ACCEPTED');
    assert.equal(queueRouteStageHandoff(handoffState, live.handoffs, routeUpdate), 'PENDING');

    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choiceId);
    assert.ok(seam);
    const seamMotion = crossing(seam);
    const seamObservation = observePendingRouteStageHandoff(
      handoffState,
      live.handoffs,
      seamMotion.previous,
      seamMotion.current,
    );
    assert.equal(
      commitRouteStageHandoff(handoffState, routeState, live.content, live.charts, seamObservation.seam, seam.center),
      'COMMITTED',
    );
    assert.equal(handoffState.activePackageId, packageId);
  }

  const finish = live.gates.gates.find((entry) => entry.kind === 'FINISH' && entry.stageId === 'GOAL_LA');
  assert.ok(finish);
  const finishMotion = crossing(finish);
  const finishObservation = observeRouteBoundaryCrossing(
    live.route,
    routeState,
    live.gates,
    finishMotion.previous,
    finishMotion.current,
  );
  const finishUpdate = updateRouteDag(routeState, live.route, finishObservation.boundary);
  assert.equal(finishUpdate.event, 'FINISHED');
  assert.equal(routeState.status, 'FINISHED');
  assert.equal(handoffState.commitCount, 4);
});

test('fixture stays validated below the live plan and delegates fork assembly to ', async () => {
  const [source, compiler, stableEntry, main, renderer] = await Promise.all([
    readFile(new URL('../src/dev/fixtures/left-second-fork.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/raster-fork-stage-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /compileRasterForkStageRoute/);
  assert.match(source, /createSecondLiveForkAuthoring/);
  assert.doesNotMatch(
    source,
    /compileStageJunction|createRasterForkStageSuccessor|baseStages|baseTransitions|forkTransition|pointGeometry/,
  );
  assert.match(compiler, /compileStageJunction/);
  assert.match(compiler, /createRasterForkStageSuccessor/);
  assert.match(compiler, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(stableEntry, /createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(main, /STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
  assert.doesNotMatch(renderer, /STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
});
