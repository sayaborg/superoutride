/**
 * A closed height path's profile ([Original road data](../../../docs/original-road-data.md#profile-from-a-point-path)):
 * its points' heights at their stations round a lap, as parabolas by one constant, the path's resolution, joined by
 * pairs of parabolas, so that the profile closes as the path does and lies within the resolution of every point.
 */
import { requireInput } from '../../authoring/authoring-error.js';
import { chebyshev } from './point-plan.js';
import { profileOf, type Bend, type Profile } from './road-profile.js';

/** A parabola of the station: `a + b t + c t²` with `t = s − o`, metres. */
interface Parabola {
  readonly o: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}
const heightOf = (p: Parabola, s: number) => p.a + (p.b + p.c * (s - p.o)) * (s - p.o);
const gradeOf = (p: Parabola, s: number) => p.b + 2 * p.c * (s - p.o);

/** A run: its points `from` to `to` and their minimax parabola. */
export interface HeightRun {
  readonly from: number;
  readonly to: number;
  readonly parabola: Parabola;
}

/** The minimax parabola of the points `[s, h]` (fewer than three points' through them), and its worst distance. */
function minimaxParabola(points: readonly (readonly [number, number])[]) {
  const o = points[0]![0],
    scale = points.at(-1)![0] - o || 1;
  const [a, b, c] = chebyshev(
    points.length,
    (i) => {
      const x = (points[i]![0] - o) / scale;
      return [1, x, x * x];
    },
    (i) => points[i]![1],
  ) as [number, number, number];
  const parabola = { o, a, b: b / scale, c: c / (scale * scale) };
  return { parabola, worst: Math.max(...points.map(([s, h]) => Math.abs(h - heightOf(parabola, s)))) };
}

/** A join between runs: from run `left`'s parabola at point `a` to run `right`'s at point `b` (past the last, round). */
interface Join {
  readonly a: number;
  readonly b: number;
  readonly left: number;
  readonly right: number;
}

/**
 * The profile of a closed path of points round a lap `length` metres long, point i `heights[i]` metres up at station
 * `stations[i]` (from 0, increasing), by its resolution, metres:
 * - its runs, from the first point round to it again: a run takes the next point while its minimax parabola holds every
 *   point of it within the resolution;
 * - each run its parabola between the joins either side of it;
 * - two runs joined from the first's parabola at a point to the next's at another by two parabolas meeting halfway,
 *   the heights and grades meeting at both ends and between them: over the step between the runs, and one more step on
 *   each side while the join holds every point it spans within the resolution, taking at most half of either run;
 * - the profile from the first point's station round the lap, its height there 0 (the points' heights less the
 *   first's profile height), its grade there the lap's, broken at `breaks`.
 * The profile, its runs, and how far a point lies from it at most.
 */
export function pointProfile(
  stations: readonly number[],
  heights: readonly number[],
  length: number,
  resolution: number,
  breaks: readonly number[] = [],
): { readonly profile: Profile; readonly runs: readonly HeightRun[]; readonly departure: number } {
  const n = stations.length;
  requireInput(n >= 3 && heights.length === n, '/profile', 'A closed height path has three points at least');
  // Point i round the lap: past the last, the first again a lap on.
  const point = (i: number): [number, number] => {
    const k = ((i % n) + n) % n;
    return [stations[k]! + Math.floor(i / n) * length, heights[k]!];
  };
  const runs: HeightRun[] = [];
  for (let from = 0; from < n;) {
    let to = from + 1;
    let fit = minimaxParabola([point(from), point(to)]);
    while (to < n) {
      const next = minimaxParabola(Array.from({ length: to + 2 - from }, (_, i) => point(from + i)));
      if (next.worst > resolution) break;
      [fit, to] = [next, to + 1];
    }
    runs.push({ from, to: Math.min(to, n - 1), parabola: fit.parabola });
    from = to + 1;
  }
  // Run r's parabola at station s, a lap on for the first run past the lap's end.
  const along = (r: number, s: number) => (r === 0 && s >= length ? s - length : s);
  const joins: Join[] = runs.map((run, k) => {
    const next = (k + 1) % runs.length;
    return { a: run.to, b: next === 0 ? n : runs[next]!.from, left: k, right: next };
  });
  /** The two parabolas of a join, from run `left`'s at point `a` to run `right`'s at point `b`, meeting halfway. */
  const joinOf = (j: Join): Piece[] => {
    const [sa, sb] = [point(j.a)[0], point(j.b)[0]];
    const [L, R] = [runs[j.left]!.parabola, runs[j.right]!.parabola];
    const [ha, ga] = [heightOf(L, along(j.left, sa)), gradeOf(L, along(j.left, sa))];
    const [hb, gb] = [heightOf(R, along(j.right, sb)), gradeOf(R, along(j.right, sb))];
    // Curvatures k1 then k2, each over half: gb = ga + (k1 + k2) half, hb = ha + 2 ga half + (3 k1 + k2) half² / 2.
    const half = (sb - sa) / 2;
    const sum = (gb - ga) / half;
    const k1 = (hb - ha - 2 * ga * half) / (half * half) - sum / 2;
    const m = sa + half;
    return [
      { from: sa, to: m, parabola: { o: sa, a: ha, b: ga, c: k1 / 2 } },
      {
        from: m,
        to: sb,
        parabola: { o: m, a: ha + ga * half + (k1 * half * half) / 2, b: ga + k1 * half, c: (sum - k1) / 2 },
      },
    ];
  };
  const holds = (j: Join) => {
    const [first, second] = joinOf(j);
    for (let i = j.a + 1; i < j.b; i++) {
      const [s, h] = point(i);
      if (Math.abs(h - heightOf((s <= first!.to ? first : second)!.parabola, s)) > resolution) return false;
    }
    return true;
  };
  const steps = (r: number) => runs[r]!.to - runs[r]!.from;
  const wide = joins.map((j) => {
    let w = j;
    for (;;) {
      const next = { ...w, a: w.a - 1, b: w.b + 1 };
      if (2 * (j.a - next.a) > steps(j.left) || 2 * (next.b - j.b) > steps(j.right) || !holds(next)) return w;
      w = next;
    }
  });
  // Round the lap from the first join's start: each join's parabolas, then its right run's to the next join.
  const pieces: Piece[] = [];
  wide.forEach((j, i) => {
    pieces.push(...joinOf(j));
    const next = wide[(i + 1) % wide.length]!;
    const to = point(next.a)[0] + (i + 1 === wide.length ? length : 0);
    const run = runs[j.right]!.parabola;
    // The first run past the lap's end, a lap on.
    const shift = j.right === 0 && point(j.b)[0] >= length ? length : 0;
    pieces.push({ from: point(j.b)[0], to, parabola: { ...run, o: run.o + shift } });
  });
  // The pieces over [0, length]: those past the lap's end a lap back, cut at its ends.
  const bends: Bend[] = [];
  for (const piece of pieces)
    for (const shift of [0, -length]) {
      const [from, to] = [Math.max(0, piece.from + shift), Math.min(length, piece.to + shift)];
      if (to - from > 1e-12 && piece.parabola.c !== 0) bends.push({ from, to, curvature: 2 * piece.parabola.c });
    }
  // The height and grade at the lap's start, on the piece holding it (a lap on for one round the lap's end).
  const start = pieces.find((p) => p.from <= 0 && 0 < p.to) ?? pieces.find((p) => p.from <= length && length < p.to)!;
  const s0 = start.from <= 0 && 0 < start.to ? 0 : length;
  const [h0, g0] = [heightOf(start.parabola, s0), gradeOf(start.parabola, s0)];
  const profile = profileOf(bends, breaks, g0 === 0 ? [] : [{ at: 0, change: g0 }]);
  const departure = Math.max(
    ...Array.from({ length: n }, (_, i) => Math.abs(heights[i]! - h0 - profile.height(stations[i]!))),
  );
  return { profile, runs, departure };
}

/** A piece of the profile: a parabola over stations `[from, to]`. */
interface Piece {
  readonly from: number;
  readonly to: number;
  readonly parabola: Parabola;
}
