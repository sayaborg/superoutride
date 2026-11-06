import assert from 'node:assert/strict';
import test from 'node:test';
import { drawnLower, joinedColors, joinPlan, touchingThings } from '../../tools/road-data/shared/joined-pictures.ts';

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

/** A rectangle of colored pixels as a piece, a grid pixel 0.1 m: its left and bottom in pixels. */
const piece = (id, { left, bottom = 0, width = 4, height = 4, floats = bottom > 0, order = 0, unit = 'u' }) => ({
  id,
  unit,
  s: 0,
  pixels: { width, height, pixels: new Uint8Array(width * height).fill(1) },
  pixel: 0.1,
  aspect: 1,
  left: left * 0.1,
  bottom: bottom * 0.1,
  floats,
  joins: true,
  order,
});
/** A gate: posts `left` and `right` (ids), a banner of two floating pieces across their tops. */
const gate = (unit, left = 'post', right = 'post-mirrored', banner = ['band-a', 'band-b']) => [
  piece(left, { left: 0, height: 8, unit, order: 0 }),
  piece(right, { left: 12, height: 8, unit, order: 1 }),
  piece(banner[0], { left: 0, bottom: 8, width: 8, unit, order: 2 }),
  piece(banner[1], { left: 8, bottom: 8, width: 8, unit, order: 3 }),
];

test('a thing whose standing pieces the original reuses nowhere else is baked whole; a mirrored piece is another', () => {
  const [plan] = joinPlan([gate('a')]);
  assert.deepEqual(plan.baked, [[0, 1, 2, 3]]);
  assert.deepEqual([plan.bands, plan.kept], [[], []]);
});

test('a standing piece placed alone, in another arrangement or twice in one keeps its thing pieces', () => {
  const alone = joinPlan([gate('a'), [piece('post', { left: 0, height: 8, unit: 'b' })]])[0];
  const elsewhere = joinPlan([
    [...gate('a'), ...gate('b').map((p) => (p.id === 'post-mirrored' ? { ...p, left: 1.4 } : p))],
  ]);
  const twice = joinPlan([gate('a', 'post', 'post')])[0];
  assert.deepEqual(alone.kept[0].reused, [{ id: 'post', why: ['alone'] }]);
  // Both posts stand in both arrangements.
  for (const thing of elsewhere[0].kept)
    assert.deepEqual(thing.reused, [
      { id: 'post', why: ['elsewhere'] },
      { id: 'post-mirrored', why: ['elsewhere'] },
    ]);
  assert.deepEqual(twice.kept[0].reused, [{ id: 'post', why: ['twice'] }]);
  // Its banner's two touching pieces, placed nowhere apart, are one band, resting on both posts.
  assert.deepEqual([alone.baked, alone.bands], [[], [[2, 3]]]);
  assert.deepEqual(alone.restsOn.get(2), [0, 1]);
});

test('a floating piece placed apart anywhere is no band', () => {
  const [plan] = joinPlan([gate('a', 'post', 'post'), [piece('band-b', { left: 40, bottom: 8, unit: 'c' })]]);
  assert.deepEqual(plan.bands, []);
  assert.ok(plan.restsOn.has(2) && plan.restsOn.has(3));
});

test('floating pieces touch with three clear pixels between, a standing and a floating one only side by side', () => {
  const floating = (gap) =>
    touchingThings([piece('a', { left: 0, bottom: 8 }), piece('b', { left: 4 + gap, bottom: 8 })]).length;
  assert.deepEqual([floating(3), floating(4)], [1, 0]);
  const standing = (gap) =>
    touchingThings([piece('a', { left: 0, height: 8 }), piece('b', { left: 4 + gap, bottom: 4 })]).length;
  assert.deepEqual([standing(0), standing(1)], [1, 0]);
});

test('a picture is drawn lower than its original by its shadow frame below its base, none without one', () => {
  assert.equal(drawnLower({ height: 102, anchorY: 99.5 }), 2 / 40);
  assert.equal(drawnLower(undefined), 0);
});
