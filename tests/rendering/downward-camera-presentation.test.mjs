import { near } from '../helpers/assert.mjs';
import assert from 'node:assert/strict';

import test from 'node:test';

import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_HEIGHT_METERS,
  CURRENT_CAMERA_PLAYER_TARGET_Y,
  CURRENT_CAMERA_PROFILE,
} from '../../dist/camera/current-camera-profile.js';

function flatRoadCameraHeight(pitch) {
  return ((190 - 120 + 200 * Math.sin(pitch)) * 5) / (200 * Math.cos(pitch));
}

function flatRoadYAtDepth(pitch, height, depth) {
  return 120 - 200 * Math.sin(pitch) + (200 * height * Math.cos(pitch)) / depth;
}

test('owns one 12-degree profile that preserves the flat-road player anchor at Y=190', () => {
  near(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS, (12 * Math.PI) / 180, 1e-12);
  near(CURRENT_CAMERA_HEIGHT_METERS, 2.8518788493639118, 1e-12);
  assert.equal(CURRENT_CAMERA_PLAYER_TARGET_Y, 190);
  assert.equal(CURRENT_CAMERA_PROFILE.baseDownPitch, CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS);
  assert.equal(CURRENT_CAMERA_PROFILE.height, CURRENT_CAMERA_HEIGHT_METERS);
  assert.equal(CURRENT_CAMERA_PROFILE.playerTargetY, CURRENT_CAMERA_PLAYER_TARGET_Y);
  near(
    flatRoadYAtDepth(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS, CURRENT_CAMERA_HEIGHT_METERS, CURRENT_CAMERA_PROFILE.dCam),
    190,
    1e-12,
  );
});

test('12-degree framing gives the far road more vertical separation than the former 8-degree view', () => {
  const oldPitch = (8 * Math.PI) / 180;
  const oldFarY = flatRoadYAtDepth(oldPitch, flatRoadCameraHeight(oldPitch), 150);
  const currentFarY = flatRoadYAtDepth(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS, CURRENT_CAMERA_HEIGHT_METERS, 150);
  const oldSpan = 190 - oldFarY;
  const currentSpan = 190 - currentFarY;
  assert.ok(currentSpan > oldSpan * 1.12, `${currentSpan} must materially exceed ${oldSpan}`);
});
