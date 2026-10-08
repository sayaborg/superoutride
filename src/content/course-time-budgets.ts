import {
  admit,
  readArray,
  readDocument,
  readNumber,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../course/compiler/course-rules.js';

export interface CourseTimeBudgets {
  readonly initialMs: number;
  after(gate: CompiledCourseLandmark, lap: number): number;
}

/** Every admitted upcoming interval, including the final lap's checkpoints. */
export function courseBudgetLandmarks(course: CompiledCourse) {
  const result: { gate: CompiledCourseLandmark; laps: number }[] = [];
  for (const interval of course.gates.intervals) {
    for (const gate of interval.checkpoints) result.push({ gate, laps: course.rules.maxLaps });
    if (course.type === 'CIRCUIT' && course.rules.maxLaps > 1 && interval.finish)
      result.push({ gate: interval.finish, laps: course.rules.maxLaps - 1 });
  }
  return result;
}

/** A course's delivered reference times for one Session vehicle, in seconds before any series margin. */
export const COURSE_REFERENCE_TIMES_FORMAT = Object.freeze({
  format: 'superoutride.course-reference-times',
  version: 1,
} as const);
const SECONDS = { min: 0, exclusiveMin: true };

/** A time budget in integer milliseconds: the reference time multiplied by the series margin, rounded up once. */
export function timeBudgetMilliseconds(timeMargin: number, seconds: number): number {
  return Math.ceil(1000 * timeMargin * seconds);
}

/**
 * Admit a course's delivered reference times for the Session vehicle of `vehicleSha256` and derive the time budgets of
 * a series with `timeMargin` from them. Browser admission consumes only these small build-generated times, never
 * simulation traces.
 */
export function readCourseTimeBudgets(
  course: CompiledCourse,
  vehicleSha256: string,
  timeMargin: number,
  input: unknown,
  document = '',
): AdmissionResult<CourseTimeBudgets> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'vehicleSha256', 'initialSeconds', 'after'],
      COURSE_REFERENCE_TIMES_FORMAT.format,
      COURSE_REFERENCE_TIMES_FORMAT.version,
    );
    requireAdmission(
      readString(data.courseBuildSha256, '/courseBuildSha256', SHA256_TEXT) === course.identity.buildSha256,
      'invalid_value',
      '/courseBuildSha256',
      'Stale course identity',
    );
    requireAdmission(
      readString(data.vehicleSha256, '/vehicleSha256', SHA256_TEXT) === vehicleSha256,
      'invalid_value',
      '/vehicleSha256',
      'Stale vehicle/calibration/assist identity',
    );
    const budget = (seconds: number) => timeBudgetMilliseconds(timeMargin, seconds);
    const initialMs = budget(readNumber(data.initialSeconds, '/initialSeconds', SECONDS));
    const expected = courseBudgetLandmarks(course),
      values = new Map<CompiledCourseLandmark, readonly number[]>();
    readArray(
      data.after,
      '/after',
      (value, at) => {
        const [id, seconds] = readArray(value, at, (item) => item, { length: 2 });
        const point = expected.find((p) => p.gate.id === readString(id, `${at}/0`));
        requireAdmission(!!point, 'unresolved_reference', `${at}/0`, 'Unknown landmark');
        requireAdmission(!values.has(point.gate), 'duplicate_id', `${at}/0`, 'Duplicate landmark');
        values.set(
          point.gate,
          readArray(seconds, `${at}/1`, (item, path) => budget(readNumber(item, path, SECONDS)), {
            length: point.laps,
          }),
        );
      },
      { length: expected.length },
    );
    return Object.freeze({
      initialMs,
      after(gate: CompiledCourseLandmark, lap: number) {
        return values.get(gate)![lap - 1]!;
      },
    });
  });
}
