import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../../src/course/compiler/course-rules.js';
import { COURSE_REFERENCE_TIMES_FORMAT, courseBudgetLandmarks } from '../../src/content/course-time-budgets.js';
import {
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../../src/core/admission.js';
import { SHA256_TEXT } from '../../src/core/content-digest.js';
import { createCourseRoute } from '../../src/course/course-route.js';
import { createRouteCrossSections, type RouteRaceLine } from '../../src/race/route-cross-sections.js';

/** The race lines a run of the course's route and `laps` crosses, in order through its completing FINISH. */
function expectedRaceLines(course: CompiledCourse, laps: number) {
  const builder = createCourseRoute(course.entry);
  const lines = createRouteCrossSections(builder.route, course, laps);
  // A circuit repeats its cycle until the final lap's FINISH is on the Route.
  while (!lines.race.some((line) => line.finish) && builder.extend());
  const race: readonly RouteRaceLine[] = lines.race;
  return race.slice(0, race.findIndex((line) => line.finish) + 1);
}

/**
 * A vehicle's reference times on a course, in seconds and before any margin: the longest interval from START to the
 * first gate, and for each budget landmark and lap the longest interval to the next gate, over every route.
 */
export interface CourseReferenceTimes {
  readonly initialSeconds: number;
  after(gate: CompiledCourseLandmark, lap: number): number;
}

const SECONDS = { min: 0, exclusiveMin: true };

/**
 * Admit a saved reference report (`superoutride.course-reference` version 6) for the vehicle `vehicleId`, whose
 * Run vehicle has the identity `vehicleSha256`, against the compiled course and the reference run's identity
 * `referenceSha256`, and resolve its run to the course's canonical landmarks: one run of the course's route through
 * the maximum laps, recording exactly the race lines it crosses.
 */
export function readCourseReference(
  course: CompiledCourse,
  vehicleId: string,
  vehicleSha256: string,
  referenceSha256: string,
  input: unknown,
  document = '',
): AdmissionResult<CourseReferenceTimes> {
  if (!course.rules) throw new RangeError('Reference requires authored rules');
  const { maxLaps } = course.rules;
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'procedureSha256', 'vehicles'],
      'superoutride.course-reference',
      6,
    );
    requireAdmission(
      readString(data.courseBuildSha256, '/courseBuildSha256', SHA256_TEXT) === course.identity.buildSha256,
      'invalid_value',
      '/courseBuildSha256',
      'Stale course identity',
    );
    requireAdmission(
      readString(data.procedureSha256, '/procedureSha256', SHA256_TEXT) === referenceSha256,
      'invalid_value',
      '/procedureSha256',
      'Stale reference run identity',
    );
    const vehicles = readArray(data.vehicles, '/vehicles', (item, at) => ({
      at,
      record: readRecord(item, at, ['vehicleId', 'vehicleSha256', 'run']),
    }));
    const candidates = vehicles.filter(({ record }) => record.vehicleId === vehicleId);
    requireAdmission(candidates.length === 1, 'invalid_value', '/vehicles', `Expected one entry for ${vehicleId}`);
    const { at, record: candidate } = candidates[0]!;
    requireAdmission(
      readString(candidate.vehicleSha256, `${at}/vehicleSha256`, SHA256_TEXT) === vehicleSha256,
      'invalid_value',
      `${at}/vehicleSha256`,
      'Stale vehicle/calibration/assist identity',
    );
    const after = new Map<CompiledCourseLandmark, Map<number, number>>();
    let initialSeconds = 0;
    const runAt = `${at}/run`;
    const run = readRecord(candidate.run, runAt, ['lapCount', 'elapsedSeconds', 'events', 'metrics']);
    requireAdmission(
      readNumber(run.lapCount, `${runAt}/lapCount`, { integer: true }) === maxLaps,
      'invalid_value',
      `${runAt}/lapCount`,
      'Expected a run through the maximum laps',
    );
    const metrics = readRecord(run.metrics, `${runAt}/metrics`, [
      'maximumSpeed',
      'maximumUtilization',
      'distance',
      'recoveries',
    ]);
    readNumber(metrics.recoveries, `${runAt}/metrics/recoveries`, { min: 0, integer: true });
    // The race's own lines for the planned route: the order and laps a run must record.
    const expected = expectedRaceLines(course, maxLaps);
    const events = readArray(
      run.events,
      `${runAt}/events`,
      (value, eventAt) => ({
        eventAt,
        event: readRecord(value, eventAt, ['landmarkId', 'lap', 'timeSeconds', 'intervalSeconds']),
      }),
      { length: expected.length },
    );
    let previous = 0;
    events.forEach(({ eventAt, event }, index) => {
      const point = expected[index]!;
      requireAdmission(
        readString(event.landmarkId, `${eventAt}/landmarkId`) === point.landmark.id &&
          readNumber(event.lap, `${eventAt}/lap`, { integer: true }) === point.lap,
        'invalid_value',
        eventAt,
        `Expected ${point.landmark.id} on lap ${point.lap}`,
      );
      const time = readNumber(event.timeSeconds, `${eventAt}/timeSeconds`, SECONDS),
        duration = time - previous;
      requireAdmission(
        duration > 0 && readNumber(event.intervalSeconds, `${eventAt}/intervalSeconds`) === duration,
        'invalid_value',
        `${eventAt}/intervalSeconds`,
        'Inconsistent interval time',
      );
      if (index === 0) initialSeconds = Math.max(initialSeconds, duration);
      else {
        const prior = expected[index - 1]!,
          values = after.get(prior.landmark) ?? new Map<number, number>();
        values.set(prior.lap, Math.max(values.get(prior.lap) ?? 0, duration));
        after.set(prior.landmark, values);
      }
      previous = time;
    });
    requireAdmission(
      readNumber(run.elapsedSeconds, `${runAt}/elapsedSeconds`) === previous,
      'invalid_value',
      `${runAt}/elapsedSeconds`,
      'Completion time mismatch',
    );
    return Object.freeze({
      initialSeconds,
      after(gate: CompiledCourseLandmark, lap: number) {
        const seconds = after.get(gate)?.get(lap);
        if (seconds === undefined) throw new Error('No admitted upcoming reference interval');
        return seconds;
      },
    });
  });
}

/**
 * The delivered reference times of a course and vehicle, in seconds before any margin: a run derives its time
 * budgets from them with its class's `timeMargin` (`readCourseTimeBudgets`).
 */
export function courseReferenceTimesProduct(
  course: CompiledCourse,
  vehicleSha256: string,
  times: CourseReferenceTimes,
) {
  return {
    ...COURSE_REFERENCE_TIMES_FORMAT,
    courseBuildSha256: course.identity.buildSha256,
    vehicleSha256,
    initialSeconds: times.initialSeconds,
    after: courseBudgetLandmarks(course).map(({ gate, laps }) => [
      gate.id,
      Array.from({ length: laps }, (_, index) => times.after(gate, index + 1)),
    ]),
  };
}
