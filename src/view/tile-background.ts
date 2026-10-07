import { horizonY, type PseudoCamera } from './projection.js';
import type { TileBackgroundImage } from '../image/tile-background-image.js';
import type { SoftwareSurface } from './software-surface.js';

export interface TileBackground {
  readonly image: TileBackgroundImage;
  readonly imageHorizonY: number;
  readonly yawOriginRadians: number;
}

/**
 * The only background plane is at infinity; camera translation has no effect. It scrolls with yaw at the focal
 * length, as distant road and sprites do, and repeats at its own width.
 */
export function drawTileBackground(target: SoftwareSurface, background: TileBackground, camera: PseudoCamera): void {
  const yH = horizonY(camera),
    image = background.image;
  const xPan = Math.round(camera.focalLength * (camera.yaw - background.yawOriginRadians));
  for (let y = 0; y < target.height; y++) {
    const imageY = Math.max(0, Math.min(image.height - 1, Math.round(background.imageHorizonY + y - yH)));
    image.paintRow(target.pixels, y * target.width, xPan, imageY, target.width);
  }
}
