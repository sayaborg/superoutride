/**
 * OUTRUN's backgrounds as its program places them ([OUTRUN road data](../../../docs/outrun-road-data.md#backgrounds)):
 * each stage's two tile layers, front and back, and its sky's ramp, which the shared sky baking draws as the stage's
 * sky.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { long, word } from '../sega-16/program-words.js';
import { paletteRgb555 } from '../out-run-hardware/road-tables.js';
import { type SkyBands } from '../shared/sky-baking.js';
import type { Stage } from './outrun-road.js';
import {
  BACK_PAGES,
  BACKGROUND_SCROLL,
  bakeLayer,
  FRONT_PAGES,
  PALETTE_WORDS as TILE_PALETTE,
  RAMP_WORDS,
  rampRows,
  readLayer,
} from '../out-run-hardware/backgrounds.js';

/** The main CPU's tables: the stage table, the tile palettes and their stage patches, the layers, the skies. */
const STAGE_TABLE = 0xe49c;
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
/** A text palette is 8 words as a tile palette is. The base fills palettes 0–7, then 120 from the index table. */
const TEXT_PALETTE_COUNT = 8;
const TILE_PALETTE_COUNT = 0x78;

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
    } else throw romDiffers(`Stage palette patch: unread instruction 0x${op.toString(16)} at 0x${pc.toString(16)}`);
  }
}

/**
 * What stage `number`'s background gives its sky ([sky baking](../../../docs/original-road-data.md#sky-baking)), as its
 * program places it:
 * - **Layers.** The byte at 0x17E84 + its place in the stage table numbers its entry at 0x17EAC, 12 bytes: {u8 front
 *   rows, u8 back rows, long front data, long back data, word offset}. The front layer is four pages (2048 px) and
 *   turns with the road's heading, a full turn a width; the back is three (1536 px), turning 3/4 as fast, a full turn
 *   its width too, so the front's pixel f stands over the back's 3/4 f. Both stand with their bottom `offset` rows
 *   below the road's top, laid as the hardware lays its layers (`readLayer`, `bakeLayer`).
 * - **Sky.** The stage's sky word (`readStage`) numbers its ramp, the long at 0x17590 + 4 × it: 64 colors, laid as the hardware's
 *   road code lays them (`rampRows`).
 */
export function stageSky(
  main: Uint8Array,
  planes: readonly Uint8Array[],
  { number, sky }: Pick<Stage, 'number' | 'sky'>,
): SkyBands {
  const place = [...main.subarray(STAGE_TABLE, STAGE_TABLE + 40)].indexOf(number);
  if (place < 0) throw romDiffers(`Stage 0x${number.toString(16)} is not in the stage table`);
  const ram = stagePalettes(main, place);
  const entry = LAYERS + 12 * main[LAYER_INDICES + place]!;
  // The layers' bottom row, `offset` rows below the road's top: 0 is the first row below it.
  const bottom = word(main, entry + 10) - 1;
  const layer = (address: number, pages: number, rows: number) =>
    bakeLayer(
      planes,
      readLayer(main, address, pages, rows),
      pages,
      bottom,
      (p, pixel) => ram[p * TILE_PALETTE + pixel]!,
    );
  const ramp = long(main, SKY_RAMPS + 4 * sky);

  return {
    back: layer(long(main, entry + 6), BACK_PAGES, main[entry + 1]!),
    front: layer(long(main, entry + 2), FRONT_PAGES, main[entry]!),
    overlap: BACKGROUND_SCROLL.overlap,
    ramp: rampRows(Array.from({ length: RAMP_WORDS }, (_, k) => paletteRgb555(word(main, ramp + 2 * k)))),
  };
}
