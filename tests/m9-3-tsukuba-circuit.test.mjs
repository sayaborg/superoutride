import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import {
  M9_3_TSUKUBA_BACK_STRAIGHT_LENGTH_METERS,
  M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS,
  M9_3_TSUKUBA_HOME_STRAIGHT_LENGTH_METERS,
  M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS,
  createM93TsukubaCourse2000Lap,
  createM93TsukubaCourse2000Runtime,
  createM93TsukubaGroundProfile,
} from '../dist/dev/m9-3-tsukuba-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';
import {
  HONDA_VFR750R_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  createTestBike,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';

function segmentsCross(a, b, c, d) {
  const orientation = (p, q, r) => (
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  );
  return orientation(a, b, c) * orientation(a, b, d) < -1e-8
    && orientation(c, d, a) * orientation(c, d, b) < -1e-8;
}

test('M9.3 authors the four-wheel Tsukuba Course 2000 sequence as one exact closed lap', () => {
  const authored = createM93TsukubaCourse2000Lap();
  const { raster, landmarks } = authored;
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  const radiusFamilies = new Set(guide.corners
    .filter((corner) => Number.isFinite(corner.radius))
    .map((corner) => Math.round(corner.radius)));

  assert.equal(raster.length, M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS);
  assert.equal(M9_3_TSUKUBA_COURSE_2000_LENGTH_METERS, 2_045);
  assert.equal(landmarks.homeStraightEndS, M9_3_TSUKUBA_HOME_STRAIGHT_LENGTH_METERS);
  assert.ok(Math.abs(
    landmarks.backStraightEndS
      - landmarks.backStraightStartS
      - M9_3_TSUKUBA_BACK_STRAIGHT_LENGTH_METERS,
  ) < 1e-9);
  assert.equal(M9_3_TSUKUBA_HOME_STRAIGHT_LENGTH_METERS, 282);
  assert.equal(M9_3_TSUKUBA_BACK_STRAIGHT_LENGTH_METERS, 437);
  assert.deepEqual(raster.vertices[0], raster.vertices.at(-1));
  assert.ok(raster.vertexTurns.some((turn) => turn > 1e-9), 'right turns missing');
  assert.ok(raster.vertexTurns.some((turn) => turn < -1e-9), 'left turns missing');
  assert.ok(Math.max(...raster.vertexTurns.map(Math.abs)) <= 5.000001 * Math.PI / 180);
  for (let first = 0; first < raster.vertices.length - 1; first += 1) {
    for (let second = first + 2; second < raster.vertices.length - 1; second += 1) {
      if (first === 0 && second === raster.vertices.length - 2) continue;
      assert.equal(
        segmentsCross(
          raster.vertices[first],
          raster.vertices[first + 1],
          raster.vertices[second],
          raster.vertices[second + 1],
        ),
        false,
        `Raster segments ${first} and ${second} cross`,
      );
    }
  }

  for (const publishedRadius of [25, 35, 55, 75, 80, 90, 100, 105, 170]) {
    assert.ok(radiusFamilies.has(publishedRadius), `${publishedRadius}R family missing`);
  }

  assert.ok(landmarks.homeStraightEndS < landmarks.turnOneEndS);
  assert.ok(landmarks.turnOneEndS < landmarks.sCurveEndS);
  assert.ok(landmarks.sCurveEndS < landmarks.firstHairpinEndS);
  assert.ok(landmarks.firstHairpinEndS < landmarks.dunlopEndS);
  assert.ok(landmarks.dunlopEndS < landmarks.oneSeventyREndS);
  assert.ok(landmarks.oneSeventyREndS < landmarks.secondHairpinEndS);
  assert.equal(landmarks.secondHairpinEndS, landmarks.backStraightStartS);
});

test('M9.3 Tsukuba keeps the official near-flat character and a circuit cross-section', () => {
  const live = createM93TsukubaCourse2000Runtime();
  const lapLength = live.window.topology.lapLength;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumGrade = 0;
  for (let s = 0; s <= lapLength; s += 1) {
    const sample = live.window.height.samplePhysicsDifferential(s);
    minimumY = Math.min(minimumY, sample.y);
    maximumY = Math.max(maximumY, sample.y);
    maximumGrade = Math.max(maximumGrade, Math.abs(sample.dYdS));
  }

  assert.ok(maximumY - minimumY > 2 && maximumY - minimumY < 3, `relief=${maximumY - minimumY}`);
  assert.ok(maximumGrade < 0.013, `maximum grade=${maximumGrade}`);
  assert.equal(live.window.height.samplePhysics(0), 0);
  assert.ok(Math.abs(live.window.height.samplePhysics(lapLength)) <= 1e-12);

  assert.equal(M9_3_TSUKUBA_ROAD_HALF_WIDTH_METERS, 6);
  assert.equal(live.window.surface.sample(100, 0).type, 'ASPHALT');
  assert.equal(live.window.surface.sample(100, 6.5).type, 'SHOULDER');
  assert.equal(live.window.surface.sample(100, 9).type, 'GRASS');
  const ground = createM93TsukubaGroundProfile();
  assert.notEqual(sampleGroundMap(100, 0, ground), GROUND_COLORS.marking, 'track must have no center line');
  assert.equal(sampleGroundMap(100, 5.85, ground), GROUND_COLORS.marking, 'right edge line missing');
});

test('M9.3 Tsukuba remains an ordinary finite open runtime for a three-lap race', () => {
  const live = createM93TsukubaCourse2000Runtime();
  assert.equal(live.window.topology.lapLength, 2_045);
  assert.equal(live.raceRules.lapCount, 3);
  assert.equal(live.window.repeatCount, 4);
  assert.equal(live.window.length, 2_045 * 4);
  assert.ok(Math.abs(live.window.raster.length - 2_045 * 4) < 1e-7);
  assert.deepEqual(
    live.raceRules.gates.slice(0, 3).map((gate) => [gate.kind, gate.s]),
    [['checkpoint', 511.25], ['checkpoint', 1_022.5], ['checkpoint', 1_533.75]],
  );
});

for (const [profile, createVehicle] of [
  [FERRARI_TESTAROSSA_VEHICLE_PROFILE, createTestCar],
  [HONDA_VFR750R_VEHICLE_PROFILE, createTestBike],
]) {
  test(`ordinary ${profile.id} mechanics advance on the Tsukuba home straight`, () => {
    const live = createM93TsukubaCourse2000Runtime();
    const vehicle = createVehicle(
      live.window.guide,
      live.window.height,
      live.window.surface,
      45,
      0,
      15,
    );
    for (let tick = 0; tick < 180; tick += 1) {
      const input = sampleRivalDrivingInput(live.window.guide, vehicle, 0);
      updateTestVehicle(
        live.window.guide,
        live.window.height,
        live.window.surface,
        vehicle,
        input,
        SIM_DT,
      );
    }

    assert.ok(vehicle.course.s > 100 && vehicle.course.s < 282, `s=${vehicle.course.s}`);
    assert.ok(Math.abs(vehicle.course.l) < 0.01, `l=${vehicle.course.l}`);
    assert.equal(vehicle.supported, true);
  });
}

test('course 3 retains Tsukuba while BRANCHING retains its existing parent', async () => {
  const [circuitSource, branchingSource] = await Promise.all([
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/dev/m7-2-default-branching-highway.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(circuitSource, /createM93TsukubaCourse2000Runtime/);
  assert.doesNotMatch(circuitSource, /createM91LowMidSpeedMountainCircuitRuntime/);
  assert.match(branchingSource, /createM71HighwayCalibrationLapRaster/);
  assert.doesNotMatch(branchingSource, /m9-3-tsukuba-circuit/);
  assert.doesNotMatch(branchingSource, /m9-6-fisco-circuit/);
});
