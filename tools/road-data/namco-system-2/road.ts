/**
 * The Namco System 2 hardware's road, its C45 chip ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-hardware)):
 * its tiles' pixels and its tile words.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A road tile's pixels across and down, and its bytes. */
export const ROAD_TILE = 16;
const TILE_BYTES = 64;
/** The road's tile map: its columns, 1024 pixels across. */
export const ROAD_COLUMNS = 64;
/** The C45 shows its line memory's word y + 15 (its offset, zoom and picture row alike) on screen row y. */
export const ROAD_LINE_OFFSET = 15;

/**
 * Road tile `code`'s pixels (row-major, 0 to 3) from the road's tile memory: a row is four bytes, its left eight pixels'
 * high bits then their low bits, then its right eight's likewise, the leftmost pixel the most significant bit.
 */
export function roadTilePixels(tiles: Uint8Array, code: number): Uint8Array {
  const at = code * TILE_BYTES;
  if (!(code >= 0 && at + TILE_BYTES <= tiles.length)) throw romDiffers(`The road has no tile ${code}`);
  const pixels = new Uint8Array(ROAD_TILE * ROAD_TILE);
  for (let y = 0; y < ROAD_TILE; y++)
    for (let x = 0; x < ROAD_TILE; x++) {
      const byte = at + 4 * y + (x >> 3) * 2;
      const bit = 7 - (x & 7);
      pixels[y * ROAD_TILE + x] = (((tiles[byte]! >> bit) & 1) << 1) | ((tiles[byte + 1]! >> bit) & 1);
    }
  return pixels;
}

/** A road tile word's tile, its bits 0 to 9, and its color, its bits 10 to 15. */
export const roadTile = (word: number) => ({ code: word & 0x3ff, color: word >> 10 });
