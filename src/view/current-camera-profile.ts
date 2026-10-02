import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_FOCAL_LENGTH_PIXELS,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from './display-scale.js';
import type { CameraProfile } from './camera.js';

const CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS = (12 * Math.PI) / 180;
const CURRENT_CAMERA_PLAYER_TARGET_Y = 190;

export const CURRENT_CAMERA_PROFILE: Readonly<CameraProfile> = Object.freeze({
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  baseDownPitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: LOGICAL_WIDTH / 2,
  centerY: LOGICAL_HEIGHT / 2,
  playerTargetY: CURRENT_CAMERA_PLAYER_TARGET_Y,
});
