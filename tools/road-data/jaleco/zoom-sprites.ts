/**
 * The JALECO board's zoomed sprites' tiles ([BIG RUN road data](../../../docs/big-run-road-data.md#its-objects)): 16 × 16
 * tiles of 4 bits a pixel, a tile's left 8 columns, 4 bytes a row, before its right 8 (MAME's description untangles
 * them so); the left pixel of a byte its high nibble; pen 15 not drawn and pen 0 a shadow where the sprite asks for one.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A tile's side, pixels, and its bytes. */
export const SPRITE_TILE = 16;
const TILE_BYTES = (SPRITE_TILE * SPRITE_TILE) / 2;
const HALF_BYTES = TILE_BYTES / 2;
/** The pen not drawn, and the pen drawn as a shadow where a sprite's attribute's bit 12 is set. */
export const SPRITE_CLEAR = 15;
export const SPRITE_SHADOW = 0;

/** Pen at `x`, `y` of sprite tile `tile` in the sprite ROMs `rom`. */
export function spritePen(rom: Uint8Array, tile: number, x: number, y: number): number {
  const half = x < 8 ? 0 : HALF_BYTES;
  const byte = rom[tile * TILE_BYTES + half + 4 * y + ((x & 7) >> 1)];
  if (byte === undefined) throw romDiffers(`Sprite tile ${tile} lies past the sprite ROMs`);
  return x & 1 ? byte & 15 : byte >> 4;
}

/** A zoom (0 to 255, 128 the tile's own size): a tile's side, pixels, as the board draws it. */
export const zoomedTile = (zoom: number) => (SPRITE_TILE * zoom) / 128;
