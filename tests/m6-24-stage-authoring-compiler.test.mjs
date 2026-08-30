import test from 'node:test';
import assert from 'node:assert/strict';
import { createM6DebugRouteStageContentManifest } from '../dist/dev/m6-debug-route-stage-content.js';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { rasterCourseToWorld } from '../dist/core/course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import { createM621ChildVisualIdentity } from '../dist/dev/m6-21-child-visual-identity.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM624ChildStageAuthoring } from '../dist/dev/m6-24-stage-authoring.js';
import { createM624LiveStageRuntimeRegistry } from '../dist/dev/m6-24-live-runtime-content.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { compileStageEnvironment } from '../dist/runtime/stage-authoring-compiler.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
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
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const assets = createM4SpriteAssets();
  const identity = createM621ChildVisualIdentity();
  const authoring = createM624ChildStageAuthoring(assets, identity);
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const registry = createM624LiveStageRuntimeRegistry(manifest, continuation, parentShared(parent), assets, identity);
  return { continuation, authoring, registry };
}

test('M6.24 stage authoring contains child-local l only and no source lateral origin', () => {
  const { authoring } = setup();
  assert.equal(authoring.left.sprites[0].l, 5.2);
  assert.equal(authoring.right.sprites[0].l, -5.3);
  assert.ok(authoring.left.sprites.every((sprite) => Math.abs(sprite.l) < 8));
  assert.ok(authoring.right.sprites.every((sprite) => Math.abs(sprite.l) < 8));
});

test('M6.24 compiler performs the single lateral rebase when compiling raster-attached sprites', () => {
  const { continuation, authoring } = setup();
  const environment = compileStageEnvironment(continuation.left.chart, authoring.left);
  const sprite = environment.worldSprites.find((entry) => entry.name === 'COAST_SIGN_1');
  assert.ok(sprite);
  const expected = rasterCourseToWorld(
    continuation.left.guide.raster,
    82,
    continuation.left.chart.lateralOrigin + 5.2,
  );
  assert.ok(Math.abs(sprite.x - expected.x) < 1e-9);
  assert.ok(Math.abs(sprite.z - expected.z) < 1e-9);
});

test('M6.24 compiled child packages preserve M6.23 coast/mountain identity and handoff height datum', () => {
  const { continuation, registry } = setup();
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  for (const s of [0, continuation.handoffLocalS, continuation.handoffLocalS + 5, 60]) {
    assert.equal(left.heightProfile.samplePhysics(s), 0);
    assert.equal(right.heightProfile.samplePhysics(s), 0);
  }
  assert.equal(left.terrainProfile.visual.sample(120).name, 'LEFT_COAST_STAGE');
  assert.equal(right.terrainProfile.visual.sample(120).name, 'RIGHT_MOUNTAIN_STAGE');
  assert.ok(left.worldSprites.some((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(right.worldSprites.some((sprite) => sprite.name.startsWith('MOUNTAIN_')));
  assert.notEqual(left.selectFarBackground(120), right.selectFarBackground(120));
});

test('M6.24 package compiler derives height course length from each active child Guide', () => {
  const { continuation, registry } = setup();
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });
  assert.equal(left.heightProfile.courseLength, continuation.left.guide.length);
  assert.equal(right.heightProfile.courseLength, continuation.right.guide.length);
  assert.notEqual(left.heightProfile.courseLength, right.heightProfile.courseLength);
});

test('M6.24 reusable compiler contains no route-side or renderer-core dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const [compilerSource, authoringSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/runtime/stage-authoring-compiler.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-24-stage-authoring.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(compilerSource, /route-dag|route-boundary|m6-2[0-9]|renderM5Driving/);
  assert.doesNotMatch(authoringSource, /sourceLateralOrigin|CONTENT_GOAL_|RouteDag|renderM5Driving/);
  assert.doesNotMatch(rendererSource, /M6_24|stage-authoring-compiler|LEFT_COAST_STAGE|RIGHT_MOUNTAIN_STAGE/);
});
