import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import {
  M7_1_AIRBORNE_PROBE_START_S,
  M7_1_EDGE_MARKING_WIDTH_METERS,
  M7_1_HIGHWAY_RECOVERY_PROFILE,
  M7_1_LANE_COUNT,
  M7_1_LANE_MARKING_WIDTH_METERS,
  M7_1_LANE_WIDTH_METERS,
  M7_1_MARKING_DASH_LENGTH_METERS,
  M7_1_MARKING_GAP_LENGTH_METERS,
  M7_1_PLAYER_START_L,
  M7_1_ROAD_HALF_WIDTH_METERS,
  createM71HighwayCalibrationLapRaster,
  createM71HighwayCalibrationRuntime,
  createM71HighwayGroundProfile,
  createM71HighwaySurfaceMap,
} from '../dist/dev/m7-1-highway-calibration-course.js';
import {
  createM5RecoveryState,
  recoverM5Vehicle,
} from '../dist/gameplay/recovery.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { createM5Bike } from '../dist/physics/motorcycle-physics.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';

test('M7.1 calibration lap is long and keeps Japanese-expressway reference radii', () => {
  const raster = createM71HighwayCalibrationLapRaster();
  const guide = compileGuidePath(raster, { lMax: 12, mMin: 0.25, dCam: 5 });
  const finiteRadii = guide.corners
    .map((corner) => corner.radius)
    .filter(Number.isFinite);

  assert.ok(raster.length > 7_000, `expected > 7 km, got ${raster.length}`);
  assert.ok(Math.min(...finiteRadii) >= 460);
  assert.ok(Math.max(...raster.vertexTurns.map((turn) => Math.abs(turn))) <= 5.000001 * Math.PI / 180);
  assert.ok(raster.vertexTurns.some((turn) => turn > 1e-9), 'course needs right turns');
  assert.ok(raster.vertexTurns.some((turn) => turn < -1e-9), 'course needs left turns');
});

test('M7.1 four-lane cross-section owns 3.5 m lanes and matching physical support', () => {
  assert.equal(M7_1_LANE_COUNT, 4);
  assert.equal(M7_1_LANE_WIDTH_METERS, 3.5);
  assert.equal(M7_1_ROAD_HALF_WIDTH_METERS, 7);

  const surface = createM71HighwaySurfaceMap(8_000);
  assert.equal(surface.sample(100, -6.99).type, 'ASPHALT');
  assert.equal(surface.sample(100, 6.99).type, 'ASPHALT');
  assert.equal(surface.sample(100, 7.5).type, 'SHOULDER');
  assert.equal(surface.sample(100, 9).type, 'GRASS');
});

test('M7.1 lane paint uses 0.15 m 8+12 dashed separators and 0.20 m solid edges', () => {
  const profile = createM71HighwayGroundProfile();
  assert.equal(M7_1_LANE_MARKING_WIDTH_METERS, 0.15);
  assert.equal(M7_1_EDGE_MARKING_WIDTH_METERS, 0.20);
  assert.equal(M7_1_MARKING_DASH_LENGTH_METERS, 8);
  assert.equal(M7_1_MARKING_GAP_LENGTH_METERS, 12);

  assert.equal(sampleGroundMap(4, -3.5, profile), GROUND_COLORS.marking);
  assert.notEqual(sampleGroundMap(10, -3.5, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(4, -3.5 + 0.074, profile), GROUND_COLORS.marking);
  assert.notEqual(sampleGroundMap(4, -3.5 + 0.076, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, -7, profile), GROUND_COLORS.marking);
  assert.equal(sampleGroundMap(10, 7, profile), GROUND_COLORS.marking);
});

test('M7.1 authored crest causally releases both contacts at highway speed', () => {
  const live = createM71HighwayCalibrationRuntime();
  const car = createM5Car(
    live.window.guide,
    live.window.height,
    live.window.surface,
    M7_1_AIRBORNE_PROBE_START_S,
    M7_1_PLAYER_START_L,
  );
  car.speed = 60;

  let observedAirborne = false;
  let maxGroundGap = 0;
  for (let tick = 0; tick < 240; tick += 1) {
    updateM5Car(
      live.window.guide,
      live.window.height,
      live.window.surface,
      car,
      { steering: 0, throttle: false, brake: false },
      SIM_DT,
    );
    observedAirborne ||= !car.supported;
    maxGroundGap = Math.max(
      maxGroundGap,
      car.y - live.window.height.samplePhysics(car.course.s),
    );
  }

  assert.equal(observedAirborne, true);
  assert.ok(maxGroundGap > 0.60, `expected contact-release gap, got ${maxGroundGap}`);
});

test('M7.1 spawn and ordinary recovery target an authored lane center', () => {
  const live = createM71HighwayCalibrationRuntime();
  const car = createM5Car(
    live.window.guide,
    live.window.height,
    live.window.surface,
    45,
    M7_1_PLAYER_START_L,
  );
  const bike = createM5Bike(
    live.window.guide,
    live.window.height,
    live.window.surface,
    45,
    M7_1_PLAYER_START_L,
  );
  assert.equal(car.course.l, M7_1_PLAYER_START_L);
  assert.equal(bike.course.l, M7_1_PLAYER_START_L);

  const recovery = createM5RecoveryState(car);
  recovery.lastSafeS = 100;
  recoverM5Vehicle(
    recovery,
    live.window.guide,
    live.window.height,
    live.window.surface,
    car,
    'manual',
    M7_1_HIGHWAY_RECOVERY_PROFILE,
  );
  assert.equal(car.course.l, M7_1_PLAYER_START_L);
});
