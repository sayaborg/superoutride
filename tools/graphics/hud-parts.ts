import {
  ARROW_TILES,
  DIGIT_TILES,
  HUD_DRAWN_TILE_NAMES,
  TACHOMETER_BARS,
  TEXT_TILE_SIZE,
} from '../../src/image/text-tiles.js';

/**
 * The tachometer bars' heights in pixels, from the left: they grow along a quadratic curve to the three tiles' 24
 * pixels, standing on the bottom row.
 */
export const TACHOMETER_HEIGHTS = Object.freeze([4, 4, 4, 4, 5, 5, 6, 7, 8, 8, 10, 11, 12, 13, 15, 16, 18, 20, 22, 24]);

/** A meter cell's rows: 4 pixels high, 2 pixels clear above and below. */
const METER_ROWS = [2, 3, 4, 5];
/** A tachometer bar is 3 pixels wide with a pixel's gap, two to a tile. */
const TACHOMETER_BAR_WIDTH = 3;

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

/** Tachometer bar b's pixels in its 24-pixel-high column of tiles, slot `slot`. */
const tachometer = (b: number, row: number, slot: number) => {
  const left = (b % 2) * (TEXT_TILE_SIZE / 2),
    top = DIGIT_TILES.rows * TEXT_TILE_SIZE - TACHOMETER_HEIGHTS[b]!;
  return pattern((x, y) =>
    x >= left && x < left + TACHOMETER_BAR_WIDTH && row * TEXT_TILE_SIZE + y >= top ? slot : 0,
  );
};

/**
 * The seven segments of a 16-by-24-pixel digit, a to g, each 3 pixels thick with tapered ends and a pixel's margin:
 * [x, y] of each segment's middle line's first and last pixels.
 */
const SEGMENTS = Object.freeze({
  a: [4, 2, 11, 2],
  b: [13, 4, 13, 9],
  c: [13, 13, 13, 19],
  d: [4, 21, 11, 21],
  e: [2, 13, 2, 19],
  f: [2, 4, 2, 9],
  g: [4, 11, 11, 11],
} as const);
const DIGIT_SEGMENTS = Object.freeze([
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'acdefg',
  'abc',
  'abcdefg',
  'abcdfg',
]);
/** The segment holding a pixel, or null: the middle line and, one pixel either side of it, all but its end pixels. */
const segmentAt = (x: number, y: number) => {
  for (const [name, [x0, y0, x1, y1]] of Object.entries(SEGMENTS)) {
    const across = y0 === y1 ? Math.abs(y - y0) : Math.abs(x - x0),
      along = y0 === y1 ? x : y,
      [from, to] = y0 === y1 ? [x0, x1] : [y0, y1];
    if (across <= 1 && along >= from + across && along <= to - across) return name;
  }
  return null;
};
const digit =
  (lit: string): Pixels =>
  (x, y) => {
    const segment = segmentAt(x, y);
    return segment === null ? 0 : lit.includes(segment) ? 1 : 8;
  };

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

/** Every drawn HUD part tile's 64 palette indices, in the text tiles' order of `HUD_DRAWN_TILE_NAMES`. */
export function drawHudParts(): number[][] {
  const drawn = new Map<string, number[]>();
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
  for (let b = 0; b < TACHOMETER_BARS; b++)
    for (let row = 0; row < DIGIT_TILES.rows; row++) {
      drawn.set(`TACH_${b}_${row}_ON`, tachometer(b, row, 1));
      drawn.set(`TACH_${b}_${row}_OFF`, tachometer(b, row, 8));
    }
  const digitTiles = DIGIT_TILES.columns * DIGIT_TILES.rows;
  [...DIGIT_SEGMENTS, ''].forEach((lit, d) => {
    for (let k = 0; k < digitTiles; k++)
      drawn.set(`DIGIT_${d < 10 ? d : 'OFF'}_${k}`, tileOf(digit(lit), DIGIT_TILES.columns, k));
  });
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
