/**
 * A heading table's plan ([Plan from a heading table](../../docs/original-road-data.md#plan-from-a-heading-table)):
 * its runs, each the headings one line holds within the table's resolution, as arcs at their lines' rates, and turns
 * between them over the positions between them.
 */
import { requireInput } from '../course/authoring-io.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { CourseInputError } from '../../src/course/course-diagnostics.js';
import type { CompiledPlanLateralDomain } from '../../src/course/course-coordinate-domain.js';
import { compilePlanPath, type PlanSegmentGeometry } from '../../src/course/geometry/plan-path.js';
import { validatePlanDomainInjectivity } from '../../src/course/plan-domain-injectivity.js';
import type { Path } from './road-tables.js';

/** A run of a table: its headings `from` to `to` (positions) and its line, its minimax one, `start` at `from`. */
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

/**
 * A table's runs in its order: a run takes the next heading while some line holds every heading of it within
 * `resolution` (radians), and ends at the first it cannot take; its line is its minimax one.
 */
export function headingRuns(headings: readonly number[], resolution: number): HeadingRun[] {
  const runs: HeadingRun[] = [];
  for (let from = 0; from < headings.length;) {
    let hull = Hull.of([0, headings[from]!]);
    let to = from;
    while (to + 1 < headings.length) {
      const next = hull.with([to + 1 - from, headings[to + 1]!]);
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

/** A turn between runs: over positions `[a, b]`, from run `left`'s line at `a` to run `right`'s at `b`. */
interface Join {
  readonly a: number;
  readonly b: number;
  readonly left: number;
  readonly right: number;
}

/** A constant domain `reach` metres either side of a plan. */
const constantDomain = (reach: number): CompiledPlanLateralDomain => ({
  stations: [],
  lateralAt: (_s, out) => Object.assign(out, { left: -reach, right: reach }),
});

/**
 * Whether the course format admits a coordinate domain `reach` metres either side of the elements of `elements` that
 * reach into positions `(from, to)`, whole, their positions `metres` apart: its local metric holds and it does not pass
 * over itself.
 */
function admitted(elements: readonly PlanElement[], from: number, to: number, metres: number, reach: number) {
  const geometry: PlanSegmentGeometry[] = [];
  for (const e of elements) {
    if (e.to <= from || e.from >= to) continue;
    const length = (e.to - e.from) * metres;
    if (Math.abs(e.turn) * reach >= length) return false;
    // The format's arcs turn right positive.
    geometry.push(
      e.turn === 0 ? { kind: 'straight', length } : { kind: 'arc', radius: length / Math.abs(e.turn), turn: -e.turn },
    );
  }
  try {
    validatePlanDomainInjectivity(
      '',
      compilePlanPath({ x: 0, z: 0, heading: 0 }, geometry).segments,
      constantDomain(reach),
      '',
    );
    return true;
  } catch (error) {
    if (error instanceof CourseInputError) return false;
    throw error;
  }
}

/**
 * A table's plan, its positions `metres` apart, whose coordinate domain reaches `reach` metres either side of it:
 * - each run an arc at its line's rate between the turns either side of it, but one whose arc would pass the domain
 *   over itself (its radius not over `reach`), which is taken into those turns, as one;
 * - two runs joined by a turn over the position between them, or, where the course format does not admit the domain
 *   about that turn (the plan within `reach` of it either side), over the fewest more, one more on each side a round,
 *   taken from the runs beside it; a turn that takes a run's whole arc, or overlaps the next turn, joins with it, the
 *   runs beyond it the ones it turns between;
 * - each element turning from the heading the elements before it reach to its end's on the lines (an arc's end on its
 *   run's line, a turn's on the next run's), one that would be straighter than the course format's longest radius a
 *   straight, its turn left to the next; straights one after another one.
 * The runs, the plan, its start heading, and the heading its last element leaves unturned.
 */
export function headingPlan(headings: readonly number[], resolution: number, metres: number, reach: number) {
  const runs = headingRuns(headings, resolution);
  const line = (r: number, x: number) => runs[r]!.start + runs[r]!.rate * (x - runs[r]!.from);
  const last = headings.length - 1;
  const sharp = (r: number) => Math.abs(runs[r]!.rate) * reach >= metres;
  requireInput(
    !sharp(0) && !sharp(runs.length - 1),
    '/plan',
    "A table's first or last run turns too sharply for its coordinate domain",
  );
  /** The plan the turns `joins` make, and the heading its last element leaves unturned. */
  const laid = (joins: readonly Join[]) => {
    const ends: { from: number; to: number; heading: number }[] = [];
    let [at, run] = [0, 0];
    for (const j of joins) {
      if (j.a > at) ends.push({ from: at, to: j.a, heading: line(run, j.a) });
      ends.push({ from: j.a, to: j.b, heading: line(j.right, j.b) });
      [at, run] = [j.b, j.right];
    }
    if (last > at) ends.push({ from: at, to: last, heading: line(run, last) });
    let heading = line(0, 0);
    const elements: PlanElement[] = [];
    for (const e of ends) {
      const turn = e.heading - heading;
      const straight = turn === 0 || ((e.to - e.from) * metres) / Math.abs(turn) >= COURSE_DOCUMENT_LIMITS.lengthMeters;
      if (!straight) heading = e.heading;
      const before = elements.at(-1);
      if (straight && before?.turn === 0) elements[elements.length - 1] = { ...before, to: e.to };
      else elements.push({ from: e.from, to: e.to, turn: straight ? 0 : turn });
    }
    return { elements, unturned: line(run, last) - heading };
  };
  // The turns between runs, a sharp run's taken into those either side of it.
  let joins: Join[] = [];
  for (let k = 1; k < runs.length; k++) {
    const before = joins.at(-1);
    if (before && sharp(k - 1)) joins[joins.length - 1] = { ...before, b: runs[k]!.from, right: k };
    else joins.push({ a: runs[k - 1]!.to, b: runs[k]!.from, left: k - 1, right: k });
  }
  const around = reach / metres;
  for (;;) {
    const { elements } = laid(joins);
    const keeps = joins.map((j) => admitted(elements, j.a - around, j.b + around, metres, reach));
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
  return { runs, ...laid(joins), start: line(0, 0) };
}

/**
 * How far the plan of `elements`, laid from heading `start`, lies from the line the headings build (each position a
 * step along its ends' mean heading) at the positions, at most, metres.
 */
export function departure(
  headings: readonly number[],
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
    for (; i < e.to; i++) {
      const mean = (headings[i]! + headings[i + 1]!) / 2;
      [px, py] = [px + metres * Math.cos(mean), py + metres * Math.sin(mean)];
      if (k === 0) [x, y] = [x + metres * Math.cos(h), y + metres * Math.sin(h)];
      else {
        [x, y] = [x + (Math.sin(h + k * metres) - Math.sin(h)) / k, y + (Math.cos(h) - Math.cos(h + k * metres)) / k];
        h += k * metres;
      }
      most = Math.max(most, Math.hypot(x - px, y - py));
    }
  }
  return most;
}
