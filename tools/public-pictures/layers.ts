import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../src/image/sprite.js';
import type { SpriteRaster } from '../graphics/sprite-layers.js';

export function pictureDimensions(frame: SpriteRaster) {
  const scale = SPRITE_SOURCE_TEXELS_PER_METER;
  return {
    width: frame.width / scale,
    height: (frame.anchorY + 0.5) / scale,
    frameHeightTexels: frame.height,
    groundTexels: frame.height - 0.5 - frame.anchorY,
  };
}

/** A height is measured upward from the anchor (ground), never across painted ground in the frame. */
export function pictureScale(frame: SpriteRaster, height: number | null) {
  if (height === null) return 1;
  const standing = pictureDimensions(frame).height;
  if (!(Number.isFinite(height) && height > 0 && standing > 0))
    throw new RangeError('A height override requires positive object height above the ground anchor');
  return height / standing;
}
