import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import { createM622ChildStageContinuation, M6_22_CHILD_FINISH_S } from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM623ChildStageScenery } from '../dist/dev/m6-23-child-stage-scenery.js';
import { createM623LiveStageRuntimeRegistry } from '../dist/dev/m6-23-live-runtime-content.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { countOpaqueSpriteColors, SPRITE_TRANSPARENT } from '../dist/render/sprite.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';

function parentShared(guide) {
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  return {
    heightProfile,
    surfaceMap,
    groundProfile: {
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 4.5,
      roadRight: 4.5,
      shoulderWidth: 1,
      junction: M6_13_JUNCTION,
      logical: compiled.groundMap,
    },
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

test('M6.23 child height identity is continuous at handoff but visibly different by FINISH', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const scenery = createM623ChildStageScenery(continuation);
  const handoffS = continuation.handoffLocalS;

  assert.equal(scenery.left.heightProfile.sampleRender(handoffS).y, 0);
  assert.equal(scenery.right.heightProfile.sampleRender(handoffS).y, 0);
  assert.equal(scenery.left.heightProfile.samplePhysics(handoffS), 0);
  assert.equal(scenery.right.heightProfile.samplePhysics(handoffS), 0);
  assert.equal(scenery.left.heightProfile.sampleRender(M6_22_CHILD_FINISH_S).y, 0);
  assert.equal(scenery.right.heightProfile.sampleRender(M6_22_CHILD_FINISH_S).y, 13);
});

test('M6.23 LEFT owns cliff/ocean exposure while RIGHT owns opaque mountain terrain', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const scenery = createM623ChildStageScenery(continuation);
  const left = scenery.left.terrainProfile.visual.sample(M6_22_CHILD_FINISH_S - 50);
  const right = scenery.right.terrainProfile.visual.sample(M6_22_CHILD_FINISH_S - 50);

  assert.equal(left.name, 'LEFT COAST / OCEAN');
  assert.equal(left.groundBaseLeft.kind, 'transparent');
  assert.equal(left.groundBaseRight.kind, 'color');
  assert.equal(right.name, 'RIGHT MOUNTAIN PASS');
  assert.equal(right.groundBaseLeft.kind, 'color');
  assert.equal(right.groundBaseRight.kind, 'color');
});

test('M6.23 child landmarks are ordinary metric 0/1-transparent CourseSprites', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const scenery = createM623ChildStageScenery(continuation);

  assert.deepEqual(scenery.left.worldSprites.map((entry) => entry.name), [
    'LEFT LIGHTHOUSE', 'LEFT PALM A', 'LEFT PALM B',
  ]);
  assert.deepEqual(scenery.right.worldSprites.map((entry) => entry.name), [
    'RIGHT PYLON L1', 'RIGHT PYLON R1', 'RIGHT PASS SIGN',
  ]);

  for (const sprite of [...scenery.left.worldSprites, ...scenery.right.worldSprites]) {
    assert.ok(sprite.asset.worldWidthMeters > 0);
    assert.ok(countOpaqueSpriteColors(sprite.asset) <= 15);
    assert.ok(sprite.asset.pixels.some((pixel) => pixel === SPRITE_TRANSPARENT));
    assert.ok(sprite.asset.pixels.some((pixel) => pixel !== SPRITE_TRANSPARENT));
    assert.ok(sprite.sRender > continuation.handoffLocalS);
    assert.ok(sprite.sRender < M6_22_CHILD_FINISH_S);
  }
});

test('M6.23 runtime swaps scenery package ownership without changing M6.22 child physics authority', () => {
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const scenery = createM623ChildStageScenery(continuation);
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const registry = createM623LiveStageRuntimeRegistry(manifest, continuation, parentShared(parent), scenery);
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(left.coordinateFrame, continuation.left.chart);
  assert.equal(right.coordinateFrame, continuation.right.chart);
  assert.equal(left.surfaceMap, continuation.left.surfaceMap);
  assert.equal(right.surfaceMap, continuation.right.surfaceMap);
  assert.equal(left.surfaceMap.sample(M6_22_CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(right.surfaceMap.sample(M6_22_CHILD_FINISH_S, 0).type, 'ASPHALT');
  assert.equal(left.heightProfile, scenery.left.heightProfile);
  assert.equal(right.heightProfile, scenery.right.heightProfile);
  assert.equal(left.worldSprites.length, 3);
  assert.equal(right.worldSprites.length, 3);
});

test('M6.23 remains package-owned source data and does not add child decisions to renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource, scenerySource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-23-child-stage-scenery.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /createM623LiveStageRuntimeRegistry/);
  assert.match(scenerySource, /LEFT COAST \/ OCEAN/);
  assert.match(scenerySource, /RIGHT MOUNTAIN PASS/);
  assert.doesNotMatch(rendererSource, /M6_23|LEFT COAST|RIGHT MOUNTAIN|LIGHTHOUSE|PASS SIGN/);
});
