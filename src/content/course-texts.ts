import { readDocument, readIdentified, readRecord, readString, requireAdmission } from '../core/admission.js';
import { COURSE_DOCUMENT_LIMITS, COURSE_TEXT_LIMITS } from '../course/course-limits.js';
import { TEXT_CHARACTERS } from '../image/text-tiles.js';

/** A course's official display name and English description, kept outside its course document. */
export interface CourseText {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const COURSE_TEXTS_FORMAT = Object.freeze({ format: 'superoutride.course-texts', version: 1 } as const);
/** The course texts' path under `content/`. */
export const COURSE_TEXTS_PATH = 'course-texts.json';

/** Text the text tiles draw, without surrounding whitespace, at most `maxLength` code units. */
export const courseTextString = (value: unknown, path: string, maxLength: number) =>
  readString(value, path, {
    maxLength,
    pattern: TEXT_CHARACTERS,
    patternMessage: "Expected the text tiles' characters",
  });

/** Admit the course texts: one entry for each course id, raised or not, with its name and description. */
export function readCourseTexts(input: unknown): readonly CourseText[] {
  const data = readDocument(
    input,
    ['format', 'version', 'courses'],
    COURSE_TEXTS_FORMAT.format,
    COURSE_TEXTS_FORMAT.version,
  );
  return Object.freeze(
    readIdentified(
      data.courses,
      '/courses',
      (value, at) => {
        const entry = readRecord(value, at, ['id', 'name', 'description']);
        return Object.freeze({
          id: readString(entry.id, `${at}/id`, { maxLength: COURSE_DOCUMENT_LIMITS.idCodeUnits }),
          name: courseTextString(entry.name, `${at}/name`, COURSE_TEXT_LIMITS.nameCodeUnits),
          description: courseTextString(
            entry.description,
            `${at}/description`,
            COURSE_TEXT_LIMITS.descriptionCodeUnits,
          ),
        });
      },
      { max: COURSE_TEXT_LIMITS.entries },
    ),
  );
}

/** A product course (`<original id>-product`) takes its original course's entry. */
export const courseTextId = (courseId: string) => courseId.replace(/-product$/, '');

/**
 * Each course's text, by course id, and how many entries name no course yet raised: every course has exactly one entry,
 * its own or, for a product course, its original's; a course without one is an `invalid_value` naming it.
 */
export function courseTextsOf(texts: readonly CourseText[], courseIds: readonly string[]) {
  const byId = new Map(texts.map((text) => [text.id, text]));
  const byCourse: ReadonlyMap<string, CourseText> = new Map(
    courseIds.map((id) => {
      const text = byId.get(courseTextId(id));
      requireAdmission(text !== undefined, 'invalid_value', '/courses', `Course ${id} has no entry`);
      return [id, text];
    }),
  );
  const named = new Set([...byCourse.values()].map((text) => text.id));
  return Object.freeze({ byCourse, unraised: texts.filter((text) => !named.has(text.id)).length });
}
