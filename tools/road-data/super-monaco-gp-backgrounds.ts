/**
 * SUPER MONACO GP's background as its main program builds it
 * ([Original road data](../../docs/original-road-data.md#super-monaco-gps-background)): the tile pages drawn from their
 * run-length records, the tiles' palettes and the road layer's sky and ground colors, of the fine set.
 */
import { u8, word } from './program-words.js';
import { paletteRgb555 } from './road-tables.js';

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
 * The tiles' palettes, colors 1–7 of 7 words each: palettes 8–127 from 0x432E at power on, and at a race's start the
 * fine set's palettes 8–42 again from 0x432E and 50–58 from 0x457A.
 */
const PALETTE_SOURCES = Object.freeze([
  { address: 0x432e, from: 8, to: 127 },
  { address: 0x457a, from: 50, to: 58 },
] as const);
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
    if (runs > MOST_RUNS) throw new RangeError(`The page record at 0x${record.toString(16)} is not a record`);
    let a = record + 4;
    for (let r = 0; r < runs; r++) {
      let at = (u8(main, a) << 8) | u8(main, a + 1);
      a += 2;
      for (let count = u8(main, a); count; count = u8(main, a)) {
        const high = u8(main, a + 1);
        for (let i = 0; i < count; i++, at += 2) {
          if (at >= PAGES * PAGE_BYTES || at % 2) throw new RangeError(`A page record writes outside the tile RAM`);
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
  for (const { address, from, to } of PALETTE_SOURCES)
    for (let p = from; p <= to; p++)
      palettes.set(p, [
        0,
        ...Array.from({ length: PALETTE_COLORS }, (_, k) =>
          paletteRgb555(word(main, address + 2 * (PALETTE_COLORS * (p - from) + k))),
        ),
      ]);
  return palettes;
}

/** The road layer's colors of the fine set: color c the word at 0x63E2 + 2c, with its RGB555. */
export function readRoadLayerColors(main: Uint8Array) {
  const words = Array.from({ length: ROAD_LAYER_COUNT }, (_, c) => word(main, ROAD_LAYER_COLORS + 2 * c));
  return { address: ROAD_LAYER_COLORS, words, rgb555: words.map(paletteRgb555) };
}
