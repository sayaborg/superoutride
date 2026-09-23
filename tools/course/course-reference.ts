import { contentDigest } from '../../src/core/content-digest.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../../src/course/compiler/course-rules.js';
import type { SessionVehicle } from '../../src/race/session-configuration.js';
import { REFERENCE_DRIVER } from './reference-driving-policy.js';
import type { CourseTimeBudgets } from '../../src/race/course-session.js';

/** Untrusted saved numeric results are resolved to the current canonical landmarks once, before play. */
export async function readCourseReference(
  course: CompiledCourse,
  vehicle: SessionVehicle,
  input: unknown,
): Promise<CourseTimeBudgets> {
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
  fail(source.format === 'superoutride.course-reference' && source.version === 1, 'unsupported format/version');
  fail(source.courseBuildSha256 === course.identity.buildSha256, 'stale course identity');
  const driver = record(source.driver);
  fail(
    Object.keys(driver).length === Object.keys(REFERENCE_DRIVER).length &&
      Object.entries(REFERENCE_DRIVER).every(([key, value]) => driver[key] === value),
    'stale driver identity',
  );
  const candidates = array(source.vehicles)
    .map(record)
    .filter((r) => r.vehicleId === vehicle.profile.id);
  fail(candidates.length === 1, 'missing or duplicate vehicle');
  const candidate = candidates[0]!;
  const vehicleSha256 = await contentDigest(new TextEncoder().encode(JSON.stringify(vehicle)));
  fail(candidate.vehicleSha256 === vehicleSha256, 'stale vehicle/calibration/assist identity');
  const budgets = new Map<CompiledCourseLandmark, Map<number, number>>();
  let initial = 0;
  const routes: (readonly CompiledCourse['links'][number][])[] = [];
  const enumerate = (section: CompiledCourse['entry'], history: readonly CompiledCourse['links'][number][]) => {
    if (routes.length >= 256) throw new RangeError('Reference has too many routes');
    if (!section.outgoing.length) {
      routes.push(history);
      return;
    }
    for (const link of section.outgoing) enumerate(link.to.section, [...history, link]);
  };
  if (course.type === 'CIRCUIT') routes.push([]);
  else enumerate(course.entry, []);
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
    const itinerary = [course.entry, ...route!.map((l) => l.to.section)];
    const expected: { gate: CompiledCourseLandmark; lap: number }[] = [];
    for (let lap = 1; lap <= course.rules.maxLaps; lap++)
      for (const section of itinerary) {
        const interval = course.rules.intervals.find((i) => i.section === section)!;
        for (const gate of [...interval.checkpoints, ...(interval.finish ? [interval.finish] : [])])
          expected.push({ gate, lap });
      }
    fail(events.length === expected.length, 'missing/extra checkpoint or lap');
    let previous = 0;
    for (let i = 0; i < events.length; i++) {
      const event = events[i]!,
        point = expected[i]!;
      fail(event.landmarkId === point.gate.id && event.lap === point.lap, 'invalid landmark order');
      const at = finitePositive(event.timeSeconds),
        duration = at - previous;
      fail(duration > 0 && event.intervalSeconds === duration, 'inconsistent interval time');
      if (i === 0) initial = Math.max(initial, duration);
      else {
        const prior = expected[i - 1]!,
          values = budgets.get(prior.gate) ?? new Map<number, number>();
        values.set(prior.lap, Math.max(values.get(prior.lap) ?? 0, duration));
        budgets.set(prior.gate, values);
      }
      previous = at;
    }
    fail(run.elapsedSeconds === previous, 'completion time mismatch');
  }
  const margin = course.rules.classic.timeMargin;
  const milliseconds = (seconds: number) => Math.ceil(1000 * margin * seconds);
  return Object.freeze({
    initialMs: milliseconds(initial),
    after(gate: CompiledCourseLandmark, lap: number) {
      const seconds = budgets.get(gate)?.get(lap);
      if (seconds === undefined) throw new Error('No admitted upcoming reference interval');
      return milliseconds(seconds);
    },
  });
}
