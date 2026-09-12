import { deg } from './helpers/assert.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CENTER_DASH_MARKINGS } from '../dist/dev/courses/stadium-surface-authoring.js';

import { createCameraRig, updateCamera } from '../dist/camera/camera.js';
import { guidePathToWorld } from '../dist/core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { pseudoDepth } from '../dist/core/projection.js';
import { createCliffVisualProfile } from '../dist/dev/fixtures/cliff-visual.js';
import { createHillDipHeightProfile } from '../dist/dev/fixtures/hill-dip-height.js';
import { createStadiumGuide } from '../dist/dev/fixtures/raster-courses.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { SoftwareSurface } from '../dist/graphics/software-surface.js';
import { createDynamicVehicleCourseSprite } from '../dist/render/dynamic-vehicle-sprite.js';
import { renderDriving } from '../dist/render/renderer.js';
import { createFarBackground } from '../dist/visual/far-background.js';
import { createSpriteAssets } from '../dist/visual/sprite-assets.js';

function makePlainVehicle(guide, height, s = 90) {
  const p = guidePathToWorld(guide, s, 0);
  return {
    x: p.x,
    y: height.samplePhysics(p.s),
    z: p.z,
    yaw: p.heading,
    course: { s: p.s, l: 0, segmentIndex: p.segmentIndex, distanceSquared: 0 },
    longitudinalSpeed: 35,
    lateralSpeed: 0,
    sprungRoll: 0,
  };
}

test('camera/renderer/rival presentation no longer import concrete car physics', async () => {
  const paths = [
    '../src/camera/camera.ts',
    '../src/render/renderer.ts',
    '../src/render/dynamic-vehicle-sprite.ts',
    '../src/gameplay/rival-driver.ts',
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /car-physics/);
    assert.match(source, /vehicle-contract/);
  }
});

test('plain world-state object can drive camera, rival input, dynamic sprite and renderer without M5CarState', () => {
  const guide = createStadiumGuide();
  const height = createHillDipHeightProfile(guide.length);
  const visual = createCliffVisualProfile(guide.length);
  const vehicle = makePlainVehicle(guide, height);
  const before = structuredClone(vehicle);

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
  const camera = updateCamera(createCameraRig(), { guide, height }, vehicle, cameraProfile, 1 / 60);
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y) && Number.isFinite(camera.z));
  assert.ok(Math.abs(pseudoDepth(vehicle.course.s, camera.s, guide.length) - CURRENT_CAMERA_DISTANCE_METERS) < 1e-9);

  const input = sampleRivalDrivingInput(guide, vehicle);
  assert.ok(input.steering >= -1 && input.steering <= 1);
  assert.equal(typeof input.throttle, 'boolean');
  assert.equal(typeof input.brake, 'boolean');

  const assets = createSpriteAssets();
  const rivalSprite = createDynamicVehicleCourseSprite('PLAIN', vehicle, camera.yaw, assets.car, height);
  assert.equal(rivalSprite.x, vehicle.x);
  assert.equal(rivalSprite.y, height.sampleRender(vehicle.course.s).y);
  assert.equal(rivalSprite.z, vehicle.z);
  assert.equal(rivalSprite.sRender, vehicle.course.s);

  const target = new SoftwareSurface(320, 240);
  const stats = renderDriving(
    target,
    {
      background: createFarBackground(),
      guide,
      camera,
      vehicle,
      terrainProfile: {
        screenHeight: 240,
        dMin: 2.5,
        dMax: 150,
        groundLeft: 12,
        groundRight: 12,
        roadLeft: 4.5,
        roadRight: 4.5,
        height,
        visual,
        thinSpanScreenRows: 1,
      },
      groundProfile: {
        groundLeft: 12,
        groundRight: 12,
        roadLeft: 4.5,
        roadRight: 4.5,
        shoulderWidth: 1,
        roadMarkings: CENTER_DASH_MARKINGS,
      },
      worldSprites: [rivalSprite],
      assets,
      playerKind: 'car',
    },
    {},
  );
  assert.ok(stats.playerWrittenPixels > 0);
  assert.deepEqual(vehicle, before);
});
