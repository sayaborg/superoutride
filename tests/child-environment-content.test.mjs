import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';

import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createChildStageContinuation } from '../dist/dev/courses/child-stage-continuation.js';
import { createChildEnvironmentStageRegistry } from '../dist/dev/fixtures/child-environment-registry.js';
import { createChildEnvironmentContent } from '../dist/dev/fixtures/child-environment.js';
import { createSingleForkRouteDag } from '../dist/dev/fixtures/single-fork-route.js';

import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function setup() {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const assets = createSpriteAssets();
  const environment = createChildEnvironmentContent(continuation, assets);
  const route = createSingleForkRouteDag();
  const manifest = createMinimalStageContentManifest(route);
  const registry = createChildEnvironmentStageRegistry(
    manifest,
    continuation,
    parentShared(parent),
    assets,
    undefined,
    environment,
  );
  return { parent, continuation, environment, registry };
}

test('preserves the shared handoff height datum before child scenery begins', () => {
  const { continuation, environment } = setup();
  const probes = [0, continuation.handoffLocalS - 5, continuation.handoffLocalS, continuation.handoffLocalS + 5, 60];
  for (const s of probes) {
    assert.equal(environment.left.heightProfile.samplePhysics(s), 0);
    assert.equal(environment.right.heightProfile.samplePhysics(s), 0);
  }
});

test('left coast and right mountain own materially different height profiles after overlap', () => {
  const { environment } = setup();
  assert.ok(environment.left.heightProfile.samplePhysics(105) < 0);
  assert.ok(environment.right.heightProfile.samplePhysics(105) > 0);
  assert.ok(environment.right.heightProfile.samplePhysics(150) > 5);
  assert.notEqual(
    environment.left.terrainProfile.visual.sample(120).name,
    environment.right.terrainProfile.visual.sample(120).name,
  );
});

test('child world sprites are compiled in their own child chainage domains', () => {
  const { continuation, environment } = setup();
  assert.ok(environment.left.worldSprites.length >= 5);
  assert.ok(environment.right.worldSprites.length >= 7);
  assert.ok(
    environment.left.worldSprites.every(
      (sprite) => sprite.sRender >= 0 && sprite.sRender < continuation.left.guide.length,
    ),
  );
  assert.ok(
    environment.right.worldSprites.every(
      (sprite) => sprite.sRender >= 0 && sprite.sRender < continuation.right.guide.length,
    ),
  );
  assert.ok(environment.left.worldSprites.some((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(environment.right.worldSprites.some((sprite) => sprite.name.startsWith('MOUNTAIN_')));
});

test('live packages atomically own child height terrain sprites and backgrounds', () => {
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

test('package sprites are not copied from parent chainage content', () => {
  const { registry } = setup();
  const parent = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_STAGE_1' });
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(parent.worldSprites.length, 0);
  assert.ok(left.worldSprites.every((sprite) => sprite.name.startsWith('COAST_')));
  assert.ok(right.worldSprites.every((sprite) => sprite.name.startsWith('MOUNTAIN_')));
});

test('keeps route-side environment choice outside renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [rendererSource, environmentSource, liveSource] = await Promise.all([
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/fixtures/child-environment.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/fixtures/child-environment-registry.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(environmentSource, /COAST_/);
  assert.match(environmentSource, /MOUNTAIN_/);
  assert.match(liveSource, /CONTENT_GOAL_L/);
  assert.match(liveSource, /CONTENT_GOAL_R/);
  assert.doesNotMatch(rendererSource, /M[0-9]+(?:[._][0-9]+)?|COAST_|MOUNTAIN_|CONTENT_GOAL_[LR]|GOAL_[LR]/);
});
