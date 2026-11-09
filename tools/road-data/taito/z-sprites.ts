/**
 * The sprites of Taito's Z system as CHASE H.Q. draws them ([Original road data](../../../docs/original-road-data.md#an-originals-modules),
 * its hardware as MAME's driver at 9c0b6db1 describes it): a sprite is a picture of chunks, each a tile of 16 × 16
 * pixels at 4 bits a pixel, pen 0 not drawn, laid by the spritemap ROM (its 16-bit words little-endian, a chunk's tile
 * code its word, 0xFFFF none). Its tiles' ROMs are loaded each a 16-bit word of every 8 bytes in turn, the word's bytes
 * swapped: a tile is 128 bytes, a row 8, its four bit planes 16 bits apart in the row, the first the pen's highest bit,
 * a pixel's bits the highest first. A sprite's zoom picks its size: from 0x40 its 128 × 128 picture of 8 × 8 chunks from
 * its tiles' first set (OBJ A), the map's 64 words from its code × 64, a row of chunks at a time; at zoom 0x7F a pixel a
 * pixel, its full size.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A sprite's pixels across and down at its full size, and a chunk's. */
export const BIG_SPRITE = 128;
export const CHUNK = 16;
const CHUNKS = BIG_SPRITE / CHUNK;
const TILE_BYTES = 128;
const ROW_BYTES = 8;
/** The spritemap's word for no chunk. */
const NO_CHUNK = 0xffff;

/** The sprites' tiles as the chip reads them from their four ROMs (`roms`, each a 16-bit word of every 8 bytes). */
export function zSpriteGraphics(roms: readonly Uint8Array[]): Uint8Array {
  if (roms.length !== 4 || roms.some((r) => r.length !== roms[0]!.length || r.length % 2))
    throw romDiffers("The sprites' tile ROMs are not four of one size in words");
  const out = new Uint8Array(4 * roms[0]!.length);
  roms.forEach((rom, k) => {
    for (let w = 0; w < rom.length / 2; w++) {
      out[ROW_BYTES * w + 2 * k] = rom[2 * w + 1]!;
      out[ROW_BYTES * w + 2 * k + 1] = rom[2 * w]!;
    }
  });
  return out;
}

/** The pen of tile `code`'s pixel at `x`, `y` (0 to 15 each), in graphics `gfx` (`zSpriteGraphics`). */
export function zTilePen(gfx: Uint8Array, code: number, x: number, y: number): number {
  const row = code * TILE_BYTES + y * ROW_BYTES;
  if (row + ROW_BYTES > gfx.length) throw romDiffers(`Sprite tile 0x${code.toString(16)} lies past its ROMs`);
  let pen = 0;
  for (let plane = 0; plane < 4; plane++) {
    const bit = plane * 16 + x;
    pen |= ((gfx[row + (bit >> 3)]! >> (7 - (bit & 7))) & 1) << (3 - plane);
  }
  return pen;
}

/**
 * Sprite `sprite`'s picture at its full size, 128 × 128 pens row by row, from graphics `gfx` and the spritemap `map`
 * (its bytes as the ROM holds them); a chunk the map leaves out is pen 0.
 */
export function zBigSprite(gfx: Uint8Array, map: Uint8Array, sprite: number): Uint8Array {
  const pens = new Uint8Array(BIG_SPRITE * BIG_SPRITE);
  const tiles = gfx.length / TILE_BYTES;
  for (let j = 0; j < CHUNKS; j++)
    for (let k = 0; k < CHUNKS; k++) {
      const at = 2 * ((sprite << 6) + (j << 3) + k);
      if (at + 2 > map.length) throw romDiffers(`Sprite 0x${sprite.toString(16)} lies past the spritemap`);
      const code = map[at]! | (map[at + 1]! << 8);
      if (code === NO_CHUNK) continue;
      for (let y = 0; y < CHUNK; y++)
        for (let x = 0; x < CHUNK; x++)
          pens[(j * CHUNK + y) * BIG_SPRITE + k * CHUNK + x] = zTilePen(gfx, code % tiles, x, y);
    }
  return pens;
}
