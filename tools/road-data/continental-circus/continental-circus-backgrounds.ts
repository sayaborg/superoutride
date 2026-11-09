/**
 * CONTINENTAL CIRCUS's skies ([Original road data](../../../docs/original-road-data.md#sky-baking)): the bands its two
 * tile layers draw above the horizon, each course its own three pictures of 32 columns of tiles, 256 pixels, set once
 * at the race's start: BG1's upper picture, the clouds, in strips that turn the faster the higher they lie, BG1's lower
 * picture, the landscape, at 1.375 times the clouds' bottom strip, and BG0's band over it at 1.625 times; each in its
 * palette line of the course's colors; each found by the instructions that read it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { SkyBand, SkyBands } from '../shared/sky-baking.js';
import { xrgb555Of } from '../taito/palette.js';
import { bottomLayer, TILE, tilePen, TRANSPARENT_PEN } from '../taito/tc0100scn.js';

/** The courses, in the program's order (its names at M 0x46FA). */
export const CONTINENTAL_CIRCUS_COURSES = Object.freeze([
  'BRAZIL',
  'AMERICA',
  'FRANCE',
  'MONACO',
  'GERMANY',
  'SPAIN',
  'MEXICO',
  'JAPAN',
] as const);

/** A picture's columns, and the pixels its band repeats over: the setup writes it at columns 0 and 32 of its tilemap. */
export const PICTURE_COLUMNS = 32;
export const PICTURE_WIDTH = PICTURE_COLUMNS * TILE;
/**
 * The facing layer's column at the camera's centre at the start's heading, the line's: its column 0 (default; K
 * confirms at the stage's end: where the road vanishes on the original's screen at the start is not read), and the
 * facing layer's pixel behind it, where each other layer's turn has its seam.
 */
export const SKY_MIDDLE = 0;
export const SKY_SEAM = SKY_MIDDLE + PICTURE_WIDTH / 2;
/** A tilemap's row of tiles, bytes: 64 tiles of an attribute word and a code word. */
const MAP_ROW = 0x100;
const BG0_MAP = 0x200000;
const BG1_MAP = 0x208000;
/**
 * Where a layer's pixel row lies against the horizon on level road, the first row below it 0: the road's first line on
 * screen line 119, BG1's row 142 there and BG0's row 140 (BG1's y word d − 0x20 with d 1, BG0's −29, M 0x5316, 0x52E6,
 * by the chip's offsets as the CHASE H.Q. chapter reads them).
 */
const rowBelow = { bg1: (row: number) => row - 142, bg0: (row: number) => row - 140 } as const;

/**
 * The programs' tables: the main program's control word 6 (M 0x902); its sky setup's pictures, a course's 16 bytes from
 * M 0xDE92 (M 0x7718), the upper picture its first long at BG1's row 0 in line 0 (M 0x772A, 0x7742), the lower its third
 * at BG1's row 12 in line 1 (M 0x7770, 0x7764, 0x7760) and BG0's band its second at BG0's row 13 in line 2 (M 0x77B0,
 * 0x77A4, 0x77A0), each again 32 columns on (M 0x7746, 0x7784, 0x77C4); its palette task's colors, a course's 16 bytes
 * from M 0xC5A0 (M 0x6E58), a line's 16 words at its long (M 0x6E7E, 0x6E9C, 0x6EBA); the sub program's scroll task, its
 * upper picture's row bounds a course's long from S 0x2652 (S 0x262A), its rows from 95 up (S 0x2888) each 1/64 more
 * of the frame's rate (S 0x2896), a strip's rate taken at its bound (S 0x28E4, 0x28EE), BG0's at row 0x38 (S 0x28F6)
 * and the lower picture's 80 rows at row 0x48 (S 0x2902, 0x2908).
 */
function tables(main: Uint8Array, sub: Uint8Array) {
  const m = <const E extends readonly (number | null)[]>(address: number, words: E, what: string) =>
    instruction(main, address, words, `the sky's ${what}`);
  const s = <const E extends readonly (number | null)[]>(address: number, words: E, what: string) =>
    instruction(sub, address, words, `the sky's ${what}`);
  const [control6] = m(0x902, [0x33fc, null, 0x0022, 0x000c], 'control word 6 (move.w)');
  const [pictureHigh, pictureLow] = m(0x7718, [0x45f9, null, null], 'pictures (lea)');
  m(0x772a, [0x49f9, 0x0020, 0x8000], "upper picture's row (lea)");
  m(0x7742, [0x4267], "upper picture's line (clr.w)");
  m(0x7746, [0x41f9, 0x0020, 0x8080], "upper picture's copy (lea)");
  const [lowerLong] = m(0x7770, [0x2f29, null], "lower picture's long (move.l)");
  const [lowerRow] = m(0x7764, [0x41f9, 0x0020, null], "lower picture's row (lea)");
  const [lowerLine] = m(0x7760, [0x3f3c, null], "lower picture's line (move.w)");
  m(0x7784, [0x41f9, 0x0020, lowerRow + 0x80], "lower picture's copy (lea)");
  const [nearLong] = m(0x77b0, [0x2f29, null], "BG0's band's long (move.l)");
  const [nearRow] = m(0x77a4, [0x41f9, 0x0020, null], "BG0's band's row (lea)");
  const [nearLine] = m(0x77a0, [0x3f3c, null], "BG0's band's line (move.w)");
  m(0x77c4, [0x41f9, 0x0020, nearRow + 0x80], "BG0's band's copy (lea)");
  const [colorsHigh, colorsLow] = m(0x6e58, [0x41f9, null, null], 'colors (lea)');
  const lines = [0x6e7e, 0x6e9c, 0x6eba].map((a) => m(a, [0x2268, null], "a line's colors (movea.l)")[0]);
  [0x6e8e, 0x6eac, 0x6eca].forEach((a, k) => m(a, [0x3b7c, 16 * k, 0xef4e], "a line's entries (move.w)"));
  s(0x262a, [0x2d7b, 0x7026, 0xff7c], 'row bounds (move.l, pc)');
  const [firstRow] = s(0x2888, [0x343c, null], 'first row (move.w)');
  s(0x2896, [0xec86], "a row's step (asr.l #6)");
  s(0x28e4, [0x3619], "a strip's bound (move.w)");
  s(0x28ee, [0xb443], "a strip's bound met (cmp.w)");
  const [nearAt] = s(0x28f6, [0x0c42, null], "BG0's rate's row (cmpi.w)");
  const [lowerAt] = s(0x2902, [0x0c42, null], "the lower picture's rate's row (cmpi.w)");
  s(0x2908, [0x383c, 0x004f], "the lower picture's rows (move.w)");
  const bounds = 0x262c + 0x26;
  const entry = (high: number, low: number, course: number) => high * 0x10000 + low + 16 * course;
  return {
    control6,
    pictures: (course: number) => {
      const at = entry(pictureHigh, pictureLow, course);
      return {
        upper: { picture: long(main, at), row: 0, line: 0 },
        lower: { picture: long(main, at + lowerLong), row: (lowerRow - (BG1_MAP & 0xffff)) / MAP_ROW, line: lowerLine },
        near: { picture: long(main, at + nearLong), row: (nearRow - (BG0_MAP & 0xffff)) / MAP_ROW, line: nearLine },
      };
    },
    colors: (course: number, line: number) => long(main, entry(colorsHigh, colorsLow, course) + lines[line]!),
    bounds: (course: number) => long(sub, bounds + 4 * course),
    firstRow,
    nearRate: 1 + (firstRow + 1 - nearAt) / 64,
    lowerRate: 1 + (firstRow + 1 - lowerAt) / 64,
  };
}

/**
 * A picture as the setup's writer reads it (M 0x3E7C): its columns and rows of tiles, then its tile codes, a code with
 * bit 15 set its low 15 bits the next word plus one times. A run may pass its row's end: the writer goes on along the
 * tilemap and starts the next row as far on, so its copy at column 0 shows the codes in turn, row by row, as here.
 */
function picture(main: Uint8Array, at: number): { columns: number; rows: number; codes: number[][] } {
  const [columns, rows] = [word(main, at), word(main, at + 2)];
  if (columns !== PICTURE_COLUMNS) throw romDiffers(`A sky picture at 0x${at.toString(16)} is not 32 columns`);
  const codes: number[] = [];
  for (let p = at + 4; codes.length < columns * rows; p += 2) {
    const code = word(main, p);
    if (code & 0x8000) codes.push(...new Array<number>(word(main, (p += 2)) + 1).fill(code & 0x7fff));
    else codes.push(code);
  }
  return { columns, rows, codes: Array.from({ length: rows }, (_, r) => codes.slice(r * columns, (r + 1) * columns)) };
}

/** A picture's pixel rows `from` to `to` (inclusive), RGB555 row by row, its pen 0 transparent unless opaque. */
function pixels(
  gfx: Uint8Array,
  codes: readonly number[][],
  colors: readonly number[],
  from: number,
  to: number,
  opaque: boolean,
) {
  const out = new Int32Array(PICTURE_WIDTH * (to - from + 1));
  for (let y = from; y <= to; y++)
    for (let x = 0; x < PICTURE_WIDTH; x++) {
      const pen = tilePen(gfx, codes[y >> 3]![x >> 3]!, x & 7, y & 7);
      out[(y - from) * PICTURE_WIDTH + x] = pen === TRANSPARENT_PEN && !opaque ? -1 : colors[pen]!;
    }
  return out;
}

/**
 * The upper picture's strips, from its bottom row up, each its rows and its rate over the bottom strip's: each row from
 * row `first` up 1/64 of the frame's rate more, and the rows above a bound, from the bound up, at the rate there, the
 * next bound read there.
 */
function strips(sub: Uint8Array, at: number, first: number) {
  const rates: number[] = [];
  let [bound, p, rate] = [word(sub, at), at + 2, 1];
  for (let row = first; row >= 0; row--) {
    rates[row] = rate;
    if (row > bound) continue;
    rate = 1 + (first + 1 - row) / 64;
    [bound, p] = [word(sub, p), p + 2];
  }
  const out: { top: number; bottom: number; rate: number }[] = [];
  for (let row = first; row >= 0; row--)
    if (out.at(-1)?.rate === rates[row]) out.at(-1)!.top = row;
    else out.push({ top: row, bottom: row, rate: rates[row]! });
  return out;
}

/**
 * The sky of course `course` (0 to 7, BRAZIL to JAPAN), tiles from graphics `gfx`, in its dry colors: its layers in the
 * order the chip draws them, BG1's upper picture's strips from the bottom up and its lower picture, its bottom layer, then
 * BG0's band over them; the clouds' bottom strip facing, a turn its picture's 256 pixels, each other layer a turn of
 * 256 over its rate, its seam behind the start's heading (`SKY_SEAM`). Where no band lies, above and below, the clear
 * tile's color in line 0, as the cleared tilemap shows.
 */
export function continentalCircusSky(main: Uint8Array, sub: Uint8Array, gfx: Uint8Array, course: number): SkyBands {
  const t = tables(main, sub);
  if (bottomLayer(t.control6) !== 1)
    throw romDiffers('CONTINENTAL CIRCUS draws its BG0 at the bottom, which its skies do not read');
  const colors = (line: number) => {
    const at = t.colors(course, line);
    return Array.from({ length: 16 }, (_, k) => xrgb555Of(word(main, at + 2 * k)));
  };
  const { upper, lower, near } = t.pictures(course);
  const band = (
    p: { picture: number; row: number; line: number },
    rows: { from: number; to: number },
    layer: 'bg0' | 'bg1',
    rate: number,
  ): SkyBand => {
    const { codes } = picture(main, p.picture);
    return {
      width: PICTURE_WIDTH,
      pixels: pixels(gfx, codes, colors(p.line), rows.from, rows.to, layer === 'bg1'),
      bottom: rowBelow[layer](p.row * TILE + rows.to),
      ...(rate === 1 ? {} : { turn: PICTURE_WIDTH / rate, overlap: 0 }),
    };
  };
  const tall = (p: { picture: number }) => picture(main, p.picture).rows * TILE;
  if (tall(upper) !== t.firstRow + 1) throw romDiffers("The upper sky picture's rows are not the scroll task's");
  const clear = colors(0)[tilePen(gfx, 0, 0, 0)]!;
  return {
    layers: [
      ...strips(sub, t.bounds(course), t.firstRow).map((s) =>
        band(upper, { from: s.top, to: s.bottom }, 'bg1', s.rate),
      ),
      band(lower, { from: 0, to: tall(lower) - 1 }, 'bg1', t.lowerRate),
      band(near, { from: 0, to: tall(near) - 1 }, 'bg0', t.nearRate),
    ],
    facing: 0,
    seam: SKY_SEAM,
    ramp: { rows: [clear], below: clear },
  };
}
