/**
 * The Namco System 2 hardware's sprites ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-objects)):
 * a 32-pixel sprite's pens from the sprites' memory.
 */
import { romDiffers } from '../shared/conversion-errors.js';

/** A sprite's pixels across and down. */
export const SPRITE_SIZE = 32;
/** The pen that shows nothing. */
export const SPRITE_CLEAR = 0xff;

/**
 * Sprite `code`'s pens (0 to 255) row by row, mirrored where `mirrored`: 8 bits a pixel, each a plane, the first the
 * most significant; a sprite 8192 bits, a row 256, four pixels' planes 32, a plane's four pixels in turn, each bit the
 * memory's from its byte's most significant.
 */
export function spritePens(sprites: Uint8Array, code: number, mirrored = false): Uint8Array {
  if (!(code >= 0 && (code + 1) * 1024 <= sprites.length)) throw romDiffers(`The sprites have no sprite ${code}`);
  const pens = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);
  for (let y = 0; y < SPRITE_SIZE; y++)
    for (let x = 0; x < SPRITE_SIZE; x++) {
      let pen = 0;
      for (let plane = 0; plane < 8; plane++) {
        const bit = code * 8192 + y * 256 + 32 * (x >> 2) + (x & 3) + 4 * plane;
        pen = (pen << 1) | ((sprites[bit >> 3]! >> (7 - (bit & 7))) & 1);
      }
      pens[y * SPRITE_SIZE + (mirrored ? SPRITE_SIZE - 1 - x : x)] = pen;
    }
  return pens;
}
