import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM630ThirdLiveSuccessorRuntime } from '../dist/dev/m6-30-third-live-successor.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
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
  return createM630ThirdLiveSuccessorRuntime(guide, parentShared(guide), createM4SpriteAssets());
}

test('M6.33 live route has independent third stages on both LEFT and RIGHT paths', () => {
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
    'S1_LEFT', 'S1_RIGHT', 'S2L_CONTINUE', 'S3L_CONTINUE', 'S2R_CONTINUE', 'S3R_CONTINUE',
  ]);
});

test('M6.33 promotes the old RIGHT goal geometry into STAGE_3_R and generates a distinct new GOAL_R chart', () => {
  const live = setup();
  const stage3 = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_STAGE_3_R');
  const goal = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_GOAL_R');
  assert.ok(stage3);
  assert.ok(goal);
  assert.notEqual(stage3.coordinateFrame.id, goal.coordinateFrame.id);
  assert.notEqual(stage3.coordinateFrame.guide.raster, goal.coordinateFrame.guide.raster);
  assert.equal(stage3.worldFrameId, goal.worldFrameId);
  assert.equal(stage3.selectFarBackground(0), goal.selectFarBackground(0));
});

test('M6.33 S3R_CONTINUE resolves physical handoff, new GOAL_R package binding and terminal FINISH', () => {
  const live = setup();
  const choice = live.route.choices.find((entry) => entry.id === 'S3R_CONTINUE');
  const seam = live.handoffs.seams.find((entry) => entry.choiceId === 'S3R_CONTINUE');
  const binding = live.content.bindings.find((entry) => entry.stageId === 'GOAL_R');
  const goal = live.registry.packages.find((entry) => entry.packageId === 'CONTENT_GOAL_R');
  const finish = live.gates.gates.find((entry) => entry.kind === 'FINISH' && entry.stageId === 'GOAL_R');
  assert.ok(choice);
  assert.equal(choice.fromStageId, 'STAGE_3_R');
  assert.equal(choice.toStageId, 'GOAL_R');
  assert.ok(seam);
  assert.ok(binding);
  assert.ok(goal);
  assert.ok(finish);
  assert.equal(seam.targetChartId, goal.coordinateFrame.id);
  assert.equal(binding.packageId, 'CONTENT_GOAL_R');
});

test('M6.33 extends RIGHT through M6.31 chain + M6.32 fragments without renderer or browser topology logic', async () => {
  const [liveSource, rendererSource, mainSource] = await Promise.all([
    readFile(new URL('../src/dev/m6-30-third-live-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(liveSource, /compileRasterSuccessorChain/);
  assert.match(liveSource, /composeDeclarativeLiveRouteAuthoring/);
  assert.match(liveSource, /sourceStageId: 'STAGE_3_R'/);
  assert.match(liveSource, /choiceId: 'S3R_CONTINUE'/);
  assert.doesNotMatch(rendererSource, /STAGE_3_R|S3R_CONTINUE|RIGHT_THIRD_SUCCESSOR/);
  assert.doesNotMatch(mainSource, /STAGE_3_R|S3R_CONTINUE|RIGHT_THIRD_SUCCESSOR/);
});
