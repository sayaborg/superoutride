import { courseBoundaryAt, type CompiledBoundary } from './course-boundaries.js';
import type { Lateral } from './course-document.js';

/** One compiled lane: its left edge, centre and right edge along the Section, and its width. */
export interface CompiledLane {
  readonly id: string;
  readonly left: CompiledBoundary;
  readonly center: CompiledBoundary;
  readonly right: CompiledBoundary;
  readonly width: CompiledBoundary;
}

/**
 * A Section's cross-section, left to right: each lane with its lines, and each median's width. The centre lane's centre
 * is the centreline. Every line has a vertex at every station where any width changes slope.
 */
export interface CompiledLanes {
  readonly elements: readonly (
    | { readonly kind: 'lane'; readonly lane: CompiledLane }
    | { readonly kind: 'median'; readonly width: CompiledBoundary }
  )[];
  readonly byId: ReadonlyMap<string, CompiledLane>;
  readonly center: CompiledLane;
}

/** A road at a station: lanes of positive width touching side by side, with no median of positive width between. */
export interface CourseRoad {
  /** The road's lanes, left to right. */
  readonly lanes: readonly CompiledLane[];
  readonly left: number;
  readonly right: number;
}

/** The roads at station `s`, left to right. A lane of zero width there is absent and divides nothing. */
export function courseRoadsAt(lanes: CompiledLanes, s: number): CourseRoad[] {
  const roads: CourseRoad[] = [];
  let current: CompiledLane[] = [];
  const close = () => {
    if (current.length)
      roads.push(
        Object.freeze({
          lanes: Object.freeze(current),
          left: courseBoundaryAt(current[0]!.left, s),
          right: courseBoundaryAt(current.at(-1)!.right, s),
        }),
      );
    current = [];
  };
  for (const element of lanes.elements) {
    if (element.kind === 'median') {
      if (courseBoundaryAt(element.width, s) > 0) close();
    } else if (courseBoundaryAt(element.lane.width, s) > 0) current.push(element.lane);
  }
  close();
  return roads;
}

/** The lines Lateral references read in a Section: its Boundaries and its lanes'. */
export interface CourseLines {
  readonly boundaries: ReadonlyMap<string, CompiledBoundary>;
  readonly lanes: CompiledLanes;
}

/** The line a Lateral reference reads, or undefined when it names none. */
export function courseLineOf(
  reference: Exclude<Lateral, number>,
  boundary: (id: string) => CompiledBoundary | undefined,
  lanes: CompiledLanes,
): CompiledBoundary | undefined {
  if ('boundary' in reference) return boundary(reference.boundary);
  return lanes.byId.get(reference.lane)?.[reference.side];
}
