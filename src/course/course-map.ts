import { transformPlanarPoint } from '../core/planar-transform.js';
import type { Vec2 } from '../core/math.js';
import type { CompiledCourse } from './compiler/compiled-course.js';
import { firstExitRoute, type RouteOccurrence } from './course-route.js';
import { createPlanCoordinateSample } from './geometry/plan-coordinate.js';

/** Metres between the centreline's samples. */
const SAMPLE_METERS = 4;

/** A point of the map, in metres east and north of the entry Section's origin. */
export interface MapPoint {
  readonly east: number;
  readonly north: number;
}

/** A course's map: its route's centreline, start line and checkpoint gates, north up, and the route's length. */
export interface CourseMap {
  readonly centreline: readonly MapPoint[];
  /** The entry Section's origin and the road's direction there, a unit vector east and north. */
  readonly start: { readonly point: MapPoint; readonly direction: MapPoint };
  readonly checkpoints: readonly MapPoint[];
  /** A circuit's lap, or a course's route from its entry to its end, in metres. */
  readonly lengthMeters: number;
}

/**
 * The map of a compiled course, north up by its bearing: the centreline of its route from the entry, one lap on a
 * circuit, taking each fork's first exit, with its checkpoint gates. A world point (x, z) whose road faces the entry's
 * heading 0 lies `bearing` clockwise from north, so it maps to east `x cos b + z sin b`, north `z cos b − x sin b`.
 */
export function createCourseMap(course: CompiledCourse): CourseMap {
  const bearing = (course.bearing * Math.PI) / 180,
    cos = Math.cos(bearing),
    sin = Math.sin(bearing);
  const project = (world: Vec2): MapPoint => ({
    east: world.x * cos + world.z * sin,
    north: world.z * cos - world.x * sin,
  });
  const occurrences = firstExitRoute(course);
  const sample = createPlanCoordinateSample();
  const at = (occurrence: RouteOccurrence, s: number) => {
    occurrence.section.coordinates.toWorld(s, 0, sample);
    return project(transformPlanarPoint(occurrence.worldFromSection, { x: sample.x, z: sample.z }));
  };
  const centreline: MapPoint[] = [];
  let lengthMeters = 0;
  for (const occurrence of occurrences) {
    const end = occurrence.section.coordinates.domain.end;
    const count = Math.max(1, Math.ceil(end / SAMPLE_METERS));
    for (let k = centreline.length ? 1 : 0; k <= count; k++) centreline.push(at(occurrence, (end * k) / count));
    lengthMeters += end;
  }
  const checkpoints = course.gates.intervals.flatMap((interval) =>
    interval.checkpoints.flatMap((gate) =>
      occurrences.filter((o) => o.section === gate.section).map((o) => at(o, gate.at.s)),
    ),
  );
  return Object.freeze({
    centreline: Object.freeze(centreline),
    start: Object.freeze({ point: at(occurrences[0]!, 0), direction: Object.freeze({ east: sin, north: cos }) }),
    checkpoints: Object.freeze(checkpoints),
    lengthMeters,
  });
}
