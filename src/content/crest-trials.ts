/**
 * The crests rule's trials ([Original road data](../../docs/original-road-data.md#crests)): until K chooses the rule's
 * speed, an original's course's Section profiles as the conversion writes them with the rule at each speed K may
 * choose, delivered beside the course (`crest-trial`); DEV's CREST SPEED lays one over the course as it loads, the
 * document's identity unchanged.
 */
import { admit, readRecord } from '../core/admission.js';
import { readCourseDocument, type CourseDocument } from '../course/course-document.js';

/** The speeds K drives the rule at, km/h. */
export const CREST_TRIAL_KMH = Object.freeze([170, 200, 230, 260] as const);

/** A course document as parsed: its Sections by id, each with its profile among its fields. */
interface CourseSource {
  readonly sections: readonly { readonly id: string }[];
}

/**
 * Course document `course` with each Section's profile the trials' at `kmh`: `trials` (parsed) a record of the trial
 * speeds, each one of the course's Section ids.
 */
export function withCrestTrial<C extends CourseSource>(course: C, trials: unknown, kmh: number): C {
  const speeds = readRecord(trials, '', CREST_TRIAL_KMH.map(String));
  const profiles = readRecord(
    speeds[String(kmh)],
    `/${kmh}`,
    course.sections.map((section) => section.id),
  );
  return { ...course, sections: course.sections.map((section) => ({ ...section, profile: profiles[section.id] })) };
}

/**
 * Admit course `course`'s trials (parsed): a record of the trial speeds, each of the course's Section ids, each a
 * profile the course document admits in that Section.
 */
export function readCrestTrials(trials: unknown, course: CourseDocument, path: string) {
  for (const kmh of CREST_TRIAL_KMH) {
    const swapped = admit(path, () => withCrestTrial(course, trials, kmh));
    if (!swapped.ok) return swapped;
    const read = readCourseDocument(swapped.value, path);
    if (!read.ok) return read;
  }
  return admit(path, () => trials);
}
