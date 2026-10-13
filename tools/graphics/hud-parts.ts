import type { SegmentDigitsSource } from './hud-design-sources.js';
import {
  ARROW_TILES,
  DIGIT_TILES,
  HUD_DRAWN_TILE_NAMES,
  TACHOMETER_TILES,
  tachometerBarHeight,
  TEXT_TILE_SIZE,
} from '../../src/image/text-tiles.js';

/** A meter cell's rows: 4 pixels high, 2 pixels clear above and below. */
const METER_ROWS = [2, 3, 4, 5];

type Pixels = (x: number, y: number) => number;
/** One 8-by-8 pattern from a function of its pixels. */
const pattern = (pixel: Pixels) =>
  Array.from({ length: TEXT_TILE_SIZE * TEXT_TILE_SIZE }, (_, i) =>
    pixel(i % TEXT_TILE_SIZE, Math.floor(i / TEXT_TILE_SIZE)),
  );
/** Tile k of a picture `columns` tiles wide, row by row from the top left. */
const tileOf = (picture: Pixels, columns: number, k: number) =>
  pattern((x, y) => picture((k % columns) * TEXT_TILE_SIZE + x, Math.floor(k / columns) * TEXT_TILE_SIZE + y));

const meter = (filled: (x: number) => number) => pattern((x, y) => (METER_ROWS.includes(y) ? filled(x) : 0));

/**
 * The tachometer tile at `column` and `row`: each pixel-wide bar's part in that row, standing on the bottom row; bars
 * before `split` in slot 1 lit or 8 unlit, the rest in 9 lit or 10 unlit, and bars before `lit` lit.
 */
const tachometer = (column: number, row: number, split: number, lit: number) =>
  pattern((x, y) => {
    const top = DIGIT_TILES.rows * TEXT_TILE_SIZE - tachometerBarHeight(column * TEXT_TILE_SIZE + x);
    if (row * TEXT_TILE_SIZE + y < top) return 0;
    return x < split ? (x < lit ? 1 : 8) : x < lit ? 9 : 10;
  });

/** The left road arrow, 32 pixels square: a head pointing left over a shaft, slot 1 outlined in slot 2. */
const ARROW_SIZE = ARROW_TILES * TEXT_TILE_SIZE;
const inArrow = (x: number, y: number) => {
  const px = x + 0.5,
    py = y + 0.5,
    middle = ARROW_SIZE / 2;
  const head = px >= 2 && px <= 15 && Math.abs(py - middle) <= ((px - 2) * 13) / 13;
  const shaft = px > 15 && px <= 30 && Math.abs(py - middle) <= 6;
  return head || shaft;
};
const arrowLeft: Pixels = (x, y) => {
  if (inArrow(x, y)) return 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inArrow(x + dx, y + dy)) return 2;
  return 0;
};

/**
 * Every drawn HUD part tile's 64 palette indices, in the text tiles' order of `HUD_DRAWN_TILE_NAMES`: the segment digits
 * as their source gives them and the rest drawn.
 */
export function drawHudParts(segmentDigits: SegmentDigitsSource): (readonly number[])[] {
  const drawn = new Map<string, readonly number[]>();
  for (let a = 0; a <= TEXT_TILE_SIZE; a++)
    for (let b = a; b <= TEXT_TILE_SIZE; b++)
      drawn.set(
        `METER_${a}_${b}`,
        meter((x) => (x < a ? 1 : x < b ? 4 : 3)),
      );
  for (let k = 1; k < TEXT_TILE_SIZE; k++)
    drawn.set(
      `METER_RIGHT_${k}`,
      meter((x) => (x >= TEXT_TILE_SIZE - k ? 1 : 3)),
    );
  for (const [column, row] of TACHOMETER_TILES)
    for (let split = 1; split <= TEXT_TILE_SIZE; split++)
      for (let lit = 0; lit <= TEXT_TILE_SIZE; lit++)
        drawn.set(`TACH_${column}_${row}_${split}_${lit}`, tachometer(column, row, split, lit));
  segmentDigits.digits.forEach((tiles, d) =>
    tiles.forEach((tile, k) => drawn.set(`DIGIT_${d < 10 ? d : 'OFF'}_${k}`, tile)),
  );
  for (let k = 0; k < ARROW_TILES * ARROW_TILES; k++) {
    drawn.set(`ARROW_LEFT_${k}`, tileOf(arrowLeft, ARROW_TILES, k));
    drawn.set(
      `ARROW_RIGHT_${k}`,
      tileOf((x, y) => arrowLeft(ARROW_SIZE - 1 - x, y), ARROW_TILES, k),
    );
  }
  if (drawn.size !== HUD_DRAWN_TILE_NAMES.length || HUD_DRAWN_TILE_NAMES.some((name) => !drawn.has(name)))
    throw new Error('The drawn HUD part tiles differ from the text tiles order');
  return HUD_DRAWN_TILE_NAMES.map((name) => drawn.get(name)!);
}
