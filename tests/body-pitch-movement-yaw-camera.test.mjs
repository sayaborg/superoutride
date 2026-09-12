import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BROWSER_CAMERA_YAW_TOGGLE_CODE, browserRequestsCameraYawToggle } from '../dist/browser/key-bindings.js';
import {
  createCameraRig,
  DEFAULT_CAMERA_YAW_MODE,
  movementYawInBodyPitchFrame,
  resetCameraRig,
  toggleCameraYawMode,
  updateCamera,
} from '../dist/camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../dist/camera/current-camera-profile.js';
import { wrapAngle } from '../dist/core/math.js';
import { createHillDipHeightProfile } from '../dist/dev/fixtures/hill-dip-height.js';
import { createMaterialTransitionSurfaceMap } from '../dist/dev/fixtures/material-transitions.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { createCameraYawDebugModel, createVehicleYawDebugModel } from '../dist/render/vehicle-yaw-debug.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';

const profile = CURRENT_CAMERA_PROFILE;

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

  near(movement.forwardSpeed, 30, 1e-9);
  near(movement.lateralSpeed, 7, 1e-9);
  near(movement.yawDelta, Math.atan2(7, 30), 1e-9);
  near(movement.yaw, wrapAngle(yaw + Math.atan2(7, 30)), 1e-9);

  const reverse = worldVelocityInBodyPitchPlane(yaw, pitch, -20, 0);
  const reverseMovement = movementYawInBodyPitchFrame(yaw, pitch, reverse.x, reverse.y, reverse.z);
  near(Math.abs(reverseMovement.yawDelta), Math.PI, 1e-9);
});

test('camera pitch follows physical body pitch while player X remains exactly centered', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const car = createTestCar(guide, height, createMaterialTransitionSurfaceMap(guide.length), 100);
  car.yaw = deg(24);
  car.pitch = deg(-9);
  const velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 28, -5);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;

  const camera = updateCamera(createCameraRig('MOVEMENT_FOLLOW'), { guide, height }, car, profile, 1 / 60);
  const expectedMovementDelta = Math.atan2(-5, 28);
  near(camera.yaw, wrapAngle(car.yaw + expectedMovementDelta), 1e-9);
  near(camera.pitch, profile.baseDownPitch - car.pitch, 1e-9);
  near(camera.bodyPitch, car.pitch, 1e-9);
  near(camera.playerScreenX, 160, 1e-12);
  near(Math.hypot(car.x - camera.x, car.z - camera.z), profile.dCam, 1e-9);
  near(car.course.s - camera.s, profile.dCam, 1e-9);
});

test('camera holds the last valid movement yaw when speed has no stable direction', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const car = createTestCar(guide, height, createMaterialTransitionSurfaceMap(guide.length), 100);
  const rig = createCameraRig('MOVEMENT_FOLLOW');
  car.yaw = deg(15);
  let velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 18, 8);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;
  const movingCamera = updateCamera(rig, { guide, height }, car, profile, 1 / 60);

  car.yaw += deg(70);
  velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 0.05, 0);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;
  const stoppedCamera = updateCamera(rig, { guide, height }, car, profile, 1 / 60);
  near(stoppedCamera.yaw, movingCamera.yaw, 1e-9);
});

test('body-fixed yaw is default exact and toggles to retained movement-follow yaw', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const car = createTestCar(guide, height, createMaterialTransitionSurfaceMap(guide.length), 100);
  car.yaw = deg(22);
  const velocity = worldVelocityInBodyPitchPlane(car.yaw, car.pitch, 24, 9);
  car.velocityX = velocity.x;
  car.velocityY = velocity.y;
  car.velocityZ = velocity.z;

  const rig = createCameraRig();
  assert.equal(DEFAULT_CAMERA_YAW_MODE, 'BODY_FIXED');
  const fixed = updateCamera(rig, { guide, height }, car, profile, 1 / 60);
  assert.equal(fixed.yawMode, 'BODY_FIXED');
  assert.equal(fixed.yaw, car.yaw);
  near(fixed.movementYaw, wrapAngle(car.yaw + Math.atan2(9, 24)), 1e-9);
  near(fixed.playerScreenX, profile.centerX, 1e-12);

  assert.equal(toggleCameraYawMode(rig), 'MOVEMENT_FOLLOW');
  const movement = updateCamera(rig, { guide, height }, car, profile, 1 / 60);
  assert.equal(movement.yawMode, 'MOVEMENT_FOLLOW');
  near(movement.yaw, fixed.movementYaw, 1e-9);

  resetCameraRig(rig);
  assert.equal(rig.yawMode, 'MOVEMENT_FOLLOW');
  assert.equal(rig.initialized, false);
});

test('debug yaw arrow expresses only body yaw relative to movement-facing camera', () => {
  const aligned = createVehicleYawDebugModel(0, 0);
  near(aligned.directionX, 0, 1e-9);
  near(aligned.directionY, -1, 1e-9);

  const right = createVehicleYawDebugModel(Math.PI / 2, 0);
  near(right.directionX, 1, 1e-9);
  near(right.directionY, 0, 1e-9);

  const left = createVehicleYawDebugModel(-Math.PI / 2, 0);
  near(left.directionX, -1, 1e-9);
  near(left.directionY, 0, 1e-9);

  const reversed = createVehicleYawDebugModel(Math.PI, 0);
  near(reversed.directionX, 0, 1e-9);
  near(reversed.directionY, 1, 1e-9);
});

test('body-fixed camera overlay points along actual travel while movement camera overlay points along body', () => {
  const fixed = createCameraYawDebugModel(0, Math.PI / 2, 0, 'BODY_FIXED');
  assert.equal(fixed.subject, 'TRAVEL');
  near(fixed.directionX, 1, 1e-9);
  near(fixed.directionY, 0, 1e-9);

  const movement = createCameraYawDebugModel(Math.PI / 2, 0, 0, 'MOVEMENT_FOLLOW');
  assert.equal(movement.subject, 'BODY');
  near(movement.directionX, 1, 1e-9);
  near(movement.directionY, 0, 1e-9);
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
    readFile(new URL('../src/camera/camera.ts', import.meta.url), 'utf8'),
  ]);

  for (const source of [linear, branching, circuit]) {
    assert.match(source, /shell\.present\([^;]*stats\.playerScreenY\)/);
    assert.match(source, /shell\.mountControls/);
  }
  const shell = await readFile(new URL('../src/browser/driving-shell.ts', import.meta.url), 'utf8');
  assert.match(
    shell,
    /drawVehicleYawDebug\(\s*ctx,\s*camera\.playerScreenX,\s*playerScreenY,\s*vehicle\.yaw,\s*camera\.movementYaw,\s*camera\.yaw,\s*camera\.yawMode,?\s*\)/,
  );
  assert.match(shell, /browserRequestsCameraYawToggle\(event\.code\)/);
  assert.match(shell, /mountMobileCameraYawSelector/);
  assert.doesNotMatch(cameraSource, /lCamMax|tauLat|thetaLagMax|playerSafeX|lateralG/);
  assert.doesNotMatch(cameraSource, /rebaseM5CameraRigCoordinateFrame/);
});
