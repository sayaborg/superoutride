import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { M7_1_PLAYER_START_L } from '../dist/dev/m7-1-highway-calibration-course.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import {
  M5_CAR_PROFILE,
  compileCarPhysicsProfile,
  createM5Car,
  updateM5Car,
} from '../dist/physics/car-physics.js';
import {
  M5_BIKE_PROFILE,
  compileMotorcyclePhysicsProfile,
  createM5Bike,
  updateM5Bike,
} from '../dist/physics/motorcycle-physics.js';
import {
  evaluateTireForce,
  radialC1Magnitude,
  rollingResistanceTorque,
  solveWheelOmega,
  tireLinearDemand,
} from '../dist/physics/tire-wheel.js';
import {
  VEHICLE_SUBSTEPS,
  VehicleOutsideModelError,
  deriveContactObservation,
  sampleSurfaceGeometryAtCoordinate,
} from '../dist/physics/vehicle-dynamics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  bodyBasisFromQuaternion,
  dot3,
  normalize3,
  quaternionFromYawPitchLean,
  rotateVector,
  scale3,
  sub3,
} from '../dist/physics/vehicle-math3.js';
import { HeightProfile } from '../dist/visual/height-profile.js';

const DT = 1 / 60;
const highway = createM72DefaultBranchingParent();
const flatHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const contactReleaseHeight = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: 100, y: 0 },
  { s: 260, y: 9 },
  { s: 350, y: 14 },
  { s: 380, y: -4 },
  { s: 560, y: -4 },
  { s: 700, y: 0 },
  { s: highway.guide.length, y: 0 },
]);

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);
}

function bikeBody(bike, velocityY = bike.velocityY) {
  const basis = bodyBasisFromQuaternion(bike.orientation);
  return {
    position: { x: bike.x, y: bike.y, z: bike.z },
    velocity: { x: bike.velocityX, y: velocityY, z: bike.velocityZ },
    ...basis,
    omegaWorld: rotateVector(bike.orientation, bike.omegaBody),
  };
}

function carBody(car, y = car.y, velocityY = car.velocityY) {
  const right = { x: Math.cos(car.yaw), y: 0, z: -Math.sin(car.yaw) };
  const forward = normalize3({
    x: Math.sin(car.yaw) * Math.cos(car.pitch),
    y: Math.sin(car.pitch),
    z: Math.cos(car.yaw) * Math.cos(car.pitch),
  });
  const up = normalize3({
    x: -Math.sin(car.yaw) * Math.sin(car.pitch),
    y: Math.cos(car.pitch),
    z: -Math.cos(car.yaw) * Math.sin(car.pitch),
  });
  return {
    position: { x: car.x, y, z: car.z },
    velocity: { x: car.velocityX, y: velocityY, z: car.velocityZ },
    right,
    up,
    forward,
    omegaWorld: { x: 0, y: 0, z: 0 },
  };
}

test('M8.0 authority shape owns world state, two stations and no retired phase/mode memory', async () => {
  const car = createM5Car(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
  const bike = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
  assert.deepEqual([car.kind, bike.kind], ['CAR', 'BIKE']);
  for (const vehicle of [car, bike]) {
    for (const key of ['x', 'y', 'z', 'velocityX', 'velocityY', 'velocityZ']) {
      assert.equal(Number.isFinite(vehicle[key]), true);
    }
    for (const retired of ['contacts', 'contactPhase', 'airborne', 'bankTarget', 'driftMode']) {
      assert.equal(retired in vehicle, false);
    }
  }
  assert.equal('roll' in car, false);
  assert.equal('orientation' in car, false);
  assert.equal('orientation' in bike, true);
  assert.equal('omegaBody' in bike, true);

  const sources = await Promise.all([
    readFile(new URL('../src/physics/car-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/motorcycle-physics.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(sources.join('\n'), /bankTarget|driftMode|tractionControlActive|absActive/);
});

test('M8.0 one-k tire is linear through the knee and radially saturates combined demand', () => {
  const tire = M5_CAR_PROFILE.frontStation.tire;
  near(radialC1Magnitude(0.4, tire.rhoKnee), 0.4);
  near(radialC1Magnitude(tire.rhoKnee, tire.rhoKnee), tire.rhoKnee);
  near(radialC1Magnitude(2 - tire.rhoKnee, tire.rhoKnee), 1);
  near(radialC1Magnitude(20, tire.rhoKnee), 1);

  const combined = evaluateTireForce(180, 0.33, 20, 12, 5_000, 1, tire);
  assert.ok(combined.rho > 2 - tire.rhoKnee);
  near(Math.hypot(combined.fx, combined.fy), combined.fmax, 1e-8);
  near(combined.fx / combined.fy, combined.dx / combined.dy, 1e-12);
});

test('M8.0 finite zero-speed slip regularization has no start mode or singularity', () => {
  const tire = M5_CAR_PROFILE.rearStation.tire;
  const zero = tireLinearDemand(0, M5_CAR_PROFILE.wheelRadius, 0, 0, tire);
  assert.deepEqual(zero, { sx: 0, sy: -0, dx: 0, dy: -0 });
  const perturbed = tireLinearDemand(0.01, M5_CAR_PROFILE.wheelRadius, 0, 0.01, tire);
  assert.ok(Object.values(perturbed).every(Number.isFinite));
  assert.ok(Math.abs(perturbed.sx) < 0.01);
  assert.ok(Math.abs(perturbed.sy) < 0.011);
});

test('M8.0 implicit wheel equation has one resolved root and continuous rolling resistance', () => {
  const input = {
    omegaPrevious: 20,
    inertia: M5_CAR_PROFILE.rearWheelInertia,
    rollingRadius: M5_CAR_PROFILE.wheelRadius,
    longitudinalVelocity: 5,
    lateralVelocity: 0,
    normalLoad: 5_500,
    gripFactor: 1,
    rollingResistance: 0.015,
    driveTorque: 300,
    brakeTorque: 0,
    dt: 1 / 720,
    tire: M5_CAR_PROFILE.rearStation.tire,
  };
  const solved = solveWheelOmega(input);
  const residual = (omega) => input.inertia / input.dt * (omega - input.omegaPrevious)
    - input.driveTorque
    + input.rollingRadius * evaluateTireForce(
      omega,
      input.rollingRadius,
      input.longitudinalVelocity,
      input.lateralVelocity,
      input.normalLoad,
      input.gripFactor,
      input.tire,
    ).fx
    + rollingResistanceTorque(
      omega,
      input.rollingRadius,
      input.normalLoad,
      input.rollingResistance,
      input.tire.lowSpeedRegularization,
    );
  near(residual(solved.omega), 0, 1e-7);
  assert.ok(residual(solved.omega - 0.01) < 0);
  assert.ok(residual(solved.omega + 0.01) > 0);
  near(rollingResistanceTorque(0, 0.33, 5_000, 0.015, 1), 0);
});

test('M8.0 wheel solve starts from rest and brake-locks either rotation through zero', () => {
  const common = {
    inertia: M5_CAR_PROFILE.rearWheelInertia,
    rollingRadius: M5_CAR_PROFILE.wheelRadius,
    lateralVelocity: 0,
    normalLoad: 5_500,
    gripFactor: 1,
    rollingResistance: 0.015,
    dt: 1 / 720,
    tire: M5_CAR_PROFILE.rearStation.tire,
  };
  const start = solveWheelOmega({
    ...common,
    omegaPrevious: 0,
    longitudinalVelocity: 0,
    driveTorque: 1_000,
    brakeTorque: 0,
  });
  assert.ok(start.omega > 0);
  assert.ok(start.tire.fx > 0);
  for (const sign of [-1, 1]) {
    const lock = solveWheelOmega({
      ...common,
      omegaPrevious: sign * 50,
      longitudinalVelocity: sign * 15,
      driveTorque: 0,
      brakeTorque: 200_000,
    });
    assert.equal(lock.omega, 0);
    assert.equal(lock.locked, true);
  }
});

test('M8.0 unilateral suspension covers static, separation, bump, rebound and qTravel rejection', () => {
  const car = createM5Car(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 0);
  const station = M5_CAR_PROFILE.frontStation;
  const staticContact = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, carBody(car), station, 0, 0, car.course.segmentIndex,
  );
  near(staticContact.q, station.suspension.qStatic, 1e-9);

  const separated = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, carBody(car, car.y + 1), station, 0, 0, car.course.segmentIndex,
  );
  assert.equal(separated.withinReach, false);
  assert.equal(separated.normalLoad, 0);

  const targetQ = station.suspension.qBump + 0.02;
  const displacedY = car.y - (targetQ - station.suspension.qStatic);
  const bump = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, carBody(car, displacedY, -1), station, 0, 0, car.course.segmentIndex,
  );
  const rebound = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, carBody(car, displacedY, 1), station, 0, 0, car.course.segmentIndex,
  );
  near(bump.q, targetQ, 1e-9);
  assert.ok(bump.normalLoad > rebound.normalLoad);
  assert.ok(bump.normalLoad > station.suspension.springRate * targetQ);

  const outsideY = car.y - (station.suspension.qTravel - station.suspension.qStatic);
  assert.throws(
    () => deriveContactObservation(
      highway.guide, flatHeight, highway.surfaceMap, carBody(car, outsideY), station, 0, 0, car.course.segmentIndex,
    ),
    VehicleOutsideModelError,
  );
});

test('M8.0 contact-release fixture recontacts without stored phase state', () => {
  const bike = createM5Bike(
    highway.guide,
    contactReleaseHeight,
    highway.surfaceMap,
    250,
    M7_1_PLAYER_START_L,
    60,
  );
  let airborneTick = -1;
  let recontactTick = -1;
  for (let tick = 0; tick < 320; tick += 1) {
    updateM5Bike(
      highway.guide,
      contactReleaseHeight,
      highway.surfaceMap,
      bike,
      { steering: 0, throttle: false, brake: false },
      DT,
    );
    if (!bike.supported && airborneTick < 0) airborneTick = tick;
    if (airborneTick >= 0 && bike.supported && tick > airborneTick) {
      recontactTick = tick;
      break;
    }
  }
  assert.ok(airborneTick >= 0);
  assert.ok(recontactTick > airborneTick);
  assert.equal('contactPhase' in bike, false);
});

test('M8.1 CAR mechanical steer stop and positive-understeer compiler gate remain causal', () => {
  assert.throws(
    () => compileCarPhysicsProfile({
      ...M5_CAR_PROFILE,
      frontNormalizedStiffness: M5_CAR_PROFILE.rearNormalizedStiffness,
    }),
    /positive understeer gradient/,
  );
  const car = createM5Car(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 45);
  updateM5Car(
    highway.guide,
    flatHeight,
    highway.surfaceMap,
    car,
    { steering: 1, throttle: false, brake: false },
    DT,
  );
  assert.ok(car.frontSteerAngle > 0);
  assert.ok(car.frontSteerAngle < M5_CAR_PROFILE.maxRoadWheelSteer);
});

test('M8.1 CAR power-oversteer emerges and neutral travel steering arrests it without a mode', async () => {
  const wideSurface = new SurfaceMap(highway.guide.length, [{
    sStart: 0,
    name: 'WIDE ASPHALT PROBE',
    bands: [{ lMin: -500, lMax: 500, type: 'ASPHALT' }],
  }]);
  const car = createM5Car(highway.guide, flatHeight, wideSurface, 800, -1.75, 25);
  let maxRearUtilization = 0;
  for (let tick = 0; tick < 90; tick += 1) {
    updateM5Car(
      highway.guide,
      flatHeight,
      wideSurface,
      car,
      { steering: 0.55, throttle: true, brake: false },
      DT,
    );
    maxRearUtilization = Math.max(maxRearUtilization, car.control.rearUtilization);
  }
  const yawRateAtRelease = Math.abs(car.yawRate);
  let observedCountersteer = false;
  for (let tick = 0; tick < 240; tick += 1) {
    updateM5Car(
      highway.guide,
      flatHeight,
      wideSurface,
      car,
      { steering: 0, throttle: false, brake: false },
      DT,
    );
    observedCountersteer ||= Math.sign(car.frontSteerAngle) === -Math.sign(car.yawRate)
      && Math.abs(car.frontSteerAngle) > 1e-4;
  }
  assert.ok(maxRearUtilization > 1);
  assert.ok(yawRateAtRelease > 0.05);
  assert.ok(Math.abs(car.yawRate) < yawRateAtRelease * 0.1);
  assert.equal(observedCountersteer, true);
  const source = await readFile(new URL('../src/physics/car-physics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /driftMode|driftTarget|driftAssist|usefulLateralCapacity|hypotheticalFrontUtilization/,
  );
});

test('M8.0 BIKE crown has upright identity, contact migration and one consistent Reff', () => {
  const bike = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 0);
  const station = M5_BIKE_PROFILE.frontStation;
  const upright = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, bikeBody(bike), station, 0, 0, bike.course.segmentIndex,
  );
  near(upright.effectiveRollingRadius, station.rollingRadius, 1e-12);

  bike.orientation = quaternionFromYawPitchLean(bike.yaw, 0, 0.35);
  const leanedBody = bikeBody(bike);
  const leaned = deriveContactObservation(
    highway.guide, flatHeight, highway.surfaceMap, leanedBody, station, 0, 0, bike.course.segmentIndex,
  );
  assert.ok(Math.hypot(
    leaned.reachPoint.x - upright.reachPoint.x,
    leaned.reachPoint.y - upright.reachPoint.y,
    leaned.reachPoint.z - upright.reachPoint.z,
  ) > 0.01);
  const nCrossRaw = sub3(
    leaned.surface.normal,
    scale3(leanedBody.forward, dot3(leaned.surface.normal, leanedBody.forward)),
  );
  const nCross = normalize3(nCrossRaw);
  const expected = (station.rollingRadius - station.crownRadius)
    + station.crownRadius * dot3(leanedBody.up, nCross);
  near(leaned.effectiveRollingRadius, expected, 1e-12);
  assert.ok(leaned.effectiveRollingRadius < station.rollingRadius);
});

test('M8.0 Rider produces a lean pulse, approaches steady lean and arrests after release', () => {
  const bike = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
  for (let tick = 0; tick < 30; tick += 1) {
    updateM5Bike(
      highway.guide, flatHeight, highway.surfaceMap, bike,
      { steering: 0.5, throttle: false, brake: false }, DT,
    );
  }
  const pulseLean = Math.abs(bike.bankAngle);
  const pulseRate = Math.abs(bike.bankRate);
  for (let tick = 0; tick < 60; tick += 1) {
    updateM5Bike(
      highway.guide, flatHeight, highway.surfaceMap, bike,
      { steering: 0.5, throttle: false, brake: false }, DT,
    );
  }
  const steadyLean = Math.abs(bike.bankAngle);
  const steadyRate = Math.abs(bike.bankRate);
  for (let tick = 0; tick < 120; tick += 1) {
    updateM5Bike(
      highway.guide, flatHeight, highway.surfaceMap, bike,
      { steering: 0, throttle: false, brake: false }, DT,
    );
  }
  assert.ok(pulseLean > 0.1);
  assert.ok(steadyLean > pulseLean);
  assert.ok(steadyRate < pulseRate);
  assert.ok(Math.abs(bike.bankAngle) < steadyLean * 0.2);
});

test('M8.0 BIKE wheel angular momentum includes OmegaDot and axis gyro materiality', async () => {
  const source = await readFile(new URL('../src/physics/motorcycle-physics.ts', import.meta.url), 'utf8');
  assert.match(source, /frontWheelInertia \* frontWheel\.omegaDot/);
  assert.match(source, /cross3\(frontAxisOmega, frontH\)/);
  assert.match(source, /body\.omegaWorld, scale3\(body\.up, steerRate\)/);

  const lowInertia = compileMotorcyclePhysicsProfile({
    ...M5_BIKE_PROFILE,
    frontWheelInertia: 0.01,
    rearWheelInertia: 0.01,
  });
  const normal = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
  const low = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25, lowInertia);
  for (let tick = 0; tick < 12; tick += 1) {
    const input = { steering: 0.7, throttle: false, brake: false };
    updateM5Bike(highway.guide, flatHeight, highway.surfaceMap, normal, input, DT);
    updateM5Bike(highway.guide, flatHeight, highway.surfaceMap, low, input, DT, lowInertia);
  }
  assert.ok(Math.hypot(
    normal.omegaBody.x - low.omegaBody.x,
    normal.omegaBody.y - low.omegaBody.y,
    normal.omegaBody.z - low.omegaBody.z,
  ) > 0.01);
});

test('M8.0 BIKE wheelie and stoppie arise from torque/load transfer without behavior modes', () => {
  const hot = compileMotorcyclePhysicsProfile({
    ...M5_BIKE_PROFILE,
    powertrain: {
      ...M5_BIKE_PROFILE.powertrain,
      torqueCurve: M5_BIKE_PROFILE.powertrain.torqueCurve.map((point) => ({
        ...point,
        torqueNewtonMeters: point.torqueNewtonMeters * 8,
      })),
    },
  });
  const wheelie = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 5, hot);
  let frontLifted = false;
  for (let tick = 0; tick < 12; tick += 1) {
    updateM5Bike(
      highway.guide, flatHeight, highway.surfaceMap, wheelie,
      { steering: 0, throttle: true, brake: false }, DT, hot,
    );
    frontLifted ||= wheelie.frontNormalLoad === 0 && wheelie.rearNormalLoad > 0;
  }

  const stoppie = createM5Bike(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 35);
  let rearLifted = false;
  for (let tick = 0; tick < 12; tick += 1) {
    updateM5Bike(
      highway.guide, flatHeight, highway.surfaceMap, stoppie,
      { steering: 0, throttle: false, brake: true }, DT,
    );
    rearLifted ||= stoppie.rearNormalLoad === 0 && stoppie.frontNormalLoad > 0;
  }
  assert.equal(frontLifted, true);
  assert.equal(rearLifted, true);
  assert.equal('wheelieMode' in wheelie, false);
  assert.equal('stoppieMode' in stoppie, false);
});

test('M8.0 Nsub=12 tracks a finer offline integration reference for CAR and BIKE', () => {
  assert.equal(VEHICLE_SUBSTEPS, 12);
  const input = { steering: 0.3, throttle: true, brake: false };
  for (const [create, update] of [
    [createM5Car, updateM5Car],
    [createM5Bike, updateM5Bike],
  ]) {
    const runtime = create(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
    const reference = create(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 25);
    for (let tick = 0; tick < 30; tick += 1) {
      update(highway.guide, flatHeight, highway.surfaceMap, runtime, input, DT);
    }
    for (let tick = 0; tick < 120; tick += 1) {
      update(highway.guide, flatHeight, highway.surfaceMap, reference, input, DT / 4);
    }
    assert.ok(Math.hypot(
      runtime.x - reference.x,
      runtime.y - reference.y,
      runtime.z - reference.z,
    ) < 0.02);
    assert.ok(Math.hypot(
      runtime.velocityX - reference.velocityX,
      runtime.velocityY - reference.velocityY,
      runtime.velocityZ - reference.velocityZ,
    ) < 0.05);
  }
});

test('M8.0 course/profile gates enforce A>0 and a finite unclamped aero stress envelope', async () => {
  const stadium = createM2StadiumGuide();
  const stadiumHeight = new HeightProfile(stadium.length, [
    { s: 0, y: 0 },
    { s: stadium.length, y: 0 },
  ]);
  const stadiumSurfaces = createM5DebugSurfaceMap(stadium.length);
  const arc = stadium.segments.find((segment) => segment.kind === 'arc');
  assert.ok(arc);
  const centerCoordinate = {
    s: (arc.sStart + arc.sEnd) * 0.5,
    l: 0,
    segmentIndex: arc.index,
    distanceSquared: 0,
  };
  const center = sampleSurfaceGeometryAtCoordinate(
    stadium, stadiumHeight, stadiumSurfaces, centerCoordinate,
  );
  assert.notEqual(center.curvature, 0);
  assert.throws(
    () => sampleSurfaceGeometryAtCoordinate(stadium, stadiumHeight, stadiumSurfaces, {
      ...centerCoordinate,
      l: 1 / center.curvature + Math.sign(center.curvature),
    }),
    /A=1-kappa\*l/,
  );
  assert.throws(
    () => compileCarPhysicsProfile({ ...M5_CAR_PROFILE, quadraticDrag: -0.01 }),
    /quadratic drag/,
  );
  assert.throws(
    () => compileMotorcyclePhysicsProfile({ ...M5_BIKE_PROFILE, quadraticDrag: -0.01 }),
    /quadratic drag/,
  );

  for (const [create, update] of [
    [createM5Car, updateM5Car],
    [createM5Bike, updateM5Bike],
  ]) {
    const vehicle = create(highway.guide, flatHeight, highway.surfaceMap, 800, -1.75, 100);
    update(
      highway.guide, flatHeight, highway.surfaceMap, vehicle,
      { steering: 0, throttle: false, brake: false }, DT,
    );
    assert.ok(Number.isFinite(vehicle.speed));
    assert.ok(vehicle.speed < 100);
  }
  const sources = await Promise.all([
    readFile(new URL('../src/physics/car-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/motorcycle-physics.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(sources.join('\n'), /topSpeed|maxFallSpeed|maxYawRate|maxLateralSpeed/);
});
