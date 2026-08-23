import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import { createM618StageRoadViews } from '../dist/dev/m6-18-stage-road-views.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM620LivePointToPointRouteDag } from '../dist/dev/m6-20-live-point-to-point.js';
import { createM620LiveStageRuntimeRegistry } from '../dist/dev/m6-20-live-runtime-content.js';
import { createM621ChildVisualIdentity } from '../dist/dev/m6-21-child-visual-identity.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { createM6DebugRouteStageContentManifest } from '../dist/gameplay/route-stage-content.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { resolveActiveStageRuntimeContent } from '../dist/runtime/stage-runtime-content.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { CyclicVisualProfile } from '../dist/visual/visual-profile.js';

function setupRegistry() {
  const guide = createM2StadiumGuide();
  const route = createM620LivePointToPointRouteDag();
  const manifest = createM6DebugRouteStageContentManifest(route);
  const charts = createM616ChildGuideCharts(guide);
  const roadViews = createM618StageRoadViews(charts);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const surfaceMap = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const heightProfile = createM3DebugHeightProfile(guide.length);
  const visualProfile = new CyclicVisualProfile(guide.length, compiled.visualSections);
  const groundProfile = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
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
  const parentFarBackground = createM3FarBackground();
  const identity = createM621ChildVisualIdentity();
  const registry = createM620LiveStageRuntimeRegistry(
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

test('M6.21 child visual identity supplies two distinct full Far Background bitmaps', () => {
  const identity = createM621ChildVisualIdentity();
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

test('M6.21 active child package owns Far Background selection while parent content is unchanged', () => {
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

test('M6.21 keeps LEFT/RIGHT visual choice outside renderer Core', async () => {
  const { readFile } = await import('node:fs/promises');
  const [mainSource, rendererSource, contentSource] = await Promise.all([
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-20-live-runtime-content.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(mainSource, /runtime\.selectFarBackground\(camera\.s\)/);
  assert.match(contentSource, /CONTENT_GOAL_L/);
  assert.match(contentSource, /CONTENT_GOAL_R/);
  assert.match(contentSource, /leftFarBackground/);
  assert.match(contentSource, /rightFarBackground/);
  assert.doesNotMatch(rendererSource, /CONTENT_GOAL_[LR]|GOAL_[LR]|LEFT_CHILD|RIGHT_CHILD/);
});
