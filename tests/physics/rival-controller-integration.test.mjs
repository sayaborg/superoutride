import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../../dist/browser/frame-loop.js';
import {
  createFiscoRuntime,
  FISCO_RIVAL_START_L,
  FISCO_ROAD_HALF_WIDTH_METERS,
} from '../../dist/dev/courses/fisco-circuit.js';
import { HIGHWAY_ROAD_HALF_WIDTH_METERS } from '../../dist/dev/courses/highway-calibration.js';
import {
  createTsukubaCourse2000Runtime,
  TSUKUBA_RIVAL_START_L,
  TSUKUBA_ROAD_HALF_WIDTH_METERS,
} from '../../dist/dev/courses/tsukuba-circuit.js';
import { createLowMidSpeedMountainCircuitRuntime } from '../../dist/dev/fixtures/mountain-circuit.js';
import { estimateUpcomingTargetSpeed, sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';
import { compileGuidePath } from '../../dist/core/guide-curve.js';
import { compileRasterPath } from '../../dist/core/raster-path.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from '../../dist/vehicle/vehicle-catalog.js';

const profiles = [DEFAULT_VEHICLE_CATALOG_ENTRY.profile];
const courses = [
  {
    name: 'mountain',
    createRuntime: createLowMidSpeedMountainCircuitRuntime,
    roadHalfWidth: HIGHWAY_ROAD_HALF_WIDTH_METERS,
    spawnS: 45,
    spawnL: 0,
    spawnSpeed: 0,
  },
  {
    name: 'Tsukuba',
    createRuntime: createTsukubaCourse2000Runtime,
    roadHalfWidth: TSUKUBA_ROAD_HALF_WIDTH_METERS,
    spawnS: 95,
    spawnL: TSUKUBA_RIVAL_START_L,
    spawnSpeed: 45,
  },
  {
    name: 'FISCO',
    createRuntime: createFiscoRuntime,
    roadHalfWidth: FISCO_ROAD_HALF_WIDTH_METERS,
    spawnS: 95,
    spawnL: FISCO_RIVAL_START_L,
    spawnSpeed: 45,
  },
];

for (const course of courses) {
  for (const profile of profiles) {
    test(`protected product rival drives ${profile.id} around ${course.name} without recovery`, () => {
      const live = course.createRuntime();
      const lapLength = live.window.topology.lapLength;
      const vehicle = createArcadeVehicle(
        profile,
        { guide: live.window.guide, height: live.window.height, surfaces: live.window.surface },
        {
          s: course.spawnS,
          l: course.spawnL,
          initialSpeed: course.spawnSpeed,
          torqueProtection: DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
        },
      );
      let ticks = 0;
      let maximumAbsoluteL = 0;
      let maximumAbsoluteSideslipDegrees = 0;
      let unsupportedTicks = 0;

      while (vehicle.course.s < lapLength + 25 && ticks < 30_000) {
        const input = sampleRivalDrivingInput(live.window.guide, vehicle, 0);
        updateArcadeVehicle(
          { guide: live.window.guide, height: live.window.height, surfaces: live.window.surface },
          vehicle,
          input,
          SIM_DT,
        );
        maximumAbsoluteL = Math.max(maximumAbsoluteL, Math.abs(vehicle.course.l));
        if (Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) >= 5) {
          maximumAbsoluteSideslipDegrees = Math.max(
            maximumAbsoluteSideslipDegrees,
            (Math.abs(Math.atan2(vehicle.lateralSpeed, vehicle.longitudinalSpeed)) * 180) / Math.PI,
          );
        }
        if (!vehicle.supported) unsupportedTicks += 1;
        ticks += 1;
      }

      const diagnostic = JSON.stringify({
        profile: profile.id,
        course: course.name,
        s: vehicle.course.s,
        ticks,
        maximumAbsoluteL,
        maximumAbsoluteSideslipDegrees,
        unsupportedTicks,
      });
      assert.ok(vehicle.course.s >= lapLength + 25, diagnostic);
      assert.ok(maximumAbsoluteL < course.roadHalfWidth, diagnostic);
      assert.ok(maximumAbsoluteSideslipDegrees < 15, diagnostic);
      assert.equal(unsupportedTicks, 0, diagnostic);
      assert.equal(vehicle.supported, true, diagnostic);
    });
  }
}

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
