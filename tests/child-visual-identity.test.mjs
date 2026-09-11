import { parentShared } from './helpers/stage-parent-fixture.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';
import { createMinimalStageContentManifest } from '../dist/dev/fixtures/minimal-stage-manifest.js';

import { createChildGuideCharts } from '../dist/dev/courses/child-guide-charts.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { createStageRoadViews } from '../dist/dev/fixtures/stage-road-views.js';

import { createChildVisualIdentity } from '../dist/dev/courses/child-backgrounds.js';
import { createSingleForkStageRegistry } from '../dist/dev/fixtures/single-fork-registry.js';
import { createSingleForkRouteDag } from '../dist/dev/fixtures/single-fork-route.js';

import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createFarBackground } from '../dist/visual/far-background.js';

function setupRegistry() {
  const guide = createStadiumGuide();
  const route = createSingleForkRouteDag();
  const manifest = createMinimalStageContentManifest(route);
  const charts = createChildGuideCharts(guide);
  const roadViews = createStageRoadViews(charts);
  const { surfaceMap, heightProfile, visualProfile, groundProfile } = parentShared(guide);

  const terrainProfile = {
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
  };
  const parentFarBackground = createFarBackground();
  const identity = createChildVisualIdentity();
  const registry = createSingleForkStageRegistry(
    manifest,
    charts,
    roadViews,
    {
      heightProfile,
      surfaceMap,
      terrainProfile,
      groundProfile,
      selectFarBackground: () => parentFarBackground,
      worldSprites: [],
    },
    identity,
  );
  return { registry, parentFarBackground, identity };
}

test('child visual identity supplies two distinct full Far Background bitmaps', () => {
  const identity = createChildVisualIdentity();
  const left = identity.leftFarBackground;
  const right = identity.rightFarBackground;

  assert.equal(left.surface.width, 640);
  assert.equal(left.surface.height, 320);
  assert.equal(right.surface.width, 640);
  assert.equal(right.surface.height, 320);
  assert.equal(left.sourceHorizonY, right.sourceHorizonY);
  assert.equal(left.pixelsPerRadian, right.pixelsPerRadian);
  assert.notEqual(left.surface.getPixel(20, 250), right.surface.getPixel(20, 250));
  assert.notEqual(left.surface.getPixel(320, 90), right.surface.getPixel(320, 90));
});

test('active child package owns Far Background selection while parent content is unchanged', () => {
  const { registry, parentFarBackground, identity } = setupRegistry();
  const parent = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_STAGE_1' });
  const left = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_L' });
  const right = resolveActiveStageRuntimeContent(registry, { activePackageId: 'CONTENT_GOAL_R' });

  assert.equal(parent.selectFarBackground(650), parentFarBackground);
  assert.equal(left.selectFarBackground(650), identity.leftFarBackground);
  assert.equal(right.selectFarBackground(650), identity.rightFarBackground);
  assert.notEqual(left.selectFarBackground(650), right.selectFarBackground(650));
  assert.equal(left.roadView.id, 'LEFT_CHILD_ROAD_VIEW');
  assert.equal(right.roadView.id, 'RIGHT_CHILD_ROAD_VIEW');
});

test('keeps LEFT/RIGHT visual choice outside renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource, contentSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/fixtures/single-fork-registry.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /runtime\.selectFarBackground\(camera\.s\)/);
  assert.match(contentSource, /CONTENT_GOAL_L/);
  assert.match(contentSource, /CONTENT_GOAL_R/);
  assert.match(contentSource, /leftFarBackground/);
  assert.match(contentSource, /rightFarBackground/);
  assert.doesNotMatch(rendererSource, /CONTENT_GOAL_[LR]|GOAL_[LR]|LEFT_CHILD|RIGHT_CHILD/);
});
