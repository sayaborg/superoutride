import assert from 'node:assert/strict';

import test from 'node:test';

import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_PROFILE,
} from '../../dist/camera/current-camera-profile.js';
import { compileGuidePath } from '../../dist/core/guide-curve.js';
import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_RENDER_FAR_DEPTH_METERS,
  CURRENT_RENDER_NEAR_DEPTH_METERS,
} from '../../dist/core/presentation-scale.js';
import { horizonY } from '../../dist/core/projection.js';
import { compileRasterPath } from '../../dist/core/raster-path.js';
import { backgroundDocument, palette16 } from '../helpers/indexed-images.mjs';
import { TileBackgroundImage } from '../../dist/graphics/tile-background-image.js';
import { rgb555ToRgba } from '../../dist/graphics/rgb555.js';
import { SoftwareSurface } from '../../dist/graphics/software-surface.js';
import { computeForwardVisibleInterval } from '../../dist/terrain/terrain-line.js';
import { drawTileBackground } from '../../dist/visual/tile-background.js';

const flatCamera = Object.freeze({
  x: 0,
  y: CURRENT_CAMERA_PROFILE.height,
  z: 0,
  yaw: 0,
  pitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  s: 0,
  focalLength: CURRENT_CAMERA_PROFILE.focalLength,
  centerX: CURRENT_CAMERA_PROFILE.centerX,
  centerY: CURRENT_CAMERA_PROFILE.centerY,
});

test('current forward render interval is 200 m camera-relative and 195 m player-relative', () => {
  assert.equal(CURRENT_RENDER_NEAR_DEPTH_METERS, 2.5);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS, 200);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS - CURRENT_CAMERA_DISTANCE_METERS, 195);

  const raster = compileRasterPath([
    { x: 0, z: 0 },
    { x: 0, z: 1_000 },
  ]);
  const guide = compileGuidePath(raster, {
    lMax: 12,
    mMin: 0.25,
    dCam: CURRENT_CAMERA_DISTANCE_METERS,
  });
  assert.deepEqual(
    computeForwardVisibleInterval(guide, 0, 100, CURRENT_RENDER_NEAR_DEPTH_METERS, CURRENT_RENDER_FAR_DEPTH_METERS),
    { dStart: 2.5, dEnd: 200 },
  );
});

test('current flat-camera geometric horizon is exact and independent of far depth', () => {
  const expected = 120 - 200 * Math.sin((12 * Math.PI) / 180);
  assert.ok(Math.abs(horizonY(flatCamera) - expected) <= 1e-12);
  assert.ok(Math.abs(expected - 78.41766183644815) <= 1e-12);
  assert.equal(CURRENT_RENDER_FAR_DEPTH_METERS, 200);
});

test('Far Background source horizon follows the geometric horizon to raster rounding', () => {
  const ground = rgb555ToRgba(0x2d45);
  const sourceHorizonY = 320;
  const document = backgroundDocument(0x0443);
  document.palettes.push(palette16([0x2d45]));
  document.tiles = Array.from({ length: 3200 }, (_, i) => [0, i < 1600 ? 0 : 1]);
  const target = new SoftwareSurface(4, 240);
  drawTileBackground(
    target,
    { image: new TileBackgroundImage(document), sourceHorizonY, yawOriginRadians: 0 },
    flatCamera,
  );

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
