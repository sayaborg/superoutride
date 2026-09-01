import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import {
  HONDA_VFR750R_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../dist/physics/vehicle-profiles.js';
import {
  evaluateTireForce,
  rollingResistanceTorque,
  solveWheelOmega,
} from '../dist/physics/tire-wheel.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);

test('M9 profiles compile to the same two-station contact and wheel contract', () => {
  for (const profile of [FERRARI_TESTAROSSA_VEHICLE_PROFILE, HONDA_VFR750R_VEHICLE_PROFILE]) {
    assert.deepEqual([profile.frontStation.id, profile.rearStation.id], ['FRONT', 'REAR']);
    assert.equal(profile.frontStation.rollingRadius, profile.frontWheelRadius);
    assert.equal(profile.rearStation.rollingRadius, profile.rearWheelRadius);
    assert.ok(profile.frontStation.suspension.qTravel > profile.frontStation.suspension.qStatic);
    assert.ok(profile.rearStation.suspension.qTravel > profile.rearStation.suspension.qStatic);
  }
  assert.notEqual(FERRARI_TESTAROSSA_VEHICLE_PROFILE.mass, HONDA_VFR750R_VEHICLE_PROFILE.mass);
  assert.notEqual(FERRARI_TESTAROSSA_VEHICLE_PROFILE.yawInertia, HONDA_VFR750R_VEHICLE_PROFILE.yawInertia);
});

test('one-k tire and wheel solve remains immediate deterministic contact physics', () => {
  const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontStation.tire;
  const loaded = evaluateTireForce(100, 0.33, 30, 2, 6500, 1, tire);
  assert.deepEqual(evaluateTireForce(100, 0.33, 30, 2, 6500, 1, tire), loaded);
  assert.notEqual(loaded.fy, 0);
  assert.equal(evaluateTireForce(30 / 0.33, 0.33, 30, 0, 0, 1, tire).fy, 0);
  assert.ok(rollingResistanceTorque(100, 0.33, 6500, 0.015, 1) > 0);

  const wheel = solveWheelOmega({
    omegaPrevious: 30 / 0.33,
    inertia: 2.2,
    rollingRadius: 0.33,
    longitudinalVelocity: 30,
    lateralVelocity: 0,
    normalLoad: 6500,
    gripFactor: 1,
    rollingResistance: 0.015,
    driveTorque: 200,
    brakeTorque: 0,
    dt: 1 / 720,
    tire,
  });
  assert.ok(Number.isFinite(wheel.omega));
  assert.ok(Number.isFinite(wheel.tire.fx));
});

for (const profile of [FERRARI_TESTAROSSA_VEHICLE_PROFILE, HONDA_VFR750R_VEHICLE_PROFILE]) {
  test(`${profile.id} common solve preserves finite world/contact state under held input`, () => {
    const vehicle = createArcadeVehicle(
      profile,
      highway.guide,
      flatHeight,
      highway.surfaceMap,
      800,
      -1.75,
      25,
    );
    for (let tick = 0; tick < 120; tick += 1) {
      updateArcadeVehicle(
        highway.guide,
        flatHeight,
        highway.surfaceMap,
        vehicle,
        { steering: 0.25, throttle: true, brake: false },
        1 / 60,
      );
    }
    for (const value of [
      vehicle.x,
      vehicle.y,
      vehicle.z,
      vehicle.velocityX,
      vehicle.velocityY,
      vehicle.velocityZ,
      vehicle.frontWheelOmega,
      vehicle.rearWheelOmega,
    ]) assert.ok(Number.isFinite(value));
    assert.equal('orientation' in vehicle, false);
    assert.equal('omegaBody' in vehicle, false);
    assert.equal('contacts' in vehicle, false);
  });
}

test('recovery reconstructs common state and all three actuators without manufacturing progress', () => {
  const vehicle = createArcadeVehicle(
    HONDA_VFR750R_VEHICLE_PROFILE,
    highway.guide,
    flatHeight,
    highway.surfaceMap,
    800,
    -1.75,
    25,
  );
  const recovery = createM5RecoveryState(vehicle);
  recovery.lastSafeS = vehicle.course.s;
  vehicle.actuator.steering = -1;
  vehicle.actuator.throttle = 1;
  vehicle.actuator.brake = 1;
  vehicle.pitchRate = 2;
  vehicle.yawRate = -2;
  vehicle.steeringAssist.yawRateBaseline = 3;
  recoverM5Vehicle(recovery, highway.guide, flatHeight, highway.surfaceMap, vehicle, 'manual');
  assert.deepEqual(vehicle.actuator, { steering: 0, throttle: 0, brake: 0 });
  assert.equal(vehicle.pitchRate, 0);
  assert.equal(vehicle.yawRate, 0);
  assert.equal(vehicle.steeringAssist.yawRateBaseline, vehicle.yawRate);
  assert.ok(Math.abs(vehicle.course.s - recovery.lastSafeS) < 1e-6);
});

test('profile compiler rejects invalid mechanics without vehicle-specific fallback paths', () => {
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_PROFILE, frontWheelInertia: 0 }),
    /finite and > 0/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({ ...HONDA_VFR750R_VEHICLE_PROFILE, rhoKnee: 1 }),
    /rhoKnee/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_PROFILE, frontDriveTorqueFraction: 1.1 }),
    /front drive torque fraction/,
  );
});

test('common mechanics owns no quaternion Rider assist or vehicle-kind branch authority', async () => {
  const [solver, profiles, dynamics] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-profiles.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8'),
  ]);
  const common = `${solver}\n${profiles}\n${dynamics}`;
  assert.doesNotMatch(common, /Quaternion|quaternion|Rider|riderK|crownRadius|ABS|TCS/);
  assert.doesNotMatch(solver, /profile\.id|vehicle\.kind|if\s*\([^)]*(?:FR|MR|RR|AWD|BIKE1|BIKE2)/);
  assert.doesNotMatch(common, /tractionControlActive|absActive/);
});
