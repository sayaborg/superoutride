/**
 * OUTRUN's sprites as its programs and sprite ROMs hold them ([OUTRUN road data](../../../docs/outrun-road-data.md#sprites)):
 * the sprite ROMs' 32-bit words, each sprite's sizes, its pixels and palettes, the hit extents of its scenery, and the
 * objects standing at a stage's start.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import { instruction, long, sword, word } from '../sega-16/program-words.js';
import { routineInstructions, routineRuns, routineSetsBefore } from '../sega-16/routine-paths.js';
import { readColors } from '../out-run-hardware/road-tables.js';
import type { SpriteSize } from '../sega-16/sprite-pixels.js';
import { stripFractions } from '../out-run-hardware/strips.js';

/** The main CPU's tables: sprites' size lists, palettes, hit extents, the shadow and the start's objects. */
const SPRITES = 0x11ed2;
const PALETTES = 0x14ed8;
const EXTENTS = 0x1212a;
const SHADOW = 0xff56;
const START_OBJECTS = 0x2b6e;
/** A sprite lists five sizes, the largest first. */
const SIZES = 5;

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
export const spritePalette = (main: Uint8Array, index: number) => readColors(main, PALETTES + 32 * index, 16).rgb555;

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
  /** The sprite it shows, or a frame of its own (`frameShown`). */
  readonly sprite: number;
  readonly frame?: number;
  /** Road units from its road's centre, and above the road. */
  readonly x: number;
  readonly y: number;
  readonly line: number;
  readonly routine: number;
  /** Whether it is drawn with shadows allowed: its object's byte 7's bit 2, the sprite entry's shadow bit (0x9670). */
  readonly shadows: boolean;
  /** An object of its own, outside the scenery's slots. */
  readonly ownSlot?: true;
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
 * The start's flag waver, standing as it holds up its flag through the countdown. Its object's template (0x582E) names
 * its setup, which clears its state and sets its start line and its routine (`clr.w $2e(a5); move.w #line, $2c(a5);
 * move.l #routine, $2(a5)`). From state 9 to 12 (the word at 0x6080C) the routine draws the 8-byte blocks of the lists
 * the longs at a table + 8 × (state − 9) point at (`subi.w #9, d0; asl.w #3, d0; lea.l table, a6` at 0x5EF0), {u8
 * palette, u8 bit 7 x negative and bits 0–3 the frame's high bits, word the frame's low bits, u8 x, s8 y, u8 depth, u8
 * bit 7 the list's last, bit 6 mirrored, bits 0–5 ticks}. The countdown's (state 10) first block shows sprite 98 (its
 * frame the size list at 0x10BAE), 40 × 96 pixels of 1 road unit (its zoom a quarter of its line), in palette 12,
 * mirrored, 70 road units left of the left road's centre. It starts at its start line whatever its block's depth,
 * approaching as the start's objects do; its object stands on its bottom middle and casts no shadow. It is an object
 * of its own, outside the scenery's slots (the original's slot 95).
 */
export function readFlagWaver(main: Uint8Array): StartObject {
  const setup = long(main, FLAG_WAVER_OBJECT + 2);
  const [line, high, low] = instruction(
    main,
    setup,
    [0x426d, 0x002e, 0x3b7c, null, 0x002c, 0x2b7c, null, null, 0x0002],
    "the flag waver's setup",
  );
  const [first, listsHigh, listsLow] = instruction(
    main,
    FLAG_WAVER_LISTS,
    [0x0440, null, 0xe740, 0x4df9, null, null],
    "the flag waver's lists",
  );
  const block = long(main, listsHigh! * 0x10000 + listsLow! + 8 * (COUNTDOWN - first!));
  return {
    flags: (main[block + 7]! >> 6) & 1,
    anchor: main[FLAG_WAVER_OBJECT + 9]!,
    palette: main[block]!,
    ...frameShown(main, ((main[block + 1]! & 15) << 16) | word(main, block + 2)),
    x: (main[block + 1]! & 0x80 ? -1 : 1) * main[block + 4]!,
    y: (main[block + 5]! << 24) >> 24,
    line: line!,
    routine: high! * 0x10000 + low!,
    shadows: (main[FLAG_WAVER_OBJECT + 7]! & 4) !== 0,
    ownSlot: true,
  };
}
/** The flag waver's object's template, the instructions that index its lists, and the countdown's state. */
const FLAG_WAVER_OBJECT = 0x582e;
const FLAG_WAVER_LISTS = 0x5ef0;
const COUNTDOWN = 10;
/** The sprites the longs at 0x11ED2 name, up to the hit extents' table: 150. */
const SPRITE_COUNT = (EXTENTS - SPRITES) / 4;

/** How an object shows `frame`: as the sprite whose size list it starts, or, where none does, as a frame of its own. */
export function frameShown(main: Uint8Array, frame: number): { readonly sprite: number; readonly frame?: number } {
  const sprite = Array.from({ length: SPRITE_COUNT }, (_, k) => long(main, SPRITES + 4 * k)).indexOf(frame);
  return sprite < 0 ? { sprite: -1, frame } : { sprite };
}

/** Every object standing at the start: the records at 0x2B6E and the flag waver. */
export const startObjects = (main: Uint8Array) => [...readStartObjects(main), readFlagWaver(main)];

/**
 * The sizes a routine draws whatever sprite its entry names, choosing one by depth (`routineFamily`): the longs at
 * `address` point at them, `sizes` of them, `nearest` the index of the nearest.
 */
export interface Family {
  readonly address: number;
  readonly sizes: number;
  readonly nearest: number;
  /** Whether it loops, by what it shows (K, 2026-10-24): its nearest size's colored columns repeat away from the road. */
  readonly loops?: true;
  /** One that does not loop: each size's share of the nearest's width, the nearest's 1. */
  readonly fractions?: readonly number[];
}

/**
 * What an object's routine does with it beyond its instructions: the road units one pixel of its largest size spans
 * where its zoom is not its line's shifted (`routinePixelUnits`: the goal figures', whose shift halves a table's byte,
 * not their line); whether it hits the car, what it
 * keeps by the left road and whether it grants the time are read from its instructions (`routineHits`,
 * `keepsLeftWhenApart`, `grantsTime`).
 */
export interface ObjectRoutine {
  readonly pixelUnits?: 1;
  /**
   * Whether the sizes it chooses by depth (`routineFamily`), a strip's or cloud's, loop, by what they show (K,
   * 2026-10-24): its nearest size's colored columns repeat away from the road ([Strips](../../../docs/original-road-data.md#strips)).
   */
  readonly loops?: boolean;
  /**
   * Whether what it draws lies on the road (the patches of sand): a board at the original's anchor, with no material
   * (K, 2026-10-25).
   */
  readonly lies?: true;
  /** The palette it draws in whatever its entry's: the bytes at this address, one a sixteenth of its depth. */
  readonly palettes?: number;
  /**
   * Its shadow where not the scenery's (the size list at 0xFF56 at its own scale): another size list, drawn at `scale`
   * times its own.
   */
  readonly shadow?: { readonly sizes: number; readonly scale: number };
  /**
   * An object placed by the screen's middle, not its entry's x: its edge this many of its pixels beyond the roads'
   * middle, on the side away from where it reaches, and a far layer's height up (`farUp`).
   */
  readonly fromMiddle?: { readonly edge: number };
}

/**
 * Whether routine `routine` keeps a right-side object by the left road where the roads were apart as it appeared: it
 * tests the flag the spawn sets (`btst.b #2, (a5)`).
 */
export const keepsLeftWhenApart = (main: Uint8Array, routine: number) => routineRuns(main, routine, [0x0815, 0x0002]);
/**
 * Whether routine `routine` hits the car: tested against its sprite's hit extents, it sets the crash (`move.w $E318.l,
 * $60C24.l`).
 */
export const routineHits = (main: Uint8Array, routine: number) =>
  routineRuns(main, routine, [0x33f9, null, null, 0x0006, 0x0c24]);
/** Whether routine `routine`, passing the car, grants the checkpoint's time: it sets the word at 0x60B62 to −1. */
export const grantsTime = (main: Uint8Array, routine: number) =>
  routineRuns(main, routine, [0x33fc, 0xffff, 0x0006, 0x0b62]);

/** The routines read so far, by address: the others are not converted. */
export const OBJECT_ROUTINES: ReadonlyMap<number, ObjectRoutine> = new Map<number, ObjectRoutine>([
  [0x4042, {}],
  [0x4048, {}],
  [0x4658, {}],
  [0x4828, {}],
  [0x492a, {}],
  [0x3fe2, {}],
  // Drawing 13: a patch lying on the road.
  [0x3fe8, { lies: true }],
  // The checkpoint banner's halves, raised: the right (drawing 5) and the left (6), which grants the time.
  [0x46d6, {}],
  [0x4774, {}],
  // The start's flag waver.
  [0x5ea8, {}],
  // The figures after a goal, each casting its shadow object's (0x5C48) size list at 0x103B6, at 3/8 of its scale
  // (its line / 8 less a quarter of that, against its own line / 4).
  [0x5b42, { pixelUnits: 1, shadow: { sizes: 0x103b6, scale: 3 / 8 } }],
  [0x4416, { loops: true }],
  [0x4408, { loops: false }],
  [0x443c, { loops: false }],
  [0x4432, { loops: true }],
  // Drawing 14: the sand strip's, but kept by the left road where the roads were apart, and setting no effect.
  [0x4380, { loops: false }],
  // VINEYARD's trees, looping (K, 2026-10-24).
  [0x428a, { loops: true }],
  [
    0x4144,
    {
      loops: true,
      palettes: 0x426a,
      fromMiddle: { edge: 32 },
    },
  ],
]);
/** Whether routine `routine` approaches at half the rate: its step shifted (`asr.l #1, d0`) before it adds it. */
export const halvesApproach = (main: Uint8Array, routine: number) =>
  routineRuns(main, routine, [0x2030, 0x0000, 0xe280, 0xd1ad, 0x0024]);

/**
 * The road units a pixel of routine `routine`'s largest size spans: its stated `pixelUnits`, else by the zoom it writes,
 * its line shifted by k (`asr.w #k, dn`, or `asr.w dm, dn` after its entry's `moveq #k, dm`, the last before
 * `move.b dn, $8(a5)` on every path, `routineSetsBefore`): drawn at 1/2^k of its line's scale, where a road unit is
 * L/512 pixels and a zoom of L/128 a sprite's pixel, a pixel is 4/2^k units, twice that for one approaching at half
 * the rate (`halvesApproach`), which looks as one twice as far and twice as large.
 */
export function routinePixelUnits(main: Uint8Array, routine: number): number {
  const stated = OBJECT_ROUTINES.get(routine)?.pixelUnits;
  if (stated !== undefined) return stated;
  const entry = word(main, routine);
  const shifts = [...routineInstructions(main, routine)]
    .filter((a) => (word(main, a) & 0xfff8) === 0x1b40 && word(main, a + 2) === 0x0008)
    .map((a) => {
      const line = word(main, a) & 7;
      const op = word(main, routineSetsBefore(main, routine, a));
      if ((op & 0xf1ff) === (0xe040 | line)) return (op >> 9) & 7 || 8;
      if ((op & 0xf1ff) === (0xe060 | line) && (entry & 0xff00) === (0x7000 | (op & 0x0e00))) return entry & 0xff;
      return NaN;
    });
  if (!shifts.length || shifts.some((k) => k !== shifts[0]))
    throw romDiffers(`The routine at 0x${routine.toString(16)} writes no one zoom of its line`);
  return (4 / 2 ** shifts[0]!) * (halvesApproach(main, routine) ? 2 : 1);
}

/**
 * A routine's palettes by depth are read at the nearest: the 32nd (`move.b (a0, d0.w), $a(a5)`, d0 its depth's
 * sixteenth); the clouds' are the same at every depth.
 */
const PALETTES_NEAREST = 31;

/**
 * The sizes routine `routine` chooses by depth, read from its instructions; none where it selects no long: the long it
 * selects (`move.l (an, dm.w), $18(a5)`) of the longs at `address` (`lea.l address, an`), by an index either its line
 * masked (`andi.w #mask, dm`: mask / 4 + 1 sizes) or a byte of a table by its line (`move.b (ak, dj.w), dm` after
 * `lea.l table, ak`, the table's pairs as many as its `cmpi.w #lines, dj`, `add.w dj, dj`: the largest byte / 4 + 1
 * sizes); its nearest the long it takes nearer (`move.l $n(an), $18(a5)`, `move.l address.l, $18(a5)` or
 * `move.l #sprite, $18(a5)`). One that does not loop shrinks its nearest by `stripFractions`.
 */
export function routineFamily(main: Uint8Array, routine: number): Family | undefined {
  const { loops } = OBJECT_ROUTINES.get(routine)!;
  const all = [...routineInstructions(main, routine)].sort((a, b) => a - b);
  const before = (a: number) => all.filter((b) => b < a).at(-1)!;
  const loaded = (an: number, by: number) =>
    all.filter((a) => a < by && word(main, a) === (0x41f9 | (an << 9))).map((a) => long(main, a + 2));
  const selects = all.filter((a) => (word(main, a) & 0xfff8) === 0x2b70 && word(main, a + 4) === 0x0018);
  const differs = (what: string) => romDiffers(`The routine at 0x${routine.toString(16)} ${what}`);
  if (!selects.length) {
    if (loops !== undefined) throw differs('chooses no size by depth');
    return undefined;
  }
  if (selects.length > 1 || loops === undefined) throw differs('chooses its sizes unread');
  const select = selects[0]!;
  const an = word(main, select) & 7;
  const dm = (word(main, select + 2) >> 12) & 7;
  const [address, ...more] = new Set(loaded(an, select));
  const index = before(select);
  const op = word(main, index);
  let sizes = NaN;
  if (op === (0x0240 | dm)) sizes = word(main, index + 2) / 4 + 1;
  else if ((op & 0xfff8) === (0x1030 | (dm << 9))) {
    const dj = (word(main, index + 2) >> 12) & 7;
    const table = loaded(op & 7, index).at(-1);
    const lines = all.filter((a) => word(main, a) === (0x0c40 | dj)).map((a) => word(main, a + 2));
    if (table !== undefined && lines.length === 1 && all.some((a) => word(main, a) === (0xd040 | (dj << 9) | dj)))
      sizes = Math.max(...Array.from({ length: lines[0]! }, (_, k) => main[table + 2 * k]!)) / 4 + 1;
  }
  if (address === undefined || more.length || !Number.isInteger(sizes)) throw differs('chooses its sizes unread');
  const longs = Array.from({ length: sizes }, (_, k) => long(main, address + 4 * k));
  const nearest = all.flatMap((a) => {
    const w = word(main, a);
    if (w === (0x2b68 | an) && word(main, a + 4) === 0x0018) return [word(main, a + 2) / 4];
    if (w === 0x2b79 && word(main, a + 6) === 0x0018) return [(long(main, a + 2) - address) / 4];
    if (w === 0x2b7c && word(main, a + 6) === 0x0018) return [longs.indexOf(long(main, a + 2))];
    return [];
  });
  if (nearest.length !== 1 || !(nearest[0]! >= 0 && nearest[0]! < sizes && Number.isInteger(nearest[0])))
    throw differs('takes no one nearest size');
  if (loops) return { address, sizes, nearest: nearest[0]!, loops };
  if (sizes !== 16 || nearest[0] !== 15) throw differs('shrinks sizes unread');
  return { address, sizes, nearest: 15, fractions: stripFractions(sizes) };
}

/** The largest size an object shows: its frame's, its family's nearest, or its sprite's first. */
export function objectSize(
  main: Uint8Array,
  use: { readonly sprite: number; readonly routine: number; readonly frame?: number },
): SpriteSize {
  if (use.frame !== undefined) return frameSize(main, use.frame);
  const family = routineFamily(main, use.routine);
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
  use.frame === undefined && routineFamily(main, use.routine) === undefined
    ? hitMiddle(main, use.sprite, use.mirrored)
    : 0;

/** A drawing's handler, as the spawn's jump table names it: the routines it sets, its anchors and its shadows. */
export interface Drawing {
  /** Its routine on the ground (y 0) and raised: one and the same but where the handler tests y. */
  readonly ground: number;
  readonly raised: number;
  /** Its anchor, and drawn mirrored (flags bit 0). */
  readonly anchor: number;
  readonly mirroredAnchor: number;
  /** Whether it is drawn with shadows allowed: its object's byte 7's bit 2, the sprite entry's shadow bit (0x9670). */
  readonly shadows: boolean;
}

/** The target of the `bra.w` or `beq.w` (`op`) at `at`. */
function branch(main: Uint8Array, at: number, op: 0x6000 | 0x6700, what: string) {
  const [displacement] = instruction(main, at, [op, null], what);
  return at + 2 + ((displacement! << 16) >> 16);
}
/** The routine a handler sets at `at` (`move.l #routine, $2(a0)`). */
function setRoutine(main: Uint8Array, at: number) {
  const [high, low] = instruction(main, at, [0x217c, null, null, 0x0002], "a handler's routine");
  return high! * 0x10000 + low!;
}
/** The anchor a handler sets at `at` (`ori.b #anchor, $9(a0)`). */
const setAnchor = (main: Uint8Array, at: number) =>
  instruction(main, at, [0x0028, null, 0x0009], "a handler's anchor")[0]!;

/**
 * Every drawing's handler, by drawing (flags bits 4–7): the spawn jumps through the table its `lea.l` at 0x3D98 loads
 * (`lea.l table, a2; jmp (a2, d0.w)`, 0x3DA2), a `bra.w` a drawing up to the first handler (drawings 0 to 14), to the
 * handler that sets its object's routine (`move.l #routine, $2(a0)`; drawing 0's by y, `tst.w $38(a0)`, raised first),
 * its byte 7 (`move.b #byte, $7(a0)`) and its anchor (`ori.b #anchor, $9(a0)`; mirrored first where it tests flags bit
 * 0, `btst #0, (a0)`), and returns.
 */
export function readDrawings(main: Uint8Array): Drawing[] {
  const [high, low] = instruction(main, 0x3d98, [0x45f9, null, null, 0x4ef2, 0x0000], "the drawings' handlers");
  const table = high! * 0x10000 + low!;
  const first = branch(main, table, 0x6000, "the first drawing's handler");
  return Array.from({ length: (first - table) / 4 }, (_, d) =>
    handler(main, branch(main, table + 4 * d, 0x6000, "a drawing's handler")),
  );
}

/** The handler at `at`, read. */
function handler(main: Uint8Array, at: number): Drawing {
  let ground: number, raised: number;
  if (word(main, at) === 0x4a68) {
    instruction(main, at, [0x4a68, 0x0038], "a handler's test of y");
    const onGround = branch(main, at + 4, 0x6700, "a handler's routine on the ground");
    raised = setRoutine(main, at + 8);
    at = branch(main, at + 16, 0x6000, "a handler's routine set");
    ground = setRoutine(main, onGround);
  } else {
    ground = raised = setRoutine(main, at);
    at += 8;
  }
  const [byte7] = instruction(main, at, [0x117c, null, 0x0007], "a handler's byte 7");
  at += 6;
  let anchor: number, mirroredAnchor: number;
  if (word(main, at) === 0x0810) {
    instruction(main, at, [0x0810, 0x0000], "a handler's test of mirroring");
    const plain = branch(main, at + 4, 0x6700, "a handler's anchor unmirrored");
    mirroredAnchor = setAnchor(main, at + 8);
    anchor = setAnchor(main, plain);
  } else anchor = mirroredAnchor = setAnchor(main, at);
  return { ground, raised, anchor, mirroredAnchor, shadows: (byte7! & 4) !== 0 };
}

/**
 * A scenery entry's routine, anchor and shadows by its drawing (`readDrawings`), mirrored by flags bit 0 and raised
 * where y is not 0, and the palette its routine draws it in whatever its entry's; null where no drawing is its.
 */
export function sceneryRoutine(
  main: Uint8Array,
  flags: number,
  y: number,
): { routine: number; anchor: number; shadows: boolean; palette?: number } | null {
  const drawing = readDrawings(main)[flags >> 4];
  if (drawing === undefined) return null;
  const routine = y ? drawing.raised : drawing.ground;
  const { palettes } = OBJECT_ROUTINES.get(routine)!;
  return {
    routine,
    anchor: flags & 1 ? drawing.mirroredAnchor : drawing.anchor,
    shadows: drawing.shadows,
    ...(palettes === undefined ? {} : { palette: main[palettes + PALETTES_NEAREST]! }),
  };
}

/** An object's approach: the main CPU's table at 0x28000, a long a road line for each advance of 0 to 15 a tick. */
export const APPROACH = 0x28000;
