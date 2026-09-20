import { createSurfaceGeometryWorkspace } from '../../dist/physics/vehicle-dynamics.js';
import { createBodyKinematicsWorkspace } from '../../dist/physics/arcade-vehicle-physics.js';
import assert from 'node:assert/strict';

import test from 'node:test';
import { BROWSER_VEHICLE_KEYS } from '../../dist/browser/key-bindings.js';

import {
  createVehicleDebugHudModel,
  drawTopDownGSensor,
  drawVehicleControlGraphics,
  drawVehicleDebugHud,
  gSensorPoint,
  HUD_INPUT_ACCEL_COLOR,
  HUD_INPUT_BRAKE_COLOR,
} from '../../dist/browser/vehicle-debug-hud.js';
import {
  BROWSER_VEHICLE_PROFILES,
  browserVehicleProfileForKey,
  formatVehicleProfileSelector,
} from '../../dist/browser/vehicle-profile-selection.js';

import { createStraightReferenceWorld } from '../../dist/dev/fixtures/straight-world.js';
import { createRecoveryState, updateRecovery } from '../../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../../dist/gameplay/rival-driver.js';

import { arcadeBodyKinematics } from '../../dist/physics/arcade-vehicle-physics.js';
import { sampleSurfaceGeometryAtCoordinate } from '../../dist/physics/vehicle-dynamics.js';
import { dot3 } from '../../dist/core/vector3.js';

import { VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE } from '../../dist/vehicle/production-vehicle-profiles.js';
import { formatVehicleCatalogLine, VEHICLE_CATALOG } from '../../dist/vehicle/vehicle-catalog.js';

import {
  createTestBike,
  createTestCar,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  updateTestVehicle,
} from '../helpers/vehicle-fixture.mjs';

const DT = 1 / 60;

test('browser vehicle selector derives all nine exact keys and profiles from browser bindings and the product catalog', () => {
  assert.deepEqual(
    BROWSER_VEHICLE_PROFILES.map(({ code, profile }) => [code, profile.id]),
    [
      ['KeyQ', 'TESTAROSSA'],
      ['KeyW', '911_TURBO_3_3'],
      ['KeyE', 'CORVETTE_C4'],
      ['KeyR', 'GOLF_GTI_16V'],
      ['KeyA', 'DELTA_HF_INTEGRALE'],
      ['KeyS', 'VFR750R'],
      ['KeyD', 'R80_GS_PARIS_DAKAR'],
      ['KeyF', 'FXRT_SPORT_GLIDE'],
      ['KeyV', 'PX200E_ARCOBALENO'],
    ],
  );
  for (const catalogEntry of VEHICLE_CATALOG)
    assert.equal(browserVehicleProfileForKey(BROWSER_VEHICLE_KEYS[catalogEntry.profile.id]), catalogEntry.profile);
  assert.equal(browserVehicleProfileForKey('KeyX'), null);
  assert.equal(formatVehicleProfileSelector('911_TURBO_3_3'), 'Porsche 911 Turbo 3.3 (930) — G50/50 5-speed (1989)');
});

test('all nine profiles share one two-station mechanics contract', () => {
  for (const { profile } of VEHICLE_CATALOG) {
    assert.deepEqual([profile.frontStation.id, profile.rearStation.id], ['FRONT', 'REAR']);
    // Equal compiled settings, not aliasing mutable authoring; see vehicle-physics.md.
    assert.deepEqual(profile.actuator, FERRARI_TESTAROSSA_VEHICLE_PROFILE.actuator);
    assert.equal(profile.steeringRatio, 18);
  }
});

test('catalog profiles share only the normalized tire law and retain distinct mechanics', () => {
  const profiles = VEHICLE_CATALOG.map(({ profile }) => profile);
  const tireTuple = (profile) => [
    profile.frontStation.tire.muY,
    profile.frontStation.tire.rhoKnee,
    profile.frontStation.tire.lowSpeedRegularization,
    profile.frontStation.tire.kY,
    profile.rearStation.tire.kY,
  ];
  for (const profile of profiles) assert.deepEqual(tireTuple(profile), tireTuple(FERRARI_TESTAROSSA_VEHICLE_PROFILE));
  assert.equal(new Set(profiles.map((profile) => profile.mass)).size, 9);
  assert.equal(new Set(profiles.map((profile) => profile.frontAxle + profile.rearAxle)).size, 8);
  assert.equal(
    VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE.frontAxle + VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE.rearAxle,
    LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE.frontAxle + LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE.rearAxle,
  );
  assert.equal(new Set(profiles.map((profile) => profile.powertrain.torqueCurve)).size, 9);
  assert.equal(LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE.frontDriveTorqueFraction, 0.47);
});

test('all nine vehicle profiles integrate on the finite LINEAR course with permitted wheel lift and recovery', () => {
  const runtime = createStraightReferenceWorld();
  for (const { profile, presentationFamily } of VEHICLE_CATALOG) {
    const vehicle =
      presentationFamily === 'BIKE'
        ? createTestBike(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45, 0, 20, profile)
        : createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45, 0, 20, profile);
    const recovery = createRecoveryState(vehicle);
    for (let tick = 0; tick < 600; tick++) {
      updateTestVehicle(
        runtime.guide,
        runtime.heightProfile,
        runtime.surfaceMap,
        vehicle,
        sampleRivalDrivingInput(runtime.guide, vehicle, 0),
        DT,
      );
      for (const value of [vehicle.x, vehicle.y, vehicle.z, vehicle.speed, vehicle.pitch, vehicle.pitchRate])
        assert.ok(Number.isFinite(value), profile.id);
      const reason = updateRecovery(
        { guide: runtime.guide, height: runtime.heightProfile, surfaces: runtime.surfaceMap },
        vehicle,
        { state: recovery, dt: DT },
      );
      if (reason !== null) assert.equal(reason, 'overturned');
      const surface = sampleSurfaceGeometryAtCoordinate(
        runtime.guide,
        runtime.heightProfile,
        runtime.surfaceMap,
        vehicle.course,
        createSurfaceGeometryWorkspace(),
      );
      assert.ok(
        dot3(arcadeBodyKinematics(vehicle, createBodyKinematicsWorkspace()).up, surface.normal) > 0,
        profile.id,
      );
    }
    assert.ok(vehicle.course.s > 100, `${profile.id} stalled at s=${vehicle.course.s}`);
    assert.ok(Math.abs(vehicle.course.l) < 4.5, `${profile.id} left LINEAR asphalt`);
  }
});

// supersedes only pedal actuator-only fields, ON/OFF rounding and the old label count.
test('shared HUD exposes M D T plus station pedal output and HUD-only 18:1 handwheel observations', () => {
  const runtime = createStraightReferenceWorld();
  const vehicle = createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45);
  vehicle.control.actualSteerAngle = (-12.5 * Math.PI) / 180;
  vehicle.control.handwheelAngle = vehicle.control.actualSteerAngle * vehicle.profile.steeringRatio;
  vehicle.control.throttleActuator = 0.42;
  vehicle.control.brakeActuator = 0.08;
  vehicle.longitudinalAcceleration = 9.80665;
  vehicle.lateralAcceleration = -4.903325;
  vehicle.control.requestedFrontDriveTorque = 0;
  vehicle.control.requestedRearDriveTorque = 420;
  vehicle.control.frontDriveTorque = 0;
  vehicle.control.rearDriveTorque = 420;
  vehicle.control.requestedFrontBrakeTorque = 0.08 * vehicle.profile.frontStation.maxBrakeTorque;
  vehicle.control.requestedRearBrakeTorque = 0.08 * vehicle.profile.rearStation.maxBrakeTorque;
  vehicle.control.frontBrakeTorque = vehicle.control.requestedFrontBrakeTorque;
  vehicle.control.rearBrakeTorque = vehicle.control.requestedRearBrakeTorque;
  const model = createVehicleDebugHudModel('linear', { steering: -1, throttle: true, brake: false }, vehicle);
  assert.match(model.courseSelector, /\[1\] LINEAR/);
  assert.equal(model.vehicleSelector, `VEHICLE ${formatVehicleCatalogLine(VEHICLE_CATALOG[0])}`);
  assert.equal(model.steeringOffsetSelector, 'D [Y] 9.5°');
  assert.equal(model.maxRoadWheelSteerSelector, 'M [U] 45°');
  assert.equal(model.steeringResponseSelector, 'ACT [T] 0.25s');
  assert.match(model.tireCalibrationSelector, /^GX1.35 PX17.45% GY1.35 PY17.45% KN0.74$/);
  assert.equal(model.requestedSteering, -1);
  assert.equal(model.requestedThrottle, 1);
  assert.equal(model.requestedBrake, 0);
  assert.ok(Math.abs(model.actualSteering + 12.5 / 45) < 1e-12);
  assert.equal(model.rearDrive.delivered, 0.42);
  assert.equal(model.frontDrive.delivered, 0);
  assert.ok(Math.abs(model.frontBrake.delivered + model.rearBrake.delivered - 0.08) < 1e-12);
  assert.ok(Math.abs(model.handwheelAngle + (225 * Math.PI) / 180) < 1e-12);
  assert.ok(Math.abs(model.longitudinalG - 1) < 1e-12);
  assert.ok(Math.abs(model.lateralG + 0.5) < 1e-12);
});

test('shared HUD leaves the driving view transparent behind outlined text and control graphics', () => {
  const runtime = createStraightReferenceWorld(),
    vehicle = createTestCar(runtime.guide, runtime.heightProfile, runtime.surfaceMap, 45);
  const rectangles = [],
    outlinedText = [];
  const context = {
    save() {},
    restore() {},
    font: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    fillText() {},
    strokeText: (text) => outlinedText.push(text),
    fillRect: (x, y, width, height) => rectangles.push({ x, y, width, height }),
    strokeRect() {},
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
  };
  drawVehicleDebugHud(context, 'linear', { steering: 0, throttle: false, brake: false }, vehicle);
  assert.equal(outlinedText.length, 26);
  assert.ok(outlinedText.includes('RED=CUT'));
  assert.equal(
    rectangles.some(({ width, height }) => width > 60 || height > 10),
    false,
    'HUD must not paint an opaque full text/control panel over the driving view',
  );
});

test('G sensor draws only one cross and one dot in the felt inertial-load direction', () => {
  const point = gSensorPoint({ longitudinalG: 1, lateralG: 0.5 }, 100, 80, 20);
  assert.deepEqual(point, { x: 95, y: 90 });
  const operations = [],
    context = {
      beginPath: () => operations.push('beginPath'),
      moveTo: () => operations.push('moveTo'),
      lineTo: () => operations.push('lineTo'),
      stroke: () => operations.push('stroke'),
      arc: () => operations.push('arc'),
      fill: () => operations.push('fill'),
    };
  drawTopDownGSensor(context, { longitudinalG: 1, lateralG: 0.5 }, 100, 80);
  assert.equal(operations.filter((x) => x === 'moveTo').length, 2);
  assert.equal(operations.filter((x) => x === 'lineTo').length, 2);
  assert.equal(operations.filter((x) => x === 'arc').length, 1);
  assert.equal(operations.filter((x) => x === 'stroke').length, 1);
  assert.equal(operations.filter((x) => x === 'fill').length, 1);
});

test('pedal input graphics show exactly blue accel red brake or no active color', () => {
  const fillColors = (requestedThrottle, requestedBrake) => {
    const colors = [];
    let fillStyle = '';
    const context = {
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(value) {
        fillStyle = value;
      },
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: '',
      fillRect: () => colors.push(fillStyle),
      strokeRect() {},
      fillText() {},
      strokeText() {},
      beginPath() {},
      arc() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
    };
    drawVehicleControlGraphics(
      context,
      {
        requestedSteering: 0,
        requestedThrottle,
        requestedBrake,
        actualSteering: 0,
        frontDrive: { requested: 0, delivered: 0, limit: 0 },
        rearDrive: { requested: 0, delivered: 0, limit: 1 },
        frontBrake: { requested: 0, delivered: 0, limit: 0.7 },
        rearBrake: { requested: 0, delivered: 0, limit: 0.3 },
        handwheelAngle: 0,
      },
      0,
      0,
    );
    return colors;
  };
  const accel = fillColors(1, 0);
  assert.equal(accel.includes(HUD_INPUT_ACCEL_COLOR), true);
  assert.equal(accel.includes(HUD_INPUT_BRAKE_COLOR), false);
  const brake = fillColors(0, 1);
  assert.equal(brake.includes(HUD_INPUT_ACCEL_COLOR), false);
  assert.equal(brake.includes(HUD_INPUT_BRAKE_COLOR), true);
  const neutral = fillColors(0, 0);
  assert.equal(neutral.includes(HUD_INPUT_ACCEL_COLOR), false);
  assert.equal(neutral.includes(HUD_INPUT_BRAKE_COLOR), false);
  assert.throws(() => fillColors(1, 1), /mutually exclusive/);
});
