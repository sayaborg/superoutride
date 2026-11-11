/**
 * BIG RUN's course tables ([BIG RUN road data](../../../docs/big-run-road-data.md#its-course-tables)): each stage's two
 * roads, each a table of straights and arcs and a 3D road of straights and vertical arcs, held by the road CPU that
 * draws it; each stage's goal, checkpoint and grid, held by the main program; a road position's length; each table
 * found by the instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { metresAPosition } from '../shared/road-position.js';
import { STAGES } from './big-run-backgrounds.js';

/** BIG RUN's two roads: road N the Nth road CPU's, which it draws from its stage's tables. */
export type BigRunRoad = 1 | 2;

/** A turn of a heading or a grade: 16,384. */
const TURN_UNITS = 0x4000;
/** Radians a unit of a heading or a grade. */
export const ANGLE_RADIANS = (2 * Math.PI) / TURN_UNITS;

/** The interval of BIG RUN's tick: its main loop waits for interrupt 4, every second frame (K, 2026-11-08). */
export const TICK_SECONDS = 1 / 30;

/**
 * A road position, metres: a speed unit shows 0xB6DB / 65,536 km/h (M 0x15DEA) and gains the road half a position a tick
 * straight ahead (M 0x3248: the speed halved, times the heading's cosine).
 */
export function positionMetres(main: Uint8Array): number {
  const [kmh] = instruction(main, 0x15dea, [0x3039, 0x000f, 0x3056, 0xc0fc, null, 0x4840], 'the speed shown (mulu.w)');
  instruction(main, 0x3248, [0x382e, 0x0016, 0xe24c], "the speed's advance (lsr.w #1)");
  return metresAPosition(kmh / 0x10000, TICK_SECONDS, 1 / 2);
}

/**
 * A plan record: where it starts (positions), its radius (0 a straight) and side, its heading and its position in the
 * plane where it starts, and its road's picture's kind and variant (+0x16, +0x18).
 */
export interface BigRunPlanRecord {
  readonly start: number;
  readonly radius: number;
  /** The side its arc turns to on the screen: right where its flag's top bit is set. */
  readonly side: 'left' | 'right';
  /** Its heading, units of `TURN_UNITS` a turn, increasing to the right. */
  readonly heading: number;
  /** Its position: the table's +0xA along heading 0, and its +6 along a quarter turn to the right. */
  readonly x: number;
  readonly y: number;
  readonly kind: number;
  readonly variant: number;
}

/**
 * A profile record: where it starts, its vertical radius (0 a straight) and whether its grade rises along it (its flag's
 * top bit), its height and its grade where it starts (units of `TURN_UNITS` a turn, up positive).
 */
export interface BigRunProfileRecord {
  readonly start: number;
  readonly radius: number;
  readonly rising: boolean;
  readonly height: number;
  readonly grade: number;
}

/** A stage's road: its plan's and its profile's records. */
export interface BigRunRoadTables {
  readonly plan: readonly BigRunPlanRecord[];
  readonly profile: readonly BigRunProfileRecord[];
}

const PLAN_BYTES = 26;
const PROFILE_BYTES = 24;
const STAGE_BYTES = 16;
const NO_START = 0xffffffff;

/**
 * Each road's tables: its road CPU takes its stage's four pointers (its plan's starts and records, its profile's) from a
 * table 16 bytes a stage (R1 0xA1E for road 1, R2 0xA0E for road 2: lea, asl.w #4, four movea.l).
 */
function stageTable(program: Uint8Array, road: BigRunRoad) {
  const at = road === 1 ? 0xa1e : 0xa0e;
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
export function bigRunRoad(program: Uint8Array, road: BigRunRoad, stage: number, end: number): BigRunRoadTables {
  if (!(stage >= 0 && stage < STAGES)) throw new RangeError(`BIG RUN has no stage ${stage}`);
  const at = stageTable(program, road) + STAGE_BYTES * stage;
  const [planStarts, plan, profileStarts, profile] = [0, 4, 8, 12].map((k) => long(program, at + k)) as [
    number,
    number,
    number,
    number,
  ];
  return {
    plan: starts(program, planStarts, end).map((start, k) => {
      const r = plan + PLAN_BYTES * k;
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
      const r = profile + PROFILE_BYTES * k;
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

/** A stage's goal, positions (M 0x10A2: a long a stage). */
export function stageGoal(main: Uint8Array, stage: number): number {
  return long(main, pcTable(main, 0x10a2, "the stages' goals") + 4 * stage);
}

/** A stage's checkpoint, positions (M 0x10B8: a long a stage), or none where it lies at 999,999. */
export function stageCheckpoint(main: Uint8Array, stage: number): number | null {
  const at = long(main, pcTable(main, 0x10b8, "the stages' checkpoints") + 4 * stage);
  return at === NO_CHECKPOINT ? null : at;
}

const NO_CHECKPOINT = 999_999;

/** A car's place on a stage's grid: its lateral (units), the road it starts on and its position. */
export interface BigRunGridSlot {
  readonly lateral: number;
  readonly road: BigRunRoad;
  readonly position: number;
}

/** The grid's slots a stage, 8 bytes each (M 0xF54 to 0xF96: lsl.w #6 the stage, the slot's road at +2). */
const GRID_SLOTS = 8;

/**
 * A stage's grid: its eight slots, each its lateral (+0), the road it starts on (+2: 0 road 2, the car's `$f047e` 0;
 * any other road 1) and its position (+4).
 */
export function stageGrid(main: Uint8Array, stage: number): readonly BigRunGridSlot[] {
  const at = pcTable(main, 0xf54, "the stages' grids");
  instruction(main, 0xf60, [0xed48], 'a grid of 64 bytes (lsl.w #6)');
  return Array.from({ length: GRID_SLOTS }, (_, k) => {
    const slot = at + 64 * stage + 8 * k;
    return {
      lateral: sword(main, slot),
      road: word(main, slot + 2) === 0 ? 2 : 1,
      position: long(main, slot + 4),
    };
  });
}

/** The address a `lea d(pc), a0` at `at` takes. */
function pcTable(main: Uint8Array, at: number, what: string) {
  const [disp] = instruction(main, at, [0x41fa, null], `${what} (lea pc)`);
  return at + 2 + ((disp << 16) >> 16);
}
