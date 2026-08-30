import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { guideCourseToWorld } from '../dist/core/guide-curve.js';
import { CURRENT_CAMERA_DISTANCE_METERS, CURRENT_FOCAL_LENGTH_PIXELS } from '../dist/core/presentation-scale.js';
import { pseudoDepth } from '../dist/core/projection.js';
import { createM5CameraRig, updateM5Camera } from '../dist/camera/m5-camera.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { renderM5Driving } from '../dist/render/m5-renderer.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { createM3FarBackground } from '../dist/visual/far-background.js';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';
import { createM3DebugVisualProfile } from '../dist/dev/m3-debug-visual.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { createDynamicVehicleCourseSprite } from '../dist/world/dynamic-vehicle-sprite.js';

const deg = (value) => value * Math.PI / 180;

function makePlainVehicle(guide, height, s = 90) {
  const p = guideCourseToWorld(guide, s, 0);
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

test('M6.4 camera/renderer/rival presentation no longer import concrete car physics', async () => {
  const paths = [
    '../src/camera/m5-camera.ts',
    '../src/render/m5-renderer.ts',
    '../src/world/dynamic-vehicle-sprite.ts',
    '../src/gameplay/rival-driver.ts',
  ];
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /car-physics/);
    assert.match(source, /vehicle-contract/);
  }
});

test('plain world-state object can drive camera, rival input, dynamic sprite and renderer without M5CarState', () => {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const visual = createM3DebugVisualProfile(guide.length);
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
  const camera = updateM5Camera(createM5CameraRig(), guide, height, vehicle, cameraProfile, 1 / 60);
  assert.ok(Number.isFinite(camera.x) && Number.isFinite(camera.y) && Number.isFinite(camera.z));
  assert.ok(Math.abs(pseudoDepth(vehicle.course.s, camera.s, guide.length) - CURRENT_CAMERA_DISTANCE_METERS) < 1e-9);

  const input = sampleRivalDrivingInput(guide, vehicle);
  assert.ok(input.steering >= -1 && input.steering <= 1);
  assert.equal(typeof input.throttle, 'boolean');
  assert.equal(typeof input.brake, 'boolean');

  const assets = createM4SpriteAssets();
  const rivalSprite = createDynamicVehicleCourseSprite('PLAIN', vehicle, camera.yaw, assets.car, height);
  assert.equal(rivalSprite.x, vehicle.x);
  assert.equal(rivalSprite.y, height.sampleRender(vehicle.course.s).y);
  assert.equal(rivalSprite.z, vehicle.z);
  assert.equal(rivalSprite.sRender, vehicle.course.s);

  const target = new SoftwareSurface(320, 240);
  const stats = renderM5Driving(
    target,
    createM3FarBackground(),
    guide,
    camera,
    vehicle,
    {
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
    { groundLeft: 12, groundRight: 12, roadLeft: 4.5, roadRight: 4.5, shoulderWidth: 1 },
    [rivalSprite],
    assets,
    'car',
  );
  assert.ok(stats.playerWrittenPixels > 0);
  assert.deepEqual(vehicle, before);
});
