import type { PlanCoordinateReader, PlanCoordinateSample } from '../course/geometry/plan-coordinate.js';

/** A picture's base point: its world X/Z, its height and its route station, as projection reads it. */
export interface BasePoint {
  x: number;
  y: number;
  z: number;
  s: number;
}

/** A body as its picture stands: its route position and its body's underside height. */
export interface BaseBody {
  readonly course: { readonly s: number; readonly l: number };
  /** The body's underside: a vehicle's centre-of-mass height less its desired centre-of-mass height. */
  readonly renderY: number;
}

/**
 * A body's base point, where its picture stands and the camera holds the player: its route position seen from above
 * (the physical authority's position) at its underside's height.
 */
export function basePoint(
  coordinates: PlanCoordinateReader,
  body: BaseBody,
  out: BasePoint,
  sample: PlanCoordinateSample,
): BasePoint {
  const at = coordinates.toWorld(body.course.s, body.course.l, sample);
  out.x = at.x;
  out.z = at.z;
  out.y = body.renderY;
  out.s = body.course.s;
  return out;
}
