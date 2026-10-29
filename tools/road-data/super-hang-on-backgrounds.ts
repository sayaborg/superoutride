/**
 * SUPER HANG-ON's backgrounds as its main program draws them
 * ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): each section's tile map, drawn in eight steps
 * of parts, the palettes it loads, and its two bands and ramp as a sky bakes them.
 */
import { romDiffers } from './conversion-errors.js';
import { tilePixel } from './rom-images.js';
import { instruction, long, u8, word } from './program-words.js';
import { paletteRgb555 } from './road-tables.js';
import { COURSE_ROW } from './super-hang-on-road.js';
import { boardMiddles, FRONT_WIDTH, TRANSPARENT, type SkyBands, type SkyLayer } from './sky-baking.js';

/**
 * Main CPU: each section's background number (a row of them a course, as the course table's), the backgrounds' palette
 * lists and sources, the drawing's steps.
 */
const BACKGROUND_NUMBERS = 0x9eb4;
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
          if (row + y >= MAP_ROWS) throw romDiffers(`A background part at 0x${a.toString(16)} runs past row 31`);
          map[(row + y) * MAP_COLUMNS + ((column + x) % MAP_COLUMNS)] = word(main, content + 4 + 2 * (y * width + x));
        }
    }
  }
  return map;
}

/** A tile: 8 × 8 pixels, a byte a row in each plane, bit 7 the leftmost. */
const TILE = 8;
/** The front band: the map's rows 0–3, every column. The back band: rows 20–31, columns 64–255. */
const FRONT_BAND = { row: 0, rows: 4, column: 0, columns: MAP_COLUMNS } as const;
const BACK_BAND = { row: 20, rows: 12, column: 64, columns: 192 } as const;

/**
 * The layers as the board shows them ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): at the road's
 * heading h (the sub program's, 0x800 a turn) the front's scroll F = (8 − h) & 0x7FF (`addi.w #-8, d0`, `neg.w d0` and
 * `andi.w #$7FF, d0` at 0x9DD6), the back's ⌊3F / 4⌋ (`move.w d0, d1`, `add.w d1, d1`, `add.w d0, d1` and `asr.w #2,
 * d1` at 0x9DE0); at heading 0 the board's middles (`boardMiddles`), the back band the map's last 1536 pixels.
 */
export function backgroundScroll(main: Uint8Array) {
  const [offset] = instruction(main, 0x9dd6, [0x0640, null, 0x4440, 0x0240, 0x07ff], "the front layer's scroll");
  instruction(main, 0x9de0, [0x3200, 0xd241, 0xd240, 0xe441], "the back layer's scroll, three quarters of the front's");
  const front = -((offset! << 16) >> 16) & (FRONT_WIDTH - 1);
  return boardMiddles(front, Math.floor((3 * front) / 4));
}
/** The ramp: two rows up from the horizon a word, word 31 the lowest; word 0 also every row above. */
const RAMP_ROWS = 2;

/**
 * Course `course`'s section `order` as a sky bakes it ([Sky baking](../../docs/original-road-data.md#sky-baking)), from
 * the tile ROMs' `planes` and the section's 32 sky colors `sky` (RGB555): the front and back bands of its tile map, a
 * tile word's tile its bits 0–11 and its palette bits 5–11, a pixel 0 transparent and any other its palette's word,
 * each band's bottom row the road's first (the first below the horizon); the ramp word 31 up to word 0, two rows each,
 * and word 31 below.
 */
export function sectionBands(
  main: Uint8Array,
  planes: readonly Uint8Array[],
  course: number,
  order: number,
  sky: readonly number[],
): SkyBands {
  const map = backgroundMap(main, course, order);
  const number = backgroundNumber(main, course, order);
  const { palettes } = backgroundPalettes(main, number);
  const band = ({ row, rows, column, columns }: { row: number; rows: number; column: number; columns: number }) => {
    const [width, height] = [columns * TILE, rows * TILE];
    const pixels = new Int32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const tileWord = map[(row + (y >> 3)) * MAP_COLUMNS + column + (x >> 3)]!;
        const [tile, u, v] = [tileWord & 0xfff, x & 7, y & 7];
        const value = tilePixel(planes, tile, u, v);
        const words = palettes.get((tileWord >> 5) & 0x7f);
        if (value && !words)
          throw romDiffers(
            `Background ${number}'s tile word 0x${tileWord.toString(16)} uses a palette it does not load`,
          );
        pixels[y * width + x] = value ? paletteRgb555(words![value]!) : TRANSPARENT;
      }
    return { width, pixels, bottom: 0 } satisfies SkyLayer;
  };
  return {
    back: band(BACK_BAND),
    front: band(FRONT_BAND),
    overlap: backgroundScroll(main).overlap,
    ramp: {
      rows: Array.from({ length: sky.length * RAMP_ROWS }, (_, i) => sky[sky.length - 1 - Math.floor(i / RAMP_ROWS)]!),
      below: sky[sky.length - 1]!,
    },
  };
}
