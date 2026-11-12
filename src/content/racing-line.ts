import {
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
} from '../core/admission.js';
import type { AdmissionResult } from '../core/admission.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
export const RACING_LINE_FORMAT = Object.freeze({ format: 'superoutride.racing-line', version: 3 } as const);

/** Metres between racing line stations along a Section, from its start; its end is the last station. */
export const RACING_LINE_SPACING = 5;

/** The native stations of a Section's racing line: every spacing from its start, then its end. */
export function racingLineStations(section: CompiledSection): readonly number[] {
  const { start, end } = section.coordinates.domain;
  const stations: number[] = [];
  for (let s = start; s < end; s += RACING_LINE_SPACING) stations.push(s);
  stations.push(end);
  return stations;
}

/** Each Section's line by its ID: a lateral per station. */
export type RacingLineLaterals = ReadonlyMap<string, readonly number[]>;

/**
 * A vehicle that timed a course's racing lines, with its identity: its planned seconds on the lines and on the
 * minimum-curvature lines.
 */
export interface RacingLineVehicle {
  readonly vehicleId: string;
  readonly vehicleSha256: string;
  readonly seconds: number;
  readonly minimumCurvatureSeconds: number;
}

/**
 * A course's racing lines as saved and delivered, keyed by the course build, the procedure that solved them and the
 * vehicles that timed them; with the length weight chosen.
 */
export interface RacingLineDocument {
  readonly format: typeof RACING_LINE_FORMAT.format;
  readonly version: typeof RACING_LINE_FORMAT.version;
  readonly courseBuildSha256: string;
  readonly procedureSha256: string;
  readonly spacing: number;
  readonly lengthWeight: number;
  readonly vehicles: readonly RacingLineVehicle[];
  readonly lines: readonly {
    readonly section: string;
    readonly laterals: readonly number[];
  }[];
}

/**
 * The document of `laterals` on `course`, its lines in course Section order, with
 * their length weight and timing vehicles; seconds are saved to the millisecond.
 */
export function racingLineDocument(
  course: CompiledCourse,
  procedureSha256: string,
  {
    laterals,
    lengthWeight,
    vehicles,
  }: {
    readonly laterals: RacingLineLaterals;
    readonly lengthWeight: number;
    readonly vehicles: readonly RacingLineVehicle[];
  },
): RacingLineDocument {
  const milliseconds = (seconds: number) => Math.round(seconds * 1000) / 1000;
  return {
    ...RACING_LINE_FORMAT,
    courseBuildSha256: course.identity.buildSha256,
    procedureSha256,
    spacing: RACING_LINE_SPACING,
    lengthWeight,
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      seconds: milliseconds(vehicle.seconds),
      minimumCurvatureSeconds: milliseconds(vehicle.minimumCurvatureSeconds),
    })),
    lines: course.sections.map((section) => ({ section: section.id, laterals: laterals.get(section.id)! })),
  };
}

/**
 * A course's admitted racing lines: the lateral of a Section's line at native station `s`, interpolated linearly
 * between its racing line stations.
 */
export interface RacingLines {
  lateral(section: CompiledSection, s: number): number;
}

/**
 * The racing lines `laterals` of `course` (one complete line per Section), read at a native station: linearly
 * between its racing line stations.
 */
export function createRacingLines(course: CompiledCourse, laterals: RacingLineLaterals): RacingLines {
  const lines = new Map(
    course.sections.map((section) => {
      const values = Float64Array.from(laterals.get(section.id)!);
      return [section, { stations: racingLineStations(section), values }] as const;
    }),
  );
  return Object.freeze({
    lateral(section: CompiledSection, s: number) {
      const { stations, values } = lines.get(section)!;
      const i = Math.min(stations.length - 2, Math.max(0, Math.floor(s / RACING_LINE_SPACING)));
      const a = stations[i]!,
        b = stations[i + 1]!;
      const t = Math.min(1, Math.max(0, (s - a) / (b - a)));
      return values[i]! + (values[i + 1]! - values[i]!) * t;
    },
  });
}

/**
 * Admit a course's racing lines against the compiled course: its build identity, the station spacing, a length weight
 * of at least 0, timing vehicles each with a positive finite time on the lines and on the minimum-curvature lines, and
 * exactly one line of finite laterals at every racing line station for each Section. The procedure and vehicle
 * identities are read here and compared by the build, which knows the procedure and catalog.
 */
export function readRacingLines(course: CompiledCourse, input: unknown, document = ''): AdmissionResult<RacingLines> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'procedureSha256', 'spacing', 'lengthWeight', 'vehicles', 'lines'],
      RACING_LINE_FORMAT.format,
      RACING_LINE_FORMAT.version,
    );
    requireAdmission(
      readString(data.courseBuildSha256, '/courseBuildSha256', SHA256_TEXT) === course.identity.buildSha256,
      'invalid_value',
      '/courseBuildSha256',
      'Stale course identity',
    );
    readString(data.procedureSha256, '/procedureSha256', SHA256_TEXT);
    requireAdmission(data.spacing === RACING_LINE_SPACING, 'invalid_value', '/spacing', 'Unknown station spacing');
    requireAdmission(readNumber(data.lengthWeight, '/lengthWeight') >= 0, 'invalid_value', '/lengthWeight', 'Negative');
    readArray(data.vehicles, '/vehicles', (value, path) => {
      const vehicle = readRecord(value, path, ['vehicleId', 'vehicleSha256', 'seconds', 'minimumCurvatureSeconds']);
      readString(vehicle.vehicleId, `${path}/vehicleId`);
      readString(vehicle.vehicleSha256, `${path}/vehicleSha256`, SHA256_TEXT);
      for (const key of ['seconds', 'minimumCurvatureSeconds'] as const)
        requireAdmission(
          readNumber(vehicle[key], `${path}/${key}`) > 0,
          'invalid_value',
          `${path}/${key}`,
          'Not positive',
        );
      return null;
    });
    const sections = new Map(course.sections.map((section) => [section.id, section]));
    const lines = new Map<string, readonly number[]>();
    readArray(data.lines, '/lines', (value, path) => {
      const line = readRecord(value, path, ['section', 'laterals']);
      const section = sections.get(readString(line.section, `${path}/section`));
      requireAdmission(section !== undefined, 'unresolved_reference', `${path}/section`, 'Unknown Section');
      requireAdmission(!lines.has(section.id), 'duplicate_id', path, 'One line per Section');
      const stations = racingLineStations(section);
      lines.set(
        section.id,
        readArray(line.laterals, `${path}/laterals`, (value, at) => readNumber(value, at), { length: stations.length }),
      );
      return null;
    });
    for (const section of course.sections)
      requireAdmission(lines.has(section.id), 'invalid_value', '/lines', `No line for Section ${section.id}`);
    return createRacingLines(course, lines);
  });
}
