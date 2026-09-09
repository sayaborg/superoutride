import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath, sampleGuidePath } from '../dist/core/guide-curve.js';
import { createGuideChart, guideChartToWorld } from '../dist/gameplay/guide-chart.js';
import { createRasterStageSuccessor } from '../dist/runtime/raster-stage-successor.js';

const guide = compileGuidePath(compileRasterPath(Array.from({ length: 35 }, (_, i) => ({
  x: 100 * (1 - Math.cos(i * Math.PI / 36)), z: 100 * Math.sin(i * Math.PI / 36), sourceRadius: 100,
}))), { lMax: 12, mMin: 0.25, dCam: 5 });
const source = { guide, chart: createGuideChart('source', guide), groundProfile: {} };
const authoring = { id: 'curve', chartId: 'target', roadViewId: 'road', surfaceSectionName: 'surface',
  sourceSeamMinS: 100, overlapMargin: 30, transitionLead: 10, finishAfterSeam: 150,
  deformationMeters: 0, deformationDirection: 1, gentleTurnLimitDegrees: 9.9,
  minDeformationRunVertices: 5, dCam: 5, dMax: 200, groundMapHalfWidth: 12,
  groundHalfWidth: 4.5, roadHalfWidth: 3.5, shoulderWidth: 1 };

test('Guide sampling stays at the adjacent fillet across roundoff-size joins', () => {
  let gaps = 0;
  for (let i = 1; i < guide.segments.length; i++) {
    const before = guide.segments[i - 1], after = guide.segments[i];
    if (after.sStart > before.sEnd) {
      gaps++;
      const s = (before.sEnd + after.sStart) / 2;
      const sample = sampleGuidePath(guide, s);
      assert.ok(sample.segmentIndex === i - 1 || sample.segmentIndex === i);
      assert.ok(Math.abs(sample.s - s) < 1e-8);
    }
  }
  assert.ok(gaps > 0, 'fixture must exercise actual floating-point joins');
});

test('a successor retains authored circular radii across its copied overlap', () => {
  const result = createRasterStageSuccessor(source, authoring);
  for (let delta = -5; delta <= 5; delta += 0.25) {
    const a = guideChartToWorld(source.chart, result.sourceSeamS + delta, 0);
    const b = guideChartToWorld(result.chart, result.targetSeamS + delta, 0);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-7);
    assert.ok(Math.abs(a.heading - b.heading) < 1e-7);
  }
});

test('successor rejects nonfinite dimensions and invalid vertex counts before generating vertices', () => {
  for (const field of ['deformationMeters', 'dMax', 'minDeformationRunVertices', 'finishAfterSeam']) {
    assert.throws(() => createRasterStageSuccessor(source, { ...authoring, [field]: Infinity }), RangeError);
  }
  for (const minDeformationRunVertices of [5.5, NaN]) {
    assert.throws(() => createRasterStageSuccessor(source, { ...authoring, minDeformationRunVertices }), RangeError);
  }
});
