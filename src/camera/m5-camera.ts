import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  guideCoordinateToWorld,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { sampleGuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { PseudoCamera } from '../core/projection.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';
import type { HeightProfileReader } from '../visual/height-profile.js';

export interface M5CameraProfile {
  dCam: number;
  lCamMax: number;
  height: number;
  pitch: number;
  focalLength: number;
  centerX: number;
  centerY: number;
  kPsi: number;
  thetaLagMax: number;
  sDotMin: number;
  tauLat: number;
  playerTargetY: number;
  tauVertical: number;
  deltaYMax: number;
  playerSafeXMin?: number;
  playerSafeXMax?: number;
  /** Presentation-only pitch cue; camera roll remains exactly zero. */
  sprungPitchGain?: number;
  lateralGOffsetMetersPerG?: number;
  lateralGOffsetMax?: number;
  lateralGOffsetTau?: number;
}

export interface M5CameraRig {
  yaw: number;
  lateral: number;
  verticalCorrection: number;
  lateralGOffset: number;
  initialized: boolean;
}

export interface M5CameraState extends PseudoCamera {
  l: number;
  guideHeadingAtCar: number;
  vehicleGuideYawDelta: number;
  cameraVehicleYawDelta: number;
  groundHeight: number;
  estimatedSDot: number;
  verticalCorrection: number;
  playerFrameError: number;
  playerScreenX: number;
  playerSafetyActive: boolean;
}

export function createM5CameraRig(): M5CameraRig {
  return { yaw: 0, lateral: 0, verticalCorrection: 0, lateralGOffset: 0, initialized: false };
}

export function resetM5CameraRig(rig: M5CameraRig): void {
  rig.yaw = 0;
  rig.lateral = 0;
  rig.verticalCorrection = 0;
  rig.lateralGOffset = 0;
  rig.initialized = false;
}

export function rebaseM5CameraRigCoordinateFrame(
  rig: M5CameraRig,
  previous: GuideCoordinateSource,
  next: GuideCoordinateSource,
): void {
  if (!rig.initialized) return;
  const worldLateral = rig.lateral + guideCoordinateLateralOrigin(previous);
  rig.lateral = worldLateral - guideCoordinateLateralOrigin(next);
}

export function updateM5Camera(
  rig: M5CameraRig,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  vehicle: VehicleCameraReadState,
  profile: M5CameraProfile,
  dt: number,
): M5CameraState {
  const curve = guideCoordinateCurve(guide);
  const guideAtCar = sampleGuideCurve(curve, vehicle.course.s);
  const vehicleGuideYawDelta = wrapAngle(vehicle.yaw - guideAtCar.heading);
  const worldVelocityAvailable = vehicle.velocityX !== undefined && vehicle.velocityZ !== undefined;
  const estimatedSDot = worldVelocityAvailable
    ? vehicle.velocityX! * Math.sin(guideAtCar.heading) + vehicle.velocityZ! * Math.cos(guideAtCar.heading)
    : vehicle.longitudinalSpeed * Math.cos(vehicleGuideYawDelta)
      - vehicle.lateralSpeed * Math.sin(vehicleGuideYawDelta);

  if (!rig.initialized) {
    rig.yaw = vehicle.yaw;
    rig.lateral = vehicle.course.l - profile.dCam * Math.sin(vehicleGuideYawDelta);
    rig.verticalCorrection = 0;
    rig.initialized = true;
  }

  const tauPsi = profile.kPsi * profile.dCam / Math.max(Math.abs(estimatedSDot), profile.sDotMin);
  const yawAlpha = 1 - Math.exp(-dt / Math.max(tauPsi, 1e-4));
  rig.yaw = wrapAngle(rig.yaw + wrapAngle(vehicle.yaw - rig.yaw) * yawAlpha);
  const lag = clamp(wrapAngle(rig.yaw - vehicle.yaw), -profile.thetaLagMax, profile.thetaLagMax);
  rig.yaw = wrapAngle(vehicle.yaw + lag);

  const lateralGTarget = clamp(
    -(vehicle.lateralAcceleration ?? 0) / 9.80665 * (profile.lateralGOffsetMetersPerG ?? 0),
    -(profile.lateralGOffsetMax ?? 0),
    profile.lateralGOffsetMax ?? 0,
  );
  const lateralGAlpha = 1 - Math.exp(-dt / Math.max(profile.lateralGOffsetTau ?? 0.12, 1e-4));
  rig.lateralGOffset += (lateralGTarget - rig.lateralGOffset) * lateralGAlpha;
  const lTarget = vehicle.course.l
    - profile.dCam * Math.sin(vehicleGuideYawDelta)
    + rig.lateralGOffset;
  const latAlpha = 1 - Math.exp(-dt / Math.max(profile.tauLat, 1e-4));
  rig.lateral += (lTarget - rig.lateral) * latAlpha;
  rig.lateral = clamp(rig.lateral, -profile.lCamMax, profile.lCamMax);

  const sCamera = vehicle.course.s - profile.dCam;
  const plan = guideCoordinateToWorld(guide, sCamera, rig.lateral);

  const scaleAtPlayer = profile.focalLength / profile.dCam;
  const safeMinX = profile.playerSafeXMin ?? 48;
  const safeMaxX = profile.playerSafeXMax ?? 272;
  let playerScreenX = projectedPlayerX(vehicle.x, vehicle.z, plan.x, plan.z, rig.yaw, profile.centerX, scaleAtPlayer);
  let playerSafetyActive = false;
  if (playerScreenX < safeMinX || playerScreenX > safeMaxX) {
    rig.yaw = Math.atan2(vehicle.x - plan.x, vehicle.z - plan.z);
    playerScreenX = projectedPlayerX(vehicle.x, vehicle.z, plan.x, plan.z, rig.yaw, profile.centerX, scaleAtPlayer);
    playerSafetyActive = true;
  }

  const groundHeight = height.sampleCamera(sCamera);
  const baseY = groundHeight + profile.height;
  const cameraPitch = profile.pitch + (vehicle.sprungPitch ?? 0) * (profile.sprungPitchGain ?? 0);
  const cosPitch = Math.cos(cameraPitch);
  const vehiclePresentationY = vehicle.presentationY ?? vehicle.y;
  const yFrame = vehiclePresentationY
    - (profile.dCam / (profile.focalLength * cosPitch))
      * (profile.centerY - profile.focalLength * Math.sin(cameraPitch) - profile.playerTargetY);
  const frameDelta = yFrame - baseY;
  const verticalAlpha = 1 - Math.exp(-dt / Math.max(profile.tauVertical, 1e-4));
  rig.verticalCorrection += (frameDelta - rig.verticalCorrection) * verticalAlpha;
  rig.verticalCorrection = clamp(rig.verticalCorrection, -profile.deltaYMax, profile.deltaYMax);

  const cameraY = baseY + rig.verticalCorrection;
  const projectedPlayerY = profile.centerY
    - profile.focalLength * Math.sin(cameraPitch)
    - (profile.focalLength / profile.dCam) * (vehiclePresentationY - cameraY) * cosPitch;

  return {
    x: plan.x,
    y: cameraY,
    z: plan.z,
    yaw: rig.yaw,
    pitch: cameraPitch,
    s: sCamera,
    l: rig.lateral,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
    guideHeadingAtCar: guideAtCar.heading,
    vehicleGuideYawDelta,
    cameraVehicleYawDelta: wrapAngle(vehicle.yaw - rig.yaw),
    groundHeight,
    estimatedSDot,
    verticalCorrection: rig.verticalCorrection,
    playerFrameError: projectedPlayerY - profile.playerTargetY,
    playerScreenX,
    playerSafetyActive,
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
