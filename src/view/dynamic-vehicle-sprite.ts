import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import type { StandingPoint } from './standing-point.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import type { CourseSprite } from './course-sprite.js';
import { deriveVehicleLeanRadians, type VehicleTurnObservation } from './vehicle-visuals.js';

/**
 * Rendering adapter only: the picture stands at `standing`, its footprint's near edge (`standingPoint`); physical x/y/z
 * remains the CG authority.
 */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  standing: Readonly<StandingPoint>,
  cameraYaw: number,
  spriteSet: VehicleSpriteSet,
): CourseSprite {
  const relativeYaw = wrapAngle(vehicle.yaw - cameraYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleLeanRadians(vehicle));
  return {
    name,
    x: standing.x,
    y: standing.y,
    z: standing.z,
    sRender: standing.s,
    asset: selected.asset,
  };
}
