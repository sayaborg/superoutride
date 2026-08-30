import {
  CURRENT_CAMERA_DISTANCE_METERS,
  CURRENT_FOCAL_LENGTH_PIXELS,
} from '../core/presentation-scale.js';
import type { M5CameraProfile } from './m5-camera.js';

export const CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS = 12 * Math.PI / 180;
export const CURRENT_CAMERA_PLAYER_TARGET_Y = 190;

/** Flat-road height that frames the player ground anchor at target Y without correction. */
export const CURRENT_CAMERA_HEIGHT_METERS = (
  (
    CURRENT_CAMERA_PLAYER_TARGET_Y
    - 120
    + CURRENT_FOCAL_LENGTH_PIXELS * Math.sin(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS)
  )
  * CURRENT_CAMERA_DISTANCE_METERS
  / (
    CURRENT_FOCAL_LENGTH_PIXELS
    * Math.cos(CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS)
  )
);

export const CURRENT_M5_CAMERA_PROFILE: Readonly<M5CameraProfile> = Object.freeze({
  dCam: CURRENT_CAMERA_DISTANCE_METERS,
  height: CURRENT_CAMERA_HEIGHT_METERS,
  baseDownPitch: CURRENT_CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: CURRENT_FOCAL_LENGTH_PIXELS,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: CURRENT_CAMERA_PLAYER_TARGET_Y,
  tauVertical: 0.22,
  deltaYMax: 4,
});
