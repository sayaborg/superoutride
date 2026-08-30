import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import {
  BIKE_VEHICLE_PROFILE,
  CAR_VEHICLE_PROFILE,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';
import { SURFACE_MATERIALS } from '../dist/physics/surface-map.js';
import { radialC1Magnitude, usefulLateralCapacity } from '../dist/physics/tire-wheel.js';
import {
  formatVehicleControlHud,
  formatVehicleSuspensionHud,
} from '../dist/render/vehicle-control-hud.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

test('M8.0 SurfaceMap owns relative grip while tire profiles own reference friction', () => {
  assert.equal(SURFACE_MATERIALS.ASPHALT.gripFactor, 1.00);
  assert.equal(SURFACE_MATERIALS.SHOULDER.gripFactor, 0.78);
  assert.equal(SURFACE_MATERIALS.GRASS.gripFactor, 0.43);
  assert.equal(SURFACE_MATERIALS.DIRT.gripFactor, 0.52);
  assert.equal(SURFACE_MATERIALS.SAND.gripFactor, 0.33);
  assert.ok(SURFACE_MATERIALS.ASPHALT.gripFactor > SURFACE_MATERIALS.SHOULDER.gripFactor);
  assert.ok(SURFACE_MATERIALS.SHOULDER.gripFactor > SURFACE_MATERIALS.GRASS.gripFactor);
  assert.equal(BIKE_VEHICLE_PROFILE.muRef, 1.25);
  assert.equal('friction' in SURFACE_MATERIALS.ASPHALT, false);
  assert.equal('driveScale' in SURFACE_MATERIALS.ASPHALT, false);
});

test('M8.0 front-tire linear capacity stays inside the shared one-k radial knee', () => {
  assert.ok(CAR_VEHICLE_PROFILE.frontNormalizedStiffness < CAR_VEHICLE_PROFILE.rearNormalizedStiffness);
  const frontNormal = CAR_VEHICLE_PROFILE.mass * 9.80665 * CAR_VEHICLE_PROFILE.rearAxle
    / (CAR_VEHICLE_PROFILE.frontAxle + CAR_VEHICLE_PROFILE.rearAxle);
  const capacity = usefulLateralCapacity(
    0,
    frontNormal,
    SURFACE_MATERIALS.ASPHALT.gripFactor,
    CAR_VEHICLE_PROFILE.frontStation.tire,
  );
  assert.ok(Math.abs(capacity - CAR_VEHICLE_PROFILE.rhoKnee * CAR_VEHICLE_PROFILE.muRef * frontNormal) < 1e-9);
});

test('CAR calibration keeps the broad shoulder with a lightweight high-grip profile', () => {
  const pureLateralAngles = (normalizedStiffness) => ({
    linearEnd: Math.atan(
      CAR_VEHICLE_PROFILE.rhoKnee * CAR_VEHICLE_PROFILE.muRef / normalizedStiffness,
    ) * 180 / Math.PI,
    plateauStart: Math.atan(
      (2 - CAR_VEHICLE_PROFILE.rhoKnee) * CAR_VEHICLE_PROFILE.muRef / normalizedStiffness,
    ) * 180 / Math.PI,
  });
  const front = pureLateralAngles(CAR_VEHICLE_PROFILE.frontNormalizedStiffness);
  const rear = pureLateralAngles(CAR_VEHICLE_PROFILE.rearNormalizedStiffness);

  assert.ok(front.linearEnd > 6.3 && front.plateauStart > 10.6);
  assert.ok(rear.linearEnd > 5.4 && rear.plateauStart > 9.1);
  assert.ok(front.plateauStart - front.linearEnd > 4.3);
  assert.ok(rear.plateauStart - rear.linearEnd > 3.7);
  assert.equal(CAR_VEHICLE_PROFILE.mass, 1310);
  assert.equal(CAR_VEHICLE_PROFILE.rhoKnee, 0.74);
  assert.equal(CAR_VEHICLE_PROFILE.muRef, 1.35);
  assert.ok(Math.abs(CAR_VEHICLE_PROFILE.rhoKnee * CAR_VEHICLE_PROFILE.muRef - 0.999) < 1e-12);
  assert.equal(radialC1Magnitude(20, CAR_VEHICLE_PROFILE.rhoKnee), 1);
});

test('M7.3 one 100 ms digital steering tap remains inside the first paved lane-change response envelope', () => {
  const parent = createM72DefaultBranchingParent();
  const flatHeight = new HeightProfile(parent.guide.length, [
    { s: 0, y: 0 },
    { s: parent.guide.length, y: 0 },
  ]);
  const car = createTestCar(parent.guide, flatHeight, parent.surfaceMap, 800, -1.75);
  let maxAbsSideslipDegrees = 0;

  for (let tick = 0; tick < 60; tick += 1) {
    updateTestVehicle(
      parent.guide,
      flatHeight,
      parent.surfaceMap,
      car,
      { steering: tick < 6 ? 1 : 0, throttle: false, brake: false },
      1 / 60,
    );
    maxAbsSideslipDegrees = Math.max(
      maxAbsSideslipDegrees,
      Math.abs(Math.atan2(car.lateralSpeed, Math.max(0.01, car.longitudinalSpeed)) * 180 / Math.PI),
    );
  }

  assert.equal(car.supported, true);
  assert.equal(car.surfaceType, 'ASPHALT');
  assert.ok(maxAbsSideslipDegrees < 2.5, `tap sideslip ${maxAbsSideslipDegrees.toFixed(3)}deg`);
});

test('M7.3 always-visible instrument line names speed RPM automatic transmission and selected gear', () => {
  const parent = createM72DefaultBranchingParent();
  const car = createTestCar(parent.guide, parent.heightProfile, parent.surfaceMap, 45, -1.75);
  car.powertrain.engineRpm = 4321;
  car.powertrain.gear = 4;
  const hud = formatVehicleControlHud(car.control, car.powertrain, car.speed);
  assert.equal(hud.instruments, 'SPD 162km/h RPM  4321 AT GEAR 4');

  for (const entry of ['main.ts', 'main-circuit.ts']) {
    const source = fs.readFileSync(new URL(`../src/${entry}`, import.meta.url), 'utf8');
    assert.match(source, /ctx\.fillText\(controlHud\.instruments, 8, 36\)/);
  }
});

test('front and rear road gaps expose signed station height and suspension compression', () => {
  assert.equal(
    formatVehicleSuspensionHud({ frontGap: -0.0714, rearGap: 0.1234 }),
    'SUSP F H-0.071m Q0.071m R H+0.123m Q0.000m',
  );

  const branching = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const circuit = fs.readFileSync(new URL('../src/main-circuit.ts', import.meta.url), 'utf8');
  assert.match(branching, /ctx\.fillText\(suspensionHud, 8, 96\)/);
  assert.match(circuit, /ctx\.fillText\(suspensionHud, 8, 132\)/);
});
