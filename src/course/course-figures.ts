import type { CompiledCourse } from './compiler/compiled-course.js';
import { courseBoundaryAt } from './course-boundaries.js';
import { courseRoadOf } from './course-lanes.js';
import { courseMapRoute } from './course-route.js';

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
  /** The heights the road gains, and those it loses, in all, in metres. */
  readonly ascentMeters: number;
  readonly descentMeters: number;
  /** How far the road turns in all, to either hand, in radians. */
  readonly turnRadians: number;
  /** The places where the roads part along the route: its `parting` gates. */
  readonly partings: number;
  /**
   * The road the route runs, the one holding its Sections' centre lanes: its least and most width in metres and lanes,
   * and the materials under its lanes' centres, each with its share of the readings, most first.
   */
  readonly road: {
    readonly widthMeters: { readonly least: number; readonly most: number };
    readonly lanes: { readonly least: number; readonly most: number };
    readonly surfaces: readonly { readonly material: string; readonly share: number }[];
  };
}

/**
 * The figures of a compiled course along its map's route ([course map](./course-map.ts)). A circuit's road closes, so a
 * corner or a straight across its line counts once. Gains and losses, the road's width and lanes and what lies under its
 * lanes' centres are read every `sampleMeters`; the turning is the plan's, its curvature over its length.
 */
export function createCourseFigures(course: CompiledCourse): CourseFigures {
  const occurrences = courseMapRoute(course);
  const length = occurrences.reduce((sum, o) => sum + o.section.coordinates.domain.end, 0);
  // The Section and its station at a station of the route; the height there, and the grade.
  const locate = (station: number) => {
    let s = Math.min(length, Math.max(0, station));
    for (const occurrence of occurrences) {
      const end = occurrence.section.coordinates.domain.end;
      if (s <= end || occurrence === occurrences.at(-1)) return { section: occurrence.section, s };
      s -= end;
    }
    throw new Error('A route has an occurrence');
  };
  const sample = { y: 0, dYdS: 0 };
  const at = (station: number) => {
    const { section, s } = locate(station);
    return section.height.sampleDifferential(s, sample);
  };
  const base = at(0).y;
  const profile = Array.from(
    { length: COURSE_FIGURES.profileIntervals + 1 },
    (_, i) => at((length * i) / COURSE_FIGURES.profileIntervals).y - base,
  );
  let [lowest, highest, steepest, ascent, descent] = [0, 0, 0, 0, 0];
  const widths = { least: Infinity, most: 0 },
    lanes = { least: Infinity, most: 0 },
    surfaces = new Map<string, number>();
  let readings = 0,
    before = base;
  const count = Math.max(1, Math.ceil(length / COURSE_FIGURES.sampleMeters));
  for (let k = 0; k <= count; k++) {
    const { section, s } = locate((length * k) / count);
    const { y, dYdS } = section.height.sampleDifferential(s, sample);
    [lowest, highest] = [Math.min(lowest, y - base), Math.max(highest, y - base)];
    steepest = Math.max(steepest, Math.abs(dYdS));
    [ascent, descent] = [ascent + Math.max(0, y - before), descent + Math.max(0, before - y)];
    before = y;
    // The road holding the centre lane, which is wider than 0 all along its Section, and what lies under its lanes.
    const road = courseRoadOf(section.lanes, section.lanes.center, s)!;
    [widths.least, widths.most] = [
      Math.min(widths.least, road.right - road.left),
      Math.max(widths.most, road.right - road.left),
    ];
    [lanes.least, lanes.most] = [Math.min(lanes.least, road.lanes.length), Math.max(lanes.most, road.lanes.length)];
    for (const lane of road.lanes) {
      const material = section.material.sample(s, courseBoundaryAt(lane.center, s));
      if (!material) throw new Error('A lane lies on supported material');
      surfaces.set(material.id, (surfaces.get(material.id) ?? 0) + 1);
      readings++;
    }
  }

  // The route as runs of one kind: a hand of bends (-1 left, 1 right) or a stretch without one (0).
  const runs: { hand: number; meters: number; turn: number }[] = [];
  let [tightest, turn] = [0, 0];
  for (const occurrence of occurrences)
    for (const segment of occurrence.section.segments) {
      const bend = Math.abs(segment.curvature) * COURSE_FIGURES.bendRadiusMeters >= 1,
        hand = bend ? Math.sign(segment.curvature) : 0,
        meters = segment.sEnd - segment.sStart;
      turn += Math.abs(segment.curvature) * meters;
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
    ascentMeters: ascent,
    descentMeters: descent,
    turnRadians: turn,
    partings: occurrences.reduce(
      (sum, occurrence) =>
        sum + course.gates.intervals.find((interval) => interval.section === occurrence.section)!.partings.length,
      0,
    ),
    road: Object.freeze({
      widthMeters: Object.freeze(widths),
      lanes: Object.freeze(lanes),
      surfaces: Object.freeze(
        [...surfaces]
          .sort(([a, n], [b, m]) => m - n || (a < b ? -1 : 1))
          .map(([material, n]) => Object.freeze({ material, share: n / readings })),
      ),
    }),
  });
}
