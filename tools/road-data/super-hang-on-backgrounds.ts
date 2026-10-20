/**
 * SUPER HANG-ON's backgrounds as its main program draws them
 * ([Original road data](../../docs/original-road-data.md#super-hang-on)): each section's tile map, drawn in eight steps
 * of parts, and the palettes it loads.
 */
import { long, u8, word } from './program-words.js';

/** Main CPU: each section's background number, the backgrounds' palette lists and sources, the drawing's steps. */
const BACKGROUND_NUMBERS = 0x9eb4;
const COURSE_ROW = 9;
const PALETTE_LISTS = 0x1e06;
const PALETTE_SOURCES = 0x21f2;
const STEPS = 0x9ed8;
const STEP_BASES = 0x9ea0;
/** A background is drawn in eight steps, a section's eight longs. */
const STEPS_A_SECTION = 8;
/** A palette: 8 words. */
const PALETTE = 8;
/** The tile map: 256 columns (four pages of 64) of 32 rows. */
export const MAP_COLUMNS = 256;
export const MAP_ROWS = 32;

/** The background of course `course`'s section `order` (0 from): its byte at 0x9EB4 + 9 × course + order. */
export const backgroundNumber = (main: Uint8Array, course: number, order: number) =>
  u8(main, BACKGROUND_NUMBERS + COURSE_ROW * course + order);

/**
 * Background `number`'s palettes: the long at 0x1E06 + 4 × number points at {word count − 1, then that many byte pairs
 * {palette, source}}; each palette takes the 8 words at 0x21F2 + 16 × its source. Returns palette RAM's words (8 a
 * palette), the palettes it loads.
 */
export function backgroundPalettes(main: Uint8Array, number: number) {
  const address = long(main, PALETTE_LISTS + 4 * number);
  const count = word(main, address) + 1;
  const ram = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    const [palette, source] = [u8(main, address + 2 + 2 * i), u8(main, address + 3 + 2 * i)];
    ram.set(
      palette,
      Array.from({ length: PALETTE }, (_, k) => word(main, PALETTE_SOURCES + 16 * source + 2 * k)),
    );
  }
  return { address, palettes: ram };
}

/**
 * The tile map course `course`'s section `order` draws: its eight steps the longs at 0x9ED8 + 4 × (base + 8 × order + s),
 * base its course's byte at 0x9EA0; a step {word parts − 1, then parts {word column, word row, long content}}, a content
 * {word width − 1, word height − 1, then its tile words row by row}. Columns wrap at 256.
 */
export function backgroundMap(main: Uint8Array, course: number, order: number): Uint16Array {
  const map = new Uint16Array(MAP_COLUMNS * MAP_ROWS);
  const base = u8(main, STEP_BASES + course);
  for (let s = 0; s < STEPS_A_SECTION; s++) {
    const step = long(main, STEPS + 4 * (base + STEPS_A_SECTION * order + s));
    const parts = word(main, step) + 1;
    for (let i = 0; i < parts; i++) {
      const a = step + 2 + 8 * i;
      const [column, row, content] = [word(main, a), word(main, a + 2), long(main, a + 4)];
      const [width, height] = [word(main, content) + 1, word(main, content + 2) + 1];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (row + y >= MAP_ROWS) throw new RangeError(`A background part at 0x${a.toString(16)} runs past row 31`);
          map[(row + y) * MAP_COLUMNS + ((column + x) % MAP_COLUMNS)] = word(main, content + 4 + 2 * (y * width + x));
        }
    }
  }
  return map;
}
