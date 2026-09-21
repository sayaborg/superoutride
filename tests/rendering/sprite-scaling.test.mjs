import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { rgba, SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { createSpriteAsset, drawScaledSprite } from '../../dist/graphics/sprite.js';

describe('sprite presentation', () => {
  test('scaled sprite blitter uses texel-center anchor and preserves transparent pixels', () => {
    const bg = rgba(1, 2, 3);
    const fg = rgb555ToRgba((29 << 10) | (2 << 5) | 4);
    const pixels = new Uint32Array(9);
    pixels[2 * 3 + 1] = fg;
    const asset = createSpriteAsset('ANCHOR_PROBE', 3, 3, pixels, 1, 2, 3);
    const surface = new SoftwareSurface(10, 10);
    surface.clear(bg);
    const stats = drawScaledSprite(surface, asset, 4.5, 5.5, 1);
    assert.equal(surface.getPixel(4, 5), fg);
    assert.equal(surface.getPixel(3, 5), bg);
    assert.equal(surface.getPixel(4, 4), bg);
    assert.equal(stats.writtenPixels, 1);
  });
});
