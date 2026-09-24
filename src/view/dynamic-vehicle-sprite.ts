import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../image/sprite-assets.js';
import type { CourseSprite } from './course-sprite.js';
import { deriveVehicleNormalizedBank, type VehicleTurnObservation } from './vehicle-visuals.js';

/** Rendering adapter only. Physical x/y/z remains the CG authority. */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  cameraYaw: number,
  spriteSet: VehicleSpriteSet,
): CourseSprite {
  const relativeYaw = wrapAngle(vehicle.yaw - cameraYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleNormalizedBank(vehicle));
  return {
    name,
    x: vehicle.x,
    y: vehicle.renderY ?? vehicle.y,
    z: vehicle.z,
    sRender: vehicle.course.s,
    asset: selected.asset,
  };
}
