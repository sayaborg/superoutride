/**
 * The course tables of JALECO's driving board ([BIG RUN road data](../../../docs/big-run-road-data.md#its-course-tables)):
 * each stage's two roads, each a table of straights and arcs and a 3D road of straights and vertical arcs, held by the
 * road CPU that draws it, read where an original's road CPUs hold them (`RoadTablesAt`); each table found by the
 * instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';

/** The board's two roads: road N the Nth road CPU's, which it draws from its stage's tables. */
export type RoadNumber = 1 | 2;

/** Where an original's road CPUs read their tables. */
export interface RoadTablesAt {
  /** Its stages. */
  readonly stages: number;
  /** Each road CPU's `lea` of its stage tables, [road 1's, road 2's]. */
  readonly stageTables: readonly [number, number];
  /** A plan record's and a profile record's bytes. */
  readonly planBytes: number;
  readonly profileBytes: number;
  /** A turn of a heading or a grade, its units. */
  readonly turnUnits: number;
}

/** Radians a unit of an original's heading or grade. */
export const angleRadians = (tables: RoadTablesAt) => (2 * Math.PI) / tables.turnUnits;

/**
 * A plan record: where it starts (positions), its radius (0 a straight) and side, its heading and its position in the
 * plane where it starts, and its road's picture's kind and variant (+0x16, +0x18).
 */
export interface RoadPlanRecord {
  readonly start: number;
  readonly radius: number;
  /** The side its arc turns to on the screen: right where its flag's top bit is set. */
  readonly side: 'left' | 'right';
  /** Its heading, units of the original's turn, increasing to the right. */
  readonly heading: number;
  /** Its position: the table's +0xA along heading 0, and its +6 along a quarter turn to the right. */
  readonly x: number;
  readonly y: number;
  readonly kind: number;
  readonly variant: number;
}

/**
 * A profile record: where it starts, its vertical radius (0 a straight) and whether its grade rises along it (its flag's
 * top bit), its height and its grade where it starts (units of the original's turn, up positive).
 */
export interface RoadProfileRecord {
  readonly start: number;
  readonly radius: number;
  readonly rising: boolean;
  readonly height: number;
  readonly grade: number;
}

/** A stage's road: its plan's and its profile's records. */
export interface RoadTables {
  readonly plan: readonly RoadPlanRecord[];
  readonly profile: readonly RoadProfileRecord[];
}

const STAGE_BYTES = 16;
const NO_START = 0xffffffff;

/**
 * Each road's tables: its road CPU takes its stage's four pointers (its plan's starts and records, its profile's) from a
 * table 16 bytes a stage (lea, asl.w #4, four movea.l).
 */
function stageTable(program: Uint8Array, tables: RoadTablesAt, road: RoadNumber) {
  const at = tables.stageTables[road - 1]!;
  const [disp] = instruction(
    program,
    at,
    [0x41fa, null, 0xe940, 0xd0c0, 0x2258, 0x2458, 0x2858, 0x2a58],
    "a road's stage tables (lea, asl.w #4)",
  );
  return at + 2 + ((disp << 16) >> 16);
}

/** A table's starts from `at`, up to `end`: increasing, ending at one no later than the one before or at 0xFFFFFFFF. */
function starts(program: Uint8Array, at: number, end: number) {
  const out: number[] = [];
  for (let a = at; a + 4 <= program.length; a += 4) {
    const s = long(program, a);
    if (s === NO_START || (out.length > 0 && s <= out.at(-1)!) || s >= end) break;
    out.push(s);
  }
  if (!out.length || out[0] !== 0) throw romDiffers(`A road table at 0x${at.toString(16)} does not start at 0`);
  return out;
}

/**
 * Road `road`'s tables in stage `stage`, from `program`, its road CPU's, their records to the first
 * starting at `end` or later: a plan record's flag (+0), radius (+2), position (+6, +0xA), heading (+0xE), picture
 * (+0x16, +0x18); a profile record's flag (+0), radius (+2), height (+6) and grade (+0xE).
 */
export function roadTables(
  program: Uint8Array,
  tables: RoadTablesAt,
  road: RoadNumber,
  stage: number,
  end: number,
): RoadTables {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < tables.stages))
    throw new RangeError(`There is no stage ${stage}`);
  const at = stageTable(program, tables, road) + STAGE_BYTES * stage;
  const [planStarts, plan, profileStarts, profile] = [0, 4, 8, 12].map((k) => long(program, at + k)) as [
    number,
    number,
    number,
    number,
  ];
  return {
    plan: starts(program, planStarts, end).map((start, k) => {
      const r = plan + tables.planBytes * k;
      return {
        start,
        radius: word(program, r + 2),
        side: word(program, r) & 0x8000 ? 'right' : 'left',
        heading: word(program, r + 0xe),
        x: long(program, r + 0xa) | 0,
        y: long(program, r + 6) | 0,
        kind: word(program, r + 0x16),
        variant: word(program, r + 0x18),
      };
    }),
    profile: starts(program, profileStarts, end).map((start, k) => {
      const r = profile + tables.profileBytes * k;
      return {
        start,
        radius: word(program, r + 2),
        rising: (word(program, r) & 0x8000) !== 0,
        height: long(program, r + 6) | 0,
        grade: sword(program, r + 0xe),
      };
    }),
  };
}

/** A stretch the main program holds the car on a road over, positions `[from, to)`. */
export interface HeldStretch {
  readonly road: RoadNumber;
  readonly from: number;
  readonly to: number;
}

/** A held record's flag: bit 1 of its flags at +8. */
const HELD_FLAG = 2;

/**
 * The stretches the main program holds the car on a road over in stage `stage`, from its table at `table` of each stage's
 * lists of the roads' records (16 bytes a stage, road 1's at +8 and road 2's at +12, each record `bytes` long, its end at
 * +4 and its flags at +8): a record whose flags' bit 1 is set holds the car on its road from the end of the record before
 * to its own end, joined where they follow one another; a list's first record ending at 0 lies before the road
 * (CISCO HEAT's), and the list ends at a record ending no later than the one before.
 */
export function heldStretches(main: Uint8Array, table: number, bytes: number, stage: number): readonly HeldStretch[] {
  const out: HeldStretch[] = [];
  for (const road of [1, 2] as const) {
    let [at, from] = [long(main, table + 16 * stage + (road === 1 ? 8 : 12)), 0];
    if (long(main, at + 4) === 0) at += bytes;
    for (;;) {
      const end = long(main, at + 4);
      if (end <= from) break;
      if (word(main, at + 8) & HELD_FLAG) {
        const last = out.at(-1);
        if (last && last.road === road && last.to === from) out[out.length - 1] = { ...last, to: end };
        else out.push({ road, from, to: end });
      }
      [at, from] = [at + bytes, end];
    }
  }
  return out.sort((a, b) => a.from - b.from);
}
