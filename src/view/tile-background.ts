import { horizonY, type PseudoCamera } from './projection.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { SoftwareSurface } from './software-surface.js';

export interface TileBackground {
  readonly image: TilePicture;
  readonly imageHorizonY: number;
  readonly yawOriginRadians: number;
}

/**
 * How far along the image, in pixels, a direction of yaw `yaw` lies from its yaw origin: `focalLength` pixels per radian.
 * Facing `yaw`, the screen's centre column shows image x `backgroundYawX + centerX` (modulo the image's width).
 */
export function backgroundYawX(background: TileBackground, yaw: number, focalLength: number): number {
  return focalLength * (yaw - background.yawOriginRadians);
}

/** The image x the frame's left edge shows: the camera's yaw from the background's yaw origin at the focal length. */
export function backgroundPan(background: TileBackground, camera: PseudoCamera): number {
  return Math.round(backgroundYawX(background, camera.yaw, camera.focalLength));
}

/** The screen row the background's horizon stands at: the camera's horizon. */
export function backgroundHorizon(camera: PseudoCamera): number {
  return horizonY(camera);
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
 * The only background plane is at infinity; camera translation has no effect.
 * [Image assets](../../docs/image-assets.md#infinite-tiled-background) owns how it maps to the screen.
 */
export function drawTileBackground(target: SoftwareSurface, background: TileBackground, camera: PseudoCamera): void {
  const yH = backgroundHorizon(camera),
    pan = backgroundPan(background, camera);
  for (let y = 0; y < target.height; y++) paintBackgroundSpan(target, background, pan, y, yH, 0, 0, target.width);
}
