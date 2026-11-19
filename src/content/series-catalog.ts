import {
  admit,
  readArray,
  readBoolean,
  readDictionary,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { READY_SECONDS, RUN_RULE_LIMITS, type TrafficSettings } from '../course/run-rules.js';
import { COURSE_TEXT_LIMITS } from '../course/course-limits.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseStartGrid } from '../course/compiler/course-rules.js';
import { courseRouteLinks } from '../course/compiler/course-routes.js';
import { createCourseRoute } from '../course/course-route.js';
import { MAXIMUM_VEHICLE_SPEED_KILOMETERS_PER_HOUR, type VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetHasColor } from '../vehicle/vehicle-sprite-set.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import type { DocumentSource } from './document-catalog.js';
import { courseTextString } from './course-texts.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { MusicCatalog } from './recording-catalog.js';
import { SERIES_IMAGE, type ScreenPictureCatalog } from './screen-picture-catalog.js';

/**
 * A class title in full: at most a course name's 40 characters, in the lines the PRE-RACE card writes it in from
 * column 17 of the text grid's 40, one or two of at most 23.
 */
export const CLASS_TITLE = Object.freeze({ columns: 23, lines: 2 });
/** A class title's lines: whole when it fits a line, else broken at the last space that fits. */
export function classTitleLines(title: string): readonly string[] {
  if (title.length <= CLASS_TITLE.columns) return [title];
  const space = title.lastIndexOf(' ', CLASS_TITLE.columns);
  return space > 0 ? [title.slice(0, space), title.slice(space + 1)] : [title];
}

export const SERIES_DOCUMENT_FORMAT = 'superoutride.series';
export const SERIES_DOCUMENT_VERSION = 21;
const PLAYER_SLOTS = ['own', 'last', 'first'] as const;
const TRAFFIC_PATHS = ['lane', 'line'] as const;

/**
 * One series: a named set of classes, the one owner of its classes, the races it runs. It holds no rule values; every
 * rule is its classes'. `dev` series appear only with DEV.
 */
export interface CompiledSeries {
  readonly id: string;
  /** The official display name, written in full wherever the series is named. */
  readonly title: string;
  /** Its English description, as a course's, of the series alone (K, 2026-11-11). */
  readonly description: string;
  /**
   * The series image: a 40×30-tile opaque screen picture, named by the document's `image`; null for a series without a
   * world of its own, which stands in the main world (FREE PLAY, K, 2026-11-09 and 2026-11-19).
   */
  readonly image: TilePicture | null;
  /** Its title track, null for a silent series; a course's race tracks are its course sounds' (K, 2026-11-11). */
  readonly music: { readonly title: MusicTrack | null };
  readonly dev: boolean;
  /** The classes in selection order. */
  readonly classes: readonly SeriesClass[];
}

/**
 * One competitor entry: its vehicle, color, pace ratio and stage interval, and how it appears: a grid slot index when
 * it takes part from STAGE 1, otherwise an ahead appearance. In a class open to every vehicle an entry's vehicle is
 * the player's (null), in a color the run's seed draws (null).
 */
export interface SeriesEntry {
  readonly vehicle: VehicleId | null;
  readonly color: string | null;
  /** The stages the entry takes part in, `first` through `last`; null for the whole run. */
  readonly stages: StageInterval | null;
  readonly slot: number | null;
  readonly ahead: AheadAppearance | null;
}

/** Where a later entry appears when the player enters its first stage: metres ahead of the player, in its lane. */
export interface AheadAppearance {
  readonly distance: number;
  /** Its lane number (0 is the leftmost lane), valid in every Section of the course. */
  readonly lane: number;
}

/** An inclusive stage interval; STAGE k runs from the (k−1)-th race gate of the run to the k-th. */
export interface StageInterval {
  readonly first: number;
  readonly last: number;
}

/** A class's traffic: its settings, a candidate null for the player's own vehicle in a class open to every vehicle. */
export type ClassTraffic = Omit<TrafficSettings, 'vehicles'> & { readonly vehicles: readonly (VehicleId | null)[] };

/**
 * One race of a series: its course, laps, vehicle candidates, field and traffic. A class may leave its course or its
 * vehicle to the player (K, 2026-11-19: FREE PLAY's classes): any course offered (`course` null), and any vehicle
 * (`vehicles` null), whose field and traffic are then the player's own vehicle.
 */
export interface SeriesClass {
  readonly series: CompiledSeries;
  /** Unique within its series. */
  readonly id: string;
  /** The display name. */
  readonly title: string;
  /** Its course; null for any course offered. */
  readonly course: string | null;
  /** Its laps; on any course, at most the course's lap maximum. */
  readonly laps: number;
  /** RACE vehicle candidates in selection order; null for any catalog vehicle. */
  readonly vehicles: readonly VehicleId[] | null;
  /** The whole field, grid entries in grid order; the player takes the rearmost grid entry of its vehicle. */
  readonly entries: readonly SeriesEntry[];
  /**
   * `own`: the player stands in its entry's slot; `last`: in the rearmost of the entries' slots, the others in the slots
   * in front of it; `first`: in the frontmost, the others in the slots behind it.
   */
  readonly playerSlot: (typeof PLAYER_SLOTS)[number];
  /**
   * A CHASE start (K, 2026-11-20), or null for the field together from the grid at GO: the player alone stands on the
   * grid, held through READY, and the one rival passes it from behind at its top speed `READY_SECONDS` after READY
   * begins; GO comes `seconds` after it passes, at least `READY_SECONDS` so that the lamps count. A CHASE class has two
   * entries: the player's in a grid slot, and the rival's with no slot, as it never stands on the grid.
   */
  readonly chase: { readonly seconds: number } | null;
  /** Rank limit N by race gate ID: the player fails when the N-th other competitor crosses that gate first. */
  readonly rankLimits: Readonly<Record<string, number>>;
  /** The course's RACE traffic; null for none. */
  readonly traffic: ClassTraffic | null;
  /**
   * The clock's margin over the reference times: positive and at most `RUN_RULE_LIMITS.timeMargin`; null for a RACE
   * without a clock, which needs no reference times and whose rivals drive unpaced.
   */
  readonly timeMargin: number | null;
  /** Whether the player drives in its entry's color rather than its own chosen color. */
  readonly fixedColors: boolean;
}

/** A class of its own course and vehicles, which a run can drive as it stands: what the attract demo shows. */
export type FixedClass = SeriesClass & { readonly course: string; readonly vehicles: readonly VehicleId[] };
/** Whether `runClass` names its course and vehicles. */
export const isFixedClass = (runClass: SeriesClass): runClass is FixedClass =>
  runClass.course !== null && runClass.vehicles !== null;

/** A class on its course with the player's vehicle: what a run of it drives, nothing left open. */
export interface CourseClass extends Omit<SeriesClass, 'course' | 'vehicles' | 'entries' | 'traffic'> {
  readonly course: string;
  readonly vehicles: readonly VehicleId[];
  /** The field; an entry's color null is drawn by the run's seed. */
  readonly entries: readonly (SeriesEntry & { readonly vehicle: VehicleId })[];
  readonly traffic: TrafficSettings | null;
}

/** What a run reads of its class on its course: its rules, without its series or names. */
export type ClassRules = Omit<CourseClass, 'series' | 'id' | 'title'>;

export interface SeriesCatalog {
  readonly series: readonly CompiledSeries[];
  /** The class `classId` of the series `seriesId`, or null when there is none. */
  seriesClass(seriesId: string, classId: string): SeriesClass | null;
}

/**
 * Admit every series document against the delivered course IDs and the vehicle catalog: each document is named by
 * its `id`, its classes are unique by ID within it and run delivered courses (a course may be run by several classes
 * of several series), and each class's candidates are unique catalog
 * vehicles and its entries name catalog vehicles in colors of their sprite sets, with an entry for every candidate.
 */
export function compileSeriesCatalog(
  sources: readonly DocumentSource[],
  courseIds: readonly string[],
  vehicles: readonly CompiledVehicleDefinition[],
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): AdmissionResult<SeriesCatalog> {
  const series: CompiledSeries[] = [];
  for (const source of sources) {
    const admitted = admit(source.path, () => readSeries(source, courseIds, vehicles, pictures, music));
    if (!admitted.ok) return admitted;
    series.push(admitted.value);
  }
  return {
    ok: true,
    value: Object.freeze({
      series: Object.freeze(series),
      seriesClass: (seriesId: string, classId: string) =>
        series.find((s) => s.id === seriesId)?.classes.find((c) => c.id === classId) ?? null,
    }),
  };
}

function classTitle(value: unknown, path: string): string {
  const title = courseTextString(value, path, COURSE_TEXT_LIMITS.nameCodeUnits);
  const lines = classTitleLines(title);
  requireAdmission(
    lines.length <= CLASS_TITLE.lines && lines.every((line) => line.length <= CLASS_TITLE.columns),
    'resource_limit',
    path,
    `A class title breaks into at most ${CLASS_TITLE.lines} lines of ${CLASS_TITLE.columns} characters`,
  );
  return title;
}

function readSeries(
  source: DocumentSource,
  courseIds: readonly string[],
  catalog: readonly CompiledVehicleDefinition[],
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): CompiledSeries {
  const vehicleOf = (id: string) => catalog.find((vehicle) => vehicle.compiledVehicle.id === id);
  const root = readDocument(
    source.value,
    ['format', 'version', 'id', 'title', 'description', 'image', 'music', 'dev', 'classes'],
    SERIES_DOCUMENT_FORMAT,
    SERIES_DOCUMENT_VERSION,
  );
  const id = readString(root.id, '/id');
  requireAdmission(id === source.id, 'invalid_value', '/id', `Series ID must match its file name ${source.id}`);
  const imageName = root.image === null ? null : readString(root.image, '/image');
  const image = imageName === null ? null : pictures.get(imageName);
  requireAdmission(image !== undefined, 'unresolved_reference', '/image', `Unknown screen picture ${imageName}`);
  requireAdmission(
    image === null || (image.columns === SERIES_IMAGE.columns && image.rows === SERIES_IMAGE.rows && image.opaque),
    'invalid_value',
    '/image',
    `A series image is an opaque screen picture of ${SERIES_IMAGE.columns}×${SERIES_IMAGE.rows} tiles`,
  );
  const track = (value: unknown, path: string) => {
    if (value === null) return null;
    const name = readString(value, path);
    const found = music.find((t) => t.id === name);
    requireAdmission(found !== undefined, 'unresolved_reference', path, `Unknown track ${name}`);
    return found;
  };
  const tracks = readRecord(root.music, '/music', ['title']);

  const series = {
    id,
    title: courseTextString(root.title, '/title', COURSE_TEXT_LIMITS.nameCodeUnits),
    description: courseTextString(root.description, '/description', COURSE_TEXT_LIMITS.descriptionCodeUnits),
    image,
    music: Object.freeze({ title: track(tracks.title, '/music/title') }),
    dev: readBoolean(root.dev, '/dev'),
    classes: [] as SeriesClass[],
  };
  const classes = readIdentified(
    root.classes,
    '/classes',
    (value, at) => {
      const entry = readRecord(value, at, [
        'id',
        'title',
        'course',
        'laps',
        'vehicles',
        'entries',
        'playerSlot',
        'chase',
        'rankLimits',
        'traffic',
        'timeMargin',
        'fixedColors',
      ]);
      const course = entry.course === null ? null : readString(entry.course, `${at}/course`);
      requireAdmission(
        course === null || courseIds.includes(course),
        'unresolved_reference',
        `${at}/course`,
        `Unknown course ${course}`,
      );
      const vehicles =
        entry.vehicles === null
          ? null
          : readArray(
              entry.vehicles,
              `${at}/vehicles`,
              (item, itemAt) => {
                const vehicle = readString(item, itemAt);
                requireAdmission(
                  vehicleOf(vehicle) !== undefined,
                  'unresolved_reference',
                  itemAt,
                  `Unknown vehicle ${vehicle}`,
                );
                return vehicle;
              },
              { min: 1 },
            );
      if (vehicles) requireUnique(vehicles, `${at}/vehicles`, 'vehicle');
      const chase =
        entry.chase === null
          ? null
          : Object.freeze({
              seconds: readNumber(readRecord(entry.chase, `${at}/chase`, ['seconds']).seconds, `${at}/chase/seconds`, {
                min: READY_SECONDS,
              }),
            });
      const entries = readEntries(entry.entries, `${at}/entries`, vehicles, vehicleOf, chase !== null);
      const playerSlot = readEnum(entry.playerSlot, PLAYER_SLOTS, `${at}/playerSlot`);
      const rankLimits = readDictionary(entry.rankLimits, `${at}/rankLimits`, (limit, path) =>
        readNumber(limit, path, { min: 1, max: RUN_RULE_LIMITS.rivals, integer: true }),
      );
      const timeMargin =
        entry.timeMargin === null
          ? null
          : readNumber(entry.timeMargin, `${at}/timeMargin`, {
              min: 0,
              max: RUN_RULE_LIMITS.timeMargin,
              exclusiveMin: true,
            });
      const fixedColors = readBoolean(entry.fixedColors, `${at}/fixedColors`);
      // On any course nothing depends on the course: no clock, no rank limits and no entry appearing ahead.
      if (course === null)
        requireAdmission(
          timeMargin === null && Object.keys(rankLimits).length === 0 && entries.every((e) => e.stages === null),
          'invalid_value',
          at,
          'A class on any course has no clock, rank limits or stages',
        );
      requireAdmission(
        vehicles !== null || !fixedColors,
        'invalid_value',
        `${at}/fixedColors`,
        'A class of any vehicle fixes no colors',
      );
      return Object.freeze({
        series: series as CompiledSeries,
        id: readString(entry.id, `${at}/id`),
        title: classTitle(entry.title, `${at}/title`),
        course,
        laps: readNumber(entry.laps, `${at}/laps`, { min: 1, max: RUN_RULE_LIMITS.laps, integer: true }),
        vehicles,
        entries,
        playerSlot,
        chase,
        rankLimits,
        traffic: entry.traffic === null ? null : readTraffic(entry.traffic, `${at}/traffic`, vehicles, vehicleOf),
        timeMargin,
        fixedColors,
      });
    },
    { min: 1 },
  );
  series.classes = classes as SeriesClass[];
  return Object.freeze(series);
}

/**
 * At most a full field of entries in grid order, with at least one grid entry for every candidate vehicle; with no
 * candidates (any vehicle), every entry is the player's vehicle in a drawn color, and one at least has a grid slot.
 */
function readEntries(
  value: unknown,
  path: string,
  candidates: readonly VehicleId[] | null,
  vehicleOf: (id: string) => CompiledVehicleDefinition | undefined,
  chase: boolean,
): readonly SeriesEntry[] {
  let previous = -1,
    index = -1;
  const entries = readArray(
    value,
    path,
    (item, at) => {
      index += 1;
      const record = readRecord(item, at, ['vehicle', 'color', 'stages', 'slot', 'ahead']);
      let id: string | null = null,
        color: string | null = null;
      if (candidates === null)
        requireAdmission(
          record.vehicle === null && record.color === null,
          'invalid_value',
          at,
          "A class of any vehicle names no vehicle or color: each entry is the player's vehicle",
        );
      else {
        id = readString(record.vehicle, `${at}/vehicle`);
        const vehicle = vehicleOf(id);
        requireAdmission(vehicle !== undefined, 'unresolved_reference', `${at}/vehicle`, `Unknown vehicle ${id}`);
        color = readString(record.color, `${at}/color`);
        requireAdmission(
          spriteSetHasColor(vehicle!.spriteSet, color),
          'unresolved_reference',
          `${at}/color`,
          `${id} has no color ${color}`,
        );
      }
      const stages = record.stages === null ? null : readStages(record.stages, `${at}/stages`);
      // A CHASE class's rival, its second entry, takes part throughout and stands in no slot: it passes from behind.
      if (chase && index === 1) {
        requireAdmission(
          stages === null && record.slot === null && record.ahead === null,
          'invalid_value',
          at,
          'A CHASE rival takes part throughout, with no slot or ahead appearance',
        );
        return Object.freeze({ vehicle: id, color, stages, slot: null, ahead: null });
      }
      // An entry from STAGE 1 stands in a grid slot; a later one appears ahead of the player.
      if (stages === null || stages.first === 1) {
        requireAdmission(record.ahead === null, 'invalid_value', `${at}/ahead`, 'A grid entry has no ahead appearance');
        const slot = readNumber(record.slot, `${at}/slot`, {
          min: 0,
          max: RUN_RULE_LIMITS.competitors - 1,
          integer: true,
        });
        requireAdmission(
          slot > previous,
          'invalid_value',
          `${at}/slot`,
          'Grid entries must be in grid order, one per slot',
        );
        previous = slot;
        return Object.freeze({ vehicle: id, color, stages, slot, ahead: null });
      }
      requireAdmission(record.slot === null, 'invalid_value', `${at}/slot`, 'An entry from a later stage has no slot');
      const ahead = readRecord(record.ahead, `${at}/ahead`, ['distance', 'lane']);
      return Object.freeze({
        vehicle: id,
        color,
        stages,
        slot: null,
        ahead: Object.freeze({
          distance: readNumber(ahead.distance, `${at}/ahead/distance`, { min: 0, exclusiveMin: true }),
          lane: readNumber(ahead.lane, `${at}/ahead/lane`, { min: 0, integer: true }),
        }),
      });
    },
    { min: 1, max: RUN_RULE_LIMITS.competitors },
  );
  requireAdmission(
    !chase || entries.length === 2,
    'invalid_value',
    path,
    "A CHASE class has two entries: the player's on the grid and its rival's",
  );
  for (const candidate of candidates ?? [null])
    requireAdmission(
      entries.some((entry) => entry.vehicle === candidate && entry.slot !== null),
      'invalid_value',
      path,
      `Candidate vehicle ${candidate ?? 'of the player'} needs a grid entry for the player`,
    );
  return entries;
}

/**
 * Traffic settings: a density within the run rule ceiling, unique catalog vehicles and a speed in km/h; in a class of
 * any vehicle (`classVehicles` null), the one candidate is the player's vehicle (null).
 */
function readTraffic(
  value: unknown,
  path: string,
  classVehicles: readonly VehicleId[] | null,
  vehicleOf: (id: string) => CompiledVehicleDefinition | undefined,
): ClassTraffic {
  const record = readRecord(value, path, ['density', 'path', 'vehicles', 'speedKilometersPerHour']);
  const candidates = readArray(
    record.vehicles,
    `${path}/vehicles`,
    (item, at) => {
      const candidate = readRecord(item, at, ['vehicle', 'weight']);
      let id: string | null = null;
      if (classVehicles === null)
        requireAdmission(
          candidate.vehicle === null,
          'invalid_value',
          `${at}/vehicle`,
          "A class of any vehicle names no vehicle: its traffic is the player's vehicle",
        );
      else {
        id = readString(candidate.vehicle, `${at}/vehicle`);
        requireAdmission(vehicleOf(id) !== undefined, 'unresolved_reference', `${at}/vehicle`, `Unknown vehicle ${id}`);
      }
      const weight = readNumber(candidate.weight, `${at}/weight`, {
        min: 1,
        max: RUN_RULE_LIMITS.trafficWeight,
        integer: true,
      });
      return { id, weight };
    },
    { min: 1 },
  );
  const vehicles = Object.freeze(candidates.map((candidate) => candidate.id));
  requireUnique(
    vehicles.map((id) => id ?? 'of the player'),
    `${path}/vehicles`,
    'vehicle',
  );
  return Object.freeze({
    density: readNumber(record.density, `${path}/density`, {
      min: 0,
      exclusiveMin: true,
      max: RUN_RULE_LIMITS.trafficDensity,
    }),
    vehicles,
    weights: Object.freeze(candidates.map((candidate) => candidate.weight)),
    path: readEnum(record.path, TRAFFIC_PATHS, `${path}/path`),
    speedKilometersPerHour: readNumber(record.speedKilometersPerHour, `${path}/speedKilometersPerHour`, {
      min: 0,
      exclusiveMin: true,
      max: MAXIMUM_VEHICLE_SPEED_KILOMETERS_PER_HOUR,
    }),
  });
}

function readStages(value: unknown, path: string): StageInterval {
  const record = readRecord(value, path, ['first', 'last']);
  const first = readNumber(record.first, `${path}/first`, { min: 1, integer: true });
  const last = readNumber(record.last, `${path}/last`, { min: 1, integer: true });
  requireAdmission(last >= first, 'invalid_value', `${path}/last`, 'The last stage precedes the first');
  return Object.freeze({ first, last });
}

/** The stages a run of the course takes: race gates along its route, times the laps on a circuit. */
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
  return [course.entry, ...courseRouteLinks(course.entry, course.type).map((link) => link.to.section)].reduce(
    (n, s) => n + (gates.get(s) ?? 0),
    0,
  );
}

/**
 * The distance from the race gate opening STAGE `stage` to the next race gate after it: an ahead appearance must fall
 * short of it.
 */
function aheadRoom(course: CompiledCourse, laps: number, stage: number): number {
  const gatesOf = new Map(
    course.gates.intervals.map(({ section, checkpoints, finish }) => [
      section,
      [...checkpoints, ...(finish ? [finish] : [])],
    ]),
  );
  const builder = createCourseRoute(course.entry);
  if (course.type === 'CIRCUIT') {
    // A circuit repeats its loop once per lap.
    let sections = 1;
    for (let section = course.entry.outgoing[0]!.to.section; section !== course.entry; sections++)
      section = section.outgoing[0]!.to.section;
    for (let i = 1; i < sections * laps; i++) builder.extend();
  } else builder.extendThrough(Infinity);
  const gates: number[] = [];
  for (const occurrence of builder.route.occurrences)
    for (const gate of gatesOf.get(occurrence.section) ?? []) gates.push(occurrence.start + gate.at.s);
  const opening = gates[stage - 2]!;
  return (gates[stage - 1] ?? Infinity) - opening;
}

function requireUnique(values: readonly string[], path: string, kind: string): void {
  values.forEach((value, index) =>
    requireAdmission(values.indexOf(value) === index, 'duplicate_id', `${path}/${index}`, `Duplicate ${kind} ${value}`),
  );
}

/**
 * The class on `course` with the player in `vehicleId`, a vehicle of the catalog `vehicles` (one of the class's
 * candidates, when it has them): a class of any course takes `course`, its laps cut to the course's lap maximum and its
 * grid entries to the slots its grid holds; a class of any vehicle takes the player's vehicle for its candidates, every
 * entry and its traffic. A class of its own course runs nothing else (a `RangeError`).
 */
export function classOnCourse(
  runClass: SeriesClass,
  course: CompiledCourse,
  vehicleId: VehicleId,
  vehicles: readonly CompiledVehicleDefinition[],
): CourseClass {
  if (runClass.course !== null && runClass.course !== course.id)
    throw new RangeError(`Class ${runClass.id} runs ${runClass.course}, not ${course.id}`);
  const vehicleOf = (id: string) => id ?? vehicleId;
  const entries = runClass.entries.map((entry) => Object.freeze({ ...entry, vehicle: vehicleOf(entry.vehicle!) }));
  const bike = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)?.listing.form === 'bike';
  const grid = courseStartGrid(
    course.gates,
    entries.every((entry) => bike(entry.vehicle)),
  ).length;
  const open = runClass.course === null;
  return Object.freeze({
    ...runClass,
    course: course.id,
    laps: open ? Math.min(runClass.laps, course.rules.maxLaps) : runClass.laps,
    vehicles: runClass.vehicles ?? Object.freeze([vehicleId]),
    entries: Object.freeze(open ? entries.filter((entry) => entry.slot === null || entry.slot < grid) : entries),
    traffic:
      runClass.traffic &&
      Object.freeze({
        ...runClass.traffic,
        vehicles: Object.freeze(runClass.traffic.vehicles.map((v) => v ?? vehicleId)),
      }),
  });
}

/**
 * Admit a class against its compiled course and the vehicle catalog: the laps fit the course's lap maximum, every
 * entry's slot is in the grid its field starts from (`courseStartGrid`), a field that is not all bikes has no bike
 * candidate on a course with a bike grid (whose reference run starts from that grid), every ahead entry's lane exists
 * in every Section of the course, and each rank limit names a race gate of the course with N below the field size. The
 * build admits every class; a run admits the class it drives.
 */
export function admitSeriesClass(
  settings: CourseClass,
  course: CompiledCourse,
  vehicles: readonly CompiledVehicleDefinition[],
  document: string,
): AdmissionResult<CourseClass> {
  const index = settings.series.classes.findIndex((c) => c.id === settings.id);
  const bike = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)!.listing.form === 'bike';
  const bikesOnly = settings.entries.every((entry) => bike(entry.vehicle));
  const grid = courseStartGrid(course.gates, bikesOnly);
  return admit(document, () => {
    requireAdmission(
      settings.laps <= course.rules.maxLaps,
      'invalid_value',
      `/classes/${index}/laps`,
      `Series laps exceed the lap maximum of ${course.id}`,
    );
    settings.entries.forEach((entry, i) =>
      requireAdmission(
        entry.slot === null || entry.slot < grid.length,
        'invalid_value',
        `/classes/${index}/entries/${i}/slot`,
        `The grid of ${course.id} has no slot ${entry.slot}`,
      ),
    );
    // A CHASE rival passes the player in the grid slot beside the player's.
    requireAdmission(
      settings.chase === null || grid.length >= 2,
      'invalid_value',
      `/classes/${index}/chase`,
      `The grid of ${course.id} has no slot beside the player's for a CHASE rival to pass in`,
    );
    // A bike's reference run, alone, starts from the bike grid; its class's field must start there too.
    settings.vehicles.forEach((vehicle, i) =>
      requireAdmission(
        bikesOnly || course.gates.bikeGrid === null || !bike(vehicle),
        'invalid_value',
        `/classes/${index}/vehicles/${i}`,
        `${vehicle} starts from the bike grid of ${course.id}, where only a field of bikes starts`,
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
        `/classes/${index}/entries/${i}/stages/last`,
        `Every run of ${course.id} has ${stageCount} stages`,
      ),
    );
    // A lane number is valid on every route when every Section of the course has that lane.
    const lanes = Math.min(
      ...course.sections.map((section) => section.lanes.elements.filter((element) => element.kind === 'lane').length),
    );
    settings.entries.forEach((entry, i) => {
      if (!entry.ahead) return;
      requireAdmission(
        entry.ahead.lane < lanes,
        'invalid_value',
        `/classes/${index}/entries/${i}/ahead/lane`,
        `Some Section of ${course.id} has only ${lanes} lanes`,
      );
      const room = aheadRoom(course, settings.laps, entry.stages!.first);
      requireAdmission(
        entry.ahead.distance < room,
        'invalid_value',
        `/classes/${index}/entries/${i}/ahead/distance`,
        `STAGE ${entry.stages!.first} of ${course.id} leaves ${room.toFixed(2)} m before its next gate or fork lock`,
      );
    });
    for (const [gate, limit] of Object.entries(settings.rankLimits)) {
      const at = `/classes/${index}/rankLimits/${gate.replaceAll('~', '~0').replaceAll('/', '~1')}`;
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

/** Admit the delivered series against the delivered courses, the given vehicle catalog, screen pictures and tracks. */
export async function loadSeriesCatalog(
  content: ContentDelivery,
  vehicles: readonly CompiledVehicleDefinition[],
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): Promise<SeriesCatalog> {
  const sources = await content.documents('series');
  const courseIds = content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
  return requireLoaded(compileSeriesCatalog(sources, courseIds, vehicles, pictures, music));
}

/** A delivered class on its delivered course (`classOnCourse`), admitted against it. */
export function loadSeriesClass(
  content: ContentDelivery,
  settings: CourseClass,
  course: CompiledCourse,
  vehicles: readonly CompiledVehicleDefinition[],
): CourseClass {
  const document = content.manifest.files.find((file) => file.kind === 'series' && file.id === settings.series.id)!;
  return requireLoaded(admitSeriesClass(settings, course, vehicles, document.path));
}
