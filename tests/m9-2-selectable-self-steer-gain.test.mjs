import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_SELF_STEER_GAINS,
  BROWSER_STEERING_RESPONSES,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_YAW_PREVIEW_CYCLE_CODE,
  BROWSER_YAW_PREVIEW_TIMES,
  DEFAULT_BROWSER_STEERING_CALIBRATION,
  browserSelfSteerGainForKey,
  formatSelfSteerGainSelector,
  formatSteeringResponseSelector,
  formatYawPreviewSelector,
  nextBrowserSteeringResponseRate,
  nextBrowserYawPreviewTime,
} from '../dist/browser/steering-calibration-selection.js';
import {
  createArcadeVehicle,
  setArcadeVehicleSteeringYawPreviewTime,
  setArcadeVehicleSymmetricSteeringActuatorRate,
  setArcadeVehicleTravelDirectionSteeringGain,
  stepTravelDirectionSteering,
  updateArcadeVehicle,
} from '../dist/physics/arcade-vehicle-physics.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { FR_VEHICLE_PROFILE, MR_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const highway = createM72DefaultBranchingParent();
const height = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const surface = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'M9.2 STEERING CALIBRATION TEST',
  bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
}]);

test('one browser authority owns all three requested steering calibration selectors', () => {
  assert.deepEqual(BROWSER_SELF_STEER_GAINS.map(({ gain }) => gain), [0.3, 0.4, 0.5, 0.6, 0.7]);
  assert.deepEqual(BROWSER_YAW_PREVIEW_TIMES, [0, 0.06, 0.09, 0.12, 0.15, 0.18]);
  assert.deepEqual(
    BROWSER_STEERING_RESPONSES.map(({ traversalSeconds }) => traversalSeconds),
    [0.25, 0.375, 0.5, 0.625],
  );
  assert.deepEqual(DEFAULT_BROWSER_STEERING_CALIBRATION, {
    travelDirectionGain: 0.5,
    yawPreviewTime: 0.12,
    steeringActuatorResponse: { applyRate: 8 / 3, releaseRate: 8 / 3 },
  });
  assert.equal(BROWSER_YAW_PREVIEW_CYCLE_CODE, 'KeyY');
  assert.equal(BROWSER_STEERING_RESPONSE_CYCLE_CODE, 'KeyT');

  for (let index = 0; index < BROWSER_SELF_STEER_GAINS.length; index += 1) {
    const digit = index + 4;
    const gain = 0.3 + index * 0.1;
    assert.ok(Math.abs(browserSelfSteerGainForKey(`Digit${digit}`) - gain) < 1e-12);
    assert.ok(Math.abs(browserSelfSteerGainForKey(`Numpad${digit}`) - gain) < 1e-12);
  }
  assert.equal(browserSelfSteerGainForKey('Digit3'), null);
  assert.equal(browserSelfSteerGainForKey('Digit9'), null);
  assert.equal(nextBrowserYawPreviewTime(0.12), 0.15);
  assert.equal(nextBrowserYawPreviewTime(0.18), 0);
  assert.equal(nextBrowserSteeringResponseRate(8 / 3), 2);
  assert.equal(nextBrowserSteeringResponseRate(1.6), 4);
  assert.match(formatSelfSteerGainSelector(0.5), /\[6\]0\.5\*/);
  assert.equal(formatYawPreviewSelector(0.12), 'YAW [Y] 0.12s');
  assert.equal(formatSteeringResponseSelector(8 / 3), 'ACT [T] 0.375s');
});

test('the current steering law keeps gain and yaw preview as independent terms', () => {
  const half = stepTravelDirectionSteering(
    0, 0.04, 0.12, 0.15, { travelDirectionGain: 0.5, yawPreviewTime: 0.12 }, DT,
    FR_VEHICLE_PROFILE,
  );
  const full = stepTravelDirectionSteering(
    0, 0.04, 0.12, 0.15, { travelDirectionGain: 1, yawPreviewTime: 0.12 }, DT,
    FR_VEHICLE_PROFILE,
  );
  const zeroBetaHalf = stepTravelDirectionSteering(
    0, 0.04, 0, 0.15, { travelDirectionGain: 0.5, yawPreviewTime: 0.12 }, DT,
    FR_VEHICLE_PROFILE,
  );
  const zeroBetaFull = stepTravelDirectionSteering(
    0, 0.04, 0, 0.15, { travelDirectionGain: 1, yawPreviewTime: 0.12 }, DT,
    FR_VEHICLE_PROFILE,
  );
  const noYawPreview = stepTravelDirectionSteering(
    0, 0, 0, 0.15, { travelDirectionGain: 0.5, yawPreviewTime: 0 }, DT,
    FR_VEHICLE_PROFILE,
  );
  const currentYawPreview = stepTravelDirectionSteering(
    0, 0, 0, 0.15, { travelDirectionGain: 0.5, yawPreviewTime: 0.12 }, DT,
    FR_VEHICLE_PROFILE,
  );
  assert.ok(Math.abs(zeroBetaHalf - zeroBetaFull) < 1e-12);
  assert.ok(full > half);
  assert.ok(Math.abs((full - zeroBetaFull) - 2 * (half - zeroBetaHalf)) < 1e-12);
  assert.equal(noYawPreview, 0);
  assert.ok(currentYawPreview < 0);
});

test('one vehicle state owns all three values through recovery and profile reconstruction', () => {
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    DEFAULT_BROWSER_STEERING_CALIBRATION,
  );
  assert.deepEqual(vehicle.steeringCalibration, DEFAULT_BROWSER_STEERING_CALIBRATION);
  setArcadeVehicleTravelDirectionSteeringGain(vehicle, 0.7);
  setArcadeVehicleSteeringYawPreviewTime(vehicle, 0.06);
  setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, 2);
  assert.deepEqual(vehicle.steeringCalibration, {
    travelDirectionGain: 0.7,
    yawPreviewTime: 0.06,
    steeringActuatorResponse: { applyRate: 2, releaseRate: 2 },
  });

  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.deepEqual(vehicle.steeringCalibration, {
    travelDirectionGain: 0.7,
    yawPreviewTime: 0.06,
    steeringActuatorResponse: { applyRate: 2, releaseRate: 2 },
  });
  const replacement = createArcadeVehicle(
    MR_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.longitudinalSpeed,
    vehicle.steeringCalibration,
  );
  assert.deepEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(
    replacement.steeringCalibration.steeringActuatorResponse,
    vehicle.steeringCalibration.steeringActuatorResponse,
  );
});

test('calibration validation rejects invalid values before mutating vehicle state', () => {
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    DEFAULT_BROWSER_STEERING_CALIBRATION,
  );
  for (const invalid of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleTravelDirectionSteeringGain(vehicle, invalid),
      /finite and lie in \[0,1\]/,
    );
  }
  for (const invalid of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleSteeringYawPreviewTime(vehicle, invalid),
      /finite and >= 0/,
    );
  }
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, invalid),
      /finite and > 0/,
    );
  }
  assert.deepEqual(vehicle.steeringCalibration, DEFAULT_BROWSER_STEERING_CALIBRATION);
});

test('the selected symmetric response is consumed by the ordinary steering actuator only', () => {
  const slow = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    { steeringActuatorResponse: { applyRate: 1.6, releaseRate: 1.6 } },
  );
  const fast = createArcadeVehicle(
    FR_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    { steeringActuatorResponse: { applyRate: 4, releaseRate: 4 } },
  );
  updateArcadeVehicle(
    highway.guide, height, surface, slow,
    { steering: 1, throttle: false, brake: false }, DT,
  );
  updateArcadeVehicle(
    highway.guide, height, surface, fast,
    { steering: 1, throttle: false, brake: false }, DT,
  );
  assert.ok(Math.abs(slow.actuator.steering - 1.6 * DT) < 1e-12);
  assert.ok(Math.abs(fast.actuator.steering - 4 * DT) < 1e-12);
  assert.equal(slow.actuator.throttle, fast.actuator.throttle);
  assert.equal(slow.actuator.brake, fast.actuator.brake);
});

test('calibration authority stays in common mechanics and shared browser composition', async () => {
  const [solver, selection, actuator, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/steering-calibration-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/driving-actuator.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(solver, /calibration\.travelDirectionGain \* bodyTravelDirection/);
  assert.match(solver, /yawRate \* calibration\.yawPreviewTime/);
  assert.doesNotMatch(solver, /Digit4|Numpad8|KeyY|KeyT|camera|routeKind|CIRCUIT/);
  assert.doesNotMatch(actuator, /yawPreview|travelDirectionGain|camera|routeKind/);
  assert.doesNotMatch(selection, /vehicle\.yaw|yawRate|tire|routeKind/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /DEFAULT_BROWSER_STEERING_CALIBRATION/);
    assert.match(source, /setArcadeVehicleTravelDirectionSteeringGain/);
    assert.match(source, /setArcadeVehicleSteeringYawPreviewTime/);
    assert.match(source, /setArcadeVehicleSymmetricSteeringActuatorRate/);
    assert.match(source, /const steeringCalibration = vehicle\.steeringCalibration/);
  }
});
