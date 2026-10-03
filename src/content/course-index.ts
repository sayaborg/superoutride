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
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { TEXT_CHARACTERS } from '../image/text-tiles.js';
import type { ContentDelivery, ContentManifest } from './content-manifest.js';
import { admitProduct } from './delivered-product.js';

/** What a menu shows of a delivered course before loading it. */
export interface CourseIndexEntry {
  readonly id: string;
  readonly name: string;
  readonly type: CompiledCourse['type'];
  readonly maxLaps: number;
  /** The grid's slots: how many competitors, the player included, can start from it. */
  readonly gridSlots: number;
}
export type CourseIndex = readonly CourseIndexEntry[];

export const COURSE_INDEX_FORMAT = Object.freeze({ format: 'superoutride.course-index', version: 2 } as const);
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
      gridSlots: course.gates.grid.length,
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
      const entry = readRecord(value, at, ['id', 'name', 'type', 'maxLaps', 'gridSlots']);
      const id = readString(entry.id, `${at}/id`);
      requireAdmission(delivered.includes(id), 'invalid_value', `${at}/id`, `Course ${id} is not delivered`);
      const type = readEnum(entry.type, COURSE_TYPES, `${at}/type`);
      const maxLaps = readNumber(entry.maxLaps, `${at}/maxLaps`, {
        min: 1,
        max: SESSION_RULE_LIMITS.laps,
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
        max: COURSE_DOCUMENT_LIMITS.startGridSlots,
        integer: true,
      });
      return Object.freeze({ id, name, type, maxLaps, gridSlots });
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
