import { readCourseDocumentBytes, type SpriteDocument } from '../../src/course/course-document.js';
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
 * with how many name it (as their picture or a movable body's `knocked` one), each image's collision widths, and its
 * bake entries (`findBakeEntries`).
 */
export interface CourseReading {
  readonly reason: string | null;
  readonly uses: readonly (readonly [string, number])[];
  readonly widths: readonly (readonly [string, readonly number[]])[];
  readonly entries: readonly BakeEntry[];
}

/** Read and check a product course once, off the page's thread, for what the sprite editor shows of it. */
export function readCourseForEditor(request: CourseReadingRequest): CourseReading {
  const read = readCourseDocumentBytes(request.bytes, request.course);
  if (!read.ok)
    return {
      reason: `${request.course} does not read: ${read.diagnostics[0]?.message ?? ''}`,
      uses: [],
      widths: [],
      entries: [],
    };
  const uses = new Map<string, number>(),
    widths = new Map<string, Set<number>>();
  const visit = (elements: readonly unknown[]) => {
    for (const element of elements) {
      if ((element as { kind: string }).kind === 'repeat') {
        visit((element as { elements: readonly unknown[] }).elements);
        continue;
      }
      const sprite = element as SpriteDocument;
      const named = new Set([sprite.image]);
      if (sprite.body?.movable) named.add(sprite.body.movable.knocked.airborne).add(sprite.body.movable.knocked.landed);
      for (const name of named) uses.set(name, (uses.get(name) ?? 0) + 1);
      if (sprite.body) widths.set(sprite.image, (widths.get(sprite.image) ?? new Set()).add(sprite.body.width));
    }
  };
  for (const section of read.value.sections) visit(section.sprites);
  return {
    reason: null,
    uses: [...uses],
    widths: [...widths].map(([name, set]) => [name, [...set]] as const),
    entries: findBakeEntries(JSON.parse(new TextDecoder().decode(request.bytes)) as Json),
  };
}
