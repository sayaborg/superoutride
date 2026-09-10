import { parentShared } from './helpers/stage-parent-fixture.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';

import { createM630ThirdLiveSuccessorAuthoring } from '../dist/dev/m6-30-third-live-successor.js';
import { createM637SymmetricSecondLiveForkRuntime } from '../dist/dev/m6-37-symmetric-right-second-live-fork.js';
import {
  createM638DeclarativeForkGrowthPlan,
  createM638DeclarativeForkGrowthRuntime,
} from '../dist/dev/m6-38-declarative-fork-growth-plan.js';

import { compileRasterForkGrowthPlan } from '../dist/runtime/raster-fork-growth-plan.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function setup() {
  const guide = createM2StadiumGuide();
  const parent = parentShared(guide);
  const assets = createSpriteAssets();
  return { guide, parent, assets };
}

function gateRows(live) {
  return live.gates.gates.map((gate) => ({
    id: gate.id,
    kind: gate.kind,
    stageId: gate.stageId,
    choiceId: gate.choiceId ?? null,
    x: gate.center.x,
    z: gate.center.z,
    heading: gate.heading,
    halfWidth: gate.halfWidth,
  }));
}

function seamRows(live) {
  return live.handoffs.seams.map((seam) => ({
    id: seam.id,
    choiceId: seam.choiceId,
    targetChartId: seam.targetChartId,
    x: seam.center.x,
    z: seam.center.z,
    heading: seam.heading,
    halfWidth: seam.halfWidth,
  }));
}

test('M6.38 two-step fork growth plan reproduces the complete M6.37 RouteDag exactly', () => {
  const { guide, parent, assets } = setup();
  const legacy = createM637SymmetricSecondLiveForkRuntime(guide, parent, assets);
  const planned = createM638DeclarativeForkGrowthRuntime(guide, parent, assets);

  assert.deepEqual(
    planned.route.stages.map((stage) => [stage.id, stage.kind]),
    legacy.route.stages.map((stage) => [stage.id, stage.kind]),
  );
  assert.deepEqual(
    planned.route.choices.map((choice) => [choice.id, choice.fromStageId, choice.toStageId]),
    legacy.route.choices.map((choice) => [choice.id, choice.fromStageId, choice.toStageId]),
  );
});

test('M6.38 preserves package bindings and generated Guide chart identities exactly', () => {
  const { guide, parent, assets } = setup();
  const legacy = createM637SymmetricSecondLiveForkRuntime(guide, parent, assets);
  const planned = createM638DeclarativeForkGrowthRuntime(guide, parent, assets);

  assert.deepEqual(
    planned.content.bindings.map((entry) => [entry.stageId, entry.packageId]),
    legacy.content.bindings.map((entry) => [entry.stageId, entry.packageId]),
  );
  assert.deepEqual(
    planned.registry.packages.map((entry) => [entry.packageId, entry.coordinateFrame.id]),
    legacy.registry.packages.map((entry) => [entry.packageId, entry.coordinateFrame.id]),
  );
});

test('M6.38 preserves every physical transition/FINISH gate from M6.37 exactly', () => {
  const { guide, parent, assets } = setup();
  const legacy = createM637SymmetricSecondLiveForkRuntime(guide, parent, assets);
  const planned = createM638DeclarativeForkGrowthRuntime(guide, parent, assets);
  assert.deepEqual(gateRows(planned), gateRows(legacy));
});

test('M6.38 preserves every physical handoff seam from M6.37 exactly', () => {
  const { guide, parent, assets } = setup();
  const legacy = createM637SymmetricSecondLiveForkRuntime(guide, parent, assets);
  const planned = createM638DeclarativeForkGrowthRuntime(guide, parent, assets);
  assert.deepEqual(seamRows(planned), seamRows(legacy));
});

test('M6.38 plan is an ordered two-step fold and the generic zero-step plan is identity', () => {
  const { guide, parent, assets } = setup();
  const plan = createM638DeclarativeForkGrowthPlan(guide, parent, assets);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[0].forkStage.id, 'STAGE_4_L_FORK');
  assert.equal(plan.steps[1].forkStage.id, 'STAGE_4_R_FORK');

  const base = createM630ThirdLiveSuccessorAuthoring(guide, parent, assets);
  const identity = compileRasterForkGrowthPlan(base, []);
  assert.equal(identity.authoring, base);
  assert.deepEqual(identity.steps, []);
});

test('M6.38 removes milestone nesting from live construction while generic plan owns no geometry or renderer logic', async () => {
  const [planSource, liveSource, stableEntry, main, renderer] = await Promise.all([
    readFile(new URL('../src/runtime/raster-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-38-declarative-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-38-declarative-fork-growth-plan.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(planSource, /compileRasterForkStageRoute/);
  assert.doesNotMatch(
    planSource,
    /compileStageJunction|createRasterForkStageSuccessor|guideChartToWorld|render\/|camera|car-physics|motorcycle-physics|m6-/i,
  );
  assert.match(liveSource, /createM630ThirdLiveSuccessorAuthoring/);
  assert.match(liveSource, /compileRasterForkGrowthPlan/);
  assert.doesNotMatch(liveSource, /createM635SecondLiveFork|createM637SymmetricSecondLiveFork/);
  assert.match(stableEntry, /createM638DeclarativeForkGrowthRuntime/);
  assert.doesNotMatch(main, /M6_38|STAGE_4_[LR]_FORK|GOAL_[LR][AB]|S4[LR]_FORK/);
  assert.doesNotMatch(renderer, /M6_38|STAGE_4_[LR]_FORK|GOAL_[LR][AB]|S4[LR]_FORK/);
});
