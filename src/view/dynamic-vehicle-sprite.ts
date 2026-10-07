import { wrapAngle } from '../core/math.js';
import type { VehicleWorldPoseRead } from '../vehicle/physics/vehicle-contract.js';
import type { StandingPoint } from './standing-point.js';
import { selectVehicleSprite, vehicleSpriteViewYaw, type VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import type { CourseSprite } from './course-sprite.js';
import { cameraRightDistance, pseudoDepth, type PseudoCamera } from './projection.js';
import { deriveVehicleLeanRadians, type VehicleTurnObservation } from './vehicle-visuals.js';

/**
 * Rendering adapter only: the picture stands at `standing`, its footprint's near edge (`standingPoint`); physical x/y/z
 * remains the CG authority. Its image is the one seen from the camera's direction of view to the vehicle's position,
 * `position` (its square's centre at its chainage `s`), holding `heldYawIndex`, its previous frame's yaw image, near
 * that image's sector.
 */
export function createDynamicVehicleCourseSprite(
  name: string,
  vehicle: VehicleWorldPoseRead & VehicleTurnObservation,
  standing: Readonly<StandingPoint>,
  position: Readonly<Pick<StandingPoint, 'x' | 'z' | 's'>>,
  camera: Readonly<PseudoCamera>,
  spriteSet: VehicleSpriteSet,
  heldYawIndex?: number,
): { sprite: CourseSprite; yawIndex: number } {
  const viewYaw = vehicleSpriteViewYaw(cameraRightDistance(position, camera), pseudoDepth(position.s, camera.s));
  const relativeYaw = wrapAngle(vehicle.yaw - camera.yaw - viewYaw);
  const selected = selectVehicleSprite(spriteSet, relativeYaw, deriveVehicleLeanRadians(vehicle), heldYawIndex);
  return {
    sprite: { name, x: standing.x, y: standing.y, z: standing.z, sRender: standing.s, asset: selected.asset },
    yawIndex: selected.yawIndex,
  };
}
