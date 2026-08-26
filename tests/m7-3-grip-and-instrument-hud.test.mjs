import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { M5_CAR_PROFILE, createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { M5_BIKE_PROFILE } from '../dist/physics/motorcycle-physics.js';
import { SURFACE_MATERIALS } from '../dist/physics/surface-map.js';
import { formatVehicleControlHud } from '../dist/render/vehicle-control-hud.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

test('M7.3 raises shared paved grip while retaining the authored off-road hierarchy', () => {
  assert.equal(SURFACE_MATERIALS.ASPHALT.friction, 1.30);
  assert.equal(SURFACE_MATERIALS.SHOULDER.friction, 0.95);
  assert.equal(SURFACE_MATERIALS.GRASS.friction, 0.52);
  assert.equal(SURFACE_MATERIALS.DIRT.friction, 0.64);
  assert.equal(SURFACE_MATERIALS.SAND.friction, 0.40);
  assert.ok(SURFACE_MATERIALS.ASPHALT.friction > SURFACE_MATERIALS.SHOULDER.friction);
  assert.ok(SURFACE_MATERIALS.SHOULDER.friction > SURFACE_MATERIALS.GRASS.friction);
  assert.ok(SURFACE_MATERIALS.ASPHALT.friction * M5_BIKE_PROFILE.lateralGripScale >= 1.20);
});

test('M7.3 car useful-steer target does not extend beyond the linear front friction limit', () => {
  assert.equal(M5_CAR_PROFILE.frontSlipUtilization, 1.0);
  assert.equal(M5_CAR_PROFILE.steeringTau, 0.16);

  const frontNormal = M5_CAR_PROFILE.mass * 9.80665 * M5_CAR_PROFILE.rearAxle
    / (M5_CAR_PROFILE.frontAxle + M5_CAR_PROFILE.rearAxle);
  const frictionSlip = SURFACE_MATERIALS.ASPHALT.friction * frontNormal
    / M5_CAR_PROFILE.frontCornerStiffness;
  const requestedUsefulSlip = frictionSlip * M5_CAR_PROFILE.frontSlipUtilization;
  assert.ok(requestedUsefulSlip <= frictionSlip + 1e-12);
});

test('M7.3 one 100 ms digital steering tap remains inside the first paved lane-change response envelope', () => {
  const parent = createM72DefaultBranchingParent();
  const flatHeight = new HeightProfile(parent.guide.length, [
    { s: 0, y: 0 },
    { s: parent.guide.length, y: 0 },
  ]);
  const car = createM5Car(parent.guide, flatHeight, parent.surfaceMap, 800, -1.75);
  let maxAbsSideslipDegrees = 0;

  for (let tick = 0; tick < 60; tick += 1) {
    updateM5Car(
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
  const car = createM5Car(parent.guide, parent.heightProfile, parent.surfaceMap, 45, -1.75);
  car.powertrain.engineRpm = 4321;
  car.powertrain.gear = 4;
  const hud = formatVehicleControlHud(car.control, car.powertrain, car.speed);
  assert.equal(hud.instruments, 'SPD 162km/h RPM  4321 AT GEAR 4');

  for (const entry of ['main.ts', 'main-circuit.ts']) {
    const source = fs.readFileSync(new URL(`../src/${entry}`, import.meta.url), 'utf8');
    assert.match(source, /ctx\.fillText\(controlHud\.instruments, 8, 36\)/);
  }
});
