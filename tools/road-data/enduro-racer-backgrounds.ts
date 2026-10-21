/**
 * ENDURO RACER's backgrounds as its main program draws them
 * ([Original road data](../../docs/original-road-data.md#enduro-racers-backgrounds)): each stage's two layers of tile
 * columns, their vertical offsets, the tiles' palettes, and the sky's ramp and top color.
 */
import { long, sword, u8, word } from './program-words.js';
import { paletteRgb555 } from './road-tables.js';
import { readSpritePalette } from './enduro-racer-sprites.js';

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
  const at = (address: number) => Array.from({ length: PALETTE }, (_, k) => word(main, address + 2 * k));
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
