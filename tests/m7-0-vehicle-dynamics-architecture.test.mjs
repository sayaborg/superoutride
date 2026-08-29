import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
} from '../dist/physics/automatic-powertrain.js';
import { M5_CAR_PROFILE, createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { M5_BIKE_PROFILE, createM5Bike } from '../dist/physics/motorcycle-physics.js';
import { bodyFrameVelocity } from '../dist/physics/vehicle-dynamics.js';
import { formatVehicleControlHud } from '../dist/render/vehicle-control-hud.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const guide = createM2StadiumGuide();
const height = new HeightProfile(guide.length, [{ s: 0, y: 0 }, { s: guide.length, y: 0 }]);
const surfaces = createM5DebugSurfaceMap(guide.length);

function carBasis(car) {
  return {
    forward: { x: Math.sin(car.yaw), y: 0, z: Math.cos(car.yaw) },
    right: { x: Math.cos(car.yaw), y: 0, z: -Math.sin(car.yaw) },
  };
}

test('M8.0 world velocity is authoritative while body velocity is a derived observation', () => {
  const car = createM5Car(guide, height, surfaces, 90, 0, 0);
  const { forward, right } = carBasis(car);
  car.velocityX = forward.x * 31 + right.x * -4;
  car.velocityY = 2;
  car.velocityZ = forward.z * 31 + right.z * -4;
  const world = { x: car.velocityX, y: car.velocityY, z: car.velocityZ };
  const first = bodyFrameVelocity(car, forward, right);
  assert.deepEqual(first, { longitudinal: 31, lateral: -4, vertical: 2 });

  car.yaw += 0.25;
  const rotated = carBasis(car);
  assert.deepEqual({ x: car.velocityX, y: car.velocityY, z: car.velocityZ }, world);
  assert.notDeepEqual(bodyFrameVelocity(car, rotated.forward, rotated.right), first);
});

test('M8.0 support geography does not manufacture contact below an airborne body', () => {
  const car = createM5Car(guide, height, surfaces, 120, 0, 0);
  car.y += 3;
  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: false, brake: false }, 1 / 60);

  assert.equal(car.frontSupportAvailable, true);
  assert.equal(car.rearSupportAvailable, true);
  assert.equal(car.frontNormalLoad, 0);
  assert.equal(car.rearNormalLoad, 0);
  assert.equal(car.supported, false);
  assert.ok(car.velocityY < 0);
  assert.equal('contacts' in car, false);
});

test('M8.0 CAR is five-DOF/two-station while BIKE owns quaternion and crown state', () => {
  const car = createM5Car(guide, height, surfaces, 90);
  const bike = createM5Bike(guide, height, surfaces, 90);
  assert.deepEqual([M5_CAR_PROFILE.frontStation.id, M5_CAR_PROFILE.rearStation.id], ['FRONT', 'REAR']);
  assert.equal('roll' in car, false);
  assert.equal('orientation' in car, false);
  assert.equal('orientation' in bike, true);
  assert.equal('omegaBody' in bike, true);
  assert.ok(M5_BIKE_PROFILE.frontCrownRadius > M5_BIKE_PROFILE.frontStation.suspension.qStatic);
  assert.ok(M5_BIKE_PROFILE.frontCrownRadius < M5_BIKE_PROFILE.frontRollingRadius);
  assert.equal('contacts' in bike, false);
});

test('M8.1 digital effort produces continuous steering and neutral self-countersteer', () => {
  const car = createM5Car(guide, height, surfaces, 90);
  updateM5Car(guide, height, surfaces, car, { steering: 1, throttle: false, brake: false }, 1 / 60);
  const first = car.control.actualSteerAngle;
  assert.ok(first > 0 && first < M5_CAR_PROFILE.maxRoadWheelSteer);

  const speed = 25;
  car.yaw = 0.15;
  car.velocityX = 0;
  car.velocityY = 0;
  car.velocityZ = speed;
  car.frontWheelOmega = speed / M5_CAR_PROFILE.wheelRadius;
  car.rearWheelOmega = speed / M5_CAR_PROFILE.wheelRadius;
  car.frontSteerAngle = 0;
  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: false, brake: false }, 1 / 60);
  assert.ok(car.control.frontSlipAngle > 0);
  assert.ok(car.control.actualSteerAngle < 0, 'neutral effort must countersteer toward zero front slip');
});

test('M8.0 HUD exposes physical torque lock and utilization telemetry without hidden assists', () => {
  const car = createM5Car(guide, height, surfaces, 300, 8, 10);
  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: true, brake: false }, 1 / 60);
  assert.ok(car.control.requestedDriveTorque >= 0);
  assert.equal('tractionControlActive' in car.control, false);
  assert.equal('absActive' in car.control, false);
  const hud = formatVehicleControlHud(car.control, car.powertrain, car.speed);
  assert.match(hud.steering, /^ST \[/);
  assert.match(hud.pedals, /^DRV\s+\d+Nm BRK \d+\/\d+Nm/);
  assert.match(hud.instruments, /^SPD\s+\d+km\/h RPM\s+\d+ AT GEAR \d+/);
});

test('M8.0 automatic transmission output is wheel torque and shifts below redline', () => {
  const profile = {
    idleRpm: 10,
    redlineRpm: 12000,
    upshiftRpm: 9000,
    downshiftRpm: 30,
    shiftDuration: 0.1,
    engineResponseTau: 0.001,
    torqueConverterSlipRpm: 0,
    finalDriveRatio: 1,
    efficiency: 1,
    gearRatios: [2, 1],
    torqueCurve: [
      { rpm: 0, torqueNewtonMeters: 100 },
      { rpm: 12000, torqueNewtonMeters: 100 },
    ],
  };
  const lowGear = createAutomaticPowertrainState(profile, 4);
  const highGear = createAutomaticPowertrainState(profile, 4);
  lowGear.gear = 1;
  highGear.gear = 2;
  assert.equal(updateAutomaticPowertrain(lowGear, profile, 4, 1, 1 / 60), 200);
  assert.equal(updateAutomaticPowertrain(highGear, profile, 4, 1, 1 / 60), 100);
  assert.equal('outputDriveForce' in lowGear, false);

  const shift = createAutomaticPowertrainState(profile, 10);
  shift.gear = 1;
  updateAutomaticPowertrain(shift, profile, 500, 1, 1 / 60);
  assert.equal(shift.gear, 2);
  assert.equal(shift.shiftDirection, 1);
  assert.equal(shift.outputDriveTorque, 0);
  assert.ok(shift.engineRpm <= profile.redlineRpm);
});

test('M8.0 common dynamics layer owns no concrete product camera renderer or route branch', async () => {
  const source = await readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8');
  const powertrain = await readFile(new URL('../src/physics/automatic-powertrain.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /car-physics|motorcycle-physics|gameplay|camera|render/);
  assert.doesNotMatch(source, /routeKind|CIRCUIT|BRANCHING|LINEAR/);
  assert.doesNotMatch(powertrain, /car-physics|motorcycle-physics|gameplay|camera|render/);
  assert.doesNotMatch(powertrain, /routeKind|CIRCUIT|BRANCHING|LINEAR/);
});
