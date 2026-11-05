import { parseCourseDocumentBytes, readCourseDocument, type SpriteDocument } from '../../src/course/course-document.js';
import { findBakeEntries, type BakeEntry } from '../authoring/course-bake.js';
import type { Json } from '../authoring/json-pointer.js';

/** A product course's document to read off the page's thread (`readCourseForEditor`). */
export interface CourseReadingRequest {
  readonly id: number;
  readonly kind: 'course';
  readonly course: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/**
 * What the sprite editor reads of a product course: whether it reads (else `reason`), each image its placements name
 * with how many name it (as their picture or a movable body's `knocked` one), each image's collision widths (of bodies
 * of one part on the placement's lateral), the images some placement of which has a body of several parts, which the
 * editor leaves as they are (`parted`), and its bake entries (`findBakeEntries`).
 */
export interface CourseReading {
  readonly reason: string | null;
  readonly uses: readonly (readonly [string, number])[];
  readonly widths: readonly (readonly [string, readonly number[]])[];
  readonly parted: readonly string[];
  readonly entries: readonly BakeEntry[];
}

/** Read and check a product course once, off the page's thread, for what the sprite editor shows of it. */
export function readCourseForEditor(request: CourseReadingRequest): CourseReading {
  // Parsed once: read as a course document, and searched for bake entries as it is.
  const unread = (diagnostics: readonly { readonly message: string }[]): CourseReading => ({
    reason: `${request.course} does not read: ${diagnostics[0]?.message ?? ''}`,
    uses: [],
    widths: [],
    parted: [],
    entries: [],
  });
  const parsed = parseCourseDocumentBytes(request.bytes, request.course);
  if (!parsed.ok) return unread(parsed.diagnostics);
  const read = readCourseDocument(parsed.value, request.course);
  if (!read.ok) return unread(read.diagnostics);
  const uses = new Map<string, number>(),
    widths = new Map<string, Set<number>>(),
    parted = new Set<string>();
  const visit = (elements: readonly unknown[]) => {
    for (const element of elements) {
      if ((element as { kind: string }).kind === 'repeat') {
        visit((element as { elements: readonly unknown[] }).elements);
        continue;
      }
      const sprite = element as SpriteDocument;
      const named = new Set([sprite.image]);
      const movable = sprite.body?.[0]!.movable;
      if (movable) named.add(movable.knocked.airborne).add(movable.knocked.landed);
      for (const name of named) uses.set(name, (uses.get(name) ?? 0) + 1);
      const one = sprite.body?.length === 1 && sprite.body[0]!.across === 0 ? sprite.body[0]! : null;
      if (one) widths.set(sprite.image, (widths.get(sprite.image) ?? new Set()).add(one.width));
      else if (sprite.body) parted.add(sprite.image);
    }
  };
  for (const section of read.value.sections) visit(section.sprites);
  return {
    reason: null,
    uses: [...uses],
    widths: [...widths].map(([name, set]) => [name, [...set]] as const),
    parted: [...parted],
    entries: findBakeEntries(parsed.value as Json),
  };
}
