import assert from 'node:assert/strict';
import test from 'node:test';
import { compileTilePicture } from '../../src/image/tile-picture.ts';
import { bakeSky, SKY_WIDTH, TRANSPARENT } from '../../tools/road-data/shared/sky-baking.ts';

/** A layer two rows tall, `width` pixels, each pixel `color(x)`, its bottom row the first above the horizon. */
const layer = (width, color, extra = {}) => ({
  width,
  pixels: Int32Array.from({ length: 2 * width }, (_, i) => color(i % width)),
  bottom: -1,
  ...extra,
});
const RED = 31 << 10,
  BLUE = 31;

test('a layer whose turn is no whole number of its pictures is laid round from the seam, cut once there', () => {
  // The facing layer, 752 pixels a turn (2 of the sky's columns a pixel), all blue. Over it a layer whose 100-pixel
  // picture is red then transparent, half each, and whose turn is 250 pixels: 2.5 pictures. Laid from the seam at the
  // facing layer's pixel 376 (the sky's column 752), its pixel 125 there.
  const facing = layer(752, () => BLUE);
  const near = layer(100, (x) => (x < 50 ? RED : TRANSPARENT), { turn: 250 });
  const sky = bakeSky('test', { layers: [facing, near], facing: 0, seam: 376, ramp: { rows: [0], below: 0 } }, 1);
  const row = new Uint16Array(SKY_WIDTH);
  compileTilePicture(sky).paintRow(row, 0, 0, 319, SKY_WIDTH); // the row just above the horizon
  // A sky column `u` of the near layer's turn from the seam (1504 / 250 columns a pixel).
  const at = (u) => row[Math.floor(752 + ((u + 0.5) * SKY_WIDTH) / 250) % SKY_WIDTH];
  assert.equal(at(0), RED, 'its pixel 125: 25 of a picture, red');
  assert.equal(at(30), BLUE, 'its pixel 155: 55, transparent');
  assert.equal(at(80), RED, 'its pixel 205: 5, red');
  assert.equal(at(249), BLUE, 'its pixel 374: 74, transparent, before the seam cuts to 25');
  // A layer whose turn is its picture's width is laid as before, by its overlap alone.
  const whole = bakeSky(
    'test',
    { layers: [facing, layer(100, (x) => (x < 50 ? RED : TRANSPARENT))], facing: 0, ramp: { rows: [0], below: 0 } },
    1,
  );
  const plain = new Uint16Array(SKY_WIDTH);
  compileTilePicture(whole).paintRow(plain, 0, 0, 319, SKY_WIDTH);
  assert.deepEqual([plain[0], plain[SKY_WIDTH - 1]], [RED, BLUE]);
});
