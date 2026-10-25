import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledSection } from '../../src/course/compiler/course-graph.js';
import { firstExitRoute, routeSectionS, type RouteOccurrence } from '../../src/course/course-route.js';
import { transformPlanarPoint, type PlanarTransform } from '../../src/core/planar-transform.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { materialOuterEdges } from '../../src/course/course-coordinate-domain.js';

/**
 * The course laid out in the world as its map lays it (`firstExitRoute`): the Route from the entry, one lap of a circuit,
 * each fork taking its first exit, each occurrence placed by its transform to the world.
 */

/** Metres: the viewer's tolerance for drawing a curve or a vertical curve as straight pieces. */
export const CURVE_TOLERANCE_METERS = 0.01;

/** One occurrence of the Route, placed in the world. */
export interface PlacedSection {
  readonly section: CompiledSection;
  readonly occurrence: RouteOccurrence;
  /** The Section's index in the course document. */
  readonly index: number;
  readonly worldFromSection: PlanarTransform;
  /** Rotation of the Section's frame in the world, radians (yaw). */
  readonly rotation: number;
  /** Where its course limits lie at a station: the outer covered material edges. */
  readonly limits: ReturnType<typeof materialOuterEdges>;
  /** The occurrence's route start, for the distance shown along the course. */
  readonly routeStart: number;
}

export interface CourseLayout {
  readonly course: CompiledCourse;
  readonly sections: readonly PlacedSection[];
  /** The Route's occurrences on the route ruler. */
  readonly route: readonly RouteOccurrence[];
  /** The world point every vertex is stored relative to, near the course's middle, for float precision. */
  readonly origin: { readonly x: number; readonly z: number };
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
}

export function layOutCourse(course: CompiledCourse): CourseLayout {
  const route = firstExitRoute(course);
  const sections = route.map((occurrence) =>
    Object.freeze({
      section: occurrence.section,
      occurrence,
      index: course.sections.indexOf(occurrence.section),
      worldFromSection: occurrence.worldFromSection,
      rotation: occurrence.rotation,
      limits: materialOuterEdges(occurrence.section.material, ''),
      routeStart: occurrence.start,
    }),
  );
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  const sample = createPlanCoordinateSample();
  for (const placed of sections) {
    const length = placed.section.coordinates.domain.end;
    const count = Math.max(1, Math.ceil(length / 20));
    for (let i = 0; i <= count; i++) {
      const p = transformPlanarPoint(
        placed.worldFromSection,
        placed.section.coordinates.toWorld((length * i) / count, 0, sample),
      );
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
  }
  return Object.freeze({
    course,
    sections: Object.freeze(sections),
    route,
    origin: Object.freeze({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }),
    bounds: Object.freeze({ minX, maxX, minZ, maxZ }),
  });
}

/** A world point of a placed Section, relative to the layout's origin: station `s`, lateral `l`, `up` above the road. */
export function sectionPoint(
  layout: CourseLayout,
  placed: PlacedSection,
  s: number,
  l: number,
  up: number,
  out: number[],
  at = out.length,
): void {
  const world = transformPlanarPoint(placed.worldFromSection, placed.section.coordinates.toWorld(s, l, pointSample));
  out[at] = world.x - layout.origin.x;
  out[at + 1] = placed.section.height.sample(s) + up;
  out[at + 2] = world.z - layout.origin.z;
}
const pointSample = createPlanCoordinateSample();

/** The road heading at a placed Section's station `s`, as a world yaw. */
export function sectionHeading(placed: PlacedSection, s: number): number {
  return placed.section.coordinates.toWorld(s, 0, pointSample).heading + placed.rotation;
}

/** The occurrence of `route` holding route station `s` (the successor owning a seam), clamped to the route. */
export function routeOccurrenceAt(route: readonly RouteOccurrence[], s: number): RouteOccurrence {
  let lo = 0,
    hi = route.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (route[mid]!.start <= s) lo = mid + 1;
    else hi = mid;
  }
  return route[Math.max(0, lo - 1)]!;
}

export function routeLength(route: readonly RouteOccurrence[]): number {
  return route.at(-1)!.end;
}

export { routeSectionS };

/**
 * The stations a placed Section's surfaces are cut at over `[a, b]`: `extra` stations, the plan's joints, the profile's
 * PVIs and vertical curves' ends, and between them as many as keep every point within `reach` metres of the centreline
 * within `CURVE_TOLERANCE_METERS` of its curve: an arc's chord sagitta at radius `R + reach`, and a vertical curve's
 * `|Δg| h² / 8L`.
 */
export function sectionStations(
  section: CompiledSection,
  a: number,
  b: number,
  reach: number,
  extra: Iterable<number> = [],
): number[] {
  const knots = section.height.knots;
  const base = new Set<number>([a, b]);
  for (const segment of section.segments) base.add(segment.sStart);
  for (const knot of knots) {
    base.add(knot.s);
    if (knot.curveLength > 0) {
      base.add(knot.s - knot.curveLength / 2);
      base.add(knot.s + knot.curveLength / 2);
    }
  }
  for (const s of extra) base.add(s);
  const sorted = [...base].filter((s) => s >= a && s <= b).sort((x, y) => x - y);
  const out: number[] = [];
  const metric = { curvature: 0, offsetMetric: 1 };
  for (let i = 0; i + 1 < sorted.length; i++) {
    const s0 = sorted[i]!,
      s1 = sorted[i + 1]!;
    out.push(s0);
    const middle = (s0 + s1) / 2;
    let step = Infinity;
    const kappa = Math.abs(section.coordinates.metricsAt(middle, 0, metric).curvature);
    if (kappa > 0) {
      const radius = 1 / kappa;
      step = radius * Math.sqrt((8 * CURVE_TOLERANCE_METERS) / (radius + reach));
    }
    const knot = verticalCurveAt(knots, middle);
    if (knot) {
      const k = knots.indexOf(knot);
      const before = (knot.y - knots[k - 1]!.y) / (knot.s - knots[k - 1]!.s),
        after = (knots[k + 1]!.y - knot.y) / (knots[k + 1]!.s - knot.s);
      const change = Math.abs(after - before);
      if (change > 0) step = Math.min(step, Math.sqrt((8 * CURVE_TOLERANCE_METERS * knot.curveLength) / change));
    }
    const count = Number.isFinite(step) ? Math.ceil((s1 - s0) / step) : 1;
    for (let j = 1; j < count; j++) out.push(s0 + ((s1 - s0) * j) / count);
  }
  out.push(sorted.at(-1)!);
  return out;
}

function verticalCurveAt(knots: CompiledSection['height']['knots'], s: number) {
  for (const knot of knots)
    if (knot.curveLength > 0 && s > knot.s - knot.curveLength / 2 && s < knot.s + knot.curveLength / 2) return knot;
  return null;
}
