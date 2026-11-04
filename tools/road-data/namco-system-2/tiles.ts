/**
 * The Namco System 2 hardware's tile layers, its C123 chip ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#its-skies)):
 * a tile word's pixels from the character ROMs and the tiles' mask, and its layers' colors.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A tile's pixels across and down, a byte a pixel, its rows top down. */
export const LAYER_TILE = 8;
const TILE_BYTES = LAYER_TILE * LAYER_TILE;
/** A tile's mask: a byte a row, a bit a pixel, bit 7 the leftmost. */
const MASK_BYTES = LAYER_TILE;
/** A pixel the mask hides. */
export const HIDDEN = -1;

/** A layer's colors: the palette's entries from 0x1000, 256 for each of its color register's values. */
export const layerColors = (register: number) => 0x1000 + 0x100 * register;

/**
 * Tile word `word`'s pixels, its pens (0 to 255) row by row or `HIDDEN`: its bits 11 to 13 choose the character ROM of
 * `characters`, its bits 0 to 10, its bit 14 above them, the tile within it; the mask, 8 bytes a tile, at its bits 0
 * to 14, a pixel whose bit is 0 showing nothing.
 */
export function layerTilePixels(characters: readonly Uint8Array[], mask: Uint8Array, word: number): Int16Array {
  if (word & 0x8000) throw romDiffers(`The tile word 0x${word.toString(16)} has its bit 15 set`);
  const rom = characters[(word >> 11) & 7]!;
  const at = (((word >> 14) << 11) | (word & 0x7ff)) * TILE_BYTES;
  const shape = (word & 0x7fff) * MASK_BYTES;
  if (!(at + TILE_BYTES <= rom.length && shape + MASK_BYTES <= mask.length))
    throw romDiffers(`The tile word 0x${word.toString(16)} lies outside the characters or their mask`);
  return Int16Array.from({ length: TILE_BYTES }, (_, k) =>
    (mask[shape + (k >> 3)]! >> (7 - (k & 7))) & 1 ? rom[at + k]! : HIDDEN,
  );
}
