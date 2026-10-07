import type { PlanCoordinateReader, PlanCoordinateSample } from '../course/geometry/plan-coordinate.js';

/** A picture's ground anchor: its world X/Z, its height and its route station, as projection reads it. */
export interface StandingPoint {
  x: number;
  y: number;
  z: number;
  s: number;
}

/** A body with a square footprint, as its picture stands: its route position, its centre's ground height and pitch. */
export interface StandingBody {
  readonly course: { readonly s: number; readonly l: number };
  /** The ground height under its centre: a vehicle's render anchor, an object's height. */
  readonly renderY: number;
  /** Nose-up body pitch, radians; zero for an object. */
  readonly sprungPitch: number;
}

/**
 * Where a body's picture stands: the middle of its square footprint's edge nearer the camera, half its `side` behind its
 * route position along the road at its lateral, whichever way it faces. Its height is the body's rear end at that
 * distance behind its centre, `renderY − (side/2)·sin(pitch)`, so a grounded body's picture meets its shadow's near edge
 * on slopes too. The camera holds the player's standing point at its target row.
 */
export function standingPoint(
  coordinates: PlanCoordinateReader,
  body: StandingBody,
  side: number,
  out: StandingPoint,
  sample: PlanCoordinateSample,
): StandingPoint {
  const s = body.course.s - side / 2;
  const at = coordinates.toWorld(s, body.course.l, sample);
  out.x = at.x;
  out.z = at.z;
  out.y = body.renderY - (side / 2) * Math.sin(body.sprungPitch);
  out.s = s;
  return out;
}
