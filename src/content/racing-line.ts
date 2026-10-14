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
import type { CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import { PACE_SCHEDULE_SPACING, paceScheduleStations } from './pace-schedule.js';

export const RACING_LINE_FORMAT = Object.freeze({ format: 'superoutride.racing-line', version: 2 } as const);

/** Each Section's lines by its exit's Link ID (null for a Section that does not fork): a lateral per schedule station. */
export type RacingLineLaterals = ReadonlyMap<string, ReadonlyMap<string | null, readonly number[]>>;

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
    readonly exit: string | null;
    readonly laterals: readonly number[];
  }[];
}

/**
 * The document of `laterals` on `course`, its lines in course Section order and each fork's exits in exit order, with
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
    spacing: PACE_SCHEDULE_SPACING,
    lengthWeight,
    vehicles: vehicles.map((vehicle) => ({
      ...vehicle,
      seconds: milliseconds(vehicle.seconds),
      minimumCurvatureSeconds: milliseconds(vehicle.minimumCurvatureSeconds),
    })),
    lines: course.sections.flatMap((section) =>
      racingLineExits(section).map((exit) => ({
        section: section.id,
        exit: exit?.id ?? null,
        laterals: laterals.get(section.id)!.get(exit?.id ?? null)!,
      })),
    ),
  };
}

/** The exits a Section has a line toward: each of a fork's, or none (one line) for a Section that does not fork. */
export function racingLineExits(section: CompiledSection): readonly (CompiledLink | null)[] {
  return section.fork ? section.fork.exits.map((exit) => exit.link) : [null];
}

/**
 * A course's admitted racing lines: the lateral of a Section's line, toward `exit` on a fork Section, at native
 * station `s`, interpolated linearly between its schedule stations.
 */
export interface RacingLines {
  lateral(section: CompiledSection, exit: CompiledLink | null, s: number): number;
}

/**
 * The racing lines `laterals` of `course` (one complete line per Section and exit), read at a native station: linearly
 * between its schedule stations.
 */
export function createRacingLines(course: CompiledCourse, laterals: RacingLineLaterals): RacingLines {
  const lines = new Map(
    course.sections.map((section) => {
      const byExit = laterals.get(section.id)!;
      const values = new Map([...byExit].map(([exit, line]) => [exit, Float64Array.from(line)]));
      return [section, { stations: paceScheduleStations(section), values }] as const;
    }),
  );
  return Object.freeze({
    lateral(section: CompiledSection, exit: CompiledLink | null, s: number) {
      const { stations, values: byExit } = lines.get(section)!;
      const values = byExit.get(section.fork ? exit!.id : null)!;
      const i = Math.min(stations.length - 2, Math.max(0, Math.floor(s / PACE_SCHEDULE_SPACING)));
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
 * exactly one line of finite laterals at every schedule station for each Section, one per exit on a fork Section. The
 * procedure and vehicle identities are read here and compared by the build, which knows the procedure and catalog.
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
    requireAdmission(data.spacing === PACE_SCHEDULE_SPACING, 'invalid_value', '/spacing', 'Unknown station spacing');
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
    const lines = new Map<CompiledSection, Map<string | null, readonly number[]>>();
    readArray(data.lines, '/lines', (value, path) => {
      const line = readRecord(value, path, ['section', 'exit', 'laterals']);
      const section = sections.get(readString(line.section, `${path}/section`));
      requireAdmission(section !== undefined, 'unresolved_reference', `${path}/section`, 'Unknown Section');
      const exit = line.exit === null ? null : readString(line.exit, `${path}/exit`);
      requireAdmission(
        racingLineExits(section).some((candidate) => (candidate?.id ?? null) === exit),
        'unresolved_reference',
        `${path}/exit`,
        section.fork ? "Not one of the Section's exits" : 'A Section that does not fork has one line, with no exit',
      );
      const byExit = lines.get(section) ?? new Map();
      requireAdmission(!byExit.has(exit), 'duplicate_id', path, 'One line per Section and exit');
      const stations = paceScheduleStations(section);
      const laterals = readArray(line.laterals, `${path}/laterals`, (value, at) => readNumber(value, at), {
        length: stations.length,
      });
      byExit.set(exit, laterals);
      lines.set(section, byExit);
      return null;
    });
    for (const section of course.sections)
      for (const exit of racingLineExits(section))
        requireAdmission(
          lines.get(section)?.has(exit?.id ?? null) === true,
          'invalid_value',
          '/lines',
          `No line for Section ${section.id}${exit ? ` toward ${exit.id}` : ''}`,
        );
    return createRacingLines(course, new Map([...lines].map(([section, byExit]) => [section.id, byExit])));
  });
}
