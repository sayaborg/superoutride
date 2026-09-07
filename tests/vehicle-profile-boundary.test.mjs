import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { compileArcadeVehicleProfile } from '../dist/physics/vehicle-profiles.js';
import * as compiler from '../dist/physics/vehicle-profiles.js';
import { FERRARI_TESTAROSSA_VEHICLE_AUTHORING } from '../dist/vehicle/production-vehicle-profiles.js';
import { createM83LinearHighwayRuntime } from '../dist/dev/m8-3-linear-highway.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';

test('an additional opaque content identity compiles and drives without catalog membership', () => {
  const profile = compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_AUTHORING, id: 'audit-synthetic-10' });
  const { guide, heightProfile: height, surfaceMap: surfaces } = createM83LinearHighwayRuntime();
  const vehicle = createArcadeVehicle(profile, guide, height, surfaces, 45, 0, 15);
  for (let tick = 0; tick < 60; tick++) {
    updateArcadeVehicle(guide, height, surfaces, vehicle,
      { steering: 0, throttle: 1, brake: 0 }, 1 / 60);
  }
  assert.equal(vehicle.profile.id, 'audit-synthetic-10');
  assert.ok(Number.isFinite(vehicle.x + vehicle.y + vehicle.z + vehicle.yaw));
  assert.ok(vehicle.course.s > 45);
  for (const id of ['', ' ', ' leading', 'trailing ', null, 42]) {
    assert.throws(() => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_AUTHORING, id }), /profile id/);
  }
});

test('mechanics owns no production records, membership list or upward content import', async () => {
  assert.deepEqual(Object.keys(compiler).sort(), ['compileArcadeVehicleProfile', 'drivenWheelOmega']);
  for (const name of await readdir(new URL('../src/physics/', import.meta.url))) {
    if (!name.endsWith('.ts')) continue;
    const source = await readFile(new URL(`../src/physics/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:from|import\s*\()\s*['"][^'"]*(?:\/vehicle\/|production-vehicle-profiles|vehicle-catalog)/, name);
  }
  const source = await readFile(new URL('../src/physics/vehicle-profiles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /TESTAROSSA|VFR750R|COMMON_SELECTABLE_VEHICLE_TIRE/);
  assert.match(source, /type VehicleProfileId = string/);
  assert.doesNotMatch(source, /presentationFamily|VehiclePresentationFamily/);
});

test('compiled profiles expose one resolved station authority, not authored wheel/tire/suspension copies', () => {
  const authored = { ...FERRARI_TESTAROSSA_VEHICLE_AUTHORING,
    frontWheelRadius: .37, rearWheelRadius: .41,
    frontWheelInertia: 3, rearWheelInertia: 4,
    frontBrakeTorqueMax: 111, rearBrakeTorqueMax: 222,
    unexpectedAuthoringField: 'must not leak' };
  const profile = compileArcadeVehicleProfile(authored);
  for (const key of ['frontWheelRadius', 'rearWheelRadius', 'frontWheelInertia', 'rearWheelInertia',
    'frontBrakeTorqueMax', 'rearBrakeTorqueMax', 'frontRideFrequency', 'rearRideFrequency',
    'frontTire', 'rearTire', 'lowSpeedRegularization', 'unexpectedAuthoringField']) {
    assert.equal(Object.hasOwn(profile, key), false, key);
  }
  assert.deepEqual([profile.frontStation.rollingRadius, profile.rearStation.rollingRadius], [.37, .41]);
  assert.deepEqual([profile.frontStation.wheelInertia, profile.rearStation.wheelInertia], [3, 4]);
  assert.deepEqual([profile.frontStation.maxBrakeTorque, profile.rearStation.maxBrakeTorque], [111, 222]);
  const { guide, heightProfile: height, surfaceMap: surfaces } = createM83LinearHighwayRuntime();
  const vehicle = createArcadeVehicle(profile, guide, height, surfaces, 45, 0, 15);
  assert.equal(vehicle.frontWheelOmega, 15 / .37);
  assert.equal(vehicle.rearWheelOmega, 15 / .41);
  for (let i = 0; i < 20; i++) updateArcadeVehicle(guide, height, surfaces, vehicle,
    { steering: 0, throttle: 0, brake: 1 }, 1 / 60);
  assert.equal(vehicle.control.requestedFrontBrakeTorque, vehicle.actuator.brake * 111);
  assert.equal(vehicle.control.requestedRearBrakeTorque, vehicle.actuator.brake * 222);
});
