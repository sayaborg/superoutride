import {
  admit,
  readArray,
  readBoolean,
  readDictionary,
  readDocument,
  readEnum,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { enumerateCourseRoutes } from '../course/compiler/course-routes.js';
import type { VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';

export const SERIES_DOCUMENT_FORMAT = 'superoutride.series';
export const SERIES_DOCUMENT_VERSION = 4;
const PLAYER_SLOTS = ['own', 'last'] as const;

/** One series: the one owner of its courses' ARCADE settings. `dev` series appear only with DEV. */
export interface CompiledSeries {
  readonly id: string;
  readonly title: string;
  readonly dev: boolean;
  /** ARCADE vehicle candidates in selection order. */
  readonly vehicles: readonly VehicleId[];
  readonly timeMargin: number;
  /** Whether the player drives in its entry's color rather than its own chosen color. */
  readonly fixedColors: boolean;
  readonly courses: readonly SeriesCourse[];
}

/** One whole-race competitor entry: its vehicle, color and grid slot index. */
export interface SeriesEntry {
  readonly vehicle: VehicleId;
  readonly color: string;
  readonly slot: number;
  /** The stages the entry takes part in, `first` through `last`; null for the whole run. */
  readonly stages: StageInterval | null;
}

/** An inclusive stage interval; STAGE k runs from the (k−1)-th race gate of the run to the k-th. */
export interface StageInterval {
  readonly first: number;
  readonly last: number;
}

/** A course's ARCADE settings within its series. */
export interface SeriesCourse {
  readonly series: CompiledSeries;
  readonly course: string;
  readonly laps: number;
  /** The whole field in grid order; the player takes the rearmost entry of the selected vehicle. */
  readonly entries: readonly SeriesEntry[];
  /** `own`: the player stands in its entry's slot; `last`: in the rearmost of the entries' slots. */
  readonly playerSlot: (typeof PLAYER_SLOTS)[number];
  /** Rank limit N by race gate ID: the player fails when the N-th other competitor crosses that gate first. */
  readonly rankLimits: Readonly<Record<string, number>>;
}

export interface SeriesCatalog {
  readonly series: readonly CompiledSeries[];
  /** The one series course naming `courseId`, or null when no series holds it. */
  courseSettings(courseId: string): SeriesCourse | null;
}

/**
 * Admit every series document against the delivered course IDs and the vehicle catalog: each document is named by
 * its `id`, its candidates and courses exist and are unique, a course belongs to at most one series, and each
 * course's entries name catalog vehicles in colors of their sprite sets, with an entry for every candidate.
 */
export function compileSeriesCatalog(
  sources: readonly DocumentSource[],
  courseIds: readonly string[],
  vehicles: readonly CompiledVehicleDefinition[],
): AdmissionResult<SeriesCatalog> {
  const series: CompiledSeries[] = [];
  const owners = new Map<string, SeriesCourse>();
  for (const source of sources) {
    const admitted = admit(source.path, () => readSeries(source, courseIds, vehicles, owners));
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
  catalog: readonly CompiledVehicleDefinition[],
  owners: Map<string, SeriesCourse>,
): CompiledSeries {
  const vehicleOf = (id: string) => catalog.find((vehicle) => vehicle.compiledVehicle.id === id);
  const root = readDocument(
    source.value,
    ['format', 'version', 'id', 'title', 'dev', 'vehicles', 'timeMargin', 'fixedColors', 'courses'],
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
      requireAdmission(vehicleOf(vehicle) !== undefined, 'unresolved_reference', at, `Unknown vehicle ${vehicle}`);
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
    fixedColors: readBoolean(root.fixedColors, '/fixedColors'),
    courses: [] as SeriesCourse[],
  };
  const courses = readArray(
    root.courses,
    '/courses',
    (value, at) => {
      const entry = readRecord(value, at, ['course', 'laps', 'entries', 'playerSlot', 'rankLimits']);
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
        entries: readEntries(entry.entries, `${at}/entries`, vehicles, vehicleOf),
        playerSlot: readEnum(entry.playerSlot, PLAYER_SLOTS, `${at}/playerSlot`),
        rankLimits: readDictionary(entry.rankLimits, `${at}/rankLimits`, (limit, path) =>
          readNumber(limit, path, { min: 1, max: SESSION_RULE_LIMITS.rivals, integer: true }),
        ),
      });
      owners.set(course, result);
      return result;
    },
    { min: 1 },
  );
  series.courses = courses as SeriesCourse[];
  return Object.freeze(series);
}

/** At most a full field of entries in grid order, with at least one entry for every candidate vehicle. */
function readEntries(
  value: unknown,
  path: string,
  candidates: readonly VehicleId[],
  vehicleOf: (id: string) => CompiledVehicleDefinition | undefined,
): readonly SeriesEntry[] {
  let previous = -1;
  const entries = readArray(
    value,
    path,
    (item, at) => {
      const record = readRecord(item, at, ['vehicle', 'color', 'slot', 'stages']);
      const id = readString(record.vehicle, `${at}/vehicle`);
      const vehicle = vehicleOf(id);
      requireAdmission(vehicle !== undefined, 'unresolved_reference', `${at}/vehicle`, `Unknown vehicle ${id}`);
      const color = readString(record.color, `${at}/color`);
      requireAdmission(
        spriteSetHasColor(vehicle!.spriteSet, color),
        'unresolved_reference',
        `${at}/color`,
        `${id} has no color ${color}`,
      );
      const slot = readNumber(record.slot, `${at}/slot`, {
        min: 0,
        max: SESSION_RULE_LIMITS.competitors - 1,
        integer: true,
      });
      requireAdmission(slot > previous, 'invalid_value', `${at}/slot`, 'Entries must be in grid order, one per slot');
      previous = slot;
      const stages = record.stages === null ? null : readStages(record.stages, `${at}/stages`);
      requireAdmission(
        stages === null || stages.first === 1,
        'invalid_value',
        `${at}/stages/first`,
        'A grid entry takes part from STAGE 1',
      );
      return Object.freeze({ vehicle: id, color, slot, stages });
    },
    { min: 1, max: SESSION_RULE_LIMITS.competitors },
  );
  for (const candidate of candidates)
    requireAdmission(
      entries.some((entry) => entry.vehicle === candidate),
      'invalid_value',
      path,
      `Candidate vehicle ${candidate} needs an entry for the player`,
    );
  return entries;
}

function readStages(value: unknown, path: string): StageInterval {
  const record = readRecord(value, path, ['first', 'last']);
  const first = readNumber(record.first, `${path}/first`, { min: 1, integer: true });
  const last = readNumber(record.last, `${path}/last`, { min: 1, integer: true });
  requireAdmission(last >= first, 'invalid_value', `${path}/last`, 'The last stage precedes the first');
  return Object.freeze({ first, last });
}

/** The fewest stages any run of the course takes: race gates per route, times the laps on a circuit. */
function courseStageCount(course: CompiledCourse, laps: number): number {
  const gates = new Map(
    course.gates.intervals.map(({ section, checkpoints, finish }) => [section, checkpoints.length + (finish ? 1 : 0)]),
  );
  if (course.type === 'CIRCUIT') {
    let count = 0,
      section = course.entry;
    do {
      count += gates.get(section) ?? 0;
      section = section.outgoing[0]!.to.section;
    } while (section !== course.entry);
    return count * laps;
  }
  return Math.min(
    ...enumerateCourseRoutes(course.entry, course.type).map((links) =>
      [course.entry, ...links.map((link) => link.to.section)].reduce((n, s) => n + (gates.get(s) ?? 0), 0),
    ),
  );
}

function requireUnique(values: readonly string[], path: string, kind: string): void {
  values.forEach((value, index) =>
    requireAdmission(values.indexOf(value) === index, 'duplicate_id', `${path}/${index}`, `Duplicate ${kind} ${value}`),
  );
}

/**
 * Admit a series course against its compiled course: the laps fit the course's lap maximum, every entry's slot is in
 * the grid, and each rank limit names a race gate of the course with N below the field size. The build admits every
 * series course; a Session admits the course it drives.
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
    settings.entries.forEach((entry, i) =>
      requireAdmission(
        entry.slot < course.gates.grid.length,
        'invalid_value',
        `/courses/${index}/entries/${i}/slot`,
        `The grid of ${course.id} has no slot ${entry.slot}`,
      ),
    );
    const gates = new Set(
      course.gates.intervals
        .flatMap(({ checkpoints, finish }) => [...checkpoints, ...(finish ? [finish] : [])])
        .map((gate) => gate.id),
    );
    const stageCount = courseStageCount(course, settings.laps);
    settings.entries.forEach((entry, i) =>
      requireAdmission(
        entry.stages === null || entry.stages.last <= stageCount,
        'invalid_value',
        `/courses/${index}/entries/${i}/stages/last`,
        `Every run of ${course.id} has ${stageCount} stages`,
      ),
    );
    for (const [gate, limit] of Object.entries(settings.rankLimits)) {
      const at = `/courses/${index}/rankLimits/${gate.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      requireAdmission(gates.has(gate), 'unresolved_reference', at, `${course.id} has no race gate ${gate}`);
      requireAdmission(
        limit < settings.entries.length,
        'invalid_value',
        at,
        `Rank limit ${limit} must be below the field size ${settings.entries.length}`,
      );
    }
    return settings;
  });
}

/** Admit the delivered series against the delivered courses and the given vehicle catalog. */
export async function loadSeriesCatalog(
  content: ContentDelivery,
  vehicles: readonly CompiledVehicleDefinition[],
): Promise<SeriesCatalog> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'series'))
    sources.push({ id: file.id, path: file.path, value: await content.json('series', file.id), sha256: file.sha256 });
  const courseIds = content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  return requireLoaded(compileSeriesCatalog(sources, courseIds, vehicles));
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
