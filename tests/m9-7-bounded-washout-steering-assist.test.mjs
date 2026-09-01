import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_STEERING_RESPONSES,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_YAW_TRANSIENT_CYCLE_CODE,
  BROWSER_YAW_TRANSIENT_GAINS,
  BROWSER_YAW_WASHOUT_CYCLE_CODE,
  BROWSER_YAW_WASHOUT_TIMES,
  formatSteeringResponseSelector,
  formatYawTransientSelector,
  formatYawWashoutSelector,
  nextBrowserSteeringResponseRate,
  nextBrowserYawTransientGain,
  nextBrowserYawWashoutTime,
} from '../dist/browser/steering-calibration-selection.js';
import {
  createArcadeVehicle,
  travelDirectionSteeringTarget,
  updateArcadeVehicle,
  vehicleBodyTravelDirection,
} from '../dist/physics/arcade-vehicle-physics.js';
import {
  setArcadeVehicleSteeringYawTransientGain,
  setArcadeVehicleSteeringYawWashoutTime,
  setArcadeVehicleSymmetricSteeringActuatorRate,
} from '../dist/physics/vehicle-calibration.js';
import {
  createArcadeSteeringAssistState,
  stepArcadeSteeringYawWashout,
} from '../dist/physics/steering-assist.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5RecoveryState, recoverM5Vehicle } from '../dist/gameplay/recovery.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import {
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  HONDA_VFR750R_VEHICLE_PROFILE,
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
  CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../dist/physics/vehicle-profiles.js';
import { HeightProfile } from '../dist/visual/height-profile.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

const DT = 1 / 60;
const highway = createM72DefaultBranchingParent();
const height = new HeightProfile(highway.guide.length, [
  { s: 0, y: 0 },
  { s: highway.guide.length, y: 0 },
]);
const surface = new SurfaceMap(highway.guide.length, [{
  sStart: 0,
  name: 'M9.7 STEERING CALIBRATION TEST',
  bands: [{ lMin: -100, lMax: 100, type: 'ASPHALT' }],
}]);
const profiles = VEHICLE_CATALOG.map((entry) => entry.profile);

test('browser authority exposes only the three adjustable steering parameters', () => {
  assert.deepEqual(BROWSER_YAW_TRANSIENT_GAINS, [0, 0.06, 0.12, 0.18, 0.24, 0.3]);
  assert.deepEqual(BROWSER_YAW_WASHOUT_TIMES, [0.2, 0.35, 0.5, 0.65]);
  assert.deepEqual(
    BROWSER_STEERING_RESPONSES.map(({ traversalSeconds }) => traversalSeconds),
    [0.25, 0.375, 0.5, 0.625],
  );
  assert.equal(BROWSER_YAW_TRANSIENT_CYCLE_CODE, 'KeyY');
  assert.equal(BROWSER_YAW_WASHOUT_CYCLE_CODE, 'KeyU');
  assert.equal(BROWSER_STEERING_RESPONSE_CYCLE_CODE, 'KeyT');
  assert.equal(nextBrowserYawTransientGain(0.18), 0.24);
  assert.equal(nextBrowserYawTransientGain(0.3), 0);
  assert.equal(nextBrowserYawWashoutTime(0.35), 0.5);
  assert.equal(nextBrowserYawWashoutTime(0.65), 0.2);
  assert.equal(nextBrowserSteeringResponseRate(8 / 3), 2);
  assert.equal(nextBrowserSteeringResponseRate(1.6), 4);
  assert.equal(formatYawTransientSelector(0.18), 'YAW [Y] 0.18s');
  assert.equal(formatYawWashoutSelector(0.35), 'WASH [U] 0.35s');
  assert.equal(formatSteeringResponseSelector(8 / 3), 'ACT [T] 0.375s');
});

test('all common profiles retain the provisional family offsets and zero-DC steering defaults', () => {
  for (const profile of profiles) {
    const expectedOffsetDegrees = profile.presentationFamily === 'BIKE' ? 9 : 9.5;
    assert.ok(Math.abs(profile.steeringOffsetMax - expectedOffsetDegrees * Math.PI / 180) < 1e-15);
    assert.equal(profile.steeringYawTransientGain, 0.18);
    assert.equal(profile.steeringYawWashoutTime, 0.35);
    assert.equal(profile.steeringLowSpeedRegularization, 1);
    assert.equal(profile.actuator.steering.applyRate, 1 / 0.375);
    assert.equal(profile.actuator.steering.releaseRate, 1 / 0.375);
    assert.equal(
      profile.steeringAutomaticMax,
      profile.maxRoadWheelSteer - profile.steeringOffsetMax,
    );
  }
});

test('steering travel-direction regularization is causally independent from tire regularization', () => {
  const tireOnly = compileArcadeVehicleProfile({
    ...FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    lowSpeedRegularization: 4,
  });
  const steeringOnly = compileArcadeVehicleProfile({
    ...FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    steeringLowSpeedRegularization: 4,
  });
  const body = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 1, y: 0, z: 0.5 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    omegaWorld: { x: 0, y: 0, z: 0 },
  };
  const baseline = vehicleBodyTravelDirection(
    body,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringLowSpeedRegularization,
  );
  const tireOnlyResult = vehicleBodyTravelDirection(
    body,
    tireOnly.steeringLowSpeedRegularization,
  );
  const steeringOnlyResult = vehicleBodyTravelDirection(
    body,
    steeringOnly.steeringLowSpeedRegularization,
  );

  assert.notEqual(tireOnly.lowSpeedRegularization, FERRARI_TESTAROSSA_VEHICLE_PROFILE.lowSpeedRegularization);
  assert.equal(
    tireOnly.steeringLowSpeedRegularization,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringLowSpeedRegularization,
  );
  assert.equal(tireOnlyResult, baseline);
  assert.notEqual(steeringOnlyResult, baseline);
  assert.ok(Math.abs(steeringOnlyResult) < Math.abs(baseline));
  assert.ok(
    Math.abs(steeringOnlyResult - Math.atan2(1, Math.sqrt(0.5 ** 2 + 4 ** 2))) < 1e-12,
  );
});

test('yaw washout is exact, zero-DC, finite and left-right symmetric', () => {
  const tau = 0.35;
  const dt = 1 / 720;
  const positive = createArcadeSteeringAssistState(0);
  const negative = createArcadeSteeringAssistState(0);
  let positiveHighPass = 0;
  let negativeHighPass = 0;
  const steps = 720;
  for (let step = 0; step < steps; step += 1) {
    positiveHighPass = stepArcadeSteeringYawWashout(positive, 1.2, tau, dt);
    negativeHighPass = stepArcadeSteeringYawWashout(negative, -1.2, tau, dt);
  }
  const expected = 1.2 * Math.exp(-(steps * dt) / tau);
  assert.ok(Math.abs(positiveHighPass - expected) < 1e-12);
  assert.ok(Math.abs(negativeHighPass + expected) < 1e-12);
  assert.ok(Math.abs(positive.yawRateBaseline + negative.yawRateBaseline) < 1e-12);
  assert.ok(Math.abs(positiveHighPass) < 0.07);

  const initialized = createArcadeSteeringAssistState(0.8);
  assert.equal(stepArcadeSteeringYawWashout(initialized, 0.8, tau, dt), 0);
  assert.throws(
    () => stepArcadeSteeringYawWashout(initialized, 0.8, 0, dt),
    /finite and > 0/,
  );
});

test('airborne common mechanics advances the washout baseline by the exact exponential law', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
  );
  const yawRate = 1.2;
  const initialBaseline = 0.2;
  const tau = vehicle.steeringCalibration.yawWashoutTime;
  vehicle.y += 20;
  vehicle.velocityY = 0;
  vehicle.yawRate = yawRate;
  vehicle.steeringAssist.yawRateBaseline = initialBaseline;

  updateArcadeVehicle(
    highway.guide,
    height,
    surface,
    vehicle,
    { steering: 0, throttle: false, brake: false },
    DT,
  );

  const expected = yawRate + (initialBaseline - yawRate) * Math.exp(-DT / tau);
  assert.equal(vehicle.supported, false);
  assert.equal(vehicle.frontNormalLoad, 0);
  assert.equal(vehicle.rearNormalLoad, 0);
  assert.ok(Math.abs(vehicle.yawRate - yawRate) < 1e-12);
  assert.ok(Math.abs(vehicle.steeringAssist.yawRateBaseline - expected) < 1e-12);
});

test('G=1 travel-direction geometry and A-before-driver allocation are structural', () => {
  const calibration = { yawTransientGain: 0.18, yawWashoutTime: 0.35 };
  const ordinary = travelDirectionSteeringTarget(
    0.04,
    0.12,
    0.15,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  assert.ok(Math.abs(ordinary - (0.12 - 0.18 * 0.15 + 0.04)) < 1e-12);

  const saturatedPositive = travelDirectionSteeringTarget(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringOffsetMax,
    1,
    0,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  const saturatedPositiveWithYaw = travelDirectionSteeringTarget(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringOffsetMax,
    1,
    1,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  assert.equal(saturatedPositive, FERRARI_TESTAROSSA_VEHICLE_PROFILE.maxRoadWheelSteer);
  assert.equal(saturatedPositiveWithYaw, saturatedPositive);

  const saturatedState = createArcadeSteeringAssistState(0);
  const firstTransient = stepArcadeSteeringYawWashout(saturatedState, 1, 0.35, 1 / 720);
  const firstBaseline = saturatedState.yawRateBaseline;
  const firstTarget = travelDirectionSteeringTarget(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringOffsetMax,
    1,
    firstTransient,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  const secondTransient = stepArcadeSteeringYawWashout(saturatedState, 1, 0.35, 1 / 720);
  const secondTarget = travelDirectionSteeringTarget(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringOffsetMax,
    1,
    secondTransient,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  assert.ok(saturatedState.yawRateBaseline > firstBaseline);
  assert.equal(secondTarget, firstTarget);
  assert.equal(secondTarget, FERRARI_TESTAROSSA_VEHICLE_PROFILE.maxRoadWheelSteer);

  const saturatedNegative = travelDirectionSteeringTarget(
    -FERRARI_TESTAROSSA_VEHICLE_PROFILE.steeringOffsetMax,
    -1,
    0,
    calibration,
    FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  );
  assert.equal(saturatedNegative, -saturatedPositive);
});

test('one vehicle owns adjustable calibration while recovery resets only washout memory', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
  );
  assert.deepEqual(vehicle.steeringCalibration, {
    yawTransientGain: 0.18,
    yawWashoutTime: 0.35,
    steeringActuatorResponse: { applyRate: 8 / 3, releaseRate: 8 / 3 },
  });
  vehicle.frontSteerAngle = 0.08;
  vehicle.steeringAssist.yawRateBaseline = 0.9;
  vehicle.yawRate = -1.1;
  const dynamicsBeforeSelection = {
    x: vehicle.x,
    z: vehicle.z,
    yaw: vehicle.yaw,
    yawRate: vehicle.yawRate,
    frontSteerAngle: vehicle.frontSteerAngle,
    yawRateBaseline: vehicle.steeringAssist.yawRateBaseline,
  };
  setArcadeVehicleSteeringYawTransientGain(vehicle, 0.24);
  setArcadeVehicleSteeringYawWashoutTime(vehicle, 0.5);
  setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, 2);
  assert.deepEqual({
    x: vehicle.x,
    z: vehicle.z,
    yaw: vehicle.yaw,
    yawRate: vehicle.yawRate,
    frontSteerAngle: vehicle.frontSteerAngle,
    yawRateBaseline: vehicle.steeringAssist.yawRateBaseline,
  }, dynamicsBeforeSelection);
  const recovery = createM5RecoveryState(vehicle);
  recoverM5Vehicle(recovery, highway.guide, height, surface, vehicle);
  assert.deepEqual(vehicle.steeringCalibration, {
    yawTransientGain: 0.24,
    yawWashoutTime: 0.5,
    steeringActuatorResponse: { applyRate: 2, releaseRate: 2 },
  });
  assert.equal(vehicle.yawRate, 0);
  assert.equal(vehicle.steeringAssist.yawRateBaseline, vehicle.yawRate);

  const replacement = createArcadeVehicle(
    PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
    highway.guide,
    height,
    surface,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.longitudinalSpeed,
    vehicle.steeringCalibration,
  );
  assert.deepEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(replacement.steeringCalibration, vehicle.steeringCalibration);
  assert.notEqual(
    replacement.steeringCalibration.steeringActuatorResponse,
    vehicle.steeringCalibration.steeringActuatorResponse,
  );
  assert.equal(replacement.steeringAssist.yawRateBaseline, replacement.yawRate);
});

test('ordinary same-profile actors receive equal defaults without sharing calibration or assist state', () => {
  const player = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
  );
  const rival = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 806, 0, 25,
  );
  assert.deepEqual(player.steeringCalibration, rival.steeringCalibration);
  assert.notEqual(player.steeringCalibration, rival.steeringCalibration);
  assert.notEqual(
    player.steeringCalibration.steeringActuatorResponse,
    rival.steeringCalibration.steeringActuatorResponse,
  );
  assert.deepEqual(player.steeringAssist, rival.steeringAssist);
  assert.notEqual(player.steeringAssist, rival.steeringAssist);

  stepArcadeSteeringYawWashout(player.steeringAssist, 1, 0.35, 1 / 720);
  assert.notEqual(player.steeringAssist.yawRateBaseline, rival.steeringAssist.yawRateBaseline);
  assert.equal(rival.steeringAssist.yawRateBaseline, rival.yawRate);
});

test('calibration and compiler validation reject invalid values before mutation', () => {
  const vehicle = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
  );
  const original = structuredClone(vehicle.steeringCalibration);
  for (const invalid of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleSteeringYawTransientGain(vehicle, invalid),
      /finite and >= 0/,
    );
  }
  for (const invalid of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleSteeringYawWashoutTime(vehicle, invalid),
      /finite and > 0/,
    );
  }
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => setArcadeVehicleSymmetricSteeringActuatorRate(vehicle, invalid),
      /finite and > 0/,
    );
  }
  assert.deepEqual(vehicle.steeringCalibration, original);
  assert.throws(
    () => compileArcadeVehicleProfile({
      ...FERRARI_TESTAROSSA_VEHICLE_PROFILE,
      steeringOffsetMax: FERRARI_TESTAROSSA_VEHICLE_PROFILE.maxRoadWheelSteer,
    }),
    /below the mechanical road-wheel limit/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_PROFILE, steeringLowSpeedRegularization: 0 }),
    /finite and > 0/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_PROFILE, steeringYawTransientGain: -0.01 }),
    /finite and >= 0/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({ ...FERRARI_TESTAROSSA_VEHICLE_PROFILE, steeringYawWashoutTime: 0 }),
    /finite and > 0/,
  );
  assert.throws(
    () => compileArcadeVehicleProfile({
      ...FERRARI_TESTAROSSA_VEHICLE_PROFILE,
      actuator: {
        ...FERRARI_TESTAROSSA_VEHICLE_PROFILE.actuator,
        steering: { applyRate: 2, releaseRate: 3 },
      },
    }),
    /symmetric/,
  );
  assert.throws(
    () => createArcadeVehicle(
      FERRARI_TESTAROSSA_VEHICLE_PROFILE,
      highway.guide,
      height,
      surface,
      800,
      0,
      25,
      { steeringActuatorResponse: { applyRate: 2, releaseRate: 3 } },
    ),
    /symmetric/,
  );
});

test('the selected symmetric response is consumed by the ordinary steering actuator only', () => {
  const slow = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    { steeringActuatorResponse: { applyRate: 1.6, releaseRate: 1.6 } },
  );
  const fast = createArcadeVehicle(
    FERRARI_TESTAROSSA_VEHICLE_PROFILE, highway.guide, height, surface, 800, 0, 25,
    { steeringActuatorResponse: { applyRate: 4, releaseRate: 4 } },
  );
  updateArcadeVehicle(
    highway.guide, height, surface, slow,
    { steering: 1, throttle: false, brake: false }, DT,
  );
  updateArcadeVehicle(
    highway.guide, height, surface, fast,
    { steering: 1, throttle: false, brake: false }, DT,
  );
  assert.ok(Math.abs(slow.actuator.steering - 1.6 * DT) < 1e-12);
  assert.ok(Math.abs(fast.actuator.steering - 4 * DT) < 1e-12);
  assert.equal(slow.actuator.throttle, fast.actuator.throttle);
  assert.equal(slow.actuator.brake, fast.actuator.brake);
});

test('calibration authority stays in common mechanics without retired gain or force feedback', async () => {
  const [
    solver,
    calibration,
    assist,
    selection,
    controls,
    mobile,
    hud,
    index,
    actuator,
    linear,
    branching,
    circuit,
  ] = await Promise.all([
    readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-calibration.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/steering-assist.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/steering-calibration-selection.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/steering-calibration-controls.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/mobile-selector-controls.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/vehicle-debug-hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/driving-actuator.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  const currentSteering = [solver, calibration, assist, selection, controls, mobile, hud, index]
    .join('\n');
  assert.match(solver, /bodyTravelDirection - calibration\.yawTransientGain \* transientYawRate/);
  assert.match(solver, /steeringAutomaticMax/);
  assert.doesNotMatch(currentSteering, /travelDirectionGain|SelfSteerGain|yawPreviewTime/);
  assert.doesNotMatch(currentSteering, /self-steer|yaw-preview|selfSteer|yawPreview|>SELF</i);
  assert.doesNotMatch(assist, /lateralAcceleration|tire|Guide|camera|routeKind/);
  assert.doesNotMatch(solver, /Digit4|Numpad8|KeyY|KeyU|KeyT|camera|routeKind|CIRCUIT/);
  assert.match(calibration, /setArcadeVehicleSteeringYawTransientGain/);
  assert.match(calibration, /setArcadeVehicleSteeringYawWashoutTime/);
  assert.match(calibration, /setArcadeVehicleSymmetricSteeringActuatorRate/);
  assert.doesNotMatch(actuator, /yawTransient|yawWashout|camera|routeKind/);
  assert.doesNotMatch(selection, /vehicle\.yaw|yawRate|tire|routeKind/);
  for (const source of [linear, branching, circuit]) {
    assert.match(source, /mountBrowserSteeringCalibrationControls/);
    assert.match(source, /steeringCalibrationControls\.handleKey/);
    assert.doesNotMatch(source, /setArcadeVehicleSteeringYawTransientGain/);
    assert.doesNotMatch(source, /setArcadeVehicleSteeringYawWashoutTime/);
    assert.doesNotMatch(source, /setArcadeVehicleSymmetricSteeringActuatorRate/);
    assert.match(source, /const steeringCalibration = vehicle\.steeringCalibration/);
  }
});
