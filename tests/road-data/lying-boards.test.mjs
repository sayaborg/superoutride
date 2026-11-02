import assert from 'node:assert/strict';
import test from 'node:test';
import { boardsBefore, lyingStrips } from '../../tools/road-data/shared/lying-boards.ts';

// Pens 1–14 each its own color, pen p's RGB555 p.
const rgb = Array.from({ length: 15 }, (_, k) => k + 1);
const board = (rows, more = {}) => ({
  at: 10,
  before: 0,
  x: 0,
  pixel: 8,
  picture: { width: rows[0].length, pixels: Uint8Array.from(rows.flat()) },
  rgb,
  mirrored: false,
  flipped: false,
  ...more,
});

test('rows divide the steps from the board before it, the top row farthest; runs of one class are a Strip each', () => {
  const { strips, outside } = lyingStrips(
    board([
      [0, 1, 9, 9, 1, 0],
      [1, 1, 1, 1, 1, 15],
    ]),
  );
  assert.equal(outside, 1);
  // The bottom row, nearest: steps 0 to 5, across −24 to 16 (its pen 15 drawn as none).
  assert.deepEqual(
    strips.map((s) => [s.from, s.to, s.left, s.right]),
    [
      [0, 5, -24, 16],
      [5, 10, -16, -8],
      [5, 10, -8, 8],
      [5, 10, 8, 16],
    ],
  );
  assert.equal(strips[2].color, 9);
});

test('a flipped board shows its bottom row farthest, a mirrored one its columns the other way', () => {
  const rows = [
    [1, 9],
    [9, 9],
  ];
  const flipped = lyingStrips(board(rows, { flipped: true })).strips;
  assert.deepEqual(
    flipped.map((s) => [s.from, s.to, s.left, s.right, s.color]),
    [
      [0, 5, -8, 0, 1],
      [0, 5, 0, 8, 9],
      [5, 10, -8, 8, 9],
    ],
  );
  const mirrored = lyingStrips(board(rows, { mirrored: true })).strips;
  assert.deepEqual(
    mirrored.filter((s) => s.from === 5).map((s) => [s.left, s.right, s.color]),
    [
      [-8, 0, 9],
      [0, 8, 1],
    ],
  );
});

test('alike rows are one Strip', () => {
  const { strips } = lyingStrips(
    board([
      [1, 1],
      [1, 1],
      [1, 1],
      [9, 9],
    ]),
  );
  assert.deepEqual(
    strips.map((s) => [s.from, s.to]),
    [
      [0, 2.5],
      [2.5, 10],
    ],
  );
});

test('a board lies from the board before it in its run; the first of a run as far as the one after it', () => {
  assert.deepEqual(boardsBefore([100, 110, 120, 500, 504, 508], null), [90, 100, 110, 496, 500, 504]);
  // A closed line runs on round the lap.
  assert.deepEqual(boardsBefore([5, 15, 995], 1000), [-5, 5, 985]);
  assert.throws(() => boardsBefore([100, 110, 300], null), /stands alone/);
});
