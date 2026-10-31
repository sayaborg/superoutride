/**
 * TURBO OUTRUN's sprites as its main program and sprite ROMs hold them ([TURBO OUTRUN road data](../../../docs/turbo-outrun-road-data.md)):
 * its kinds' records, their routines' size lists, the shadow's size and the sprite palettes.
 */
import { long, s8, u8, word } from '../sega-16/program-words.js';
import { readColors, type Colors } from '../out-run-hardware/road-tables.js';

/** Main CPU: the kinds' records, the sprite palettes and the shadow's size list. */
const KINDS = 0x28038;
const PALETTES = 0x2470;
const SHADOW_SIZES = 0x2667a;
/** A kind's record is 16 bytes; a sprite palette 14 words (pixels 1 to 14). */
const KIND_BYTES = 16;
const PALETTE_WORDS = 14;

/**
 * Kind `kind`'s record, 16 bytes at 0x28038 + 16 × kind: {long size list, s8 hit left, s8 hit right, u8 flags (bit 0
 * half scale, bit 1 casts the shadow picture, bit 2 its pixel 10 shades), u8 routine, word palette, word collision
 * class (0xFFFF none), two words}.
 */
export function readKind(main: Uint8Array, kind: number) {
  const a = KINDS + KIND_BYTES * kind;
  return {
    address: a,
    sizes: long(main, a),
    hit: [s8(main, a + 4), s8(main, a + 5)] as const,
    flags: u8(main, a + 6),
    routine: u8(main, a + 7),
    palette: word(main, a + 8),
    collision: word(main, a + 10),
    words: [word(main, a + 12), word(main, a + 14)] as const,
  };
}

/** How many sizes a kind's routine lists: strip A's (0x0C–0x14) and the far strip's (0x24) 9, strip B's (0x18–0x20) 16. */
export function sizeCount(routine: number): number {
  if (routine >= 0x18 && routine <= 0x20) return 16;
  if ((routine >= 0x0c && routine <= 0x14) || routine === 0x24) return 9;
  return 5;
}

/** A size: {word width, word height, word words a row, u8, u8 bank, word first word in the bank}. */
export interface TurboOutrunSize {
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly flags: number;
  readonly bank: number;
  readonly offset: number;
}
/** `count` sizes of 10 bytes from `address`. */
export const readSizeList = (main: Uint8Array, address: number, count: number): TurboOutrunSize[] =>
  Array.from({ length: count }, (_, k) => {
    const a = address + 10 * k;
    return {
      width: word(main, a),
      height: word(main, a + 2),
      stride: word(main, a + 4),
      flags: u8(main, a + 6),
      bank: u8(main, a + 7),
      offset: word(main, a + 8),
    };
  });

/** The shadow picture's largest size, the first of its size list at 0x2667A, which shadowed kinds cast on the road. */
export const readShadowSize = (main: Uint8Array): TurboOutrunSize => readSizeList(main, SHADOW_SIZES, 1)[0]!;

/** Sprite palette `palette`: the 14 palette words at 0x2470 + 28 × palette, pixels 1 to 14 (0 and 15 transparent). */
export const readSpritePalette = (main: Uint8Array, palette: number): Colors =>
  readColors(main, PALETTES + 2 * PALETTE_WORDS * palette, PALETTE_WORDS);
