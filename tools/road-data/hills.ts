/**
 * OUTRUN's hills as its screen shows them ([Original road data](../../docs/original-road-data.md#hills)): the road's top
 * row along a stage, from its height points and height tables, by the original's rule. Nothing is fitted. With them,
 * the board's ticks and what a road position and a stripe are in metres.
 */
import type { HeightTable, WidthHeightPoint } from './road-tables.js';

/** The road's lines, its bottom row, and the level horizon's base (each line's slope is base × 16, 16.16 rows). */
const LINES = 512;
const BOTTOM_ROW = 223;
export const LEVEL_HORIZON = 0x240;
/** A table's entry spans 2.125 × step positions (times its factor for kind 0). */
const ENTRY = 2.125;
/** A hold's wait counts down by the whole part of this × positions advanced ÷ step each tick. */
const WAIT_RATE = 120;
/** Ticks a second, and the road position each km/h advances a tick (0x12F, 16.16). */
export const TICKS = 30;
export const POSITION_PER_KMH = 0x12f / 65536;
/** One road position in metres: each tick the displayed km/h advances it by 0x12F / 65536 positions. */
export const POSITION_METRES = 1 / (3.6 * TICKS * POSITION_PER_KMH);
/** The stripes' period, metres: each tick adds km/h / 64 three times to the road's fine position, 32 of it a period. */
export const STRIPE_PERIOD = ((32 * 303) / 3072) * POSITION_METRES;

/**
 * The road's top row: 512 lines in seven segments, near to far, `s0 = 255(1 − f)`, `s1 = (256 + 255f)/2`, and the rest
 * halved in turn (R/2, R/4, R/8, R/16, R/16); segment 0's slope `base × 16`, each further segment's its predecessor's
 * plus `increments[k − 1]`. Each line's row is 223 − the slopes summed from the nearest line, ÷ 65536; the top is the
 * least.
 */
export function roadTop(base: number, increments: readonly number[], f: number): number {
  const s0 = 255 * (1 - f),
    s1 = (256 + 255 * f) / 2,
    rest = LINES - s0 - s1;
  const lengths = [s0, s1, rest / 2, rest / 4, rest / 8, rest / 16, rest / 16];
  let slope = base * 16,
    sum = 0,
    top = BOTTOM_ROW;
  lengths.forEach((length, k) => {
    if (k > 0) slope += increments[k - 1] ?? 0;
    // Within a segment rows change linearly: the extremes lie at its ends.
    sum += slope * length;
    top = Math.min(top, BOTTOM_ROW - sum / 65536);
  });
  return top;
}

/** The positions each entry of a kind 0 or 3 table spans: 2.125 × step × the factor its sign selects. */
function entrySpans(table: HeightTable): number[] {
  if (table.kind !== 0 && table.kind !== 3) return [];
  return table.entries.map((e) => {
    const factor = table.kind === 3 || e === 0 ? 1 : e > 0 ? table.ascent : table.descent;
    return ENTRY * table.step * factor;
  });
}

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
  return entrySpans(table)
    .slice(0, table.entries.length - 6)
    .reduce((a, b) => a + b, 0);
}

/**
 * The tables a stage's height points run: each point starts its table when the road position reaches it, unless a table
 * is still running (the point is dropped). Kinds 0 and 4 end with their rise; kinds 1 to 3 hold while their wait counts
 * down at `kmh(p)`, p where the rise ends, and return over 2.125 × step.
 */
export function tableRuns(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  kmh: (position: number) => number,
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
      const holdEnd = rise + holdLength(table, kmh(rise));
      runs.push({ number, table, start, rise, holdEnd, end: holdEnd + ENTRY * table.step });
    }
  }
  return runs;
}

/**
 * The road's top along a stage at each of `positions` (ascending), its tables run by `tableRuns`.
 * - Kind 0 slides its entries through the window, each over its span, and ends when the entry six ahead is its end.
 * - Kinds 1 and 3 rise over 2.125 × step, hold while their wait counts down, and return over 2.125 × step: kind 1 its
 *   two entries on segments 1 and 2 at the rise's share; kind 3 slides its entries in as kind 0 does, holds them, and
 *   returns them at a falling share.
 * - Kind 4 moves the horizon's base to its value over 2.125 × step, which stays.
 */
export function hillsAlong(
  points: readonly WidthHeightPoint[],
  tables: ReadonlyMap<number, HeightTable>,
  positions: readonly number[],
  kmh: (position: number) => number,
): Float64Array {
  const runs = tableRuns(points, tables, kmh);
  const tops = new Float64Array(positions.length);
  let base = LEVEL_HORIZON,
    from = LEVEL_HORIZON,
    next = 0;
  let running: TableRun | null = null;
  positions.forEach((p, n) => {
    while (next < runs.length && runs[next]!.start <= p) {
      running = runs[next++]!;
      from = base;
    }
    let increments: number[] = [];
    let f = 0;
    const run = running as TableRun | null;
    if (run && p < run.end) {
      const { table, start } = run;
      const x = p - start;
      const ramp = ENTRY * table.step;
      if (table.kind === 4) base = from + (table.horizon - from) * Math.min(1, x / ramp);
      else if (table.kind === 0) {
        const spans = entrySpans(table);
        let i = 0,
          rest = x;
        while (i < spans.length && rest >= spans[i]!) rest -= spans[i++]!;
        f = rest / spans[i]!;
        increments = window(table.entries, i, f);
      } else {
        // Kinds 1 and 3: rise, hold (counted by tick at the speed there), return.
        const rise = run.rise - start;
        const share = x < rise ? x / rise : p < run.holdEnd ? 1 : Math.max(0, 1 - (p - run.holdEnd) / ramp);
        if (table.kind !== 3) increments = [16 * share * table.entries[0]!, 16 * share * table.entries[1]!];
        else {
          // Kind 3 slides in as kind 0 does, then holds the full window and returns it at a falling share.
          const spans = entrySpans(table);
          let i = 0,
            restIn = Math.min(x, rise);
          while (i < spans.length - 6 && restIn >= spans[i]!) restIn -= spans[i++]!;
          increments =
            x < rise
              ? window(table.entries, i, restIn / spans[i]!)
              : window(table.entries, table.entries.length - 6, 0, share);
        }
      }
    } else if (run?.table.kind === 4) base = run.table.horizon;
    tops[n] = roadTop(base, increments, f);
  });
  return tops;
}

/**
 * A hold's length in positions at `kmh`: each tick advances `kmh × 0x12F / 65536` positions and counts the wait down by
 * the whole part of `120 × that ÷ step`, so it lasts longer the slower the car.
 */
export function holdLength(table: HeightTable, kmh: number): number {
  if (table.kind !== 1 && table.kind !== 3) return 0;
  const advance = kmh * POSITION_PER_KMH;
  const count = Math.floor((WAIT_RATE * advance) / table.step);
  const wait = table.kind === 3 ? table.value : table.wait;
  return count > 0 ? Math.ceil(wait / count) * advance : Infinity;
}
