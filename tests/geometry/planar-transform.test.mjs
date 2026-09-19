import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compilePlanarTransform,
  invertPlanarTransform,
  transformPlanarPoint,
  transformPlanarVector,
} from '../../dist/core/planar-transform.js';

test('oriented planar poses determine a rigid transform and inverse without translating vectors', () => {
  const source = { x: 2, z: 3, heading: 0 },
    destination = { x: 10, z: 20, heading: Math.PI / 2 };
  const transform = compilePlanarTransform(source, destination),
    inverse = invertPlanarTransform(transform);
  const close = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 1e-12);
  close(transformPlanarPoint(transform, source), destination);
  close(transformPlanarPoint(transform, { x: 4, z: 8 }), { x: 15, z: 18 });
  close(transformPlanarVector(transform, { x: 2, z: 5 }), { x: 5, z: -2 });
  close(transformPlanarPoint(inverse, { x: 15, z: 18 }), { x: 4, z: 8 });
  for (const v of [
    { x: -8, z: 2 },
    { x: 0, z: 0 },
    { x: 3.4, z: 12.5 },
  ]) {
    const rotated = transformPlanarVector(transform, v);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - Math.hypot(rotated.x, rotated.z)) < 1e-12);
    close(transformPlanarVector(inverse, rotated), v);
  }
  source.x = 999;
  destination.z = 999;
  close(transform.translation, { x: 7, z: 22 });
  assert.ok(Object.isFrozen(transform) && Object.isFrozen(transform.translation));
  assert.ok(Object.isFrozen(inverse) && Object.isFrozen(inverse.translation));
});

test('planar construction distinguishes malformed poses, numeric domains and nonrepresentable translation', () => {
  const pose = { x: 0, z: 0, heading: 0 };
  for (const value of [null, {}, { ...pose, x: '0' }])
    assert.throws(() => compilePlanarTransform(value, pose), TypeError);
  for (const value of [NaN, Infinity, -Infinity])
    assert.throws(() => compilePlanarTransform({ ...pose, heading: value }, pose), RangeError);
  assert.throws(
    () => compilePlanarTransform({ ...pose, x: -Number.MAX_VALUE }, { ...pose, x: Number.MAX_VALUE }),
    RangeError,
  );
  const identity = compilePlanarTransform(pose, pose);
  assert.deepEqual(transformPlanarPoint(identity, { x: 17, z: -3 }), { x: 17, z: -3 });
});
