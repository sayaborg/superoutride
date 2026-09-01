import assert from 'node:assert/strict';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import {
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
} from '../dist/physics/vehicle-profiles.js';
import { evaluateTireForce } from '../dist/physics/tire-wheel.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);

function createProbe(speed = 10, profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE) {
  return createArcadeVehicle(
    profile,
    highway.guide,
    flatHeight,
    highway.surfaceMap,
    800,
    -1.75,
    speed,
  );
}

function step(vehicle, input) {
  updateArcadeVehicle(highway.guide, flatHeight, highway.surfaceMap, vehicle, input, DT);
}

test('short throttle input produces intermediate delivered wheel torque and finite release', () => {
  const vehicle = createProbe();
  step(vehicle, { steering: 0, throttle: true, brake: false });
  const shortTorque = vehicle.control.deliveredDriveTorque;
  assert.ok(vehicle.actuator.throttle > 0 && vehicle.actuator.throttle < 1);
  assert.ok(shortTorque > 0);

  for (let tick = 1; tick < 15; tick += 1) {
    step(vehicle, { steering: 0, throttle: true, brake: false });
  }
  assert.equal(vehicle.actuator.throttle, 1);
  assert.ok(vehicle.control.deliveredDriveTorque > shortTorque);

  let previousActuator = vehicle.actuator.throttle;
  for (let tick = 0; tick < 8; tick += 1) {
    step(vehicle, { steering: 0, throttle: false, brake: false });
    assert.ok(vehicle.actuator.throttle <= previousActuator);
    previousActuator = vehicle.actuator.throttle;
  }
  assert.equal(vehicle.actuator.throttle, 0);
  assert.equal(vehicle.control.deliveredDriveTorque, 0);
});

test('repeated digital throttle taps sustain deterministic intermediate demand', () => {
  const replay = () => {
    const vehicle = createProbe();
    let actuatorSum = 0;
    let maximumTorque = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      step(vehicle, {
        steering: 0,
        throttle: tick % 3 < 2,
        brake: false,
      });
      actuatorSum += vehicle.actuator.throttle;
      maximumTorque = Math.max(maximumTorque, vehicle.control.deliveredDriveTorque);
    }
    return {
      meanActuator: actuatorSum / 120,
      maximumTorque,
      speed: vehicle.speed,
    };
  };
  const result = replay();
  assert.deepEqual(result, replay());
  assert.ok(result.meanActuator > 0 && result.meanActuator < 1);
  assert.ok(result.maximumTorque > 0);
});

test('AWD fixed torque split changes tire utilization and the resulting handling trajectory', () => {
  const rearDrive = createProbe(20, FERRARI_TESTAROSSA_VEHICLE_PROFILE);
  const allWheelDrive = createProbe(20, LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE);
  for (let tick = 0; tick < 60; tick += 1) {
    const input = { steering: 0.45, throttle: true, brake: false };
    step(rearDrive, input);
    step(allWheelDrive, input);
  }

  assert.ok(allWheelDrive.control.frontUtilization > rearDrive.control.frontUtilization);
  assert.ok(allWheelDrive.control.rearUtilization < rearDrive.control.rearUtilization);
  assert.ok(
    Math.abs(allWheelDrive.frontWheelOmega - allWheelDrive.rearWheelOmega)
      < Math.abs(rearDrive.frontWheelOmega - rearDrive.rearWheelOmega),
  );
  assert.notEqual(allWheelDrive.course.l, rearDrive.course.l);
  assert.notEqual(allWheelDrive.yawRate, rearDrive.yawRate);
});

test('brake actuator produces partial torque, physical lock and continuous release', () => {
  const vehicle = createProbe(30);
  step(vehicle, { steering: 0.2, throttle: false, brake: true });
  assert.ok(vehicle.actuator.brake > 0 && vehicle.actuator.brake < 1);
  assert.ok(vehicle.control.frontBrakeTorque > 0);
  assert.ok(vehicle.control.frontBrakeTorque < FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontBrakeTorqueMax);

  for (let tick = 1; tick < 90; tick += 1) {
    step(vehicle, { steering: 0.2, throttle: false, brake: true });
  }
  assert.equal(vehicle.actuator.brake, 1);
  assert.equal(vehicle.control.frontBrakeTorque, FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontBrakeTorqueMax);
  assert.equal(vehicle.control.rearWheelLocked || vehicle.control.frontWheelLocked, true);

  let previousTorque = vehicle.control.frontBrakeTorque;
  for (let tick = 0; tick < 6; tick += 1) {
    step(vehicle, { steering: 0, throttle: false, brake: false });
    assert.ok(vehicle.control.frontBrakeTorque <= previousTorque);
    previousTorque = vehicle.control.frontBrakeTorque;
  }
  assert.equal(vehicle.control.frontBrakeTorque, 0);
  assert.equal(vehicle.control.rearBrakeTorque, 0);
});

test('common vehicle boundary rejects contradictory canonical pedals before actuator or wheel torque', () => {
  const vehicle = createProbe(20);
  assert.throws(
    () => step(vehicle, { steering: 0.3, throttle: true, brake: true }),
    /mutually exclusive/,
  );
  assert.deepEqual(vehicle.actuator, { steering: 0, throttle: 0, brake: 0 });
});

test('one-k tire has symmetric longitudinal plateau, no post-peak drop and combined-slip allocation', () => {
  const tire = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontStation.tire;
  const radius = FERRARI_TESTAROSSA_VEHICLE_PROFILE.frontWheelRadius;
  const normalLoad = 6_000;
  const positive = evaluateTireForce(300, radius, 30, 0, normalLoad, 1, tire);
  const morePositive = evaluateTireForce(600, radius, 30, 0, normalLoad, 1, tire);
  const negative = evaluateTireForce(-300, radius, 30, 0, normalLoad, 1, tire);
  assert.ok(Math.abs(positive.fx - positive.fmax) < 1e-9);
  assert.ok(Math.abs(negative.fx + negative.fmax) < 1e-9);
  assert.ok(Math.abs(Math.abs(positive.fx) - Math.abs(negative.fx)) < 1e-9);
  assert.ok(Math.abs(morePositive.fx) >= Math.abs(positive.fx) - 1e-9);

  const pureLateral = evaluateTireForce(30 / radius, radius, 30, 5, normalLoad, 1, tire);
  const combined = evaluateTireForce(300, radius, 30, 5, normalLoad, 1, tire);
  assert.ok(Math.abs(combined.fy) < Math.abs(pureLateral.fy));
  assert.ok(Math.abs(combined.fx) > 0);
});
