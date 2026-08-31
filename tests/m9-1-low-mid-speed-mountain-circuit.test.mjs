import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import {
  M7_1_ROAD_HALF_WIDTH_METERS,
} from '../dist/dev/m7-1-highway-calibration-course.js';
import {
  createM91LowMidSpeedMountainCircuitLap,
  createM91LowMidSpeedMountainCircuitRuntime,
} from '../dist/dev/m9-1-low-mid-speed-mountain-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import {
  BIKE1_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  createTestBike,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';

test('M9.1 circuit is predominantly low/mid-speed corners on one explicit closed lap', () => {
  const authored = createM91LowMidSpeedMountainCircuitLap();
  const raster = authored.raster;
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  const finiteCorners = guide.corners.filter((corner) => Number.isFinite(corner.radius));
  const radii = finiteCorners.map((corner) => corner.radius);
  const curvedLength = guide.segments
    .filter((segment) => segment.kind === 'arc')
    .reduce((total, segment) => total + segment.sEnd - segment.sStart, 0);

  assert.ok(raster.length > 6_900 && raster.length < 7_300, `lap length=${raster.length}`);
  assert.ok(radii.some((radius) => radius > 90 && radius < 100), '95 m family missing');
  assert.ok(radii.some((radius) => radius > 130 && radius < 140), '135 m family missing');
  assert.ok(radii.some((radius) => radius > 145 && radius < 160), '150 m hairpin family missing');
  assert.ok(radii.some((radius) => radius > 170 && radius < 190), '180 m family missing');
  assert.ok(radii.some((radius) => radius > 230 && radius < 250), '240 m family missing');
  assert.ok(Math.max(...radii) < 250, `unexpected high-speed radius=${Math.max(...radii)}`);
  assert.ok(curvedLength / raster.length > 0.6, `curved share=${curvedLength / raster.length}`);
  assert.ok(raster.vertexTurns.some((turn) => turn > 1e-9));
  assert.ok(raster.vertexTurns.some((turn) => turn < -1e-9));
  assert.ok(Math.max(...raster.vertexTurns.map(Math.abs)) <= 5.000001 * Math.PI / 180);
});

test('M9.1 mountain height owns stronger repeated smooth elevation changes', () => {
  const live = createM91LowMidSpeedMountainCircuitRuntime();
  const height = live.window.height;
  const lapLength = live.window.topology.lapLength;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumGrade = 0;
  let previousGradeSign = 0;
  let gradeSignChanges = 0;
  for (let s = 0; s <= lapLength; s += 1) {
    const sample = height.samplePhysicsDifferential(s);
    minimumY = Math.min(minimumY, sample.y);
    maximumY = Math.max(maximumY, sample.y);
    maximumGrade = Math.max(maximumGrade, Math.abs(sample.dYdS));
    const gradeSign = Math.abs(sample.dYdS) < 1e-6 ? 0 : Math.sign(sample.dYdS);
    if (gradeSign !== 0 && previousGradeSign !== 0 && gradeSign !== previousGradeSign) {
      gradeSignChanges += 1;
    }
    if (gradeSign !== 0) previousGradeSign = gradeSign;
  }

  assert.ok(maximumY - minimumY > 100, `relief=${maximumY - minimumY}`);
  assert.ok(maximumGrade > 0.15 && maximumGrade < 0.22, `maximum grade=${maximumGrade}`);
  assert.ok(gradeSignChanges >= 8, `grade sign changes=${gradeSignChanges}`);
  assert.equal(height.samplePhysics(0), 0);
  assert.ok(Math.abs(height.samplePhysics(lapLength)) <= 1e-12);
});

for (const [profile, createVehicle] of [
  [FR_VEHICLE_PROFILE, createTestCar],
  [BIKE1_VEHICLE_PROFILE, createTestBike],
]) {
  test(`ordinary rival-controlled ${profile.id} completes the low/mid-speed mountain lap`, () => {
    const live = createM91LowMidSpeedMountainCircuitRuntime();
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
    let maximumAbsoluteL = 0;
    let minimumCornerSpeed = Number.POSITIVE_INFINITY;

    while (vehicle.course.s < lapLength + 25 && ticks < 30_000) {
      const input = sampleRivalDrivingInput(live.window.guide, vehicle, 0);
      updateTestVehicle(
        live.window.guide,
        live.window.height,
        live.window.surface,
        vehicle,
        input,
        SIM_DT,
      );
      maximumAbsoluteL = Math.max(maximumAbsoluteL, Math.abs(vehicle.course.l));
      if (Math.abs(input.steering) > 0.25) {
        minimumCornerSpeed = Math.min(minimumCornerSpeed, vehicle.longitudinalSpeed);
      }
      ticks += 1;
    }

    assert.ok(vehicle.course.s >= lapLength + 25, `${profile.id} stalled at s=${vehicle.course.s}`);
    assert.equal(vehicle.supported, true, `${profile.id} must finish supported`);
    assert.ok(maximumAbsoluteL < M7_1_ROAD_HALF_WIDTH_METERS, `max |l|=${maximumAbsoluteL}`);
    assert.ok(minimumCornerSpeed < 31, `minimum corner speed=${minimumCornerSpeed}`);
  });
}

test('M9.1 mountain remains a historical fixture while current compositions do not select it', async () => {
  const [circuitSource, branchingSource] = await Promise.all([
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m7-2-default-branching-highway.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(circuitSource, /createM91LowMidSpeedMountainCircuitRuntime/);
  assert.match(circuitSource, /createM93TsukubaCourse2000Runtime/);
  assert.doesNotMatch(circuitSource, /createM87VariedElevationCircuitRuntime/);
  assert.match(branchingSource, /createM71HighwayCalibrationLapRaster/);
  assert.doesNotMatch(branchingSource, /m9-1-low-mid-speed-mountain-circuit/);
});
