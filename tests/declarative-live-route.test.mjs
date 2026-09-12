import { near } from './helpers/assert.mjs';
import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import {
  createLiveContinuation,
  createLiveGateSet,
  createLiveHandoffManifest,
  createLiveRouteDag,
} from '../dist/dev/courses/successor-stage-continuation.js';
import { createDeclarativeLiveRouteRuntime } from '../dist/dev/fixtures/declarative-route.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

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

test('declarative compiler reproduces physical gates and handoff seams exactly', () => {
  const { guide, live } = setup();
  const legacyRoute = createLiveRouteDag();
  const legacyContinuation = createLiveContinuation(guide);
  const legacyGates = createLiveGateSet(legacyRoute, legacyContinuation);
  const legacyHandoffs = createLiveHandoffManifest(legacyRoute, legacyContinuation);

  assert.deepEqual(
    live.gates.gates.map((gate) => gate.id),
    legacyGates.gates.map((gate) => gate.id),
  );
  for (const gate of live.gates.gates) {
    const legacy = legacyGates.gates.find((candidate) => candidate.id === gate.id);
    assert.ok(legacy);
    near(gate.center.x, legacy.center.x, 1e-7);
    near(gate.center.z, legacy.center.z, 1e-7);
    near(gate.heading, legacy.heading, 1e-7);
    near(gate.halfWidth, legacy.halfWidth, 1e-7);
  }

  assert.deepEqual(
    live.handoffs.seams.map((seam) => seam.id),
    legacyHandoffs.seams.map((seam) => seam.id),
  );
  for (const seam of live.handoffs.seams) {
    const legacy = legacyHandoffs.seams.find((candidate) => candidate.id === seam.id);
    assert.ok(legacy);
    assert.equal(seam.choiceId, legacy.choiceId);
    assert.equal(seam.targetChartId, legacy.targetChartId);
    near(seam.center.x, legacy.center.x, 1e-7);
    near(seam.center.z, legacy.center.z, 1e-7);
    near(seam.heading, legacy.heading, 1e-7);
  }
});

test('target chart ids are derived from target stage runtime rather than repeated in route rows', async () => {
  const { readFile } = await import('node:fs/promises');
  const compiler = await readFile(new URL('../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  const authoring = await readFile(new URL('../src/dev/fixtures/declarative-route.ts', import.meta.url), 'utf8');

  assert.match(compiler, /choiceId: transition\.id/);
  assert.match(compiler, /targetChartId: targetStage\.runtime\.coordinateFrame\.id/);
  assert.doesNotMatch(authoring, /targetChartId\s*:/);
  assert.doesNotMatch(authoring, /choiceId\s*:/);
});

test('main assembles one declarative fork plan above general topology compilation', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, m630Source, m638Source, growthSource, forkSource, fragmentSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/third-successor-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/raster-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/raster-fork-stage-route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtime/declarative-route-fragment.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(mainSource, /createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(
    mainSource,
    /createDeclarativeLiveRouteRuntime|createLiveRouteDag|createLiveContinuation|createThirdLiveSuccessorRuntime|createSecondLiveForkRuntime|createSymmetricSecondLiveForkRuntime/,
  );
  assert.match(m638Source, /createThirdLiveSuccessorAuthoring/);
  assert.match(m638Source, /compileRasterForkGrowthPlan/);
  assert.doesNotMatch(m638Source, /createM635SecondLiveFork|createM637SymmetricSecondLiveFork/);
  assert.match(growthSource, /compileRasterForkStageRoute/);
  assert.match(forkSource, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(m630Source, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(m630Source, /compileDeclarativeLiveRoute\s*\(/);
  assert.match(fragmentSource, /export function composeDeclarativeLiveRouteAuthoring/);
  assert.doesNotMatch(fragmentSource, /compileDeclarativeRouteFragments/);
  assert.doesNotMatch(m638Source, /createLiveRouteDag|createLiveGateSet|createLiveHandoffManifest/);
});

test('generic declarative compiler contains no renderer, camera, vehicle physics or milestone dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runtime/declarative-live-route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /render\//);
  assert.doesNotMatch(source, /camera/);
  assert.doesNotMatch(source, /car-physics|motorcycle-physics/);
  assert.doesNotMatch(source, /[678]|m6-2[678]/);
});
