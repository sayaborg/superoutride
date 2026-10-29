import type { SpriteFrame, SpriteLevel } from '../../src/image/sprite.js';

/** A sprite frame as plain texels, with its anchor in texel-centre coordinates. */
export interface SpriteRaster {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly indices: readonly number[];
}

/** A frame's texels, reflected across when `mirrored`. */
export function spriteRaster(frame: SpriteFrame, mirrored = false): SpriteRaster {
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

/**
 * A level's master, its shadow frame and its body: the master less the texels its shadow frame covers, aligned by their
 * anchors; texels below the base outside the shadow stay in the body.
 */
export function spriteLayers(level: SpriteLevel, mirrored = false) {
  const master = spriteRaster(level, mirrored);
  const shadow = level.shadow ? spriteRaster(level.shadow, mirrored) : null;
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
