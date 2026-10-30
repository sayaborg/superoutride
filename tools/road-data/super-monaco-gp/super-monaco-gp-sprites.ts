/**
 * SUPER MONACO GP's sprites as its programs and sprite ROMs hold them
 * ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-sprites)): the X board's frame tables and
 * size records, the view tables of the objects that change with the angle, and the sprites' palettes. The pixels are
 * OUTRUN's.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { sword, word } from '../sega-16/program-words.js';
import { readColors } from '../out-run-board/road-tables.js';
import { OUTRUN_SPRITES, spritePixels, type SpriteSize } from '../sega-16/sprite-pixels.js';

/** Main CPU: the sprites' palettes, 14 words each (pixels 1–14). */
const PALETTES = 0x49be;
const PALETTE = 14;
export const PALETTE_COUNT = 0xef;
/** A frame table holds five sizes, v0 the largest, each about half the one before. */
const SIZES = 5;
/** A view table: 32 frame tables, one a view. */
export const VIEWS = 32;

/** One size of a frame table: its bank and first word, and its size record's place and contents. */
export interface FrameSize {
  readonly bank: number;
  readonly first: number;
  readonly record: number;
  readonly words: number;
  readonly height: number;
  readonly stride: number;
}

/**
 * The frame table at `address` on the main CPU: five entries of 6 bytes {word bank << 9, word first word, signed word
 * from the word after it to its size record}; a size record {word words across << 8, word height << 6, word words a
 * row, word words a row × (height − 1)}. Read as they are: only v0 is drawn, and some smaller sizes' records are not
 * records (0x04FE's v3).
 */
export function readFrameTable(main: Uint8Array, address: number): FrameSize[] {
  return Array.from({ length: SIZES }, (_, k) => {
    const a = address + 6 * k;
    const record = a + 4 + sword(main, a + 4);
    return {
      bank: word(main, a) >> 9,
      first: word(main, a + 2),
      record,
      words: word(main, record) >> 8,
      height: word(main, record + 2) >> 6,
      stride: word(main, record + 4),
    };
  });
}

/** A frame table's largest size, v0, as `sprite-pixels` reads it, 8 pixels a word across, its record checked. */
export function largestSize(main: Uint8Array, address: number): SpriteSize {
  const [v0] = readFrameTable(main, address);
  const { bank, first, record, words, height, stride } = v0!;
  if (
    (word(main, address) & 0x1ff) !== 0 ||
    (word(main, record) & 0xff) !== 0 ||
    (word(main, record + 2) & 0x3f) !== 0 ||
    word(main, record + 6) !== (stride * (height - 1)) % 0x10000
  )
    throw romDiffers(`The frame table at 0x${address.toString(16)} is not the X board's`);
  return { width: 8 * words, height, stride, bank, offset: first };
}

/** The largest size's pixels, row-major, read as OUTRUN's are. */
export const largestPixels = (main: Uint8Array, words: Uint32Array, address: number) => {
  const size = largestSize(main, address);
  return { width: size.width, height: size.height, pixels: spritePixels(words, size, OUTRUN_SPRITES) };
};

/**
 * The colored pixels past a row's end mark (a word whose bits 4–7 are 15) within the size record's width: the hardware
 * ends a row there and `sprite-pixels` reads to it, while the record gives the width, so none may lie beyond.
 */
export function pixelsPastEnd(words: Uint32Array, size: SpriteSize): number {
  let past = 0;
  for (let y = 0; y < size.height; y++)
    for (let w = 0, ended = false; w < size.width / 8; w++) {
      const value = words[size.bank * 0x10000 + ((size.offset + y * size.stride + w) & 0xffff)]!;
      if (ended)
        for (let p = 0; p < 8; p++) {
          const pixel = (value >>> (28 - 4 * p)) & 15;
          if (pixel !== 0 && pixel !== 15) past++;
        }
      if (((value >>> 4) & 15) === 15) ended = true;
    }
  return past;
}

/** A view table on the sub CPU: 32 words, view i's frame table on the main CPU. */
export const readViewTable = (sub: Uint8Array, address: number): number[] =>
  Array.from({ length: VIEWS }, (_, i) => word(sub, address + 2 * i));

/** Palette `palette`: the 14 words at 0x49BE + 28 × palette, pixels 1–14, with their RGB555. */
export const readSpritePalette = (main: Uint8Array, palette: number) =>
  readColors(main, PALETTES + 2 * PALETTE * palette, PALETTE);
