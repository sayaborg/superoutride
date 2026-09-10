import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { JunctionCrossSectionProfile } from '../dist/course/junction-cross-section.js';

const authoring = {
  sWidenStart: 100,
  sMedianStart: 130,
  sSeparatedStart: 190,
  parentRoadWidth: 9,
  childRoadWidth: 9,
  finalMedianWidth: 12,
  shoulderWidth: 1,
};

function profile() {
  return new JunctionCrossSectionProfile(authoring);
}

function width(interval) {
  return interval.max - interval.min;
}

test('M6.12 junction begins as the existing single 9m road', () => {
  const section = profile().sample(90);
  assert.equal(section.phase, 'SINGLE');
  assert.equal(section.outerHalfWidth, 4.5);
  assert.equal(section.medianHalfWidth, 0);
  assert.equal(section.asphaltBands.length, 1);
  assert.equal(width(section.asphaltBands[0]), 9);
  assert.equal(section.medianBand, null);
  assert.equal(section.childCenterL, null);
});

test('phase A only widens one asphalt surface and does not manufacture a second depth road', () => {
  const section = profile().sample(115);
  assert.equal(section.phase, 'WIDENING');
  assert.equal(section.outerHalfWidth, 6.75);
  assert.equal(section.asphaltBands.length, 1);
  assert.equal(width(section.asphaltBands[0]), 13.5);
  assert.equal(section.medianBand, null);
});

test('median opens continuously only after the full two-child asphalt width exists', () => {
  const before = profile().sample(130 - 1e-8);
  const at = profile().sample(130);
  assert.ok(Math.abs(before.outerHalfWidth - 9) < 1e-8);
  assert.equal(at.outerHalfWidth, 9);
  assert.equal(at.medianHalfWidth, 0);
  assert.equal(at.asphaltBands.length, 1);
  assert.equal(width(at.asphaltBands[0]), 18);
});

test('phase B widens the median while preserving each outgoing road at exactly childRoadWidth', () => {
  const section = profile().sample(160);
  assert.equal(section.phase, 'MEDIAN_GROWTH');
  assert.equal(section.medianHalfWidth, 3);
  assert.equal(section.outerHalfWidth, 12);
  assert.equal(section.asphaltBands.length, 2);
  assert.equal(width(section.asphaltBands[0]), 9);
  assert.equal(width(section.asphaltBands[1]), 9);
  assert.deepEqual(section.medianBand, { min: -3, max: 3 });
  assert.deepEqual(section.childCenterL, { LEFT: -7.5, RIGHT: 7.5 });
});

test('fully separated cross-section has two child roads and a wide center median in one lateral strip', () => {
  const section = profile().sample(190);
  assert.equal(section.phase, 'SEPARATED');
  assert.equal(section.medianHalfWidth, 6);
  assert.equal(section.outerHalfWidth, 15);
  assert.deepEqual(section.asphaltBands, [
    { min: -15, max: -6 },
    { min: 6, max: 15 },
  ]);
  assert.equal(width(section.asphaltBands[0]), 9);
  assert.equal(width(section.asphaltBands[1]), 9);
  assert.deepEqual(section.childCenterL, { LEFT: -10.5, RIGHT: 10.5 });
});

test('junction classification gives median its own lateral region instead of painting it as road', () => {
  const junction = profile();
  assert.equal(junction.classify(160, 0), 'MEDIAN');
  assert.equal(junction.classify(160, -7.5), 'ASPHALT_LEFT');
  assert.equal(junction.classify(160, 7.5), 'ASPHALT_RIGHT');
  assert.equal(junction.classify(160, -12.5), 'SHOULDER');
  assert.equal(junction.classify(160, 20), 'OUTSIDE');
});

test('outer width and median width are monotone through the authored split', () => {
  const junction = profile();
  let previousOuter = -Infinity;
  let previousMedian = -Infinity;
  for (let s = 90; s <= 210; s += 0.5) {
    const section = junction.sample(s);
    assert.ok(section.outerHalfWidth + 1e-12 >= previousOuter);
    assert.ok(section.medianHalfWidth + 1e-12 >= previousMedian);
    previousOuter = section.outerHalfWidth;
    previousMedian = section.medianHalfWidth;
  }
});

test('separated child Guide centers are deterministic offsets in the same parent world frame', () => {
  const junction = profile();
  assert.equal(junction.separatedChildCenterL('LEFT'), -10.5);
  assert.equal(junction.separatedChildCenterL('RIGHT'), 10.5);
});

test('junction authoring rejects narrowing, zero median and reversed phase order', () => {
  assert.throws(() => new JunctionCrossSectionProfile({ ...authoring, childRoadWidth: 4 }), /narrower/);
  assert.throws(() => new JunctionCrossSectionProfile({ ...authoring, finalMedianWidth: 0 }), /finalMedianWidth/);
  assert.throws(() => new JunctionCrossSectionProfile({ ...authoring, sMedianStart: 99 }), /sMedianStart/);
  assert.throws(() => new JunctionCrossSectionProfile({ ...authoring, sSeparatedStart: 120 }), /sSeparatedStart/);
});

test('junction cross-section authority has no renderer or vehicle-physics dependency', () => {
  const source = fs.readFileSync(new URL('../src/course/junction-cross-section.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\.\/render\//);
  assert.doesNotMatch(source, /from ['"]\.\.\/physics\//);
});
