import {
  admit,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { COURSE_DOCUMENT_LIMITS } from '../course/course-limits.js';
import { RUN_RULE_LIMITS } from '../course/run-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { courseGridCapacity } from '../course/compiler/course-rules.js';
import { TEXT_CHARACTERS } from '../image/text-tiles.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { ContentManifest } from './content-manifest.js';
import type { ContentDelivery } from './content-delivery.js';
import { admitProduct } from './delivered-product.js';

/** What a menu shows of a delivered course before loading it. */
export interface CourseIndexEntry {
  readonly id: string;
  readonly name: string;
  readonly type: CompiledCourse['type'];
  readonly maxLaps: number;
  /** How many competitors, the player included, every run of the course can start (`courseGridCapacity`). */
  readonly gridSlots: number;
  /** The compiled course's build identity, which records are kept against. */
  readonly buildSha256: string;
}
export type CourseIndex = readonly CourseIndexEntry[];

export const COURSE_INDEX_FORMAT = Object.freeze({ format: 'superoutride.course-index', version: 3 } as const);
/** The course index's manifest ID. */
export const COURSE_INDEX_ID = 'courses';
const COURSE_TYPES: readonly CompiledCourse['type'][] = ['CIRCUIT', 'LINEAR', 'BRANCH'];

/** The delivered index of the compiled courses, in build order. */
export function courseIndexDocument(courses: readonly CompiledCourse[]) {
  return {
    ...COURSE_INDEX_FORMAT,
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      type: course.type,
      maxLaps: course.rules.maxLaps,
      gridSlots: courseGridCapacity(course.gates),
      buildSha256: course.identity.buildSha256,
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
      const entry = readRecord(value, at, ['id', 'name', 'type', 'maxLaps', 'gridSlots', 'buildSha256']);
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
      const name = readString(entry.name, `${at}/name`, {
        maxLength: COURSE_DOCUMENT_LIMITS.nameCodeUnits,
        pattern: TEXT_CHARACTERS,
        patternMessage: 'Expected printable ASCII text',
      });
      const gridSlots = readNumber(entry.gridSlots, `${at}/gridSlots`, {
        min: 1,
        max: RUN_RULE_LIMITS.competitors,
        integer: true,
      });
      const buildSha256 = readString(entry.buildSha256, `${at}/buildSha256`, SHA256_TEXT);
      return Object.freeze({ id, name, type, maxLaps, gridSlots, buildSha256 });
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
