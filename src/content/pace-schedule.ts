import {
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import { sessionVehicleSha256, type SessionVehicle } from './session-vehicle.js';

export const PACE_SCHEDULE_FORMAT = Object.freeze({ format: 'superoutride.pace-schedule', version: 1 } as const);

/** Metres between schedule stations along a Section, from its start; its end is the last station. */
export const PACE_SCHEDULE_SPACING = 5;

/** The native stations of a Section's schedule: every spacing from its start, then its end. */
export function paceScheduleStations(section: CompiledSection): readonly number[] {
  const { start, end } = section.coordinates.domain;
  const stations: number[] = [];
  for (let s = start; s < end; s += PACE_SCHEDULE_SPACING) stations.push(s);
  stations.push(end);
  return stations;
}

/** Integer milliseconds at consecutive stations, strictly increasing. */
export interface PaceTimes {
  readonly section: CompiledSection;
  /** The index of the first station timed. */
  readonly first: number;
  readonly milliseconds: readonly number[];
}

/**
 * A vehicle's reference pace on a course: from GO, its times at the entry Section's stations from its start position;
 * for every Section it runs through from the Section's start, the fastest time from that start to each station.
 */
export interface PaceSchedule {
  readonly start: PaceTimes;
  /** The fastest times from the Section's start, or null for a Section no reference run passes from its start. */
  section(section: CompiledSection): PaceTimes | null;
}

const MILLISECONDS = { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true };

/** Browser admission of the build-generated schedule for one course and Session vehicle. */
export async function readPaceSchedule(
  course: CompiledCourse,
  vehicle: SessionVehicle,
  input: unknown,
  document = '',
): Promise<AdmissionResult<PaceSchedule>> {
  const vehicleSha256 = await sessionVehicleSha256(vehicle);
  const sections = new Map(course.sections.map((section) => [section.id, section]));
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courseBuildSha256', 'vehicleSha256', 'spacing', 'start', 'sections'],
      PACE_SCHEDULE_FORMAT.format,
      PACE_SCHEDULE_FORMAT.version,
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
    requireAdmission(data.spacing === PACE_SCHEDULE_SPACING, 'invalid_value', '/spacing', 'Unknown station spacing');
    const times = (value: unknown, path: string, section: CompiledSection, first: number) => {
      const stations = paceScheduleStations(section).length;
      let previous = -1;
      const milliseconds = readArray(
        value,
        path,
        (ms, at) => {
          const read = readNumber(ms, at, MILLISECONDS);
          requireAdmission(read > previous, 'invalid_value', at, 'Times must increase');
          previous = read;
          return read;
        },
        { min: 2, max: stations - first },
      );
      return Object.freeze({ section, first, milliseconds });
    };
    const start = readRecord(data.start, '/start', ['section', 'first', 'milliseconds']);
    requireAdmission(
      readString(start.section, '/start/section') === course.entry.id,
      'invalid_value',
      '/start/section',
      'The start schedule belongs to the entry Section',
    );
    const startFirst = readNumber(start.first, '/start/first', { min: 0, integer: true });
    const startTimes = times(start.milliseconds, '/start/milliseconds', course.entry, startFirst);
    const bySection = new Map<CompiledSection, PaceTimes>();
    readArray(data.sections, '/sections', (value, at) => {
      const [id, milliseconds] = readArray(value, at, (item) => item, { length: 2 });
      const section = sections.get(readString(id, `${at}/0`));
      requireAdmission(section !== undefined, 'unresolved_reference', `${at}/0`, 'Unknown Section');
      requireAdmission(!bySection.has(section!), 'duplicate_id', `${at}/0`, 'Duplicate Section');
      const read = times(milliseconds, `${at}/1`, section!, 0);
      requireAdmission(read.milliseconds[0] === 0, 'invalid_value', `${at}/1/0`, 'A Section starts at 0 ms');
      bySection.set(section!, read);
    });
    return Object.freeze({
      start: startTimes,
      section: (section: CompiledSection) => bySection.get(section) ?? null,
    });
  });
}
