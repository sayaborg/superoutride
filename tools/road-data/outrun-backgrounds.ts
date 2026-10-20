/**
 * OUTRUN's backgrounds as its program places them ([Original road data](../../docs/original-road-data.md#backgrounds)):
 * each stage's two tile layers, front and back, over its sky's ramp, drawn as one picture for a
 * [local original](../../docs/development.md#local-originals) of the stage's sky.
 */
import { requireInput } from '../course/authoring-io.js';
import { paletteRgb555 } from './road-tables.js';
import type { ZipFile } from './zip.js';

/** The tile ROMs: three bit planes, each two 32 KiB ROMs (tiles 0–4095, then 4096–8191), the lowest bit first. */
export const OUTRUN_TILE_ROMS = Object.freeze([
  [
    { name: 'opr-10268.99', crc: 0x95344b04 },
    { name: 'opr-10232.102', crc: 0x776ba1eb },
  ],
  [
    { name: 'opr-10267.100', crc: 0xa85bb823 },
    { name: 'opr-10231.103', crc: 0x8908bcbf },
  ],
  [
    { name: 'opr-10266.101', crc: 0x9f6f1a74 },
    { name: 'opr-10230.104', crc: 0x686f5e50 },
  ],
] as const);
const TILE_ROM_SIZE = 0x8000;

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
/** A sky ramp: 64 palette words, one a row up from the horizon, the last above. */
const RAMP = 64;

const word = (p: Uint8Array, a: number) => (p[a]! << 8) | p[a + 1]!;
const long = (p: Uint8Array, a: number) => ((word(p, a) << 16) | word(p, a + 2)) >>> 0;

/** The tile ROMs' three bit planes, each 8 bytes a tile (a byte a row, its bit 7 the leftmost pixel). */
export function assembleTiles(files: ReadonlyMap<string, ZipFile>): readonly Uint8Array[] {
  return OUTRUN_TILE_ROMS.map((halves) => {
    const plane = new Uint8Array(halves.length * TILE_ROM_SIZE);
    halves.forEach(({ name, crc }, h) => {
      const file = files.get(name);
      requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
      requireInput(
        file.data.length === TILE_ROM_SIZE && file.crc === crc,
        `/rom/${name}`,
        `${name} is not MAME outrun's tile ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
      );
      plane.set(file.data, h * TILE_ROM_SIZE);
    });
    return plane;
  });
}

/** A tile's pixel, 0 transparent: its planes' bits at (x, y), plane k bit k. */
const tilePixel = (planes: readonly Uint8Array[], tile: number, x: number, y: number) =>
  planes.reduce((v, plane, k) => v | (((plane[tile * TILE + y]! >> (7 - x)) & 1) << k), 0);

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
 * Stage `number`'s background, `width` × `height` RGB555 pixels, the horizon (the road's top) at row `horizon`, as its
 * program places it:
 * - **Layers.** The byte at 0x17E84 + its place in the stage table numbers its entry at 0x17EAC, 12 bytes: {u8 front
 *   rows, u8 back rows, long front data, long back data, word offset}. The front layer is four pages (2048 px) and turns
 *   with the road's heading, a full turn a width; the back is three (1536 px), turning 3/4 as fast, a full turn its
 *   width too. Both stand with their bottom `offset` rows below the road's top.
 * - **Sky.** The stage block's first word numbers its ramp, the long at 0x17590 + 4 × it: a row up from the horizon
 *   each, the last above.
 * Each layer is drawn across the width once, a turn, by nearest pixel; the front over the back over the sky.
 */
export function stageBackground(
  main: Uint8Array,
  planes: readonly Uint8Array[],
  number: number,
  width: number,
  height: number,
  horizon: number,
): Uint16Array {
  const place = [...main.subarray(STAGE_TABLE, STAGE_TABLE + 40)].indexOf(number);
  requireInput(place >= 0, '/stage', `Stage 0x${number.toString(16)} is not in the stage table`);
  const ram = stagePalettes(main, place);
  const entry = LAYERS + 12 * main[LAYER_INDICES + place]!;
  const offset = word(main, entry + 10);
  const layers = [
    readLayer(main, long(main, entry + 6), BACK_PAGES, main[entry + 1]!),
    readLayer(main, long(main, entry + 2), FRONT_PAGES, main[entry]!),
  ];
  const ramp = long(main, SKY_RAMPS + 4 * word(main, long(main, long(main, STAGE_BLOCKS + 4 * number))));
  const pixels = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    const sky = paletteRgb555(word(main, ramp + 2 * Math.min(RAMP - 1, Math.max(0, horizon - 1 - y))));
    // The layers' pages' rows: their bottom edge `offset` rows below the horizon.
    const row = y - (horizon + offset) + PAGE_ROWS * TILE;
    for (let x = 0; x < width; x++) {
      let color = sky;
      if (row >= 0 && row < PAGE_ROWS * TILE)
        for (const layer of layers) {
          const w = layerWord(
            planes,
            ram,
            layer,
            Math.floor(((x + 0.5) * layer.pages * PAGE_COLUMNS * TILE) / width),
            row,
          );
          if (w !== null) color = paletteRgb555(w);
        }
      pixels[y * width + x] = color;
    }
  }
  return pixels;
}
