import type { ProfileReader, ProfilePolylineReader } from '../course/geometry/profile.js';
import type { RasterGeometry } from '../course/geometry/raster-coordinate-reader.js';
import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import { selectVehicleSprite, type VehicleSpriteSet } from '../image/sprite-assets.js';
import type { CourseSprite } from './course-sprite.js';
import { createRenderSpacePosition, mapToRenderSpace } from './render-space-mapping.js';
import { deriveVehicleNormalizedBank, type VehicleTurnObservation } from './vehicle-visuals.js';

/** Rendering adapter only. Physical x/y/z remains the CG authority. */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  cameraYaw: number,
  spriteSet: VehicleSpriteSet,
  geometry: RasterGeometry,
  height: ProfileReader,
  renderHeight: ProfilePolylineReader,
  position = createRenderSpacePosition(),
): CourseSprite {
  const relativeYaw = wrapAngle(vehicle.yaw - cameraYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleNormalizedBank(vehicle));
  mapToRenderSpace(
    geometry,
    height,
    renderHeight,
    vehicle.course.s,
    vehicle.course.l,
    vehicle.renderY ?? vehicle.y,
    position,
  );
  return {
    name,
    x: position.x,
    y: position.y,
    z: position.z,
    sRender: vehicle.course.s,
    asset: selected.asset,
  };
}
