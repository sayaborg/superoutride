import { guideCoordinateCurve, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { sampleGuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { PseudoCamera } from '../core/projection.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';
import type { HeightProfileReader } from '../visual/height-profile.js';

export interface M5CameraProfile {
  readonly dCam: number;
  readonly height: number;
  /** Authored downward view angle relative to the vehicle-pitch reference. */
  readonly baseDownPitch: number;
  readonly focalLength: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Minimum body-pitch-plane speed at which movement owns camera yaw. */
  readonly directionSpeedMin: number;
  readonly playerTargetY: number;
  readonly tauVertical: number;
  readonly deltaYMax: number;
}

export const M5_CAMERA_YAW_MODES = Object.freeze([
  'BODY_FIXED',
  'MOVEMENT_FOLLOW',
] as const);

export type M5CameraYawMode = typeof M5_CAMERA_YAW_MODES[number];

export const DEFAULT_M5_CAMERA_YAW_MODE: M5CameraYawMode = 'BODY_FIXED';

export interface M5CameraRig {
  yawMode: M5CameraYawMode;
  yaw: number;
  movementYaw: number;
  verticalCorrection: number;
  initialized: boolean;
}

export interface M5CameraState extends PseudoCamera {
  readonly guideHeadingAtCar: number;
  readonly vehicleGuideYawDelta: number;
  readonly cameraVehicleYawDelta: number;
  readonly bodyPitch: number;
  readonly yawMode: M5CameraYawMode;
  readonly movementYaw: number;
  readonly movementYawDelta: number;
  readonly groundHeight: number;
  readonly verticalCorrection: number;
  readonly playerFrameError: number;
  readonly playerScreenX: number;
}

export interface BodyPitchMovementYaw {
  readonly yaw: number;
  readonly yawDelta: number;
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly inPlaneSpeed: number;
}

export function createM5CameraRig(
  yawMode: M5CameraYawMode = DEFAULT_M5_CAMERA_YAW_MODE,
): M5CameraRig {
  return { yawMode, yaw: 0, movementYaw: 0, verticalCorrection: 0, initialized: false };
}

export function resetM5CameraRig(rig: M5CameraRig): void {
  rig.yaw = 0;
  rig.movementYaw = 0;
  rig.verticalCorrection = 0;
  rig.initialized = false;
}

export function setM5CameraYawMode(
  rig: M5CameraRig,
  yawMode: M5CameraYawMode,
): void {
  rig.yawMode = yawMode;
}

export function toggleM5CameraYawMode(rig: M5CameraRig): M5CameraYawMode {
  const yawMode = rig.yawMode === 'BODY_FIXED' ? 'MOVEMENT_FOLLOW' : 'BODY_FIXED';
  setM5CameraYawMode(rig, yawMode);
  return yawMode;
}

/**
 * Express authoritative world velocity in the vehicle-pitch plane, then retain only its yaw.
 * Camera pitch follows the body separately. Movement yaw remains the alternate camera direction
 * and the body-fixed overlay direction; neither use changes authoritative vehicle attitude.
 */
export function movementYawInBodyPitchFrame(
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

export function updateM5Camera(
  rig: M5CameraRig,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  vehicle: VehicleCameraReadState,
  profile: M5CameraProfile,
  dt: number,
): M5CameraState {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('camera dt must be finite and > 0');
  if (!(profile.directionSpeedMin >= 0) || !Number.isFinite(profile.directionSpeedMin)) {
    throw new RangeError('camera direction speed minimum must be finite and >= 0');
  }

  const curve = guideCoordinateCurve(guide);
  const guideAtCar = sampleGuideCurve(curve, vehicle.course.s);
  const vehicleGuideYawDelta = wrapAngle(vehicle.yaw - guideAtCar.heading);
  const bodyPitch = vehicle.sprungPitch ?? 0;

  if (!rig.initialized) {
    rig.yaw = vehicle.yaw;
    rig.movementYaw = vehicle.yaw;
    rig.verticalCorrection = 0;
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
  // construction without a safety-camera override or Guide-lateral second authority.
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

  const groundHeight = height.sampleCamera(sCamera);
  const baseY = groundHeight + profile.height;
  // Body pitch is nose-up-positive; pseudo-camera pitch is downward-positive. Subtracting the
  // body angle keeps the authored base view pitch constant relative to the vehicle, leaving yaw as
  // the only dynamic camera-relative attitude required from the sprite set.
  const cameraPitch = profile.baseDownPitch - bodyPitch;
  const cosCameraPitch = Math.cos(cameraPitch);
  const vehiclePresentationY = vehicle.presentationY ?? vehicle.y;
  const yFrame = vehiclePresentationY
    - (profile.dCam / (profile.focalLength * cosCameraPitch))
      * (profile.centerY - profile.focalLength * Math.sin(cameraPitch) - profile.playerTargetY);
  const frameDelta = yFrame - baseY;
  const verticalAlpha = 1 - Math.exp(-dt / Math.max(profile.tauVertical, 1e-4));
  rig.verticalCorrection += (frameDelta - rig.verticalCorrection) * verticalAlpha;
  rig.verticalCorrection = clamp(rig.verticalCorrection, -profile.deltaYMax, profile.deltaYMax);

  const cameraY = baseY + rig.verticalCorrection;
  const projectedPlayerY = profile.centerY
    - profile.focalLength * Math.sin(cameraPitch)
    - (profile.focalLength / profile.dCam)
      * (vehiclePresentationY - cameraY) * cosCameraPitch;

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
    guideHeadingAtCar: guideAtCar.heading,
    vehicleGuideYawDelta,
    cameraVehicleYawDelta: wrapAngle(vehicle.yaw - rig.yaw),
    bodyPitch,
    yawMode: rig.yawMode,
    movementYaw: rig.movementYaw,
    movementYawDelta,
    groundHeight,
    verticalCorrection: rig.verticalCorrection,
    playerFrameError: projectedPlayerY - profile.playerTargetY,
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
