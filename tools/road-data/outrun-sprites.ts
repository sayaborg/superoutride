/**
 * OUTRUN's sprites as its programs and sprite ROMs hold them ([Original road data](../../docs/original-road-data.md#sprites)):
 * the sprite ROMs' 32-bit words, each sprite's sizes, its pixels and palettes, the hit extents of its scenery, and the
 * objects standing at a stage's start.
 */
import { requireInput } from '../course/authoring-io.js';
import { paletteRgb555 } from './road-tables.js';
import { spriteWords, type SpriteSize } from './sprite-pixels.js';
import type { ZipFile } from './zip.js';

/** The sprite ROMs: two sets of four, each ROM one byte of a 32-bit word, the least significant first. */
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

/** The sprite ROMs' words (`spriteWords`: .9 and .13 the lowest bytes, .12 and .16 the highest), set 1's after set 0's. */
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
    words.set(spriteWords(data), s * SPRITE_ROM_SIZE);
  });
  return words;
}

const word = (p: Uint8Array, a: number) => (p[a]! << 8) | p[a + 1]!;
const sword = (p: Uint8Array, a: number) => (word(p, a) << 16) >> 16;
const long = (p: Uint8Array, a: number) => ((word(p, a) << 16) | word(p, a + 2)) >>> 0;

/** A size at `a`: {word width, word height, word words a row, word bank (its low byte), word offset}. */
const sizeAt = (main: Uint8Array, a: number): SpriteSize => ({
  width: word(main, a),
  height: word(main, a + 2),
  stride: word(main, a + 4),
  bank: main[a + 7]! & 3,
  offset: word(main, a + 8),
});
/** A size list at `address`: five sizes, one after another. */
const sizesAt = (main: Uint8Array, address: number) =>
  Array.from({ length: SIZES }, (_, k) => sizeAt(main, address + 10 * k));
/** Sprite `index`'s sizes: the long at 0x11ED2 + index × 4 is its size list. */
export const spriteSizes = (main: Uint8Array, index: number) => sizesAt(main, long(main, SPRITES + 4 * index));
/** The shadow every shadowed object casts, drawn at the object's scale: the size list at 0xFF56. */
export const shadowSizes = (main: Uint8Array) => sizesAt(main, SHADOW);
/** A strip routine's sprite: 16 sizes for the depths, the longs at its family's address pointing at them, nearest last. */
const STRIP_SIZES = 16;

/** Palette `index`'s 16 colors as RGB555: the words at 0x14ED8 + index × 32. */
export const spritePalette = (main: Uint8Array, index: number) =>
  Array.from({ length: 16 }, (_, k) => paletteRgb555(word(main, PALETTES + 32 * index + 2 * k)));

/** Sprite `index`'s hit extents, road units from its object's x, left and right: the words at 0x1212A + index × 4. */
export const hitExtents = (main: Uint8Array, index: number): [number, number] => [
  sword(main, EXTENTS + 4 * index),
  sword(main, EXTENTS + 4 * index + 2),
];

/** The middle of sprite `index`'s hit extents, road units right of its object's x as shown, mirrored or not. */
export function hitMiddle(main: Uint8Array, index: number, mirrored: boolean): number {
  const [left, right] = hitExtents(main, index);
  return ((mirrored ? -1 : 1) * (left + right)) / 2;
}

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
 * line's scale once, or twice), whether it tests the car against its sprite's hit extents, and whether it keeps a
 * right-side object by the left road where the roads were apart as it appeared (the flag the spawn sets, bit 2).
 */
export interface ObjectRoutine {
  readonly pixelUnits: 1 | 2;
  readonly hits: boolean;
  readonly keepsLeftWhenApart: boolean;
  /**
   * A strip's routine draws, whatever sprite its entry names, the sizes its family's 16 longs point at, choosing one by
   * depth: the address of those longs.
   */
  readonly family?: number;
}
/** The routines read so far, by address: the others are not converted. */
export const OBJECT_ROUTINES: ReadonlyMap<number, ObjectRoutine> = new Map<number, ObjectRoutine>([
  [0x4042, { pixelUnits: 2, hits: false, keepsLeftWhenApart: true }],
  [0x4048, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true }],
  [0x4658, { pixelUnits: 2, hits: true, keepsLeftWhenApart: false }],
  [0x4828, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true }],
  [0x492a, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true }],
  [0x3fe2, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true }],
  [0x3fe8, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true }],
  [0x4416, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: 0x4548 }],
  [0x4408, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: 0x4608 }],
  [0x443c, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: 0x4588 }],
  [0x4432, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: 0x45c8 }],
]);

/** The largest size an object shows: its family's nearest, or its sprite's first. */
export function objectSize(main: Uint8Array, use: { readonly sprite: number; readonly routine: number }): SpriteSize {
  const { family } = OBJECT_ROUTINES.get(use.routine)!;
  return family === undefined
    ? spriteSizes(main, use.sprite)[0]!
    : sizeAt(main, long(main, family + 4 * (STRIP_SIZES - 1)));
}

/** Where an object's board stands across from its anchor, road units: its hit extents' middle, a strip's at 0. */
export const objectAside = (
  main: Uint8Array,
  use: { readonly sprite: number; readonly routine: number; readonly mirrored: boolean },
) => (OBJECT_ROUTINES.get(use.routine)!.family === undefined ? hitMiddle(main, use.sprite, use.mirrored) : 0);

/**
 * A scenery entry's routine and anchor by its drawing (flags bits 4–7, dispatched at 0x3D98), mirrored by flags bit 0:
 * kind 0 stands on its foot, hit when on the ground (y 0); kinds 4, 7, 9 and 8 have one routine each. A hit sets the
 * crash (0x60C24). Kinds 1, 3, 10 and 11 draw a strip beside the road (0x4416, 0x4408, 0x443C, 0x4432), its edge nearest
 * the road at x: its left edge, or its right drawn mirrored; kind 13 (0x3FE8) a patch on the road, its middle at x. They
 * test no hit for the crash: kinds 1, 3 and 13 set the road's surface effect (0x60C20), a spray drawn at the car. Kinds
 * 2, 5, 6, 12 and 14 move and are no object (null).
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
    case 1:
      return { routine: 0x4416, anchor: mirrored ? 2 : 1 };
    case 3:
      return { routine: 0x4408, anchor: mirrored ? 2 : 1 };
    case 10:
      return { routine: 0x443c, anchor: mirrored ? 2 : 1 };
    case 11:
      return { routine: 0x4432, anchor: mirrored ? 2 : 1 };
    case 13:
      return { routine: 0x3fe8, anchor: 0 };
    default:
      return null;
  }
}

/** An object's approach: the main CPU's table at 0x28000, a long a road line for each advance of 0 to 15 a tick. */
const APPROACH = 0x28000;

/**
 * An object's depth (16.16 lines) after one tick of its approach: the table's step for its line and the tick's advance
 * (`col`, at most 15), half of it for an object that approaches at half the rate (drawing 2, the clouds: `asr.l #1`).
 */
export function approached(main: Uint8Array, depth: number, advance: number, half = false): number {
  const step = long(main, APPROACH + (advance << 11) + 4 * (depth >>> 16));
  return depth + (half ? step >> 1 : step);
}
