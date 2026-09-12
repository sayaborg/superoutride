import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { rgba, SoftwareSurface } from '../dist/graphics/software-surface.js';

describe('hill and cliff scenery', () => {
  test('software surface provides deterministic 32-bit span writes', () => {
    const surface = new SoftwareSurface(8, 4);
    const a = rgba(1, 2, 3);
    const b = rgba(10, 20, 30);
    surface.clear(a);
    surface.fillSpan(2, 2, 5, b);
    assert.equal(surface.getPixel(0, 2), a);
    assert.equal(surface.getPixel(2, 2), b);
    assert.equal(surface.getPixel(5, 2), b);
    assert.equal(surface.getPixel(6, 2), a);
  });
});
