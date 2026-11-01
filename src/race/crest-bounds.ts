import type { CurvatureBounds } from '../course/geometry/profile-bound.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-state.js';

/**
 * The crests and dips rule's speed ([Original road data](../../docs/original-road-data.md#crests-and-dips)), 200 km/h:
 * there a crest lifts the car by at most a g, a dip presses it down by at most b g.
 */
export const CREST_RULE_KMH = 200;
/** The DEV choices of a (crests) and b (dips), in g; null leaves the side unbounded. */
export const CREST_CHOICES = Object.freeze([null, 0.6, 0.7, 0.8] as const);
export const DIP_CHOICES = Object.freeze([null, 1.5, 2] as const);

/** The curvature bounds of a and b, g: a g / v² and b g / v² at the rule's speed; null where neither is chosen. */
export function crestBounds(a: number | null, b: number | null): CurvatureBounds | null {
  if (a === null && b === null) return null;
  const v = CREST_RULE_KMH / 3.6;
  const unit = VEHICLE_GRAVITY / (v * v);
  return { crest: a === null ? null : a * unit, dip: b === null ? null : b * unit };
}
