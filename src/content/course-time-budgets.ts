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

export const COURSE_TIME_BUDGETS_FORMAT = Object.freeze({
  format: 'superoutride.course-time-budgets',
  version: 1,
} as const);
const MILLISECONDS = { min: 1, max: Number.MAX_SAFE_INTEGER, integer: true };

/** Browser admission consumes only small build-generated budgets, never simulation traces. */
export function readCourseTimeBudgets(
  course: CompiledCourse,
  vehicleSha256: string,
  input: unknown,
  document = '',
): AdmissionResult<CourseTimeBudgets> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'vehicleSha256', 'initialMs', 'after'],
      COURSE_TIME_BUDGETS_FORMAT.format,
      COURSE_TIME_BUDGETS_FORMAT.version,
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
    const initialMs = readNumber(data.initialMs, '/initialMs', MILLISECONDS);
    const expected = courseBudgetLandmarks(course),
      values = new Map<CompiledCourseLandmark, readonly number[]>();
    readArray(
      data.after,
      '/after',
      (value, at) => {
        const [id, milliseconds] = readArray(value, at, (item) => item, { length: 2 });
        const point = expected.find((p) => p.gate.id === readString(id, `${at}/0`));
        requireAdmission(!!point, 'unresolved_reference', `${at}/0`, 'Unknown landmark');
        requireAdmission(!values.has(point.gate), 'duplicate_id', `${at}/0`, 'Duplicate landmark');
        values.set(
          point.gate,
          readArray(milliseconds, `${at}/1`, (ms, path) => readNumber(ms, path, MILLISECONDS), { length: point.laps }),
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
