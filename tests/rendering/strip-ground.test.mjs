import assert from 'node:assert/strict';
import test from 'node:test';
import { STRIP_ACTIVE_LIMIT, compileStripGround } from '../../dist/course/strip-ground.js';
import { STRIP_RENDER_METHODS } from '../../dist/view/display-settings.js';
import { createStripGroundSampler, createStripRenderMetrics } from '../../dist/view/strip-ground-sampler.js';
import { linearToRgb555, rgb555LinearChannel } from '../../dist/image/image-filter.js';
import { selectSpriteLevel } from '../../dist/image/sprite.js';

// Bit 15 is never set in an RGB555 pixel, so it marks pixels the ground leaves unchanged.
const BG = 0x8000,
  WHITE = 32767,
  RED = 31 << 10,
  BLUE = 31;
const piece = (start, end, left, right, color, leftEnd = left, rightEnd = right) => ({
  start,
  end,
  left: left === null ? null : { start, end, from: left, to: leftEnd },
  right: right === null ? null : { start, end, from: right, to: rightEnd },
  value: color,
});
// The RGB555 of the linear mean of opaque colors.
const mean = (colors) =>
  linearToRgb555(
    ...[10, 5, 0].map(
      (shift) => colors.reduce((sum, c) => sum + rgb555LinearChannel((c >>> shift) & 31), 0) / colors.length,
    ),
  );
const whole = (ground) => [{ ground, start: 0, end: ground.length, lateralOrigin: 0 }];
function row(intervals, { s = 4, l = -4, stepL = 0.25, deltaS = 0, count = 32, method = 'LEVEL-POINT' } = {}) {
  const pixels = new Uint16Array(count).fill(BG);
  createStripGroundSampler(intervals).sampleSpan(
    pixels,
    0,
    count,
    s,
    l,
    stepL,
    deltaS,
    method,
    createStripRenderMetrics(),
  );
  return pixels;
}

test('ordered Strips preserve transparency, black, half-open edges, open sides and immutable publication', () => {
  const pieces = [
    piece(0, 16, null, null, RED),
    piece(8, 12, -4, 4, WHITE),
    piece(0, 16, -2, 2, BLUE),
    piece(7, 13, 0, 1, null),
    piece(0, 16, 1, 2, 0),
  ];
  const ground = compileStripGround(16, pieces);
  const options = { s: 9, l: -3, stepL: 1, count: 8, method: 'POINT-POINT' };
  const expected = [WHITE, BLUE, BLUE, null, 0, WHITE, WHITE, RED].map((c) => (c === null ? BG : c));
  assert.deepEqual(Array.from(row(whole(ground), options)), expected);
  pieces[0].value = BLUE;
  assert.deepEqual(Array.from(row(whole(ground), options)), expected);
  assert.throws(() => {
    ground.slabs[0].spans[0].value = 0;
  }, TypeError);
  assert.deepEqual(Array.from(row(whole(ground), { ...options, l: -1e6, stepL: 2e6, count: 2 })), [RED, RED]);
  const active = Array.from({ length: STRIP_ACTIVE_LIMIT }, () => piece(0, 2, null, null, RED));
  assert.equal(compileStripGround(2, active).metrics.maxActiveStrips, STRIP_ACTIVE_LIMIT);
});

test('POINT always reads s; LEVEL shares sprite octave selection and reads instantaneous Strips below one metre', () => {
  const ground = compileStripGround(
    16,
    Array.from({ length: 16 }, (_, i) => piece(i, i + 1, null, null, [RED, BLUE, WHITE][i % 3])),
  );
  const sprite = { width: 1, worldWidthMeters: 1, levels: new Array(5) };
  for (const deltaS of [0.5, 1, Math.SQRT2 * (1 - 1e-10), Math.SQRT2, 2, 2 * Math.SQRT2, 4 * Math.SQRT2, 64])
    for (const s of [0.2, 4.6, 12.25]) {
      const direct = row(whole(ground), { s, deltaS, method: 'POINT-POINT' });
      assert.ok(direct.every((p) => p === [RED, BLUE, WHITE][Math.floor(s) % 3]));
      const level = row(whole(ground), { s, deltaS, method: 'LEVEL-POINT' });
      const step = 2 ** selectSpriteLevel(sprite, 1 / deltaS),
        first = Math.floor(s / step) * step;
      const cell = Array.from(
        { length: Math.min(16, first + step) - first },
        (_, i) => [RED, BLUE, WHITE][(first + i) % 3],
      );
      assert.ok(level.every((p) => p === (deltaS < 1 ? direct[0] : mean(cell))));
    }
  const moving = compileStripGround(6.5, [piece(0, 6.5, null, null, RED), piece(0.5, 6.5, -3, 1, BLUE, 3, 7)]);
  for (const s of [0.6, 4.2, 6.25, 6.5]) {
    const direct = row(whole(moving), { s, method: 'POINT-POINT' });
    assert.deepEqual(row(whole(moving), { s, deltaS: 0.99, method: 'LEVEL-POINT' }), direct);
    // The truncated last 4 m cell [4, 6.5) averages over its 2.5 m: BLUE covers l = 2 for s <= 5.5.
    if (s >= 6.25)
      assert.equal(
        row(whole(moving), { s, deltaS: 4, method: 'LEVEL-POINT', l: 2, stepL: 0, count: 1 })[0],
        linearToRgb555(0.4, 0, 0.6),
      );
  }
  assert.deepEqual(
    row(whole(moving), { s: 4.2, deltaS: 4, method: 'LEVEL-POINT' }),
    row(whole(moving), { s: 6.25, deltaS: 4, method: 'LEVEL-POINT' }),
  );
});

test('LEVEL methods threshold s-averaged coverage at half, read a lateral point and only the occurrence owning s', () => {
  // Over the 4 m cell [4, 8) the edge moves from 4 to 8, so coverage at l = 6 is exactly one half.
  const diagonal = compileStripGround(16, [piece(0, 16, 0, null, WHITE, 16, null)]);
  for (const method of ['LEVEL-POINT', 'LEVEL2-POINT']) {
    assert.equal(row(whole(diagonal), { s: 6, l: 6, stepL: 1, deltaS: 4, count: 1, method })[0], WHITE);
    assert.equal(row(whole(diagonal), { s: 6, l: 6 - 1e-6, stepL: 1, deltaS: 4, count: 1, method })[0], BG);
  }
  const split = compileStripGround(8, [piece(0, 8, null, 0, RED), piece(0, 8, 0, null, BLUE)]);
  for (const method of STRIP_RENDER_METHODS)
    assert.equal(row(whole(split), { s: 4, l: 0, stepL: 2, deltaS: 4, count: 1, method })[0], BLUE);
  const red = compileStripGround(8, [piece(0, 8, null, null, RED)]);
  const blue = compileStripGround(8, [piece(0, 8, null, null, BLUE)]);
  const intervals = [
    { ground: red, start: 0, end: 8, lateralOrigin: 100 },
    { ground: blue, start: 8, end: 16, lateralOrigin: -20 },
  ];
  assert.ok(row(intervals, { s: 8, deltaS: 6, method: 'POINT-POINT' }).every((p) => p === BLUE));
  for (const method of ['LEVEL-POINT', 'LEVEL2-POINT'])
    assert.deepEqual(row(intervals, { s: 8, deltaS: 6, method }), row(whole(blue), { s: 0, deltaS: 6, method }));
});

test('row batching and lateral rebasing match individual pixels in either scan direction for all three methods', () => {
  const ground = compileStripGround(16, [
    piece(0, 16, null, null, RED),
    piece(0, 16, -2, 2, null),
    piece(0, 16, 3, 6, BLUE, -5, -2),
  ]);
  for (const method of STRIP_RENDER_METHODS)
    for (const stepL of [0.5, -0.5]) {
      const l = stepL > 0 ? -12 : 12;
      const args = { s: 7.37, deltaS: 3.72, l, stepL, count: 48, method };
      const batch = row(whole(ground), args);
      assert.deepEqual(
        batch,
        Uint16Array.from({ length: 48 }, (_, i) => row(whole(ground), { ...args, l: l + i * stepL, count: 1 })[0]),
      );
      assert.deepEqual(
        batch,
        row([{ ...whole(ground)[0], lateralOrigin: 11.75, start: 100, end: 100 + ground.length }], {
          ...args,
          s: 107.37,
          l: l - 11.75,
        }),
      );
    }
});

test('interleaved cached and instantaneous rows do not inherit lateral slopes', () => {
  let seed = 1;
  const random = () => (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32;
  const pieces = [piece(0, 128, null, null, RED)];
  for (let k = 0; k < 12; k++) {
    const left = -25 + random() * 50,
      right = left + 1 + random() * 12,
      leftEnd = -25 + random() * 50,
      rightEnd = leftEnd + 1 + random() * 12;
    pieces.push(piece(0, 128, left, right, k % 5 === 0 ? null : Math.floor(random() * 32768), leftEnd, rightEnd));
  }
  const intervals = whole(compileStripGround(128, pieces));
  const sampler = createStripGroundSampler(intervals);
  const draw = (reader, s, deltaS, method) => {
    const pixels = new Uint16Array(320);
    reader.sampleSpan(pixels, 0, 320, s, -40, 0.25, deltaS, method, createStripRenderMetrics());
    return pixels;
  };
  draw(sampler, 4, 20, 'LEVEL-POINT');
  assert.deepEqual(
    draw(sampler, 5, 0.3, 'POINT-POINT'),
    draw(createStripGroundSampler(intervals), 5, 0.3, 'POINT-POINT'),
  );
});
