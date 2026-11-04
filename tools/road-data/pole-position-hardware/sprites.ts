/**
 * The Namco Pole Position hardware's sprites ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-hardware)):
 * a sprite's pixels from its images, 4 bits a pixel, and a sprite color's pens.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { paletteColor } from './colors.js';

/** A sprite's size: 16 pixels square (small) or 32 (big). */
export type SpriteSize = 16 | 32;

/**
 * Sprite `code`'s pixels (row-major pens 0 to 15), `size` square, from its images (`images`): a row is a byte to each
 * four pixels, a pixel's plane 3 at its bit in the byte's high nibble and plane 2 in its low nibble, the most significant
 * bit the first pixel's, in the images' first half; planes 1 and 0 likewise at the same place in their second half.
 */
export function spritePixels(images: Uint8Array, size: SpriteSize, code: number): Uint8Array {
  const half = images.length / 2;
  const rowBytes = size / 4;
  const at = code * size * rowBytes;
  if (!(code >= 0 && at + size * rowBytes <= half))
    throw romDiffers(`The sprites hold no ${size}-pixel sprite ${code}`);
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const byte = at + y * rowBytes + (x >> 2);
      const bit = (offset: number, nibble: number) => (images[offset]! >> (7 - nibble - (x & 3))) & 1;
      pixels[y * size + x] =
        (bit(byte, 0) << 3) | (bit(byte, 4) << 2) | (bit(half + byte, 0) << 1) | bit(half + byte, 4);
    }
  return pixels;
}

/** A sprite color's pens 0 to 15 as RGB555, or null where the sprites' color PROM makes a pen transparent (15). */
export function spritePens(
  lookup: Uint8Array,
  palettes: { readonly red: Uint8Array; readonly green: Uint8Array; readonly blue: Uint8Array },
  color: number,
): (number | null)[] {
  if (!(color >= 0 && (color + 1) * 16 <= lookup.length)) throw romDiffers(`The sprites have no color ${color}`);
  return Array.from(lookup.subarray(color * 16, color * 16 + 16), (v) =>
    (v & 15) === TRANSPARENT ? null : paletteColor(palettes.red, palettes.green, palettes.blue, SPRITE_BASE + (v & 15)),
  );
}

/** The sprites' color PROM's transparent entry, and the palette's color a sprite pixel takes: its entry over this base. */
const TRANSPARENT = 15;
const SPRITE_BASE = 0x10;
