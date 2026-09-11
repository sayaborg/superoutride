import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../dist/browser/frame-loop.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { BRANCHING_HANDOFF_SEAM_S } from '../dist/dev/courses/branching-highway.js';
import {
  createHighwayCalibrationLapRaster,
  createHighwayCalibrationRuntime,
  createHighwayGroundProfile,
  createHighwaySurfaceMap,
  HIGHWAY_AIRBORNE_PROBE_START_S,
  HIGHWAY_EDGE_MARKING_WIDTH_METERS,
  HIGHWAY_HIGHWAY_RECOVERY_PROFILE,
  HIGHWAY_LANE_COUNT,
  HIGHWAY_LANE_MARKING_WIDTH_METERS,
  HIGHWAY_LANE_WIDTH_METERS,
  HIGHWAY_LOW_SPEED_COMPLEX_COUNT,
  HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS,
  HIGHWAY_LOW_SPEED_CONNECTOR_LENGTH_METERS,
  HIGHWAY_MARKING_DASH_LENGTH_METERS,
  HIGHWAY_MARKING_GAP_LENGTH_METERS,
  HIGHWAY_PLAYER_START_L,
  HIGHWAY_ROAD_HALF_WIDTH_METERS,
} from '../dist/dev/courses/highway-calibration.js';
import { createRecoveryState, recoverVehicle } from '../dist/gameplay/recovery.js';
import { estimateUpcomingTargetSpeed, sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/groundmap/ground-map.js';
import { createTestBike, createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

test('calibration lap retains high-speed references and two post-handoff low-speed complexes', () => {
  const raster = createHighwayCalibrationLapRaster();
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  const finiteRadii = guide.corners.map((corner) => corner.radius).filter(Number.isFinite);
  const lowSpeedCorners = guide.corners.filter((corner) => corner.radius < 100);
  const lowSpeedSections = lowSpeedCorners.reduce((sections, corner) => {
    const previous = sections.at(-1);
    if (!previous || corner.sVertex - previous.at(-1).sVertex > 100) {
      sections.push([corner]);
    } else {
      previous.push(corner);
    }
    return sections;
  }, []);

  assert.ok(raster.length > 10_000 && raster.length < 10_200, `expected approximately 10.1 km, got ${raster.length}`);
  assert.equal(HIGHWAY_LOW_SPEED_COMPLEX_RADIUS_METERS, 90);
  assert.equal(HIGHWAY_LOW_SPEED_COMPLEX_COUNT, 2);
  assert.equal(HIGHWAY_LOW_SPEED_CONNECTOR_LENGTH_METERS, 200);
  assert.ok(Math.min(...finiteRadii) > 89 && Math.min(...finiteRadii) < 91);
  assert.ok(finiteRadii.some((radius) => radius >= 460));
  assert.ok(finiteRadii.some((radius) => radius >= 710));
  assert.ok(lowSpeedCorners.length > 0);
  assert.equal(lowSpeedSections.length, HIGHWAY_LOW_SPEED_COMPLEX_COUNT);
  assert.ok(lowSpeedCorners.every((corner) => corner.sVertex > BRANCHING_HANDOFF_SEAM_S));
  assert.ok(Math.max(...raster.vertexTurns.map((turn) => Math.abs(turn))) <= (5.000001 * Math.PI) / 180);
  assert.ok(
    raster.vertexTurns.some((turn) => turn > 1e-9),
    'course needs right turns',
  );
  assert.ok(
    raster.vertexTurns.some((turn) => turn < -1e-9),
    'course needs left turns',
  );

  for (const section of lowSpeedSections) {
    const cornerS = section[0].sVertex;
    const targetAt200 = estimateUpcomingTargetSpeed(guide, cornerS - 200);
    const targetAt80 = estimateUpcomingTargetSpeed(guide, cornerS - 80);
    const targetAtCorner = estimateUpcomingTargetSpeed(guide, cornerS);
    const impliedBrakingDeceleration = (targetAt80 ** 2 - targetAtCorner ** 2) / (2 * 80);
    assert.ok(targetAt200 > targetAt80 && targetAt80 > targetAtCorner);
    assert.ok(
      Math.abs(impliedBrakingDeceleration - 4) < 0.05,
      `expected the braking envelope, got ${impliedBrakingDeceleration}`,
    );
  }
});

test('ordinary rival physics brakes for and clears both low-speed complexes on asphalt', () => {
  const live = createHighwayCalibrationRuntime();
  const lapLength = live.window.topology.lapLength;
  const lowSpeedCorners = live.window.guide.corners.filter(
    (corner) => corner.sVertex < lapLength && corner.radius < 100,
  );
  const firstCorner = lowSpeedCorners[0];
  const lastCorner = lowSpeedCorners.at(-1);
  assert.ok(firstCorner && lastCorner);

  const car = createTestCar(
    live.window.guide,
    live.window.height,
    live.window.surface,
    firstCorner.sVertex - 180,
    0,
    45,
  );
  const exitTargetS = lastCorner.sVertex + 300;
  let minimumSpeed = car.longitudinalSpeed;
  let maximumAbsoluteL = Math.abs(car.course.l);
  // Constructor state has not yet derived its first contact observation.
  let remainedSupported = true;
  let ticks = 0;

  while (car.course.s < exitTargetS && ticks < 5_000) {
    const input = sampleRivalDrivingInput(live.window.guide, car, 0);
    updateTestVehicle(live.window.guide, live.window.height, live.window.surface, car, input, SIM_DT);
    minimumSpeed = Math.min(minimumSpeed, car.longitudinalSpeed);
    maximumAbsoluteL = Math.max(maximumAbsoluteL, Math.abs(car.course.l));
    remainedSupported &&= car.supported;
    ticks += 1;
  }

  assert.ok(car.course.s >= exitTargetS, `rival stalled at s=${car.course.s}`);
  assert.ok(minimumSpeed < 26, `expected braking below 26 m/s, got ${minimumSpeed}`);
  assert.ok(car.longitudinalSpeed > 40, `expected exit acceleration, got ${car.longitudinalSpeed}`);
  assert.ok(maximumAbsoluteL < HIGHWAY_ROAD_HALF_WIDTH_METERS, `max |l|=${maximumAbsoluteL}`);
  assert.equal(remainedSupported, true);
});

test('four-lane cross-section owns 3.5 m lanes and matching physical support', () => {
  assert.equal(HIGHWAY_LANE_COUNT, 4);
  assert.equal(HIGHWAY_LANE_WIDTH_METERS, 3.5);
  assert.equal(HIGHWAY_ROAD_HALF_WIDTH_METERS, 7);

  const surface = createHighwaySurfaceMap(8_000);
  assert.equal(surface.sample(100, -6.99).type, 'ASPHALT');
  assert.equal(surface.sample(100, 6.99).type, 'ASPHALT');
  assert.equal(surface.sample(100, 7.5).type, 'SHOULDER');
  assert.equal(surface.sample(100, 9).type, 'GRASS');
});

test('lane paint uses 0.15 m 8+12 dashed separators and 0.20 m solid edges', () => {
  const profile = createHighwayGroundProfile();
  assert.equal(HIGHWAY_LANE_MARKING_WIDTH_METERS, 0.15);
  assert.equal(HIGHWAY_EDGE_MARKING_WIDTH_METERS, 0.2);
  assert.equal(HIGHWAY_MARKING_DASH_LENGTH_METERS, 8);
  assert.equal(HIGHWAY_MARKING_GAP_LENGTH_METERS, 12);

  assert.equal(sampleGroundMap(4, -3.5, profile), GROUND_COLORS.marking);
  assert.notEqual(sampleGroundMap(10, -3.5, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(4, -3.5 + 0.074, profile), GROUND_COLORS.marking);
  assert.notEqual(sampleGroundMap(4, -3.5 + 0.076, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, -7, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, 7, profile), GROUND_COLORS.marking);
});

test('opening section stays within the bounded highway envelope at 216 km/h', () => {
  const live = createHighwayCalibrationRuntime();
  const car = createTestCar(
    live.window.guide,
    live.window.height,
    live.window.surface,
    HIGHWAY_AIRBORNE_PROBE_START_S,
    HIGHWAY_PLAYER_START_L,
    60,
  );

  let maxRoadRelativePresentationHeight = Number.NEGATIVE_INFINITY;
  for (let tick = 0; tick < 240; tick += 1) {
    updateTestVehicle(
      live.window.guide,
      live.window.height,
      live.window.surface,
      car,
      { steering: 0, throttle: false, brake: false },
      SIM_DT,
    );
    maxRoadRelativePresentationHeight = Math.max(
      maxRoadRelativePresentationHeight,
      car.presentationY - live.window.height.samplePhysics(car.course.s),
    );
  }

  let maximumGrade = 0;
  for (let s = 250; s <= 700; s += 0.25) {
    maximumGrade = Math.max(maximumGrade, Math.abs(live.window.height.samplePhysicsDifferential(s).dYdS));
  }

  assert.ok(maximumGrade <= 0.03, `opening-section grade=${maximumGrade}`);
  assert.ok(
    maxRoadRelativePresentationHeight < 0.15,
    `opening-section presentation height=${maxRoadRelativePresentationHeight}`,
  );
  assert.ok(car.course.s > 450, `expected forward progress through opening section, s=${car.course.s}`);
});

test('spawn and ordinary recovery target an authored lane center', () => {
  const live = createHighwayCalibrationRuntime();
  const car = createTestCar(live.window.guide, live.window.height, live.window.surface, 45, HIGHWAY_PLAYER_START_L);
  const bike = createTestBike(live.window.guide, live.window.height, live.window.surface, 45, HIGHWAY_PLAYER_START_L);
  assert.equal(car.course.l, HIGHWAY_PLAYER_START_L);
  assert.equal(bike.course.l, HIGHWAY_PLAYER_START_L);

  const recovery = createRecoveryState(car);
  recovery.lastSafeS = 100;
  recoverVehicle({ guide: live.window.guide, height: live.window.height, surfaces: live.window.surface }, car, {
    state: recovery,
    reason: 'manual',
    profile: HIGHWAY_HIGHWAY_RECOVERY_PROFILE,
  });
  assert.equal(car.course.l, HIGHWAY_PLAYER_START_L);
});
