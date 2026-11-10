/**
 * CONTINENTAL CIRCUS's pit lanes ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md#its-pit-lanes)):
 * each lap's pit lanes as the stream task starts them, their profile beside road A, and road B's words as the main
 * program writes them, each found by the instructions that read it.
 */
import { instruction, long, word } from '../cpu/program-words.js';
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { tc0150rodLevels } from '../taito/tc0150rod.js';
import { COMMAND, type ContinentalCircusLap } from './continental-circus-road.js';

/** The pit lane's task (S 0x119CA), its profile one long every this many positions (S 0x11A1E). */
const PIT_LANE_TASK = 0x119ca;
export const PROFILE_POSITIONS = 32;

/**
 * The pit lane's profile (S 0x119DC to 0x11A34): its task gives each line's road B word (its line buffer's +4, which the
 * main program adds to road B's x) the long at S 0x11A98 by (the line's place − the pit lane's start) over 32, over the
 * line's distance, 0 before its start and from its length on (0x15000): lateral units, a unit a pixel at a distance of
 * one position. Its samples, each at its first position from the start, and its length.
 */
function profile(sub: Uint8Array) {
  const table = 0x119f8 + instruction(sub, 0x119f6, [0x43fa, null], "the pit lane's profile (lea, pc)")[0];
  instruction(sub, 0x11a0c, [0x3e02, 0xde81, 0x6c04, 0x7e00], "a line's place past the start, 0 before it (add.l)");
  const [high, low] = instruction(sub, 0x11a16, [0x0c87, null, null], "the profile's length (cmpi.l)");
  instruction(
    sub,
    0x11a1e,
    [0xe68f, 0x0247, 0xfffc, 0x2e31, 0x7000, 0x8ec2],
    'a long every 32 positions over the distance (lsr.l #3, andi.w, divu.w)',
  );
  instruction(sub, 0x11a2e, [0x3547, 0x0004], "road B's word, the line's +4 (move.w)");
  const length = high * 0x10000 + low;
  const samples = Array.from({ length: length / PROFILE_POSITIONS }, (_, k) => long(sub, table + 4 * k));
  if (samples.some((v) => v >= 0x80000000)) throw romDiffers("The pit lane's profile holds a negative long");
  return { samples, length };
}

/** A lap's pit lane: from and to positions from the lap's line, and its profile's samples, lateral units. */
export interface PitLane {
  readonly from: number;
  readonly to: number;
  readonly samples: readonly number[];
}

/**
 * A lap's pit lanes (`continentalCircusLap`): each pit lane record (command 3, S 0xC25E) starts the pit lane's task (S
 * 0x119CA), which starts its profile at the picture's pinhole + 0x7D02 at the frame it starts (S 0x119CE to 0x119D8),
 * the pinhole then at the record's running position, as it is in the limit of a slow car (default; K confirms at the
 * stage's end), and runs until the pinhole is 0x14D03 past its start (S 0x119E4), its nearest line (the distances at S
 * 0x3102) then at its profile's last position: its record's place (its running position + 0x7FFF, as a zone's, S 0xC28E)
 * less 0x2FD, its profile's length on. Each lies within its lap.
 */
export function lapPitLanes(sub: Uint8Array, lap: ContinentalCircusLap): PitLane[] {
  const [, high, low] = instruction(sub, 0xc25e, [0x3f3c, null, 0x4879, null, null, 0x4e41], 'a task (pea, trap #1)');
  if (high * 0x10000 + low !== PIT_LANE_TASK) throw romDiffers("A pit lane record starts no pit lane's task");
  const [start] = instruction(sub, 0x119ce, [0x2e2d, 0x05ba, 0x0687, 0x0000, null], "the pit lane's start (addi.l)");
  const [place] = instruction(sub, 0xc28e, [0x2c03, 0x0686, 0x0000, null], "a record's place (move.l, addi.l)");
  const { samples, length } = profile(sub);
  const [endHigh, endLow] = instruction(sub, 0x119e4, [0x0c81, null, null], "the pit lane's end (cmpi.l)");
  const [lines, table] = instruction(sub, 0x119ee, [0x303c, null, 0x41f8, null], 'the lines, their distances (lea)');
  const nearest = Math.min(...Array.from({ length: lines + 1 }, (_, k) => word(sub, table + 2 * k)));
  if (endHigh * 0x10000 + endLow + nearest < length - 1)
    throw romDiffers("The pit lane's task ends before its nearest line has drawn its profile");
  const lanes = lap.records
    .filter((r) => r.command === COMMAND.pitLane)
    .map((r) => ({ from: r.at + start - place, to: r.at + start - place + length, samples }));
  if (lanes.some((p) => p.from < 0 || p.to > lap.length)) throw contractUnmet("A pit lane runs past its lap's line");
  return lanes;
}

/**
 * Road B as the main program writes each line (M 0x4E40 to 0x4EAA): its edges' words 0 and 1 its half width, road A's
 * half width w shifted right once, with no attributes; its body's word 2 road A's x with the pit lane's word and w / 2
 * added (so that its centre lies its half width and its profile from road A's), and its attributes; its word 3 road
 * A's, its tile w + 0x200. Its attribute words, 0 to 2, its body's ORed.
 */
export function roadB(main: Uint8Array) {
  instruction(main, 0x4e40, [0x3211, 0x3001, 0x3801, 0xe24c], 'w and its half (move.w, lsr.w #1)');
  instruction(main, 0x4e48, [0x343c, 0x0348, 0x9468, 0x0000], "road A's x (move.w, sub.w)");
  instruction(main, 0x4e50, [0x3628, 0x0004, 0xd642, 0xd644], "road B's x, the pit lane's word and w / 2 on (add.w)");
  const [body] = instruction(main, 0x4e60, [0x0243, 0x07ff, 0x0043, null], "road B's body's attributes (ori.w)");
  instruction(
    main,
    0x4e9a,
    [0x3584, 0x5000, 0x3584, 0x5002, 0x3583, 0x5004, 0x3581, 0x5006, 0x08f2, 0x0001, 0x5006],
    "road B's words: its edges' w / 2, its body's, and road A's word 3, its tile w + 0x200 (move.w, bset.b #1)",
  );
  return Object.freeze([0, 0, body] as const);
}

/**
 * The two roads' order where a pit lane meets road A (`tc0150rodLevels`): road A's words as open road's (`open`, its
 * left edge's, right edge's and body's attribute words), road B's as the main program writes them (`roadB`).
 */
export const pitLaneLevels = (main: Uint8Array, open: readonly number[]) => tc0150rodLevels(open, roadB(main));
