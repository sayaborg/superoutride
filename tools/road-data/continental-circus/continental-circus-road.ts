/**
 * CONTINENTAL CIRCUS's courses ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md)): each
 * course's stream of records in its sub program, its lap from its line and its clock, each found by the instructions
 * that read it.
 */
import { instruction, long, sword, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { CurveInterval } from '../shared/curve-plan.js';
import { metresAPosition } from '../shared/road-position.js';
import { FRAMES_A_SECOND } from '../taito/z-system-display.js';

/** Its courses, BRAZIL to JAPAN, in the program's order (its names at M 0x46FA). */
export const COURSES = 8;

/**
 * A road position, metres: the speedometer shows the frame's step itself as km/h (M 0x37F0, the sub program setting it
 * to the speed word shifted right 5 as it advances the road by it, S 0x670C to 0x6716), its tasks running once a frame
 * (S 0x73E, 0x538).
 */
export const POSITION_METRES = metresAPosition(1, 1 / FRAMES_A_SECOND, 1);

/** A record's commands (the jump table at S 0xC0C8). */
export const COMMAND = Object.freeze({
  loop: -1,
  curve: 0,
  hill: 1,
  thing: 2,
  pitLane: 3,
  pitThing: 4,
  zone: 5,
  finish: 6,
  finishThing: 7,
} as const);

/** A command's handler in the sub program, as the jump table must send it. */
const HANDLERS: Readonly<Record<number, number>> = {
  [COMMAND.loop]: 0xc0d8,
  [COMMAND.curve]: 0xc0de,
  [COMMAND.hill]: 0xc0fc,
  [COMMAND.thing]: 0xc112,
  [COMMAND.pitLane]: 0xc25e,
  [COMMAND.pitThing]: 0xc27e,
  [COMMAND.zone]: 0xc28a,
  [COMMAND.finish]: 0xc2c6,
  [COMMAND.finishThing]: 0xc19e,
};

/** A record of a lap: its place, positions from the lap's line, its command and its argument. */
export interface LapRecord {
  readonly at: number;
  readonly command: number;
  readonly argument: number;
}

/** A course's lap from its line: its length and records, positions. */
export interface ContinentalCircusLap {
  readonly length: number;
  readonly records: readonly LapRecord[];
}

/**
 * The stream task's tables: a course's stream, the long at S 0x28774 by the course (S 0xC062 to 0xC06A); its records
 * of 8 bytes, a word added to the running position and a command through the jump table at S 0xC0C8 (S 0xC072 to
 * 0xC090, 0xC0A2 to 0xC0BE); the loop, which goes on after the record its argument names (S 0xC0D8, 0xC0C2).
 */
function streamOf(sub: Uint8Array, course: number) {
  const [high, low] = instruction(sub, 0xc062, [0x41f9, null, null], "the courses' streams (lea)");
  instruction(sub, 0xc068, [0xe548, 0x2070, 0x0000], "a course's stream, 4 bytes a course (lsl.w #2, movea.l)");
  instruction(sub, 0xc0a4, [0x3228, 0x0000, 0xd681], "a record's word added to the running position (move.w, add.l)");
  instruction(sub, 0xc0b4, [0x3028, 0x0002, 0xd040, 0x303b, 0x000c], "a record's command (move.w, add.w)");
  instruction(sub, 0xc0c2, [0x5088], 'the next record, 8 bytes on (addq.l #8)');
  instruction(sub, 0xc0d8, [0x2068, 0x0004, 0x4e75], "the loop's target (movea.l)");
  for (const [command, handler] of Object.entries(HANDLERS))
    if (0xc0c8 + sword(sub, 0xc0c8 + 2 * Number(command)) !== handler)
      throw romDiffers(`The stream's command ${command} is not handled at 0x${handler.toString(16)}`);
  return long(sub, high * 0x10000 + low + 4 * course);
}

/**
 * The lines' kinds a lap's first record paints across its road, the line (its zone at the lap's start, M 0x30B0 and
 * 0x30C6's kinds 2 and 7).
 */
const LINE_KINDS = [2, 7];

/**
 * Course `course`'s lap (0 to 7): its loop's records from the one after the record the loop goes back to, each at its
 * running position from the lap's first, its line (a zone of a line's kind), the loop's own running position the lap's
 * length.
 */
export function continentalCircusLap(sub: Uint8Array, course: number): ContinentalCircusLap {
  const start = streamOf(sub, course);
  // The loop's record: the first whose command is the loop, its target within the stream.
  let loop = start;
  while (sword(sub, loop + 2) !== COMMAND.loop) loop += 8;
  const first = long(sub, loop + 4) + 8;
  if (!(first > start && first <= loop)) throw romDiffers(`Course ${course}'s loop does not go back within its stream`);
  const records: LapRecord[] = [];
  let at = 0;
  for (let a = first; a <= loop; a += 8) {
    at += word(sub, a);
    records.push({ at, command: sword(sub, a + 2), argument: long(sub, a + 4) });
  }
  const line = records[0]!;
  if (line.command !== COMMAND.zone || !LINE_KINDS.includes(line.argument >>> 16))
    throw romDiffers(`Course ${course}'s lap does not start at its line`);
  // The next lap's line lies its first record's word past the loop: a lap is the loop's running position long.
  return {
    length: records.at(-1)!.at,
    records: records.slice(0, -1).map((r) => ({ ...r, at: r.at - line.at })),
  };
}

/** A curve record's value: its argument, a signed long (S 0xC0E8). */
const curveValue = (r: LapRecord) => r.argument | 0;

/**
 * A lap's curve table from its line: each curve record an interval of its value and its own length, to the next curve
 * record (S 0x2714 to 0x2746: a curve holds until the next comes), the lap's last curve, in which its line lies, cut at
 * the line, its rest the table's first interval and its start the last.
 */
export function curveTable(sub: Uint8Array, lap: ContinentalCircusLap): CurveInterval[] {
  instruction(sub, 0xc0e8, [0x23a8, 0x0004, 0x0004], "a curve's value, its argument's long (move.l)");
  const curves = lap.records.filter((r) => r.command === COMMAND.curve);
  if (curves.length === 0) throw romDiffers('A lap has no curve');
  const last = curves.at(-1)!;
  return [
    ...(curves[0]!.at > 0 ? [{ value: curveValue(last), length: curves[0]!.at }] : []),
    ...curves.map((c, i) => ({ value: curveValue(c), length: (curves[i + 1]?.at ?? lap.length) - c.at })),
  ].filter((interval) => interval.length > 0);
}
