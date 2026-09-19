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
  | 'identity_exhausted'
  | 'stale_transition';
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
  const initial = Object.freeze({ ordinal: 0, section: entry, incoming: null });
  let history: CourseOccurrenceHistory = Object.freeze({
    occurrences: Object.freeze([initial]),
    active: initial,
    selected: Object.freeze([]),
  });
  const snapshot = () => history;
  const selectFrom = (before: CourseOccurrenceHistory, from: CourseOccurrence, link: CompiledLink) => {
    const { occurrences, selected, active } = before;
    const activeIndex = occurrences.indexOf(active);
    const itinerary = [...occurrences, ...selected],
      index = itinerary.indexOf(from);
    if (!from || !link || !link.source || !link.destination)
      throw new TypeError('Selection requires an occurrence and compiled Link');
    if (index < activeIndex || !from.section.outgoing.includes(link))
      throw new RangeError('Selection requires a retained forward occurrence and its canonical outgoing Link');
    const next = itinerary[index + 1];
    if (next)
      return next.incoming === link
        ? success({ history: before, occurrence: next })
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
    if (!Number.isSafeInteger(ordinal)) return failure('identity_exhausted', 'Occurrence ordinal is not representable');
    const to = Object.freeze({ ordinal, section: link.destination.section, incoming: link });
    return success({
      history: Object.freeze({ ...before, selected: Object.freeze([...selected, to]) }),
      occurrence: to,
    });
  };
  const prepare = (direction: 'forward' | 'reverse', options: { readonly selectUnique?: boolean } = {}) => {
    if (typeof direction !== 'string') throw new TypeError('Traversal direction must be a string');
    if (direction !== 'forward' && direction !== 'reverse')
      throw new RangeError('Traversal direction must be forward or reverse');
    const before = history,
      { occurrences, selected, active: from } = before,
      activeIndex = occurrences.indexOf(from);
    const visited = occurrences[activeIndex + 1];
    const to = direction === 'forward' ? (visited ?? selected[0]) : occurrences[activeIndex - 1];
    if (!to)
      return direction === 'forward'
        ? failure('selection_required', 'Choose a successor before advancing the frame')
        : failure('history_exhausted', 'Reverse exceeds retained actual-predecessor history');
    let retained = occurrences;
    if (direction === 'forward') {
      retained = visited ? occurrences : [...occurrences, to];
      // Retain only the actual predecessor chain required behind the prepared frame.
      let distance = 0,
        first = activeIndex + 1;
      while (first > 0 && distance < retainBehind) {
        const incoming = retained[first]!.incoming!;
        first -= 1;
        const previousEntry = retained[first]!.incoming?.destination.anchor.s ?? 0;
        distance += incoming.source.anchor.s - previousEntry;
      }
      retained = Object.freeze(retained.slice(first));
    }
    let after: CourseOccurrenceHistory = Object.freeze({
      occurrences: retained,
      active: to,
      selected: direction === 'forward' && !visited ? Object.freeze(selected.slice(1)) : selected,
    });
    if (options.selectUnique) {
      for (;;) {
        const frontier = after.selected.at(-1) ?? after.occurrences.at(-1)!;
        if (frontier.section.outgoing.length !== 1) break;
        const next = selectFrom(after, frontier, frontier.section.outgoing[0]!);
        if (!next.ok) {
          if (next.reason === 'selection_limit') break;
          return next;
        }
        after = next.value.history;
      }
    }
    const movement = Object.freeze({
      from,
      to,
      destinationFromSource:
        direction === 'forward'
          ? to.incoming!.destinationFromSource
          : invertPlanarTransform(from.incoming!.destinationFromSource),
    });
    return success(
      Object.freeze({
        ...movement,
        history: after,
        commit() {
          if (history !== before) return failure('stale_transition', 'Traversal changed after transition preparation');
          history = after;
          return success(movement);
        },
      }),
    );
  };
  return Object.freeze({
    snapshot,
    prepare,
    select(from: CourseOccurrence, link: CompiledLink) {
      const result = selectFrom(history, from, link);
      if (!result.ok) return result;
      history = result.value.history;
      return success(result.value.occurrence);
    },
    forward() {
      const prepared = prepare('forward');
      return prepared.ok ? prepared.value.commit() : prepared;
    },
    reverse() {
      const prepared = prepare('reverse');
      return prepared.ok ? prepared.value.commit() : prepared;
    },
  });
}
