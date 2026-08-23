import { guideCourseToWorld, sampleGuideCurve, type GuideCurve } from '../core/guide-curve.js';
import { clamp, wrapAngle, wrapPositive } from '../core/math.js';
import type { PseudoCamera } from '../core/projection.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';

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
}

export interface M5CameraRig {
  yaw: number;
  lateral: number;
  verticalCorrection: number;
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
  return { yaw: 0, lateral: 0, verticalCorrection: 0, initialized: false };
}

/** Reinitialize presentation state after an explicit gameplay teleport/respawn. */
export function resetM5CameraRig(rig: M5CameraRig): void {
  rig.yaw = 0;
  rig.lateral = 0;
  rig.verticalCorrection = 0;
  rig.initialized = false;
}

/** Core §§34-39 camera rules, with M5 DEV LPF parameters. */
export function updateM5Camera(
  rig: M5CameraRig,
  guide: GuideCurve,
  height: CyclicHeightProfile,
  vehicle: VehicleCameraReadState,
  profile: M5CameraProfile,
  dt: number,
): M5CameraState {
  const guideAtCar = sampleGuideCurve(guide, vehicle.course.s);
  const vehicleGuideYawDelta = wrapAngle(vehicle.yaw - guideAtCar.heading);
  const estimatedSDot = vehicle.longitudinalSpeed * Math.cos(vehicleGuideYawDelta)
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

  const lTarget = vehicle.course.l - profile.dCam * Math.sin(vehicleGuideYawDelta);
  const latAlpha = 1 - Math.exp(-dt / Math.max(profile.tauLat, 1e-4));
  rig.lateral += (lTarget - rig.lateral) * latAlpha;
  rig.lateral = clamp(rig.lateral, -profile.lCamMax, profile.lCamMax);

  const sCamera = wrapPositive(vehicle.course.s - profile.dCam, guide.length);
  const plan = guideCourseToWorld(guide, sCamera, rig.lateral);

  // Extreme-spin presentation safety. Core §36 guarantees framing only inside the normal
  // yaw/lateral envelope and explicitly leaves extreme spin to a separate presentation mode.
  // We keep the same camera XZ position and chainage depth; only camera yaw is redirected
  // toward the player when the normal projection would leave the screen-safe range.
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

  // Core §38: bounded vertical framing. The player is deliberately not perfectly locked.
  const cosPitch = Math.cos(profile.pitch);
  const yFrame = vehicle.y
    - (profile.dCam / (profile.focalLength * cosPitch))
      * (profile.centerY - profile.focalLength * Math.sin(profile.pitch) - profile.playerTargetY);
  const frameDelta = yFrame - baseY;
  const verticalAlpha = 1 - Math.exp(-dt / Math.max(profile.tauVertical, 1e-4));
  rig.verticalCorrection += (frameDelta - rig.verticalCorrection) * verticalAlpha;
  rig.verticalCorrection = clamp(rig.verticalCorrection, -profile.deltaYMax, profile.deltaYMax);

  const cameraY = baseY + rig.verticalCorrection;
  const projectedPlayerY = profile.centerY
    - profile.focalLength * Math.sin(profile.pitch)
    - (profile.focalLength / profile.dCam) * (vehicle.y - cameraY) * cosPitch;

  return {
    x: plan.x,
    y: cameraY,
    z: plan.z,
    yaw: rig.yaw,
    pitch: profile.pitch,
    s: sCamera,
    l: rig.lateral,
    focalLength: profile.focalLength,
    centerX: profile.centerX,
    centerY: profile.centerY,
    courseLength: guide.length,
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
