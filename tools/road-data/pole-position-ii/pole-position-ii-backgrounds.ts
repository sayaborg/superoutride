/**
 * POLE POSITION II's background ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-sky)):
 * each course's panorama as the second program streams it into the background's tile map, its tiles' pixels in the
 * background's colors, and laid as the course's sky.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { bakeSky } from '../shared/sky-baking.js';
import { paletteColor } from '../pole-position-hardware/colors.js';
import { PIXEL_ASPECT } from '../pole-position-hardware/display.js';
import type { PolePositionII } from './pole-position-ii-rom.js';
import { BACKGROUND_BOTTOM } from './pole-position-ii-constants.js';

/** The background's tile map's rows, a tile's pixels, and the rows the screen shows from the map's top. */
const ROWS = 16;
const TILE = 8;
const HIDDEN = 2;
/** A course's panorama's columns: the scroll's column, a byte. */
export const PANORAMA_COLUMNS = 256;

/**
 * Course c's panorama, a tile word each of its columns' 16 rows (column by column, top down), as the second program
 * streams it into the background's map: its 0x023A writes column k's run of tiles from the bottom up, their count and
 * first from 0x5400 by 0x5000 + 256c + k's entry, the rest of the column to row 1 from 0x587C, a row each; then its
 * 0x02EE lays 0x589C's shapes over them, each from a column's top, a tile word's high byte once, then a tile each byte
 * with its bit 7 set, a byte without it moving on as many rows (on into the next column), 0 ending it.
 */
export function readPanorama(p: PolePositionII, course: number): Uint16Array {
  const s = p.second;
  const [columns] = instruction(s, 0x0248, [0x601a, null, 0x8c28], "the panorama's columns");
  const [first, last] = instruction(s, 0x024e, [0x602b, null, 0x8c38, 0x602c, null], "a column's run");
  const [runs] = instruction(s, 0x025a, [0x8132, 0x8122, 0x0102, null], "the columns' tiles");
  instruction(s, 0x026c, [0xb351, 0x0005, 0x0105, 0xa01e], 'a column written from its bottom');
  const [sky] = instruction(s, 0x0286, [0x0102, null], 'the columns above their runs');
  const [shapes] = instruction(s, 0x02ee, [0x210b, null], "the panorama's shapes");
  instruction(s, 0x0330, [0x20b0, 0xa9b0, 0x20b8, 0xa9b0, 0xa687, 0xe603, 0x2f50, 0xa951], "a shape's tiles");
  instruction(s, 0x034a, [0x060e, 0x1f1f, 0x8166, 0x8165], "a shape's skips");
  if (last !== first! + 1) throw romDiffers("A column's run is not read as its first and last");
  const word = (at: number) => (s[at]! << 8) | s[at + 1]!;
  const map = new Uint16Array(PANORAMA_COLUMNS * ROWS);
  for (let k = 0; k < PANORAMA_COLUMNS; k++) {
    const entry = s[columns! + course * PANORAMA_COLUMNS + k]!;
    const [from, to] = [s[first! + entry]!, s[last! + entry]!];
    const count = to - from + 1;
    if (!(count > 0 && count <= ROWS)) throw romDiffers(`Panorama column ${k}'s run is ${count} tiles`);
    for (let j = 0; j < count; j++) map[k * ROWS + ROWS - 1 - j] = word(runs! + 2 * (entry + from) + 2 * j);
    for (let row = ROWS - 1 - count; row >= 0; row--) map[k * ROWS + row] = word(sky! + 2 * row);
  }
  for (let at = shapes!; s[at] !== 0;) {
    let place = s[at]! * ROWS;
    const high = s[at + 1]! << 8;
    at += 2;
    for (let b = s[at++]!; b !== 0; b = s[at++]!) {
      if (b & 0x80) map[place++ % map.length] = high | b;
      else place += b & 0x1f;
    }
  }
  return map;
}

/**
 * A background tile word's pixels in the background's colors (RGB555): its tile its low byte with bit 14 its ninth
 * bit, its color its bits 8 to 13; a tile 2 bits a pixel, a row two bytes (the left four pixels' then the right's), a
 * pixel's high bit at its place in a byte's high nibble and its low bit in the low; the color's four entries of the
 * background's PROM, each the palette's color.
 */
function tilePixels(p: PolePositionII, word: number): number[] {
  const code = (word & 0xff) | ((word & 0x4000) >> 6);
  const color = (word >> 8) & 0x3f;
  const at = code * 2 * TILE;
  if (at + 2 * TILE > p.tiles.length) throw romDiffers(`The background has no tile ${code}`);
  const pens = [0, 1, 2, 3].map((v) =>
    paletteColor(p.colors.red, p.colors.green, p.colors.blue, p.background[color * 4 + v]! & 15),
  );
  return Array.from({ length: TILE * TILE }, (_, i) => {
    const [x, y] = [i % TILE, Math.floor(i / TILE)];
    const byte = p.tiles[at + y + (x >= 4 ? TILE : 0)]!;
    const bit = 3 - (x & 3);
    return pens[(((byte >> (bit + 4)) & 1) << 1) | ((byte >> bit) & 1)]!;
  });
}

/**
 * Course `course`'s sky: its panorama the back layer, one a turn (its 2048 pixels), its rows the screen shows, its bottom
 * `BACKGROUND_BOTTOM` rows below the horizon; over its top row's one color, the ramp, and `ground` below the horizon.
 */
export function polePositionIISky(p: PolePositionII, course: number, name: string, ground: number) {
  const map = readPanorama(p, course);
  const width = PANORAMA_COLUMNS * TILE;
  const height = (ROWS - HIDDEN) * TILE;
  const pixels = new Int32Array(width * height);
  for (let k = 0; k < PANORAMA_COLUMNS; k++)
    for (let row = HIDDEN; row < ROWS; row++) {
      const tile = tilePixels(p, map[k * ROWS + row]!);
      for (let i = 0; i < tile.length; i++)
        pixels[((row - HIDDEN) * TILE + Math.floor(i / TILE)) * width + k * TILE + (i % TILE)] = tile[i]!;
    }
  const top = new Set(pixels.subarray(0, width));
  if (top.size !== 1) throw romDiffers(`Course ${course}'s background's top row is not one color`);
  return bakeSky(
    name,
    { layers: [{ width, pixels, bottom: BACKGROUND_BOTTOM }], facing: 0, ramp: { rows: [...top], below: ground } },
    PIXEL_ASPECT,
  );
}
