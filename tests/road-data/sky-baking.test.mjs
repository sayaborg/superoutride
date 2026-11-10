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

test('a facing layer of whole copies a turn repeats its picture, each layer over it alike', () => {
  // Two pictures of 256 pixels, each 6 copies a turn (1536): the facing all blue but its pixel 0, the other red in its
  // first half. Every copy shows, and the rows are chosen by the turn, not the picture.
  const turn = 6 * 256;
  const facing = layer(256, (x) => (x === 0 ? RED : BLUE), { turn });
  const near = layer(256, (x) => (x >= 128 && x < 192 ? RED : TRANSPARENT), { turn });
  const sky = bakeSky('test', { layers: [facing, near], facing: 0, ramp: { rows: [0], below: 0 } }, 1);
  const row = new Uint16Array(SKY_WIDTH);
  compileTilePicture(sky).paintRow(row, 0, 0, 319, SKY_WIDTH);
  const at = (pixel) => row[Math.floor(((pixel + 0.5) * SKY_WIDTH) / turn)];
  for (let copy = 0; copy < 6; copy++) {
    assert.equal(at(256 * copy + 64), BLUE, `copy ${copy}: the facing layer`);
    assert.equal(at(256 * copy + 160), RED, `copy ${copy}: the layer over it`);
  }
  // Its two rows at 1504 / 1536 a row lie in the two rows above the horizon; a row at 1504 / 256 would fill 12.
  compileTilePicture(sky).paintRow(row, 0, 0, 316, SKY_WIDTH);
  assert.equal(row[100], 0);
});
