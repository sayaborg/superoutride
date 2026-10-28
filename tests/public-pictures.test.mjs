import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexedPattern } from '../src/image/indexed-image.ts';
import { pictureLayers, pictureDimensions, pictureScale } from '../tools/public-pictures/layers.ts';

const frame = (width, height, anchorX, anchorY, indices) => ({
  width,
  height,
  anchorX,
  anchorY,
  pattern: new IndexedPattern(width, height, indices),
});

test('body subtraction aligns shadow anchors and keeps unshadowed painted ground', () => {
  const level = {
    ...frame(3, 3, 1, 1.5, [1, 1, 1, 1, 1, 1, 2, 2, 2]),
    paletteRgb555: [],
    shadow: frame(5, 4, 2, 2.5, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  };
  const { master, body } = pictureLayers(level);
  assert.deepEqual(body.indices, [1, 1, 1, 1, 0, 1, 0, 2, 2]);
  assert.deepEqual(master.indices, [1, 1, 1, 1, 1, 1, 2, 2, 2]);
  assert.equal(pictureDimensions(body).groundTexels, 1);
});

test('mirror-only source restores the master and its independent shadow around their anchors', () => {
  const level = {
    ...frame(3, 1, 0.5, 0.5, [1, 2, 3]),
    paletteRgb555: [],
    shadow: frame(5, 1, 1.5, 0.5, [0, 1, 0, 0, 0]),
  };
  const { master, shadow, body } = pictureLayers(level, true);
  assert.equal(master.anchorX, 1.5);
  assert.equal(shadow.anchorX, 2.5);
  assert.deepEqual(master.indices, [3, 2, 1]);
  assert.deepEqual(body.indices, [3, 2, 0]);
});

test('painted ground adds no object height and does not change a requested height scale', () => {
  const house = { width: 156, height: 58, anchorX: 77.5, anchorY: 44.5, indices: [] };
  assert.deepEqual(pictureDimensions(house), { width: 3.9, height: 1.125, frameHeightTexels: 58, groundTexels: 13 });
  assert.equal(pictureScale(house, 3.5), 3.5 / 1.125);
  assert.equal(pictureScale({ ...house, height: 80 }, 3.5), pictureScale(house, 3.5));
  assert.equal(pictureScale(house, null), 1);
  assert.equal(pictureDimensions({ ...house, anchorY: 57.5 }).height, 1.45);
});
