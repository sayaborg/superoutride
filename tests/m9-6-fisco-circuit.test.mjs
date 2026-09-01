import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import {
  M9_6_FISCO_CORNER_COUNT,
  M9_6_FISCO_HOME_STRAIGHT_LENGTH_METERS,
  M9_6_FISCO_LENGTH_METERS,
  M9_6_FISCO_ROAD_HALF_WIDTH_METERS,
  createM96FiscoGroundProfile,
  createM96FiscoLap,
  createM96FiscoRuntime,
} from '../dist/dev/m9-6-fisco-circuit.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';
import {
  BIKE1_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
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

test('M9.6 authors current FISCO as one exact clockwise 4563 m closed lap', () => {
  const { raster, landmarks } = createM96FiscoLap();
  const guide = compileGuidePath(raster, { lMax: 17, mMin: 0.25, dCam: 5 });
  const radiusFamilies = new Set(guide.corners
    .filter((corner) => Number.isFinite(corner.radius))
    .map((corner) => Math.round(corner.radius)));

  assert.ok(Math.abs(raster.length - M9_6_FISCO_LENGTH_METERS) < 1e-7);
  assert.equal(M9_6_FISCO_LENGTH_METERS, 4_563);
  assert.ok(Math.abs(
    landmarks.homeStraightEndS - M9_6_FISCO_HOME_STRAIGHT_LENGTH_METERS
  ) < 1e-9);
  assert.equal(M9_6_FISCO_HOME_STRAIGHT_LENGTH_METERS, 1_475);
  assert.equal(M9_6_FISCO_CORNER_COUNT, 17);
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

  for (const publishedRadius of [75, 80, 100, 300]) {
    assert.ok(radiusFamilies.has(publishedRadius), `${publishedRadius}R family missing`);
  }
  assert.ok(landmarks.homeStraightEndS < landmarks.tgrCornerEndS);
  assert.ok(landmarks.tgrCornerEndS < landmarks.cocaColaCornerEndS);
  assert.ok(landmarks.cocaColaCornerEndS < landmarks.hundredREndS);
  assert.ok(landmarks.hundredREndS < landmarks.advanCornerEndS);
  assert.ok(landmarks.advanCornerEndS < landmarks.threeHundredREndS);
  assert.ok(landmarks.threeHundredREndS < landmarks.dunlopComplexEndS);
  assert.ok(landmarks.dunlopComplexEndS < landmarks.panasonicCornerEndS);
});

test('M9.6 FISCO preserves the published elevation envelope and circuit cross-section', () => {
  const live = createM96FiscoRuntime();
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

  assert.ok(Math.abs(maximumY - minimumY - 40) < 0.001, `relief=${maximumY - minimumY}`);
  assert.ok(maximumGrade > 0.0888 && maximumGrade <= 0.1005, `maximum grade=${maximumGrade}`);
  assert.equal(live.window.height.samplePhysics(0), 40);
  assert.ok(Math.abs(live.window.height.samplePhysics(lapLength) - 40) < 1e-9);

  assert.equal(M9_6_FISCO_ROAD_HALF_WIDTH_METERS, 9);
  assert.equal(live.window.surface.sample(100, 0).type, 'ASPHALT');
  assert.equal(live.window.surface.sample(100, 10).type, 'SHOULDER');
  assert.equal(live.window.surface.sample(100, 13).type, 'GRASS');
  const ground = createM96FiscoGroundProfile();
  assert.notEqual(sampleGroundMap(100, 0, ground), GROUND_COLORS.marking, 'track must have no center line');
  assert.equal(sampleGroundMap(100, 8.85, ground), GROUND_COLORS.marking, 'right edge line missing');
});

test('M9.6 FISCO remains an ordinary finite open runtime for a three-lap race', () => {
  const live = createM96FiscoRuntime();
  assert.ok(Math.abs(live.window.topology.lapLength - 4_563) < 1e-7);
  assert.equal(live.raceRules.lapCount, 3);
  assert.equal(live.window.repeatCount, 4);
  assert.ok(Math.abs(live.window.length - 4_563 * 4) < 1e-7);
  const checkpoints = live.raceRules.gates.slice(0, 3);
  assert.deepEqual(checkpoints.map((gate) => gate.kind), ['checkpoint', 'checkpoint', 'checkpoint']);
  for (const [index, expectedS] of [1_140.75, 2_281.5, 3_422.25].entries()) {
    assert.ok(Math.abs(checkpoints[index].s - expectedS) < 1e-8);
  }
});

for (const [profile, createVehicle] of [
  [FR_VEHICLE_PROFILE, createTestCar],
  [BIKE1_VEHICLE_PROFILE, createTestBike],
]) {
  test(`ordinary ${profile.id} mechanics advance on the FISCO home straight`, () => {
    const live = createM96FiscoRuntime();
    const vehicle = createVehicle(
      live.window.guide,
      live.window.height,
      live.window.surface,
      45,
      0,
      15,
    );
    for (let tick = 0; tick < 180; tick += 1) {
      updateTestVehicle(
        live.window.guide,
        live.window.height,
        live.window.surface,
        vehicle,
        sampleRivalDrivingInput(live.window.guide, vehicle, 0),
        SIM_DT,
      );
    }
    assert.ok(vehicle.course.s > 100 && vehicle.course.s < 1_475, `s=${vehicle.course.s}`);
    assert.ok(Math.abs(vehicle.course.l) < 0.01, `l=${vehicle.course.l}`);
    assert.equal(vehicle.supported, true);
  });
}

test('course 4 selects FISCO only at the browser CIRCUIT composition root', async () => {
  const [
    selectionSource,
    circuitSource,
    branchingSource,
    linearSource,
    physicsSource,
    cameraSource,
    rendererSource,
    topologySource,
  ] = await Promise.all([
    readFile(new URL('../src/browser/course-mode-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/camera/m5-camera.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/m5-renderer.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/gameplay/circuit-topology.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(selectionSource, /digitCode: 'Digit4'[\s\S]*?query: 'fisco'[\s\S]*?routeKind: 'CIRCUIT'/);
  assert.match(circuitSource, /selectedCourseMode\.query === 'fisco'/);
  assert.match(circuitSource, /createM96FiscoRuntime\(\)/);
  assert.match(circuitSource, /createM93TsukubaCourse2000Runtime\(\)/);
  assert.doesNotMatch(branchingSource, /m9-6-fisco-circuit|query === 'fisco'/);
  assert.doesNotMatch(linearSource, /m9-6-fisco-circuit|query === 'fisco'/);

  for (const source of [physicsSource, cameraSource, rendererSource, topologySource]) {
    assert.doesNotMatch(source, /FISCO|m9-6-fisco/i);
  }
});
