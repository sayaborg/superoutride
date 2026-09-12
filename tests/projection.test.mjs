import { deg, near } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { guidePathToWorld, sampleGuidePath } from '../dist/core/guide-curve.js';

import { pseudoProject, straightRoadScreenX, pseudoDepth } from '../dist/core/projection.js';
import { rasterPathToWorld } from '../dist/core/raster-path.js';
import { createCircularArcGuide, createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { renderPose, terrainCamera } from './helpers/render-fixture.mjs';

import { drivingEnvironment } from './helpers/driving-environment.mjs';
import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';

import { renderDriving } from '../dist/render/renderer.js';

import { createFarBackground } from '../dist/visual/far-background.js';
import { createTestCar } from './helpers/vehicle-fixture.mjs';
import { createRoadsideSprites } from '../dist/dev/courses/roadside-scenery.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

describe('open coordinate geometry', () => {
  test('pseudo projection keeps same-s same-height anchors at identical depth, scale and Y', () => {
    const guide = createCircularArcGuide();
    const camPlan = guidePathToWorld(guide, 0, 0);
    const camera = {
      x: camPlan.x,
      y: 2,
      z: camPlan.z,
      yaw: camPlan.heading,
      pitch: deg(8),
      s: 0,
      focalLength: 200,
      centerX: 160,
      centerY: 120,
    };

    const leftPlan = rasterPathToWorld(guide.raster, 40, -10);
    const rightPlan = rasterPathToWorld(guide.raster, 40, 10);
    const left = pseudoProject({ ...leftPlan, y: 0 }, camera);
    const right = pseudoProject({ ...rightPlan, y: 0 }, camera);

    near(left.depth, right.depth, 1e-8);
    near(left.scale, right.scale, 1e-8);
    near(left.y, right.y, 1e-8);
    assert.notEqual(left.x, right.x);
  });

  test('general pseudo projection reduces to Core straight-road yaw equation', () => {
    const theta = deg(18);
    const f = 200;
    const d = 50;
    const l = 7;
    const lCam = -2;
    const camera = {
      x: lCam,
      y: 2,
      z: 0,
      yaw: theta,
      pitch: 0,
      s: 0,
      focalLength: f,
      centerX: 160,
      centerY: 120,
    };
    const projected = pseudoProject({ x: l, y: 0, z: d, s: d }, camera);
    const expected = straightRoadScreenX(160, f, d, theta, l, lCam);
    near(projected.x, expected, 1e-10);
  });
});

describe('flat stadium geometry', () => {
  const cameraProfile = {
    dCam: 20,
    lCamMax: 12,
    height: 2,
    pitch: deg(8),
    focalLength: 200,
    centerX: 160,
    centerY: 120,
  };

  test('camera chainage keeps player pseudo-depth exactly D_cam even with lateral offset and yaw', () => {
    const guide = createStadiumGuide();
    const vehicle = renderPose(guide, 80);
    vehicle.course.l = 7;
    vehicle.yaw += deg(25);
    const camera = terrainCamera(guide, null, vehicle, cameraProfile);
    const d = pseudoDepth(vehicle.course.s, camera.s);
    near(d, cameraProfile.dCam, 1e-10);
  });

  test('player projection scale depends on chainage depth, not Euclidean camera distance', () => {
    const guide = createStadiumGuide();
    const vehicle = renderPose(guide, 80);
    vehicle.course.l = 10;
    const roadAtCar = sampleGuidePath(guide, vehicle.course.s);
    const displaced = guidePathToWorld(guide, vehicle.course.s, 10);
    vehicle.x = displaced.x;
    vehicle.z = displaced.z;
    vehicle.yaw = roadAtCar.heading + deg(15);

    const camera = terrainCamera(guide, null, vehicle, cameraProfile);
    const projected = pseudoProject({ x: vehicle.x, y: 0, z: vehicle.z, s: vehicle.course.s }, camera);
    near(projected.depth, 20, 1e-7);
    near(projected.scale, 10, 1e-7);
  });
});

describe('physical player projection', () => {
  const { guide, height, surfaces, cameraProfile, groundProfile, terrainProfile } = drivingEnvironment();

  function placeCar(car, s, l, speed = 30) {
    const p = guidePathToWorld(guide, s, l);
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

  test('renderer projects player from physical Y and keeps player depth/scale chainage-only', () => {
    const assets = createSpriteAssets();
    const world = createRoadsideSprites(guide, height, assets);
    const background = createFarBackground();
    const car = createTestCar(guide, height, surfaces, 520);
    placeCar(car, 520, -8, 20);
    // Force an airborne offset to prove renderer consumes vehicle.y rather than Y_render.
    car.y = height.samplePhysics(520) - 0.5;
    car.frontNormalLoad = 0;
    car.rearNormalLoad = 0;
    car.surfaceType = 'VOID';
    const rig = createCameraRig();
    const camera = updateCamera(rig, { guide, height }, car, cameraProfile, 1 / 60);
    const projected = pseudoProject({ x: car.x, y: car.y, z: car.z, s: car.course.s }, camera);
    const surface = new SoftwareSurface(320, 240);
    const stats = renderDriving(
      surface,
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
    assert.ok(stats.playerWrittenPixels > 0);
    near(projected.scale, cameraProfile.focalLength / cameraProfile.dCam, 1e-9);
    near(pseudoDepth(car.course.s, camera.s), cameraProfile.dCam, 1e-9);
  });
});
