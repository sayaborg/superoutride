/**
 * OUTRUN's hills as its screen shows them ([Original road data](../../docs/original-road-data.md#hills)): the road's top
 * row along a stage, from its height points and height tables, by the original's rule, at its clock. Nothing is fitted.
 */
import { romDiffers } from './conversion-errors.js';
import { phaseUnit, type BoardClock, type HeightCounts } from './board-clock.js';
import { driveTable, levelWords } from './height-procedure.js';
import { instruction, word } from './program-words.js';
import type { HeightTable, WidthHeightPoint } from './road-tables.js';

/**
 * How far up a far layer stands, road units (OUTRUN's clouds, TURBO OUTRUN's far strip): its row stays the level road's
 * top above the eye at every depth (the horizon's row on a level road, its row × (1 − z / lines)); standing twice as
 * far, twice that, above the original's eye, the bottom row less the level top (`roadTop` of the level horizon: 151,
 * the eye 72).
 */
export function farUp(clock: BoardClock): number {
  const top = roadTop(clock, clock.heights.level, [], 0);
  return 2 * top + (clock.heights.bottomRow - top);
}

/** A segment's slope is held at this, 16.16 rows a line (one row a line), by every kind's lines but kind 4's. */
export const SLOPE_LIMIT = 0x10000;

/**
 * The road's top row: its `lines` (512, the clock's) in seven segments, near to far, `s0 = 255(1 − f)`, `s1 = (256 + 255f)/2`, and the rest
 * halved in turn (R/2, R/4, R/8, R/16, R/16); segment 0's slope `base × 16`, each further segment's its predecessor's
 * plus `increments[k − 1]`, each held at `limit` (S 0x2044) before the next increment is added. Each line's row is
 * the bottom row less the slopes summed from the nearest line, ÷ 65536; the top is the least.
 */
export function roadTop(
  clock: BoardClock,
  base: number,
  increments: readonly number[],
  f: number,
  limit = SLOPE_LIMIT,
): number {
  const slopes = segmentSlopes(base, increments, limit);
  const { bottomRow } = clock.heights;
  let sum = 0,
    top = bottomRow;
  segmentLengths(clock.lines, f).forEach((length, k) => {
    // Within a segment rows change linearly: the extremes lie at its ends.
    sum += slopes[k]! * length;
    top = Math.min(top, bottomRow - sum / 65536);
  });
  return top;
}

/** The seven segments' lengths in lines, near to far, at the share `f`. */
function segmentLengths(lines: number, f: number): number[] {
  const s0 = 255 * (1 - f),
    s1 = (256 + 255 * f) / 2,
    rest = lines - s0 - s1;
  return [s0, s1, rest / 2, rest / 4, rest / 8, rest / 16, rest / 16];
}

/** The seven segments' slopes: segment 0's `base × 16`, each further one its predecessor's plus its increment, held at `limit`. */
function segmentSlopes(base: number, increments: readonly number[], limit: number): number[] {
  let slope = base * 16;
  return Array.from({ length: 7 }, (_, k) => {
    if (k > 0) slope += increments[k - 1] ?? 0;
    return (slope = Math.min(slope, limit));
  });
}

/** The stripes' phases, a period: each line's word at each, its low byte 0xFF where the line's stripe is drawn. */
const STRIPE_PHASES = 32;
const STRIPE_ON = 0xff;
/** The law's L is sought between the farthest line and this many lines, to this fineness. */
const MOST_L = 4096;
const L_FINENESS = 1e-9;

/**
 * The lines' distances ahead of the car, positions, near to far, the farthest line (at the horizon) left out
 * ([Hills](../../docs/original-road-data.md#hills), A line's distance): read from the stripes the sub program copies to
 * the road at `at` (`lea $109EE.l, a0`), 32 phases of a word for each of `lines` lines, far to near. Each line's stripe,
 * centred between its on and off edges, lies its distance ahead in phase units modulo the period; unwrapped near to far,
 * each line the least distance at or beyond the last, read while it lies under half a period beyond it. The stripes are
 * drawn in whole phases, many near lines alike; the distances are the law ln(L / (L − k)) / a for line k, L and a the
 * least squares' over the lines read.
 */
export function readLineDistances(sub: Uint8Array, at: number, lines: number, clock: BoardClock): Float64Array {
  const [high, low] = instruction(sub, at, [0x41f9, null, null], "the stripes' address");
  const stripes = high! * 0x10000 + low!;
  const read: number[] = [];
  let last = 0;
  for (let k = 0; k < lines - 1; k++) {
    const on = Array.from(
      { length: STRIPE_PHASES },
      (_, p) => (word(sub, stripes + 2 * (lines * p + lines - 1 - k)) & 0xff) === STRIPE_ON,
    );
    const starts = on.flatMap((x, p) => (x && !on.at(p - 1) ? [p] : []));
    const ends = on.flatMap((x, p) => (!x && on.at(p - 1) ? [p] : []));
    if (starts.length !== 1 || ends.length !== 1) throw romDiffers(`Line ${k}'s stripe is not one run`);
    const centre = (starts[0]! + ends[0]! + (ends[0]! < starts[0]! ? STRIPE_PHASES : 0)) / 2;
    const ahead = (STRIPE_PHASES - (centre % STRIPE_PHASES)) % STRIPE_PHASES;
    const beyond = (ahead - last + STRIPE_PHASES) % STRIPE_PHASES;
    if (k > 0 && beyond >= STRIPE_PHASES / 2) break;
    read.push(k === 0 ? 0 : read[k - 1]! + beyond);
    last = ahead;
  }
  // At each L the least squares' a is direct; L the golden sections', the squares' sum dipping once between its bounds.
  const units = read.map((u) => u * phaseUnit(clock));
  const fit = (L: number) => {
    const g = units.map((_, k) => Math.log(L / (L - k)));
    const a = g.reduce((s, x) => s + x * x, 0) / g.reduce((s, x, k) => s + x * units[k]!, 0);
    return { L, a, cost: g.reduce((s, x, k) => s + (x / a - units[k]!) ** 2, 0) };
  };
  const golden = (Math.sqrt(5) - 1) / 2;
  let lower = lines - 1,
    upper = MOST_L;
  while (upper - lower > L_FINENESS * upper) {
    const x = upper - golden * (upper - lower),
      y = lower + golden * (upper - lower);
    if (fit(x).cost <= fit(y).cost) upper = y;
    else lower = x;
  }
  const { L, a } = fit((lower + upper) / 2);
  if (!(L - (lines - 1) > 1 && MOST_L - L > 1)) throw romDiffers("The lines' distances fit no law");
  return Float64Array.from({ length: lines - 1 }, (_, k) => Math.log(L / (L - k)) / a);
}

/** Where both sub programs clear the road's rows: `lea $80000.l, a0`, then the rows' count. */
const ROAD_ROWS = 0x116e;

/**
 * The heights' procedure's counts from a sub program, its procedure starting at `start` (OUTRUN's S 0x1B12, TURBO
 * OUTRUN's S 0x1A5E), each instruction checked: the share count's gain, `muls.w #$c` in each kind's tick (S 0x1C48,
 * 0x1D08, 0x1DCA, 0x1ED2); the share's end, `cmpi.w #$ff` (S 0x1C74, 0x1DF6, 0x1EE6); kinds 1 and 2's, `cmpi.w #$fe`
 * (S 0x1D6C); kind 3's slide, `move.w #4, d3` (S 0x1DCE), over its first `cmpi.w #6` entries (S 0x1DE0); the count's
 * start again, `move.w #1, $718` (S 0x1CD0); the level horizon's base, `move.l #$240, $732` (S 0x1B3A). The road's
 * last row is its rows' count less one, `move.w #$df, d0` as the program clears the road's 224 rows (S 0x1174 in both);
 * the horizon's row the main program reads is counted from the row below, 0xE0 less a line's word ÷ 16 (S 0x14BE).
 * Addresses are OUTRUN's.
 */
export function readHeightCounts(sub: Uint8Array, start: number): HeightCounts {
  const at = (offset: number, words: readonly (number | null)[], what: string) =>
    instruction(sub, start + offset, words, what)[0]!;
  const gains = [0x136, 0x1f6, 0x2b8, 0x3c0].map((o) => at(o, [0xc3fc, null], "the share count's gain"));
  const ends = [0x162, 0x2e4, 0x3d4].map((o) => at(o, [0x0c41, null], "the share's end"));
  if (new Set(gains).size !== 1 || new Set(ends).size !== 1)
    throw romDiffers("The heights' procedure counts its kinds' shares unlike one another");
  return {
    gain: gains[0]!,
    end: ends[0]!,
    rampEnd: at(0x25a, [0x0c6d, null, 0x0530], "kinds 1 and 2's share's end"),
    slide: at(0x2bc, [0x363c, null], "kind 3's slide"),
    slideEntries: at(0x2ce, [0x0c6d, null, 0x0710], "kind 3's entries slid"),
    restart: at(0x1be, [0x3b7c, null, 0x0718], "the share count's start"),
    level: instruction(sub, start + 0x28, [0x2b7c, 0x0000, null, 0x0732], "the level horizon's base")[0]!,
    bottomRow: instruction(sub, ROAD_ROWS, [0x41f9, 0x0008, 0x0000, 0x303c, null], "the road's rows")[0]!,
  };
}

/** A table's run along a stage: from its point's position, where its hold begins and ends and its end, positions. */
export interface TableRun {
  /** The table's number, its point's value. */
  readonly number: number;
  readonly table: HeightTable;
  readonly start: number;
  /** Kinds 1 to 3: where the hold begins and ends; else the run's end. */
  readonly rise: number;
  readonly holdEnd: number;
  readonly end: number;
}

/** A table by its number from `tables`, table 0 (the level one the procedure starts between tables) among them. */
function tableOf(tables: ReadonlyMap<number, HeightTable>) {
  return (n: number) => {
    const table = tables.get(n);
    if (!table) throw new RangeError(`Height table ${n} was not read`);
    return table;
  };
}

/**
 * The tables a stage's height points run (`driveTable`): each point starts its table when the road position reaches
 * it, unless a table is still running (the point is dropped); a hold counted at `kmh` there.
 */
export function tableRuns(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  kmh: (position: number) => number,
  clock: BoardClock,
): TableRun[] {
  const runs: TableRun[] = [];
  const read = tableOf(tables);
  // A point naming table 0 asks for nothing: table 0 is the level one the procedure runs between tables.
  for (const point of points.filter((p) => p.kind === 0 && p.value !== 0).sort((a, b) => a.position - b.position)) {
    if (runs.length && point.position < runs.at(-1)!.end) continue;
    const start = point.position,
      number = point.value;
    const run = driveTable(number, read, clock, (x) => kmh(start + x), clock.heights.level);
    runs.push({
      number,
      table: read(number),
      start,
      rise: start + run.holdStart,
      holdEnd: start + run.holdEnd,
      end: start + run.end,
    });
  }
  return runs;
}

/** A window's rows, nearest line first: its words are sixteenths of a row above the bottom row. */
export const rowsOf = (words: Int16Array, bottomRow: number) => Float64Array.from(words, (w) => bottomRow - w / 16);

/**
 * The road's rows along a stage at each of `positions` (ascending): its tables run by `tableRuns`, each window the
 * procedure's (`driveTable`), the base a kind 4 table leaves kept; before the first, the level road.
 */
export function rowsAlong(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  positions: readonly number[],
  kmh: (position: number) => number,
  clock: BoardClock,
): Float64Array[] {
  const read = tableOf(tables);
  const runs = tableRuns(points, tables, kmh, clock);
  const { level: levelBase, bottomRow } = clock.heights;
  let base = levelBase,
    next = 0;
  const out: Float64Array[] = [];
  const level = (b: number) => rowsOf(levelWords(b), bottomRow);
  while (next < positions.length && (!runs.length || positions[next]! < runs[0]!.start)) {
    out.push(level(base));
    next++;
  }
  runs.forEach((run, k) => {
    const until = runs[k + 1]?.start ?? Infinity;
    const asked: number[] = [];
    while (next + asked.length < positions.length && positions[next + asked.length]! < until)
      asked.push(positions[next + asked.length]! - run.start);
    const driven = driveTable(run.number, read, clock, (x) => kmh(run.start + x), base, asked);
    driven.windows.forEach((w) => out.push(rowsOf(w, bottomRow)));
    next += asked.length;
    base = driven.base;
  });
  return out;
}

/** The road's top along a stage at each of `positions` (ascending): the least of its rows (`rowsAlong`). */
export function hillsAlong(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  positions: readonly number[],
  kmh: (position: number) => number,
  clock: BoardClock,
): Float64Array {
  return Float64Array.from(rowsAlong(points, tables, positions, kmh, clock), (rows) => Math.min(...rows));
}
