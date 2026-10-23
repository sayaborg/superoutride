/**
 * A heading table's plan ([Plan from a heading table](../../docs/original-road-data.md#plan-from-a-heading-table)):
 * its runs, each the headings one line holds within the table's resolution, as arcs at their lines' rates, and turns
 * between them over the positions between them.
 */
import { requireInput } from '../course/authoring-io.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { Path } from './road-tables.js';

/** A run of a table: its entries `from` to `to` and its line, its minimax one, `start` at `from`'s position. */
export interface HeadingRun {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  /** Radians a position. */
  readonly rate: number;
}

/** A plan element over positions `[from, to]`: a straight, or an arc turning `turn` radians (left positive). */
export interface PlanElement {
  readonly from: number;
  readonly to: number;
  readonly turn: number;
}

const TURN = 2 * Math.PI;

/**
 * A heading vector table's resolution, radians, as the originals' road paths hold their vectors about 4096 long: a unit
 * and a half of the 4096, where their runs stop growing fewer (SUPER HANG-ON's AFRICA has 167 runs at one unit, 142 at
 * 1.5 and 141 at 2; ENDURO RACER 148, 132 and 128).
 */
export const VECTOR_RESOLUTION = 1.5 / 4096;

/** A path's headings, radians counterclockwise in its (x, y), each its vector's, unwrapped. */
export function pathHeadings(path: Path): number[] {
  const out: number[] = [];
  path.x.forEach((x, i) => {
    const a = Math.atan2(path.y[i]!, x);
    out.push(i === 0 ? a : out[i - 1]! + ((((a - out[i - 1]!) % TURN) + 1.5 * TURN) % TURN) - TURN / 2);
  });
  return out;
}

type Point = readonly [number, number];
const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * Points in increasing x as their lower and upper hulls, and their minimax line: the slope, among the hulls' edges',
 * at which the points' vertical spread is least, and the line through the middle of that spread. A point alone has the
 * level line through it.
 */
class Hull {
  private constructor(
    private readonly lower: readonly Point[],
    private readonly upper: readonly Point[],
  ) {}

  static of(point: Point) {
    return new Hull([point], [point]);
  }

  with(point: Point): Hull {
    const add = (chain: readonly Point[], sign: number) => {
      const out = [...chain];
      while (out.length >= 2 && sign * cross(out.at(-2)!, out.at(-1)!, point) <= 0) out.pop();
      out.push(point);
      return out;
    };
    return new Hull(add(this.lower, 1), add(this.upper, -1));
  }

  /** The points' vertical spread about the line of slope `rate`, and that line's middle value at x = 0. */
  private spread(rate: number) {
    const high = Math.max(...this.upper.map(([x, y]) => y - rate * x));
    const low = Math.min(...this.lower.map(([x, y]) => y - rate * x));
    return { width: high - low, middle: (high + low) / 2 };
  }

  line(): { width: number; rate: number; middle: number } {
    const slopes = [this.lower, this.upper].flatMap((chain) =>
      chain.slice(1).map((p, i) => (p[1] - chain[i]![1]) / (p[0] - chain[i]![0])),
    );
    let best = { rate: 0, ...this.spread(0) };
    for (const [k, rate] of slopes.entries()) {
      const s = this.spread(rate);
      if (k === 0 || s.width < best.width) best = { rate, ...s };
    }
    return best;
  }
}

/** A heading table: its headings (radians), each at its position, the positions increasing. */
export interface HeadingTable {
  readonly positions: readonly number[];
  readonly headings: readonly number[];
}

/** Headings one a position from position 0. */
export const evenly = (headings: readonly number[]): HeadingTable => ({
  positions: headings.map((_, i) => i),
  headings,
});

/**
 * A table's runs in its order: a run takes the next heading while some line holds every heading of it within
 * `resolution` (radians), and ends at the first it cannot take; its line is its minimax one.
 */
export function headingRuns({ positions, headings }: HeadingTable, resolution: number): HeadingRun[] {
  const runs: HeadingRun[] = [];
  for (let from = 0; from < headings.length;) {
    let hull = Hull.of([0, headings[from]!]);
    let to = from;
    while (to + 1 < headings.length) {
      const next = hull.with([positions[to + 1]! - positions[from]!, headings[to + 1]!]);
      if (next.line().width > 2 * resolution) break;
      hull = next;
      to++;
    }
    const { rate, middle } = hull.line();
    runs.push({ from, to, start: middle, rate });
    from = to + 1;
  }
  return runs;
}

/** A turn between runs: over the table's entries `[a, b]`, from run `left`'s line at `a` to run `right`'s at `b`. */
interface Join {
  readonly a: number;
  readonly b: number;
  readonly left: number;
  readonly right: number;
}

/**
 * A table's plan, its positions `metres` apart, whose elements turn at radii over `radius(from, to)`, the least its
 * coordinate domain admits over positions `[from, to]`:
 * - each run an arc at its line's rate between the turns either side of it, but one whose radius would not be over
 *   `radius`, which is taken into those turns, as one;
 * - two runs joined by a turn over the step between them, or over the fewest more, one more on each side a round,
 *   taken from the runs beside it, where its radius would not be over `radius` or it lies between two cells of a
 *   Section whose domain the course format does not admit (`refused`: the stretches of positions from the earlier such
 *   cell to the later, for the plan of the elements given); a turn that takes a run's whole arc, or overlaps the next
 *   turn, joins with it, the runs beyond it the ones it turns between;
 * - each element turning from the heading the elements before it reach to its end's on the lines (an arc's end on its
 *   run's line, a turn's on the next run's), one that would be straighter than the course format's longest radius a
 *   straight, its turn left to the next; straights one after another one.
 * The runs, the plan, its start heading, and the heading its last element leaves unturned.
 */
export function headingPlan(
  table: HeadingTable,
  resolution: number,
  metres: number,
  radius: (from: number, to: number) => number,
  refused: (elements: readonly PlanElement[]) => readonly (readonly [number, number])[],
) {
  const { positions } = table;
  const runs = headingRuns(table, resolution);
  const line = (r: number, x: number) => runs[r]!.start + runs[r]!.rate * (x - positions[runs[r]!.from]!);
  const last = positions.length - 1;
  const sharp = (r: number) =>
    Math.abs(runs[r]!.rate) * radius(positions[runs[r]!.from]!, positions[runs[r]!.to]!) >= metres;
  requireInput(
    !sharp(0) && !sharp(runs.length - 1),
    '/plan',
    "A table's first or last run turns too sharply for its coordinate domain",
  );
  /** The plan the turns `joins` make, and the heading its last element leaves unturned. */
  const laid = (joins: readonly Join[]) => {
    const ends: { from: number; to: number; heading: number }[] = [];
    let [at, run] = [positions[0]!, 0];
    for (const j of joins) {
      const [a, b] = [positions[j.a]!, positions[j.b]!];
      if (a > at) ends.push({ from: at, to: a, heading: line(run, a) });
      ends.push({ from: a, to: b, heading: line(j.right, b) });
      [at, run] = [b, j.right];
    }
    if (positions[last]! > at) ends.push({ from: at, to: positions[last]!, heading: line(run, positions[last]!) });
    let heading = line(0, positions[0]!);
    const elements: PlanElement[] = [];
    for (const e of ends) {
      const turn = e.heading - heading;
      const straight = turn === 0 || ((e.to - e.from) * metres) / Math.abs(turn) >= COURSE_DOCUMENT_LIMITS.lengthMeters;
      if (!straight) heading = e.heading;
      const before = elements.at(-1);
      if (straight && before?.turn === 0) elements[elements.length - 1] = { ...before, to: e.to };
      else elements.push({ from: e.from, to: e.to, turn: straight ? 0 : turn });
    }
    return { elements, unturned: line(run, positions[last]!) - heading };
  };
  // The turns between runs, a sharp run's taken into those either side of it.
  let joins: Join[] = [];
  for (let k = 1; k < runs.length; k++) {
    const before = joins.at(-1);
    if (before && sharp(k - 1)) joins[joins.length - 1] = { ...before, b: runs[k]!.from, right: k };
    else joins.push({ a: runs[k - 1]!.to, b: runs[k]!.from, left: k - 1, right: k });
  }
  const span = (j: Join) => [positions[j.a]!, positions[j.b]!] as const;
  const turnOf = (j: Join) => line(j.right, positions[j.b]!) - line(j.left, positions[j.a]!);
  const within = (j: Join, [p, q]: readonly [number, number]) => span(j)[0] < q && span(j)[1] > p;
  for (;;) {
    const stretches = refused(laid(joins).elements);
    const keeps = joins.map(
      (j) =>
        Math.abs(turnOf(j)) * radius(...span(j)) < (span(j)[1] - span(j)[0]) * metres &&
        !stretches.some((t) => within(j, t)),
    );
    requireInput(
      stretches.every((t) => joins.some((j) => within(j, t))),
      '/plan',
      "No turn lies between the cells where a Section's domain passes over itself",
    );
    if (keeps.every(Boolean)) break;
    const widened = joins.map((j, k) => (keeps[k] ? j : { ...j, a: j.a - 1, b: j.b + 1 }));
    requireInput(
      widened.every((j) => j.a >= 0 && j.b <= last),
      '/plan',
      'A turn needs more positions than its table has',
    );
    joins = [];
    for (const j of widened) {
      const before = joins.at(-1);
      if (before && j.a < before.b) joins[joins.length - 1] = { ...before, b: j.b, right: j.right };
      else joins.push(j);
    }
  }
  return { runs, ...laid(joins), start: line(0, positions[0]!) };
}

/**
 * How far the plan of `elements`, laid from heading `start`, lies from the line the table's headings build (each step
 * along its ends' mean heading) at the table's positions, at most, metres.
 */
export function departure(
  { positions, headings }: HeadingTable,
  elements: readonly PlanElement[],
  start: number,
  metres: number,
) {
  let [x, y, h] = [0, 0, start];
  let [px, py] = [0, 0];
  let most = 0;
  let i = 0;
  for (const e of elements) {
    const k = e.turn / ((e.to - e.from) * metres);
    for (; positions[i]! < e.to; i++) {
      const d = (positions[i + 1]! - positions[i]!) * metres;
      const mean = (headings[i]! + headings[i + 1]!) / 2;
      [px, py] = [px + d * Math.cos(mean), py + d * Math.sin(mean)];
      if (k === 0) [x, y] = [x + d * Math.cos(h), y + d * Math.sin(h)];
      else {
        [x, y] = [x + (Math.sin(h + k * d) - Math.sin(h)) / k, y + (Math.cos(h) - Math.cos(h + k * d)) / k];
        h += k * d;
      }
      most = Math.max(most, Math.hypot(x - px, y - py));
    }
  }
  return most;
}
