/**
 * OUTRUN's sprites as its programs and sprite ROMs hold them ([OUTRUN road data](../../docs/outrun-road-data.md#sprites)):
 * the sprite ROMs' 32-bit words, each sprite's sizes, its pixels and palettes, the hit extents of its scenery, and the
 * objects standing at a stage's start.
 */
import { paletteRgb555 } from './road-tables.js';
import type { SpriteSize } from './sprite-pixels.js';

/** The main CPU's tables: sprites' size lists, palettes, hit extents, the shadow and the start's objects. */
const SPRITES = 0x11ed2;
const PALETTES = 0x14ed8;
const EXTENTS = 0x1212a;
const SHADOW = 0xff56;
const START_OBJECTS = 0x2b6e;
/** A sprite lists five sizes, the largest first. */
const SIZES = 5;

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
/** The shadow a shadowed object casts: the size list at 0xFF56 (the scenery's, at the object's scale), or at `address`. */
export const shadowSizes = (main: Uint8Array, address = SHADOW) => sizesAt(main, address);
/** A frame's size: the 10 bytes at `address`, as a size list's first. */
export const frameSize = (main: Uint8Array, address: number) => sizeAt(main, address);
/** A family's sizes: the longs at its address point at them, as many as it has. */
export const familySizes = (main: Uint8Array, family: Family) =>
  Array.from({ length: family.sizes }, (_, k) => sizeAt(main, long(main, family.address + 4 * k)));

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
  /** Whether it is drawn with shadows allowed: its object's byte 7's bit 2, the sprite entry's shadow bit (0x9670). */
  readonly shadows: boolean;
}
/**
 * The objects at a stage's start: the word at 0x2B6E counts 16-byte records after it, {u8 flags, u8 anchor, u8
 * priority (its object's byte 7, 0x3B7C), u8 palette, word sprite × 4, signed word x, word y × 128, word line, long
 * routine}.
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
      shadows: (main[a + 2]! & 4) !== 0,
    };
  });
}

/**
 * The start's flag waver, standing as it holds up its flag through the countdown: the program at 0x5EA8 draws, from
 * state 9 to 12 (the word at 0x6080C), the 8-byte blocks of the lists the longs at 0x12382 + 8 × (state − 9) point
 * at, {u8 palette, u8 bit 7 x negative and bits 0–3 the frame's high bits, word the frame's low bits, u8 x, s8 y, u8
 * depth, u8 bit 7 the list's last, bit 6 mirrored, bits 0–5 ticks}. The countdown's (state 10) first block shows sprite
 * 98 (its frame the size list at 0x10BAE), 40 × 96 pixels of 1 road unit (its zoom a quarter of its line), in palette 12,
 * mirrored, 70 road units left of the left road's centre. It starts at line 0x190 (the immediate of 0x5E98) whatever its
 * block's depth, approaching as the start's objects do; its object (0x582E) stands on its bottom middle and casts no
 * shadow.
 */
export function readFlagWaver(main: Uint8Array): StartObject {
  const block = long(main, FLAG_WAVER_LISTS + 8 * (COUNTDOWN - 9));
  const frame = ((main[block + 1]! & 15) << 16) | word(main, block + 2);
  const sprite = spriteOfFrame(main, frame);
  if (sprite === null) throw new Error(`The flag waver's frame ${frame.toString(16)} is no sprite's`);
  return {
    flags: (main[block + 7]! >> 6) & 1,
    anchor: main[FLAG_WAVER_OBJECT + 9]!,
    palette: main[block]!,
    sprite,
    x: (main[block + 1]! & 0x80 ? -1 : 1) * main[block + 4]!,
    y: (main[block + 5]! << 24) >> 24,
    line: word(main, FLAG_WAVER_LINE),
    routine: FLAG_WAVER_ROUTINE,
    shadows: (main[FLAG_WAVER_OBJECT + 7]! & 4) !== 0,
  };
}
/** The flag waver's lists, the countdown's state, its object's template, its start line's immediate and its routine. */
const FLAG_WAVER_LISTS = 0x12382;
const COUNTDOWN = 10;
const FLAG_WAVER_OBJECT = 0x582e;
const FLAG_WAVER_LINE = 0x5e9a;
const FLAG_WAVER_ROUTINE = 0x5ea8;
/** The sprites the longs at 0x11ED2 name, up to the hit extents' table: 150. */
const SPRITE_COUNT = (EXTENTS - SPRITES) / 4;

/** The sprite whose size list starts at `frame`, if one does. */
export function spriteOfFrame(main: Uint8Array, frame: number): number | null {
  const sprite = Array.from({ length: SPRITE_COUNT }, (_, k) => long(main, SPRITES + 4 * k)).indexOf(frame);
  return sprite < 0 ? null : sprite;
}

/** Every object standing at the start: the records at 0x2B6E and the flag waver. */
export const startObjects = (main: Uint8Array) => [...readStartObjects(main), readFlagWaver(main)];

/**
 * The sizes a routine draws whatever sprite its entry names, choosing one by depth: the longs at `address` point at
 * them, `sizes` of them, `nearest` the index of the nearest.
 */
export interface Family {
  readonly address: number;
  readonly sizes: number;
  readonly nearest: number;
}

/**
 * What an object's routine does with it: the road units one pixel of its largest size spans (its zoom halves the road
 * line's scale once or twice; the clouds', approaching at half the rate, stand twice as far and large), whether it tests
 * the car against its sprite's hit extents, and whether it keeps a right-side object by the left road where the roads
 * were apart as it appeared (the flag the spawn sets, bit 2).
 */
export interface ObjectRoutine {
  readonly pixelUnits: 1 | 2 | 4;
  readonly hits: boolean;
  readonly keepsLeftWhenApart: boolean;
  /** A strip's or cloud's sizes: a board of its nearest size extending sideways. */
  readonly family?: Family;
  /**
   * Whether what it draws lies on the ground (the sea's and lakes' edge, the sand drifts, the patches of sand on the
   * road): a board at the original's anchor, its material (`WATER` the sea's and lakes', none the sand's) beneath it.
   */
  readonly lies?: { readonly material: string | null };
  /** Whether, passing the car, it grants the checkpoint's time (0x4812 sets the word at 0x60B62). */
  readonly grantsTime?: boolean;
  /**
   * Whether the scenery's spawn draws it with shadows allowed: its object's byte 7 is 7, not 3 (0x3DFA to 0x3FD4),
   * which the sprite list's builder puts in its entry's shadow bit (0x9670), so its pixel 10 shades.
   */
  readonly shadows?: true;
  /**
   * Its shadow where not the scenery's (the size list at 0xFF56 at its own scale): another size list, drawn at `scale`
   * times its own.
   */
  readonly shadow?: { readonly sizes: number; readonly scale: number };
  /**
   * An object placed by the screen's middle, not its entry's x: its edge this many of its pixels beyond the roads'
   * middle, on the side away from where it reaches, and this many road units up.
   */
  readonly fromMiddle?: { readonly edge: number; readonly up: number };
}

/** A strip's sizes: 16 for the depths, the nearest last. */
const strip = (address: number): Family => ({ address, sizes: 16, nearest: 15 });
/**
 * The clouds' row stays 151 above the eye in road units at every depth (the horizon's row on a flat road, its row ×
 * (1 − z/512)); standing twice as far, twice that, above the original's eye, 72 (rows 223 to 151).
 */
const CLOUDS_UP = 2 * 151 + 72;
/** The routines read so far, by address: the others are not converted. */
export const OBJECT_ROUTINES: ReadonlyMap<number, ObjectRoutine> = new Map<number, ObjectRoutine>([
  [0x4042, { pixelUnits: 2, hits: false, keepsLeftWhenApart: true, shadows: true }],
  [0x4048, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true, shadows: true }],
  [0x4658, { pixelUnits: 2, hits: true, keepsLeftWhenApart: false, shadows: true }],
  [0x4828, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true, shadows: true }],
  [0x492a, { pixelUnits: 2, hits: true, keepsLeftWhenApart: true, shadows: true }],
  [0x3fe2, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true, shadows: true }],
  // Drawing 13: a patch lying on the road.
  [0x3fe8, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true, lies: { material: null } }],
  // The checkpoint banner's halves, raised: the right (drawing 5) and the left (6), which grants the time.
  [0x46d6, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, shadows: true }],
  [0x4774, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, grantsTime: true, shadows: true }],
  // The start's flag waver.
  [0x5ea8, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true }],
  // The figures after a goal, each casting its shadow object's (0x5C48) size list at 0x103B6, at 3/8 of its scale
  // (its line / 8 less a quarter of that, against its own line / 4).
  [0x5b42, { pixelUnits: 1, hits: false, keepsLeftWhenApart: true, shadow: { sizes: 0x103b6, scale: 3 / 8 } }],
  [0x4416, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: strip(0x4548), shadows: true }],
  [
    0x4408,
    { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: strip(0x4608), lies: { material: 'WATER' } },
  ],
  [0x443c, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: strip(0x4588), lies: { material: null } }],
  [0x4432, { pixelUnits: 2, hits: false, keepsLeftWhenApart: false, family: strip(0x45c8), shadows: true }],
  // Drawing 14: the sand strip's, but kept by the left road where the roads were apart, and setting no effect.
  [0x4380, { pixelUnits: 2, hits: false, keepsLeftWhenApart: true, family: strip(0x4588), lies: { material: null } }],
  // VINEYARD's trees: 9 sizes, the nearest first.
  [
    0x428a,
    {
      pixelUnits: 2,
      hits: false,
      keepsLeftWhenApart: false,
      family: { address: 0x435c, sizes: 9, nearest: 0 },
      shadows: true,
    },
  ],
  [
    0x4144,
    {
      pixelUnits: 4,
      hits: false,
      keepsLeftWhenApart: false,
      family: { address: 0x4246, sizes: 9, nearest: 0 },
      fromMiddle: { edge: 32, up: CLOUDS_UP },
    },
  ],
]);
/** The clouds' palette at each sixteenth of their depth (the same at every depth): the bytes at 0x426A. */
const CLOUD_PALETTES = 0x426a;

/** The largest size an object shows: its frame's, its family's nearest, or its sprite's first. */
export function objectSize(
  main: Uint8Array,
  use: { readonly sprite: number; readonly routine: number; readonly frame?: number },
): SpriteSize {
  const { family } = OBJECT_ROUTINES.get(use.routine)!;
  if (use.frame !== undefined) return frameSize(main, use.frame);
  return family === undefined ? spriteSizes(main, use.sprite)[0]! : familySizes(main, family)[family.nearest]!;
}

/**
 * Where an object's board stands across from its anchor, road units: its sprite's hit extents' middle, a strip's or a
 * frame's (which has none) at 0.
 */
export const objectAside = (
  main: Uint8Array,
  use: { readonly sprite: number; readonly routine: number; readonly mirrored: boolean; readonly frame?: number },
) =>
  OBJECT_ROUTINES.get(use.routine)!.family === undefined && use.frame === undefined
    ? hitMiddle(main, use.sprite, use.mirrored)
    : 0;

/**
 * A scenery entry's routine and anchor by its drawing (flags bits 4–7, dispatched at 0x3D98), mirrored by flags bit 0:
 * kind 0 stands on its foot, hit when on the ground (y 0); kinds 4, 7, 9 and 8 have one routine each. A hit sets the
 * crash (0x60C24). Kinds 1, 3, 10 and 11 draw a strip beside the road (0x4416, 0x4408, 0x443C, 0x4432), its edge nearest
 * the road at x: its left edge, or its right drawn mirrored; kind 13 (0x3FE8) a patch on the road, its middle at x. They
 * test no hit for the crash: kinds 1, 3 and 13 set the road's surface effect (0x60C20), a spray drawn at the car. Kind 2
 * (0x4144) is a cloud on its bottom edge, left or mirrored right, in the clouds' palette whatever its entry's; kind 12
 * (0x428A) VINEYARD's trees on theirs; kind 14 (0x4380) the sand strip again; kinds 5 and 6 (0x46D6, 0x4774) the
 * checkpoint banner's halves, raised on their bottom middle. Any other kind is no object (null).
 */
export function sceneryRoutine(
  main: Uint8Array,
  flags: number,
  y: number,
): { routine: number; anchor: number; palette?: number } | null {
  const mirrored = (flags & 1) !== 0;
  switch (flags >> 4) {
    case 2:
      return { routine: 0x4144, anchor: mirrored ? 10 : 9, palette: main[CLOUD_PALETTES + 31]! };
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
    case 12:
      return { routine: 0x428a, anchor: mirrored ? 10 : 9 };
    case 5:
      return { routine: 0x46d6, anchor: 8 };
    case 6:
      return { routine: 0x4774, anchor: 8 };
    case 14:
      return { routine: 0x4380, anchor: mirrored ? 2 : 1 };
    default:
      return null;
  }
}

/** An object's approach: the main CPU's table at 0x28000, a long a road line for each advance of 0 to 15 a tick. */
export const APPROACH = 0x28000;
