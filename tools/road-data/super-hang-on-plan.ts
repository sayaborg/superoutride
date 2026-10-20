/**
 * SUPER HANG-ON's road path P as straights and arcs ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * each section's path, its folds spread, laid off as the longest elements that stay near the line its headings build,
 * the section's ends straight at the heading every section starts and ends with.
 */
import { instruction, long } from './program-words.js';
import type { Path } from './super-hang-on-road.js';

/** A fold is a position turning more than this off its seven positions' median, degrees. */
const FOLD_DEGREES = 1;
/** A fold's excess is spread evenly over the seven positions about it. */
const FOLD_REACH = 3;
/** An element lies within this of the line its headings build at every position it spans, metres. */
const ELEMENT_TOLERANCE = 0.25;
/** An element turning less than this is a straight, degrees. */
const STRAIGHT_DEGREES = 0.01;
/** An element stops growing once this many longer ones in a row miss the line. */
const MISSES = 8;
/**
 * An arc straighter than this radius is a straight, its turn carried by the next arc, metres: the course format takes
 * radii up to its length bound.
 */
const STRAIGHTEST = 40000;

/**
 * One road position in metres, from the main CPU's program: at speed v the display shows v × 0x117 / 0xF0 km/h (the
 * `mulu.w #$117` and `divu.w #$F0` at 0x15DA), each tick advances the road 0x97 × v / 65536 positions (the long at
 * 0x8848), and the clock counts 60 ticks a second (the `moveq #$3C, d1` at 0x544E).
 */
export function positionMetres(main: Uint8Array): number {
  const [multiplier] = instruction(main, 0x15da, [0xc0fc, null], "the speed display's factor");
  const [divisor] = instruction(main, 0x15de, [0x80fc, null], "the speed display's divisor");
  const [moveq] = instruction(main, 0x544e, [null], "the clock's ticks a second");
  if (moveq! >> 8 !== 0x72) throw new RangeError("The program at 0x544E does not set the clock's ticks a second");
  const ticks = moveq! & 0xff;
  const advance = long(main, 0x8848);
  return ((multiplier! / divisor!) * 65536) / (3.6 * ticks * advance);
}

/** A plan element over positions `[from, to]`: a straight, or an arc turning `turn` radians (left positive). */
export interface PlanSegment {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

/** The headings of a path's vectors, degrees counterclockwise in its (x, y), unwrapped. */
function headingsOf(path: Path): number[] {
  const out: number[] = [];
  path.x.forEach((x, i) => {
    const a = (Math.atan2(path.y[i]!, x) * 180) / Math.PI;
    out.push(i === 0 ? a : out[i - 1]! + ((((a - out[i - 1]!) % 360) + 540) % 360) - 180);
  });
  return out;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
};

/**
 * Turns `t` (degrees a position) with each fold's excess, its turn less the median of the seven about it (fewer at the
 * path's ends), spread evenly over those seven: the sum is kept. The folds are found on the turns as read.
 */
export function spreadFolds(t: readonly number[]): { turns: number[]; folds: { at: number; excess: number }[] } {
  const turns = [...t];
  const folds: { at: number; excess: number }[] = [];
  t.forEach((value, i) => {
    const [lo, hi] = [Math.max(0, i - FOLD_REACH), Math.min(t.length, i + FOLD_REACH + 1)];
    const excess = value - median(t.slice(lo, hi));
    if (Math.abs(excess) <= FOLD_DEGREES) return;
    folds.push({ at: i, excess });
    turns[i]! -= excess;
    for (let j = lo; j < hi; j++) turns[j]! += excess / (hi - lo);
  });
  return { turns, folds };
}

/** The line headings `h` (degrees) build: from the origin, each position a step along its ends' mean heading. */
function lineOf(h: readonly number[], metres: number): [number, number][] {
  const points: [number, number][] = [[0, 0]];
  for (let i = 0; i + 1 < h.length; i++) {
    const a = (((h[i]! + h[i + 1]!) / 2) * Math.PI) / 180;
    const [x, y] = points[i]!;
    points.push([x + metres * Math.cos(a), y + metres * Math.sin(a)]);
  }
  return points;
}

/**
 * How far the curve from `line[a]` heading `h[a]` and turning evenly to `h[b]` over `b − a` positions lies from the
 * line at the positions between, at most.
 */
function missOf(line: readonly [number, number][], h: readonly number[], a: number, b: number, metres: number) {
  const a0 = (h[a]! * Math.PI) / 180;
  const turn = ((h[b]! - h[a]!) * Math.PI) / 180;
  const k = Math.abs(h[b]! - h[a]!) < STRAIGHT_DEGREES ? 0 : turn / ((b - a) * metres);
  const [x0, y0] = line[a]!;
  let most = 0;
  for (let j = a + 1; j <= b; j++) {
    const d = (j - a) * metres;
    const x = k === 0 ? x0 + d * Math.cos(a0) : x0 + (Math.sin(a0 + k * d) - Math.sin(a0)) / k;
    const y = k === 0 ? y0 + d * Math.sin(a0) : y0 + (Math.cos(a0) - Math.cos(a0 + k * d)) / k;
    most = Math.max(most, Math.hypot(x - line[j]![0], y - line[j]![1]));
  }
  return most;
}

/**
 * A section's path as straights and arcs over its positions, with what was spread and how far each element lies from
 * the line before the folds were spread:
 * - the turns' folds spread (`spreadFolds`), the headings and their line rebuilt;
 * - from the section's start, each element the longest that stays within `ELEMENT_TOLERANCE` of the line (grown a
 *   position at a time until `MISSES` in a row miss): a straight where it turns less than `STRAIGHT_DEGREES`, else an
 *   arc turning evenly from heading to heading;
 * - the first and last elements straight at the section's end headings, each arc's turn its end heading less the
 *   heading the elements before reach, the last arc's end the section's end heading, so no turn dropped is lost; an
 *   arc straighter than `STRAIGHTEST` a straight, its turn carried by the next arc; straights one after another one.
 */
export function sectionPlan(path: Path, metres: number) {
  const read = headingsOf(path);
  const t = read.slice(1).map((h, i) => h - read[i]!);
  const { turns, folds } = spreadFolds(t);
  const h = [read[0]!];
  for (const turn of turns) h.push(h.at(-1)! + turn);
  const line = lineOf(h, metres);
  const end = h.length - 1;
  const spans: [number, number][] = [];
  for (let a = 0; a < end;) {
    let best = a + 1;
    for (let b = a + 1, misses = 0; b <= end && misses < MISSES; b++) {
      if (missOf(line, h, a, b, metres) <= ELEMENT_TOLERANCE) [best, misses] = [b, 0];
      else misses++;
    }
    spans.push([a, best]);
    a = best;
  }
  const straight = (k: number) =>
    k === 0 || k === spans.length - 1 || Math.abs(h[spans[k]![1]]! - h[spans[k]![0]]!) < STRAIGHT_DEGREES;
  let lastArc = -1;
  spans.forEach((_, k) => {
    if (!straight(k)) lastArc = k;
  });
  let heading = h[0]!;
  const laid: PlanSegment[] = spans.map(([from, to], k) => {
    if (straight(k)) return { from, to, turn: 0 };
    const target = k === lastArc ? h[end]! : h[to]!;
    const turn = ((target - heading) * Math.PI) / 180;
    if (k !== lastArc && Math.abs(turn) * STRAIGHTEST < (to - from) * metres) return { from, to, turn: 0 };
    if (Math.abs(turn) * STRAIGHTEST < (to - from) * metres)
      throw new RangeError(`The path's last arc, ${from} to ${to}, is straighter than ${STRAIGHTEST} m`);
    heading = target;
    return { from, to, turn };
  });
  // Straights one after another are one.
  const segments: PlanSegment[] = [];
  for (const e of laid) {
    const last = segments.at(-1);
    if (last && last.turn === 0 && e.turn === 0) segments[segments.length - 1] = { ...last, to: e.to };
    else segments.push(e);
  }
  // How far each element as fitted lies from the line before the folds were spread, from its start there.
  const before = lineOf(read, metres);
  const offLine = spans.map(([a, b]) => {
    const shifted = before.map(([x, y]) => [x - before[a]![0] + line[a]![0], y - before[a]![1] + line[a]![1]] as [number, number]);
    return missOf(shifted, h, a, b, metres);
  });
  return { segments, folds, offLine, headings: { start: read[0]!, end: read[end]! } };
}
