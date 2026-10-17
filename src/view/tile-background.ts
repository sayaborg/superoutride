import { horizonY, type PseudoCamera } from './projection.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { SoftwareSurface } from './software-surface.js';

export interface TileBackground {
  readonly image: TilePicture;
  readonly imageHorizonY: number;
  readonly yawOriginRadians: number;
}

/**
 * The image x the frame's left edge shows: the background's yaw (the camera's unless the camera gives the background its
 * own pose) from the background's yaw origin at the camera's background scroll, its focal length unless it gives
 * another.
 */
export function backgroundPan(background: TileBackground, camera: PseudoCamera): number {
  const yaw = camera.background?.yaw ?? camera.yaw;
  return Math.round((camera.backgroundScroll ?? camera.focalLength) * (yaw - background.yawOriginRadians));
}

/** The screen row the background's horizon stands at: the camera's horizon unless it gives the background its own pose. */
export function backgroundHorizon(camera: PseudoCamera): number {
  return camera.background?.horizon ?? horizonY(camera);
}

/**
 * Paint frame row `y`'s pixels `left` to `right` from the background scrolled to `pan` and lowered `shift` pixels: each
 * screen row shows one image row, the screen horizon row `yH` meeting the image's, rows beyond the image repeating its
 * edge row.
 */
export function paintBackgroundSpan(
  target: SoftwareSurface,
  background: TileBackground,
  pan: number,
  y: number,
  yH: number,
  shift: number,
  left: number,
  right: number,
) {
  const image = background.image;
  const imageY = Math.max(0, Math.min(image.height - 1, Math.round(background.imageHorizonY + y - yH - shift)));
  image.paintRow(target.pixels, y * target.width + left, pan + left, imageY, right - left);
}

/**
 * The only background plane is at infinity; camera translation has no effect. It scrolls with yaw at the focal
 * length, as distant road and sprites do, and repeats at its own width.
 */
export function drawTileBackground(target: SoftwareSurface, background: TileBackground, camera: PseudoCamera): void {
  const yH = backgroundHorizon(camera),
    pan = backgroundPan(background, camera);
  for (let y = 0; y < target.height; y++) paintBackgroundSpan(target, background, pan, y, yH, 0, 0, target.width);
}
