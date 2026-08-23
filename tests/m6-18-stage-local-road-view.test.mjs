import test from 'node:test';
import assert from 'node:assert/strict';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { rasterCourseToWorld } from '../dist/core/course.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import {
  classifyStageRoadLocalL,
  stageRoadContainsLocalL,
  stageRoadSourceLateral,
  stageRoadToWorld,
} from '../dist/course/stage-road-view.js';
import { M6_13_JUNCTION } from '../dist/dev/m6-13-junction.js';
import { createM616ChildGuideCharts } from '../dist/dev/m6-16-child-guide-charts.js';
import { createM618StageRoadViews } from '../dist/dev/m6-18-stage-road-views.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { StageSurfaceMapView } from '../dist/physics/stage-surface-map-view.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { GROUND_COLORS } from '../dist/visual/ground-map.js';
import { sampleStageGroundMapRuntime } from '../dist/visual/stage-ground-map-view.js';

const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function setup() {
  const guide = createM2StadiumGuide();
  const charts = createM616ChildGuideCharts(guide);
  const views = createM618StageRoadViews(charts);
  const compiled = compileSurfaceRegions(guide.length, createM5DebugSurfaceRegionAuthoring(guide.length));
  const surface = new CyclicSurfaceMap(guide.length, compiled.surfaceSections, M6_13_JUNCTION);
  const ground = {
    groundLeft: 12,
    groundRight: 12,
    roadLeft: 4.5,
    roadRight: 4.5,
    shoulderWidth: 1,
    junction: M6_13_JUNCTION,
    logical: compiled.groundMap,
  };
  return { guide, charts, views, surface, ground };
}

test('M6.18 child stage view contains exactly one 7m road plus 1m shoulder on each side', () => {
  const { views } = setup();
  for (const child of [views.left, views.right]) {
    assert.equal(child.roadLeft, 3.5);
    assert.equal(child.roadRight, 3.5);
    assert.equal(child.shoulderWidth, 1);
    assert.equal(child.groundLeft, 4.5);
    assert.equal(child.groundRight, 4.5);
    assert.equal(classifyStageRoadLocalL(child, 0), 'ROAD');
    assert.equal(classifyStageRoadLocalL(child, -4), 'SHOULDER');
    assert.equal(classifyStageRoadLocalL(child, 4), 'SHOULDER');
    assert.equal(stageRoadContainsLocalL(child, -4.5), true);
    assert.equal(stageRoadContainsLocalL(child, 4.5), true);
    assert.equal(stageRoadContainsLocalL(child, -4.5001), false);
    assert.equal(stageRoadContainsLocalL(child, 4.5001), false);
  }
});

test('child local l=0 maps to the selected parent-authored road center in raster world geometry', () => {
  const { guide, views } = setup();
  for (const child of [views.left, views.right]) {
    const actual = stageRoadToWorld(guide.raster, child, 600, 0);
    const expected = rasterCourseToWorld(guide.raster, 600, child.sourceLateralOrigin);
    near(actual.x, expected.x);
    near(actual.z, expected.z);
    near(actual.l, 0);
  }
});

test('the unselected child road lies completely outside the committed child local corridor', () => {
  const { views } = setup();
  assert.equal(views.left.sourceLateralOrigin, -7.5);
  assert.equal(views.right.sourceLateralOrigin, 7.5);

  const rightRoadCenterInLeftLocal = views.right.sourceLateralOrigin - views.left.sourceLateralOrigin;
  const leftRoadCenterInRightLocal = views.left.sourceLateralOrigin - views.right.sourceLateralOrigin;
  assert.equal(rightRoadCenterInLeftLocal, 15);
  assert.equal(leftRoadCenterInRightLocal, -15);
  assert.equal(stageRoadContainsLocalL(views.left, rightRoadCenterInLeftLocal), false);
  assert.equal(stageRoadContainsLocalL(views.right, leftRoadCenterInRightLocal), false);
});

test('GroundMap child-local road reuses parent source while both shoulders are stage-local', () => {
  const { views, ground } = setup();
  for (const child of [views.left, views.right]) {
    const center = sampleStageGroundMapRuntime(600, 0, 0.1, child, ground).color;
    const leftShoulder = sampleStageGroundMapRuntime(600, -4.0, 0.1, child, ground).color;
    const rightShoulder = sampleStageGroundMapRuntime(600, 4.0, 0.1, child, ground).color;
    assert.ok(center === GROUND_COLORS.asphaltA || center === GROUND_COLORS.asphaltB || center === GROUND_COLORS.marking);
    assert.equal(leftShoulder, GROUND_COLORS.shoulder);
    assert.equal(rightShoulder, GROUND_COLORS.shoulder);
    assert.throws(
      () => sampleStageGroundMapRuntime(600, 4.6, 0.1, child, ground),
      /outside the local ground envelope/,
    );
  }
});

test('SurfaceMap child-local view uses the same road/shoulder corridor and makes sibling space VOID', () => {
  const { views, surface } = setup();
  for (const child of [views.left, views.right]) {
    const local = new StageSurfaceMapView(surface, child);
    assert.equal(local.sample(600, 0).type, 'ASPHALT');
    assert.equal(local.sample(600, -4.0).type, 'SHOULDER');
    assert.equal(local.sample(600, 4.0).type, 'SHOULDER');
    assert.equal(local.sample(600, -4.6).type, 'VOID');
    assert.equal(local.sample(600, 4.6).type, 'VOID');
    near(stageRoadSourceLateral(child, 0), child.sourceLateralOrigin);
    near(stageRoadSourceLateral(child, 4), child.sourceLateralOrigin + 4);
  }
});

test('M6.18 source adapters contain no camera, projection or route-DAG decision logic', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of [
    '../src/course/stage-road-view.ts',
    '../src/visual/stage-ground-map-view.ts',
    '../src/physics/stage-surface-map-view.ts',
    '../src/dev/m6-18-stage-road-views.ts',
  ]) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.equal(imports.some((entry) => entry.includes('/projection')), false);
    assert.equal(imports.some((entry) => entry.includes('/route-dag')), false);
    assert.doesNotMatch(source, /screenX|screenY/);
  }
});
