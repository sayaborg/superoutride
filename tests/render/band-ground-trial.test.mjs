import assert from 'node:assert/strict';
import test from 'node:test';
import { compileBandTrial, createBandTrialRaster } from '../../tools/performance/band-ground-prototype.mjs';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';

const boundary = (start, end) => ({
  knots: [
    { anchor: { s: 0 }, l: start },
    { anchor: { s: 1 }, l: end },
  ],
});
const band = (left0, left1, right0, right1, color) => ({
  start: 0,
  end: 1,
  left: boundary(left0, left1),
  right: boundary(right0, right1),
  color,
});
function draw(bands, threshold = 0.5) {
  const target = new Uint32Array([123]);
  createBandTrialRaster(compileBandTrial(bands), 1, threshold).sampleSpan(target, 0, 1, 0.5, 0.5, 1, 1);
  return target[0];
}

test('a sloping half-pixel mixes exact joint source area, including later paint occlusion', () => {
  const red = 31 << 10,
    blue = 31;
  assert.equal(draw([band(0, 0, 1, 1, blue), band(0, 0, 0, 1, red)]), rgb555ToRgba((16 << 10) | 16));
  assert.equal(draw([band(0, 0, 0, 1, red), band(0, 0, 1, 1, blue)]), rgb555ToRgba(blue));
});

test('transparent coverage leaves the background at equality and normalizes only opaque area below it', () => {
  const red = 31 << 10;
  assert.equal(draw([band(0, 0, 1, 1, red), band(0, 0, 0, 1, null)]), 123);
  assert.equal(draw([band(0, 0, 1, 1, red), band(0, 0, 0, 0.5, null)]), rgb555ToRgba(red));
  assert.equal(draw([]), 123);
});

test('two crossing boundaries split their visibility before integration', () => {
  const red = 31 << 10,
    blue = 31;
  assert.equal(
    draw([band(0, 0, 1, 1, 32767), band(0, 0, 0, 1, red), band(0, 0, 1, 0, blue)]),
    rgb555ToRgba((16 << 10) | (8 << 5) | 23),
  );
});

test('inactive-at-centre paint inside the footprint contributes exact longitudinal area', () => {
  const red = band(0, 0, 1, 1, 31 << 10);
  red.start = 0.75;
  assert.equal(draw([band(0, 0, 1, 1, 31), red]), rgb555ToRgba((8 << 10) | 23));
});
