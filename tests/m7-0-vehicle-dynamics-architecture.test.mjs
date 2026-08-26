import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
} from '../dist/physics/automatic-powertrain.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import {
  adoptM5BikeKinematics,
  createM5Bike,
  updateM5Bike,
} from '../dist/physics/motorcycle-physics.js';
import { bodyFrameVelocity, setBodyFrameVelocity } from '../dist/physics/vehicle-dynamics.js';
import { formatVehicleControlHud } from '../dist/render/vehicle-control-hud.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const surfaces = createM5DebugSurfaceMap(guide.length);

test('M7.0 world velocity is authoritative while body velocity is a derived observation', () => {
  const car = createM5Car(guide, height, surfaces, 90);
  setBodyFrameVelocity(car, 31, -4, 2);
  const world = { x: car.velocityX, y: car.velocityY, z: car.velocityZ };
  const first = bodyFrameVelocity(car);
  assert.deepEqual(first, { longitudinal: 31, lateral: -4, vertical: 2 });

  car.yaw += 0.25;
  assert.deepEqual({ x: car.velocityX, y: car.velocityY, z: car.velocityZ }, world);
  assert.notDeepEqual(bodyFrameVelocity(car), first);
});

test('M7.0 support availability does not manufacture contact below an airborne body', () => {
  const car = createM5Car(guide, height, surfaces, 120);
  car.y += 3;
  car.velocityY = 0;
  for (const contact of car.contacts) contact.phase = 'AIRBORNE';

  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: false, brake: false }, 1 / 60);

  assert.ok(car.contacts.every((contact) => contact.supportAvailable));
  assert.ok(car.contacts.every((contact) => contact.phase === 'AIRBORNE'));
  assert.ok(car.velocityY < 0);
});

test('M7.0 car uses width-aware axle stations while bike uses two zero-width wheel stations', () => {
  const car = createM5Car(guide, height, surfaces, 90);
  const bike = createM5Bike(guide, height, surfaces, 90);
  assert.deepEqual(car.contacts.map((contact) => contact.id), ['FRONT', 'REAR']);
  assert.ok(car.contacts.every((contact) => contact.halfWidth > 0));
  assert.deepEqual(bike.contacts.map((contact) => contact.id), ['FRONT', 'REAR']);
  assert.ok(bike.contacts.every((contact) => contact.halfWidth === 0));
  car.powertrain.engineRpm = 4321;
  car.powertrain.gear = 4;
  adoptM5BikeKinematics(bike, car);
  assert.equal(bike.powertrain.engineRpm, 4321);
  assert.equal(bike.powertrain.gear, 4);
});

test('M7.0 digital intent produces continuous useful-limit steering with no neutral-input countersteer', () => {
  const car = createM5Car(guide, height, surfaces, 90);
  updateM5Car(guide, height, surfaces, car, { steering: 1, throttle: false, brake: false }, 1 / 60);
  const first = car.control.actualSteerAngle;
  assert.ok(first > 0 && first < 31 * Math.PI / 180);
  for (let i = 0; i < 60; i += 1) {
    updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: false, brake: false }, 1 / 60);
    assert.ok(car.control.actualSteerAngle >= -1e-12);
  }
  assert.ok(car.control.actualSteerAngle < first);
});

test('M7.0 post-assist drive brake and intervention state is always renderable', () => {
  const bike = createM5Bike(guide, height, surfaces, 300);
  bike.course.l = 8;
  const sample = surfaces.sample(300, 8);
  for (const contact of bike.contacts) {
    contact.surfaceType = sample.type;
    contact.friction = sample.material.friction;
    contact.rollingResistance = sample.material.rollingResistance;
    contact.driveScale = sample.material.driveScale;
  }
  updateM5Bike(guide, height, surfaces, bike, { steering: 0, throttle: true, brake: false }, 1 / 60);
  assert.ok(bike.control.appliedDrive >= 0 && bike.control.appliedDrive <= 1);
  assert.equal(bike.control.tractionControlActive, true);

  const car = createM5Car(guide, height, surfaces, 300);
  car.course.l = 8;
  for (const contact of car.contacts) {
    contact.surfaceType = sample.type;
    contact.friction = sample.material.friction;
    contact.rollingResistance = sample.material.rollingResistance;
    contact.driveScale = sample.material.driveScale;
  }
  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: false, brake: true }, 1 / 60);
  assert.equal(car.control.absActive, true);
  const hud = formatVehicleControlHud(car.control, car.powertrain);
  assert.match(hud.steering, /^ST \[/);
  assert.match(hud.pedals, /DRV \[.*\] .*BRK \[.*\] ABS/);
  assert.match(hud.powertrain, /^AT G\d+\s+\d+rpm/);
});

test('M7.0 AT gear ratio owns delivered drive force and shifts below redline', () => {
  const profile = {
    idleRpm: 50,
    redlineRpm: 12000,
    upshiftRpm: 9000,
    downshiftRpm: 100,
    shiftDuration: 0.1,
    engineResponseTau: 1,
    torqueConverterSlipRpm: 0,
    finalDriveRatio: 1,
    drivenWheelRadius: 1,
    efficiency: 1,
    gearRatios: [2, 1],
    torqueCurve: [
      { rpm: 0, torqueNewtonMeters: 100 },
      { rpm: 12000, torqueNewtonMeters: 100 },
    ],
  };
  const lowGear = createAutomaticPowertrainState(profile, 20);
  const highGear = createAutomaticPowertrainState(profile, 20);
  lowGear.gear = 1;
  highGear.gear = 2;
  assert.equal(updateAutomaticPowertrain(lowGear, profile, 20, 1, 0), 200);
  assert.equal(updateAutomaticPowertrain(highGear, profile, 20, 1, 0), 100);

  const shift = createAutomaticPowertrainState(profile, 10);
  shift.gear = 1;
  updateAutomaticPowertrain(shift, profile, 500, 1, 1 / 60);
  assert.equal(shift.gear, 2);
  assert.equal(shift.shiftDirection, 1);
  assert.equal(shift.outputDriveForce, 0);
  assert.ok(shift.engineRpm <= profile.redlineRpm);
});

test('M7.0 camera targets body yaw and applies pitch/lateral-G cues without roll authority', () => {
  const car = createM5Car(guide, height, surfaces, 100);
  car.sprungPitch = 0.1;
  car.lateralAcceleration = 9.80665;
  const basePitch = 8 * Math.PI / 180;
  const camera = updateM5Camera(createM5CameraRig(), guide, height, car, {
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
    lCamMax: 12,
    height: 2.469902425419539,
    pitch: basePitch,
    focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
    centerX: 160,
    centerY: 120,
    kPsi: 0.65,
    thetaLagMax: 20 * Math.PI / 180,
    sDotMin: 8,
    tauLat: 0.18,
    playerTargetY: 190,
    tauVertical: 0.22,
    deltaYMax: 4,
    sprungPitchGain: 0.5,
    lateralGOffsetMetersPerG: 0.6,
    lateralGOffsetMax: 0.8,
    lateralGOffsetTau: 0.01,
  }, 1 / 60);
  assert.ok(Math.abs(camera.yaw - car.yaw) < 1e-12);
  assert.equal(camera.pitch, basePitch + 0.05);
  assert.ok(camera.l < car.course.l);
  assert.equal('roll' in camera, false);
});

test('M7.0 common dynamics layer owns no concrete car bike gameplay camera or renderer branch', async () => {
  const source = await readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8');
  const powertrain = await readFile(new URL('../src/physics/automatic-powertrain.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /car-physics|motorcycle-physics|gameplay|camera|render/);
  assert.doesNotMatch(source, /routeKind|CIRCUIT|BRANCHING|LINEAR/);
  assert.doesNotMatch(powertrain, /car-physics|motorcycle-physics|gameplay|camera|render/);
  assert.doesNotMatch(powertrain, /routeKind|CIRCUIT|BRANCHING|LINEAR/);
});
