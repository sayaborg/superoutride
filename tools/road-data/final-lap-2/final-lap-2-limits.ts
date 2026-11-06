/**
 * FINAL LAP 2's course limits ([FINAL LAP 2 road
 * data](../../../docs/final-lap-2-road-data.md#final-lap-2s-road-across)): how far its program lets the player's car go
 * beside the road, from the bounds the master reads in its road picture's row two steps ahead, each found by the
 * instructions that read it.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { COURSES, long, readRoadRow } from './final-lap-2-road.js';

/** A step's limits for the player's car's middle, laterals from P (positive right). */
export interface StepLimits {
  readonly left: number;
  readonly right: number;
}

const signed = (v: number) => (v << 16) >> 16;

/**
 * The player's car's limits as the master holds them: its 0x6382 calls 0x61B6 (0x638C) and 0x6B18 (0x63BC) with a0 its
 * own car's record ($4000(a6)). 0x61B6 takes the row two steps ahead of the car (its position over 0x40, plus 2,
 * 0x6208) through the course's table at 0xD970 and 0x220000, its 16 words at 0x222000 (0x6240 to 0x625C): its left
 * bound −5,280 plus 0x400 for each empty word at the row's left end, its right bound 10,304 less 0x400 for each at its
 * right end (0x6266 to 0x6288), −5,280 and 0x1400 where all are empty (0x628A), to its $20 and $22 (0x6292). 0x6B18
 * holds the car's x from its left bound less 0x800 to its right bound plus 0x600 (0x6C1C to 0x6C38, signed). The
 * master's table is the slave's road pictures' (`readRoadRow`), which the conversion checks. Rivals' records take
 * bounds too, but only steer for their middle (0x6038, 0xC74A); none holds them.
 */
export function limitsReader(p: FinalLap2) {
  const at = <const E extends readonly (number | null)[]>(address: number, words: E, what: string) =>
    instruction(p.master, address, words, `the car's limits' ${what}`);
  at(0x6382, [0x41ee, 0x4000, 0x4a50, 0x67f0, 0x6bee, 0x6100, 0xfe28], "call (0x61B6, a0 the player's car)");
  at(0x63bc, [0x6100, 0x075a], 'call (0x6B18)');
  const [tableHigh, tableLow] = at(
    0x6208,
    [
      0x2028,
      0x0004,
      0xec88,
      0x5440,
      0x49f9,
      null,
      null,
      0x3439,
      0x0040,
      0xd000,
      0xe54a,
      0x2874,
      0x2000,
      0x3200,
      0x0241,
      0x001f,
      0xea48,
      0x0240,
      0x007f,
      0x1434,
      0x0000,
      0x3d42,
      0x3028,
      0xeb4a,
      0x0242,
      0x1fe0,
      0x8242,
      0xd241,
      0x49f9,
      0x0022,
      0x0000,
      0x3434,
      0x1000,
      0x3d42,
      0x3026,
      0x0282,
      0x0000,
      0xffff,
      0xeb8a,
      0x4bf9,
      0x0022,
      0x2000,
      0xdbc2,
      0x284d,
      0x264d,
      0xdafc,
      0x0020,
    ],
    'row',
  );
  const [left, right, count, step, stepAgain, leftAgain, empty] = at(
    0x6266,
    [
      0x343c,
      null,
      0x363c,
      null,
      null,
      0x4a5c,
      0x660a,
      0x0642,
      null,
      0x5341,
      0x66f4,
      0x600c,
      0x4a65,
      0x6610,
      0x0443,
      null,
      0x5341,
      0x66f4,
      0x343c,
      null,
      0x363c,
      null,
      0x3142,
      0x0020,
      0x3143,
      0x0022,
    ],
    'bounds',
  );
  // `moveq #16, d1`: the row's words, its count in the opcode's low byte.
  if ((count! & 0xff00) !== 0x7200 || (count! & 0xff) !== 16) throw romDiffers("The car's bounds do not read 16 words");
  if (step !== stepAgain || left !== leftAgain)
    throw romDiffers("The car's bounds' numbers are not read alike where it uses them twice");
  const [inside, outside] = at(
    0x6c1c,
    [0x3228, 0x0020, 0x3428, 0x0022, 0x0441, null, 0x0642, null, 0xb041, 0x6c02, 0x3001, 0xb042, 0x6f02, 0x3002],
    'hold',
  );
  // The master's course table is the slave's road pictures' (`readRoadRow`'s).
  const [pictures] = instruction(p.slave, 0x141c, [0x41f9, 0x0000, null], 'the road pictures');
  const table = (tableHigh! << 16) | tableLow!;
  for (let c = 0; c < COURSES; c++)
    if (long(p.master, table + 4 * c) !== long(p.slave, pictures! + 4 * c))
      throw romDiffers("The car's bounds' rows are not the road picture's");
  return {
    /** Course c's limits at step `step` (4,096 a lap): its row's two steps ahead. */
    at: (course: number, s: number): StepLimits => {
      const row = readRoadRow(p, course, (s + 2) & 0xfff);
      let k = 0;
      while (k < row.length && row[k] === 0) k++;
      if (k === row.length) return { left: signed(left!) - inside!, right: signed(empty!) + outside! };
      let r = 0;
      while (row[row.length - 1 - r] === 0) r++;
      return { left: signed(left!) + step! * k - inside!, right: signed(right!) - step! * r + outside! };
    },
  };
}
