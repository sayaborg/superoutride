/**
 * BIG RUN's course tables ([BIG RUN road data](../../../docs/big-run-road-data.md#its-course-tables)): where its road
 * CPUs hold the board's (`jaleco/road-tables`); each stage's goal, checkpoint and grid, held by the main program; a road position's length; each table
 * found by the instruction that reads it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { heldStretches, type HeldStretch, type RoadNumber, type RoadTablesAt } from '../jaleco/road-tables.js';
import type { ArcPlanLimits } from '../shared/arc-plan.js';
import { metresAPosition } from '../shared/road-position.js';
import { STAGES } from './big-run-backgrounds.js';

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
 * Where BIG RUN's road CPUs read their tables: a stage's four pointers from a table 16 bytes a stage (R1 0xA1E for road
 * 1, R2 0xA0E for road 2); a plan record 26 bytes, a profile record 24; a turn of a heading or a grade 16,384.
 */
export const BIG_RUN_TABLES: RoadTablesAt = Object.freeze({
  stages: STAGES,
  stageTables: Object.freeze([0xa1e, 0xa0e] as const),
  planBytes: 26,
  profileBytes: 24,
  turnUnits: 0x4000,
});

/** How far a record may depart from its table's next heading and position (K, 2026-11-09; record by record, 2026-11-11). */
export const PLAN_LIMITS: ArcPlanLimits = Object.freeze({ heading: (0.03 * Math.PI) / 180, position: 14 });

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
  readonly road: RoadNumber;
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

/** The main program's copy of a road's profile records: 10 bytes each. */
const HELD_BYTES = 10;

/**
 * The stretches the main program holds the car on a road over in stage `stage` (M 0xEDE to 0xF02, 0x4B2E to 0x4BEE):
 * its copies of the roads' profile records, 16 bytes a stage, road 1's read as `$f0154` and road 2's as `$f0158`
 * (`heldStretches`).
 */
export function bigRunHeld(main: Uint8Array, stage: number): readonly HeldStretch[] {
  const table = pcTable(main, 0xede, "the main's copies of the roads");
  instruction(main, 0xee8, [0xe948], 'a stage of 16 bytes (lsl.w #4)');
  instruction(main, 0xefa, [0x23f0, 0x0008, 0x000f, 0x0154], "road 1's copy ($f0154)");
  instruction(main, 0xf02, [0x23f0, 0x000c, 0x000f, 0x0158], "road 2's copy ($f0158)");
  return heldStretches(main, table, HELD_BYTES, stage);
}
