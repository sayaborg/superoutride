import assert from 'node:assert/strict';
import test from 'node:test';
import { compileResolvedBands, packResolvedSlabs } from '../../tools/performance/band-resolved-slabs.mjs';
import { createResolvedSlabRaster } from '../../tools/performance/band-slab-raster.mjs';
import { integrateOrderedBandBox } from '../../tools/performance/band-area-oracle.mjs';
import { linearToRgb555, evaluatePaletteMixture } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { compileSpriteLod } from '../../dist/graphics/sprite-lod-compiler.js';
import { masterDocument } from '../helpers/indexed-images.mjs';

const boundary = (a, b = a, length = 8) => ({
  knots: [
    { anchor: { s: 0 }, l: a },
    { anchor: { s: length }, l: b },
  ],
});
const band = (left, right, color, open = {}) => ({
  start: 0,
  end: 8,
  left: boundary(left),
  right: boundary(right),
  color,
  ...open,
});
const background = rgb555ToRgba(1234);
const span = (source, start = 0, end = 8, offset = 0, origin = 0) => ({
  source,
  frameStart: start,
  frameEnd: end,
  sourceLateralOrigin: origin,
  sourceChainageInFrame: (s) => s + offset,
});
function render(source, a, b, l, step, width, spans = [span(source)]) {
  const pixels = new Uint32Array(width).fill(background),
    trace = {};
  createResolvedSlabRaster(width).sample(pixels, 0, width, a, b, l, step, spans, trace);
  return { pixels, trace };
}

test('resolved paint is ordered by declaration, not activation time, with transparent upper paint', () => {
  const bands = [
    band(-4, 4, 31744),
    { ...band(-3, 3, 992), start: 2 },
    band(-1, 1, 31),
    { ...band(0, 0.5, null), end: 6 },
  ];
  const source = compileResolvedBands(bands, 8);
  const row = render(source, 3, 4, -2, 0.25, 20).pixels;
  assert.equal(row[8], rgb555ToRgba(31));
  assert.equal(row[9], background);
  assert.equal(row[16], rgb555ToRgba(992));
  const after = render(source, 6, 7, 0.25, 0.1, 1).pixels;
  assert.equal(after[0], rgb555ToRgba(31));
});

test('near spans equal independent polygon subtraction over arrows, cliffs and crossing edges', () => {
  const bands = [
    band(-4, 4, 992),
    { ...band(-3, 3, 31744), left: boundary(-3, 1), right: boundary(0, 4) },
    { ...band(0, 0, 32767), start: 1, end: 7, left: boundary(1, -2), right: boundary(1, 3) },
    { ...band(0, 1, null), start: 2, end: 6, left: boundary(-0.5, 0.5), right: boundary(0.2, 1.2) },
  ];
  const source = compileResolvedBands(bands, 8);
  for (const [a, b] of [
    [0, 0.8],
    [0.7, 2.2],
    [2.4, 3.6],
    [4.2, 7.1],
  ]) {
    const pixels = render(source, a, b, -5, 0.25, 48).pixels;
    for (let x = 0; x < pixels.length; x++) {
      const left = -5 + (x - 0.5) * 0.25;
      const expected = integrateOrderedBandBox(bands, a, b, left, left + 0.25);
      // Threshold equality is tested separately with exactly representable rectangles.
      if (Math.abs(expected.coverage - 0.5) < 1e-12) continue;
      assert.equal(
        pixels[x],
        expected.coverage < 0.5
          ? background
          : rgb555ToRgba(linearToRgb555(expected.red, expected.green, expected.blue)),
        `${a}..${b}, pixel ${x}`,
      );
    }
  }
  assert.ok(source.slabs.length > 7, 'crossings must add cuts beyond activation events');
});

test('open outer intervals contain finite endpoints and preserve distant black, white and transparent gaps', () => {
  const bands = [band(0, -1, 0, { openLeft: true }), band(1, 0, 32767, { openRight: true })];
  const source = compileResolvedBands(bands, 8);
  assert.equal(render(source, 0, 1, -1e6, 1, 1).pixels[0], rgb555ToRgba(0));
  assert.equal(render(source, 0, 1, 1e6, 1, 1).pixels[0], rgb555ToRgba(32767));
  assert.equal(render(source, 0, 1, 0, 1, 1).pixels[0], background);
  assert.ok(
    source.dictionary.flat().every((p) => ['left0', 'left1', 'right0', 'right1'].every((k) => Number.isFinite(p[k]))),
  );
  assert.equal(integrateOrderedBandBox(bands, 0, 1, -1e6, -1e6 + 1).coverage, 1);
  assert.equal(integrateOrderedBandBox(bands, 0, 1, 0, 0.1).coverage, 0);
});

test('common interior spans use no edge integrals and transparent rows do no ground work', () => {
  const solid = compileResolvedBands([band(-1000, 1000, 0)], 8);
  const row = render(solid, 0, 1, -20, 0.25, 160);
  assert.equal(row.trace.edgePixels, 0);
  assert.equal(row.trace.flatPixels, 160);
  assert.ok(row.pixels.every((p) => p === rgb555ToRgba(0)));
  const empty = render(compileResolvedBands([band(-10, 10, null)], 8), 0, 1, 0, 1, 4);
  assert.equal(empty.trace.slabs, 0);
  assert.ok(empty.pixels.every((p) => p === background));
});

test('owned Section lengths combine before the shared equality-opaque threshold; gaps never import guard colors', () => {
  const red = compileResolvedBands([band(-10, 10, 31744)], 8),
    blue = compileResolvedBands([band(-10, 10, 31)], 8);
  assert.equal(render(red, 0, 4, 0, 1, 1, [span(red, 0, 2)]).pixels[0], rgb555ToRgba(31744));
  assert.equal(render(red, 0, 4, 0, 1, 1, [span(red, 0, 1.5)]).pixels[0], background);
  const mixed = render(red, 0, 4, 0, 1, 1, [span(red, 0, 1.5), span(blue, 2.5, 4)]).pixels[0];
  assert.equal(mixed, rgb555ToRgba(linearToRgb555(0.5, 0, 0.5)));
  const source = compileResolvedBands([band(-10, 10, 992), { ...band(-10, 10, 0), start: 2, end: 6 }], 8);
  assert.equal(render(source, 1, 7, 0, 1, 1, [span(source, 2, 6)]).pixels[0], rgb555ToRgba(0));
});

test('the same master black/white average agrees before palette reduction and RGB555 rounding', () => {
  const authored = masterDocument(2, 1, [32767, 0], [1, 2]);
  const coarse = compileSpriteLod(authored).levels[1];
  const sprite = evaluatePaletteMixture(coarse.mixtures[coarse.indices[0]], authored.levels[0].paletteRgb555);
  const bands = [band(-1, 0, 32767), band(0, 1, 0)];
  const average = integrateOrderedBandBox(bands, 0, 1, -1, 1);
  assert.deepEqual(sprite, [average.red, average.green, average.blue]);
  assert.deepEqual(sprite, [0.5, 0.5, 0.5]);
  const row = render(compileResolvedBands(bands, 8), 0, 1, 0, 2, 1).pixels[0];
  assert.equal(row, rgb555ToRgba((23 << 10) | (23 << 5) | 23));
});

test('slabs intern exact equal interval lists and packed byte totals describe actual binary storage', () => {
  const bands = [band(-2, 2, 992), { ...band(-1, 1, 31), start: 1, end: 2 }, { ...band(-1, 1, 31), start: 4, end: 5 }];
  const source = compileResolvedBands(bands, 8),
    packed = packResolvedSlabs(source);
  assert.equal(source.dictionary.length, 2);
  assert.equal(source.slabs.length, 5);
  assert.equal(source.slabs[1].intervals, source.slabs[3].intervals);
  assert.ok(Object.isFrozen(source.slabs[1].intervals[0]));
  assert.equal(packed.bytes.byteLength, packed.headerBytes + packed.dictionaryBytes + packed.directoryBytes);
  assert.deepEqual([...new Uint32Array(packed.bytes.buffer, 0, 4)], [1, 2, 5, 8]);
  assert.equal(packed.bytes.byteLength, 16 + 12 + 35 * 8 + 12 * 5 + 8);
  packed.bytes.fill(0);
  assert.equal(source.slabs[1].intervals[1].color, 992);
});

test('budget 64 rejects rather than truncates complex paint, and invalid boundaries fail at admission', () => {
  assert.throws(
    () =>
      compileResolvedBands(
        Array.from({ length: 33 }, (_, i) => band(i * 2, i * 2 + 1, i)),
        8,
      ),
    /64 intervals/,
  );
  assert.throws(() => compileResolvedBands([band(2, 1, 1)], 8), /reversed/);
  assert.throws(() => compileResolvedBands([band(0, 1, 32768)], 8), /RGB555/);
  assert.throws(() => compileResolvedBands([band(0, 1, 1, { openLeft: true, openRight: true })], 8), /one side/);
  const source = compileResolvedBands([band(0, 1, 1)], 8);
  assert.ok(source.maximumIntervals <= 64);
});
