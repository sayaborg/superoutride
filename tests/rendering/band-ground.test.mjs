import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BAND_ACTIVE_LIMIT,
  BAND_FILTERS,
  compileBandGround,
  createBandGroundSampler,
  createBandRenderMetrics,
} from '../../dist/visual/band-ground.js';
import { expandCourseBands } from '../../dist/compiler/course-band-ground.js';
import { linearToRgb555, rgb555LinearChannel } from '../../dist/graphics/image-filter.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { unpackRgba } from '../../dist/graphics/software-surface.js';

const BG = 0x44332211;
const WHITE = 32767,
  RED = 31 << 10,
  BLUE = 31;
const piece = (start, end, left, right, color, leftEnd = left, rightEnd = right) => ({
  start,
  end,
  left,
  right,
  leftEnd,
  rightEnd,
  color,
});
const whole = (ground) => [{ ground, frameStart: 0, sourceStart: 0, sourceEnd: ground.length, lateralOrigin: 0 }];
function row(sources, { s = 4, l = -4, stepL = 0.25, deltaS = 0, count = 32, filter = 'BOX' } = {}) {
  const pixels = new Uint32Array(count).fill(BG),
    stats = createBandRenderMetrics();
  createBandGroundSampler(sources).sampleSpan(pixels, 0, count, s, l, stepL, deltaS, filter, stats);
  return { pixels, stats };
}

test('last declaration wins regardless of activation order; transparent Bands erase and opaque black remains visible', () => {
  const ground = compileBandGround(16, [
    piece(0, 16, null, null, RED),
    piece(8, 12, -4, 4, WHITE),
    piece(0, 16, -2, 2, BLUE),
    piece(7, 13, 0, 1, null),
    piece(0, 16, 1, 2, 0),
  ]);
  const { pixels } = row(whole(ground), { s: 9, l: -3, stepL: 1, count: 8, filter: 'POINT' });
  assert.deepEqual(
    Array.from(pixels),
    [WHITE, BLUE, BLUE, null, 0, WHITE, WHITE, RED].map((c) => (c === null ? BG : rgb555ToRgba(c))),
  );
  const tails = row(whole(ground), { s: 9, l: -1e6, stepL: 2e6, count: 2, filter: 'POINT' }).pixels;
  assert.deepEqual(Array.from(tails), [rgb555ToRgba(RED), rgb555ToRgba(RED)]);
  // At this finite edge, edge - 1 rounds back onto the edge; no interior witness is needed.
  const open = compileBandGround(1, [piece(0, 1, null, 1e16, RED), piece(0, 1, 1e16, null, BLUE)]);
  assert.deepEqual(Array.from(row(whole(open), { s: 0.5, l: 0, stepL: 2e16, count: 2, filter: 'POINT' }).pixels), [
    rgb555ToRgba(RED),
    rgb555ToRgba(BLUE),
  ]);
});

test('crossing affine edges resolve into immutable slabs; changing input cannot change the published field', () => {
  const input = [piece(0, 8, -4, 0, RED, 4, 8), piece(0, 8, 0, 4, BLUE, -8, -4)];
  const ground = compileBandGround(8, input);
  assert.ok(ground.slabs.length > 1);
  const before = row(whole(ground), { s: 3, deltaS: 1.7 }).pixels;
  input[0].color = 0;
  input[0].left = -999;
  assert.deepEqual(row(whole(ground), { s: 3, deltaS: 1.7 }).pixels, before);
  assert.throws(() => {
    ground.slabs[0].spans[0].color = 0;
  }, TypeError);
  assert.throws(() => ground.slabs.push({}), TypeError);
  assert.equal(Object.values(ground).some(ArrayBuffer.isView), false);
});

test('active limit counts authored overlap, not only the visible resolved colors', () => {
  const active = Array.from({ length: BAND_ACTIVE_LIMIT }, () => piece(0, 2, null, null, RED));
  assert.equal(compileBandGround(2, active).metrics.maxActiveBands, BAND_ACTIVE_LIMIT);
  assert.throws(() => compileBandGround(2, [...active, active[0]]), /Active Bands 65 exceed 64/);
  assert.throws(() => compileBandGround(2, [piece(0, 2, 2, 1, RED)]), /left edge/);
  assert.throws(() => compileBandGround(2, [piece(0, 2, null, 1, RED, 0, 1)]), /consistently open/);
  assert.throws(() => compileBandGround(2, [piece(0, 3, 0, 1, RED)]), /inside the Section/);
  assert.throws(() => compileBandGround(1_048_577, []), /preblend cells/);
});

test('exact half coverage is opaque for all lateral filters, and color is normalized after coverage', () => {
  const ground = compileBandGround(16, [piece(0, 16, 0, null, WHITE, 16, null)]);
  for (const filter of BAND_FILTERS) {
    const sources = whole(ground);
    assert.equal(row(sources, { s: 8, l: 8, stepL: 1, deltaS: 4, count: 1, filter }).pixels[0], rgb555ToRgba(WHITE));
    assert.equal(row(sources, { s: 8, l: 8 - 1e-6, stepL: 1, deltaS: 4, count: 1, filter }).pixels[0], BG);
    assert.equal(
      row(sources, { s: 8, l: 8 + 1e-6, stepL: 1, deltaS: 4, count: 1, filter }).pixels[0],
      rgb555ToRgba(WHITE),
    );
  }
});

test('moving open edges do not jump when a footprint crosses a power-of-two interval size', () => {
  const ground = compileBandGround(32, [piece(0, 32, 0, null, WHITE, 16, null)]);
  for (const filter of BAND_FILTERS) {
    const rows = [3.999999, 4, 4.000001, 7.999999, 8, 8.000001].map(
      (deltaS) => row(whole(ground), { s: 12.04, deltaS, l: 0, stepL: 0.25, count: 64, filter }).pixels,
    );
    for (const pixels of rows) assert.deepEqual(pixels, rows[0]);
  }
});

test('owned Section lengths and origins combine before opacity/color normalization; unowned guards never contribute', () => {
  const a = compileBandGround(16, [piece(0, 16, null, null, RED), piece(10, 16, null, null, WHITE)]);
  const b = compileBandGround(16, [piece(0, 16, null, null, BLUE), piece(0, 5, null, null, WHITE)]);
  const sources = [
    { ground: a, frameStart: 0, sourceStart: 2, sourceEnd: 10, lateralOrigin: 100 },
    { ground: b, frameStart: 8, sourceStart: 5, sourceEnd: 13, lateralOrigin: -20 },
  ];
  const expected = rgb555ToRgba(linearToRgb555(0.5, 0, 0.5));
  for (const filter of BAND_FILTERS) {
    const result = row(sources, { s: 8, l: -100, stepL: 7, deltaS: 6, count: 40, filter });
    assert.ok(result.pixels.every((p) => p === expected));
    assert.deepEqual(
      row(
        sources.map((p) => ({ ...p, frameStart: p.frameStart + 1000.1 })),
        { s: 1008.1, l: -100, stepL: 7, deltaS: 6, count: 40, filter },
      ).pixels,
      result.pixels,
    );
  }
  const clear = compileBandGround(4, []),
    white = compileBandGround(4, [piece(0, 4, null, null, WHITE)]);
  const transition = [...whole(white), { ...whole(clear)[0], frameStart: 4 }];
  assert.equal(row(transition, { s: 4, deltaS: 4, count: 1 }).pixels[0], rgb555ToRgba(WHITE));
  assert.equal(row(transition, { s: 4.01, deltaS: 4, count: 1 }).pixels[0], BG);
});

test('lateral rebasing preserves the filtered absolute source field', () => {
  const ground = compileBandGround(24, [piece(0, 24, null, null, RED), piece(0, 24, -6, 0, WHITE, 6, 12)]);
  for (const filter of BAND_FILTERS) {
    const a = row(whole(ground), { s: 9.2, deltaS: 7.3, l: -5, stepL: 0.2, count: 70, filter }).pixels;
    const b = row([{ ...whole(ground)[0], lateralOrigin: 11.75, frameStart: 100 }], {
      s: 109.2,
      deltaS: 7.3,
      l: -16.75,
      stepL: 0.2,
      count: 70,
      filter,
    }).pixels;
    assert.deepEqual(a, b);
  }
});

/** Independent source-order midpoint quadrature; it never reads compiled slabs, profiles or their integrator. */
function sourceAverage(pieces, s, l, deltaS, width, filter) {
  const ns = 300,
    nl = filter === 'POINT' ? 1 : 400;
  const result = [0, 0, 0, 0];
  const radius = filter === 'POINT' ? 0 : filter === 'BOX' ? width / 2 : width;
  for (let i = 0; i < ns; i++) {
    const at = s + ((i + 0.5) / ns - 0.5) * deltaS;
    for (let j = 0; j < nl; j++) {
      const x = l + ((j + 0.5) / nl - 0.5) * 2 * radius;
      const kernel = filter === 'TENT' ? 2 * (1 - Math.abs(x - l) / width) : 1;
      let color = null;
      for (const p of pieces) {
        if (at < p.start || at >= p.end) continue;
        const t = (at - p.start) / (p.end - p.start);
        const left = p.left === null ? -Infinity : p.left + (p.leftEnd - p.left) * t;
        const right = p.right === null ? Infinity : p.right + (p.rightEnd - p.right) * t;
        if (left <= x && x < right) color = p.color;
      }
      if (color === null) continue;
      const weight = kernel / (ns * nl);
      result[0] += rgb555LinearChannel(color >>> 10) * weight;
      result[1] += rgb555LinearChannel((color >>> 5) & 31) * weight;
      result[2] += rgb555LinearChannel(color & 31) * weight;
      result[3] += weight;
    }
  }
  return result;
}

test('POINT / BOX / TENT agree with independent area integration for overlaps, crossing edges and clipped s cells', () => {
  const pieces = [
    piece(0, 16, null, null, RED),
    piece(1, 14, -4, 0, WHITE, 4, 8),
    piece(5, 12, -1, 3, BLUE, -4, 0),
    piece(7, 9.5, -0.2, 1.2, null, 0.7, 1.4),
  ];
  const ground = compileBandGround(16, pieces);
  for (const filter of BAND_FILTERS)
    for (const [s, l, deltaS, width] of [
      [8.37, 0.65, 3.72, 1.43],
      [5.39, -1.91, 2.58, 2.61],
      [10.27, 1.13, 0.49, 0.71],
    ]) {
      const average = sourceAverage(pieces, s, l, deltaS, width, filter);
      const got = row(whole(ground), { s, l, deltaS, stepL: width, count: 1, filter }).pixels[0];
      if (average[3] < 0.499) assert.equal(got, BG);
      else {
        assert.notEqual(got, BG);
        const expected = unpackRgba(
          rgb555ToRgba(linearToRgb555(average[0] / average[3], average[1] / average[3], average[2] / average[3])),
        );
        const actual = unpackRgba(got);
        for (const channel of ['r', 'g', 'b'])
          assert.ok(
            Math.abs(actual[channel] - expected[channel]) <= 9,
            `${filter} ${channel}: ${actual[channel]} vs ${expected[channel]}`,
          );
      }
    }
});

test('constant-span batching matches one-pixel queries in both scan directions, including transparent edges', () => {
  const ground = compileBandGround(16, [
    piece(0, 16, null, null, RED),
    piece(0, 16, -2, 2, null),
    piece(0, 16, 3, 6, BLUE),
  ]);
  const sources = whole(ground);
  for (const filter of BAND_FILTERS)
    for (const stepL of [0.5, -0.5]) {
      const l = stepL > 0 ? -12 : 12;
      const batch = row(sources, { s: 7.37, deltaS: 3.72, l, stepL, count: 48, filter });
      const separate = Uint32Array.from(
        { length: 48 },
        (_, i) => row(sources, { s: 7.37, deltaS: 3.72, l: l + i * stepL, stepL, count: 1, filter }).pixels[0],
      );
      assert.deepEqual(batch.pixels, separate);
      assert.ok(batch.stats.profileSegments < 48 * (filter === 'TENT' ? 2 : 1));
    }
});

test('authoring expands nested repeats, arrow directions, text runs and alternating curbs in declaration order', () => {
  const elements = [
    { kind: 'curb', start: 0, end: 5, left: -4, right: -3, stripe: 2, colors: [RED, WHITE] },
    {
      kind: 'repeat',
      every: 12,
      count: 2,
      elements: [
        { kind: 'arrow', s: 6, l: 0, width: 3, length: 4, direction: 'forward', color: WHITE },
        { kind: 'text', s: 2, l: 1, text: 'A1', height: 2, color: BLUE },
      ],
    },
    ...['left', 'right'].map((direction, i) => ({
      kind: 'arrow',
      s: 26,
      l: i * 5,
      width: 3,
      length: 4,
      direction,
      color: WHITE,
    })),
  ];
  const pieces = expandCourseBands(elements, 32, '/bands');
  assert.deepEqual(
    pieces.slice(0, 3).map((p) => [p.start, p.end, p.color]),
    [
      [0, 2, RED],
      [2, 4, WHITE],
      [4, 5, RED],
    ],
  );
  assert.ok(pieces.some((p) => p.start === 18 && p.color === WHITE));
  assert.ok(pieces.filter((p) => p.color === BLUE).length > 20);
  assert.doesNotThrow(() => compileBandGround(32, pieces));
  assert.throws(() => expandCourseBands(elements, 20, '/bands'), /outside its Section/);
  const run = {
    kind: 'band',
    color: RED,
    knots: [
      { s: 0, left: 0, right: 1 },
      { s: 1, left: 0, right: 1 },
    ],
  };
  assert.throws(
    () => expandCourseBands([{ kind: 'repeat', count: 65536, every: 1, elements: [run, run] }], 65537, '/bands'),
    /exceed/,
  );
});
