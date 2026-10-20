/**
 * SUPER HANG-ON's road data as its programs hold it ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * the courses and their sections, each section's colors, curves, heights and scenery, and the goal on the main CPU; the
 * road paths and height tables on the sub CPU. Every reader takes a program as the 68000 addresses it and returns the
 * table's entries as numbers, without interpreting them further.
 */
import { paletteRgb555 } from './outrun-road.js';
import { entries, instruction, long, sword, u8, word } from './program-words.js';
import type { SuperHangOnPrograms } from './super-hang-on-rom.js';

/** Main CPU: sections' blocks, the courses' sections, names and counts, scenery types, the goal's tables, stripes. */
const SECTION_BLOCKS = 0x8aec;
const COURSE_SECTIONS = 0x8b4c;
/** The course table has a row of nine section numbers a course, its sections first. */
const COURSE_ROW = 9;
const SECTION_COUNTS = 0x8870;
const STAGE_COUNTS = 0x8874;
const COURSE_NAMES = 0x586e;
const COURSE_NAME = { stride: 9, length: 7 } as const;
export const COURSE_COUNT = 4;
const SCENERY_TYPES = 0x13f04;
const GOAL_TABLES = 0x1801a;
const STRIPES = 0xea6a;
export const STRIPE_PHASES = 32;
const STRIPE_ROWS = 192;
/** Sub CPU: the sections' road paths, the goal's and the height tables. */
const SECTION_PATHS = 0x19e8;
const GOAL_PATH_LOAD = 0x11b2;
const HEIGHT_TABLES = 0x1a48;
/** The goal's road path: a straight of this many positions. */
const GOAL_PATH_POSITIONS = 200;
/** A sky: 32 palette words, then the road's 8 (four pairs). */
const SKY_WORDS = 32;

/**
 * The main CPU's comparisons that fix a section's length, the position where the next section's background comes in,
 * and the goal's: `cmpi.w #$800, ($260030).l` at 0x676E (past it the next section begins), `cmpi.w #$78A, d0` at 0x6678
 * and `cmpi.w #$23, ($260030).l` at 0x6342 (past it the race ends).
 */
export function sectionPositions(main: Uint8Array) {
  const [last] = instruction(main, 0x676e, [0x0c79, null, 0x0026, 0x0030], "the section's end");
  const [transition] = instruction(main, 0x6678, [0x0c40, null], "the next section's background");
  const [finish] = instruction(main, 0x6342, [0x0c79, null, 0x0026, 0x0030], "the race's end");
  return { length: last! + 1, transition: transition!, finish: finish! };
}

/** A pair of palette words, half 0 then half 1, and their RGB555. */
export interface ColorPair {
  readonly words: readonly [number, number];
  readonly rgb555: readonly [number, number];
}
const pair = (p: Uint8Array, a: number): ColorPair => {
  const words = [word(p, a), word(p, a + 2)] as const;
  return { words, rgb555: [paletteRgb555(words[0]), paletteRgb555(words[1])] };
};

/** A curve's start: its position, radius in positions and kind (1 straight, 2 right, 3 left). */
export interface CurvePoint {
  readonly position: number;
  readonly radius: number;
  readonly kind: number;
}
/** {signed word position, word radius, word kind}, ending at position −1. */
const readCurves = (p: Uint8Array, address: number): CurvePoint[] =>
  entries(
    address,
    6,
    (a) => sword(p, a) === -1,
    (a) => ({ position: sword(p, a), radius: word(p, a + 2), kind: word(p, a + 4) }),
  );

/** A height point: from its position the road's vertical heading follows height table `table` (1 from). */
export interface HeightPoint {
  readonly position: number;
  readonly table: number;
}
/** {word position, word table, word 0, word 0}, ending at position 0x7FFF. */
const readHeights = (p: Uint8Array, address: number): HeightPoint[] =>
  entries(
    address,
    8,
    (a) => word(p, a) === 0x7fff,
    (a) => {
      if (word(p, a + 4) || word(p, a + 6))
        throw new RangeError(`The height point at 0x${a.toString(16)} has words beyond its table's`);
      return { position: word(p, a), table: word(p, a + 2) };
    },
  );

/** A scenery point: from its position, `count` × 16 steps of scenery type `type`. */
export interface SceneryPoint {
  readonly position: number;
  readonly count: number;
  readonly type: number;
}
/** {word position, u8 count, u8 type}, ending at a negative position. */
const readScenery = (p: Uint8Array, address: number): SceneryPoint[] =>
  entries(
    address,
    4,
    (a) => sword(p, a) < 0,
    (a) => ({ position: word(p, a), count: u8(p, a + 2), type: u8(p, a + 3) }),
  );

/** A road path: per position a heading vector {signed word x, signed word y}, its address. */
export interface Path {
  readonly address: number;
  readonly x: readonly number[];
  readonly y: readonly number[];
}
function readPath(sub: Uint8Array, address: number, positions: number): Path {
  const x: number[] = [],
    y: number[] = [];
  for (let i = 0; i < positions; i++) {
    x.push(sword(sub, address + 4 * i));
    y.push(sword(sub, address + 4 * i + 2));
  }
  return { address, x, y };
}

/**
 * A section: its block's address and colors, its curves, heights and scenery on the main CPU and its road path on the
 * sub CPU. The colors are the road hardware's: it draws a pixel of value v in the palette words `0x7F6 ^ 2v`, half 0
 * or 1 by the stripes, so `surface` (pixel 0, the block's +0x10), `lines` (1, +0xC), `edges` (2, +0x8) and the centre
 * line (`centreLine`, a 3 among the middle eight columns, +0x4) are the four pairs the block lists after its sky, and the
 * ground (the other 3s) its sixth long's pair.
 */
export interface Section {
  readonly number: number;
  readonly block: number;
  readonly sky: { readonly address: number; readonly words: readonly number[]; readonly rgb555: readonly number[] };
  readonly colors: {
    readonly centreLine: ColorPair;
    readonly edges: ColorPair;
    readonly lines: ColorPair;
    readonly surface: ColorPair;
    readonly ground: ColorPair;
  };
  readonly curves: readonly CurvePoint[];
  readonly heights: readonly HeightPoint[];
  readonly scenery: readonly SceneryPoint[];
  readonly path: Path;
}

/**
 * Section `number`, the block at the long at 0x8AEC + number × 4: nine longs, the addresses of its sky (32 palette
 * words), its road's four pairs (which follow the sky's words in the ROM, as the program copies all 40 to the palette at
 * once), its ground's pair, its curves, heights and scenery; its road path, the long at 0x19E8 + number × 4 on the sub
 * CPU, a heading vector for each of its `length` positions.
 */
export function readSection({ main, sub }: SuperHangOnPrograms, number: number, length: number): Section {
  const block = long(main, SECTION_BLOCKS + 4 * number);
  const pointer = (k: number) => long(main, block + 4 * k);
  const skyWords = Array.from({ length: SKY_WORDS }, (_, i) => word(main, pointer(0) + 2 * i));
  for (const [k, after] of [1, 2, 3, 4].map((k) => [k, pointer(0) + 2 * SKY_WORDS + 4 * (k - 1)] as const))
    if (pointer(k) !== after)
      throw new RangeError(`Section 0x${number.toString(16)}'s road colors do not follow its sky's words`);
  return {
    number,
    block,
    sky: { address: pointer(0), words: skyWords, rgb555: skyWords.map(paletteRgb555) },
    colors: {
      centreLine: pair(main, pointer(1)),
      edges: pair(main, pointer(2)),
      lines: pair(main, pointer(3)),
      surface: pair(main, pointer(4)),
      ground: pair(main, pointer(5)),
    },
    curves: readCurves(main, pointer(6)),
    heights: readHeights(main, pointer(7)),
    scenery: readScenery(main, pointer(8)),
    path: readPath(sub, long(sub, SECTION_PATHS + 4 * number), length),
  };
}

/** A course: its name, its sections' numbers in the order it runs them, and its stages. */
export interface Course {
  readonly name: string;
  readonly sections: readonly number[];
  readonly stages: number;
}

/**
 * The four courses: course c's sections the first of the words at 0x8B4C + 18c, as many as its byte at 0x8870 + c, its
 * stages its byte at 0x8874 + c less one, its name the characters at 0x586E + 9c.
 */
export function readCourses(main: Uint8Array): Course[] {
  return Array.from({ length: COURSE_COUNT }, (_, c) => {
    const count = u8(main, SECTION_COUNTS + c);
    const name = String.fromCharCode(
      ...main.subarray(COURSE_NAMES + COURSE_NAME.stride * c, COURSE_NAMES + COURSE_NAME.stride * c + COURSE_NAME.length),
    ).trimEnd();
    return {
      name,
      sections: Array.from({ length: count }, (_, i) => word(main, COURSE_SECTIONS + 2 * (COURSE_ROW * c + i))),
      stages: u8(main, STAGE_COUNTS + c) - 1,
    };
  });
}

/** The goal: its curves and heights (the same for every course), each course's scenery and its road path. */
export interface Goal {
  readonly curves: readonly CurvePoint[];
  readonly heights: readonly HeightPoint[];
  readonly scenery: readonly (readonly SceneryPoint[])[];
  readonly path: Path;
}

/**
 * The goal the last section runs into: the longs at 0x1801A, its curves' and heights' addresses, then course c's
 * scenery's at 0x18022 + 4c; its road path the one the sub CPU's `move.l #path, ($604F0).l` at 0x11B2 loads,
 * a straight of 200 positions.
 */
export function readGoal({ main, sub }: SuperHangOnPrograms): Goal {
  const [high, low] = instruction(sub, GOAL_PATH_LOAD, [0x23fc, null, null, 0x0006, 0x04f0], "the goal's road path");
  const path = readPath(sub, high! * 0x10000 + low!, GOAL_PATH_POSITIONS);
  if (path.x.some((x, i) => x !== 0 || path.y[i] !== 4096))
    throw new RangeError("The goal's road path is not a straight ahead");
  return {
    curves: readCurves(main, long(main, GOAL_TABLES)),
    heights: readHeights(main, long(main, GOAL_TABLES + 4)),
    scenery: Array.from({ length: COURSE_COUNT }, (_, c) => readScenery(main, long(main, GOAL_TABLES + 8 + 4 * c))),
    path,
  };
}

/** A scenery type's item: mirrored or not, its x (units from the road's centre, right positive), sprite and palette. */
export interface SceneryItem {
  readonly mirrored: boolean;
  readonly x: number;
  readonly sprite: number;
  readonly palette: number;
}
/**
 * Scenery type `type`, the long at 0x13F04 + type × 4: {word pattern}, then 6-byte items {u8 flags (bit 0 mirrors), u8 0,
 * signed word x, u8 sprite, u8 palette} until a flags byte with bit 7 set.
 */
export function readSceneryType(main: Uint8Array, type: number) {
  const address = long(main, SCENERY_TYPES + 4 * type);
  const items = entries(
    address + 2,
    6,
    (a) => (u8(main, a) & 0x80) !== 0,
    (a): SceneryItem => {
      if (u8(main, a) > 1 || u8(main, a + 1))
        throw new RangeError(`Scenery type ${type}'s item at 0x${a.toString(16)} has flags beyond mirroring`);
      return { mirrored: u8(main, a) === 1, x: sword(main, a + 2), sprite: u8(main, a + 4), palette: u8(main, a + 5) };
    },
  );
  return { address, pattern: word(main, address), items };
}

/**
 * Height table `table` (1 from), the long at 0x1A48 + 4 × (table − 1) on the sub CPU: vertical heading vectors {signed
 * word x, signed word y}, (0, 4096) level, until (0, 0). Kept for the hills to come; the road is level in this stage.
 */
export function readHeightTable(sub: Uint8Array, table: number) {
  const address = long(sub, HEIGHT_TABLES + 4 * (table - 1));
  const vectors = entries(
    address,
    4,
    (a) => word(sub, a) === 0 && word(sub, a + 2) === 0,
    (a) => [sword(sub, a), sword(sub, a + 2)] as const,
  );
  return { address, vectors };
}

/**
 * The stripes' tables at 0xEA6A: 32, one a phase, of a word for each road line (192), which the program copies to the
 * road's line colors. Bits 0, 1, 3 and 8 (surface, lines, centre line, ground) choose half 1, and switch together; bit 2
 * (edges) switches twice as often.
 */
export function readStripes(main: Uint8Array): number[][] {
  return Array.from({ length: STRIPE_PHASES }, (_, phase) =>
    Array.from({ length: STRIPE_ROWS }, (_, row) => word(main, STRIPES + 2 * (STRIPE_ROWS * phase + row))),
  );
}
