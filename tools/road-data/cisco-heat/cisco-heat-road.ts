/**
 * CISCO HEAT's course tables ([CISCO HEAT road data](../../../docs/cisco-heat-road-data.md#its-course-tables)): where
 * its road CPUs hold the board's (`jaleco/road-tables`), the stretches its main program holds the car on a road over,
 * each stage's goal and checkpoint, and a road position's length; each table found by the instruction that reads it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { heldStretches, type HeldStretch, type RoadTablesAt } from '../jaleco/road-tables.js';
import { metresAPosition } from '../shared/road-position.js';
import { STAGES } from './cisco-heat-backgrounds.js';

/** The interval of CISCO HEAT's tick: BIG RUN's, its main loop waiting for every second frame. */
export const TICK_SECONDS = 1 / 30;

/** The table its speedometer reads a speed's digits from (M 0x3B00): three words an index. */
const SPEED_DIGITS = 0x3b00;

/**
 * The speed its speedometer shows a unit of the car's speed, km/h (M 0x15CBA): the speed (`$f319a`, 16.16 units) held
 * within 0 and its top (the `cmpi.l` at 0x15CCA, 160 units), four times its whole units the index of its three digits
 * (M 0x3B00, 6 bytes an index; each word 0 a blank or 4(k + 1) digit k, the offset of its picture at M 0x15EBA): the
 * speed shown at its top over its top, 280 km/h at 160 units. With its switch for miles (`$f000a` bit 6) it first takes
 * the index times 0x9FC4 or 0xA08C ÷ 65,536; the conversion reads the kilometres.
 */
export function speedometerKmh(main: Uint8Array): number {
  const [high, low] = instruction(main, 0x15cca, [0x0c80, null, null], "the speedometer's top (cmpi.l)");
  instruction(main, 0x15cda, [0xd080, 0xd080, 0x4840], 'four times the speed, its whole units (add.l, add.l, swap)');
  instruction(main, 0x15d0c, [0x49f9, SPEED_DIGITS >>> 16, SPEED_DIGITS & 0xffff], "the speed's digits (lea.l)");
  const top = (high * 0x10000 + low) / 0x10000;
  const at = SPEED_DIGITS + 6 * Math.floor(4 * top);
  const shown = [0, 2, 4].reduce((n, k) => {
    const w = word(main, at + k);
    if (w === 0) return n;
    if (!(w % 4 === 0 && w >= 4 && w <= 40)) throw new Error(`A speed's digit at ${at + k} is ${w}`);
    return 10 * n + (w / 4 - 1);
  }, 0);
  return shown / top;
}

/**
 * A road position, metres: a unit of the car's speed shows `speedometerKmh` and gains the road a position a tick
 * ([Stage CS](../../../docs/NEXT.md#stage-cs--cisco-heat-from-the-roms), K, 2026-11-09).
 */
export const positionMetres = (main: Uint8Array): number => metresAPosition(speedometerKmh(main), TICK_SECONDS, 1);

/** The long a stage the main program reads from the table of a `lea d(pc), a0` at `at` (by `$f011a`, 4 bytes). */
function stageLong(main: Uint8Array, at: number, what: string, stage: number): number {
  if (!(Number.isInteger(stage) && stage >= 0 && stage < STAGES))
    throw new RangeError(`CISCO HEAT has no stage ${stage}`);
  const [disp] = instruction(main, at, [0x41fa, null], `${what} (lea pc)`);
  return long(main, at + 2 + ((disp << 16) >> 16) + 4 * stage);
}

/**
 * A stage's goal, positions (M 0x224E, to `$f0234`): 350,000 in STAGE 1 and 600,000 in the others. The program ends
 * the stage where its car's position plus 90 (`$f02c0`, M 0x5FC0) reaches it (M 0x17B44).
 */
export function stageGoal(main: Uint8Array, stage: number): number {
  instruction(main, 0x2254, [0x23f0, 0x1000, 0x000f, 0x0234], "the stage's goal (move.l to $f0234)");
  instruction(main, 0x17b44, [0x2239, 0x000f, 0x02c0, 0xb2b9, 0x000f, 0x0234], 'its end (cmp.l $f0234)');
  return stageLong(main, 0x224e, "the stages' goals", stage);
}

/**
 * A stage's checkpoint, positions (M 0x225C, to `$f0250`: where the car's position plus 90 passes it, the program sets
 * `$f025c` bit 6 and a count of 90 frames, M 0x18010), or none where it lies past its goal (STAGE 1's, at 800,000).
 */
export function stageCheckpoint(main: Uint8Array, stage: number): number | null {
  instruction(main, 0x2262, [0x23f0, 0x1000, 0x000f, 0x0250], "the stage's checkpoint (move.l to $f0250)");
  const at = stageLong(main, 0x225c, "the stages' checkpoints", stage);
  return at < stageGoal(main, stage) ? at : null;
}

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
