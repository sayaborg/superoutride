/**
 * CONTINENTAL CIRCUS's skies ([Original road data](../../../docs/original-road-data.md#sky-baking)): the bands its two
 * tile layers draw above the horizon, each course its own three pictures of 32 columns of tiles, 256 pixels, set once
 * at the race's start: BG1's upper picture, the clouds, BG1's lower picture, the landscape, and BG0's band over it,
 * towns and trees; each in its palette line of the course's colors; each found by the instructions that read it. The
 * original holds no turn, so each picture turns in six copies, all alike (K, 2026-11-10).
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { SCREEN_ROWS } from './continental-circus-road-picture.js';
import { copiesATurn, type SkyBand, type SkyBands } from '../shared/sky-baking.js';
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
 * A layer's turn (K, 2026-11-10): the original holds none, so the whole number of its pictures nearest the sky's
 * width, 6 of 256 pixels, 1536, every layer's alike.
 */
export const SKY_TURN = copiesATurn(PICTURE_WIDTH) * PICTURE_WIDTH;
/**
 * Every layer's column at the camera's centre at the start's heading, the line's: its column 0 (an estimate: where the
 * road vanishes on the original's screen at the start is not read).
 */
export const SKY_MIDDLE = 0;
/** A tilemap's row of tiles, bytes: 64 tiles of an attribute word and a code word. */
const MAP_ROW = 0x100;
const BG0_MAP = 0x200000;
const BG1_MAP = 0x208000;
/**
 * Where a layer's pixel row lies against the horizon on level road, the first row below it 0: the road's first line on
 * screen line 119, BG1's row 142 there and BG0's row 140 (BG1's y word d − 0x20 with d 1, BG0's −29, M 0x5316, 0x52E6,
 * by the chip's offsets as the CHASE H.Q. chapter reads them).
 */
const ROAD_FIRST_LINE = 119;
const rowBelow = { bg1: (row: number) => row - 142, bg0: (row: number) => row - 140 } as const;

/**
 * The main program's tables: its control word 6 (M 0x902); its sky setup's pictures, a course's 16 bytes from M 0xDE92
 * (M 0x7718), the upper picture its first long at BG1's row 0 in line 0 (M 0x772A, 0x7742), the lower its third at
 * BG1's row 12 in line 1 (M 0x7770, 0x7764, 0x7760) and BG0's band its second at BG0's row 13 in line 2 (M 0x77B0,
 * 0x77A4, 0x77A0), each again 32 columns on (M 0x7746, 0x7784, 0x77C4); its palette task's colors, a course's 16 bytes
 * from M 0xC5A0 (M 0x6E58), a line's 16 words at its long (M 0x6E7E, 0x6E9C, 0x6EBA). The sub program's scroll task's
 * rates, a strip's and a band's, are the chapter's and not laid (K, 2026-11-10).
 */
function tables(main: Uint8Array) {
  const m = <const E extends readonly (number | null)[]>(address: number, words: E, what: string) =>
    instruction(main, address, words, `the sky's ${what}`);
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

/**
 * BG0's fill ([Its zones](../../../docs/continental-circus-road-data.md#its-zones)): before it draws BG0's band, the sky's
 * setup writes one attribute and code over BG0's tile rows from the band's first down (M 0x76E4 to 0x770E), a tile all
 * of one pen, so that under its band BG0, drawn over BG1, shows one palette entry, its line × 16 + that pen, wherever
 * the road chip draws nothing: on level road from the band's last row, 3 rows below the road's first line, past the
 * screen's last line. That entry.
 */
export function continentalCircusFill(main: Uint8Array, gfx: Uint8Array): number {
  const t = tables(main);
  if (bottomLayer(t.control6) !== 1) throw romDiffers('CONTINENTAL CIRCUS draws its BG0 at the bottom, under BG1');
  const [at] = instruction(main, 0x76e4, [0x41f9, 0x0020, null], "BG0's fill's first row (lea)");
  const [tiles] = instruction(main, 0x76f6, [0x0c40, null], "BG0's fill's tiles (cmpi.w)");
  instruction(main, 0x7700, [0x58ae, 0xfffc], "BG0's fill's next tile (addq.l #4)");
  const [line, code] = instruction(main, 0x7704, [0x22bc, null, null], "BG0's fill's tile (move.l)");
  const [first, rows] = [(at - (BG0_MAP & 0xffff)) / MAP_ROW, (tiles * 4) / MAP_ROW];
  const band = t.pictures(0).near;
  // From its band's first row to past the screen's last line on level road.
  if (first !== band.row || rowBelow.bg0((first + rows) * TILE) < SCREEN_ROWS - ROAD_FIRST_LINE)
    throw romDiffers("BG0's fill does not lie from its band's row past the screen's last line");
  const pen = tilePen(gfx, code, 0, 0);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      if (tilePen(gfx, code, x, y) !== pen) throw romDiffers("BG0's fill's tile is not of one pen");
  if (pen === TRANSPARENT_PEN) throw romDiffers("BG0's fill's tile is transparent");
  return line * 16 + pen;
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
 * The sky of course `course` (0 to 7, BRAZIL to JAPAN), tiles from graphics `gfx`, in its dry colors: its layers in the
 * order the chip draws them, BG1's upper picture, the clouds, and its lower picture, its bottom layer, then BG0's band
 * over them; each its whole picture, a turn `SKY_TURN`, its column 0 over the others' (K, 2026-11-10). Where no band
 * lies, above and below, the clear tile's color in line 0, as the cleared tilemap shows.
 */
export function continentalCircusSky(main: Uint8Array, gfx: Uint8Array, course: number): SkyBands {
  const t = tables(main);
  if (bottomLayer(t.control6) !== 1)
    throw romDiffers('CONTINENTAL CIRCUS draws its BG0 at the bottom, which its skies do not read');
  const colors = (line: number) => {
    const at = t.colors(course, line);
    return Array.from({ length: 16 }, (_, k) => xrgb555Of(word(main, at + 2 * k)));
  };
  const { upper, lower, near } = t.pictures(course);
  const band = (p: { picture: number; row: number; line: number }, layer: 'bg0' | 'bg1'): SkyBand => {
    const { codes, rows } = picture(main, p.picture);
    const last = rows * TILE - 1;
    return {
      width: PICTURE_WIDTH,
      pixels: pixels(gfx, codes, colors(p.line), 0, last, layer === 'bg1'),
      bottom: rowBelow[layer](p.row * TILE + last),
      turn: SKY_TURN,
    };
  };
  const clear = colors(0)[tilePen(gfx, 0, 0, 0)]!;
  return {
    layers: [band(upper, 'bg1'), band(lower, 'bg1'), band(near, 'bg0')],
    facing: 0,
    ramp: { rows: [clear], below: clear },
  };
}
