import { invertPlanarTransform } from '../core/planar-transform.js';
import { CourseInputError, courseFailure, courseSuccess } from '../course/course-diagnostics.js';
import type { CompiledLink, CompiledSection } from '../compiler/course-graph.js';

/** Traversal identity, not a source copy, coordinate basis or awarded lap. */
export interface CourseOccurrence {
  readonly ordinal: number;
  readonly section: CompiledSection;
  readonly incoming: CompiledLink | null;
}

export interface CourseOccurrenceHistory {
  readonly occurrences: readonly CourseOccurrence[];
  readonly active: CourseOccurrence;
}

/**
 * Geometry exploration only. This records explicitly followed Links, not physical seam commits.
 * Retention is an admitted reverse distance from the most recently entered port, not a lap count.
 */
export function createCourseGeometryTraversal(entry: CompiledSection, retainBehind: number) {
  if (typeof retainBehind !== 'number') throw new TypeError('History extent must be numeric');
  if (!Number.isFinite(retainBehind) || retainBehind < 0)
    throw new RangeError('History extent must be finite and >= 0');
  let occurrences: readonly CourseOccurrence[] = Object.freeze([
    Object.freeze({ ordinal: 0, section: entry, incoming: null }),
  ]);
  let activeIndex = 0;
  const snapshot = (): CourseOccurrenceHistory => Object.freeze({ occurrences, active: occurrences[activeIndex]! });
  const failure = (message: string) =>
    courseFailure<never>(new CourseInputError('semantic_compile_failure', '/history', message));
  return Object.freeze({
    snapshot,
    forward(link: CompiledLink) {
      const from = occurrences[activeIndex]!;
      if (!from.section.outgoing.includes(link))
        return failure('Forward Link must be a canonical outgoing reference of the active occurrence');
      const next = occurrences[activeIndex + 1];
      if (next && next.incoming !== link) return failure('A visited successor cannot be replaced by a different Link');
      const to =
        next ?? Object.freeze({ ordinal: from.ordinal + 1, section: link.destination.section, incoming: link });
      if (!Number.isSafeInteger(to.ordinal)) return failure('Occurrence identity exceeds the safe integer domain');
      let retained = next ? occurrences : [...occurrences, to];
      let index = activeIndex + 1;
      // Measure backwards on the visited ruler. No incoming-Link search at a merge.
      let distance = 0,
        first = index;
      while (first > 0 && distance < retainBehind) {
        const incoming = retained[first]!.incoming!;
        first -= 1;
        const previousEntry = retained[first]!.incoming?.destination.anchor.s ?? 0;
        distance += incoming.source.anchor.s - previousEntry;
      }
      retained = Object.freeze(retained.slice(first));
      index -= first;
      occurrences = retained;
      activeIndex = index;
      return courseSuccess(Object.freeze({ from, to, destinationFromSource: link.destinationFromSource }));
    },
    reverse() {
      if (activeIndex === 0) return failure('Reverse exceeds retained actual-predecessor history');
      const from = occurrences[activeIndex]!,
        to = occurrences[activeIndex - 1]!;
      const destinationFromSource = invertPlanarTransform(from.incoming!.destinationFromSource);
      activeIndex -= 1;
      return courseSuccess(Object.freeze({ from, to, destinationFromSource }));
    },
  });
}
