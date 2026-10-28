import {
  compilePlanarTransform,
  composePlanarTransforms,
  invertPlanarTransform,
  type PlanarTransform,
} from '../core/planar-transform.js';
import type { CompiledLink, CompiledSection } from './compiler/course-graph.js';
import type { CompiledCourse } from './compiler/compiled-course.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';

/** One selected traversal, shared by all vehicles. Stations never change when the resident window advances. */
export interface RouteOccurrence {
  readonly ordinal: number;
  readonly section: CompiledSection;
  readonly incoming: CompiledLink | null;
  readonly start: number;
  readonly end: number;
  readonly lateralOrigin: number;
  readonly rotation: number;
  /** The road's heading at the occurrence's start, continued along the Route from its entry (radians, not wrapped). */
  readonly heading: number;
  /** The road's turn since the Route first entered this occurrence's Section: 0 the first time, a lap's on a circuit. */
  readonly repeatTurn: number;
  readonly worldFromSection: PlanarTransform;
  readonly sectionFromWorld: PlanarTransform;
}

/**
 * Read-only occurrence sequence shared by the Route and its resident window. An exact seam station
 * belongs to the successor when it exists; the tail answers for its end until a successor is appended.
 */
export interface RouteView {
  readonly occurrences: readonly RouteOccurrence[];
  readonly start: number;
  readonly end: number;
  /** Null while the tail has successors, including an undecided fork. */
  readonly terminal: number | null;
  /** Outside [start, end] returns null. */
  at(s: number): RouteOccurrence | null;
}

/** The selected, append-only Route from the entry; it starts at 0 and never discards an occurrence. */
export type CourseRoute = RouteView;

/** The Route's only writers: its owner extends it and hands `select` to the fork decider alone. */
export interface CourseRouteBuilder {
  readonly route: CourseRoute;
  /** Append the successor the fork decider selected. */
  select(link: CompiledLink): void;
  /** Continue deterministically through unambiguous Links until the requested station is present. */
  extendThrough(s: number): void;
}

/** A contiguous suffix of the Route that is resident for physical and rendering readers. */
export type RouteWindow = RouteView;

const identity = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });

/** The road's turn over `section` from its start to its station `s`: its plan's curvature summed, not wrapped. */
export function sectionTurn(section: CompiledSection, s: number): number {
  let turn = 0;
  for (const segment of section.segments) {
    if (segment.sStart >= s) break;
    turn += segment.curvature * (Math.min(s, segment.sEnd) - segment.sStart);
  }
  return turn;
}

function occurrenceAt(occurrences: readonly RouteOccurrence[], s: number): RouteOccurrence | null {
  if (s < occurrences[0]!.start || s > occurrences.at(-1)!.end) return null;
  let lo = 0,
    hi = occurrences.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (occurrences[mid]!.start <= s) lo = mid + 1;
    else hi = mid;
  }
  return occurrences[lo - 1]!;
}

function terminalOf(occurrences: readonly RouteOccurrence[]): number | null {
  const tail = occurrences.at(-1)!;
  return tail.section.outgoing.length === 0 ? tail.end : null;
}

/** Assemble the Route from the admitted entry and canonical successor Links. */
export function createCourseRoute(entry: CompiledSection): CourseRouteBuilder {
  let occurrences: readonly RouteOccurrence[] = Object.freeze([
    Object.freeze({
      ordinal: 0,
      section: entry,
      incoming: null,
      start: 0,
      end: entry.coordinates.domain.end,
      lateralOrigin: 0,
      rotation: 0,
      heading: entry.segments[0]!.start.heading,
      repeatTurn: 0,
      worldFromSection: identity,
      sectionFromWorld: identity,
    }),
  ]);
  const select = (link: CompiledLink): void => {
    const previous = occurrences.at(-1)!;
    const start = previous.end;
    const end = start + link.to.section.coordinates.domain.end;
    const worldFromSection = composePlanarTransforms(previous.worldFromSection, invertPlanarTransform(link.toFromFrom));
    const heading = previous.heading + sectionTurn(previous.section, previous.section.coordinates.domain.end);
    const first = occurrences.find((occurrence) => occurrence.section === link.to.section);
    occurrences = Object.freeze([
      ...occurrences,
      Object.freeze({
        ordinal: previous.ordinal + 1,
        section: link.to.section,
        incoming: link,
        start,
        end,
        lateralOrigin: previous.lateralOrigin + link.to.lateralOrigin - link.from.lateralOrigin,
        rotation: Math.atan2(worldFromSection.sine, worldFromSection.cosine),
        heading,
        repeatTurn: first ? heading - first.heading : 0,
        worldFromSection,
        sectionFromWorld: invertPlanarTransform(worldFromSection),
      }),
    ]);
  };
  const route: CourseRoute = Object.freeze({
    get occurrences() {
      return occurrences;
    },
    start: 0,
    get end() {
      return occurrences.at(-1)!.end;
    },
    get terminal() {
      return terminalOf(occurrences);
    },
    at: (s: number) => occurrenceAt(occurrences, s),
  });
  return Object.freeze({
    route,
    select,
    extendThrough(s: number) {
      while (occurrences.at(-1)!.end < s) {
        const outgoing = occurrences.at(-1)!.section.outgoing;
        if (outgoing.length !== 1) break;
        select(outgoing[0]!);
      }
    },
  });
}

/**
 * A course's Route from its entry as its map draws it: one lap of a circuit, else to its end, each fork taking its first
 * exit; each occurrence carries its transform to the world.
 */
export function firstExitRoute(course: Pick<CompiledCourse, 'entry' | 'type'>): readonly RouteOccurrence[] {
  const builder = createCourseRoute(course.entry);
  const occurrences: RouteOccurrence[] = [];
  for (let i = 0; i <= COURSE_DOCUMENT_LIMITS.sections; i++) {
    const occurrence = builder.route.occurrences[i]!;
    occurrences.push(occurrence);
    const outgoing = occurrence.section.outgoing;
    if (outgoing.length === 0) break;
    builder.select(outgoing[0]!);
    if (course.type === 'CIRCUIT' && builder.route.occurrences[i + 1]!.section === course.entry) break;
  }
  return Object.freeze(occurrences);
}

/**
 * The resident window over a Route: always its suffix from the first retained occurrence. Only the
 * owner advances it; its occurrence list keeps its identity until the retained sequence changes.
 */
export function createRouteWindow(route: CourseRoute) {
  let first = 0;
  let source = route.occurrences;
  let occurrences = source;
  const current = () => {
    if (source !== route.occurrences || occurrences[0] !== source[first]) {
      source = route.occurrences;
      occurrences = first === 0 ? source : Object.freeze(source.slice(first));
    }
    return occurrences;
  };
  const window: RouteWindow = Object.freeze({
    get occurrences() {
      return current();
    },
    get start() {
      return current()[0]!.start;
    },
    get end() {
      return current().at(-1)!.end;
    },
    get terminal() {
      return terminalOf(current());
    },
    at: (s: number) => occurrenceAt(current(), s),
  });
  return Object.freeze({
    window,
    /** Keep the resident occurrence containing this station and every successor. */
    retainFrom(s: number) {
      const occurrence = window.at(s);
      if (!occurrence) return;
      const index = route.occurrences.indexOf(occurrence);
      if (index > first) first = index;
    },
  });
}

/**
 * The successor the Route selected after this occurrence, or null while it is undecided: the only stored
 * fork choice. The Route starts at ordinal 0 and never discards, so an occurrence's successor is the next entry.
 */
export function selectedSuccessor(route: CourseRoute, occurrence: RouteOccurrence): CompiledLink | null {
  return route.occurrences[occurrence.ordinal + 1]?.incoming ?? null;
}

/** The single route-to-Section conversion used by all route readers. */
export function routeSectionS(occurrence: RouteOccurrence, s: number): number {
  return s - occurrence.start;
}

export function routeS(occurrence: RouteOccurrence, nativeS: number): number {
  return occurrence.start + nativeS;
}
