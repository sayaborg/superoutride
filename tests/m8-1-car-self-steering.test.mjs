import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import {
  createArcadeVehicle,
  stepTravelDirectionSteering,
  updateArcadeVehicle,
  vehicleBodyTravelDirection,
} from '../dist/physics/arcade-vehicle-physics.js';
import {
  BIKE1_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../dist/physics/vehicle-profiles.js';
import { regularizedTireSlipAngle, tireLinearDemand } from '../dist/physics/tire-wheel.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const wideSurface = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'M9 WIDE STEERING PROBE',
  bands: [{ lMin: -1_000, lMax: 1_000, type: 'ASPHALT' }],
}]);

test('regularized front slip observation matches the one-k lateral denominator', () => {
  const tire = FR_VEHICLE_PROFILE.frontStation.tire;
  const demand = tireLinearDemand(100, 0.33, 24, -2.4, tire);
  const angle = regularizedTireSlipAngle(24, -2.4, tire.lowSpeedRegularization);
  assert.ok(Math.abs(Math.tan(angle) - demand.sy) < 1e-12);
  assert.equal(Math.abs(regularizedTireSlipAngle(0, 0, tire.lowSpeedRegularization)), 0);
});

test('common body travel direction derives self-steering from authoritative CG velocity', () => {
  const body = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: -3, y: 0, z: 30 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    omegaWorld: { x: 0, y: 0.2, z: 0 },
  };
  const actual = vehicleBodyTravelDirection(body, FR_VEHICLE_PROFILE.lowSpeedRegularization);
  const expected = Math.atan2(-3, Math.sqrt(30 ** 2 + FR_VEHICLE_PROFILE.lowSpeedRegularization ** 2));
  assert.ok(Math.abs(actual - expected) < 1e-12);
  assert.ok(actual < 0);
});

for (const profile of [FR_VEHICLE_PROFILE, BIKE1_VEHICLE_PROFILE]) {
  test(`${profile.id} uses the same actuator and sole front-road-wheel steering response`, () => {
    const vehicle = createArcadeVehicle(profile, highway.guide, flatHeight, wideSurface, 800, -1.75, 45);
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideSurface,
      vehicle,
      { steering: 1, throttle: false, brake: false },
      DT,
    );
    assert.ok(vehicle.actuator.steering > 0 && vehicle.actuator.steering < 1);
    assert.ok(vehicle.frontSteerAngle > 0 && vehicle.frontSteerAngle < profile.maxRoadWheelSteer);
    assert.equal(vehicle.control.steeringActuator, vehicle.actuator.steering);
    assert.equal('steeringOffsetCommand' in vehicle, false);
  });
}

test('neutral request releases the actuator and self-steers a yawed body toward travel direction', () => {
  const speed = 25;
  const vehicle = createArcadeVehicle(
    FR_VEHICLE_PROFILE,
    highway.guide,
    flatHeight,
    wideSurface,
    800,
    -1.75,
    speed,
  );
  vehicle.yaw = 0.15;
  vehicle.velocityX = 0;
  vehicle.velocityY = 0;
  vehicle.velocityZ = speed;
  vehicle.frontWheelOmega = speed / FR_VEHICLE_PROFILE.frontWheelRadius;
  vehicle.rearWheelOmega = speed / FR_VEHICLE_PROFILE.rearWheelRadius;
  vehicle.actuator.steering = 0.4;

  for (let tick = 0; tick < 12; tick += 1) {
    updateArcadeVehicle(
      highway.guide,
      flatHeight,
      wideSurface,
      vehicle,
      { steering: 0, throttle: false, brake: false },
      DT,
    );
  }
  assert.equal(vehicle.actuator.steering, 0);
  assert.ok(vehicle.control.frontSlipAngle > 0);
  assert.ok(vehicle.frontSteerAngle < 0);
});

test('common rack has one mechanical stop and profile compilation rejects invalid steering authority', () => {
  const atStop = stepTravelDirectionSteering(
    0,
    FR_VEHICLE_PROFILE.steeringOffsetMax,
    FR_VEHICLE_PROFILE.maxRoadWheelSteer,
    0,
    DT,
    FR_VEHICLE_PROFILE,
  );
  assert.ok(atStop <= FR_VEHICLE_PROFILE.maxRoadWheelSteer);
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FR_VEHICLE_PROFILE, steeringResponseTau: 0 }),
    /finite and > 0/,
  );
});

test('M9 retires separate CAR steering authority and all browser roots select the common solver', async () => {
  const [solver, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(solver, /usefulLateralCapacity|countersteerMode|steeringOffsetCommand/);
  assert.match(solver, /bodyTravelDirection - yawRate \* profile\.steeringYawPreviewTime \+ steeringOffset/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /createArcadeVehicle/);
    assert.match(source, /updateArcadeVehicle/);
    assert.doesNotMatch(source, /createM5Car|createM5Bike|updateM5Car|updateM5Bike/);
  }
});
