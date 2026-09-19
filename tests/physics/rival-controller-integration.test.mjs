import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateUpcomingTargetSpeed, sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { compileGuidePath } from '../../dist/core/guide-curve.js';
import { compileRasterPath } from '../../dist/core/raster-path.js';

test('rival input has bounded steering, observes total speed, and needs no vehicle or route identity', () => {
  const guide = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 1000 },
    ]),
    { lMax: 12, mMin: 0.25 },
  );
  const read = (values) => {
    const vehicle = Object.freeze({
      x: 0,
      z: 100,
      yaw: 0,
      course: Object.freeze({ s: 100, l: 0 }),
      longitudinalSpeed: 40,
      lateralSpeed: 0,
      ...values,
    });
    return sampleRivalDrivingInput(
      guide,
      new Proxy(vehicle, {
        get(target, key) {
          assert.ok(Object.hasOwn(target, key), `unexpected vehicle read: ${String(key)}`);
          return target[key];
        },
      }),
    );
  };
  assert.equal(read({ x: 100 }).steering, -0.72);
  assert.equal(read({ x: -100 }).steering, 0.72);
  assert.equal(read({ x: 100, longitudinalSpeed: -1 }).steering, 0);
  assert.equal(read({}).throttle, true);
  assert.equal(read({ lateralSpeed: 40 }).brake, true, '40/40 m/s sideslip is faster than the 56 m/s cruise target');
});

test('future curvature retains the ordinary distance-dependent braking envelope', () => {
  const reader = {
    domain: { start: 0, end: 1000 },
    toWorld(s, l) {
      const heading = Math.max(0, Math.min(1, (s - 250) / 10));
      return { s, l, heading, x: 0, z: s, segmentIndex: 0 };
    },
  };
  for (const s of [100, 150, 190])
    assert.equal(estimateUpcomingTargetSpeed(reader, s), Math.sqrt(12 ** 2 + 2 * 4 * (250 - s)));
});
