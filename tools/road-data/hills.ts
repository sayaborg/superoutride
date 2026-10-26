/**
 * OUTRUN's hills as its screen shows them ([Original road data](../../docs/original-road-data.md#hills)): the road's top
 * row along a stage, from its height points and height tables, by the original's rule, at its clock. Nothing is fitted.
 */
import type { BoardClock, HeightCounts } from './board-clock.js';
import { driveTable, levelWords } from './height-procedure.js';
import { instruction } from './program-words.js';
import type { HeightTable, WidthHeightPoint } from './road-tables.js';

/** The road's bottom row, and the level horizon's base (each line's slope is base × 16, 16.16 rows). */
const BOTTOM_ROW = 223;
export const LEVEL_HORIZON = 0x240;
/**
 * How far up a far layer stands, road units (OUTRUN's clouds, TURBO OUTRUN's far strip): its row stays the level road's
 * top above the eye at every depth (the horizon's row on a level road, its row × (1 − z / lines)); standing twice as
 * far, twice that, above the original's eye, the bottom row less the level top (`roadTop` of the level horizon on its
 * `lines`: 151, the eye 72).
 */
export function farUp(lines: number): number {
  const top = roadTop(lines, LEVEL_HORIZON, [], 0);
  return 2 * top + (BOTTOM_ROW - top);
}

/** A segment's slope is held at this, 16.16 rows a line (one row a line), by every kind's lines but kind 4's. */
export const SLOPE_LIMIT = 0x10000;

/**
 * The road's top row: its `lines` (512) in seven segments, near to far, `s0 = 255(1 − f)`, `s1 = (256 + 255f)/2`, and the rest
 * halved in turn (R/2, R/4, R/8, R/16, R/16); segment 0's slope `base × 16`, each further segment's its predecessor's
 * plus `increments[k − 1]`, each held at `limit` (S 0x2044) before the next increment is added. Each line's row is
 * 223 − the slopes summed from the nearest line, ÷ 65536; the top is the least.
 */
export function roadTop(
  lines: number,
  base: number,
  increments: readonly number[],
  f: number,
  limit = SLOPE_LIMIT,
): number {
  const slopes = segmentSlopes(base, increments, limit);
  let sum = 0,
    top = BOTTOM_ROW;
  segmentLengths(lines, f).forEach((length, k) => {
    // Within a segment rows change linearly: the extremes lie at its ends.
    sum += slopes[k]! * length;
    top = Math.min(top, BOTTOM_ROW - sum / 65536);
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

/**
 * Every line's row, near to far: line k lies in the segment holding k + 0.5, its slope that segment's, its row 223 − the
 * slopes of lines 0 to k summed, ÷ 65536 (Hills, Every line's row).
 */
export function lineRows(
  lines: number,
  base: number,
  increments: readonly number[],
  f: number,
  limit = SLOPE_LIMIT,
): Float64Array {
  const slopes = segmentSlopes(base, increments, limit);
  const ends: number[] = [];
  segmentLengths(lines, f).reduce((sum, length) => (ends.push(sum + length), sum + length), 0);
  const rows = new Float64Array(lines);
  let segment = 0,
    sum = 0;
  for (let k = 0; k < lines; k++) {
    while (segment < 6 && ends[segment]! < k + 0.5) segment++;
    sum += slopes[segment]!;
    rows[k] = BOTTOM_ROW - sum / 65536;
  }
  return rows;
}

/**
 * The lines' fall: line k lies ln(L / (L − k)) / `LINE_FALL` positions ahead of the car, L the farthest line (511 of
 * 512), a fit of the stripe tables' flips at lines ≈ 511 e^(−0.145 d) (OUTRUN's research note, Camera).
 */
const LINE_FALL = 0.145;

/** Line k's distance ahead of the car, positions, of `lines`; the farthest lies at the horizon. */
export const lineDistance = (k: number, lines: number) => Math.log((lines - 1) / (lines - 1 - k)) / LINE_FALL;

/**
 * The heights' procedure's counts from a sub program, its procedure starting at `start` (OUTRUN's S 0x1B12, TURBO
 * OUTRUN's S 0x1A5E), each instruction checked: the share count's gain, `muls.w #$c` in each kind's tick (S 0x1C48,
 * 0x1D08, 0x1DCA, 0x1ED2); the share's end, `cmpi.w #$ff` (S 0x1C74, 0x1DF6, 0x1EE6); kinds 1 and 2's, `cmpi.w #$fe`
 * (S 0x1D6C); kind 3's slide, `move.w #4, d3` (S 0x1DCE), over its first `cmpi.w #6` entries (S 0x1DE0); the count's
 * start again, `move.w #1, $718` (S 0x1CD0). Addresses are OUTRUN's.
 */
export function readHeightCounts(sub: Uint8Array, start: number): HeightCounts {
  const at = (offset: number, words: readonly (number | null)[], what: string) =>
    instruction(sub, start + offset, words, what)[0]!;
  const gains = [0x136, 0x1f6, 0x2b8, 0x3c0].map((o) => at(o, [0xc3fc, null], "the share count's gain"));
  const ends = [0x162, 0x2e4, 0x3d4].map((o) => at(o, [0x0c41, null], "the share's end"));
  if (new Set(gains).size !== 1 || new Set(ends).size !== 1)
    throw new RangeError("The heights' procedure counts its kinds' shares unlike one another");
  return {
    gain: gains[0]!,
    end: ends[0]!,
    rampEnd: at(0x25a, [0x0c6d, null, 0x0530], "kinds 1 and 2's share's end"),
    slide: at(0x2bc, [0x363c, null], "kind 3's slide"),
    slideEntries: at(0x2ce, [0x0c6d, null, 0x0710], "kind 3's entries slid"),
    restart: at(0x1be, [0x3b7c, null, 0x0718], "the share count's start"),
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
    const run = driveTable(number, read, clock, (x) => kmh(start + x), LEVEL_HORIZON);
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
export const rowsOf = (words: Int16Array) => Float64Array.from(words, (w) => BOTTOM_ROW - w / 16);

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
  let base = LEVEL_HORIZON,
    next = 0;
  const out: Float64Array[] = [];
  const level = (b: number) => rowsOf(levelWords(b));
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
    driven.windows.forEach((w) => out.push(rowsOf(w)));
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
