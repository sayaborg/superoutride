import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import {
  M5_CAR_PROFILE,
  compileCarPhysicsProfile,
  createM5Car,
  stepCarAssistedSlipAngleCommand,
  stepCarSelfSteering,
  updateM5Car,
} from '../dist/physics/car-physics.js';
import {
  regularizedTireSlipAngle,
  tireLinearDemand,
} from '../dist/physics/tire-wheel.js';
import { createCarSteeringHudModel } from '../dist/render/vehicle-control-hud.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const SUBSTEP = DT / 12;
const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);

function stepFixedVelocityResponse(angle, request, ticks) {
  let next = angle;
  let command = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    for (let substep = 0; substep < 12; substep += 1) {
      command = stepCarAssistedSlipAngleCommand(
        command,
        request,
        SUBSTEP,
        M5_CAR_PROFILE,
      );
      // On a straight with fixed forward velocity, front slip approaches road-wheel angle.
      next = stepCarSelfSteering(next, command, next, SUBSTEP, M5_CAR_PROFILE);
    }
  }
  return next;
}

test('M8.1 regularized front slip observation matches the one-k lateral denominator', () => {
  const tire = M5_CAR_PROFILE.frontStation.tire;
  const demand = tireLinearDemand(100, 0.33, 24, -2.4, tire);
  const angle = regularizedTireSlipAngle(24, -2.4, tire.lowSpeedRegularization);
  assert.ok(Math.abs(Math.tan(angle) - demand.sy) < 1e-12);
  assert.ok(Math.abs(regularizedTireSlipAngle(0, 0, tire.lowSpeedRegularization)) === 0);
});

test('M8.1 command slew makes a short digital tap smaller while the rack response stays fast', () => {
  const oneTick = stepFixedVelocityResponse(0, 1, 1);
  const sixTicks = stepFixedVelocityResponse(0, 1, 6);
  const sixtyTicks = stepFixedVelocityResponse(0, 1, 60);

  assert.ok(oneTick > 0);
  assert.ok(oneTick < sixTicks);
  assert.ok(sixTicks < sixtyTicks);
  assert.ok(Math.abs(sixtyTicks - M5_CAR_PROFILE.assistedSlipAngleMax) < 5e-5);
});

test('M8.1 neutral input physically countersteers a body yawed across its velocity', () => {
  const speed = 25;
  const car = createM5Car(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, speed);
  car.yaw = 0.15;
  car.velocityX = 0;
  car.velocityY = 0;
  car.velocityZ = speed;
  car.frontWheelOmega = speed / M5_CAR_PROFILE.wheelRadius;
  car.rearWheelOmega = speed / M5_CAR_PROFILE.wheelRadius;
  car.frontSteerAngle = 0;
  car.assistedSlipAngleCommand = 0;

  updateM5Car(
    highway.guide,
    flatHeight,
    highway.surfaceMap,
    car,
    { steering: 0, throttle: false, brake: false },
    DT,
  );

  assert.ok(car.control.frontSlipAngle > 0);
  assert.ok(car.frontSteerAngle < 0);
  assert.equal(car.control.steeringRequest, 0);
  assert.ok(Math.abs(
    car.control.handwheelAngle - car.frontSteerAngle * M5_CAR_PROFILE.steeringRatio,
  ) < 1e-12);
});

test('M8.1 finite request owns a soft slip equilibrium while the rack keeps one hard stop', () => {
  let angle = 0;
  let command = 0;
  for (let tick = 0; tick < 2_000; tick += 1) {
    command = stepCarAssistedSlipAngleCommand(command, 1, SUBSTEP, M5_CAR_PROFILE);
    angle = stepCarSelfSteering(angle, command, 0, SUBSTEP, M5_CAR_PROFILE);
  }
  assert.equal(angle, M5_CAR_PROFILE.maxRoadWheelSteer);
  assert.equal(M5_CAR_PROFILE.steeringRatio, 15);
  assert.ok(Math.abs(
    M5_CAR_PROFILE.maxRoadWheelSteer * M5_CAR_PROFILE.steeringRatio * 180 / Math.PI - 465,
  ) < 1e-12);

  assert.throws(
    () => compileCarPhysicsProfile({ ...M5_CAR_PROFILE, steeringRatio: 0 }),
    /steering ratio/,
  );
  assert.throws(
    () => compileCarPhysicsProfile({ ...M5_CAR_PROFILE, assistedSlipAngleRate: 0 }),
    /assisted slip angle rate/,
  );
});

test('M8.1 fast self-alignment prevents a released high-speed digital tap from driving the rack to lock', () => {
  const wideSurface = new SurfaceMap(highway.guide.length, [{
    sStart: 0,
    name: 'WIDE ASPHALT STEERING PROBE',
    bands: [{ lMin: -500, lMax: 500, type: 'ASPHALT' }],
  }]);
  const car = createM5Car(highway.guide, flatHeight, wideSurface, 800, -1.75, 80);
  const tapTicks = 9;
  let initialPeak = 0;
  let latePeak = 0;
  let overallPeak = 0;

  for (let tick = 0; tick < tapTicks + 360; tick += 1) {
    updateM5Car(
      highway.guide,
      flatHeight,
      wideSurface,
      car,
      { steering: tick < tapTicks ? 1 : 0, throttle: false, brake: false },
      DT,
    );
    if (tick >= tapTicks && tick < tapTicks + 60) {
      initialPeak = Math.max(initialPeak, Math.abs(car.frontSteerAngle));
    }
    if (tick >= tapTicks + 180) {
      latePeak = Math.max(latePeak, Math.abs(car.frontSteerAngle));
    }
    if (tick >= tapTicks) overallPeak = Math.max(overallPeak, Math.abs(car.frontSteerAngle));
  }

  assert.ok(initialPeak > 2 * Math.PI / 180);
  assert.ok(latePeak < initialPeak * 0.25);
  assert.ok(overallPeak < M5_CAR_PROFILE.maxRoadWheelSteer * 0.25);
  assert.ok(Math.abs(car.assistedSlipAngleCommand) < 1e-12);
});

test('M8.1 CAR HUD exposes digital request, handwheel, road wheel and both slip observations', () => {
  const control = {
    steeringRequest: -1,
    actualSteerAngle: -10 * Math.PI / 180,
    handwheelAngle: -150 * Math.PI / 180,
    frontSlipAngle: 2 * Math.PI / 180,
    requestedDriveTorque: 0,
    frontBrakeTorque: 0,
    rearBrakeTorque: 0,
    frontWheelLocked: false,
    rearWheelLocked: false,
    frontUtilization: 0,
    rearUtilization: 0,
  };
  const model = createCarSteeringHudModel(-1, control, -8 * Math.PI / 180);
  assert.equal(model.inputDirection, -1);
  assert.ok(Math.abs(model.handwheelDegrees + 150) < 1e-12);
  assert.ok(Math.abs(model.roadWheelDegrees + 10) < 1e-12);
  assert.ok(Math.abs(model.frontSlipDegrees - 2) < 1e-12);
  assert.ok(Math.abs(model.bodySlipDegrees + 8) < 1e-12);
});

test('M8.1 owns no retired useful-steer authority and both public roots draw the CAR panel', async () => {
  const [carSource, index, branching, circuit] = await Promise.all([
    readFile(new URL('../src/physics/car-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(
    carSource,
    /carSteerTarget|usefulLateralCapacity|hypotheticalFrontUtilization|countersteerMode/,
  );
  assert.match(index, /id="steer-left-button"/);
  assert.match(index, /id="steer-right-button"/);
  assert.match(branching, /drawCarSteeringHud\(ctx, input\.steering/);
  assert.match(circuit, /drawCarSteeringHud\(ctx, input\.steering/);
});
