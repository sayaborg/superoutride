import assert from 'node:assert/strict';
import test from 'node:test';
import { compileResolvedBands } from '../../tools/performance/band-resolved-slabs.mjs';
import {
  compileBandNormalization,
  compileNormalizedBandRows,
  packNormalizedBandRows,
} from '../../tools/performance/band-normalized-rows.mjs';
import { createNormalizedRowRaster } from '../../tools/performance/band-filtered-raster.mjs';
import { measureNormalizedTransition } from '../../tools/performance/band-normalized-transition.mjs';
import { integrateOrderedBandBox } from '../../tools/performance/band-area-oracle.mjs';
import { linearToRgb555 } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';

const boundary = (a, b = a, length = 8) => ({
  knots: [
    { anchor: { s: 0 }, l: a },
    { anchor: { s: length }, l: b },
  ],
});
const band = (left, right, color, extra = {}) => ({
  start: 0,
  end: 8,
  left: boundary(left),
  right: boundary(right),
  color,
  ...extra,
});
const frame = (left = -4, right = 4, length = 8) => [
  { start: 0, end: length, left0: left, left1: left, right0: right, right1: right },
];
function compile(bands, frames = frame(), range = {}) {
  const length = frames.at(-1).end;
  const source = compileResolvedBands(bands, length);
  const pyramid = compileNormalizedBandRows(source, frames, {
    start: 0,
    end: length,
    maximumFootprint: 8,
    focalLength: 200,
    cameraHeight: 2.85,
    ...range,
  });
  return { source, pyramid };
}
const bg = rgb555ToRgba(1234);
const span = (pyramid, start = pyramid.start, end = pyramid.end) => ({
  pyramid,
  frameStart: start,
  frameEnd: end,
  sourceLateralOrigin: 0,
  sourceChainageInFrame: (s) => s,
});
function render(pyramid, start, end, station, lateral, step = 0.25, width = 48, spans = [span(pyramid)]) {
  const pixels = new Uint32Array(width).fill(bg),
    trace = {};
  createNormalizedRowRaster(width, [...new Set(spans.map((s) => s.pyramid))]).sample(
    pixels,
    0,
    width,
    start,
    end,
    station,
    lateral,
    step,
    spans,
    trace,
  );
  return { pixels, trace };
}

test('packed normalized cells match the independent ordered polygon oracle before runtime interpolation', () => {
  const bands = [
    band(-4, 4, 992),
    band(-3, 2, 31744),
    band(0, 0, 32767, { start: 1, end: 7, left: boundary(-2, 2), right: boundary(-1, 3) }),
    band(0, 1, null, { start: 2, end: 6 }),
  ];
  const { pyramid } = compile(bands);
  for (const level of pyramid.levels)
    for (let j = 0; j < level.ids.length; j++) {
      const start = Math.max(pyramid.start, j * level.width),
        end = Math.min(pyramid.end, (j + 1) * level.width);
      const row = pyramid.dictionary[level.ids[j]],
        dx = 8 / level.count;
      for (let i = 0; i < level.count; i++) {
        const expected = integrateOrderedBandBox(bands, start, end, -4 + i * dx, -4 + (i + 1) * dx);
        assert.ok(
          Math.abs(row.coverage[i + 1] / 255 - expected.coverage) <= 0.5 / 255 + 1e-10,
          `${level.width}/${j}/${i} coverage`,
        );
        if (expected.coverage > 1e-9)
          assert.equal(
            row.colors[i + 1],
            linearToRgb555(expected.red, expected.green, expected.blue),
            `${level.width}/${j}/${i} color`,
          );
      }
    }
});

test('black and white boxes use the common linear-sRGB mean, not encoded averaging', () => {
  const bands = [band(-4, 4, 0), band(-4, 4, 32767, { end: 0.8 }), band(-4, 4, 32767, { start: 1.6, end: 2.4 })];
  const { pyramid } = compile(bands);
  const row = pyramid.dictionary[pyramid.levels[0].ids[0]];
  assert.equal(row.colors[10], (23 << 10) | (23 << 5) | 23);
  assert.equal(row.coverage[10], 255);
});

test('normalization preserves widening and moving silhouettes without longitudinal edge blur', () => {
  const bands = [
    band(0, -4, 0, { openLeft: true, right: boundary(-4, -8) }),
    band(-4, 4, 32767, { left: boundary(-4, -8), right: boundary(4, 8) }),
    band(4, 0, null, { openRight: true, left: boundary(4, 8) }),
  ];
  const source = compileResolvedBands(bands, 8),
    frames = compileBandNormalization(bands, source);
  const { pyramid } = compile(bands, frames);
  for (const level of pyramid.levels) {
    assert.equal(new Set(level.ids).size, 1, 'width change alone must not generate blurred rows');
    const row = pyramid.dictionary[level.ids[0]];
    assert.equal(row.colors[0], 0);
    assert.equal(row.coverage[0], 255);
    assert.equal(row.coverage.at(-1), 0);
    assert.ok(row.coverage.slice(1, -1).every((c) => c === 255));
  }
  const pixels = render(pyramid, 3.2, 4.8, 4, -10, 0.25, 81).pixels;
  assert.equal(pixels[0], rgb555ToRgba(0));
  assert.equal(pixels[40], rgb555ToRgba(32767));
  assert.equal(pixels[80], bg);
});

test('clipped ownership buckets exclude guard paint and Section lengths combine before thresholding', () => {
  const bands = [band(-4, 4, 992), band(-4, 4, 0, { start: 2, end: 6 })];
  const owned = compile(bands, frame(), { start: 2, end: 6 }).pyramid;
  for (const level of owned.levels)
    for (const id of level.ids) assert.ok(owned.dictionary[id].colors.slice(1, -1).every((c) => c === 0));
  const red = compile([band(-4, 4, 31744)]).pyramid,
    blue = compile([band(-4, 4, 31)]).pyramid;
  const mixed = render(red, 0, 4, 2, 0, 1, 1, [span(red, 0, 1.5), span(blue, 2.5, 4)]).pixels[0];
  assert.equal(mixed, rgb555ToRgba(linearToRgb555(0.5, 0, 0.5)));
  assert.equal(render(red, 0, 4, 2, 0, 1, 1, [span(red, 0, 2)]).pixels[0], rgb555ToRgba(31744));
  assert.equal(render(red, 0, 4, 2, 0, 1, 1, [span(red, 0, 1.9)]).pixels[0], bg);
});

test('far empty paint skips the row and open tails fill spans without lateral sample work', () => {
  const empty = compile([band(-4, 4, null)]).pyramid;
  const result = render(empty, 1, 3, 2, -10);
  assert.ok(result.pixels.every((p) => p === bg));
  assert.equal(result.trace.sections, 0);
  assert.equal(result.trace.lateralSamples, 0);
  const solid = compile([
    band(0, -4, 0, { openLeft: true }),
    band(-4, 4, 32767),
    band(4, 0, 0, { openRight: true }),
  ]).pyramid;
  const tail = render(solid, 1, 3, 2, -1e6);
  assert.ok(tail.pixels.every((p) => p === rgb555ToRgba(0)));
  assert.equal(tail.trace.lateralSamples, 0);
  assert.equal(tail.trace.flatPixels, 48);
});

test('qualification preserves the subpixel gate and detects remaining level/near-far cliff failures', () => {
  const result = measureNormalizedTransition();
  assert.equal(result.movingOpenEdge.savedCounterexample.displacementPixels, 0);
  assert.equal(result.movingOpenEdge.levels.displacementPixels, 1);
  assert.equal(result.orderedCliff.nearFar.displacementPixels, 6);
  assert.equal(result.orderedCliff.nearFar.s, 1.85);
  assert.equal(result.qualified, false, 'a successful diagnostic is not a passed adoption gate');
});

test('rational normalized integrals agree with independent quadrature for width-varying paint', () => {
  const frames = [{ start: 0, end: 8, left0: -4, left1: -8, right0: 4, right1: 8 }];
  const bands = [band(-4, 4, 0, { left: boundary(-4, -8), right: boundary(4, 8) }), band(-1, 1, 32767)];
  const { pyramid } = compile(bands, frames),
    level = pyramid.levels[2],
    row = pyramid.dictionary[level.ids[0]];
  // Independent rectangle oracle at longitudinal midpoints; no rational helper or compiled slab reads.
  for (const x of [Math.floor(level.count / 2) - 2, Math.floor(level.count / 2), Math.floor(level.count / 2) + 2]) {
    let sum = 0;
    const n = 4096;
    for (let i = 0; i < n; i++) {
      const s = (level.width * (i + 0.5)) / n,
        w = 8 + s;
      const left = -w / 2 + (x / level.count) * w,
        right = left + w / level.count;
      sum += integrateOrderedBandBox(bands, s - 1e-7, s + 1e-7, left, right).red;
    }
    const expected = linearToRgb555(sum / n, sum / n, sum / n);
    assert.equal(row.colors[x + 1], expected);
  }
});

test('packed rows have bounded lengths, exact byte accounting and immutable independent dictionaries', () => {
  const { pyramid } = compile([band(-4, 4, 992)]),
    packed = packNormalizedBandRows(pyramid);
  for (const level of pyramid.levels)
    assert.equal(level.rowLength, Math.ceil(pyramid.maximumWidth / level.spacing) + 2);
  assert.equal(
    packed.bytes.byteLength,
    packed.headerBytes + packed.frameBytes + packed.levelBytes + packed.dictionaryBytes + packed.directoryBytes,
  );
  assert.ok(Object.isFrozen(pyramid.dictionary[0].colors));
  assert.throws(() => {
    pyramid.dictionary[0].colors[1] = 0;
  }, TypeError);
  const original = pyramid.dictionary[0].colors[1];
  packed.bytes.fill(0);
  assert.equal(pyramid.dictionary[0].colors[1], original);
  assert.throws(() => compile([band(-4, 4, 0)], [{ ...frame()[0], right1: -5 }]), /positive finite/);
});
