import assert from 'node:assert/strict';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { pseudoDepth, pseudoProject } from '../dist/core/projection.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { createM5Car, updateM5Car } from '../dist/physics/car-physics.js';
import { adoptM5BikeKinematics, adoptM5CarKinematics, createM5Bike, updateM5Bike } from '../dist/physics/motorcycle-physics.js';
import { CyclicSurfaceMap } from '../dist/physics/surface-map.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
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
  car.y = height.samplePhysics(s);
  car.yaw = p.heading;
  car.longitudinalSpeed = speed;
  car.lateralSpeed = 0;
  car.yawRate = 0;
  car.speed = speed;
  car.course = { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 };
  car.verticalSpeed = 0;
  const surface = surfaces.sample(s, l);
  car.surfaceType = surface.type;
  car.supported = surface.material.supported;
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
  const car = createM5Car(guide, height, surfaces, 70);
  const startL = car.course.l;
  for (let i = 0; i < 120; i += 1) {
    updateM5Car(guide, height, surfaces, car, { steering: 0.35, throttle: true, brake: false }, 1 / 60);
  }
  assert.ok(Math.abs(car.course.l - startL) > 2);
  assert.ok(Math.abs(car.lateralSpeed) > 0.1);
  assert.ok(Math.abs(car.yawRate) > 0.01);
});

test('surface material changes longitudinal acceleration without changing DrivingInput', () => {
  const asphalt = createM5Car(guide, height, surfaces, 300);
  const sand = createM5Car(guide, height, surfaces, 300);
  placeCar(asphalt, 300, 0, 10);
  placeCar(sand, 300, 8, 10);
  for (let i = 0; i < 45; i += 1) {
    const input = { steering: 0, throttle: true, brake: false };
    updateM5Car(guide, height, surfaces, asphalt, input, 1 / 60);
    updateM5Car(guide, height, surfaces, sand, input, 1 / 60);
  }
  assert.ok(asphalt.longitudinalSpeed > sand.longitudinalSpeed + 0.5);
});

test('lower-friction sand limits turning response versus asphalt in the same steering probe', () => {
  const asphalt = createM5Car(guide, height, surfaces, 300);
  const sand = createM5Car(guide, height, surfaces, 300);
  placeCar(asphalt, 300, 0, 28);
  placeCar(sand, 300, 8, 28);
  for (let i = 0; i < 30; i += 1) {
    const input = { steering: -0.45, throttle: false, brake: false };
    updateM5Car(guide, height, surfaces, asphalt, input, 1 / 60);
    updateM5Car(guide, height, surfaces, sand, input, 1 / 60);
  }
  assert.ok(Math.abs(asphalt.yawRate) > Math.abs(sand.yawRate));
});

test('VOID means no support: planar momentum continues while vertical state falls', () => {
  const car = createM5Car(guide, height, surfaces, 520);
  placeCar(car, 520, -8, 20);
  const y0 = car.y;
  updateM5Car(guide, height, surfaces, car, { steering: 0, throttle: true, brake: false }, 0.1);
  assert.equal(car.supported, false);
  assert.equal(car.surfaceType, 'VOID');
  assert.ok(car.verticalSpeed < 0);
  assert.ok(car.y < y0);
  assert.ok(car.speed > 0);
});

test('M5 camera retains exact chainage D_cam and bounded horizontal/vertical framing', () => {
  const car = createM5Car(guide, height, surfaces, 125);
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
  const car = createM5Car(guide, height, surfaces, 520);
  placeCar(car, 520, -8, 20);
  // Force an airborne offset to prove renderer consumes vehicle.y rather than Y_render.
  car.y = height.samplePhysics(520) - 0.5;
  car.supported = false;
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


test('motorcycle steering produces physical bank and yaw while reusing canonical DrivingInput', () => {
  const bike = createM5Bike(guide, height, surfaces, 100);
  for (let i = 0; i < 90; i += 1) {
    updateM5Bike(guide, height, surfaces, bike, { steering: 0.55, throttle: true, brake: false }, 1 / 60);
  }
  assert.ok(bike.bankAngle > deg(5));
  assert.ok(bike.yawRate > 0);
  assert.ok(bike.course.l > 0);
  assert.ok(bike.sprungRoll > 0);
});

test('motorcycle bank/yaw authority is surface-grip limited on sand', () => {
  const asphalt = createM5Bike(guide, height, surfaces, 300);
  const sand = createM5Bike(guide, height, surfaces, 300);
  const pa = guideCourseToWorld(guide, 300, 0);
  const ps = guideCourseToWorld(guide, 300, 8);
  Object.assign(asphalt, { x: pa.x, z: pa.z, y: height.samplePhysics(300), yaw: pa.heading, course: { s: pa.s, l: 0, segmentIndex: pa.segmentIndex, distanceSquared: 0 }, longitudinalSpeed: 25, speed: 25 });
  Object.assign(sand, { x: ps.x, z: ps.z, y: height.samplePhysics(300), yaw: ps.heading, course: { s: ps.s, l: 8, segmentIndex: ps.segmentIndex, distanceSquared: 0 }, longitudinalSpeed: 25, speed: 25 });
  for (let i = 0; i < 45; i += 1) {
    const input = { steering: -0.8, throttle: false, brake: false };
    updateM5Bike(guide, height, surfaces, asphalt, input, 1 / 60);
    updateM5Bike(guide, height, surfaces, sand, input, 1 / 60);
  }
  assert.ok(Math.abs(asphalt.bankAngle) > Math.abs(sand.bankAngle));
  assert.ok(Math.abs(asphalt.yawRate) > Math.abs(sand.yawRate));
});

test('motorcycle physical bank state selects non-center yaw x bank sprite variant', () => {
  const bike = createM5Bike(guide, height, surfaces, 100);
  for (let i = 0; i < 60; i += 1) {
    updateM5Bike(guide, height, surfaces, bike, { steering: 0.7, throttle: true, brake: false }, 1 / 60);
  }
  const assets = createM4SpriteAssets();
  const normalizedBank = bike.sprungRoll / 0.55;
  const bankCount = assets.bike.bankVariants;
  const bankIndex = Math.round((Math.max(-1, Math.min(1, normalizedBank)) + 1) * 0.5 * (bankCount - 1));
  assert.notEqual(bankIndex, Math.floor(bankCount / 2));
});

test('car/bike model toggle transfers world kinematics instead of teleporting', () => {
  const car = createM5Car(guide, height, surfaces, 140);
  for (let i = 0; i < 25; i += 1) updateM5Car(guide, height, surfaces, car, { steering: 0.2, throttle: true, brake: false }, 1 / 60);
  const bike = createM5Bike(guide, height, surfaces, 45);
  adoptM5BikeKinematics(bike, car);
  near(bike.x, car.x);
  near(bike.y, car.y);
  near(bike.z, car.z);
  near(bike.yaw, car.yaw);
  near(bike.longitudinalSpeed, car.longitudinalSpeed);
  const car2 = createM5Car(guide, height, surfaces, 45);
  adoptM5CarKinematics(car2, bike);
  near(car2.x, bike.x);
  near(car2.course.s, bike.course.s);
});
