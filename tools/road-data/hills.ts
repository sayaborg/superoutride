/**
 * OUTRUN's hills as its screen shows them ([Original road data](../../docs/original-road-data.md#hills)): the road's top
 * row along a stage, from its height points and height tables, by the original's rule, at its clock. Nothing is fitted.
 */
import type { BoardClock } from './board-clock.js';
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
/** A table's entry spans 2.125 × step positions (times its factor for kind 0). */
const ENTRY = 2.125;
/** A hold's wait counts down by the whole part of this × positions advanced ÷ step each tick. */
const WAIT_RATE = 120;

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
  const s0 = 255 * (1 - f),
    s1 = (256 + 255 * f) / 2,
    rest = lines - s0 - s1;
  const lengths = [s0, s1, rest / 2, rest / 4, rest / 8, rest / 16, rest / 16];
  let slope = base * 16,
    sum = 0,
    top = BOTTOM_ROW;
  lengths.forEach((length, k) => {
    if (k > 0) slope += increments[k - 1] ?? 0;
    slope = Math.min(slope, limit);
    // Within a segment rows change linearly: the extremes lie at its ends.
    sum += slope * length;
    top = Math.min(top, BOTTOM_ROW - sum / 65536);
  });
  return top;
}

/**
 * Kind 3 slides its first six entries in, each over 2.125 × 4 positions whatever its step (its slide divides its
 * progress by 4, `move.w #4, d3` at S 0x1DCE); its hold then sets every segment's increment to its entry 6, its return
 * to its entry 12, the entries' pointer moved on six at the hold's end (`addi.l #$c, $71c(a5)` at S 0x1E46).
 */
const KIND_3_SLIDE = 4;
const KIND_3_ENTRIES = 6;

/**
 * The positions each entry of a kind 0 table spans, 2.125 × step × the factor its sign selects, or each of the six a
 * kind 3 table slides in, 2.125 × 4.
 */
function entrySpans(table: HeightTable): number[] {
  if (table.kind === 3) return Array.from({ length: KIND_3_ENTRIES }, () => ENTRY * KIND_3_SLIDE);
  if (table.kind !== 0) return [];
  return table.entries.map((e) => ENTRY * table.step * (e === 0 ? 1 : e > 0 ? table.ascent : table.descent));
}

/** No increment on any of the six segments beyond segment 0. */
const NONE: readonly number[] = Object.freeze(Array.from({ length: 6 }, () => 0));

/** A sliding window's increments at entry `i`, a share `f` of it passed: segment 1's fades as the entry passes. */
const window = (entries: readonly number[], i: number, f: number, scale = 1) =>
  Array.from({ length: 6 }, (_, k) => 16 * scale * (entries[i + k] ?? 0) * (k === 0 ? 1 - f : 1));

/** A table's run along a stage: from its point's position, its rise's end, its hold's end and its end, positions. */
export interface TableRun {
  /** The table's number, its point's value. */
  readonly number: number;
  readonly table: HeightTable;
  readonly start: number;
  /** Kinds 1 to 3: where the rise ends and the hold ends; kind 0's slide and kind 4's move end at `rise`. */
  readonly rise: number;
  readonly holdEnd: number;
  readonly end: number;
}

/** A table's rise, positions from its start: kind 1's and 2's ramp, kind 0's and 3's entries slid in, kind 4's move. */
function riseOf(table: HeightTable): number {
  if (table.kind === 1 || table.kind === 2 || table.kind === 4) return ENTRY * table.step;
  const spans = entrySpans(table);
  return spans.slice(0, table.kind === 3 ? spans.length : table.entries.length - 6).reduce((a, b) => a + b, 0);
}

/**
 * The tables a stage's height points run: each point starts its table when the road position reaches it, unless a table
 * is still running (the point is dropped). Kinds 0 and 4 end with their rise; kinds 1 to 3 hold while their wait counts
 * down at `kmh(p)`, p where the rise ends, by `clock`, and return over 2.125 × step.
 */
export function tableRuns(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  kmh: (position: number) => number,
  clock: BoardClock,
): TableRun[] {
  const runs: TableRun[] = [];
  for (const point of points.filter((p) => p.kind === 0).sort((a, b) => a.position - b.position)) {
    if (runs.length && point.position < runs.at(-1)!.end) continue;
    const table = tables.get(point.value);
    if (!table) throw new RangeError(`Height table ${point.value} was not read`);
    const start = point.position,
      rise = start + riseOf(table);
    const number = point.value;
    if (table.kind === 0 || table.kind === 4) runs.push({ number, table, start, rise, holdEnd: rise, end: rise });
    else {
      const holdEnd = rise + holdLength(table, kmh(rise), clock);
      runs.push({ number, table, start, rise, holdEnd, end: holdEnd + ENTRY * table.step });
    }
  }
  return runs;
}

/**
 * The road's window at a road position: segment 0's slope `base × 16`, the six further segments' `increments`, the share
 * `f` of a sliding entry passed, which moves the segments (`roadTop`), and whether its lines hold their slopes at
 * `SLOPE_LIMIT`: those of every kind but kind 4, the kind of the table started last (none, kind 0's).
 */
export interface HillWindow {
  readonly base: number;
  readonly increments: readonly number[];
  readonly f: number;
  readonly limited: boolean;
}

/** The entry an entry list's `spans` reach `x` positions in, and the share `f` of it passed. */
function entryAt(spans: readonly number[], x: number) {
  let i = 0,
    rest = x;
  while (rest >= spans[i]!) rest -= spans[i++]!;
  return { i, f: rest / spans[i]! };
}

/**
 * The road's window along a stage at each of `positions` (ascending), its tables run by `tableRuns`.
 * - Kind 0 slides its entries through the window, each over its span, and ends when the entry six ahead is its end.
 * - Kinds 1 to 3 rise, hold while their wait counts down, and return over 2.125 × step. Kind 1 adds its entry 0 at the
 *   rise's share, then its entry 1 at the share holding and falling, to every segment's increment; kind 2 the same to
 *   segment 0's slope alone; kind 3 slides its first six entries in as kind 0 does, then adds its entry 6 to every
 *   segment's increment while it holds and its entry 12 at a falling share as it returns.
 * - Kind 4 moves the horizon's base to its value over 2.125 × step, which stays.
 */
export function windowsAlong(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  positions: readonly number[],
  kmh: (position: number) => number,
  clock: BoardClock,
): HillWindow[] {
  const runs = tableRuns(points, tables, kmh, clock);
  let base = LEVEL_HORIZON,
    from = LEVEL_HORIZON,
    next = 0;
  let running: TableRun | null = null;
  return positions.map((p) => {
    while (next < runs.length && runs[next]!.start <= p) {
      running = runs[next++]!;
      from = base;
    }
    const run = running as TableRun | null;
    const limited = run?.table.kind !== 4;
    const level = { base, increments: NONE, f: 0, limited };
    if (!run || p >= run.end) {
      if (run?.table.kind === 4) base = run.table.horizon;
      return { ...level, base };
    }
    const { table, start } = run;
    const x = p - start;
    const ramp = ENTRY * table.step;
    if (table.kind === 4) {
      base = from + (table.horizon - from) * Math.min(1, x / ramp);
      return { ...level, base };
    }
    if (table.kind === 0 || (table.kind === 3 && p < run.rise)) {
      const { i, f } = entryAt(entrySpans(table), x);
      return { ...level, increments: window(table.entries, i, f), f };
    }
    // Kinds 1 to 3 past kind 3's slide: rise, hold (counted by tick at the speed there), return.
    const rise = run.rise - start;
    const share = x < rise ? x / rise : p < run.holdEnd ? 1 : Math.max(0, 1 - (p - run.holdEnd) / ramp);
    if (table.kind === 3) {
      const entry = table.entries[p < run.holdEnd ? KIND_3_ENTRIES : 2 * KIND_3_ENTRIES]!;
      return { ...level, increments: Array.from({ length: 6 }, () => 16 * share * entry) };
    }
    const entry = table.entries[x < rise ? 0 : 1]!;
    if (table.kind === 2) return { ...level, base: base + share * entry };
    return { ...level, increments: Array.from({ length: 6 }, () => 16 * share * entry) };
  });
}

/** The road's top along a stage at each of `positions` (ascending): its windows' (`windowsAlong`) `roadTop`. */
export function hillsAlong(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  positions: readonly number[],
  kmh: (position: number) => number,
  clock: BoardClock,
): Float64Array {
  return Float64Array.from(windowsAlong(points, tables, positions, kmh, clock), (w) =>
    roadTop(clock.lines, w.base, w.increments, w.f, w.limited ? SLOPE_LIMIT : Infinity),
  );
}

/**
 * A hold's length in positions at `kmh`: each tick advances `kmh × step / 65536` positions (`clock`'s step) and counts
 * the wait down by the whole part of `120 × that ÷ step`, so it lasts longer the slower the car.
 */
export function holdLength(table: HeightTable, kmh: number, clock: BoardClock): number {
  if (table.kind === 0 || table.kind === 4) return 0;
  const advance = (kmh * clock.step) / 65536;
  const count = Math.floor((WAIT_RATE * advance) / table.step);
  const wait = table.kind === 3 ? table.value : table.wait;
  return count > 0 ? Math.ceil(wait / count) * advance : Infinity;
}
