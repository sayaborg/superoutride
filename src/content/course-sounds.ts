import { readArray, readDocument, readString, requireAdmission } from '../core/admission.js';
import { COURSE_DOCUMENT_LIMITS } from '../course/course-limits.js';
import { courseTextId } from './course-texts.js';

/**
 * A course's sounds, kept outside its course document: the courses it serves (an original's courses share one) and the
 * race tracks they play, in order. The jingles are the game's effects until their fields are made.
 */
export interface CourseSounds {
  readonly courses: readonly string[];
  readonly race: readonly string[];
}

export const COURSE_SOUNDS_FORMAT = Object.freeze({ format: 'superoutride.course-sounds', version: 1 } as const);
/** The course sounds' directory under `content/`. */
export const COURSE_SOUNDS_DIRECTORY = 'course-sounds';
/** The most race tracks a course plays. */
const MAX_RACE_TRACKS = 16;

const unique = (values: readonly string[], path: string, kind: string) =>
  values.forEach((value, index) =>
    requireAdmission(values.indexOf(value) === index, 'duplicate_id', `${path}/${index}`, `Duplicate ${kind} ${value}`),
  );

/** Admit one course sounds document: unique course ids, and at least one unique race track among `tracks`. */
export function readCourseSounds(input: unknown, tracks: readonly string[]): CourseSounds {
  const data = readDocument(
    input,
    ['format', 'version', 'courses', 'race'],
    COURSE_SOUNDS_FORMAT.format,
    COURSE_SOUNDS_FORMAT.version,
  );
  const courses = readArray(
    data.courses,
    '/courses',
    (value, at) => readString(value, at, { maxLength: COURSE_DOCUMENT_LIMITS.idCodeUnits }),
    { min: 1 },
  );
  unique(courses, '/courses', 'course');
  const race = readArray(
    data.race,
    '/race',
    (value, at) => {
      const id = readString(value, at);
      requireAdmission(tracks.includes(id), 'unresolved_reference', at, `Unknown track ${id}`);
      return id;
    },
    { min: 1, max: MAX_RACE_TRACKS },
  );
  unique(race, '/race', 'track');
  return Object.freeze({ courses: Object.freeze(courses), race: Object.freeze(race) });
}

/**
 * Each course's race tracks, by course id: a course plays the tracks of the one document naming it (a product course
 * its original's), else none. A course two documents name is a `duplicate_id`; a document may name a course not yet
 * raised.
 */
export function courseRaceTracks(
  documents: readonly CourseSounds[],
  courseIds: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const byCourse = new Map<string, readonly string[]>();
  for (const document of documents)
    for (const course of document.courses) {
      requireAdmission(!byCourse.has(course), 'duplicate_id', '/courses', `Course ${course} has two sounds documents`);
      byCourse.set(course, document.race);
    }
  return new Map(courseIds.map((id) => [id, byCourse.get(courseTextId(id)) ?? Object.freeze([])]));
}
