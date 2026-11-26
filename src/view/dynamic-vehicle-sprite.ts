import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import type { BasePoint } from './base-point.js';
import { selectVehicleSprite, vehicleSpriteViewYaw, type VehicleSpriteImages } from '../vehicle/vehicle-sprite-set.js';
import type { CourseSprite, SpriteShadowPlace } from './course-sprite.js';
import type { CameraState } from './camera.js';
import { cameraRightDistance, pseudoDepth } from './projection.js';
import { cameraRulerStation } from './reversed-view.js';
import { deriveVehicleLeanRadians, type VehicleTurnObservation } from './vehicle-visuals.js';

/**
 * Rendering adapter only: the picture stands at `base`, its base point (`basePoint`) on the route's own ruler, and its
 * shadow lies at `shadow`; physical x/y/z remains the CG authority. Its image is the one seen from the camera's
 * direction of view to that point, its depth read along the camera's ruler, holding `heldYawIndex`, its previous
 * frame's yaw image, near that image's sector.
 */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  base: Readonly<BasePoint>,
  shadow: SpriteShadowPlace,
  camera: Readonly<CameraState>,
  spriteSet: VehicleSpriteImages,
  heldYawIndex?: number,
): { sprite: CourseSprite; yawIndex: number } {
  // The base point's depth along the camera's ruler, which a camera looking back reads the other way.
  const depth = pseudoDepth(cameraRulerStation(camera, base.s), camera.s);
  const viewYaw = vehicleSpriteViewYaw(cameraRightDistance(base, camera), depth);
  const relativeYaw = wrapAngle(vehicle.yaw - camera.yaw - viewYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleLeanRadians(vehicle), heldYawIndex);
  return {
    sprite: { name, x: base.x, y: base.y, z: base.z, sRender: base.s, asset: selected.asset, shadow },
    yawIndex: selected.yawIndex,
  };
}
