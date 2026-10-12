import { transformPlanarPoint } from '../core/planar-transform.js';
import type { Vec2 } from '../core/math.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import { createCourseRoute, type RouteOccurrence } from '../course/course-route.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { COURSE_DOCUMENT_LIMITS } from '../course/course-limits.js';
import type { SoftwareSurface } from './software-surface.js';

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
  // The route from the entry: one lap of a circuit, else to its end, each fork taking its first exit.
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

/** The colors a map is drawn in, RGB555. */
export interface CourseMapColors {
  readonly line: number;
  readonly core: number;
  readonly start: number;
  readonly checkpoint: number;
}

/** Pixels the centreline's 3-pixel line reaches either side of its path. */
const LINE_REACH = 1;
/** The start line's bar: pixels either side of the road's centre, 9 in all. */
const START_REACH = 4;

/**
 * Draw `map` into `frame`, scaled to fit the box at (`x`, `y`) of `width` × `height` pixels and centred in it: the
 * centreline 3 pixels wide in `line` with a 1-pixel `core`, a 1×9-pixel bar of `start` across the start line and a 3×3
 * dot of `checkpoint` at each checkpoint gate.
 */
export function drawCourseMap(
  frame: SoftwareSurface,
  map: CourseMap,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  colors: CourseMapColors,
) {
  const east = map.centreline.map((p) => p.east),
    north = map.centreline.map((p) => p.north);
  const [west, eastmost] = [Math.min(...east), Math.max(...east)],
    [south, northmost] = [Math.min(...north), Math.max(...north)];
  // The line and the start bar reach beyond the path; the path fits inside that margin.
  const margin = START_REACH;
  const scale = Math.min(
    (box.width - 1 - 2 * margin) / Math.max(1e-9, eastmost - west),
    (box.height - 1 - 2 * margin) / Math.max(1e-9, northmost - south),
  );
  const left = box.x + (box.width - 1 - (eastmost - west) * scale) / 2,
    top = box.y + (box.height - 1 - (northmost - south) * scale) / 2;
  const pixel = (p: MapPoint) => ({
    x: Math.round(left + (p.east - west) * scale),
    y: Math.round(top + (northmost - p.north) * scale),
  });
  const set = (x: number, y: number, color: number) => frame.setPixel(x, y, color);
  // Every pixel of the polyline, one segment after another.
  const path = (visit: (x: number, y: number) => void) => {
    for (let i = 1; i < map.centreline.length; i++) {
      const a = pixel(map.centreline[i - 1]!),
        b = pixel(map.centreline[i]!);
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let k = 0; k <= steps; k++)
        visit(Math.round(a.x + ((b.x - a.x) * k) / steps), Math.round(a.y + ((b.y - a.y) * k) / steps));
    }
  };
  path((x, y) => {
    for (let dy = -LINE_REACH; dy <= LINE_REACH; dy++)
      for (let dx = -LINE_REACH; dx <= LINE_REACH; dx++) set(x + dx, y + dy, colors.line);
  });
  path((x, y) => set(x, y, colors.core));
  for (const checkpoint of map.checkpoints) {
    const { x, y } = pixel(checkpoint);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, colors.checkpoint);
  }
  // Across the road: the direction turned a right angle, in screen pixels (north is up).
  const { x, y } = pixel(map.start.point);
  const across = { x: map.start.direction.north, y: map.start.direction.east };
  for (let k = -START_REACH; k <= START_REACH; k++)
    set(Math.round(x + across.x * k), Math.round(y + across.y * k), colors.start);
}
