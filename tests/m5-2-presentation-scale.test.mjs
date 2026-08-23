import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAR_WIDTH_METERS,
  PLAYER_REFERENCE_WIDTH_PIXELS,
  PLAYER_PIXELS_PER_METER,
  CURRENT_FOCAL_LENGTH_PIXELS,
  CURRENT_CAMERA_DISTANCE_METERS,
  cameraDistanceForFocalLength,
  pixelsPerMeterAtDepth,
  screenWidthForWorldWidth,
} from '../dist/core/presentation-scale.js';
import { M5_CAR_PROFILE } from '../dist/physics/car-physics.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';
import { SoftwareSurface } from '../dist/render/software-surface.js';
import { drawScaledSprite } from '../dist/render/sprite.js';

test('M5.2 canonical player presentation is exactly 2.0 m = 80 px', () => {
  assert.equal(CAR_WIDTH_METERS, 2);
  assert.equal(PLAYER_REFERENCE_WIDTH_PIXELS, 80);
  assert.equal(PLAYER_PIXELS_PER_METER, 40);
  assert.equal(CURRENT_FOCAL_LENGTH_PIXELS, 200);
  assert.equal(CURRENT_CAMERA_DISTANCE_METERS, 5);
  assert.equal(pixelsPerMeterAtDepth(200, 5), 40);
  assert.equal(screenWidthForWorldWidth(2, 200, 5), 80);
});

test('future FOV changes move D_cam and cannot change the 40 px/m player reference', () => {
  for (const focalLength of [120, 160, 200, 240, 320]) {
    const dCam = cameraDistanceForFocalLength(focalLength);
    assert.equal(focalLength / dCam, 40);
    assert.equal(screenWidthForWorldWidth(2, focalLength, dCam), 80);
  }
});

test('car physical width is 2.0 m and car source asset is authored 80 px wide', () => {
  assert.equal(M5_CAR_PROFILE.bodyWidth, 2);
  const assets = createM4SpriteAssets();
  const rear = assets.car.assets[0][0];
  assert.equal(rear.worldWidthMeters, 2);
  assert.equal(rear.width, 80);
  assert.equal(rear.height, 56);
  assert.equal('visualScale' in rear, false);
  let minX = rear.width;
  let maxX = -1;
  for (let y = 0; y < rear.height; y += 1) {
    for (let x = 0; x < rear.width; x += 1) {
      if (rear.pixels[y * rear.width + x] !== 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  assert.equal(maxX - minX + 1, 80, 'rear-view visible silhouette must occupy the full 80 px physical width');
});

test('player-depth car source bitmap is drawn 1:1 while nearer objects enlarge by pseudo-depth only', () => {
  const assets = createM4SpriteAssets();
  const car = assets.car.assets[0][0];
  const target = new SoftwareSurface(320, 240);

  const atPlayer = drawScaledSprite(target, car, 160, 200, pixelsPerMeterAtDepth(200, 5));
  // 80x56 reference rectangle at 1:1 source-to-screen scale.
  assert.equal(atPlayer.outputSamples, 80 * 56);

  assert.equal(screenWidthForWorldWidth(2, 200, 4), 100);
  assert.ok(Math.abs(screenWidthForWorldWidth(2, 200, 3) - 133.33333333333334) < 1e-12);
  assert.equal(screenWidthForWorldWidth(2, 200, 2.5), 160);
});

test('current d_min=2.5 m implies a bounded 2x maximum near-plane magnification relative to player depth', () => {
  const playerDepth = 5;
  const nearDepth = 2.5;
  assert.equal(playerDepth / nearDepth, 2);
  assert.equal(screenWidthForWorldWidth(2, 200, nearDepth) / PLAYER_REFERENCE_WIDTH_PIXELS, 2);
});
