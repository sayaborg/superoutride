import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseBandNormalization } from '../../tools/performance/band-normalization-diagnostic.mjs';

test('moving normalization loses the lateral footprint even before bucket reconstruction and quantization', () => {
  const report = diagnoseBandNormalization();
  assert.equal(report.sourceShared, true);
  assert.ok(report.maximumNormalizedInteriorError < 1e-12);
  assert.deepEqual(report.sourceEdgeAtStartCenterEnd, [-20, 20, -20]);
  assert.equal(report.exactHalfCoverageLateral, 0);
  assert.equal(report.restoredHalfCoverageLateral, 20);
  assert.equal(report.unquantizedDisplacementPixels, 80);
  assert.equal(report.farFirstTransparentPixel - report.nearFirstTransparentPixel, 80);
  const center = report.rows.find((row) => row.lateral === 0);
  assert.equal(center.exactCoverage, 0.5);
  assert.equal(center.observedCoverage, 1);
  assert.equal(report.qualified, false);
  console.log('BAND NORMALIZATION DIAGNOSIS', JSON.stringify(report));
});
