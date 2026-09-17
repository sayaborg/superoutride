import { parentShared } from '../helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createStadiumGuide } from '../../dist/dev/fixtures/raster-courses.js';

import {
  createDeclarativeForkGrowthPlan,
  createDeclarativeForkGrowthRuntime,
} from '../../dist/dev/courses/fork-growth-plan.js';
import { createThirdLiveSuccessorAuthoring } from '../../dist/dev/courses/third-successor-route.js';

import { compileRasterForkGrowthPlan } from '../../dist/runtime/raster-fork-growth-plan.js';

import { createSpriteAssets } from '../../dist/visual/sprite-assets.js';

function setup() {
  const guide = createStadiumGuide();
  const parent = parentShared(guide);
  const assets = createSpriteAssets();
  return { guide, parent, assets };
}

test('each plan step preserves the other branch packages and physical boundaries', () => {
  const { guide, parent, assets } = setup();
  const plan = createDeclarativeForkGrowthPlan(guide, parent, assets);
  const first = plan.steps[0].authoring;
  const final = plan.authoring;
  const leftStages = first.stages.filter((stage) => /(?:_L|_LA|_LB)$/.test(stage.id) || stage.id === 'STAGE_4_L_FORK');
  for (const stage of leftStages) {
    assert.equal(final.stages.find((candidate) => candidate.id === stage.id).runtime, stage.runtime);
  }
  for (const transition of first.transitions.filter((row) => row.fromStageId.includes('_L'))) {
    const retained = final.transitions.find((row) => row.id === transition.id);
    assert.deepEqual(retained, transition);
  }
  const live = createDeclarativeForkGrowthRuntime(guide, parent, assets);
  assert.equal(live.handoffs.seams.length, live.route.choices.length);
  for (const binding of live.content.bindings) {
    assert.ok(live.registry.packages.some((runtime) => runtime.packageId === binding.packageId));
  }
});

test('plan is an ordered two-step fold and the generic zero-step plan is identity', () => {
  const { guide, parent, assets } = setup();
  const plan = createDeclarativeForkGrowthPlan(guide, parent, assets);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].forkStage.id, 'STAGE_4_L_FORK');
  assert.equal(plan.steps[1].forkStage.id, 'STAGE_4_R_FORK');

  const base = createThirdLiveSuccessorAuthoring(guide, parent, assets);
  const identity = compileRasterForkGrowthPlan(base, []);
  assert.equal(identity.authoring, base);
  assert.deepEqual(identity.steps, []);
});

test('generic plan owns composition without geometry or renderer logic', async () => {
  const [planSource, liveSource, main, renderer] = await Promise.all([
    readFile(new URL('../../src/runtime/raster-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dev/courses/fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(planSource, /compileRasterForkStageRoute/);
  assert.doesNotMatch(
    planSource,
    /compileStageJunction|createRasterForkStageSuccessor|guideChartToWorld|render\/|camera|car-physics|motorcycle-physics/i,
  );
  assert.match(liveSource, /createThirdLiveSuccessorAuthoring/);
  assert.match(liveSource, /compileRasterForkGrowthPlan/);
  assert.match(liveSource, /createDeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(main, /STAGE_4_[LR]_FORK|GOAL_[LR][AB]|S4[LR]_FORK/);
  assert.doesNotMatch(renderer, /STAGE_4_[LR]_FORK|GOAL_[LR][AB]|S4[LR]_FORK/);
});
