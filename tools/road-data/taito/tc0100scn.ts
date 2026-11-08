/**
 * The tile layers of Taito's Z system, its TC0100SCN chip ([Original road data](../../../docs/original-road-data.md#an-originals-modules)):
 * tiles of 8 × 8 pixels at 4 bits a pixel, two a byte, the left one in the high nibble, a row 4 bytes and a tile 32,
 * from the tile ROM as its 16-bit words read (the ROM loaded word-swapped), tile code n at byte 32n; a pixel's palette
 * entry its line × 16 + its pen. Of its two layers the one its control word 6 names is drawn at the bottom, every pen
 * its color, and the other over it, its pen 0 transparent.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A tile's pixels across and down, and its bytes. */
export const TILE = 8;
const TILE_BYTES = 32;
/** The pen the chip does not draw on the layer over the bottom one. */
export const TRANSPARENT_PEN = 0;

/** The layer the chip draws at the bottom by its control word 6: the second (BG1) where its bit 3 is set, else the first. */
export const bottomLayer = (control6: number): 0 | 1 => (control6 & 8 ? 1 : 0);

/** The tile ROM as the chip reads it: each 16-bit word's bytes swapped from the ROM's order. */
export function tileGraphics(rom: Uint8Array): Uint8Array {
  if (rom.length % 2) throw romDiffers('The tile ROM is no whole number of words');
  const out = new Uint8Array(rom.length);
  for (let i = 0; i < rom.length; i += 2) {
    out[i] = rom[i + 1]!;
    out[i + 1] = rom[i]!;
  }
  return out;
}

/** The pen of tile `code`'s pixel at `x`, `y` (0 to 7 each), in graphics `gfx` (`tileGraphics`). */
export function tilePen(gfx: Uint8Array, code: number, x: number, y: number): number {
  const at = code * TILE_BYTES + y * 4 + (x >> 1);
  if (at >= gfx.length) throw romDiffers(`Tile 0x${code.toString(16)} lies past the tile ROM`);
  const byte = gfx[at]!;
  return x & 1 ? byte & 15 : byte >> 4;
}
