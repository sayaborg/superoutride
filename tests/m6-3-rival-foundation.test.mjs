import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import {
  estimateUpcomingTargetSpeed,
  sampleRivalDrivingInput,
} from '../dist/gameplay/rival-driver.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createDynamicVehicleCourseSprite } from '../dist/world/dynamic-vehicle-sprite.js';

function fakeCar(guide, s, l = 0, speed = 45) {
  const sample = guideCourseToWorld(guide, s, l);
  return {
    x: sample.x,
    y: 0,
    z: sample.z,
    yaw: sample.heading,
    course: {
      s: sample.s,
      l,
      segmentIndex: sample.segmentIndex,
      distanceSquared: 0,
    },
    longitudinalSpeed: speed,
    lateralSpeed: 0,
  };
}

test('M6.3 rival driver emits canonical deterministic DrivingInput without touching world state', () => {
  const guide = createM2StadiumGuide();
  const car = fakeCar(guide, 100, 0, 45);
  const before = structuredClone(car);
  const a = sampleRivalDrivingInput(guide, car);
  const b = sampleRivalDrivingInput(guide, car);

  assert.deepEqual(a, b);
  assert.ok(a.steering >= -1 && a.steering <= 1);
  assert.equal(typeof a.throttle, 'boolean');
  assert.equal(typeof a.brake, 'boolean');
  assert.deepEqual(car, before);
});

test('rival driver steers back toward Guide center from a right-side offset on a straight', () => {
  const guide = createM2StadiumGuide();
  const car = fakeCar(guide, 100, 4, 50);
  const input = sampleRivalDrivingInput(guide, car);
  assert.ok(input.steering < 0);
});

test('rival speed control uses 200+ km/h straight target but brakes for physically tighter upcoming curvature', () => {
  const guide = createM2StadiumGuide();
  const straightTarget = estimateUpcomingTargetSpeed(guide, 450);
  const preCurveTarget = estimateUpcomingTargetSpeed(guide, 120);
  assert.ok(straightTarget >= 55.5);
  assert.ok(preCurveTarget < straightTarget);

  const slowStraight = fakeCar(guide, 450, 0, 40);
  const fastStraight = fakeCar(guide, 450, 0, 70);
  assert.deepEqual(
    { throttle: sampleRivalDrivingInput(guide, slowStraight).throttle, brake: sampleRivalDrivingInput(guide, slowStraight).brake },
    { throttle: true, brake: false },
  );
  assert.deepEqual(
    { throttle: sampleRivalDrivingInput(guide, fastStraight).throttle, brake: sampleRivalDrivingInput(guide, fastStraight).brake },
    { throttle: false, brake: true },
  );

  const tooFastForCurve = fakeCar(guide, 120, 0, 45);
  assert.equal(sampleRivalDrivingInput(guide, tooFastForCurve).brake, true);
});

test('dynamic rival render adapter preserves road-relative physical height in ordinary CourseSprite', () => {
  const guide = createM2StadiumGuide();
  const assets = createM4SpriteAssets();
  const height = createM3DebugHeightProfile(guide.length);
  const car = fakeCar(guide, 123, 2, 50);
  car.y = 1.25;
  const sprite = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw, assets.car, height);

  assert.equal(sprite.name, 'RIVAL');
  assert.equal(sprite.x, car.x);
  assert.equal(
    sprite.y,
    height.sampleRender(car.course.s).y + car.y - height.samplePhysics(car.course.s),
  );
  assert.equal(sprite.z, car.z);
  assert.equal(sprite.sRender, car.course.s);
  assert.equal(sprite.asset.worldWidthMeters, 2.0);
});

test('dynamic rival orientation chooses a discrete existing yaw asset rather than runtime bitmap rotation', () => {
  const guide = createM2StadiumGuide();
  const assets = createM4SpriteAssets();
  const height = createM3DebugHeightProfile(guide.length);
  const car = fakeCar(guide, 123, 0, 50);
  const rear = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw, assets.car, height);
  const side = createDynamicVehicleCourseSprite('RIVAL', car, car.yaw - Math.PI / 2, assets.car, height);

  assert.notEqual(rear.asset.name, side.asset.name);
  assert.match(rear.asset.name, /^CAR_YAW_/);
  assert.match(side.asset.name, /^CAR_YAW_/);
});
