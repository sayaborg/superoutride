/**
 * A closed point path's plan ([Plan from a point path](../../docs/original-road-data.md#plan-from-a-point-path)): its
 * runs, each the points one circle holds within the path's resolution, as arcs of their minimax circles, and turns
 * between them, two arcs each, from one run's circle to the next's; every element lies where its points do, so the plan
 * closes as the path does.
 */
import { requireInput } from '../authoring/authoring-error.js';
import { contractUnmet } from './conversion-errors.js';

type Point = readonly [number, number];

/** An oriented circle: a point on it, its direction there, and its curvature, left positive (0 a line). */
export interface Circle {
  readonly m: Point;
  readonly t: Point;
  readonly k: number;
}

/** A plan element: from its start's point and direction, `length` long, turning `turn` radians (left positive). */
export interface PointPlanElement {
  readonly start: Point;
  readonly t: Point;
  readonly length: number;
  readonly turn: number;
}

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const add = (a: Point, b: Point, s = 1): Point => [a[0] + s * b[0], a[1] + s * b[1]];
const left = (t: Point): Point => [-t[1], t[0]];
const unit = (a: Point): Point => {
  const l = Math.hypot(a[0], a[1]);
  return [a[0] / l, a[1] / l];
};
const turned = (t: Point, a: number): Point => [
  Math.cos(a) * t[0] - Math.sin(a) * t[1],
  Math.sin(a) * t[0] + Math.cos(a) * t[1],
];

/** p in circle c's frame: along its direction from its point, and left of it. */
const local = (c: Circle, p: Point): Point => {
  const d = sub(p, c.m);
  return [dot(d, c.t), dot(d, left(c.t))];
};

/** The signed distance of p from c, left positive: 2F / (1 + √(1 − 2kF)), F = y − k(x² + y²)/2 on c's frame. */
export function distance(c: Circle, p: Point) {
  const [x, y] = local(c, p);
  const F = y - (c.k / 2) * (x * x + y * y);
  return (2 * F) / (1 + Math.sqrt(Math.max(0, 1 - 2 * c.k * F)));
}

/** The arc length along c from its point to the foot of p, negative behind it. */
export function along(c: Circle, p: Point) {
  const [x, y] = local(c, p);
  return c.k === 0 ? x : Math.atan2(c.k * x, 1 - c.k * y) / c.k;
}

/** The point `s` along c and c's direction there. */
export function at(c: Circle, s: number): { readonly p: Point; readonly t: Point } {
  const th = c.k * s;
  const x = c.k === 0 ? s : Math.sin(th) / c.k;
  const y = c.k === 0 ? 0 : (2 * Math.sin(th / 2) ** 2) / c.k;
  return { p: add(add(c.m, c.t, x), left(c.t), y), t: turned(c.t, th) };
}

/** Solves a square linear system by elimination, null where it is singular. */
function solve(a: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (Math.abs(m[p]![c]!) < 1e-300) return null;
    [m[c], m[p]] = [m[p]!, m[c]!];
    for (let r = 0; r < n; r++)
      if (r !== c) {
        const f = m[r]![c]! / m[c]![c]!;
        for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
      }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * The Chebyshev fit of `target` at points 0 … n − 1 by the m functions `basis`: the coefficients whose largest error is
 * least, by single exchange over m + 1 points whose errors alternate (points in order; the basis meets 0 at m − 1
 * points at most on them). With n ≤ m, the combination through every point.
 */
export function chebyshev(n: number, basis: (i: number) => number[], target: (i: number) => number): number[] {
  const m = basis(0).length;
  if (n <= m) {
    const rows = Array.from({ length: n }, (_, i) => basis(i));
    // Fewer points than functions: the last functions left out.
    const fit = solve(
      rows.map((row) => row.slice(0, n)),
      rows.map((_, i) => target(i)),
    )!;
    return [...fit, ...Array.from({ length: m - n }, () => 0)];
  }
  let ref = Array.from({ length: m + 1 }, (_, r) => Math.round((r * (n - 1)) / m));
  let fit = Array.from({ length: m }, () => 0);
  for (;;) {
    const s = solve(
      ref.map((i, r) => [...basis(i), r % 2 ? -1 : 1]),
      ref.map(target),
    );
    if (!s) return fit;
    fit = s.slice(0, m);
    const error = (i: number) => target(i) - basis(i).reduce((sum, v, j) => sum + v * fit[j]!, 0);
    let [far, most] = [0, 0];
    for (let i = 0; i < n; i++) if (Math.abs(error(i)) > most) [far, most] = [i, Math.abs(error(i))];
    if (most <= Math.abs(s[m]!) * (1 + 1e-12) + 1e-12 || ref.includes(far)) return fit;
    const sign = (i: number) => Math.sign(error(i));
    if (far < ref[0]!) ref = sign(far) === sign(ref[0]!) ? [far, ...ref.slice(1)] : [far, ...ref.slice(0, m)];
    else if (far > ref[m]!) ref = sign(far) === sign(ref[m]!) ? [...ref.slice(0, m), far] : [...ref.slice(1), far];
    else {
      const j = ref.findIndex((r, q) => r < far && ref[q + 1]! > far);
      ref[sign(far) === sign(ref[j]!) ? j : j + 1] = far;
    }
  }
}

/**
 * The minimax circle of points `points`, in order, the circle whose largest distance from them is least (two points'
 * the line through them); and that distance. On a frame at the middle point along its neighbours' chord, the circle is
 * F = y + c + n·x + k(x² + y²)/2 = 0, its coefficients the Chebyshev fit of −y by 1, x and (x² + y²)/2 (on a circle's
 * points any combination of them meets 0 at two points at most); the frame then moves to the curve's foot of its point and direction there, and the fit is made again, three times
 * in all.
 */
export function minimaxCircle(points: readonly Point[]): { readonly circle: Circle; readonly worst: number } {
  const n = points.length;
  requireInput(n >= 2, '/path', 'A circle is fitted to two points at least');
  const middle = Math.floor((n - 1) / 2);
  let o = points[middle]!;
  let t = unit(sub(points[Math.min(n - 1, middle + 1)]!, points[Math.max(0, middle - (n > 2 ? 1 : 0))]!));
  let circle: Circle = { m: o, t, k: 0 };
  for (let pass = 0; pass < 3; pass++) {
    const nl = left(t);
    const xy = points.map((p) => [dot(sub(p, o), t), dot(sub(p, o), nl)] as const);
    const [c, nx, k] = chebyshev(
      n,
      (i) => [1, xy[i]![0], (xy[i]![0] ** 2 + xy[i]![1] ** 2) / 2],
      (i) => -xy[i]![1],
    ) as [number, number, number];
    // The curve through (0, y0) on the frame's normal; its gradient there its left normal; its curvature −k/|∇F|.
    const y0 = (-2 * c) / (1 + Math.sqrt(Math.max(0, 1 - 2 * k * c)));
    const g = unit([nx, 1 + k * y0]);
    const normal: Point = add([g[0] * t[0], g[0] * t[1]], nl, g[1]);
    circle = { m: add(o, nl, y0), t: [normal[1], -normal[0]], k: -k / Math.sqrt(nx * nx + 1 - 2 * k * c) };
    [o, t] = [circle.m, circle.t];
  }
  return { circle, worst: Math.max(...points.map((p) => Math.abs(distance(circle, p)))) };
}

/** A run: its points `from` to `to`, its minimax circle, and how far that lies from them at most. */
export interface PointRun {
  readonly from: number;
  readonly to: number;
  readonly circle: Circle;
  readonly worst: number;
}

/**
 * The runs of points `points` from the first to the last, in order: a run takes the next point while its minimax circle
 * holds every point of it within `resolution`.
 */
export function pointRuns(points: readonly Point[], resolution: number): PointRun[] {
  const runs: PointRun[] = [];
  const last = points.length - 1;
  for (let from = 0; from < last;) {
    let to = from + 1;
    let fit = minimaxCircle(points.slice(from, to + 1));
    while (to < last) {
      const next = minimaxCircle(points.slice(from, to + 2));
      if (next.worst > resolution) break;
      [fit, to] = [next, to + 1];
    }
    runs.push({ from, to, ...fit });
    from = to + 1;
  }
  return runs;
}

/** The arc from p along t to q: its length and turn (a straight where it does not turn). */
function arcTo(p: Point, t: Point, q: Point) {
  const c = sub(q, p);
  const turn = 2 * Math.atan2(cross(t, c), dot(t, c));
  const chord = Math.hypot(c[0], c[1]);
  return { length: Math.abs(turn) < 1e-15 ? chord : (chord * turn) / (2 * Math.sin(turn / 2)), turn };
}

/**
 * The biarc from p0 along t0 to p1 along t1 whose two tangents are as long, d: their ends met halfway, the two arcs
 * tangent there.
 */
export function biarc(p0: Point, t0: Point, p1: Point, t1: Point): PointPlanElement[] {
  const v = sub(p1, p0);
  const s = add(t0, t1);
  const vs = dot(v, s);
  const d = dot(v, v) / (vs + Math.sqrt(vs * vs + 2 * (1 - dot(t0, t1)) * dot(v, v)));
  const j = add(add(p0, p1), sub(t0, t1), d).map((x) => x / 2) as unknown as Point;
  const first = arcTo(p0, t0, j);
  const tj = turned(t0, first.turn);
  const second = arcTo(j, tj, p1);
  return [
    { start: p0, t: t0, ...first },
    { start: j, t: tj, ...second },
  ];
}

/** A turn between runs: from run `left`'s circle at point `a` to run `right`'s at point `b`. */
interface Join {
  readonly a: number;
  readonly b: number;
  readonly left: number;
  readonly right: number;
}

/**
 * A closed point path's plan, its points `points` round from the first to it again (the first not repeated), by its
 * resolution, its elements turning at radii no less than `least(from, to, side)`, the least the course format lets the
 * lanes on a curve's inside `side` keep over points `[from, to]` (`leastLaneRadius`, in the points' units; `to` may be
 * past the last point, round again):
 * - each run an arc of its minimax circle (a straight where that is a line) between the turns either side of it; a
 *   run whose arc would turn tighter than `least` is taken into those turns, as one;
 * - two runs joined by a turn, from the first's circle at the foot of a point to the next's at the foot of another,
 *   the biarc whose tangents are as long: over the step between them and one more step on each side while the turn
 *   holds every point it spans within the resolution, taking at most half of either run; then one more step on each
 *   side a round where an arc of it would turn tighter than `least`; a turn that takes a run's whole arc, or overlaps
 *   the next turn, joins with it, the runs beyond it the ones it turns between;
 * - the plan from the foot of the first point round to it again, and each point's station along it.
 */
export function pointPlan(
  points: readonly Point[],
  resolution: number,
  least: (from: number, to: number, side: 'left' | 'right') => number,
): PointPlan & { readonly runs: readonly PointRun[] } {
  const n = points.length;
  const runs = pointRuns([...points, points[0]!], resolution).map((r) => ({
    ...r,
    to: Math.min(r.to, n - 1),
  }));
  const point = (i: number) => points[((i % n) + n) % n]!;
  const inside = (turn: number) => (turn > 0 ? 'left' : 'right');
  const sharp = (r: number) => {
    const { k } = runs[r]!.circle;
    return k !== 0 && 1 / Math.abs(k) < least(runs[r]!.from, runs[r]!.to, inside(k));
  };
  // The turns between runs, round the lap, a sharp run's taken into those either side of it.
  let joins: Join[] = [];
  runs.forEach((run, k) => {
    const next = (k + 1) % runs.length;
    const b = next === 0 ? n : runs[next]!.from;
    const before = joins.at(-1);
    if (before && sharp(k)) joins[joins.length - 1] = { ...before, b, right: next };
    else joins.push({ a: run.to, b, left: k, right: next });
  });
  const turnOf = (j: Join) => {
    const [from, to] = [runs[j.left]!.circle, runs[j.right]!.circle];
    const f0 = at(from, along(from, point(j.a)));
    const f1 = at(to, along(to, point(j.b)));
    return { f0, f1, arcs: biarc(f0.p, f0.t, f1.p, f1.t) };
  };
  // Whether a turn holds every point it spans within the resolution: each its distance from the arc its foot falls on.
  const holds = (j: Join) => {
    const { arcs } = turnOf(j);
    for (let i = j.a + 1; i < j.b; i++) {
      const p = point(i);
      const off = Math.min(
        ...arcs.map((e) => {
          const c = circleOf(e);
          const s = along(c, p);
          return s >= 0 && s <= e.length ? Math.abs(distance(c, p)) : Infinity;
        }),
      );
      if (off > resolution) return false;
    }
    return true;
  };
  // Each turn as wide as holds its points, taking at most half of each run beside it.
  const steps = (r: number) => runs[r]!.to - runs[r]!.from;
  joins = joins.map((j) => {
    let wide = j;
    for (;;) {
      const next = { ...wide, a: wide.a - 1, b: wide.b + 1 };
      if (2 * (j.a - next.a) > steps(j.left) || 2 * (next.b - j.b) > steps(j.right) || !holds(next)) return wide;
      wide = next;
    }
  });
  const laid = (joins: readonly Join[]): PointPlan => {
    // Round the lap: each turn, then the arc of the run it turns onto to the next turn.
    const chain: (PointPlanElement & { readonly run: number | null })[] = [];
    joins.forEach((j, i) => {
      const turn = turnOf(j);
      for (const e of turn.arcs) chain.push({ ...e, run: null });
      const next = turnOf(joins[(i + 1) % joins.length]!);
      const c = runs[j.right]!.circle;
      const length = along(c, next.f0.p) - along(c, turn.f1.p);
      chain.push({ start: turn.f1.p, t: turn.f1.t, length, turn: c.k * length, run: j.right });
    });
    return cutAtFirst(chain, points, resolution);
  };
  for (;;) {
    const keeps = joins.map((j, i) => {
      const turn = turnOf(j);
      const next = turnOf(joins[(i + 1) % joins.length]!);
      const arcOk = turn.arcs.every(
        (e) => e.length > 0 && Math.abs(e.turn) * least(j.a, j.b, inside(e.turn)) < e.length,
      );
      // The run after it keeps an arc of its own before the next turn.
      const c = runs[j.right]!.circle;
      const runOk = along(c, next.f0.p) > along(c, turn.f1.p);
      return arcOk && runOk;
    });
    if (keeps.every(Boolean)) return { ...laid(joins), runs };
    const widened = joins.map((j, k) => (keeps[k] ? j : { ...j, a: j.a - 1, b: j.b + 1 }));
    if (widened.length <= 1)
      throw contractUnmet("No plan keeps the lanes' least radius: the lap's turns join into one");
    joins = [];
    for (const j of widened) {
      const before = joins.at(-1);
      if (before && j.a <= before.b) joins[joins.length - 1] = { ...before, b: j.b, right: j.right };
      else joins.push(j);
    }
    // The last turn overlapping the first, round the line: one turn.
    const [first, final] = [joins[0]!, joins.at(-1)!];
    if (joins.length > 1 && final.b - n >= first.a) {
      joins[0] = { a: final.a - n, b: first.b, left: final.left, right: first.right };
      joins.pop();
    }
  }
}

/**
 * A plan from a point path: its elements from the foot of its first point round to it again, each point's station
 * along it, its length, and how far a point lies from it at most.
 */
export interface PointPlan {
  readonly elements: readonly PointPlanElement[];
  readonly stations: readonly number[];
  readonly length: number;
  readonly departure: number;
}

/** A cut this near an element's end, in the points' units, is at its end. */
const HAIR = 1e-6;

/** Element e's circle. */
const circleOf = (e: PointPlanElement): Circle => ({ m: e.start, t: e.t, k: e.length === 0 ? 0 : e.turn / e.length });

/** The point `s` along element e, and e's direction there. */
export function onElement(e: PointPlanElement, s: number) {
  return at(circleOf(e), s);
}

/**
 * Round a closed chain: its elements from the foot of the first point round to it again (an element it falls within
 * cut in two), and each point's station along it: its foot on the element nearest it, searched from the last point's.
 */
function cutAtFirst(chain: readonly PointPlanElement[], points: readonly Point[], resolution: number): PointPlan {
  /** The foot of p on e within it, its distance along e and from p. */
  const footOn = (e: PointPlanElement, p: Point) => {
    const s = Math.min(e.length, Math.max(0, along(circleOf(e), p)));
    const q = at(circleOf(e), s).p;
    return { s, gap: Math.hypot(p[0] - q[0], p[1] - q[1]) };
  };
  const nearest = (p: Point) =>
    chain.map((e, i) => ({ i, ...footOn(e, p) })).reduce((best, f) => (f.gap < best.gap ? f : best));
  const found = nearest(points[0]!);
  // The chain from that foot round to it again; a foot at an element's end is the next's start.
  const first =
    found.s > chain[found.i]!.length - HAIR
      ? { i: (found.i + 1) % chain.length, s: 0 }
      : { i: found.i, s: found.s < HAIR ? 0 : found.s };
  const e = chain[first.i]!;
  const tail = onElement(e, first.s);
  const elements: PointPlanElement[] = [
    { start: tail.p, t: tail.t, length: e.length - first.s, turn: (e.turn * (e.length - first.s)) / (e.length || 1) },
    ...chain.slice(first.i + 1),
    ...chain.slice(0, first.i),
    { start: e.start, t: e.t, length: first.s, turn: (e.turn * first.s) / (e.length || 1) },
  ].filter((x) => x.length > 0);
  const starts = elements.map((_, i) => elements.slice(0, i).reduce((sum, x) => sum + x.length, 0));
  const length = starts.at(-1)! + elements.at(-1)!.length;
  // Each point's station: its foot on the nearest element among the few after the last point's.
  let [k, departure, farthest] = [0, found.gap, 0];
  const stations = points.map((p, i) => {
    if (i === 0) return 0;
    let best = { k, ...footOn(elements[k]!, p) };
    for (let j = k + 1; j < Math.min(elements.length, k + 8); j++) {
      const f = footOn(elements[j]!, p);
      if (f.gap < best.gap) best = { k: j, ...f };
    }
    k = best.k;
    if (best.gap > departure) [departure, farthest] = [best.gap, i];
    return starts[k]! + best.s;
  });
  // The plan lies within the resolution of every point; where the lanes' least radius cannot be kept so, there is none.
  if (departure > resolution)
    throw contractUnmet(
      `No plan keeps the lanes' least radius within the resolution ${resolution} of the path: it lies ${departure} ` +
        `from point ${farthest}`,
    );
  return { elements, stations, length, departure };
}
