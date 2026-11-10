import assert from 'node:assert/strict';
import test from 'node:test';
import { bandBoards } from '../../tools/road-data/shared/band-boards.ts';
import { pictureParts } from '../../tools/road-data/shared/sprite-rules.ts';

const names = { picture: 'thing', band: 'thing-band', mirrored: 'thing-band-mirrored' };
const palettes = [{ name: 'p000', colors: Array.from({ length: 16 }, (_, k) => k) }];
/** A picture 12 columns wide: its band's 4 either side of its own 4, the band's first row clear. */
const source = (band) => {
  const rows = [
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    [...band, 1, 2, 2, 1, ...band],
    [...band, 1, 2, 2, 1, ...band],
  ];
  return { width: 12, height: 3, pixels: Uint8Array.from(rows.flat()) };
};
const indices = (master) => master.levels[0].indices;

test('a band lies beyond its picture each way, its rows from its first holding a pixel, the left one mirrored', () => {
  const picture = source([5, 6, 7, 8]);
  const { picture: drawn, bands } = bandBoards(
    names,
    picture,
    pictureParts(picture, undefined),
    [4, 8],
    6,
    { across: 1, down: 1 },
    palettes,
  );
  // The picture between its edges, once, its base point its middle.
  assert.deepEqual([drawn.width, drawn.height, drawn.anchorX, drawn.extend], [4, 3, 1.5, undefined]);
  assert.deepEqual(indices(drawn), [1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 2, 1]);
  // The band right of it extends right, anchored at the picture's base point left of it; its mirror extends left.
  const [right, left] = bands;
  assert.deepEqual([right.width, right.height, right.extend, right.anchorX], [4, 2, 'right', -2.5]);
  assert.deepEqual(indices(right), [5, 6, 7, 8, 5, 6, 7, 8]);
  assert.deepEqual([left.width, left.height, left.extend, left.anchorX], [4, 2, 'left', 5.5]);
  assert.deepEqual(indices(left), [8, 7, 6, 5, 8, 7, 6, 5]);
});

test('a band whose last rows are clear stands as much higher, anchored at its bottom edge', () => {
  const picture = {
    ...source([5, 6, 7, 8]),
    height: 4,
    pixels: Uint8Array.from([...source([5, 6, 7, 8]).pixels, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0]),
  };
  const { bands, rise } = bandBoards(
    names,
    picture,
    pictureParts(picture, undefined),
    [4, 8],
    6,
    { across: 1, down: 1 },
    palettes,
  );
  assert.deepEqual([bands[0].height, bands[0].anchorY ?? bands[0].height - 0.5, rise], [2, 1.5, 1 / 40]);
});

test('a band with a clear pixel is refused, as a band fills its plane', () => {
  const picture = source([5, 0, 7, 8]);
  assert.throws(
    () => bandBoards(names, picture, pictureParts(picture, undefined), [4, 8], 6, { across: 1, down: 1 }, palettes),
    /thing-band has a hole/,
  );
});

test('a clear band keeps its clear pixels', () => {
  const picture = source([5, 0, 7, 8]);
  const { bands } = bandBoards(
    names,
    picture,
    pictureParts(picture, undefined),
    [4, 8],
    6,
    { across: 1, down: 1 },
    palettes,
    'both',
    true,
  );
  assert.deepEqual(indices(bands[0]), [5, 0, 7, 8, 5, 0, 7, 8]);
  assert.deepEqual(indices(bands[1]), [8, 7, 0, 5, 8, 7, 0, 5]);
});
