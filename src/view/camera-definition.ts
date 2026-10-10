import { LOGICAL_WIDTH } from './display-scale.js';
import type { CameraDefinition } from './camera.js';

/**
 * The one camera's definition. Its focal length is the one authority for the field of view and the player depth:
 * the player stands where the focal length gives the fixed player-depth display scale, `cameraDistance` = f / 40 px/m
 * = 6 m. Its height of 2 m holds the player's base point `f * 2 / 6 = 80` rows below the horizon.
 */
export const CAMERA_DEFINITION: Readonly<CameraDefinition> = Object.freeze({
  focalLength: 240,
  centerX: LOGICAL_WIDTH / 2,
  horizonRow: 120,
  height: 2,
  heightFrequency: 2,
  yawSource: 'BODY',
  yawLimit: (45 * Math.PI) / 180,
  yawResponseSeconds: 0,
});
