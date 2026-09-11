import { drivingEnvironment } from './helpers/driving-environment.mjs';

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCameraRig, resetCameraRig, updateCamera } from '../dist/camera/camera.js';
import { pseudoProject } from '../dist/core/projection.js';
import { createRecoveryState, recoverVehicle, updateRecovery } from '../dist/gameplay/recovery.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';
import { renderDriving } from '../dist/render/renderer.js';
import { deriveVehicleLeanRadians } from '../dist/render/vehicle-presentation.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createTestBike, createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';

import { createRoadsideSprites } from '../dist/dev/courses/roadside-scenery.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

const { guide, height, surfaces, cameraProfile, groundProfile, terrainProfile } = drivingEnvironment();

function updateCameraAfterRecovery(rig, vehicle, recoveryReason) {
  if (recoveryReason !== null) resetCameraRig(rig);
  return updateCamera(rig, { guide, height }, vehicle, cameraProfile, 1 / 60);
}

test('sustained steering into VOID recovers before the player sprite can disappear', () => {
  const car = createTestCar(guide, height, surfaces, 45);
  const recovery = createRecoveryState(car);
  const rig = createCameraRig();
  const assets = createSpriteAssets();
  const world = createRoadsideSprites(guide, height, assets);
  const background = createFarBackground();
  const target = new SoftwareSurface(320, 240);
  let camera = updateCamera(rig, { guide, height }, car, cameraProfile, 1 / 60);
  let minimumWritten = Infinity;

  for (let i = 0; i < 1200; i += 1) {
    updateTestVehicle(guide, height, surfaces, car, { steering: 1, throttle: true, brake: false }, 1 / 60);
    const reason = updateRecovery({ guide, height, surfaces }, car, {
      state: recovery,
      dt: 1 / 60,
    });
    camera = updateCameraAfterRecovery(rig, car, reason);
    const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
    assert.ok(projected.x >= 47.9 && projected.x <= 272.1, `player anchor left safe X at frame ${i}: ${projected.x}`);
    const stats = renderDriving(
      target,
      {
        background,
        guide,
        camera,
        vehicle: car,
        terrainProfile,
        groundProfile,
        worldSprites: world,
        assets,
        playerKind: 'car',
      },
      {},
    );
    minimumWritten = Math.min(minimumWritten, stats.playerWrittenPixels);
    assert.ok(stats.playerWrittenPixels > 0, `player disappeared at frame ${i}`);
  }

  assert.ok(recovery.recoveries > 0, 'probe must actually enter VOID and recover');
  assert.ok(minimumWritten > 0);
});

test('automatic recovery returns a fallen car to supported road center and resets unsafe motion', () => {
  const car = createTestCar(guide, height, surfaces, 520);
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
  const recovery = createRecoveryState(car);
  recovery.lastSafeS = 500;

  const reason = updateRecovery({ guide, height, surfaces }, car, {
    state: recovery,
    dt: 1 / 60,
  });
  assert.equal(reason, 'fall-distance');
  assert.equal(car.supported, true);
  assert.equal(car.surfaceType, 'ASPHALT');
  assert.ok(Math.abs(car.course.l) < 1e-12);
  assert.equal(car.verticalSpeed, 0);
  assert.ok(Math.abs(car.lateralSpeed) < 1e-12);
  assert.equal(car.yawRate, 0);
  assert.equal(recovery.recoveries, 1);
});

test('common recovery clears dynamic state instead of carrying a crash response into respawn', () => {
  const bike = createTestBike(guide, height, surfaces, 520);
  bike.yawRate = 2;
  bike.pitchRate = -1;
  bike.actuator.steering = 1;
  bike.frontNormalLoad = 0;
  bike.rearNormalLoad = 0;
  bike.frontSupportAvailable = false;
  bike.rearSupportAvailable = false;
  bike.surfaceType = 'VOID';
  bike.course = { ...bike.course, s: 520, l: -20 };
  const recovery = createRecoveryState(bike);
  recovery.lastSafeS = 500;

  const reason = updateRecovery({ guide, height, surfaces }, bike, {
    state: recovery,
    dt: 1 / 60,
  });
  assert.equal(reason, 'chart-excursion');
  assert.equal(bike.yawRate, 0);
  assert.equal(bike.pitchRate, 0);
  assert.equal(bike.actuator.steering, 0);
  assert.ok(Math.abs(deriveVehicleLeanRadians(bike)) < 1e-12);
  assert.ok(Math.abs(bike.course.l) < 1e-12);
});

test('manual recovery is presentation/gameplay reset and preserves chainage pseudo-projection afterward', () => {
  const car = createTestCar(guide, height, surfaces, 100);
  const recovery = createRecoveryState(car);
  recovery.lastSafeS = 100;
  car.course = { ...car.course, l: 35 };
  car.y -= 20;
  recoverVehicle({ guide, height, surfaces }, car, { state: recovery, reason: 'manual' });
  const rig = createCameraRig();
  resetCameraRig(rig);
  const camera = updateCamera(rig, { guide, height }, car, cameraProfile, 1 / 60);
  const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
  assert.ok(projected.x > 0 && projected.x < 320);
  assert.ok(projected.y > 0 && projected.y < 240);
  assert.ok(projected.scale > 0);
  assert.equal(recovery.lastReason, 'manual');
});

test('supported bike remains controllable without recovery firing spuriously', () => {
  const bike = createTestBike(guide, height, surfaces, 80);
  const recovery = createRecoveryState(bike);
  for (let i = 0; i < 30; i += 1) {
    updateTestVehicle(guide, height, surfaces, bike, { steering: 0.15, throttle: true, brake: false }, 1 / 60);
    const reason = updateRecovery({ guide, height, surfaces }, bike, {
      state: recovery,
      dt: 1 / 60,
    });
    assert.equal(reason, null);
  }
  assert.equal(recovery.recoveries, 0);
});
