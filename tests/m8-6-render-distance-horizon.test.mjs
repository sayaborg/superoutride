import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_M5_CAMERA_PROFILE,
} from '../dist/camera/current-camera-profile.js';
import { compileRasterPath } from '../dist/core/course.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { horizonY } from '../dist/core/projection.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../dist/core/presentation-scale.js';
import { SoftwareSurface, rgba } from '../dist/render/software-surface.js';
import { computeForwardVisibleInterval } from '../dist/road/terrain-line.js';
import { drawFarBackground } from '../dist/visual/far-background.js';

const flatCamera = Object.freeze({
  x: 0,
  y: CURRENT_M5_CAMERA_PROFILE.height,
  z: 0,
  yaw: 0,
  pitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  s: 0,
  focalLength: CURRENT_M5_CAMERA_PROFILE.focalLength,
  centerX: CURRENT_M5_CAMERA_PROFILE.centerX,
  centerY: CURRENT_M5_CAMERA_PROFILE.centerY,
});

test('M8.6 current forward render interval is 200 m camera-relative and 195 m player-relative', () => {
  assert.equal(CURRENT_RENDER_NEAR_DEPTH_METERS, 2.5);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS, 200);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS - CURRENT_CAMERA_DISTANCE_METERS, 195);

  const raster = compileRasterPath([{ x: 0, z: 0 }, { x: 0, z: 1_000 }]);
  const guide = compileGuidePath(raster, {
    lMax: 12,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  assert.deepEqual(
    computeForwardVisibleInterval(
      guide,
      0,
      100,
      CURRENT_RENDER_NEAR_DEPTH_METERS,
      CURRENT_RENDER_FAR_DEPTH_METERS,
    ),
    { dStart: 2.5, dEnd: 200 },
  );
});

test('current flat-camera geometric horizon is exact and independent of far depth', () => {
  const expected = 120 - 200 * Math.sin(12 * Math.PI / 180);
  assert.ok(Math.abs(horizonY(flatCamera) - expected) <= 1e-12);
  assert.ok(Math.abs(expected - 78.41766183644815) <= 1e-12);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS, 200);
});

test('Far Background source horizon follows the geometric horizon to raster rounding', () => {
  const sky = rgba(10, 20, 30);
  const ground = rgba(90, 80, 70);
  const sourceHorizonY = 10;
  const source = new SoftwareSurface(4, 20);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      source.setPixel(x, y, y < sourceHorizonY ? sky : ground);
    }
  }
  const target = new SoftwareSurface(4, 240);
  drawFarBackground(target, { surface: source, sourceHorizonY, pixelsPerRadian: 200 }, flatCamera);

  let firstGroundRow = -1;
  for (let y = 0; y < target.height; y += 1) {
    if (target.getPixel(0, y) === ground) {
      firstGroundRow = y;
      break;
    }
  }
  assert.ok(firstGroundRow >= 0);
  assert.ok(Math.abs(firstGroundRow - horizonY(flatCamera)) <= 0.5);
});

test('all current renderer compositions use the shared 200 m far-depth authority', async () => {
  const paths = [
    '../src/main-circuit.ts',
    '../src/dev/m8-3-linear-highway.ts',
    '../src/dev/m7-2-default-branching-highway.ts',
    '../src/runtime/stage-authoring-compiler.ts',
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.match(source, /CURRENT_RENDER_FAR_DEPTH_METERS/);
    assert.doesNotMatch(source, /dMax:\s*150\b/);
  }
});
