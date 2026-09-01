import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { pseudoDepth, pseudoProject } from '../dist/core/projection.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { createTestBike, createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import {
  deriveVehicleLeanRadians,
  deriveVehicleNormalizedBank,
} from '../dist/render/vehicle-presentation.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/dev/m3-debug-height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createM4DebugWorldSprites } from '../dist/dev/m4-debug-world.js';

const deg = (v) => v * Math.PI / 180;
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} ± ${eps}`);

const guide = createM2StadiumGuide();
const height = createM3DebugHeightProfile(guide.length);
const visual = createM3DebugVisualProfile(guide.length);
const surfaces = createM5DebugSurfaceMap(guide.length);
const cameraProfile = {
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  height: 2.469902425419539,
  baseDownPitch: deg(8),
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
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

function placeCar(car, s, l, speed = 30) {
  const p = guideCourseToWorld(guide, s, l);
  car.x = p.x;
  car.z = p.z;
  car.y = height.samplePhysics(s) + 0.55;
  car.yaw = p.heading;
  car.velocityX = Math.sin(car.yaw) * speed;
  car.velocityY = 0;
  car.velocityZ = Math.cos(car.yaw) * speed;
  car.yawRate = 0;
  car.course = { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  const surface = surfaces.sample(s, l);
  car.surfaceType = surface.type;
  car.frontNormalLoad = surface.material.supported ? 1 : 0;
  car.rearNormalLoad = surface.material.supported ? 1 : 0;
}

test('SurfaceMap returns lightweight physical attributes independent from GroundMap pixels', () => {
  assert.equal(surfaces.sample(100, 0).type, 'ASPHALT');
  assert.equal(surfaces.sample(100, 5).type, 'SHOULDER');
  assert.equal(surfaces.sample(100, 8).type, 'GRASS');
  assert.equal(surfaces.sample(300, 8).type, 'SAND');
  assert.equal(surfaces.sample(380, -8).type, 'DIRT');
  assert.equal(surfaces.sample(520, -8).type, 'VOID');
  assert.equal(surfaces.sample(520, 0).type, 'ASPHALT');
});

test('SurfaceMap supports authored custom support even when visual GroundBase decisions are unrelated', () => {
  const custom = new CyclicSurfaceMap(100, [{
    sStart: 0,
    name: 'CUSTOM',
    bands: [{ lMin: -9, lMax: -7, type: 'GRASS' }],
  }]);
  assert.equal(custom.sample(10, -8).type, 'GRASS');
  assert.equal(custom.sample(10, 0).type, 'VOID');
});

test('Y_phys is a semantically separate smooth channel from piecewise-linear Y_render', () => {
  const s = 95;
  const render = height.sampleRender(s).y;
  const phys = height.samplePhysics(s);
  assert.notEqual(render, phys);
  near(height.samplePhysics(125), height.sampleCamera(125));
});

test('car remains world-authoritative and can traverse laterally across the road chart', () => {
  const car = createTestCar(guide, height, surfaces, 70);
  const startL = car.course.l;
  let maxAbsYawRate = 0;
  for (let i = 0; i < 120; i += 1) {
    updateTestVehicle(guide, height, surfaces, car, { steering: 0.35, throttle: true, brake: false }, 1 / 60);
    maxAbsYawRate = Math.max(maxAbsYawRate, Math.abs(car.yawRate));
  }
  assert.ok(Math.abs(car.course.l - startL) > 2);
  assert.ok(Math.abs(car.lateralSpeed) > 0.1);
  assert.ok(maxAbsYawRate > 0.01);
});

test('surface material changes longitudinal acceleration without changing DrivingInput', () => {
  const asphalt = createTestCar(guide, height, surfaces, 300);
  const sand = createTestCar(guide, height, surfaces, 300);
  placeCar(asphalt, 300, 0, 10);
  placeCar(sand, 300, 8, 10);
  for (let i = 0; i < 45; i += 1) {
    const input = { steering: 0, throttle: true, brake: false };
    updateTestVehicle(guide, height, surfaces, asphalt, input, 1 / 60);
    updateTestVehicle(guide, height, surfaces, sand, input, 1 / 60);
  }
  assert.ok(asphalt.longitudinalSpeed > sand.longitudinalSpeed + 0.5);
});

test('lower-friction sand limits turning response versus asphalt in the same steering probe', () => {
  const asphalt = createTestCar(guide, height, surfaces, 300);
  const sand = createTestCar(guide, height, surfaces, 300);
  placeCar(asphalt, 300, 0, 28);
  placeCar(sand, 300, 8, 28);
  let asphaltPeakYawRate = 0;
  let sandPeakYawRate = 0;
  for (let i = 0; i < 30; i += 1) {
    // M9.7's smaller reserved driver offset requires full request to exercise the friction limit;
    // a partial request can remain below asphalt capacity while sand over-rotates in saturation.
    const input = { steering: -1, throttle: false, brake: false };
    updateTestVehicle(guide, height, surfaces, asphalt, input, 1 / 60);
    updateTestVehicle(guide, height, surfaces, sand, input, 1 / 60);
    asphaltPeakYawRate = Math.max(asphaltPeakYawRate, Math.abs(asphalt.yawRate));
    sandPeakYawRate = Math.max(sandPeakYawRate, Math.abs(sand.yawRate));
  }
  assert.ok(asphaltPeakYawRate > sandPeakYawRate * 1.3);
});

test('VOID means no support: planar momentum continues while vertical state falls', () => {
  const car = createTestCar(guide, height, surfaces, 520);
  placeCar(car, 520, -8, 20);
  const y0 = car.y;
  updateTestVehicle(guide, height, surfaces, car, { steering: 0, throttle: true, brake: false }, 0.1);
  assert.equal(car.supported, false);
  assert.equal(car.surfaceType, 'VOID');
  assert.ok(car.verticalSpeed < 0);
  assert.ok(car.y < y0);
  assert.ok(car.speed > 0);
});

test('M5 camera retains exact chainage D_cam and bounded horizontal/vertical framing', () => {
  const car = createTestCar(guide, height, surfaces, 125);
  placeCar(car, 125, 0, 35);
  const rig = createM5CameraRig();
  let camera;
  for (let i = 0; i < 180; i += 1) {
    camera = updateM5Camera(rig, guide, height, car, cameraProfile, 1 / 60);
  }
  near(pseudoDepth(car.course.s, camera.s), cameraProfile.dCam, 1e-9);
  assert.ok(Math.abs(camera.verticalCorrection) <= cameraProfile.deltaYMax + 1e-9);
  assert.ok(Math.abs(camera.playerFrameError) < 2.0);
});

test('M5 renderer projects player from physical Y and keeps player depth/scale chainage-only', () => {
  const assets = createM4SpriteAssets();
  const world = createM4DebugWorldSprites(guide, height, assets);
  const background = createM3FarBackground();
  const car = createTestCar(guide, height, surfaces, 520);
  placeCar(car, 520, -8, 20);
  // Force an airborne offset to prove renderer consumes vehicle.y rather than Y_render.
  car.y = height.samplePhysics(520) - 0.5;
  car.frontNormalLoad = 0;
  car.rearNormalLoad = 0;
  car.surfaceType = 'VOID';
  const rig = createM5CameraRig();
  const camera = updateM5Camera(rig, guide, height, car, cameraProfile, 1 / 60);
  const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
  const surface = new SoftwareSurface(320, 240);
  const stats = renderM5Driving(surface, background, guide, camera, car, terrainProfile, groundProfile, world, assets, 'car');
  assert.ok(stats.playerWrittenPixels > 0);
  near(projected.scale, cameraProfile.focalLength / cameraProfile.dCam, 1e-9);
  near(pseudoDepth(car.course.s, camera.s), cameraProfile.dCam, 1e-9);
});


test('BIKE profile produces physical yaw and derived presentation lean from canonical DrivingInput', () => {
  const bike = createTestBike(guide, height, surfaces, 100);
  for (let i = 0; i < 90; i += 1) {
    updateTestVehicle(guide, height, surfaces, bike, { steering: 0.55, throttle: true, brake: false }, 1 / 60);
  }
  assert.ok(Math.abs(deriveVehicleLeanRadians(bike)) > deg(5));
  assert.ok(Math.abs(bike.yawRate) > 0.05);
  assert.ok(Math.abs(bike.course.l) > 0.05);
  assert.ok(Math.abs(deriveVehicleNormalizedBank(bike)) > 0.05);
});

test('BIKE profile surface response changes through the common physical material input', () => {
  const asphalt = createTestBike(guide, height, surfaces, 300, 0, 25);
  const sand = createTestBike(guide, height, surfaces, 300, 8, 25);
  assert.equal(surfaces.sample(300, 0).type, 'ASPHALT');
  assert.equal(surfaces.sample(300, 8).type, 'SAND');
  for (let i = 0; i < 45; i += 1) {
    const input = { steering: -0.8, throttle: false, brake: false };
    updateTestVehicle(guide, height, surfaces, asphalt, input, 1 / 60);
    updateTestVehicle(guide, height, surfaces, sand, input, 1 / 60);
  }
  assert.notEqual(asphalt.lateralSpeed, sand.lateralSpeed);
  assert.notEqual(asphalt.yawRate, sand.yawRate);
});

test('BIKE derived presentation lean selects a non-center yaw x bank sprite variant', () => {
  const bike = createTestBike(guide, height, surfaces, 100);
  bike.yawRate = 0.2;
  const assets = createM4SpriteAssets();
  const normalizedBank = deriveVehicleNormalizedBank(bike);
  const bankCount = assets.bike.bankVariants;
  const bankIndex = Math.round((Math.max(-1, Math.min(1, normalizedBank)) + 1) * 0.5 * (bankCount - 1));
  assert.notEqual(bankIndex, Math.floor(bankCount / 2));
});

test('FR and BIKE profiles create independent instances of the same authoritative state shape', () => {
  const car = createTestCar(guide, height, surfaces, 140);
  const bike = createTestBike(guide, height, surfaces, 45);
  assert.notEqual(car.course.s, bike.course.s);
  assert.equal('orientation' in car, false);
  assert.equal('pitch' in car, true);
  assert.equal('pitch' in bike, true);
  assert.equal(car.profile.id, 'FR');
  assert.equal(bike.profile.id, 'BIKE1');
  assert.notEqual(car.profile, bike.profile);
  assert.equal('frontLateralForce' in car, false);
  assert.equal('contacts' in bike, false);
});
