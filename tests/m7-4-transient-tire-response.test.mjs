import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { M5_CAR_PROFILE, createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

function createFlatHighwayCar() {
  const parent = createM72DefaultBranchingParent();
  const height = new HeightProfile(parent.guide.length, [
    { s: 0, y: 0 },
    { s: parent.guide.length, y: 0 },
  ]);
  return {
    parent,
    height,
    car: createM5Car(parent.guide, height, parent.surfaceMap, 800, -1.75),
  };
}

test('M7.4 axle lateral force is explicit model-specific transient state', async () => {
  const { car } = createFlatHighwayCar();
  assert.equal(car.frontLateralForce, 0);
  assert.equal(car.rearLateralForce, 0);
  assert.equal(M5_CAR_PROFILE.frontLateralRelaxationLength, 1.6);
  assert.equal(M5_CAR_PROFILE.rearLateralRelaxationLength, 1.2);
  assert.equal(M5_CAR_PROFILE.lateralForceMinimumTau, 0.025);
  assert.equal(M5_CAR_PROFILE.lateralForceMaximumTau, 0.16);

  const common = await readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(common, /frontLateralForce|rearLateralForce|LateralRelaxationLength/);
});

test('M7.4 digital steering produces progressive force onset and a bounded release transient', () => {
  const { parent, height, car } = createFlatHighwayCar();
  const dt = 1 / 60;
  let previousAcceleration = 0;
  let maxAccelerationJerk = 0;
  let maxAbsSideslipDegrees = 0;
  let forceAtRelease = 0;
  let forceOneTickAfterRelease = 0;

  for (let tick = 0; tick < 120; tick += 1) {
    updateM5Car(
      parent.guide,
      height,
      parent.surfaceMap,
      car,
      { steering: tick < 6 ? 1 : 0, throttle: false, brake: false },
      dt,
    );
    if (tick === 5) forceAtRelease = car.frontLateralForce;
    if (tick === 6) forceOneTickAfterRelease = car.frontLateralForce;
    maxAccelerationJerk = Math.max(
      maxAccelerationJerk,
      Math.abs(car.lateralAcceleration - previousAcceleration) / dt,
    );
    previousAcceleration = car.lateralAcceleration;
    maxAbsSideslipDegrees = Math.max(
      maxAbsSideslipDegrees,
      Math.abs(Math.atan2(car.lateralSpeed, Math.max(0.01, car.longitudinalSpeed)) * 180 / Math.PI),
    );
  }

  assert.ok(forceAtRelease > 0);
  assert.ok(forceOneTickAfterRelease > forceAtRelease * 0.5);
  assert.ok(maxAccelerationJerk < 35, `lateral acceleration jerk ${maxAccelerationJerk.toFixed(3)}m/s^3`);
  assert.ok(maxAbsSideslipDegrees < 2.5, `tap sideslip ${maxAbsSideslipDegrees.toFixed(3)}deg`);
  assert.ok(Math.abs(car.yawRate * 180 / Math.PI) < 0.2);
  assert.ok(Math.abs(car.lateralAcceleration) < 0.05);
});

test('M7.4 an airborne axle cannot retain or manufacture tire force', () => {
  const { parent, height, car } = createFlatHighwayCar();
  car.frontLateralForce = 4000;
  car.contacts[0].phase = 'AIRBORNE';

  updateM5Car(
    parent.guide,
    height,
    parent.surfaceMap,
    car,
    { steering: 1, throttle: false, brake: false },
    1 / 60,
  );

  assert.equal(car.frontLateralForce, 0);
  assert.equal(car.contacts[0].normalLoad, 0);
  assert.ok(car.contacts[1].normalLoad > 0);
});

test('M7.4 recovery clears car tire-force memory', () => {
  const { parent, height, car } = createFlatHighwayCar();
  const recovery = createM5RecoveryState(car);
  car.frontLateralForce = 3200;
  car.rearLateralForce = -2100;
  recovery.lastSafeS = car.course.s;

  recoverM5Vehicle(recovery, parent.guide, height, parent.surfaceMap, car, 'manual');

  assert.equal(car.frontLateralForce, 0);
  assert.equal(car.rearLateralForce, 0);
});
