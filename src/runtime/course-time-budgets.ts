import { contentDigest } from '../core/content-digest.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../course/compiler/course-rules.js';
import type { SessionVehicle } from '../gameplay/session-configuration.js';
import type { CourseTimeBudgets } from './course-session.js';

/** Every admitted upcoming interval, including the final lap's checkpoints. */
export function courseBudgetLandmarks(course: CompiledCourse) {
  if (!course.rules) throw new RangeError('Time budgets require authored rules');
  const result: { gate: CompiledCourseLandmark; laps: number }[] = [];
  for (const interval of course.rules.intervals) {
    for (const gate of interval.checkpoints) result.push({ gate, laps: course.rules.maxLaps });
    if (course.type === 'CIRCUIT' && course.rules.maxLaps > 1 && interval.finish)
      result.push({ gate: interval.finish, laps: course.rules.maxLaps - 1 });
  }
  return result;
}

/** Browser admission consumes only small build-generated budgets, never simulation traces. */
export async function readCourseTimeBudgets(
  course: CompiledCourse,
  vehicle: SessionVehicle,
  input: unknown,
): Promise<CourseTimeBudgets> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Course time budgets must be a record');
  const source = structuredClone(input) as {
    format: string;
    version: number;
    courseBuildSha256: string;
    vehicleSha256: string;
    initialMs: number;
    after: [string, number[]][];
  };
  const fail = (condition: unknown, message: string) => {
    if (!condition) throw new RangeError('Course time budgets: ' + message);
  };
  const positive = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  fail(
    source && source.format === 'superoutride.course-time-budgets' && source.version === 1,
    'unsupported format/version',
  );
  fail(source.courseBuildSha256 === course.identity.buildSha256, 'stale course identity');
  const vehicleSha256 = await contentDigest(new TextEncoder().encode(JSON.stringify(vehicle)));
  fail(source.vehicleSha256 === vehicleSha256, 'stale vehicle/calibration/assist identity');
  if (!Array.isArray(source.after)) throw new TypeError('Course time budget intervals must be an array');
  fail(positive(source.initialMs), 'invalid initial budget');
  const expected = courseBudgetLandmarks(course),
    values = new Map<CompiledCourseLandmark, readonly number[]>();
  fail(source.after.length === expected.length, 'incomplete interval coverage');
  for (const row of source.after) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || !Array.isArray(row[1]))
      throw new TypeError('Course time budget interval must contain a landmark and lap budgets');
    const [id, milliseconds] = row,
      point = expected.find((p) => p.gate.id === id);
    fail(point && !values.has(point.gate), 'unknown or duplicate landmark');
    fail(milliseconds.length === point!.laps, 'invalid lap coverage');
    for (const ms of milliseconds) fail(positive(ms), 'invalid lap budget');
    values.set(point!.gate, Object.freeze(milliseconds));
  }
  const initialMs = source.initialMs;
  return Object.freeze({
    initialMs,
    after(gate: CompiledCourseLandmark, lap: number) {
      const value = Number.isSafeInteger(lap) ? values.get(gate)?.[lap - 1] : undefined;
      if (value === undefined) throw new Error('No admitted upcoming reference interval');
      return value;
    },
  });
}
