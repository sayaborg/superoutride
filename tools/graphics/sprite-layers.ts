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
 * A level's body and its shadow frame, aligned by their anchors. The body is the whole master: every texel a master
 * holds is drawn as the body, an original's (road data keeps a body texel within its shadow's rows in the body, and the
 * game draws the shadow first and the body over it) as any other picture's.
 */
export function spriteLayers(level: SpriteLevel, mirrored = false) {
  return { body: spriteRaster(level, mirrored), shadow: level.shadow ? spriteRaster(level.shadow, mirrored) : null };
}

/**
 * Where a shadow frame's top-left texel lies among its body's texels: the anchors' difference rounded to a whole texel
 * (`Math.round`, a half texel to the right and down). Every picture that draws a shadow with its body places it so; a
 * shadow frame off the body's grid (some of OUTRUN's lie half a texel off) lands in the same texel in each.
 */
export function shadowOffset(
  body: { readonly anchorX: number; readonly anchorY: number },
  shadow: { readonly anchorX: number; readonly anchorY: number },
): { readonly x: number; readonly y: number } {
  return { x: Math.round(body.anchorX - shadow.anchorX), y: Math.round(body.anchorY - shadow.anchorY) };
}
