import assert from 'node:assert/strict';
import test from 'node:test';

import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { pseudoProject } from '../dist/core/projection.js';
import { createM72DefaultBranchingParent } from '../dist/dev/m7-2-default-branching-highway.js';
import { createM5Car } from '../dist/physics/car-physics.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import {
  createRenderSpaceCamera,
  mapPhysicalHeightToRender,
} from '../dist/render/render-height-space.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from '../dist/world/dynamic-vehicle-sprite.js';

const near = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
};

const cameraProfile = {
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  height: 2.469902425419539,
  baseDownPitch: 8 * Math.PI / 180,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
};

test('render height adapter removes the public-course 3.37 m physics/render split without losing offsets', () => {
  const parent = createM72DefaultBranchingParent();
  const height = parent.heightProfile;
  const s = 2_298;
  const physicalRoadY = height.samplePhysics(s);
  const renderRoadY = height.sampleRender(s).y;

  assert.ok(Math.abs(physicalRoadY - renderRoadY) > 3.36);
  near(mapPhysicalHeightToRender(height, s, physicalRoadY), renderRoadY);
  near(mapPhysicalHeightToRender(height, s, physicalRoadY + 2.5), renderRoadY + 2.5);
  near(mapPhysicalHeightToRender(height, s, physicalRoadY - 0.064), renderRoadY - 0.064);
});

test('M5 player and camera share render height space while suspension displacement remains visible', () => {
  const parent = createM72DefaultBranchingParent();
  const height = parent.heightProfile;
  const car = createM5Car(parent.guide, height, parent.surfaceMap, 2_298, -1.75);
  const camera = updateM5Camera(
    createM5CameraRig(),
    parent.guide,
    height,
    car,
    cameraProfile,
    1 / 60,
  );
  const renderCamera = createRenderSpaceCamera(height, camera);
  const renderRoadY = height.sampleRender(car.course.s).y;
  const physicalRoadY = height.samplePhysics(car.course.s);
  const oldPlayer = pseudoProject(
    { x: car.x, y: car.presentationY, z: car.z, s: car.course.s },
    camera,
  );
  const oldRoad = pseudoProject(
    { x: car.x, y: renderRoadY, z: car.z, s: car.course.s },
    camera,
  );
  assert.ok(Math.abs(oldPlayer.y - oldRoad.y) > 100, 'fixture must reproduce the old visual split');

  const surface = new SoftwareSurface(320, 240);
  const result = renderM5Driving(
    surface,
    createM3FarBackground(),
    parent.guide,
    camera,
    car,
    parent.terrainProfile,
    parent.groundProfile,
    [],
    createM4SpriteAssets(),
    'car',
  );
  const renderRoad = pseudoProject(
    { x: car.x, y: renderRoadY, z: car.z, s: car.course.s },
    renderCamera,
  );
  const physicalRoadOffset = car.presentationY - physicalRoadY;
  const expectedScreenOffset = -renderRoad.scale * physicalRoadOffset * Math.cos(renderCamera.pitch);
  near(result.playerScreenY - renderRoad.y, expectedScreenOffset, 1e-9);
});

test('dynamic rival adapter maps physical anchors into the same render road space', () => {
  const parent = createM72DefaultBranchingParent();
  const car = createM5Car(parent.guide, parent.heightProfile, parent.surfaceMap, 2_298, 1.75);
  const sprite = createDynamicVehicleCourseSprite(
    'RIVAL',
    car,
    car.yaw,
    createM4SpriteAssets().car,
    parent.heightProfile,
  );
  const expected = parent.heightProfile.sampleRender(car.course.s).y
    + car.presentationY
    - parent.heightProfile.samplePhysics(car.course.s);
  near(sprite.y, expected);
});
