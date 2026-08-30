import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { FR_VEHICLE_PROFILE, createTestCar } from './helpers/vehicle-fixture.mjs';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

function fixture() {
  const parent = createM72DefaultBranchingParent();
  const height = new HeightProfile(parent.guide.length, [
    { s: 0, y: 0 },
    { s: parent.guide.length, y: 0 },
  ]);
  return { parent, height, car: createTestCar(parent.guide, height, parent.surfaceMap, 800, -1.75) };
}

test('M8.0 tire force is an algebraic observation with no model-specific memory state', async () => {
  const { car } = fixture();
  assert.equal('frontLateralForce' in car, false);
  assert.equal('rearLateralForce' in car, false);
  assert.equal('contacts' in car, false);

  const carSource = await readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8');
  const common = await readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(carSource, /LateralRelaxationLength|frontLateralForce|rearLateralForce/);
  assert.doesNotMatch(common, /LateralRelaxationLength|frontLateralForce|rearLateralForce/);
});

test('M8.0 one-k tire response is immediate deterministic and releases with zero demand', () => {
  const tire = FR_VEHICLE_PROFILE.frontStation.tire;
  const loaded = evaluateTireForce(100, 0.33, 30, 2, 6500, 1, tire);
  const repeated = evaluateTireForce(100, 0.33, 30, 2, 6500, 1, tire);
  const released = evaluateTireForce(30 / 0.33, 0.33, 30, 0, 6500, 1, tire);
  assert.deepEqual(repeated, loaded);
  assert.notEqual(loaded.fy, 0);
  assert.equal(released.fx, 0);
  assert.equal(released.fy, 0);
});

test('M8.0 zero normal load cannot retain or manufacture tire force', () => {
  const force = evaluateTireForce(
    200,
    FR_VEHICLE_PROFILE.frontWheelRadius,
    30,
    8,
    0,
    1,
    FR_VEHICLE_PROFILE.frontStation.tire,
  );
  assert.equal(force.fx, 0);
  assert.equal(force.fy, 0);
  assert.equal(force.fmax, 0);
});

test('M8.0 recovery reconstructs authoritative state without clearing nonexistent tire memory', () => {
  const { parent, height, car } = fixture();
  const recovery = createM5RecoveryState(car);
  recovery.lastSafeS = car.course.s;
  car.velocityX = 12;
  car.velocityY = -8;
  car.velocityZ = -4;
  car.pitch = 0.4;
  car.pitchRate = 1.2;

  recoverM5Vehicle(recovery, parent.guide, height, parent.surfaceMap, car, 'manual');

  assert.equal('frontLateralForce' in car, false);
  assert.equal('rearLateralForce' in car, false);
  assert.equal(car.pitchRate, 0);
  assert.equal(car.control.frontUtilization, 0);
  assert.equal(car.control.rearUtilization, 0);
  assert.equal(car.supported, true);
});
