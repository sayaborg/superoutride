/**
 * RACING HERO's sprites as its main program holds them
 * ([Original road data](../../docs/original-road-data.md#racing-heros-sprites)): the type table, each type's
 * definition with its parts by size, the picture records and the sprites' palettes. The pixels are OUTRUN's, read by
 * `sprite-pixels`.
 */
import { long, sword, word } from './program-words.js';
import type { SpriteSize } from './sprite-pixels.js';

/** The type table: 1024 longs from 0x50000, type t's definition the long at 0x50000 + t. */
export const TYPE_TABLE = 0x50000;
export const TYPE_COUNT = 1024;
/** The definition every unused type points to: no picture is drawn from it. */
export const EMPTY_DEFINITION = 0x51000;

/** The definition of type `t` (a byte offset into the type table, a multiple of 4). */
export const typeDefinition = (main: Uint8Array, t: number) => long(main, TYPE_TABLE + t);

/** A part of a size: its palette, its flags (bit 5 mirrors it), its picture record and its place from the point. */
export interface Part {
  readonly palette: number;
  readonly flags: number;
  readonly picture: number;
  readonly x: number;
  readonly y: number;
}

/** A part's word that ends a size's list early: bit 15 of its palette word. */
const PART_END = 0x8000;
const PART = 12;

/**
 * Type `t`'s definition: word its routine, word its parts' count, word its last size's byte offset (sizes = it / 4 + 1),
 * then a long a size, each pointing to up to that many parts of 12 bytes {word palette, word flags, long picture,
 * signed word x, signed word y}, a palette word with bit 15 ending a size's list early.
 */
export function readDefinition(main: Uint8Array, t: number) {
  const address = typeDefinition(main, t);
  const routine = word(main, address);
  const count = word(main, address + 2);
  const sizes = word(main, address + 4) / 4 + 1;
  if (!Number.isInteger(sizes)) throw new RangeError(`Type 0x${t.toString(16)}'s definition is not RACING HERO's`);
  const parts = Array.from({ length: sizes }, (_, l) => {
    const list: Part[] = [];
    for (let a = long(main, address + 6 + 4 * l); list.length < count; a += PART) {
      const palette = word(main, a);
      if (palette & PART_END) break;
      list.push({
        palette,
        flags: word(main, a + 2),
        picture: long(main, a + 4),
        x: sword(main, a + 8),
        y: sword(main, a + 10),
      });
    }
    return list;
  });
  return { address, routine, count, parts };
}

/** A part's flag that mirrors it. */
export const PART_MIRRORED = 0x20;

/**
 * A picture record (16 bytes): word width in pixels, word height, word 16-bit words a row << 8, four words the
 * top-left, bottom-left, top-right and bottom-right 32-bit words in its bank (the other three for the flips), word its
 * bank << 9.
 */
export function readPicture(main: Uint8Array, address: number) {
  return {
    width: word(main, address),
    height: word(main, address + 2),
    row: word(main, address + 4),
    corners: [0, 1, 2, 3].map((k) => word(main, address + 6 + 2 * k)),
    bank: word(main, address + 14),
  };
}

/**
 * A picture's size as `sprite-pixels` reads it: its rows read on from its top-left word, two 16-bit words a 32-bit
 * one, its record checked (a whole 32-bit word a row, its width four pixels a 16-bit word, its corners its rows').
 */
export function pictureSize(main: Uint8Array, address: number): SpriteSize {
  const { width, height, row, corners, bank } = readPicture(main, address);
  const halves = row >> 8,
    stride = halves / 2;
  const [topLeft, bottomLeft, topRight, bottomRight] = corners as [number, number, number, number];
  if (
    (row & 0xff) !== 0 ||
    (bank & 0x1ff) !== 0 ||
    halves % 2 !== 0 ||
    width !== 4 * halves ||
    bottomLeft !== topLeft + stride * (height - 1) ||
    topRight !== topLeft + stride - 1 ||
    bottomRight !== bottomLeft + stride - 1
  )
    throw new RangeError(`The picture record at 0x${address.toString(16)} is not RACING HERO's`);
  return { width, height, stride, bank: bank >> 9, offset: topLeft };
}

/** The sprites' palettes: 16 words each, pixels 0–15. */
const PALETTE_WORDS = 16;
export const PALETTE_COUNT = 0x100;
/** Palettes 0x80–0xFF change with the country: set A's continue 0x00–0x7F's, set B's (the evening's) lie apart. */
export const PALETTE_SETS = Object.freeze({ A: 0x3a808, B: 0x3e72e - 2 * PALETTE_WORDS * 0x80 } as const);
/** The first palette a country's set changes. */
export const COUNTRY_PALETTES = 0x80;

/** Palette `p` of set `set` (B's own for 0x80–0xFF alone): its 16 words. */
export function readSpritePalette(main: Uint8Array, p: number, set: keyof typeof PALETTE_SETS = 'A') {
  const address = (p >= COUNTRY_PALETTES ? PALETTE_SETS[set] : PALETTE_SETS.A) + 2 * PALETTE_WORDS * p;
  return { address, words: Array.from({ length: PALETTE_WORDS }, (_, k) => word(main, address + 2 * k)) };
}
