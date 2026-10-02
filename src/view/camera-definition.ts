import { LOGICAL_HEIGHT, LOGICAL_WIDTH, PLAYER_DEPTH_PIXELS_PER_METER } from './display-scale.js';
import type { CameraDefinition } from './camera.js';

const CAMERA_BASE_DOWN_PITCH_RADIANS = (12 * Math.PI) / 180;
const CAMERA_PLAYER_TARGET_Y = 190;
const CAMERA_FOCAL_LENGTH_PIXELS = 200;

/**
 * The one camera's definition and the one authority for its focal length and player depth. The player stands at the
 * depth where the focal length gives the fixed player-depth display scale: `dCam = f / 40 px/m` = 5 m.
 */
export const CAMERA_DEFINITION: Readonly<CameraDefinition> = Object.freeze({
  dCam: CAMERA_FOCAL_LENGTH_PIXELS / PLAYER_DEPTH_PIXELS_PER_METER,
  baseDownPitch: CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: CAMERA_FOCAL_LENGTH_PIXELS,
  centerX: LOGICAL_WIDTH / 2,
  centerY: LOGICAL_HEIGHT / 2,
  playerTargetY: CAMERA_PLAYER_TARGET_Y,
  heightFrequency: 2,
  heightDampingRatio: 1,
  minimumClearance: 0.3,
});
