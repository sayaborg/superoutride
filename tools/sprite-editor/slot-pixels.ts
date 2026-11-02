import { rgb555ToRgba, rgba } from '../../src/image/rgb555.js';

/** Texels of palette slots: `indices[y · width + x]`, 0 clear. */
export interface SlotRaster {
  readonly width: number;
  readonly height: number;
  readonly indices: ArrayLike<number>;
}

/** Each slot's pixel as an ImageData word holds it (`rgb555ToRgba`), from `colors` (RGB555); slot 0 clear. */
export function slotWords(colors: readonly number[]): Uint32Array {
  const words = new Uint32Array(Math.max(colors.length, 1));
  for (let slot = 1; slot < colors.length; slot++) words[slot] = rgb555ToRgba(colors[slot]!);
  return words;
}

/** A shadow's slots (1 where it lies) as the comparison and the thumbnails dim it: black, `alpha` opaque. */
export const shadowWords = (alpha: number) => Uint32Array.of(0, rgba(0, 0, 0, alpha));

/**
 * Paint `raster`'s slots into `target` by `words` (a slot's pixel, `slotWords`), its top-left texel at (`left`,
 * `top`): one pass, one word a texel, nothing made per texel. A slot without a word is left clear.
 */
export function paintSlots(target: ImageData, raster: SlotRaster, words: Uint32Array, left = 0, top = 0): void {
  const pixels = new Uint32Array(target.data.buffer, target.data.byteOffset, target.width * target.height);
  const { width, height, indices } = raster;
  for (let y = 0; y < height; y++) {
    const row = (y + top) * target.width + left,
      from = y * width;
    for (let x = 0; x < width; x++) {
      const word = words[indices[from + x]!];
      if (word) pixels[row + x] = word;
    }
  }
}
