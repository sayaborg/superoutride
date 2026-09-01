import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { M7_1_ROAD_HALF_WIDTH_METERS } from '../dist/dev/m7-1-highway-calibration-course.js';
import {
  createM91LowMidSpeedMountainCircuitRuntime,
} from '../dist/dev/m9-1-low-mid-speed-mountain-circuit.js';
import {
  M9_3_TSUKUBA_RIVAL_START_L,
  M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
  createM93TsukubaCourse2000Runtime,
} from '../dist/dev/m9-3-tsukuba-circuit.js';
import {
  M9_6_FISCO_RIVAL_START_L,
  M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
  createM96FiscoRuntime,
} from '../dist/dev/m9-6-fisco-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import {
  createArcadeVehicle,
  updateArcadeVehicle,
} from '../dist/physics/arcade-vehicle-physics.js';
import {
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
} from '../dist/physics/vehicle-profiles.js';

const profiles = [FR_VEHICLE_PROFILE, BIKE1_VEHICLE_PROFILE, BIKE2_VEHICLE_PROFILE];
const courses = [
  {
    name: 'mountain',
    createRuntime: createM91LowMidSpeedMountainCircuitRuntime,
    roadHalfWidth: M7_1_ROAD_HALF_WIDTH_METERS,
    spawnS: 45,
    spawnL: 0,
    spawnSpeed: 0,
  },
  {
    name: 'Tsukuba',
    createRuntime: createM93TsukubaCourse2000Runtime,
    roadHalfWidth: M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
    spawnS: 95,
    spawnL: M9_3_TSUKUBA_RIVAL_START_L,
    spawnSpeed: 45,
  },
  {
    name: 'FISCO',
    createRuntime: createM96FiscoRuntime,
    roadHalfWidth: M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
    spawnS: 95,
    spawnL: M9_6_FISCO_RIVAL_START_L,
    spawnSpeed: 45,
  },
];

for (const course of courses) {
  for (const profile of profiles) {
    test(`M9.7 general rival drives ${profile.id} around ${course.name} without recovery`, () => {
      const live = course.createRuntime();
      const lapLength = live.window.topology.lapLength;
      const vehicle = createArcadeVehicle(
        profile,
        live.window.guide,
        live.window.height,
        live.window.surface,
        course.spawnS,
        course.spawnL,
        course.spawnSpeed,
      );
      let ticks = 0;
      let maximumAbsoluteL = 0;
      let maximumAbsoluteSideslipDegrees = 0;
      let unsupportedTicks = 0;

      while (vehicle.course.s < lapLength + 25 && ticks < 30_000) {
        const input = sampleRivalDrivingInput(live.window.guide, vehicle, 0);
        updateArcadeVehicle(
          live.window.guide,
          live.window.height,
          live.window.surface,
          vehicle,
          input,
          SIM_DT,
        );
        maximumAbsoluteL = Math.max(maximumAbsoluteL, Math.abs(vehicle.course.l));
        if (Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) >= 5) {
          maximumAbsoluteSideslipDegrees = Math.max(
            maximumAbsoluteSideslipDegrees,
            Math.abs(Math.atan2(vehicle.lateralSpeed, vehicle.longitudinalSpeed)) * 180 / Math.PI,
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

test('M9.7 rival remains one general canonical-input publisher', async () => {
  const source = await readFile(new URL('../src/gameplay/rival-driver.ts', import.meta.url), 'utf8');
  assert.match(source, /MAX_STEERING_REQUEST = 0\.72/);
  assert.match(source, /Math\.hypot\(car\.longitudinalSpeed, car\.lateralSpeed\)/);
  assert.match(source, /curveSpeed \* curveSpeed \+ 2 \* BRAKING_DECELERATION_TARGET_MPS2 \* distance/);
  assert.doesNotMatch(source, /car\.yawRate|profile\.id|routeKind|TSUKUBA|FISCO|BIKE|\bCAR\b/);
});
