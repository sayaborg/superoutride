/**
 * How the originals' course documents are written ([Original road data](../../../docs/original-road-data.md#9-sections-gates-limits-of-admission)):
 * by the course format's types, every original's alike.
 */
import {
  COURSE_DOCUMENT_VERSION,
  type CourseDocument,
  type LinkDocument,
  type SectionDocument,
} from '../../../src/course/course-document.js';
import { BEARING } from './shared-constants.js';

/** The Link from Section `from`, leaving by its lane `lane`, into Section `to`: its id the two Sections' ids joined. */
export const link = (from: string, lane: string, to: string): LinkDocument => ({
  id: `${from}-${to}`,
  from: { section: from, lane },
  to,
});

/** The Links joining `sections` in order, each leaving by lane `lane`; with `loop`, the last into the first too. */
export const chainLinks = (sections: readonly { readonly id: string }[], lane: string, loop = false) =>
  (loop ? sections : sections.slice(0, -1)).map((section, i) =>
    link(section.id, lane, sections[(i + 1) % sections.length]!.id),
  );

/**
 * The course document named `name` of `sections`, entered at the first, joined by `links`, run at most `maxLaps`
 * times (a non-circuit once, the course format's rule), bearing `BEARING` at its entry.
 */
export const courseDocument = (
  name: string,
  sections: readonly SectionDocument[],
  links: readonly LinkDocument[],
  maxLaps = 1,
): CourseDocument => ({
  format: 'superoutride.course',
  version: COURSE_DOCUMENT_VERSION,
  name,
  entry: sections[0]!.id,
  maxLaps,
  bearing: BEARING,
  sections,
  links,
});
