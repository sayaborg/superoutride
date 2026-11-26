import assert from 'node:assert/strict';
import test from 'node:test';
import { wrapAngle } from '../../src/core/math.js';
import { routeCamera } from '../../src/view/route-camera.js';
import { createDynamicVehicleCourseSprite } from '../../src/view/dynamic-vehicle-sprite.js';
import { selectVehicleSprite } from '../../src/vehicle/vehicle-sprite-set.js';

// A straight level road along +z: lateral l lies to the right of travel (+x), at heading 0.
const road = Object.freeze({
  coordinates: Object.freeze({
    toWorld(s, l, out = {}) {
      return Object.assign(out, { x: l, z: s, s, l, heading: 0 });
    },
    forwardEnd: (start, end) => end,
  }),
  height: Object.freeze({ sample: () => 0 }),
});
// A set of 64 yaw images, each one picture named by its index.
const set = Object.freeze({
  yawVariants: 64,
  bankVariants: 1,
  bankDegrees: null,
  assets: Object.freeze(Array.from({ length: 64 }, (_, i) => Object.freeze([Object.freeze({ name: String(i) })]))),
});
const definition = { focalLength: 240, centerX: 160, horizonRow: 120 };

/** The yaw image a vehicle at (`s`, `l`) heading `yaw` shows `camera`, and the one its true direction from it chooses. */
const images = (camera, s, l, yaw) => {
  const base = { x: l, y: 0, z: s, s };
  const vehicle = { x: l, y: 0, z: s, yaw, pitch: 0, lateralAcceleration: 0 };
  const shown = createDynamicVehicleCourseSprite('V', vehicle, base, { y: 0 }, camera, set).yawIndex;
  // The body's yaw less the direction from the camera to its base point, in true perspective.
  const truth = selectVehicleSprite(set, wrapAngle(yaw - Math.atan2(base.x - camera.x, base.z - camera.z))).yawIndex;
  return { shown, truth };
};

test('a camera looking back shows a vehicle beside the road from the side it truly sees, right as left', () => {
  // The camera stands at 100 m looking back; vehicles come toward it 20 m away, one each side of the road's middle.
  const back = routeCamera(road, { s: 100, l: 0, height: 1.5, aim: 0, back: true }, definition);
  const ahead = routeCamera(road, { s: 60, l: 0, height: 1.5, aim: 0 }, definition);
  const right = images(back, 80, 4, 0),
    left = images(back, 80, -4, 0);
  assert.equal(right.shown, right.truth);
  assert.equal(left.shown, left.truth);
  // Each turns away from the other: off to one side, it shows that side's flank, not its front alone.
  assert.notEqual(right.shown, left.shown);
  assert.equal((right.shown + left.shown) % 64, 0);
  // A camera looking ahead at the same vehicles, from behind, holds the same rule.
  for (const l of [4, -4]) {
    const seen = images(ahead, 80, l, 0);
    assert.equal(seen.shown, seen.truth);
  }
});
