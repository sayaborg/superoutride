/**
 * The Out Run hardware's background layers ([Sky baking](../../../docs/original-road-data.md#sky-baking)), which OUTRUN's and
 * TURBO OUTRUN's programs lay alike: a layer's tile words read from its data, and the layer as a sky bakes it. Each
 * original's own tables say where its layers, palettes and ramps are.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { tilePixel, TILE_PIXELS } from '../sega-16/rom-images.js';
import { word } from '../sega-16/program-words.js';
import { paletteRgb555 } from './road-tables.js';
import { TRANSPARENT, type SkyBands, type SkyLayer } from '../shared/sky-baking.js';
import { layerMiddles } from '../sega-16/display.js';
import { LAYER_MIDDLE } from './constants.js';

/** A layer page: 64 × 32 tiles of 8 × 8 pixels; the front layer has four pages (2048 pixels), the back three (1536). */
const PAGE_COLUMNS = 64;
const PAGE_ROWS = 32;
export const FRONT_PAGES = 4;
export const BACK_PAGES = 3;
/** A tile palette's words; tile 64p to 64p + 63 is in palette p, a tile word's bits 6–12. */
export const PALETTE_WORDS = 8;
/**
 * The layers as the hardware shows them: at the road's heading h the front's scroll F = −h, the back's ⌊3 (F & 0x7FF) / 4⌋,
 * no offset added (OUTRUN's M 0xDB26 to 0xDB82; TURBO OUTRUN's M 0x1D0EE to 0x1D14A, encrypted, read from the program
 * decrypted locally), both 0 where a stage's scroll starts, at heading 0: there the layers' middles (`layerMiddles`),
 * the back layer the map's last 1536 pixels.
 */
export const BACKGROUND_SCROLL = layerMiddles(LAYER_MIDDLE, 0, 0);
/** A sky ramp's words: the road layer's 64 sky colors. */
export const RAMP_WORDS = 64;

/**
 * A sky ramp (`RAMP_WORDS` RGB555 words) as a sky bakes it, as the sub CPU's road code lays its colors (OUTRUN's line list
 * at sub 0x1318 to 0x13B6, TURBO OUTRUN's the same bytes at 0x1264): above the road's top each row the road layer's
 * solid color 0x800 + k, k from 1, two rows each to 62, then 63 every row above (`move.w d7, -(a0)` twice, `addq.w #1,
 * d7`, at most `#$3F`); 0 (0x800) only where the road's top lies above the row it reaches, so below it.
 */
export function rampRows(ramp: readonly number[]): SkyBands['ramp'] {
  if (ramp.length !== RAMP_WORDS) throw romDiffers(`A sky ramp is ${RAMP_WORDS} words`);
  return {
    rows: Array.from(
      { length: 2 * (RAMP_WORDS - 2) + 1 },
      (_, u) => ramp[Math.min(RAMP_WORDS - 1, Math.floor(u / 2) + 1)]!,
    ),
    below: ramp[0]!,
  };
}

/** A row the layer's data does not write holds this tile word. */
const UNWRITTEN = 0x0020;

/**
 * A layer's tile words from its data at `address`: page by page, `rows` rows from the page's bottom (row 31) up, each
 * row's 64 tile words a word each, or 0 then {word tile word, word count − 1} for a run within the row. The words are
 * page after page, each page's rows from the top, a row's columns from the left.
 */
export function readLayer(main: Uint8Array, address: number, pages: number, rows: number): Uint16Array {
  const tiles = new Uint16Array(pages * PAGE_ROWS * PAGE_COLUMNS).fill(UNWRITTEN);
  let a = address;
  for (let page = 0; page < pages; page++)
    for (let r = 0; r < rows; r++) {
      const at = (page * PAGE_ROWS + PAGE_ROWS - 1 - r) * PAGE_COLUMNS;
      for (let column = 0; column < PAGE_COLUMNS;) {
        const w = word(main, a);
        a += 2;
        if (w) tiles[at + column++] = w;
        else {
          const value = word(main, a),
            count = word(main, a + 2) + 1;
          a += 4;
          if (column + count > PAGE_COLUMNS) throw romDiffers(`A layer's run at 0x${a.toString(16)} passes its row`);
          for (let i = 0; i < count; i++) tiles[at + column++] = value;
        }
      }
    }
  return tiles;
}

/**
 * A layer of `pages` pages as a sky bakes it, its bottom row `bottom` rows below the horizon: its pages the last leftmost
 * (the page selects show each page's predecessor to its right), a tile word's tile its bits 0–12, a pixel 0 transparent
 * and any other the word `color` gives for its tile's palette and the pixel.
 */
export function bakeLayer(
  planes: readonly Uint8Array[],
  tiles: Uint16Array,
  pages: number,
  bottom: number,
  color: (palette: number, pixel: number) => number,
): SkyLayer {
  const [width, height] = [pages * PAGE_COLUMNS * TILE_PIXELS, PAGE_ROWS * TILE_PIXELS];
  const pixels = new Int32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const page = pages - 1 - Math.floor(x / (PAGE_COLUMNS * TILE_PIXELS));
      const tile =
        tiles[
          (page * PAGE_ROWS + Math.floor(y / TILE_PIXELS)) * PAGE_COLUMNS + (Math.floor(x / TILE_PIXELS) % PAGE_COLUMNS)
        ]! & 0x1fff;
      const value = tilePixel(planes, tile, x % TILE_PIXELS, y % TILE_PIXELS);
      pixels[y * width + x] = value ? paletteRgb555(color(tile >> 6, value)) : TRANSPARENT;
    }
  return { width, pixels, bottom };
}
