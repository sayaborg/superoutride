/**
 * CONTINENTAL CIRCUS's heights ([CONTINENTAL CIRCUS road data](../../../docs/continental-circus-road-data.md)): the
 * main program's 3D road, whole hills of its shapes queued one after another along a lap, each found by the
 * instructions that read it.
 */
import { instruction, long } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import { COMMAND, type ContinentalCircusLap } from './continental-circus-road.js';

/** Positions a hill's sample holds (M 0x7922, 0x794E: its index the position's offset over 32). */
export const SAMPLE_POSITIONS = 32;
/** How far before its record's place a hill starts, positions: its record's place + 0x7BF4 (M 0x780C) less 0x7FFF. */
const HILL_LEAD = 0x7fff - 0x7bf4;

/** A hill as the main program lays it: from `start`, its samples each `SAMPLE_POSITIONS` long, over `base`. */
export interface Hill {
  readonly start: number;
  readonly end: number;
  readonly base: number;
  readonly samples: readonly number[];
}

/**
 * The hills' task (M 0x77E8 to 0x7848): a record's shape from the table of longs at M 0x784A, its length the long before
 * it (M 0x7824) and its samples longs from it; a hill starts at its record's place + 0x7BF4 or where the hill before it
 * ends, the later (M 0x780C to 0x7820), its base the height reached less its first sample, and the height after it its
 * base less its first sample again (M 0x7832 to 0x783E).
 */
function shapes(main: Uint8Array) {
  const [displacement] = instruction(main, 0x77e8, [0x41fa, null], "the hills' shapes (lea, pc)");
  instruction(main, 0x780c, [0x202d, 0x3bd4, 0x0680, 0x0000, 0x7bf4], "a hill's start (move.l, addi.l)");
  instruction(main, 0x7824, [0x242a, 0xfffc], "a hill's length, the long before its shape (move.l)");
  instruction(main, 0x7832, [0x202d, 0xf058, 0x9092, 0x2380, 0x100c, 0x9092], "a hill's base and the height after it");
  const table = 0x77ea + displacement;
  return (shape: number) => {
    const at = long(main, table + 4 * shape);
    const length = long(main, at - 4);
    if (length % SAMPLE_POSITIONS) throw romDiffers(`Hill shape ${shape}'s length is no whole number of samples`);
    return {
      length,
      samples: Array.from({ length: length / SAMPLE_POSITIONS }, (_, k) => long(main, at + 4 * k) | 0),
    };
  };
}

/**
 * A lap's hills from its line (`continentalCircusLap`), each its record's shape (its argument's high word, S 0xC106) from
 * 0x40B before its record's place or where the hill before it ends, the first from the line's height 0; the lap's
 * heights close, its last hill ending before its line.
 */
export function lapHills(main: Uint8Array, lap: ContinentalCircusLap): Hill[] {
  const shapeOf = shapes(main);
  const out: Hill[] = [];
  let [end, height] = [-Infinity, 0];
  for (const r of lap.records.filter((x) => x.command === COMMAND.hill)) {
    const { length, samples } = shapeOf(r.argument >>> 16);
    const start = Math.max(r.at - HILL_LEAD, end);
    const base = height - samples[0]!;
    out.push({ start, end: start + length, base, samples });
    [end, height] = [start + length, base - samples[0]!];
  }
  if (height !== 0 || end > lap.length) throw romDiffers("A lap's hills do not close within it");
  return out;
}

/**
 * A lap's height at `p` positions from its line, the main program's units (M 0x7910 to 0x7988): within a hill its
 * sample there over its base, between hills the height the last reached; up is its negative (M 0x5BC4 to 0x5BE2).
 */
export function lapHeight(hills: readonly Hill[], p: number): number {
  let h = 0;
  for (const hill of hills) {
    if (p < hill.start) break;
    if (p >= hill.end) {
      h = hill.base - hill.samples[0]!;
      continue;
    }
    return hill.base + hill.samples[Math.floor((p - hill.start) / SAMPLE_POSITIONS)]!;
  }
  return h;
}
