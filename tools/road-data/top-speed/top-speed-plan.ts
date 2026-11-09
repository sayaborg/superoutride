/**
 * TOP SPEED's plan ([Original road data](../../../docs/original-road-data.md#plan-from-a-curve-table), [TOP SPEED road
 * data](../../../docs/top-speed-road-data.md#its-plan)): a course's records turned as its horizon band turns, a
 * positive curve right, each found by the instructions that turn it.
 */
import { instruction } from '../cpu/program-words.js';
import type { PathPiece } from '../shared/course-path.js';
import { skyTurnPlan } from '../shared/curve-plan.js';
import { RECORD_UNITS } from '../taito/course-records.js';
import { SKY_TURN } from './top-speed-backgrounds.js';
import { POSITION_METRES, type TopSpeedRecord } from './top-speed-road.js';

/** A record's length, metres. */
export const RECORD_METRES = RECORD_UNITS * POSITION_METRES;

/**
 * The horizon band's pixels a record of a curve's class `c`: the main program's turn a frame is −k × its advance / 2,
 * k the curve's class's complement to its word's 0x8000 (M 0x6156 to 0x6168: none for a class of 0), the band's
 * accumulator keeping 21 bits of fraction (M 0x8A9E), so that a record of 0x2000 positions turns it (128 − |c|) / 2.
 */
function pixelsARecord(main: Uint8Array): (c: number) => number {
  instruction(main, 0x6156, [0x0242, 0xff00, 0x6700, 0x0016, 0x4442], "a curve's class (andi.w, beq, neg.w)");
  const [full] = instruction(main, 0x6160, [0x0642, null, 0xc1c2, 0x4480, 0xe280], 'a turn (addi.w, muls, asr #1)');
  const [high, low] = instruction(main, 0x8a9e, [0x0281, null, null], "the horizon band's fraction (andi.l)");
  const fraction = Math.log2(high * 0x10000 + low + 1);
  return (c) => (c === 0 ? 0 : (Math.sign(c) * (full - 256 * Math.abs(c)) * RECORD_UNITS) / 2 / 2 ** fraction);
}

/**
 * A course's plan from its records' curves: each record the horizon band's pixels its curve's class turns it, of its
 * 1,024 a turn, a positive curve turning right, the band moving left (the research note).
 */
export function coursePieces(main: Uint8Array, records: readonly TopSpeedRecord[]): PathPiece[] {
  const pixels = pixelsARecord(main);
  return skyTurnPlan(
    records.map((r) => pixels(r.curve)),
    RECORD_METRES,
    SKY_TURN,
    -1,
  );
}
