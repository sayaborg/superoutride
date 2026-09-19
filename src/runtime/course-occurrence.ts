import { invertPlanarTransform } from '../core/planar-transform.js';
import type { CompiledLink, CompiledSection } from '../compiler/course-graph.js';

/** One traversal instance, which may be selected before it is visited. Never a source copy. */
export interface CourseOccurrence {
  readonly ordinal: number;
  readonly section: CompiledSection;
  readonly incoming: CompiledLink | null;
}

export interface CourseOccurrenceHistory {
  /** Actual visited instances, including an already visited successor when reversing. */
  readonly occurrences: readonly CourseOccurrence[];
  readonly active: CourseOccurrence;
  /** Explicitly chosen but unvisited instances after the retained visited frontier. */
  readonly selected: readonly CourseOccurrence[];
}

interface TraversalLimits {
  readonly retainBehind: number;
  /** Selected distance beyond the active exit; retain whole intersecting instances. */
  readonly selectAhead: number;
  readonly maxOccurrences: number;
}
type TraversalFailureReason =
  | 'selection_required'
  | 'selection_locked'
  | 'history_exhausted'
  | 'selection_limit'
  | 'occurrence_limit'
  | 'identity_exhausted';
const failure = (reason: TraversalFailureReason, message: string) =>
  Object.freeze({ ok: false as const, reason, message });
const success = <T>(value: T) => Object.freeze({ ok: true as const, value });

/** Explicit geometry exploration; selection/advance are not gameplay locking or physical seam commits. */
export function createCourseGeometryTraversal(entry: CompiledSection, limits: TraversalLimits) {
  if (
    !entry ||
    !Array.isArray(entry.outgoing) ||
    !limits ||
    ['retainBehind', 'selectAhead', 'maxOccurrences'].some(
      (key) => typeof limits[key as keyof TraversalLimits] !== 'number',
    )
  )
    throw new TypeError('Traversal requires a compiled entry and explicit numeric retention limits');
  const { retainBehind, selectAhead, maxOccurrences } = limits;
  if (
    ![retainBehind, selectAhead].every((value) => Number.isFinite(value) && value >= 0) ||
    !Number.isSafeInteger(maxOccurrences) ||
    maxOccurrences < 2
  )
    throw new RangeError('Traversal needs finite nonnegative distances and at least two occurrence slots');
  let occurrences: readonly CourseOccurrence[] = Object.freeze([
    Object.freeze({ ordinal: 0, section: entry, incoming: null }),
  ]);
  let selected: readonly CourseOccurrence[] = Object.freeze([]);
  let activeIndex = 0;
  const snapshot = (): CourseOccurrenceHistory =>
    Object.freeze({ occurrences, active: occurrences[activeIndex]!, selected });
  return Object.freeze({
    snapshot,
    select(from: CourseOccurrence, link: CompiledLink) {
      const itinerary = [...occurrences, ...selected],
        index = itinerary.indexOf(from);
      if (!from || !link || !link.source || !link.destination)
        throw new TypeError('Selection requires an occurrence and compiled Link');
      if (index < activeIndex || !from.section.outgoing.includes(link))
        throw new RangeError('Selection requires a retained forward occurrence and its canonical outgoing Link');
      const next = itinerary[index + 1];
      if (next)
        return next.incoming === link
          ? success(next)
          : failure('selection_locked', 'An already selected or visited successor cannot be replaced');
      if (itinerary.length >= maxOccurrences)
        return failure('occurrence_limit', 'Selection exceeds the admitted occurrence count');
      let distance = 0;
      for (let i = activeIndex + 1; i <= index; i += 1) {
        const outgoing = i === index ? link : itinerary[i + 1]!.incoming!;
        distance += outgoing.source.anchor.s - itinerary[i]!.incoming!.destination.anchor.s;
      }
      if (!Number.isFinite(distance) || distance > selectAhead)
        return failure('selection_limit', 'Selection exceeds the admitted forward distance');
      const ordinal = from.ordinal + 1;
      if (!Number.isSafeInteger(ordinal))
        return failure('identity_exhausted', 'Occurrence ordinal is not representable');
      const to = Object.freeze({ ordinal, section: link.destination.section, incoming: link });
      selected = Object.freeze([...selected, to]);
      return success(to);
    },
    forward() {
      const from = occurrences[activeIndex]!,
        visited = occurrences[activeIndex + 1],
        to = visited ?? selected[0];
      if (!to) return failure('selection_required', 'Choose a successor before advancing the frame');
      let retained = visited ? occurrences : [...occurrences, to];
      let index = activeIndex + 1;
      // Only actual traversal is retained as history. Merges never search another incoming Link.
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
      if (!visited) selected = Object.freeze(selected.slice(1));
      activeIndex = index;
      return success(Object.freeze({ from, to, destinationFromSource: to.incoming!.destinationFromSource }));
    },
    reverse() {
      if (activeIndex === 0) return failure('history_exhausted', 'Reverse exceeds retained actual-predecessor history');
      const from = occurrences[activeIndex]!,
        to = occurrences[activeIndex - 1]!;
      const destinationFromSource = invertPlanarTransform(from.incoming!.destinationFromSource);
      activeIndex -= 1;
      return success(Object.freeze({ from, to, destinationFromSource }));
    },
  });
}
