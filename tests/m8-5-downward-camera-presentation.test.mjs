import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  CURRENT_CAMERA_HEIGHT_METERS,
  CURRENT_CAMERA_PLAYER_TARGET_Y,
  CURRENT_M5_CAMERA_PROFILE,
} from '../dist/camera/current-camera-profile.js';

const near = (actual, expected, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected} +/- ${epsilon}`);
};

function flatRoadCameraHeight(pitch) {
  return (
    (190 - 120 + 200 * Math.sin(pitch))
    * 5
    / (200 * Math.cos(pitch))
  );
}

function flatRoadYAtDepth(pitch, height, depth) {
  return 120
    - 200 * Math.sin(pitch)
    + 200 * height * Math.cos(pitch) / depth;
}

test('M8.5 owns one 12-degree profile that preserves the flat-road player anchor at Y=190', () => {
  near(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS, 12 * Math.PI / 180);
  near(CURRENT_CAMERA_HEIGHT_METERS, 2.8518788493639118);
  assert.equal(CURRENT_CAMERA_PLAYER_TARGET_Y, 190);
  assert.equal(CURRENT_M5_CAMERA_PROFILE.baseDownPitch, CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS);
  assert.equal(CURRENT_M5_CAMERA_PROFILE.height, CURRENT_CAMERA_HEIGHT_METERS);
  assert.equal(CURRENT_M5_CAMERA_PROFILE.playerTargetY, CURRENT_CAMERA_PLAYER_TARGET_Y);
  near(
    flatRoadYAtDepth(
      CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
      CURRENT_CAMERA_HEIGHT_METERS,
      CURRENT_M5_CAMERA_PROFILE.dCam,
    ),
    190,
  );
});

test('12-degree framing gives the far road more vertical separation than the former 8-degree view', () => {
  const oldPitch = 8 * Math.PI / 180;
  const oldFarY = flatRoadYAtDepth(oldPitch, flatRoadCameraHeight(oldPitch), 150);
  const currentFarY = flatRoadYAtDepth(
    CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
    CURRENT_CAMERA_HEIGHT_METERS,
    150,
  );
  const oldSpan = 190 - oldFarY;
  const currentSpan = 190 - currentFarY;
  assert.ok(currentSpan > oldSpan * 1.12, `${currentSpan} must materially exceed ${oldSpan}`);
});

test('all browser compositions consume the single current camera profile authority', async () => {
  const sources = await Promise.all([
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);
  for (const source of sources) {
    assert.match(source, /const cameraProfile = CURRENT_M5_CAMERA_PROFILE/);
    assert.doesNotMatch(source, /baseDownPitch:\s*\(8\s*\*\s*Math\.PI\)/);
    assert.doesNotMatch(source, /height:\s*2\.469902425419539/);
  }
});
