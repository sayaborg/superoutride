import { near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { normalFromHeading, tangentFromHeading, wrapSigned } from '../dist/core/math.js';

describe('open coordinate geometry', () => {
  test('wrapSigned remains available to topology/gameplay consumers', () => {
    assert.equal(wrapSigned(0, 100), 0);
    assert.equal(wrapSigned(50, 100), 50);
    assert.equal(wrapSigned(-50, 100), 50);
    assert.equal(wrapSigned(51, 100), -49);
    assert.equal(wrapSigned(-51, 100), 49);
  });

  test('heading basis matches +Z forward and +X right', () => {
    assert.deepEqual(tangentFromHeading(0), { x: 0, z: 1 });
    assert.deepEqual(normalFromHeading(0), { x: 1, z: -0 });

    const t90 = tangentFromHeading(Math.PI / 2);
    near(t90.x, 1, 1e-8);
    near(t90.z, 0, 1e-8);
  });
});
