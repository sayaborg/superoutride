import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../../src/course/compiler/course-rules.js';
import type { CourseTimeBudgets } from '../../src/content/course-time-budgets.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createRouteCrossSections, type RouteRaceLine } from '../../src/race/route-cross-sections.js';

/** The race lines a run of this route and lap count crosses, in order through its completing FINISH. */
function expectedRaceLines(course: CompiledCourse, links: readonly CompiledCourse['links'][number][], laps: number) {
  const builder = createCourseRoute(course.entry);
  const lines = createRouteCrossSections(builder.route, course, laps);
  for (const link of links) builder.select(link);
  // A circuit repeats its single-successor cycle until the final lap's FINISH is on the Route.
  while (!lines.race.some((line) => line.finish))
    builder.select(builder.route.occurrences.at(-1)!.section.outgoing[0]!);
  const race: readonly RouteRaceLine[] = lines.race;
  return race.slice(0, race.findIndex((line) => line.finish) + 1);
}

/**
 * Untrusted saved numeric results are resolved to the current canonical landmarks once, before play; each budget is
 * the reference interval multiplied by the series' `timeMargin`. The runs are the vehicle `vehicleId`'s, whose Session
 * vehicle has the reference identity `vehicleSha256`.
 */
export function readCourseReference(
  course: CompiledCourse,
  vehicleId: string,
  vehicleSha256: string,
  input: unknown,
  timeMargin: number,
  referenceSha256: string,
): CourseTimeBudgets {
  if (!course.rules) throw new RangeError('Reference requires authored rules');
  const fail = (condition: unknown, message: string) => {
    if (!condition) throw new RangeError('Course reference: ' + message);
  };
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Course reference must contain records');
    return value as Record<string, unknown>;
  };
  const array = (value: unknown): unknown[] => {
    if (!Array.isArray(value)) throw new TypeError('Course reference must contain arrays');
    return value;
  };
  const finitePositive = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new RangeError('Reference time must be positive and finite');
    return value;
  };
  const source = record(structuredClone(input));
  fail(source.format === 'superoutride.course-reference' && source.version === 3, 'unsupported format/version');
  fail(source.courseBuildSha256 === course.identity.buildSha256, 'stale course identity');
  fail(source.procedureSha256 === referenceSha256, 'stale reference run identity');
  const candidates = array(source.vehicles)
    .map(record)
    .filter((r) => r.vehicleId === vehicleId);
  fail(candidates.length === 1, 'missing or duplicate vehicle');
  const candidate = candidates[0]!;
  fail(candidate.vehicleSha256 === vehicleSha256, 'stale vehicle/calibration/assist identity');
  const budgets = new Map<CompiledCourseLandmark, Map<number, number>>();
  let initial = 0;
  const routes = enumerateCourseRoutes(course.entry, course.type);
  const runs = array(candidate.runs).map(record);
  fail(runs.length === routes.length, 'incomplete route coverage');
  const seen = new Set<string>();
  for (const run of runs) {
    const ids = array(run.links);
    const key = JSON.stringify(ids);
    fail(!seen.has(key), 'duplicate route');
    seen.add(key);
    const route = routes.find((r) => r.length === ids.length && r.every((l, i) => l.id === ids[i]));
    fail(route !== undefined, 'unknown route');
    fail(run.lapCount === course.rules.maxLaps && record(run.metrics).recoveries === 0, 'incomplete or recovered run');
    const events = array(run.events).map(record);
    // The race's own lines for the planned route: the order and laps a run must record.
    const expected = expectedRaceLines(course, route!, course.rules.maxLaps);
    fail(events.length === expected.length, 'missing/extra checkpoint or lap');
    let previous = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i]!,
        point = expected[i]!;
      fail(event.landmarkId === point.landmark.id && event.lap === point.lap, 'invalid landmark order');
      const at = finitePositive(event.timeSeconds),
        duration = at - previous;
      fail(duration > 0 && event.intervalSeconds === duration, 'inconsistent interval time');
      if (i === 0) initial = Math.max(initial, duration);
      else {
        const prior = expected[i - 1]!,
          values = budgets.get(prior.landmark) ?? new Map<number, number>();
        values.set(prior.lap, Math.max(values.get(prior.lap) ?? 0, duration));
        budgets.set(prior.landmark, values);
      }
      previous = at;
    }
    fail(run.elapsedSeconds === previous, 'completion time mismatch');
  }
  const milliseconds = (seconds: number) => Math.ceil(1000 * timeMargin * seconds);
  return Object.freeze({
    initialMs: milliseconds(initial),
    after(gate: CompiledCourseLandmark, lap: number) {
      const seconds = budgets.get(gate)?.get(lap);
      if (seconds === undefined) throw new Error('No admitted upcoming reference interval');
      return milliseconds(seconds);
    },
  });
}
