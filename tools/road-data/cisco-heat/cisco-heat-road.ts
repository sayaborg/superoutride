/**
 * CISCO HEAT's course tables ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-course-tables)): where
 * its road CPUs hold the board's (`jaleco/road-tables`), and the stretches its main program holds the car on a road
 * over; each table found by the instruction that reads it.
 */
import { instruction } from '../cpu/program-words.js';
import { heldStretches, type HeldStretch, type RoadTablesAt } from '../jaleco/road-tables.js';
import { STAGES } from './cisco-heat-backgrounds.js';

/**
 * Where CISCO HEAT's road CPUs read their tables: a stage's four pointers from a table 16 bytes a stage (R1 0x1652 for
 * road 1, R2 0x1642 for road 2); a plan record 28 bytes, a profile record 24; a turn of a heading or a grade 65,536.
 */
export const CISCO_HEAT_TABLES: RoadTablesAt = Object.freeze({
  stages: STAGES,
  stageTables: Object.freeze([0x1652, 0x1642] as const),
  planBytes: 28,
  profileBytes: 24,
  turnUnits: 0x10000,
});

/** The main program's lists of the roads' records: 20 bytes each. */
const HELD_BYTES = 20;

/**
 * The stretches the main program holds the car on a road over in stage `stage` (M 0x220E to 0x2228, 0x5D84 to 0x5D96,
 * 0x7718 to 0x7734): its four lists a stage from its table (16 bytes a stage, by `$f011a`), road 1's its third, read as
 * the player's +0x58, and road 2's its fourth, +0x5C (`heldStretches`).
 */
export function ciscoHeatHeld(main: Uint8Array, stage: number): readonly HeldStretch[] {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  const [disp] = instruction(main, 0x220e, [0x41fa, null], "the main's lists of the roads (lea pc)");
  instruction(main, 0x221e, [0xe940], 'a stage of 16 bytes (asl.w #4)');
  instruction(main, 0x5d92, [0x2d58, 0x0058, 0x2d50, 0x005c], "the roads' lists (+0x58, +0x5C)");
  instruction(main, 0x7718, [0x206e, 0x0058, 0x3028, 0x0008, 0x0800, 0x0001], "road 1's hold (btst #1)");
  return heldStretches(main, 0x2210 + ((disp << 16) >> 16), HELD_BYTES, stage);
}
