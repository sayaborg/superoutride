import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import type { PseudoCamera } from './projection.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfilePolylineReader } from '../course/geometry/profile.js';
import { SIM_DT } from '../race/fixed-step.js';
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
  /** The sprung height's natural frequency, Hz. */
  readonly heightFrequency: number;
  /** The sprung height's damping ratio. */
  readonly heightDampingRatio: number;
  /** Minimum camera height above the rendered road at the camera's station, metres. */
  readonly minimumClearance: number;
}

/** The camera's readers: the plan for the road heading and the rendered road height for its clearance. */
export interface CameraWorld {
  readonly coordinates: PlanCoordinateReader;
  readonly renderHeight: ProfilePolylineReader;
}

/**
 * The camera's state between fixed steps: its yaw, and its sprung height with its vertical velocity and the last
 * height target and road floor, from which their vertical velocities follow.
 */
export interface CameraRig {
  yaw: number;
  height: number;
  heightVelocity: number;
  previousTarget: number;
  previousFloor: number;
  initialized: boolean;
}

export interface CameraState extends PseudoCamera {
  readonly planHeadingAtCar: number;
  readonly vehiclePlanYawDelta: number;
  readonly cameraVehicleYawDelta: number;
  readonly bodyPitch: number;
  /** The height that projects the player's reference point to the target row. */
  readonly targetY: number;
}

const planWorkspaces = new WeakMap<
  CameraRig,
  { point: ReturnType<typeof createPlanCoordinateSample>; floor: { y: number; grade: number } }
>();

export function createCameraRig(): CameraRig {
  return { yaw: 0, height: 0, heightVelocity: 0, previousTarget: 0, previousFloor: 0, initialized: false };
}

/** The next update places the camera at its target again, at rest relative to it. */
export function resetCameraRig(rig: CameraRig): void {
  rig.yaw = 0;
  rig.initialized = false;
}

/**
 * One fixed step of the camera (SIM_DT). A reset or new rig starts at its target; afterwards the height follows it
 * through the sprung mount.
 */
export function updateCamera(
  rig: CameraRig,
  { coordinates, renderHeight }: CameraWorld,
  vehicle: VehicleMotionRead,
  definition: CameraDefinition,
): CameraState {
  let workspace = planWorkspaces.get(rig);
  if (!workspace) {
    workspace = { point: createPlanCoordinateSample(), floor: { y: 0, grade: 0 } };
    planWorkspaces.set(rig, workspace);
  }
  const planAtCar = coordinates.toWorld(vehicle.course.s, 0, workspace.point);
  const vehiclePlanYawDelta = wrapAngle(vehicle.yaw - planAtCar.heading);
  const bodyPitch = vehicle.sprungPitch;

  // The camera yaw is the body's yaw.
  rig.yaw = vehicle.yaw;

  const sCamera = vehicle.course.s - definition.dCam;
  // The camera occupies the body's yaw ray behind the authoritative vehicle position. Its
  // camera-right displacement to the player is therefore exactly zero, so the renderer's projection
  // places the player at centerX by construction; the camera publishes no screen position of its own.
  const cameraX = vehicle.x - definition.dCam * Math.sin(rig.yaw);
  const cameraZ = vehicle.z - definition.dCam * Math.cos(rig.yaw);

  // Constant depth D_cam and pitch following the body. The height target projects the player's reference point
  // exactly to the target row. Body pitch is nose-up-positive; pseudo-camera pitch is downward-positive.
  const cameraPitch = definition.baseDownPitch - bodyPitch;
  const targetY =
    vehicle.renderY -
    (definition.dCam / (definition.focalLength * Math.cos(cameraPitch))) *
      (definition.centerY - definition.focalLength * Math.sin(cameraPitch) - definition.playerTargetY);
  const floor = renderHeight.sample(sCamera, workspace.floor).y + definition.minimumClearance;
  if (!rig.initialized) {
    rig.height = Math.max(targetY, floor);
    rig.heightVelocity = 0;
    rig.initialized = true;
  } else {
    // The sprung mount: a spring on the height error and a damper on the vertical velocity relative to the target's,
    // stepped implicitly. A target moving at constant vertical speed (a steady grade) is followed without lag.
    const omega = 2 * Math.PI * definition.heightFrequency;
    const targetVelocity = (targetY - rig.previousTarget) / SIM_DT;
    rig.heightVelocity =
      (rig.heightVelocity +
        SIM_DT *
          (omega * omega * (targetY - rig.height) + 2 * definition.heightDampingRatio * omega * targetVelocity)) /
      (1 + 2 * definition.heightDampingRatio * omega * SIM_DT + omega * omega * SIM_DT * SIM_DT);
    rig.height += SIM_DT * rig.heightVelocity;
    // Never below the clearance over the rendered road; at the floor the camera moves with it.
    if (rig.height < floor) {
      rig.height = floor;
      rig.heightVelocity = Math.max(rig.heightVelocity, (floor - rig.previousFloor) / SIM_DT);
    }
  }
  rig.previousTarget = targetY;
  rig.previousFloor = floor;
  const cameraY = rig.height;

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
    targetY,
  };
}
