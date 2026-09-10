import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { compileStageContinuationLink } from '../dist/runtime/stage-continuation-link.js';

const bump = (sign) =>
  compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 100 },
      { x: sign, z: 120 },
      { x: sign, z: 140 },
      { x: 0, z: 160 },
      { x: 0, z: 1000 },
    ]),
    { lMax: 1, mMin: 0.25 },
  );
const sourceFrame = bump(1);
const link = (targetFrame) => ({
  id: 'overlap',
  sourceFrame,
  targetFrame,
  sourceSeamS: sourceFrame.length / 2,
  targetSeamS: targetFrame.length / 2,
  sourceLocalL: 0,
  targetLocalL: 0,
  overlapBehind: sourceFrame.length / 2,
  overlapAhead: sourceFrame.length / 2,
});

test('continuation rejects a local geometry mismatch between the former five probes', () => {
  assert.throws(() => compileStageContinuationLink(link(bump(-1))), /mismatch/);
  assert.doesNotThrow(() => compileStageContinuationLink(link(bump(1))));
});

test('continuation tolerances cannot disable geometric validation with infinity', () => {
  for (const field of ['positionTolerance', 'headingTolerance']) {
    assert.throws(() => compileStageContinuationLink({ ...link(sourceFrame), [field]: Infinity }), RangeError);
  }
});
