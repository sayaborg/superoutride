import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM630ThirdLiveSuccessorRuntime } from '../dist/dev/m6-30-third-live-successor.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
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
  const live = createM630ThirdLiveSuccessorRuntime(guide, parentShared(guide), createM4SpriteAssets());
  return live;
}

test('M6.30 LEFT third-stage path remains present as later milestones deepen the RIGHT route too', () => {
  const live = setup();
  assert.deepEqual(live.route.stages.map((stage) => [stage.id, stage.kind]), [
    ['STAGE_1', 'STAGE'],
    ['STAGE_2_L', 'STAGE'],
    ['STAGE_2_R', 'STAGE'],
    ['STAGE_3_L', 'STAGE'],
    ['GOAL_L', 'TERMINAL'],
    ['STAGE_3_R', 'STAGE'],
    ['GOAL_R', 'TERMINAL'],
  ]);
  assert.deepEqual(live.route.choices.map((choice) => choice.id), [
    'S1_LEFT',
    'S1_RIGHT',
    'S2L_CONTINUE',
    'S3L_CONTINUE',
    'S2R_CONTINUE',
    'S3R_CONTINUE',
  ]);
});

test('M6.30 promotes the old LEFT goal package geometry into STAGE_3_L and gives GOAL_L a new chart', () => {
  const live = setup();
  const stage3 = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_3_L');
  const goal = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_GOAL_L');
  assert.ok(stage3);
  assert.ok(goal);
  assert.notEqual(stage3.coordinateFrame.id, goal.coordinateFrame.id);
  assert.notEqual(stage3.coordinateFrame.guide.raster, goal.coordinateFrame.guide.raster);
  assert.equal(stage3.worldFrameId, goal.worldFrameId);
});

test('M6.30 third LEFT transition owns a physical handoff to the new GOAL_L chart and content binding', () => {
  const live = setup();
  const choice = live.route.choices.find((entry) => entry.id === 'S3L_CONTINUE');
  const seam = live.handoffs.seams.find((entry) => entry.choiceId === 'S3L_CONTINUE');
  const binding = live.content.bindings.find((entry) => entry.stageId === 'GOAL_L');
  const goal = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_GOAL_L');
  assert.ok(choice);
  assert.equal(choice.fromStageId, 'STAGE_3_L');
  assert.equal(choice.toStageId, 'GOAL_L');
  assert.ok(seam);
  assert.ok(binding);
  assert.ok(goal);
  assert.equal(seam.targetChartId, goal.coordinateFrame.id);
  assert.equal(binding.packageId, 'CONTENT_GOAL_L');
  assert.equal(goal.packageId, binding.packageId);
});

test('M6.30 leaves renderer and browser loop route-agnostic as both branches deepen', async () => {
  const [source, main, stableEntry] = await Promise.all([
    readFile(new URL('../src/dev/m6-30-third-live-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-27-live-route-runtime.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(source, /renderM5Driving|m5-renderer|car-physics|motorcycle-physics/);
  assert.doesNotMatch(main, /STAGE_3_[LR]|S3[LR]_CONTINUE/);
  assert.match(stableEntry, /createM638DeclarativeForkGrowthRuntime/);
});
