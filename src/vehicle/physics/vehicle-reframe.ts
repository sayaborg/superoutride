import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import { guideCoordinateToWorld, type GuideCoordinateSource } from '../../course/geometry/guide-coordinate-frame.js';
import { wrapAngle } from '../../core/math.js';
import { transformPlanarPoint, transformPlanarVector, type PlanarTransform } from '../../core/planar-transform.js';
import type { ArcadeVehicleState } from './arcade-vehicle-physics.js';

/** A rigid change of observation frame. Forces, body scalars and contact memory are unchanged. */
export function reframeVehicle(
  vehicle: ArcadeVehicleState,
  guide: GuideCoordinateSource,
  transform: PlanarTransform,
  s: number,
  l: number,
): void {
  const coordinate = guideCoordinateToWorld(guide, s, l, createPlanarCoordinateSample());
  const position = transformPlanarPoint(transform, vehicle);
  const velocity = transformPlanarVector(transform, { x: vehicle.velocityX, z: vehicle.velocityZ });
  vehicle.x = position.x;
  vehicle.z = position.z;
  vehicle.velocityX = velocity.x;
  vehicle.velocityZ = velocity.z;
  vehicle.yaw = wrapAngle(vehicle.yaw + Math.atan2(transform.sine, transform.cosine));
  vehicle.course = {
    s: coordinate.s,
    l: coordinate.l,
    segmentIndex: coordinate.segmentIndex,
    distanceSquared: vehicle.course.distanceSquared,
  };
}
