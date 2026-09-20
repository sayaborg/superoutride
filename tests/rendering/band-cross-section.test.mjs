import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileCrossSection,
  compileCrossSectionPyramids,
  createBandArea,
  integrateCrossSection,
  resolveBandArea,
} from '../../tools/performance/band-cross-section.mjs';

const piece = (left0, left1, right0, right1, rgb, open = {}) => ({
  left0,
  left1,
  right0,
  right1,
  rgb,
  ...open,
});
const slab = (start, end, pieces) => ({ start, end, pieces });
const sample = (section, left, right) => {
  const out = createBandArea();
  integrateCrossSection(section, left, right, 1, out);
  return { ...out, color: resolveBandArea(out, right - left, 0.5) };
};

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('averaging an oblique Band retains the affine lateral coverage, not a constant interval', () => {
  const section = compileCrossSection([slab(0, 2, [piece(0, 2, 2, 4, [255, 0, 0])])], 0, 2);
  near(sample(section, 0, 1).opaque, 0.25);
  near(sample(section, 1, 2).opaque, 0.75);
  near(sample(section, 0, 4).opaque, 2);
  assert.equal(sample(section, 0, 1).color, null);
  assert.equal(sample(section, 1, 2).color, 31744);
});

test('Section footprint contributions combine before transparency and color are resolved', () => {
  const red = compileCrossSection([slab(0, 1, [piece(0, 0, 2, 2, [255, 0, 0])])], 0, 1);
  const blue = compileCrossSection([slab(0, 1, [piece(10, 10, 12, 12, [0, 0, 255])])], 0, 1);
  const out = createBandArea();
  integrateCrossSection(red, 0, 2, 0.25, out);
  integrateCrossSection(blue, 10, 12, 0.75, out);
  assert.equal(resolveBandArea(out, 2, 0.5), (8 << 10) | 23);
  near(out.opaque, 2);
});

test('transparent Section gaps retain their area in the final denominator', () => {
  const red = compileCrossSection([slab(0, 1, [piece(0, 0, 2, 2, [255, 0, 0])])], 0, 2);
  assert.equal(sample(red, 0, 2).color, null);
  const out = createBandArea();
  integrateCrossSection(red, 0, 2, 1, out);
  integrateCrossSection(red, 0, 2, 0.1, out);
  assert.equal(resolveBandArea(out, 2, 0.5), 31744);
});

test('open sides extend to arbitrary finite pixel bounds without infinite coordinates', () => {
  const section = compileCrossSection(
    [
      slab(0, 1, [
        piece(0, 0, 2, 2, [0, 255, 0], { openLeft: true }),
        piece(2, 2, 0, 0, [0, 0, 255], { openRight: true }),
      ]),
    ],
    0,
    1,
  );
  assert.equal(sample(section, -1000000, -999999).color, 992);
  assert.equal(sample(section, 1000000, 1000001).color, 31);
  assert.ok(section.knots.every(Number.isFinite));
  assert.equal(sample(section, 1, 3).color, (16 << 5) | 16);
});

test('whole-plane and entirely transparent sections require no finite intervals', () => {
  const solid = compileCrossSection(
    [slab(0, 2, [piece(0, 0, 0, 0, [0, 0, 0], { openLeft: true, openRight: true })])],
    0,
    2,
  );
  assert.equal(solid.finiteIntervalCount, 0);
  assert.equal(sample(solid, -5, 7).color, 0);
  const empty = compileCrossSection([], 0, 2);
  assert.equal(empty.intervalCount, 0);
  assert.equal(sample(empty, -5, 7).color, null);
});

test('pyramid uses a shared immutable dictionary and selects coarse levels at equality', () => {
  const source = [slab(0, 12.8, [piece(-1, -1, 1, 1, [255, 255, 255])])];
  const pyramid = compileCrossSectionPyramids(
    [
      { id: 'first', slabs: source, length: 12.8 },
      { id: 'second', slabs: source, length: 12.8 },
    ],
    { minimumWidth: 1.6, maximumFootprint: 6.4 },
  );
  const section = pyramid.sections[0];
  assert.equal(section.levels.length, 3);
  assert.equal(pyramid.dictionary.length, 1);
  assert.deepEqual(pyramid.sections[0].levels, pyramid.sections[1].levels);
  assert.equal(section.selectLevel(1.59), -1);
  assert.equal(section.selectLevel(1.6), 0);
  assert.equal(section.selectLevel(3.2), 1);
  assert.equal(section.selectLevel(6.4), 2);
  assert.ok(Object.isFrozen(pyramid.dictionary[0].knots));
  assert.ok(pyramid.dictionary[0].values.every(Object.isFrozen));
});

test('a final partial bucket is normalized by its actual length, not padded with transparency', () => {
  const source = [slab(0, 3, [piece(0, 0, 1, 1, [255, 255, 255])])];
  const pyramid = compileCrossSectionPyramids([{ id: 'test', slabs: source, length: 3 }], {
    minimumWidth: 1.6,
    maximumFootprint: 1.6,
  });
  const last = pyramid.dictionary[pyramid.sections[0].levels[0].indices[1]];
  assert.equal(sample(last, 0, 1).color, 32767);
});

test('exact averaging alone does not bound the interval count of a moving alternating Band', () => {
  const slabs = Array.from({ length: 64 }, (_, i) =>
    slab(i, i + 1, [piece(i / 8, (i + 1) / 8, i / 8 + 0.2, (i + 1) / 8 + 0.2, i % 2 ? [255, 0, 0] : [0, 0, 255])]),
  );
  const section = compileCrossSection(slabs, 0, 64);
  assert.ok(section.intervalCount > 32);
  near(sample(section, -1, 10).opaque, 0.2);
});

test('finite sloping Bands have exactly empty tails, even at distant lateral coordinates', () => {
  const section = compileCrossSection([slab(0, 7, [piece(0, 1 / 3, 2, 7 / 3, [97, 156, 255])])], 0, 7);
  assert.equal(sample(section, 1000000, 1000001).opaque, 0);
  assert.equal(sample(section, -1000001, -1000000).opaque, 0);
});

test('caller-owned accumulators are additive and are never replaced by sampling', () => {
  const section = compileCrossSection([slab(0, 1, [piece(0, 0, 2, 2, [255, 0, 0])])], 0, 1);
  const out = createBandArea();
  assert.equal(integrateCrossSection(section, 0, 1, 1, out), out);
  assert.equal(integrateCrossSection(section, 1, 2, 1, out), out);
  assert.equal(out.opaque, 2);
  assert.equal(out.red, 510);
});
