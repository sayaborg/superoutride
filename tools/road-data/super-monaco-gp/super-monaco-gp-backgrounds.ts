/**
 * SUPER MONACO GP's background as its main program builds it
 * ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-background)): the tile pages drawn from their
 * run-length records, the tiles' palettes and the road layer's sky and ground colors, of the fine set, and the sky they
 * make.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { tilePixel, TILE_PIXELS } from '../sega-16/rom-images.js';
import { u8, word } from '../sega-16/program-words.js';
import { paletteRgb555, readColors } from '../out-run-board/road-tables.js';
import { TRANSPARENT, type SkyBands } from '../sega-16/sky-baking.js';
import { VANISHING_PIXEL } from './super-monaco-gp-constants.js';

/** Main CPU: the fine set's page records, drawn in order. */
export const PAGE_RECORDS = Object.freeze([0x37ff8, 0x39f9a] as const);
/** The tile RAM: 16 pages of 64 × 32 tile words. */
export const PAGES = 16;
export const PAGE_COLUMNS = 64;
export const PAGE_ROWS = 32;
const PAGE_BYTES = 2 * PAGE_COLUMNS * PAGE_ROWS;
/** No record holds more runs than this. */
const MOST_RUNS = 4096;
/**
 * The tiles' palettes, colors 1–7 of 7 words each: palettes 8–127 from 0x432E at power on (a race's start reloads
 * 8–42 from there and 50–58 from 0x457A, the same words).
 */
const PALETTES = Object.freeze({ address: 0x432e, from: 8, to: 127 } as const);
const PALETTE_COLORS = 7;
/** The road layer's colors of the fine set: 0x33 words from 0x63E2. */
const ROAD_LAYER_COLORS = 0x63e2;
const ROAD_LAYER_COUNT = 0x33;

/**
 * The tile RAM's words after the records are drawn: a record is {word kind, word runs}, then runs {word byte offset
 * into the tile RAM, then groups {byte count c, byte high, c bytes low} up to a c of 0}, each group writing c words of
 * its high byte over each low byte one after another.
 */
export function drawPages(main: Uint8Array, records: readonly number[] = PAGE_RECORDS): Uint16Array {
  const ram = new Uint16Array((PAGES * PAGE_BYTES) / 2);
  for (const record of records) {
    const runs = word(main, record + 2);
    if (runs > MOST_RUNS) throw romDiffers(`The page record at 0x${record.toString(16)} is not a record`);
    let a = record + 4;
    for (let r = 0; r < runs; r++) {
      let at = (u8(main, a) << 8) | u8(main, a + 1);
      a += 2;
      for (let count = u8(main, a); count; count = u8(main, a)) {
        const high = u8(main, a + 1);
        for (let i = 0; i < count; i++, at += 2) {
          if (at >= PAGES * PAGE_BYTES || at % 2) throw romDiffers(`A page record writes outside the tile RAM`);
          ram[at / 2] = (high << 8) | u8(main, a + 2 + i);
        }
        a += 2 + count;
      }
      a++;
    }
  }
  return ram;
}

/** The tiles' palettes of the fine set, by palette: its 8 words' RGB555, color 0 transparent (0 here). */
export function readTilePalettes(main: Uint8Array): Map<number, number[]> {
  const palettes = new Map<number, number[]>();
  const { address, from, to } = PALETTES;
  for (let p = from; p <= to; p++)
    palettes.set(p, [0, ...readColors(main, address + 2 * PALETTE_COLORS * (p - from), PALETTE_COLORS).rgb555]);
  return palettes;
}

/** The road layer's colors of the fine set: color c the word at 0x63E2 + 2c, with its RGB555. */
export function readRoadLayerColors(main: Uint8Array) {
  const words = Array.from({ length: ROAD_LAYER_COUNT }, (_, c) => word(main, ROAD_LAYER_COLORS + 2 * c));
  return { address: ROAD_LAYER_COLORS, words, rgb555: words.map(paletteRgb555) };
}

/** The layers: the back of pages 4–6, rows 112–239; the front, the town's row, of pages 0–3, rows 192–239. */
const LAYERS = Object.freeze({
  back: { pages: [4, 5, 6], rows: [112, 239] },
  front: { pages: [0, 1, 2, 3], rows: [192, 239] },
} as const);
/** The front's pixel f lies over the back's 0.75f + 88.5, the vanishing point at both layers' pixel 354 at heading 0. */
const OVERLAP = VANISHING_PIXEL - 0.75 * VANISHING_PIXEL;
/** The ramp: color 0x31 the 16 rows above the horizon, then 0x30 to 0x01 a row each, 0x00 above; 0x32 below. */
const RAMP = Object.freeze({ low: 0x31, rows: 16, top: 0x00, below: 0x32 } as const);
/** The road layer's color of the ground, the ramp's below the horizon. */
export const GROUND_COLOR = RAMP.below;
/** A page is 64 × 32 tiles of 8 × 8 pixels. */

/**
 * The fine set's sky as `sky-baking` takes it: each layer's rows of its pages side by side, a pixel its tile's color in
 * its palette (pixel 0 transparent), both layers' bottom rows the first below the horizon; the road layer's ramp.
 */
export function superMonacoGpSkyBands(main: Uint8Array, tiles: readonly Uint8Array[]): SkyBands {
  const ram = drawPages(main);
  const palettes = readTilePalettes(main);
  const layer = ({ pages, rows }: { readonly pages: readonly number[]; readonly rows: readonly [number, number] }) => {
    const width = pages.length * PAGE_COLUMNS * TILE_PIXELS,
      height = rows[1] - rows[0] + 1;
    const pixels = new Int32Array(width * height).fill(TRANSPARENT);
    pages.forEach((page, k) => {
      for (let y = rows[0]; y <= rows[1]; y++)
        for (let x = 0; x < PAGE_COLUMNS * TILE_PIXELS; x++) {
          const tileWord = ram[page * PAGE_COLUMNS * PAGE_ROWS + (y >> 3) * PAGE_COLUMNS + (x >> 3)]!;
          const v = tilePixel(tiles, tileWord & 0x1fff, x & 7, y & 7);
          if (!v) continue;
          const colors = palettes.get((tileWord >> 6) & 0x7f);
          if (!colors) throw romDiffers(`Tile palette ${(tileWord >> 6) & 0x7f} is not loaded`);
          pixels[(y - rows[0]) * width + k * PAGE_COLUMNS * TILE_PIXELS + x] = colors[v]!;
        }
    });
    return { width, pixels, bottom: 0 };
  };
  const road = readRoadLayerColors(main).rgb555;
  return {
    back: layer(LAYERS.back),
    front: layer(LAYERS.front),
    overlap: OVERLAP,
    ramp: {
      rows: [
        ...Array.from({ length: RAMP.rows }, () => road[RAMP.low]!),
        ...Array.from({ length: RAMP.low - 1 }, (_, i) => road[RAMP.low - 1 - i]!),
        road[RAMP.top]!,
      ],
      below: road[RAMP.below]!,
    },
  };
}
