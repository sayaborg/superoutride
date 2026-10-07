import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './display-scale.js';
import type { CameraDefinition } from './camera.js';

const CAMERA_BASE_DOWN_PITCH_RADIANS = 0;
const CAMERA_PLAYER_TARGET_Y = 190;
const CAMERA_FOCAL_LENGTH_PIXELS = 240;

/**
 * The one camera's definition. Its focal length is the one authority for the field of view and the player depth:
 * the player stands where the focal length gives the fixed player-depth display scale, `cameraDistance` = f / 40 px/m
 * = 6 m.
 */
export const CAMERA_DEFINITION: Readonly<CameraDefinition> = Object.freeze({
  baseDownPitch: CAMERA_BASE_DOWN_PITCH_RADIANS,
  focalLength: CAMERA_FOCAL_LENGTH_PIXELS,
  centerX: LOGICAL_WIDTH / 2,
  centerY: LOGICAL_HEIGHT / 2,
  playerTargetY: CAMERA_PLAYER_TARGET_Y,
  heightFrequency: 2,
  heightDampingRatio: 1,
  minimumClearance: 0.3,
  yawLimit: (45 * Math.PI) / 180,
  yawResponseSeconds: 0,
});
