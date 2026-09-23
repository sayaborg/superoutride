import type { HeightProfileReader } from '../course/geometry/height-profile.js';
import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../image/sprite-assets.js';
import type { CourseSprite } from './course-sprite.js';
import { mapPhysicalHeightToRender } from './render-height-space.js';
import { deriveVehicleNormalizedBank, type VehicleTurnObservation } from './vehicle-visuals.js';

/** Rendering adapter only. Physical x/y/z remains the CG authority. */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  cameraYaw: number,
  spriteSet: VehicleSpriteSet,
  height: HeightProfileReader,
): CourseSprite {
  const relativeYaw = wrapAngle(vehicle.yaw - cameraYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleNormalizedBank(vehicle));
  return {
    name,
    x: vehicle.x,
    y: mapPhysicalHeightToRender(height, vehicle.course.s, vehicle.renderY ?? vehicle.y),
    z: vehicle.z,
    sRender: vehicle.course.s,
    asset: selected.asset,
  };
}
