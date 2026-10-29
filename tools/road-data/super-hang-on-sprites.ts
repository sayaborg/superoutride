/**
 * SUPER HANG-ON's sprites as its main program and sprite ROMs hold them
 * ([SUPER HANG-ON road data](../../docs/super-hang-on-road-data.md)): each sprite's sizes, pixels and palettes, the
 * hit widths of the scenery, the gates' parts and the rivals' grid at the start.
 */
import { romDiffers } from './conversion-errors.js';
import { readColors } from './road-tables.js';
import { instruction, long, sword, u8, word } from './program-words.js';

/** Main CPU: the sprites' size lists, their hit widths, the palettes, the gates' templates and the rivals' grid. */
const SPRITES = 0x11a6a;
const HIT_WIDTHS = 0x11bd2;
const PALETTES = 0xd7f0;
const GATES = 0x7274;
const GATE_PARTS = 6;
const GATE_TEMPLATE = 0x30;
const GRID = 0x86c0;
const GRID_RIVALS = 7;
/** The sprites the size list table names: the hit widths' table follows it. */
export const SPRITE_COUNT = (HIT_WIDTHS - SPRITES) / 4;
/** A size list holds five sizes, the largest first, each half the one before. */
const SIZES = 5;
/** A bank of the sprite ROMs' words. */
const BANK = 0x10000;

/**
 * How the program draws an object across and up by its row (0 to 191 down the road, the bike's the last): its x at x ×
 * row / 224 pixels (`divs.w #$E0` at 0x7262), a gate part's x at x × row / 191 + 0x160 (`divs.w #$BF` at 0x74F2) and
 * its lift at lift × row / 192 (`divu.w #$C0` at 0x7448). A gate part's x is so in pixels on the bike's row, where an
 * object's largest size is drawn 1:1: road units a pixel of it spans (`pixelUnits`, a gate part's x a pixel), and road
 * units a gate part's lift (`gateLift`).
 */
export function drawScales(main: Uint8Array) {
  const [line] = instruction(main, 0x7262, [0x83fc, null], "an object's x by its row");
  const [nearest] = instruction(main, 0x74f2, [0x83fc, null], "a gate part's x by its row");
  const [lift] = instruction(main, 0x7448, [0x80fc, null], "a gate part's lift by its row");
  return {
    /** An object's x is drawn at x × row / `rowUnits` pixels. */
    rowUnits: line!,
    pixelUnits: line! / nearest!,
    gateLift: line! / lift!,
  };
}

/** One size of a sprite: its height, words a row, and its first word's bank and offset. */
export interface SpriteSize {
  readonly height: number;
  readonly stride: number;
  readonly bank: number;
  readonly offset: number;
}

/**
 * The size list at `address`: five sizes of 10 bytes, {word height, word words a row, word (height − 1) × words a row,
 * word bank (its low four bits), word offset}.
 */
export function sizeList(main: Uint8Array, address: number): SpriteSize[] {
  return Array.from({ length: SIZES }, (_, k) => {
    const a = address + 10 * k;
    const size = {
      height: word(main, a),
      stride: word(main, a + 2),
      bank: word(main, a + 6) & 15,
      offset: word(main, a + 8),
    };
    if (size.height && word(main, a + 4) !== (size.height - 1) * size.stride)
      throw romDiffers(`The size at 0x${a.toString(16)} does not span its rows`);
    return size;
  });
}

/** Sprite `index`'s size list: the long at 0x11A6A + 4 × index. */
export const spriteList = (main: Uint8Array, index: number) => long(main, SPRITES + 4 * index);

/** Sprite `index`'s hit width, pixels either side of the bike at the bike's row: the word at 0x11BD2 + 2 × index. */
export const hitWidth = (main: Uint8Array, index: number) => word(main, HIT_WIDTHS + 2 * index);

/**
 * A size's pixels, row-major, `4 × stride − 1` wide: each word four 4-bit pixels, the most significant first, `stride`
 * words a row from its bank's offset, the row's last pixel 15, its end. 0 and 15 are transparent (0 here).
 */
export function spritePixels(words: Uint16Array, size: SpriteSize): { width: number; pixels: Uint8Array } {
  const width = 4 * size.stride - 1;
  const pixels = new Uint8Array(width * size.height);
  for (let y = 0; y < size.height; y++) {
    const end = words[size.bank * BANK + ((size.offset + (y + 1) * size.stride - 1) & 0xffff)]!;
    if ((end & 15) !== 15) throw romDiffers(`A row of the sprite at bank ${size.bank}, ${size.offset} has no end`);
    for (let x = 0; x < width; x++) {
      const w = words[size.bank * BANK + ((size.offset + y * size.stride + (x >> 2)) & 0xffff)]!;
      const v = (w >> (12 - 4 * (x & 3))) & 15;
      pixels[y * width + x] = v === 15 ? 0 : v;
    }
  }
  return { width, pixels };
}

/** Palette `index`'s 16 colors as RGB555: the words at 0xD7F0 + 32 × index, slot 0 transparent. */
export const spritePalette = (main: Uint8Array, index: number) => readColors(main, PALETTES + 32 * index, 16).rgb555;

/**
 * A gate's part: its sprite's size list, palette, whether mirrored, its depth as it appears, and its x and lift (pixels
 * at the bike's row, the gate's own scale: x × line / 191, lift × line / 192).
 */
export interface GatePart {
  readonly sprite: number;
  readonly palette: number;
  readonly mirrored: boolean;
  readonly depth: number;
  readonly x: number;
  readonly lift: number;
}

/**
 * The gates' six parts, objects 27 to 32: their templates at 0x7274, 0x30 bytes each, {u8 flags (bit 0 mirrors) … +0x16
 * u8 palette … +0x1A long size list … +0x26 word depth, +0x28 signed word x, +0x2C signed word lift}: the left and right
 * legs, the signal, the left and right corners and the banner.
 */
export function readGateParts(main: Uint8Array): GatePart[] {
  return Array.from({ length: GATE_PARTS }, (_, k) => {
    const a = GATES + GATE_TEMPLATE * k;
    return {
      sprite: long(main, a + 0x1a),
      palette: u8(main, a + 0x16),
      mirrored: (u8(main, a) & 1) !== 0,
      depth: word(main, a + 0x26),
      x: sword(main, a + 0x28),
      lift: sword(main, a + 0x2c),
    };
  });
}

/** The rivals' places at GO on course `course`: 7 × {word depth, signed word x} at 0x86C0 + 28 × course. */
export const readGrid = (main: Uint8Array, course: number) =>
  Array.from({ length: GRID_RIVALS }, (_, k) => ({
    depth: word(main, GRID + 28 * course + 4 * k),
    x: sword(main, GRID + 28 * course + 4 * k + 2),
  }));
