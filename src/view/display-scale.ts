import { SoftwareSurface } from './software-surface.js';

/** The logical frame's size; every 320×240 frame, its centre and its presentation derive from these. */
export const LOGICAL_WIDTH = 320;
export const LOGICAL_HEIGHT = 240;

/** A logical RGB555 frame. */
export function createLogicalFrame(): SoftwareSurface {
  return new SoftwareSurface(LOGICAL_WIDTH, LOGICAL_HEIGHT);
}

/**
 * The fixed display scale at the player's depth: 40 screen pixels per metre. It is a display fact, independent of
 * any vehicle's dimensions; the camera definition places the player at the depth where its focal length gives it.
 */
export const PLAYER_DEPTH_PIXELS_PER_METER = 40;

export function pixelsPerMeterAtDepth(focalLengthPixels: number, depthMeters: number): number {
  if (!(depthMeters > 0) || !Number.isFinite(depthMeters)) {
    throw new RangeError('depthMeters must be finite and > 0');
  }
  return focalLengthPixels / depthMeters;
}
