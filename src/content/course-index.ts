import {
  admit,
  readArray,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { RUN_RULE_LIMITS } from '../course/run-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { createCourseMap, type CourseMap, type MapPoint } from '../course/course-map.js';
import { courseGridCapacity } from '../course/compiler/course-rules.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { ContentManifest } from './content-manifest.js';
import type { ContentDelivery } from './content-delivery.js';
import { admitProduct } from './delivered-product.js';
import { COURSE_TEXT_LIMITS } from '../course/course-limits.js';
import { courseTextString, type CourseText } from './course-texts.js';

/** What a menu shows of a delivered course before loading it. */
export interface CourseIndexEntry {
  readonly id: string;
  /** Its course texts' display name and English description (content-and-gameplay.md, Course texts). */
  readonly name: string;
  readonly description: string;
  readonly type: CompiledCourse['type'];
  readonly maxLaps: number;
  /** How many competitors, the player included, every run of the course can start (`courseGridCapacity`). */
  readonly gridSlots: number;
  /** The compiled course's build identity, which records are kept against. */
  readonly buildSha256: string;
  /** The music tracks its course sounds give its races, in order; none when no document names it. */
  readonly raceTracks: readonly string[];
  /** Its map, as the course's compilation draws it, for the cards and the PRE-RACE card before it loads. */
  readonly map: CourseMap;
}
export type CourseIndex = readonly CourseIndexEntry[];

export const COURSE_INDEX_FORMAT = Object.freeze({ format: 'superoutride.course-index', version: 8 } as const);
/** The course index's manifest ID. */
export const COURSE_INDEX_ID = 'courses';
const COURSE_TYPES: readonly CompiledCourse['type'][] = ['CIRCUIT', 'LINEAR', 'BRANCH'];
/**
 * A delivered map's precision: its centreline is cut to the fewest of its samples that keep it within `share` of its
 * extent (the larger of its spans east and north) of them all; its points are written in whole metres, its length to a
 * tenth of a metre and its start direction to `directionDecimals` places. It holds at most `checkpoints` checkpoint
 * gates, so that the cards write a course's stages in their facts' 10 columns (`999 STAGES`).
 */
export const COURSE_INDEX_MAP = Object.freeze({ share: 1 / 1000, directionDecimals: 4, checkpoints: 998 });

const fixed = (value: number, decimals: number) => Number(value.toFixed(decimals));
const pair = (point: MapPoint) => [Math.round(point.east), Math.round(point.north)];

/**
 * The fewest of `points` whose line passes within `tolerance` of every one (Douglas–Peucker): the first and the last,
 * and between two kept points the one farthest from the segment joining them, while it lies farther than `tolerance`.
 */
function simplified(points: readonly MapPoint[], tolerance: number): MapPoint[] {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const spans: [number, number][] = [[0, points.length - 1]];
  for (let span = spans.pop(); span; span = spans.pop()) {
    const [first, last] = span,
      a = points[first]!,
      b = points[last]!;
    const east = b.east - a.east,
      north = b.north - a.north,
      squared = east * east + north * north;
    let farthest = -1,
      reach = tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!,
        t =
          squared > 0
            ? Math.min(1, Math.max(0, ((p.east - a.east) * east + (p.north - a.north) * north) / squared))
            : 0,
        distance = Math.hypot(p.east - a.east - t * east, p.north - a.north - t * north);
      if (distance > reach) [farthest, reach] = [i, distance];
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    spans.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** A course's map as the index delivers it ([course index](../../docs/content-and-gameplay.md#course-index)). */
function courseMapDocument(map: CourseMap) {
  const direction = map.start.direction;
  let [west, east, south, north] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const point of map.centreline) {
    [west, east] = [Math.min(west, point.east), Math.max(east, point.east)];
    [south, north] = [Math.min(south, point.north), Math.max(north, point.north)];
  }
  const extent = Math.max(east - west, north - south);
  return {
    centreline: simplified(map.centreline, extent * COURSE_INDEX_MAP.share).map(pair),
    start: {
      point: pair(map.start.point),
      direction: [direction.east, direction.north].map((value) => fixed(value, COURSE_INDEX_MAP.directionDecimals)),
    },
    checkpoints: map.checkpoints.map(pair),
    lengthMeters: fixed(map.lengthMeters, 1),
  };
}

/**
 * Admit a delivered map: points of two finite numbers, at least two on its centreline, at most
 * `COURSE_INDEX_MAP.checkpoints` checkpoints, a unit start direction and a positive length.
 */
function readCourseMap(value: unknown, at: string): CourseMap {
  const point = (item: unknown, path: string): MapPoint => {
    const [east, north] = readArray(item, path, (n, p) => readNumber(n, p), { length: 2 });
    return Object.freeze({ east: east!, north: north! });
  };
  const map = readRecord(value, at, ['centreline', 'start', 'checkpoints', 'lengthMeters']);
  const start = readRecord(map.start, `${at}/start`, ['point', 'direction']);
  const direction = point(start.direction, `${at}/start/direction`);
  requireAdmission(
    Math.abs(Math.hypot(direction.east, direction.north) - 1) <= 10 ** -COURSE_INDEX_MAP.directionDecimals,
    'invalid_value',
    `${at}/start/direction`,
    'The start direction must be a unit vector',
  );
  return Object.freeze({
    centreline: readArray(map.centreline, `${at}/centreline`, point, { min: 2 }),
    start: Object.freeze({ point: point(start.point, `${at}/start/point`), direction }),
    checkpoints: readArray(map.checkpoints, `${at}/checkpoints`, point, { max: COURSE_INDEX_MAP.checkpoints }),
    lengthMeters: readNumber(map.lengthMeters, `${at}/lengthMeters`, { min: 0, exclusiveMin: true }),
  });
}

/**
 * The delivered index of the compiled courses, in the order given (the course texts': K, 2026-11-11), each with its
 * course text, race tracks and map.
 */
export function courseIndexDocument(
  courses: readonly CompiledCourse[],
  texts: ReadonlyMap<string, CourseText>,
  raceTracks: ReadonlyMap<string, readonly string[]>,
) {
  return {
    ...COURSE_INDEX_FORMAT,
    courses: courses.map((course) => ({
      id: course.id,
      name: texts.get(course.id)!.name,
      description: texts.get(course.id)!.description,
      type: course.type,
      maxLaps: course.rules.maxLaps,
      gridSlots: courseGridCapacity(course.gates),
      buildSha256: course.identity.buildSha256,
      raceTracks: raceTracks.get(course.id)!,
      map: courseMapDocument(createCourseMap(course)),
    })),
  };
}

/** Admit the course index: it lists every delivered course exactly once and nothing else. */
export function readCourseIndex(
  manifest: ContentManifest,
  input: unknown,
  document = '',
): AdmissionResult<CourseIndex> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'courses'],
      COURSE_INDEX_FORMAT.format,
      COURSE_INDEX_FORMAT.version,
    );
    const delivered = manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
    const courses = readIdentified(data.courses, '/courses', (value, at) => {
      const entry = readRecord(value, at, [
        'id',
        'name',
        'description',
        'type',
        'maxLaps',
        'gridSlots',
        'buildSha256',
        'raceTracks',
        'map',
      ]);
      const id = readString(entry.id, `${at}/id`);
      requireAdmission(delivered.includes(id), 'invalid_value', `${at}/id`, `Course ${id} is not delivered`);
      const type = readEnum(entry.type, COURSE_TYPES, `${at}/type`);
      const maxLaps = readNumber(entry.maxLaps, `${at}/maxLaps`, {
        min: 1,
        max: RUN_RULE_LIMITS.laps,
        integer: true,
      });
      requireAdmission(
        type === 'CIRCUIT' || maxLaps === 1,
        'invalid_value',
        `${at}/maxLaps`,
        'Only CIRCUIT has repeated laps',
      );
      const name = courseTextString(entry.name, `${at}/name`, COURSE_TEXT_LIMITS.nameCodeUnits);
      const description = courseTextString(
        entry.description,
        `${at}/description`,
        COURSE_TEXT_LIMITS.descriptionCodeUnits,
      );
      const gridSlots = readNumber(entry.gridSlots, `${at}/gridSlots`, {
        min: 1,
        max: RUN_RULE_LIMITS.competitors,
        integer: true,
      });
      const buildSha256 = readString(entry.buildSha256, `${at}/buildSha256`, SHA256_TEXT);
      const raceTracks = Object.freeze(
        readArray(entry.raceTracks, `${at}/raceTracks`, (track, t) => readString(track, t)),
      );
      const map = readCourseMap(entry.map, `${at}/map`);
      return Object.freeze({ id, name, description, type, maxLaps, gridSlots, buildSha256, raceTracks, map });
    });
    requireAdmission(
      courses.length === delivered.length,
      'invalid_value',
      '/courses',
      'Every delivered course must be indexed',
    );
    return courses;
  });
}

/** Transport verifies the saved bytes before admission; each composition loads the index once. */
export function loadCourseIndex(content: ContentDelivery): Promise<CourseIndex> {
  return admitProduct(content, 'course-index', COURSE_INDEX_ID, async (value, document) =>
    readCourseIndex(content.manifest, value, document),
  );
}
