/**
 * The tile planes of JALECO's driving board, a Mega System 1 tile generator each
 * ([BIG RUN road data](../../../docs/big-run-road-data.md#its-skies)): a plane of 16 × 16 tiles, each four tiles of 8 × 8
 * from its tile ROM (its code times 4, the left column's upper and lower, then the right's), 4 bits a pixel, the left
 * pixel of a byte its high nibble; a tile word its tile in bits 0–11 and its palette entry in bits 12–15; pen 15
 * transparent.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A plane's tile's pixels across and down, and the bytes of an 8 × 8 tile of its ROM. */
export const TILE = 16;
const SMALL = 8;
const SMALL_BYTES = (SMALL * SMALL) / 2;
/** The pen a plane does not draw. */
export const CLEAR_PEN = 15;

/** A tile word's tile and its palette entry. */
export const tileOf = (word: number) => ({ tile: word & 0xfff, entry: word >> 12 });

/** The pen of pixel (`x`, `y`) of 16 × 16 tile `tile` of tile ROM `rom`. */
export function tilePen(rom: Uint8Array, tile: number, x: number, y: number): number {
  const small = 4 * tile + (y >= SMALL ? 1 : 0) + (x >= SMALL ? 2 : 0);
  const at = small * SMALL_BYTES + (y % SMALL) * (SMALL / 2) + ((x % SMALL) >> 1);
  if (at >= rom.length) throw romDiffers(`Tile ${tile} lies past the tile ROM`);
  const byte = rom[at]!;
  return x % 2 === 0 ? byte >> 4 : byte & 0xf;
}
