/**
 * The tables POLE POSITION II's programs hold, read raw ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-tables)):
 * its courses' names, curve tables and road palettes, and the amounts its lap's length takes. Each is found by the
 * instructions that read it, checked word by word.
 */
import { instruction, word } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { metresAPosition } from '../shared/road-position.js';
import { FRAMES_A_SECOND } from '../pole-position-hardware/display.js';
import type { PolePositionII } from './pole-position-ii-rom.js';

/** The courses, in the order the programs number them. */
export const COURSES = 4;
/** A curve table's intervals: the high byte of the 32-bit road position. */
export const INTERVALS = 256;
/** The road position's units an interval: its low 24 bits. */
const INTERVAL_UNITS = 2 ** 24;
/** A name's bytes: its letters between brackets, padded with spaces. */
const NAME_BYTES = 10;
/** The text's character codes: digits from 0, letters from 10, the brackets 0x28 and 0x29, the space 0x24. */
const LETTER_A = 0x0a;
const OPEN = 0x28;
const CLOSE = 0x29;

/**
 * The curve tables: course c's 256 signed values from the address the first program's 0x1CF6 adds the course to,
 * indexed by the road position's high byte ($8184's high byte, course $801C & 3).
 */
export function readCurveTables(p: PolePositionII): number[][] {
  const [base] = instruction(
    p.first,
    0x1cf6,
    [0x600b, 0x8184, 0x8c38, 0x6104, 0x801c, 0x0704, 0x0003, 0xa0c4, 0x8cc8, 0x0104, null, 0x704b, 0x0300],
    "the curve table's reading",
  );
  return Array.from({ length: COURSES }, (_, c) =>
    Array.from(p.first.subarray(base! + INTERVALS * c, base! + INTERVALS * (c + 1)), (b) => (b << 24) >> 24),
  );
}

/** The courses' names as the course select writes them: course c's at the address the second program's 0x44C2 adds 10c to. */
export function readNames(p: PolePositionII): string[] {
  const [base] = instruction(
    p.second,
    0x44c2,
    [0x6101, 0x801c, 0x0701, 0x0003, 0x1900, NAME_BYTES, 0x0101, null],
    "the course name's reading",
  );
  return Array.from({ length: COURSES }, (_, c) => {
    const bytes = [...p.second.subarray(base! + NAME_BYTES * c, base! + NAME_BYTES * (c + 1))];
    const close = bytes.indexOf(CLOSE);
    if (bytes[0] !== OPEN || close < 2) throw romDiffers(`Course ${c}'s name is not bracketed`);
    return bytes
      .slice(1, close)
      .map((b) => {
        if (b < LETTER_A || b >= LETTER_A + 26) throw romDiffers(`Course ${c}'s name holds a code that is no letter`);
        return String.fromCharCode(65 + b - LETTER_A);
      })
      .join('');
  });
}

/** Course c's road palettes along the road, eight in turn an interval, from the second program's 0x0398. */
export function readRoadPalettes(p: PolePositionII): number[][] {
  instruction(p.second, 0x0372, [0xb301, 0x0003], "the road palettes' course step");
  const [base] = instruction(p.second, 0x0398, [0x6019, null, 0x6f31, 0x9000], "the road palettes' reading");
  return Array.from({ length: COURSES }, (_, c) => Array.from(p.second.subarray(base! + 8 * c, base! + 8 * (c + 1))));
}

/**
 * An interval's length, metres: the shown speed is the speed's long times the factor `factor` over 2^24 (the first
 * program's 0x1F40 and 0x1F62), the road position gains the speed's long over 8 a frame (0x1CC0), so a speed shown as
 * 1 km/h gains 2^21 / factor positions a frame. `factor` is the table's entry the factory settings take.
 */
export function intervalMetres(p: PolePositionII, entry: number) {
  instruction(p.first, 0x1f40, [0x5400, 0x818c, 0xb305, 0xfff4], "the shown speed's reading");
  const [table] = instruction(p.first, 0x1f62, [0x5920, null, 0xb305, 0xfff4], "the shown speed's factor");
  instruction(p.first, 0x1cc0, [0x5400, 0x8170, 0xb305, 0xfffd, 0x5600, 0x8184], "the road position's gain");
  const factor = word(p.first, table! + 2 * entry);
  return { factor, metres: metresAPosition(1, 1 / FRAMES_A_SECOND, 2 ** 21 / factor) * INTERVAL_UNITS };
}
