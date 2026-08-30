/**
 * SUPER OUTRIDE fixed presentation scale.
 *
 * Canonical rule requested by design:
 *   at player depth, 2.0 m = 80 screen pixels.
 * Therefore the player-depth scale is permanently 40 px/m.
 *
 * FOV may change in the future by changing focalLength, but dCam must then
 * move with it so focalLength / dCam remains exactly 40 px/m.
 */
export const CAR_WIDTH_METERS = 2.0;
export const PLAYER_REFERENCE_WIDTH_PIXELS = 80;
export const PLAYER_PIXELS_PER_METER = PLAYER_REFERENCE_WIDTH_PIXELS / CAR_WIDTH_METERS; // 40

export const CURRENT_FOCAL_LENGTH_PIXELS = 200;
export const CURRENT_CAMERA_DISTANCE_METERS = cameraDistanceForFocalLength(CURRENT_FOCAL_LENGTH_PIXELS); // 5
export const CURRENT_RENDER_NEAR_DEPTH_METERS = 2.5;
export const CURRENT_RENDER_FAR_DEPTH_METERS = 200;

export function cameraDistanceForFocalLength(focalLengthPixels: number): number {
  if (!(focalLengthPixels > 0) || !Number.isFinite(focalLengthPixels)) {
    throw new RangeError('focalLengthPixels must be finite and > 0');
  }
  return focalLengthPixels / PLAYER_PIXELS_PER_METER;
}

export function pixelsPerMeterAtDepth(focalLengthPixels: number, depthMeters: number): number {
  if (!(depthMeters > 0) || !Number.isFinite(depthMeters)) {
    throw new RangeError('depthMeters must be finite and > 0');
  }
  return focalLengthPixels / depthMeters;
}

export function screenWidthForWorldWidth(
  worldWidthMeters: number,
  focalLengthPixels: number,
  depthMeters: number,
): number {
  if (!(worldWidthMeters > 0) || !Number.isFinite(worldWidthMeters)) {
    throw new RangeError('worldWidthMeters must be finite and > 0');
  }
  return worldWidthMeters * pixelsPerMeterAtDepth(focalLengthPixels, depthMeters);
}
