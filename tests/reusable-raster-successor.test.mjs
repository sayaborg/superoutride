import assert from 'node:assert/strict';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';

import { CURRENT_RENDER_FAR_DEPTH_METERS } from '../dist/core/presentation-scale.js';
import { createChildStageContinuation } from '../dist/dev/courses/child-stage-continuation.js';
import { createLiveContinuation } from '../dist/dev/courses/successor-stage-continuation.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { createRasterStageSuccessor } from '../dist/runtime/raster-stage-successor.js';

const near = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

function authoring(side) {
  return {
    id: `${side}_CHILD_TO_SUCCESSOR`,
    chartId: `${side}_SUCCESSOR`,
    roadViewId: `${side}_SUCCESSOR_VIEW`,
    surfaceSectionName: `${side}_SUCCESSOR_STAGE`,
    sourceSeamMinS: 340,
    overlapMargin: 30,
    transitionLead: 20,
    finishAfterSeam: 150,
    deformationMeters: 3,
    deformationDirection: side === 'LEFT' ? -1 : 1,
    gentleTurnLimitDegrees: 5,
    minDeformationRunVertices: 5,
    dCam: 5,
    dMax: CURRENT_RENDER_FAR_DEPTH_METERS,
    groundMapHalfWidth: 12,
    groundHalfWidth: 4.5,
    roadHalfWidth: 3.5,
    roadMarkings: CENTER_DASH_MARKINGS,
    junctionMarkings: CENTER_DASH_MARKINGS,
    shoulderWidth: 1,
  };
}

test('generic factory reproduces the LEFT successor geometry and seam chainages', () => {
  const parent = createStadiumGuide();
  const base = createChildStageContinuation(parent);
  const direct = createRasterStageSuccessor(base.left, authoring('LEFT'));
  const live = createLiveContinuation(parent).leftSuccessor;

  near(direct.guide.length, live.guide.length);
  near(direct.sourceTransitionS, live.sourceTransitionS);
  near(direct.sourceSeamS, live.sourceSeamS);
  near(direct.targetSeamS, live.targetSeamS);
  near(direct.finishS, live.finishS);
  assert.equal(direct.groundProfile.groundLeft, 12);
  assert.equal(direct.groundProfile.groundRight, 12);
  assert.equal(direct.guide.raster.vertices.length, live.guide.raster.vertices.length);
  for (let i = 0; i < direct.guide.raster.vertices.length; i += 1) {
    near(direct.guide.raster.vertices[i].x, live.guide.raster.vertices[i].x);
    near(direct.guide.raster.vertices[i].z, live.guide.raster.vertices[i].z);
  }
});

test('generic factory preserves exact D_cam overlap around the successor seam', () => {
  const parent = createStadiumGuide();
  const base = createChildStageContinuation(parent);
  const successor = createRasterStageSuccessor(base.right, authoring('RIGHT'));

  for (const delta of [-5, -2.5, 0, 2.5, 5]) {
    const source = guideChartToWorld(base.right.chart, successor.sourceSeamS + delta, 0);
    const target = guideChartToWorld(successor.chart, successor.targetSeamS + delta, 0);
    near(source.x, target.x, 2e-6);
    near(source.z, target.z, 2e-6);
    near(source.heading, target.heading, 1e-8);
  }
});

test('extending far depth adds only straight open runout and preserves authored pre-tail geometry', () => {
  const parent = createStadiumGuide();
  const base = createChildStageContinuation(parent);
  const short = createRasterStageSuccessor(base.left, {
    ...authoring('LEFT'),
    id: 'SHORT',
    chartId: 'SHORT',
    roadViewId: 'SHORT_VIEW',
    dMax: 150,
  });
  const extended = createRasterStageSuccessor(base.left, {
    ...authoring('LEFT'),
    id: 'EXTENDED',
    chartId: 'EXTENDED',
    roadViewId: 'EXTENDED_VIEW',
    dMax: 200,
  });

  near(short.finishS, extended.finishS);
  assert.ok(extended.guide.raster.vertices.length > short.guide.raster.vertices.length);
  for (let i = 0; i < short.guide.raster.vertices.length; i += 1) {
    near(short.guide.raster.vertices[i].x, extended.guide.raster.vertices[i].x);
    near(short.guide.raster.vertices[i].z, extended.guide.raster.vertices[i].z);
  }
});

test('opposite deformation directions create independent successors without changing source chart', () => {
  const parent = createStadiumGuide();
  const base = createChildStageContinuation(parent);
  const negative = createRasterStageSuccessor(base.left, {
    ...authoring('LEFT'),
    chartId: 'NEG',
    roadViewId: 'NEG_VIEW',
    id: 'NEG',
  });
  const positive = createRasterStageSuccessor(base.left, {
    ...authoring('LEFT'),
    chartId: 'POS',
    roadViewId: 'POS_VIEW',
    id: 'POS',
    deformationDirection: 1,
  });

  assert.equal(negative.link.sourceFrame, base.left.chart);
  assert.equal(positive.link.sourceFrame, base.left.chart);
  assert.notEqual(negative.chart, positive.chart);
  const a = negative.guide.raster.vertices;
  const b = positive.guide.raster.vertices;
  assert.ok(a.some((vertex, index) => Math.hypot(vertex.x - b[index].x, vertex.z - b[index].z) > 1));
});

test('factory refuses a gentle-turn threshold at or above the frozen 10-degree Raster limit', () => {
  const parent = createStadiumGuide();
  const base = createChildStageContinuation(parent);
  assert.throws(
    () => createRasterStageSuccessor(base.left, { ...authoring('LEFT'), gentleTurnLimitDegrees: 10 }),
    /below the Core 10-degree limit/,
  );
});

test('successor factory is route/renderer/vehicle independent and delegates Raster construction to it', async () => {
  const { readFile } = await import('node:fs/promises');
  const [factorySource, legacySource] = await Promise.all([
    readFile(new URL('../src/runtime/raster-stage-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/courses/successor-stage-continuation.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(factorySource, /route-dag|route-boundary|route-stage-handoff|render\//);
  assert.doesNotMatch(factorySource, /car-physics|motorcycle-physics|camera/);
  assert.doesNotMatch(factorySource, /M[0-9]+|dev\//);
  assert.match(legacySource, /createRasterStageSuccessor/);
  assert.doesNotMatch(legacySource, /compileRasterPath|longestGentleRun|vertexTurnDegrees/);
});
