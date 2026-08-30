import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import {
  M7_1_ROAD_HALF_WIDTH_METERS,
} from '../dist/dev/m7-1-highway-calibration-course.js';
import {
  M8_7_JUMP_CREST_COUNT,
  M8_7_JUMP_DROP_LENGTH_METERS,
  M8_7_JUMP_DROP_METERS,
  createM87VariedElevationCircuitLap,
  createM87VariedElevationCircuitRuntime,
} from '../dist/dev/m8-7-varied-elevation-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import {
  BIKE_VEHICLE_PROFILE,
  CAR_VEHICLE_PROFILE,
  createTestBike,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';

test('M8.7 circuit mixes medium and high-speed corner families throughout one explicit closed lap', () => {
  const authored = createM87VariedElevationCircuitLap();
  const raster = authored.raster;
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  const radii = guide.corners.map((corner) => corner.radius).filter(Number.isFinite);

  assert.ok(raster.length > 12_000 && raster.length < 12_200, `lap length=${raster.length}`);
  assert.ok(radii.some((radius) => radius > 180 && radius < 210), 'tight-medium family missing');
  assert.ok(radii.some((radius) => radius > 300 && radius < 340), 'medium family missing');
  assert.ok(radii.some((radius) => radius > 360 && radius < 400), 'medium end-curve family missing');
  assert.ok(radii.some((radius) => radius > 500 && radius < 540), 'medium-fast family missing');
  assert.ok(radii.some((radius) => radius > 650 && radius < 700), 'high-speed family missing');
  assert.ok(raster.vertexTurns.some((turn) => turn > 1e-9));
  assert.ok(raster.vertexTurns.some((turn) => turn < -1e-9));
  assert.ok(Math.max(...raster.vertexTurns.map(Math.abs)) <= 5.000001 * Math.PI / 180);

  assert.equal(authored.jumpCrestChainages.length, M8_7_JUMP_CREST_COUNT);
  const finiteCorners = guide.corners.filter((corner) => Number.isFinite(corner.radius));
  for (const crest of authored.jumpCrestChainages) {
    const nearestCornerDistance = Math.min(...finiteCorners.map((corner) => Math.abs(corner.sVertex - crest)));
    assert.ok(nearestCornerDistance > 150, `jump crest must remain on a straight; nearest=${nearestCornerDistance}`);
  }
});

test('M8.7 height authoring owns approximately 96 m relief and two explicit physical crests', () => {
  const authored = createM87VariedElevationCircuitLap();
  const live = createM87VariedElevationCircuitRuntime();
  const height = live.window.height;
  const lapLength = live.window.topology.lapLength;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumGrade = 0;
  for (let s = 0; s <= lapLength; s += 1) {
    const sample = height.samplePhysicsDifferential(s);
    minimumY = Math.min(minimumY, sample.y);
    maximumY = Math.max(maximumY, sample.y);
    maximumGrade = Math.max(maximumGrade, Math.abs(sample.dYdS));
  }

  assert.ok(maximumY - minimumY > 95, `relief=${maximumY - minimumY}`);
  assert.ok(maximumGrade > 0.10 && maximumGrade < 0.13, `maximum grade=${maximumGrade}`);
  assert.equal(height.samplePhysics(0), 0);
  assert.ok(Math.abs(height.samplePhysics(lapLength)) <= 1e-12);
  for (const crest of authored.jumpCrestChainages) {
    const crestY = height.sampleRender(crest).y;
    const landingY = height.sampleRender(crest + M8_7_JUMP_DROP_LENGTH_METERS).y;
    assert.ok(Math.abs((crestY - landingY) - M8_7_JUMP_DROP_METERS) <= 1e-9);
  }
});

for (const [profile, createVehicle] of [
  [CAR_VEHICLE_PROFILE, createTestCar],
  [BIKE_VEHICLE_PROFILE, createTestBike],
]) {
  test(`ordinary rival-controlled ${profile.id} completes one lap and naturally clears both crests`, () => {
    const live = createM87VariedElevationCircuitRuntime();
    const lapLength = live.window.topology.lapLength;
    const vehicle = createVehicle(
      live.window.guide,
      live.window.height,
      live.window.surface,
      45,
      0,
      0,
    );
    let ticks = 0;
    let airborneEpisodes = 0;
    let airborneTicks = 0;
    let wasAirborne = false;
    let maximumAbsoluteL = 0;

    while (vehicle.course.s < lapLength + 25 && ticks < 30_000) {
      updateTestVehicle(
        live.window.guide,
        live.window.height,
        live.window.surface,
        vehicle,
        sampleRivalDrivingInput(live.window.guide, vehicle, 0),
        SIM_DT,
      );
      const airborne = !vehicle.supported;
      if (airborne && !wasAirborne) airborneEpisodes += 1;
      if (airborne) airborneTicks += 1;
      wasAirborne = airborne;
      maximumAbsoluteL = Math.max(maximumAbsoluteL, Math.abs(vehicle.course.l));
      ticks += 1;
    }

    assert.ok(vehicle.course.s >= lapLength + 25, `${profile.id} stalled at s=${vehicle.course.s}`);
    assert.equal(airborneEpisodes, M8_7_JUMP_CREST_COUNT);
    assert.ok(airborneTicks > 20 && airborneTicks < 100, `airborne ticks=${airborneTicks}`);
    assert.equal(vehicle.supported, true, `${profile.id} must recontact normally after the second jump`);
    assert.ok(maximumAbsoluteL < M7_1_ROAD_HALF_WIDTH_METERS, `max |l|=${maximumAbsoluteL}`);
  });
}

test('CIRCUIT selects the new authoring at composition while BRANCHING retains its existing parent', async () => {
  const [circuitSource, branchingSource] = await Promise.all([
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m7-2-default-branching-highway.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(circuitSource, /createM87VariedElevationCircuitRuntime/);
  assert.doesNotMatch(circuitSource, /createM71HighwayCalibrationRuntime/);
  assert.match(branchingSource, /createM71HighwayCalibrationLapRaster/);
  assert.doesNotMatch(branchingSource, /m8-7-varied-elevation-circuit/);
});
