import { near } from '../helpers/assert.mjs';
import { parentShared } from '../helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';

import { handoffGuideChart } from '../../dist/gameplay/guide-chart.js';
import { STADIUM_ROUTE_GATE_S } from '../../dist/dev/courses/stadium/route-gates.js';
import { STADIUM_HANDOFF_SEAM_S } from '../../dist/dev/courses/stadium/handoff.js';
import { STADIUM_JUNCTION } from '../../dist/dev/courses/stadium/junction.js';
import { createDeclarativeLiveRouteRuntime } from '../../dist/dev/fixtures/declarative-route.js';

import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';

function setup() {
  const guide = createStadiumGuide();
  const assets = createSpriteAssets();
  const live = createDeclarativeLiveRouteRuntime(guide, parentShared(guide), assets);
  return { guide, assets, live };
}

test('declarative rows compile the same five-stage route with derived package bindings', () => {
  const { live } = setup();
  assert.deepEqual(
    live.route.stages.map((stage) => [stage.id, stage.kind]),
    [
      ['STAGE_1', 'STAGE'],
      ['STAGE_2_L', 'STAGE'],
      ['STAGE_2_R', 'STAGE'],
      ['GOAL_L', 'TERMINAL'],
      ['GOAL_R', 'TERMINAL'],
    ],
  );
  assert.deepEqual(
    live.route.choices.map((choice) => choice.id),
    ['S1_LEFT', 'S1_RIGHT', 'S2L_CONTINUE', 'S2R_CONTINUE'],
  );
  assert.deepEqual(
    live.content.bindings.map((binding) => [binding.stageId, binding.packageId]),
    [
      ['STAGE_1', 'CONTENT_STAGE_1'],
      ['STAGE_2_L', 'CONTENT_STAGE_2_L'],
      ['STAGE_2_R', 'CONTENT_STAGE_2_R'],
      ['GOAL_L', 'CONTENT_GOAL_L'],
      ['GOAL_R', 'CONTENT_GOAL_R'],
    ],
  );
});

test('physical gates precede handoffs and seams coincide in both owning charts', () => {
  const { live } = setup();
  const { continuation } = live;
  const rows = [
    [
      'S1_LEFT',
      continuation.base.charts.parent,
      continuation.base.charts.left,
      STADIUM_ROUTE_GATE_S,
      STADIUM_HANDOFF_SEAM_S,
      STADIUM_JUNCTION.separatedChildCenterL('LEFT'),
      continuation.base.handoffLocalS,
    ],
    [
      'S1_RIGHT',
      continuation.base.charts.parent,
      continuation.base.charts.right,
      STADIUM_ROUTE_GATE_S,
      STADIUM_HANDOFF_SEAM_S,
      STADIUM_JUNCTION.separatedChildCenterL('RIGHT'),
      continuation.base.handoffLocalS,
    ],
    ...[continuation.leftSuccessor, continuation.rightSuccessor].map((source, i) => [
      i === 0 ? 'S2L_CONTINUE' : 'S2R_CONTINUE',
      source.link.sourceFrame,
      source.chart,
      source.sourceTransitionS,
      source.sourceSeamS,
      0,
      source.targetSeamS,
    ]),
  ];
  for (const [choice, source, target, gateS, seamS, lateral, targetS] of rows) {
    const gate = live.gates.gates.find((entry) => entry.choiceId === choice);
    const seam = live.handoffs.seams.find((entry) => entry.choiceId === choice);
    assert.ok(gate && seam);
    assert.ok(gateS < seamS);
    const gateLocal = handoffGuideChart(source, gate.center);
    const sourceLocal = handoffGuideChart(source, seam.center);
    const targetLocal = handoffGuideChart(target, seam.center);
    near(gateLocal.s, gateS, 1e-6);
    near(gateLocal.l, lateral, 1e-6);
    near(sourceLocal.s, seamS, 1e-6);
    near(sourceLocal.l, lateral, 1e-6);
    near(targetLocal.s, targetS, 1e-6);
    near(targetLocal.l, 0, 1e-6);
    assert.equal(seam.targetChartId, target.id);
    assert.equal(gate.halfWidth, 3.5);
    assert.equal(seam.halfWidth, 3.5);
  }
});

test('target chart ids are derived from target stage runtime rather than repeated in route rows', async () => {
  const { readFile } = await import('node:fs/promises');
  const compiler = await readFile(new URL('../../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  const authoring = await readFile(new URL('../../src/dev/fixtures/declarative-route.ts', import.meta.url), 'utf8');

  assert.match(compiler, /choiceId: transition\.id/);
  assert.match(compiler, /targetChartId: targetStage\.runtime\.coordinateFrame\.id/);
  assert.doesNotMatch(authoring, /targetChartId\s*:/);
  assert.doesNotMatch(authoring, /choiceId\s*:/);
});

test('main assembles one declarative fork plan above general topology compilation', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, successorSource, planSource, growthSource, forkSource, fragmentSource] = await Promise.all([
    readFile(new URL('../../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dev/courses/third-successor-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dev/courses/fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/runtime/raster-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/runtime/raster-fork-stage-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/runtime/declarative-route-fragment.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(
    mainSource,
    /createDeclarativeLiveRouteRuntime|createLiveContinuation|createThirdLiveSuccessorRuntime|createSecondLiveForkRuntime/,
  );
  assert.match(planSource, /createThirdLiveSuccessorAuthoring/);
  assert.match(planSource, /compileRasterForkGrowthPlan/);
  assert.match(growthSource, /compileRasterForkStageRoute/);
  assert.match(forkSource, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(successorSource, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(successorSource, /compileDeclarativeLiveRoute\s*\(/);
  assert.match(fragmentSource, /export function composeDeclarativeLiveRouteAuthoring/);
});

test('generic declarative compiler contains no renderer, camera or vehicle physics dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /camera/);
  assert.doesNotMatch(source, /car-physics|motorcycle-physics/);
});
