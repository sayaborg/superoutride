import {
  compilePlanarTransform,
  composePlanarTransforms,
  invertPlanarTransform,
  type PlanarTransform,
} from '../core/planar-transform.js';
import { courseCutLateral } from './compiler/course-links.js';
import type { CompiledLink, CompiledSection } from './compiler/course-graph.js';

/** One selected traversal, shared by all vehicles. Stations never change when old entries are pruned. */
export interface RouteOccurrence {
  readonly section: CompiledSection;
  readonly incoming: CompiledLink | null;
  readonly start: number;
  readonly nativeStart: number;
  readonly end: number;
  readonly lateralOrigin: number;
  readonly worldFromSection: PlanarTransform;
  readonly sectionFromWorld: PlanarTransform;
}

export interface CourseRoute {
  readonly occurrences: readonly RouteOccurrence[];
  readonly start: number;
  readonly end: number;
  /** An exact seam station belongs to the successor. Outside the retained range returns null. */
  at(s: number): RouteOccurrence | null;
  /** Add a canonical successor selected by the shared fork decision. */
  append(link: CompiledLink): void;
  /** Continue through unambiguous links until the requested distance is present. */
  extendThrough(s: number): void;
  /** Keep the occurrence containing this station and every successor. */
  discardBefore(s: number): void;
}

const identity = compilePlanarTransform({ x: 0, z: 0, heading: 0 }, { x: 0, z: 0, heading: 0 });

function lastNativeEnd(section: CompiledSection): number {
  return Math.min(section.raster.length, ...section.outgoing.map((link) => link.from.anchor.s));
}

/** Validate the entry and canonical link at the route mutation boundary. */
export function createCourseRoute(entry: CompiledSection): CourseRoute {
  if (!entry?.coordinates || !entry.raster) throw new TypeError('Route requires a compiled entry Section');
  let occurrences: readonly RouteOccurrence[] = Object.freeze([
    Object.freeze({
      section: entry,
      incoming: null,
      start: 0,
      nativeStart: 0,
      end: lastNativeEnd(entry),
      lateralOrigin: 0,
      worldFromSection: identity,
      sectionFromWorld: identity,
    }),
  ]);
  const at = (s: number): RouteOccurrence | null => {
    if (s < occurrences[0]!.start || s > occurrences.at(-1)!.end) return null;
    let lo = 0,
      hi = occurrences.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (occurrences[mid]!.start <= s) lo = mid + 1;
      else hi = mid;
    }
    const result = occurrences[lo - 1]!;
    return s <= result.end ? result : null;
  };
  const append = (link: CompiledLink): void => {
    const previous = occurrences.at(-1)!;
    if (!previous.section.outgoing.includes(link)) throw new RangeError('Route needs a canonical outgoing Link');
    const start = previous.start + link.from.anchor.s - previous.nativeStart;
    const nativeStart = link.to.anchor.s;
    const end = start + lastNativeEnd(link.to.section) - nativeStart;
    if (!(end > start)) throw new RangeError('Route successor must have positive length');
    const worldFromSection = composePlanarTransforms(
      previous.worldFromSection,
      invertPlanarTransform(link.destinationFromSource),
    );
    occurrences = Object.freeze([
      ...occurrences,
      Object.freeze({
        section: link.to.section,
        incoming: link,
        start,
        nativeStart,
        end,
        lateralOrigin: previous.lateralOrigin + courseCutLateral(link.to) - courseCutLateral(link.from),
        worldFromSection,
        sectionFromWorld: invertPlanarTransform(worldFromSection),
      }),
    ]);
  };
  return Object.freeze({
    get occurrences() {
      return occurrences;
    },
    get start() {
      return occurrences[0]!.start;
    },
    get end() {
      return occurrences.at(-1)!.end;
    },
    at,
    append,
    extendThrough(s: number) {
      while (occurrences.at(-1)!.end < s) {
        const outgoing = occurrences.at(-1)!.section.outgoing;
        if (outgoing.length !== 1) break;
        append(outgoing[0]!);
      }
    },
    discardBefore(s: number) {
      const current = at(s);
      if (!current) return;
      const index = occurrences.indexOf(current);
      if (index > 0) occurrences = Object.freeze(occurrences.slice(index));
    },
  });
}

/** The single route-to-Section conversion used by all route readers. */
export function routeSectionS(occurrence: RouteOccurrence, s: number): number {
  return occurrence.nativeStart + (s - occurrence.start);
}

export function routeS(occurrence: RouteOccurrence, nativeS: number): number {
  return occurrence.start + (nativeS - occurrence.nativeStart);
}
