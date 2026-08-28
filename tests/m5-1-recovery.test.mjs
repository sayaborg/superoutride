import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { pseudoProject } from '../dist/core/projection.js';
import { createM5CameraRig, resetM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { createM5RecoveryState, recoverM5Vehicle, updateM5Recovery } from '../dist/gameplay/recovery.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { createM5Bike, updateM5Bike } from '../dist/physics/motorcycle-physics.js';
import { quaternionFromYawPitchLean } from '../dist/physics/vehicle-math3.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createM4DebugWorldSprites } from '../dist/dev/m4-debug-world.js';

const deg = (v) => v * Math.PI / 180;
const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const surfaces = createM5DebugSurfaceMap(guide.length);
const cameraProfile = {
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  lCamMax: 12,
  height: 2.469902425419539,
  pitch: deg(8),
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  kPsi: 0.65,
  thetaLagMax: deg(20),
  sDotMin: 8,
  tauLat: 0.18,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
  playerSafeXMin: 48,
  playerSafeXMax: 272,
};
const groundProfile = { groundLeft: 12, groundRight: 12, roadLeft: 4.5, roadRight: 4.5, shoulderWidth: 1 };
const terrainProfile = {
  screenHeight: 240,
  dMin: 2.5,
  dMax: 150,
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  height,
  visual,
};

function updateCameraAfterRecovery(rig, vehicle, recoveryReason) {
  if (recoveryReason !== null) resetM5CameraRig(rig);
  return updateM5Camera(rig, guide, height, vehicle, cameraProfile, 1 / 60);
}

test('sustained steering into VOID recovers before the player sprite can disappear', () => {
  const car = createM5Car(guide, height, surfaces, 45);
  const recovery = createM5RecoveryState(car);
  const rig = createM5CameraRig();
  const assets = createM4SpriteAssets();
  const world = createM4DebugWorldSprites(guide, height, assets);
  const background = createM3FarBackground();
  const target = new SoftwareSurface(320, 240);
  let camera = updateM5Camera(rig, guide, height, car, cameraProfile, 1 / 60);
  let minimumWritten = Infinity;

  for (let i = 0; i < 1200; i += 1) {
    updateM5Car(guide, height, surfaces, car, { steering: 1, throttle: true, brake: false }, 1 / 60);
    const reason = updateM5Recovery(recovery, guide, height, surfaces, car, 1 / 60);
    camera = updateCameraAfterRecovery(rig, car, reason);
    const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
    assert.ok(projected.x >= 47.9 && projected.x <= 272.1, `player anchor left safe X at frame ${i}: ${projected.x}`);
    const stats = renderM5Driving(target, background, guide, camera, car, terrainProfile, groundProfile, world, assets, 'car');
    minimumWritten = Math.min(minimumWritten, stats.playerWrittenPixels);
    assert.ok(stats.playerWrittenPixels > 0, `player disappeared at frame ${i}`);
  }

  assert.ok(recovery.recoveries > 0, 'probe must actually enter VOID and recover');
  assert.ok(minimumWritten > 0);
});

test('automatic recovery returns a fallen car to supported road center and resets unsafe motion', () => {
  const car = createM5Car(guide, height, surfaces, 520);
  car.course = { ...car.course, s: 520, l: -8 };
  car.frontNormalLoad = 0;
  car.rearNormalLoad = 0;
  car.frontSupportAvailable = false;
  car.rearSupportAvailable = false;
  car.surfaceType = 'VOID';
  car.y = height.samplePhysics(520) - 4;
  car.velocityX = Math.cos(car.yaw) * 14 + Math.sin(car.yaw) * 30;
  car.velocityY = -12;
  car.velocityZ = -Math.sin(car.yaw) * 14 + Math.cos(car.yaw) * 30;
  car.yawRate = 1.2;
  const recovery = createM5RecoveryState(car);
  recovery.lastSafeS = 500;

  const reason = updateM5Recovery(recovery, guide, height, surfaces, car, 1 / 60);
  assert.equal(reason, 'fall-distance');
  assert.equal(car.supported, true);
  assert.equal(car.surfaceType, 'ASPHALT');
  assert.ok(Math.abs(car.course.l) < 1e-12);
  assert.equal(car.verticalSpeed, 0);
  assert.ok(Math.abs(car.lateralSpeed) < 1e-12);
  assert.equal(car.yawRate, 0);
  assert.equal(recovery.recoveries, 1);
});

test('bike recovery clears bank state instead of carrying a crash lean into respawn', () => {
  const bike = createM5Bike(guide, height, surfaces, 520);
  bike.orientation = quaternionFromYawPitchLean(bike.yaw, bike.sprungPitch, deg(40));
  bike.omegaBody = { x: 2, y: 0, z: 0 };
  bike.frontNormalLoad = 0;
  bike.rearNormalLoad = 0;
  bike.frontSupportAvailable = false;
  bike.rearSupportAvailable = false;
  bike.surfaceType = 'VOID';
  bike.course = { ...bike.course, s: 520, l: -20 };
  const recovery = createM5RecoveryState(bike);
  recovery.lastSafeS = 500;

  const reason = updateM5Recovery(recovery, guide, height, surfaces, bike, 1 / 60);
  assert.equal(reason, 'chart-excursion');
  assert.ok(Math.abs(bike.bankAngle) < 1e-12);
  assert.ok(Math.abs(bike.bankRate) < 1e-12);
  assert.ok(Math.abs(bike.sprungRoll) < 1e-12);
  assert.ok(Math.abs(bike.course.l) < 1e-12);
});

test('manual recovery is presentation/gameplay reset and preserves chainage pseudo-projection afterward', () => {
  const car = createM5Car(guide, height, surfaces, 100);
  const recovery = createM5RecoveryState(car);
  recovery.lastSafeS = 100;
  car.course = { ...car.course, l: 35 };
  car.y -= 20;
  recoverM5Vehicle(recovery, guide, height, surfaces, car, 'manual');
  const rig = createM5CameraRig();
  resetM5CameraRig(rig);
  const camera = updateM5Camera(rig, guide, height, car, cameraProfile, 1 / 60);
  const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
  assert.ok(projected.x > 0 && projected.x < 320);
  assert.ok(projected.y > 0 && projected.y < 240);
  assert.ok(projected.scale > 0);
  assert.equal(recovery.lastReason, 'manual');
});

test('supported bike remains controllable without recovery firing spuriously', () => {
  const bike = createM5Bike(guide, height, surfaces, 80);
  const recovery = createM5RecoveryState(bike);
  for (let i = 0; i < 30; i += 1) {
    updateM5Bike(guide, height, surfaces, bike, { steering: 0.15, throttle: true, brake: false }, 1 / 60);
    const reason = updateM5Recovery(recovery, guide, height, surfaces, bike, 1 / 60);
    assert.equal(reason, null);
  }
  assert.equal(recovery.recoveries, 0);
});
