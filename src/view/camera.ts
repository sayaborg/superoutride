import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { wrapAngle } from '../core/math.js';
import type { PseudoCamera } from './projection.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleCameraReadState } from '../vehicle/physics/vehicle-contract.js';

export const RENDER_NEAR_DEPTH_METERS = 2.5;
export const RENDER_FAR_DEPTH_METERS = 200;

export interface CameraProfile {
  readonly dCam: number;
  /** Authored downward view angle relative to the vehicle-pitch reference. */
  readonly baseDownPitch: number;
  readonly focalLength: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Minimum body-pitch-plane speed at which movement owns camera yaw. */
  readonly directionSpeedMin: number;
  readonly playerTargetY: number;
}

export type CameraYawMode = 'BODY_FIXED' | 'MOVEMENT_FOLLOW';

const DEFAULT_CAMERA_YAW_MODE: CameraYawMode = 'BODY_FIXED';

export interface CameraRig {
  yawMode: CameraYawMode;
  yaw: number;
  movementYaw: number;
  initialized: boolean;
}

export interface CameraState extends PseudoCamera {
  readonly planHeadingAtCar: number;
  readonly vehiclePlanYawDelta: number;
  readonly cameraVehicleYawDelta: number;
  readonly bodyPitch: number;
  readonly yawMode: CameraYawMode;
  readonly movementYaw: number;
  readonly movementYawDelta: number;
  readonly playerScreenX: number;
}

interface BodyPitchMovementYaw {
  readonly yaw: number;
  readonly yawDelta: number;
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly inPlaneSpeed: number;
}

const planWorkspaces = new WeakMap<CameraRig, { point: ReturnType<typeof createPlanCoordinateSample> }>();

export function createCameraRig(yawMode: CameraYawMode = DEFAULT_CAMERA_YAW_MODE): CameraRig {
  return { yawMode, yaw: 0, movementYaw: 0, initialized: false };
}

export function resetCameraRig(rig: CameraRig): void {
  rig.yaw = 0;
  rig.movementYaw = 0;
  rig.initialized = false;
}

export function setCameraYawMode(rig: CameraRig, yawMode: CameraYawMode): void {
  rig.yawMode = yawMode;
}

/**
 * Express authoritative world velocity in the vehicle-pitch plane, then retain only its yaw.
 * Camera pitch follows the body separately. Movement yaw remains the alternate camera direction
 * and the body-fixed overlay direction; neither use changes authoritative vehicle attitude.
 */
function movementYawInBodyPitchFrame(
  vehicleYaw: number,
  bodyPitch: number,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
): BodyPitchMovementYaw {
  if (![vehicleYaw, bodyPitch, velocityX, velocityY, velocityZ].every(Number.isFinite)) {
    throw new RangeError('camera movement-yaw inputs must be finite');
  }
  const cosYaw = Math.cos(vehicleYaw);
  const sinYaw = Math.sin(vehicleYaw);
  const cosPitch = Math.cos(bodyPitch);
  const sinPitch = Math.sin(bodyPitch);
  const rightX = cosYaw;
  const rightZ = -sinYaw;
  const forwardX = sinYaw * cosPitch;
  const forwardY = sinPitch;
  const forwardZ = cosYaw * cosPitch;
  const forwardSpeed = velocityX * forwardX + velocityY * forwardY + velocityZ * forwardZ;
  const lateralSpeed = velocityX * rightX + velocityZ * rightZ;
  const yawDelta = Math.atan2(lateralSpeed, forwardSpeed);
  return {
    yaw: wrapAngle(vehicleYaw + yawDelta),
    yawDelta,
    forwardSpeed,
    lateralSpeed,
    inPlaneSpeed: Math.hypot(forwardSpeed, lateralSpeed),
  };
}

export function updateCamera(
  rig: CameraRig,
  { coordinates }: Pick<VehicleWorld, 'coordinates'>,
  vehicle: VehicleCameraReadState,
  profile: CameraProfile,
): CameraState {
  if (!(profile.directionSpeedMin >= 0) || !Number.isFinite(profile.directionSpeedMin)) {
    throw new RangeError('camera direction speed minimum must be finite and >= 0');
  }

  let workspace = planWorkspaces.get(rig);
  if (!workspace) {
    workspace = { point: createPlanCoordinateSample() };
    planWorkspaces.set(rig, workspace);
  }
  const planAtCar = coordinates.toWorld(vehicle.course.s, 0, workspace.point);
  const vehiclePlanYawDelta = wrapAngle(vehicle.yaw - planAtCar.heading);
  const bodyPitch = vehicle.sprungPitch ?? 0;

  if (!rig.initialized) {
    rig.yaw = vehicle.yaw;
    rig.movementYaw = vehicle.yaw;
    rig.initialized = true;
  }

  let movementYawDelta = wrapAngle(rig.movementYaw - vehicle.yaw);
  if (vehicle.velocityX !== undefined && vehicle.velocityZ !== undefined) {
    const movement = movementYawInBodyPitchFrame(
      vehicle.yaw,
      bodyPitch,
      vehicle.velocityX,
      vehicle.velocityY ?? 0,
      vehicle.velocityZ,
    );
    if (movement.inPlaneSpeed >= profile.directionSpeedMin) {
      rig.movementYaw = movement.yaw;
      movementYawDelta = movement.yawDelta;
    }
  } else {
    const inPlaneSpeed = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);
    if (inPlaneSpeed >= profile.directionSpeedMin) {
      movementYawDelta = Math.atan2(vehicle.lateralSpeed, vehicle.longitudinalSpeed);
      rig.movementYaw = wrapAngle(vehicle.yaw + movementYawDelta);
    }
  }
  rig.yaw = rig.yawMode === 'BODY_FIXED' ? vehicle.yaw : rig.movementYaw;

  const sCamera = vehicle.course.s - profile.dCam;
  // The camera occupies the selected yaw ray behind the authoritative vehicle position. Its
  // camera-right displacement to the player is therefore exactly zero, so player X is centerX by
  // construction without a safety-camera override or second lateral-coordinate authority.
  const cameraX = vehicle.x - profile.dCam * Math.sin(rig.yaw);
  const cameraZ = vehicle.z - profile.dCam * Math.cos(rig.yaw);
  const playerScreenX = projectedPlayerX(
    vehicle.x,
    vehicle.z,
    cameraX,
    cameraZ,
    rig.yaw,
    profile.centerX,
    profile.focalLength / profile.dCam,
  );

  // The camera is rigidly fixed to the player: constant depth D_cam, pitch following the body and a
  // height solved every frame so the player's reference point projects exactly to the target row.
  // Body pitch is nose-up-positive; pseudo-camera pitch is downward-positive.
  const cameraPitch = profile.baseDownPitch - bodyPitch;
  const cameraY =
    (vehicle.renderY ?? vehicle.y) -
    (profile.dCam / (profile.focalLength * Math.cos(cameraPitch))) *
      (profile.centerY - profile.focalLength * Math.sin(cameraPitch) - profile.playerTargetY);

  return {
    x: cameraX,
    y: cameraY,
    z: cameraZ,
    yaw: rig.yaw,
    pitch: cameraPitch,
    s: sCamera,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
    planHeadingAtCar: planAtCar.heading,
    vehiclePlanYawDelta,
    cameraVehicleYawDelta: wrapAngle(vehicle.yaw - rig.yaw),
    bodyPitch,
    yawMode: rig.yawMode,
    movementYaw: rig.movementYaw,
    movementYawDelta,
    playerScreenX,
  };
}

function projectedPlayerX(
  playerX: number,
  playerZ: number,
  cameraX: number,
  cameraZ: number,
  cameraYaw: number,
  centerX: number,
  scale: number,
): number {
  const dx = playerX - cameraX;
  const dz = playerZ - cameraZ;
  const xRight = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
  return centerX + scale * xRight;
}
