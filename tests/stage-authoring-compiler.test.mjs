import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';

import { rasterPathToWorld } from '../dist/core/raster-path.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';

import { createChildVisualIdentity } from '../dist/dev/courses/child-backgrounds.js';
import { createChildStageAuthoring } from '../dist/dev/courses/child-stage-authoring.js';
import { createChildStageContinuation } from '../dist/dev/courses/child-stage-continuation.js';
import { createAuthoredStageRegistry } from '../dist/dev/fixtures/authored-stage-registry.js';
import { createSingleForkRouteDag } from '../dist/dev/fixtures/single-fork-route.js';

import { compileStageEnvironment } from '../dist/runtime/stage-authoring-compiler.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';

import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function setup() {
  const parent = createStadiumGuide();
  const continuation = createChildStageContinuation(parent);
  const assets = createSpriteAssets();
  const identity = createChildVisualIdentity();
  const authoring = createChildStageAuthoring(assets, identity);
  const route = createSingleForkRouteDag();
  const manifest = createMinimalStageContentManifest(route);
  const registry = createAuthoredStageRegistry(manifest, continuation, parentShared(parent), assets, identity);
  return { continuation, authoring, registry };
}

test('stage authoring contains child-local l only and no source lateral origin', () => {
  const { authoring } = setup();
  assert.equal(authoring.left.sprites[0].l, 5.2);
  assert.equal(authoring.right.sprites[0].l, -5.3);
  assert.ok(authoring.left.sprites.every((sprite) => Math.abs(sprite.l) < 8));
  assert.ok(authoring.right.sprites.every((sprite) => Math.abs(sprite.l) < 8));
});

test('compiler performs the single lateral rebase when compiling raster-attached sprites', () => {
  const { continuation, authoring } = setup();
  const environment = compileStageEnvironment(continuation.left.chart, authoring.left);
  const sprite = environment.worldSprites.find((entry) => entry.name === 'COAST_SIGN_1');
  assert.ok(sprite);
  const expected = rasterPathToWorld(continuation.left.guide.raster, 82, continuation.left.chart.lateralOrigin + 5.2);
  assert.ok(Math.abs(sprite.x - expected.x) < 1e-9);
  assert.ok(Math.abs(sprite.z - expected.z) < 1e-9);
});

test('compiled child packages preserve coast/mountain identity and handoff height datum', () => {
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

test('package compiler derives height course length from each active child Guide', () => {
  const { continuation, registry } = setup();
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });
  assert.equal(left.heightProfile.courseLength, continuation.left.guide.length);
  assert.equal(right.heightProfile.courseLength, continuation.right.guide.length);
  assert.notEqual(left.heightProfile.courseLength, right.heightProfile.courseLength);
});

test('reusable compiler contains no route-side or renderer-core dependency', async () => {
  const { readFile } = await import('node:fs/promises');
  const [compilerSource, authoringSource, rendererSource] = await Promise.all([
    readFile(new URL('../src/runtime/stage-authoring-compiler.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/child-stage-authoring.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(compilerSource, /route-dag|route-boundary|m6-2[0-9]|renderDriving/);
  assert.doesNotMatch(authoringSource, /sourceLateralOrigin|CONTENT_GOAL_|RouteDag|renderDriving/);
  assert.doesNotMatch(
    rendererSource,
    /M[0-9]+(?:[._][0-9]+)?|stage-authoring-compiler|LEFT_COAST_STAGE|RIGHT_MOUNTAIN_STAGE/,
  );
});

test('stage environment requires authored terrain widths and snapshots their values', () => {
  const { continuation, authoring } = setup();
  const source = { ...authoring.left, terrain: { ...authoring.left.terrain } };
  const compiled = compileStageEnvironment(continuation.left.chart, source);
  source.terrain.roadLeft = 100;
  assert.equal(compiled.terrainProfile.roadLeft, authoring.left.terrain.roadLeft);
  assert.throws(
    () => compileStageEnvironment(continuation.left.chart, { ...source, terrain: undefined }),
    /widths must be authored/,
  );
  for (const key of ['groundLeft', 'groundRight', 'roadLeft', 'roadRight']) {
    assert.throws(
      () =>
        compileStageEnvironment(continuation.left.chart, {
          ...source,
          terrain: { ...source.terrain, [key]: undefined },
        }),
      /terrain/,
    );
  }
});
