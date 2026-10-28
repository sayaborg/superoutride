import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteFrame, type SpriteLevel } from '../../src/image/sprite.js';

/** Canonical review raster, with the original anchor retained in texel-centre coordinates. */
export interface ReviewFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: readonly number[];
}

export function reviewFrame(frame: SpriteFrame, mirrored = false): ReviewFrame {
  const { width, height, anchorY } = frame;
  return {
    width,
    height,
    anchorY,
    anchorX: mirrored ? width - 1 - frame.anchorX : frame.anchorX,
    indices: Array.from({ length: width * height }, (_, i) => {
      const x = i % width,
        y = Math.floor(i / width);
      return frame.pattern.indexAt(y * width + (mirrored ? width - 1 - x : x));
    }),
  };
}

/** Subtract only the anchored shadow mask; below-base body pixels outside it survive. */
export function pictureLayers(level: SpriteLevel, mirrored = false) {
  const master = reviewFrame(level, mirrored);
  const shadow = level.shadow ? reviewFrame(level.shadow, mirrored) : null;
  const dx = shadow ? shadow.anchorX - master.anchorX : 0;
  const dy = shadow ? shadow.anchorY - master.anchorY : 0;
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new RangeError('Shadow and master must share a texel grid');
  const body = {
    ...master,
    indices: master.indices.map((value, i) => {
      if (!shadow) return value;
      const x = (i % master.width) + dx,
        y = Math.floor(i / master.width) + dy;
      return x >= 0 && y >= 0 && x < shadow.width && y < shadow.height && shadow.indices[y * shadow.width + x]
        ? 0
        : value;
    }),
  };
  return { master, shadow, body };
}

export function pictureDimensions(frame: ReviewFrame) {
  const scale = SPRITE_SOURCE_TEXELS_PER_METER;
  return {
    width: frame.width / scale,
    height: (frame.anchorY + 0.5) / scale,
    frameHeightTexels: frame.height,
    groundTexels: frame.height - 0.5 - frame.anchorY,
  };
}

/** A height is measured upward from the anchor (ground), never across painted ground in the frame. */
export function pictureScale(frame: ReviewFrame, height: number | null) {
  if (height === null) return 1;
  const standing = pictureDimensions(frame).height;
  if (!(Number.isFinite(height) && height > 0 && standing > 0))
    throw new RangeError('A height override requires positive object height above the ground anchor');
  return height / standing;
}
