import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import {
  createVehicleTelemetryRecorder,
  recordVehicleTelemetryTick,
  summarizeVehicleTelemetry,
} from '../dist/dev/vehicle-telemetry.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { VEHICLE_PHYSICS_CALIBRATION_STATUS } from '../dist/physics/vehicle-calibration.js';
import { createM5DebugSurfaceMap } from '../dist/physics/surface-map.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';

function plainVehicle() {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: Math.PI - 0.01,
    course: { s: 99, l: 2, segmentIndex: 0, distanceSquared: 0 },
    longitudinalSpeed: 20,
    lateralSpeed: 2,
  };
}

test('M6.5 explicitly marks current vehicle physics as DEV_UNCALIBRATED', () => {
  assert.equal(VEHICLE_PHYSICS_CALIBRATION_STATUS, 'DEV_UNCALIBRATED');
});

test('telemetry recorder snapshots inputs/state without mutating the observed vehicle', () => {
  const vehicle = plainVehicle();
  const before = structuredClone(vehicle);
  const recorder = createVehicleTelemetryRecorder(0.1, 100, vehicle);
  const input = { steering: 0.25, throttle: true, brake: false };

  vehicle.x = 2;
  vehicle.z = -1;
  vehicle.yaw = -Math.PI + 0.01;
  vehicle.course.s = 1;
  vehicle.course.l = -3;
  vehicle.longitudinalSpeed = 22;
  vehicle.lateralSpeed = -1;
  recordVehicleTelemetryTick(recorder, input, vehicle);

  assert.deepEqual(recorder.origin.x, before.x);
  assert.deepEqual(recorder.origin.sLocal, before.course.s);
  assert.deepEqual(recorder.samples[0].input, input);
  assert.deepEqual(vehicle.x, 2);
  assert.deepEqual(vehicle.course.s, 1);
});

test('telemetry summary is seam-safe in chainage and wrap-safe in yaw rate', () => {
  const vehicle = plainVehicle();
  const recorder = createVehicleTelemetryRecorder(0.1, 100, vehicle);
  vehicle.x = 1;
  vehicle.yaw = -Math.PI + 0.01;
  vehicle.course.s = 1;
  recordVehicleTelemetryTick(recorder, { steering: 0, throttle: false, brake: false }, vehicle);

  const summary = summarizeVehicleTelemetry(recorder);
  assert.ok(Math.abs(summary.netSignedChainageMeters - 2) < 1e-9);
  assert.ok(Math.abs(summary.maxAbsYawRateDegreesPerSecond - (0.2 * 180 / Math.PI)) < 1e-7);
  assert.equal(summary.durationSeconds, 0.1);
  assert.equal(summary.planarDistanceMeters, 1);
});

function runCurrentDevProbe() {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const car = createM5Car(guide, height, surfaces, 45);
  const recorder = createVehicleTelemetryRecorder(SIM_DT, guide.length, car);

  for (let tick = 0; tick < 180; tick += 1) {
    const input = tick < 120
      ? { steering: 0, throttle: true, brake: false }
      : { steering: 0.12, throttle: false, brake: false };
    updateM5Car(guide, height, surfaces, car, input, SIM_DT);
    recordVehicleTelemetryTick(recorder, input, car);
  }
  return summarizeVehicleTelemetry(recorder);
}

test('current DEV physics can be measured deterministically without freezing handling values as assertions', () => {
  const a = runCurrentDevProbe();
  const b = runCurrentDevProbe();
  assert.deepEqual(a, b);

  for (const value of Object.values(a)) assert.ok(Number.isFinite(value));
  assert.equal(a.tickCount, 180);
  assert.equal(a.durationSeconds, 180 * SIM_DT);
  assert.ok(a.planarDistanceMeters > 0);
  assert.ok(a.maxSpeedMetersPerSecond > 0);

  console.log('M6.5 DEV_UNCALIBRATED PHYSICS PROBE', JSON.stringify(a));
});
