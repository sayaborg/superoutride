import test from 'node:test';
import assert from 'node:assert/strict';

import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import { createM626LiveContinuation } from '../dist/dev/m6-26-live-successor-stage.js';
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
    dMax: 150,
    finishClosureMargin: 20,
    groundHalfWidth: 4.5,
    roadHalfWidth: 3.5,
    shoulderWidth: 1,
  };
}

test('M6.29 generic factory reproduces the M6.26 LEFT successor geometry and seam chainages', () => {
  const parent = createM2StadiumGuide();
  const base = createM622ChildStageContinuation(parent);
  const direct = createRasterStageSuccessor(base.left, authoring('LEFT'));
  const live = createM626LiveContinuation(parent).leftSuccessor;

  near(direct.guide.length, live.guide.length);
  near(direct.sourceTransitionS, live.sourceTransitionS);
  near(direct.sourceSeamS, live.sourceSeamS);
  near(direct.targetSeamS, live.targetSeamS);
  near(direct.finishS, live.finishS);
  assert.equal(direct.guide.raster.vertices.length, live.guide.raster.vertices.length);
  for (let i = 0; i < direct.guide.raster.vertices.length; i += 1) {
    near(direct.guide.raster.vertices[i].x, live.guide.raster.vertices[i].x);
    near(direct.guide.raster.vertices[i].z, live.guide.raster.vertices[i].z);
  }
});

test('M6.29 generic factory preserves exact D_cam overlap around the successor seam', () => {
  const parent = createM2StadiumGuide();
  const base = createM622ChildStageContinuation(parent);
  const successor = createRasterStageSuccessor(base.right, authoring('RIGHT'));

  for (const delta of [-5, -2.5, 0, 2.5, 5]) {
    const source = guideChartToWorld(base.right.chart, successor.sourceSeamS + delta, 0);
    const target = guideChartToWorld(successor.chart, successor.targetSeamS + delta, 0);
    near(source.x, target.x, 2e-6);
    near(source.z, target.z, 2e-6);
    near(source.heading, target.heading, 1e-8);
  }
});

test('M6.29 opposite deformation directions create independent successors without changing source chart', () => {
  const parent = createM2StadiumGuide();
  const base = createM622ChildStageContinuation(parent);
  const negative = createRasterStageSuccessor(base.left, { ...authoring('LEFT'), chartId: 'NEG', roadViewId: 'NEG_VIEW', id: 'NEG' });
  const positive = createRasterStageSuccessor(base.left, { ...authoring('LEFT'), chartId: 'POS', roadViewId: 'POS_VIEW', id: 'POS', deformationDirection: 1 });

  assert.equal(negative.link.sourceFrame, base.left.chart);
  assert.equal(positive.link.sourceFrame, base.left.chart);
  assert.notEqual(negative.chart, positive.chart);
  const a = negative.guide.raster.vertices;
  const b = positive.guide.raster.vertices;
  assert.ok(a.some((vertex, index) => Math.hypot(vertex.x - b[index].x, vertex.z - b[index].z) > 1));
});

test('M6.29 factory refuses a gentle-turn threshold at or above the frozen 10-degree Raster limit', () => {
  const parent = createM2StadiumGuide();
  const base = createM622ChildStageContinuation(parent);
  assert.throws(
    () => createRasterStageSuccessor(base.left, { ...authoring('LEFT'), gentleTurnLimitDegrees: 10 }),
    /below the Core 10-degree limit/,
  );
});

test('M6.29 successor factory is route/renderer/vehicle independent and M6.26 delegates Raster construction to it', async () => {
  const { readFile } = await import('node:fs/promises');
  const [factorySource, legacySource] = await Promise.all([
    readFile(new URL('../src/runtime/raster-stage-successor.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m6-26-live-successor-stage.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(factorySource, /route-dag|route-boundary|route-stage-handoff|render\//);
  assert.doesNotMatch(factorySource, /car-physics|motorcycle-physics|m5-camera/);
  assert.doesNotMatch(factorySource, /M6_2[0-9]|m6-2[0-9]/);
  assert.match(legacySource, /createRasterStageSuccessor/);
  assert.doesNotMatch(legacySource, /compileRasterCourse|longestGentleRun|vertexTurnDegrees/);
});
