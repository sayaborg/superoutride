import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_MAX_ROAD_WHEEL_STEERS,
  BROWSER_MAX_STEER_CYCLE_CODE,
  BROWSER_STEERING_OFFSET_CYCLE_CODE,
  BROWSER_STEERING_OFFSETS,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_STEERING_RESPONSES,
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
  formatMaxRoadWheelSteerSelector,
  formatSteeringOffsetSelector,
  formatSteeringResponseSelector,
} from '../dist/browser/steering-calibration-selection.js';
import { HeightProfile } from '../dist/core/height-profile.js';
import { createDefaultBranchingParent } from '../dist/dev/courses/branching-highway.js';
import { createRecoveryState, recoverVehicle, updateRecovery } from '../dist/gameplay/recovery.js';
import {
  createArcadeVehicle,
  travelDirectionSteeringTarget,
  updateArcadeVehicle,
} from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  setArcadeVehicleMaxRoadWheelSteer,
  setArcadeVehicleSteeringOffsetMax,
  setArcadeVehicleSymmetricSteeringActuatorRate,
  steeringAutomaticMax,
} from '../dist/physics/vehicle-calibration.js';
import { FERRARI_TESTAROSSA_VEHICLE_PROFILE } from '../dist/vehicle/production-vehicle-profiles.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

const DEG = Math.PI / 180;
const DT = 1 / 60;
const highway = createDefaultBranchingParent();
const height = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const surface = new SurfaceMap(highway.guide.length, [
  {
    sStart: 0,
    name: 'STEERING CALIBRATION TEST',
    bands: [{ lMin: -1_000, lMax: 1_000, type: 'ASPHALT' }],
  },
]);

test('browser authority exposes common D / M / ACT baseline and surrounding selectors', () => {
  assert.deepEqual(
    BROWSER_STEERING_OFFSETS.map(({ degrees }) => degrees),
    Array.from({ length: 21 }, (_, i) => 10 + i),
  );
  assert.deepEqual(
    BROWSER_MAX_ROAD_WHEEL_STEERS.map(({ degrees }) => degrees),
    [50, 55, 60, 65, 70, 75, 80],
  );
  assert.deepEqual(
    BROWSER_STEERING_RESPONSES.map(({ traversalSeconds }) => traversalSeconds),
    [0.2, 0.225, 0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.4],
  );
  assert.equal(BROWSER_STEERING_OFFSET_CYCLE_CODE, 'KeyY');
  assert.equal(BROWSER_MAX_STEER_CYCLE_CODE, 'KeyU');
  assert.equal(BROWSER_STEERING_RESPONSE_CYCLE_CODE, 'KeyT');
  assert.ok(Math.abs(DEFAULT_BROWSER_STEERING_OFFSET - 20 * DEG) < 1e-15);
  assert.ok(Math.abs(DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER - 65 * DEG) < 1e-15);
  assert.equal(DEFAULT_BROWSER_STEERING_RESPONSE_RATE, 1 / 0.3);
  assert.equal(formatSteeringOffsetSelector(12 * DEG), 'D [Y] 12°');
  assert.equal(formatMaxRoadWheelSteerSelector(60 * DEG), 'M [U] 60°');
  assert.equal(formatSteeringResponseSelector(5), 'ACT [T] 0.20s');
  assert.equal(formatSteeringResponseSelector(1 / 0.225), 'ACT [T] 0.225s');
  assert.equal(formatSteeringResponseSelector(4), 'ACT [T] 0.25s');
});

test('all nine compiled profiles retain construction seeds while A is not stored', () => {
  for (const { profile, presentationFamily } of VEHICLE_CATALOG) {
    const expectedD = (presentationFamily === 'BIKE' ? 9 : 9.5) * DEG;
    assert.ok(Math.abs(profile.maxRoadWheelSteer - 45 * DEG) < 1e-15, profile.id);
    assert.ok(Math.abs(profile.steeringOffsetMax - expectedD) < 1e-15, profile.id);
    assert.equal(profile.actuator.steering.applyRate, 4, profile.id);
    assert.equal(profile.actuator.steering.releaseRate, 4, profile.id);
    assert.equal('steeringAutomaticMax' in profile, false, profile.id);
    const calibration = createArcadeVehicle(
      profile,
      { guide: highway.guide, height, surfaces: surface },
      { s: 800, l: 0, initialSpeed: 25 },
    ).steeringCalibration;
    assert.equal('steeringAutomaticMax' in calibration, false, profile.id);
    assert.ok(Math.abs(steeringAutomaticMax(calibration) - (45 * DEG - expectedD)) < 1e-15);
  }
});

test('every M x D choice derives A=M-D and preserves exact driver reserve inside A', () => {
  let minimumAutomaticDegrees = Infinity;
  for (const { degrees: mDegrees, radians: maxRoadWheelSteer } of BROWSER_MAX_ROAD_WHEEL_STEERS) {
    for (const { degrees: dDegrees, radians: steeringOffsetMax } of BROWSER_STEERING_OFFSETS) {
      const calibration = {
        maxRoadWheelSteer,
        steeringOffsetMax,
        steeringActuatorResponse: { applyRate: 4, releaseRate: 4 },
      };
      const automaticMax = steeringAutomaticMax(calibration);
      minimumAutomaticDegrees = Math.min(minimumAutomaticDegrees, automaticMax / DEG);
      assert.ok(Math.abs(automaticMax - (mDegrees - dDegrees) * DEG) < 1e-14);
      const beta = 10 * DEG;
      const positive = travelDirectionSteeringTarget(steeringOffsetMax, beta, calibration);
      const negative = travelDirectionSteeringTarget(-steeringOffsetMax, -beta, calibration);
      assert.ok(Math.abs(positive - beta - steeringOffsetMax) < 1e-14);
      assert.ok(Math.abs(negative + beta + steeringOffsetMax) < 1e-14);
      const deepBeta = 2;
      assert.ok(
        Math.abs(travelDirectionSteeringTarget(steeringOffsetMax, deepBeta, calibration) - maxRoadWheelSteer) < 1e-14,
      );
      assert.ok(
        Math.abs(travelDirectionSteeringTarget(-steeringOffsetMax, -deepBeta, calibration) + maxRoadWheelSteer) < 1e-14,
      );
    }
  }
  assert.ok(Math.abs(minimumAutomaticDegrees - 20) < 1e-12);
});

test('M D T mutation changes calibration only and survives recovery and profile reconstruction', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    { guide: highway.guide, height, surfaces: surface },
    { s: 800, l: 0, initialSpeed: 25 },
  );
  vehicle.frontSteerAngle = 0.08;
  vehicle.yawRate = -1.1;
  const physicalBefore = {
    x: vehicle.x,
    z: vehicle.z,
    yaw: vehicle.yaw,
    yawRate: vehicle.yawRate,
    frontSteerAngle: vehicle.frontSteerAngle,
  };
  setArcadeVehicleMaxRoadWheelSteer(vehicle, 49 * DEG);
  setArcadeVehicleSteeringOffsetMax(vehicle, 12.5 * DEG);
  setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, 2);
  assert.deepEqual(
    {
      x: vehicle.x,
      z: vehicle.z,
      yaw: vehicle.yaw,
      yawRate: vehicle.yawRate,
      frontSteerAngle: vehicle.frontSteerAngle,
    },
    physicalBefore,
  );
  assert.ok(Math.abs(steeringAutomaticMax(vehicle.steeringCalibration) - 36.5 * DEG) < 1e-14);
  const recovery = createRecoveryState(vehicle);
  recoverVehicle({ guide: highway.guide, height, surfaces: surface }, vehicle, { state: recovery });
  assert.deepEqual(vehicle.steeringCalibration, {
    maxRoadWheelSteer: 49 * DEG,
    steeringOffsetMax: 12.5 * DEG,
    steeringActuatorResponse: { applyRate: 2, releaseRate: 2 },
  });
  assert.equal(vehicle.yawRate, 0);
  const replacement = createArcadeVehicle(
    VEHICLE_CATALOG[1].profile,
    { guide: highway.guide, height, surfaces: surface },
    {
      s: vehicle.course.s,
      l: vehicle.course.l,
      initialSpeed: vehicle.longitudinalSpeed,
      steeringCalibration: vehicle.steeringCalibration,
    },
  );
  assert.deepEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(
    replacement.steeringCalibration.steeringActuatorResponse,
    vehicle.steeringCalibration.steeringActuatorResponse,
  );
});

test('all nine profiles stay finite at the extreme selector corner with permitted wheel lift and ordinary recovery', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    const vehicle = createArcadeVehicle(
      profile,
      { guide: highway.guide, height, surfaces: surface },
      {
        s: 800,
        l: 0,
        initialSpeed: 25,
        steeringCalibration: {
          maxRoadWheelSteer: 50 * DEG,
          steeringOffsetMax: 20 * DEG,
          steeringActuatorResponse: { applyRate: 1 / 0.3, releaseRate: 1 / 0.3 },
        },
      },
    );
    const recovery = createRecoveryState(vehicle);
    for (let tick = 0; tick < 180; tick += 1) {
      updateArcadeVehicle(
        { guide: highway.guide, height, surfaces: surface },
        vehicle,
        { steering: tick < 90 ? 1 : -1, throttle: true, brake: false },
        DT,
      );
      for (const value of [
        vehicle.x,
        vehicle.y,
        vehicle.z,
        vehicle.velocityX,
        vehicle.velocityY,
        vehicle.velocityZ,
        vehicle.yaw,
        vehicle.pitch,
        vehicle.yawRate,
        vehicle.pitchRate,
        vehicle.frontSteerAngle,
        vehicle.frontWheelOmega,
        vehicle.rearWheelOmega,
      ])
        assert.ok(Number.isFinite(value), profile.id);
      assert.ok(Math.abs(vehicle.frontSteerAngle) <= 50 * DEG + 1e-12, profile.id);
      // permits wheel lift, not inverted driving; use the actual browser tick boundary.
      const reason = updateRecovery({ guide: highway.guide, height, surfaces: surface }, vehicle, {
        state: recovery,
        dt: DT,
      });
      if (reason !== null) assert.equal(reason, 'overturned');
      assert.ok(Math.abs(vehicle.pitch) < Math.PI / 2, profile.id);
    }
  }
});

test('all nine profiles can return from a 43 degree deep-beta seed under explicit recovery input', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    for (const initialDegrees of [-43, 43]) {
      const speed = 20;
      const vehicle = createArcadeVehicle(
        profile,
        { guide: highway.guide, height, surfaces: surface },
        { s: 800, l: 0, initialSpeed: speed },
      );
      const beta = initialDegrees * DEG;
      seedBodySideslip(vehicle, speed, beta);
      const automaticMax = steeringAutomaticMax(vehicle.steeringCalibration);
      assert.ok(Math.abs(beta) > automaticMax);
      const steering = -Math.sign(beta);
      let entered = false;
      for (let tick = 0; tick < 240; tick += 1) {
        updateArcadeVehicle(
          { guide: highway.guide, height, surfaces: surface },
          vehicle,
          { steering, throttle: false, brake: false },
          DT,
        );
        clampPlanarSpeed(vehicle, speed);
        if (Math.abs(observeBodySideslip(vehicle)) < automaticMax - DEG) {
          entered = true;
          break;
        }
      }
      assert.equal(entered, true, `${profile.id} beta=${initialDegrees}`);
    }
  }
});

test('contains no yaw washout state or hidden drift steering authority', async () => {
  const [solver, calibration, selection] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/steering-calibration-selection.ts', import.meta.url), 'utf8'),
  ]);
  const current = `${solver}\n${calibration}\n${selection}`;
  assert.doesNotMatch(
    current,
    /yawTransient|yawWashout|yawRateBaseline|steeringAssist|travelDirectionGain|driftMode|driftAssist/i,
  );
  assert.match(calibration, /return calibration\.maxRoadWheelSteer - calibration\.steeringOffsetMax/);
  assert.doesNotMatch(calibration, /steeringAutomaticMax\s*:/);
  await assert.rejects(
    readFile(new URL('../src/physics/steering-assist.ts', import.meta.url), 'utf8'),
    (error) => error?.code === 'ENOENT',
  );
});

function seedBodySideslip(vehicle, speed, sideslip) {
  vehicle.velocityX =
    Math.cos(vehicle.yaw) * speed * Math.sin(sideslip) + Math.sin(vehicle.yaw) * speed * Math.cos(sideslip);
  vehicle.velocityY = 0;
  vehicle.velocityZ =
    -Math.sin(vehicle.yaw) * speed * Math.sin(sideslip) + Math.cos(vehicle.yaw) * speed * Math.cos(sideslip);
  const longitudinalSpeed = speed * Math.cos(sideslip);
  vehicle.frontWheelOmega = longitudinalSpeed / vehicle.profile.frontStation.rollingRadius;
  vehicle.rearWheelOmega = longitudinalSpeed / vehicle.profile.rearStation.rollingRadius;
}
function observeBodySideslip(vehicle) {
  return Math.atan2(
    vehicle.lateralSpeed,
    Math.sqrt(vehicle.longitudinalSpeed ** 2 + vehicle.profile.steeringLowSpeedRegularization ** 2),
  );
}
function clampPlanarSpeed(vehicle, speed) {
  const planar = Math.hypot(vehicle.velocityX, vehicle.velocityZ);
  if (!(planar > 0)) return;
  const scale = speed / planar;
  vehicle.velocityX *= scale;
  vehicle.velocityZ *= scale;
}
