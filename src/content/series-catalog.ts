import {
  admit,
  readArray,
  readBoolean,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';

export const SERIES_DOCUMENT_FORMAT = 'superoutride.series';
export const SERIES_DOCUMENT_VERSION = 1;

/** One series: the one owner of its courses' ARCADE settings. `dev` series appear only with DEV. */
export interface CompiledSeries {
  readonly id: string;
  readonly title: string;
  readonly dev: boolean;
  /** ARCADE vehicle candidates in selection order. */
  readonly vehicles: readonly VehicleId[];
  readonly timeMargin: number;
  readonly courses: readonly SeriesCourse[];
}

/** A course's ARCADE settings within its series. `rivals` is provisional until competitor entries exist. */
export interface SeriesCourse {
  readonly series: CompiledSeries;
  readonly course: string;
  readonly laps: number;
  readonly rivals: number;
}

export interface SeriesCatalog {
  readonly series: readonly CompiledSeries[];
  /** The one series course naming `courseId`, or null when no series holds it. */
  courseSettings(courseId: string): SeriesCourse | null;
}

/**
 * Admit every series document against the delivered course IDs and the vehicle catalog: each document is named by
 * its `id`, its candidates and courses exist and are unique, and a course belongs to at most one series.
 */
export function compileSeriesCatalog(
  sources: readonly DocumentSource[],
  courseIds: readonly string[],
  vehicleIds: readonly VehicleId[],
): AdmissionResult<SeriesCatalog> {
  const series: CompiledSeries[] = [];
  const owners = new Map<string, SeriesCourse>();
  for (const source of sources) {
    const admitted = admit(source.path, () => readSeries(source, courseIds, vehicleIds, owners));
    if (!admitted.ok) return admitted;
    series.push(admitted.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      series: Object.freeze(series),
      courseSettings: (courseId: string) => owners.get(courseId) ?? null,
    }),
  };
}

function readSeries(
  source: DocumentSource,
  courseIds: readonly string[],
  vehicleIds: readonly VehicleId[],
  owners: Map<string, SeriesCourse>,
): CompiledSeries {
  const root = readDocument(
    source.value,
    ['format', 'version', 'id', 'title', 'dev', 'vehicles', 'timeMargin', 'courses'],
    SERIES_DOCUMENT_FORMAT,
    SERIES_DOCUMENT_VERSION,
  );
  const id = readString(root.id, '/id');
  requireAdmission(id === source.id, 'invalid_value', '/id', `Series ID must match its file name ${source.id}`);
  const vehicles = readArray(
    root.vehicles,
    '/vehicles',
    (value, at) => {
      const vehicle = readString(value, at);
      requireAdmission(vehicleIds.includes(vehicle), 'unresolved_reference', at, `Unknown vehicle ${vehicle}`);
      return vehicle;
    },
    { min: 1 },
  );
  requireUnique(vehicles, '/vehicles', 'vehicle');
  const series = {
    id,
    title: readString(root.title, '/title'),
    dev: readBoolean(root.dev, '/dev'),
    vehicles,
    timeMargin: readNumber(root.timeMargin, '/timeMargin', {
      min: 0,
      max: SESSION_RULE_LIMITS.timeMargin,
      exclusiveMin: true,
    }),
    courses: [] as SeriesCourse[],
  };
  const courses = readArray(
    root.courses,
    '/courses',
    (value, at) => {
      const entry = readRecord(value, at, ['course', 'laps', 'rivals']);
      const course = readString(entry.course, `${at}/course`);
      requireAdmission(courseIds.includes(course), 'unresolved_reference', `${at}/course`, `Unknown course ${course}`);
      requireAdmission(
        !owners.has(course),
        'duplicate_id',
        `${at}/course`,
        `Course ${course} already belongs to series ${owners.get(course)?.series.id}`,
      );
      const result: SeriesCourse = Object.freeze({
        series: series as CompiledSeries,
        course,
        laps: readNumber(entry.laps, `${at}/laps`, { min: 1, max: SESSION_RULE_LIMITS.laps, integer: true }),
        rivals: readNumber(entry.rivals, `${at}/rivals`, { min: 0, max: SESSION_RULE_LIMITS.rivals, integer: true }),
      });
      owners.set(course, result);
      return result;
    },
    { min: 1 },
  );
  series.courses = courses as SeriesCourse[];
  return Object.freeze(series);
}

function requireUnique(values: readonly string[], path: string, kind: string): void {
  values.forEach((value, index) =>
    requireAdmission(values.indexOf(value) === index, 'duplicate_id', `${path}/${index}`, `Duplicate ${kind} ${value}`),
  );
}

/**
 * Admit a series course against its compiled course: the laps fit the course's lap maximum and the grid holds the
 * player and the rivals. The build admits every series course; a Session admits the course it drives.
 */
export function admitSeriesCourse(
  settings: SeriesCourse,
  course: CompiledCourse,
  document: string,
): AdmissionResult<SeriesCourse> {
  const index = settings.series.courses.indexOf(settings);
  return admit(document, () => {
    requireAdmission(
      settings.laps <= course.rules.maxLaps,
      'invalid_value',
      `/courses/${index}/laps`,
      `Series laps exceed the lap maximum of ${course.id}`,
    );
    requireAdmission(
      settings.rivals < course.gates.grid.length,
      'invalid_value',
      `/courses/${index}/rivals`,
      `The grid of ${course.id} cannot hold the player and these rivals`,
    );
    return settings;
  });
}

/** Admit the delivered series against the delivered courses and the given vehicle catalog. */
export async function loadSeriesCatalog(
  content: ContentDelivery,
  vehicleIds: readonly VehicleId[],
): Promise<SeriesCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'series'))
    sources.push({ id: file.id, path: file.path, value: await content.json('series', file.id), sha256: file.sha256 });
  const courseIds = content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  return requireLoaded(compileSeriesCatalog(sources, courseIds, vehicleIds));
}

/** The delivered course's ARCADE settings, admitted against it, or null when no series holds the course. */
export function loadSeriesCourse(
  content: ContentDelivery,
  catalog: SeriesCatalog,
  course: CompiledCourse,
): SeriesCourse | null {
  const settings = catalog.courseSettings(course.id);
  if (!settings) return null;
  const document = content.manifest.files.find((file) => file.kind === 'series' && file.id === settings.series.id)!;
  return requireLoaded(admitSeriesCourse(settings, course, document.path));
}
