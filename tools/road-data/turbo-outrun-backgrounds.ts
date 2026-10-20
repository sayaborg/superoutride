/**
 * TURBO OUTRUN's backgrounds as its main CPU's tables hold them ([Original road data](../../docs/original-road-data.md#turbo-outrun)):
 * each stage's background number, its two layers' tile words, the tile palettes its leg has loaded by that stage, and
 * its two layers and sky ramp as a sky bakes them.
 */
import { paletteRgb555 } from './road-tables.js';
import { TRANSPARENT, type SkyBands, type SkyLayer } from './sky-baking.js';
import { LEG_STAGES } from './turbo-outrun-road.js';

/** A stage's background number: the byte at 0x2ABF8 + 8 × leg + its place in the leg, and the same at 0x1DA52. */
const BACKGROUND_NUMBERS = 0x2abf8;
const BACKGROUND_NUMBERS_AGAIN = 0x1da52;
/** A background's layers: 12 bytes at 0x2AC18 + 12 × number. */
const LAYERS = 0x2ac18;
/** The tile palettes 8 to 127 a leg loads at its start: 8 words at 0x22A56 + 16 × the palette's byte at 0x229DE. */
const TILE_PALETTE_INDICES = 0x229de;
const TILE_PALETTE_COLORS = 0x22a56;
const FIRST_TILE_PALETTE = 8;
const TILE_PALETTE_COUNT = 120;
const TILE_PALETTE_WORDS = 8;
/** A layer page: 64 × 32 tiles; the front layer has four pages, the back three. A row not written is tile word 0x0020. */
const PAGE_COLUMNS = 64;
const PAGE_ROWS = 32;
const FRONT_PAGES = 4;
const BACK_PAGES = 3;
const UNWRITTEN = 0x0020;

const word = (p: Uint8Array, a: number) => (p[a]! << 8) | p[a + 1]!;
const long = (p: Uint8Array, a: number) => word(p, a) * 0x10000 + word(p, a + 2);

/**
 * Each stage's palette patch, which the main CPU's encrypted code applies as the stage's background is loaded: its
 * {source, first palette, count}, the 8 words at `source` copied to `count` palettes from `first`. The stage's
 * description gives them; a stage's palettes are its leg's start's with the patches of the leg's stages to it applied
 * in turn.
 */
export const PALETTE_PATCHES: readonly (readonly (readonly [number, number, number])[])[] = Object.freeze([
  [
    [0x1dd62, 49, 1],
    [0x1dcc2, 47, 1],
    [0x1dcd2, 30, 1],
  ],
  [[0x1dc72, 67, 1]],
  [
    [0x1dbb2, 24, 3],
    [0x1dbf2, 53, 2],
    [0x1dc02, 8, 2],
    [0x1dc22, 27, 1],
  ],
  [
    [0x1da82, 10, 2],
    [0x1db62, 49, 1],
  ],
  [
    [0x1dd02, 30, 1],
    [0x1dd12, 47, 1],
    [0x1dd22, 59, 1],
    [0x1dd52, 60, 1],
  ],
  [],
  [
    [0x1db22, 48, 1],
    [0x1db32, 53, 2],
    [0x1db42, 8, 2],
  ],
  [
    [0x1da72, 59, 1],
    [0x1dba2, 16, 2],
  ],
  [
    [0x1dbc2, 35, 1],
    [0x1dbc2, 40, 1],
    [0x1dcb2, 31, 1],
  ],
  [
    [0x1dae2, 41, 2],
    [0x1db92, 55, 3],
  ],
  [
    [0x1daf2, 49, 2],
    [0x1db02, 41, 2],
  ],
  [[0x1dd32, 16, 2]],
  [[0x1dc42, 41, 2]],
  [
    [0x1daa2, 43, 1],
    [0x1daa2, 44, 1],
    [0x1dab2, 48, 1],
    [0x1dac2, 15, 1],
  ],
  [
    [0x1db12, 19, 1],
    [0x1db52, 48, 1],
  ],
  [
    [0x1db72, 30, 1],
    [0x1db82, 47, 1],
    [0x1dc92, 60, 1],
    [0x1dd42, 59, 1],
  ],
]);

/** Stage `stage`'s background number, checked against its copy at 0x1DA52. */
export function backgroundNumber(main: Uint8Array, stage: number): number {
  const index = 8 * Math.floor(stage / LEG_STAGES) + (stage % LEG_STAGES);
  const number = main[BACKGROUND_NUMBERS + index]!;
  if (main[BACKGROUND_NUMBERS_AGAIN + index] !== number)
    throw new RangeError(`Stage ${stage}'s background numbers at 0x2ABF8 and 0x1DA52 differ`);
  return number;
}

/**
 * A layer's tile words from its data at `address`: page by page, `rows` rows from the page's bottom (row 31) up, each
 * row's 64 tile words a word each, or 0 then {word tile word, word count − 1} for a run; rows not written hold 0x0020.
 * The words are page after page, each page's rows from the top, a row's columns from the left.
 */
function readLayer(main: Uint8Array, address: number, pages: number, rows: number): Uint16Array {
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
          if (column + count > PAGE_COLUMNS)
            throw new RangeError(`A layer's run at 0x${a.toString(16)} passes its row`);
          for (let i = 0; i < count; i++) tiles[at + column++] = value;
        }
      }
    }
  return tiles;
}

/**
 * Background `number`'s layers, the entry at 0x2AC18 + 12 × number: {u8 front rows, u8 back rows, long front data, long
 * back data, word offset}, the front four pages and the back three, both standing `offset` rows below the road's top.
 */
export function readBackground(main: Uint8Array, number: number) {
  const entry = LAYERS + 12 * number;
  const front = { rows: main[entry]!, address: long(main, entry + 2) };
  const back = { rows: main[entry + 1]!, address: long(main, entry + 6) };
  return {
    entry,
    offset: word(main, entry + 10),
    front: { ...front, pages: FRONT_PAGES, tiles: readLayer(main, front.address, FRONT_PAGES, front.rows) },
    back: { ...back, pages: BACK_PAGES, tiles: readLayer(main, back.address, BACK_PAGES, back.rows) },
  };
}

/** Stage `stage`'s tile palettes 8 to 127, 8 words each: its leg's start's, then each patch of its leg to it in turn. */
export function stageTilePalettes(main: Uint8Array, stage: number): Uint16Array {
  const words = new Uint16Array(TILE_PALETTE_COUNT * TILE_PALETTE_WORDS);
  for (let p = 0; p < TILE_PALETTE_COUNT; p++)
    for (let c = 0; c < TILE_PALETTE_WORDS; c++)
      words[p * TILE_PALETTE_WORDS + c] = word(
        main,
        TILE_PALETTE_COLORS + 16 * main[TILE_PALETTE_INDICES + p]! + 2 * c,
      );
  for (let s = stage - (stage % LEG_STAGES); s <= stage; s++)
    for (const [source, first, count] of PALETTE_PATCHES[s]!)
      for (let q = 0; q < count; q++)
        for (let c = 0; c < TILE_PALETTE_WORDS; c++)
          words[(first + q - FIRST_TILE_PALETTE) * TILE_PALETTE_WORDS + c] = word(main, source + 2 * c);
  return words;
}

/** A tile: 8 × 8 pixels, a byte a row in each plane, bit 7 the leftmost; tile 64p to 64p + 63 in palette p. */
const TILE = 8;
const TILES_A_PALETTE = 64;
/** The pages left to right: the last page leftmost. */
const PAGE_ORDER = { front: [3, 2, 1, 0], back: [2, 1, 0] } as const;
/** At heading 0 the screen's middle shows the front layer's pixel 1888 and the back's 1376: the front's f over the back's 0.75f − 40. */
const OVERLAP = -40;
/** The ramp: two rows up from the horizon a word, word 0 the lowest, word 63 every row above; word 0 below the horizon. */
const RAMP_ROWS = 2;

/**
 * Stage `stage` as a sky bakes it ([Sky baking](../../docs/original-road-data.md#sky-baking)), from the tile ROMs'
 * `planes` and its sky ramp `ramp` (64 RGB555 words): its background's front layer (four pages, 2048 pixels) and back
 * layer (three, 1536), the last page leftmost, a tile word's tile its bits 0–12, a pixel 0 transparent and any other
 * its palette's word (the stage's palettes, `stageTilePalettes`), each layer's bottom its entry's offset rows below the
 * horizon (its last row the offset's − 1st below it); the ramp word 0 up to word 63, two rows each, and word 0 below.
 */
export function stageBands(
  main: Uint8Array,
  planes: readonly Uint8Array[],
  stage: number,
  ramp: readonly number[],
): SkyBands {
  const number = backgroundNumber(main, stage);
  const background = readBackground(main, number);
  const palettes = stageTilePalettes(main, stage);
  const layer = (tiles: Uint16Array, order: readonly number[]): SkyLayer => {
    const [width, height] = [order.length * PAGE_COLUMNS * TILE, PAGE_ROWS * TILE];
    const pixels = new Int32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const page = order[Math.floor(x / (PAGE_COLUMNS * TILE))]!;
        const tileWord = tiles[(page * PAGE_ROWS + (y >> 3)) * PAGE_COLUMNS + ((x >> 3) % PAGE_COLUMNS)]!;
        const [tile, u, v] = [tileWord & 0x1fff, x & 7, y & 7];
        const value = planes.reduce((n, plane, p) => n | (((plane[tile * TILE + v]! >> (7 - u)) & 1) << p), 0);
        const palette = Math.floor(tile / TILES_A_PALETTE) - FIRST_TILE_PALETTE;
        if (value && palette < 0)
          throw new Error(
            `Background ${number}'s tile word 0x${tileWord.toString(16)} uses a palette it does not load`,
          );
        pixels[y * width + x] = value ? paletteRgb555(palettes[palette * TILE_PALETTE_WORDS + value]!) : TRANSPARENT;
      }
    return { width, pixels, bottom: background.offset - 1 };
  };
  return {
    back: layer(background.back.tiles, PAGE_ORDER.back),
    front: layer(background.front.tiles, PAGE_ORDER.front),
    overlap: OVERLAP,
    ramp: {
      rows: Array.from({ length: ramp.length * RAMP_ROWS }, (_, i) => ramp[Math.floor(i / RAMP_ROWS)]!),
      below: ramp[0]!,
    },
  };
}
