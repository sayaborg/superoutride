/**
 * TURBO OUTRUN's backgrounds as its main CPU's tables hold them ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)):
 * each stage's background number, its two layers' tile words, the tile palettes its leg has loaded by that stage, and
 * its two layers and sky ramp as a sky bakes them.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { long, word } from '../sega-16/program-words.js';
import { type SkyBands } from '../shared/sky-baking.js';
import {
  BACK_PAGES,
  BACKGROUND_SCROLL,
  bakeLayer,
  FRONT_PAGES,
  PALETTE_WORDS as TILE_PALETTE_WORDS,
  rampRows,
  readLayer,
} from '../out-run-hardware/backgrounds.js';
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
    throw romDiffers(`Stage ${stage}'s background numbers at 0x2ABF8 and 0x1DA52 differ`);
  return number;
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

/**
 * Stage `stage` as a sky bakes it ([Sky baking](../../../docs/original-road-data.md#sky-baking)), from the tile ROMs'
 * `planes` and its sky ramp `ramp` (64 RGB555 words): its background's front layer and back layer as the board lays
 * them (`bakeLayer`), a pixel's word its palette's (the stage's palettes, `stageTilePalettes`), each layer's bottom its entry's offset rows below the
 * horizon (its last row the offset's − 1st below it); its ramp as the board's road code lays it (`rampRows`).
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
  const layer = (tiles: Uint16Array, pages: number) =>
    bakeLayer(planes, tiles, pages, background.offset - 1, (p, pixel) => {
      if (p < FIRST_TILE_PALETTE)
        throw romDiffers(`Background ${number} uses tile palette ${p}, which it does not load`);
      return palettes[(p - FIRST_TILE_PALETTE) * TILE_PALETTE_WORDS + pixel]!;
    });
  return {
    back: layer(background.back.tiles, BACK_PAGES),
    front: layer(background.front.tiles, FRONT_PAGES),
    overlap: BACKGROUND_SCROLL.overlap,
    ramp: rampRows(ramp),
  };
}
