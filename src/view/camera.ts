import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import type { PseudoCamera } from './projection.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleMotionRead } from '../vehicle/physics/vehicle-contract.js';

export const RENDER_NEAR_DEPTH_METERS = 2.5;
export const RENDER_FAR_DEPTH_METERS = 200;

export interface CameraDefinition {
  readonly dCam: number;
  /** Authored downward view angle relative to the vehicle-pitch reference. */
  readonly baseDownPitch: number;
  readonly focalLength: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly playerTargetY: number;
}

export interface CameraRig {
  yaw: number;
  initialized: boolean;
}

export interface CameraState extends PseudoCamera {
  readonly planHeadingAtCar: number;
  readonly vehiclePlanYawDelta: number;
  readonly cameraVehicleYawDelta: number;
  readonly bodyPitch: number;
}

const planWorkspaces = new WeakMap<CameraRig, { point: ReturnType<typeof createPlanCoordinateSample> }>();

export function createCameraRig(): CameraRig {
  return { yaw: 0, initialized: false };
}

export function resetCameraRig(rig: CameraRig): void {
  rig.yaw = 0;
  rig.initialized = false;
}

export function updateCamera(
  rig: CameraRig,
  { coordinates }: Pick<VehicleWorld, 'coordinates'>,
  vehicle: VehicleMotionRead,
  definition: CameraDefinition,
): CameraState {
  let workspace = planWorkspaces.get(rig);
  if (!workspace) {
    workspace = { point: createPlanCoordinateSample() };
    planWorkspaces.set(rig, workspace);
  }
  const planAtCar = coordinates.toWorld(vehicle.course.s, 0, workspace.point);
  const vehiclePlanYawDelta = wrapAngle(vehicle.yaw - planAtCar.heading);
  const bodyPitch = vehicle.sprungPitch;

  // The camera yaw is the body's yaw.
  rig.yaw = vehicle.yaw;
  rig.initialized = true;

  const sCamera = vehicle.course.s - definition.dCam;
  // The camera occupies the body's yaw ray behind the authoritative vehicle position. Its
  // camera-right displacement to the player is therefore exactly zero, so the renderer's projection
  // places the player at centerX by construction; the camera publishes no screen position of its own.
  const cameraX = vehicle.x - definition.dCam * Math.sin(rig.yaw);
  const cameraZ = vehicle.z - definition.dCam * Math.cos(rig.yaw);

  // The camera is rigidly fixed to the player: constant depth D_cam, pitch following the body and a
  // height solved every frame so the player's reference point projects exactly to the target row.
  // Body pitch is nose-up-positive; pseudo-camera pitch is downward-positive.
  const cameraPitch = definition.baseDownPitch - bodyPitch;
  const cameraY =
    vehicle.renderY -
    (definition.dCam / (definition.focalLength * Math.cos(cameraPitch))) *
      (definition.centerY - definition.focalLength * Math.sin(cameraPitch) - definition.playerTargetY);

  return {
    x: cameraX,
    y: cameraY,
    z: cameraZ,
    yaw: rig.yaw,
    pitch: cameraPitch,
    s: sCamera,
    focalLength: definition.focalLength,
    centerX: definition.centerX,
    centerY: definition.centerY,
    planHeadingAtCar: planAtCar.heading,
    vehiclePlanYawDelta,
    cameraVehicleYawDelta: wrapAngle(vehicle.yaw - rig.yaw),
    bodyPitch,
  };
}
