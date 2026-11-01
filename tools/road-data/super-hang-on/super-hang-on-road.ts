/**
 * SUPER HANG-ON's road data as its programs hold it ([SUPER HANG-ON road data](../../../docs/super-hang-on-road-data.md)):
 * the courses and their sections, each section's colors, curves, heights and scenery, and the goal on the main CPU; the
 * road paths and height tables on the sub CPU. Every reader takes a program as the 68000 addresses it and returns the
 * table's entries as numbers, without interpreting them further.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import {
  readColors,
  readCurves,
  readPath,
  readScenery,
  type CurvePoint,
  type Path,
  type SceneryPoint,
} from '../out-run-hardware/road-tables.js';
import { entries, instruction, long, sword, u8, word } from '../sega-16/program-words.js';
import type { SuperHangOnPrograms } from './super-hang-on-rom.js';

/** Main CPU: sections' blocks, the courses' sections, names and counts, scenery types, the goal's tables, stripes. */
const SECTION_BLOCKS = 0x8aec;
const COURSE_SECTIONS = 0x8b4c;
/** The course table has a row of nine section numbers a course, its sections first. */
export const COURSE_ROW = 9;
const SECTION_COUNTS = 0x8870;
const STAGE_COUNTS = 0x8874;
const COURSE_NAMES = 0x586e;
const COURSE_NAME = { stride: 9, length: 7 } as const;
export const COURSE_COUNT = 4;
const SCENERY_TYPES = 0x13f04;
const GOAL_TABLES = 0x1801a;
/** Sub CPU: the sections' road paths, the goal's and the height tables. */
const SECTION_PATHS = 0x19e8;
const GOAL_PATH_LOAD = 0x11b2;
const HEIGHT_TABLES = 0x1a48;
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

/**
 * The ticks the main CPU takes to change a section's background and colors from position `transition` (M 0x66E6 sets
 * $261026 there; [SUPER HANG-ON's chapter](../../../docs/super-hang-on-road-data.md#super-hang-ons-programs)). The section
 * task (M 0x6664, the table at 0x51A8) runs once a main loop's pass, which waits for the frame interrupt (M 0x149C): a
 * tick a frame. That tick clears the background and starts drawing it; each next tick M 0x697E mixes the colors by a
 * factor gaining `addi.w #$80, $261028` (M 0x69BC) until its high byte passes `cmpi.b #$1F, $261028` (M 0x69C4), and
 * the frame interrupt then writes all the next colors (M 0x18B6, from M 0x134C). The tick that begins it and the mixes.
 */
export function stageChangeTicks(main: Uint8Array) {
  const [step] = instruction(main, 0x69bc, [0x0679, null, 0x0026, 0x1028], "the colors' factor's step");
  const [last] = instruction(main, 0x69c4, [0x0c39, null, 0x0026, 0x1028], "the colors' factor's end");
  return 1 + ((last! + 1) << 8) / step!;
}

/** A pair of palette words, half 0 then half 1, and their RGB555. */
export interface ColorPair {
  readonly words: readonly [number, number];
  readonly rgb555: readonly [number, number];
}
const pair = (p: Uint8Array, a: number): ColorPair => {
  const { words, rgb555 } = readColors(p, a, 2);
  return { words: [words[0]!, words[1]!], rgb555: [rgb555[0]!, rgb555[1]!] };
};

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
        throw romDiffers(`The height point at 0x${a.toString(16)} has words beyond its table's`);
      return { position: word(p, a), table: word(p, a + 2) };
    },
  );

/** Scenery points as OUTRUN's (`readScenery`), a count lasting 16 steps; ending at a negative position. */
const readSceneryPoints = (p: Uint8Array, address: number): SceneryPoint[] =>
  readScenery(p, address, (position) => position >= 0x8000);

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
  const sky = readColors(main, pointer(0), SKY_WORDS);
  for (const [k, after] of [1, 2, 3, 4].map((k) => [k, pointer(0) + 2 * SKY_WORDS + 4 * (k - 1)] as const))
    if (pointer(k) !== after)
      throw romDiffers(`Section 0x${number.toString(16)}'s road colors do not follow its sky's words`);
  return {
    number,
    block,
    sky,
    colors: {
      centreLine: pair(main, pointer(1)),
      edges: pair(main, pointer(2)),
      lines: pair(main, pointer(3)),
      surface: pair(main, pointer(4)),
      ground: pair(main, pointer(5)),
    },
    curves: readCurves(main, pointer(6)),
    heights: readHeights(main, pointer(7)),
    scenery: readSceneryPoints(main, pointer(8)),
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
 * stages its byte at 0x8874 + c less one, its name the characters at 0x586E + 9c. No section runs in two courses, else
 * the ROM differs from this reading.
 */
export function readCourses(main: Uint8Array): Course[] {
  const courses = Array.from({ length: COURSE_COUNT }, (_, c) => {
    const count = u8(main, SECTION_COUNTS + c);
    const name = String.fromCharCode(
      ...main.subarray(
        COURSE_NAMES + COURSE_NAME.stride * c,
        COURSE_NAMES + COURSE_NAME.stride * c + COURSE_NAME.length,
      ),
    ).trimEnd();
    return {
      name,
      sections: Array.from({ length: count }, (_, i) => word(main, COURSE_SECTIONS + 2 * (COURSE_ROW * c + i))),
      stages: u8(main, STAGE_COUNTS + c) - 1,
    };
  });
  const numbers = courses.flatMap((c) => c.sections);
  if (new Set(numbers).size !== numbers.length) throw romDiffers('A section runs in more than one course');
  return courses;
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
 * scenery's at 0x18022 + 4c; its road path the one the sub CPU's `move.l #path, ($604F0).l` at 0x11B2 loads: its
 * straight entries (0, 4096) from the first, 200, the next not straight.
 */
export function readGoal({ main, sub }: SuperHangOnPrograms): Goal {
  const [high, low] = instruction(sub, GOAL_PATH_LOAD, [0x23fc, null, null, 0x0006, 0x04f0], "the goal's road path");
  const address = high! * 0x10000 + low!;
  let straight = 0;
  while (sword(sub, address + 4 * straight) === 0 && sword(sub, address + 4 * straight + 2) === 4096) straight++;
  if (straight === 0) throw romDiffers("The goal's road path is not a straight ahead");
  const path = readPath(sub, address, straight);
  return {
    curves: readCurves(main, long(main, GOAL_TABLES)),
    heights: readHeights(main, long(main, GOAL_TABLES + 4)),
    scenery: Array.from({ length: COURSE_COUNT }, (_, c) =>
      readSceneryPoints(main, long(main, GOAL_TABLES + 8 + 4 * c)),
    ),
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
        throw romDiffers(`Scenery type ${type}'s item at 0x${a.toString(16)} has flags beyond mirroring`);
      return { mirrored: u8(main, a) === 1, x: sword(main, a + 2), sprite: u8(main, a + 4), palette: u8(main, a + 5) };
    },
  );
  return { address, pattern: word(main, address), items };
}

/**
 * Height table `table` (1 from), the long at 0x1A48 + 4 × (table − 1) on the sub CPU: vertical heading vectors {signed
 * word x, signed word y}, (0, 4096) level, until (0, 0).
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
 * How the program copies the stripes to the road's line colors each frame (0x16EA): its phase's bits (`andi.w #$1F`,
 * 32 phases), the table (`lea.l $EA6A, a0`) and a phase's 192 words, one a road line (`asl.w #6; × 3; × 2` bytes).
 */
export function stripeCopy(main: Uint8Array) {
  const [mask, high, low] = instruction(
    main,
    0x16ea,
    [0x3039, 0x0026, 0x0090, 0x0240, null, 0xed40, 0x3200, 0xd040, 0xd041, 0xd040, 0x41f9, null, null],
    "the stripes' copy",
  );
  return { phases: mask! + 1, table: high! * 0x10000 + low!, rows: (64 * 3 * 2) / 2 };
}

/**
 * The stripes' tables (`stripeCopy`): one a phase, of a word for each road line. Bits 0, 1, 3 and 8 (surface, lines,
 * centre line, ground) choose half 1, and switch together; bit 2 (edges) switches twice as often.
 */
export function readStripes(main: Uint8Array): number[][] {
  const { phases, table, rows } = stripeCopy(main);
  return Array.from({ length: phases }, (_, phase) =>
    Array.from({ length: rows }, (_, row) => word(main, table + 2 * (rows * phase + row))),
  );
}

/** A color's stripes over the period: the share of it each pair of halves takes and the half phase 0 shows. */
export interface StripeRate {
  readonly share: number;
  readonly first: 0 | 1;
}

/**
 * Each color's stripes as the bike's line shows them (`readStripes`' last row) over the phases: bit 0 the surface,
 * 1 the lines, 2 the edge bands, 3 the centre line and 8 the ground, each switching between its halves in equal runs,
 * the period's whole or a part of it.
 */
export function stripeRates(stripes: readonly (readonly number[])[]) {
  const rate = (bit: number): StripeRate => {
    const bits = stripes.map((rows) => (rows.at(-1)! >> bit) & 1);
    for (let run = bits.length / 2; run >= 1; run /= 2)
      if (bits.every((b, k) => b === (bits[0]! ^ (Math.floor(k / run) & 1))))
        return { share: (2 * run) / bits.length, first: bits[0] as 0 | 1 };
    throw romDiffers(`The stripes' bit ${bit} does not switch in equal runs`);
  };
  return { surface: rate(0), lines: rate(1), edges: rate(2), centreLine: rate(3), ground: rate(8) };
}
