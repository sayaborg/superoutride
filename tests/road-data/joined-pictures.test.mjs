import assert from 'node:assert/strict';
import test from 'node:test';
import { joinedColors } from '../../tools/road-data/shared/joined-pictures.ts';

/** Pieces laid on one row: each pixel its piece and pen, −1 and 0 where none. */
const laid = (pixels) => ({
  width: pixels.length,
  height: 1,
  pens: Uint8Array.from(pixels, ([, pen]) => pen),
  owner: Int16Array.from(pixels, ([piece]) => piece),
});
const palette = (name, colors) => ({ name, colors: [0, ...colors] });

test("a joined picture's colors are its (piece, pen) pairs, one index for those alike in every combination", () => {
  // Piece 0's pen 1 and piece 1's pen 2 show one color in both combinations; piece 1's pen 1 differs in the second.
  const pieces = [
    [palette('p002', [10, 11]), palette('p004', [10, 11])],
    [palette('p001', [20, 10]), palette('p003', [21, 10])],
  ];
  const { picture, palettes, distinct, replaced } = joinedColors(
    laid([
      [0, 1],
      [-1, 0],
      [1, 1],
      [1, 2],
      [0, 2],
    ]),
    pieces,
  );
  assert.deepEqual([...picture.pixels], [1, 0, 2, 1, 3]);
  // Named by the palettes their pieces use in drawing order, the least name first.
  assert.deepEqual(
    palettes.map((p) => [p.name, p.colors.slice(0, 4)]),
    [
      ['p002+p001', [0, 10, 20, 11]],
      ['p004+p003', [0, 10, 21, 11]],
    ],
  );
  assert.equal(palettes[0].colors.length, 16);
  assert.deepEqual([distinct, replaced], [3, 0]);
});

test('past 15 colors, the most used are kept and each other takes the nearest kept', () => {
  // Sixteen colors: color k used k + 1 times, the least used (k = 0, black) taking the nearest kept, dark blue.
  const colors = Array.from({ length: 16 }, (_, k) => (k === 0 ? 0 : k === 1 ? 1 : k << 10));
  const pixels = colors.flatMap((_, k) => new Array(k + 1).fill([0, k + 1]));
  const { picture, distinct, replaced } = joinedColors(laid(pixels), [[palette('p000', colors)]]);
  assert.equal(distinct, 16);
  assert.equal(new Set(picture.pixels).size, 15);
  assert.equal(picture.pixels[0], picture.pixels[1]);
  assert.equal(replaced, 1 / pixels.length);
});
