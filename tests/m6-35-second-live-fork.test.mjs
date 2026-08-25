import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM635SecondLiveForkRuntime } from '../dist/dev/m6-35-second-live-fork.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { observeRouteBoundaryCrossing } from '../dist/gameplay/route-boundary-gates.js';
import { createRouteDagState, updateRouteDag } from '../dist/gameplay/route-dag.js';
import { handoffGuideChart } from '../dist/gameplay/guide-chart.js';
import {
  commitRouteStageHandoff,
  createRouteStageHandoffState,
  observePendingRouteStageHandoff,
  queueRouteStageHandoff,
} from '../dist/gameplay/route-stage-handoff.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
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

function setup() {
  const guide = createM2StadiumGuide();
  return createM635SecondLiveForkRuntime(guide, parentShared(guide), createM4SpriteAssets());
}

function crossing(gate, distance = 2) {
  const nx = Math.sin(gate.heading);
  const nz = Math.cos(gate.heading);
  return {
    previous: { x: gate.center.x - nx * distance, z: gate.center.z - nz * distance },
    current: { x: gate.center.x + nx * distance, z: gate.center.z + nz * distance },
  };
}

test('M6.35 promotes the old LEFT terminal into a second physical fork with two terminal outcomes', () => {
  const live = setup();
  assert.deepEqual(live.route.stages.map((stage) => [stage.id, stage.kind]), [
    ['STAGE_1', 'STAGE'],
    ['STAGE_2_L', 'STAGE'],
    ['STAGE_2_R', 'STAGE'],
    ['STAGE_3_L', 'STAGE'],
    ['STAGE_4_L_FORK', 'STAGE'],
    ['STAGE_3_R', 'STAGE'],
    ['GOAL_R', 'TERMINAL'],
    ['GOAL_LA', 'TERMINAL'],
    ['GOAL_LB', 'TERMINAL'],
  ]);
  assert.deepEqual(live.route.choices.map((choice) => choice.id), [
    'S1_LEFT', 'S1_RIGHT',
    'S2L_CONTINUE', 'S3L_CONTINUE',
    'S2R_CONTINUE', 'S3R_CONTINUE',
    'S4L_FORK_A', 'S4L_FORK_B',
  ]);
  assert.equal(live.route.stages.some((stage) => stage.id === 'GOAL_L'), false);
});

test('M6.35 fork package owns a visible/physical local junction with a derived 12m half-envelope', () => {
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

test('M6.35 second fork has two non-overlapping physical gates and the median selects nothing', () => {
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

test('M6.35 fork handoff seams map source child centers to target local l=0', () => {
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

test('M6.35 complete LEFT-A route performs four PENDING/COMMIT handoffs then physically FINISHes', () => {
  const live = setup();
  const routeState = createRouteDagState(live.route);
  const handoffState = createRouteStageHandoffState(
    live.route,
    live.content,
    live.initialChart,
    { x: 0, z: -55 },
  );
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
    const observation = observeRouteBoundaryCrossing(live.route, routeState, live.gates, motion.previous, motion.current);
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
    assert.equal(commitRouteStageHandoff(
      handoffState,
      routeState,
      live.content,
      live.charts,
      seamObservation.seam,
      seam.center,
    ), 'COMMITTED');
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

test('M6.35 fixture stays validated below the M6.38 live plan and delegates fork assembly to M6.36', async () => {
  const [source, compiler, stableEntry, main, renderer] = await Promise.all([
    readFile(new URL('../src/dev/m6-35-second-live-fork.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/raster-fork-stage-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-27-live-route-runtime.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /compileRasterForkStageRoute/);
  assert.match(source, /createM635SecondLiveForkAuthoring/);
  assert.doesNotMatch(source, /compileStageJunction|createRasterForkStageSuccessor|baseStages|baseTransitions|forkTransition|pointGeometry/);
  assert.match(compiler, /compileStageJunction/);
  assert.match(compiler, /createRasterForkStageSuccessor/);
  assert.match(compiler, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(stableEntry, /createM638DeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(main, /STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
  assert.doesNotMatch(renderer, /STAGE_4_L_FORK|GOAL_LA|GOAL_LB|S4L_FORK/);
});
