import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_SELF_STEER_GAINS,
  DEFAULT_BROWSER_SELF_STEER_GAIN,
  browserSelfSteerGainForKey,
  formatSelfSteerGainSelector,
} from '../dist/browser/self-steer-gain-selection.js';
import {
  createArcadeVehicle,
  setArcadeVehicleTravelDirectionSteeringGain,
  stepTravelDirectionSteering,
} from '../dist/physics/arcade-vehicle-physics.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { FR_VEHICLE_PROFILE, MR_VEHICLE_PROFILE } from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;

test('browser keys 4 through 9 own exactly the requested six self-steer gains', () => {
  assert.equal(DEFAULT_BROWSER_SELF_STEER_GAIN, 1);
  assert.deepEqual(BROWSER_SELF_STEER_GAINS.map(({ gain }) => gain), [0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  for (let index = 0; index < BROWSER_SELF_STEER_GAINS.length; index += 1) {
    const digit = index + 4;
    const gain = 0.5 + index * 0.1;
    assert.ok(Math.abs(browserSelfSteerGainForKey(`Digit${digit}`) - gain) < 1e-12);
    assert.ok(Math.abs(browserSelfSteerGainForKey(`Numpad${digit}`) - gain) < 1e-12);
  }
  assert.equal(browserSelfSteerGainForKey('Digit3'), null);
  assert.equal(browserSelfSteerGainForKey('KeyP'), null);
  assert.match(formatSelfSteerGainSelector(0.7), /\[6\]0\.7\*/);
});

test('travel-direction gain scales only beta feedback and preserves yaw preview and driver offset', () => {
  const common = [0, 0.04, 0.12, 0.15];
  const half = stepTravelDirectionSteering(...common, 0.5, DT, FR_VEHICLE_PROFILE);
  const full = stepTravelDirectionSteering(...common, 1.0, DT, FR_VEHICLE_PROFILE);
  const zeroBetaHalf = stepTravelDirectionSteering(0, 0.04, 0, 0.15, 0.5, DT, FR_VEHICLE_PROFILE);
  const zeroBetaFull = stepTravelDirectionSteering(0, 0.04, 0, 0.15, 1.0, DT, FR_VEHICLE_PROFILE);
  assert.ok(Math.abs(zeroBetaHalf - zeroBetaFull) < 1e-12);
  assert.ok(full > half);
  assert.ok(Math.abs((full - zeroBetaFull) - 2 * (half - zeroBetaHalf)) < 1e-12);
});

test('one vehicle state owns the selected gain and rejects invalid calibration', () => {
  const highway = createM72DefaultBranchingParent();
  const height = new HeightProfile(highway.guide.length, [
    { s: 0, y: 0 },
    { s: highway.guide.length, y: 0 },
  ]);
  const surface = new SurfaceMap(highway.guide.length, [{
    sStart: 0,
    name: 'M9.2 SELF STEER GAIN TEST',
    bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
  }]);
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    800,
    0,
    25,
    0.7,
  );
  assert.equal(vehicle.travelDirectionSteeringGain, 0.7);
  setArcadeVehicleTravelDirectionSteeringGain(vehicle, 0.5);
  assert.equal(vehicle.travelDirectionSteeringGain, 0.5);
  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.equal(vehicle.travelDirectionSteeringGain, 0.5);
  const replacement = createArcadeVehicle(
    MR_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.longitudinalSpeed,
    vehicle.travelDirectionSteeringGain,
  );
  assert.equal(replacement.travelDirectionSteeringGain, 0.5);
  for (const invalid of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleTravelDirectionSteeringGain(vehicle, invalid),
      /finite and lie in \[0,1\]/,
    );
    assert.equal(vehicle.travelDirectionSteeringGain, 0.5);
  }
});

test('gain authority stays in common mechanics and shared browser composition', async () => {
  const [solver, selection, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/self-steer-gain-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(solver, /travelDirectionGain \* bodyTravelDirection/);
  assert.doesNotMatch(solver, /Digit4|Numpad9|camera|routeKind|CIRCUIT/);
  assert.doesNotMatch(selection, /camera|vehicle\.yaw|yawRate|tire|routeKind/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /browserSelfSteerGainForKey/);
    assert.match(source, /setArcadeVehicleTravelDirectionSteeringGain/);
    assert.match(source, /travelDirectionSteeringGain/);
  }
});
