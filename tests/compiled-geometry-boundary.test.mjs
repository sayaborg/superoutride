import assert from 'node:assert/strict';
import test from 'node:test';
import { compileRasterPath, rasterPathToWorld } from '../dist/core/course.js';
import { compileGuidePath, guidePathToWorld, locateWorldOnGuideLocal } from '../dist/core/guide-curve.js';

const vertices = () => [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 10, z: 200 }];
const options = { lMax: 12, mMin: .25, dCam: 5 };

test('Raster rejects nonfinite vertices, radius metadata and overflow before deriving geometry', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const key of ['x', 'z', 'sourceRadius']) {
      for (const index of [0, 1]) {
        const input = vertices().slice(0, 2);
        input[index][key] = value;
        assert.throws(() => compileRasterPath(input), RangeError, `${key} ${index}: ${value}`);
      }
    }
  }
  assert.throws(() => compileRasterPath([{ x: -1e308, z: 0 }, { x: 1e308, z: 0 }]), RangeError);
});

test('Guide validates chart options even when a straight path needs no fillet', () => {
  const path = compileRasterPath(vertices().slice(0, 2));
  for (const key of ['lMax', 'mMin', 'dCam', 'tolerance']) {
    for (const value of [NaN, Infinity, -Infinity, -1]) {
      assert.throws(() => compileGuidePath(path, { ...options, [key]: value }), RangeError, key);
    }
  }
  for (const mMin of [0, 1, 2]) assert.throws(() => compileGuidePath(path, { ...options, mMin }), RangeError);
  assert.throws(() => compileGuidePath(path, { ...options, lMax: 0 }), RangeError);
});

test('compiled Raster and Guide cannot acquire conflicting geometry through nested mutation', () => {
  const authored = vertices();
  const raster = compileRasterPath(authored);
  const guide = compileGuidePath(raster, options);
  const before = guidePathToWorld(guide, 100, 4);
  authored[1].x = 99;
  const objects = [raster.vertices[1], raster.segments[0], raster.vertexMiters[1],
    guide.segments[0], guide.corners[1], guide.corners[1].center];
  for (const object of objects) {
    const key = Object.keys(object).find(key => typeof object[key] === 'number');
    assert.throws(() => { object[key] += 1; }, TypeError);
  }
  assert.deepEqual(guidePathToWorld(guide, 100, 4), before);
  const observed = locateWorldOnGuideLocal(guide, before, before.segmentIndex);
  assert.ok(Math.abs(observed.s - 100) < 1e-8);
  assert.ok(Math.abs(observed.l - 4) < 1e-8);
});

test('nonfinite lateral queries fail at the shared world-coordinate boundary', () => {
  const raster = compileRasterPath(vertices());
  const guide = compileGuidePath(raster, options);
  for (const l of [NaN, Infinity, -Infinity]) {
    assert.throws(() => rasterPathToWorld(raster, 50, l), RangeError);
    assert.throws(() => guidePathToWorld(guide, 50, l), RangeError);
  }
});
