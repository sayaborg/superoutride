import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM623ChildEnvironmentContent } from '../dist/dev/m6-23-child-environment-content.js';
import { createM623LiveStageRuntimeRegistry } from '../dist/dev/m6-23-live-runtime-content.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
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
  const parent = createM2StadiumGuide();
  const continuation = createM622ChildStageContinuation(parent);
  const assets = createM4SpriteAssets();
  const environment = createM623ChildEnvironmentContent(continuation, assets);
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const registry = createM623LiveStageRuntimeRegistry(
    manifest,
    continuation,
    parentShared(parent),
    assets,
    undefined,
    environment,
  );
  return { parent, continuation, environment, registry };
}

test('M6.23 preserves the shared handoff height datum before child scenery begins', () => {
  const { continuation, environment } = setup();
  const probes = [0, continuation.handoffLocalS - 5, continuation.handoffLocalS, continuation.handoffLocalS + 5, 60];
  for (const s of probes) {
    assert.equal(environment.left.heightProfile.samplePhysics(s), 0);
    assert.equal(environment.right.heightProfile.samplePhysics(s), 0);
  }
});

test('M6.23 left coast and right mountain own materially different height profiles after overlap', () => {
  const { environment } = setup();
  assert.ok(environment.left.heightProfile.samplePhysics(105) < 0);
  assert.ok(environment.right.heightProfile.samplePhysics(105) > 0);
  assert.ok(environment.right.heightProfile.samplePhysics(150) > 5);
  assert.notEqual(
    environment.left.terrainProfile.visual.sample(120).name,
    environment.right.terrainProfile.visual.sample(120).name,
  );
});

test('M6.23 child world sprites are compiled in their own child chainage domains', () => {
  const { continuation, environment } = setup();
  assert.ok(environment.left.worldSprites.length >= 5);
  assert.ok(environment.right.worldSprites.length >= 7);
  assert.ok(environment.left.worldSprites.every((sprite) => sprite.sRender >= 0 && sprite.sRender < continuation.left.guide.length));
  assert.ok(environment.right.worldSprites.every((sprite) => sprite.sRender >= 0 && sprite.sRender < continuation.right.guide.length));
  assert.ok(environment.left.worldSprites.some((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(environment.right.worldSprites.some((sprite) => sprite.name.startsWith('MOUNTAIN_')));
});

test('M6.23 live packages atomically own child height terrain sprites and M6.21 backgrounds', () => {
  const { environment, registry } = setup();
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(left.heightProfile, environment.left.heightProfile);
  assert.equal(right.heightProfile, environment.right.heightProfile);
  assert.equal(left.terrainProfile, environment.left.terrainProfile);
  assert.equal(right.terrainProfile, environment.right.terrainProfile);
  assert.equal(left.worldSprites.length, environment.left.worldSprites.length);
  assert.equal(right.worldSprites.length, environment.right.worldSprites.length);
  assert.notEqual(left.selectFarBackground(120), right.selectFarBackground(120));
});

test('M6.23 package sprites are not copied from parent chainage content', () => {
  const { registry } = setup();
  const parent = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_STAGE_1' });
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(parent.worldSprites.length, 0);
  assert.ok(left.worldSprites.every((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(right.worldSprites.every((sprite) => sprite.name.startsWith('MOUNTAIN_')));
});

test('M6.23 keeps route-side environment choice outside renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [rendererSource, environmentSource, liveSource] = await Promise.all([
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-23-child-environment-content.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-23-live-runtime-content.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(environmentSource, /COAST_/);
  assert.match(environmentSource, /MOUNTAIN_/);
  assert.match(liveSource, /CONTENT_GOAL_L/);
  assert.match(liveSource, /CONTENT_GOAL_R/);
  assert.doesNotMatch(rendererSource, /M6_23|COAST_|MOUNTAIN_|CONTENT_GOAL_[LR]|GOAL_[LR]/);
});
