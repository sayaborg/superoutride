import type { CompiledCourse } from './compiler/compiled-course.js';
import { firstExitRoute } from './course-route.js';

/**
 * How a course's figures are measured: heights at `profileIntervals` + 1 even stations of the route; heights and grades
 * read every `sampleMeters`; a bend is road turning on a radius of at most `bendRadiusMeters`, and a corner is bends of
 * one hand in a row that turn the road at least `cornerTurn` radians.
 */
export const COURSE_FIGURES = Object.freeze({
  profileIntervals: 128,
  sampleMeters: 4,
  bendRadiusMeters: 1000,
  cornerTurn: Math.PI / 12,
});

/** What a course's road measures along its map's route: one lap of a circuit, else from its entry to its end. */
export interface CourseFigures {
  /** The road's height at even stations from the route's start to its end, in metres above its start. */
  readonly profile: readonly number[];
  /** The road's highest point above its lowest, in metres. */
  readonly climbMeters: number;
  /** The steepest grade, up or down, as rise over run. */
  readonly steepestGrade: number;
  /** The corners to the left and to the right. */
  readonly corners: { readonly left: number; readonly right: number };
  /** The longest stretch without a bend, in metres. */
  readonly longestStraightMeters: number;
  /** The tightest bend's radius in metres; null on a road without a bend. */
  readonly tightestRadiusMeters: number | null;
}

/**
 * The figures of a compiled course along its map's route ([course map](./course-map.ts)). A circuit's road closes, so a
 * corner or a straight across its line counts once.
 */
export function createCourseFigures(course: CompiledCourse): CourseFigures {
  const occurrences = firstExitRoute(course);
  const length = occurrences.reduce((sum, o) => sum + o.section.coordinates.domain.end, 0);
  // The height at a station of the route, and the grade there.
  const sample = { y: 0, dYdS: 0 };
  const at = (station: number) => {
    let s = Math.min(length, Math.max(0, station));
    for (const occurrence of occurrences) {
      const end = occurrence.section.coordinates.domain.end;
      if (s <= end || occurrence === occurrences.at(-1)) return occurrence.section.height.sampleDifferential(s, sample);
      s -= end;
    }
    throw new Error('A route has an occurrence');
  };
  const base = at(0).y;
  const profile = Array.from(
    { length: COURSE_FIGURES.profileIntervals + 1 },
    (_, i) => at((length * i) / COURSE_FIGURES.profileIntervals).y - base,
  );
  let [lowest, highest, steepest] = [0, 0, 0];
  const count = Math.max(1, Math.ceil(length / COURSE_FIGURES.sampleMeters));
  for (let k = 0; k <= count; k++) {
    const { y, dYdS } = at((length * k) / count);
    [lowest, highest] = [Math.min(lowest, y - base), Math.max(highest, y - base)];
    steepest = Math.max(steepest, Math.abs(dYdS));
  }

  // The route as runs of one kind: a hand of bends (-1 left, 1 right) or a stretch without one (0).
  const runs: { hand: number; meters: number; turn: number }[] = [];
  let tightest = 0;
  for (const occurrence of occurrences)
    for (const segment of occurrence.section.segments) {
      const bend = Math.abs(segment.curvature) * COURSE_FIGURES.bendRadiusMeters >= 1,
        hand = bend ? Math.sign(segment.curvature) : 0,
        meters = segment.sEnd - segment.sStart;
      if (bend) tightest = Math.max(tightest, Math.abs(segment.curvature));
      const last = runs.at(-1);
      if (last?.hand === hand)
        [last.meters, last.turn] = [last.meters + meters, last.turn + segment.curvature * meters];
      else runs.push({ hand, meters, turn: segment.curvature * meters });
    }
  if (course.type === 'CIRCUIT' && runs.length > 1 && runs[0]!.hand === runs.at(-1)!.hand) {
    const last = runs.pop()!;
    [runs[0]!.meters, runs[0]!.turn] = [runs[0]!.meters + last.meters, runs[0]!.turn + last.turn];
  }
  const corners = (hand: number) =>
    runs.filter((run) => run.hand === hand && Math.abs(run.turn) >= COURSE_FIGURES.cornerTurn).length;
  return Object.freeze({
    profile: Object.freeze(profile),
    climbMeters: highest - lowest,
    steepestGrade: steepest,
    corners: Object.freeze({ left: corners(-1), right: corners(1) }),
    longestStraightMeters: runs.reduce((longest, run) => (run.hand === 0 ? Math.max(longest, run.meters) : longest), 0),
    tightestRadiusMeters: tightest > 0 ? 1 / tightest : null,
  });
}
