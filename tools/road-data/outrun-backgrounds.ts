/**
 * OUTRUN's backgrounds as its program places them ([OUTRUN road data](../../docs/outrun-road-data.md#backgrounds)):
 * each stage's two tile layers, front and back, and its sky's ramp, which the shared sky baking draws as the stage's
 * sky.
 */
import { tilePixel } from './rom-images.js';
import { long, word } from './program-words.js';
import { requireInput } from '../course/authoring-io.js';
import { paletteRgb555 } from './road-tables.js';
import { TRANSPARENT, type SkyBands, type SkyLayer } from './sky-baking.js';

/** The main CPU's tables: the stage table, the tile palettes and their stage patches, the layers, the skies. */
const STAGE_TABLE = 0xe49c;
const STAGE_BLOCKS = 0xe528;
const TEXT_PALETTES = 0x16ed8;
const TILE_PALETTE_INDICES = 0x16fd8;
const TILE_PALETTE_COLORS = 0x17050;
const PATCH_INDICES = 0xddb4;
const PATCH_ROUTINES = 0xdddc;
const LAYER_INDICES = 0x17e84;
const LAYERS = 0x17eac;
const SKY_RAMPS = 0x17590;
/** Palette RAM's first word, and its words: 128 tile palettes of 8 colors, then the rest. */
const PALETTE_RAM = 0x120000;
const PALETTE_WORDS = 0x800;
/** A text palette, a tile palette's colors: 8 words. The base fills palettes 0–7, then 120 from the index table. */
const TILE_PALETTE = 8;
const TEXT_PALETTE_COUNT = 8;
const TILE_PALETTE_COUNT = 0x78;
/** A layer page: 64 × 32 tiles of 8 × 8 pixels. The front layer has four pages, the back three. */
const PAGE_COLUMNS = 64;
const PAGE_ROWS = 32;
const TILE = 8;
const FRONT_PAGES = 4;
const BACK_PAGES = 3;
/** A sky ramp: 64 palette words, 0 below the horizon, then two rows each up from it, the last above. */
const RAMP = 64;

/**
 * The palette RAM words a stage's layers are drawn in: palettes 0–7 from 0x16ED8, 8–127 each the 8 words at
 * 0x17050 + 16 × its byte at 0x16FD8, then the stage's patch. The byte at 0xDDB4 + its place in the stage table chooses
 * the patch, a branch at 0xDDDC + 4 × that byte; each patch sets `lea source, a0`, then copies those 8 words with
 * `lea palette, a1; moveq n, d0; bsr` into n + 1 palettes from that one.
 */
function stagePalettes(main: Uint8Array, place: number): Uint16Array {
  const ram = new Uint16Array(PALETTE_WORDS);
  for (let i = 0; i < TEXT_PALETTE_COUNT * TILE_PALETTE; i++) ram[i] = word(main, TEXT_PALETTES + 2 * i);
  for (let p = 0; p < TILE_PALETTE_COUNT; p++)
    for (let c = 0; c < TILE_PALETTE; c++)
      ram[(TEXT_PALETTE_COUNT + p) * TILE_PALETTE + c] = word(
        main,
        TILE_PALETTE_COLORS + 16 * main[TILE_PALETTE_INDICES + p]! + 2 * c,
      );
  const branch = PATCH_ROUTINES + 4 * main[PATCH_INDICES + place]!;
  let pc = branch + 2 + ((word(main, branch + 2) << 16) >> 16),
    source = 0;
  for (;;) {
    const op = word(main, pc);
    if (op === 0x4e75) return ram;
    if (op === 0x41f9) {
      source = long(main, pc + 2);
      pc += 6;
    } else if (op === 0x43f9 && word(main, pc + 6) >> 8 === 0x70 && word(main, pc + 8) === 0x6100) {
      const palette = (long(main, pc + 2) - PALETTE_RAM) / 2;
      for (let q = 0; q <= (word(main, pc + 6) & 0xff); q++)
        for (let c = 0; c < TILE_PALETTE; c++) ram[palette + q * TILE_PALETTE + c] = word(main, source + 2 * c);
      pc += 12;
    } else throw new Error(`Stage palette patch: unread instruction 0x${op.toString(16)} at 0x${pc.toString(16)}`);
  }
}

/** A layer: its pages' tile words, row-major across its pages, and its width, pixels. */
interface Layer {
  readonly pages: number;
  readonly tiles: Uint16Array;
}

/**
 * A layer from its data at `address`: page by page, `rows` rows from the page's bottom (row 31) up, each row's 64
 * tile words a word each, or 0 then a long {word tile word, word count − 1} for a run.
 */
function readLayer(main: Uint8Array, address: number, pages: number, rows: number): Layer {
  const tiles = new Uint16Array(pages * PAGE_COLUMNS * PAGE_ROWS);
  let a = address;
  for (let page = 0; page < pages; page++)
    for (let r = 0; r < rows; r++) {
      const at = ((PAGE_ROWS - 1 - r) * pages + page) * PAGE_COLUMNS;
      for (let column = 0; column < PAGE_COLUMNS;) {
        const w = word(main, a);
        a += 2;
        if (w) tiles[at + column++] = w;
        else {
          const value = word(main, a),
            count = word(main, a + 2) + 1;
          a += 4;
          for (let i = 0; i < count && column < PAGE_COLUMNS; i++) tiles[at + column++] = value;
        }
      }
    }
  return { pages, tiles };
}

/**
 * A layer's palette RAM word at its pixel (x, y), or null where transparent. Its pages stand last first: the page
 * selects at 0x17E4C and 0x17E5C show a page's predecessor to its right.
 */
function layerWord(planes: readonly Uint8Array[], ram: Uint16Array, layer: Layer, x: number, y: number) {
  const page = layer.pages - 1 - Math.floor(x / TILE / PAGE_COLUMNS);
  const w =
    layer.tiles[(Math.floor(y / TILE) * layer.pages + page) * PAGE_COLUMNS + (Math.floor(x / TILE) % PAGE_COLUMNS)]!;
  // A tile word: its pattern in bits 0–12, its palette in bits 6–12.
  const v = tilePixel(planes, w & 0x1fff, x % TILE, y % TILE);
  return v ? ram[((w >> 6) & 0x7f) * TILE_PALETTE + v]! : null;
}

/**
 * What stage `number`'s background gives its sky ([sky baking](../../docs/original-road-data.md#sky-baking)), as its
 * program places it:
 * - **Layers.** The byte at 0x17E84 + its place in the stage table numbers its entry at 0x17EAC, 12 bytes: {u8 front
 *   rows, u8 back rows, long front data, long back data, word offset}. The front layer is four pages (2048 px) and
 *   turns with the road's heading, a full turn a width; the back is three (1536 px), turning 3/4 as fast, a full turn
 *   its width too, so the front's pixel f stands over the back's 3/4 f. Both stand with their bottom `offset` rows
 *   below the road's top.
 * - **Sky.** The stage block's first word numbers its ramp, the long at 0x17590 + 4 × it: 64 colors, color k (1–62)
 *   rows 2(k − 1) to 2k − 1 up from the road's top, 63 above them, 0 below it.
 */
export function stageSky(main: Uint8Array, planes: readonly Uint8Array[], number: number): SkyBands {
  const place = [...main.subarray(STAGE_TABLE, STAGE_TABLE + 40)].indexOf(number);
  requireInput(place >= 0, '/stage', `Stage 0x${number.toString(16)} is not in the stage table`);
  const ram = stagePalettes(main, place);
  const entry = LAYERS + 12 * main[LAYER_INDICES + place]!;
  // The layers' bottom row, `offset` rows below the road's top: 0 is the first row below it.
  const bottom = word(main, entry + 10) - 1;
  const layer = (address: number, pages: number, rows: number): SkyLayer => {
    const read = readLayer(main, address, pages, rows);
    const [width, height] = [pages * PAGE_COLUMNS * TILE, PAGE_ROWS * TILE];
    const pixels = new Int32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const w = layerWord(planes, ram, read, x, y);
        pixels[y * width + x] = w === null ? TRANSPARENT : paletteRgb555(w);
      }
    return { width, pixels, bottom };
  };
  const ramp = long(main, SKY_RAMPS + 4 * word(main, long(main, long(main, STAGE_BLOCKS + 4 * number))));
  const color = (k: number) => paletteRgb555(word(main, ramp + 2 * k));
  return {
    back: layer(long(main, entry + 6), BACK_PAGES, main[entry + 1]!),
    front: layer(long(main, entry + 2), FRONT_PAGES, main[entry]!),
    overlap: 0,
    ramp: {
      rows: Array.from({ length: 2 * (RAMP - 2) + 1 }, (_, u) => color(Math.min(RAMP - 1, Math.floor(u / 2) + 1))),
      below: color(0),
    },
  };
}
