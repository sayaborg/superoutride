/**
 * ENDURO RACER's sprites as its main program and sprite ROMs hold them
 * ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-sprites)): Space Harrier's sprite hardware, each
 * size set's sizes and the rows its largest size draws, and the sprites' palettes.
 */
import { word } from './program-words.js';
import { readColors } from './road-tables.js';
import { SPACE_HARRIER_SPRITES, spritePixels, type SpriteSize } from './sprite-pixels.js';

/** Main CPU: the sprites' palettes, 16 words each. */
const PALETTES = 0x9f08;
const PALETTE = 16;
/** A size set holds five sizes, unscaled first, each about half the one before. */
const SIZES = 5;

/** One size of a set as the program holds it: its rows, words a row, and its first word's bank and offset. */
export interface SizeRecord {
  readonly height: number;
  readonly stride: number;
  readonly bank: number;
  readonly offset: number;
}

/**
 * The size set at `address`: five sizes of 10 bytes, {word height, word words a row, word (height − 1) × words a row,
 * word 0x80 | bank, word offset}.
 */
export function readSizeSet(main: Uint8Array, address: number): SizeRecord[] {
  return Array.from({ length: SIZES }, (_, k) => {
    const a = address + 10 * k;
    const size = {
      height: word(main, a),
      stride: word(main, a + 2),
      bank: word(main, a + 6),
      offset: word(main, a + 8),
    };
    if (word(main, a + 4) !== (size.height - 1) * size.stride || (size.bank & ~15) !== 0x80)
      throw new RangeError(`The size at 0x${a.toString(16)} is not a size of Space Harrier's sprites`);
    return { ...size, bank: size.bank & 15 };
  });
}

/**
 * The size the hardware draws of a set's unscaled size: 8 pixels a word across, and its rows 0 to height − 2 (the
 * program puts its bottom edge height − 1 rows below its top, so its last row is never drawn).
 */
export function drawnSize(main: Uint8Array, address: number): SpriteSize {
  const [unscaled] = readSizeSet(main, address);
  const { height, stride, bank, offset } = unscaled!;
  return { width: 8 * stride, height: height - 1, stride, bank, offset };
}

/** The drawn pixels of the size set at `address`, row-major (`spritePixels` on Space Harrier's hardware). */
export const sizeSetPixels = (main: Uint8Array, words: Uint32Array, address: number) => {
  const size = drawnSize(main, address);
  return { width: size.width, height: size.height, pixels: spritePixels(words, size, SPACE_HARRIER_SPRITES) };
};

/** The colored pixels of a set's unscaled last row, which the hardware never draws. */
export function undrawnPixels(main: Uint8Array, words: Uint32Array, address: number): number {
  const { height, stride, bank, offset } = readSizeSet(main, address)[0]!;
  const last = spritePixels(words, { width: 8 * stride, height, stride, bank, offset }, SPACE_HARRIER_SPRITES);
  return last.subarray((height - 1) * 8 * stride).filter((v) => v > 0).length;
}

/** Palette `palette`: the 16 words at 0x9F08 + 32 × palette, with their RGB555 (pixels 0 and 15 transparent). */
export const readSpritePalette = (main: Uint8Array, palette: number) =>
  readColors(main, PALETTES + 2 * PALETTE * palette, PALETTE);
