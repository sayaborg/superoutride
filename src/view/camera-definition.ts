import { CAMERA_DISTANCE_METERS, FOCAL_LENGTH_PIXELS, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './display-scale.js';
import type { CameraDefinition } from './camera.js';

const CAMERA_BASE_DOWN_PITCH_RADIANS = (12 * Math.PI) / 180;
const CAMERA_PLAYER_TARGET_Y = 190;

export const CAMERA_DEFINITION: Readonly<CameraDefinition> = Object.freeze({
  dCam: CAMERA_DISTANCE_METERS,
  baseDownPitch: CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: FOCAL_LENGTH_PIXELS,
  centerX: LOGICAL_WIDTH / 2,
  centerY: LOGICAL_HEIGHT / 2,
  playerTargetY: CAMERA_PLAYER_TARGET_Y,
});
