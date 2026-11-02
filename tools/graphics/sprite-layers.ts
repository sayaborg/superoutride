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
    indices: rasterIndices(frame, mirrored),
  };
}

/** A frame's texels row by row, each row read reflected when `mirrored`. */
function rasterIndices(frame: SpriteFrame, mirrored: boolean): number[] {
  const { width, height, pattern } = frame;
  const indices = new Array<number>(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      indices[y * width + x] = pattern.indexAt(y * width + (mirrored ? width - 1 - x : x));
  return indices;
}

/**
 * A level's master, its shadow frame and its body. An original's master holds its shadow's texels too (the shadow pen),
 * so its body is the master less the texels its shadow frame covers, aligned by their anchors; texels below the base
 * outside the shadow stay in the body. Any other picture's shadow (a board shadow) is a frame of its own and its body is
 * its whole master (`shadowInMaster` false).
 */
export function spriteLayers(level: SpriteLevel, mirrored = false, shadowInMaster = true) {
  const master = spriteRaster(level, mirrored);
  const shadow = level.shadow ? spriteRaster(level.shadow, mirrored) : null;
  const dx = shadow ? shadow.anchorX - master.anchorX : 0;
  const dy = shadow ? shadow.anchorY - master.anchorY : 0;
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new RangeError('Shadow and master must share a texel grid');
  let indices = master.indices;
  if (shadow && shadowInMaster) {
    const cleared = [...master.indices];
    for (let y = Math.max(0, -dy); y < Math.min(master.height, shadow.height - dy); y++)
      for (let x = Math.max(0, -dx); x < Math.min(master.width, shadow.width - dx); x++)
        if (shadow.indices[(y + dy) * shadow.width + x + dx]) cleared[y * master.width + x] = 0;
    indices = cleared;
  }
  return { master, shadow, body: { ...master, indices } };
}
