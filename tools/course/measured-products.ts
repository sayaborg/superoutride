import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { courseBudgetLandmarks } from '../../src/content/course-time-budgets.js';
import { PACE_SCHEDULE_FORMAT, PACE_SCHEDULE_SPACING } from '../../src/content/pace-schedule.js';
import { RIVAL_ENVELOPE_FORMAT, readRivalEnvelope, type RivalEnvelope } from '../../src/content/rival-envelope.js';
import { readPaceSchedule } from '../../src/content/pace-schedule.js';
import {
  AdmissionError,
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
import { readCourseReference, type CourseReferenceTimes } from './course-reference.js';
import type { runCourseReference } from './reference-run.js';

/**
 * The measured products saved under `content/`: each catalog vehicle's envelope and each series course's reference
 * times and pace schedules, which the measurement tool writes and builds admit.
 */
export const MEASURED_ENVELOPE_FORMAT = Object.freeze({
  format: 'superoutride.measured-envelope',
  version: 1,
} as const);
export const REFERENCE_TIMES_FORMAT = Object.freeze({ format: 'superoutride.reference-times', version: 1 } as const);

/** The saved envelope of a catalog vehicle, under `content/`. */
export const measuredEnvelopePath = (vehicleId: string) => `envelopes/${vehicleId}.json`;
/** The saved reference times of a series course, under `content/`. */
export const referenceTimesPath = (courseId: string) => `reference-times/${courseId}.json`;

type ReferenceRun = ReturnType<typeof runCourseReference>;

/** A pace schedule's times: from GO along the entry Section, and from each Section's start, in milliseconds. */
export interface SavedPaceSchedule {
  readonly start: { readonly section: string; readonly first: number; readonly milliseconds: readonly number[] };
  readonly sections: readonly (readonly [string, readonly number[]])[];
}

/** One candidate vehicle's reference times on a course, before the series margin, and its pace schedule. */
export interface SavedReferenceVehicle {
  readonly vehicleId: string;
  readonly vehicleSha256: string;
  readonly initialSeconds: number;
  readonly after: readonly (readonly [string, readonly number[]])[];
  readonly schedule: SavedPaceSchedule;
}

export interface SavedReferenceTimes {
  readonly format: typeof REFERENCE_TIMES_FORMAT.format;
  readonly version: typeof REFERENCE_TIMES_FORMAT.version;
  readonly courseBuildSha256: string;
  readonly procedureSha256: string;
  readonly vehicles: readonly SavedReferenceVehicle[];
}

export interface SavedEnvelope {
  readonly format: typeof MEASURED_ENVELOPE_FORMAT.format;
  readonly version: typeof MEASURED_ENVELOPE_FORMAT.version;
  readonly vehicleSha256: string;
  readonly procedureSha256: string;
  readonly envelope: RivalEnvelope;
}

/** The saved envelope of a measurement: its vehicle and procedure identities and the rows driving reads. */
export function savedEnvelope(vehicleSha256: string, procedureSha256: string, envelope: RivalEnvelope): SavedEnvelope {
  return {
    ...MEASURED_ENVELOPE_FORMAT,
    vehicleSha256,
    procedureSha256,
    envelope: { maximumSpeed: envelope.maximumSpeed, rows: envelope.rows },
  };
}

/**
 * One vehicle's saved reference times from its reference runs, one per route: they are admitted as a reference
 * report and reduced to the longest intervals, and the runs' passes give the pace schedule.
 */
export function savedReferenceVehicle(
  course: CompiledCourse,
  vehicleId: string,
  vehicleSha256: string,
  procedureSha256: string,
  runs: readonly ReferenceRun[],
): SavedReferenceVehicle {
  const report = {
    format: 'superoutride.course-reference',
    version: 3,
    courseBuildSha256: course.identity.buildSha256,
    procedureSha256,
    vehicles: [{ vehicleId, vehicleSha256, runs }],
  };
  const admitted = readCourseReference(course, vehicleId, vehicleSha256, procedureSha256, report);
  if (!admitted.ok)
    throw new Error(`Reference runs of ${vehicleId} on ${course.id}: ${admitted.diagnostics[0]!.message}`);
  const times = admitted.value;
  return {
    vehicleId,
    vehicleSha256,
    initialSeconds: times.initialSeconds,
    after: courseBudgetLandmarks(course).map(({ gate, laps }) => [
      gate.id,
      Array.from({ length: laps }, (_, index) => times.after(gate, index + 1)),
    ]),
    schedule: paceSchedule(course.entry.id, runs),
  };
}

/**
 * A pace schedule from reference runs: the start times from GO along the entry Section, and for each Section run from
 * its start the fastest times from that start, in integer milliseconds.
 */
function paceSchedule(entryId: string, runs: readonly ReferenceRun[]): SavedPaceSchedule {
  const fastest = (into: number[], values: readonly number[]) =>
    values.forEach((value, index) => (into[index] = Math.min(into[index] ?? Infinity, value)));
  const start: number[] = [];
  const sections = new Map<string, number[]>();
  for (const run of runs) {
    const [first, ...rest] = run.passes;
    if (first!.section !== entryId) throw new Error('A reference run starts outside the entry Section');
    fastest(
      start,
      first!.seconds.map((seconds) => Math.round(1000 * seconds)),
    );
    for (const pass of rest) {
      if (pass.first !== 0) throw new Error(`A reference run enters ${pass.section} past its start`);
      const values = sections.get(pass.section) ?? [];
      fastest(
        values,
        pass.seconds.map((seconds) => Math.round(1000 * (seconds - pass.seconds[0]!))),
      );
      sections.set(pass.section, values);
    }
  }
  return {
    start: { section: entryId, first: runs[0]!.passes[0]!.first, milliseconds: start },
    sections: [...sections].filter(([, values]) => values.length >= 2),
  };
}

/** The delivered rival envelope of a saved envelope. */
export function deliveredEnvelope(saved: SavedEnvelope) {
  return { ...RIVAL_ENVELOPE_FORMAT, vehicleSha256: saved.vehicleSha256, envelope: saved.envelope };
}

/** A saved vehicle's reference times as the budget reader reads them. */
export function referenceTimes(saved: SavedReferenceVehicle): CourseReferenceTimes {
  const after = new Map(saved.after);
  return Object.freeze({
    initialSeconds: saved.initialSeconds,
    after: (gate: { readonly id: string }, lap: number) => after.get(gate.id)![lap - 1]!,
  });
}

/** The delivered pace schedule of a course and Session vehicle from its saved times. */
export function deliveredSchedule(courseBuildSha256: string, vehicleSha256: string, schedule: SavedPaceSchedule) {
  return { ...PACE_SCHEDULE_FORMAT, courseBuildSha256, vehicleSha256, spacing: PACE_SCHEDULE_SPACING, ...schedule };
}

/** The diagnostic code of a saved measured product that is stale, absent or not owned. */
export const MEASUREMENT_STALE = 'measurement_stale';
/** The command that measures stale products again. */
export const MEASURE_COMMAND = 'npm run measure -- generate';

/** A stale, absent or unowned measured product: the reason and the command that measures again. */
export function staleMeasurement(path: string, reason: string): never {
  throw new AdmissionError(MEASUREMENT_STALE, path, `${reason}; run \`${MEASURE_COMMAND}\``);
}

/** A reader's first diagnostic thrown again with its pointer under `base`. */
function readUnder<T>(base: string, result: AdmissionResult<T>): T {
  if (result.ok) return result.value;
  const [diagnostic] = result.diagnostics;
  throw new AdmissionError(diagnostic!.code, `${base}${diagnostic!.path}`, diagnostic!.message);
}

/**
 * Admit a saved envelope for the Session vehicle of `vehicleSha256` measured by the procedure `procedureSha256`: its
 * identities current and its rows those the delivered envelope admits.
 */
export function readSavedEnvelope(
  vehicleSha256: string,
  procedureSha256: string,
  input: unknown,
  document = '',
): AdmissionResult<SavedEnvelope> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'vehicleSha256', 'procedureSha256', 'envelope'],
      MEASURED_ENVELOPE_FORMAT.format,
      MEASURED_ENVELOPE_FORMAT.version,
    );
    if (readString(data.vehicleSha256, '/vehicleSha256', SHA256_TEXT) !== vehicleSha256)
      staleMeasurement('/vehicleSha256', "The vehicle's mechanics, driving or materials changed since it was measured");
    if (readString(data.procedureSha256, '/procedureSha256', SHA256_TEXT) !== procedureSha256)
      staleMeasurement('/procedureSha256', 'The envelope measurement changed since it was measured');
    const saved = input as SavedEnvelope;
    readUnder('', readRivalEnvelope(vehicleSha256, deliveredEnvelope(saved)));
    return saved;
  });
}

/**
 * Admit a course's saved reference times against the compiled course, the reference run's identity and the series'
 * candidate vehicles with their Session vehicle identities, in the series' order: every entry current, every budget
 * landmark's times positive with one per lap, and each pace schedule what the delivered schedule admits.
 */
export function readSavedReferenceTimes(
  course: CompiledCourse,
  candidates: readonly { readonly vehicleId: string; readonly vehicleSha256: string }[],
  procedureSha256: string,
  input: unknown,
  document = '',
): AdmissionResult<SavedReferenceTimes> {
  const landmarks = courseBudgetLandmarks(course),
    seconds = { min: 0, exclusiveMin: true };
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'procedureSha256', 'vehicles'],
      REFERENCE_TIMES_FORMAT.format,
      REFERENCE_TIMES_FORMAT.version,
    );
    if (readString(data.courseBuildSha256, '/courseBuildSha256', SHA256_TEXT) !== course.identity.buildSha256)
      staleMeasurement('/courseBuildSha256', 'The course changed since its reference times were measured');
    if (readString(data.procedureSha256, '/procedureSha256', SHA256_TEXT) !== procedureSha256)
      staleMeasurement('/procedureSha256', 'The reference run changed since the reference times were measured');
    const entries = readArray(data.vehicles, '/vehicles', (item, at) => {
      const entry = readRecord(item, at, ['vehicleId', 'vehicleSha256', 'initialSeconds', 'after', 'schedule']);
      return { at, entry, vehicleId: readString(entry.vehicleId, `${at}/vehicleId`) };
    });
    if (
      entries.length !== candidates.length ||
      entries.some(({ vehicleId }, index) => vehicleId !== candidates[index]!.vehicleId)
    )
      staleMeasurement(
        '/vehicles',
        `Expected the series' candidate vehicles ${candidates.map((c) => c.vehicleId).join(', ')}`,
      );
    entries.forEach(({ at, entry }, index) => {
      const { vehicleSha256 } = candidates[index]!;
      if (readString(entry.vehicleSha256, `${at}/vehicleSha256`, SHA256_TEXT) !== vehicleSha256)
        staleMeasurement(
          `${at}/vehicleSha256`,
          "The vehicle's mechanics, driving or materials changed since it was measured",
        );
      readNumber(entry.initialSeconds, `${at}/initialSeconds`, seconds);
      const after = readArray(
        entry.after,
        `${at}/after`,
        (pair, pairAt) => ({ pairAt, pair: readArray(pair, pairAt, (value) => value, { length: 2 }) }),
        { length: landmarks.length },
      );
      after.forEach(({ pairAt, pair }, landmark) => {
        const { gate, laps } = landmarks[landmark]!;
        requireAdmission(
          readString(pair[0], `${pairAt}/0`) === gate.id,
          'invalid_value',
          `${pairAt}/0`,
          `Expected ${gate.id}`,
        );
        readArray(pair[1], `${pairAt}/1`, (value, path) => readNumber(value, path, seconds), { length: laps });
      });
      const schedule = readRecord(entry.schedule, `${at}/schedule`, ['start', 'sections']);
      readUnder(
        `${at}/schedule`,
        readPaceSchedule(
          course,
          vehicleSha256,
          deliveredSchedule(course.identity.buildSha256, vehicleSha256, schedule as unknown as SavedPaceSchedule),
        ),
      );
    });
    return input as SavedReferenceTimes;
  });
}
