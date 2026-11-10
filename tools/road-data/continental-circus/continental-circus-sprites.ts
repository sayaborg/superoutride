/**
 * CONTINENTAL CIRCUS's sprites ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md#its-things),
 * its hardware as MAME's description of the Taito Z system's `contcirc` gives it): the Z system's sprites
 * (`z-sprites`), a sprite 8 × 16 chunks, each a tile of 16 × 8 pixels, from its four OBJ ROMs and its spritemap ROM; its
 * colors the palette's lines as the main program loads them at its start.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { RomSet } from '../shared/rom-set.js';
import { xrgb555Of } from '../taito/palette.js';
import { zBigSprite, zSpriteGraphics, type ChunkRows } from '../taito/z-sprites.js';

/** The OBJ ROMs, by the 16-bit word of every 8 bytes each fills, the first the first word (MAME's `contcirc`). */
export const CONTINENTAL_CIRCUS_SPRITE_ROMS = Object.freeze([
  { name: 'b33-06', size: 0x80000, crc: 0x2cb40599 },
  { name: 'b33-05', size: 0x80000, crc: 0xbddf9eea },
  { name: 'b33-04', size: 0x80000, crc: 0x8df866a2 },
  { name: 'b33-03', size: 0x80000, crc: 0x4f6c36d9 },
] as const);

/** The spritemap ROM: each sprite's chunks' tile codes, 16-bit words little-endian. */
export const CONTINENTAL_CIRCUS_SPRITE_MAP_ROM = Object.freeze({ name: 'b33-07.64', size: 0x80000, crc: 0x151e1f52 });

/** A sprite's chunks' rows: tiles of 16 × 8 pixels, 8 × 16 chunks a sprite (MAME's `contcirc`). */
const CHUNK_ROWS: ChunkRows = 8;

/** The sprites' tiles from the ROM set, as the chip reads them, and the spritemap. */
export const assembleContinentalCircusSprites = (set: RomSet) => ({
  gfx: zSpriteGraphics(CONTINENTAL_CIRCUS_SPRITE_ROMS.map((rom) => set.data(rom))),
  map: set.data(CONTINENTAL_CIRCUS_SPRITE_MAP_ROM),
});

/** The sprites' tiles and spritemap (`assembleContinentalCircusSprites`). */
export type ContinentalCircusSprites = ReturnType<typeof assembleContinentalCircusSprites>;

/** Sprite `sprite`'s picture at its full size, 128 × 128 pens row by row, from the sprites `sprites`. */
export const continentalCircusSprite = (sprites: ContinentalCircusSprites, sprite: number): Uint8Array =>
  zBigSprite(sprites.gfx, sprites.map, sprite, CHUNK_ROWS);

/** A palette line's pens, and the lines the main program loads at its start (entries 0 to 0xBFF). */
const PENS = 16;
const LINES = 0xc0;

/**
 * The sprites' colors, RGB555 by palette line and pen, as the main program loads the palette at its start: entries 0 to
 * 0xBFF from the table its `lea` names, a word an entry (M 0xEC8 to 0xEEA); colors it writes after, its own car's
 * wheels' cycle among them (M 0x1052), are not taken.
 */
export function spriteColors(main: Uint8Array): (line: number) => readonly number[] {
  instruction(main, 0xec8, [0x303c, LINES * PENS - 1], "the palette's entries less one (move.w #$bff)");
  const [high, low] = instruction(main, 0xed2, [0x43f9, null, null], "the palette's words (lea)");
  instruction(main, 0xee4, [0x3159, 0x0002], 'an entry its word (move.w (a1)+)');
  const table = high * 0x10000 + low;
  return (line) => {
    if (!(line >= 0 && line < LINES)) throw romDiffers(`A sprite's palette line 0x${line.toString(16)} is not loaded`);
    return Array.from({ length: PENS }, (_, pen) => xrgb555Of(word(main, table + 2 * (line * PENS + pen))));
  };
}
