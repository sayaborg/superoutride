/**
 * ENDURO RACER's backgrounds as its main program draws them
 * ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-backgrounds)): each stage's two layers of tile
 * columns, their vertical offsets, the tiles' palettes, and the sky's ramp and top color.
 */
import { tilePixel } from './rom-images.js';
import { long, sword, u8, word } from './program-words.js';
import { paletteRgb555, readColors } from './road-tables.js';
import { readSpritePalette } from './enduro-racer-sprites.js';
import { TRANSPARENT, type SkyBands, type SkyLayer } from './sky-baking.js';
import { OVERLAP } from './enduro-racer-constants.js';

/** Main CPU (its data image). */
const FRONT_LAYERS = 0xd668;
const BACK_LAYERS = 0xd67c;
const BACK_OFFSETS = 0xd0f2;
const FIRST_PALETTES = 0xaac8;
const FIRST_PALETTE_COUNT = 6;
const PALETTE_SOURCES = 0xab28;
const PALETTE_WORDS = 0xaba0;
const SOURCED_PALETTES = { from: 8, to: 127 } as const;
const SKY_TOPS = 0xd900;
const RAMPS = 0xd8dc;
/** The ramp's colors are pixels 1–14 of sprite palette 0x3C + stage. */
const RAMP_PALETTE = 0x3c;
/** A tile palette: 8 words. */
const PALETTE = 8;
/** A column: 8 tiles across, its rows' tile words from the top. */
export const COLUMN_TILES = 8;
/** The front layer's columns and the back layer's: 2048 and 1536 pixels around. */
export const LAYER_COLUMNS = { front: 32, back: 24 } as const;

/** A layer: its columns' table (each {A, B}), rows of tiles, and its columns' tile words in the order of their address. */
export interface Layer {
  readonly record: number;
  readonly table: number;
  readonly rows: number;
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly columns: readonly (readonly number[])[];
}

/**
 * Stage s's layer: the long at 0xD668 + 4s (front) or 0xD67C + 4s (back) points at {long columns' table, word rows};
 * the table holds 32 (front) or 24 (back) {long A, long B}, A a column's tile words. The layer's picture is its columns
 * left to right in the order of their address.
 */
export function readLayer(main: Uint8Array, stage: number, which: 'front' | 'back'): Layer {
  const record = long(main, (which === 'front' ? FRONT_LAYERS : BACK_LAYERS) + 4 * stage);
  const table = long(main, record),
    rows = word(main, record + 4);
  const count = LAYER_COLUMNS[which];
  const a = Array.from({ length: count }, (_, c) => long(main, table + 8 * c));
  const b = Array.from({ length: count }, (_, c) => long(main, table + 8 * c + 4));
  const sorted = [...a].sort((x, y) => x - y);
  sorted.forEach((address, c) => {
    if (c > 0 && address !== sorted[c - 1]! + 2 * COLUMN_TILES * rows)
      throw new RangeError(`Stage ${stage + 1}'s ${which} layer's columns do not follow one another`);
  });
  const columns = sorted.map((address) =>
    Array.from({ length: COLUMN_TILES * rows }, (_, k) => word(main, address + 2 * k)),
  );
  return { record, table, rows, a, b, columns };
}

/** Stage s's back layer's vertical offset, rows: the signed word at 0xD0F2 + 2s. */
export const readBackOffset = (main: Uint8Array, stage: number) => sword(main, BACK_OFFSETS + 2 * stage);

/**
 * The tiles' palettes, which stay as they are from the start: palettes 0–5 the 8 words each from 0xAAC8, palettes
 * 8–127 the 8 words at 0xABA0 + 16 × the byte at 0xAB28 + palette − 8. Palette RAM's words by palette.
 */
export function readTilePalettes(main: Uint8Array): Map<number, number[]> {
  const palettes = new Map<number, number[]>();
  const at = (address: number) => [...readColors(main, address, PALETTE).words];
  for (let p = 0; p < FIRST_PALETTE_COUNT; p++) palettes.set(p, at(FIRST_PALETTES + 2 * PALETTE * p));
  for (let p = SOURCED_PALETTES.from; p <= SOURCED_PALETTES.to; p++)
    palettes.set(p, at(PALETTE_WORDS + 2 * PALETTE * u8(main, PALETTE_SOURCES + p - SOURCED_PALETTES.from)));
  return palettes;
}

/**
 * Stage s's sky: the ramp's 48 bits at 0xD8DC + 6s, from the horizon up (a 1 where the next color begins, the first
 * at the horizon's row), its 14 colors pixels 1–14 of sprite palette 0x3C + s, and above it the top color, the word
 * at 0xD900 + 4s.
 */
export function readSky(main: Uint8Array, stage: number) {
  const bits = [0, 1, 2].map((k) => word(main, RAMPS + 6 * stage + 2 * k));
  const palette = readSpritePalette(main, RAMP_PALETTE + stage);
  const top = word(main, SKY_TOPS + 4 * stage);
  return {
    ramp: bits,
    colors: palette.words.slice(1, 15),
    rgb555: palette.rgb555.slice(1, 15),
    top: { word: top, rgb555: paletteRgb555(top) },
  };
}

/** A tile: 8 × 8 pixels, a byte a row in each of three bit planes, bit 7 the leftmost. */
const TILE = 8;
/** The sky's ramp: 48 rows up from the horizon. */
const RAMP_ROWS = 48;

/**
 * Stage s's sky as `sky-baking` takes it, from the tile ROMs' bit planes `planes` and the ground's color `below`: each
 * layer's columns in the order of their address, a tile word's tile its bits 0–11 and its palette its bits 5–11 (pixel
 * 0 transparent), both layers' bottom row the first below the horizon but for the back layer's offset (stage 5's 4
 * rows lower); the ramp's colors by its bits, a 1 at the row up from the horizon where the next color begins, and the
 * top color above.
 */
export function stageSky(main: Uint8Array, planes: readonly Uint8Array[], stage: number, below: number): SkyBands {
  const palettes = new Map([...readTilePalettes(main)].map(([p, words]) => [p, words.map(paletteRgb555)]));
  const layer = (which: 'front' | 'back', bottom: number): SkyLayer => {
    const { rows, columns } = readLayer(main, stage, which);
    const width = columns.length * COLUMN_TILES * TILE;
    const pixels = new Int32Array(width * rows * TILE).fill(TRANSPARENT);
    columns.forEach((tiles, c) =>
      tiles.forEach((tileWord, k) => {
        const [tx, ty] = [c * COLUMN_TILES + (k % COLUMN_TILES), Math.floor(k / COLUMN_TILES)];
        const tile = tileWord & 0xfff,
          colors = palettes.get((tileWord >> 5) & 0x7f);
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++) {
            const v = tilePixel(planes, tile, x, y);
            if (!v) continue;
            if (!colors)
              throw new RangeError(`Stage ${stage + 1}'s ${which} layer uses palette ${(tileWord >> 5) & 0x7f}`);
            pixels[(ty * TILE + y) * width + tx * TILE + x] = colors[v]!;
          }
      }),
    );
    return { width, pixels, bottom };
  };
  const sky = readSky(main, stage);
  const bits = sky.ramp.flatMap((w) => Array.from({ length: 16 }, (_, b) => (w >> (15 - b)) & 1));
  const rows: number[] = [];
  let color = 0;
  for (let r = 0; r < RAMP_ROWS; r++) {
    if (bits[r]) color++;
    rows.push(sky.rgb555[color]!);
  }
  if (color !== sky.rgb555.length - 1) throw new RangeError(`Stage ${stage + 1}'s ramp does not reach its last color`);
  return {
    back: layer('back', -readBackOffset(main, stage)),
    front: layer('front', 0),
    overlap: OVERLAP,
    ramp: { rows: [...rows, sky.top.rgb555], below },
  };
}
