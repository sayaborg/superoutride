import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import {
  BIKE1_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  createTestCar,
  updateTestVehicle,
} from './helpers/vehicle-fixture.mjs';
import { SURFACE_MATERIALS } from '../dist/physics/surface-map.js';
import { radialC1Magnitude, usefulLateralCapacity } from '../dist/physics/tire-wheel.js';
import { createVehicleDebugHudModel } from '../dist/browser/vehicle-debug-hud.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

test('M8.0 SurfaceMap owns relative grip while tire profiles own reference friction', () => {
  assert.equal(SURFACE_MATERIALS.ASPHALT.gripFactor, 1.00);
  assert.equal(SURFACE_MATERIALS.SHOULDER.gripFactor, 0.78);
  assert.equal(SURFACE_MATERIALS.GRASS.gripFactor, 0.43);
  assert.equal(SURFACE_MATERIALS.DIRT.gripFactor, 0.52);
  assert.equal(SURFACE_MATERIALS.SAND.gripFactor, 0.33);
  assert.ok(SURFACE_MATERIALS.ASPHALT.gripFactor > SURFACE_MATERIALS.SHOULDER.gripFactor);
  assert.ok(SURFACE_MATERIALS.SHOULDER.gripFactor > SURFACE_MATERIALS.GRASS.gripFactor);
  assert.equal(BIKE1_VEHICLE_PROFILE.muRef, 1.25);
  assert.equal('friction' in SURFACE_MATERIALS.ASPHALT, false);
  assert.equal('driveScale' in SURFACE_MATERIALS.ASPHALT, false);
});

test('M8.0 front-tire linear capacity stays inside the shared one-k radial knee', () => {
  assert.ok(FR_VEHICLE_PROFILE.frontNormalizedStiffness < FR_VEHICLE_PROFILE.rearNormalizedStiffness);
  const frontNormal = FR_VEHICLE_PROFILE.mass * 9.80665 * FR_VEHICLE_PROFILE.rearAxle
    / (FR_VEHICLE_PROFILE.frontAxle + FR_VEHICLE_PROFILE.rearAxle);
  const capacity = usefulLateralCapacity(
    0,
    frontNormal,
    SURFACE_MATERIALS.ASPHALT.gripFactor,
    FR_VEHICLE_PROFILE.frontStation.tire,
  );
  assert.ok(Math.abs(capacity - FR_VEHICLE_PROFILE.rhoKnee * FR_VEHICLE_PROFILE.muRef * frontNormal) < 1e-9);
});

test('FR calibration keeps the broad shoulder with a lightweight high-grip profile', () => {
  const pureLateralAngles = (normalizedStiffness) => ({
    linearEnd: Math.atan(
      FR_VEHICLE_PROFILE.rhoKnee * FR_VEHICLE_PROFILE.muRef / normalizedStiffness,
    ) * 180 / Math.PI,
    plateauStart: Math.atan(
      (2 - FR_VEHICLE_PROFILE.rhoKnee) * FR_VEHICLE_PROFILE.muRef / normalizedStiffness,
    ) * 180 / Math.PI,
  });
  const front = pureLateralAngles(FR_VEHICLE_PROFILE.frontNormalizedStiffness);
  const rear = pureLateralAngles(FR_VEHICLE_PROFILE.rearNormalizedStiffness);

  assert.ok(front.linearEnd > 6.3 && front.plateauStart > 10.6);
  assert.ok(rear.linearEnd > 5.4 && rear.plateauStart > 9.1);
  assert.ok(front.plateauStart - front.linearEnd > 4.3);
  assert.ok(rear.plateauStart - rear.linearEnd > 3.7);
  assert.equal(FR_VEHICLE_PROFILE.mass, 1310);
  assert.equal(FR_VEHICLE_PROFILE.rhoKnee, 0.74);
  assert.equal(FR_VEHICLE_PROFILE.muRef, 1.35);
  assert.ok(Math.abs(FR_VEHICLE_PROFILE.rhoKnee * FR_VEHICLE_PROFILE.muRef - 0.999) < 1e-12);
  assert.equal(radialC1Magnitude(20, FR_VEHICLE_PROFILE.rhoKnee), 1);
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

test('shared compact HUD names speed RPM and selected gear', () => {
  const parent = createM72DefaultBranchingParent();
  const car = createTestCar(parent.guide, parent.heightProfile, parent.surfaceMap, 45, -1.75);
  car.powertrain.engineRpm = 4321;
  car.powertrain.gear = 4;
  const hud = createVehicleDebugHudModel(
    'BRANCHING',
    { steering: 0, throttle: false, brake: false },
    car,
  );
  assert.equal(hud.instruments, 'SPD 162km/h  RPM  4321  GEAR 4');

  for (const entry of ['main-linear.ts', 'main.ts', 'main-circuit.ts']) {
    const source = fs.readFileSync(new URL(`../src/${entry}`, import.meta.url), 'utf8');
    assert.match(source, /drawVehicleDebugHud\(/);
  }
});

test('shared compact HUD omits retired suspension torque slip route and topology overlays', () => {
  const source = fs.readFileSync(new URL('../src/browser/vehicle-debug-hud.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /SUSP|DRV|TORQUE|SLIP|ROUTE|PENDING|WINDOW|CHECKPOINT/);
  assert.doesNotMatch(source, /requestedInput|actualInput|formatPercent/);
  assert.match(source, /drawVehicleControlGraphics\(/);
});
