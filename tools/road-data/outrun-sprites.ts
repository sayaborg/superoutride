/**
 * OUTRUN's sprites as its programs and sprite ROMs hold them ([Original road data](../../docs/original-road-data.md#sprites)):
 * the sprite ROMs' 32-bit words, each sprite's sizes, its pixels and palettes, the hit extents of its scenery, and the
 * objects standing at a stage's start.
 */
import { requireInput } from '../course/authoring-io.js';
import { paletteRgb555 } from './outrun-road.js';
import type { ZipFile } from './zip.js';

/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the most significant first. */
export const OUTRUN_SPRITE_ROMS = Object.freeze([
  [
    { name: 'mpr-10371.9', crc: 0x7cc86208 },
    { name: 'mpr-10373.10', crc: 0xb0d26ac9 },
    { name: 'mpr-10375.11', crc: 0x59b60bd7 },
    { name: 'mpr-10377.12', crc: 0x17a1b04a },
  ],
  [
    { name: 'mpr-10372.13', crc: 0xb557078c },
    { name: 'mpr-10374.14', crc: 0x8051e517 },
    { name: 'mpr-10376.15', crc: 0xf3b8f318 },
    { name: 'mpr-10378.16', crc: 0xa1062984 },
  ],
] as const);
const SPRITE_ROM_SIZE = 0x20000;

/** The main CPU's tables: sprites' size lists, palettes, hit extents, the shadow and the start's objects. */
const SPRITES = 0x11ed2;
const PALETTES = 0x14ed8;
const EXTENTS = 0x1212a;
const SHADOW = 0xff56;
const START_OBJECTS = 0x2b6e;
/** A sprite lists five sizes, the largest first. */
const SIZES = 5;

/** The sprite ROMs' words: a set's ROM `k` gives byte `k` of each word, set 1's words after set 0's. */
export function assembleSprites(files: ReadonlyMap<string, ZipFile>): Uint32Array {
  const words = new Uint32Array(OUTRUN_SPRITE_ROMS.length * SPRITE_ROM_SIZE);
  OUTRUN_SPRITE_ROMS.forEach((set, s) => {
    const data = set.map(({ name, crc }) => {
      const file = files.get(name);
      requireInput(file, `/rom/${name}`, `The ROM set has no ${name}`);
      requireInput(
        file.data.length === SPRITE_ROM_SIZE && file.crc === crc,
        `/rom/${name}`,
        `${name} is not MAME outrun's sprite ROM of CRC ${crc.toString(16).padStart(8, '0')}`,
      );
      return file.data;
    });
    for (let i = 0; i < SPRITE_ROM_SIZE; i++)
      words[s * SPRITE_ROM_SIZE + i] =
        ((data[0]![i]! << 24) | (data[1]![i]! << 16) | (data[2]![i]! << 8) | data[3]![i]!) >>> 0;
  });
  return words;
}

const word = (p: Uint8Array, a: number) => (p[a]! << 8) | p[a + 1]!;
const sword = (p: Uint8Array, a: number) => (word(p, a) << 16) >> 16;
const long = (p: Uint8Array, a: number) => ((word(p, a) << 16) | word(p, a + 2)) >>> 0;

/** One size of a sprite: its width and height in pixels, words a row, and its first word: bank and offset. */
export interface SpriteSize {
  readonly width: number;
  readonly height: number;
  readonly stride: number;
  readonly bank: number;
  readonly offset: number;
}
/** A size list at `address`: five {word width, word height, word words a row, word bank, word offset}. */
function sizesAt(main: Uint8Array, address: number): SpriteSize[] {
  return Array.from({ length: SIZES }, (_, k) => {
    const a = address + 10 * k;
    return {
      width: word(main, a),
      height: word(main, a + 2),
      stride: word(main, a + 4),
      bank: main[a + 7]! & 3,
      offset: word(main, a + 8),
    };
  });
}
/** Sprite `index`'s sizes: the long at 0x11ED2 + index × 4 is its size list. */
export const spriteSizes = (main: Uint8Array, index: number) => sizesAt(main, long(main, SPRITES + 4 * index));
/** The shadow every shadowed object casts, drawn at the object's scale: the size list at 0xFF56. */
export const shadowSizes = (main: Uint8Array) => sizesAt(main, SHADOW);

/**
 * A size's pixels, row-major: each word eight 4-bit pixels, the most significant first, `stride` words a row from its
 * bank's offset. 0 is transparent; 15 marks where a row may end, at the end of each word left of the picture's middle
 * and the start of each right of it, and covers the pixel there.
 */
export function spritePixels(words: Uint32Array, size: SpriteSize): Uint8Array {
  const out = new Uint8Array(size.width * size.height);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++) {
      const w = words[size.bank * 0x10000 + ((size.offset + y * size.stride + (x >> 3)) & 0xffff)]!;
      out[y * size.width + x] = (w >>> (28 - 4 * (x & 7))) & 15;
    }
  return out;
}

/**
 * A size's outline, filled: its colored pixels (1–14), each marked pixel (15) between two colored ones in its row, and
 * every other pixel no path of transparent pixels joins to the picture's edge.
 */
export function outline(pixels: Uint8Array, width: number): Uint8Array {
  const height = pixels.length / width;
  const colored = (i: number) => pixels[i]! > 0 && pixels[i]! < 15;
  const shape = pixels.map((v, i) => {
    const x = i % width;
    return colored(i) || (v === 15 && x > 0 && x < width - 1 && colored(i - 1) && colored(i + 1)) ? 1 : 0;
  });
  // The outside: transparent pixels reached from the edge.
  const outside = new Uint8Array(shape.length);
  const stack: number[] = [];
  const reach = (i: number) => {
    if (!shape[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    reach(x);
    reach((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    reach(y * width);
    reach(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!,
      x = i % width;
    if (x > 0) reach(i - 1);
    if (x < width - 1) reach(i + 1);
    if (i >= width) reach(i - width);
    if (i + width < shape.length) reach(i + width);
  }
  return shape.map((_, i) => (outside[i] ? 0 : 1));
}

/** Palette `index`'s 16 colors as RGB555: the words at 0x14ED8 + index × 32. */
export const spritePalette = (main: Uint8Array, index: number) =>
  Array.from({ length: 16 }, (_, k) => paletteRgb555(word(main, PALETTES + 32 * index + 2 * k)));

/** Sprite `index`'s hit extents, road units from its object's x, left and right: the words at 0x1212A + index × 4. */
export const hitExtents = (main: Uint8Array, index: number): [number, number] => [
  sword(main, EXTENTS + 4 * index),
  sword(main, EXTENTS + 4 * index + 2),
];

/** An object standing at a stage's start: as a scenery entry, at depth `line` of the road's 512, and its routine. */
export interface StartObject {
  readonly flags: number;
  readonly anchor: number;
  readonly palette: number;
  readonly sprite: number;
  /** Road units from its road's centre, and above the road. */
  readonly x: number;
  readonly y: number;
  readonly line: number;
  readonly routine: number;
}
/**
 * The objects at a stage's start: the word at 0x2B6E counts 16-byte records after it, {u8 flags, u8 anchor, u8
 * priority, u8 palette, word sprite × 4, signed word x, word y × 128, word line, long routine}.
 */
export function readStartObjects(main: Uint8Array): StartObject[] {
  return Array.from({ length: word(main, START_OBJECTS) }, (_, k) => {
    const a = START_OBJECTS + 2 + 16 * k;
    return {
      flags: main[a]!,
      anchor: main[a + 1]!,
      palette: main[a + 3]!,
      sprite: word(main, a + 4) / 4,
      x: sword(main, a + 6),
      y: word(main, a + 8) / 128,
      line: word(main, a + 10),
      routine: long(main, a + 12),
    };
  });
}

/**
 * What an object's routine does with it: the road units one pixel of its largest size spans (its zoom halves the road
 * line's scale once, or twice), and whether it tests the car against its sprite's hit extents.
 */
export interface ObjectRoutine {
  readonly pixelUnits: 1 | 2;
  readonly hits: boolean;
}
/** The routines read so far, by address: the others are not converted. */
export const OBJECT_ROUTINES: ReadonlyMap<number, ObjectRoutine> = new Map([
  [0x4042, { pixelUnits: 2, hits: false }],
  [0x4048, { pixelUnits: 2, hits: true }],
  [0x4658, { pixelUnits: 2, hits: true }],
  [0x4828, { pixelUnits: 2, hits: true }],
  [0x492a, { pixelUnits: 2, hits: true }],
  [0x3fe2, { pixelUnits: 1, hits: false }],
  [0x3fe8, { pixelUnits: 1, hits: true }],
]);

/**
 * A scenery entry's routine and anchor by its drawing (flags bits 4–7), mirrored by flags bit 0: kind 0 stands on its
 * foot, hit when on the ground (y 0); kinds 4, 7, 9, 8 and 13 have one routine each. Kinds 1, 3, 10 and 11 draw a strip
 * along the road whose sprite changes with depth, and kinds 2, 5, 6, 12 and 14 move: neither is converted (null).
 */
export function sceneryRoutine(flags: number, y: number): { routine: number; anchor: number } | null {
  const mirrored = (flags & 1) !== 0;
  switch (flags >> 4) {
    case 0:
      return { routine: y ? 0x4042 : 0x4048, anchor: 8 };
    case 4:
      return { routine: 0x4658, anchor: 8 };
    case 7:
      return { routine: 0x4828, anchor: mirrored ? 9 : 10 };
    case 8:
      return { routine: 0x3fe2, anchor: 8 };
    case 9:
      return { routine: 0x492a, anchor: 8 };
    case 13:
      return { routine: 0x3fe8, anchor: 0 };
    default:
      return null;
  }
}

/**
 * The base point of a size `width` × `height` drawn by `anchor` (bits 0–1 across: 1 its left edge at the object's x,
 * 2 its right edge, else its middle; bits 2–3 down: 4 its top at the object's y, 8 its bottom, else its middle), in
 * texel-centre coordinates.
 */
export function anchorPoint(anchor: number, width: number, height: number): { x: number; y: number } {
  const across = anchor & 3,
    down = anchor & 12;
  return {
    x: across === 1 ? -0.5 : across === 2 ? width - 0.5 : width / 2 - 0.5,
    y: down === 4 ? -0.5 : down === 8 ? height - 0.5 : height / 2 - 0.5,
  };
}

/** A palette's representative color: its colors' mean over a sprite's opaque pixels, RGB555 by channel, rounded. */
export function representative(pixels: Uint8Array, palette: readonly number[]): number {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (const v of pixels) {
    if (!v || v === 15) continue;
    const c = palette[v]!;
    r += (c >> 10) & 31;
    g += (c >> 5) & 31;
    b += c & 31;
    n++;
  }
  requireInput(n > 0, '/sprites', 'A sprite without opaque pixels has no outline');
  return (Math.round(r / n) << 10) | (Math.round(g / n) << 5) | Math.round(b / n);
}
