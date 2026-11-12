import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { wrapAngle } from '../core/math.js';
import type { CameraDefinition, CameraState } from './camera.js';

/**
 * Where a camera stands on the route: its station, its lateral offset and its height over the road, metres; and the
 * lateral offset of the road it looks along.
 */
export interface RoutePlace {
  readonly s: number;
  readonly l: number;
  readonly height: number;
  readonly aim: number;
}

/**
 * A route camera looks at the road `ahead` metres along the route from it, at its place's aim, within `limit` of the
 * road's heading where it stands (the player's camera's yaw limit), and level.
 */
export const ROUTE_CAMERA = Object.freeze({ ahead: 40, limit: Math.PI / 4 });

const samples = new WeakMap<
  object,
  readonly [ReturnType<typeof createPlanCoordinateSample>, ReturnType<typeof createPlanCoordinateSample>]
>();

/**
 * A camera that stands on the route by itself, followed by nothing (the attract demo's shots; K, 2026-11-12): at
 * `place` over the road's height there, looking along the road (`ROUTE_CAMERA`), with the definition's focal length,
 * centre and horizon. Its sky is the sky of its own place. The player is drawn by it as any other vehicle is.
 */
export function routeCamera(
  world: { readonly coordinates: PlanCoordinateReader; readonly height: ProfileReader },
  place: RoutePlace,
  definition: Pick<CameraDefinition, 'focalLength' | 'centerX' | 'horizonRow'>,
): CameraState {
  let pair = samples.get(world);
  if (!pair) samples.set(world, (pair = [createPlanCoordinateSample(), createPlanCoordinateSample()]));
  const at = world.coordinates.toWorld(place.s, place.l, pair[0]);
  const ahead = world.coordinates.toWorld(place.s + ROUTE_CAMERA.ahead, place.aim, pair[1]);
  const toward = Math.atan2(ahead.x - at.x, ahead.z - at.z);
  const turn = wrapAngle(toward - at.heading);
  const yaw = wrapAngle(at.heading + Math.max(-ROUTE_CAMERA.limit, Math.min(ROUTE_CAMERA.limit, turn)));
  return Object.freeze({
    x: at.x,
    y: world.height.sample(place.s) + place.height,
    z: at.z,
    yaw,
    pitch: 0,
    s: place.s,
    follows: place.s,
    focalLength: definition.focalLength,
    centerX: definition.centerX,
    centerY: definition.horizonRow,
    heldAtLimit: 0,
  });
}
