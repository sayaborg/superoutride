import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../physics/vehicle-contract.js';
import { mapPhysicalHeightToRender } from '../render/render-height-space.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../visual/m4-sprite-assets.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { CourseSprite } from './course-sprite.js';

/** Rendering adapter only. Physical x/y/z remains the CG authority. */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead,
  cameraYaw: number,
  spriteSet: VehicleSpriteSet,
  height: HeightProfileReader,
): CourseSprite {
  const relativeYaw = wrapAngle(vehicle.yaw - cameraYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, 0);
  return {
    name,
    x: vehicle.x,
    y: mapPhysicalHeightToRender(
      height,
      vehicle.course.s,
      vehicle.presentationY ?? vehicle.y,
    ),
    z: vehicle.z,
    sRender: vehicle.course.s,
    asset: selected.asset,
  };
}
