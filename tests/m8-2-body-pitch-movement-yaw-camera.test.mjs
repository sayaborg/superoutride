import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_M5_CAMERA_YAW_MODE,
  createM5CameraRig,
  movementYawInBodyPitchFrame,
  resetM5CameraRig,
  toggleM5CameraYawMode,
  updateM5Camera,
} from '../dist/camera/m5-camera.js';
import { CURRENT_M5_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { wrapAngle } from '../dist/core/math.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';
import {
  createCameraYawDebugModel,
  createVehicleYawDebugModel,
} from '../dist/render/vehicle-yaw-debug.js';
import {
  BROWSER_CAMERA_YAW_TOGGLE_CODE,
  browserRequestsCameraYawToggle,
} from '../dist/browser/camera-yaw-mode-selection.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';

const deg = (value) => value * Math.PI / 180;
const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} +/- ${epsilon}`);
};

const profile = CURRENT_M5_CAMERA_PROFILE;

function worldVelocityInBodyPitchPlane(yaw, pitch, forwardSpeed, lateralSpeed) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return {
    x: forwardSpeed * sinYaw * cosPitch + lateralSpeed * cosYaw,
    y: forwardSpeed * sinPitch,
    z: forwardSpeed * cosYaw * cosPitch - lateralSpeed * sinYaw,
  };
}

test('camera yaw is full-quadrant movement yaw measured in the vehicle-pitch plane', () => {
  const yaw = deg(31);
  const pitch = deg(-12);
  const velocity = worldVelocityInBodyPitchPlane(yaw, pitch, 30, 7);
  const movement = movementYawInBodyPitchFrame(yaw, pitch, velocity.x, velocity.y, velocity.z);

  near(movement.forwardSpeed, 30);
  near(movement.lateralSpeed, 7);
  near(movement.yawDelta, Math.atan2(7, 30));
  near(movement.yaw, wrapAngle(yaw + Math.atan2(7, 30)));

  const reverse = worldVelocityInBodyPitchPlane(yaw, pitch, -20, 0);
  const reverseMovement = movementYawInBodyPitchFrame(yaw, pitch, reverse.x, reverse.y, reverse.z);
  near(Math.abs(reverseMovement.yawDelta), Math.PI);
});

test('camera pitch follows physical body pitch while player X remains exactly centered', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const car = createTestCar(guide, height, createM5DebugSurfaceMap(guide.length), 100);
  car.yaw = deg(24);
  car.pitch = deg(-9);
  const velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 28, -5);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;

  const camera = updateM5Camera(
    createM5CameraRig('MOVEMENT_FOLLOW'),
    guide,
    height,
    car,
    profile,
    1 / 60,
  );
  const expectedMovementDelta = Math.atan2(-5, 28);
  near(camera.yaw, wrapAngle(car.yaw + expectedMovementDelta));
  near(camera.pitch, profile.baseDownPitch - car.pitch);
  near(camera.bodyPitch, car.pitch);
  near(camera.playerScreenX, 160, 1e-12);
  near(Math.hypot(car.x - camera.x, car.z - camera.z), profile.dCam);
  near(car.course.s - camera.s, profile.dCam);
});

test('camera holds the last valid movement yaw when speed has no stable direction', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const car = createTestCar(guide, height, createM5DebugSurfaceMap(guide.length), 100);
  const rig = createM5CameraRig('MOVEMENT_FOLLOW');
  car.yaw = deg(15);
  let velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 18, 8);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;
  const movingCamera = updateM5Camera(rig, guide, height, car, profile, 1 / 60);

  car.yaw += deg(70);
  velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 0.05, 0);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;
  const stoppedCamera = updateM5Camera(rig, guide, height, car, profile, 1 / 60);
  near(stoppedCamera.yaw, movingCamera.yaw);
});

test('body-fixed yaw is default exact and toggles to retained movement-follow yaw', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const car = createTestCar(guide, height, createM5DebugSurfaceMap(guide.length), 100);
  car.yaw = deg(22);
  const velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 24, 9);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;

  const rig = createM5CameraRig();
  assert.equal(DEFAULT_M5_CAMERA_YAW_MODE, 'BODY_FIXED');
  const fixed = updateM5Camera(rig, guide, height, car, profile, 1 / 60);
  assert.equal(fixed.yawMode, 'BODY_FIXED');
  assert.equal(fixed.yaw, car.yaw);
  near(fixed.movementYaw, wrapAngle(car.yaw + Math.atan2(9, 24)));
  near(fixed.playerScreenX, profile.centerX, 1e-12);

  assert.equal(toggleM5CameraYawMode(rig), 'MOVEMENT_FOLLOW');
  const movement = updateM5Camera(rig, guide, height, car, profile, 1 / 60);
  assert.equal(movement.yawMode, 'MOVEMENT_FOLLOW');
  near(movement.yaw, fixed.movementYaw);

  resetM5CameraRig(rig);
  assert.equal(rig.yawMode, 'MOVEMENT_FOLLOW');
  assert.equal(rig.initialized, false);
});

test('debug yaw arrow expresses only body yaw relative to movement-facing camera', () => {
  const aligned = createVehicleYawDebugModel(0, 0);
  near(aligned.directionX, 0);
  near(aligned.directionY, -1);

  const right = createVehicleYawDebugModel(Math.PI / 2, 0);
  near(right.directionX, 1);
  near(right.directionY, 0);

  const left = createVehicleYawDebugModel(-Math.PI / 2, 0);
  near(left.directionX, -1);
  near(left.directionY, 0);

  const reversed = createVehicleYawDebugModel(Math.PI, 0);
  near(reversed.directionX, 0);
  near(reversed.directionY, 1);
});

test('body-fixed camera overlay points along actual travel while movement camera overlay points along body', () => {
  const fixed = createCameraYawDebugModel(0, Math.PI / 2, 0, 'BODY_FIXED');
  assert.equal(fixed.subject, 'TRAVEL');
  near(fixed.directionX, 1);
  near(fixed.directionY, 0);

  const movement = createCameraYawDebugModel(Math.PI / 2, 0, 0, 'MOVEMENT_FOLLOW');
  assert.equal(movement.subject, 'BODY');
  near(movement.directionX, 1);
  near(movement.directionY, 0);
});

test('P is the sole browser camera-yaw toggle key', () => {
  assert.equal(BROWSER_CAMERA_YAW_TOGGLE_CODE, 'KeyP');
  assert.equal(browserRequestsCameraYawToggle('KeyP'), true);
  assert.equal(browserRequestsCameraYawToggle('KeyQ'), false);
});

test('browser compositions overlay the yaw diagnostic at the renderer player anchor', async () => {
  const [linear, branching, circuit, cameraSource] = await Promise.all([
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/camera/m5-camera.ts', import.meta.url), 'utf8'),
  ]);

  for (const source of [linear, branching, circuit]) {
    assert.match(
      source,
      /drawVehicleYawDebug\(\s*ctx,\s*camera\.playerScreenX,\s*stats\.playerScreenY,\s*vehicle\.yaw,\s*camera\.movementYaw,\s*camera\.yaw,\s*camera\.yawMode,\s*\)/,
    );
    assert.match(source, /browserRequestsCameraYawToggle\(event\.code\)/);
    assert.match(source, /mountMobileCameraYawSelector/);
  }
  assert.doesNotMatch(cameraSource, /lCamMax|tauLat|thetaLagMax|playerSafeX|lateralG/);
  assert.doesNotMatch(cameraSource, /rebaseM5CameraRigCoordinateFrame/);
});
